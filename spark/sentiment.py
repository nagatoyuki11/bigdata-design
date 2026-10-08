# -*- coding: utf-8 -*-
"""模块③：情感分析（Spark MLlib 分类）。
3. 评论情感分类：词典弱监督(仅明确信号) → TF-IDF+LogisticRegression → 三分类(正/中/负)
4. 争议歌曲检测：情感方差 × 正负平衡度（真正两极分化）
5. 催泪/情绪评论识别 → 最催泪 / 最治愈 / 最励志 / 高赞金句 多榜单
结果 → HBase netease:comment(情感) / netease:tag(争议/催泪) + 导出 JSON。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F
from pyspark.sql.types import IntegerType, StringType, DoubleType
from pyspark.ml.feature import HashingTF, IDF, Tokenizer
from pyspark.ml.classification import LogisticRegression
from pyspark.ml import Pipeline

CLEAN = "/netease/clean"


def main():
    spark = K.get_spark("sentiment")
    cmt = spark.read.parquet(CLEAN + "/comment").filter(F.length("words") > 0)
    song = spark.read.parquet(CLEAN + "/song").select("song_id", "name", "artist_name")

    # ---------- 弱监督打标（仅明确情感信号参与训练）----------
    label_udf = F.udf(lambda w: K.lexicon_label(w)[0], IntegerType())
    signal_udf = F.udf(lambda w: int(K.lexicon_label(w)[1] != K.lexicon_label(w)[2]), IntegerType())
    cmt = cmt.withColumn("weak_label", label_udf(F.col("words"))) \
             .withColumn("has_signal", signal_udf(F.col("words")))

    tok = Tokenizer(inputCol="words", outputCol="tokens")
    htf = HashingTF(inputCol="tokens", outputCol="tf", numFeatures=4096)
    idf = IDF(inputCol="tf", outputCol="features")
    lr = LogisticRegression(featuresCol="features", labelCol="weak_label", maxIter=20)
    pipe = Pipeline(stages=[tok, htf, idf, lr])

    labeled = cmt.filter(F.col("has_signal") == 1)
    print(">>> 训练样本(明确情感信号): %d / 总评论 %d" % (labeled.count(), cmt.count()))
    train, test = labeled.randomSplit([0.8, 0.2], seed=42)
    model = pipe.fit(train)

    from pyspark.ml.evaluation import MulticlassClassificationEvaluator
    pred_test = model.transform(test)
    if pred_test.count() > 0:
        acc = MulticlassClassificationEvaluator(
            labelCol="weak_label", predictionCol="prediction", metricName="accuracy").evaluate(pred_test)
        print(">>> 情感分类器准确率(弱标签): %.3f" % acc)

    # ---------- 全量预测 + 三分类 ----------
    scored = model.transform(cmt)
    prob_udf = F.udf(lambda v: float(v[1]) if len(v) > 1 else float(v[0]), DoubleType())
    scored = scored.withColumn("sent_score", prob_udf(F.col("probability")))
    cls_udf = F.udf(K.sentiment_3class, StringType())
    scored = scored.withColumn("sentiment", cls_udf(F.col("sent_score")))
    scored = scored.cache()

    if os.environ.get("SKIP_COMMENT_HBASE"):
        print(">>> [磁盘安全] 跳过逐条评论情感写 HBase netease:comment")
    else:
        K.write_hbase(scored, "netease:comment", "row_key", {
            "sentiment": "c:sentiment", "sent_score": "c:sent_score"})

    # 情感分布（三类）
    dist = scored.groupBy("sentiment").count()
    K.export_json("sentiment_dist.json", K.rows_to_dicts(dist))

    # ---------- 4. 争议歌曲：方差 × 正负平衡度 ----------
    agg = scored.groupBy("song_id").agg(
        F.count("*").alias("n"),
        F.round(F.variance("sent_score"), 4).alias("sent_var"),
        F.round(F.avg("sent_score"), 4).alias("sent_avg"),
        F.sum(F.when(F.col("sent_score") > 0.6, 1).otherwise(0)).alias("pos"),
        F.sum(F.when(F.col("sent_score") < 0.4, 1).otherwise(0)).alias("neg"),
    ).filter(F.col("n") >= 8)
    # 平衡度 = 2*min(pos,neg)/(pos+neg)，争议指数 = 方差 × 平衡度
    agg = agg.withColumn("balance",
        F.when((F.col("pos") + F.col("neg")) > 0,
               2 * F.least("pos", "neg") / (F.col("pos") + F.col("neg"))).otherwise(0.0))
    agg = agg.withColumn("controversy", F.round(F.col("sent_var") * F.col("balance"), 4))
    contro = agg.join(song, "song_id", "left").orderBy(F.desc("controversy"))
    K.export_json("controversy.json", K.rows_to_dicts(contro.limit(30)))
    K.write_hbase(agg, "netease:tag", "song_id", {
        "controversy": "t:controversy", "sent_avg": "t:sent_avg"})

    # ---------- 5. 催泪 + 情绪榜单 ----------
    tear_udf = F.udf(lambda c, w: K.tear_score(c, w), DoubleType())
    emo_udf = F.udf(lambda w: ",".join(K.emotion_tags(w)), StringType())
    feel = scored.withColumn("tear", tear_udf(F.col("content"), F.col("words"))) \
                 .withColumn("emotions", emo_udf(F.col("words")))

    # 最催泪歌曲榜
    song_tear = feel.groupBy("song_id").agg(
        F.round(F.sum("tear"), 2).alias("tear_sum"), F.count("*").alias("n")
    ).filter(F.col("n") >= 3).join(song, "song_id", "left").orderBy(F.desc("tear_sum"))
    K.export_json("tearjerker.json", K.rows_to_dicts(song_tear.limit(30)))
    K.write_hbase(song_tear, "netease:tag", "song_id", {"tear_sum": "t:tear_sum"})

    # 最治愈 / 最励志歌曲榜（按命中情绪的评论数）
    def emotion_rank(tag, fname):
        r = feel.filter(F.col("emotions").contains(tag)).groupBy("song_id") \
            .agg(F.count("*").alias("cnt")).join(song, "song_id", "left") \
            .orderBy(F.desc("cnt")).limit(30)
        K.export_json(fname, K.rows_to_dicts(r))
    emotion_rank("治愈", "rank_healing.json")
    emotion_rank("励志", "rank_inspire.json")

    # 催泪/故事型热评（补歌名+歌手）
    top_tear = feel.filter(F.col("tear") > 0).join(song, "song_id", "left") \
        .orderBy(F.desc("tear")).select("content", "tear", "liked", "name", "artist_name").limit(20)
    K.export_json("tear_comments.json", K.rows_to_dicts(top_tear))

    # 高赞金句榜（按点赞，补歌名）
    top_liked = scored.join(song, "song_id", "left").orderBy(F.desc("liked")) \
        .select("content", "liked", "sentiment", "name", "artist_name").limit(20)
    K.export_json("top_comments.json", K.rows_to_dicts(top_liked))

    spark.stop()
    print(">>> 情感分析完成。")


if __name__ == "__main__":
    main()
