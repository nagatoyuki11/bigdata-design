# -*- coding: utf-8 -*-
"""网易云音乐公开数据爬虫（模块①：数据采集）—— 提速版。

提速三招：① song/detail 批量取详情(1/50 请求) ② 评论一次请求取回(去翻页)
         ③ ThreadPoolExecutor 并发抓歌词+评论(温和 6 线程 + 礼貌间隔)。
华语：歌池由 discover.py 从"歌单广场·华语"发现，纯中文在预处理阶段过滤。
匿名化：评论仅留 文本/点赞/时间，丢弃一切用户身份字段。

用法：
    python3 crawler/discover.py                           # 先构建华语歌池
    python3 crawler/netease.py                            # 并发抓取歌池
    python3 crawler/netease.py --crawl-artist 许嵩 周杰伦  # 按专辑补抓缺失歌曲
    python3 crawler/netease.py --to-hdfs                  # 抓完上传 HDFS
    python3 crawler/netease.py --hdfs-only
"""
import os
import re
import sys
import json
import time
import threading
import argparse
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C

_write_lock = threading.Lock()      # 保护 jsonl 追加
_ckpt_lock = threading.Lock()       # 保护 checkpoint


# --------------------------------------------------------------------------
# HTTP 工具：限频 + 重试（线程安全）
# --------------------------------------------------------------------------
def http_get(url):
    last = None
    for attempt in range(C.MAX_RETRY):
        try:
            req = urllib.request.Request(url, headers=C.HEADERS)
            with urllib.request.urlopen(req, timeout=C.REQUEST_TIMEOUT) as resp:
                data = resp.read().decode("utf-8", errors="ignore")
            time.sleep(C.REQUEST_INTERVAL)          # 每线程礼貌间隔
            return json.loads(data)
        except Exception as e:                       # noqa
            last = e
            time.sleep(C.RETRY_BACKOFF * (attempt + 1))
    print("  [WARN] 请求失败 %s -> %s" % (url[:80], last))
    return None


# --------------------------------------------------------------------------
# 断点续爬
# --------------------------------------------------------------------------
def load_checkpoint():
    if os.path.exists(C.CHECKPOINT_FILE):
        with open(C.CHECKPOINT_FILE, encoding="utf-8") as f:
            return set(json.load(f).get("done", []))
    return set()


def save_checkpoint(done):
    os.makedirs(os.path.dirname(C.CHECKPOINT_FILE), exist_ok=True)
    tmp = C.CHECKPOINT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"done": sorted(done)}, f)
    os.replace(tmp, C.CHECKPOINT_FILE)


# --------------------------------------------------------------------------
# 解析各类数据
# --------------------------------------------------------------------------
def get_song_ids_from_playlist(pid):
    """从歌单取歌曲ID列表（v6 接口的 trackIds 含全部曲目）。"""
    j = http_get(C.URL_PLAYLIST.format(pid=pid))
    ids = []
    if not j:
        return ids
    pl = j.get("playlist") or j.get("result") or {}
    for t in (pl.get("trackIds") or [])[: C.MAX_SONGS_PER_PLAYLIST]:
        ids.append(t["id"])
    if not ids:
        for t in (pl.get("tracks") or [])[: C.MAX_SONGS_PER_PLAYLIST]:
            ids.append(t["id"])
    return ids


def _build_song(s):
    """从原始 song 对象构建结构化 dict（不含 comment_total，后续补）。"""
    artists = s.get("artists") or s.get("ar") or []
    artist_id = artists[0]["id"] if artists else 0
    artist_name = "/".join(a.get("name", "") for a in artists)
    album = s.get("album") or s.get("al") or {}
    publish_ms = album.get("publishTime", 0) or 0
    year = 0
    if publish_ms and publish_ms > 0:
        year = time.gmtime(publish_ms / 1000).tm_year
    return {
        "song_id": s["id"],
        "name": s.get("name", ""),
        "artist_id": artist_id,
        "artist_name": artist_name,
        "album": album.get("name", ""),
        "album_id": album.get("id", 0),
        "duration_ms": s.get("duration", 0) or s.get("dt", 0),
        "year": year,
        "publish_time": publish_ms,
        "pop": s.get("popularity", 0),
        "comment_total": 0,     # 真实总评论数，抓评论时回填
    }


def parse_song_batch(ids):
    """批量取歌曲详情：一次请求多个 ID。返回 {sid: song_dict}。"""
    id_str = ",".join(str(i) for i in ids)
    url = C.API_BASE + "/song/detail/?ids=%5B" + id_str + "%5D"
    j = http_get(url)
    out = {}
    if not j or not j.get("songs"):
        return out
    for s in j["songs"]:
        try:
            out[s["id"]] = _build_song(s)
        except Exception:       # noqa
            continue
    return out


