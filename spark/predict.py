# -*- coding: utf-8 -*-
"""模块⑤：机器学习应用。
9.  爆款预测（歌词/歌曲特征 → 是否会火：MLlib 分类 + 回归对比）
10. 情绪点歌 / 相似歌曲推荐（content-based：情绪标签 + 主题向量 余弦相似）
11. 歌手画像 + 影响力（词风关键词 + 影响力分值）
结果 → HBase netease:tag / netease:artist + 导出 JSON。
"""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F
from pyspark.sql.types import IntegerType, DoubleType, ArrayType, StringType
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.classification import RandomForestClassifier
from pyspark.ml.regression import RandomForestRegressor
from pyspark.ml.evaluation import BinaryClassificationEvaluator, RegressionEvaluator

CLEAN = "/netease/clean"


def main():
    spark = K.get_spark("predict")
    song = spark.read.parquet(CLEAN + "/song")
    lyric = spark.read.parquet(CLEAN + "/lyric").select("song_id", "words", "word_count")
    cmt = spark.read.parquet(CLEAN + "/comment")

    cstat = cmt.groupBy("song_id").agg(
        F.count("*").alias("comment_count"),
        F.sum("liked").alias("total_liked"))

    df = song.join(lyric, "song_id", "left").join(cstat, "song_id", "left") \
        .fillna(0, ["word_count", "comment_count", "total_liked"])

    # ============ 9. 爆款预测 ============
    # 标签：评论总点赞高于中位数 → 爆款(1)。
    # 说明：评论数因"单曲评论上限"被压缩（热门歌多数达到上限），不适合做热度标签；
    #       评论总点赞(total_liked)跨度大(百~百万)、能真实反映歌曲热度，作为预测目标。
    #       特征仅用歌曲"内在属性"(时长/年份/歌词词数/基础热度)，避免标签泄漏。
    med = df.approxQuantile("total_liked", [0.5], 0.05)[0] or 0
    df = df.withColumn("is_hit", (F.col("total_liked") > med).cast("int"))
    df = df.withColumn("hit_target", F.log1p(F.col("total_liked")))   # 回归目标

    feat_cols = ["duration_sec", "year", "word_count", "pop"]
    df = df.fillna(0, feat_cols)
    asm = VectorAssembler(inputCols=feat_cols, outputCol="features")
    data = asm.transform(df)

    train, test = data.randomSplit([0.8, 0.2], seed=7)

    # 分类
    clf = RandomForestClassifier(featuresCol="features", labelCol="is_hit", numTrees=30, seed=7)
    clf_model = clf.fit(train)
    pred_c = clf_model.transform(test)
    auc = 0.0
    if pred_c.select("is_hit").distinct().count() > 1 and pred_c.count() > 0:
        auc = BinaryClassificationEvaluator(labelCol="is_hit").evaluate(pred_c)
    print(">>> 爆款分类 AUC: %.3f" % auc)

    # 回归
    reg = RandomForestRegressor(featuresCol="features", labelCol="hit_target", numTrees=30, seed=7)
    reg_model = reg.fit(train)
    pred_r = reg_model.transform(test)
    rmse = 0.0
    if pred_r.count() > 0:
        rmse = RegressionEvaluator(labelCol="hit_target", metricName="rmse").evaluate(pred_r)
    print(">>> 爆款回归 RMSE(log): %.3f" % rmse)

    # 特征重要性（对应报告"算法改进"分析）
    fi = dict(zip(feat_cols, [round(float(x), 4) for x in clf_model.featureImportances.toArray()]))
    K.export_json("predict_importance.json",
                  {"auc": round(auc, 3), "rmse": round(rmse, 3), "importance": fi})
    print(">>> 特征重要性:", fi)

    # 全量预测概率落 HBase
    full = clf_model.transform(data)
    prob_udf = F.udf(lambda v: float(v[1]) if len(v) > 1 else float(v[0]), DoubleType())
    full = full.withColumn("hit_prob", prob_udf(F.col("probability")))
    K.write_hbase(full, "netease:tag", "song_id", {"hit_prob": "t:hit_prob"})

    # ============ 10. 情绪点歌 / 相似推荐 ============
    # 情绪标签来自歌词分词
    emo_udf = F.udf(lambda w: ",".join(K.emotion_tags(w)), StringType())
    lyric2 = lyric.withColumn("emotions", emo_udf(F.col("words")))
    sl = song.select("song_id", "name", "artist_name").join(lyric2, "song_id", "left")
    K.write_hbase(sl, "netease:tag", "song_id", {"emotions": "t:emotions"})

    # 情绪点歌：每种情绪下的歌单（按评论热度排序）
    sl2 = sl.join(cstat, "song_id", "left").fillna(0, ["comment_count"])
    mood_playlist = {}
    for tag in K.EMOTION_LEX.keys():
        rows = sl2.filter(F.col("emotions").contains(tag)) \
            .orderBy(F.desc("comment_count")) \
            .select("song_id", "name", "artist_name", "comment_count").limit(20)
        mood_playlist[tag] = K.rows_to_dicts(rows)
    K.export_json("mood_playlist.json", mood_playlist)

    # 相似推荐：基于主题向量余弦（读 HBase lyric 的 topic_dist，若无则跳过）
    _build_recommend(spark)

    # ============ 11. 歌手画像 + 影响力 ============
    _artist_profile(spark, song, lyric, cstat)

    spark.stop()
    print(">>> ML 应用完成。")


