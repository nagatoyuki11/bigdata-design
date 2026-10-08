import React, { useState } from 'react';
import { Card, Row, Col, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';
import { Tag } from 'antd';

const AX = { axisLine: { lineStyle: { color: '#cccccc' } }, axisLabel: { color: 'var(--text2)' }, splitLine: { lineStyle: { color: '#eeeeee' } } };

export default function SentimentView() {
  const { data: sd } = useApi<{ sentiment: string; count: number }[]>('sentiment_dist');
  const { data: contro } = useApi<any[]>('controversy');
  const [emoKey, setEmoKey] = useState('tearjerker');
  const { data: emo } = useApi<any[]>(emoKey);
  const [cmtKey, setCmtKey] = useState('top_comments');
  const { data: cmts } = useApi<any[]>(cmtKey);

  const pieOption = sd ? {
    backgroundColor: 'transparent', tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{ type: 'pie', radius: ['40%', '65%'], label: { color: 'var(--text2)' },
      data: sd.map((d: any) => ({ name: d.sentiment, value: d.count, itemStyle: { color: d.sentiment === '正向' ? '#22c55e' : d.sentiment === '负向' ? '#ef4444' : 'var(--text3)' } })) }]
  } : undefined;

  const controOption = contro ? {
    backgroundColor: 'transparent', grid: { left: 160, right: 40, top: 10, bottom: 20 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', ...AX },
    yAxis: { type: 'category', data: contro.slice(0, 15).reverse().map((d: any) => (d.name + ' - ' + d.artist_name).slice(0, 25)), ...AX },
    series: [{ type: 'bar', data: contro.slice(0, 15).reverse().map((d: any) => d.controversy), itemStyle: { color: '#a855f7', borderRadius: [0, 4, 4, 0] } }]
  } : undefined;

  const emoOption = emo ? {
    backgroundColor: 'transparent', grid: { left: 160, right: 40, top: 10, bottom: 20 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', ...AX },
    yAxis: { type: 'category', data: emo.slice(0, 15).reverse().map((d: any) => (d.name || '').slice(0, 25)), ...AX },
    series: [{ type: 'bar', data: emo.slice(0, 15).reverse().map((d: any) => d.tear_sum || d.cnt || 0), itemStyle: { color: '#38bdf8', borderRadius: [0, 4, 4, 0] } }]
  } : undefined;

  const F = (n: number) => n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);
  const SENT_COL: Record<string, string> = { '正向': 'green', '负向': 'red', '中性': 'default' };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}><Card title="评论情感分布" size="small">{pieOption ? <ReactECharts option={pieOption} style={{ height: 300 }} /> : <Spin />}</Card></Col>
      <Col xs={24} md={12}><Card title="争议歌曲榜" size="small">{controOption ? <ReactECharts option={controOption} style={{ height: 300 }} /> : <Spin />}</Card></Col>
      <Col span={24}>
        <Card title="情绪歌曲榜" size="small"
          extra={<div style={{ display: 'flex', gap: 8 }}>
            {[{ k: 'tearjerker', l: '催泪' }, { k: 'rank_healing', l: '治愈' }, { k: 'rank_inspire', l: '励志' }].map(b => (
              <span key={b.k} onClick={() => setEmoKey(b.k)} style={{ cursor: 'pointer', padding: '2px 10px', borderRadius: 5, fontSize: 12, background: emoKey === b.k ? 'rgba(224,20,60,0.2)' : 'transparent', color: emoKey === b.k ? 'var(--accent)' : 'var(--text2)' }}>{b.l}</span>
            ))}</div>}>
          {emoOption ? <ReactECharts option={emoOption} style={{ height: 350 }} /> : <Spin />}
        </Card>
      </Col>
      <Col span={24}>
        <Card title="评论精选" size="small"
          extra={<div style={{ display: 'flex', gap: 8 }}>
            {[{ k: 'top_comments', l: '高赞金句' }, { k: 'tear_comments', l: '催泪故事' }].map(b => (
              <span key={b.k} onClick={() => setCmtKey(b.k)} style={{ cursor: 'pointer', padding: '2px 10px', borderRadius: 5, fontSize: 12, background: cmtKey === b.k ? 'rgba(224,20,60,0.2)' : 'transparent', color: cmtKey === b.k ? 'var(--accent)' : 'var(--text2)' }}>{b.l}</span>
            ))}</div>}>
          {cmts ? cmts.slice(0, 20).map((d: any, i: number) => (
            <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text)', lineHeight: 1.55 }}>{d.content}</div>
              <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 4 }}>
                《{d.name || '?'}》— {d.artist_name || '?'}
                {d.sentiment && <Tag color={SENT_COL[d.sentiment] || 'default'}>{d.sentiment}</Tag>}
                <span style={{ marginLeft: 8 }}>👍 {F(d.liked)}</span>
              </div>
            </div>
          )) : <Spin />}
        </Card>
      </Col>
    </Row>
  );
}
