import React, { useState, Suspense, lazy, useEffect } from 'react';
import { Layout, Spin, Card, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons';
import { useDrawer } from './context/DrawerContext';
import { useTheme } from './context/ThemeContext';
import { BulbOutlined } from '@ant-design/icons';
import DrawerHost from './drawers/DrawerHost';
import KpiStrip from './components/KpiStrip';
import TabNav from './components/TabNav';
import { fetchJSON } from './api/client';

const { Header, Content } = Layout;

// Lazy load all views
const DbSongView = lazy(() => import('./views/DbSongView'));
const DbArtistView = lazy(() => import('./views/DbArtistView'));
const DbLyricView = lazy(() => import('./views/DbLyricView'));
const DbCommentView = lazy(() => import('./views/DbCommentView'));
const RankView = lazy(() => import('./views/RankView'));
const YearReportView = lazy(() => import("./views/YearReportView"));
const MoodView = lazy(() => import('./views/MoodView'));
const AlbumView = lazy(() => import('./views/AlbumView'));
const RhymeView = lazy(() => import('./views/RhymeView'));
const UserView = lazy(() => import('./views/UserView'));
const LyricMapView = lazy(() => import('./views/LyricMapView'));

const VIEW_MAP: Record<string, React.LazyExoticComponent<React.FC>> = {
  db_song: DbSongView, db_artist: DbArtistView, db_lyric: DbLyricView, db_comment: DbCommentView,
  rank: RankView, report: YearReportView, mood: MoodView, album: AlbumView, rhyme: RhymeView, user: UserView,
  map: LyricMapView,
};

const TOKEN_KEY = 'yueping_token';
const USER_KEY = 'yueping_user';
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
function saveAuth(token: string, user: any) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }

const Fallback = () => <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;

// 登录/注册/游客 首页
function LandingPage({ onAuth }: { onAuth: (user: any, mode: 'login'|'guest') => void }) {
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [n, setN] = useState('');

  const submit = async () => {
    if (!u || !p) { message.warning('请填写用户名和密码'); return; }
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body: any = { username: u, password: p };
      if (mode === 'register') body.nickname = n || u;
      const res: any = await fetchJSON(endpoint, {}, {}, 'POST', body);
      if (mode === 'register') {
        message.success('注册成功！请登录');
        setMode('login');
        setU(''); setP(''); setN('');
      } else {
        saveAuth(res.token, res.user);
        onAuth(res.user, 'login');
      }
    } catch (e: any) { message.error(e.message || '操作失败'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card
        title={<div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, color: 'var(--accent)', fontWeight: 800, marginBottom: 4 }}>云律</div>
          <div style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 400 }}>华语乐坛数字档案馆</div>
        </div>}
        style={{ width: 400, borderRadius: 14, border: '1px solid var(--border)' }}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" type={mode === 'login' ? 'primary' : 'default'} onClick={() => setMode('login')}>登录</Button>
            <Button size="small" type={mode === 'register' ? 'primary' : 'default'} onClick={() => setMode('register')}>注册</Button>
          </div>
        }>
        <Input prefix={<UserOutlined />} placeholder="用户名" value={u} onChange={e => setU(e.target.value)} style={{ marginBottom: 10 }} onPressEnter={submit} />
        {mode === 'register' && <Input placeholder="昵称（可选）" value={n} onChange={e => setN(e.target.value)} style={{ marginBottom: 10 }} />}
        <Input.Password prefix={<LockOutlined />} placeholder="密码" value={p} onChange={e => setP(e.target.value)} style={{ marginBottom: 16 }} onPressEnter={submit} />
        <Button type="primary" block onClick={submit}>{mode === 'login' ? '登录' : '注册'}</Button>
        <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <Button type="link" icon={<TeamOutlined />} onClick={() => onAuth(null, 'guest')} style={{ color: 'var(--text2)' }}>
            游客访问（无需登录）
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(undefined); // undefined=加载中 null=未登录
  const [activeView, setActiveView] = useState('db_song');
  const { state } = useDrawer(); const { mode, toggle } = useTheme();
  const ActiveComponent = VIEW_MAP[activeView] || DbSongView;

  // 自动检查登录状态
  useEffect(() => {
    const token = getToken();
    if (!token) { setUser(null); return; }
    fetchJSON('/auth/me', {}, { Authorization: 'Bearer ' + token })
      .then(u => { setUser(u); saveAuth(token, u); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setUser(null); });
  }, []);

  // 未认证 → 首页
  if (user === undefined) return <Fallback />;
  if (user === null) return <LandingPage onAuth={(u, mode) => setUser(u || { nickname: '游客' })} />;

  // 已认证 → 主应用
  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header style={{ background: 'var(--card-bg)', padding: '0 24px', height: 'auto', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '12px 0 6px' }}>
          <div>
            <h1 style={{ color: 'var(--accent)', fontSize: 22, margin: 0, fontWeight: 800 }}>云律</h1>
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>华语乐坛数字档案馆</div>
          </div>
          <Button icon={<BulbOutlined />} size="small" onClick={toggle} style={{ marginRight: 8 }}>{mode === "dark" ? "亮色" : "暗色"}</Button><KpiStrip />
        </div>
        <TabNav active={activeView} onChange={setActiveView} />
      </Header>
      <Content style={{ padding: '16px 24px 40px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Suspense fallback={<Fallback />}>
          <ActiveComponent key={activeView} />
        </Suspense>
      </Content>
      {state.open && <DrawerHost />}
    </Layout>
  );
}
