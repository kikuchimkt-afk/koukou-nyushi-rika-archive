# 高校入試 理科単元別アーカイブ

公立高校入試の理科大問を、学年・分野・年度・都道府県・単元で探し、画像で素早く比較できる講師向けアーカイブです。

## 公開構成

- Vercel: アプリ本体と軽量JPEGプレビュー
- GitHub Release: 印刷用の高解像度PDF
- `data/archive.generated.json`: 学年追加に対応する共通データ

PDFをVercelのビルドへ含めないため、今後、中2・中3を追加してもデプロイ容量を抑えられます。

## 開発

```powershell
npm install
npm run dev
```

ローカルURL: `http://127.0.0.1:3170`

## PDFからプレビューを再生成

`SOURCE_ROOT` 直下の `中1理科_化学物理_最終版`、`中1理科_地学生物_最終版` など、`中[1-3]理科_*_最終版` に一致するフォルダを読み込みます。

```powershell
$env:SOURCE_ROOT = 'C:\path\to\output\pdf'
$env:PDFTOPPM = 'C:\path\to\pdftoppm.exe'
npm run build-content
npm run check-content
```

生成物:

- `public/previews/<問題ID>/page-*.jpg`
- `data/archive.generated.json`
- `.release-assets/*.pdf`（Git管理・Vercel送信の対象外）

中2・中3も同じファイル名規則で追加できます。
