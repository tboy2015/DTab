# GitHub 趋势首页 Chrome 扩展

一个 Manifest V3 新标签页扩展，用来查看 GitHub 每日、每周、每月趋势榜，热门 AI/ChatGPT/算法/工具仓库推荐，以及自动汇总的周刊/月刊入口。

## 开发

```bash
npm install
npm run dev
```

开发预览地址：

```text
http://127.0.0.1:5173/
```

## 构建扩展

```bash
npm run build
```

然后在 Chrome 中打开 `chrome://extensions`，开启开发者模式，选择 `dist` 目录作为 unpacked extension 加载。

## 验证

```bash
npm test
npm run build
```

扩展不需要 GitHub Token。遇到 GitHub 限流、网络失败或 GitHub Trending 页面结构变化时，首页会保留缓存并展示错误提示。
