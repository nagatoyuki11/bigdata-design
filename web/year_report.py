"""年度报告导出：每年 Top 歌曲/歌手/主题/高频词 + 智能点评。
用法：python3 year_report.py
输出：web/data/year_report.json
"""
import sqlite3, json, os
from collections import Counter

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT = "/home/hadoop/workspace/coudes/web/data/year_report.json"


def fmt_count(n: int) -> str:
    """格式化数字为中文可读形式"""
    if n >= 1e8:
        v = n / 1e8
        return f"{int(v)}亿" if v == int(v) else f"{v:.1f}亿"
    if n >= 1e4:
        v = n / 1e4
        return f"{int(v)}万" if v == int(v) else f"{v:.1f}万"
    return str(n)


def detect_era(year: int, song_count: int, total_cmt: int) -> str:
    """根据年份和数据规模识别年代阶段"""
    if year < 1978:
        return "文革末期至改革开放前夕，华语流行音乐几乎处于停滞状态，仅有极少数作品流传。"
    if year <= 1984:
        return "改革开放初期，港台流行音乐开始进入内地，粤语歌与台湾民谣并行发展。"
    if year <= 1989:
        return "八十年代中后期，香港乐坛「谭张争霸」白热化，台湾唱片工业走向成熟。"
    if year <= 1993:
        return "九十年代初期，四大天王（刘德华、张学友、郭富城、黎明）统治香港乐坛，Beyond乐队将粤语摇滚推向巅峰。"
    if year <= 1997:
        return "九十年代中期，香港回归前夕，四大天王时代渐入尾声，内地校园民谣与摇滚乐开始崛起。"
    if year <= 2000:
        return "九十年代末至世纪之交，王菲、张惠妹、陶喆等歌手引领华语乐坛走向国际化，R&B曲风开始流行。"
    if year <= 2005:
        return "千禧年初，周杰伦横空出世，以独特的「周式R&B+中国风」重新定义了华语流行音乐。"
    if year <= 2009:
        return "两千年代中后期，网络歌手许嵩、汪苏泷等从互联网崛起，彩铃时代改变了音乐消费方式。"
    if year <= 2013:
        return "一零年代初期，选秀节目（好声音、快男）成为造星主渠道，独立民谣也开始受到主流关注。"
    if year <= 2016:
        return "一零年代中期，QQ音乐三巨头（许嵩、汪苏泷、徐良）退潮，以华晨宇为代表的新生代实力歌手崭露头角。"
    if year <= 2019:
        return "一零年代末，短视频（抖音、快手）崛起，15秒片段成为音乐传播的新载体，「神曲」频出。"
    if year <= 2022:
        return "疫情三年，线上演出成为新常态，独立音乐人通过直播和短视频获得前所未有的曝光。"
    if year <= 2025:
        return "后疫情时代，演唱会市场井喷式复苏，抖音热歌继续主导大众收听习惯。"
    return "当前年份数据仍在积累中。"


