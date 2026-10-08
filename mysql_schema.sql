-- 云律 · 华语乐坛数字档案馆 — MySQL 结果存储 Schema
-- 用法: mysql -u root -p < mysql_schema.sql

CREATE DATABASE IF NOT EXISTS yueping CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE yueping;

-- 歌曲排行榜结果
CREATE TABLE IF NOT EXISTS rank_songs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    song_id VARCHAR(32) NOT NULL,
    name VARCHAR(200) NOT NULL,
    artist_name VARCHAR(100),
    year INT,
    comment_total INT DEFAULT 0,
    topic_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_year (year),
    INDEX idx_comment (comment_total)
);

-- 歌手排行榜结果
CREATE TABLE IF NOT EXISTS rank_artists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    artist_name VARCHAR(100) NOT NULL,
    total_cmt INT DEFAULT 0,
    song_count INT DEFAULT 0,
    influence DOUBLE DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_influence (influence)
);

-- 高频词统计结果 (MapReduce 输出)
CREATE TABLE IF NOT EXISTS word_count (
    id INT AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(100) NOT NULL,
    count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_count (count)
);

-- KMeans 聚类结果
CREATE TABLE IF NOT EXISTS song_clusters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    song_id VARCHAR(32) NOT NULL,
    name VARCHAR(200),
    artist_name VARCHAR(100),
    year INT,
    cluster_id INT,
    comment_total INT DEFAULT 0,
    topic_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cluster (cluster_id)
);

-- 年报数据
CREATE TABLE IF NOT EXISTS year_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year INT NOT NULL UNIQUE,
    song_count INT,
    total_cmt INT,
    top_artist VARCHAR(100),
    top_song VARCHAR(200),
    top_topic VARCHAR(50),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT 'MySQL schema for 云律 created successfully' AS status;
SHOW TABLES;
