import React from 'react';
import { Spin, Empty, Button } from 'antd';
import { useCollabSongs } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

export default function CollabSongs({ center, target }: { center: string; target: string }) {
  const { data, isLoading } = useCollabSongs(center, target);
  const { openDrawer } = useDrawer();

  return (
    <div>
      <Button type="link" onClick={() => openDrawer('network', { artistName: center })} style={{ padding: 0, color: 'var(--accent)', fontSize: 13, marginBottom: 12 }}>
        返回合作网络
      </Button>
      <h3 style={{ color: 'var(--text)', fontSize: 18, margin: '0 0 16px' }}>
        {center} × {target} 合作歌曲
      </h3>
      {isLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> :
        !data || !data.songs || data.songs.length === 0 ? <Empty description={`${center} 与 ${target} 暂无合作歌曲`} /> :
          data.songs.map(s => (
            <div key={s.song_id} onClick={() => openDrawer('song', { songId: s.song_id })}
              style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 15 }}>{s.name}</div>
                <div style={{ color: 'var(--text2)', fontSize: 12.5, marginTop: 4 }}>
                  {s.album || '未收录'} · 📅 {s.year || '?'}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>
                  {s.artist_name}
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text3)', fontSize: 13 }}>
                <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>{F(s.comment_total)}</div>评论
              </div>
            </div>
          ))}
    </div>
  );
}
