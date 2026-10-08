import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Spin, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';

const AX = { axisLine: { lineStyle: { color: '#cccccc' } }, axisLabel: { color: 'var(--text2)' }, splitLine: { lineStyle: { color: '#eeeeee' } } };
const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

export default function ArtistView() {
  const { data: ap } = useApi<any[]>('artist_profile');
  const [idx, setIdx] = useState(0);

  const top12 = useMemo(() => ap ? [...ap].slice(0, 12).reverse() : [], [ap]);
  const sel = ap && ap[idx];

  const inflOption = top12.length ? {
    backgroundColor: 'transparent', grid: { left: 120, right: 40, top: 10, bottom: 20 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', ...AX }, yAxis: { type: 'category', data: top12.map((d: any) => d.artist_name), ...AX },
    series: [{ type: 'bar', data: top12.map((d: any) => d.influence), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#991111' }, { offset: 1, color: '#ff7aa2' }] }, borderRadius: [0, 4, 4, 0] } }]
  } : undefined;

  const radarOption = sel ? {
    backgroundColor: 'transparent', tooltip: {},
    radar: {
      indicator: [
        { name: '作品数', max: Math.max(...(ap || []).map((x: any) => x.song_num || 1)) },
        { name: '评论', max: Math.max(...(ap || []).map((x: any) => x.comments || 1)) },
        { name: '点赞', max: Math.max(...(ap || []).map((x: any) => x.likes || 1)) },
        { name: '热度', max: 100 }, { name: '影响力', max: Math.max(...(ap || []).map((x: any) => x.influence || 1)) }
      ],
      axisName: { color: 'var(--text2)' }, splitLine: { lineStyle: { color: 'var(--border)' } }
    },
    series: [{ type: 'radar', areaStyle: { opacity: 0.3 }, itemStyle: { color: 'var(--accent)' }, data: [{ value: [sel.song_num, sel.comments, sel.likes, sel.avg_pop, sel.influence], name: sel.artist_name }] }]
  } : undefined;

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="歌手影响力排行" size="small">{inflOption ? <ReactECharts option={inflOption} style={{ height: 380 }} /> : <Spin />}</Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="歌手词风雷达" size="small" extra={
          <select value={idx} onChange={e => setIdx(+e.target.value)}
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12 }}>
            {(ap || []).map((d: any, i: number) => <option key={i} value={i}>{d.artist_name}</option>)}
          </select>
        }>
          {radarOption ? <ReactECharts option={radarOption} style={{ height: 320 }} /> : <Spin />}
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="歌手画像明细" size="small">
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text2)' }}>{['歌手', '作品', '评论', '点赞', '影响力', '词风'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {(ap || []).slice(0, 20).map((d: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                    <td style={{ padding: '5px 8px' }}>{d.artist_name}</td>
                    <td style={{ padding: '5px 8px' }}>{d.song_num}</td>
                    <td style={{ padding: '5px 8px' }}>{F(d.comments)}</td>
                    <td style={{ padding: '5px 8px' }}>{F(d.likes)}</td>
                    <td style={{ padding: '5px 8px' }}>{d.influence}</td>
                    <td style={{ padding: '5px 8px' }}>{(d.style_words || '').split(',').slice(0, 6).map((w: string, j: number) => <Tag key={j} style={{ marginBottom: 2 }}>{w}</Tag>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Col>
    </Row>
  );
}
