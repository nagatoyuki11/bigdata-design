import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Input, Spin, Empty, Tag, Tabs, message, Descriptions, Select } from 'antd';
import { UserOutlined, HeartOutlined, HeartFilled, PlusOutlined, LogoutOutlined, CommentOutlined } from '@ant-design/icons';
import { fetchJSON } from '../api/client';

const TOKEN_KEY = 'yueping_token';
const USER_KEY = 'yueping_user';
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } }
function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); window.location.reload(); }

export default function UserView() {
  const user = getUser();
  const isGuest = !user || !getToken();
  if (isGuest) {
    return <Card><Empty description="请先登录后使用「我推」功能"><Button type="primary" onClick={() => { logout(); window.location.reload(); }}>前往登录</Button></Empty></Card>;
  }
  return <UserMain user={user} />;
}

function UserMain({ user }: { user: any }) {
  const [tab, setTab] = useState('collections');
  return (
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'collections', label: '我的我推', children: <MyCollections /> },
      { key: 'create', label: <span><PlusOutlined /> 创建</span>, children: <CreateCollection onDone={() => setTab('collections')} /> },
      { key: 'square', label: '广场', children: <SquarePanel /> },
      { key: 'profile', label: <span><UserOutlined /> 个人资料</span>, children: <ProfilePanel user={user} /> },
    ]} />
  );
}

const SEARCH_TYPES = [
  { value: 'song', label: '歌曲', api: '/search/songs', idKey: 'song_id', nameKey: 'name', artistKey: 'artist_name' },
  { value: 'artist', label: '歌手', api: '/search/artists', idKey: 'artist_id', nameKey: 'artist_name', artistKey: '' },
  { value: 'comment', label: '评论', api: '/search/comments', idKey: 'song_id', nameKey: 'content', artistKey: 'artist_name' },
  { value: 'album', label: '专辑', api: null, idKey: 'album', nameKey: 'album', artistKey: 'artist' },
  { value: 'lyric', label: '歌词', api: '/search/lyrics', idKey: 'song_id', nameKey: 'name', artistKey: 'artist_name' },
];

