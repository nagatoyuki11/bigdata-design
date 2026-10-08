"""从 search.db 聚合专辑排行，导出 album_rank.json。
直接读 SQLite 即可（数据已在 songs 表中），无需 Spark。
用法：python3 album_export.py
输出：web/data/album_rank.json
"""
import sqlite3, json, os

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT = "/home/hadoop/workspace/coudes/web/data/album_rank.json"

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    # 按 album + artist_name 聚合，计算 歌曲数/总评论/平均热度/主题列表
    rows = cur.execute("""
        SELECT album, artist_name,
               COUNT(*) as song_cnt,
               SUM(comment_total) as total_cmt,
               CAST(AVG(pop) AS INTEGER) as avg_pop,
               GROUP_CONCAT(DISTINCT topic_name) as topics,
               MIN(year) as first_year,
               MAX(year) as last_year
        FROM songs
        WHERE album IS NOT NULL AND album != '' AND album != '未收录'
        GROUP BY album, artist_name
        HAVING song_cnt >= 3
        ORDER BY total_cmt DESC
        LIMIT 500
    """).fetchall()

    albums = []
    for r in rows:
        alb, artist, cnt, cmt, pop, topics_str, y1, y2 = r
        topics = [t for t in (topics_str or '').split(',') if t]
        # 主题一致性：主导主题占比
        from collections import Counter
        tc = Counter(topics)
        coherence = max(tc.values()) / len(topics) if topics else 0
        albums.append({
            "album": alb,
            "artist": artist,
            "song_cnt": cnt,
            "total_cmt": cmt,
            "avg_pop": pop,
            "topics": topics[:5],
            "coherence": round(coherence, 2),
            "first_year": y1,
            "last_year": y2,
            "concept_score": round(coherence * (1 + cmt / max(1, 1000000)), 1),
        })

    # 按 concept_score 排序（概念专辑度）
    albums.sort(key=lambda a: (-a["concept_score"], -a["total_cmt"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(albums, f, ensure_ascii=False)

    print(f"导出 {len(albums)} 张专辑 → {OUT}")
    # Top 5
    for a in albums[:5]:
        print(f"  {a['artist']} - {a['album']}  ({a['song_cnt']}首, 评论{a['total_cmt']}, 概念度{a['concept_score']})")

    conn.close()

if __name__ == "__main__":
    main()