def detect_trends(data: list, year_idx: int, year_data: dict, all_artists: dict) -> list:
    """检测年际趋势，返回有趣发现的列表"""
    trends = []
    y = year_data
    prev = data[year_idx - 1] if year_idx > 0 else None
    prev2 = data[year_idx - 2] if year_idx > 1 else None

    # 1. 歌曲产出变化
    if prev:
        change = y['song_count'] - prev['song_count']
        pct = abs(change) / max(prev['song_count'], 1) * 100
        if change > 100 and pct > 15:
            trends.append(f"歌曲收录量较上年增长{fmt_count(change)}首（+{pct:.0f}%）。")
        elif change < -50 and pct > 10:
            trends.append(f"歌曲收录量较上年减少{fmt_count(abs(change))}首（-{pct:.0f}%）。")

    # 2. 评论热度变化
    if prev:
        change = y['total_cmt'] - prev['total_cmt']
        pct = abs(change) / max(prev['total_cmt'], 1) * 100
        if change > 500000 and pct > 20:
            trends.append(f"年度总评论暴涨{fmt_count(change)}（+{pct:.0f}%），热度空前。")
        elif change < -200000 and pct > 15:
            trends.append(f"年度总评论回落{fmt_count(abs(change))}（-{pct:.0f}%）。")

    # 3. 霸榜检测：同一歌手连续蝉联
    if prev:
        cur_top = y['top_artists'][0]['name'] if y['top_artists'] else None
        prev_top = prev['top_artists'][0]['name'] if prev['top_artists'] else None
        if cur_top and prev_top and cur_top == prev_top:
            if prev2 and prev2['top_artists'] and prev2['top_artists'][0]['name'] == cur_top:
                trends.append(f"🎖️「{cur_top}」连续三年蝉联年度歌手榜首，堪称一代天王。")
            else:
                trends.append(f"「{cur_top}」连续两年登顶年度歌手榜首，势头正盛。")

    # 4. 黑马检测：首次进入 Top 3 且评论量显著
    top3 = [a['name'] for a in y['top_artists'][:3]] if y['top_artists'] else []
    if prev:
        prev_top5 = [a['name'] for a in prev['top_artists']] if prev['top_artists'] else []
        for artist in top3[:1]:  # 只看榜首
            if artist not in prev_top5 and all_artists.get(artist, 0) <= 1:
                trends.append(f"黑马「{artist}」首度登顶年度歌手榜，一鸣惊人。")

    # 5. 话题变迁
    if prev:
        cur_topic = y['top_topics'][0]['name'] if y['top_topics'] else ''
        prev_topic = prev['top_topics'][0]['name'] if prev['top_topics'] else ''
        if cur_topic and prev_topic and cur_topic != prev_topic:
            trends.append(f"年度主旋律从「{prev_topic}」转向「{cur_topic}」，听众心态发生变化。")

    # 6. 单曲异常突出
    if y['top_songs'] and len(y['top_songs']) >= 2:
        first = y['top_songs'][0]['cmt']
        second = y['top_songs'][1]['cmt']
        if second > 10 and first > second * 3:
            trends.append(f"金曲「{y['top_songs'][0]['name']}」评论量断层领先，是第二名「{y['top_songs'][1]['name']}」的{first // second}倍。")

    return trends


