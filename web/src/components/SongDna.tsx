import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Tag } from 'antd';
import { useApi } from '../api/endpoints';
import type { SongDetail as SongDetailType } from '../api/endpoints';

interface Props {
  song: NonNullable<SongDetailType['song']>;
  lyric: SongDetailType['lyric'];
}

const CLUSTER_LABEL: Record<number, string> = { 0: '冷门宝藏', 1: '热门金曲', 2: '超长混音' };
const CLUSTER_COLOR: Record<number, string> = { 0: 'blue', 1: 'red', 2: 'purple' };
const CLUSTER_DESC: Record<number, string> = {
  0: '属于冷门长尾群（52.8%歌曲在此）— 评论少但可能是你的私藏宝藏',
  1: '属于热门金曲群（47.1%歌曲在此）— 高传唱、高热度、高讨论',
  2: '属于超长混音群（0.1%歌曲在此）— DJ串烧/专辑全长版等特殊类型',
};

export default function SongDna({ song, lyric }: Props) {
  const { data: kmeans } = useApi<{ song_id: string; cluster: number }[]>('kmeans_clusters');
  const cluster = useMemo(() => {
    if (!kmeans) return undefined;
    const found = kmeans.find((c: any) => c.song_id === song.song_id);
    return found?.cluster;
  }, [kmeans, song.song_id]);

  const option = useMemo(() => {
    // 传唱度：log 归一化。线性 (cmt/50万) 会让 1 万评=0.02 失真。
    // log10 下：10评→0.16, 100评→0.31, 1K评→0.46, 1万评→0.61, 10万评→0.77, 100万评→0.92, 352万评→1.0
    const LOG_MAX = Math.log10(3522111); // 最高评论数（水星记）
    const popularity = Math.log10(Math.max((song.comment_total || 0), 1) + 1) / LOG_MAX;
    const eraScore = Math.min((2026 - (song.year || 2020)) / 60, 1);
    const wc = lyric?.word_count || 100;
    const density = song.duration_sec > 0 ? Math.min(wc / song.duration_sec * 60, 1) : 0.5;
    const heat = (song.pop || 50) / 100;
    const influence = cluster === 1 ? 0.9 : cluster === 0 ? 0.45 : cluster === 2 ? 0.3 : 0.5;

    return {
      backgroundColor: 'transparent',
      radar: {
        indicator: [
          { name: '传唱度', max: 1 },
          { name: '热度', max: 1 },
          { name: '新鲜度', max: 1 },
          { name: '影响力', max: 1 },
          { name: '歌词密度', max: 1 },
        ],
        axisName: { color: '#999999', fontSize: 11 },
        splitLine: { lineStyle: { color: '#2a3354' } },
        splitArea: { show: false },
        center: ['50%', '52%'],
        radius: '65%',
      },
      series: [{
        type: 'radar',
        areaStyle: { opacity: 0.25 },
        lineStyle: { color: '#e0143c', width: 2 },
        itemStyle: { color: '#e0143c' },
        data: [{
          value: [
            popularity,
            heat,
            1 - eraScore,
            influence,
            density,
          ],
          name: song.name?.slice(0, 10) || '当前',
        }],
      }],
    };
  }, [song, lyric, cluster]);

  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ color: 'var(--accent)', margin: '0 0 4px' }}>歌曲基因图谱</h4>
      <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 8 }}>
        五维雷达：传唱度 · 热度 · 新鲜度 · 影响力 · 歌词密度
      </div>
      <ReactECharts option={option} style={{ height: 280 }} />
      {cluster !== undefined && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
          <Tag color={CLUSTER_COLOR[cluster] || 'default'}>{CLUSTER_LABEL[cluster] || `聚类${cluster}`}</Tag>
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>{CLUSTER_DESC[cluster] || ''}</span>
        </div>
      )}
    </div>
  );
}
