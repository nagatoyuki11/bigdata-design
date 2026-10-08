"""从 search.db 导出年代-主题情感流向数据（桑基图）。
用法：python3 emotion_flow.py
输出：web/data/emotion_flow.json
结构：{ nodes: [{name}], links: [{source, target, value}] }
"""
import sqlite3, json, os
from collections import Counter

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT = "/home/hadoop/workspace/coudes/web/data/emotion_flow.json"

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # 查询每首歌的年代桶 + 主题 + 情感标签
    rows = cur.execute("""
        SELECT year, topic_name, emotions
        FROM songs
        WHERE year IS NOT NULL AND year > 0 AND topic_name IS NOT NULL AND topic_name != ''
    """).fetchall()

    # 年代桶
    def decade(y):
        if y < 1980: return "1970s"
        if y < 1990: return "1980s"
        if y < 2000: return "1990s"
        if y < 2010: return "2000s"
        if y < 2020: return "2010s"
        return "2020s"

    # 聚合：年代 → 主题 → 歌曲数
    decade_topic = Counter()
    topic_emotion = Counter()
    for year, topic, emo in rows:
        d = decade(year)
        decade_topic[(d, topic)] += 1
        if emo:
            topic_emotion[(topic, emo)] += 1

    # 构建桑基图：年代 → 主题 → 情感
    nodes_set = set()
    links = []

    # 年代 → 主题
    for (d, t), cnt in decade_topic.items():
        nodes_set.add(d); nodes_set.add(t)
        links.append({"source": d, "target": t, "value": cnt})

    # 主题 → 情感
    for (t, e), cnt in topic_emotion.items():
        nodes_set.add(t); nodes_set.add(e)
        links.append({"source": t, "target": e, "value": cnt})

    nodes = [{"name": n} for n in sorted(nodes_set)]

    result = {"nodes": nodes, "links": links}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    print(f"导出 {len(nodes)} 节点, {len(links)} 条流向 → {OUT}")
    # Top flows
    for lk in sorted(links, key=lambda x: -x["value"])[:5]:
        print(f"  {lk['source']} → {lk['target']}: {lk['value']}")

    conn.close()

if __name__ == "__main__":
    main()
