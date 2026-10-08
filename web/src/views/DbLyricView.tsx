import React, { useState } from 'react';
import { Card, Input, Select, Button, Space, Empty, Tag } from 'antd';
import { useSearchLyrics, useApi } from '../api/endpoints';
import Pager from '../components/Pager';
import { useDrawer } from '../context/DrawerContext';

export default function DbLyricView() {
  const { openDrawer } = useDrawer();
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [page, setPage] = useState(0);
  const limit = 15;

  const { data: topicWords } = useApi<{ name: string; topic: number }[]>('topic_words');
  const topicNames = topicWords ? [...new Set(topicWords.map(t => t.name).filter(Boolean))] : [];

  const params: Record<string, string> = { limit: String(limit), page: String(page) };
  if (q.trim()) params.q = q.trim();
  if (topic) params.topic = topic;

  const { data, isLoading } = useSearchLyrics(params);

	  const FragHighlight = ({ frag }: { frag: string }) => {
	    if (!frag) return null;
	    // 安全渲染：用 React 元素替代 dangerouslySetInnerHTML
	    const parts = frag.split(/(\[[^\]]*\])/g);
	    return (
	      <span>
	        {parts.map((p, i) => {
	          if (p.startsWith('[') && p.endsWith(']')) {
	            return <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{p.slice(1, -1)}</span>;
	          }
	          return <span key={i}>{p}</span>;
	        })}
	      </span>
	    );
	  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>歌词全文检索</h3>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>基于 SQLite FTS5 全文索引（jieba 分词），命中片段高亮显示。</p>
        <Space wrap style={{ marginTop: 8 }}>
          <Input placeholder="如 青春 / 故乡 / 海" value={q} onChange={e => setQ(e.target.value)} style={{ width: 240 }} onPressEnter={() => setPage(0)} />
          <Select placeholder="全部主题" value={topic || undefined} onChange={v => { setTopic(v || ''); setPage(0); }} style={{ width: 140 }} allowClear
            options={topicNames.map(t => ({ value: t, label: t }))} />
          <Button type="primary" onClick={() => setPage(0)}>检索</Button>
          <Button onClick={() => { setQ(''); setTopic(''); setPage(0); }}>重置</Button>
        </Space>
      </Card>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            共 <b style={{ color: 'var(--accent)' }}>{data?.total ?? 0}</b> 条结果
            {data?.mode === 'fts' && <Tag color="green" style={{ marginLeft: 6 }}>FTS5</Tag>}
            {data?.mode === 'like' && <Tag style={{ marginLeft: 6 }}>LIKE</Tag>}
          </span>
          {data && <Pager total={data.total} page={data.page} limit={data.limit} onChange={setPage} />}
        </div>
        {isLoading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>加载中...</div> :
          !data || data.rows.length === 0 ? <Empty description="无匹配歌词" /> :
            data.rows.map(l => (
              <div key={l.song_id} onClick={() => openDrawer('lyric', { songId: l.song_id })} style={{ cursor: 'pointer', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{l.name}
                  {l.topic_name && <Tag color="red" style={{ marginLeft: 7 }}>{l.topic_name}</Tag>}
                </div>
                <div style={{ color: 'var(--text2)', fontSize: 12.5, marginTop: 2 }}>{l.artist_name} · {l.year || '?'} · {l.word_count}词</div>
                {l.frag && <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 4, padding: '4px 10px', background: 'var(--card-bg)', borderLeft: '2px solid var(--border)', borderRadius: '0 6px 6px 0', lineHeight: 1.6 }}><FragHighlight frag={l.frag} /></div>}
              </div>
            ))}
      </Card>
    </div>
  );
}
