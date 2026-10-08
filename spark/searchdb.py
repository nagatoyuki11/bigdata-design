# -*- coding: utf-8 -*-
"""检索服务层：把 HDFS 上的 clean parquet 物化为 SQLite + FTS5 全文索引库。

定位（Lambda 架构的 Serving Layer）：
- HDFS/HBase 为批处理与权威存储；本库为前端"华语歌曲大数据库"的在线检索层。
- 结构化数据（歌曲 3.4w / 歌手 1.7w）量级很小，复合条件过滤近乎瞬时。
- 歌词 / 评论用 FTS5 建全文索引：索引列用 jieba 预分词后的 words（unicode61 按空格切词，
  天然适配中文 2 字词），原文 content/lyric 作为 UNINDEXED 列随表存储供展示。
- 纯 Python 标准库 sqlite3 写入，进程内、零额外常驻内存，不与 HBase/Spark 抢内存。

运行：bash spark/submit.sh searchdb.py   （需要 Spark 读取 parquet）
输出：web/search.db
"""
import sys, os, json, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F

CLEAN = "/netease/clean"
DB_PATH = "/home/hadoop/workspace/coudes/web/search.db"
RAW_DIR = "/home/hadoop/workspace/coudes/data/raw"
BATCH = 2000
AUTH_CMT_MIN = 100  # 真实歌手门槛：评论总数 >= 此值视为真实，过滤空壳/聚合噪声


def _sentiment_of(words):
    """构建期用情感词典给评论打三分类标签（确定性、可复现，无需重跑 MLlib）。"""
    lab, p, n = K.lexicon_label(words)
    if p > n:
        return "正向"
    if n > p:
        return "负向"
    return "中性"


def _emotion_of(words):
    tags = K.emotion_tags(words)
    return tags[0] if tags else ""


def _init_db(conn):
    cur = conn.cursor()
    cur.executescript("""
    DROP TABLE IF EXISTS songs;
    DROP TABLE IF EXISTS artists;
    DROP TABLE IF EXISTS lyrics_fts;
    DROP TABLE IF EXISTS comments_fts;

    CREATE TABLE songs (
      song_id       TEXT PRIMARY KEY,
      name          TEXT,
      artist_name   TEXT,
      artist_id     TEXT,
      album         TEXT,
      year          INTEGER,
      duration_sec  INTEGER,
      pop           INTEGER,
      comment_total INTEGER,   -- 真实总评论数（接口 total）
      total_liked   INTEGER,   -- 采样评论总点赞
      sample_comments INTEGER, -- 采样评论数
      topic_name    TEXT,      -- LDA 主导主题名
      emotions      TEXT       -- 主情绪标签（治愈/emo/...）
    );
    CREATE INDEX idx_songs_year   ON songs(year);
    CREATE INDEX idx_songs_cmt    ON songs(comment_total);
    CREATE INDEX idx_songs_pop    ON songs(pop);
    CREATE INDEX idx_songs_artist ON songs(artist_name);
    CREATE INDEX idx_songs_topic  ON songs(topic_name);

    CREATE TABLE artists (
      artist_id   TEXT PRIMARY KEY,
      artist_name TEXT,
      song_num    INTEGER,
      comments    INTEGER,
      likes       INTEGER,
      avg_pop     REAL,
      influence   REAL,
      style_words TEXT,
      photo       TEXT,
      authentic   INTEGER   -- 1=真实歌手（评论总数>=阈值），0=空壳/聚合噪声
    );
    CREATE INDEX idx_artists_infl ON artists(influence);
    CREATE INDEX idx_artists_name ON artists(artist_name);

    -- 歌词全文索引：words 为 jieba 分词结果（被索引），其余列 UNINDEXED 仅存储展示
    CREATE VIRTUAL TABLE lyrics_fts USING fts5(
      words,
      song_id UNINDEXED, name UNINDEXED, artist_name UNINDEXED,
      year UNINDEXED, topic_name UNINDEXED, lyric UNINDEXED, word_count UNINDEXED,
      tokenize = 'unicode61'
    );

    -- 评论全文索引：同上
    CREATE VIRTUAL TABLE comments_fts USING fts5(
      words,
      song_id UNINDEXED, name UNINDEXED, artist_name UNINDEXED,
      content UNINDEXED, liked UNINDEXED, time UNINDEXED, sentiment UNINDEXED,
      tokenize = 'unicode61'
    );
    """)
    conn.commit()


