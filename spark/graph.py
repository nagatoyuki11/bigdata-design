# -*- coding: utf-8 -*-
"""创新模块·歌手合作网络（SNA / 图计算）。

从歌曲的 artist_name（斜杠分隔的合作串）抽取"共同出现在一首歌"的合作边，
构建华语歌手合作网络，并在驱动端用纯 Python 计算：
  - PageRank（幂迭代）          → 歌手在合作网络中的影响力/中心度
  - 标签传播 LPA（连通+社群）    → 自动发现合作圈子/流派社群

不依赖 GraphFrames/networkx，避免额外组件；网络规模（数千歌手、上万边）driver 端秒级完成。
结果导出 web/data/graph_nodes.json / graph_edges.json 供前端力导向图。

运行：bash spark/submit.sh graph.py
"""
import sys, os, math, json
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as K
from pyspark.sql import functions as F

CLEAN = "/netease/clean"
MIN_EDGE = 1          # 边最小合作次数（>=1 即保留，前端再按权重过滤）
MAX_NODES = 220       # 力导向图节点上限（按度数+热度取核心子图，保证可视化清晰）
AUTH_CMT_MIN = 100    # 真实歌手门槛：合作歌曲累计评论 < 此值的歌手视为空壳，剔除出网络


def main():
    spark = K.get_spark("graph")
    song = spark.read.parquet(CLEAN + "/song").select(
        "song_id", "artist_name", "comment_total")

    # ---------- 抽取合作组（一首歌内 >=2 位歌手）----------
    rows = song.filter(F.col("artist_name").contains("/")).select(
        "artist_name", "comment_total").collect()

    edge_w = defaultdict(int)        # (a,b)->合作歌曲数
    edge_heat = defaultdict(int)     # (a,b)->合作歌曲累计真实评论
    node_songs = defaultdict(int)    # 歌手合作歌曲数
    node_heat = defaultdict(int)     # 歌手合作歌曲累计评论
    # 全量歌手热度（含非合作），用于节点大小兜底
    for r in rows:
        names = [n.strip() for n in (r["artist_name"] or "").split("/") if n.strip()]
        names = list(dict.fromkeys(names))      # 去重保序
        if len(names) < 2:
            continue
        ct = int(r["comment_total"] or 0)
        for n in names:
            node_songs[n] += 1
            node_heat[n] += ct
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = sorted((names[i], names[j]))
                edge_w[(a, b)] += 1
                edge_heat[(a, b)] += ct

    edges = {k: v for k, v in edge_w.items() if v >= MIN_EDGE}
    print(">>> 合作歌手:", len(node_songs), " 合作边:", len(edges))

    # ---------- 选核心子图：按 (度数, 合作热度) 取 Top MAX_NODES ----------
    # 真实性筛选：合作歌曲累计评论 < 阈值的歌手（空壳/噪声）直接剔除
    real_nodes = {n for n in node_songs if node_heat[n] >= AUTH_CMT_MIN}
    deg = defaultdict(int)
    for (a, b), w in edges.items():
        deg[a] += w; deg[b] += w
    ranked = sorted(real_nodes,
                    key=lambda n: (deg[n], node_heat[n]), reverse=True)
    keep = set(ranked[:MAX_NODES])
    sub_edges = {(a, b): w for (a, b), w in edges.items() if a in keep and b in keep}
    # 只保留在子图里仍有边的节点
    connected = set()
    for (a, b) in sub_edges:
        connected.add(a); connected.add(b)
    keep = keep & connected
    print(">>> 核心子图节点:", len(keep), " 边:", len(sub_edges),
          "（已剔除累计评论<%d 的空壳歌手）" % AUTH_CMT_MIN)

    # ---------- PageRank（幂迭代）----------
    adj = defaultdict(list)
    for (a, b), w in sub_edges.items():
        adj[a].append((b, w)); adj[b].append((a, w))
    nodes = list(keep)
    N = len(nodes)
    pr = {n: 1.0 / N for n in nodes}
    wsum = {n: sum(w for _, w in adj[n]) or 1 for n in nodes}
    d = 0.85
    for _ in range(40):
        nxt = {n: (1 - d) / N for n in nodes}
        for n in nodes:
            share = d * pr[n] / wsum[n]
            for (m, w) in adj[n]:
                nxt[m] += share * w
        pr = nxt
    mx = max(pr.values()) or 1
    pr = {n: pr[n] / mx for n in nodes}   # 归一化到 0~1

    # ---------- 社群发现：标签传播 LPA ----------
    label = {n: i for i, n in enumerate(nodes)}
    order = sorted(nodes, key=lambda n: deg[n], reverse=True)
    for _ in range(20):
        changed = 0
        for n in order:
            if not adj[n]:
                continue
            cnt = defaultdict(int)
            for (m, w) in adj[n]:
                cnt[label[m]] += w
            best = max(cnt.items(), key=lambda x: (x[1], -x[0]))[0]
            if label[n] != best:
                label[n] = best; changed += 1
        if changed == 0:
            break
    # 社群重编号（按规模降序），仅保留较大社群上色，小社群归 -1
    comm_size = defaultdict(int)
    for n in nodes:
        comm_size[label[n]] += 1
    big = sorted([c for c in comm_size if comm_size[c] >= 3],
                 key=lambda c: comm_size[c], reverse=True)
    remap = {c: i for i, c in enumerate(big)}
    print(">>> 社群数(>=3人):", len(big))

    # ---------- 导出 ----------
    nodes_out = []
    for n in nodes:
        nodes_out.append({
            "name": n,
            "pagerank": round(pr[n], 4),
            "degree": deg[n],
            "songs": node_songs[n],
            "heat": node_heat[n],
            "community": remap.get(label[n], -1),
        })
    nodes_out.sort(key=lambda x: x["pagerank"], reverse=True)
    edges_out = [{"source": a, "target": b, "weight": w}
                 for (a, b), w in sorted(sub_edges.items(), key=lambda x: -x[1])]

    K.export_json("graph_nodes.json", nodes_out)
    K.export_json("graph_edges.json", edges_out)

    # 社群概览（每个社群的代表歌手）
    comm_members = defaultdict(list)
    for nd in nodes_out:
        if nd["community"] >= 0:
            comm_members[nd["community"]].append(nd["name"])
    comm_out = [{"community": c, "size": len(m), "members": m[:8]}
                for c, m in sorted(comm_members.items())]
    K.export_json("graph_communities.json", comm_out)

    print(">>> Top10 影响力歌手(PageRank):")
    for nd in nodes_out[:10]:
        print("   %-12s PR=%.3f 度=%d 社群=%d" %
              (nd["name"], nd["pagerank"], nd["degree"], nd["community"]))

    spark.stop()
    print(">>> 歌手合作网络完成。")


if __name__ == "__main__":
    main()
