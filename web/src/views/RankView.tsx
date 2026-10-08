import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Spin, Segmented, Input, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useApi, useRankArtists, useRankWords } from '../api/endpoints';

const AX = { axisLine: { lineStyle: { color: '#cccccc' } }, axisLabel: { color: '#999999' }, splitLine: { lineStyle: { color: '#eeeeee' } } };
const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);
type Tab = 'songs' | 'artists' | 'words';

// 制作信息/英文噪声词过滤
const NOISE = new Set('编曲 混音 制作人 吉他 和声 母带 监制 贝斯 出品 和声编写 弦乐 配唱制作人 录音 制作 出品人 键盘 录音师 录音室 录音棚 混音师 混音室 混音工程师 母带工程师 母带后期 制作统筹 音乐总监 音乐统筹 总监制 项目统筹 策划 统筹 企划 文案 宣发 推广 发行 经纪 执行 版权 词曲 原唱 翻唱 演唱 合唱 和音 音频编辑 人声编辑 人声 音频 视觉 封面 平面 弦乐编写 弦乐监制 弦乐录音 原声吉他 电吉他 贝司 打击乐 合成器 钢琴 大提琴 小提琴 中提琴 作词 作曲 唱片 工作室 录音制作者 版权方 OP SP 维伴音乐 国际首席爱乐乐团 牛班 有限公司 录音工程师 混音工程师 配唱 监唱 宣发统筹 推广统筹 内容统筹 专辑企划 制作助理 编程 题字 包括翻唱 人声录音棚 音乐发行 录音棚 合声 特别鸣谢 艺人统筹 音乐制作 木吉他 笛子 音乐监制 音响总监 营销推广 制作公司 翻录或使用 主唱 古筝 后期 人声录音师 制作协力 小号 二胡 基本节奏 喇叭 口琴 萨克斯 琵琶 唢呐 手风琴 曼陀林 录音助理 混音助理 母带处理 宣发团队 发行公司 经纪公司 营销团队 唱片公司 音乐厂牌 乐队 指挥 乐团 首席 声乐指导 舞蹈编导 摄影师 造型师 化妆师 发型师 服装师 道具师 灯光师 调音师 音响工程 技术支持 音乐制作人 总策划 韶愔音乐娱乐 翻录 翻唱 翻录或'.split(' '));
const cnRe = /[\u4e00-\u9fff]/;

