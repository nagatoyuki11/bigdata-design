# -*- coding: utf-8 -*-
"""创新模块·年代时光机数据。

按发行年份聚合：
  - 当年歌词高频词（年度意象词云，反映年代主题漂移）
  - 当年热歌榜（按真实评论数 Top10）
导出 web/data/era_timeline.json，供前端年份滑块交互。

运行：bash spark/submit.sh era.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F
from pyspark.sql.window import Window

CLEAN = "/netease/clean"
YEAR_MIN = 2000
YEAR_MAX = 2024
TOP_WORDS = 40
TOP_SONGS = 10


def main():
    spark = K.get_spark("era")
    song = spark.read.parquet(CLEAN + "/song").select(
        "song_id", "name", "artist_name", "comment_total", "year") \
        .filter((F.col("year") >= YEAR_MIN) & (F.col("year") <= YEAR_MAX))
    lyric = spark.read.parquet(CLEAN + "/lyric").select("song_id", "words")

    sl = song.join(lyric, "song_id", "left")

    # ---------- 当年歌词高频词（仅保留中文意象词，过滤英文填充词如 you/my）----------
    words = sl.filter(F.col("words").isNotNull()) \
        .select("year", F.explode(F.split("words", " ")).alias("w")) \
        .filter((F.length("w") >= 2) & (F.col("w").rlike("^[一-龥]{2,}$")))
    wc = words.groupBy("year", "w").count()
    w_win = Window.partitionBy("year").orderBy(F.desc("count"))
    top_w = wc.withColumn("rk", F.row_number().over(w_win)) \
        .filter(F.col("rk") <= TOP_WORDS).collect()

    words_by_year = {}
    for r in top_w:
        words_by_year.setdefault(r["year"], []).append(
            {"w": r["w"], "count": int(r["count"])})

    # ---------- 当年热歌榜 ----------
    s_win = Window.partitionBy("year").orderBy(F.desc("comment_total"))
    top_s = song.withColumn("rk", F.row_number().over(s_win)) \
        .filter(F.col("rk") <= TOP_SONGS).collect()
    songs_by_year = {}
    for r in top_s:
        songs_by_year.setdefault(r["year"], []).append(
            {"song_id": str(r["song_id"]), "name": r["name"],
             "artist": r["artist_name"], "comment_total": int(r["comment_total"] or 0)})

    years = sorted(set(words_by_year) | set(songs_by_year))
    out = {"years": [
        {"year": y, "words": words_by_year.get(y, []), "songs": songs_by_year.get(y, [])}
        for y in years]}
    K.export_json("era_timeline.json", out)
    print(">>> 年代时光机: %d 个年份 (%d-%d)" % (len(years), years[0], years[-1]))
    for y in years[-5:]:
        ws = words_by_year.get(y, [])
        print("   %d: 热歌%d 高频词 %s" % (
            y, len(songs_by_year.get(y, [])),
            " ".join(w["w"] for w in ws[:6])))

    spark.stop()
    print(">>> 年代时光机完成。")


if __name__ == "__main__":
    main()
