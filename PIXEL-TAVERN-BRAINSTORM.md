# 像素酒馆 · 头脑风暴与优化日志

> 由定时巡检任务自动维护：每轮记录「发现的问题 / 头脑风暴清单 / 实施的改动 / 验证结果」。
> 项目背景见 README-PIXEL-TAVERN.md。

---

## 轮次 #1 — 2026-11-06（首轮）

### 发现的问题
1. **ESLint 110 个错误**：78 个为格式问题（缩进/逗号空格/行尾空格）；32 个为跨文件全局脚本的解析问题（no-undef / no-unused-vars，多文件 `<script>` 全局架构所致）；1 个真死代码（`skinDark` 未使用）。
2. **对话页布局用魔法数字**：`#chat-scroll` 高度 `calc(100vh - 58px - 66px - 62px)`，与实际头部/表单尺寸强耦合，窗口尺寸变化时易出现双滚动条或输入栏悬浮。
3. **弹窗不支持键盘关闭**：只能点 ✕ 或遮罩，无 ESC 支持（可访问性）。
4. **卡片网格无入场反馈**：切换分类/搜索时卡片瞬间出现，缺乏动画引导。
5. **未支持 `prefers-reduced-motion`**：炉火/动画对动效敏感用户不友好。

### 头脑风暴清单（本轮评估 8 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 代码质量 | ESLint 清零（--fix + window.* 导出 + 死代码） | 高 | ✅ |
| 2 | 交互/布局 | 对话页改 flex 自适应高度，输入栏永远贴底 | 高 | ✅ |
| 3 | 可访问性 | ESC 关闭弹窗 + reduced-motion 支持 | 高 | ✅ |
| 4 | 视觉 | 卡片交错入场动画（前 8 张 stagger） | 中高 | ✅ |
| 5 | 视觉 | Zpix 中文字体 ~10MB 过重，考虑子集化或仅标题用像素字体 | 中 | ⏳ 下一轮评估 |
| 6 | 交互 | 重开后对话模式（沉浸/传统）应随会话记忆而非全局设置 | 中 | ⏳ |
| 7 | 性能 | 炉火 rAF 在页面不可见时暂停（visibilitychange） | 中 | ⏳ |
| 8 | 视觉 | 沉浸互动面板加"剧情追踪"时间线样式（更贴参考站） | 低中 | ⏳ |

### 实施的改动
- `public/pixel-tavern/*.js`：ESLint `--fix` 清理格式；`data.js`/`avatars.js`/`jukebox.js` 末尾追加 `window.*` 导出块；`app.js` 头部加 `/* global */` 声明；删除 `avatars.js` 未使用变量 `skinDark`。**110 → 0 错误。**
- `public/pixel-tavern/style.css`：
  - 对话页 `.view[data-view="chat"]` 改为 flex 纵向布局，高度 `calc(100vh - 58px - 20px)`；`#chat-scroll` 改 `flex: 1 1 0; min-height: 0`；`#chat-form` 去 sticky 改常规流并 `width: 100%`；移动端媒体查询同步清理。
  - `.card` 增加 `card-in` 交错入场动画（前 8 张延迟递增）。
  - 新增 `prefers-reduced-motion: reduce` 全局减弱动效。
- `public/pixel-tavern/app.js`：`bindEvents()` 增加 ESC 关闭弹窗监听。

### 验证结果
- ESLint：`npx eslint public/pixel-tavern/*.js` → **0 错误 0 警告**。
- 浏览器实测（1440×900）：
  - 首页 22 卡 / 10 分类 / 滑卡书架 8 张，无控制台报错；Press Start 2P 已加载。
  - 对话页：`#chat-scroll` 高 692px、输入栏底边 = 视口底边（900px）→ flex 布局生效 ✅
  - `.card` 计算样式 `animation-name: card-in` ✅
  - ESC：弹窗开 → 按 ESC → 关闭 ✅
- 未改动 `src/server-main.js`，服务器无需重启；`/?classic=1` 不受影响。

### 下轮建议
- 评估 Zpix 字体子集化（fonttools）或改用 CDN 按需子集，降低首屏加载。
- 对话模式（沉浸/传统）随历史会话记忆。
- `visibilitychange` 时暂停炉火与点唱机调度器，省电。

---

## 轮次 #2 — 2026-11-06

### 发现的问题
1. **对话模式不随会话记忆**：从历史记录重开对话时，沉浸/传统模式被全局设置覆盖，用户在某段对话中的选择丢失。
2. **后台标签页音频卡顿风险**：点唱机用 `setInterval` lookahead 调度，浏览器对后台标签节流至 ≥1s，前视窗口 0.12s 不够 → 切后台音乐会卡顿；炉火 rAF 虽被浏览器自动暂停，但调度器仍在跑。
3. **迷你播放器按钮状态逻辑分散**：三处 handler 各自手写按钮/动画同步，`visibilitychange` 引入后需要统一。
4. （浏览器巡检）Build 视图 8 个分类选项、预览画布、表单对齐均正常；无控制台报错。

### 头脑风暴清单（本轮评估 7 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 交互 | 对话模式随会话记忆（session.immersive 持久化） | 高 | ✅ |
| 2 | 性能 | 页面不可见时暂停炉火+点唱机，切回自动恢复 | 高 | ✅ |
| 3 | 视觉 | 顶栏「酒馆播报」无缝跑马灯（参考站在线氛围） | 中高 | ✅ |
| 4 | 交互 | 播放器按钮状态统一 syncMiniPlayBtn()，消除三处重复 | 中 | ✅（随 #2 顺手做） |
| 5 | 性能 | Zpix 字体子集化（~10MB → 常用 3500 字） | 中 | ⏳ 需 Python 工具链，单独立项 |
| 6 | 视觉 | 沉浸互动「剧情追踪」时间线样式（节点圆点+竖线） | 低中 | ⏳ |
| 7 | 交互 | 搜索防抖 + 高亮命中关键词 | 低 | ⏳ |

### 实施的改动
- `app.js`：
  - `#btn-chat-mode` 切换时把模式写入 `session.immersive` 并 `persistSession()`；`reopenHistory()` 按 `h.immersive` 恢复（未定义时回退全局设置）。
  - 新增 `visibilitychange` 监听：隐藏时 `PTFire.stop()` + 点唱机 `pause()`（记录恢复标记），可见时自动恢复；新增 `syncMiniPlayBtn()` 统一按钮/动画状态，播放 handler 改用它。
  - 新增 `initTicker()`：顶栏「酒馆播报」跑马灯内容（V1.0 上线 / 22 位冒险者 / 沉浸互动 / 点唱机 / Build / 经典酒馆），双份内容无缝循环，`boot()` 中调用。
- `index.html`：`</header>` 后新增 `#tavern-ticker` 结构（标签 + 滚动区）。
- `style.css`：新增跑马灯样式（40s 线性循环、hover 暂停、像素风金色标签）；`body:has(.view[data-view="chat"]:not(.hidden)) #tavern-ticker { display:none }` —— 对话页隐藏播报条，保证聊天区 `calc(100vh - 58px - 20px)` 高度依旧正确。

### 验证结果
- ESLint：**0 错误**（中途曾引入 2 个 `PT_NEWS` no-undef，补全 `/* global */` 后归零）。
- 浏览器实测（1440×900）：
  - 播报条：存在、高 36px、内容双份、`animation-name: ticker-scroll` 运行中 ✅
  - 对话页：播报条 `display:none`（:has 选择器生效）✅
  - 会话模式记忆：沈亦白对话切「传统聊天」→ `pt_history[0].immersive === false` → 返回集市从历史「继续」重开 → 徽章仍为「传统聊天」✅
  - 集市/Build 视图渲染正常，无控制台报错。
- 未改 `src/server-main.js`，服务器未重启；`/?classic=1` 不受影响。

### 下轮建议
- Zpix 子集化单独立项（需引入 Python fonttools 或换用现成子集 CDN）。
- 沉浸互动「剧情追踪」时间线视觉升级。
- 搜索防抖 + 关键词高亮。
- 可考虑：对话页移动端输入栏安全区（`env(safe-area-inset-bottom)`）适配。

---

## 轮次 #3 — 2026-11-06

### 发现的问题
1. **剧情追踪只有一行静态文本**：不展示玩家的行动历程，沉浸感弱。
2. **搜索每键全量重渲染**：22 卡虽快，但卡片数增长后是隐患；且命中关键词无视觉反馈。
3. **窄屏（390×844）实测两处真 bug**：
   - `#chat-form` 发送按钮撑破视口 → 页面横向溢出（flex 子项无 `min-width:0`，input 不收缩）；
   - 聊天表单被压到视口外（formBottom 1090 > 844）——侧栏在窄屏堆叠占 ~300px，而对话页高度仍按桌面公式计算；
   - 顶栏「经典酒馆/设置」按钮文字换行成两行。
4. **进入对话页残留滚动**：从滚动过的集市打开对话，窗口 scrollY ≠ 0，chat header 被顶栏遮住一截。

### 头脑风暴清单（本轮评估 6 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉 | 剧情追踪改像素时间线（当前章节金节点 + 最近 3 条行动灰节点） | 高 | ✅ |
| 2 | 交互 | 搜索 140ms 防抖 + 卡片名/头衔关键词金色高亮 | 高 | ✅ |
| 3 | 交互 | 窄屏聊天：修 flex 溢出 + 对话页隐藏侧栏 + 表单贴底 | 高 | ✅ |
| 4 | 交互 | 打开对话页后强制回顶（rAF 兜底） | 中 | ✅ |
| 5 | 无障碍 | 安全区适配 `env(safe-area-inset-bottom)`（聊天表单 + toast） | 中 | ✅ |
| 6 | 性能 | Zpix 字体子集化 | 中 | ⏳ 需工具链，继续挂起 |

### 实施的改动
- `app.js`：新增 `renderTrack()`（时间线渲染，用户行动 esc 后输出）；`updateImmersive()` 改调它；新增 `highlight()`（先转义再包 `<span class="hl">`，防注入）；`makeCardEl()` 名称/头衔走高亮；搜索输入 140ms 防抖；`openChat()` 末尾 `requestAnimationFrame(() => window.scrollTo(0, 0))`。
- `index.html`：`#imm-track-text` 改为 `div.tl` 容器。
- `style.css`：时间线样式（`.tl/.tl-item/.now/.old`，6px 像素方节点，金色当前项 + 光晕）；`.card .hl` 金色高亮（带 1px 描边）；`#chat-input { min-width: 0 }`（修横向溢出）；`#chat-form`/`#toast-wrap` 接入 `env(safe-area-inset-bottom)`；窄屏媒体查询——对话页隐藏侧栏 + 恢复桌面高度公式、`#chat-scroll` 弹性内滚、顶栏按钮 nowrap 缩紧、logo 隐藏英文副标。
- 顺手修正：`openChat()` 中被 `renderTrack()` 取代的重复赋值行。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 搜索「星」→ 3 卡命中、3 处金色高亮、防抖生效无报错 ✅
  - 对话页时间线：金色当前章节 + 2 条灰色最近行动（节点方块 + 缩进）✅
  - 打开对话 `window.scrollY === 0`（从滚动 600px 的集市进入）✅
  - 窄屏 390×844：横向溢出 false、对话页侧栏隐藏、`formBottom = 844 = 视口底`（输入栏贴底）✅
  - 桌面 1440×900 恢复正常布局。
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- Zpix 子集化（尝试 `pyftsubset`，产出按需 woff2；失败则换字体加载策略）。
- 沉浸互动行动选项点击后给「已选择」反馈态，避免重复点击。
- 集市卡片加载骨架屏（首屏字体/头像生成期间的空窗）。
- 对话页消息气泡加像素头像（角色消息左侧小头像）。

