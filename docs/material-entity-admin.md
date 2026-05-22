# 材料实体索引与后台方案

## 当前数据流审查

项目不是在线写库后台。官网 Excel 先由 `parse-excel.mjs` 生成 `PriceRecord` JSON，
再由 `generate-index.mjs` 生成前端读取的静态索引：

- `latest.json` 保留最新期价格记录。
- `search-index.json` 现在保存 `MaterialEntity`。
- `histories/*.json` 保存某个材料实体实际匹配到的历史价格记录。

旧索引按解析阶段的 `materialKey` 建 history。`materialKey` 直接拼接编码、名称、
规格和单位，所以同一编码跨期名称写法变化时会被拆开。新索引把实体识别放到生成阶段：

1. 有稳定编码且未被拆分规则命中时，按编码聚合。
2. 无编码或需要解除编码合并时，按归一化名称、规格、单位聚合。
3. 不用名称模糊相似度直接做合并，避免 32.5 与 42.5 被误并。

## 实体模型

前端检索 `MaterialEntity`，展开和图表消费 `PriceRecord`：

- `MaterialEntity`: `id`, `code`, `displayName`, `normalizedName`, `spec`, `unit`,
  `aliases`, `recordCount`, `periodCount`, `latestPeriod`, `latestPrice`,
  `historyFile`。
- `PriceRecord`: 原始期数、原始名称、编码、规格、单位、含税价、来源文件。

趋势图只读取 history 文件里真实存在的期数。生成 manifest 时也会输出仅有 1 期和
2 期的实体数量，前端开发态拉 history 时会打印实体匹配诊断。

## 修正规则

第一阶段把修正落在 `data/rules`，重跑 `npm run build:index` 后进入静态数据：

- `aliases.json`: 为编码、实体 ID 或旧 `materialKey` 增加搜索别名。
- `corrections.json`: 覆盖 `displayName`, `normalizedName`, `spec`, `unit`, `aliases`。
- `material-merge-rules.json`: 手工合并实体，或把编码加入 `splitCodes` 解除错误合并。

示例修正项：

```json
{
  "entities": [
    {
      "code": "04010111",
      "displayName": "水泥32.5级",
      "normalizedName": "水泥32.5级",
      "spec": "",
      "unit": "t",
      "aliases": ["32.5水泥"]
    }
  ]
}
```

示例合并项：

```json
{
  "merges": [
    {
      "targetCode": "04010111",
      "sourceCodes": ["legacy-code"]
    }
  ],
  "splitCodes": ["code-needing-name-spec-unit-split"]
}
```

## `/admin` 可行性

当前静态部署适合先做管理草稿台，不适合直接在网页里改生产 JSON：

- `/admin` 已能搜索材料实体、查看历史记录、编辑修正草稿、草拟合并/拆分规则并导出 JSON。
- `NEXT_PUBLIC_ADMIN_PASSWORD` 可做开发阶段入口门槛，但它是浏览器可见配置，不是生产鉴权。
- 真正在线写入需要加服务端鉴权、审计和持久化层。可选路径是数据库存实体修正与导入批次，
  或保留规则文件并走受控提交/重建索引流程。
