# 幻境回声 · EchoCraft V2.3 顶级艺术美化与视觉重塑实施计划 (Aesthetic Overhaul Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 参考对标站 `chat.xstavern.com`，将当前较为扁平的 Web 界面全面重塑为拥有深邃黑曜石、多层高透磨砂琉璃、3:4 黄金比例典藏卡牌与电影级视觉小说剧场的高定叙事沙龙。

**Architecture:** 保持当前纯前端 Serverless + 逐像素 Canvas 软渲染架构不变，通过重构 CSS 设计令牌（Design Tokens）、卡片布局栅格、毛玻璃容器层次与剧场化对话界面，在零性能损耗、零版权风险、零第三方大型库的前提下实现艺术质感的维度跃迁。

**Tech Stack:** Vanilla JavaScript (ES2022), CSS3 (Modern Grid, Flexbox, Backdrop-Filter, Dynamic Viewport Units 100dvh), HTML5 Canvas, WebAudio.

**Spec:** [docs/superpowers/specs/2026-11-18-aesthetic-overhaul-design.md](file:///e:/ai/2026/1102v1-ai-ic/docs/superpowers/specs/2026-11-18-aesthetic-overhaul-design.md)

## Global Constraints

- **零破坏已有测试**：所有修改后必须通过 `node tools/smoke.mjs` 的全部 130 项断言（不得破坏现有 DOM ID、脚本接口或卡库数据流）。
- **经典酒馆完全兼容**：`http://127.0.0.1:8000/?classic=1` 经典 SillyTavern 核心必须继续保持 100% 完整可用。
- **性能与体积纪律**：严禁引入 Three.js 等庞大 3D/动画库，完全依靠现代 CSS 硬件加速与原生 Canvas，首屏资源零膨胀。
- **双主色纪律**：全站严格遵循官方双主色规约——萤青 `#00d1b2`（主行动点/高频交互）与琥珀金 `#f59e0b`（荣誉高光/典藏标记/辅高贵点缀）。
- **移动端 100% 友好**：所有布局必须在 360px~430px 小屏手机上保持双列对称、安全区避让、`font-size: 16px` 防 iOS 自动缩放。

## Review Focus

1. **Backdrop-filter 浏览器兼容性与回退**：在不支持 `backdrop-filter` 的旧环境或省电模式下，透明面板不得变为白板或无法阅读（必须有 `--bg-surface` 高不透明度底色兜底）。
2. **长对话与软键盘顶起时的剧场布局稳定性**：在移动端输入法弹起或长对话消息突破 300 条触发 DOM 折叠时，剧场背景光晕与悬浮选项不得发生抖动、穿透或遮挡输入框。
3. **卡片文字截断与长名字溢出**：若角色姓名、头衔或背景过长，必须在 3:4 卡片下半部优雅截断（`text-overflow: ellipsis`），严禁破坏网格对齐。
4. **典藏属性标签与整卡点击事件冒泡**：卡片底部的 `[♪ 音律]` 与 `[全 N 章]` 标签不得拦截整卡打开详情弹窗（`openDetail`）的点击手势。
5. **CSS 花括号平衡与语法完整性**：重构样式表后，必须执行括号平衡扫描，保证 0 语法缺陷。

---

### Task 1: Glassmorphism 2.0 材质设计令牌与全局容器重塑

**Files:**
- Modify: `public/pixel-tavern/style.css:1-250`
- Test: `tools/smoke.mjs`

**Interfaces:**
- Consumes: Existing `:root` variables in `style.css`.
- Produces: Enhanced design tokens (`--bg`, `--bg-elevated`, `--panel-glass`, `--panel-border`, `--shadow-card`, `--shadow-card-hover`, `--glass-blur`).

- [ ] **Step 1: 编写 CSS 令牌与花括号检查脚本**

在 `tools/test-css-tokens.mjs` 编写针对新令牌的验证断言，确保新增的 `--panel-glass`、`--shadow-card` 等变量合法存在，并验证 CSS 花括号严格配对。

- [ ] **Step 2: 运行测试验证失败**

运行：`node tools/test-css-tokens.mjs`  
预期：FAIL（提示缺少新设计令牌）。

- [ ] **Step 3: 重构 `style.css` 核心设计令牌与全站基础容器**

在 `public/pixel-tavern/style.css` 的 `:root` 与全局层级中：
1. 注入 Glassmorphism 2.0 令牌：
   ```css
   --bg: #07090e;
   --bg-elevated: #0d1117;
   --bg-surface: #121822;
   --panel-glass: rgba(14, 19, 28, 0.76);
   --panel-glass-deep: rgba(9, 13, 20, 0.88);
   --panel-border: rgba(255, 255, 255, 0.08);
   --panel-border-hover: rgba(0, 209, 178, 0.35);
   --shadow-card: 0 16px 36px -10px rgba(0, 0, 0, 0.65), 0 0 0 1px var(--panel-border);
   --shadow-card-hover: 0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 24px var(--accent-glow);
   --glass-blur: blur(20px);
   ```
2. 将 `#topbar`、`#sidebar`、`.modal-window` 与主要面板的背景升级为 `var(--panel-glass)` + `backdrop-filter: var(--glass-blur)`，并施加 `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09)` 细微内高光。

- [ ] **Step 4: 运行冒烟与令牌测试**

运行：`node tools/test-css-tokens.mjs && node tools/smoke.mjs`  
预期：全部 PASS，130 项断言全绿。

- [ ] **Step 5: 提交更改**

```bash
git add public/pixel-tavern/style.css tools/test-css-tokens.mjs
git commit -m "feat(design): implement Glassmorphism 2.0 tokens and surface materials"
```

---

### Task 2: 3:4 黄金比例典藏卡牌系统与展陈排版升级

**Files:**
- Modify: `public/pixel-tavern/style.css:730-860`
- Modify: `public/pixel-tavern/market.js:60-140`
- Test: `tools/smoke.mjs`

**Interfaces:**
- Consumes: Character objects from `allChars()` in `app.js` / `cards.js`.
- Produces: Upgraded `.card` DOM element with 3:4 `.card-cover`, structured metadata row (`.card-footer`), and enhanced hover micro-interactions.

- [ ] **Step 1: 扩展冒烟测试以验证 3:4 典藏卡牌要素**

在 `tools/smoke.mjs` 中添加针对卡片结构 `.card-cover`、`.card-meta` 的不变量断言，确保卡片渲染不丢失必选字段（姓名、分类、头衔、章节数）。

- [ ] **Step 2: 运行测试确认基线状态**

运行：`node tools/smoke.mjs`  
预期：PASS（基线校验）。

- [ ] **Step 3: 重写 `market.js` 的卡片结构渲染函数 `createCardEl`**

在 `public/pixel-tavern/market.js` 中重塑单卡 HTML 输出：
1. 封面容器 `.card-cover` 保持 3:4 画幅，内嵌肖像画布。
2. 卡下半部构建精美的琉璃信息区：
   - 角色姓名（20px 纯白高光加粗）+ 分类徽章
   - 身份头衔（12.5px 次级淡雅白）
   - 设定摘要（双行截断，行高 1.5）
   - 底部元数据栏：专属音律标签（`♪ 音律名`）+ 章节容量（`全 3 章` 或 `独立档案`）。

- [ ] **Step 4: 重构 `style.css` 中的 `.card-grid` 与 `.card` 样式**

1. 将 `.card-grid` 最小列宽由 160px 提升为 `minmax(220px, 1fr)`，列间距设为 `20px`。
2. `.card` 赋予 `border-radius: 14px`、`border: 1px solid var(--panel-border)`、`box-shadow: var(--shadow-card)`。
3. 悬停效果配置平滑抬升 `translateY(-6px)` 与双主色微光边缘扩散，光影过渡采用 `transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1)`。

- [ ] **Step 5: 运行完整冒烟测试**

运行：`node tools/smoke.mjs`  
预期：全部 PASS，130 项断言全绿。

- [ ] **Step 6: 提交更改**

```bash
git add public/pixel-tavern/style.css public/pixel-tavern/market.js tools/smoke.mjs
git commit -m "feat(design): upgrade character cards to 3:4 TCG collector format"
```

---

### Task 3: 电影级视觉小说剧场（Visual Novel Theater）对话空间

**Files:**
- Modify: `public/pixel-tavern/style.css:860-1320`
- Modify: `public/pixel-tavern/chat.js:120-220, 300-340`
- Test: `tools/smoke.mjs`

**Interfaces:**
- Consumes: `state.chat`, `updateImmersive()`, `pushMessage()` from `chat.js`.
- Produces: Visual Novel Theater chat layout with backdrop ambient scene glow, translucent dialogue panels, and floating glass option chips.

- [ ] **Step 1: 编写剧场对话结构回归测试**

在 `tools/test-chat-theater.mjs` 编写对 `#chat-header`、`#chat-scroll`、`#chat-form`、`#chat-options` 层次与样式的结构断言，确保关键 ID 均可被 DOM 抓取且事件绑定完备。

- [ ] **Step 2: 运行测试验证**

运行：`node tools/test-chat-theater.mjs`  
预期：FAIL 或 PASS（根据初始标记）。

- [ ] **Step 3: 重构 `style.css` 剧场对话布局与气泡质感**

1. 剧场顶栏 `#chat-header`：升级为高透冷光琉璃悬浮条，头像外圈增加微弱呼吸光环，按钮统一为 Glass 琉璃微按键。
2. 舞台深层光晕：优化 `.view[data-view="chat"]::before` 的径向渐变（Radial Gradient），根据 `--scene-glow` 投射柔焦天光，`z-index: 0` 不干扰文本点击。
3. 剧场气泡：
   - 角色消息采用 `background: rgba(14, 20, 30, 0.82)`，边缘赋予 `1px solid rgba(255, 255, 255, 0.08)`。
   - 台词 `.quote` 渲染为明亮温暖的高光金/白（`color: #ffe6a3`），动作旁白 `.act` 渲染为微斜体低反差冷灰（`color: #8da0b5`）。
4. 行动选项 `#chat-options`：重塑为悬浮在输入栏上方的通透琉璃胶囊芯片（`.option-chip`），悬停具有金色脉冲微动效。

- [ ] **Step 4: 细化 `chat.js` 的剧场光晕与心境联动**

在 `public/pixel-tavern/chat.js` 的 `updateImmersive()` 中，结合角色的 `mood`（心境）与 `favor`（好感度）动态调整头像边框的辉光参数（微光漫反射），使得对话互动富有情绪呼吸感。

- [ ] **Step 5: 运行完整冒烟与剧场测试**

运行：`node tools/test-chat-theater.mjs && node tools/smoke.mjs`  
预期：全部 PASS，130 项断言全绿。

- [ ] **Step 6: 提交更改**

```bash
git add public/pixel-tavern/style.css public/pixel-tavern/chat.js tools/test-chat-theater.mjs
git commit -m "feat(design): implement Visual Novel Theater chat layout and luminous dialogue styling"
```

---

### Task 4: 移动端全景响应式与磨砂底栏高定精修

**Files:**
- Modify: `public/pixel-tavern/style.css:1600-1900`
- Modify: `public/pixel-tavern/index.html:25-35, 420-435`
- Test: `tools/smoke.mjs`

**Interfaces:**
- Consumes: Mobile breakpoint `@media (max-width: 768px)`, `#mobile-nav`.
- Produces: Refined mobile view with dual-column 3:4 cards, safe-area-inset compliance, and cache-busted assets.

- [ ] **Step 1: 检查移动端视图断言**

检查 `tools/smoke.mjs` 中的资源引用版本与移动端标签合规性。

- [ ] **Step 2: 精修移动端响应式样式**

在 `public/pixel-tavern/style.css` 的 `@media (max-width: 768px)` 中：
1. 双列卡片适配：`.card-grid` 设为 `grid-template-columns: repeat(2, 1fr)`，间距微调为 `12px`，卡片高度保持约 270px 的优雅紧凑 3:4 比例。
2. 移动端底部导航栏 `#mobile-nav`：升级为 `backdrop-filter: blur(24px)` 结合顶边细微发光丝线，激活态图标与标签赋予萤青高光。
3. 移动端对话剧场：锁定 `100dvh` 视口，输入框保持 `font-size: 16px` 防止 iOS Safari 放大，底栏自动融入 Home Bar 安全区。

- [ ] **Step 3: 升级 `index.html` 资源版本号为 `?v=2150`**

在 `public/pixel-tavern/index.html` 中，将所有 script 和 link 的版本缓存参数由 `?v=2142` 统一升级为 `?v=2150`，确保线上 CDN 与用户浏览器即时穿透生效。

- [ ] **Step 4: 运行冒烟测试**

运行：`node tools/smoke.mjs`  
预期：全部 PASS，130 项断言全绿。

- [ ] **Step 5: 提交更改**

```bash
git add public/pixel-tavern/style.css public/pixel-tavern/index.html
git commit -m "feat(mobile): refine mobile responsiveness with frosted bottom navigation and 100dvh theater"
```

---

### Task 5: 全面回归验证、艺术审查与上线归档

**Files:**
- Modify: `PIXEL-TAVERN-BRAINSTORM.md`
- Test: `tools/smoke.mjs`

**Interfaces:**
- Consumes: All updated CSS, JS, HTML assets.
- Produces: 130/130 green smoke tests, clean git status, and archived R29 decision round.

- [ ] **Step 1: 执行全量自动化冒烟测试**

运行：`node tools/smoke.mjs`  
预期：130 项断言全部通过，零失败，零警告。

- [ ] **Step 2: 检查 Git 工作区状态**

运行：`git status`  
预期：working tree clean。

- [ ] **Step 3: 记录 R29 决策日志**

在 `PIXEL-TAVERN-BRAINSTORM.md` 底部追加 `## 决策轮 R29（2026.11.18，V2.3 顶级艺术美化与视觉小说剧场重塑落地）`，详述各项落地成果。

- [ ] **Step 4: 提交归档**

```bash
git add PIXEL-TAVERN-BRAINSTORM.md
git commit -m "docs: archive R29 aesthetic overhaul completion and verification"
```
