# -*- coding: utf-8 -*-
"""模块②：统计分析（Spark SQL）。
1. 多维热度榜单（真实总评论数 / 评论总点赞 / 官方热度）
2. 爆款歌曲特征统计（时长分布、年代分布、歌手热度）
3. KPI 概览（供大屏顶部数据卡）
结果 → HBase netease:tag + 导出 JSON 供大屏。

说明：
- "评论热度"用歌曲真实总评论数 comment_total（采集时从接口 total 取得，跨度大）；
- "官方热度"用网易云 popularity(0-100)，单曲播放量公开 API 不暴露，故不采集；
- "歌手热度" = Σ真实总评论 + log(评论总点赞) + 作品数 + 平均popularity。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F

CLEAN = "/netease/clean"


def main():
    spark = K.get_spark("stats")
    song = spark.read.parquet(CLEAN + "/song")
    cmt = spark.read.parquet(CLEAN + "/comment")

    # 采样评论的聚合（点赞）；真实评论数用 song.comment_total
    cstat = cmt.groupBy("song_id").agg(
        F.count("*").alias("sample_comments"),
        F.sum("liked").alias("total_liked"),
    )
    song2 = song.join(cstat, "song_id", "left").fillna(0, ["sample_comments", "total_liked"])
    song2.createOrReplaceTempView("song")

    # ---------- 1. 多维热度榜单 ----------
    hot_comment = spark.sql("""
        SELECT song_id, name, artist_name, comment_total, total_liked, pop
        FROM song ORDER BY comment_total DESC LIMIT 50""")
    hot_liked = spark.sql("""
        SELECT song_id, name, artist_name, comment_total, total_liked, pop
        FROM song ORDER BY total_liked DESC LIMIT 50""")
    hot_pop = spark.sql("""
        SELECT song_id, name, artist_name, comment_total, total_liked, pop
        FROM song ORDER BY pop DESC LIMIT 50""")
    K.export_json("rank_comment.json", K.rows_to_dicts(hot_comment))
    K.export_json("rank_liked.json", K.rows_to_dicts(hot_liked))
    K.export_json("rank_pop.json", K.rows_to_dicts(hot_pop))

    # ---------- 2. 爆款特征统计 ----------
    dur = song2.withColumn("dur_bucket",
        F.when(F.col("duration_sec") < 180, "<3min")
         .when(F.col("duration_sec") < 240, "3-4min")
         .when(F.col("duration_sec") < 300, "4-5min")
         .otherwise(">5min"))
    dur_dist = dur.groupBy("dur_bucket").count().orderBy("dur_bucket")
    K.export_json("feat_duration.json", K.rows_to_dicts(dur_dist))

    # 年代分布（平均评论用真实 comment_total）
    year_dist = song2.filter(F.col("year") > 1990).groupBy("year").agg(
        F.count("*").alias("cnt"),
        F.round(F.avg("comment_total"), 0).alias("avg_comment"),
    ).orderBy("year")
    K.export_json("feat_year.json", K.rows_to_dicts(year_dist))

    # 歌手热度（综合公式）
    artist_hot = song2.groupBy("artist_name").agg(
        F.sum("comment_total").alias("comments"),
        F.sum("total_liked").alias("likes"),
        F.count("*").alias("songs"),
        F.avg("pop").alias("avg_pop"),
    )
    artist_hot = artist_hot.withColumn("heat",
        F.round(F.log1p(F.col("comments")) * 3 + F.log1p(F.col("likes"))
                + F.col("songs") + F.col("avg_pop") / 20, 2))
    artist_hot = artist_hot.orderBy(F.desc("heat")).limit(30)
    K.export_json("feat_artist_hot.json", K.rows_to_dicts(artist_hot))

    # ---------- 3. KPI 概览 ----------
    total_songs = song.count()
    total_artists = spark.read.parquet(CLEAN + "/artist").count()
    sample_comments = cmt.count()
    real_comments = song.agg(F.sum("comment_total")).first()[0] or 0
    K.export_json("kpi.json", {
        "songs": int(total_songs),
        "artists": int(total_artists),
        "sample_comments": int(sample_comments),
        "real_comments": int(real_comments),
    })
    print(">>> KPI: 歌曲%d 歌手%d 采样评论%d 真实评论总数%d"
          % (total_songs, total_artists, sample_comments, real_comments))

    # ---------- 落 HBase tag 表（热度指标）----------
    K.write_hbase(song2, "netease:tag", "song_id", {
        "comment_total": "t:comment_total",
        "total_liked": "t:total_liked",
    })

    spark.stop()
    print(">>> 统计分析完成。")


if __name__ == "__main__":
    main()
