"""按十三辙体系重构押韵词库。
核心规则：同辙 = 忽略韵头（介音），只看韵腹+韵尾。
单押按辙分组，双押按（辙1, 辙2）分组。
同时导出字→(韵母, 辙, 声调) 映射表。
用法：python3 rhyme_export.py
输出：web/data/rhyme_zhe.json, rhyme_double.json, char_full.json
"""
import sqlite3, json, os
from collections import defaultdict
from pypinyin import lazy_pinyin, Style

DB = "/home/hadoop/workspace/coudes/web/search.db"
OUT_ZHE = "/home/hadoop/workspace/coudes/web/data/rhyme_zhe.json"
OUT_DOUBLE = "/home/hadoop/workspace/coudes/web/data/rhyme_double.json"
OUT_CHAR = "/home/hadoop/workspace/coudes/web/data/char_full.json"

# ── 十三辙映射：韵母 → 辙名 ──
FINAL_TO_ZHE = {
    'a': '发花辙', 'ia': '发花辙', 'ua': '发花辙',
    'o': '梭波辙', 'e': '梭波辙', 'uo': '梭波辙',
    'ie': '乜斜辙', 'ue': '乜斜辙', 'üe': '乜斜辙',
    'u': '姑苏辙',
    'i': '一七辙', 'v': '一七辙', 'ü': '一七辙', 'er': '一七辙',
    'ai': '怀来辙', 'uai': '怀来辙',
    'ei': '灰堆辙', 'ui': '灰堆辙', 'uei': '灰堆辙',
    'ao': '遥条辙', 'iao': '遥条辙',
    'ou': '由求辙', 'iu': '由求辙', 'iou': '由求辙',
    'an': '言前辙', 'ian': '言前辙', 'uan': '言前辙', 'üan': '言前辙',
    'en': '人辰辙', 'in': '人辰辙', 'un': '人辰辙', 'ün': '人辰辙', 'uen': '人辰辙',
    'ang': '江阳辙', 'iang': '江阳辙', 'uang': '江阳辙',
    'eng': '中东辙', 'ing': '中东辙', 'ueng': '中东辙', 'ong': '中东辙', 'iong': '中东辙',
}

def get_final(char):
    try:
        py = lazy_pinyin(char, style=Style.FINALS, strict=False)
        return py[0] if py and py[0] else ''
    except:
        return ''

def get_tone(char):
    """获取声调：1=阴平 2=阳平 3=上声 4=去声 0=轻声"""
    try:
        py = lazy_pinyin(char, style=Style.TONE3, neutral_tone_with_five=True, strict=False)
        if py and py[0]:
            # Style.TONE3 gives "ni3" format
            import re
            m = re.search(r'(\d)$', py[0])
            return int(m.group(1)) if m else 0
    except:
        pass
    return 0

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT words FROM lyrics_fts WHERE words IS NOT NULL AND words != ''")

    zhe_groups = defaultdict(lambda: defaultdict(int))    # 辙 → {word: count}
    double_groups = defaultdict(lambda: defaultdict(int))  # 辙1_辙2 → {word: count}
    char_info = {}  # 字 → {final, zhe, tone}

    stop = set("的 了 是 在 我 你 他 她 它 们 这 那 不 也 就 都 还 要 会 可 把 被 让 给 对 从 到 和 与 或 但 而 虽 却 因 为 所 以 能 着 过 之 又 很 太 更 最 啊 吧 呢 吗 哦 嗯 呀 哟 呵 哈 嘛 啦 噢 一 二 三 四 五 六 七 八 九 十 百 千 万 亿 个 些 里 中 上 下 前 后 左 右 大 小 多 少 长 短 高 低 远 近 来 去 看 说 想 做 走 听".split())

    total = 0
    for (words,) in cur:
        for w in words.split():
            w = w.strip()
            if len(w) < 2 or w in stop or w.isdigit(): continue
            # 收集字信息
            for ch in w:
                if ch not in char_info and '\u4e00' <= ch <= '\u9fff':
                    f = get_final(ch)
                    if f:
                        z = FINAL_TO_ZHE.get(f, '其他')
                        t = get_tone(ch)
                        char_info[ch] = {"final": f, "zhe": z, "tone": t}
            # 单押：按辙归类
            final1 = get_final(w[-1])
            if final1:
                z1 = FINAL_TO_ZHE.get(final1, '其他')
                zhe_groups[z1][w] += 1
            # 双押：最后两字的辙组合
            if len(w) >= 2:
                fa = get_final(w[-2]); fb = get_final(w[-1])
                if fa and fb:
                    za = FINAL_TO_ZHE.get(fa, '?'); zb = FINAL_TO_ZHE.get(fb, '?')
                    double_groups[f"{za}|{zb}"][w] += 1
        total += 1
        if total % 5000 == 0:
            print(f"  已处理 {total} 首，字 {len(char_info)}，辙组 {len(zhe_groups)}，双押 {len(double_groups)}...")

    # 转换输出
    zhe_result = []
    for zhe, words in zhe_groups.items():
        sorted_w = sorted(words.items(), key=lambda x: -x[1])[:50]
        zhe_result.append({"zhe": zhe, "words": [{"word": w, "count": c} for w, c in sorted_w]})
    zhe_result.sort(key=lambda x: -sum(w["count"] for w in x["words"]))

    double_result = []
    for key, words in double_groups.items():
        if len(words) >= 2:
            sorted_w = sorted(words.items(), key=lambda x: -x[1])[:30]
            double_result.append({"key": key, "words": [{"word": w, "count": c} for w, c in sorted_w]})
    double_result.sort(key=lambda x: -sum(w["count"] for w in x["words"]))

    os.makedirs(os.path.dirname(OUT_ZHE), exist_ok=True)
    with open(OUT_ZHE, "w", encoding="utf-8") as f: json.dump(zhe_result, f, ensure_ascii=False)
    with open(OUT_DOUBLE, "w", encoding="utf-8") as f: json.dump(double_result, f, ensure_ascii=False)
    with open(OUT_CHAR, "w", encoding="utf-8") as f: json.dump(char_info, f, ensure_ascii=False)

    print(f"\n导出 {len(zhe_result)} 个辙 → {OUT_ZHE}")
    print(f"导出 {len(double_result)} 双押组 → {OUT_DOUBLE}")
    print(f"导出 {len(char_info)} 字信息 → {OUT_CHAR}")
    for r in zhe_result:
        ws = " ".join(w["word"] for w in r["words"][:4])
        print(f"  {r['zhe']}: {ws}...")
    # 测试关键区别
    for tc in ['深渊', '感觉', '有人', '天边', '心情']:
        c1, c2 = tc[0], tc[1]
        i1 = char_info.get(c1, {})
        i2 = char_info.get(c2, {})
        z1 = i1.get('zhe', '?'); z2 = i2.get('zhe', '?')
        print(f"  '{tc}' → {z1}|{z2} (韵母: {i1.get('final','?')}|{i2.get('final','?')})")
    conn.close()

if __name__ == "__main__":
    main()
