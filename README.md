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

Importでは、保存前にJSONの形式、フォルダーの循環、繰り返し数などを確認します。ファイルは10MBまで、単語の繰り返しは1〜100回までです。不正なデータは読み込みを中止し、現在のデータを保持します。

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
npm run test:security
npm run build
npm run preview
```

本番ビルドは `dist/` に生成されます。GitHub Pagesは `main` ブランチの `docs/` を公開するため、公開時はビルド結果を `docs/` に反映します。

セキュリティテストはNode.js 22.6以降で実行できます。依存関係の確認には `npm audit` を使います。今回の点検内容と確認範囲は [セキュリティ点検結果](セキュリティ点検結果_20261016.md) を参照してください。

## Google Analytics（GA4）

計測IDは `.env` に設定します。

```dotenv
VITE_GA_ID=G-XXXXXXXXXX
VITE_GA_ENABLE_DEV=false
```

`VITE_GA_ENABLE_DEV` は既定で `false` のため、ローカル開発中は計測を送信しません。公開リポジトリへ秘密情報を保存しないでください。

計測には件数・サイズ・固定の操作種別だけを渡し、カード／フォルダーのID、独自プリセット名、プロンプト本文は渡しません。計測URLのクエリ・ハッシュと参照元も除外します。Google Analytics自体は外部スクリプトとして動作します。無効にする場合はビルド時の `.env` に `VITE_GA_ID=` を設定してください。

## 更新履歴

[CHANGELOG.md](CHANGELOG.md) を参照してください。
