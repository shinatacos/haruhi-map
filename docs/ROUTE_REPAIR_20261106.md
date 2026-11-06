# Route Notebook 調査・修正記録（2026-11-06）

以下の「原因と修正」以降は前回セッションから引き継いだ調査記録。今回の開始時点では未コミットの変更が存在した。今回の再検証内容は次の追記に区別して記す。commit/push/公開操作は行っていない。

## 継続セッションでのレビュー・再検証

- AGENTS.mdと既存の追跡・未追跡差分を確認し、旧パッチは再適用していない。Downloadsや公開サイトに関する下記の調査は前回記録であり、今回再実施したものではない。
- 同時刻の予定でorderが片方だけ未設定の場合、Googleパネルが未設定値を0として先行させる不一致を追加修正。本体と同じ日付・時刻・両方が数値の場合のorder・ID順に揃えた。
- 区間選択を解除しても交通費メモのキーが以前の予定IDに残る問題を追加修正。出発地・目的地を手動変更した場合も区間セレクトを解除する。UIでメモの分離を回帰検証するアサーションを追加した。
- `tests/google_routes.test.cjs`を追加し、未設定orderと日付形式、時刻変更後の区間順、Googleリンクの引数を検証。既存13件と合わせてNodeテスト16件成功。
- `tools/check_data.py`、JS構文検査、`tools/build_seed.py`、`tests/test_patch_guard.py`、`tests/test_revision.py`を再実行し成功。`tests/test_browser.py`は同じrevisionテストへの互換入口である。
- 実ネットワークの`tests/test_google_routes.py`を再実行。1440/390/375/320px、横向きへの変更、日付・旅程切替、編集データの反映・保存、徒歩/公共交通リンクの実遷移、キーなし・無効キー、単体HTML、空旅行を検査。追加の区間解除テストを含む最終結果は`tests/artifacts/google-run.log`と`route-browser-report.json`に保存する。
- 320pxの地図とパネルのスクリーンショットを目視確認。横はみ出しがなく、OSM帰属表示を保持。実機スマホではなくChromeのビューポート検証。
- 今回の初回実通信検査ではOSM応答293件がすべて200、Refererあり。通常画面のコンソールエラーとページ例外は0。Google側の一部リクエストにERR_ABORTEDが記録されたが、8回のリンク遷移は完了。無効Embedキーの403と拒否文言を確認。有効キーの成功、元のOSM 403の原因・解消は確認していない。
- 地点・予定・旅行JSONとseedはHEADとの差分なし。60地点、旧193件＋SOS展改訂57件、座標確認14／概略46を保持。単体HTMLを再生成し、ローカルJS/CSSへの外部参照が残っていないことを確認した。
- Windowsの`python`と`py`は起動できなかったため、既存の`C:\Users\T\AppData\Local\Programs\Python\Python313\python.exe`を使用した。テスト用TEMP/TMPをリポジトリ内`tests/artifacts`に設定し、今回の作業でリポジトリ外のファイルは変更していない。
- 今回の追加変更は`google-route-panel.js`、`tests/test_google_routes.py`、新規`tests/google_routes.test.cjs`と本記録。全体の変更ファイルは末尾の一覧に加えて新規Nodeテストを含む。
- 最終の実通信ブラウザテストも終了コード0。区間選択解除による交通費メモの分離、手動変更時の選択解除を含めて成功。最終の`git diff --check`と正本JSON・seedの無差分確認も成功。

## 原因と修正

- GoogleパネルのgetCurrentDataは存在しないROUTE_CONFIG.ownerと127.0.0.1の組合せを必要としていた。本体はlocalhost等でも編集可能なため条件が一致せず、HARUHI_SEEDに戻っていた。app.jsのライブdbと選択中旅行・旅程・日付のスナップショットを読み取り、localStorageの再解釈を廃止した。現在の旅行の地点のみを候補にする。
- パネルの並びはorder優先、本体はtime優先だった。日付・時刻・順番・ID順に揃え、旧旅程と新旅程の区間一覧を本体と比較した。
- querySelectorのセレクター一覧は優先順を意味しない。先に出現するheaderにGoogleボタンが挿入されていた。mast-actionsを明示的に優先し、320pxでも折返すようにした。地点0件でも起動ボタンは残し、理由を表示する。
- 開始時のapp.jsには有効なL.polyline呼出しは既に無く、空ループとcheckedのshowRouteが残っていた。描画元の空ループ・チェックボックス・イベントを削除。routeLayerのclearLayersは維持。パネルに依存せず直線を描かない。KMLは従来どおり明記付き概略線であり、実経路ではない。
- 配布版apply_patch.pyは置換0件でも成功表示した。tools/apply_patch.pyに、未知のpolyline残存・確認できない0件・checked残存で書込み前に失敗する修正版を追加。Downloadsの原本は変更していない。今後利用するならリポジトリ内の修正版を使う。再実行成功、未知構文失敗、0件失敗、失敗時ファイル不変をテストした。
- 元のOSM URLは既にhttps://tile.openstreetmap.org/{z}/{x}/{y}.png、metaのReferrer Policyもstrict-origin-when-cross-originだった。タイル画像にも同ポリシーを明示。通信失敗時の案内、file直接表示の案内を追加。タイルへのキャッシュ回避パラメーターやアクセス制限回避は追加していない。
- ResizeObserverをrequestAnimationFrameでまとめ、非表示寸法では無効化処理をしない。resize・orientationchangeでもinvalidateSizeする。既存の地図タブ表示後のfitは維持。
- styles.css、本体JS、seed、core、Google関連すべてにv=20261106-2を付与。公開サイトは調査時点で旧参照だった。古いHTML自体のキャッシュが消えることまでは保証しない。
- build_seed.pyはGoogleのJS/CSS/configを単体HTMLに含めず、URLのクエリー付きにも対応していなかった。全ローカルアセットを埋め込み、置換数が1でなければ失敗させるよう修正した。
- キー未設定ならiframeを作らず、API有効化・キー・請求先・HTTPリファラー許可の条件とGoogle Maps URLsによる代替操作を示す。file://ではiframeを作らない。外部iframeの成功判定は同一生成元制約のためサイト側では保証できない。

