# ORC Viewer

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-orc-viewer/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-orc-viewer/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-orc-viewer/)

[English README](README.md)

Apache ORCファイルを外部へアップロードせず、スキーマ・ストライプ・列統計・メタデータ・圧縮方式・データをブラウザ内だけで確認できる単一HTMLビューアです。

## 🚀 デモ

### [GitHub PagesでORC Viewerを開く](https://ttomohisa.github.io/htmlapps-orc-viewer/)

GitHub Pagesから最初のHTMLを読み込んだ後、選択したファイルは端末内で読み込み・処理されます。アプリからファイル内容を外部サーバーへアップロードしません。

[![ORC Viewerの画面](assets/screenshot.png)](https://ttomohisa.github.io/htmlapps-orc-viewer/)

## 主な機能

- **ORCの末尾情報から確認** — PostScript / Footerを先に読み、行データを展開する前にファイル構造を確認します。
- **Schema・Stripe・列統計を確認** — ネストSchema、Stripe構成、圧縮方式、Metadata、ファイルレベルのColumn Statisticsを確認できます。
- **現在ページに必要なStripeだけデコード** — ORC全体を一度にメモリへ展開せず、現在ページに重なるStripeだけ読み込みます。
- **ネスト値を確認** — Primitiveに加え、Readerが対応するstruct / list / map / unionを確認できます。
- **一般的な圧縮方式に対応** — NONE / ZLIB / SNAPPY / LZ4に対応し、ブラウザにデコーダーがある場合はZSTDも利用します。
- **現在ページを確認・出力** — Table / Record、表示列、現在ページソート、Cell Inspector、CSVコピー／保存に対応します。
- **ファイルごとに状態を分離** — 壊れたORCがあっても他ファイルは開き、エラーや表示内容は別タブへ残りません。

## すぐに使う

### Webで使う

[デモを開く](https://ttomohisa.github.io/htmlapps-orc-viewer/)だけで利用できます。インストールやアカウント登録は不要です。

### 単一HTMLをダウンロードして使う

1. リポジトリから [`dist/index.html`](https://github.com/ttomohisa/htmlapps-orc-viewer/blob/main/dist/index.html) をダウンロードします。
2. 最新のChromiumベースブラウザ、Firefox、Safariで直接開きます。

`dist/index.self-extract.html` も収録しています。こちらはブラウザ内で可読版HTMLを復元してから起動するSelf-extract版です。

### ローカルでビルドする

1. このリポジトリをダウンロードまたはクローンします。
2. Windowsで `build-standalone.bat` をダブルクリックします。
3. `dist/index.html` と `dist/index.self-extract.html` が生成され、単一HTMLとして検証されます。
4. 生成されたHTMLを端末上で直接開きます。

Python、Node.js、ローカルWebサーバーは不要です。Windows PowerShellと標準の `tar.exe` を使用します。

## 使い方

1. `.orc` ファイルを1つ以上追加します。
2. 行数、圧縮方式、Stripe数、Metadata、Column Statisticsを確認します。
3. SchemaをTree / Rawで確認します。
4. ページ操作でレコードを確認します。現在ページに必要なStripeだけデコードされます。
5. Table / Recordを切り替え、ネスト値はCell Inspectorで確認します。
6. 現在ページをCSVとしてコピーまたは保存します。

## GitHub Pagesで公開する

このリポジトリには、単一HTMLをビルドして `dist/` をGitHub Pagesへ自動公開するワークフローが含まれています。

1. リポジトリ名を `htmlapps-orc-viewer` としてGitHubへプッシュします。
2. **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択します。
3. `main` ブランチへプッシュするか、Actions画面から **Deploy standalone app to GitHub Pages** を手動実行します。
4. ビルド成功後、`https://ttomohisa.github.io/htmlapps-orc-viewer/` で公開されます。

`main` へのプッシュ時にはリポジトリ検査、単一HTMLの再生成、検証を行い、GitHub Pagesが有効な場合に確認済みの `dist/` を公開します。

## 開発とビルド

```text
.
├─ src/index.template.html       # アプリ本体のテンプレート
├─ app.config.json               # アプリ情報・バージョン・ビルド設定
├─ dependencies.json             # 実行時依存の宣言
├─ dependencies.lock.json        # 依存ロック情報
├─ build-standalone.bat          # Windows用ビルド入口
├─ build-standalone.ps1          # 単一HTMLビルダー
├─ scripts/check-repository.ps1  # リポジトリ／ビルド検査
├─ dist/index.html               # 可読版の単一HTML
├─ dist/index.self-extract.html  # Self-extract版の単一HTML
└─ .github/workflows/
   ├─ build-standalone.yml       # ビルド検証
   └─ deploy-pages.yml           # GitHub Pages自動公開
```

### ビルドと検査

```bat
build-standalone.bat
```

リポジトリ検査だけを直接実行する場合：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-repository.ps1
```

ビルド／検査では、依存ロック、未置換プレースホルダー、実行時通信の制約、単一HTML生成、Self-extract版の生成・復元検証などを確認します。

## プライバシーと通信防止

生成された単一HTMLには `connect-src 'none'` を含むContent Security Policyがあります。選択したファイルはブラウザのFile APIで読み込まれ、端末内に留まります。アプリはAnalytics、Telemetry、外部API、実行時CDNを必要としません。

GitHub Pages版では最初のHTML配信だけ通信が発生します。その後、選択したファイルはアプリ内でローカル処理されます。ネットワークを完全に切って使う場合は `dist/index.html` を直接開いてください。

ORC Readerは公開されているApache ORCファイル形式仕様をもとに実装しています。Apache ORCはApache Software Foundationのプロジェクトで、本ツールは独立したViewerです。

## 制限事項

- 閲覧専用です。ORCファイルを編集・再生成する機能はありません。
- LZO解凍には対応していません。
- ZSTD対応はブラウザ機能に依存します。
- CSV保存はファイル全体ではなく現在ページが対象です。
- SQL / Query EngineではなくViewerです。

## 依存関係

ORC Viewer v1.0.0 は、実行時のサードパーティJavaScriptライブラリを同梱していません。

形式・プロジェクトに関する補足は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を確認してください。

## コントリビューション

バグ報告や機能提案はGitHub Issuesからお願いします。開発への参加方法は [CONTRIBUTING.md](CONTRIBUTING.md) を確認してください。

## ライセンス

Copyright © 2026 ttomohisa

このプロジェクトは [MIT License](LICENSE) で公開されています。
