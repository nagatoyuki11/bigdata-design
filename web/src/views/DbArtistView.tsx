import React, { useState } from 'react';
import { Card, Input, Button, Checkbox, Space, Empty } from 'antd';
import { useSearchArtists } from '../api/endpoints';
import ArtistRow from '../components/ArtistRow';
import Pager from '../components/Pager';
import { useDrawer } from '../context/DrawerContext';

export default function DbArtistView() {
  const { openDrawer } = useDrawer();
  const [q, setQ] = useState('');
  const [hmin, setHmin] = useState('');
  const [smin, setSmin] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 20;

  const params: Record<string, string> = { limit: String(limit), page: String(page) };
  if (q.trim()) params.q = q.trim();
  if (hmin) params.heatMin = hmin;
  if (smin) params.songMin = smin;
  if (showAll) params.all = '1';

  const { data, isLoading } = useSearchArtists(params);
  const reset = () => { setQ(''); setHmin(''); setSmin(''); setShowAll(false); setPage(0); };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>歌手库</h3>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>
          默认仅展示 <b style={{ color: 'var(--accent)' }}>真实歌手（评论总数 ≥ 100）</b>，可勾选查看全部。
        </p>
        <Space wrap style={{ marginTop: 8 }}>
          <Input placeholder="歌手名" value={q} onChange={e => setQ(e.target.value)} style={{ width: 160 }} onPressEnter={() => setPage(0)} />
          <Input placeholder="影响力≥" type="number" value={hmin} onChange={e => setHmin(e.target.value)} style={{ width: 110 }} />
          <Input placeholder="作品数≥" type="number" value={smin} onChange={e => setSmin(e.target.value)} style={{ width: 110 }} />
          <Checkbox checked={showAll} onChange={e => { setShowAll(e.target.checked); setPage(0); }}>显示全部歌手</Checkbox>
          <Button type="primary" onClick={() => setPage(0)}>检索</Button>
          <Button onClick={reset}>重置</Button>
        </Space>
      </Card>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>共 <b style={{ color: 'var(--accent)' }}>{data?.total ?? 0}</b> 位歌手</span>
          {data && <Pager total={data.total} page={data.page} limit={data.limit} onChange={setPage} />}
        </div>
        {isLoading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中...</div> :
          !data || data.rows.length === 0 ? <Empty description="无匹配歌手" /> :
            data.rows.map(a => <ArtistRow key={a.artist_id} a={a} onClick={() => openDrawer('artist', { artistId: a.artist_id })} />)}
      </Card>
    </div>
  );
}
