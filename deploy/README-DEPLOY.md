# 像素酒馆 · 用你自己的域名上线手册

> 目标：让任何人打开 `https://你的域名` 就能看到像素酒馆门户，聊天走真实大模型；
> 原版 SillyTavern「经典酒馆」藏在基础认证之后，只属于你。

**当前状态：`ai-ic.top` 已经由方案 C（Vercel，零服务器）上线。** 三条路径任选，随时可以升级迁移。

## 三条路径速查

| 路径 | 成本 | 经典酒馆 | 适合 |
| --- | --- | --- | --- |
| **C · Vercel（当前在用）** | **免费** | ❌ 无后端不可用 | 有域名、没服务器；推送 GitHub 自动上线 |
| **A · VPS + Docker** | ¥20~40/月 | ✅ 完整（认证保护） | 要全功能、稳定 7×24 |
| **B · Cloudflare Tunnel** | 免费 | ✅ 完整 | 用家里电脑/NAS 当服务器 |

---

## 方案 C · Vercel（零服务器，已打通）

本项目已连接 Vercel（`ai-ic.top` 即此方案），**只要 `git push`，2 分钟内自动上线**。

原理与组成：

- **门户**：`public/pixel-tavern/` 全套静态文件由 Vercel CDN 直发；`vercel.json` 的
  `redirects` 把 `/` 307 到 `/pixel-tavern`（redirects 先于 filesystem 生效；
  门户加载后用 `history.replaceState` 把地址栏美化回 `/`，访客无感）。
- **后端 API**：`api/pixel/*.js` 为 Vercel Serverless Functions（Node），与 ST/lite
  版同一套逻辑：`status` / `chat`（SSE 流式，maxDuration 60s）/ `probe` / `visit` /
  `stats` / `robots` / `sitemap`。同源校验 + BYOK 防护（HTTPS-only、禁内网）+ 每 IP 限流。
- **经典酒馆**：Serverless 无法运行 SillyTavern 常驻后端，此路径下不可用（顶栏按钮
  无效属预期）。需要时升级到方案 A/B 即可获得。

启用共享模型（游客免配置真聊）：Vercel 控制台 → 你的项目 → Settings →
Environment Variables 添加 `PIXEL_LLM_BASE_URL` / `PIXEL_LLM_API_KEY` / `PIXEL_LLM_MODEL`，
添加后任意触发一次重新部署生效。

免费版（Hobby）限制须知：

- 函数单次最长 60s（回复超长可能被截断，随后端提示回退剧本引擎）
- 访问计数与限流存在实例内存/`/tmp`，冷启动会重置（展示用途足够）
- 无共享模型时访客走 BYOK 或本地剧本引擎，站点依然完整可玩

迁移到 VPS：按下方方案 A 部署后，把域名 DNS 的 A 记录指向新服务器即可，代码零改动
（`api/` 目录与 `vercel.json` 只在 Vercel 环境生效，不影响 ST/lite 运行）。

---

## 方案 A · VPS + Docker（全功能，推荐长期）

```
访客 ──HTTPS──▶ Caddy（自动申请/续期 TLS 证书）
                  │  公开：/            → 像素酒馆门户
                  │  公开：/pixel-tavern/*  → 门户静态资源
                  │  公开：/api/pixel/*     → 聊天代理（限流）+ 访问统计 + SEO 文件
                  └  认证：其余一切      → 原版 SillyTavern（经典酒馆）
                                ▲
                       SillyTavern 容器（8000，仅内网）
                       含 /api/pixel 大模型代理（PIXEL_LLM_* 共享模型 或 用户自带 API）
```

部署套件全部在 `deploy/` 目录：`docker-compose.yml`、`Caddyfile`、`.env.example`、`config/config.yaml`（生产预设）。

---

## 前提清单

| 需要 | 说明 |
| --- | --- |
| 一台 VPS / 云主机 | 1 核 1G 起步（推荐 2G），Debian 12 / Ubuntu 22+。**服务器在中国大陆则域名必须先 ICP 备案**；不想备案请选香港/日本/美国机房 |
| 一个域名 | 任意注册商（Cloudflare / 阿里云 / Namecheap…） |
| 本仓库代码 | git 或压缩包上传均可 |
| （可选）大模型 API Key | 任何 OpenAI 兼容接口：DeepSeek、Kimi、Qwen、OpenAI、各类中转站 |

---

## 第 1 步 · DNS 解析

在域名控制台添加一条 **A 记录**：主机记录 `@`（或 `tavern` 等子域）→ 服务器公网 IP。
 TTL 保持默认即可。验证（本机执行）：

```bash
dig +short tavern.example.com     # 应输出你的服务器 IP
```

## 第 2 步 · 服务器装 Docker

```bash
ssh root@你的服务器IP
curl -fsSL https://get.docker.com | sh    # 官方一键脚本（国内机器慢可用镜像源）
docker --version && docker compose version
```

放行防火墙 80/443（云厂商“安全组”里也要放行）：

```bash
ufw allow 80,443/tcp 2>/dev/null || true
```

## 第 3 步 · 上传代码

```bash
# 方式 A：git（推荐，便于更新）
git clone <你的仓库地址> /opt/pixel-tavern
# 方式 B：本机打包上传（排除 node_modules/data 也可以，构建时会自动 npm ci）
```

## 第 4 步 · 填写配置

```bash
cd /opt/pixel-tavern/deploy
cp .env.example .env
nano .env    # 或 vi / vim
```

`.env` 必填三项：

```ini
DOMAIN=tavern.example.com        # 你的域名（与 DNS 记录一致）
ACME_EMAIL=you@example.com       # 证书通知邮箱
BASICAUTH_HASH=$2a$14$........   # 经典酒馆的基础认证密码哈希，生成命令见下
```

