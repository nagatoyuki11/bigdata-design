// 用户系统数据库模块：SQLite 建表 + JWT 鉴权
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'user.db');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        nickname TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover TEXT DEFAULT '',
        is_public INTEGER DEFAULT 1,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS collection_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT DEFAULT '',
        item_artist TEXT DEFAULT '',
        note TEXT DEFAULT '',
        added_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (collection_id) REFERENCES collections(id)
      );
      CREATE TABLE IF NOT EXISTS collection_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(collection_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS collection_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (collection_id) REFERENCES collections(id)
      );
    `);
    // Auto-migrate: add salt column if missing (for existing DBs without it)
    try { db.exec("ALTER TABLE users ADD COLUMN salt TEXT DEFAULT ''"); } catch {}
  }
  return db;
}

// 密码哈希：scrypt + 随机盐
function hashPassword(password, existingSalt) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  if (!storedSalt) {
    // 兼容旧数据：无 salt 时用旧的 HMAC 方式校验
    const oldHash = crypto.createHmac('sha256', 'yueping2024').update(password).digest('hex');
    return oldHash === storedHash;
  }
  const { hash } = hashPassword(password, storedSalt);
  return hash === storedHash;
}

// JWT
function signToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (sig !== parts[2]) return null;
    return payload.sub;
  } catch { return null; }
}

// 鉴权中间件
function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token || '';
  if (!token) return res.status(401).json({ error: '请先登录' });
  const userId = verifyToken(token);
  if (!userId) return res.status(401).json({ error: '登录已过期' });
  req.userId = userId;
  next();
}

// 输入校验
function validateString(val, name, min, max) {
  if (typeof val !== 'string' || !val.trim()) return `${name}不能为空`;
  if (val.trim().length < min) return `${name}至少${min}个字符`;
  if (val.trim().length > max) return `${name}不能超过${max}个字符`;
  return null;
}

// 初始化
getDb();

module.exports = { getDb, hashPassword, verifyPassword, signToken, verifyToken, authMiddleware, validateString };