def parse_lyric(sid):
    j = http_get(C.URL_LYRIC.format(sid=sid))
    if not j:
        return None
    lrc = ((j.get("lrc") or {}).get("lyric")) or ""
    plain = re.sub(r"\[\d{1,2}:\d{1,2}[.:]\d{1,3}\]", "", lrc)
    plain = re.sub(r"\[[a-zA-Z]+:[^\]]*\]", "", plain)
    plain = "\n".join(ln.strip() for ln in plain.splitlines() if ln.strip())
    return {"song_id": sid, "lyric": plain}


def parse_comments(sid):
    """评论（匿名化）。一次请求取回热评+普通评论，并返回真实总评论数 total。
    返回 (comments_list, total)。"""
    out = []
    j = http_get(C.URL_COMMENTS.format(sid=sid, limit=C.COMMENT_LIMIT_PER_SONG, offset=0))
    if not j:
        return out, 0
    total = j.get("total", 0) or 0
    seq = 0
    for c in (j.get("hotComments") or []):
        out.append(_anon_comment(sid, c, seq, hot=1)); seq += 1
    for c in (j.get("comments") or []):
        if len(out) >= C.COMMENT_LIMIT_PER_SONG:
            break
        out.append(_anon_comment(sid, c, seq, hot=0)); seq += 1
    return out[: C.COMMENT_LIMIT_PER_SONG], total


def _anon_comment(sid, c, seq, hot):
    """匿名化：不保留任何可识别用户身份的字段。"""
    ts = c.get("time", 0)
    return {
        "song_id": sid,
        "row_key": "%s_%s_%03d" % (sid, ts, seq),
        "content": (c.get("content") or "").replace("\n", " ").strip(),
        "liked": c.get("likedCount", 0),
        "time": ts,
        "hot": hot,
    }


def parse_artist(aid):
    j = http_get(C.URL_ARTIST.format(aid=aid))
    if not j:
        return None
    a = j.get("artist") or {}
    hot = [{"id": s["id"], "name": s.get("name", "")} for s in (j.get("hotSongs") or [])[:10]]
    return {
        "artist_id": aid,
        "name": a.get("name", ""),
        "brief": (a.get("briefDesc") or "").replace("\n", " "),
        "music_size": a.get("musicSize", 0),
        "album_size": a.get("albumSize", 0),
        "hot_songs": hot,
        "photo": a.get("img1v1Url") or a.get("picUrl") or a.get("coverImgUrl") or "",
    }


