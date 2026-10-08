# -*- coding: utf-8 -*-
"""Spark 作业共享工具：SparkSession、jieba 分词、停用词、HBase 写入、JSON 导出。

HBase 写入策略：通过 happybase 连接 HBase Thrift (localhost:9090)，
在 foreachPartition 中每分区开一个连接批量写，适配伪分布式单机部署。
"""
import os
import json

STOPWORDS_PATH = "/home/hadoop/workspace/coudes/data/stopwords.txt"
WEB_DATA_DIR = "/home/hadoop/workspace/coudes/web/data"
THRIFT_HOST = "127.0.0.1"
THRIFT_PORT = 9090

HDFS_RAW = "/netease/raw"


# --------------------------------------------------------------------------
# SparkSession
# --------------------------------------------------------------------------
def get_spark(app_name, master=None):
    from pyspark.sql import SparkSession
    b = SparkSession.builder.appName(app_name)
    b = b.master(master or os.environ.get("SPARK_MASTER", "local[*]"))
    b = b.config("spark.sql.shuffle.partitions", "8")
    b = b.config("spark.ui.showConsoleProgress", "false")
    spark = b.getOrCreate()
    spark.sparkContext.setLogLevel("ERROR")
    return spark


# --------------------------------------------------------------------------
# 停用词 + jieba 分词
# --------------------------------------------------------------------------
_STOP = None


def load_stopwords():
    global _STOP
    if _STOP is None:
        s = set()
        if os.path.exists(STOPWORDS_PATH):
            with open(STOPWORDS_PATH, encoding="utf-8") as f:
                for ln in f:
                    w = ln.strip()
                    if w:
                        s.add(w)
        _STOP = s
    return _STOP


def tokenize(text):
    """jieba 分词 + 停用词过滤 + 仅保留中文/字母词、长度>=2。返回空格分隔串。"""
    import jieba
    import re
    if not text:
        return ""
    text = re.sub(r"[^一-龥a-zA-Z]+", " ", text)
    stop = load_stopwords()
    out = []
    for w in jieba.cut(text):
        w = w.strip().lower()
        if len(w) >= 2 and w not in stop:
            out.append(w)
    return " ".join(out)


def register_tokenize_udf(spark):
    from pyspark.sql.functions import udf
    from pyspark.sql.types import StringType
    u = udf(tokenize, StringType())
    spark.udf.register("tokenize", u)
    return u


# --------------------------------------------------------------------------
# HBase 写入（happybase, foreachPartition）
# --------------------------------------------------------------------------
def write_hbase(df, table, rowkey_col, col_map):
    """把 DataFrame 写入 HBase。
    table     : 表名（如 'netease:song'）
    rowkey_col: 作为 rowkey 的列名
    col_map   : {df列名: 'cf:qualifier'}
    低内存机器可设 SKIP_HBASE=1 跳过全部 HBase 写入（结果以 JSON/parquet 导出）。
    """
    if os.environ.get("SKIP_HBASE"):
        print("  [HBase] (SKIP_HBASE) 跳过写 %s" % table)
        return 0
    cols = list(col_map.items())

    def _part(rows):
        import happybase
        conn = happybase.Connection(THRIFT_HOST, THRIFT_PORT, timeout=30000)
        try:
            tbl = conn.table(table)
            bat = tbl.batch(batch_size=200)
            n = 0
            for r in rows:
                rk = r[rowkey_col]
                if rk is None:
                    continue
                data = {}
                for src, dst in cols:
                    v = r[src]
                    if v is None:
                        continue
                    data[dst.encode()] = str(v).encode("utf-8")
                if data:
                    bat.put(str(rk).encode("utf-8"), data)
                    n += 1
            bat.send()
            yield n
        finally:
            conn.close()

    total = df.rdd.mapPartitions(_part).sum()
    print("  [HBase] 写入 %s : %d 行" % (table, total))
    return total