---

## 轮次 #4 — 2026-11-06

### 发现的问题
1. **Zpix 字体加载走 CDN 完整版（4.68MB）**：首屏带宽被挤占，慢网下中文长时间回退非像素字体。
2. **行动选项无点击反馈**：点击后到角色回复前（0.6–1.5s）选项看起来毫无变化，可被重复点击。
3. **角色消息无头像**：对话流里角色气泡缺少视觉锚点，与参考站的聊天气泡体验有差距。
4. （review）子集化前置探测：本机已有 Python 3.12 + fonttools 4.64 + brotli，工具链齐备。

### 头脑风暴清单（本轮评估 6 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 性能 | Zpix 子集化：pyftsubset 按门户文案生成 woff2 本地文件 | 高 | ✅ |
| 2 | 交互 | 行动选项点击后禁用全组 + 金色高亮所选 | 高 | ✅ |
| 3 | 视觉 | 角色消息/思考指示器左侧 30px 像素小头像 | 中高 | ✅ |
| 4 | 性能 | 子集缺字回退策略：CDN 完整版加 unicode-range 按需下载 | 中 | ✅（随 #1） |
| 5 | 视觉 | 集市卡片骨架屏 | 低（本地头像生成 <50ms） | ⏳ 缓 |
| 6 | 交互 | 消息长按/悬浮显示时间戳 | 低 | ⏳ |

### 实施的改动
- **字体子集化流水线**（一次性，产物入库）：
  - Node 提取门户 6 个文件的唯一字符 → 1363 字符清单；
  - 首次 pyftsubset 失败 → 定位为 Zpix 的 `OS/2` 表声明 v5 但仅 96 字节（v4 长度），fontTools 严格解析失败 → 字节级补丁降级 OS/2 version=4 后成功；
  - 产物 `public/pixel-tavern/fonts/zpix-subset.woff2`：**4.68MB → 54KB（-98.8%）**；
  - `index.html`：`@font-face 'Zpix Local'`（本地 woff2）+ `'Zpix CDN'`（完整版，`unicode-range` 限定 CJK 按需下载）+ `<link rel="preload">`；URL 用绝对路径 `/pixel-tavern/fonts/`（规避相对路径解析陷阱）；
  - `style.css`：`--font-pixel` 改为 `'Zpix Local', 'Zpix CDN', …`。
- `app.js`：行动选项点击 → 全组 `disabled` + 所选加 `.chosen`；`pushMessage()` 角色消息前插 `img.msg-avatar`（`PTAvatar.toDataURL` 缓存命中，零开销）；思考指示器同样带头像。
- `style.css`：`.msg.char` 加头像槽位样式（30px 像素化 + 金色描边）；`.option-chip.chosen/:disabled` 反馈态。

### 验证结果
- ESLint：**0 错误**。
- 字体文件可访问：`GET /pixel-tavern/fonts/zpix-subset.woff2` → 200, 55,184B。
- 浏览器实测：`document.fonts` 已加载 **Zpix Local**（CDN 完整版未被下载——按需策略生效）；全站中文渲染为真像素字体。
- 对话页：3 个头像（开场白/回复/思考中）、选项点击后 `chosen=1, disabled=3`，金色高亮清晰。
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 用户数据未动。

### 下轮建议
- 历史会话可导出/导入 JSON（跨设备迁移）。
- 详情弹窗加「最近对话摘录」。
- 对话页滚动到底部按钮（长对话回底部）。
- Jukebox 曲目随视图切换自动换曲（可选）。
- review：`parsePngCard` 对超长 tEXt 的内存防护（当前信任文件头长度）。

---

## 轮次 #5 — 2026-11-06

### 发现的问题
1. **长对话无法快速回底**：向上翻历史消息后，只能手动滚回最新（参考站聊天页有此能力）。
2. **本地数据无迁移手段**：换浏览器/清缓存即丢全部收藏、历史与自制卡。
3. **`parsePngCard` 缺防护**：chunk 长度直接信任文件头，损坏/伪造 PNG 可致越界读取（`Uint8Array` 越界会抛错被上层 catch，但行为不明确）。
4. （review）ESLint 基线 0 错误；服务器正常。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 交互 | 对话页「▼ 回到底部」浮动按钮（距底 >240px 显示，smooth 滚动） | 高 | ✅ |
| 2 | 功能 | 设置页数据导出/导入 JSON（favs/history/custom/imported/settings 全量） | 高 | ✅ |
| 3 | 代码质量 | `parsePngCard` chunk 长度边界防护（`off+12+len > byteLength` 即断） | 中 | ✅ |
| 4 | 功能 | 详情弹窗「最近对话摘录」 | 中 | ⏳ |
| 5 | 体验 | Jukebox 随视图自动换曲 | 低（可能打扰） | ⏳ 缓 |

### 实施的改动
- `index.html`：`#chat-scroll` 内新增 `#btn-chat-bottom`（▼ 回到底部）；设置页新增「数据导出 / 导入」行（含隐藏 file input）。
- `app.js`：
  - 新增 `initChatBottomBtn()`：`scroll` 被动监听 + 距底阈值 240px 显隐 + smooth 滚动；`boot()` 挂载。
  - 新增 `initExportImport()`：导出（Blob + a[download]，文件名 `pixel-tavern-data-YYYY-MM-DD.json`，含 app 标识与时间戳）；导入（校验 `app === 'pixel-tavern'`，按数组类型分别恢复，设置合并后同步 UI 开关/音量/主题色，toast 汇报结果）；`boot()` 挂载。
  - `parsePngCard`：chunk 遍历加 `off + 12 + len > dv.byteLength` 断出防护。
- `style.css`：`.view[data-view="chat"]` 加 `position:relative`，`#btn-chat-bottom` 绝对定位（右 26px / 底 88px，金色像素风）；`.set-note-inline` 说明文字样式。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 5 轮对话后向上滚 → 「▼ 回到底部」出现（`visible: true`）→ 点击 → `atBottom: true`、按钮隐藏 ✅
  - 设置页：导出/导入行渲染正常；点击导出 → toast「已导出本地数据（5 段对话）」，无控制台报错（IAB 沙箱无法真实落盘，下载逻辑与导入解析为标准 Blob/FileReader 流程）✅
  - `parsePngCard` 防护为纯逻辑加固（坏 PNG 现在干净截断而非抛错）。
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 未动。

### 下轮建议
- 详情弹窗「最近对话摘录」（该角色最近 1 条消息 + 时间）。
- 导出文件可选包含头像 dataURL（跨设备完整还原视觉）。
- 对话页消息悬浮显示时间戳（title 属性即可，零布局成本）。
- review：`state.history` 上限 30 条的截断策略提示（设置页加一行说明）。

---

## 轮次 #6 — 2026-11-06

### 发现的问题
1. **详情弹窗缺少与历史的连接**：看过什么、聊到哪了，打开详情看不到。
2. **消息无时间信息**：翻看长对话时不知道消息发生时间。
3. **历史 30 条上限无提示**：老对话被静默丢弃，用户无感知。
4. **实施中踩坑（当场修复）**：`detail-recent` 用 DOM `hidden` 属性显示，但元素初始带 `.hidden` 类（CSS `display:none !important` 优先）导致面板不可见——改用 `classList.remove/add('hidden')`。教训：本项目弹窗显隐统一走 `.hidden` 类，不要混用两种机制。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉/信息 | 详情弹窗「最近对话摘录」（日期 + 条数 + 最后一条消息截断 80 字） | 高 | ✅ |
| 2 | 信息 | 消息气泡 `title` 悬浮时间戳（HH:MM，零布局成本） | 中 | ✅ |
| 3 | 文案 | 历史页顶部「仅保留最近 30 段，可导出备份」提示 | 中 | ✅ |
| 4 | 功能 | 导出文件包含头像 dataURL | 低中（导出体积暴涨） | ⏳ 缓 |
| 5 | 交互 | 详情弹窗「继续上次对话」快捷按钮（与摘录配合） | 中 | ⏳ 下轮评估 |

### 实施的改动
- `index.html`：`#modal-detail` 新增 `#detail-recent` 摘录容器；历史页新增 30 条上限提示行。
- `app.js`：`openDetail()` 查找该角色最近的 history 会话（按 `charId`），渲染日期/条数/最后一条消息（先截断 80 字再转义，防截断 HTML 实体）；无记录时隐藏；`pushMessage()` 给气泡加 `title` 时间戳。
- `style.css`：`.detail-recent` 摘录面板（暗底细描边 + 金色标签行）；`.detail-greet` 底边距 16→12px 保持节奏。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 江晚吟详情弹窗：摘录面板显示「最近对话 · 2026/11/6 · 11 条 + 最后消息截断」，`displayed: true, height: 60`（修复 hidden 类问题后复验通过）✅
  - 消息气泡 `title="08:45"`，悬浮可见时间 ✅
  - 历史页顶部提示行渲染 ✅
  - 无控制台报错；`/?classic=1` 不受影响。

### 下轮建议
- 详情弹窗「继续上次对话」快捷按钮（摘录下方，直达 reopenHistory）。
- Jukebox 音量记忆已实现，可加「音量条 hover 放大」微交互。
- review：`allChars()` 每次渲染都 concat 三数组（22+ 张），可缓存；目前无感知，卡数破百再优化。
- 视觉：给「炉火正旺」卡片加火焰光晕呼吸效果（box-shadow 动画）。

---

## 轮次 #7 — 2026-11-06

### 发现的问题
1. **详情弹窗与历史断层**：有摘录但没有直达恢复入口，需绕道历史页。
2. **收藏状态不同步（真 bug）**：在详情弹窗里点收藏/取消后，集市网格的 ♥ 角标保持陈旧状态，直到下次全量渲染。
3. **炉火卡片静态**：侧栏炉火只有内部动画，卡片本体无光晕，氛围感不足。
4. （测试基建）browser facade 的 `locator(selector, { hasText })` 第二参数被忽略 → 按文本找卡实际点的是第一张卡。上轮「收藏失败」疑云由此产生，本轮用显式分步点击排除，确认**功能本身双向正常**。后续测试定位卡片一律改用 `evaluate` 内遍历或角色 id 定位。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 交互 | 详情弹窗「↻ 继续上次」按钮（直连 reopenHistory） | 高 | ✅ |
| 2 | 交互 | 收藏开关后实时刷新集市/收藏/书架网格角标 | 高 | ✅ |
| 3 | 视觉 | 炉火卡片 3s 呼吸光晕（reduced-motion 自动失效） | 中 | ✅ |
| 4 | 代码 | `allChars()` 缓存 | 低（22 卡无感知） | ⏳ 破百再议 |
| 5 | 微交互 | 音量条 hover 放大 | 低 | ⏳ 缓 |

### 实施的改动
- `index.html`：`#modal-detail` 按钮排新增 `#btn-resume-chat`（默认 hidden）。
- `app.js`：`openDetail()` 渲染摘录时记录 `state._recentSessionId` 并显隐「继续上次」；新按钮点击 → `closeModal()` + `reopenHistory()`；`#btn-fav-toggle` 处理器尾部追加 `renderMarket()` + 当前视图为收藏/书架时即时重渲染。
- `style.css`：`#fireplace-card` 增加 `fire-glow` 3s 呼吸光晕关键帧（`prefers-reduced-motion` 全局规则自动覆盖）。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 江晚吟详情弹窗：摘录面板 + 「↻ 继续上次」按钮同时出现 ✅
  - 点击「继续上次」→ 直接进入对话页，**11 条消息完整恢复** ✅
  - 收藏双向同步：取消 → `favs=[]` 且角标消失；再收藏 → `favs=["jiang-wanyin"]` 且网格角标即时出现 ✅
  - `#fireplace-card` 计算样式 `animation-name: fire-glow, duration 3s` ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 未动；测试后收藏状态已还原。