def _build_recommend(spark, top_n=500):
    """基于歌词主题向量的 content-based 相似推荐（余弦相似度）。
    从 topic_lda 导出的 CLEAN/song_topic parquet 读取（免依赖 HBase）。
    50k 规模下全量 O(n²) 不可行，故取热度 Top-N(按真实总评论)做交互式推荐池。"""
    rows = spark.read.parquet(CLEAN + "/song_topic").collect()
    songs, tname, names, heat = {}, {}, {}, {}
    for r in rows:
        sid = str(r["song_id"])
        if r["topic_dist"] is None:
            continue
        songs[sid] = [float(x) for x in r["topic_dist"]]
        tname[sid] = r["topic_name"] or ""
        names[sid] = (r["name"] or "", r["artist_name"] or "")
        heat[sid] = int(r["comment_total"] or 0)

    # 取热度 Top-N 且有主题向量的歌做推荐池
    ids = sorted(songs.keys(), key=lambda s: heat.get(s, 0), reverse=True)[:top_n]

    def cos(a, b):
        s = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a)); nb = math.sqrt(sum(y * y for y in b))
        return s / (na * nb) if na and nb else 0.0

    rec = {}
    for i in ids:
        sims = sorted(((cos(songs[i], songs[j]), j) for j in ids if j != i), reverse=True)[:6]
        rec[i] = {
            "name": names[i][0], "artist": names[i][1], "topic": tname.get(i, ""),
            "similar": [{"song_id": j, "name": names[j][0], "artist": names[j][1],
                         "topic": tname.get(j, ""), "score": round(sc, 3)}
                        for sc, j in sims if sc > 0],
        }
    K.export_json("recommend.json", rec)
    print(">>> 相似推荐池: %d 首歌（热度Top-%d）" % (len(rec), top_n))


def _artist_profile(spark, song, lyric, cstat):
    # 影响力 = log(真实总评论)·2 + log(评论总点赞) + 歌曲数
    sj = song.join(cstat, "song_id", "left").fillna(0, ["total_liked"]) \
        .fillna(0, ["comment_total"])
    prof = sj.groupBy("artist_id", "artist_name").agg(
        F.count("*").alias("song_num"),
        F.sum("comment_total").alias("comments"),
        F.sum("total_liked").alias("likes"),
        F.round(F.avg("pop"), 1).alias("avg_pop"),
    )
    prof = prof.withColumn("influence",
        F.round(F.log1p(F.col("comments")) * 2 + F.log1p(F.col("likes")) + F.col("song_num"), 2))
    prof = prof.orderBy(F.desc("influence"))

    # 词风关键词：该歌手所有歌词高频词 top10
    sl = song.select("song_id", "artist_name").join(
        lyric.select("song_id", "words"), "song_id", "left")
    words = sl.select("artist_name", F.explode(F.split("words", " ")).alias("w")) \
        .filter(F.length("w") >= 2)
    wc = words.groupBy("artist_name", "w").count()
    from pyspark.sql.window import Window
    w = Window.partitionBy("artist_name").orderBy(F.desc("count"))
    topw = wc.withColumn("rk", F.row_number().over(w)).filter(F.col("rk") <= 10) \
        .groupBy("artist_name").agg(
            F.concat_ws(",", F.collect_list("w")).alias("style_words"))

    prof2 = prof.join(topw, "artist_name", "left").orderBy(F.desc("influence"))
    K.export_json("artist_profile.json", K.rows_to_dicts(prof2.limit(30)))
    K.write_hbase(prof2, "netease:artist", "artist_id", {
        "artist_name": "info:name",
        "song_num": "profile:song_num",
        "influence": "profile:influence",
        "style_words": "profile:style_words",
    })
    print(">>> 歌手画像完成。")


if __name__ == "__main__":
    main()
