# Cloudflare 部署指南（2026-08 对照官方文档）

> 官方文档会演进，本文以 2026 年 8 月 Cloudflare 文档为准。  
> Cloudflare 现在有两条**不同**的 Git 自动部署路径，**不要混用**。

---

## 路径对照（先看懂再填 Dashboard）

| | **经典 Pages** | **Workers Builds**（Dashboard 三栏：构建 / 部署 / 版本） |
|---|---|---|
| 官方文档 | [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) | [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) |
| 创建入口 | Create application → **Pages** 标签 | 连接 Git 到 **Worker** |
| 配置项 | Build command + **Output directory** | Build command + **Deploy command** + **非生产分支 Deploy command** |
| 部署方式 | Build 成功后**自动上传**静态目录 | 运行 **Wrangler 部署命令** |
| 默认 Deploy | 无（不需要） | `npx wrangler deploy` |
| 域名 | `*.pages.dev` | `*.workers.dev` |
| 本项目推荐 | ✅ 更简单 | ✅ 也可（需正确 `wrangler.toml`） |

---

## 方案 A：经典 Cloudflare Pages（最简，推荐静态 Astro）

[Build configuration 官方说明](https://developers.cloudflare.com/pages/configuration/build-configuration/)

### 创建

1. [Workers & Pages](https://dash.cloudflare.com/) → **Create application** → **Pages** 标签  
2. **Import an existing Git repository** → 选 `JackXhl/ai-pindou`

### 构建设置

| 项 | 值 |
| --- | --- |
| Production branch | `master` |
| Build command | `corepack enable && pnpm install && pnpm build` |
| Build output directory | `apps/web/dist` |
| Root directory | `/`（monorepo 在仓库根构建，[官方支持 monorepo](https://blog.cloudflare.com/pages-workers-integrations-monorepos-nextjs-wrangler/)） |

**没有「部署命令 / 版本命令」两栏。**

### 环境变量

| 变量 | 值 |
| --- | --- |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `9` |
| `PUBLIC_SITE_URL` | 首次可用 `$CF_PAGES_URL` 或部署后真实 `.pages.dev` 地址 |
| `PUBLIC_BASE_PATH` | `/` |

Pages 构建时会注入 [`CF_PAGES_URL`](https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables) 等系统变量。

---

## 方案 B：Workers Builds

[Workers Builds 官方流程](https://developers.cloudflare.com/workers/ci-cd/builds/)：

1. **Build command**（可选）— 编译项目  
2. **Deploy command** — 部署 Worker（默认 `npx wrangler deploy`）  
3. **Non-production branch deploy command**（界面上的「版本命令」）— 预览分支默认 `npx wrangler versions upload`

### 静态 Astro 官方配置

[Astro on Workers 官方指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/) 要求根目录 `wrangler.toml` / `wrangler.jsonc` 含：

```toml
[assets]
directory = "apps/web/dist"
```

本仓库已配置，**Deploy 必须用 `npx wrangler deploy`**（不是 `wrangler pages deploy`，也不是裸 monorepo 无 config 的 deploy）。

### Dashboard 填法

| 字段 | 值 |
| --- | --- |
| **构建命令** | `corepack enable && pnpm install && pnpm build` |
| **部署命令** | `npx wrangler deploy` |
| **非生产分支部署命令 / 版本命令** | `npx wrangler versions upload` |
| **根目录** | `/` |

> ⚠️ **不能留空** — Workers Builds API 要求 deploy 相关字段有值，留空会报 **`Invalid request body`**（[Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)）。

### 环境变量（Build variables）

| 变量 | 值 |
| --- | --- |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `9` |
| `PUBLIC_SITE_URL` | 部署后的 `*.workers.dev` 或自定义域名 |
| `PUBLIC_BASE_PATH` | `/` |

Workers Builds 注入 [`WORKERS_CI_*`](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#environment-variables) 系统变量（不是 `CF_PAGES_*`）。

---

## 方案 C：GitHub Actions + Wrangler

[Direct Upload CI 官方文档](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)

仓库内 [`.github/workflows/cloudflare-pages.yml`](../.github/workflows/cloudflare-pages.yml) 为**手动触发**；需在 GitHub Secrets 配置 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。

Workers 静态站 deploy 命令：

```yaml
command: pages deploy apps/web/dist --project-name=ai-pindou
# 或（Workers assets 模型）
command: deploy
```

---

## 常见错误对照（官方行为）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Invalid request body` 保存失败 | Workers Builds 的 Deploy / 版本命令留空 | 按方案 B 填完整命令 |
| `wrangler deploy` workspace 报错 | 根目录无有效 `wrangler.toml` `[assets]` | 使用本仓库最新 `wrangler.toml` |
| Build 成功 Deploy 失败 | 用了 `wrangler pages deploy` 却创建的是 Worker 项目 | 统一为 `wrangler deploy` + `[assets]` |
| 想用 `.pages.dev` | 建错了 Worker 项目 | 改用方案 A 重建 Pages 项目 |

---

## 本地 CLI

```bash
pnpm install && pnpm build
pnpm deploy   # wrangler deploy
```

---

## 与本仓库文件

| 文件 | 作用 |
| --- | --- |
| `wrangler.toml` | Workers 静态 `[assets]` 目录 |
| `.node-version` | Node 22 |
| `apps/web/public/_headers` | 缓存策略（Pages / 部分 Workers 场景） |
| `.github/workflows/cloudflare-pages.yml` | 可选 CI |

---

## 国内访问

Cloudflare 边缘节点全球分布；面向大陆用户正式站仍建议备案 + 自有服务器（见 [deploy/README.md](../deploy/README.md)）。
