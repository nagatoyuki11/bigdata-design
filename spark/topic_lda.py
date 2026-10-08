# -*- coding: utf-8 -*-
"""模块④：文本挖掘 / 主题聚类（Spark MLlib LDA + KMeans）。
6. 歌词主题聚类（LDA 主题 + KMeans 簇）
7. 热评话题挖掘 + 词云（高频词）
8. 歌词年代变迁主题河流图（按年聚合主题分布）
结果 → HBase netease:lyric(主题) / netease:tag + 导出 JSON。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F
from pyspark.sql.types import IntegerType, DoubleType, ArrayType, StringType
from pyspark.ml.feature import CountVectorizer, Tokenizer
from pyspark.ml.clustering import LDA, KMeans

CLEAN = "/netease/clean"
N_TOPICS = 6


def main():
    spark = K.get_spark("topic_lda")
    lyric = spark.read.parquet(CLEAN + "/lyric").filter(F.col("word_count") > 3)
    song = spark.read.parquet(CLEAN + "/song").select("song_id", "name", "artist_name", "year")

    from pyspark.ml.feature import StopWordsRemover
    tok = Tokenizer(inputCol="words", outputCol="tokens0")
    lyric_t = tok.transform(lyric)
    # 二次停用词过滤（words 在预处理时已分词，此处用最新停用词表再清噪音）
    swr = StopWordsRemover(inputCol="tokens0", outputCol="tokens",
                           stopWords=list(K.load_stopwords()))
    lyric_t = swr.transform(lyric_t)

    cv = CountVectorizer(inputCol="tokens", outputCol="tf", vocabSize=2000, minDF=2.0)
    cv_model = cv.fit(lyric_t)
    vocab = cv_model.vocabulary
    feat = cv_model.transform(lyric_t)

    # ---------- 6. LDA 主题模型 ----------
    lda = LDA(k=N_TOPICS, maxIter=20, featuresCol="tf", seed=42)
    lda_model = lda.fit(feat)

    # 每个主题 top 词 + 自动命名
    topics = lda_model.describeTopics(12)
    topic_words = []
    for r in topics.collect():
        words = [vocab[i] for i in r["termIndices"] if i < len(vocab)]
        name, score = K.label_topic(words)
        topic_words.append({"topic": r["topic"], "name": name, "words": words})
    print(">>> LDA 主题(自动命名):")
    for t in topic_words:
        print("   主题%d [%s]: %s" % (t["topic"], t["name"], " ".join(t["words"][:8])))

    # 每首歌主题分布 → 主导主题
    scored = lda_model.transform(feat)
    argmax = F.udf(lambda v: int(max(range(len(v)), key=lambda i: v[i])), IntegerType())
    topvec = F.udf(lambda v: [round(float(x), 4) for x in v], ArrayType(DoubleType()))
    scored = scored.withColumn("main_topic", argmax(F.col("topicDistribution")))
    scored = scored.withColumn("topic_dist", topvec(F.col("topicDistribution")))

    # ---------- KMeans 在主题向量上聚类 ----------
    km = KMeans(k=min(N_TOPICS, 4), featuresCol="topicDistribution",
                predictionCol="cluster", seed=42)
    km_model = km.fit(scored)
    scored = km_model.transform(scored)

    # 落 HBase lyric.nlp:topic（含主题名）
    name_map = {t["topic"]: t["name"] for t in topic_words}
    name_udf = F.udf(lambda i: name_map.get(i, "其他"), StringType())
    arr2str = F.udf(lambda a: ",".join(str(x) for x in a), StringType())
    scored = scored.withColumn("topic_name", name_udf(F.col("main_topic")))
    scored_h = scored.withColumn("topic_dist_s", arr2str(F.col("topic_dist")))
    K.write_hbase(scored_h, "netease:lyric", "song_id", {
        "main_topic": "nlp:main_topic",
        "topic_name": "nlp:topic_name",
        "topic_dist_s": "nlp:topic_dist",
    })
    K.write_hbase(scored_h, "netease:tag", "song_id", {"cluster": "t:cluster"})

    # 导出每首歌主题向量 parquet（供推荐模块读取，免依赖 HBase）
    song_full = spark.read.parquet(CLEAN + "/song").select(
        "song_id", "name", "artist_name", "comment_total")
    topic_vec = scored.select("song_id", "topic_dist", "topic_name") \
        .join(song_full, "song_id", "left")
    topic_vec.write.mode("overwrite").parquet(CLEAN + "/song_topic")

    # 主题分布（每主题歌曲数 + 名称 + 代表歌曲）
    sj_song = scored.join(song.select("song_id", "name", "artist_name"), "song_id", "left")
    topic_dist = scored.groupBy("main_topic").count().orderBy("main_topic")
    dist_rows = K.rows_to_dicts(topic_dist)
    for d in dist_rows:
        d["name"] = name_map.get(d["main_topic"], "其他")
        reps = sj_song.filter(F.col("main_topic") == d["main_topic"]) \
            .select("name", "artist_name").limit(5).collect()
        d["examples"] = [{"name": r["name"], "artist": r["artist_name"]} for r in reps]
    K.export_json("topic_distribution.json", dist_rows)
    # topic_words 增加代表歌曲后再导出
    for t in topic_words:
        reps = sj_song.filter(F.col("main_topic") == t["topic"]) \
            .select("name", "artist_name").limit(4).collect()
        t["examples"] = [{"name": r["name"], "artist": r["artist_name"]} for r in reps]
    K.export_json("topic_words.json", topic_words)

    # ---------- 8. 年代变迁主题河流 ----------
    sj = scored.join(song, "song_id", "left").filter(F.col("year") > 1990)
    river = sj.groupBy("year", "main_topic").count().orderBy("year", "main_topic")
    K.export_json("topic_river.json", K.rows_to_dicts(river))

    # ---------- 7. 热评话题词云（高频词）----------
    cmt = spark.read.parquet(CLEAN + "/comment").filter(F.length("words") > 0)
    words = cmt.select(F.explode(F.split("words", " ")).alias("w")) \
        .filter(F.length("w") >= 2)
    wc = words.groupBy("w").count().orderBy(F.desc("count")).limit(150)
    K.export_json("wordcloud.json", K.rows_to_dicts(wc))

    # 歌词高频词词云
    lwords = lyric.select(F.explode(F.split("words", " ")).alias("w")) \
        .filter(F.length("w") >= 2)
    lwc = lwords.groupBy("w").count().orderBy(F.desc("count")).limit(150)
    K.export_json("wordcloud_lyric.json", K.rows_to_dicts(lwc))

    spark.stop()
    print(">>> 主题挖掘完成。")


if __name__ == "__main__":
    main()
