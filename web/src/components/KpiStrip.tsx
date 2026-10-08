import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { useDbStats } from '../api/endpoints';

const fmt = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

export default function KpiStrip() {
  const { data: stats } = useDbStats();
  if (!stats) return null;
  const items = [
    { label: '歌曲', value: stats.songs },
    { label: '歌手', value: stats.artists },
    { label: '歌词', value: stats.lyrics },
    { label: '评论', value: stats.comments },
  ];
  return (
    <Row gutter={16} style={{ marginTop: 4 }}>
      {items.map((it, i) => (
        <Col key={i}>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>{fmt(it.value)}</span>
          <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 4 }}>{it.label}</span>
        </Col>
      ))}
    </Row>
  );
}