def generate_commentary(year: int, year_idx: int, year_data: dict, data: list, all_artists: dict) -> str:
    """基于数据生成有洞察力的年度点评"""
    y = year_data
    prev = data[year_idx - 1] if year_idx > 0 else None
    parts = []

    # === 第一段：年代背景 ===
    era = detect_era(year, y['song_count'], y['total_cmt'])
    parts.append(era)

    # === 第二段：数据概览 ===
    # 歌曲数和评论数
    if y['song_count'] >= 2000:
        scale = "大年"
    elif y['song_count'] >= 1000:
        scale = "丰年"
    elif y['song_count'] >= 300:
        scale = "稳年"
    else:
        scale = "小年"

    total_cmt_str = fmt_count(y['total_cmt'])
    if y['total_cmt'] >= 5000000:
        heat_desc = "创下惊人热度"
    elif y['total_cmt'] >= 1000000:
        heat_desc = "热度不凡"
    elif y['total_cmt'] >= 100000:
        heat_desc = "市场活跃"
    else:
        heat_desc = "讨论量有限（注：早期数据受限于平台收录）"

    parts.append(f"{year}年是华语乐坛的{scale}，全年收录{y['song_count']}首歌曲，累计{total_cmt_str}条评论，{heat_desc}。")

    # === 第三段：年度歌手分析 ===
    if y['top_artists']:
        top_artist = y['top_artists'][0]
        parts.append(f"年度最具影响力歌手为「{top_artist['name']}」，共贡献{top_artist['songs']}首作品，收获{fmt_count(top_artist['cmt'])}条评论。")
        if len(y['top_artists']) >= 2:
            others = '、'.join(a['name'] for a in y['top_artists'][1:4])
            parts.append(f"紧随其后的是{others}等实力歌手。")

    # === 第四段：年度金曲 ===
    if y['top_songs']:
        top_song = y['top_songs'][0]
        parts.append(f"年度金曲《{top_song['name']}》（{top_song['artist']}）以{fmt_count(top_song['cmt'])}条评论位居榜首，")
        if len(y['top_songs']) >= 2:
            parts.append(f"《{y['top_songs'][1]['name']}》（{y['top_songs'][1]['artist']}）、《{y['top_songs'][2]['name'] if len(y['top_songs'])>=3 else ''}》")
            if len(y['top_songs']) >= 3:
                parts.append(f"（{y['top_songs'][2]['artist'] if len(y['top_songs'])>=3 else ''}）")
            parts.append("等作品同样深入人心。")
        else:
            parts.append("独领风骚。")

    # === 第五段：主题与话题 ===
    if y['top_topics']:
        topics_str = '、'.join(t['name'] for t in y['top_topics'][:3] if t['name'])
        if topics_str:
            parts.append(f"年度创作主题集中于「{topics_str}」，反映了这一年的社会情绪与听众偏好。")

    # === 第六段：热词 ===
    if y['top_words']:
        words_str = '、'.join(w['word'] for w in y['top_words'][:5])
        parts.append(f"年度歌词高频词为「{words_str}」，勾勒出这一年大众的情感底色。")

    # === 第七段：趋势发现 ===
    trends = detect_trends(data, year_idx, y, all_artists)
    for t in trends:
        parts.append(t)

    return ''.join(parts)


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # 获取所有年份
    years = [r[0] for r in cur.execute(
        "SELECT DISTINCT year FROM songs WHERE year IS NOT NULL AND year >= 1970 AND year <= 2026 ORDER BY year"
    ).fetchall()]

    # 第一遍：收集基础数据
    raw_data = []
    for year in years:
        songs = cur.execute("""
            SELECT song_id, name, artist_name, album, comment_total, pop, topic_name
            FROM songs WHERE year=? AND comment_total > 0 ORDER BY comment_total DESC LIMIT 10
        """, (year,)).fetchall()

        artists = cur.execute("""
            SELECT a.artist_name, SUM(s.comment_total) as total_cmt, COUNT(*) as cnt
            FROM songs s JOIN artists a ON s.artist_id = a.artist_id
            WHERE s.year=? AND s.comment_total > 0 GROUP BY a.artist_id
            ORDER BY total_cmt DESC LIMIT 5
        """, (year,)).fetchall()

        topics = cur.execute("""
            SELECT topic_name, COUNT(*) as cnt FROM songs
            WHERE year=? AND topic_name IS NOT NULL AND topic_name!=''
            GROUP BY topic_name ORDER BY cnt DESC LIMIT 5
        """, (year,)).fetchall()

        word_counter = Counter()
        cur.execute("""
            SELECT l.words FROM lyrics_fts l JOIN songs s ON l.song_id = s.song_id
            WHERE s.year=? LIMIT 500
        """, (year,))
        stop = set("的 了 是 在 我 你 他 她 它 们 这 那 不 也 就 都 还 要 会 可 把 被 让 给 对 从 到 和 与 或 但 而 虽 却 因 为 所 以 能 着 过 之 又 很 太 更 最 啊 吧 呢 吗 哦 嗯 呀 哟 呵".split())
        for (words,) in cur:
            for w in (words or '').split():
                w = w.strip()
                if len(w) >= 2 and w not in stop and not w.isdigit():
                    word_counter[w] += 1

        top_words = word_counter.most_common(8)

        total_cmt = sum(s[4] or 0 for s in songs)
        song_count = cur.execute("SELECT COUNT(*) FROM songs WHERE year=?", (year,)).fetchone()[0]

        raw_data.append({
            "year": year,
            "song_count": song_count,
            "total_cmt": total_cmt,
            "top_songs": [{"name": s[1], "artist": s[2], "album": s[3], "cmt": s[4], "topic": s[6]} for s in songs],
            "top_artists": [{"name": a[0], "cmt": a[1], "songs": a[2]} for a in artists],
            "top_topics": [{"name": t[0], "cnt": t[1]} for t in topics],
            "top_words": [{"word": w, "count": c} for w, c in top_words],
        })

    # 统计每个歌手出现的年份次数（用于黑马检测）
    all_artists = {}
    for d in raw_data:
        for a in d['top_artists']:
            all_artists[a['name']] = all_artists.get(a['name'], 0) + 1

    # 第二遍：生成点评
    result = []
    for idx, d in enumerate(raw_data):
        comment = generate_commentary(d['year'], idx, d, raw_data, all_artists)
        d['comment'] = comment
        result.append(d)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"导出 {len(result)} 年报告 → {OUT}")
    for r in result:
        print(f"  {r['year']}: {r['comment'][:80]}...")
    conn.close()


if __name__ == "__main__":
    main()
