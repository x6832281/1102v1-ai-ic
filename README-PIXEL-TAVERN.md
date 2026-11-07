# 像素酒馆 · Pixel Tavern

参考 [chat.xstavern.com](https://chat.xstavern.com) 的「像素酒馆」网站，对本项目（SillyTavern 原始代码）改造出的**像素风在线酒馆**：角色卡集市、沉浸互动、真实大模型 AI 聊天，开箱即可用自己的域名上线。

**当前版本 V1.3「明炉真火」**

- **正式站点（自有域名，已上线）**：<https://ai-ic.top>（Vercel 零服务器方案：门户 + Serverless 像素 API，`git push` 即自动部署）
- **预览站**：<https://pixel-tavern-fgcq.zai-ai.site>（ZCode Sites，lite 服务器）

## 快速开始

```bash
npm install        # 首次运行需要
npm start          # 启动后自动打开 http://127.0.0.1:8000/
```

- **http://127.0.0.1:8000/** — 像素酒馆门户（默认首页）
- **http://127.0.0.1:8000/?classic=1** — 经典酒馆（原版 SillyTavern 界面，功能完整保留）

## 真实大模型（V1.3 新增）

角色回复优先由真实大模型流式生成，三层接入策略：

1. **站点共享模型** — 服务端配置环境变量（任何 OpenAI 兼容接口）：
   ```bash
   PIXEL_LLM_BASE_URL=https://api.deepseek.com/v1 \
   PIXEL_LLM_API_KEY=sk-xxx \
   PIXEL_LLM_MODEL=deepseek-chat \
   npm start
   ```
   门户设置页会显示「✓ 站点共享模型：模型名」，游客免配置直接真聊。
2. **访客自带接入点（BYOK）** — 门户「设置 → 模型接入」填入 Base URL / API Key / 模型 ID，
   可一键「测试连接」。Key 只存访问者浏览器本地；服务端仅接受 HTTPS 公网地址（防 SSRF），
   密钥不落盘、不写日志、不下发给第三方。
3. **本地剧本引擎** — 以上都不可用时自动回退（离线可玩），失败无感切换。

配套 API（`src/endpoints/pixel.js`）：`GET /api/pixel/status`（共享模型状态）、
`POST /api/pixel/chat`（SSE 流式代理，带 CSRF + 每 IP 限流）、`POST /api/pixel/probe`（BYOK 连通性测试）、
`POST /api/pixel/visit` / `GET /api/pixel/stats`（服务器端全站访问计数）。

## 用自己的域名上线

**`deploy/` 目录是完整的生产部署套件**，手把手手册见 [`deploy/README-DEPLOY.md`](deploy/README-DEPLOY.md)：

| 文件 | 作用 |
| --- | --- |
| `docker-compose.yml` | SillyTavern（含门户 + 像素 API）+ Caddy 两容器编排 |
| `Caddyfile` | 自动申请/续期 Let's Encrypt 证书；**公开**：门户 + `/api/pixel/*` + SEO 文件；**基础认证保护**：经典酒馆全部界面与 API |
| `.env.example` | 域名 / 证书邮箱 / 认证哈希 / 共享模型密钥模板 |
| `config/config.yaml` | 公网安全预设（关白名单、保持 CSRF、关插件与浏览器自启） |
| `lite/server.mjs` | 零依赖 Node 独立服务器（无 Docker 极简部署 / 静态托管平台用，含同一套像素 API） |
| `../api/pixel/*.js` | Vercel Serverless 函数版像素 API（**ai-ic.top 当前在用**，`git push` 自动部署） |

三条上线路径任选：**VPS + Docker + Caddy**（推荐，全自动 HTTPS）、**Cloudflare Tunnel**（无公网 IP 的家宽/NAS）、**lite 独立服务器**（任意能跑 Node 的平台）。

## 门户功能一览

| 模块 | 说明 |
| --- | --- |
| 角色卡集市 | 22 位原创像素角色，分类 tab + 搜索（防抖 + 关键词高亮）；「滑卡书架」横滑推荐位；今日互动角标 |
| 我的角色卡 | 自制 + 导入的角色卡，localStorage 持久化 |
| Build 制作 | 起名、写人设、挑发色/背景、随机像素形象，一键入书架并立即可聊 |
| 卡片全生命周期 | 详情弹窗内编辑（预填表单）、删除、收藏（角标实时同步）、导出 JSON / **导出标准 PNG 角色卡**（浏览器端 tEXt 注入，可导入任何 SillyTavern） |
| 对话引擎 | **真实大模型流式回复（共享模型 / BYOK）**、本地剧本引擎兜底、打字机、富文本气泡（动作/台词分色）、TTS、复制按钮 |
| 沉浸互动 BETA | 心情 / 好感状态条、剧情追踪像素时间线、三组行动选项（点击反馈态），可与传统聊天随时切换 |
| 历史与继续 | 最近 30 段对话（带头像），一键继续上次；消息时间戳；长对话自动折叠可展开 |
| 导出分享 | 对话导出 纯文本 / Markdown / **长图 PNG**（分色排版 + 预览弹窗 + 水印） |
| 像素点唱机 | 4 首 8-bit 酒馆小曲由 WebAudio 实时合成，无音频文件，收起面板音乐不断 |
| 酒馆炉火 | 侧栏实时像素火焰 + 石台底座 + 呼吸光晕 |
| 氛围系统 | 酒馆播报跑马灯、空状态像素灯笼、启动画面、三套主题色 |
| 导入角色卡 | 支持 JSON 角色卡与 PNG 卡（自动解析 `tEXt/chara` 数据块，还原门户剧本） |
| 设置 | 音量、TTS、打字机、沉浸互动、**模型接入（BYOK + 测试连接 + 共享模型状态）**、主题色、数据备份、清除本地数据 |
| SEO / 品牌 | meta/OG/Twitter 卡片、canonical 自动跟随域名、`robots.txt` 与 `sitemap.xml` 动态生成、site.webmanifest、程序化生成的品牌图标与 OG 横幅（`tools/make-brand.mjs`） |
| 合规声明 | 隐私声明（本地存储 + 匿名计数）、版权声明、18+ 年龄提示（设置页 + 使用指引） |
| 移动端 | 侧栏抽屉化（汉堡唤出）、安全区适配、窄屏单列弹窗 |
| 经典酒馆直通 | 顶栏与角色详情一键跳转 `/?classic=1`（公网部署时受基础认证保护） |

## 原版 SillyTavern 集成

- `tools/make-demo-cards.mjs`：生成 8 位像素角色卡到 `data/default-user/characters/`，经典酒馆可直接使用。
- `tools/smoke.mjs`：**82 断言冒烟测试**（文件完整性 / JS 语法 / 角色数据不变量 / 资源引用 /
  上线能力（品牌 PNG / SEO / BYOK 管线 / 部署套件）/ 服务器路由与角色卡 API），
  `node tools/smoke.mjs` 一键体检，退出码非 0 即有失败。
- `tools/mock-llm.mjs`：本地 mock OpenAI 兼容服务（联调用）：
  ```bash
  node tools/mock-llm.mjs &
  PIXEL_ALLOW_PRIVATE=1 PIXEL_LLM_BASE_URL=http://127.0.0.1:9990/v1 \
  PIXEL_LLM_API_KEY=test-key PIXEL_LLM_MODEL=mock-chat npm start
  ```

## 模块架构

```
data.js            数据层   22 位角色 / 分类 / 新闻常量
avatars.js         绘制层   像素头像 / 图标 / 炉火 / Logo / 灯笼（全程序化，零图片资源）
jukebox.js         音频层   WebAudio 8-bit 点唱机（4 首曲目实时合成）
market.js          卡片域   集市渲染 / 详情弹窗 / Build / 导入导出 / PNG 角色卡构建
chat.js            对话域   气泡 / 打字机 / 剧本引擎 / AI 流式回复 / 沉浸互动 / 长图导出
app.js             应用层   状态 / 视图路由 / 设置 / 事件绑定 / 启动
style.css          样式层   像素风设计系统（三主题色 / 响应式 / 无障碍）
src/endpoints/pixel.js   服务端  AI 代理 / 探测 / 访问统计（公开挂载，CSRF + 限流）
deploy/lite/server.mjs   独立版  零依赖 Node 服务器（静态门户 + 同一套像素 API）
```

加载顺序即依赖顺序。均为经典脚本 + 运行时全局引用（`/* global */` 声明 + `window.*` 导出）。

## 改动清单（对比上游 SillyTavern）

- 新增 `public/pixel-tavern/`（门户六模块 + fonts/zpix-subset.woff2 + brand/ 品牌图标 + site.webmanifest）
- 新增 `src/endpoints/pixel.js`（像素 API）；`src/server-main.js`：门户路由 + 像素 API 挂载 + 动态 robots/sitemap
- 新增 `deploy/`（Docker/Caddy/lite 部署套件与上线手册）
- 新增 `tools/`（make-demo-cards / make-brand / mock-llm / smoke）
- 原版全部功能（后端、API、扩展、多用户、登录页）未受影响；`public/robots.txt` 等原文件保持原样

## 技术要点

- 零构建、零外部图片：像素头像 / 图标 / 炉火 / Logo / 品牌 PNG 全部程序化绘制
- 像素字体：Zpix 本地子集（54KB）优先 + CDN 完整版按 unicode-range 兜底 + Press Start 2P
- 访客状态存于 `localStorage`（`pt_*` 前缀）；全站访问计数存服务端（`data/pixel-stats.json`）
- 流式回复：服务端 SSE 透传（OpenAI 兼容），前端逐字渲染；密钥永不下发
- 公开面最小化：公网只暴露门户静态页与 `/api/pixel/*`（限流 + CSRF + SSRF 防护），其余全部在基础认证之后

## 版权说明

门户内全部角色与剧本为本项目原创内容，仅供学习与演示；参考站风格仅作视觉方向借鉴，未复制其任何代码与素材。
