// 云律 Node.js 服务：静态页面 + REST API
// 两类数据源：
//   1) Spark 导出的聚合结果 JSON（web/data/*.json）—— 分析大屏只读缓存；
//   2) SQLite 检索库（web/search.db，由 spark/searchdb.py 物化）—— 云律主数据库
//      在线检索 Serving 层，提供歌曲/歌手/歌词/评论的复合条件查询与 FTS5 全文检索。
// 说明：HBase 为权威结果存储；本服务不直连 Thrift，读 SQLite/JSON 以保证大屏低延迟。
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(__dirname, 'search.db');

// 静态文件：优先 React 构建产物 (dist/)，回退旧版 (public/)
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
if (require('fs').existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  app.use(express.static(publicPath));
}

// ---------- SQLite 检索库（可选：缺库时检索接口降级为 503，分析大屏不受影响）----------
let db = null;
try {
  const Database = require('better-sqlite3');
  if (fs.existsSync(DB_PATH)) {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    db.pragma('cache_size = -16000'); // 16MB 页缓存
    console.log('检索库已加载: search.db');
  } else {
    console.warn('未找到 search.db，检索接口不可用（请运行 spark/submit.sh searchdb.py）');
  }
} catch (e) {
  console.warn('better-sqlite3 不可用，检索接口降级：', e.message);
}
function needDb(res) {
  if (!db) { res.status(503).json({ error: '检索库未就绪，请先构建 search.db' }); return true; }
  return false;
}
// 入参清洗
const toInt = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clampLimit = v => Math.min(Math.max(toInt(v, 20), 1), 100);
// FTS5 query 转义：按 jieba 习惯保留中文/字母数字词，包裹双引号防语法注入
function ftsTerm(q) {
  const cleaned = String(q || '').replace(/["]/g, ' ').trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter(Boolean).map(t => `"${t}"`);
  return tokens.length ? tokens.join(' ') : null;
}

// ---------- ① 歌曲复合检索 ----------
// q(歌名/歌手关键词) yearMin yearMax cmtMin cmtMax durMin durMax sort(comment|pop|liked|year) page limit
app.get('/api/search/songs', (req, res) => {
  if (needDb(res)) return;
  const { q, yearMin, yearMax, cmtMin, cmtMax, durMin, durMax } = req.query;
  const where = [], params = [];
  if (q && q.trim()) { where.push('(name LIKE ? OR artist_name LIKE ?)'); params.push(`%${q.trim()}%`, `%${q.trim()}%`); }
  if (yearMin) { where.push('year >= ?'); params.push(toInt(yearMin)); }
  if (yearMax) { where.push('year <= ?'); params.push(toInt(yearMax)); }
  if (cmtMin) { where.push('comment_total >= ?'); params.push(toInt(cmtMin)); }
  if (cmtMax) { where.push('comment_total <= ?'); params.push(toInt(cmtMax)); }
  if (durMin) { where.push('duration_sec >= ?'); params.push(toInt(durMin)); }
  if (durMax) { where.push('duration_sec <= ?'); params.push(toInt(durMax)); }
  const sortMap = { comment: 'comment_total', pop: 'pop', liked: 'total_liked', year: 'year', duration: 'duration_sec' };
  const order = sortMap[req.query.sort] || 'comment_total';
  const limit = clampLimit(req.query.limit), page = Math.max(toInt(req.query.page, 0), 0);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const total = db.prepare(`SELECT count(*) c FROM songs ${w}`).get(...params).c;
    const rows = db.prepare(
      `SELECT song_id,name,artist_name,album,year,duration_sec,pop,comment_total,total_liked,topic_name,emotions
       FROM songs ${w} ORDER BY ${order} DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, page * limit);
    res.json({ total, page, limit, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- ② 歌手检索 ----------
// 默认仅展示真实歌手（评论总数≥100）；?all=1 关闭门槛，显示全部（含空壳/聚合噪声）。
app.get('/api/search/artists', (req, res) => {
  if (needDb(res)) return;
  const { q, heatMin, songMin } = req.query;
  const showAll = req.query.all === '1';
  const where = [], params = [];
  if (!showAll) { where.push('authentic = 1'); }
  if (q && q.trim()) { where.push('artist_name LIKE ?'); params.push(`%${q.trim()}%`); }
  if (heatMin) { where.push('influence >= ?'); params.push(parseFloat(heatMin)); }
  if (songMin) { where.push('song_num >= ?'); params.push(toInt(songMin)); }
  const limit = clampLimit(req.query.limit), page = Math.max(toInt(req.query.page, 0), 0);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const total = db.prepare(`SELECT count(*) c FROM artists ${w}`).get(...params).c;
    const rows = db.prepare(
      `SELECT artist_id,artist_name,song_num,comments,likes,avg_pop,influence,style_words
       FROM artists ${w} ORDER BY influence DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, page * limit);
    res.json({ total, page, limit, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- ③ 歌词全文检索（FTS5 优先，未命中回退 LIKE 原文）----------
app.get('/api/search/lyrics', (req, res) => {
  if (needDb(res)) return;
  const { q, topic } = req.query;
  const limit = clampLimit(req.query.limit), page = Math.max(toInt(req.query.page, 0), 0);
  try {
    let rows = [], total = 0, mode = 'fts';
    const term = ftsTerm(q);
    const topicW = topic ? ' AND topic_name = ?' : '';
    const topicP = topic ? [topic] : [];
    if (term) {
      total = db.prepare(`SELECT count(*) c FROM lyrics_fts WHERE words MATCH ?${topicW}`).get(term, ...topicP).c;
      if (total === 0 && q.trim()) { // 回退：jieba 把词切成单字时 FTS 无命中，扫原文
        mode = 'like';
        const like = `%${q.trim()}%`;
        total = db.prepare(`SELECT count(*) c FROM lyrics_fts WHERE lyric LIKE ?${topicW}`).get(like, ...topicP).c;
        rows = db.prepare(
          `SELECT song_id,name,artist_name,year,topic_name,word_count,snippet(lyrics_fts,6,'[',']','…',12) AS frag
           FROM lyrics_fts WHERE lyric LIKE ?${topicW} LIMIT ? OFFSET ?`
        ).all(like, ...topicP, limit, page * limit);
      } else {
        rows = db.prepare(
          `SELECT song_id,name,artist_name,year,topic_name,word_count,snippet(lyrics_fts,6,'[',']','…',12) AS frag
           FROM lyrics_fts WHERE words MATCH ?${topicW} ORDER BY rank LIMIT ? OFFSET ?`
        ).all(term, ...topicP, limit, page * limit);
      }
    } else {
      // 无关键词：仅按主题浏览
      const w = topic ? 'WHERE topic_name = ?' : '';
      total = db.prepare(`SELECT count(*) c FROM lyrics_fts ${w}`).get(...topicP).c;
      rows = db.prepare(
        `SELECT song_id,name,artist_name,year,topic_name,word_count,substr(lyric,1,80) AS frag
         FROM lyrics_fts ${w} LIMIT ? OFFSET ?`
      ).all(...topicP, limit, page * limit);
    }
    res.json({ total, page, limit, mode, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- ④ 评论全文检索（FTS5 优先，回退 LIKE；可叠加情感/点赞过滤）----------
app.get('/api/search/comments', (req, res) => {
  if (needDb(res)) return;
  const { q, sentiment, likedMin, song, artist } = req.query;
  const limit = clampLimit(req.query.limit), page = Math.max(toInt(req.query.page, 0), 0);
  const extra = [], ep = [];
  if (sentiment) { extra.push('sentiment = ?'); ep.push(sentiment); }
  if (likedMin) { extra.push('CAST(liked AS INTEGER) >= ?'); ep.push(toInt(likedMin)); }
  if (song && song.trim()) { extra.push('name LIKE ?'); ep.push('%' + song.trim() + '%'); }
  if (artist && artist.trim()) { extra.push('artist_name LIKE ?'); ep.push('%' + artist.trim() + '%'); }
  const extraW = extra.length ? ' AND ' + extra.join(' AND ') : '';
  const sort = req.query.sort === 'liked' ? 'ORDER BY CAST(liked AS INTEGER) DESC' : '';
  try {
    let rows = [], total = 0, mode = 'fts';
    const term = ftsTerm(q);
    const cols = 'song_id,name,artist_name,content,liked,time,sentiment';
    if (term) {
      total = db.prepare(`SELECT count(*) c FROM comments_fts WHERE words MATCH ?${extraW}`).get(term, ...ep).c;
      if (total === 0 && q.trim()) {
        mode = 'like'; const like = `%${q.trim()}%`;
        total = db.prepare(`SELECT count(*) c FROM comments_fts WHERE content LIKE ?${extraW}`).get(like, ...ep).c;
        rows = db.prepare(`SELECT ${cols} FROM comments_fts WHERE content LIKE ?${extraW} ${sort || 'ORDER BY CAST(liked AS INTEGER) DESC'} LIMIT ? OFFSET ?`)
          .all(like, ...ep, limit, page * limit);
      } else {
        const ord = sort || 'ORDER BY rank';
        rows = db.prepare(`SELECT ${cols} FROM comments_fts WHERE words MATCH ?${extraW} ${ord} LIMIT ? OFFSET ?`)
          .all(term, ...ep, limit, page * limit);
      }
    } else {
      const w = extra.length ? 'WHERE ' + extra.join(' AND ') : '';
      total = db.prepare(`SELECT count(*) c FROM comments_fts ${w}`).get(...ep).c;
      rows = db.prepare(`SELECT ${cols} FROM comments_fts ${w} ${sort || 'ORDER BY CAST(liked AS INTEGER) DESC'} LIMIT ? OFFSET ?`)
        .all(...ep, limit, page * limit);
    }
    res.json({ total, page, limit, mode, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 歌曲详情：基本信息 + 歌词 + 该曲热评 + 评论情感分布 ----------
app.get('/api/song/:id', (req, res) => {
  if (needDb(res)) return;
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  try {
    const song = db.prepare('SELECT * FROM songs WHERE song_id = ?').get(id);
    if (!song) return res.status(404).json({ error: 'no song' });
    const lyric = db.prepare('SELECT lyric,topic_name,word_count FROM lyrics_fts WHERE song_id = ? LIMIT 1').get(id);
    const comments = db.prepare(
      'SELECT content,liked,sentiment,time FROM comments_fts WHERE song_id = ? ORDER BY CAST(liked AS INTEGER) DESC LIMIT 20').all(id);
    const sent = db.prepare(
      'SELECT sentiment, count(*) c FROM comments_fts WHERE song_id = ? GROUP BY sentiment').all(id);
    res.json({ song, lyric: lyric || null, comments, sentiment: sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 歌手详情：画像 + 代表作（按真实评论数）----------
app.get('/api/artist/:id', (req, res) => {
  if (needDb(res)) return;
  const id = String(req.params.id);
  try {
    let a = db.prepare('SELECT * FROM artists WHERE artist_id = ?').get(id);
    if (!a) a = db.prepare('SELECT * FROM artists WHERE artist_name = ?').get(id);
    if (!a) return res.status(404).json({ error: 'no artist' });
    const songs = db.prepare(
      'SELECT song_id,name,year,comment_total,pop FROM songs WHERE artist_id = ? OR artist_name = ? ORDER BY comment_total DESC LIMIT 20').all(a.artist_id, a.artist_name);
    res.json({ artist: a, songs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 合作歌曲：查询两位歌手共同参与的合作歌曲 ----------
app.get('/api/collab-songs', (req, res) => {
  if (needDb(res)) return;
  const { a1, a2 } = req.query;
  if (!a1 || !a2) return res.status(400).json({ error: 'need a1 and a2' });
  try {
    const rows = db.prepare(`
      SELECT song_id,name,artist_name,album,year,comment_total
      FROM songs WHERE artist_name LIKE ? AND artist_name LIKE ? AND artist_name LIKE '%/%'
      ORDER BY comment_total DESC LIMIT 50
    `).all(`%${a1}%`, `%${a2}%`);
    res.json({ center: a1, target: a2, songs: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 专辑详情 ----------
app.get('/api/album/detail', (req, res) => {
  if (needDb(res)) return;
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'need name' });
  try {
    const rows = db.prepare(
      'SELECT song_id,name,artist_name,album,year,comment_total,pop,duration_sec FROM songs WHERE album = ? ORDER BY comment_total DESC'
    ).all(name);
    res.json({ album: name, songs: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 按年份区间排行 ----------
app.get('/api/rank/artists', (req, res) => {
  if (needDb(res)) return;
  const { ymin, ymax } = req.query;
  const where = ['a.authentic = 1'];
  const params = [];
  if (ymin) { where.push('s.year >= ?'); params.push(parseInt(ymin)); }
  if (ymax) { where.push('s.year <= ?'); params.push(parseInt(ymax)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  try {
    const rows = db.prepare(`
      SELECT a.artist_id, a.artist_name, COUNT(s.song_id) as song_cnt,
             SUM(s.comment_total) as total_cmt, CAST(AVG(s.pop) AS INTEGER) as avg_pop,
             a.photo, a.style_words
      FROM songs s JOIN artists a ON s.artist_id = a.artist_id
      ${w}
      GROUP BY a.artist_id ORDER BY total_cmt DESC LIMIT 30
    `).all(...params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rank/words', (req, res) => {
  if (needDb(res)) return;
  const { ymin, ymax } = req.query;
  const where = [];
  const params = [];
  if (ymin) { where.push('s.year >= ?'); params.push(parseInt(ymin)); }
  if (ymax) { where.push('s.year <= ?'); params.push(parseInt(ymax)); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT l.words FROM lyrics_fts l
    JOIN songs s ON l.song_id = s.song_id
    ${w}
  `).all(...params);
  const counter = {};
  const stop = new Set('的 了 是 在 我 你 他 她 它 们 这 那 不 也 就 都 还 要 会 可 把 被 让 给 对 从 到 和 与 或 但 而 虽 却 因 为 所 以 能 着 过 之 又 很 太 更 最 啊 吧 呢 吗 哦 嗯 呀 哟 呵 哈 嘛 啦 噢 一 二 三 四 五 六 七 八 九 十 百 千 万 亿 个 些 里 中 上 下 前 后 左 右 大 小 多 少 长 短 高 低 远 近 来 去 看 说 想 做 走 听 没有 知道 觉得 还是 已经 可以 如果 因为 所以 但是 虽然 不过 然后'.split(' '));
  for (const r of rows) {
    const words = r.words || '';
    for (const w of words.split(' ')) {
      const cw = w.trim();
      if (cw.length >= 2 && !stop.has(cw) && !/^\d+$/.test(cw)) {
        counter[cw] = (counter[cw] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([word, count]) => ({ word, count }));
  res.json(sorted);
});

// 检索库统计（前端展示规模）
app.get('/api/dbstats', (req, res) => {
  if (needDb(res)) return;
  try {
    res.json({
      songs: db.prepare('SELECT count(*) c FROM songs').get().c,
      artists: db.prepare('SELECT count(*) c FROM artists').get().c,
      lyrics: db.prepare('SELECT count(*) c FROM lyrics_fts').get().c,
      comments: db.prepare('SELECT count(*) c FROM comments_fts').get().c,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== 用户系统：注册/登录/我推/广场 ==========
const { getDb: getAuthDb, hashPassword, verifyPassword, signToken, authMiddleware, validateString } = require('./auth_db');

// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname } = req.body || {};
  let err = validateString(username, '用户名', 2, 20) || validateString(password, '密码', 3, 50);
  if (err) return res.status(400).json({ error: err });
  try {
    const db = getAuthDb();
    const { hash, salt } = hashPassword(password);
    db.prepare('INSERT INTO users (username, password_hash, salt, nickname) VALUES (?,?,?,?)').run(username, hash, salt, nickname || username);
    const user = db.prepare('SELECT id FROM users WHERE username=?').get(username);
    res.json({ token: signToken(user.id), user: { id: user.id, username, nickname: nickname || username } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: e.message });
  }
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  let err = validateString(username, '用户名', 1, 20) || validateString(password, '密码', 1, 50);
  if (err) return res.status(400).json({ error: err });
  const db = getAuthDb();
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !verifyPassword(password, user.password_hash, user.salt)) return res.status(401).json({ error: '用户名或密码错误' });
  res.json({ token: signToken(user.id), user: { id: user.id, username: user.username, nickname: user.nickname || user.username, avatar: user.avatar } });
});

// 当前用户信息
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const db = getAuthDb();
  const user = db.prepare('SELECT id,username,nickname,avatar FROM users WHERE id=?').get(req.userId);
  res.json(user || { error: 'not found' });
});

// 创建我推
app.post('/api/collections', authMiddleware, (req, res) => {
  const { name, description, cover, items } = req.body || {};
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const db = getAuthDb();
  const result = db.prepare('INSERT INTO collections (user_id,name,description,cover) VALUES (?,?,?,?)').run(req.userId, name, description || '', cover || '');
  const cid = result.lastInsertRowid;
  for (const it of items) {
    stmt.run(cid, it.type || 'song', it.id, it.name || '', it.artist || '');
  }
  res.json({ id: cid, name });
});

// 我的我推列表
app.get('/api/collections/mine', authMiddleware, (req, res) => {
  const db = getAuthDb();
  const rows = db.prepare('SELECT * FROM collections WHERE user_id=? ORDER BY created_at DESC').all(req.userId);
  res.json(rows);
});

// 已爱心的我推
app.get('/api/collections/liked', authMiddleware, (req, res) => {
  const db = getAuthDb();
  const rows = db.prepare(`
    SELECT c.*, u.nickname FROM collections c
    JOIN users u ON c.user_id=u.id
    WHERE c.id IN (SELECT collection_id FROM collection_likes WHERE user_id=?)
    ORDER BY c.created_at DESC
  `).all(req.userId);
  res.json(rows);
});

// 我推详情（含内容）
app.get('/api/collections/:id', (req, res) => {
  const db = getAuthDb();
  const col = db.prepare('SELECT c.*, u.nickname, u.avatar as user_avatar FROM collections c JOIN users u ON c.user_id=u.id WHERE c.id=?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'not found' });
  const itemsRaw = db.prepare('SELECT * FROM collection_items WHERE collection_id=? ORDER BY added_at').all(req.params.id);
  // 为每个条目附加评论
  const items = itemsRaw.map(it => {
    const itemComments = db.prepare('SELECT ic.*, u.nickname FROM item_comments ic JOIN users u ON ic.user_id=u.id WHERE ic.item_id=? ORDER BY ic.created_at DESC').all(it.id);
    return { ...it, comments: itemComments };
  });
  const comments = db.prepare('SELECT cc.*, u.nickname FROM collection_comments cc JOIN users u ON cc.user_id=u.id WHERE cc.collection_id=? ORDER BY cc.created_at DESC').all(req.params.id);
  res.json({ ...col, items, comments });
});

// 编辑我推
app.put('/api/collections/:id', authMiddleware, (req, res) => {
  const { name, description, items } = req.body || {};
  const db = getAuthDb();
  const col = db.prepare('SELECT * FROM collections WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!col) return res.status(403).json({ error: '无权操作' });
  if (name) db.prepare('UPDATE collections SET name=?,description=? WHERE id=?').run(name, description || '', req.params.id);
  if (items) {
    if (req.body.replace === 1 || req.body.replace === true) {
      db.prepare('DELETE FROM collection_items WHERE collection_id=?').run(req.params.id);
    }
    const stmt = db.prepare('INSERT OR IGNORE INTO collection_items (collection_id,item_type,item_id,item_name,item_artist) VALUES (?,?,?,?,?)');
    for (const it of items) stmt.run(req.params.id, it.type, it.id, it.name || '', it.artist || '');
  }
  res.json({ ok: true });
});

// 删除我推
app.delete('/api/collections/:id', authMiddleware, (req, res) => {
  const db = getAuthDb();
  const col = db.prepare('SELECT * FROM collections WHERE id=? AND user_id=?').get(req.params.id, req.userId);
  if (!col) return res.status(403).json({ error: '无权操作' });
  db.prepare('DELETE FROM collection_likes WHERE collection_id=?').run(req.params.id);
  db.prepare('DELETE FROM collection_comments WHERE collection_id=?').run(req.params.id);
  db.prepare('DELETE FROM collections WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 点赞/取消点赞
app.post('/api/collections/:id/like', authMiddleware, (req, res) => {
  const db = getAuthDb();
  const existing = db.prepare('SELECT id FROM collection_likes WHERE collection_id=? AND user_id=?').get(req.params.id, req.userId);
  if (existing) {
    db.prepare('DELETE FROM collection_likes WHERE id=?').run(existing.id);
    db.prepare('UPDATE collections SET like_count=MAX(0,like_count-1) WHERE id=?').run(req.params.id);
    res.json({ liked: false });
  } else {
    db.prepare('INSERT INTO collection_likes (collection_id,user_id) VALUES (?,?)').run(req.params.id, req.userId);
    db.prepare('UPDATE collections SET like_count=like_count+1 WHERE id=?').run(req.params.id);
    res.json({ liked: true });
  }
});

// 评论我推
app.post('/api/collections/:id/comment', authMiddleware, (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: '内容不能为空' });
  const db = getAuthDb();
  db.prepare('INSERT INTO collection_comments (collection_id,user_id,content) VALUES (?,?,?)').run(req.params.id, req.userId, content);
  db.prepare('UPDATE collections SET comment_count=comment_count+1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 条目点赞
app.post("/api/items/:id/like", authMiddleware, (req, res) => {
  const db = getAuthDb();
  const existing = db.prepare("SELECT id FROM item_likes WHERE item_id=? AND user_id=?").get(req.params.id, req.userId);
  if (existing) {
    db.prepare("DELETE FROM item_likes WHERE id=?").run(existing.id);
    db.prepare("UPDATE collection_items SET like_count=MAX(0,like_count-1) WHERE id=?").run(req.params.id);
    res.json({ liked: false });
  } else {
    db.prepare("INSERT INTO item_likes (item_id,user_id) VALUES (?,?)").run(req.params.id, req.userId);
    db.prepare("UPDATE collection_items SET like_count=like_count+1 WHERE id=?").run(req.params.id);
    res.json({ liked: true });
  }
});

// 条目评论
app.post("/api/items/:id/comment", authMiddleware, (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "内容不能为空" });
  const db = getAuthDb();
  db.prepare("INSERT INTO item_comments (item_id,user_id,content) VALUES (?,?,?)").run(req.params.id, req.userId, content);
  res.json({ ok: true });
});

// 广场：公开我推列表
app.get('/api/square', (req, res) => {
  const db = getAuthDb();
  const rows = db.prepare('SELECT c.*, u.nickname, u.avatar as user_avatar FROM collections c JOIN users u ON c.user_id=u.id WHERE c.is_public=1 AND c.id IN (SELECT DISTINCT collection_id FROM collection_items) ORDER BY c.like_count DESC, c.created_at DESC LIMIT 50').all();
  res.json(rows);
});

// ---------- 歌词地图：按地名查歌曲 ----------
app.get('/api/lyric_places/songs', (req, res) => {
  if (needDb(res)) return;
  const place = (req.query.place || '').trim();
  if (!place) return res.status(400).json({ error: 'need place' });
  try {
    const rows = db.prepare(`
      SELECT l.song_id, l.name, l.artist_name, l.year, s.comment_total, l.topic_name,
             substr(l.lyric, 1, 200) as lyric_snippet
      FROM lyrics_clean l LEFT JOIN songs s ON l.song_id = s.song_id
      WHERE l.lyric LIKE ? ORDER BY s.comment_total DESC LIMIT 50
    `).all(`%${place}%`);
    res.json({ place, total: rows.length, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- 通用聚合数据接口：/api/<name> -> web/data/<name>.json ----------
app.get('/api/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
  const file = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'no data: ' + name + ' (请先运行 Spark 作业)' });
  }
  res.type('application/json').send(fs.readFileSync(file, 'utf-8'));
});

// 列出可用数据集
app.get('/api', (req, res) => {
  const files = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    : [];
  res.json({ datasets: files, search: !!db });
});

app.listen(PORT, () => {
  console.log(`云律运行中：http://localhost:${PORT}`);
});

// 优雅关闭：checkpoint 用户数据库
process.on('SIGINT', () => {
  try { const db = getAuthDb(); db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  process.exit(0);
});
process.on('SIGTERM', () => {
  try { const db = getAuthDb(); db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  process.exit(0);
});