# --------------------------------------------------------------------------
# 写本地 JSONL（线程安全）
# --------------------------------------------------------------------------
def append_jsonl(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with _write_lock:
        with open(path, "a", encoding="utf-8") as f:
            if isinstance(obj, list):
                for o in obj:
                    f.write(json.dumps(o, ensure_ascii=False) + "\n")
            else:
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")


# --------------------------------------------------------------------------
# 上传 HDFS
# --------------------------------------------------------------------------
def to_hdfs():
    import subprocess
    HADOOP = "/usr/local/hadoop/bin/hdfs"
    env = dict(os.environ, JAVA_HOME="/usr/lib/jvm/java-8-openjdk-amd64",
               HADOOP_CONF_DIR="/usr/local/hadoop/etc/hadoop")
    mapping = {
        "songs.jsonl": C.HDFS_SONG, "lyrics.jsonl": C.HDFS_LYRIC,
        "comments.jsonl": C.HDFS_COMMENT, "artists.jsonl": C.HDFS_ARTIST,
    }
    for fn, hdir in mapping.items():
        local = os.path.join(C.LOCAL_RAW_DIR, fn)
        if not os.path.exists(local):
            continue
        subprocess.run([HADOOP, "dfs", "-mkdir", "-p", hdir], env=env)
        subprocess.run([HADOOP, "dfs", "-put", "-f", local, hdir + "/"], env=env)
        print("  [HDFS] %s -> %s/" % (fn, hdir))


# --------------------------------------------------------------------------
# 歌池加载
# --------------------------------------------------------------------------
def load_song_pool():
    """优先读 discover.py 生成的歌池；否则回退官方榜单。"""
    if os.path.exists(C.SONG_POOL_FILE):
        with open(C.SONG_POOL_FILE, encoding="utf-8") as f:
            ids = json.load(f).get("ids", [])
        if ids:
            print(">>> 载入歌池 %d 首（%s）" % (len(ids), C.SONG_POOL_FILE))
            return ids[: C.MAX_TOTAL_SONGS]
    print(">>> 未找到歌池，回退官方榜单种子")
    seen, pool = set(), []
    for pid in C.SEED_PLAYLISTS:
        for sid in get_song_ids_from_playlist(pid):
            if sid not in seen:
                seen.add(sid); pool.append(sid)
    return pool[: C.MAX_TOTAL_SONGS]


def resolve_artist_id(query):
    """把歌手名或数字ID统一解析为网易云 artist_id（字符串）。优先查本地 search.db。"""
    # 数字ID直传
    if isinstance(query, (int,)) or (isinstance(query, str) and query.isdigit()):
        return str(int(query))
    # 查本地 SQLite
    db_path = "/home/hadoop/workspace/coudes/web/search.db"
    try:
        import sqlite3
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT artist_id FROM artists WHERE artist_name LIKE ? LIMIT 1", ("%"+query+"%",))
        row = cur.fetchone()
        conn.close()
        if row and row[0]:
            return str(row[0])
    except Exception:
        pass
    # 回退：调网易云搜索 API
    try:
        import urllib.request
        url = "%s/search?keywords=%s&type=100&limit=3" % (C.API_BASE, urllib.parse.quote(query))
        j = http_get(url)
        artists = (j.get("result") or {}).get("artists", [])
        if artists and artists[0].get("id"):
            return str(artists[0]["id"])
    except Exception:
        pass
    return None


def get_artist_albums(aid):
    """获取一位歌手的全部专辑列表（从 /artist/albums 接口，含分页遍历）。"""
    all_albums = []
    offset = 0
    limit = 200
    while True:
        url = "%s/artist/albums/%s?limit=%d&offset=%d" % (C.API_BASE, aid, limit, offset)
        j = http_get(url)
        if not j:
            break
        batch = j.get("hotAlbums") or []
        if not batch:
            break
        all_albums.extend(batch)
        if not j.get("more", False):
            break
        offset += len(batch)
    return all_albums


def get_album_songs(album_id):
    """获取一张专辑的歌曲ID列表（从 /v1/album 接口，兼容全部专辑）。"""
    j = http_get("%s/v1/album/%s" % (C.API_BASE, album_id))
    if not j:
        return []
    songs = j.get("songs") or []
    return [s["id"] for s in songs if s.get("id")]


def get_artist_discography(aid, use_albums=True):
    """获取一位歌手所有歌曲ID：专辑遍历模式（use_albums=True）覆盖率最高；
    hotSongs 模式（use_albums=False）仅热门50首，速度快。"""
    if not use_albums:
        # 旧逻辑：仅 hotSongs
        j = http_get(C.URL_ARTIST.format(aid=aid))
        hot = (j or {}).get("hotSongs") or []
        return [s["id"] for s in hot if s.get("id")]
    # 专辑遍历模式
    albums = get_artist_albums(aid)
    total_albums = len(albums)
    total_size = sum(a.get("size", 0) for a in albums)
    print("      -> 发现 %d 张专辑，累计 %d 首（按 size 字段）" % (total_albums, total_size))
    all_ids = set()
    album_processed = 0
    for alb in albums:
        aid_val = alb["id"]
        songs = get_album_songs(aid_val)
        album_processed += 1
        if album_processed % 20 == 0:
            print("        专辑进度 %d/%d，已收集 %d 首歌曲ID..." % (album_processed, total_albums, len(all_ids)))
        for sid in songs:
            all_ids.add(sid)
    return list(all_ids)


def fill_song_pool_from_artists(artist_queries, use_albums=True):
    """按指定歌手（名或ID）补抓歌曲，追加到 song_pool，返回本轮新增ID数。
    use_albums=True: 按专辑链式抓取（覆盖率高，推荐）；False: 仅 hotSongs。
    新增ID插入歌池头部，确保 load_song_pool 截断时优先抓取。"""
    if not os.path.exists(C.SONG_POOL_FILE):
        print(">>> 歌池文件不存在，无法增量补抓")
        return 0
    with open(C.SONG_POOL_FILE, encoding="utf-8") as f:
        pool = json.load(f)
    existing = set(pool.get("ids", []))
    new_ids = []
    mode = "专辑遍历" if use_albums else "热门歌曲"
    for q in artist_queries:
        aid = resolve_artist_id(q)
        if not aid:
            print("  [SKIP] 未找到歌手: %s" % q)
            continue
        print("  >>> 补抓歌手 #%s (%s) [%s模式] ..." % (aid, q, mode))
        ids = get_artist_discography(aid, use_albums=use_albums)
        added = 0
        for sid in ids:
            if sid not in existing:
                new_ids.append(sid)
                existing.add(sid)
                added += 1
        print("    -> 新增 %d 首（歌手共 %d 首）" % (added, len(ids)))
    if new_ids:
        pool["ids"] = new_ids + pool.get("ids", [])
        with open(C.SONG_POOL_FILE, "w", encoding="utf-8") as f:
            json.dump(pool, f, ensure_ascii=False)
    return len(new_ids)


# --------------------------------------------------------------------------
# 主流程（并发）
# --------------------------------------------------------------------------
_counter = {"song": 0, "cmt": 0, "n": 0}
_artist_seen = set()
_artist_lock = threading.Lock()


def _process_song(sid, song):
    """单首歌的歌词+评论抓取与落盘（在线程池中执行）。返回 artist_id。"""
    if not song:
        return None
    lyr = parse_lyric(sid)
    cmts, total = parse_comments(sid)
    song["comment_total"] = total

    append_jsonl(os.path.join(C.LOCAL_RAW_DIR, "songs.jsonl"), song)
    if lyr:
        append_jsonl(os.path.join(C.LOCAL_RAW_DIR, "lyrics.jsonl"), lyr)
    if cmts:
        append_jsonl(os.path.join(C.LOCAL_RAW_DIR, "comments.jsonl"), cmts)

    with _ckpt_lock:
        _counter["song"] += 1
        _counter["cmt"] += len(cmts)
        _counter["n"] += 1
        if _counter["n"] % 50 == 0:
            print("  进度 +%d 首  累计评论 %d" % (_counter["song"], _counter["cmt"]))
    return song.get("artist_id")


def crawl():
    done = load_checkpoint()
    print(">>> 已完成 %d 首（断点续爬）" % len(done))

    pool = [sid for sid in load_song_pool() if sid not in done]
    print(">>> 待抓取 %d 首（并发 %d 线程）" % (len(pool), C.MAX_WORKERS))

    new_done = set(done)
    artist_ids = set()

    # 分批：每批先批量取详情，再并发抓歌词+评论
    for start in range(0, len(pool), C.DETAIL_BATCH):
        batch = pool[start:start + C.DETAIL_BATCH]
        details = parse_song_batch(batch)
        with ThreadPoolExecutor(max_workers=C.MAX_WORKERS) as ex:
            futs = {ex.submit(_process_song, sid, details.get(sid)): sid for sid in batch}
            for fu in as_completed(futs):
                sid = futs[fu]
                try:
                    aid = fu.result()
                    if aid:
                        artist_ids.add(aid)
                    new_done.add(sid)
                except Exception as e:      # noqa
                    print("  [WARN] 处理失败 %s: %s" % (sid, e))
        with _ckpt_lock:
            save_checkpoint(new_done)

    # 歌手信息（并发，去重）
    print(">>> 抓取歌手信息 %d 位 ..." % len(artist_ids))
    with ThreadPoolExecutor(max_workers=C.MAX_WORKERS) as ex:
        futs = [ex.submit(parse_artist, aid) for aid in artist_ids]
        for fu in as_completed(futs):
            art = fu.result()
            if art:
                append_jsonl(os.path.join(C.LOCAL_RAW_DIR, "artists.jsonl"), art)

    save_checkpoint(new_done)
    print(">>> 抓取完成：新增歌曲 %d，评论 %d，歌手 %d" %
          (_counter["song"], _counter["cmt"], len(artist_ids)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--to-hdfs", action="store_true")
    ap.add_argument("--hdfs-only", action="store_true")
    ap.add_argument("--crawl-artist", nargs="+", default=[],
                    help="增量补抓指定歌手（名或ID）的全部专辑歌曲到歌池（默认专辑遍历模式）；例：--crawl-artist 许嵩 周杰伦")
    ap.add_argument("--hot-only", action="store_true",
                    help="搭配 --crawl-artist：仅抓 hotSongs 而非全部专辑（快速但歌曲少）")
    args = ap.parse_args()
    if args.crawl_artist:
        use_albums = not args.hot_only
        n = fill_song_pool_from_artists(args.crawl_artist, use_albums=use_albums)
        if n == 0:
            print(">>> 未发现新歌曲，无需抓取")
        else:
            print(">>> 已补充 %d 首新歌ID到歌池，启动抓取..." % n)
        if n > 0:
            crawl()
            if args.to_hdfs:
                to_hdfs()
    elif args.hdfs_only:
        to_hdfs()
    else:
        crawl()
        if args.to_hdfs:
            to_hdfs()
