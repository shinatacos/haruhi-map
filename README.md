# Route Notebook — 地図と時刻表で旅を記録

**日別タイムラインと地図を並べて使う旅行ノート**。最初の旅行として、ハルヒ＋ゆずソフト作品＋鉄道＋SOS展の60地点・250予定を保持しています。旅行を追加して別の旅にも使えます。日本語UI、スマートフォンの日付・地図切替、ホテル・鉄道・観光・食事・イベントのアイコンに対応しています。

## 使い方（いちばん簡単）

1. 公開GitHub Pages、または生成した `haruhi_map_editor_standalone.html` を開いて閲覧。
2. 左上で **「SOS展改訂」** または **「旧旅程」** を選び、日付を選択。
3. 公開URLでも端末内で編集できます。ピンまたは予定をタップして編集。地点編集の「地図でドラッグ」「地図をタップして位置指定」「Google Maps URL」で位置を修正できます。
4. 変更内容はこのブラウザに自動保存。**Codexで編集したい場合や別端末に移す場合は、必ず「書き出し → 全旅行JSON（バックアップ）」を保存してください。** 旧版の「エクスポート → 編集用JSON」も読み込めます。

Leaflet 1.9.4はライセンス付きで同梱しています。OpenStreetMapタイルの表示にはネット接続が必要です。実経路・Googleログイン・同期の設定とテスト結果は [改修記録](docs/IMPLEMENTATION_20261106.md) を参照してください。外部サービスは初期状態では未接続です。

## Codexで編集する（Windows / PowerShell）

1. ZIPを展開し、**展開したフォルダ全体**をCodexの作業フォルダとして開く。
2. `CODEX_TASK.md` をCodexに読ませる（最初に `AGENTS.md` も読ませる）。
3. 例：`「AGENTS.md と CODEX_TASK.md に従い、11/20の巡礼順を徒歩経路を優先して並べ直して。元の計画も残して」`
4. 変更後、PowerShellで以下を実行。

```powershell
python tools\check_data.py
python tools\build_seed.py
node --check app.js
node --test tests/route_core.test.cjs
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8000/` を開く。終了は PowerShell 側で `Ctrl+C`。Windowsでpythonの実行エイリアスが使えない場合は、インストール済みPythonのフルパスを使用してください。

Pythonがなくても `haruhi_map_editor_standalone.html` は単体で開けます（ネット接続必要）。

**注意：** ソース更新とブラウザ編集は同期しません。保存キー `haruhi-pilgrimage-map:v1` を継続使用し、既存の編集を優先します。localStorageはプロトコル・ホスト名・ポートごとに別です。旧版を使っていた同じURLからJSONをバックアップし、新しいURLで読み込んでください。Codexがユーザーのブラウザ保存を直接読めるわけではありません。読み込めない旧保存データは自動上書きを停止し、置換前バックアップとして取り出せます。

## 公開版と編集権限

公開版もブラウザ内のコピーを編集・保存します。Google認証を設定すると、本人のFirestoreドキュメントに保存・別端末から取り込めます。初回のクラウド保存・取込は明示操作、自動同期は初期状態OFFです。ログアウトしても端末の編集内容は残るため、共用端末ではJSONを退避して端末データを管理してください。リポジトリやPagesへの書込は行いません。共有公開データの変更はGitHubの権限で管理されます。

公開する更新はJSONをレビューして正本へ反映し、seed再生成・検査後に通常のGitHub管理手順で行います。アプリはcommit/pushを実行しません。ホテル・旅程は公開できますが、実名・メール・認証情報などは追加しないでください。robotsとmetaのnoindexは検索除外の依頼であり、アクセス制限ではありません。

## ファイル

- `index.html` ... 開発用アプリの画面
- `styles.css` ... レイアウトとデザイン
- `app.js` ... 編集、検索、地図、保存、書き出し
- `data/points.json` ... 60地点の編集可能なデータ
- `data/schedule.json` ... 250件の分刻み行程
- `data/seed.js` ... 上記JSONをブラウザへ読み込む自動生成ファイル
- `data/trips.json` ... 旅行設定。最初の旅行と宿泊・公開予定メモ
- `lib/route-core.js` ... 旅行固有データから独立した検証・マージ・URL・KML処理
- `docs/ITINERARY_JSON.md` / `docs/itinerary.schema.json` ... ChatGPT差分JSON仕様
- `tools/build_seed.py` ... データとコードから単独HTMLを再生成
- `tools/check_data.py` ... データの整合性を検査
- `haruhi_map_editor_standalone.html` ... ダブルクリックで開ける単一HTML
- `AGENTS.md` ... Codex向けの指示・安全基準
- `CODEX_TASK.md` ... Codexに貼り付ける初回指示

## できること

- ピン60地点の追加・削除・編集・ドラッグ移動
- 旧旅程193件 / SOS展改訂旅程57件を日付ごとに表示
- 行動の時間、日付、作品関連地点、メモ、訪問状況を編集
- ピンからGoogleマップ検索を開く
- 連続する地点ごとの徒歩・公共交通Google Mapsリンク（APIキー不要）
- 編集をブラウザ内に保存し、編集用JSONでバックアップ・読み込み
- My Maps向けCSV / KML、GIS向けGeoJSON、時刻表CSV出力

## 正確性について

元の60地点のうち**14地点は公表資料などで座標確認され、残る46地点は周辺を示す概略ピン**です。「ハルヒ坂」の細かな撮影角度・住宅地・踏切位置を保証するナビではありません。鉄道や徒歩の移動時間も計画値を含み、当日の公式ダイヤとの照合は別途必要です。地図は取得した実経路形状だけを描き、未取得時に直線を代用しません。KMLは地点のみを書き出します。

当日、学校や施設の公開・撮影条件に従ってください。OSM地図の著作権表示を保持しています。

## データの由来

2026年11月の旅行に関する会話で作成した巡礼マップから、地点60件と予定250件を移植しました。旧旅程と改訂旅程を分けて保持しています。

- https://souljem.hateblo.jp/entry/2026/02/17/015600
- https://souljem.hateblo.jp/entry/2026/03/03/022356
- https://souljem.hateblo.jp/entry/2026/03/11/022218
- https://l-tike.com/event/mevent/?mid=793521

## 改善版の補足

JSON読み込みは重複ID・座標・時刻・参照先を検査します。ChatGPT差分JSONは変更前後のプレビューと行ごとの競合選択に対応し、省略IDを削除しません。全旅行JSONは復元用の全置換です。読み込み／初期化直前のデータはブラウザに1世代保存し、「書き出し → 置換前バックアップJSON」で取り出せます。時刻の出典・確認状態を編集・CSV出力できます。公式ダイヤと実測は出典必須ですが、アプリが出典の内容を自動検証するわけではありません。

主地図はOSM＋自己管理Valhallaの実経路表示です。Googleパネルは公式Embed（任意キー）・URL検索の補助機能です。Google Routesの座標をOSMへ転用せず、スクレイピングも行いません。有料API・Cloudプロジェクト・課金は有効化していません。Googleの料金・表示条件は [調査と設定手順](docs/IMPLEMENTATION_20261106.md) に記載しています。

ブラウザ回帰テストは `python -m pip install playwright` 後に `python tests/test_revision.py` と `python tests/test_services_browser.py`。Chromeのパスは環境変数 `CHROME_PATH` で指定できます。追加テストの経路・認証応答は明示したフィクスチャです。本番Google認証・Firestoreルールのデプロイ・日本のGTFS接続・公道との座標照合・公式ダイヤ照合は未実施です。
