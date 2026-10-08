import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Spin, Button, Select, Tag } from 'antd';
import { LikeOutlined, MehOutlined, DislikeOutlined, FireOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useApi } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

type SongBrief = { song_id: string; name: string; artist_name: string; comment_total?: number; comment_count?: number; topic_name?: string; album?: string; year?: number; pop?: number };
type ClusterInfo = { song_id: string; cluster: number; comment_total: number };

const CLUSTER_LABEL: Record<number, string> = { 0: '冷门宝藏', 1: '热门金曲', 2: '超长混音' };
const CLUSTER_COLOR: Record<number, string> = { 0: 'blue', 1: 'red', 2: 'purple' };

export default function MoodView() {
  const { openDrawer } = useDrawer();
  const [reaction, setReaction] = useState<'like'|'meh'|'dislike'|null>(null);
  // 原有点歌数据
  const { data: mp } = useApi<Record<string, SongBrief[]>>('mood_playlist');
  const { data: rec } = useApi<any>('recommend');
  // 新增
  const { data: picks } = useApi<SongBrief[]>('daily_picks');
  const { data: cross } = useApi<Record<string, SongBrief[]>>('cross_recommend');
  // 聚类数据
  const { data: kmeans } = useApi<ClusterInfo[]>('kmeans_clusters');

  const [mood, setMood] = useState('');
  const [selId, setSelId] = useState('');
  const [decade, setDecade] = useState('all');
  const [popFilter, setPopFilter] = useState('all');
  const [clusterFilter, setClusterFilter] = useState('all');

  // Build cluster lookup map (force string keys: kmeans stores string, mood_playlist stores int)
  const clusterMap = useMemo(() => {
    if (!kmeans) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const c of kmeans) m.set(String(c.song_id), c.cluster);
    return m;
  }, [kmeans]);

  const moods = mp ? Object.keys(mp) : [];
  const rawSongs = mood && mp ? (mp[mood] || []) : [];
  const recSongs = rec ? Object.keys(rec) : [];
  const selRec = selId && rec ? rec[selId] : null;

  // 多维筛选
  const decadeFilter = (s: SongBrief) => {
    if (decade === 'all') return true;
    const y = s.year || 2020;
    const ranges: Record<string, [number, number]> = { '1970s': [1970, 1979], '1980s': [1980, 1989], '1990s': [1990, 1999], '2000s': [2000, 2009], '2010s': [2010, 2019], '2020s': [2020, 2026] };
    const [lo, hi] = ranges[decade] || [0, 9999];
    return y >= lo && y <= hi;
  };
  const popFilterFn = (s: SongBrief) => {
    const cmt = s.comment_total || s.comment_count || 0;
    if (popFilter === 'hot') return cmt >= 50000;
    if (popFilter === 'cold') return cmt > 0 && cmt < 10000;
    return true;
  };
  const clusterFilterFn = (s: SongBrief) => {
    if (clusterFilter === 'all') return true;
    const c = clusterMap.get(String(s.song_id));
    return c !== undefined && c === Number(clusterFilter);
  };
  const songs = useMemo(() => rawSongs.filter(decadeFilter).filter(popFilterFn).filter(clusterFilterFn), [rawSongs, decade, popFilter, clusterFilter, clusterMap]);

  return (
    <Row gutter={[16, 16]}>
      {/* 每日精选 */}
      {picks && (
        <Col span={24}>
          <Card title="每日精选" size="small"
            extra={
              <div style={{ display: 'flex', gap: 4 }}>
                <Button size="small" type={reaction === 'like' ? 'primary' : 'default'} icon={<LikeOutlined />}
                  onClick={() => setReaction(reaction === 'like' ? null : 'like')}
                  style={reaction === 'like' ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>喜欢</Button>
                <Button size="small" type={reaction === 'meh' ? 'primary' : 'default'} icon={<MehOutlined />}
                  onClick={() => setReaction(reaction === 'meh' ? null : 'meh')}
                  style={reaction === 'meh' ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}}>一般</Button>
                <Button size="small" type={reaction === 'dislike' ? 'primary' : 'default'} icon={<DislikeOutlined />}
                  onClick={() => setReaction(reaction === 'dislike' ? null : 'dislike')}
                  style={reaction === 'dislike' ? { background: '#ef4444', borderColor: '#ef4444' } : {}}>讨厌</Button>
              </div>
            }>
            {reaction && <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 8 }}>
              {reaction === 'like' ? '👍 感谢反馈，会推荐更多类似歌曲' : reaction === 'meh' ? '😑 收到，下次换换口味' : '👎 了解，会调整推荐策略'}
            </div>}
            <Row gutter={[12, 12]}>
              {picks.map((s, i) => (
                <Col key={i} xs={12} sm={8} md={6} lg={4}>
                  <div onClick={() => openDrawer('song', { songId: s.song_id })}
                    style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', height: '100%', cursor: 'pointer', transition: 'border-color .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#a855f7')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 11 }}>{s.artist_name}</div>
                    {s.topic_name && <Tag color="purple" style={{ marginTop: 4, fontSize: 10 }}>{s.topic_name}</Tag>}
                    {(() => { const cc = clusterMap.get(String(s.song_id)); return cc !== undefined ? <Tag color={CLUSTER_COLOR[cc] || 'default'} style={{ marginTop: 2, fontSize: 10 }}>{CLUSTER_LABEL[cc]}</Tag> : null; })()}
                    <div style={{ color: 'var(--accent)', fontSize: 11, marginTop: 2 }}>{F(s.comment_total || 0)} 评</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      )}

      {/* 情绪点歌 + 多维筛选 */}
      <Col xs={24} md={12}>
        <Card title="情绪点歌" size="small">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {moods.map(m => (
              <Button key={m} type={mood === m ? 'primary' : 'default'} onClick={() => setMood(m)} size="small">{m}</Button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Select value={decade} onChange={setDecade} style={{ width: 100 }} size="small"
              options={['all', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'].map(d => ({ value: d, label: d === 'all' ? '全部年代' : d }))} />
            <Select value={popFilter} onChange={setPopFilter} style={{ width: 100 }} size="small"
              options={[{ value: 'all', label: '全部热度' }, { value: 'hot', label: '热门' }, { value: 'cold', label: '冷门' }]} />
            <Select value={clusterFilter} onChange={setClusterFilter} style={{ width: 110 }} size="small"
              options={[{ value: 'all', label: '全部聚类' }, { value: '1', label: '🔥 热门金曲' }, { value: '0', label: '💎 冷门宝藏' }, { value: '2', label: '🎛️ 超长混音' }]} />
          </div>
          {mood && songs.slice(0, 30).map(s => {
            const cc = clusterMap.get(String(s.song_id));
            return (
            <div key={s.song_id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)', fontSize: 13 }}>
              <span>{s.name} — {s.artist_name} {cc !== undefined && <Tag color={CLUSTER_COLOR[cc]} style={{ marginLeft: 4, fontSize: 10 }}>{CLUSTER_LABEL[cc]}</Tag>}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{F(s.comment_total || s.comment_count || 0)} 评</span>
            </div>
          )})}
        </Card>
      </Col>

      {/* 跨主题 / 维度推荐 */}
      <Col xs={24} md={12}>
        <Card title="跨维度推荐" size="small">
          <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 8 }}>
            选择一个主题，发现<b style={{ color: '#a855f7' }}>其他主题</b>中的高质量歌曲。
          </p>
          {cross && Object.keys(cross).slice(0, 8).map(t => (
            <div key={t} style={{ marginBottom: 12 }}>
              <div style={{ color: '#a855f7', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>不同于「{t}」的推荐：</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(cross[t] || []).slice(0, 4).map((s: any, i: number) => {
                  const cc = clusterMap.get(String(s.song_id));
                  return (
                    <Tag key={i} color="purple" style={{ cursor: 'pointer' }} onClick={() => openDrawer('song', { songId: s.song_id })}>
                      {s.name} — {s.artist_name}
                      {cc !== undefined && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>[{CLUSTER_LABEL[cc]}]</span>}
                    </Tag>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      </Col>

      {/* 相似歌曲推荐（保留） */}
      <Col span={24}>
        <Card title=" 相似歌曲推荐" size="small">
          <Select placeholder="选择一首歌曲..." value={selId || undefined} onChange={setSelId} style={{ width: '100%', maxWidth: 400, marginBottom: 12 }} showSearch
            filterOption={(input, option) => (option?.label as string || '').includes(input)}
            options={recSongs.map(id => {
              const r = rec[id];
              return { value: id, label: `${r.name} — ${r.artist} (${r.topic})` };
            })} allowClear onClear={() => setSelId('')} />
          {selRec && (
            <div>
              <div style={{ color: 'var(--text2)', marginBottom: 8 }}>基于「{selRec.name}」的相似推荐：</div>
              {(selRec.similar || []).slice(0, 12).map((r: any, i: number) => (
                <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', color: 'var(--text)', fontSize: 13 }}>
                  <span>{r.name} — {r.artist} <span style={{ color: 'var(--text3)', fontSize: 11 }}>({r.topic})</span></span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{(r.score || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}
