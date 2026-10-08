import React from 'react';
import { Card, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';

export default function ImageryView() {
  const { data } = useApi<any[]>('imagery_map');
  const { openDrawer } = useDrawer();

  if (!data) return <Spin />;

  const option = {
    backgroundColor: 'transparent',
    tooltip: { formatter: (p: any) => `<b>${p.name}</b><br/>${p.value[2]} 首歌 · 热度 ${p.value[3]}` },
    geo: {
      map: 'world', roam: true, center: [104, 35], zoom: 5,
      itemStyle: { areaColor: '#fafafa', borderColor: '#cccccc' },
      emphasis: { itemStyle: { areaColor: 'var(--border)' } }
    },
    series: [{
      type: 'scatter', coordinateSystem: 'geo',
      data: data.map((d: any) => ({ name: d.name, value: [d.lng, d.lat, d.song_cnt, d.heat] })),
      symbolSize: (val: number[]) => Math.sqrt(val[2]) * 4 + 6,
      itemStyle: { color: 'var(--accent)', opacity: 0.7 },
      emphasis: { itemStyle: { opacity: 1, borderColor: '#fff' } }
    }]
  };

  return (
    <Card title="歌词意象地图 —— 华语歌曲都在唱哪些地方" size="small">
      <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 8 }}>
        从歌词中提取地名意象，圆点大小 = 歌曲数量，颜色深度 = 热度。点击圆点查看详情。
      </div>
      <ReactECharts option={option} style={{ height: '64vh' }}
        onEvents={{
          click: (p: any) => {
            if (p.componentType === 'series') {
              const d = data.find((x: any) => x.name === p.name);
              if (d) openDrawer('imagery', { place: d });
            }
          }
        }}
      />
    </Card>
  );
}
