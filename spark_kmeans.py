"""Spark MLlib KMeans 歌曲聚类分析
用法: spark-submit spark_kmeans.py
输入: HDFS clean parquet 或 SQLite search.db
输出: HDFS /netease/output/kmeans/ + web/data/kmeans_clusters.json
"""
import json, math, os
from pyspark.sql import SparkSession
from pyspark.ml.feature import VectorAssembler, StandardScaler, StringIndexer
from pyspark.ml.clustering import KMeans
from pyspark.ml.evaluation import ClusteringEvaluator
from pyspark.ml import Pipeline

spark = SparkSession.builder \
    .appName("SongKMeans") \
    .config("spark.sql.shuffle.partitions", "4") \
    .getOrCreate()

# 1. Load data from SQLite (via JDBC) or from parquet
# Use parquet on HDFS as per course requirement
try:
    songs = spark.read.parquet("/netease/clean/song")
    print(f"Loaded {songs.count()} songs from HDFS parquet")
except:
    # Fallback: read from SQLite via Pandas
    import sqlite3, pandas as pd
    conn = sqlite3.connect('/home/hadoop/workspace/coudes/web/search.db')
    df = pd.read_sql_query("""
        SELECT song_id, name, artist_name, year, pop, comment_total, total_liked, 
               duration_sec, topic_name
        FROM songs WHERE year IS NOT NULL AND comment_total > 0
    """, conn)
    conn.close()
    songs = spark.createDataFrame(df)
    print(f"Loaded {songs.count()} songs from SQLite")

# 2. Feature engineering
# Log-transform skewed features
from pyspark.sql.functions import col, log1p, when

songs = songs.withColumn("log_cmt", log1p(col("comment_total"))) \
             .withColumn("log_liked", log1p(col("total_liked"))) \
             .fillna({"pop": 0, "duration_sec": 240, "topic_name": "未知"})

# Encode topic_name
indexer = StringIndexer(inputCol="topic_name", outputCol="topic_idx", handleInvalid="keep")
songs = indexer.fit(songs).transform(songs)

# 3. Assemble feature vector
assembler = VectorAssembler(
    inputCols=["log_cmt", "log_liked", "pop", "duration_sec", "topic_idx"],
    outputCol="features_raw"
)

# Scale features
scaler = StandardScaler(inputCol="features_raw", outputCol="features", withStd=True, withMean=True)

pipeline = Pipeline(stages=[assembler, scaler])
model = pipeline.fit(songs)
songs_feat = model.transform(songs)

# 4. Find optimal K using Silhouette score
print("\n=== KMeans 聚类评估 ===")
best_k, best_score = 5, -1
for k in range(3, 8):
    kmeans = KMeans(featuresCol="features", k=k, seed=42, maxIter=50)
    kmodel = kmeans.fit(songs_feat)
    preds = kmodel.transform(songs_feat)
    evaluator = ClusteringEvaluator(featuresCol="features", metricName="silhouette")
    score = evaluator.evaluate(preds)
    print(f"  K={k}, Silhouette={score:.4f}")
    if score > best_score:
        best_k, best_score = k, score

print(f"\nBest K = {best_k} (Silhouette = {best_score:.4f})")

# 5. Train final model
kmeans_final = KMeans(featuresCol="features", k=best_k, seed=42, maxIter=100)
final_model = kmeans_final.fit(songs_feat)
clustered = final_model.transform(songs_feat)

# 6. Analyze clusters
print("\n=== 聚类结果 ===")
cluster_stats = clustered.groupBy("prediction").agg(
    {"song_id": "count", "log_cmt": "avg", "pop": "avg", "duration_sec": "avg"}
).orderBy("prediction")
cluster_stats.show()

# Show per-cluster top topics
for c in range(best_k):
    print(f"\n--- Cluster {c} ---")
    cluster_songs = clustered.filter(col("prediction") == c)
    top_topics = cluster_songs.groupBy("topic_name").count().orderBy("count", ascending=False).limit(5)
    top_topics.show(5, False)
    # Show 3 sample songs
    samples = cluster_songs.select("name", "artist_name", "comment_total", "topic_name").orderBy("comment_total", ascending=False).limit(3)
    samples.show(3, False)

# 7. Save results
output = clustered.select("song_id", "name", "artist_name", "year", "prediction", 
                          "comment_total", "pop", "topic_name").collect()

result = []
for row in output:
    result.append({
        "song_id": row.song_id,
        "name": row.name,
        "artist": row.artist_name,
        "year": row.year,
        "cluster": row.prediction,
        "comment_total": row.comment_total,
        "pop": row.pop,
        "topic": row.topic_name
    })

# Save to local JSON for web
os.makedirs("/home/hadoop/workspace/coudes/web/data", exist_ok=True)
with open("/home/hadoop/workspace/coudes/web/data/kmeans_clusters.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False)

# Also write to HDFS
clustered.select("song_id", "name", "artist_name", "prediction", "topic_name") \
    .write.mode("overwrite").json("/netease/output/kmeans")

print(f"\n✅ 聚类完成：{len(result)} 首歌分为 {best_k} 类")
print(f"   结果保存: web/data/kmeans_clusters.json")
print(f"   HDFS 输出: /netease/output/kmeans")

# Cluster summary
for c in range(best_k):
    cluster_items = [r for r in result if r["cluster"] == c]
    avg_cmt = sum(r["comment_total"] for r in cluster_items) / max(len(cluster_items), 1)
    topics = {}
    for r in cluster_items:
        topics[r["topic"]] = topics.get(r["topic"], 0) + 1
    top_topic = max(topics, key=topics.get) if topics else "?"
    print(f"   Cluster {c}: {len(cluster_items)} songs, avg_cmt={avg_cmt:.0f}, top_topic={top_topic}")

spark.stop()
