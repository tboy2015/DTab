# Release Guide

This repository is a Chrome extension (Manifest V3).  
For each release, publish the built `dist` package as a GitHub Release asset.

## 1) Prepare

From repository root:

```bash
npm install
npm test
npm run build
```

Expected output artifact:

- `dist/`

## 2) Create Release ZIP

Use your target version (example `v0.1.0`):

```bash
zip -r github-trends-newtab-v0.1.0-dist.zip dist
```

## 3) Commit, Tag, Push

```bash
git add .
git commit -m "release: v0.1.0"
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

If the commit includes only release docs/process updates, use a suitable message such as:

```bash
git commit -m "docs: add release process"
```

## 4) Publish GitHub Release

### Option A: GitHub CLI (recommended)

One-time setup:

```bash
brew install gh
# 用带 repo + read:org scope 的 classic token 登录
echo <classic-token> | gh auth login --with-token
gh auth status   # 确认 Logged in
```

> token 在 https://github.com/settings/tokens/new?scopes=repo,read:org 生成。
> fine-grained token 创建 Release 需要 `Contents: Read and write`，但 `gh auth login`
> 还要求 `read:org`，classic token 一步到位更省事。

Publish (writes notes to a temp file, then creates the release with the zip asset):

```bash
gh release create v0.1.0 github-trends-newtab-v0.1.0-dist.zip \
  --title v0.1.0 \
  --notes-file RELEASE_NOTES_TEMPLATE.md   # 实际发布时改用本次版本的 notes
```

Verify:

```bash
gh release view v0.1.0 --json tagName,assets --jq '{tag:.tagName, assets:[.assets[].name]}'
```

### Option B: Web UI

1. Open repository -> `Releases` -> `Draft a new release`
2. Select tag: `v0.1.0`
3. Release title: `v0.1.0`
4. Copy text from `RELEASE_NOTES_TEMPLATE.md`
5. Upload asset: `github-trends-newtab-v0.1.0-dist.zip`
6. Click `Publish release`

## 5) Install Verification (ZIP consumer path)

After release, verify from user perspective:

1. Download release ZIP asset
2. Extract locally
3. Open `chrome://extensions`
4. Enable `Developer mode`
5. `Load unpacked` -> choose extracted `dist` folder
6. Open new tab and verify extension page loads