### 下轮建议
- 把 facade `hasText` 失效写进巡检注意事项（测试脚本用 evaluate 定位卡片）。
- 视觉：角色对话气泡名签（气泡上方小字角色名，参考站样式）。
- 功能：Build 卡片可编辑/删除（目前只能整体清除）。
- review：`pushMessage` 长对话 DOM 无上限（500 条后自动折叠早期消息为「展开」）。

---

## 轮次 #8 — 2026-11-06

### 发现的问题
1. **自制/导入卡无法删除**：Build 错了或导入重复卡只能「清除全部本地数据」陪葬。
2. **角色气泡无名签**：多角色对话场景分不清谁在说话（参考站每条气泡带角色名）。
3. **长对话 DOM 无上限**：`#chat-log` 消息节点无限增长，超长会话（历史重开+连续聊）会拖慢渲染。
4. （测试基建）长会话标签页上 Playwright 点击 actionability 检测持续超时（元素无遮挡、elementFromPoint 命中正常）——测试交互全面切换为 evaluate 内 DOM 原生 `.click()`，稳定且等效。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | 自制/导入卡删除（详情弹窗 danger 按钮 + 确认框 + 多视图刷新） | 高 | ✅ |
| 2 | 视觉 | 角色气泡名签（金色小字，11px，头像下右侧） | 中高 | ✅ |
| 3 | 性能 | 长对话折叠：DOM 超 300 条移除最早节点 + 「已折叠」分隔符 | 中高 | ✅ |
| 4 | 功能 | Build 卡编辑（预填表单） | 中 | ⏳ 下轮 |
| 5 | 体验 | 折叠区「展开更早消息」按钮（当前为单向折叠） | 低中 | ⏳ |

### 实施的改动
- `index.html`：详情弹窗新增 `#btn-delete-card`（danger，默认 hidden）。
- `app.js`：`openDetail()` 按 `c.origin` 显隐删除按钮；`bindEvents()` 新增删除流程（`askConfirm` → 过滤 `state.custom/imported` → 持久化 → 关弹窗 → `renderTabs/renderMarket` + 当前视图刷新 → toast）；`pushMessage()` 角色消息插入 `.msg-name` 名签；`pushMessage()` 末尾 DOM 折叠守卫（`:scope > .msg` 超 300 删最早 + `prepend` 折叠分隔符，只插一次）。
- `style.css`：`.msg-name`（金色 11px 字距 1px）、`.msg-fold`（居中灰字）。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 名签：每条角色消息气泡内金色「江晚吟」标签 ✅
  - 折叠压力测试：连推 305 条 → DOM 精确保持 300 条、折叠分隔符存在、最新消息（304）保留 ✅
  - 删除流程：Build 造「测试删除卡」→ 详情弹窗删除按钮可见（内置卡不可见）→ 确认框 → 确认后 `pt_custom_cards` 中已移除、集市回到 22 张、其余自制卡（林间信使）完好 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 未动。

### 下轮建议
- Build 卡编辑（详情弹窗「编辑」→ 预填 Build 表单，保存时替换原卡）。
- 折叠区「展开更早消息」。
- 视觉：历史行加小头像。
- review：`highlight()` 在搜索词含正则特殊字符时的行为（用的是 indexOf，安全，补一条注释即可）。

---

## 轮次 #9 — 2026-11-06

### 发现的问题
1. **Build 卡只能建不能改**：写错开场白/人设只能删了重建。
2. **折叠区单向**：消息被折叠后无法查看（上轮实现的 remove 式折叠丢数据）。
3. **历史行无视觉锚点**：纯文字行，多角色时不易扫读。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | Build 卡编辑：详情弹窗「✎ 编辑」→ 预填表单 → 保存原地更新 | 高 | ✅ |
| 2 | 性能/交互 | 折叠改为「 detach 保留 + ▲ 展开更早的消息（N 条）」按钮 | 高 | ✅ |
| 3 | 视觉 | 历史行像素小头像（角色已删除则跳过） | 中 | ✅ |
| 4 | 代码 | `highlight()` 注释说明 indexOf 防注入路径 | 低 | ✅（随改随记） |
| 5 | 视觉 | 详情弹窗窄屏适配（detail-top 两列改单列） | 低中 | ⏳ |

### 实施的改动
- `index.html`：详情弹窗新增 `#btn-edit-card`（仅自制卡可见）；Build 表单顶部新增编辑提示条（含「取消编辑」）；提交按钮加 id 并可改文案。
- `app.js`：
  - 新增 `resetBuildForm()`（统一退出编辑态）；`openDetail()` 显隐编辑按钮；`#btn-edit-card` → 预填表单 7 个字段 + 触发预览刷新 + 编辑提示 + 按钮改「✓ 保存修改」。
  - 提交处理器分支：编辑模式按 `state._editingCardId` 原地更新（保留 id/seed/origin/tags），卡片丢失时安全回退；删除流程若正在编辑同卡则联动 `resetBuildForm()`。
  - `pushMessage()` 折叠守卫重写：被折叠节点 detach 后存于 `log.__foldedMsgs`，分隔符改为按钮「▲ 展开更早的消息（N 条）」，点击按序回插并自毁。
  - `renderHistory()` 行首插入 `.hist-avatar`（`findChar` 命中才渲染）。
- `style.css`：`.msg-fold` 升级为可点按钮样式（面板底+描边+hover 金色）；`.hist-avatar` 34px 像素头像。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测（全 DOM 交互）：
  - 编辑链路：编辑按钮可见 → 预填（`prefilled: true`）→ 提示条与「✓ 保存修改」→ 改头衔保存 → `pt_custom_cards` 中 `titleUpdated: true` → 按钮恢复新建态 ✅
  - 折叠展开：推 305 条 → 保留 300 + 按钮「▲ 展开更早的消息（6 条）」→ 点击 → 306 条全部回插、按钮自毁 ✅
  - 历史行头像 5/5（截图确认像素头像 + 名字 + 摘要 + 时间排版）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 未动。

### 下轮建议
- 详情弹窗窄屏单列适配。
- 「沉浸互动」面板在窄屏可折叠（默认收起状态条，只留选项）。
- review：`bumpVisits` 数字滚动动画在低性能设备上的 rAF 开销（一次性，可忽略）。
- 大项候选：门户接入真实大模型（走 ST 后端 chat-completions，检测 API 配置后启用）。

---

## 轮次 #10 — 2026-11-06

### 发现的问题
1. **详情弹窗窄屏溢出**：detail-top 两列布局在 390px 下拥挤。
2. **消息无入场动画**：气泡瞬间出现，与前几轮的卡片/弹窗动效水准不齐。
3. **版本叙事滞后**：更新通知停留在 V1.0，九轮迭代成果对用户不可见；使用指引未覆盖新功能（导出备份、编辑删除、折叠）。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉 | 窄屏详情弹窗单列化 + 沉浸面板纵向堆叠 | 中 | ✅ |
| 2 | 视觉 | 消息气泡滑入动画（msg-in 0.22s，reduced-motion 自动失效） | 中 | ✅ |
| 3 | 文案 | V1.1「炉火渐旺」更新日志 + 版本徽章/跑马灯同步 + 指引补新功能说明 | 高 | ✅ |
| 4 | 大项 | 门户接入真实大模型 | 高 | ⏳ 无法凭空验证 API 调用，继续挂起并附设计思路 |
| 5 | 交互 | 详情弹窗「继续上次」与「开始对话」并存时的主次视觉 | 低 | ⏳ |

**真实大模型接入设计思路（挂起备查）**：检测 `POST /api/secrets/view` 的 secret_state 判断是否有已配置源 → 有则对话页出现「API 模式」开关，消息经 `POST /api/backends/chat-completions/generate`（携带 CSRF + 会话 cookie，payload 按来源构造）流式渲染 → 无 key/请求失败自动回退本地剧本引擎并 toast 说明。难点：各 source 的 payload 差异大，且无法在本环境无凭据验证，盲目上线有假可用风险。

### 实施的改动
- `style.css`：`@media 640px` 详情弹窗单列（头像上、信息下、按钮居中）+ `.imm-row` 纵向；`.msg` 增加 `msg-in` 滑入关键帧。
- `index.html`：版本徽章 V1.0 → **V1.1**；更新通知视图新增 V1.1「炉火渐旺」条目（九轮成果如实归纳）；使用指引补导出备份/编辑删除/折叠说明。
- `data.js`：`PT_NEWS` → V1.1「炉火渐旺」（跑马灯与版本徽章联动）。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 版本徽章 V1.1、跑马灯含 V1.1 条目、更新通知视图双日志排版正常（全像素字体截图确认）✅
  - 窄屏 390px：详情弹窗 `flex-direction: column`、头像在信息上方、无横向溢出 ✅
  - 对话页气泡 `animation-name: msg-in` ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（按上轮设计思路，需用户提供任一 API 凭据后方可验证上线）。
- 沉浸面板窄屏「收起状态条」折叠交互。
- 滚动回底部按钮在消息展开后位置校准。
- 视觉：收藏视图空状态加像素插画（canvas 小猫/灯）。

---

## 轮次 #11 — 2026-11-06

### 发现的问题
1. **空状态干巴巴**：收藏/书架空视图只有一行文字，浪费像素酒的展示位。
2. **沉浸面板窄屏过高**：状态条 + 剧情追踪 + 选项在 390px 高度下挤压消息区。
3. **折叠展开后「回到底部」失准**：展开使 scrollHeight 骤增但不触发 scroll 事件，按钮可见性停留在陈旧状态。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉 | 空状态像素灯笼插画（avatars.js 新增 drawLantern，金色框红纱罩） | 中高 | ✅ |
| 2 | 交互 | 沉浸面板「收起状态」按钮（≤640px 默认收起，只留行动选项） | 中高 | ✅ |
| 3 | 交互 | 折叠展开后主动 dispatch scroll，重算回底按钮可见性 | 中 | ✅ |
| 4 | 视觉 | 炉火 canvas 加底座像素 | 低 | ⏳ |
| 5 | 交互 | 名签点击 = 打开角色详情 | 低 | ⏳ |

### 实施的改动
- `avatars.js`：新增 `drawLantern()`（14 行像素矩阵灯笼：金框/红纱/暖光点/流苏）并导出全局。
- `app.js`：`renderGrid()` 空状态插 canvas 并调用绘制；`updateModeBadge()` 按 `innerWidth <= 640` 默认收起沉浸状态条；`#imm-collapse-btn` 切换 `.imm-collapsed`（按钮文案联动）；折叠展开回调中 dispatch scroll 重算回底按钮。
- `index.html`：沉浸面板标题行加「收起状态」按钮。
- `style.css`：`.empty-art`（96px 像素化居中）、`.imm-title` 相对定位容纳按钮、`.imm-collapsed .imm-row { display:none }`。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 收藏空状态：像素灯笼插画渲染（截图确认，红纱金框 + 文案），状态还原后正常 ✅
  - 面板折叠：桌面默认展开 → 收起后状态条隐藏、按钮「展开状态」→ 再展开恢复 ✅
  - 滚动校准：305 条压测滚顶后回底按钮可见，展开折叠后依旧可见（dispatch 生效）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（同前，需凭据）。
