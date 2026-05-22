# GitHub 趋势首页 Chrome 扩展

一个 Manifest V3 新标签页扩展，用来查看 GitHub 每日、每周、每月趋势榜，热门 AI/ChatGPT/算法/工具仓库推荐，以及自动汇总的周刊/月刊入口。

## 功能

- GitHub 趋势榜：日榜、周榜、月榜
- 热门仓库推荐：AI、ChatGPT、算法、工具
- 国内热搜聚合页
- 仓库详情抽屉：README 摘要、收藏、忽略
- 左侧快捷官网导航（支持手动编辑）

## 给普通用户：从 GitHub 下载 ZIP 并本地安装

1. 打开本仓库 GitHub 页面，点击 `Code` -> `Download ZIP`。
2. 解压 ZIP 到本地目录，比如 `github-trends-newtab-main/`。
3. 在该目录打开终端，执行：

```bash
npm install
npm run build
```

4. 打开 Chrome，进入 `chrome://extensions`。
5. 打开右上角 `开发者模式`。
6. 点击 `加载已解压的扩展程序`，选择刚刚构建出的 `dist` 目录。
7. 新开一个标签页即可看到扩展页面。

## 给开发者：本地开发

```bash
npm install
npm run dev
```

开发预览地址：

```text
http://127.0.0.1:5173/
```

## 构建与测试

```bash
npm test
npm run build
```

## 目录结构

- `src/App.tsx`：主页面 UI 与交互状态
- `src/background/serviceWorker.ts`：后台刷新与消息处理
- `src/lib/github.ts`：GitHub 数据抓取与解析
- `src/lib/hot.ts`：热搜抓取与解析
- `src/lib/readme.ts`：README 摘要提取
- `public/manifest.json`：Chrome 扩展清单

## 常见问题

- README 摘要提示 `403`：属于 GitHub API 限流，代码已内置 raw README 回退逻辑。
- 热搜为空：通常是网络或上游页面临时变动，可点击热搜页刷新按钮重试。
- 扩展无法加载：请确认选择的是 `dist` 目录，而不是仓库根目录。

## 许可证

[MIT](./LICENSE)
