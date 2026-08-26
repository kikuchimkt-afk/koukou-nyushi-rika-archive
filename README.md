# SCIENTIA（スキエンティア）

公立高校入試の理科大問を、学年・分野・年度・都道府県・単元で探し、画像で素早く比較できる講師向けアーカイブです。

## 講師向け選定機能

- 問題カード／単体プレビューから候補を「選定付箋」に保存
- 付箋は同じブラウザに保持され、再読込後も選定状態を復元
- 複数問題の問題・解答用紙・正解・解説を、問題単位で連続プレビュー
- 選定した高解像度PDFを付箋順に結合し、1つのPDFファイルとして取得

PDF結合はブラウザのメモリ負荷を抑えるため、10題かつ合計120MBまでです。PDFは同一ドメインのID照合済みAPIから3MB単位で取得し、全ページを付箋順に直接結合します。ZIPは作成しません。

## 公開構成

- Vercel: アプリ本体と軽量JPEGプレビュー
- GitHub Release: 印刷用の高解像度PDF
- `data/archive.generated.json`: 学年追加に対応する共通データ

PDFをVercelのビルドへ含めないため、今後、中2・中3を追加してもデプロイ容量を抑えられます。

## 抽出・実装進捗

- [学年・分野・年度別の抽出・監査・実装状況](./docs/理科大問_抽出・実装進捗.md)

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
$env:RELEASE_TAG = 'pdfs-v2'
npm run build-content
npm run check-content
```

生成物:

- `public/previews/<問題ID>/page-*.jpg`
- `data/archive.generated.json`
- `.release-assets/*.pdf`（Git管理・Vercel送信の対象外）

再生成時は、現在の最終版PDFに対応しない古いプレビューとリリース用PDFを自動的に削除します。各PDFにはSHA-256由来の `contentVersion` を付与し、プレビュー・直接PDF・結合用APIのURLへ反映します。同じIDのPDFを同じReleaseタグ内で差し替えても、新しい内容版のURLへ切り替わります。

中2・中3も同じファイル名規則で追加できます。
