import React, { useMemo, useState } from 'react';
import { Spin, Empty, Slider } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useGraphNodes, useGraphEdges } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';

const COMM_COLORS = ['var(--accent)', '#5b8ff9', '#22c55e', 'var(--accent)', '#a855f7', '#38bdf8', '#ff7aa2', '#f59e0b', '#14b8a6', '#9aa3bf'];

export default function ArtistNetwork({ artistName }: { artistName: string }) {
  const { data: nodes } = useGraphNodes();
  const { data: edges } = useGraphEdges();
  const { openDrawer } = useDrawer();
  const [minW, setMinW] = useState(1);

  const { allSubNodes, allSubEdges, center } = useMemo(() => {
    if (!nodes || !edges) return { allSubNodes: [], allSubEdges: [], center: null };
    const c = nodes.find(n => n.name === artistName);
    if (!c) return { allSubNodes: [], allSubEdges: [], center: null };
    const nSet = new Set([artistName]);
    const eList: { source: string; target: string; weight: number }[] = [];
    for (const e of edges) {
      if (e.source === artistName) { nSet.add(e.target); eList.push(e); }
      else if (e.target === artistName) { nSet.add(e.source); eList.push(e); }
    }
    return { allSubNodes: nodes.filter(n => nSet.has(n.name)), allSubEdges: eList, center: c };
  }, [nodes, edges, artistName]);

  const { subEdges, subNodes } = useMemo(() => {
    const filteredEdges = allSubEdges.filter(e => e.weight >= minW);
    const filteredNames = new Set([artistName]);
    filteredEdges.forEach(e => { filteredNames.add(e.source); filteredNames.add(e.target); });
    return { subEdges: filteredEdges, subNodes: allSubNodes.filter(n => filteredNames.has(n.name)) };
  }, [allSubEdges, allSubNodes, minW, artistName]);

  const maxW = useMemo(() => Math.max(...allSubEdges.map(e => e.weight), 1), [allSubEdges]);

  if (!nodes) return <Spin />;
  if (!center) return <Empty description="该歌手暂未在合作网络中" />;
  if (allSubNodes.length <= 1) return <Empty description="该歌手暂无直接合作者" />;

  const maxPR = Math.max(...subNodes.map(n => n.pagerank), 0.01);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (p: any) => p.dataType === 'edge'
        ? `${p.data.source} — ${p.data.target}<br/>合作 ${p.data.weight} 次`
        : `<b>${p.data.name}</b><br/>影响力(PR) ${(+p.value).toFixed(3)}`
    },
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true,
      data: subNodes.map(n => {
        const isC = n.name === artistName;
        return {
          id: n.name, name: n.name,
          symbolSize: isC ? 28 : (8 + Math.sqrt(n.pagerank / maxPR) * 42),
          value: n.pagerank,
          category: n.community < 0 ? COMM_COLORS.length - 1 : n.community,
          itemStyle: isC ? { borderColor: '#fff', borderWidth: 3, shadowBlur: 22, shadowColor: '#fff' } : undefined,
          label: { show: isC || n.pagerank > maxPR * 0.4 }
        };
      }),
      edges: subEdges.map(e => ({ source: e.source, target: e.target, weight: e.weight, lineStyle: { width: Math.min(0.4 + e.weight * 0.5, 6) } })),
      categories: COMM_COLORS.map((col, i) => ({ name: i === COMM_COLORS.length - 1 ? '其他' : ('社群' + (i + 1)), itemStyle: { color: col } })),
      force: { repulsion: 350, edgeLength: [80, 240], gravity: 0.04, friction: 0.16 },
      lineStyle: { color: 'source', opacity: 0.5, curveness: 0.12 },
      label: { color: 'var(--text)', fontSize: 11, position: 'right' },
      scaleLimit: { min: 0.3, max: 5 }
    }]
  };

  const onChartClick = (params: any) => {
    if (params.dataType === 'node' && params.data.name !== artistName) {
      openDrawer('collab', { center: artistName, target: params.data.name });
    }
  };

  return (
    <div>
      <div style={{ color: 'var(--accent)', fontSize: 14, marginBottom: 8 }}>
        {artistName} 合作网络 · {subNodes.length} 位歌手 · {subEdges.length} 条合作边
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, color: 'var(--text2)', fontSize: 12 }}>
        <span>最低合作次数：</span>
        <Slider min={1} max={Math.max(maxW, 2)} value={minW} onChange={v => setMinW(v)} style={{ flex: 1, maxWidth: 300 }} />
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>≥{minW}</span>
      </div>
      <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 12 }}>
        💡 点击合作者节点可查看合作歌曲详情
      </div>
      <ReactECharts option={option} style={{ height: '62vh' }} onEvents={{ click: onChartClick }} />
    </div>
  );
}