- 炉火 canvas 底座像素 + 灯笼在历史空状态同样生效（renderGrid 已通用，确认即可）。
- 名签点击打开角色详情。
- 视觉：收藏/书架卡片进入动画在窄屏的节奏微调（stagger 延迟随视口宽度缩放）。

---

## 轮次 #12 — 2026-11-06

### 发现的问题
1. **对话记录锁在页面里**：无法把与角色的故事带离浏览器（数据导出是全量 JSON，不适合分享单段剧情）。
2. **名签无交互**：聊天中看到名字想查角色详情要退回集市找卡。
3. **集市缺乏"新鲜感"信号**：哪些角色今天聊过无从得知。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | 对话导出 .txt（时间戳 + 说话人 + 内容，Blob 下载） | 高 | ✅ |
| 2 | 交互 | 名签点击 = 打开角色详情（hover 下划线提示） | 中 | ✅ |
| 3 | 视觉 | 「今日」互动角标（history 当日会话匹配，绿色像素标） | 中 | ✅ |
| 4 | 功能 | 导出为 Markdown/图片长图 | 低中 | ⏳ |
| 5 | 交互 | 角色详情显示"今日已聊"状态 | 低 | ⏳ |

### 实施的改动
- `index.html`：聊天头部操作区新增「⬇ 导出对话」按钮。
- `app.js`：新增导出处理器（Blob + a[download]，文件名 `对话-角色名-日期.txt`，内容含头/时间戳/说话人）；`pushMessage()` 名签加点击 → `openDetail(当前角色)`；`makeCardEl()` 按当日 history 匹配渲染 `.card-badge.today`（title 提示）。
- `style.css`：`.msg-name` cursor/hover 下划线；`.card-badge.today`（绿色 #3f8a3f，封面左下角）。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 导出：点击 → toast「对话已导出为文本（1 条）」，无报错（IAB 沙箱不落盘，Blob 流程与数据导出同源可靠）✅
  - 名签点击 → 详情弹窗打开且角色名正确 ✅
  - 「今日」角标：江晚吟/顾星辞（今日均有会话）精准出现，其他卡无（截图确认）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（同前，需凭据）。
- 导出 Markdown 格式（粗体名签 + 分隔线，便于分享）。
- 「今日」角标点击 = 直接继续今日会话。
- review：`makeCardEl` 今日标记每次渲染遍历 history（30 条内，无碍；破百可建当日 Set 缓存）。

---

## 轮次 #13 — 2026-11-06

### 发现的问题
1. **气泡纯文本扁平**：剧本里精心写的（动作描写）与「台词」没有视觉区分，浪费剧本表现力。
2. **「今日」角标只可看不可点**：发现今天聊过还要绕历史页才能继续。
3. **炉火缺底座**：火焰悬浮在空气里，缺石台承托。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉 | 富文本气泡：（动作）淡色斜体、「台词」金色——先转义再包裹防注入 | 高 | ✅ |
| 2 | 交互 | 「今日」角标点击 = 直接 reopen 今日最新会话（stopPropagation 防触发卡片） | 中高 | ✅ |
| 3 | 视觉 | 炉火 canvas 底部石台像素（伪随机三色砖） | 中 | ✅ |
| 4 | 功能 | 导出 Markdown | 低中 | ⏳ |
| 5 | review | 今日标记渲染遍历优化（当日 Set 缓存） | 低 | ⏳ 破百再议 |

### 实施的改动
- `app.js`：新增 `richText()`（先 `esc()` 再正则包裹 `（…）→ .act`、`「…」→ .quote`）；`pushMessage()` 的 `finish()` 与 instant 路径改用富文本渲染（打字机期间仍为纯文本，完成后切换）；`makeCardEl()` 今日角标加点击（stopPropagation + 按 time 取最新会话 `reopenHistory`）。
- `style.css`：`.msg-body .act`（淡色斜体）、`.msg-body .quote`（金色）。
- `avatars.js`：PTFire 帧绘制增加底部 2 行石台（sin 伪随机三色 `#3a332a/#2e2822/#241f1a`）。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - 富文本（instant 消息确定性验证）：`.act` 存在且 italic、`.quote` 存在且金色 `rgb(232,201,122)` ✅
  - 「今日」角标点击：直达江晚吟今日会话（11 条完整恢复），未误触卡片详情 ✅
- **测试基建备注**：IAB 标签页后台化后 setInterval 被钳到 ≥1s——打字机/启动画面等定时器动画在后台标签中慢放（对用户是合理降级）；验证定时器相关功能需轮询或改用 instant 路径。
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 导出 Markdown / 长图。
- 富文本规则扩展：*斜体星号* 与 **加粗** 支持（Markdown 子集）。
- 视觉：灯笼插画加入书架空状态的变体（换色）。

---

## 轮次 #14 — 2026-11-07

### 发现的问题
1. **富文本不支持强调语法**：角色/用户消息里的 **加粗** 与 *斜体* 被当普通字符。
2. **导出格式单一**：只有 .txt，分享到支持 Markdown 的平台丢失排版。
3. **消息无法快速复制**：想摘一句台词只能手动划选。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉 | richText 扩展 Markdown 子集：`**加粗**` → b、`*斜体*` → i | 高 | ✅ |
| 2 | 功能 | 导出菜单：⬇ 弹出像素下拉（纯文本 .txt / Markdown .md），md 带 `#` 标题 + `**说话人**` + 斜体时间 | 高 | ✅ |
| 3 | 交互 | 每条消息 ⧉ 复制按钮（clipboard API + execCommand 兜底） | 中高 | ✅ |
| 4 | 功能 | 对话导出长图（canvas 渲染） | 低中 | ⏳ 工作量大 |
| 5 | 代码 | doExportChat 抽函数复用两种格式 | 中 | ✅（随 #2） |

### 实施的改动
- `app.js`：`richText()` 增补 bold/italic 两条规则（esc 后执行，`*` 不受转义影响）；`#btn-chat-export` 改为切换 `#export-menu`，菜单项/外点关闭；新增 `doExportChat(fmt)`（txt/md 双格式，md 输出 `#` 标题 + `---` + `**说话人** *时间*` 结构）；新增 `copyText()`（clipboard API 优先 + textarea execCommand 兜底）；`pushMessage()` 两种角色均渲染 ⧉ 复制按钮（角色消息保留 ♪）。
- `index.html`：聊天头部新增 `#export-menu` 下拉（两个格式项）。
- `style.css`：`#export-menu` 像素风下拉（金描边、hover 金字）；`.msg-tools` 加 gap。

### 验证结果
- ESLint：**0 错误**。
- 浏览器实测：
  - Markdown 子集：instant 消息 `**加粗**`/`*斜体*` → b/i 标签出现 ✅
  - 复制：⧉ 点击 → toast「已复制」路径执行，无报错 ✅
  - 导出菜单：⬇ 弹出（2 项）→ 选 Markdown → 菜单关闭 + toast「对话已导出为 MD（1 条）」✅（IAB 沙箱不落盘，Blob 流程与既有导出同源）
- 测试插曲：首轮查询 `.msg-body` 内找复制按钮（实际在兄弟节点 `.msg-tools`）——测试选择器错误，非产品 bug。
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 对话长图导出（canvas 排版消息 + 头像）。
- 复制按钮成功态反馈（⧉ → ✓ 闪一下）。
- review：`#export-menu` 定位在窄屏下是否与模式徽章重叠（640px 以下 header 拥挤）。

---

## 轮次 #15 — 2026-11-07

### 发现的问题
1. **导出缺长图**：文本导出适合存档，但分享剧情场景下图片更直观（参考站用户习惯截图分享）。
2. **复制无成功态**：⧉ 点击后只有 toast，按钮本身无变化。
3. **复制韧性不足**：非用户手势（自动化/特殊上下文）下 clipboard API 被拒直接「复制失败」，未降级。
4. （实施中自纠）`doExportChat` png 分支引用了作用域外变量 `msgs`；eslint `--fix` 顺手修了 wrap 的 brace-style。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | 对话长图导出：canvas 像素排版（标题/头像/双色气泡/CJK 逐字换行/截断提示），菜单加第三项 | 高 | ✅ |
| 2 | 交互 | 复制成功态 ⧉→✓（绿色 900ms 回弹） | 中 | ✅ |
| 3 | 代码 | copyText 拒绝后自动降级 execCommand | 中 | ✅ |
| 4 | 视觉 | 长图富文本分色（act/quote 着色） | 中 | ⏳ 需分段排版，成本较高 |
| 5 | review | 窄屏 export-menu 定位 | 低 | ⏳ 下轮复验 |

### 实施的改动
- `app.js`：新增 `renderChatCanvas()`（760px 宽 canvas：Zpix 标题/时间戳、逐字 CJK 换行、`PTAvatar.draw` 同步头像、用户右对齐琥珀气泡/角色左对齐金框气泡、200 条截断提示、高度上限 16000）；`doExportChat()` 增加 `png` 分支（`cv.toBlob` → 下载）；`copyText()` 改为 clipboard 拒绝后 `.catch(fallback)` 双通道；复制成功 ⧉→✓ 绿色 900ms 回弹。
- `index.html`：导出菜单新增「对话长图 .png」。

### 验证结果
- ESLint：**0 错误**（中途 2 个：png 分支作用域引用 + 补丁残留多余 `}`，均已修复）。
- 浏览器实测：
  - `renderChatCanvas()`：760×246、3807 个非空白采样、PNG dataURL 27KB——内容真实渲染 ✅
  - 导出菜单 3 项；png 点击 → toast「对话长图已导出（1 条）」✅
  - 复制：IAB 非手势上下文下 clipboard 被拒 → 自动降级 → 「已复制」+ ⧉→✓ ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 未动。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 长图富文本分色（act/quote canvas 着色）。
- 窄屏 export-menu 定位复验（640px 以下）。
- 长图导出气泡宽度按最长行自适应的边界 review。

---

## 轮次 #16 — 2026-11-07

### 发现的问题
1. **长图纯文本扁平**：气泡富文本分色只存在于页面 DOM，导出图里丢失。
2. **PNG 导出即下载**：无预览，不满意只能反复导出。
3. （复验项）窄屏导出菜单定位待确认。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | 长图分色：token 化（norm/act/quote 三色逐字排版，与气泡 richText 同规则） | 高 | ✅ |
| 2 | 交互 | 长图预览弹窗（导出前先看，确认后下载） | 高 | ✅ |
| 3 | review | 窄屏 export-menu 定位（390px 实测右缘 338 < 390，顶部 58 下方） | 中 | ✅ 无需修改 |
| 4 | 功能 | 长图水印/自定义标题 | 低 | ⏳ |

### 实施的改动
- `app.js`：`renderChatCanvas()` 重写排版内核——`tokenize()`（与 richText 同规则的 norm/act/quote 切分）+ `wrapTokens()`（逐字测量、跨 token 换行、同行同类型段合并、段宽缓存）+ 分色 `fillStyle` 绘制；气泡宽度按每行段宽和自适应。
- `index.html`：新增 `#modal-longimage` 预览弹窗（canvas 展示区 + ⬇ 下载 PNG / 取消）。
- `app.js`：png 分支改为「渲染 → 弹预览 → 确认下载」（`state._pendingPng` 暂存，`#btn-longimage-download` 执行 toBlob 下载，预览失效有兜底 toast）。
- `style.css`：`.modal-window.wide`（860px）、`.longimage-scroll`（52vh 内滚 + 描边）、`#longimage-canvas` 自适应宽度。

