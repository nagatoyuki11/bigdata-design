import React from 'react';
import { Spin, Empty, Tag, Button, Row, Col } from 'antd';
import { useArtistDetail } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';

import AddToCollectionBtn from "../components/AddToCollectionBtn";
const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

export default function ArtistDetail({ artistId }: { artistId: string }) {
  const { data, isLoading } = useArtistDetail(artistId);
  const { openDrawer } = useDrawer();

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  if (!data || !data.artist) return <Empty description="歌手未找到" />;

  const a = data.artist;

  return (
    <div>
      <Row gutter={20} align="middle" style={{ marginBottom: 16 }}>
        {a.photo && (
          <Col flex="120px">
            <img src={a.photo} referrerPolicy="no-referrer" alt={a.artist_name}
              style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
              onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
          </Col>
        )}
        <Col flex="auto">
          <h2 style={{ color: 'var(--text)', fontSize: 22, margin: 0 }}>{a.artist_name}</h2>
          <div style={{ color: 'var(--accent)', fontSize: 14, margin: '4px 0 8px' }}>
            华语歌手画像{!a.authentic ? <Tag color="default" style={{ marginLeft: 6 }}>未达标</Tag> : null}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[{ v: a.song_num, k: '作品数' }, { v: F(a.comments), k: '真实总评论' }, { v: F(a.likes), k: '点赞' }, { v: a.influence, k: '影响力' }, { v: a.avg_pop, k: '平均热度' }].map((st, i) => (
              <div key={i} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15 }}>{st.v}</span>
                <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 4 }}>{st.k}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button icon={<span>️</span>} onClick={() => openDrawer('network', { artistName: a.artist_name })}
              style={{ background: 'linear-gradient(90deg, rgba(91,143,249,0.2), rgba(168,85,247,0.2))', border: '1px solid rgba(91,143,249,0.35)', color: '#fff', fontWeight: 600 }}>
              查看合作网络
            </Button>
            <AddToCollectionBtn itemType="artist" itemId={a.artist_id} itemName={a.artist_name} />
          </div>
        </Col>
      </Row>

      {a.style_words && (
        <div style={{ marginTop: 12 }}>
          {a.style_words.split(',').slice(0, 12).map((w, i) => (
            <Tag key={i} color="red" style={{ marginBottom: 4 }}>{w}</Tag>
          ))}
          <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 6 }}>词风关键词</span>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h4 style={{ color: 'var(--accent)', margin: '0 0 8px' }}>代表作（按真实评论数）</h4>
        {(data.songs || []).map(s => (
          <div key={s.song_id} onClick={() => openDrawer('song', { songId: s.song_id, fromArtistId: a.artist_id })}
            style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>{s.year || '?'}</div>
            </div>
            <div style={{ textAlign: 'right', color: 'var(--text3)', fontSize: 13 }}>
              <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{F(s.comment_total)}</div>评论
            </div>
          </div>
        ))}
        {(!data.songs || data.songs.length === 0) && <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20 }}>暂无代表作</div>}
      </div>
    </div>
  );
}
