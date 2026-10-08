# 云律 · 华语乐坛数字档案馆

> 大数据架构课程设计 | 全流程：采集 → 存储 → MapReduce → MLlib → HBase → MySQL → 检索 → 可视化

基于网易云音乐公开数据（67,926 首歌曲、15,831 位歌手、47,250 条歌词、3,532,618 条匿名评论），构建集**数据采集 → 分布式存储 → MapReduce 批处理 → Spark MLlib 聚类 → HBase/MySQL 存储 → FTS5 全文检索 → React 可视化**于一体的大数据平台。

## 技术栈

| 层 | 组件 | 版本 |
|----|------|------|
| 采集 | Python 3.10 (urllib + jieba) | — |
| 分布式存储 | Hadoop HDFS (伪分布式) | 3.3.6 |
| 批处理 | Hadoop Streaming MapReduce | 3.3.6 |
| 计算引擎 | Spark (PySpark + SQL + MLlib) | 3.5.8 |
| 列族存储 | HBase (4 表, 1,739,378 行) | 2.5.13 |
| 关系存储 | MySQL (yueping 库, 5 表) | 8.0.46 |
| 全文检索 | SQLite + FTS5 + jieba 分词 | 3.37 |
| 后端 | Node.js + Express | 18.20 / 4.22 |
| 前端 | React + TypeScript + Ant Design + ECharts | 18.3 / 5.9 / 5.29 / 5.6 |
| 构建 | Vite | 6.4 |

## 快速开始

```bash
# 启动大数据组件 (Hadoop + HBase + Spark)
bash scripts/start-all.sh

# 启动 Web 服务
cd web && npm install && node server.js
# → http://localhost:3000
```

## 功能总览 (11 个视图)

| 分类 | 视图 | 功能 |
|------|------|------|
| **数据库** | 歌曲 / 歌手 / 歌词 / 评论 | 四维复合检索 + FTS5 全文搜索 + 高亮片段 |
| **分析** | 榜单 / 点歌 | 歌曲/歌手/高频词三排行榜 + MapReduce 词频 + 聚类筛选 + 跨主题推荐 |
| **创新** | 专辑 / 年报 / 创作 / **地图** | 专辑概念度排行 / 57 年年报智能点评 / 十三辙韵律辅助 / 中国地图地名热力 |
| **社区** | 我推 | 收藏夹 CRUD + 逐行歌词多选 + 社区广场 |

## 数据规模

| 数据集 | 数量 | 存储 |
|--------|------|------|
| 歌曲 | 67,926 首 | HDFS + SQLite + HBase |
| 歌手 | 15,831 位 | HDFS + HBase |
| 歌词 | 47,250 条 (含分词) | HDFS + SQLite FTS5 + HBase |
| 评论 | 3,532,618 条 (匿名) | HDFS + SQLite FTS5 + HBase |
| 清洗后清洁歌词 | 1,954,924 行纯中文 | HDFS + lyrics_clean FTS5 |

## 课程要求全覆盖

| 要求 | 状态 | 实现 |
|------|:--:|------|
| Linux | ✅ | Ubuntu 22.04.5 LTS |
| Hadoop/HDFS | ✅ | 757MB 原始 + 301MB 清洗 Parquet |
| MapReduce | ✅ | 195 万行 → 113 万中文词 (2M+2R) |
| Spark/MLlib | ✅ | KMeans 全量 67,926 首 (Silhouette=0.6564) |
| HBase | ✅ | 4 表 174 万行 |
| MySQL | ✅ | 8.0.46 + yueping 库 5 表 |
| Node.js | ✅ | Express 4.22 + 30+ API |
| ≥5 种工具 | ✅ | **8 种** |
| 伪分布式 | ✅ | Hadoop 伪分布式模式 |

## 目录结构

