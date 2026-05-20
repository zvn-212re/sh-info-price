# Solaris Wiki 主站接入

## 推荐架构

信息价项目独立部署为完整 Next.js 应用，同时把 `public/data/` 作为正式静态数据源托管：

1. `sh-info-price` 负责页面、检索、趋势图和 `/data/*` 静态 JSON。
2. Solaris Wiki 主站只保留入口按钮，默认跳转到独立应用。
3. 主站内置的 `/sh-info-price/` 轻量工具只作为备用入口，数据从正式静态托管地址读取。
4. 不再依赖 GitHub raw 作为生产数据源。

默认地址：

```txt
应用入口：https://sh-info-price.vercel.app/
数据源：https://sh-info-price.vercel.app/data/
```

如果 Vercel 项目使用了不同域名，在主站构建环境设置：

```txt
SH_INFO_PRICE_APP_URL=https://your-domain.example/
SH_INFO_PRICE_DATA_BASE_URL=https://your-domain.example/data/
```

## 静态数据缓存

本项目的 `vercel.json` 对 `/data/*` 设置了：

- `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`
- `Access-Control-Allow-Origin: *`

这样主站和独立应用都可以跨域读取公开 JSON，浏览器首屏只加载 `manifest.json`、`latest.json` 和 `search-index.json`，单材料历史文件继续按需加载。

## 备用站内工具

Solaris Wiki 的 `scripts/build-price-app.js` 会继续生成 `/sh-info-price/` 备用工具，但默认不再复制完整 `public/data`，以免主站部署包重复携带大体积数据。

如需离线或本地完整预览，可在主站构建时临时启用：

```txt
SH_INFO_PRICE_COPY_LOCAL_DATA=1
```

启用后主站备用工具优先读本地 `/sh-info-price/data/`，失败时仍回退到正式静态数据源。
