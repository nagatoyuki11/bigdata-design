#!/usr/bin/env bash
# 创建五张 HBase 表（模块设计见 项目方案.md 第五节）
# song / lyric / comment / artist / tag
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export HADOOP_HOME=/usr/local/hadoop
export HBASE_HOME=/usr/local/hbase
export HADOOP_CONF_DIR=$HADOOP_HOME/etc/hadoop

echo ">>> 创建 HBase 五张表 ..."
$HBASE_HOME/bin/hbase shell -n <<'EOF'
create_namespace 'netease' rescue nil

# song: 歌曲基本信息 + 统计
create 'netease:song',  {NAME=>'info', VERSIONS=>1}, {NAME=>'stat', VERSIONS=>1}

# lyric: 歌词原文 + NLP 结果
create 'netease:lyric', {NAME=>'content', VERSIONS=>1}, {NAME=>'nlp', VERSIONS=>1}

# comment: 匿名评论文本 + 情感标签
create 'netease:comment', {NAME=>'c', VERSIONS=>1}

# artist: 歌手简介 + 画像
create 'netease:artist', {NAME=>'info', VERSIONS=>1}, {NAME=>'profile', VERSIONS=>1}

# tag: 歌曲情绪/主题标签 + 推荐特征向量
create 'netease:tag', {NAME=>'t', VERSIONS=>1}

list_namespace_tables 'netease'
EOF
echo ">>> 完成。"
