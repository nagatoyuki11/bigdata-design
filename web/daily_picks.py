"""从 search.db 导出每日精选歌曲。
用法：python3 daily_picks.py
输出：web/data/daily_picks.json （12 首随机高质量歌曲）
"""
import sqlite3, json, os, random

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT = "/home/hadoop/workspace/coudes/web/data/daily_picks.json"

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    # 选评论 >10000 的歌曲，随机 12 首
    rows = cur.execute("""
        SELECT song_id, name, artist_name, album, year, comment_total, pop, topic_name
        FROM songs WHERE comment_total >= 10000 ORDER BY RANDOM() LIMIT 12
    """).fetchall()
    picks = [{"song_id": r[0], "name": r[1], "artist_name": r[2], "album": r[3],
              "year": r[4], "comment_total": r[5], "pop": r[6], "topic_name": r[7]} for r in rows]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(picks, f, ensure_ascii=False)
    print(f"每日精选 {len(picks)} 首 → {OUT}")
    # Also export cross-topic recommendations: for each topic, find high-quality songs in other topics
    topics = cur.execute("SELECT DISTINCT topic_name FROM songs WHERE topic_name IS NOT NULL AND topic_name != ''").fetchall()
    cross = {}
    for (t,) in topics:
        rows_t = cur.execute("""
            SELECT song_id, name, artist_name, topic_name, comment_total
            FROM songs WHERE topic_name != ? AND comment_total >= 5000
            ORDER BY RANDOM() LIMIT 8
        """, (t,)).fetchall()
        cross[t] = [{"song_id": r[0], "name": r[1], "artist_name": r[2], "topic_name": r[3], "comment_total": r[4]} for r in rows_t]
    with open(os.path.join(os.path.dirname(OUT), "cross_recommend.json"), "w", encoding="utf-8") as f:
        json.dump(cross, f, ensure_ascii=False)
    print(f"跨主题推荐 → cross_recommend.json")
    conn.close()

if __name__ == "__main__":
    main()
