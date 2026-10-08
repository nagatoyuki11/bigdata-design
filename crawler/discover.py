# -*- coding: utf-8 -*-
"""种子发现：从网易云"歌单广场"轮扫多个华语向分类，发现大量歌单，
汇总其歌曲 ID 去重成歌池，缓存到 data/song_pool.json。
非华语（如摇滚/说唱里的英文歌）由预处理阶段的中文占比过滤剔除。

用法：
    python3 crawler/discover.py                       # 多分类轮扫(config.SEED_CATEGORIES)
    python3 crawler/discover.py --cat 华语 --playlists 600   # 仅单分类
"""
import os
import sys
import json
import argparse
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C
from netease import http_get, get_song_ids_from_playlist

URL_PLAYLIST_LIST = (C.API_BASE +
                     "/playlist/list?cat={cat}&order=hot&limit={limit}&offset={offset}")


def discover_playlists_in_cat(cat, max_playlists):
    """翻页发现单个分类下的热门歌单 ID。"""
    pids, offset, page = [], 0, 50
    while len(pids) < max_playlists:
        url = URL_PLAYLIST_LIST.format(cat=quote(cat), limit=page, offset=offset)
        j = http_get(url)
        if not j:
            break
        pls = j.get("playlists") or j.get("playlist") or []
        if not pls:
            break
        for p in pls:
            pids.append(p["id"])
        offset += page
        if len(pls) < page:
            break
    return pids[:max_playlists]


def discover_all_playlists(categories, per_cat):
    """多分类轮扫，汇总去重歌单 ID。"""
    seen, all_pids = set(), []
    # 官方榜单优先
    for pid in C.SEED_PLAYLISTS:
        if pid not in seen:
            seen.add(pid); all_pids.append(pid)
    for cat in categories:
        pids = discover_playlists_in_cat(cat, per_cat)
        new = 0
        for pid in pids:
            if pid not in seen:
                seen.add(pid); all_pids.append(pid); new += 1
        print("  分类[%s] 发现 %d 个歌单（新增 %d，累计 %d）" % (cat, len(pids), new, len(all_pids)))
        if len(all_pids) >= C.MAX_SEED_PLAYLISTS:
            break
    return all_pids[: C.MAX_SEED_PLAYLISTS]


def build_song_pool(categories, per_cat, target_songs):
    """多分类发现歌单 → 汇总歌曲 ID 去重 → 缓存歌池。"""
    print(">>> 轮扫 %d 个分类发现歌单 ..." % len(categories))
    pids = discover_all_playlists(categories, per_cat)
    print(">>> 共发现歌单 %d 个，并发汇总歌曲 ID ..." % len(pids))

    # 并发抓取各歌单的 trackIds（分块处理，达标即停，提速 ~6 倍）
    seen, pool, done = set(), [], 0
    chunk = C.MAX_WORKERS * 20
    for start in range(0, len(pids), chunk):
        batch = pids[start:start + chunk]
        with ThreadPoolExecutor(max_workers=C.MAX_WORKERS) as ex:
            for ids in ex.map(get_song_ids_from_playlist, batch):
                done += 1
                for sid in (ids or []):
                    if sid not in seen:
                        seen.add(sid); pool.append(sid)
        print("  歌单 %d/%d  歌池 %d 首" % (done, len(pids), len(pool)))
        if len(pool) >= target_songs:
            print(">>> 已达目标歌池规模 %d，停止" % target_songs)
            break

    pool = pool[:target_songs]
    os.makedirs(os.path.dirname(C.SONG_POOL_FILE), exist_ok=True)
    with open(C.SONG_POOL_FILE, "w", encoding="utf-8") as f:
        json.dump({"categories": categories, "ids": pool}, f)
    print(">>> 歌池构建完成：%d 首 → %s" % (len(pool), C.SONG_POOL_FILE))
    return pool


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cat", default=None, help="仅扫单个分类")
    ap.add_argument("--playlists", type=int, default=C.MAX_PLAYLISTS_PER_CAT)
    ap.add_argument("--target", type=int, default=C.MAX_TOTAL_SONGS)
    args = ap.parse_args()
    cats = [args.cat] if args.cat else C.SEED_CATEGORIES
    build_song_pool(cats, args.playlists, args.target)
