import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Input, Tag, Spin, Empty, Button, Select } from 'antd';
import { SoundOutlined, EditOutlined, ThunderboltOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useApi } from '../api/endpoints';

interface ZheGroup { zhe: string; words: { word: string; count: number }[]; }
interface DoubleGroup { key: string; words: { word: string; count: number }[]; }
interface CharInfo { final: string; zhe: string; tone: number; }
interface LineState { text: string; active: boolean; }

const ZHE_COLORS: Record<string, string> = {
  '发花辙': 'magenta', '梭波辙': 'orange', '乜斜辙': 'lime', '姑苏辙': 'cyan',
  '一七辙': 'red', '怀来辙': 'gold', '灰堆辙': 'geekblue', '遥条辙': 'green',
  '由求辙': 'purple', '言前辙': 'blue', '人辰辙': 'volcano', '江阳辙': 'orange',
  '中东辙': 'cyan', '其他': 'default',
};

export default function RhymeView() {
  const { data: zheData } = useApi<ZheGroup[]>('rhyme_zhe');
  const { data: doubleData } = useApi<DoubleGroup[]>('rhyme_double');
  const { data: charFull } = useApi<Record<string, CharInfo>>('char_full');
  const [lines, setLines] = useState<LineState[]>([{ text: '', active: true }]);
  const [toneFilter, setToneFilter] = useState<'all'|'ping'|'ze'>('all'); // 平仄筛选

  const getChar = (ch: string): CharInfo | null => charFull?.[ch] || null;

  // 音调筛选：平声=1,2（阴平阳平）仄声=3,4（上去）
  const toneMatch = (info: CharInfo | null): boolean => {
    if (!info || toneFilter === 'all') return true;
    if (toneFilter === 'ping') return info.tone === 1 || info.tone === 2;
    return info.tone === 3 || info.tone === 4;
  };

  // 每行解析
  const lineInfo = useMemo(() => lines.map(l => {
    const cleaned = l.text.replace(/[，。！？、；：""''（）\s\n]/g, '').trim();
    const chars = cleaned ? cleaned.split('') : [];
    const last = chars.length > 0 ? chars[chars.length - 1] : '';
    const prev = chars.length > 1 ? chars[chars.length - 2] : '';
    const li = getChar(last); const pi = getChar(prev);
    return {
      single: li, double: pi && li ? `${pi.zhe}|${li.zhe}` : '',
      lastChar: last, lastTwo: prev + last,
      lastTone: li?.tone || 0,
    };
  }), [lines, charFull]);

  const activeIdx = lines.findIndex(l => l.active);
  const activeInfo = activeIdx >= 0 ? lineInfo[activeIdx] : null;

  // 单押词
  const singleZhe = activeInfo?.single?.zhe || '';
  const singleWords = useMemo(() => {
    if (!zheData || !singleZhe) return [];
    const g = zheData.find(g => g.zhe === singleZhe);
    const words = g ? g.words : [];
    if (toneFilter === 'all') return words.slice(0, 60);
    // 按音调筛选
    return words.filter(w => {
      const lastCh = w.word[w.word.length - 1];
      const info = getChar(lastCh);
      return toneMatch(info);
    }).slice(0, 60);
  }, [zheData, singleZhe, toneFilter]);

  // 双押词
  const doubleKey = activeInfo?.double || '';
  const doubleWords = useMemo(() => {
    if (!doubleData || !doubleKey) return [];
    const g = doubleData.find(g => g.key === doubleKey);
    return g ? g.words.slice(0, 40) : [];
  }, [doubleData, doubleKey]);

  const addToLine = (word: string) => {
    if (activeIdx < 0) return;
    const nl = [...lines];
    nl[activeIdx] = { ...nl[activeIdx], text: nl[activeIdx].text + word };
    setLines(nl);
  };

  if (!zheData || !charFull) return <Spin />;

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title={<span><EditOutlined /> 歌词创作 · 押韵助手</span>} size="small">
          <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 8 }}>
            基于<b style={{ color: 'var(--accent)' }}>十三辙</b>押韵体系：同辙 = 忽略韵头（介音），只看韵腹+韵尾。
            an/ian/uan 同属「言前辙」可互押；in≠ing（前/后鼻音严格区分）。
          </p>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>平仄：</span>
            <Select size="small" value={toneFilter} onChange={v => setToneFilter(v)} style={{ width: 100 }}
              options={[{ value: 'all', label: '不限' }, { value: 'ping', label: '平声 (12)' }, { value: 'ze', label: '仄声 (34)' }]} />
          </div>

          {lines.map((l, i) => {
            const info = lineInfo[i];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Button type={l.active ? 'primary' : 'default'} size="small" style={{ minWidth: 44, fontSize: 11 }}
                  onClick={() => setLines(lines.map((x, j) => ({ ...x, active: j === i })))}>行{i + 1}</Button>
                <Input value={l.text} onChange={e => {
                  const nl = [...lines]; nl[i] = { ...nl[i], text: e.target.value }; setLines(nl);
                }} placeholder={`第 ${i + 1} 行...`}
                  style={{ flex: 1, fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', fontSize: 14, borderColor: l.active ? 'var(--accent)' : undefined }} />
                {info.single && (
                  <Tag color={ZHE_COLORS[info.single.zhe] || 'default'}>
                    {info.single.zhe} {info.lastTone > 0 ? ['', 'ˉ', 'ˊ', 'ˇ', 'ˋ'][info.lastTone] : ''}
                  </Tag>
                )}
                {info.double && <Tag color="purple" style={{ fontSize: 10 }}>{info.double}</Tag>}
                {lines.length > 1 && (
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => {
                      const nl = lines.filter((_, j) => j !== i);
                      if (nl.length > 0 && l.active) nl[0].active = true;
                      setLines(nl);
                    }} />
                )}
              </div>
            );
          })}
          <Button icon={<PlusOutlined />} size="small" style={{ marginTop: 8 }}
            onClick={() => setLines([...lines, { text: '', active: false }])}>添加一行</Button>
        </Card>
      </Col>

      {/* 单押：按辙推荐 */}
      <Col xs={24} md={12}>
        <Card title={<span><SoundOutlined /> 单押 · {singleZhe || '等待输入'}</span>} size="small">
          {singleWords.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 380, overflow: 'auto' }}>
              {singleWords.map((w, i) => (
                <Tag key={i} color={i < 3 ? (ZHE_COLORS[singleZhe] || 'red') : 'default'}
                  style={{ cursor: 'pointer', fontSize: Math.max(12, 10 + Math.log2(w.count / 100) * 3), padding: '3px 10px' }}
                  onClick={() => addToLine(w.word)}>
                  {w.word}<span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 2 }}>{w.count}</span>
                </Tag>
              ))}
            </div>
          ) : <Empty description={activeInfo?.single ? `「${singleZhe}」暂无匹配` : '点击行首激活并输入...'} />}
        </Card>
      </Col>

      {/* 双押 */}
      <Col xs={24} md={12}>
        <Card title={<span><ThunderboltOutlined /> 双押 · {doubleKey || '等待输入'}</span>} size="small">
          {doubleKey && !doubleWords.length ? (
            <Empty description={`「${activeInfo?.lastTwo}」→ ${doubleKey} 暂无匹配`} />
          ) : doubleWords.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 380, overflow: 'auto' }}>
              {doubleWords.map((w, i) => (
                <Tag key={i} color={i < 3 ? 'purple' : 'default'}
                  style={{ cursor: 'pointer', fontSize: Math.max(12, 10 + Math.log2(w.count / 100) * 3), padding: '3px 10px' }}
                  onClick={() => addToLine(w.word)}>
                  {w.word}<span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 2 }}>{w.count}</span>
                </Tag>
              ))}
            </div>
          ) : <Empty description="输入至少两个汉字..." />}
        </Card>
      </Col>
    </Row>
  );
}
