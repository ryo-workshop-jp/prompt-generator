# Prompt Generator

Stable DiffusionやComfyUIなどの画像生成AI向けに、カードを組み合わせてプロンプトを作成するブラウザーツールです。

公開版: https://ryo-workshop-jp.github.io/prompt-generator/

## 主な機能

- フォルダーとカードによるプロンプト整理
- ポジティブ／ネガティブプロンプトの組み立てとコピー
- お気に入り、品質テンプレート、装飾テンプレート、コピー履歴
- ComfyUI向け指示JSONの作成
- 複数ジョブ、画像枚数、サイズ、steps、cfg、sampler、schedulerの設定
- ブラウザー内データのExport／Import

データはブラウザーのローカルストレージに保存されます。別のPCやブラウザーへ移す場合は、設定画面の「全データ」からExport／Importしてください。

## ローカル起動

Node.jsとnpmを用意し、次のコマンドを実行します。

```powershell
npm install
npm run dev
```

Windowsでは `launch_app.bat` からも起動できます。

## 確認とビルド

```powershell
npm run lint
npm run build
npm run preview
```

本番ビルドは `dist/` に生成されます。GitHub Pagesは `main` ブランチの `docs/` を公開するため、公開時はビルド結果を `docs/` に反映します。

## Google Analytics（GA4）

計測IDは `.env` に設定します。

```dotenv
VITE_GA_ID=G-XXXXXXXXXX
VITE_GA_ENABLE_DEV=false
```

`VITE_GA_ENABLE_DEV` は既定で `false` のため、ローカル開発中は計測を送信しません。公開リポジトリへ秘密情報を保存しないでください。

## 更新履歴

[CHANGELOG.md](CHANGELOG.md) を参照してください。
