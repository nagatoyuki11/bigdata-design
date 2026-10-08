# -*- coding: utf-8 -*-
"""模块①：数据清洗与预处理（Spark + jieba）。

读 HDFS 原始 JSON → 去重/去空 → jieba 分词 → 写回 HDFS parquet（干净语料）
                   → song / lyric / comment 原始信息落 HBase。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F


CLEAN_DIR = "/netease/clean"


def main():
    spark = K.get_spark("preprocess")
    tok = K.register_tokenize_udf(spark)
    cn_udf = F.udf(K.chinese_ratio, "double")

    # ---------- 原始读取 ----------
    song = spark.read.json(K.HDFS_RAW + "/song").dropDuplicates(["song_id"]) \
        .filter(F.col("name").isNotNull())
    lyric0 = spark.read.json(K.HDFS_RAW + "/lyric").dropDuplicates(["song_id"]) \
        .filter(F.col("lyric").isNotNull() & (F.length("lyric") > 0))

    # ---------- 华语过滤：有歌词但中文占比<0.3 的判为非华语，剔除 ----------
    lyric0 = lyric0.withColumn("cn_ratio", cn_udf(F.col("lyric")))
    foreign = lyric0.filter(F.col("cn_ratio") < 0.3).select("song_id")
    fcnt = foreign.count()
    print(">>> 剔除非华语歌曲:", fcnt)

    # ---------- song ----------
    song = song.join(foreign, "song_id", "left_anti")
    song = song.withColumn("duration_sec", (F.col("duration_ms") / 1000).cast("int"))
    if "comment_total" not in song.columns:
        song = song.withColumn("comment_total", F.lit(0))
    song = song.fillna(0, ["comment_total"])
    song.write.mode("overwrite").parquet(CLEAN_DIR + "/song")
    print(">>> song:", song.count())

    # ---------- lyric ----------
    lyric = lyric0.filter(F.col("cn_ratio") >= 0.3)
    lyric = lyric.withColumn("words", tok(F.col("lyric")))
    lyric = lyric.withColumn("word_count", F.size(F.split(F.col("words"), " ")))
    lyric.write.mode("overwrite").parquet(CLEAN_DIR + "/lyric")
    print(">>> lyric:", lyric.count())

    # ---------- comment（同步剔除非华语歌的评论）----------
    cmt = spark.read.json(K.HDFS_RAW + "/comment")
    cmt = cmt.dropDuplicates(["row_key"]).filter(
        F.col("content").isNotNull() & (F.length(F.trim("content")) > 0))
    cmt = cmt.join(foreign, "song_id", "left_anti")
    # 单机内存约束：百万级评论 NLP 抽样（真实总评论数由 song.comment_total 保留）
    frac = float(os.environ.get("COMMENT_SAMPLE_FRAC", "1.0"))
    if frac < 1.0:
        cmt = cmt.sample(False, frac, seed=42)
        print(">>> 评论抽样比例 %.2f" % frac)
    cmt = cmt.withColumn("words", tok(F.col("content")))
    cmt.write.mode("overwrite").parquet(CLEAN_DIR + "/comment")
    print(">>> comment:", cmt.count())

    # ---------- artist ----------
    art = spark.read.json(K.HDFS_RAW + "/artist")
    art = art.dropDuplicates(["artist_id"])
    art.write.mode("overwrite").parquet(CLEAN_DIR + "/artist")
    print(">>> artist:", art.count())

    # ---------- 落 HBase 原始信息 ----------
    K.write_hbase(song, "netease:song", "song_id", {
        "name": "info:name", "artist_name": "info:artist", "artist_id": "info:artist_id",
        "album": "info:album", "year": "info:year", "duration_sec": "info:duration",
        "pop": "stat:pop", "comment_total": "stat:comment_total",
    })
    K.write_hbase(lyric, "netease:lyric", "song_id", {
        "lyric": "content:text", "words": "nlp:words", "word_count": "nlp:word_count",
    })
    # 磁盘安全：评论量巨大(百万级)时跳过逐条写 HBase，仅 Spark 内分析 + 聚合落库
    if os.environ.get("SKIP_COMMENT_HBASE"):
        print(">>> [磁盘安全] 跳过逐条评论写 HBase netease:comment")
    else:
        K.write_hbase(cmt, "netease:comment", "row_key", {
            "song_id": "c:song_id", "content": "c:content", "liked": "c:liked",
            "time": "c:time", "hot": "c:hot", "words": "c:words",
        })

    spark.stop()
    print(">>> 预处理完成。")


if __name__ == "__main__":
    main()
