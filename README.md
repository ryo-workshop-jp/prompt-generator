# Prompt Generator

正式版 v1.0.0（2026-10-16）。今回の公開をバージョン1の起点とします。

Stable DiffusionやComfyUIなどの画像生成AI向けに、カードを組み合わせてプロンプトを作成するブラウザーツールです。

主な対象はPCでのComfyUI向け作業です。スマートフォン対応は今後検討し、当面はPCでの表示・データ保存・生成指示JSONの信頼性を優先します。

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
npm run test:functional
npm run build
npm run preview
```

本番ビルドは `dist/` に生成されます。GitHub Pagesは `main` ブランチの `docs/` を公開するため、公開時はビルド結果を `docs/` に反映します。

セキュリティテストはNode.js 22.6以降で実行できます。依存関係の確認には `npm audit` を使います。今回の点検内容と確認範囲は [セキュリティ点検結果](セキュリティ点検結果_20261016.md) を参照してください。

## 画面サイズの検証

PCではフォルダー欄を常時表示し、幅1024px未満ではメニューボタンから開閉します。幅1280px未満ではポジティブ／ネガティブを縦に並べます。高さが小さい画面でもスクロールして各操作に到達できます。

実ブラウザーで13種類の画面寸法と主要モーダルを確認する手順です。まず別のターミナルでテスト用サーバーを起動します。

```powershell
npm run dev -- --host 127.0.0.1 --port 5186 --strictPort
```

普段のブラウザーと分離したテスト専用セッションで実行します。CLIは `npx` から利用するため、プロジェクトへの依存追加は不要です。

```powershell
npx --yes --package @playwright/cli playwright-cli -s=layout-check open http://127.0.0.1:5186/prompt-generator/ --browser msedge
npx --yes --package @playwright/cli playwright-cli -s=layout-check run-code --filename scripts/画面サイズ検証.js --raw
```

結果の `failures` と `pageErrors` が空であることを確認します。Chromeでは別セッション名と `--browser chrome` を指定します。長文の確認用に `scripts/長文表示検証.js`、スマートフォン相当のセッション用に `scripts/タッチ操作検証.js` も用意しています。長文検証はテストセッション内の保存データを置換するため、必ず専用セッションで実行してください。

確認した不具合、検証条件、未確認の環境は [画面サイズの検証結果](画面サイズ検証結果_20261016.md) に記載しています。

## PC向け機能の検証

保存・編集・取り消し、コピー履歴、お気に入り、装飾、Import／Export、ComfyUI向けJSONを実操作で検証できます。

```powershell
npx --yes --package @playwright/cli playwright-cli -s=pc-functional open http://127.0.0.1:5186/prompt-generator/ --browser msedge
npx --yes --package @playwright/cli playwright-cli -s=pc-functional run-code --filename scripts/PC機能検証.js --raw
```

前述のテスト用サーバーを起動し、必ず専用セッションで実行してください。このスクリプトはセッション内の保存データを検証用データへ置換します。クリップボードはテスト用実装へ差し替えるため、OSのクリップボードを変更しません。

通常のデッキExportには保存先フォルダーとその親を含めます。古いデッキ単体JSONで保存先が見つからない場合は、確認画面で説明したうえでrootへ配置します。コピー失敗時は完了表示・履歴登録をせず、理由を案内します。

修正内容と確認範囲は [PC機能の点検結果](PC機能点検結果_20261016.md) を参照してください。

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
