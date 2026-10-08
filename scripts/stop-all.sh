#!/usr/bin/env bash
# 一键停止大数据全栈
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export HADOOP_HOME=/usr/local/hadoop
export HBASE_HOME=/usr/local/hbase
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop

echo ">>> 停止 HBase Thrift ..."
$HBASE_HOME/bin/hbase-daemon.sh stop thrift 2>/dev/null || true
echo ">>> 停止 HBase ..."
$HBASE_HOME/bin/stop-hbase.sh 2>/dev/null || true
sleep 8
# 兜底强杀仍残留的 HBase 进程
jps | grep -E "HMaster|HRegionServer|HQuorumPeer|ThriftServer" | awk '{print $1}' | xargs -r kill -9 2>/dev/null || true
echo ">>> 停止 YARN ..."
$HADOOP_HOME/sbin/stop-yarn.sh
echo ">>> 停止 HDFS ..."
$HADOOP_HOME/sbin/stop-dfs.sh

echo ">>> 剩余大数据进程："
jps | grep -vE "Jps" | sort -k2 || echo "已全部停止"
