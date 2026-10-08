import React, { useState } from 'react';
import { Card, Input, Select, Button, Space, Empty } from 'antd';
import { useSearchSongs, useDbStats } from '../api/endpoints';
import SongRow from '../components/SongRow';
import Pager from '../components/Pager';
import { useDrawer } from '../context/DrawerContext';

export default function DbSongView() {
  const { openDrawer } = useDrawer();
  const [q, setQ] = useState('');
  const [ymin, setYmin] = useState('');
  const [ymax, setYmax] = useState('');
  const [cmin, setCmin] = useState('');
  const [dmin, setDmin] = useState('');
  const [sort, setSort] = useState('comment');
  const [page, setPage] = useState(0);
  const limit = 20;

  const params: Record<string, string> = { sort, limit: String(limit), page: String(page) };
  if (q.trim()) params.q = q.trim();
  if (ymin) params.yearMin = ymin;
  if (ymax) params.yearMax = ymax;
  if (cmin) params.cmtMin = cmin;
  if (dmin) params.durMin = dmin;

  const { data, isLoading } = useSearchSongs(params);
  const { data: stats } = useDbStats();

  const reset = () => { setQ(''); setYmin(''); setYmax(''); setCmin(''); setDmin(''); setSort('comment'); setPage(0); };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>歌曲库 · 复合检索</h3>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>
          在 <b style={{ color: 'var(--accent)' }}>{stats ? stats.songs.toLocaleString() : '—'}</b> 首华语歌曲中按多条件组合检索。
        </p>
        <Space wrap style={{ marginTop: 8 }}>
          <Input placeholder="歌名 / 歌手" value={q} onChange={e => setQ(e.target.value)} style={{ width: 160 }} onPressEnter={() => setPage(0)} />
          <Input placeholder="年份从" type="number" value={ymin} onChange={e => setYmin(e.target.value)} style={{ width: 100 }} />
          <Input placeholder="年份到" type="number" value={ymax} onChange={e => setYmax(e.target.value)} style={{ width: 100 }} />
          <Input placeholder="评论数≥" type="number" value={cmin} onChange={e => setCmin(e.target.value)} style={{ width: 120 }} />
          <Input placeholder="时长≥(秒)" type="number" value={dmin} onChange={e => setDmin(e.target.value)} style={{ width: 120 }} />
          <Select value={sort} onChange={v => { setSort(v); setPage(0); }} style={{ width: 130 }}
            options={[{ value: 'comment', label: '真实评论数' }, { value: 'liked', label: '评论点赞' }, { value: 'pop', label: '官方热度' }, { value: 'year', label: '发行年份' }]} />
          <Button type="primary" onClick={() => setPage(0)}>检索</Button>
          <Button onClick={reset}>重置</Button>
        </Space>
      </Card>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>共 <b style={{ color: 'var(--accent)' }}>{data?.total ?? 0}</b> 条结果</span>
          {data && <Pager total={data.total} page={data.page} limit={data.limit} onChange={setPage} />}
        </div>
        {isLoading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中...</div> :
          !data || data.rows.length === 0 ? <Empty description="无匹配结果，试试放宽条件" /> :
            data.rows.map(s => <SongRow key={s.song_id} s={s} onClick={() => openDrawer('song', { songId: s.song_id })} />)}
      </Card>
    </div>
  );
}