// ---- 搜索组件（类型筛选 + 搜索）----
function SearchAdd({ onAdd }: { onAdd: (it: { type: string; id: string; name: string; artist: string }) => void }) {
  const [searchQ, setSearchQ] = useState(''); const [results, setResults] = useState<any[]>([]);
  const [searchType, setSearchType] = useState('song');
  const cfg = SEARCH_TYPES.find(t => t.value === searchType) || SEARCH_TYPES[0];

  useEffect(() => {
    if (!searchQ.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const q = searchQ.trim();
        if (cfg.value === 'album') {
          const albums: any[] = await fetchJSON('/album_rank');
          setResults(albums.filter((a: any) => a.album.includes(q) || a.artist.includes(q)).slice(0, 8));
        } else {
          const params = new URLSearchParams({ q, limit: '8' });
          const res = await fetch('/api' + cfg.api + '?' + params).then(r => r.json());
          setResults(res.rows || []);
        }
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQ, searchType]);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select value={searchType} onChange={setSearchType} size="small" style={{ width: 80 }}
          options={SEARCH_TYPES.map(t => ({ value: t.value, label: t.label }))} />
        <Input placeholder={'搜索' + cfg.label + '...'} value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      {results.length > 0 && (
        <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 4, marginTop: 4 }}>
          {results.map((r: any) => {
            const id = r[cfg.idKey]; const name = (r[cfg.nameKey] || '').slice(0, 40); const artist = cfg.value === 'comment'
              ? (r.name || '?') + ' — ' + (cfg.artistKey ? (r[cfg.artistKey] || '') : '')
              : (cfg.artistKey ? (r[cfg.artistKey] || '') : '');
            const label = cfg.value === 'comment' ? name : name + ' — ' + artist;
            return (
              <div key={id || Math.random()}
                onClick={() => { onAdd({ type: cfg.value, id: String(id), name: name || '', artist: artist || '' }); setSearchQ(''); setResults([]); }}
                style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Tag style={{ fontSize: 10 }}>{cfg.label}</Tag> {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- 我的我推 ----
function MyCollections() {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [editName, setEditName] = useState(''); const [editDesc, setEditDesc] = useState('');

  const load = () => fetchJSON<any[]>('/collections/mine', {}, { Authorization: 'Bearer ' + getToken() }).then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

	  const openDetail = async (c: any) => {
	    const d: any = await fetchJSON('/collections/' + c.id);
	    setSel(d); setEditName(d.name); setEditDesc(d.description || '');
  };

  const saveEdit = async () => {
    if (!sel) return;
    await fetchJSON('/collections/' + sel.id, {}, { Authorization: 'Bearer ' + getToken() }, 'PUT', {
      name: editName, description: editDesc,
    });
    message.success('已保存'); load();
  };

  const addItemToSel = async (it: { type: string; id: string; name: string; artist: string }) => {
    if (!sel) return;
    if (sel.items?.find((x: any) => x.item_id === it.id && x.item_type === it.type)) { message.info('已存在'); return; }
    await fetchJSON('/collections/' + sel.id, {}, { Authorization: 'Bearer ' + getToken() }, 'PUT', { items: [it] });
    const d = await fetchJSON('/collections/' + sel.id);
    setSel(d); message.success('已添加'); load();
  };

  const removeItem = async (itemId: number) => {
    if (!sel) return;
    const newItems = (sel.items || []).filter((it: any) => it.id !== itemId);
    await fetchJSON('/collections/' + sel.id, {}, { Authorization: 'Bearer ' + getToken() }, 'PUT', {
      items: newItems.map((it: any) => ({ type: it.item_type, id: it.item_id, name: it.item_name, artist: it.item_artist })), replace: 1,
    });
    setSel({ ...sel, items: newItems }); message.success('已移除'); load();
  };

  if (sel) return (
    <div>
      <Button type="link" onClick={() => setSel(null)} style={{ padding: 0, marginBottom: 12 }}>← 返回我的我推</Button>
      <Input value={editName} onChange={e => setEditName(e.target.value)} style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }} />
      <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ marginBottom: 12 }} />
      <Button onClick={saveEdit} type="primary" style={{ marginBottom: 12 }}>保存</Button>
            <Button danger onClick={async () => {
              if (!sel || !confirm('确定删除「' + sel.name + '」？此操作不可恢复。')) return;
              await fetchJSON('/collections/' + sel.id, {}, { Authorization: 'Bearer ' + getToken() }, 'DELETE');
              message.success('已删除'); setSel(null); load();
            }} style={{ marginBottom: 12, marginLeft: 8 }}>删除</Button>
      {/* 添加内容 */}
      <SearchAdd onAdd={addItemToSel} />
      <h4 style={{ color: 'var(--text2)', margin: '12px 0 8px' }}>内容（{sel.items?.length || 0} 项）</h4>
      {!sel.items?.length ? <Empty description="暂无内容" /> :
        sel.items.map((it: any) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 }}>
            <span style={{ flex: 1 }}>
	              <Tag color={it.item_type === 'comment' ? 'blue' : it.item_type === 'artist' ? 'green' : it.item_type === 'album' ? 'purple' : it.item_type === 'lyric' ? 'orange' : 'red'}>{it.item_type}</Tag>
	              {it.item_type === 'comment' ? (
	                <span><i style={{ color: 'var(--text2)' }}>"{it.item_name}"</i>
	                  {it.item_artist && <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{it.item_artist.includes(' — ') ? '《' + it.item_artist.split(' — ')[0] + '》-' + it.item_artist.split(' — ').slice(1).join(' — ') : it.item_artist}</span>}
	                </span>
	              ) : it.item_type === 'lyric' ? (
	                <span><span style={{ color: 'var(--text)' }}>"{it.item_name.slice(0, 40)}{it.item_name.length > 40 ? '…' : ''}"</span>
	                  {it.item_artist && <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{it.item_artist.includes(' — ') ? '《' + it.item_artist.split(' — ')[0] + '》-' + it.item_artist.split(' — ').slice(1).join(' — ') : it.item_artist}</span>}
	                </span>
	              ) : (
	                <span>{it.item_name}</span>
	              )}
              {it.item_artist && it.item_type !== 'lyric' && it.item_type !== 'comment' && <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{it.item_artist.includes(' — ') ? '《' + it.item_artist.split(' — ')[0] + '》-' + it.item_artist.split(' — ').slice(1).join(' — ') : it.item_artist}</span>}
            </span>
            <Button size="small" danger onClick={() => removeItem(it.id)}>移除</Button>
          </div>
        ))}
    </div>
  );

  if (!list.length) return <Empty description="还没有创建我推" />;
  return (
    <Row gutter={[12, 12]}>
      {list.map(c => (
        <Col key={c.id} xs={12} md={8} lg={6}>
          <Card size="small" hoverable onClick={() => openDetail(c)} title={c.name}
            extra={<span style={{ fontSize: 11, color: 'var(--text3)' }}>❤{c.like_count || 0}</span>}>
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>{c.description || '暂无描述'}</div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>{c.created_at?.slice(0, 10)}</div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

// ---- 创建我推 ----
function CreateCollection({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  const [items, setItems] = useState<{ type: string; id: string; name: string; artist: string }[]>([]);

  const addItem = (it: { type: string; id: string; name: string; artist: string }) => {
    if (items.find(x => x.id === it.id)) { message.info('已添加'); return; }
    setItems([...items, it]);
  };

  const submit = async () => {
    if (!name) { message.warning('名称不能为空'); return; }
    try {
      await fetchJSON('/collections', {}, { Authorization: 'Bearer ' + getToken() }, 'POST', { name, description: desc, items });
      message.success('创建成功'); onDone();
    } catch (e: any) { message.error(e.message || '创建失败'); }
  };

  return (
    <Card title="创建我推" size="small">
      <Input placeholder="我推名称" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 8 }} />
      <Input placeholder="描述（可选）" value={desc} onChange={e => setDesc(e.target.value)} style={{ marginBottom: 8 }} />
      <SearchAdd onAdd={addItem} />
      <div style={{ marginBottom: 8 }}>{items.map((it, i) => (
        <Tag key={i} closable onClose={() => setItems(items.filter((_, j) => j !== i))}>{it.name} - {it.artist}</Tag>
      ))}</div>
      <Button type="primary" onClick={submit}>创建</Button>
    </Card>
  );
}

// ---- 广场 ----
function SquarePanel() {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [cmt, setCmt] = useState('');

	  const load = () => fetchJSON('/square').then((data: any) => setList(data as any[])).catch(() => {});
  useEffect(() => { load(); }, []);

  const toggleLike = async (id: number) => {
    try {
	    const res: any = await fetchJSON('/collections/' + id + '/like', {}, { Authorization: 'Bearer ' + getToken() }, 'POST');
      // 更新列表中的 liked 状态
      setList(prev => prev.map(c => c.id === id ? { ...c, liked: res.liked, like_count: res.liked ? (c.like_count || 0) + 1 : Math.max(0, (c.like_count || 0) - 1) } : c));
      if (sel?.id === id) {
        const d = await fetchJSON('/collections/' + id); setSel(d);
      }
    } catch { message.error('请先登录'); }
  };

  const addCmt = async (id: number) => {
    if (!cmt.trim()) return;
    try {
      await fetchJSON('/collections/' + id + '/comment', {}, { Authorization: 'Bearer ' + getToken() }, 'POST', { content: cmt });
      setCmt('');
      if (sel?.id === id) { const d = await fetchJSON('/collections/' + id); setSel(d); }
    } catch { message.error('请先登录'); }
  };

  // 条目评论
  const [itemCmt, setItemCmt] = useState<Record<number, string>>({});
  const addItemCmt = async (itemId: number, content?: string) => {
    const c = content || itemCmt[itemId] || '';
    if (!c.trim()) return;
    try {
      await fetchJSON('/items/' + itemId + '/comment', {}, { Authorization: 'Bearer ' + getToken() }, 'POST', { content: c });
      setItemCmt(prev => ({ ...prev, [itemId]: '' }));
      if (sel) { const d = await fetchJSON('/collections/' + sel.id); setSel(d); }
    } catch { message.error('请先登录'); }
  };

  const toggleItemLike = async (itemId: number) => {
    try {
      await fetchJSON('/items/' + itemId + '/like', {}, { Authorization: 'Bearer ' + getToken() }, 'POST');
      if (sel) { const d = await fetchJSON('/collections/' + sel.id); setSel(d); }
    } catch { message.error('请先登录'); }
  };

  if (sel) return (
    <div>
      <Button type="link" onClick={() => setSel(null)} style={{ padding: 0, marginBottom: 12 }}>← 返回广场</Button>
      <h3 style={{ color: 'var(--text)' }}>{sel.name}</h3>
      <div style={{ color: 'var(--text2)', fontSize: 13 }}>{sel.nickname} · {sel.description}</div>
      <div style={{ marginTop: 12 }}>
        {(sel.items || []).map((it: any) => (
          <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 13 }}>
              <Tag color={it.item_type === 'comment' ? 'blue' : it.item_type === 'artist' ? 'green' : it.item_type === 'album' ? 'purple' : it.item_type === 'lyric' ? 'orange' : 'red'}>{it.item_type}</Tag>
              {it.item_type === 'comment' ? <i style={{ color: 'var(--text2)' }}>"{it.item_name}"</i> : it.item_type === 'lyric' ? <span style={{ color: 'var(--text)' }}>"{it.item_name.slice(0, 40)}{it.item_name.length > 40 ? '…' : ''}"</span> : <span>{it.item_name}</span>}
              {it.item_artist && <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{it.item_artist.includes(' — ') ? '《' + it.item_artist.split(' — ')[0] + '》-' + it.item_artist.split(' — ').slice(1).join(' — ') : it.item_artist}</span>}
              <Button type="text" size="small" icon={it.liked ? <HeartFilled style={{ color: 'red' }} /> : <HeartOutlined />}
                onClick={() => toggleItemLike(it.id)} style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 11 }}>
                {it.like_count || 0}
              </Button>
            </div>
            {/* 条目评论 */}
            <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
              <Input size="small" placeholder="评论此条目..." value={itemCmt[it.id] || ''}
                onChange={e => setItemCmt(prev => ({ ...prev, [it.id]: e.target.value }))}
                onPressEnter={(e: any) => { addItemCmt(it.id, e.target.value); itemCmt[it.id] && setItemCmt(prev => ({ ...prev, [it.id]: "" })); }}
                style={{ flex: 1, fontSize: 12 }} />
              <Button size="small" icon={<CommentOutlined />} onClick={() => addItemCmt(it.id, itemCmt[it.id])} />
              </div>
              {(it.comments || []).map((cm: any) => (
                <div key={cm.id} style={{ padding: '4px 0 4px 8px', color: 'var(--text2)', fontSize: 12, borderBottom: '1px dashed var(--border)' }}>
                  <b>{cm.nickname}</b>: {cm.content}
                </div>
              ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button icon={sel.liked ? <HeartFilled style={{ color: 'red' }} /> : <HeartOutlined />}
          onClick={() => toggleLike(sel.id)}>❤ {sel.like_count || 0}</Button>
        <Input placeholder="评论这个我推..." value={cmt} onChange={e => setCmt(e.target.value)} style={{ flex: 1 }} onPressEnter={() => addCmt(sel.id)} />
      </div>
      {(sel.comments || []).map((c: any) => (
        <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 }}>
          <b>{c.nickname}</b>: {c.content}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <h3 style={{ color: 'var(--text)', marginBottom: 16 }}>我推广场</h3>
      {!list.length ? <Empty description="还没有公开的我推" /> : (
        <Row gutter={[12, 12]}>
          {list.map(c => (
            <Col key={c.id} xs={12} md={8} lg={6}>
              <Card size="small" hoverable onClick={() => fetchJSON('/collections/' + c.id).then(setSel)} title={c.name}
                extra={<Button type="text" size="small" icon={c.liked ? <HeartFilled style={{ color: 'red' }} /> : <HeartOutlined />}
                  onClick={e => { e.stopPropagation(); toggleLike(c.id); }}>{c.like_count || 0}</Button>}>
                <div style={{ color: 'var(--text2)', fontSize: 12 }}>{c.nickname} · {c.description || '暂无描述'}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 4 }}>💬{c.comment_count || 0} · {c.created_at?.slice(0, 10)}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

// ---- 个人资料 ----
function ProfilePanel({ user }: { user: any }) {
  const [detail, setDetail] = useState<any>(null);
  const [myCols, setMyCols] = useState<any[]>([]);
  const [likedCols, setLikedCols] = useState<any[]>([]);

  useEffect(() => {
    const token = getToken();
	    fetchJSON('/auth/me', {}, { Authorization: 'Bearer ' + token }).then((d: any) => setDetail(d)).catch(() => {});
	    fetchJSON('/collections/mine', {}, { Authorization: 'Bearer ' + token }).then((d: any) => setMyCols(d)).catch(() => {});
	    fetchJSON('/collections/liked', {}, { Authorization: 'Bearer ' + token }).then((d: any) => setLikedCols(d)).catch(() => {});
  }, []);

  if (!detail) return <Spin />;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card title="基本信息" size="small">
          <Descriptions column={1} size="small" labelStyle={{ color: 'var(--text2)' }} contentStyle={{ color: 'var(--text)' }}>
            <Descriptions.Item label="昵称">{detail.nickname || '未设置'}</Descriptions.Item>
            <Descriptions.Item label="用户名">@{detail.username}</Descriptions.Item>
            <Descriptions.Item label="我推">{myCols.length} 个</Descriptions.Item>
            <Descriptions.Item label="已爱心">{likedCols.length} 个</Descriptions.Item>
          </Descriptions>
          <Button danger icon={<LogoutOutlined />} onClick={logout} style={{ marginTop: 16 }}>退出登录</Button>
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card title="我的我推" size="small">
          {myCols.length === 0 ? <Empty description="还没有创建" /> :
            myCols.map(c => (
              <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{c.name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>❤{c.like_count || 0}</span>
              </div>
            ))}
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card title="已爱心" size="small">
          {likedCols.length === 0 ? <Empty description="还没有点赞" /> :
            likedCols.map(c => (
              <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{c.name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>by {c.nickname || '?'}</span>
              </div>
            ))}
        </Card>
      </Col>
    </Row>
  );
}
