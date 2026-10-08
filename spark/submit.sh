#!/usr/bin/env bash
# Spark 作业统一提交脚本：设置环境 + 分发 common.py 到执行器
# 用法: bash spark/submit.sh preprocess.py [--master yarn]
set -e
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export HADOOP_HOME=/usr/local/hadoop
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop
export SPARK_HOME=/usr/local/spark

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOB="$1"; shift || true
# 低内存机器(3.8G)用 local[2] + 受限 driver 内存 + 堆外溢写，避免 OOM
MASTER="${SPARK_MASTER:-local[2]}"
DRIVER_MEM="${DRIVER_MEM:-2g}"

$SPARK_HOME/bin/spark-submit \
  --master "$MASTER" \
  --driver-memory "$DRIVER_MEM" \
  --conf spark.driver.maxResultSize=512m \
  --conf spark.memory.fraction=0.6 \
  --conf spark.sql.shuffle.partitions=32 \
  --conf spark.python.worker.memory=384m \
  --py-files "$DIR/common.py" \
  --conf spark.pyspark.python=python3 \
  "$DIR/$JOB" "$@"