# --------------------------------------------------------------------------
# JSON 导出（供 Node 可视化大屏读取；HBase 为权威存储，此为只读缓存）
# --------------------------------------------------------------------------
def export_json(name, obj):
    os.makedirs(WEB_DATA_DIR, exist_ok=True)
    path = os.path.join(WEB_DATA_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    print("  [export] %s (%d bytes)" % (name, os.path.getsize(path)))


def rows_to_dicts(df, limit=None):
    if limit:
        df = df.limit(limit)
    return [r.asDict() for r in df.collect()]


# --------------------------------------------------------------------------
# 情感 / 情绪词典（用于弱监督打标 + 情绪点歌标签）
# --------------------------------------------------------------------------
LEX_POS = set("喜欢 爱 开心 快乐 幸福 温暖 美好 治愈 感动 希望 阳光 甜 棒 赞 优秀 "
              "好听 喜爱 满足 期待 美 享受 舒服 惊艳 完美 nice 爱了 单曲循环".split())
LEX_NEG = set("难过 伤心 痛 哭 泪 孤独 失望 后悔 遗憾 累 烦 讨厌 差 烂 无聊 "
              "崩溃 绝望 痛苦 心碎 想哭 emo 抑郁 焦虑 害怕 恶心 失眠".split())
# 情绪标签词典（情绪点歌用）
EMOTION_LEX = {
    "治愈": set("治愈 温暖 阳光 希望 美好 温柔 拥抱 陪伴 安心 释怀 力量".split()),
    "emo": set("孤独 难过 想哭 失眠 崩溃 心碎 emo 抑郁 深夜 眼泪 想念 后悔".split()),
    "励志": set("奋斗 梦想 坚持 努力 远方 拼搏 勇敢 前行 不放弃 光芒 未来".split()),
    "甜蜜": set("喜欢 爱你 甜 心动 想见 拥抱 牵手 浪漫 告白 在一起".split()),
    "怀旧": set("青春 当年 回忆 曾经 时光 那年 长大 毕业 故乡 老歌 童年".split()),
}
# 催泪/故事型评论关键词
TEAR_LEX = set("哭 泪 眼泪 去世 离开 分手 想起 怀念 已经不在 走了 妈妈 爸爸 "
               "外婆 奶奶 爷爷 前任 异地 错过 遗憾 对不起 再也".split())


def lexicon_label(words):
    """根据分词结果用词典打弱标签：返回 (sentiment 0/1, pos_cnt, neg_cnt)。
    1=正向, 0=负向。pos==neg 时按 1（中性偏正）。"""
    if not words:
        return 1, 0, 0
    ws = words.split()
    p = sum(1 for w in ws if w in LEX_POS)
    n = sum(1 for w in ws if w in LEX_NEG)
    return (0 if n > p else 1), p, n


def emotion_tags(words):
    """返回命中的情绪标签列表（按命中数排序）。"""
    if not words:
        return []
    ws = words.split()
    score = {}
    for tag, lex in EMOTION_LEX.items():
        c = sum(1 for w in ws if w in lex)
        if c > 0:
            score[tag] = c
    return [t for t, _ in sorted(score.items(), key=lambda x: -x[1])]


def tear_score(content, words):
    """催泪分：故事关键词命中数 + 文本长度加权。"""
    if not content:
        return 0
    ws = (words or "").split()
    hit = sum(1 for w in ws if w in TEAR_LEX)
    length_bonus = min(len(content) / 50.0, 3.0)   # 长评论更可能是故事型
    return round(hit + length_bonus, 2) if hit > 0 else 0.0


def sentiment_3class(score):
    """情感得分(0~1) → 三分类标签：负向/中性/正向。"""
    if score is None:
        return "中性"
    if score < 0.4:
        return "负向"
    if score > 0.6:
        return "正向"
    return "中性"


# --------------------------------------------------------------------------
# 主题词典（LDA 主题自动命名）
# --------------------------------------------------------------------------
THEME_LEX = {
    "爱情甜蜜": set("爱 喜欢 想你 爱你 心动 牵手 拥抱 浪漫 告白 在一起 亲爱 宝贝 恋人 心跳".split()),
    "离别思念": set("离开 再见 分手 想念 思念 错过 遗憾 回忆 曾经 怀念 等待 远方 走了 告别".split()),
    "孤独emo": set("孤独 一个人 寂寞 深夜 眼泪 难过 沉默 心碎 失眠 黑夜 冷 痛 空".split()),
    "励志成长": set("梦想 坚持 努力 奋斗 远方 勇敢 前行 光 未来 相信 路 飞 翅膀 力量 青春".split()),
    "怀旧青春": set("青春 年少 当年 那年 校园 毕业 长大 时光 童年 故乡 操场 少年 夏天".split()),
    "人生哲思": set("人生 生活 世界 时间 命运 自由 选择 故事 答案 意义 岁月 风 路过".split()),
    "江湖国风": set("江湖 天下 红尘 烟雨 故人 长安 山河 剑 月 醉 千年 古 风华".split()),
}


def label_topic(top_words):
    """根据主题 top 词匹配主题词典，给主题贴中文名。
    top_words: 词列表。返回 (主题名, 命中分)。"""
    if not top_words:
        return "其他", 0
    ws = set(top_words)
    best, best_score = "综合主题", 0
    for name, lex in THEME_LEX.items():
        score = len(ws & lex)
        if score > best_score:
            best_score, best = score, name
    return best, best_score


def chinese_ratio(text):
    """中文字符占比（用于华语过滤）。"""
    if not text:
        return 0.0
    import re
    han = len(re.findall(r"[一-龥]", text))
    total = len(re.findall(r"[一-龥a-zA-ZЀ-ӿ぀-ヿ]", text))
    return han / total if total else 0.0
