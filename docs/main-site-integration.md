# 主站集成准备

目标主站：`H:\codex\personl web\solaris-wiki`

推荐集成方式：

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
