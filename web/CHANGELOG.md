# 编辑日志 (Changelog)

## 2026-06-19 — 年报点评重写 + 歌词我推增强 + 9项Bug修复

### 🐛 Bug修复
| # | 问题 | 修复 |
|---|------|------|
| 1 | 仅4个数据库模块可切换，其他6模块全跳回歌曲页 | `App.tsx` VIEW_MAP 补全 rank/report/mood/album/rhyme/user 6个映射（lazy import 后漏注册） |
| 2 | 榜单柱状图不显示 | `RankView.tsx` 将 ECharts 配置中的 CSS 变量替换为硬编码色值（Canvas 不解析 `var(--*)`） |
| 3 | 歌词加入我推实际添加的是歌曲 | `LyricDetail.tsx` itemType 从 `"song"` 改为 `"lyric"` |
| 4 | 评论条目重复显示《歌名》-歌手 | `UserView.tsx` 兜底渲染增加 `it.item_type !== 'comment'` 守卫 |
| 5 | 年报点评全是模板填充公式化文本 | 重写 `year_report.py` 点评引擎 |
| 6 | 年报点评"代表作《歌手名》"而非歌名 | 修正 `top_song` 索引：`songs[0][2]`（artist_name）→ `songs[0][1]`（name） |
| 7 | TypeScript 7个 `unknown` 类型报错阻止构建 | `UserView.tsx` 5处 `fetchJSON().then(setXxx)` 加显式类型标注 `(d: any) =>` |
| 8 | 歌词我推后缀格式与评论不一致 | `item_artist` 统一为 `"歌名 — 歌手"`，展示 `"歌词"《歌名》-歌手` |
| 9 | 选中多行歌词每行各成一个条目 | `LyricDetail.tsx` 改为选中行合并为1个条目，换行符拼接 |

### ✨ 年报点评重写 (`year_report.py`)
- **17个年代阶段**：文革末期→改革开放→谭张争霸→四大天王→周杰伦时代→短视频时代→后疫情时代
- **6维度分析**：年代背景 → 数据量级（大年/丰年/稳年/小年）→ 歌手格局 → 金曲排行 → 主题变迁 → 歌词热词
- **趋势检测**：年际环比增减、热度暴涨/回落、黑马突围、🎖️三连冠标记、金曲断层倍数
- **自适应阈值**：80年代10万即热，2020年代需500万
- **数据重生成**：`year_report.json` 57年全部更新

### ✨ 歌词我推增强 (`LyricDetail.tsx` 完全重写)
- **逐行多选**：歌词拆分为纯文本行（剥离 `[mm:ss.xx]` 时间戳），点击高亮切换
- **全选/取消**：工具栏按钮 + 实时计数 `已选 3/24 行`
- **多行合并**：选中多行 → 合并为 **1个条目**（`\n` 拼接），未选则添加整首 `《歌名》全文歌词`
- **40字截断**：收藏列表展示超长歌词自动加 `…`
- **内联合集选择**：Popover 加载我的我推列表，不再依赖 `AddToCollectionBtn` 组件
- **搜索支持**：`UserView.tsx` SEARCH_TYPES 新增 `{ value: 'lyric', api: '/search/lyrics' }`，创建我推时可搜歌词
- **展示格式**：橙色 `lyric` 标签 + `"歌词行"《歌名》-歌手` 对齐评论格式

### 📝 改动文件清单
| 文件 | 改动类型 | 内容 |
|------|----------|------|
| `src/App.tsx` | 修复 | VIEW_MAP 从 4 项补全为 10 项 |
| `src/views/RankView.tsx` | 修复 | ECharts `var(--accent)`/`var(--text2)` → `#e0143c`/`#999999` |
| `src/views/UserView.tsx` | 修复+增强 | 7处 TS 类型标注、lyric 搜索类型、橙色 Tag、40字截断、歌手去重守卫 |
| `src/drawers/LyricDetail.tsx` | 重写 | 逐行解析+多选+合并条目+Popover合集选择+artist 格式对齐 |
| `year_report.py` | 重写 | 6维智能点评引擎 + 趋势检测 + 年代自适应 |
| `data/year_report.json` | 重生成 | 57年数据全部更新 |
| `CHANGELOG.md` | 更新 | 本条目 |

### 🔗 接龙模块（前次会话已删除）
- `RhymeChainView` 及 TabNav 接龙标签已于上次会话移除，本次确认无残留

### 🏗️ 架构变更
- **全栈重写**：HTML+JS → Vite + React 18 + TypeScript + Ant Design 5 暗色主题
- **数据层**：@tanstack/react-query 缓存管理，20+ useQuery hooks
- **抽屉系统**：全局 DrawerContext 替代单页 openDrawer/closeDrawer，支持多级导航栈
- **图表迁移**：echarts-for-react 替代手动 echarts.init 管理
- **构建**：Vite 6 生产构建，dist/ 由 Express 自动服务

