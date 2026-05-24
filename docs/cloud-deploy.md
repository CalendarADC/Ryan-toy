# Cloud Deployment Guide

This project now supports cloud-first deployment with:

- App hosting: Vercel
- Database: Neon Postgres
- Image assets: Cloudflare R2

## Vercel 发版（仅 Git 集成）

**生产环境只通过 GitHub 推送触发 Vercel 自动构建与部署，不要使用 `vercel deploy` / `vercel deploy --prod`。**

原因：CLI 会打包上传本地整个工作区（含 `node_modules`、`release-dist`、`.next` 等），体积可达 1GB+ 且很慢；Git 集成只拉仓库内已提交的文件，在 Vercel 云端执行 `npm install` + `next build`，与日常发版一致。

推荐流程：

1. 本地提交并推送到 `main`：`git push origin main`
2. 在 [Vercel Dashboard](https://vercel.com) 查看对应项目（如 `gemmuse` / `gemmuse-main`）的 Production 部署状态
3. 生产 URL 示例：`https://gemmuseai.vercel.app`（以项目实际域名为准）

桌面安装包（`npm run desktop:build` → `release-dist/*.exe`）仅本地分发，不随 Web 部署上传。

## 1) Create cloud resources

1. Create a Neon Postgres database and copy the connection string.
2. Create an R2 bucket (for example `jewelry-images`).
3. Create an R2 API token with object read/write permissions.
4. (Recommended) Bind a public CDN/custom domain to R2 and use it as `R2_PUBLIC_BASE_URL`.

## 2) Set environment variables

In Vercel project settings, configure:

- `STEP1_EXPAND_API_KEY`（Step1 灯泡扩写与参考图识图共用，须与桌面版一致时改为此处）
- `STEP1_EXPAND_MODEL`（推荐 `ark-code-latest`，仅用于文本扩写）
- `STEP1_EXPAND_BASE_URL`（推荐 `https://ark.cn-beijing.volces.com/api/coding/v3`；识图与扩写共用该网关下的 `/chat/completions`，Coding Plan 的 `kimi-k2.6` 等模型勿改到 `/api/v3`；若仍为 `api.modelverse.cn` 则走 Modelverse 而非火山方舟）
- `STEP1_EXPAND_VISION_MODEL`（Step1 眼睛识图；须在[火山方舟控制台](https://console.volcengine.com/ark)开通多模态模型，如 `doubao-1-5-vision-pro-32k-250115`；未配置时回退 `STEP1_EXPAND_MODEL`，文本模型通常无法识图）
- `LAOZHANG_API_KEY`
- `QWEN_API_KEY` (optional fallback)
- `AUTH_SECRET` (32+ random chars)
- `NEXTAUTH_URL` (your production URL, e.g. `https://app.company.com`)
- `DATABASE_URL` (Neon Postgres URL)
- `R2_ENDPOINT` (e.g. `https://<accountid>.r2.cloudflarestorage.com`)
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` (public HTTP base used by frontend)

## 3) Prisma migration in cloud

Run once against the production database:

```bash
npx prisma generate
npx prisma db push
```

If the app shows **`The table public.Task does not exist`** (or similar Prisma errors), the cloud database was never synced: run the same commands above with **production** `DATABASE_URL` (copy from Vercel env or Neon), then redeploy if needed.

## 4) Bootstrap first admin

Run once with production env vars:

```bash
ADMIN_EMAIL=admin@company.com \
ADMIN_PASSWORD='your-strong-password' \
ADMIN_NAME='Admin' \
npm run seed:admin
```

PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@company.com"
$env:ADMIN_PASSWORD="your-strong-password"
$env:ADMIN_NAME="Admin"
npm run seed:admin
```

## 5) Verify production

1. Register a normal user account (`/register`).
2. Login with admin and approve from `/admin/users`.
3. Generate Step1/Step3 images and verify returned URLs are HTTPS object-storage URLs.
4. Log in from another device and verify account access remains valid.
