import React, { useState } from 'react';
import { Card, Row, Col, Spin, Select, Tag, Empty } from 'antd';
import { useApi } from '../api/endpoints';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

interface YearData {
  year: number; song_count: number; total_cmt: number;
  top_songs: { name: string; artist: string; album: string; cmt: number; topic: string }[];
  top_artists: { name: string; cmt: number; songs: number }[];
  top_topics: { name: string; cnt: number }[];
  top_words: { word: string; count: number }[];
  comment: string;
}

export default function YearReportView() {
  const { data } = useApi<YearData[]>('year_report');
  const [year, setYear] = useState(2020);

  if (!data) return <Spin />;
  const sel = data.find(d => d.year === year) || data[0];
  if (!sel) return <Empty description="暂无数据" />;

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 28 }}>{sel.year}</span>
            <span style={{ color: 'var(--accent)', fontSize: 16, fontWeight: 600 }}>华语乐坛年度报告</span>
            <Select value={year} onChange={setYear} style={{ width: 100, marginLeft: 'auto' }}
              options={data.map(d => ({ value: d.year, label: String(d.year) }))} />
          </div>
        </Card>
      </Col>

      {/* 点评 */}
      <Col span={24}>
        <Card size="small">
          <div style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.8 }}>
            <b style={{ color: 'var(--accent)' }}>📊 云律点评：</b>
            {sel.comment}
          </div>
        </Card>
      </Col>

      {/* 数据卡片 */}
      <Col xs={12} md={6}>
        <Card size="small"><div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: 'var(--accent)', fontWeight: 700 }}>{F(sel.total_cmt)}</div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>年度总评论</div>
        </div></Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small"><div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: 'var(--accent)', fontWeight: 700 }}>{sel.song_count}</div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>产出歌曲</div>
        </div></Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small"><div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: 'var(--accent)', fontWeight: 700 }}>{sel.top_artists[0]?.name || '—'}</div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>年度歌手</div>
        </div></Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small"><div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, color: 'var(--accent)', fontWeight: 700 }}>{sel.top_topics[0]?.name || '—'}</div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>年度主题</div>
        </div></Card>
      </Col>

      {/* 榜单 */}
      <Col xs={24} md={12}>
        <Card title="🏆 年度金曲" size="small">
          {sel.top_songs.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border2)', fontSize: 13 }}>
              <span><b style={{ color: 'var(--accent)' }}>{i + 1}</b>. {s.name} — <span style={{ color: 'var(--text2)' }}>{s.artist}</span></span>
              <span style={{ color: 'var(--accent)' }}>{F(s.cmt)}</span>
            </div>
          ))}
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="🎤 年度歌手" size="small">
          {sel.top_artists.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border2)', fontSize: 13 }}>
              <span><b style={{ color: 'var(--accent)' }}>{i + 1}</b>. {a.name}</span>
              <span style={{ color: 'var(--text2)' }}>{F(a.cmt)} 评 · {a.songs}首</span>
            </div>
          ))}
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="📝 年度主题" size="small">
          {sel.top_topics.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border2)', fontSize: 13 }}>
              <span><b style={{ color: 'var(--accent)' }}>{i + 1}</b>. {t.name}</span>
              <span style={{ color: 'var(--text2)' }}>{t.cnt}首</span>
            </div>
          ))}
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="💬 年度热词" size="small">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sel.top_words.map((w, i) => (
              <Tag key={i} color={i < 3 ? 'red' : 'default'} style={{ fontSize: Math.max(12, 10 + Math.log2(w.count / 10) * 3) }}>
                {w.word} {w.count}
              </Tag>
            ))}
          </div>
        </Card>
      </Col>
    </Row>
  );
}
