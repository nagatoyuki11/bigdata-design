"""从 search.db 聚合歌手年度数据，导出 artist_career.json。
用法：python3 career_export.py
输出：web/data/artist_career.json
"""
import sqlite3, json, os

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT = "/home/hadoop/workspace/coudes/web/data/artist_career.json"

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    # 筛选评论>=1000 的真实歌手，取影响力 top 200
    cur.execute("SELECT artist_id, artist_name FROM artists WHERE authentic=1 AND comments>=1000 ORDER BY influence DESC LIMIT 200")
    artists = cur.fetchall()

    result = []
    for aid, aname in artists:
        rows = cur.execute("""
            SELECT year, COUNT(*) as cnt, SUM(comment_total) as total_cmt,
                   CAST(AVG(pop) AS INTEGER) as avg_pop
            FROM songs
            WHERE artist_id = ? AND year IS NOT NULL AND year > 0
            GROUP BY year ORDER BY year
        """, (aid,)).fetchall()
        if len(rows) < 3: continue  # 至少 3 年数据
        career = []
        prev_cmt = 0
        peak_cmt = 0; peak_year = None
        burst_year = None; burst_ratio = 0
        for r in rows:
            y, cnt, cmt, pop = r
            cmt = int(cmt or 0)
            ratio = (cmt - prev_cmt) / max(prev_cmt, 1) if prev_cmt > 0 else 0
            if cmt > peak_cmt: peak_cmt = cmt; peak_year = y
            if ratio > burst_ratio and prev_cmt > 100: burst_ratio = ratio; burst_year = y
            career.append({"year": y, "cnt": cnt, "cmt": cmt, "pop": pop})
            prev_cmt = cmt

        # 最后一年（活跃度判断）
        last_year = career[-1]["year"] if career else None
        result.append({
            "artist_id": aid, "artist_name": aname,
            "career": career,
            "peak_year": peak_year, "peak_cmt": peak_cmt,
            "burst_year": burst_year,
            "last_active": last_year,
            "total_years": len(career),
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    print(f"导出 {len(result)} 位歌手轨迹 → {OUT}")
    for a in result[:5]:
        print(f"  {a['artist_name']}  {a['total_years']}年 巅峰{a['peak_year']}({a['peak_cmt']}评)")

    conn.close()

if __name__ == "__main__":
    main()
