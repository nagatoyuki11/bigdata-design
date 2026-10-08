import React from 'react';
import { Card, Row, Col, Spin, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';

export default function TopicView() {
  const { data: tw } = useApi<any[]>('topic_words');
  const { data: td } = useApi<any[]>('topic_distribution');
  const { data: tr } = useApi<any[]>('topic_river');
  const { data: wc } = useApi<{ w: string; count: number }[]>('wordcloud');
  const { data: wl } = useApi<{ w: string; count: number }[]>('wordcloud_lyric');

  const riverOption = tr ? {
    backgroundColor: 'transparent', tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: [...new Set(tr.map((d: any) => d.year))].sort(), axisLabel: { color: 'var(--text2)' } },
    yAxis: { type: 'value', axisLabel: { color: 'var(--text2)' } },
    series: [...new Set(tr.map((d: any) => d.main_topic))].map((t: any, i: number) => ({
      name: 'Topic ' + t, type: 'bar', stack: 'total',
      data: [...new Set(tr.map((d: any) => d.year))].sort().map((y: any) => {
        const row = tr.find((r: any) => r.year === y && r.main_topic === t);
        return row ? row.count : 0;
      }), barWidth: '60%'
    }))
  } : undefined;

  const makeWC = (data: { w: string; count: number }[] | undefined) => data ? {
    backgroundColor: 'transparent',
    series: [{ type: 'wordCloud', shape: 'circle', sizeRange: [14, 48], rotationRange: [-45, 45],
      textStyle: { color: () => ['var(--accent)', '#5b8ff9', '#22c55e', 'var(--accent)', '#a855f7'][Math.floor(Math.random() * 5)] },
      data: data.slice(0, 80).map((d: any) => ({ name: d.w, value: d.count })) }]
  } : undefined;

  return (
    <Row gutter={[16, 16]}>
      {tw && (
        <Col span={24}>
          <Card title="LDA 歌词主题" size="small">
            <Row gutter={[12, 12]}>
              {tw.map((t: any) => (
                <Col key={t.topic} xs={24} sm={12} md={8} lg={6}>
                  <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {(t.words || []).slice(0, 8).map((w: string, i: number) => <Tag key={i} style={{ marginBottom: 3 }}>{w}</Tag>)}
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      )}
      <Col xs={24} md={12}>
        <Card title="主题歌曲分布" size="small">{td ? <ReactECharts option={{ backgroundColor: 'transparent', tooltip: {}, series: [{ type: 'pie', radius: ['40%', '65%'], roseType: 'area', label: { color: 'var(--text2)', fontSize: 11 }, data: td.map((d: any) => ({ name: d.name, value: d.count })) }] }} style={{ height: 320 }} /> : <Spin />}</Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="热评话题词云" size="small">{wc ? <ReactECharts option={makeWC(wc)} style={{ height: 320 }} /> : <Spin />}</Card>
      </Col>
      <Col span={24}>
        <Card title="歌词年代主题河流" size="small">{riverOption ? <ReactECharts option={riverOption} style={{ height: 350 }} /> : <Spin />}</Card>
      </Col>
      <Col span={24}>
        <Card title="歌词主题词云" size="small">{wl ? <ReactECharts option={makeWC(wl)} style={{ height: 320 }} /> : <Spin />}</Card>
      </Col>
    </Row>
  );
}
