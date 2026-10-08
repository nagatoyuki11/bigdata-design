import React, { useState } from 'react';
import { Card, Input, Select, Button, Space, Empty, Tag } from 'antd';
import { useSearchComments } from '../api/endpoints';
import Pager from '../components/Pager';
import { useDrawer } from '../context/DrawerContext';
import AddToCollectionBtn from "../components/AddToCollectionBtn";

const SENT_COLORS: Record<string, string> = { '正向': 'green', '负向': 'red', '中性': 'default' };

export default function DbCommentView() {
  const { openDrawer } = useDrawer();
  const [q, setQ] = useState('');
  const [sent, setSent] = useState('');
  const [lmin, setLmin] = useState('');
  const [song, setSong] = useState('');
  const [artist, setArtist] = useState('');
  const [sort, setSort] = useState('liked');
  const [page, setPage] = useState(0);
  const limit = 20;

  const params: Record<string, string> = { sort, limit: String(limit), page: String(page) };
  if (q.trim()) params.q = q.trim();
  if (sent) params.sentiment = sent;
  if (lmin) params.likedMin = lmin;
  if (song.trim()) params.song = song.trim();
  if (artist.trim()) params.artist = artist.trim();

  const { data, isLoading } = useSearchComments(params);

  const reset = () => { setQ(''); setSent(''); setLmin(''); setSong(''); setArtist(''); setSort('liked'); setPage(0); };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>评论全文检索</h3>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>在 179 万条评论中全文检索，可叠加歌曲/歌手/情感/点赞筛选。</p>
        <Space wrap style={{ marginTop: 8 }}>
          <Input placeholder="关键词（如 想哭）" value={q} onChange={e => setQ(e.target.value)} style={{ width: 180 }} onPressEnter={() => setPage(0)} />
          <Input placeholder="歌曲名" value={song} onChange={e => setSong(e.target.value)} style={{ width: 140 }} onPressEnter={() => setPage(0)} />
          <Input placeholder="歌手名" value={artist} onChange={e => setArtist(e.target.value)} style={{ width: 140 }} onPressEnter={() => setPage(0)} />
          <Select placeholder="情感" value={sent || undefined} onChange={v => { setSent(v || ''); setPage(0); }} style={{ width: 90 }} allowClear
            options={[{ value: '正向', label: '正向' }, { value: '中性', label: '中性' }, { value: '负向', label: '负向' }]} />
          <Input placeholder="点赞≥" type="number" value={lmin} onChange={e => setLmin(e.target.value)} style={{ width: 90 }} />
          <Select value={sort} onChange={v => { setSort(v); setPage(0); }} style={{ width: 110 }}
            options={[{ value: 'liked', label: '按点赞' }, { value: 'relevance', label: '按相关度' }]} />
          <Button type="primary" onClick={() => setPage(0)}>检索</Button>
          <Button onClick={reset}>重置</Button>
        </Space>
      </Card>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            共 <b style={{ color: 'var(--accent)' }}>{data?.total ?? 0}</b> 条结果
            {data?.mode === 'fts' && <Tag color="green" style={{ marginLeft: 6 }}>FTS5</Tag>}
            {data?.mode === 'like' && <Tag style={{ marginLeft: 6 }}>LIKE</Tag>}
          </span>
          {data && <Pager total={data.total} page={data.page} limit={data.limit} onChange={setPage} />}
        </div>
        {isLoading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中...</div> :
          !data || data.rows.length === 0 ? <Empty description="无匹配评论" /> :
            data.rows.map((c, i) => (
              <div key={i} onClick={() => openDrawer('song', { songId: c.song_id })} style={{ cursor: 'pointer', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>{c.content}</div>
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
                  歌曲《{c.name || '?'}》 歌手 {c.artist_name || '?'}
                  <Tag color={SENT_COLORS[c.sentiment] || 'default'} style={{ marginLeft: 6 }}>{c.sentiment}</Tag>
                <AddToCollectionBtn itemType="comment" itemId={c.song_id} itemName={c.content || ""} itemArtist={(c.name || '?') + ' — ' + (c.artist_name || '?')} />
                </div>
                <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>点赞 {c.liked >= 1e4 ? (c.liked / 1e4).toFixed(1) + '万' : c.liked}</div>
              </div>
            ))}
      </Card>
    </div>
  );
}
