import React, { useState, useEffect } from 'react';
import { Spin, Empty, Tag, Button, Popover, List, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useSongDetail } from '../api/endpoints';
import { fetchJSON } from '../api/client';

const TOKEN_KEY = 'yueping_token';
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

/** 解析歌词文本为纯行（去除时间戳 [mm:ss.xx]） */
function parseLyricLines(raw: string): string[] {
  return raw
    .split('\n')
    .map(line => line.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s*/, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('作词') && !line.startsWith('作曲') && !line.startsWith('编曲'));
}

export default function LyricDetail({ songId }: { songId: string }) {
  const { data, isLoading } = useSongDetail(songId);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cols, setCols] = useState<any[]>([]);
  const [popOpen, setPopOpen] = useState(false);

  useEffect(() => {
    if (popOpen && !cols.length) {
      fetchJSON<any[]>('/collections/mine', {}, { Authorization: 'Bearer ' + getToken() })
        .then(setCols).catch(() => {});
    }
  }, [popOpen]);

  if (isLoading) return <Spin />;
  if (!data?.song) return <Empty description="未找到" />;

  const s = data.song;
  const lyricText = data.lyric?.lyric || '暂无歌词';
  const lines = parseLyricLines(lyricText);
  const artist = s.name + ' — ' + s.artist_name;

  const toggleLine = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(lines.map((_, i) => i)));
  const clearAll = () => setSelected(new Set());

  const addToCollection = async (cid: number) => {
    try {
      const items = selected.size > 0
        ? [{
            type: 'lyric',
            id: songId + '_selected',
            name: Array.from(selected).sort((a, b) => a - b).map(i => lines[i]).join('\n'),
            artist,
          }]
        : [{
            type: 'lyric',
            id: songId,
            name: `《${s.name}》全文歌词`,
            artist,
          }];

      await fetchJSON('/collections/' + cid, {}, { Authorization: 'Bearer ' + getToken() }, 'PUT', { items });
      message.success('已添加');
      setPopOpen(false);
      setSelected(new Set());
    } catch { message.error('添加失败'); }
  };

  const popContent = (
    <div style={{ maxWidth: 240 }}>
      {cols.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>还没有创建我推</div>
      ) : (
        <List size="small" dataSource={cols} renderItem={(c: any) => (
          <List.Item onClick={() => addToCollection(c.id)} style={{ cursor: 'pointer', color: 'var(--text)' }}>
            {c.name}
          </List.Item>
        )} />
      )}
    </div>
  );

  return (
    <div>
      <h3 style={{ color: 'var(--text)', fontSize: 20, margin: 0 }}>{s.name}</h3>
      <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
        {s.artist_name}
        {s.album && <span> · {s.album}</span>}
        {s.year && <span> · {s.year}</span>}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {s.topic_name && <Tag color="red">{s.topic_name}</Tag>}
        {lines.length > 0 && (
          <>
            <Button size="small" onClick={selectAll}>全选</Button>
            <Button size="small" onClick={clearAll}>取消</Button>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>
              已选 {selected.size}/{lines.length} 行
            </span>
          </>
        )}
        <Popover content={popContent} trigger="click" open={popOpen} onOpenChange={setPopOpen} placement="bottom">
          <Button size="small" icon={<PlusOutlined />} style={{ fontSize: 12 }}>
            加入我推 {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </Popover>
      </div>
      <div style={{
        marginTop: 12, fontSize: 14, color: 'var(--text)',
        lineHeight: 2, padding: '8px 10px', borderRadius: 10,
        border: '1px solid var(--border)', background: 'var(--card-bg)'
      }}>
        {lines.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text3)', textAlign: 'center' }}>暂无歌词</div>
        ) : (
          lines.map((line, i) => {
            const isSel = selected.has(i);
            return (
              <div
                key={i}
                onClick={() => toggleLine(i)}
                style={{
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  color: isSel ? 'var(--accent)' : 'var(--text)',
                  background: isSel ? 'rgba(224,20,60,0.08)' : 'transparent',
                  fontWeight: isSel ? 600 : 400,
                  transition: 'all .1s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                {isSel && <span style={{ marginRight: 6, fontSize: 10 }}>✓</span>}
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
