# 上海信息价数据库比对系统

用于抓取、解析和展示上海建设工程信息价 Excel 数据的静态优先 MVP。

## 当前能力

- 材料实体关键词查询与归一化模糊检索
- 单个材料真实历史价格趋势折线图
- 最多 5 个材料的价格走势对比与时间范围缩放
- 材料实体结果导出为 Excel
- 首页轻量更新日志，展示最近版本变化
- `/admin` 材料实体管理草稿台
- 上海建设市场信息服务平台材料信息价自动下载
- 官方 `.xls/.xlsx` 解析与静态 JSON 索引生成

## 当前数据

- 来源：上海市建设市场信息服务平台 - 人工，材料，机械信息价
- `bmCode`: `003002`
- 可下载 Excel：82 期
- 覆盖范围：`2019-05` 至 `2026-04`
- 总记录数：541,830
- 最新期记录数：4,583

官网列表共 172 条发布记录；2019-04 及更早记录目前只有元数据，未提供可下载 Excel 附件。

## 技术栈

- Next.js + React + TypeScript
- Recharts 图表
- 静态 JSON 数据文件
- `xlsx` 用于服务端 Excel 解析和浏览器端导出
- `fnm` + Node.js `v20.20.2`

## 开发

```bash
npm install
npm run dev
```

默认访问：

```txt
http://localhost:3000
```

## 数据目录

```txt
data/raw/            # 官网 Excel 原文件，本地可再生，默认不提交
data/processed/      # 解析后的标准化 JSON，本地可再生，默认不提交
data/rules/          # 别名、修正、合并/拆分规则，生成索引时应用
public/data/         # 前端直接读取的静态数据，需要提交
public/data/histories/ # 单材料历史趋势数据，按材料懒加载
scripts/fetch/       # 官网自动下载入口
scripts/parse/       # Excel 解析与索引生成入口
```

## 数据更新

下载官网可用的全部材料信息价：

```bash
npm run fetch:data -- --all
npm run parse:data
npm run build:index
```

只下载最近 6 期：

```bash
npm run fetch:data
```

生成新的 `public/data` 后提交到仓库，Vercel 会自动重新部署。

索引生成会先按编码聚合材料实体；无编码或被 `splitCodes` 拆分的记录，回退到
“归一化名称 + 规格 + 单位”识别。实体别名、字段修正和手工合并规则见
`data/rules` 与 `docs/material-entity-admin.md`。

## 主站集成

Solaris Wiki 当前把本项目作为独立应用入口，主站只保留卡片按钮和 `/sh-info-price/` 备用工具：

- 独立应用入口：`https://sh-info-price.vercel.app/`
- 正式静态数据源：`https://sh-info-price.vercel.app/data/`
- 主站路径：`H:\codex\personl web\solaris-wiki`
- 主站构建脚本：`scripts/build-price-app.js`

主站备用工具默认从正式静态托管地址读取 JSON，不再依赖 GitHub raw。若部署域名不同，在主站设置 `SH_INFO_PRICE_APP_URL` 和 `SH_INFO_PRICE_DATA_BASE_URL`。

## Codex 接手说明

项目级协作上下文写在 `AGENTS.md`。下次继续开发时，优先读取该文件，可快速恢复项目状态、技术路线和主站集成约定。
