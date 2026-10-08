import React from 'react';
import { Pagination } from 'antd';

export default function Pager({ total, page, limit, onChange }: { total: number; page: number; limit: number; onChange: (p: number) => void }) {
  if (total <= limit) return null;
  return (
    <Pagination
      current={page + 1}
      total={total}
      pageSize={limit}
      onChange={p => onChange(p - 1)}
      showSizeChanger={false}
      size="small"
      style={{ textAlign: 'right' }}
    />
  );
}
