import type { ThemeConfig } from 'antd';

const baseTokens: ThemeConfig['token'] = {
  borderRadius: 8,
  fontSize: 14,
  fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`,
  colorSuccess: '#4caf50',
  colorWarning: '#faad14',
  colorError: '#ff4d4f',
  colorInfo: '#1890ff',
};

export const lightTokens: ThemeConfig = {
  token: {
    ...baseTokens,
    colorPrimary: '#c62f2f',
    colorBgBase: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorText: '#333333',
    colorTextSecondary: '#666666',
    colorTextTertiary: '#999999',
    colorBorder: '#e5e5e5',
    colorLink: '#c62f2f',
  },
  components: { Card: { colorBgContainer: '#ffffff' }, Input: { colorBgContainer: '#ffffff' }, Select: { colorBgContainer: '#ffffff' } },
};

export const darkTokens: ThemeConfig = {
  token: {
    ...baseTokens,
    colorPrimary: '#c62f2f',
    colorBgBase: '#0a0e1a',
    colorBgContainer: '#141b2e',
    colorBgLayout: '#0a0e1a',
    colorText: '#e9ecf5',
    colorTextSecondary: '#aeb6d0',
    colorTextTertiary: '#6b7394',
    colorBorder: '#2a3354',
    colorLink: '#ffb347',
  },
  components: { Card: { colorBgContainer: '#141b2e' }, Input: { colorBgContainer: 'rgba(255,255,255,0.04)' }, Select: { colorBgContainer: 'rgba(255,255,255,0.04)' } },
};
