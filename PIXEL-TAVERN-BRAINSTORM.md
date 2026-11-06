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
