import React, { useState, useEffect } from 'react';
import { Button, Popover, List, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { fetchJSON } from '../api/client';

const TOKEN_KEY = 'yueping_token';
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

export default function AddToCollectionBtn({ itemType, itemId, itemName, itemArtist }: {
  itemType: string; itemId: string; itemName: string; itemArtist?: string;
}) {
  const [cols, setCols] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !cols.length) {
      fetchJSON<any[]>('/collections/mine', {}, { Authorization: 'Bearer ' + getToken() })
        .then(setCols).catch(() => {});
    }
  }, [open]);

  const addTo = async (cid: number) => {
    try {
      await fetchJSON('/collections/' + cid, {}, { Authorization: 'Bearer ' + getToken() }, 'PUT', {
        items: [{ type: itemType, id: itemId, name: itemName, artist: itemArtist || '' }],
      });
      message.success('已添加');
      setOpen(false);
    } catch { message.error('添加失败'); }
  };

  const content = (
    <div style={{ maxWidth: 240 }}>
      {cols.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 12 }}>还没有创建我推</div>
      ) : (
        <List size="small" dataSource={cols} renderItem={(c: any) => (
          <List.Item onClick={() => addTo(c.id)} style={{ cursor: 'pointer', color: 'var(--text)' }}>
            {c.name}
          </List.Item>
        )} />
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottom">
      <Button size="small" icon={<PlusOutlined />} style={{ fontSize: 12 }}>
        加入我推
      </Button>
    </Popover>
  );
}
