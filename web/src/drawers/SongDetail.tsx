import React from 'react';
import { Spin, Empty, Tag } from 'antd';
import { useSongDetail } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';
import SongDna from '../components/SongDna';
import AddToCollectionBtn from '../components/AddToCollectionBtn';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);
const dur = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const SENT_CLS: Record<string, string> = { '正向': 'green', '负向': 'red', '中性': 'default' };

export default function SongDetail({ songId, fromArtistId }: { songId: string; fromArtistId?: string }) {
  const { data, isLoading } = useSongDetail(songId);
  const { openDrawer } = useDrawer();

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data || !data.song) return <Empty description="歌曲未找到" />;

  const s = data.song;
  const sentTotal = (data.sentiment || []).reduce((a, b) => a + b.c, 0);

  return (
    <div>
      {fromArtistId && (
        <a onClick={() => openDrawer('artist', { artistId: fromArtistId })} style={{ display: 'block', marginBottom: 12, color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,179,71,0.25)', background: 'rgba(255,179,71,0.06)' }}>
          返回歌手
        </a>
      )}
      <h2 style={{ color: 'var(--text)', fontSize: 20, margin: 0 }}>{s.name}</h2>
      <div style={{ color: 'var(--accent)', fontSize: 14, marginTop: 4 }}>
        {s.artist_name} · 📅 {s.year || '?'} · ⏱ {dur(s.duration_sec)}
      </div>
      <div style={{ color: 'var(--accent)', fontSize: 14, marginTop: 6, padding: '8px 12px', background: 'rgba(224,20,60,0.06)', borderRadius: 8, border: '1px solid rgba(224,20,60,0.2)' }}>
        专辑：{s.album || '未收录'}
      </div>
      <a href={`https://music.163.com/song?id=${encodeURIComponent(s.song_id)}`} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-block', marginTop: 12, padding: '8px 18px', borderRadius: 20, background: 'linear-gradient(90deg,#c62f2f,#ff4d6d)', color: '#fff', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>
          网易云播放
        </a>
        <AddToCollectionBtn itemType="song" itemId={s.song_id} itemName={s.name} itemArtist={s.artist_name} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        {[{ v: F(s.comment_total), k: '真实评论' }, { v: F(s.total_liked), k: '评论点赞' }, { v: s.pop || 0, k: '官方热度' }, { v: dur(s.duration_sec), k: '时长' }, { v: s.topic_name || '—', k: '主题' }].map((st, i) => (
          <div key={i} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 18 }}>{st.v}</div>
            <div style={{ color: 'var(--text3)', fontSize: 11 }}>{st.k}</div>
          </div>
        ))}
      </div>

      {sentTotal > 0 && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ color: 'var(--accent)', margin: '0 0 8px' }}>评论情感分布（采样 {F(sentTotal)} 条）</h4>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden' }}>
            {(data.sentiment || []).map((x, i) => {
              const w = Math.round(x.c / sentTotal * 100);
              const col = x.sentiment === '正向' ? '#22c55e' : x.sentiment === '负向' ? '#ef4444' : 'var(--text3)';
              return w > 0 ? <div key={i} style={{ width: w + '%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>{w > 10 ? x.sentiment + ' ' + w + '%' : ''}</div> : null;
            })}
          </div>
        </div>
      )}

      {data.lyric?.lyric && (
        <div style={{ marginTop: 18 }}>
          <h4 style={{ color: 'var(--accent)', margin: '0 0 8px' }}>歌词</h4>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#444444', lineHeight: 1.7, maxHeight: 260, overflow: 'auto', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            {data.lyric.lyric}
          </div>
        </div>
      )}

      <SongDna song={s} lyric={data.lyric} />

      <div style={{ marginTop: 18 }}>
        <h4 style={{ color: 'var(--accent)', margin: '0 0 8px' }}>热门评论 Top {(data.comments || []).length}</h4>
        {(data.comments || []).map((c, i) => (
          <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <div style={{ color: 'var(--text)', lineHeight: 1.55 }}>{c.content}</div>
            <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 4 }}>
              👍 {F(c.liked)} · <Tag color={SENT_CLS[c.sentiment] || 'default'}>{c.sentiment}</Tag>
            </div>
          </div>
        ))}
        {(!data.comments || data.comments.length === 0) && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>暂无评论</div>}
      </div>
    </div>
  );
}
