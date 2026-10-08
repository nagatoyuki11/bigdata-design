import React from 'react';
import { Card, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';

export default function EmotionFlowView() {
  const { data } = useApi<{ nodes: { name: string }[]; links: { source: string; target: string; value: number }[] }>('emotion_flow');
  if (!data) return <Spin />;

  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.data.source || p.name} → ${p.data.target || ''}<br/>${p.data.value || p.value} 首` },
    series: [{
      type: 'sankey',
      layout: 'none',
      emphasis: { focus: 'adjacency' },
      nodeAlign: 'left',
      data: data.nodes,
      links: data.links,
      label: { color: 'var(--text2)', fontSize: 12 },
      lineStyle: { color: 'gradient', curveness: 0.5 },
      itemStyle: { borderWidth: 1, borderColor: 'var(--border)' },
    }],
  };

  return (
    <Card title="年代-主题-情感流向" size="small">
      <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 12 }}>
        桑基图展示华语歌曲从<b style={{ color: '#a855f7' }}>年代</b> → <b style={{ color: 'var(--accent)' }}>主题</b> → <b style={{ color: '#22c55e' }}>情感标签</b>的流向分布。
        线条粗细 = 歌曲数量。可 hover 查看详情。
      </p>
      <ReactECharts option={option} style={{ height: '64vh' }} />
    </Card>
  );
}