### 验证结果
- ESLint：**0 错误**（--fix 修一处 brace-style）。
- 浏览器实测：
  - 预览弹窗：标题/画布/下载按钮齐备（截图确认），canvas 760 宽自适应缩放 ✅
  - 分色：canvas 内（动作描写测试）淡灰、「富文本长图分色验证。」金色，肉眼可辨（截图确认）✅
  - 窄屏 390px：菜单 right=338 < 390、位于 header 下方、无溢出 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 长图水印（左下角「PIXEL TAVERN」小字）。
- 预览弹窗滚动条样式统一。
- 巡检节奏复盘：连续 16 轮无严重缺陷回归，可考虑把核心断言沉淀为自动化冒烟清单（单文件 smoke.js + node 断言），降低后续轮次人工验证成本。

---

## 轮次 #17 — 2026-11-07

### 发现的问题
1. **十六轮成果缺自动化护栏**：每轮验证全靠浏览器人工/半自动断言，回归成本随功能数线性上涨。
2. **长图无水印**：分享出去的剧情图没有出处标识。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 代码质量 | `tools/smoke.mjs` 冒烟套件（6 大类 34 断言：文件/语法/数据不变量/资源引用/CSS 平衡/服务器+API） | 高 | ✅ |
| 2 | 视觉 | 长图右下角半透明「PIXEL TAVERN」水印 | 中 | ✅ |
| 3 | 交互 | 预览弹窗滚动条统一 | 低 | ✅（全局 scrollbar 样式已覆盖，无需改） |
| 4 | 大项 | 真实大模型接入 | 高 | ⏳ 需凭据 |

### 实施的改动
- 新增 `tools/smoke.mjs`：零依赖 Node 冒烟测试——
  - 文件完整性（7 个关键文件含字体子集）；
  - `node --check` 四个 JS；
  - data.js 在 vm 沙箱执行后的数据不变量（分类/角色数量、id 唯一、greeting/剧本/调色板齐全、关键词正则合法）；
  - HTML 站内资源引用逐一存在 + 无相对路径引用；
  - CSS 花括号平衡与体积；
  - 服务器检查（`/`、`/?classic=1`、字体、CSRF + Cookie 全链路的角色卡 API）——未启动时优雅跳过；
  - 退出码 0/1 可接入 CI 或定时任务。
- `app.js`：`renderChatCanvas()` 末尾增加半透明金色「PIXEL TAVERN」水印。
- `README-PIXEL-TAVERN.md`：补充 smoke.mjs 用法。

### 验证结果
- **冒烟测试：34 通过 / 0 失败**（首次运行即全绿，含服务器全链路检查）。
- ESLint：**0 错误**。
- 浏览器实测：长图预览中「PIXEL TAVERN」水印渲染可见，canvas 采样命中 361 个混金像素（初版阈值 0 命中为采样阈值未考虑 alpha 混合，修正后确认）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响；`data/` 未动。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 后续巡检以 `node tools/smoke.mjs` 为第一道检查，浏览器验证聚焦新改动的视觉确认。
- 候选：灯笼插画加入历史空状态确认、卡片 stagger 动画窄屏节奏、长图富文本 Markdown 标记支持。

---

## 轮次 #20 — 2026-11-07

### 发现的问题
1. **门户建卡出不去**：自制卡只能以 JSON（需本页导入）或全量备份流转，无法带走到其他 SillyTavern 实例。
2. **历史空状态无插画**：灯笼只覆盖了 renderGrid 系空状态，历史页是独立 markup。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | 单卡 **PNG 角色卡导出**：canvas 头像 + 浏览器端 PNG tEXt(chara) chunk 注入（CRC32/chunk 构建完整实现），兼容任意 SillyTavern 导入 | 高 | ✅ |
| 2 | 视觉 | 历史空状态接入像素灯笼 | 中 | ✅ |
| 3 | 功能 | PNG 卡缩略图美化（边框/名条） | 低 | ⏳ |
| 4 | 交互 | 移动端侧栏抽屉化 | 中 | ⏳ |

### 实施的改动
- `app.js`：
  - 新增浏览器端 PNG chunk 工具（`PNG_CRC_TABLE` / `pngCrc32` / `pngChunk`）与 `buildCardPng()`：canvas 256 头像 → toBlob PNG → 定位 IEND → 注入 `tEXt(chara)`（UTF-8 → base64，与 ST 规范一致）；
  - 详情弹窗新增「⬇ PNG 卡」按钮（自制/导入卡可见，与 JSON 导出并列），点击构建 payload → buildCardPng → 下载；
  - `renderHistory()` 空状态接入像素灯笼。
- `index.html`：详情弹窗新增「⬇ PNG 卡」按钮。

### 验证结果
- ESLint：**0 错误**；冒烟 **34/34**。
- 浏览器端到端往返：`buildCardPng()` → 3,898B 合法 PNG（魔数 ✓）→ **页面自身 `parsePngCard` 解析读回「林间信使」** ✅——产物即标准角色卡，可直接拖入任何 SillyTavern。
- 按钮可见性：自制卡详情中 ⬇ JSON / ⬇ PNG 卡 / ✎ 编辑 / ✕ 删除 齐备 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- PNG 卡面美化（描边/名条/半透明背景纹理）。
- 移动端侧栏抽屉化。
- 里程碑候选：下轮把 README 的功能清单与实现对齐复查（20 轮累计改动多）。

---

## 轮次 #21 — 2026-11-07

### 发现的问题
1. **PNG 卡面朴素**：纯头像方块，缺卡牌质感。
2. **移动端侧栏平铺堆叠**：390px 下侧栏占 ~300px 高度挤压内容（虽有对话页隐藏方案，其余视图仍拥挤）。
3. **README 功能清单滞后**：轮次 10-20 的新功能未入册。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 视觉 | PNG 卡面美化：斜纹纹理 + 双层金框 + 底部名条（像素名 20px / 头衔 11px） | 中高 | ✅ |
| 2 | 交互 | 移动端侧栏抽屉化：☰ 唤出 252px 滑入抽屉、点选自动收起、外点关闭 | 高 | ✅ |
| 3 | 文档 | README 功能一览与改动清单全面对齐（补 PNG 卡/长图/备份/抽屉/冒烟） | 中高 | ✅ |
| 4 | 视觉 | 收藏/书架卡片 stagger 窄屏节奏 | 低 | ⏳ 缓 |

### 实施的改动
- `app.js`：`buildCardPng()` 卡面升级（斜纹纹理叠加、`#161d1a` 名条 + 金色名/灰头衔、双层描边 4px/2px）；`bindEvents()` 抽屉逻辑（☰ toggle、document 外点关闭、导航点选自动收起）。
- `index.html`：顶栏新增 `#btn-drawer`（桌面隐藏）。
- `style.css`：`#btn-drawer` 桌面隐藏 / 窄屏显示；媒体查询内旧平铺侧栏规则替换为抽屉规则（fixed 252px 滑入 + .open 展开 + side-label 恢复）；`.longimage-scroll` 沿用全局滚动条。
- `README-PIXEL-TAVERN.md`：功能一览 14 行全量对齐 + 改动清单更新。

### 验证结果
- ESLint：**0 错误**；冒烟 **34/34**。
- 浏览器实测：
  - 390px：☰ 可见 → 点击抽屉滑入（transform none）→ 点选「我的角色卡」→ 抽屉收起 + 视图切换 ✅（截图确认抽屉形态）
  - 1440px：☰ 隐藏、侧栏 static 常驻（桌面零影响）✅
  - PNG 卡面：边框采样金色 ✓、名条采样暗底 ✓（像素级验证）
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 抽屉外点关闭在对话页隐藏侧栏时的边界（:has 规则优先级）复查。
- 长图alternate greetings 支持。
- 若无新方向，可转向代码质量轮（app.js 已 1200+ 行，考虑拆分模块）。

---

## 轮次 #22 — 2026-11-07 · 代码质量轮

### 发现的问题
1. **抽屉边界遗漏**：窄屏对话页 `:has` 隐藏了侧栏，但 ☰ 按钮仍可见——点开会打开一个不可见抽屉（状态错乱）。
2. **payload 双份维护**：JSON 导出与 PNG 卡导出各持一份 25 行的角色卡 V2 payload 构建，改一处漏一处风险。
3. **卡片不可键盘操作**：grid 卡片是 div+click，键盘用户（Tab/Enter）无法打开详情（可访问性缺口）。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 代码/交互 | 抽屉边界：对话页同步隐藏 ☰（:has 联动） | 高 | ✅ |
| 2 | 代码质量 | `buildCardPayload()` 抽取，JSON/PNG 导出共用（-25 行重复） | 高 | ✅ |
| 3 | 可访问性 | 卡片 tabIndex=0 + role=button + aria-label + Enter/Space 打开详情 | 高 | ✅ |
| 4 | 重构 | app.js 拆分模块（chat/views/cards） | 中 | ⏳ 全局脚本架构下收益/风险比一般，单列一轮做 |
| 5 | 功能 | 长图 alternate greetings | 低 | ⏳ |

### 实施的改动
- `style.css`：移动媒体查询补 `body:has(.view[data-view="chat"]:not(.hidden)) #btn-drawer { display: none; }`。
- `app.js`：新增 `buildCardPayload(c)`；JSON 导出与 PNG 导出改用它（净 -25 行重复）。
- `app.js`：`makeCardEl()` 卡片 `tabIndex=0` + `role=button` + `aria-label` + Enter/Space 键处理。

### 验证结果
- ESLint：**0 错误**；冒烟 **34/34**。
- 浏览器实测（390×844）：
  - 对话页 ☰ `display:none`（抽屉状态不再错乱）✅
  - 重构后 `buildCardPayload('jiang-wanyin')` 结构完整、剧本正则全 string 化 ✅
  - 键盘：卡片 `tabIndex=0`、`role=button`、aria-label 含角色名、聚焦后 Enter 打开详情弹窗 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 模块拆分轮（app.js → chat.js / views.js / cards.js，保持全局架构）。
- 剩余低优先候选：alternate greetings、当日 Set 缓存、移动抽屉遮罩层。

---

## 轮次 #23 — 2026-11-07 · 代码质量轮：模块拆分

### 发现的问题
1. **app.js 膨胀至 1499 行**：对话引擎/卡片渲染/视图路由/设置/启动全部耦合在一个文件，定位与维护成本上升。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 重构 | 拆出 `chat.js`（对话引擎模块，451 行）：openChat/pushMessage/richText/scriptReply/updateImmersive/sendUserMessage/persistSession/reopenHistory/updateModeBadge/copyText/renderChatCanvas/doExportChat | 高 | ✅ |
| 2 | 重构 | 拆出 market.js（卡片/导入导出） | 中 | ⏳ 下轮可续 |
| 3 | 加固 | 拆分边界用「banner 标记定位」而非行号（防漂移），脚本化执行 | 中 | ✅ |
| 4 | 加固 | smoke.mjs 同步纳入新文件（34→37 断言） | 中 | ✅ |

### 实施的改动
- 新增 `public/pixel-tavern/chat.js`：以「对话引擎」「复制文本」「对话长图渲染」三个 banner 为界，脚本化切出 451 行；头部 `/* global */` 声明跨文件依赖（state/PTAvatar/esc/toast/openModal/closeModal/findChar/catName/switchView/openDetail/saveHistory/mulberry32），尾部 `window.openChat/doExportChat` 导出（沿用既有全局架构约定）。
- `app.js`：头部补声明 `openChat, pushMessage, updateImmersive, updateModeBadge, sendUserMessage, persistSession, doExportChat`；余 1056 行（state/路由/卡片/设置/启动）。
- `index.html`：script 链插入 chat.js（jukebox 之后、app 之前——函数声明提升 + 运行时引用，顺序天然安全）。
- `tools/smoke.mjs`：文件完整性与语法检查纳入 chat.js（+3 断言）。