def _bulk(conn, sql, it):
    cur = conn.cursor()
    buf, total = [], 0
    for row in it:
        buf.append(row)
        if len(buf) >= BATCH:
            cur.executemany(sql, buf); total += len(buf); buf = []
    if buf:
        cur.executemany(sql, buf); total += len(buf)
    conn.commit()
    return total


def main():
    spark = K.get_spark("searchdb")

    song = spark.read.parquet(CLEAN + "/song")
    cmt = spark.read.parquet(CLEAN + "/comment")
    lyric = spark.read.parquet(CLEAN + "/lyric")
    try:
        song_topic = spark.read.parquet(CLEAN + "/song_topic") \
            .select("song_id", "topic_name")
    except Exception:
        song_topic = None

    # 采样评论聚合（点赞 / 条数）
    cstat = cmt.groupBy("song_id").agg(
        F.count("*").alias("sample_comments"),
        F.sum("liked").alias("total_liked"))

    emo_udf = F.udf(_emotion_of)
    lyr_emo = lyric.select("song_id", "words").withColumn("emotions", emo_udf(F.col("words"))) \
        .select("song_id", "emotions")

    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    _init_db(conn)

    # ---------- songs ----------
    sdf = song.join(cstat, "song_id", "left") \
        .join(lyr_emo, "song_id", "left")
    if song_topic is not None:
        sdf = sdf.join(song_topic, "song_id", "left")
    else:
        sdf = sdf.withColumn("topic_name", F.lit(None).cast("string"))
    sdf = sdf.select(
        "song_id", "name", "artist_name", "artist_id", "album", "year",
        "duration_sec", "pop", "comment_total", "total_liked",
        "sample_comments", "topic_name", "emotions").fillna(
        {"total_liked": 0, "sample_comments": 0, "comment_total": 0})

    def _song_rows():
        for r in sdf.toLocalIterator():
            yield (str(r["song_id"]), r["name"], r["artist_name"],
                   str(r["artist_id"]) if r["artist_id"] is not None else None,
                   r["album"], int(r["year"]) if r["year"] is not None else None,
                   int(r["duration_sec"] or 0), int(r["pop"] or 0),
                   int(r["comment_total"] or 0), int(r["total_liked"] or 0),
                   int(r["sample_comments"] or 0), r["topic_name"], r["emotions"])
    n = _bulk(conn,
              "INSERT OR IGNORE INTO songs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
              _song_rows())
    print(">>> songs:", n)

    # ---------- artists（按 artist_id 聚合：artist_id 为主艺人，artist_name 含合作串，
    #            故按 id 归并，展示名取该 id 下作品最多的主名，避免合作串碎片化）----------
    # 注意：部分歌曲 /song/detail 接口未返回 artist_id（取 0），历史上这些歌曲被并入
    # artist_id=0 同一桶，导致不相关歌手聚合、顶上排行榜（如欣歆然）。这里显式排除
    # artist_id 为 null / 空串 / "0" / 0 的哨兵值，杜绝聚合噪声。
    from pyspark.sql.window import Window
    _aid = F.coalesce(F.col("artist_id").cast("string"), F.lit(""))
    sj = song.join(cstat, "song_id", "left").fillna(0, ["total_liked"]) \
        .fillna(0, ["comment_total"]) \
        .filter(_aid.rlike(r"^[1-9][0-9]*$"))   # 仅保留正整数 ID，排除 0 / null / 空
    # 每个 artist_id 的代表名：出现次数最多的 artist_name
    name_cnt = sj.groupBy("artist_id", "artist_name").count()
    w_name = Window.partitionBy("artist_id").orderBy(F.desc("count"), F.asc("artist_name"))
    rep_name = name_cnt.withColumn("rk", F.row_number().over(w_name)) \
        .filter(F.col("rk") == 1).select("artist_id", F.col("artist_name").alias("rep_name"))
    prof = sj.groupBy("artist_id").agg(
        F.count("*").alias("song_num"),
        F.sum("comment_total").alias("comments"),
        F.sum("total_liked").alias("likes"),
        F.round(F.avg("pop"), 1).alias("avg_pop")) \
        .join(rep_name, "artist_id", "left")
    prof = prof.withColumn("influence",
        F.round(F.log1p(F.col("comments")) * 2 + F.log1p(F.col("likes"))
                + F.col("song_num"), 2))
    # 真实性标志：评论总数达阈值视为真实歌手（空壳 / 噪声聚合自动剔除）
    prof = prof.withColumn("authentic", F.when(F.col("comments") >= AUTH_CMT_MIN, 1).otherwise(0))

    # 复用 predict 已导出的 top30 词风关键词（按歌手名匹配）
    style_map = {}
    ap_path = os.path.join(K.WEB_DATA_DIR, "artist_profile.json")
    if os.path.exists(ap_path):
        with open(ap_path, encoding="utf-8") as f:
            for a in json.load(f):
                if a.get("style_words"):
                    style_map[a["artist_name"]] = a["style_words"]

    # 歌手照片：从本地 artists.jsonl 读取（爬虫补抓 img1v1Url）。按 artist_id 取最新一条。
    photo_map = {}
    ap_jsonl = os.path.join(RAW_DIR, "artists.jsonl")
    if os.path.exists(ap_jsonl):
        with open(ap_jsonl, encoding="utf-8") as f:
            for line in f:
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                pid = str(o.get("artist_id") or "")
                pic = o.get("photo") or o.get("img1v1Url") or o.get("picUrl") or ""
                if pid and pic:
                    photo_map[pid] = pic  # 后写覆盖先写，取最新

    def _artist_rows():
        for r in prof.toLocalIterator():
            an = r["rep_name"]
            aid = str(r["artist_id"])
            yield (aid,
                   an, int(r["song_num"] or 0), int(r["comments"] or 0),
                   int(r["likes"] or 0), float(r["avg_pop"] or 0),
                   float(r["influence"] or 0), style_map.get(an, ""),
                   photo_map.get(aid, ""), int(r["authentic"] or 0))
    n = _bulk(conn,
              "INSERT OR IGNORE INTO artists VALUES (?,?,?,?,?,?,?,?,?,?)",
              _artist_rows())
    print(">>> artists:", n)

    # ---------- lyrics_fts ----------
    ldf = lyric.select("song_id", "words", "lyric", "word_count").join(
        song.select("song_id", "name", "artist_name", "year"), "song_id", "left")
    if song_topic is not None:
        ldf = ldf.join(song_topic, "song_id", "left")
    else:
        ldf = ldf.withColumn("topic_name", F.lit(None).cast("string"))

    def _lyric_rows():
        for r in ldf.toLocalIterator():
            yield (r["words"] or "", str(r["song_id"]), r["name"], r["artist_name"],
                   int(r["year"]) if r["year"] is not None else None,
                   r["topic_name"], r["lyric"] or "", int(r["word_count"] or 0))
    n = _bulk(conn,
              "INSERT INTO lyrics_fts (words,song_id,name,artist_name,year,topic_name,lyric,word_count)"
              " VALUES (?,?,?,?,?,?,?,?)",
              _lyric_rows())
    print(">>> lyrics_fts:", n)

    # ---------- comments_fts ----------
    sent_udf = F.udf(_sentiment_of)
    cdf = cmt.filter(F.length(F.trim("content")) > 0) \
        .withColumn("sentiment", sent_udf(F.col("words"))) \
        .join(song.select("song_id", "name", "artist_name"), "song_id", "left")

    def _cmt_rows():
        for r in cdf.toLocalIterator():
            yield (r["words"] or "", str(r["song_id"]), r["name"], r["artist_name"],
                   r["content"] or "", int(r["liked"] or 0),
                   str(r["time"]) if r["time"] is not None else "", r["sentiment"])
    n = _bulk(conn,
              "INSERT INTO comments_fts (words,song_id,name,artist_name,content,liked,time,sentiment)"
              " VALUES (?,?,?,?,?,?,?,?)",
              _cmt_rows())
    print(">>> comments_fts:", n)

    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    spark.stop()
    print(">>> 检索库构建完成:", DB_PATH)


if __name__ == "__main__":
    main()
