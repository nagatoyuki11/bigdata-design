import React from 'react';
import type { Song } from '../api/endpoints';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);
const dur = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

export default function SongRow({ s, onClick }: { s: Song; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{s.name}
          {s.topic_name && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 5, marginLeft: 7, background: 'rgba(224,20,60,0.15)', color: 'var(--accent)' }}>{s.topic_name}</span>}
        </div>
        <div style={{ color: 'var(--text2)', fontSize: 12.5, marginTop: 4 }}>
          {s.artist_name} · {s.album || '未收录'} · 📅 {s.year || '?'} · ⏱ {dur(s.duration_sec)}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--text3)' }}>
        <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>{F(s.comment_total)}</div>评论 · 👍{F(s.total_liked)}
      </div>
    </div>
  );
}
