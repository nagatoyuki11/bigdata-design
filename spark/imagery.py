# -*- coding: utf-8 -*-
"""创新模块·歌词意象地图（地点意象提取）。

对清洗后的歌词分词结果匹配"地名词典"，统计华语歌曲都在唱哪些地方，
导出每个地点的出现歌曲数 + 代表歌曲，供前端按经纬度散点可视化。

地名词典内置经纬度（含国内主要省市 + 国外名城），故前端无需下载 geojson，离线可用。

运行：bash spark/submit.sh imagery.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F
from collections import defaultdict

CLEAN = "/netease/clean"

# 地名 -> (经度, 纬度, 别名列表)。别名用于多写法归并到同一地点。
PLACES = {
    "北京": (116.41, 39.90, ["北平", "帝都"]),
    "上海": (121.47, 31.23, ["魔都", "外滩"]),
    "广州": (113.26, 23.13, ["羊城"]),
    "深圳": (114.06, 22.55, []),
    "成都": (104.07, 30.57, ["蓉城"]),
    "重庆": (106.55, 29.56, ["山城"]),
    "杭州": (120.15, 30.27, ["西湖"]),
    "南京": (118.80, 32.06, ["金陵", "秦淮"]),
    "武汉": (114.30, 30.59, []),
    "西安": (108.94, 34.34, ["长安"]),
    "天津": (117.20, 39.13, []),
    "苏州": (120.62, 31.32, ["姑苏"]),
    "厦门": (118.09, 24.48, ["鼓浪屿"]),
    "丽江": (100.23, 26.86, []),
    "拉萨": (91.11, 29.65, ["西藏"]),
    "青藏": (91.11, 33.00, ["青藏高原"]),
    "新疆": (87.62, 43.79, ["乌鲁木齐"]),
    "内蒙": (111.75, 40.84, ["内蒙古", "草原", "呼伦贝尔"]),
    "云南": (102.71, 25.04, ["昆明", "大理"]),
    "西藏": (91.11, 29.65, []),
    "东北": (125.32, 43.90, ["关东"]),
    "哈尔滨": (126.53, 45.80, []),
    "长沙": (112.94, 28.23, []),
    "青岛": (120.38, 36.07, []),
    "大连": (121.62, 38.92, []),
    "香港": (114.17, 22.32, ["维多利亚港", "维港"]),
    "澳门": (113.55, 22.20, []),
    "台北": (121.56, 25.04, ["台湾"]),
    "高雄": (120.31, 22.63, []),
    "黄河": (110.0, 37.0, []),
    "长江": (112.0, 30.5, ["扬子江"]),
    "草原": (111.75, 43.5, ["大草原"]),
    "江南": (120.0, 30.8, []),
    "塞北": (111.0, 41.0, []),
    "故乡": (113.0, 34.5, ["家乡"]),     # 抽象意象地，给中原坐标
    # 国外名城
    "东京": (139.69, 35.69, []),
    "巴黎": (2.35, 48.86, ["塞纳河"]),
    "伦敦": (-0.13, 51.51, []),
    "纽约": (-74.01, 40.71, ["曼哈顿"]),
    "首尔": (126.98, 37.57, []),
    "维也纳": (16.37, 48.21, []),
    "罗马": (12.50, 41.90, []),
    "威尼斯": (12.32, 45.44, []),
    "夏威夷": (-157.86, 21.31, []),
}


def build_alias_map():
    """别名 -> 主地名。"""
    m = {}
    for main, (_, _, aliases) in PLACES.items():
        m[main] = main
        for a in aliases:
            m[a] = main
    return m


def main():
    spark = K.get_spark("imagery")
    lyric = spark.read.parquet(CLEAN + "/lyric").select("song_id", "words")
    song = spark.read.parquet(CLEAN + "/song").select(
        "song_id", "name", "artist_name", "comment_total", "year")

    alias = build_alias_map()
    alias_b = spark.sparkContext.broadcast(alias)

    def extract_places(words):
        if not words:
            return []
        am = alias_b.value
        hit = set()
        for w in words.split():
            if w in am:
                hit.add(am[w])
        return list(hit)

    from pyspark.sql.types import ArrayType, StringType
    ex_udf = F.udf(extract_places, ArrayType(StringType()))

    df = lyric.withColumn("places", ex_udf(F.col("words"))) \
        .filter(F.size("places") > 0) \
        .join(song, "song_id", "left")
    df = df.withColumn("place", F.explode("places")).cache()

    # 每地聚合：歌曲数 + 累计真实评论（热度）
    agg = df.groupBy("place").agg(
        F.countDistinct("song_id").alias("song_cnt"),
        F.sum("comment_total").alias("heat")).collect()
    agg_map = {r["place"]: (r["song_cnt"], int(r["heat"] or 0)) for r in agg}

    # 每地代表歌曲（按真实评论 top5）
    from pyspark.sql.window import Window
    w = Window.partitionBy("place").orderBy(F.desc("comment_total"))
    reps = df.withColumn("rk", F.row_number().over(w)).filter(F.col("rk") <= 5) \
        .select("place", "song_id", "name", "artist_name", "comment_total").collect()
    rep_map = defaultdict(list)
    for r in reps:
        rep_map[r["place"]].append(
            {"song_id": str(r["song_id"]), "name": r["name"], "artist": r["artist_name"],
             "comment_total": int(r["comment_total"] or 0)})

    out = []
    for place, (cnt, heat) in sorted(agg_map.items(), key=lambda x: -x[1][0]):
        lng, lat, _ = PLACES[place]
        out.append({
            "name": place, "lng": lng, "lat": lat,
            "song_cnt": cnt, "heat": heat,
            "songs": rep_map.get(place, []),
        })
    K.export_json("imagery_map.json", out)
    print(">>> 地点意象 Top15:")
    for o in out[:15]:
        print("   %-6s 歌曲%d 热度%d 代表:%s" %
              (o["name"], o["song_cnt"], o["heat"],
               "/".join(s["name"] for s in o["songs"][:3])))

    spark.stop()
    print(">>> 歌词意象地图完成。")


if __name__ == "__main__":
    main()
