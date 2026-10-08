"""从 lyrics_fts 统计全歌词词频，导出 word_freq.json。
统计所有歌词中每个 jieba 分词的出现次数，过滤停用词和单字词。
用法：python3 word_freq.py
输出：web/data/word_freq.json（Top 500 高频词）
"""
import sqlite3, json, os
from collections import Counter

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT = "/home/hadoop/workspace/coudes/web/data/word_freq.json"

# 基础停用词
STOP = set("""
的 了 是 在 我 你 他 她 它 们 这 那 不 也 就 都 还 要 会 可 把 被 让 给 对 从 到 和 与 或 但 而 虽 却 因 为 所 以 能 着 过 之 又 很 太 更 最 啊 吧 呢 吗 哦 嗯 呀 哟 呵 哈 嘛 啦 噢
一 二 三 四 五 六 七 八 九 十 百 千 万 亿
个 些 里 中 上 下 前 后 左 右 大 小 多 少 长 短 高 低 远 近
来 去 看 说 想 做 走 听 没有 知道 觉得 还是 已经 可以 没有 如果 因为 所以 但是 虽然 不过 然后
""".split())

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    # 读取所有歌词的 jieba 分词（words 列），空格分隔
    cur.execute("SELECT words FROM lyrics_fts WHERE words IS NOT NULL AND words != ''")
    counter = Counter()
    total = 0
    for (words,) in cur:
        for w in words.split():
            w = w.strip()
            if len(w) >= 2 and w not in STOP and not w.isdigit():
                counter[w] += 1
        total += 1
        if total % 5000 == 0:
            print(f"  已处理 {total} 首歌词，暂有 {len(counter)} 个不重复词...")

    top = counter.most_common(500)
    result = [{"word": w, "count": c} for w, c in top]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"导出 Top500 高频词 → {OUT}")
    for w, c in top[:15]:
        print(f"  {w}: {c}")
    conn.close()

if __name__ == "__main__":
    main()
