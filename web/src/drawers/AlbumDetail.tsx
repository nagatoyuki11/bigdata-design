import React, { useEffect, useState } from 'react';
import { Spin, Empty, Tag } from 'antd';
import { useDrawer } from '../context/DrawerContext';
import { fetchJSON } from '../api/client';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);
const dur = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

export default function AlbumDetail({ albumName }: { albumName: string }) {
  const { openDrawer } = useDrawer();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchJSON('/album/detail', { name: albumName }).then(setData).catch(() => {});
  }, [albumName]);

  if (!data) return <Spin />;
  const songs = data.songs || [];

  return (
    <div>
      <h3 style={{ color: 'var(--text)', fontSize: 18, margin: 0 }}>{albumName}</h3>
      <div style={{ color: 'var(--accent)', fontSize: 14, marginTop: 4 }}>{songs.length} 首歌曲</div>
      <div style={{ marginTop: 16 }}>
        {songs.map((s: any) => (
          <div key={s.song_id} onClick={() => openDrawer('song', { songId: s.song_id })}
            style={{ cursor: 'pointer', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12 }}>{s.artist_name} · {s.year || '?'} · {dur(s.duration_sec)}</div>
            </div>
            <div style={{ textAlign: 'right', color: 'var(--text3)', fontSize: 13 }}>
              <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{F(s.comment_total)}</div>评论
            </div>
          </div>
        ))}
        {songs.length === 0 && <Empty description="专辑暂无歌曲" />}
      </div>
    </div>
  );
}