### 拆分过程自纠
- 首次拆分后 ESLint 报 81 个 no-undef → 补 chat.js 全局声明；
- 二轮余 11 个（mulberry32 漏声明 + 跨文件函数标记未用）→ 补声明 + window 导出；
- 三轮余 8 个（app.js 侧反向引用未声明）→ 发现 app.js 头部实际 marker 含 `drawLantern`（与记忆不符，grep 后按实际内容补丁）→ 归零。
- 教训：跨文件重构一律以 grep 实况为准，不依赖记忆中的行内容。

### 验证结果
- ESLint：**0 错误**；冒烟 **37/37**（含 chat.js 语法与文件存在性）。
- 浏览器全链路（1440×900）：对话开启 → 发送 → 剧本回复 → 沉浸选项 3 枚 → 导出菜单 3 项 → JSON payload V2 → PNG 14KB → Build → 历史 6 行，**全部通过** ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 续拆 market.js（卡片渲染/详情/导入导出/PNG 卡构建，约 500 行）。
- 大项：真实大模型接入（需凭据）。
- 移动抽屉遮罩层（半透明背景点击关闭）。

---

## 轮次 #24 — 2026-11-07 · 代码质量轮：模块拆分完成

### 发现的问题
1. **app.js 仍含卡片域 537 行**：卡片渲染/详情/Build/导入/PNG 构建（上轮已拆 chat.js）。
2. **移动抽屉无遮罩**：抽屉打开后背景可点，层级语义弱。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 重构 | 拆出 `market.js`（497 行）：卡片渲染/集市/详情弹窗/Build/导入/PNG 构建 | 高 | ✅ |
| 2 | 交互 | 抽屉遮罩层（z-index 75 半透明背景，点击/导航/外点关闭） | 中高 | ✅ |
| 3 | 加固 | 跨文件全局声明双向校准（eslint no-undef/no-unused-vars 逐轮归零） | 中 | ✅ |
| 4 | 交互 | 搜索框状态迁移到 market 域（searchQ/searchTimer + `initMarketSearch()`） | 中 | ✅（随 #1） |

### 实施的改动
- 新增 `public/pixel-tavern/market.js`（497 行）：卡片渲染（catName/renderTabs/filteredMarket/highlight/makeCardEl/renderGrid/renderMarket）、openDetail、Build（resetBuildForm/initBuild）、导入（parsePngCard/initImport）、PNG 工具与构建（PNG_CRC_TABLE/pngCrc32/pngChunk/buildCardPng/buildCardPayload）、搜索防抖（initMarketSearch + searchQ/searchTimer 域内状态）。
- `app.js` 瘦身 1057 → **570 行**（state/存储/工具/视图路由/历史/设置/事件绑定/启动）；全局声明双向校准。
- `index.html`：market.js 插入 avatars 与 chat 之间；`tools/smoke.mjs` 纳入 market.js（37→**40 断言**）。
- `index.html`+`style.css`+`app.js`：抽屉遮罩层。

### 拆分过程自纠
- C 段结束标记误用 copyText banner（已随 #23 移入 chat.js）→ 改用「同步迷你播放器」banner 定位；
- 搜索框状态跨域（app.js bindEvents 引用 market 域 let 变量，strict 模式赋值会抛错）→ 搜索监听整体迁入 market.js 并暴露 `initMarketSearch()` 由 boot 调用；
- 跨文件全局声明经 eslint no-undef/no-unused-vars 三轮校准归零。

### 验证结果
- ESLint：**0 错误**；冒烟 **40/40**。
- 浏览器全链路（1440×900）：集市 22 卡 → 详情 → 对话回复 → Build → 设置 7 行，全通过 ✅
- 390×844：抽屉滑入 + 遮罩可见 → 遮罩点击 → 抽屉收起 + 遮罩隐藏（截图确认移动端集市形态）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 模块版图（最终）
`data.js`(数据) → `avatars.js`(像素绘制) → `jukebox.js`(音频) → `market.js`(卡片域 524) → `chat.js`(对话域 457) → `app.js`(路由/设置/启动 570)，总计 1551 行 + 样式/模板。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- PNG 卡面美化剩余项（半透明背景纹理已做，名条排版微调）。
- 若无新方向：低频「冒烟 + 抽查」巡检，预算留给新需求。

---

## 轮次 #25 — 2026-11-07

### 发现的问题
1. **README 缺模块版图**：#23/#24 拆分后六模块结构未入册。
2. **JS 异常静默**：运行时错误只进 console，用户无感知（不利反馈问题）。
3. **今日角标 O(卡×历史) 遍历**：每张卡渲染都全量过滤 history。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 文档 | README「模块架构」章节（六模块分层图 + 加载顺序 + 冒烟护栏说明） | 中高 | ✅ |
| 2 | 健壮性 | `window.error`/`unhandledrejection` 全局兜底：console 留痕 + 像素 toast 轻提示 | 中高 | ✅ |
| 3 | 性能 | 当日会话 Map 缓存（refreshTodayCache/getTodays），角标渲染 O(1) 查询 | 中 | ✅ |
| 4 | 视觉 | 空状态灯笼呼吸光晕（drop-shadow 动画，reduced-motion 自动失效） | 中 | ✅ |
| 5 | 功能 | alternate greetings | 低 | ⏳ |

### 实施的改动
- `README-PIXEL-TAVERN.md`：新增「模块架构」章节（data/avatars/jukebox/market/chat/app/style 七层职责 + 加载顺序 + 全局引用约定 + 冒烟护栏）。
- `app.js`：`window.error` + `unhandledrejection` 兜底监听（console.error 留痕 + toast「出了点小状况：…」4s，boot 前异常安全忽略）。
- `market.js`：新增 `refreshTodayCache()`/`getTodays()`（当日会话 Map 缓存），`renderGrid`/`renderMarket` 渲染前重建，今日角标改 O(1) 查询。
- `style.css`：`.empty-art` 灯笼 `lantern-glow` 呼吸光晕。

### 验证结果
- ESLint：**0 错误**；冒烟 **40/40**。
- 浏览器实测：
  - 派发测试错误 → toast「出了点小状况：兜底测试错误」上屏（截图确认）✅
  - 灯笼 `animation-name: lantern-glow` ✅
  - 今日角标在 Set 缓存路径下正常（江晚吟 ✓）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 低频「冒烟 + 抽查」巡检节奏（项目已高度成熟）。
- 新需求驱动开发（随时可转）。

---

## 轮次 #30 — 2026-11-07 · 转入低频维护节奏

### 抽查范围
九视图元素级探针 + 冒烟 41/41 + ESLint 0。

### 结果
集市（22 卡 / 滑卡书架 8 / 今日角标 2）、详情弹窗（开场白循环可见）、对话页（头部三按钮 + 沉浸面板 + 字数统计实时 6/300）、Build、设置 7 行、历史统计条、新闻 V1.2、跑马灯 V1.2 —— **全部正常，零回归**。

### 实施的改动（小项）
- `index.html`/`app.js`/`style.css`：对话输入字数统计（0/300，≥280 变红警示）。
- `index.html`：搜索占位符补「（按 / 聚焦）」快捷键提示。

### 验证
ESLint 0；冒烟 41/41；计数器实时更新（截图确认）；占位符提示渲染。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏；新需求随时转。

---

## 轮次 #27 — 2026-11-07

### 发现的问题
1. **输入框单行**：roleplay 场景常需要多行长消息，换行只能发出去后靠剧本凑。
2. **开场白单一**：每次开聊同一段开场，重复感强（ST 卡规格本身支持 alternate greetings）。
3. **toast 无上限**：连续操作时堆叠到 5+ 条挤屏。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 交互 | 多行输入：textarea 自适应增高（46→120px），Enter 发送 / Shift+Enter 换行 | 高 | ✅ |
| 2 | 功能 | 轮换开场白：4 位角色补 alts 数据，详情弹窗「↻ 换开场」循环预览，开聊用预览项否则随机 | 中高 | ✅ |
| 3 | 视觉/交互 | toast 队列上限 3 条（移除最旧） | 中 | ✅ |
| 4 | 功能 | alternate greetings 进详情 stats | 低 | ⏳ |
| 5 | 重构 | market.js 续拆（详情/Build 分域） | 低 | ⏳ |

### 实施的改动
- `index.html`：`#chat-input` input → textarea（rows=1）。
- `style.css`：textarea 样式（min/max 高度 46/120px、line-height 1.6、resize none）。
- `app.js`：聊天输入 `input`（增高）+ `keydown`（Enter 发送 / Shift+Enter 放行）+ submit 后清高度；`toast()` 队列上限 3；详情弹窗「↻ 换开场」循环预览 + 「开始对话」携带预览项。
- `chat.js`：`openChat(id, greetOverride)` — override 优先、否则从 `[greeting, ...alts]` 随机。
- `data.js`：江晚吟/洛清弦/温阮/薇拉 各补 2 段 alts（首次注入引号错乱致语法错误，重写修复——教训：脚本注入 JS 字面量必须 node --check 验证）。

### 验证结果
- ESLint：**0 错误**；冒烟 **40/40**（含 data.js 语法 + 数据不变量）。
- 浏览器实测：
  - 「↻ 换开场」可见 → 点击后预览切换（g0 ≠ g1）→ 开始对话后 **session.messages[0].text === 预览项**（override 链路以落账数据为准验证）✅
  - 多行：Shift+Enter 保留 `\n` 不发送、input 事件增高 style.height > 46px ✅
  - toast：连发 5 条 → DOM 精确保持 3 条 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- alts 覆盖面扩展（其余 18 位角色按需补写）。
- 维持「冒烟 + 抽查」节奏。

---

## 轮次 #28 — 2026-11-07

### 发现的问题
1. **alts 覆盖不全**：21 位内置角色仅 4 位有轮换开场白。
2. **导出丢 alts**：JSON/PNG 导出未携带 `alternate_greetings`（V2 规格字段）。
3. **集市头像每次重绘**：makeCardEl 每卡一次 canvas 绘制（搜索/收藏切换均触发），PTAvatar.toDataURL 已有缓存却未使用。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 内容 | alts 全量覆盖：其余 14 位各补 1 段（PT_ALTS 映射合并，规避字面量注入风险） | 高 | ✅ |
| 2 | 功能 | 导出 payload 增加 `data.alternate_greetings`（V2 规格字段） | 中高 | ✅ |
| 3 | 性能 | makeCardEl 头像改 `img[dataURL]`（toDataURL 缓存，重渲染零重绘） | 中 | ✅ |
| 4 | 内容 | alts 二段化（每角色 2 段以上） | 低 | ⏳ |

### 实施的改动
- `data.js`：新增 `PT_ALTS` 映射（14 位角色各 1 段原创开场白）+ 合并循环（不覆盖已有 alts）；抽样插入式注入曾引发引号语法错误 → 本轮改走映射合并 + `node --check` 验证。
- `market.js`：`buildCardPayload()` data 增加 `alternate_greetings: c.alts || []`；`makeCardEl()` 头像 canvas → `img[dataURL]`。
- `tools/smoke.mjs`：新增断言「轮换开场白全量覆盖」（40→41）。

