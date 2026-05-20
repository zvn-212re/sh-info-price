# 主站集成准备

目标主站：`H:\codex\personl web\solaris-wiki`

当前已采用的站内集成方式：

1. 本项目继续作为独立 Next.js 应用维护源码、抓取脚本、解析脚本和 `public/data` 静态数据。
2. 主站 `Solaris Wiki` 使用 `tools/sh-info-price/` 中的轻量静态查询页。
3. 主站构建脚本 `scripts/build-price-app.js` 会从本项目复制 `public/data` 到主站输出目录：
   - `dist/sh-info-price/data`
   - 本地预览目录 `sh-info-price/data`
4. 主站首页、项目列表和项目详情按钮都指向 `sh-info-price/`。

这种方式让价格查询在主站可用，同时不把完整 Next.js 源码塞进主站目录。

后续如果需要恢复为独立应用外链，推荐集成方式：

1. 本项目作为独立 Vercel 应用部署，获得完整访问地址。
2. 主站项目页增加一个“上海信息价数据库比对系统”项目卡片。
3. 卡片内展示静态截图或 iframe 预览。
4. 卡片按钮跳转到完整 Vercel 地址。

建议主站外链配置：

```html
<a href="https://your-sh-info-price.vercel.app" target="_blank" rel="noopener">
  打开完整版本
</a>
```

如果需要内嵌预览，建议使用：

```html
<iframe
  src="https://your-sh-info-price.vercel.app"
  title="上海信息价数据库比对系统预览"
  loading="lazy"
></iframe>
```

注意：

- 完整系统不要直接塞进主站目录，避免主站静态结构和 Next.js 构建产物互相污染。
- 主站只负责展示入口和预览。
- 本项目独立维护数据更新、构建和部署。