export default function RankView() {
  const [tab, setTab] = useState<Tab>('songs');
  const [yFrom, setYFrom] = useState('');
  const [yTo, setYTo] = useState('');

  const { data: songsAll } = useApi<any[]>('rank_songs_all');
  const { data: artistsAll } = useApi<any[]>('rank_artists_all');
  const { data: artistsYear } = useRankArtists(yFrom || undefined, yTo || undefined);
  const { data: wordFreqYear } = useRankWords(yFrom || undefined, yTo || undefined);
  // 仅使用 MapReduce 结果（已清洗中文内容词）
  const { data: mrWords } = useApi<{ word: string; count: number }[]>('mr_wordcount');

  // 年份筛选
  const yearFilter = (item: any) => {
    const y = item.year;
    if (!yFrom && !yTo) return true;
    if (yFrom && y < +yFrom) return false;
    if (yTo && y > +yTo) return false;
    return true;
  };

  const songs = useMemo(() => (songsAll || []).filter(yearFilter), [songsAll, yFrom, yTo]);
  const artists = (yFrom || yTo) ? (artistsYear || []) : (artistsAll || []);
  // 高频词：全量用 MapReduce 结果，年份筛选时对服务端结果客户端过滤噪声
  const words = useMemo(() => {
    if (yFrom || yTo) {
      return (wordFreqYear || []).filter((w: any) => cnRe.test(w.word) && !NOISE.has(w.word)).slice(0, 30);
    }
    return (mrWords || []).slice(0, 30);
  }, [mrWords, wordFreqYear, yFrom, yTo]);
  const allWords = useMemo(() => {
    if (yFrom || yTo) {
      return (wordFreqYear || []).filter((w: any) => cnRe.test(w.word) && !NOISE.has(w.word));
    }
    return (mrWords || []);
  }, [mrWords, wordFreqYear, yFrom, yTo]);

  // 歌手年份筛选通过 songs 表间接实现（此处简化：直接显示全部歌手排行，因歌手跨年）
  const top15Songs = useMemo(() => [...songs].reverse().slice(-15), [songs]);

  const songOption = top15Songs.length ? {
    backgroundColor: 'transparent',
    grid: { left: 160, right: 60, top: 10, bottom: 20 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', ...AX },
    yAxis: { type: 'category', data: top15Songs.map((d: any) => (d.name + ' - ' + d.artist_name).slice(0, 25)), ...AX },
    series: [{ type: 'bar', data: top15Songs.map((d: any) => d.comment_total),
      itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#991111' }, { offset: 1, color: '#e0143c' }] }, borderRadius: [0, 4, 4, 0] } }]
  } : undefined;

  const artistOption = artists.length ? {
    backgroundColor: 'transparent',
    grid: { left: 120, right: 60, top: 10, bottom: 20 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', ...AX },
    yAxis: { type: 'category', data: [...artists].slice(0, 15).reverse().map((d: any) => d.artist_name), ...AX },
    series: [{ type: 'bar', data: [...artists].slice(0, 15).reverse().map((d: any) => d.influence || d.total_cmt || 0),
      itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#5b8ff9' }, { offset: 1, color: '#38bdf8' }] }, borderRadius: [0, 4, 4, 0] } }]
  } : undefined;

  const wordOption = words.length ? {
    backgroundColor: 'transparent',
    grid: { left: 100, right: 60, top: 10, bottom: 20 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', ...AX },
    yAxis: { type: 'category', data: [...words].slice(0, 20).reverse().map((d: any) => d.word), ...AX },
    series: [{ type: 'bar', data: [...words].slice(0, 20).reverse().map((d: any) => d.count),
      itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#a855f7' }, { offset: 1, color: '#ff7aa2' }] }, borderRadius: [0, 4, 4, 0] } }]
  } : undefined;

  const activeOption = tab === 'songs' ? songOption : tab === 'artists' ? artistOption : wordOption;
  const titleMap: Record<Tab, string> = { songs: '歌曲排名榜', artists: '歌手排名榜', words: '歌词高频词榜' };
  const rangeLabel = yFrom || yTo ? ` (${yFrom || '1970'}–${yTo || '2026'})` : ' (全部年份)';

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Segmented value={tab} onChange={v => setTab(v as Tab)}
              options={[{ value: 'songs', label: '歌曲' }, { value: 'artists', label: '歌手' }, { value: 'words', label: '高频词' }]} />
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>年份：</span>
            <Input placeholder="从" type="number" value={yFrom} onChange={e => setYFrom(e.target.value)} style={{ width: 80 }} />
            <span style={{ color: 'var(--text3)' }}>—</span>
            <Input placeholder="到" type="number" value={yTo} onChange={e => setYTo(e.target.value)} style={{ width: 80 }} />
            <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 4 }}>（留空 = 不限年份）</span>
          </div>
        </Card>
      </Col>
      <Col span={24}>
        {activeOption ? (
          <Card title={<span>{titleMap[tab] + rangeLabel}{tab === 'words' && <Tag color="green" style={{ marginLeft: 8, fontSize: 10 }}>MapReduce</Tag>}</span>}
            size="small">
            <ReactECharts option={activeOption} style={{ height: 420 }} />
          </Card>
        ) : <Spin />}
      </Col>

      {/* 额外小卡片：歌手榜 & 高频词表 */}
      {tab === 'songs' && (
        <Col span={24}>
          <Card title={`歌曲 Top30` + rangeLabel} size="small">
            {songs.slice(0, 30).map((s: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}>
                <span><b style={{ color: 'var(--accent)' }}>{i + 1}</b>. {s.name} — {s.artist_name} ({s.year})</span>
                <span style={{ color: 'var(--accent)' }}>{F(s.comment_total)} 评</span>
              </div>
            ))}
          </Card>
        </Col>
      )}
      {tab === 'words' && (
        <Col span={24}>
          <Card title={<span>高频词云 <Tag color="green" style={{ marginLeft: 4, fontSize: 10 }}>MapReduce</Tag></span>} size="small">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allWords.slice(0, 50).map((d: any, i: number) => (
                <span key={i} style={{ fontSize: Math.max(11, 11 + Math.log2(d.count / 1000) * 3), color: ['var(--accent)', '#5b8ff9', '#22c55e', 'var(--accent)', '#a855f7'][i % 5], fontWeight: i < 5 ? 700 : 400 }}>
                  {d.word}({F(d.count)})
                </span>
              ))}
            </div>
          </Card>
        </Col>
      )}
    </Row>
  );
}