### 验证结果
- ESLint：**0 错误**（--fix 修一处缩进）；冒烟 **41/41**（新增断言曾失败——电光/白澈/芙洛拉 3 位遗漏 → 补写后全绿）。
- 浏览器实测：22 张卡头像全部走 `img[dataURL]`（canvas 重绘 0）；电光 alts 池 ≥1 且开场白取自池内；导出 payload `alternate_greetings` 就位 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- alts 二段化与 PNG 卡 alternate_greetings 同步。
- 维持「冒烟 + 抽查」节奏。

---

## 轮次 #29 — 2026-11-07

### 发现的问题
1. **开场白仍显单一**：alts 一段化后每角色仅两版开场。
2. **版本叙事滞后**：V1.1 后七轮迭代（长图/导出/模块化/抽屉/统计/alts）未入更新日志。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 内容 | alts 二段化：21 位角色各补第二段开场白（脚本按 id 前缀定位追加） | 高 | ✅ |
| 2 | 叙事 | V1.2「灯影渐浓」更新日志 + 版本徽章/跑马灯同步 | 中高 | ✅ |
| 3 | 加固 | 冒烟断言升级「alts ≥ 2 段」 | 中 | ✅ |
| 4 | 复验 | 导出 payload alternate_greetings 双段生效（buildCardPayload 单点共享） | 中 | ✅ 零改动自动生效 |

### 实施的改动
- `data.js`：`tools/_alts2.mjs` 按行首 id 前缀定位追加第二段开场白（21/21，含 4 位内联 alts）；`PT_NEWS` → V1.2「灯影渐浓」。
- `tools/smoke.mjs`：断言升级 `alts.length >= 2`。
- `index.html`：版本徽章 V1.2 + 更新通知视图新增 V1.2 条目（六条要点）。

### 验证结果
- ESLint：**0 错误**；冒烟 **41/41**（断言升级后全绿）。
- 浏览器实测：徽章 V1.2、跑马灯含 V1.2、新闻视图 V1.2 条目在册（`section[data-view="news"]` 修正选择器后确认）；江晚吟开场池 4 段、「↻ 换开场」循环 + 开聊落账一致（截图确认）✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏；新需求随时转。

---

## 轮次 #26 — 2026-11-07

### 发现的问题
1. **历史页缺统计**：攒了 30 段对话却看不到任何总览数字，成就感无锚点。
2. **弹窗焦点自由**：打开弹窗焦点仍在触发卡片上，键盘用户需重新 Tab 一圈；关闭后焦点丢失到 body。
3. **搜索无快捷键**：鼠标用户的便利对键盘用户缺席。

### 头脑风暴清单（本轮评估 5 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能/视觉 | 历史统计条：N 段对话 · M 条消息 · K 位角色 · 你输出了 X 字 | 中高 | ✅ |
| 2 | 可访问性 | 模态焦点管理：open 焦点入主按钮、close 还原触发元素；`:focus-visible` 描边 | 高 | ✅ |
| 3 | 交互 | `/` 聚焦搜索（仅集市视图、输入框内不劫持）；Esc 扩展为关闭抽屉 | 中 | ✅ |
| 4 | 功能 | alternate greetings | 低 | ⏳ |
| 5 | 性能 | makeCardEl 改用缓存 dataURL | 低 | ⏳ |

### 实施的改动
- `index.html`：历史页新增 `#hist-stats` 统计行。
- `app.js`：`renderHistory()` 统计聚合（段数/消息数/互动角色数/用户输出字数，防御空 messages）；`openModal/closeModal` 增加 `_lastFocus` 焦点管理（open → 焦点入 `.px-btn.gold` 主按钮，close → 还原触发元素）；`keydown` 扩展 `/` 聚焦搜索 + Esc 关抽屉。
- `style.css`：`.px-btn:focus-visible` 金色描边（键盘可见性）。

### 验证结果
- ESLint：**0 错误**；冒烟 **40/40**。
- 浏览器实测：
  - 统计条：「共 7 段对话 · 33 条消息 · 与 2 位角色互动 · 你输出了 94 字」✅
  - 焦点：打开详情 → `modal.contains(activeElement)=true`；关闭 → 焦点还原到触发卡片 ✅
  - `/` 键 → 搜索框聚焦 ✅
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 转入「冒烟 + 抽查」低频节奏（连续 26 轮零严重缺陷，成熟度高）。
- 新需求驱动开发（随时可转）。

---

## 轮次 #32 — 2026-11-07 · 低频维护节奏

### 抽查
冒烟 41/41 + ESLint 0 + 服务器 200——零回归。

### 实施的改动（小项：随机漫游）
- **🎲 随机漫游**：集市头部新按钮，一键随机挑一位角色直接开聊（allChars 全池含自制/导入），toast 报遇见名号——契合「推门遇见谁就是谁」的酒馆气质。
- README 功能一览同步（对话引擎行补轮换开场白/多行输入/随机漫游；设置行补字号三档）。

### 验证
两次点击抽中 栗子 / 缄默（随机性 ✓）、均进入对话页；toast 上屏（截图确认）；ESLint 0；冒烟 41/41。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏；新需求随时转。

---

## 轮次 #31 — 2026-11-07 · 低频维护节奏

### 抽查
冒烟 41/41 + ESLint 0 + 集市 22 卡——零回归。

### 实施的改动（小项：可访问性）
- **对话字号设置**：设置页新增「小 / 标准 / 大」三档（`body[data-chatfont]`），消息体 13/14/17px 联动；设置持久化、导入备份兼容（chatFont 缺省回落 m）。老视用户/大屏用户的实际刚需。

### 验证
字号「大」→ 消息体 computed 17px ✓；恢复「标准」✓；设置页截图确认新行渲染；ESLint 0；冒烟 41/41。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏；新需求随时转。

---

## 轮次 #18 — 2026-11-07

### 发现的问题
1. **单卡无法带走**：数据导出是全量备份，没法把一张喜欢的卡分享给别人。
2. **长图不支持 Markdown 标记**：**加粗** / *斜体* 在导出图里显示原始星号。
3. **导出/导入剧本不闭环**：JSON 导出若含剧本，正则对象会被 JSON.stringify 吃掉。

### 头脑风暴清单（本轮评估 4 项）
| # | 方向 | 想法 | 性价比 | 本轮 |
| --- | --- | --- | --- | --- |
| 1 | 功能 | 单卡 JSON 导出（V2 规格 + `extensions.pixel_tavern` 携带剧本/配色；正则序列化为 `[source, flags, reply]`） | 高 | ✅ |
| 2 | 功能 | 导入侧还原 pixel_tavern 扩展（剧本正则重建 + 配色沿用）——导出/导入全闭环 | 高 | ✅ |
| 3 | 视觉 | 长图 Markdown 标记：粗体双描金字、斜体 canvas 倾斜变换 | 中高 | ✅ |
| 4 | 视觉 | 灯笼历史空状态确认（renderGrid 通用已覆盖） | 低 | ✅（随改随验证） |

### 实施的改动
- `app.js`：
  - `tokenize()` 扩展 `**…**` / `*…*` 识别（**并修复首次实现把星号原样绘制的 bug**：token 文本剥除标记符）；
  - 长图绘制 switch：bold → 金色双描偏移 1px，italic → `ctx.transform` 倾斜 0.18；
  - 详情弹窗新增 `#btn-export-card`（自制/导入卡可见）+ 导出处理器（V2 规格 payload，`extensions.pixel_tavern` 携带 id/palette/origin/script，正则序列化为 `[source, flags, reply]`）；
  - JSON 导入路径还原 `extensions.pixel_tavern`（正则重建 + try/catch 防坏源、沿用配色、id 继承）。
- `index.html`：详情弹窗新增「⬇ JSON」按钮。

### 验证结果
- ESLint：**0 错误**；冒烟 **34/34**。
- 浏览器实测：
  - 详情弹窗按钮组齐全：开始对话 / 继续上次(有历史时) / 收藏 / 经典酒馆 / 删除 / 编辑 / ⬇ JSON（截图确认）✅
  - 序列化校验：真实卡 keywords 全部转成 `[string, string, string]` ✅
  - 长图 Markdown：`**重要剧情**推进：骑士*拔剑*出鞘（鉴定完毕）` → 星号消失、重要剧情金色加粗、拔剑斜体、（鉴定完毕）淡色（截图确认）✅
  - 首次实现抽检发现星号残留 → 定位为 token 未剥标记 → 修复后复验通过（截图对比）。
- 未改 `src/server-main.js`；`/?classic=1` 不受影响。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 单卡导出升级为 PNG 卡（把长图头像排版接入 character-card-parser 的 Web 端实现）。
- 长图支持 alternate greetings / 分组标题。
- 巡检第 18 轮：门户功能面已宽，建议下轮做一次**整体视觉回归**（逐视图截图对比首版）作为里程碑。

---

## 轮次 #19 — 2026-11-07 · 里程碑：整体视觉回归

### 回归范围
十八轮迭代后的全部视图逐一体检（1440×900 + 历史 390×844 已在往轮覆盖）：
集市网格（22 卡 + 今日角标）、详情弹窗（7 按钮按卡类型显隐 + 最近对话摘录）、
对话页（11 条历史恢复、名签/头像/双按钮/时间戳、沉浸徽章、头部三按钮）、
Build、设置（7 行全控件）、历史、更新通知（V1.1+V1.0 双日志）、使用指引、经典酒馆（round#4 验证后未改动）。

### 结果
- **零回归**：所有视图布局、像素风一致性、控件可见性、动效均正常；无控制台报错。
- 冒烟 34/34；ESLint 0 错误。
- 行为确认（非 bug，记录为设计决策）：**仅开场白的对话不落历史**——session 在首次真实交换（sendUserMessage）时才持久化，避免用户路过即产生垃圾历史条目；直接 pushMessage(save:true) 的消息仅在内存，随下次持久化一并落盘。

### 头脑风暴清单（下阶段候选）
| # | 方向 | 想法 | 备注 |
| --- | --- | --- | --- |
| 1 | 大项 | 真实大模型接入 | 需凭据，设计思路已备（轮#10） |
| 2 | 功能 | 单卡 PNG 卡导出（Web 版 character-card-parser） | 中 |
| 3 | 视觉 | 长图 alternate greetings/分组标题 | 低中 |
| 4 | 性能 | allChars() 缓存、当日 Set | 卡数破百再议 |
| 5 | 交互 | 移动端侧栏抽屉化（当前平铺堆叠） | 中 |

### 本轮无代码改动（纯回归里程碑），未触碰 `/?classic=1` 与 `data/`。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 若无新需求，巡检可降低频率为「冒烟 + 抽查」，把预算留给大项。

---

## 轮次 #33 — 2026-11-07 · 低频维护节奏

### 抽查
冒烟 41/41 + ESLint 0 + 服务器 200——零回归。

### 实施的改动（小项）
- **设置页「关于」块**：版本/代号、基于 SillyTavern 1.19.0 的上游致谢、AGPL-3.0 许可与内容合规提示——来源透明化。
- **Esc 层级扩展**：弹窗 → 抽屉 → **对话页返回集市**，三层级顺序关闭（实测对话页 Esc → market）。

### 验证
关于块渲染（截图确认）；Esc 层级实测；ESLint 0；冒烟 41/41。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏；新需求随时转。

---

## 轮次 #34 — 2026-11-07 · 低频维护节奏

### 抽查
冒烟 41/41 + ESLint 0——零回归。

