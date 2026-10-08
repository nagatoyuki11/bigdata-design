import React, { useState } from 'react';
import { Card, Row, Col, Input, Button, Tag, Spin, Empty, message } from 'antd';
import { ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import { useApi } from '../api/endpoints';
import { fetchJSON } from '../api/client';

export default function RhymeChainView() {
  const { data: charFull } = useApi<Record<string, { final: string; zhe: string }>>('char_full');
  const { data: zheData } = useApi<{ zhe: string; words: { word: string; count: number }[] }[]>('rhyme_zhe');

  const [userLine, setUserLine] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [history, setHistory] = useState<{ user: string; ai: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const getFinal = (ch: string) => charFull?.[ch]?.final || '';

  const respond = async () => {
    if (!userLine.trim()) return;
    setLoading(true);
    try {
      // 检测用户最后一句的韵脚
      const cleaned = userLine.replace(/[，。！？、；：""''（）\s\n]/g, '').trim();
      const lastChar = cleaned.slice(-1);
      const lastFinal = getFinal(lastChar);
      const zhe = charFull?.[lastChar]?.zhe || '';

      // 搜索同韵脚的歌词片段
      const params = new URLSearchParams({ q: lastFinal || lastChar, limit: '10' });
      const res = await fetch('/api/search/lyrics?' + params).then(r => r.json());
      const matches = (res.rows || []).filter((r: any) => r.frag && r.frag.length > 10);

      if (matches.length > 0) {
        const pick = matches[Math.floor(Math.random() * Math.min(matches.length, 5))];
        // 提取歌词片段中一个完整的句子
        const frag = pick.frag || '';
        const sentences = frag.split(/[，。！？；：、\n]/).filter((s: string) => s.trim().length > 3);
        const response = sentences.length > 0 ? sentences[0].trim() : frag.replace(/[\[\]]/g, '').slice(0, 30);
        setAiResponse(response);
        setHistory([...history, { user: userLine, ai: response }]);
      } else {
        setAiResponse('（未找到匹配的歌词，试试换一句~）');
      }
    } catch { setAiResponse('（搜索出错了，请重试）'); }
    finally { setLoading(false); setUserLine(''); }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title={<span><ThunderboltOutlined /> 歌词接龙</span>} size="small">
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            输入一句歌词，AI 从 40,000+ 首华语歌词中找出<b style={{ color: 'var(--accent)' }}>押韵</b>的下一句作为回应。
          </p>

          {/* 对话历史 */}
          <div style={{ marginBottom: 16, maxHeight: 400, overflow: 'auto' }}>
            {history.map((h, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <Tag color="red">你说</Tag>
                  <span style={{ color: 'var(--text)', fontSize: 14 }}>{h.user}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Tag color="purple">AI</Tag>
                  <span style={{ color: 'var(--accent)', fontSize: 14, fontStyle: 'italic' }}>{h.ai}</span>
                </div>
              </div>
            ))}
            {loading && <Spin />}
          </div>

          {history.length === 0 && !loading && <Empty description="开始接龙..." />}

          {/* 输入区 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Input.TextArea
              value={userLine}
              onChange={e => setUserLine(e.target.value)}
              placeholder="输入一句歌词..."
              rows={2}
              onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); respond(); } }}
              style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', fontSize: 14 }} />
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={respond} loading={loading} style={{ alignSelf: 'flex-end' }}>
              接龙
            </Button>
          </div>
          {history.length > 0 && (
            <Button icon={<ReloadOutlined />} onClick={() => { setHistory([]); setAiResponse(null); }} style={{ marginTop: 8 }}>
              重新开始
            </Button>
          )}
        </Card>
      </Col>
    </Row>
  );
}