### 🐛 8大问题修复
| # | 问题 | 修复 |
|---|------|------|
| 1 | 缺少专辑名 | `db.js` 列表行/详情抽屉新增 💿专辑 标签显式展示 |
| 2 | 缺少网易云链接 | 歌曲详情新增「▶ 网易云播放」按钮，从 song_id 重建 URL |
| 3 | 年份只到2024 | 占位符改为动态当前年份，input 添加 min/max 约束 |
| 4 | 歌曲缺失 | 新增 `--crawl-artist` 专辑遍历模式，8位歌手补抓 2363 首新歌 |
| 5 | 数据真伪 | 修复 artist_id=0 聚合 bug，新增 authentic 门槛（评论≥100） |
| 6 | 详情右侧抽屉 | 改为屏幕居中弹窗 (840px)，圆角缩放动画 |
| 7 | 网络拥挤+高亮 | 斥力 160→320，新增点击高亮+搜索定位+其余变暗逻辑 |
| 8 | 歌手照片 | 补抓 img1v1Url，新增 photo 列，详情页渲染圆形头像 |

### 🚀 6大创新功能
| # | 功能 | 实现 |
|---|------|------|
| 1 | 歌手成长轨迹 | `career_export.py` 导出年表，前端 Select + ECharts 折线图 |
| 2 | 歌曲基因图谱 | `SongDna.tsx` 六维雷达图嵌入歌曲详情 |
| 3 | 华语乐坛编年史 | 年代-主题-情感桑基图 (`EmotionFlowView`) |
| 4 | 情感地理 | `emotion_flow.py` 导出关联数据 |
| 5 | 评论文化基因 | 待实现 |
| 6 | 专辑宇宙 | `album_export.py` 500张专辑按概念度排行 |

### 🔧 后续优化 (2026-06-17 晚间)
| 改动 | 描述 |
|------|------|
| 合作网络筛选 | `ArtistNetwork.tsx` 新增合作次数 Slider 滑块过滤 |
| 榜单重构 | 删除总榜，标签改为 🎵歌曲/🎤歌手/📝高频词；年代下拉→具体年份输入框 |
| 高频词统计 | `word_freq.py` 对 31,038 首歌词分词统计 Top500 高频词 |
| 情感→流向 | 删除 SentimentView，替换为 🌊 年代-主题-情感桑基图 |
| 点歌扩充 | 每日精选卡片可点击进详情 + 👍😑👎 态度反馈按钮 + 年代/热度多维筛选 + 跨主题推荐 |
| 年份筛选修复 | 新增 `GET /api/rank/artists?ymin=&ymax=` 和 `/api/rank/words?ymin=&ymax=` 后端端点 |

### 📁 新增后端端点
| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/collab-songs?a1=&a2=` | GET | 两位歌手合作歌曲列表 |
| `/api/rank/artists?ymin=&ymax=` | GET | 按年份区间排行歌手 |
| `/api/rank/words?ymin=&ymax=` | GET | 按年份区间统计高频词 |

### 📁 新增数据导出脚本
| 脚本 | 输出 | 用途 |
|------|------|------|
| `album_export.py` | `album_rank.json` | 专辑概念度排行 |
| `career_export.py` | `artist_career.json` | 歌手年度轨迹 |
| `rank_export.py` | `rank_songs_all.json` 等 | 歌曲/歌手总排行+年代排行 |
| `emotion_flow.py` | `emotion_flow.json` | 年代-主题-情感桑基图数据 |
| `daily_picks.py` | `daily_picks.json`, `cross_recommend.json` | 每日精选+跨主题推荐 |
| `word_freq.py` | `word_freq.json` | 全歌词高频词 Top500 |

### 📁 项目文件结构 (React 版)
```
web/
├── server.js              # Express (新增 3 端点)
├── dist/                  # Vite 构建产物
├── src/
│   ├── App.tsx            # 布局 + TabNav + 13 lazy views
│   ├── main.tsx           # ReactDOM + QueryClient + AntD ConfigProvider
│   ├── theme.ts           # 暗色主题 token 覆盖
│   ├── api/               # fetchJSON + 20+ hooks
│   ├── context/           # DrawerContext 导航栈
│   ├── components/        # KpiStrip, TabNav, SongRow, ArtistRow, Pager, SongDna
│   ├── drawers/           # DrawerHost, SongDetail, ArtistDetail, ArtistNetwork, CollabSongs
│   └── views/             # 13 视图组件
```

### 🗑️ 删除
- `public/index.html` (旧版) → `public_bak/`
- `public/db.js`, `public/app.js`, `public/style.css` → 已迁移到 React
- 首页「🕸️ 合作网络」导航标签 → 移至歌手详情页按钮
- `view-network` 模板 → 已删除
- `SentimentView` (情感分析 4 图表) → 替换为 `EmotionFlowView`
- 「🏆 总榜」标签 → 合并到三大分榜中
