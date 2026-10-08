import React from 'react';
import { Card, Row, Col, Tag, Spin, Progress } from 'antd';
import { useApi } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

interface Album {
  album: string; artist: string; song_cnt: number;
  total_cmt: number; avg_pop: number; topics: string[];
  coherence: number; first_year: number; last_year: number; concept_score: number;
}

export default function AlbumView() {
  const { data } = useApi<Album[]>('album_rank');
  const { openDrawer } = useDrawer();
  if (!data) return <Spin />;

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="专辑宇宙 · 概念专辑排行" size="small">
          <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>
            按「概念专辑度」排序：主题越一致、评论越集中的专辑得分越高。点击专辑可展开歌曲列表（后续可接 Song 搜索）。
          </p>
        </Card>
      </Col>
      {data.map((a, i) => (
        <Col key={i} xs={24} sm={12} md={8} lg={6}>
          <Card size="small" hoverable onClick={() => openDrawer('album', { albumName: a.album })}
            title={<span style={{ fontSize: 14, fontWeight: 700 }}>{a.album}</span>}
            style={{ height: '100%' }}>
            <div style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 8 }}>{a.artist}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {a.topics.map((t, j) => <Tag key={j} color="red" style={{ fontSize: 11 }}>{t}</Tag>)}
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 4 }}>
              {a.song_cnt} 首 · {a.first_year === a.last_year ? a.first_year : `${a.first_year}-${a.last_year}`}
            </div>
            <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              总评论 {F(a.total_cmt)} · 热度 {a.avg_pop}
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 11 }}>
              主题一致性 {(a.coherence * 100).toFixed(0)}%
            </div>
            <Progress percent={Math.min(Math.round(a.concept_score * 10), 100)} strokeColor="#a855f7" size="small" showInfo={false} style={{ marginTop: 4 }} />
            <div style={{ color: '#a855f7', fontSize: 10 }}>概念度 {a.concept_score}</div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
