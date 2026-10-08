"""从 search.db 导出分年代歌曲排行和歌手排行。
用法：python3 rank_export.py
输出：web/data/rank_songs_all.json, rank_artists_all.json
"""
import sqlite3, json, os

DB = "/home/hadoop/workspace/coudes/web/search.db"
DIR = "/home/hadoop/workspace/coudes/web/data"

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # 歌曲总排行（按评论数）
    songs = cur.execute("""
        SELECT song_id, name, artist_name, album, year, comment_total, pop, duration_sec
        FROM songs WHERE comment_total > 0 ORDER BY comment_total DESC LIMIT 100
    """).fetchall()
    song_list = [{"song_id": r[0], "name": r[1], "artist_name": r[2], "album": r[3],
                   "year": r[4], "comment_total": r[5], "pop": r[6], "duration_sec": r[7]} for r in songs]
    with open(os.path.join(DIR, "rank_songs_all.json"), "w", encoding="utf-8") as f:
        json.dump(song_list, f, ensure_ascii=False)
    print(f"歌曲总榜 {len(song_list)} 首 → rank_songs_all.json")

    # 歌手总排行（按影响力）
    artists = cur.execute("""
        SELECT artist_id, artist_name, song_num, comments, likes, avg_pop, influence, style_words, photo
        FROM artists WHERE authentic=1 ORDER BY influence DESC LIMIT 100
    """).fetchall()
    artist_list = [{"artist_id": r[0], "artist_name": r[1], "song_num": r[2], "comments": r[3],
                     "likes": r[4], "avg_pop": r[5], "influence": r[6], "style_words": r[7], "photo": r[8]} for r in artists]
    with open(os.path.join(DIR, "rank_artists_all.json"), "w", encoding="utf-8") as f:
        json.dump(artist_list, f, ensure_ascii=False)
    print(f"歌手总榜 {len(artist_list)} 位 → rank_artists_all.json")

    # 按年代预计算歌曲排行（每 10 年一个桶）
    decades = [(1970, 1979), (1980, 1989), (1990, 1999), (2000, 2009), (2010, 2019), (2020, 2026)]
    songs_by_decade = {}
    for y1, y2 in decades:
        rows = cur.execute("""
            SELECT song_id, name, artist_name, album, year, comment_total, pop
            FROM songs WHERE year BETWEEN ? AND ? AND comment_total > 0
            ORDER BY comment_total DESC LIMIT 30
        """, (y1, y2)).fetchall()
        songs_by_decade[f"{y1}s"] = [{"song_id": r[0], "name": r[1], "artist_name": r[2], "album": r[3],
                                       "year": r[4], "comment_total": r[5], "pop": r[6]} for r in rows]
    with open(os.path.join(DIR, "rank_songs_decade.json"), "w", encoding="utf-8") as f:
        json.dump(songs_by_decade, f, ensure_ascii=False)
    print(f"年代歌曲榜 {sum(len(v) for v in songs_by_decade.values())} 首 → rank_songs_decade.json")

    # 按年代预计算歌手排行
    artists_by_decade = {}
    for y1, y2 in decades:
        rows = cur.execute("""
            SELECT a.artist_id, a.artist_name, COUNT(s.song_id) as cnt,
                   SUM(s.comment_total) as total_cmt, CAST(AVG(s.pop) AS INTEGER) as avg_pop
            FROM songs s JOIN artists a ON s.artist_id = a.artist_id
            WHERE s.year BETWEEN ? AND ? AND a.authentic=1
            GROUP BY a.artist_id ORDER BY total_cmt DESC LIMIT 30
        """, (y1, y2)).fetchall()
        artists_by_decade[f"{y1}s"] = [{"artist_id": r[0], "artist_name": r[1], "song_cnt": r[2],
                                         "total_cmt": r[3], "avg_pop": r[4]} for r in rows]
    with open(os.path.join(DIR, "rank_artists_decade.json"), "w", encoding="utf-8") as f:
        json.dump(artists_by_decade, f, ensure_ascii=False)
    print(f"年代歌手榜 → rank_artists_decade.json")

    conn.close()
    print("完成")

if __name__ == "__main__":
    main()