生成密码哈希（把 `你的强密码` 换掉，输出整行 `$2a$14$...` 粘贴到 `BASICAUTH_HASH=` 后面）：

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext '你的强密码'
```

可选 —— 站点共享大模型（三项齐全才启用，游客免配置直接真聊）：

```ini
PIXEL_LLM_BASE_URL=https://api.deepseek.com/v1
PIXEL_LLM_API_KEY=sk-xxxx
PIXEL_LLM_MODEL=deepseek-chat
```

> 不配置共享模型也完全可用：访客在门户「设置 → 模型接入」里填自己的
> OpenAI 兼容接口（Key 只存访问者浏览器本地，不经过你）。
> 没有模型时聊天自动回退本地剧本引擎，站点依旧可玩。

## 第 5 步 · 启动

```bash
docker compose up -d --build      # 首次构建约 3~8 分钟
docker compose logs -f caddy      # 看到 certificate obtained successfully 即成功
```

打开浏览器验证：

| 地址 | 预期 |
| --- | --- |
| `https://你的域名` | 像素酒馆门户（启动画面 → 集市） |
| `https://你的域名/robots.txt` | 像素酒馆 robots，含 Sitemap 行 |
| `https://你的域名/sitemap.xml` | 指向你域名的站点地图 |
| `https://你的域名/?classic=1` | 弹出基础认证 → 输入 `BASICAUTH_USER` + 你设的密码 → 经典酒馆 |
| `https://你的域名/api/pixel/status` | `{"ai":true/false,...}` |

## 第 6 步 · 收尾（可选但推荐）

- **搜索引擎收录**：Google Search Console / Bing Webmaster 提交 `https://你的域名/sitemap.xml`。
- **PWA 安装**：手机浏览器「添加到主屏幕」，站点已带 manifest 与图标。
- **国内加速**：把域名 NS 托管到 Cloudflare 并开启橙云（CDN 缓存静态资源），注意 WS/SSE 需在 Cloudflare 网络设置中允许。

---

## 日常运维

```bash
# 更新版本
cd /opt/pixel-tavern && git pull && cd deploy && docker compose up -d --build

# 看日志
docker compose logs -f tavern     # 应用日志
docker compose logs -f caddy      # 证书/访问日志

# 重启
docker compose restart
```

**备份**（建议每周 cron 打包）：

```bash
tar czf backup-$(date +%F).tgz -C /opt/pixel-tavern/deploy data .env config
```

`data/` 含角色卡、用户数据、访问统计；`.env` 含密钥与域名；`config/` 为服务端配置。

---

## 替代方案 A · 没有公网 IP？（家宽 / NAS / 内网机器）

用 Cloudflare Tunnel 把内网服务安全地暴露到你的域名，无需开放任何端口：

在 `deploy/docker-compose.yml` 追加：

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token <你的隧道Token>
    depends_on:
      - tavern
    networks:
      - tavern-net
```

Cloudflare Zero Trust 控制台建隧道时，把 `tavern.example.com` 指向 `http://tavern:8000`。
此方案下 Caddy 容器可停用（`docker compose stop caddy`），证书由 Cloudflare 边缘处理。

## 替代方案 B · 极简部署（无 Docker）

服务器有 Node.js 20+ 即可：

```bash
npm ci --omit=dev
PIXEL_LLM_BASE_URL=... PIXEL_LLM_API_KEY=... PIXEL_LLM_MODEL=... node server.js
```

配合 Nginx/Caddy 反代 + certbot 签证书，或 `systemd` 托管。安全起见请保持
`deploy/config/config.yaml` 中的公网预设值（whitelistMode: false 等）。

---

## 安全设计说明

- **公网暴露面最小化**：只有门户静态页、`/api/pixel/*`、robots/sitemap 对外；
  经典酒馆全部页面与 API 在 Caddy 基础认证之后。
- **共享密钥零下发**：`PIXEL_LLM_API_KEY` 只存在于服务端环境变量；门户永远拿不到。
- **BYOK 防护**：用户自带接入点仅接受 HTTPS 公网地址（禁内网 IP/localhost，
  防 SSRF），密钥不落盘不写日志。
- **限流**：`/api/pixel/chat` 每 IP 滑动窗口限流（共享模型 40 次/5 分钟，
  自带 Key 120 次/5 分钟），`/api/pixel/visit` 30 次/分钟。
- **CSRF**：像素 API 仍走 SillyTavern 全局 CSRF 中间件（门户先取 `/csrf-token`），
  加上 Caddy 的安全响应头（HSTS / nosniff / frame-ancestors）。
- **上传面**：门户无任何文件上传到服务器的路径；角色卡导入导出均在浏览器本地完成。

## 常见问题

**证书没签下来？** `docker compose logs caddy` 看 ACME 报错。90% 是 DNS 未生效
或 80 端口没放行（HTTP-01 挑战要走 80）。`dig +short 你的域名` 确认解析，安全组放行 80/443。

**国内服务器要备案吗？** 要。解析到大陆 IP 的 80/443 服务会被阻断。换香港/境外机房可免备案。

**共享模型显示未接入？** 三项 `PIXEL_LLM_*` 必须齐全，改完 `docker compose up -d`
重建 tavern 容器；`curl https://你的域名/api/pixel/status` 验证 `ai:true`。

**想更换/追加域名？** 改 `.env` 的 `DOMAIN`（空格分隔可写多个），`docker compose up -d caddy` 即可，证书自动重签。

**数据在哪？** 全部在 `deploy/data/`（角色、统计）与浏览器本地（访客的收藏/聊天/Key）。
