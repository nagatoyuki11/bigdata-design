#!/usr/bin/env bash
# 一键启动大数据全栈：HDFS + YARN + HBase + HBase Thrift
set -e
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export HADOOP_HOME=/usr/local/hadoop
export HBASE_HOME=/usr/local/hbase
export SPARK_HOME=/usr/local/spark
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop

echo ">>> 启动 HDFS ..."
$HADOOP_HOME/sbin/start-dfs.sh
echo ">>> 启动 YARN ..."
$HADOOP_HOME/sbin/start-yarn.sh
echo ">>> 退出 HDFS 安全模式(若有) ..."
$HADOOP_HOME/bin/hdfs dfsadmin -safemode leave >/dev/null 2>&1 || true
echo ">>> 启动 HBase ..."
$HBASE_HOME/bin/start-hbase.sh
echo ">>> 等待 HBase Master 初始化 (20s) ..."
sleep 20
echo ">>> 启动 HBase Thrift (端口 9090, 供 Python happybase) ..."
$HBASE_HOME/bin/hbase-daemon.sh start thrift

echo ">>> 当前进程："
jps | grep -vE "Jps" | sort -k2
echo ">>> 完成。Web UI: HDFS http://master:9870  YARN http://master:8088  HBase http://master:16010"
