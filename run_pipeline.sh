#!/usr/bin/env bash
# 一键运行全流程：采集 → HDFS → Spark 预处理 → 统计 → 情感 → 主题 → ML 应用
# 用法:
#   bash run_pipeline.sh crawl     # 仅采集并上传 HDFS
#   bash run_pipeline.sh spark      # 仅跑 Spark 全部作业（采集后）
#   bash run_pipeline.sh all        # 采集 + Spark 全流程
#   bash run_pipeline.sh web        # 启动可视化大屏
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export HADOOP_HOME=/usr/local/hadoop
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop
export SPARK_HOME=/usr/local/spark

# ---- 单机内存安全默认值（本机仅 3.8G 内存，处理百万评论会 OOM）----
# 均可在外部 export 覆盖。大内存机器可关掉这些以处理全量评论 + 全量写 HBase。
export DRIVER_MEM="${DRIVER_MEM:-1g}"                 # Spark driver 堆
export SPARK_MASTER="${SPARK_MASTER:-local[2]}"       # 本地 2 线程
export COMMENT_SAMPLE_FRAC="${COMMENT_SAMPLE_FRAC:-0.15}"  # 评论抽样比例(NLP)
export SKIP_COMMENT_HBASE="${SKIP_COMMENT_HBASE:-1}"  # 跳过百万级评论逐条写HBase(其余表正常写)

run_crawl() {
  echo "=========== ① 数据采集（华语歌单广场 → 歌池 → 并发抓取） ==========="
  python3 crawler/discover.py
  python3 crawler/netease.py --to-hdfs
}

run_spark() {
  echo "=========== ② 预处理（清洗+分词） ==========="
  bash spark/submit.sh preprocess.py
  echo "=========== ③ 统计分析 ==========="
  bash spark/submit.sh stats.py
  echo "=========== ④ 情感分析（MLlib） ==========="
  bash spark/submit.sh sentiment.py
  echo "=========== ⑤ 主题挖掘（LDA+KMeans） ==========="
  bash spark/submit.sh topic_lda.py
  echo "=========== ⑥ ML 应用（预测+推荐+画像） ==========="
  bash spark/submit.sh predict.py
  echo "=========== ⑦ 歌手合作网络（PageRank+社群发现） ==========="
  bash spark/submit.sh graph.py
  echo "=========== ⑧ 歌词意象地图（地名意象提取） ==========="
  bash spark/submit.sh imagery.py
  echo "=========== ⑨ 年代时光机（年度高频词+热歌） ==========="
  bash spark/submit.sh era.py
  echo "=========== ⑩ 构建检索库（SQLite + FTS5 全文索引） ==========="
  bash spark/submit.sh searchdb.py
  echo "=========== 全部 Spark 作业完成 ==========="
}

run_web() {
  echo "=========== 启动可视化大屏 http://localhost:3000 ==========="
  cd web && PORT=${PORT:-3000} node server.js
}

case "${1:-all}" in
  crawl) run_crawl ;;
  spark) run_spark ;;
  web)   run_web ;;
  all)   run_crawl; run_spark; echo ">>> 完成。运行 'bash run_pipeline.sh web' 查看大屏" ;;
  *) echo "用法: bash run_pipeline.sh [crawl|spark|web|all]"; exit 1 ;;
esac
