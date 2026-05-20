# Codex 接手说明

## 2026-05-19 接手更新

- 已按官网可下载范围全量抓取材料信息价：
  - 官网列表共 172 条发布记录。
  - 其中 82 条有可下载 Excel 附件，已下载并解析。
  - 可用数据范围为 `2019-05` 至 `2026-04`，中间缺少官网未提供附件或未发布的月份。
  - 当前 `public/data` 已生成 82 期、541,830 条材料价格记录。
- 为避免首屏一次加载 54 万条记录，前端已改为：
  - 首屏只加载 `manifest.json` 和 `latest.json`。
  - 每个材料的历史趋势从 `public/data/histories/*.json` 懒加载。
  - 最新期材料历史文件数：4,583。
- 本机 Node PATH 已修复到用户级 PATH：
  `C:\Users\banabann\AppData\Roaming\fnm\node-versions\v20.20.2\installation`
- 已新增 `.node-version`，锁定 `v20.20.2`，便于 fnm 自动切换。
- `data/raw/**/*.xls` 和 `data/processed/*.json` 是可再生文件，已加入 `.gitignore`；仓库提交 `public/data` 静态站点数据。
- 已初始化本地 Git 仓库；当前尚未配置远端。
- 已接入上海市建设市场信息服务平台公开接口：
  - 材料信息价列表：`/JGBXMGCZJInterWeb/interWeb/hyxx/getHyxxList`
  - 栏目树：`/JGBXMGCZJInterWeb/interWeb/hyxx/getTree`
  - 附件下载：`/JGBXMGCZJInterWeb/interWeb/currently/bdFileDownload`
- `scripts/fetch/fetch-shanghai-price.mjs` 已从占位脚本升级为真实下载脚本，默认下载最近 6 期材料信息价到 `data/raw/YYYY-MM.xls`。
- `scripts/parse/parse-excel.mjs` 已改用 `xlsx`，支持官网 `.xls` 和 `.xlsx`，并能解析官方 2025-11 至 2026-04 数据。
- 当前 `public/data` 已由真实官网 Excel 生成：6 期，共 27,947 条记录，最新期为 `2026-04`。
- 本机 `node` / `npm` 未在 PATH 中；本次使用的 Node 路径为：
  `C:\Users\banabann\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- 已通过：
  - `node scripts/fetch/fetch-shanghai-price.mjs --months=6`
  - `node scripts/parse/parse-excel.mjs`
  - `node scripts/parse/generate-index.mjs`
  - `node node_modules/typescript/bin/tsc --noEmit`
  - `node node_modules/next/dist/bin/next build`
- `next build` 仍会提示本机 `@next/swc-win32-x64-msvc` 不是有效 Win32 应用，但已自动回退 `@next/swc-wasm-nodejs` 且构建成功。
- production server 已可用：`http://127.0.0.1:3000`，数据接口 `/data/manifest.json` 和 `/data/latest.json` 返回 200。

## 项目概况

项目名：上海信息价数据库比对系统  
项目路径：`H:\codex\sh-info-price`  
目标部署：独立 Vercel 应用  
主站路径：`H:\codex\personl web\solaris-wiki`

项目目标：

- 自动抓取上海建设工程信息价官网每月 Excel 数据。
- 清洗并标准化材料价格数据。
- 提供最新价查询、历史趋势、多期对比。
- 后续在个人主站展示预览版本，并通过外部链接访问完整版本。

## 当前技术方案

第一阶段采用静态优先方案：

- Next.js + React + TypeScript
- 静态 JSON 数据文件
- Recharts 做趋势图
- ExcelJS 预留服务端/脚本解析 Excel
- xlsx 做浏览器端导出 Excel

暂不使用数据库。原因：

- 信息价是月度数据，实时写入需求低。
- 静态 JSON 更适合 Vercel 免费部署。
- 后续可平滑升级到 Vercel Serverless API、libSQL 或 Supabase。

## 当前已完成

- 已创建 Next.js 项目骨架。
- 已完成首页 MVP：
  - 关键词查询最新信息价
  - 材料历史趋势折线图
  - 两个月份价格对比
  - 当前查询结果导出 Excel
- 已加入 6 个月模拟数据：`2025-11` 到 `2026-04`。
- 已预留数据脚本：
  - `scripts/fetch/fetch-shanghai-price.mjs`
  - `scripts/parse/parse-excel.mjs`
  - `scripts/parse/generate-index.mjs`
- 已写主站集成说明：`docs/main-site-integration.md`

## 尚未完成

- 真实官网数据抓取未完成：`scripts/fetch/fetch-shanghai-price.mjs` 目前只是占位脚本，尚未接入上海建设工程信息价官网真实下载链接。
- 真实 Excel 样本解析未验证：解析脚本已写，但还没有用官网 Excel 校准合并单元格、复杂表头、多 sheet、空行和异常格式。
- 当前 `public/data` 已由真实官网 Excel 生成，提交后由独立 Vercel 应用作为正式静态数据源托管。
- 自动化更新未接入：尚未配置每月自动下载、解析、生成 JSON、提交并触发 Vercel 部署的流程。
- 主站已改为独立应用入口；`H:\codex\personl web\solaris-wiki\tools\sh-info-price` 仅作为备用查询工具，默认读取正式静态数据源。
- 正式默认访问地址按 `https://sh-info-price.vercel.app/` 和 `https://sh-info-price.vercel.app/data/` 配置；若 Vercel 实际域名不同，需要同步更新主站环境变量。
- 搜索能力仍是基础版：当前是简单关键词匹配，后续可升级为 MiniSearch、拼音搜索、规格筛选和更强排序。
- 数据质量报告未完成：解析失败行、重复材料、异常价格、缺失字段等还没有报告页面或日志汇总。
- 导出功能是基础版：当前仅导出查询结果，尚未支持趋势导出、对比报告导出和更完整的 Excel 格式。
- 正式测试用例未添加：目前只有类型检查和构建验证，尚未为 Excel 解析、材料匹配、涨跌幅计算添加单元测试。

## 验证状态

已通过：

```bash
npm run typecheck
npm run build
```

本地开发服务曾启动并验证：

```txt
http://localhost:3000
```

页面和静态数据接口返回 `200 OK`。

注意：本机 Windows 构建时 Next.js 可能提示 `@next/swc-win32-x64-msvc` 不是有效 Win32 应用，但生产构建已成功，Vercel Linux 环境一般不受该本机包问题影响。

## 下次优先事项

1. 如果用户要继续开发，先确认是否仍使用静态 JSON MVP 路线。
2. 优先接真实 Excel 样本，验证 `parse-excel.mjs` 对合并单元格、空行、表头偏移的处理。
3. 拿到官网真实下载链接后，再补 `fetch-shanghai-price.mjs`。
4. 主站如需更新入口域名，设置 `SH_INFO_PRICE_APP_URL` 和 `SH_INFO_PRICE_DATA_BASE_URL`；只有离线预览需要完整本地数据时才设置 `SH_INFO_PRICE_COPY_LOCAL_DATA=1`。
5. 不要把完整 Next.js 项目源码直接塞进主站目录；主站只挂载轻量静态查询页和数据副本。

## 常用命令

```bash
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
npm run dev
npm run typecheck
npm run build
npm run fetch:data
npm run parse:data
npm run build:index
```
