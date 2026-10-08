import React from 'react';
import { CustomerServiceOutlined, AudioOutlined, FileTextOutlined, MessageOutlined, SearchOutlined, BarChartOutlined, RocketOutlined, PlayCircleOutlined, EditOutlined, TrophyOutlined, SoundOutlined, UserOutlined, EnvironmentOutlined } from '@ant-design/icons';

const TABS = [
  { group: '数据库', icon: <SearchOutlined />, items: [
    { key: 'db_song', label: '歌曲', icon: <CustomerServiceOutlined /> },
    { key: 'db_artist', label: '歌手', icon: <AudioOutlined /> },
    { key: 'db_lyric', label: '歌词', icon: <FileTextOutlined /> },
    { key: 'db_comment', label: '评论', icon: <MessageOutlined /> },
  ]},
  { group: '分析', icon: <BarChartOutlined />, items: [
    { key: 'rank', label: '榜单', icon: <TrophyOutlined /> },
    { key: 'mood', label: '点歌', icon: <SoundOutlined /> },
  ]},
  { group: '创新', icon: <RocketOutlined />, items: [
    { key: "album", label: "专辑", icon: <PlayCircleOutlined /> },
    { key: "report", label: "年报", icon: <PlayCircleOutlined /> },
    { key: "rhyme", label: "创作", icon: <EditOutlined /> },
    { key: "map", label: "地图", icon: <EnvironmentOutlined /> },
  ]},
  { group: '社区', icon: <UserOutlined />, items: [
    { key: 'user', label: '我推', icon: <UserOutlined /> },
  ]},
];

export default function TabNav({ active, onChange }: { active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, paddingBottom: 4 }}>
      {TABS.map(g => (
        <React.Fragment key={g.group}>
          <span style={{ color: 'var(--text3)', fontSize: 11, margin: '4px 4px 4px 0', lineHeight: '28px' }}>
            {g.icon} {g.group}
          </span>
          {g.items.map(t => (
            <button key={t.key} onClick={() => onChange(t.key)}
              style={{
                padding: '4px 12px', fontSize: 13, fontWeight: 500,
                border: '1px solid ' + (active === t.key ? 'var(--accent)' : 'var(--border)'),
                borderRadius: 8, cursor: 'pointer',
                background: active === t.key ? 'rgba(224,20,60,0.15)' : 'transparent',
                color: active === t.key ? 'var(--accent)' : 'var(--text2)', transition: 'all .15s',
              }}>
              {t.icon} {t.label}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--border)', margin: '4px 8px' }} />
        </React.Fragment>
      ))}
    </div>
  );
}
