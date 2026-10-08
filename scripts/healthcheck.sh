#!/usr/bin/env bash
# 环境健康检查：进程 / 端口 / HDFS 读写 / HBase shell / happybase
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export HADOOP_HOME=/usr/local/hadoop
export HBASE_HOME=/usr/local/hbase
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop

echo "========== 1. 进程 =========="
need="NameNode DataNode SecondaryNameNode ResourceManager NodeManager HMaster HRegionServer HQuorumPeer ThriftServer"
for p in $need; do
  if jps | grep -q " $p$"; then echo "  [OK]   $p"; else echo "  [MISS] $p"; fi
done

echo "========== 2. 端口 =========="
for hp in "HDFS:9000" "HDFS-UI:9870" "YARN-UI:8088" "HBase-UI:16010" "Thrift:9090" "ZK:2181"; do
  port=${hp#*:}; name=${hp%:*}
  if ss -ltn 2>/dev/null | grep -q ":$port"; then echo "  [OK]   $name ($port)"; else echo "  [MISS] $name ($port)"; fi
done

echo "========== 3. HDFS 读写 =========="
echo "hello $(cat /proc/sys/kernel/random/uuid)" > /tmp/_hc.txt
$HADOOP_HOME/bin/hdfs dfs -mkdir -p /tmp/_hc 2>/dev/null \
 && $HADOOP_HOME/bin/hdfs dfs -put -f /tmp/_hc.txt /tmp/_hc/ 2>/dev/null \
 && $HADOOP_HOME/bin/hdfs dfs -cat /tmp/_hc/_hc.txt >/dev/null 2>&1 \
 && $HADOOP_HOME/bin/hdfs dfs -rm -r /tmp/_hc >/dev/null 2>&1 \
 && echo "  [OK]   HDFS 读写正常" || echo "  [FAIL] HDFS 读写异常"

echo "========== 4. happybase -> HBase Thrift =========="
python3 - <<'PY' 2>/dev/null
import happybase, sys
try:
    c=happybase.Connection('127.0.0.1',9090,timeout=15000); c.open()
    _=c.tables(); c.close()
    print("  [OK]   happybase 连接正常")
except Exception as e:
    print("  [FAIL] happybase:", type(e).__name__)
PY
echo "========== 完成 =========="
