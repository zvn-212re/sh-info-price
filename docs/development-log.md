# Development Log

## 2026-05-24

### 查询页更新日志与历史加载诊断

- `/admin` 客户端密码门槛暂不改为正式鉴权，按当前阶段继续作为管理草稿台使用。
- 查询首页新增轻量更新日志模块，展示当前版本、最近功能更新和数据索引变化。
- 历史价格文件加载失败时改为显示明确错误提示，不再把失败请求降级成“仅有 1 期数据”的趋势状态。
- 图表在历史数据读取中、读取失败和无数据时分别显示不同空状态，避免误导用户。

验证：

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/next/dist/bin/next build`

## 2026-05-19

### 全量数据扩展

- 将材料信息价抓取从最近 6 期扩展为官网可下载全量。
- 官网 `003002` 列表共返回 172 条发布记录。
- 其中 82 条包含 `wjid` 附件并可下载 Excel；2019-04 及更早的大量记录只有元数据，没有可下载附件。
- 已下载并解析可获取的 82 期 Excel，范围为 `2019-05` 至 `2026-04`。
- 生成静态数据：
  - `periods`: 82
  - `totalRecords`: 541,830
  - `latestRecords`: 4,583
  - `historyFiles`: 4,583

### 前端加载优化

- 原实现启动时会加载全部 period JSON；全量数据下会一次读取 54 万条记录。
- 已改为首屏只加载 `manifest.json` 和 `latest.json`。
- 每个最新期材料生成一个 `public/data/histories/*.json` 文件。
- 用户选择材料时只懒加载该材料历史记录，用于趋势图和月份对比。
- `public/data/periods` 不再生成，避免静态数据重复膨胀。

### Node PATH

- 发现本机已安装 `fnm`，并已有默认 Node `v20.20.2`，但当前 shell 未应用 fnm 环境。
- 已将以下路径写入用户级 PATH：
  `C:\Users\banabann\AppData\Roaming\fnm\node-versions\v20.20.2\installation`
- 已新增 `.node-version` 锁定 `v20.20.2`。
- 当前 Codex 进程可能仍读不到新用户 PATH；新开的终端应可直接使用 `node` / `npm`。

### 需求

- 按接手建议推进 `sh-info-price` 项目。
- 接入上海市建设市场信息服务平台的数据源：
  - 材料信息价：`bmCode=003002`
  - 建筑劳务信息：`bmCode=003003`

### 接口分析

- SPA 页面入口：
  `https://ciac.zjw.sh.gov.cn/JGBXMGCZJInterWeb/pc/#/HyxxHynr?bmCode=003002`
- 前端实际接口基础路径：
  `https://ciac.zjw.sh.gov.cn/JGBXMGCZJInterWeb/interWeb`
- 已确认接口：
  - `POST /hyxx/getTree`
  - `POST /hyxx/getHyxxList`
  - `POST /currently/bdFileDownload`
- 材料信息价最新列表可通过 `getHyxxList` 取得，附件通过 `wjid` 下载。

### 修改

- 初始化本地 Git 仓库。
- 将 `scripts/fetch/fetch-shanghai-price.mjs` 从占位脚本改为真实下载脚本。
- 将 `scripts/parse/parse-excel.mjs` 从 ExcelJS `.xlsx` 解析改为 `xlsx` `.xls/.xlsx` 解析。
- 下载最近 6 期官方材料信息价 Excel 到 `data/raw`。
- 生成 `data/processed` 和 `public/data` 静态数据。
- 更新 `AGENTS.md` 接手说明。

### 数据结果

- 下载期数：`2025-11` 至 `2026-04`
- 最新期：`2026-04`
- 总记录数：27,947
- 最新期记录数：4,660

### 验证

- `node --check scripts/fetch/fetch-shanghai-price.mjs`
- `node --check scripts/parse/parse-excel.mjs`
- `node scripts/fetch/fetch-shanghai-price.mjs --months=6`
- `node scripts/parse/parse-excel.mjs`
- `node scripts/parse/generate-index.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/next/dist/bin/next build`
- `http://127.0.0.1:3000` 返回 200
- `/data/manifest.json` 和 `/data/latest.json` 返回 200

### 注意

- 当前机器的 `node` / `npm` 不在 PATH 中，本次使用 Codex runtime 内置 Node。
- `next build` 在 Windows 本机提示 SWC native 包不可用，但已回退 wasm 并构建成功。
- 建筑劳务信息接口已识别，抓取脚本支持 `--source=labor` / `--source=all`，但主站 MVP 当前仍只消费材料信息价记录。

## 2026-05-20

### 主站可用入口

- 配合 `H:\codex\personl web\solaris-wiki` 完成站内查询入口。
- 本项目继续负责真实数据抓取、Excel 解析和 `public/data` 静态数据生成。
- 主站新增轻量静态查询页，构建时复制本项目 `public/data`，挂载到 Solaris Wiki 的 `/sh-info-price/`。
- 该站内版本支持关键词检索、分页、材料历史趋势、两期价格对比和 CSV 导出。

### 构建说明

- 曾尝试为 Next.js 应用增加 `/sh-info-price/` 子路径静态导出准备：
  - `next.config.mjs` 支持 `NEXT_PUBLIC_BASE_PATH`、`SH_INFO_PRICE_STATIC_EXPORT=1`。
  - `lib/data-client.ts` 支持按 `NEXT_PUBLIC_BASE_PATH` 前缀读取静态数据。
- 当前本机执行 Next 静态导出时长时间停在启动阶段，未进入有效编译输出。因此主站本轮采用独立静态查询页复用数据的方式，避免阻塞站内可用目标。