```
coudes/
├── crawler/              # 数据采集
│   ├── config.py         #   限频/断点/评论上限/匿名化参数
│   └── netease.py        #   爬虫主程序 (v1 专辑接口 → HDFS)
├── spark/                # Spark 作业
│   ├── preprocess.py     #   数据清洗预处理
│   └── ...
├── spark_kmeans.py       # Spark MLlib KMeans 全量聚类
├── web/                  # 前端 + 后端
│   ├── server.js         #   Express REST API (30+ 端点, JWT 认证)
│   ├── search.db         #   SQLite FTS5 检索库 (607 MB)
│   ├── user.db           #   用户系统数据库
│   ├── mysql_schema.sql  #   MySQL 建库建表脚本
│   ├── year_report.py    #   年报生成 (6 维智能点评)
│   ├── rank_export.py    #   歌曲/歌手排行导出
│   ├── word_freq.py      #   高频词统计 (Python 版)
│   ├── album_export.py   #   专辑概念度排行
│   ├── rhyme_export.py   #   十三辙韵律标注
│   ├── data/             #   40+ 聚合 JSON 文件
│   │   ├── year_report.json          # 57 年年报数据
│   │   ├── kmeans_clusters.json      # 67,926 首聚类结果
│   │   ├── mr_wordcount.json         # MapReduce 中文词频 Top 200
│   │   ├── lyric_places.json         # 100 个地名频次
│   │   ├── rank_songs_all.json       # 歌曲总榜 Top 100
│   │   └── ...
│   ├── public/
│   │   └── china.json     #   中国地图 GeoJSON
│   └── src/               #   React 前端
│       ├── App.tsx        #   主布局 + 11 视图路由
│       ├── theme.ts       #   亮/暗主题 Token
│       ├── api/           #   fetchJSON + useQuery hooks
│       ├── context/       #   ThemeContext + DrawerContext
│       ├── components/    #   TabNav / SongDna / AddToCollectionBtn / Pager
│       ├── drawers/       #   SongDetail / ArtistDetail / LyricDetail / AlbumDetail
│       └── views/         #   11 个功能视图
├── hbase/                 # HBase 建表脚本
├── data/                  # 原始数据 (raw JSONL) + 爬虫检查点
├── scripts/               # start-all / stop-all / healthcheck
└── run_pipeline.sh        # 一键全流程
```

## 数据伦理

- 仅抓取公开数据，评论移除全部用户身份字段（昵称/userId/头像）后存储
- 限频（REQUEST_INTERVAL=0.6s）+ 指数退避 + 断点续爬 + 单曲评论上限
- 遵守 robots.txt，仅访问公开 API，不绕过任何访问控制

## HDFS 数据布局

| 路径 | 格式 | 大小 | 内容 |
|------|------|------|------|
| `/netease/raw/song/` | JSONL | 24.5 MB | 67,926 首歌曲原始信息 |
| `/netease/raw/artist/` | JSONL | 13.4 MB | 15,831 位歌手 |
| `/netease/raw/comment/` | JSONL | 641.5 MB | 3,532,618 条匿名评论 |
| `/netease/raw/lyric/` | JSONL | 113.6 MB | 47,250 条歌词 |
| `/netease/clean/` | Parquet | 301 MB | 18 个清洗后数据文件 |
| `/netease/output/wordcount_cn/` | Text | — | MapReduce 词频结果 |
| `/netease/output/kmeans_full/` | JSON | — | KMeans 聚类结果 |

## HBase 表设计

| 表 | RowKey | 列族 | 行数 |
|----|--------|------|------|
| `netease:song` | song_id | content / nlp | 28,795 |
| `netease:lyric` | song_id | info / profile | 11,847 |
| `netease:artist` | artist_id | info / profile | 15,831 |
| `netease:comment` | song_id_timestamp_seq | c | 1,683,736 |

## MySQL 表设计 (yueping)

| 表 | 内容 | 来源 |
|----|------|------|
| `rank_songs` | 歌曲排行 Top 100 | Spark SQL |
| `rank_artists` | 歌手排行 Top 100 | Spark SQL |
| `word_count` | MapReduce 词频 Top 200 | Hadoop Streaming |
| `song_clusters` | KMeans 聚类结果 | Spark MLlib |
| `year_reports` | 57 年年报数据 | year_report.py |

## 架构说明

系统采用 **HDFS + HBase + MySQL + SQLite** 四层异构存储：

- **HDFS**：原始 JSONL 与清洗 Parquet 的分布式高吞吐存储（757 MB + 301 MB）
- **HBase**：明细数据的快速随机读取（RowKey 设计，4 表 174 万行）
- **MySQL**：聚合结果的结构化查询与 JOIN 关联（5 张结果表）
- **SQLite FTS5**：歌词与评论的全文检索与高亮片段召回（607 MB，jieba 分词）

整体遵循 Lambda 架构：Batch Layer（HDFS + Spark + MapReduce）→ Serving Layer（SQLite FTS5 + 聚合 JSON）→ 前端 React 可视化。
