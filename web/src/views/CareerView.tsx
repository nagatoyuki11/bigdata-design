import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Spin, Select, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

interface YearPoint { year: number; cnt: number; cmt: number; pop: number; }
interface Career { artist_id: string; artist_name: string; career: YearPoint[]; peak_year: number; peak_cmt: number; burst_year: number | null; total_years: number; }

export default function CareerView() {
  const { data } = useApi<Career[]>('artist_career');
  const [idx, setIdx] = useState(0);
  const sel: Career | undefined = data?.[idx];

  const option = useMemo(() => {
    if (!sel) return null;
    const years = sel.career.map(d => d.year);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { data: ['作品数', '评论数', '热度'], textStyle: { color: 'var(--text2)' }, top: 0 },
      grid: { left: 60, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: years, axisLabel: { color: 'var(--text2)' } },
      yAxis: [
        { type: 'value', name: '数量', axisLabel: { color: 'var(--text2)' }, splitLine: { lineStyle: { color: '#eeeeee' } } },
        { type: 'value', name: '热度', axisLabel: { color: 'var(--text2)' } },
      ],
      series: [
        { name: '作品数', type: 'bar', data: sel.career.map(d => d.cnt), itemStyle: { color: '#5b8ff9' } },
        { name: '评论数', type: 'line', data: sel.career.map(d => d.cmt), itemStyle: { color: 'var(--accent)' }, smooth: true, lineStyle: { width: 2 } },
        { name: '热度', type: 'line', yAxisIndex: 1, data: sel.career.map(d => d.pop), itemStyle: { color: 'var(--accent)' }, smooth: true },
        sel.peak_year ? { type: 'scatter', data: [[sel.peak_year, sel.peak_cmt]], symbolSize: 16, itemStyle: { color: 'var(--accent)', borderColor: '#fff', borderWidth: 2 }, markPoint: { data: [{ name: '巅峰', coord: [sel.peak_year, sel.peak_cmt] }] }, z: 10 } : {},
        sel.burst_year ? {
          type: 'scatter', data: (() => {
            const p = sel.career.find(d => d.year === sel.burst_year);
            return p ? [[p.year, p.cmt]] : [];
          })(), symbolSize: 12, itemStyle: { color: '#22c55e', borderColor: '#fff', borderWidth: 2 }, z: 10
        } : {},
      ].filter(s => Object.keys(s).length > 0),
    };
  }, [sel]);

  if (!data) return <Spin />;

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="歌手成长轨迹" size="small"
          extra={
            <Select value={idx} onChange={v => setIdx(v)} style={{ width: 200 }} showSearch
              filterOption={(input, option) => (option?.label as string || '').includes(input)}
              options={data.map((a, i) => ({ value: i, label: a.artist_name }))} />
          }>
          {sel && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Tag color="purple">{sel.total_years} 年活跃</Tag>
              {sel.peak_year && <Tag color="red">巅峰 {sel.peak_year} 年 · {F(sel.peak_cmt)} 评</Tag>}
              {sel.burst_year && <Tag color="green">爆发 {sel.burst_year} 年</Tag>}
            </div>
          )}
        </Card>
      </Col>
      <Col span={24}>
        {option ? <ReactECharts option={option} style={{ height: 400 }} /> : <Spin />}
      </Col>
    </Row>
  );
}