## 検証

- 実際のインストール済みChromeをPlaywrightからheadless起動。ダミータイルやダミーGoogle画面への置換なし。実ネットワークのOSM画像とGoogleマップを表示した。
- 1440、390、375、320pxで地図・区間選択・徒歩/公共交通のリンククリック・タブ切替・日付切替を検証。スマホ幅では横向き844pxへの変更と縦向き復帰も検証。これはブラウザのビューポート変更であり実機スマホ検証ではない。
- 地図は全幅でタイル画像の実ロードを確認、横はみ出しなし、経路polylineなし。OSM応答は200。HTTP/HTTPSではRefererあり、file直接表示ではRefererなしだった。
- 旧旅程と新旅程の全日程区間順序をRouteCore.segmentsと比較。UIで編集した地点がパネルと実リンクに反映され、再読込後にも保持。新規空旅行でseedに戻らないことを確認。
- Google Maps URLsのapi=1、travelmode=walking/transit、出発地・目的地と実遷移先を検査。Google側の描画完了を待って画面を保存。運賃・時刻・候補の自動取得、スクレイピング、経路API呼出しは実装していない。
- 無効テストキーでは実Google iframeが403と「The provided API key is invalid」を返した。未設定時はiframeなしと代替リンクを確認。有効キーを使った成功検証は未実施。
- tests/test_revision.py: 編集、保存、追加削除、各種書出し、復元、差分取込競合、バックアップ、実マーカードラッグ、モバイル日付、公開閲覧専用を検証済み。公開オリジン模擬部分は従来のテストであり、実ネットワーク検証とは別。キャッシュ用クエリーをファイル名として扱うテスト側の不具合を修正した。
- node --test tests/route_core.test.cjs: 13件成功。node --check、py tools/check_data.py、git diff --check成功。
- data/points.json、schedule.json、trips.json、再生成seed.jsは差分なし。60地点、旧193予定、新57予定、宿泊・時刻・IDを保持。ユーザーが普段使うブラウザの保存領域には触れていない。ブラウザ検証は専用の一時コンテキストで実行した。

## 未解決・限界

- 地図403は修正前HEAD、file直接表示、既存公開サイトのいずれでも今回再現せず、すべて200だった。ユーザー環境の403の原因は未特定。Referer欠落や拡張機能等は候補であり確定原因ではない。再発時は該当タイルの応答・Referer・利用URLを検査する必要がある。
- 有効なEmbed APIキー・請求先・許可リファラーは提供されていないため、認証済み埋め込みは検証できていない。課金設定をこちらで追加していない。
- 公開反映は未実施。既存の公開用PowerShellによる反映後の本番再検証は別途必要。
- スマホ実機・ユーザー自身の既存ブラウザプロファイルは未検査。データが保持される設計と専用ブラウザでの回帰検証であり、既存保存内容を直接確認したものではない。

## 変更ファイルと証跡

app.js、index.html、styles.css、google-route-panel.js、google-route-panel.css、tools/build_seed.py、tools/apply_patch.py、tests/test_revision.py、tests/test_google_routes.py、tests/test_patch_guard.py、本記録。

data/seed.jsとharuhi_map_editor_standalone.htmlを正規生成。seedは同一内容。単体HTMLはgitignore対象。

tests/artifacts/route-browser-report.json（実通信・リンク先・コンソール・各幅寸法）、before-and-published.json（修正前/公開比較）、map-*.png、panel-*.png、google-*.png、embed-rejection.png、revision.logを参照。artifactsはgitignore対象。

再実行: py tests/test_google_routes.py / py tests/test_patch_guard.py / py tests/test_revision.py / node --test tests/route_core.test.cjs

参照: https://operations.osmfoundation.org/policies/tiles/ 、https://developers.google.com/maps/documentation/embed/get-started 、https://developers.google.com/maps/documentation/embed/get-api-key
