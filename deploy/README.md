# 部署手册

本项目是**纯静态站**：构建产物为静态文件。有两种托管方式：

| 方式 | 适用 | 文档 |
| --- | --- | --- |
| **Cloudflare Pages** | 免费、零服务器、连 GitHub 自动部署 | [cloudflare-pages.md](./cloudflare-pages.md) |
| **自有服务器 + Nginx** | 国内正式站、完全自控 | 本文档下文 |

---

## 一、域名与子域名规划

多个服务共用一台服务器时，本项目用**独立子域名**隔离，而不是子路径：

```
pindou.example.com   →  本项目
其他服务             →  各自的子域名
```

理由是站点根路径就是 `/`，不必引入 `basePath`，避免一整类 URL 拼接问题。`astro.config.mjs` 里的 `base` 仍保留为可配置项并默认为根，作为**逃生舱**：将来若某个环境（预览站、内网试用）必须挂在子路径下，只需注入环境变量，不改代码。

### 两个容易踩的坑

**证书覆盖范围**：Cloudflare 免费的 Universal SSL 覆盖根域与**一级**子域（`*.example.com`）。`pindou.example.com` 在范围内，但 `a.b.example.com` 这类二级以上子域**不覆盖**，命名时必须避开。

**Search Console 资源类型**：添加 **Domain property（域名级资源）** 而非 URL prefix。前者一次覆盖所有子域与协议，后续每加一个子域都不必重新验证；后者每个子域都要单独验证一遍。

---

## 二、Cloudflare 配置

1. 域名 NS 指向 Cloudflare
2. DNS 添加 A 记录：`pindou` → 源站 IP，**代理状态开启**（橙色云朵）
3. SSL/TLS 加密模式选 **Full (strict)**
   - 需要源站装 Cloudflare Origin CA 证书（有效期 15 年，见下）
   - 不要用 Flexible，那会导致 CF 到源站是明文，且容易出现重定向循环
4. 开启 **Always Use HTTPS**
5. 开启 **Brotli** 压缩
6. Auto Minify 建议**全部关闭**——构建产物已经压缩过，CF 再处理一次可能破坏内容哈希

### 签发 Origin CA 证书

Cloudflare 控制台 → SSL/TLS → Origin Server → Create Certificate，主机名填 `pindou.example.com`，把证书与私钥存到源站：

```bash
sudo mkdir -p /etc/nginx/ssl/pindou
sudo vim /etc/nginx/ssl/pindou/origin.pem   # 粘贴证书
sudo vim /etc/nginx/ssl/pindou/origin.key   # 粘贴私钥
sudo chmod 600 /etc/nginx/ssl/pindou/origin.key
```

> Origin CA 证书**只被 Cloudflare 信任**，绕过 CDN 直接访问源站会报证书错误。这是预期行为，不是故障。

---

## 三、Nginx

```bash
sudo cp deploy/nginx/pindou.conf /etc/nginx/conf.d/pindou.conf
sudo vim /etc/nginx/conf.d/pindou.conf     # 改 server_name 与 root
sudo mkdir -p /var/www/pindou
sudo nginx -t                              # 校验配置
sudo systemctl reload nginx
```

配置文件里已处理的几件事：

- **恢复访问者真实 IP**（`set_real_ip_from` + `CF-Connecting-IP`）。不配的话日志里全是 CF 边缘节点 IP
- **缓存分层**：`/_astro/` 带内容哈希，永久缓存；HTML 与 JSON 必须 `must-revalidate`，否则发版后用户拿到的还是旧页面
- **`try_files $uri $uri/`**：站点配了 `trailingSlash: 'always'`，产物是目录形式，缺了 `$uri/` 这一档会 404
- `/sw.js` 单独禁缓存，否则 PWA 更新会被卡住

---

## 四、发布

```bash
pnpm build                                  # 产物在 apps/web/dist
rsync -avz --delete apps/web/dist/ user@server:/var/www/pindou/
```

`--delete` 会清掉服务端多余文件，保证与构建产物完全一致。首次发布前建议先不带 `--delete` 跑一次确认路径无误。

---

## 五、Search Console 与站长平台

| 平台 | 操作 | 备注 |
| --- | --- | --- |
| Google Search Console | 添加 **Domain property**，用 DNS TXT 验证 | 一次覆盖所有子域 |
| Bing 网站管理员工具 | 可直接从 GSC 导入 | 省一次验证 |
| 百度搜索资源平台 | 需要 **ICP 备案**后才能正常收录 | 见下 |

三个平台都要提交 `https://pindou.example.com/sitemap-index.xml`。

---

## 六、ICP 备案（面向中国大陆访问必须）

**这件事要尽早启动，周期通常 2 至 4 周，是整个上线流程里最长的一环。**

前置条件：

- 服务器必须在**中国大陆境内**，且由该服务商代为提交（阿里云、腾讯云等）
- 域名后缀需在工信部许可名单内
- 企业主体需营业执照、法人身份证；个人主体需身份证
- 备案期间域名**不能有可访问的内容**，部分服务商会要求先关闭站点

> 若源站在境外，则无法备案，百度等国内搜索引擎的收录与访问速度都会受影响。当前方案是 Cloudflare 代理指向源站 IP，国内解析与收录效果需上线后实测评估。

---

## 七、环境变量

复制 `.env.example` 为 `.env` 并按实际填写：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | 站点绝对 URL，canonical 与 sitemap 的基准 | `http://localhost:4321` |
| `PUBLIC_BASE_PATH` | 子路径前缀，子域名部署留空即可 | `/` |

**全项目禁止手写域名字符串**，域名只在 `src/lib/url.ts` 里出现一次并从环境变量读取。

---

## 八、上线前检查

### 构建与数据

- [ ] `.env` 已配置真实 `PUBLIC_SITE_URL`（勿留 localhost）
- [ ] `pnpm check` 全绿（类型、色卡校验、单测、构建）
- [ ] `pnpm build` 产物在 `apps/web/dist`，含 `manifest.webmanifest` 与 `sw.js`
- [ ] `pnpm verify:urls` 通过（若已配置）——校验 canonical、hreflang、sitemap

### 功能冒烟（真机 / 桌面）

- [ ] 上传 → 裁剪（可跳过）→ 调参（抖动 / 限色 / 采样）→ 生成
- [ ] 导出 PNG / PDF / CSV 均可下载
- [ ] 保存草稿 → 刷新页面 → 自动恢复或从「打开草稿」恢复
- [ ] 桌面 Chrome：可「安装到主屏幕」（PWA）；`/sw.js` 响应头无长期缓存
- [ ] 页脚可见 bitbead CC BY 4.0 署名与免责声明
- [ ] 移动端至少一台安卓 + 一台 iPhone：编辑器可用、底部三栏可切换

### 运维与收录

- [ ] Nginx `server_name` / `root` 已改；`nginx -t` 通过
- [ ] Cloudflare：Full (strict)、Always HTTPS、Brotli 开、Auto Minify 关
- [ ] Lighthouse：性能与可访问性无明显红灯
- [ ] `robots.txt` 未误屏蔽；Search Console / 站长平台已提交 sitemap
- [ ] ICP 备案进度已启动（面向大陆访问时）

---

## 九、回滚

保留上一版 `dist` 目录备份（或带时间戳的 rsync 目标），发现问题则：

```bash
rsync -avz --delete /path/to/dist-backup/ user@server:/var/www/pindou/
```

HTML 与 `sw.js` 均为短缓存 / 禁缓存，回滚后用户刷新即可看到旧版壳；`/_astro/` 带内容哈希，新旧产物可共存直至缓存过期。
