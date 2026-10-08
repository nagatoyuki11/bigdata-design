import React, { useState } from 'react';
import { Card, Row, Col, Spin, Slider, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';

const F = (n: number) => n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

export default function EraView() {
  const { data } = useApi<{ years: { year: number; words: { w: string; count: number }[]; songs: { name: string; artist: string; comment_total: number }[] }[] }>('era_timeline');
  const [idx, setIdx] = useState(0);

  if (!data) return <Spin />;
  const years = data.years || [];
  const cur = years[idx];
  if (!cur) return <Empty description="暂无年代数据" />;

  const wcOption = {
    backgroundColor: 'transparent',
    series: [{ type: 'wordCloud', shape: 'circle', sizeRange: [14, 42], rotationRange: [-45, 45],
      data: cur.words.slice(0, 60).map((d: any) => ({ name: d.w, value: d.count })) }]
  };

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="年代时光机" size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <span style={{ color: 'var(--text2)', fontSize: 13 }}>年份：</span>
            <Slider min={0} max={years.length - 1} value={idx} onChange={v => setIdx(v)} style={{ flex: 1 }} />
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 24, minWidth: 60 }}>{cur.year}</span>
          </div>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title={`${cur.year} 高频意象词云`} size="small">
          <ReactECharts option={wcOption} style={{ height: 320 }} />
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title={`${cur.year} 热歌榜`} size="small">
          {cur.songs.slice(0, 20).map((s, i) => (
            <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', color: 'var(--text)', fontSize: 13 }}>
              <span>{s.name} — {s.artist}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{F(s.comment_total)}</span>
            </div>
          ))}
        </Card>
      </Col>
    </Row>
  );
}
