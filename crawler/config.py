# -*- coding: utf-8 -*-
"""爬虫配置：范围、限频、评论上限、HDFS 路径、数据伦理参数。

数据伦理说明：
  - 仅抓取网易云音乐公开数据（歌曲信息、歌词、匿名化的公开评论）。
  - 评论数据移除用户身份字段（昵称、userId、头像等），仅保留文本/点赞/时间。
  - 限定抓取频率（REQUEST_INTERVAL）与单曲评论上限（COMMENT_LIMIT_PER_SONG）。
  - 遵守 robots.txt，仅访问公开 API，不绕过任何访问控制。
"""

# ---------------- 抓取范围 ----------------
# 主策略：从"歌单广场"按多个华语向分类自动发现数千个歌单 → 汇总去重成歌池
SEED_CATEGORY = "华语"        # 单分类兜底
# 多分类轮扫（细分分类带来大量独特歌曲，突破单分类去重上限）
SEED_CATEGORIES = [
    "华语", "粤语", "流行", "说唱", "摇滚", "民谣", "古风", "电子",
    "经典", "怀旧", "网络歌曲", "KTV", "伤感", "治愈", "思念", "甜蜜",
    "青春", "校园", "80后", "90后", "00后", "夜晚", "学习", "睡前",
]
MAX_PLAYLISTS_PER_CAT = 150   # 每个分类发现多少歌单
MAX_SEED_PLAYLISTS = 4000     # 全部分类合计歌单上限
SONG_POOL_FILE = "/home/hadoop/workspace/coudes/data/song_pool.json"

# 兜底：网易云官方榜单 / 热门歌单 ID（公开）
SEED_PLAYLISTS = [
    3778678,    # 热歌榜
    3779629,    # 新歌榜
    19723756,   # 飙升榜
    2884035,    # 原创榜
    991319590,  # 华语金曲
    2250011882, # 经典老歌
]

# 每个歌单最多取多少首歌
MAX_SONGS_PER_PLAYLIST = 200
# 全局歌曲总上限（50k 试水；存储 ~2GB，断点续爬可随时停）
MAX_TOTAL_SONGS = 50000

# ---------------- 评论上限（存储控制策略）----------------
COMMENT_LIMIT_PER_SONG = 50   # 每首歌评论上限；设为页大小，使评论一次请求取回（提速）
COMMENT_PAGE_SIZE = 50

# ---------------- 并发 + 限频（提速 + 受控礼貌）----------------
MAX_WORKERS = 6              # 并发线程数（温和档，兼顾提速与封 IP 风险）
DETAIL_BATCH = 50           # song/detail 一次批量取多少首
REQUEST_INTERVAL = 0.3      # 每次请求礼貌间隔（秒），并发下为每线程间隔
REQUEST_TIMEOUT = 12
MAX_RETRY = 3
RETRY_BACKOFF = 2.0

# ---------------- 请求头 ----------------
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0 Safari/537.36"),
    "Referer": "https://music.163.com/",
}

# ---------------- 网易云公开 API ----------------
API_BASE = "https://music.163.com/api"
# v6 接口返回完整 trackIds（旧 playlist/detail 只返回前 10 首，是规模瓶颈）
URL_PLAYLIST = API_BASE + "/v6/playlist/detail?id={pid}&n=1000"
URL_SONG_DETAIL = API_BASE + "/song/detail/?ids=%5B{sid}%5D"
URL_LYRIC = API_BASE + "/song/lyric?id={sid}&lv=1&kv=1&tv=-1"
URL_COMMENTS = API_BASE + "/v1/resource/comments/R_SO_4_{sid}?limit={limit}&offset={offset}"
URL_ARTIST = API_BASE + "/artist/{aid}"   # 歌手热门歌曲/简介

# ---------------- 本地 & HDFS 路径 ----------------
LOCAL_RAW_DIR = "/home/hadoop/workspace/coudes/data/raw"
CHECKPOINT_FILE = "/home/hadoop/workspace/coudes/data/.checkpoint.json"

HDFS_RAW_DIR = "/netease/raw"          # 原始 JSON 根目录
HDFS_SONG = HDFS_RAW_DIR + "/song"
HDFS_LYRIC = HDFS_RAW_DIR + "/lyric"
HDFS_COMMENT = HDFS_RAW_DIR + "/comment"
HDFS_ARTIST = HDFS_RAW_DIR + "/artist"
