# 素材与依赖致谢（Credits & Licenses）

幻境回声 · EchoCraft 的全部角色、剧本、肖像、音律与品牌资产均为本项目原创。
以下为项目所依赖的第三方开源组件及其授权，按规则如实致谢。

## 代码基座

| 组件 | 授权 | 说明 |
|---|---|---|
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) | AGPL-3.0 | 本项目基于 SillyTavern 1.19.0 二次开发。源码修改遵循同一授权，本项目仓库即完整对应源码载体。 |

## 随 SillyTavern 分发的资产

| 资产 | 授权 | 说明 |
|---|---|---|
| 默认角色卡 Seraphina（`default_Seraphina.png`） | 随 SillyTavern（AGPL-3.0 项目）分发 | 卡作者：OtisAlejandro。门户侧的中文分类/轮换开场白/设定集为本项目补充层（见 `tools/card-overrides/`），原卡内容未改动。 |

## 字体

| 字体 | 授权 | 说明 |
|---|---|---|
| `fonts/zpix-subset.woff2` | 免费商用（Zpix 最像素字体） | 仅保留界面所需字符的子集。如需完整版请访问 [Zpix Releases](https://github.com/SolidZORO/zpix-pixel-font/releases)。 |

## 本项目原创内容

- 9 位原创角色（8 位中文卡 + Seraphina 补充层）：全部文本、剧本、设定集为原创撰写。
- 程序化肖像引擎（`public/pixel-tavern/avatars.js`）与封面海报（`tools/make-card-covers.mjs`）：纯 Canvas/Node 算法生成，无任何第三方图片素材。
- 环境音律（`public/pixel-tavern/jukebox.js`）：WebAudio 实时合成，零外部音频文件。
- 品牌资产（图标/横幅/背景场景）：`tools/make-echocraft-brand.mjs`、`tools/make-portal-bg.mjs` 算法生成。

## 收录规则

后续如引入任何第三方素材（开源角色卡、音频、字体等），必须先核验其开源授权允许再分发，并在本文件登记来源与授权，再进入仓库。
