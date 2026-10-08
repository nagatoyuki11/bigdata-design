import React from 'react';
import type { Artist } from '../api/endpoints';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

export default function ArtistRow({ a, onClick }: { a: Artist; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{a.artist_name}</div>
        <div style={{ color: 'var(--text2)', fontSize: 12.5, marginTop: 4 }}>
          作品 {a.song_num} · 真实评论 {F(a.comments)} · 点赞 {F(a.likes)}
          {a.style_words ? ' · ' + a.style_words.split(',').slice(0, 5).join(' ') : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--text3)' }}>
        <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>{a.influence}</div>影响力
      </div>
    </div>
  );
}
