# 像素酒馆 · Pixel Tavern

参考 [chat.xstavern.com](https://chat.xstavern.com) 的「像素酒馆」网站，对本项目（SillyTavern 原始代码）改造出的**像素风在线酒馆 Demo**。

## 快速开始

```bash
npm install        # 首次运行需要
npm start          # 启动后自动打开 http://127.0.0.1:8000/
```

- **http://127.0.0.1:8000/** — 像素酒馆门户（默认首页）
- **http://127.0.0.1:8000/?classic=1** — 经典酒馆（原版 SillyTavern 界面，功能完整保留）

## 门户功能一览

| 模块 | 说明 |
| --- | --- |
| 角色卡集市 | 22 位原创像素角色，9 个分类 tab + 搜索；「滑卡书架」横滑推荐位 |
| 我的角色卡 | 自制 + 导入的角色卡，localStorage 持久化 |
| Build 制作 | 起名、写人设、挑发色/背景、随机像素形象，一键入书架并立即可聊 |
| 收藏 / 历史 | 收藏夹与最近 30 段对话，可「继续」恢复上下文 |
| 对话引擎 | 每位角色内置专属剧本（关键词命中 + 轮换闲聊），打字机效果、浏览器 TTS 朗读 |
| 沉浸互动 BETA | 心情 / 好感状态条、剧情追踪、每轮三组行动选项，可与传统聊天随时切换 |
| 像素点唱机 | 4 首 8-bit 酒馆小曲由 WebAudio 实时合成，无音频文件，收起面板音乐不断 |
| 酒馆炉火 | 侧栏实时像素火焰动画（Canvas） |
| 导入角色卡 | 支持 JSON 角色卡与 PNG 卡（自动解析 `tEXt/chara` 数据块） |
| 设置 | 音量、TTS、打字机、沉浸互动开关、三套主题色（金狮/翡翠/绯红）、清除本地数据 |
| 经典酒馆直通 | 顶栏与角色详情一键跳转 `/?classic=1` |

## 原版 SillyTavern 集成

- `tools/make-demo-cards.mjs`：用 Node 内置 zlib 生成像素头像 PNG，并通过
  `src/character-card-parser.js` 写入 V2 角色卡数据，输出到
  `data/default-user/characters/`。经典酒馆里可直接看到 8 位像素角色并正常开聊。
- 运行方式：`node tools/make-demo-cards.mjs`（需先启动过一次服务器以初始化数据目录）。

## 改动清单（对比上游 SillyTavern）

- 新增 `public/pixel-tavern/`（index.html / style.css / app.js / data.js / avatars.js / jukebox.js）
- `src/server-main.js`：`/` 默认返回像素酒馆门户；`/?classic=1` 保留原版首页，其余路由不变
- 新增 `tools/make-demo-cards.mjs` 与本说明文件
- 原版全部功能（后端、API、扩展、多用户、登录页）未受影响

## 技术要点

- 零构建、零外部图片：像素头像 / 图标 / 炉火 / Logo 全部由 Canvas 程序化绘制
- 像素字体：Zpix（中文，jsDelivr CDN）+ Press Start 2P（英文，Google Fonts），离线时优雅回退
- 状态存储于 `localStorage`（`pt_*` 前缀），不上传任何数据
- Demo 角色回复由本地剧本引擎生成，无需 API Key；接入真实大模型请用「经典酒馆」配置 API

## 版权说明

门户内全部角色与剧本为本 Demo 原创内容，仅供学习与演示；参考站风格仅作视觉方向借鉴，未复制其任何代码与素材。
