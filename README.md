# 約分工房

分数カードゲーム × TRAIL ALTシステム × ランキング

## セットアップ
```bash
npm install
npm run dev
```

## GitHub Pagesにデプロイ
```bash
# 1. GitHubで yakubun-koubou リポジトリを作成

# 2. 初回プッシュ
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/ユーザー名/yakubun-koubou.git
git push -u origin main

# 3. デプロイ
npm run deploy

# 4. Settings → Pages → gh-pages ブランチを選択
# → https://ユーザー名.github.io/yakubun-koubou/
```

## 更新時
```bash
git add .
git commit -m "update"
git push
npm run deploy
```