### 实施的改动（小项：经典酒馆像素主题）
- 新增 `data/default-user/themes/Pixel Tavern.json`：与门户同源配色（#0d100f 底 / #d4a94e 金边 / 琥珀用户气泡 / 墨绿角色气泡）+ custom_css（Zpix 消息字体、直角化、像素头像、背景纹理）。
- 附加到用户数据目录（新增文件，未触碰既有数据）。

### 验证
经典 UI 主题下拉出现「Pixel Tavern」→ 应用后消息框金边、背景纹理、直角化生效（截图确认）。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏。

---

## 轮次 #35 — 2026-11-07 · 低频维护节奏

### 抽查
冒烟 42/42（新增「经典酒馆主题」断言：文件合法且含 custom_css）+ ESLint 0——零回归。

### 实施的改动（小项）
- **README**：经典酒馆直通行补「Pixel Tavern 主题」说明。
- **smoke.mjs**：主题文件断言（首次接线曾把绝对路径误入文件列表 join——回退为独立断言段，教训：路径断言勿混入相对基准列表）。

### 验证
冒烟 42/42 全绿；ESLint 0。

### 下轮建议
- 大项：真实大模型接入（需凭据）。
- 维持「冒烟 + 抽查」节奏；新需求随时转。

---

## 上线记录 · V1.3「明炉真火」（2026.11.07，用户指令：重新深挖参考站 → 做同类网站 → 用自己域名 → 上线）

### 参考站再调研（chat.xstavern.com @ V1.87）
- 已进化为 Vite SPA；核心壁垒：自家"酒馆专属大模型"账号体系 + BYOK 设置接入点；远程角色卡清单（webp 缩略图/18+ 模糊预览）；模型 TTS（旁白/角色分声）；AI 图文 galgame（远程清单+素材下载）；沉浸互动；四端客户端；完整 SEO（OG/manifest/robots/canonical）+ 版权/隐私/年龄声明；服务器端全站访问计数（86,315）。
- 结论：对标上线的最小硬缺口 = ①真实 LLM 接入 ②域名/HTTPS 部署 ③SEO 门面 ④合规声明 ⑤公网安全。

### 实施（8 项）
1. 服务端 `src/endpoints/pixel.js`（新文件）：`/api/pixel/status|chat|probe|visit|stats`。SSE 流式代理（OpenAI 兼容）；共享模型走 `PIXEL_LLM_*` 环境变量（密钥零下发）；BYOK 走 `x-pt-*` 头（HTTPS-only + 内网/localhost/IP 字面量拦截 = SSRF 防护，`PIXEL_ALLOW_PRIVATE=1` 供开发）；每 IP 滑窗限流（共享 40/5min、BYOK 120/5min、visit 30/min）；消息体多重上限。挂载于 usersPublicRouter 之后、requireLogin 之前（公开但保留 ST 全局 CSRF）。
2. 前端 `chat.js`：`PT_AI` 状态机 + `fetchAIStatus()`（/csrf-token + /status）+ `aiStreamReply()`（fetch 流式读取 SSE、逐字渲染进思考气泡、自动滚动）+ `buildAIMessages()`（角色 system 提示 + 最近 24 条上下文）+ `aiReady()`；`sendUserMessage` 改为 AI 优先/剧本回退（busy 防抖 + 失败 toast 无感降级）。
3. 前端设置 UI：模型接入卡（Base URL/Key/模型 + 测试连接/保存/清除）、`set-ai` 总开关、状态行（共享模型 ✓ / 自用接入点 ✓ / 未接入·剧本引擎）；BYOK 配置随 pt_settings 备份。
4. 修复导出 bug：`PTChatAI.status` 函数导出被当属性读取 → 改 getter（浏览器实测发现）。
5. SEO 门面：index.html meta/OG/Twitter/canonical/manifest 全套；`tools/make-brand.mjs` 纯 Node 生成品牌 PNG（icon-32/64/192/512 + 1200×630 OG 横幅，像素啤酒杯 16×16 最近邻放大 + 5×7 位图字体标语）；动态 `robots.txt`/`sitemap.xml` 路由（按请求主机名，置于 static 之前，原版全站 Disallow 的 robots.txt 原样保留）；canonical 随域名自动更新。
6. 访问计数：服务端持久化（data/pixel-stats.json 原子写）+ `POST /api/pixel/visit`；顶栏改为服务器全站计数（离线回退本地，删除了此前臆造的 86315 基数）。
7. 合规：设置页声明（隐私/版权/18+）+ 使用指引更新（AI 优先/回退说明）+ V1.3 更新公告 + 播报词。
8. 部署套件 `deploy/`：docker-compose（tavern 内网 + caddy 80/443）、Caddyfile（公开=门户+/api/pixel+SEO，其余 basic_auth 保护经典酒馆；HSTS/nosniff/frame 响应头）、生产 config 预设（listen 开/白名单关/CSRF 保持/插件关）、`.env.example`、`lite/server.mjs` 零依赖独立服务器（同一套像素 API + 静态托管）、`README-DEPLOY.md` 全中文上线手册（VPS+Docker / Cloudflare Tunnel / 极简三路径 + 运维备份 + FAQ + 安全设计说明）。

### 上线
- **ZCode Sites 预览站已上线**：https://pixel-tavern-fgcq.zai-ai.site（lite 服务器，健康检查 200；robots/sitemap/OG/manifest/计数全部生效；BYOK 可用）。发布内容：门户静态文件 + lite server 代码，无任何密钥。
- 自有域名：按 `deploy/README-DEPLOY.md` 在任意 VPS 上 `docker compose up -d --build` 即得全自动 HTTPS。

### 验证（全绿）
- mock LLM（tools/mock-llm.mjs）端到端：lite 版流式 ✓；ST 版（CSRF cookie+token）流式 ✓；CSRF 负向 403 ✓；SSRF 三连拦截 ✓（HTTPS-only 规则）；无共享密钥 503 提示 ✓；probe 通 ✓。
- 浏览器实测（IAB）：门户启动/V1.3 徽标/服务器计数 ✓；设置卡元素与状态机 ✓；**真实流式 AI 聊天全链路**（打开角色→发消息→SSE 逐字渲染→会话持久化）✓；线上站 canonical 自适应域名 ✓ OG 图 1200×630 加载 ✓。
- 冒烟扩至 **82 断言全过**（新增上线能力 24 项：品牌 PNG 签名与尺寸/manifest/SEO meta/BYOK 管线/部署套件/生产配置不变量）；ESLint 0。

### 遗留与建议
- 大项：模型 TTS（浏览器语音已有，专属模型 TTS 需后端配额）、角色卡远程清单、AI 图文 galgame —— 均可沿 `/api/pixel/*` 模式扩展。
- 运营：VPS 购置与域名备案由用户完成；`deploy/README-DEPLOY.md` 第 4 步填三项即可上线。
- 维持冒烟 + ESLint 护栏。

---

## 上线记录 · ai-ic.top 域名接入（2026.11.07，用户指令：我有域名 ai-ic.top，但没有服务器）

### 现场侦察
- ai-ic.top DNS 托管于阿里云 hichina，A 记录早已指向 Vercel（216.198.79.1），且线上服务着本仓库 public/ 的静态产物 → 证明该项目连接着本 GitHub 仓库、push 自动部署。
- vercel.json（初版）含 `/ → /pixel-tavern/index.html` 重写但从未生效：flat 数组重写属 afterFiles，filesystem 先命中 public/index.html（SillyTavern 壳）。
- ZCode Sites 不支持自定义域名；本机无任何部署 CLI。

### 实施（Vercel Serverless 版）
1. `api/pixel/*`（_lib + chat/status/probe/visit/stats/seo/robots/sitemap）：与 ST/lite 同源的像素 API 移植为 Serverless 函数；chat 带 maxDuration 60（Hobby 上限）+ SSE 流式；同源校验替代 CSRF；BYOK 校验/限流/计数逻辑保留（计数为实例内存 + /tmp，冷启动重置，免费层折衷）。
2. vercel.json 三次迭代：beforeFiles 对象格式两次构建失败（旧部署保持在线，无损坏）→ 回退 flat 数组 + **redirects**（先于 filesystem，保证生效）：`/ → /pixel-tavern`（307）+ robots/sitemap → 专用函数。门户加载后 history.replaceState 把地址栏美化回 `/`。
3. 途中修复：chat.js 引用未导出常量（SHARED_*）、harness 测试断言（x-forwarded-* 模拟、端口子串）。

### 验证（全绿）
- 本地 harness（tools/test-vercel-api.mjs，模拟 Vercel req/res + mock LLM）：permissive 11/11 + strict 6/6（流式、BYOK、probe、跨站拒绝、计数、robots/sitemap、SSRF 三连、405、503 提示）。
- 冒烟扩至 94 断言（+12 Vercel 项）全过；ESLint 0。
- **线上 ai-ic.top 实测**：/ → 307 → /pixel-tavern 门户（地址栏 replaceState 回 /）；/api/pixel/status JSON；robots/sitemap 动态生成（Sitemap: https://ai-ic.top/）；浏览器实测：V1.3、21 角色、服务器计数、manifest、canonical=https://ai-ic.top/、AI 状态行正确。

### 限制与建议
- Vercel Hobby：函数 60s 上限、计数/限流冷启动重置、经典酒馆不可用（无常驻后端）。
- 共享模型：Vercel 控制台加 PIXEL_LLM_* 环境变量后重新部署即可开启；否则访客 BYOK / 剧本引擎。
- 升级路径：买 VPS 后按 deploy/README-DEPLOY.md 方案 A 部署，DNS 一改即迁移，代码零改动。

---

## 追加记录 · 清晰风格皮肤上线（2026.11.07，用户反馈：想要清晰风格而非像素风格）

- 定位修正：参考站实为「现代清晰界面 + 像素元素点缀」，此前全盘复古像素过度。
- 实施：`body[data-skin="clean"]` 覆盖层（~120 行，style.css 末尾）——系统中文字体（PingFang/微软雅黑/Noto Sans SC）、圆角卡片/气泡/按钮/弹窗、柔和阴影、平滑过渡、现代滚动条；头像/炉火/Logo/灯笼等像素画与 .en 像素品牌小标签保留。默认 clean（body 静态属性防首屏闪烁），像素风在「设置 → 界面风格」随时切回，选择持久化于 pt_settings。
- 验证：本地双风格 computed style 切换实测 + 截图；冒烟扩至 103 断言全过；ESLint 0。
- 上线：64ac6d8f1 推送 → Vercel 自动部署 → ai-ic.top 浏览器截图确认清晰风格生效。

---

## 追加记录 · 品牌更名「像素酒馆」→「游戏酒馆」（2026.11.07，用户指令）

- 范围：111 处品牌文本（UI 文案、SEO meta/OG/Twitter、webmanifest、启动画面/播报/欢迎弹窗、AI 角色扮演系统提示词、合规声明、服务器日志、部署文档与注释）；README git mv 为 README-GAME-TAVERN.md；经典主题显示名 Game Tavern；demo 卡元数据重生成。
- 品牌资产：make-brand.mjs 新增 5×7 位图字体 G/M 字形，OG 横幅重绘为 GAME TAVERN（图标无文字不变）。
- 保留（基础设施，访客不可见）：/pixel-tavern/ 路径与目录、/api/pixel/* 路由、PT_* 与 pt_* 标识符、PIXEL_LLM_* 环境变量、[pixel-lite] 日志前缀 —— 改动会断 URL/缓存/书签且无可见收益。
- 资源指纹 v=1303；冒烟 103/103；ESLint 0；本地+线上（ai-ic.top）HTML 中旧名 0 处；浏览器截图确认。预览站同步重部署并改名为「游戏酒馆 Game Tavern」。
