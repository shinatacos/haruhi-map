# Route Notebook 改修記録・外部設定（2026-11-06）

## 再調査（同日・今回の差分）

開始時の未コミット変更を保持し、AGENTS.md、作業差分、staged差分（なし）、履歴、ソースとテスト、本書を確認。originは通常のschannel接続で資格情報エラーになったため、コマンド単位でOpenSSLを指定してread-onlyの `ls-remote` を実行し、HEAD/mainともローカルの `f6fbde5` と一致することを確認しました。Git設定は変更していません。

`test_revision.py` は変更前の実ChromeでPASS。一方、並行実行した `test_startup.py` の通常HTTPケースで `Cannot read properties of undefined (reading 'getRows')` を検出し、続く単独実行では `[data-event]` の表示タイムアウトを検出しました。既存診断は成功したケースしかreportに追加せず、この2回の失敗時の通信情報は保存されませんでした。そのため、資産の取得失敗・DOM非表示・初期化失敗のどれが元のタイムアウト原因かは未確定です。後続の成功をもって解決とはしません。

今回の修正は診断のみです。`tests/test_startup.py` は待機前にreportを登録し、失敗時にもJSスタック・通信結果・スクリーンショット・HTMLを保持して例外を再送出します。`tests/test_revision.py` はJSスタックと失敗時の初期化状態・予定DOM数・表示状態・viewportを追加します。アプリ本体の既存例外対策を再実装せず、原因不明のまま待機時間延長・リトライ・skipは追加していません。

データ検査、JS構文検査6件、Node全22件、seed/単一HTML再生成、編集回帰（診断変更後も再実行）、サービス回帰、Google補助パネル回帰、patch guardはPASS。起動診断は上記の失敗後、最終の12回連続実行でも全ケースPASSしました。失敗時の証拠を取得できる形では再発せず、根本原因特定と修正は未完了です。Googleの無効Embedキーによる403は拒否を検証する既存テストであり、認証成功ではありません。経路・ログイン・クラウド同期のサービス回帰はフィクスチャです。実Valhalla/対象日GTFS、Firebase本番認証・Firestoreルール配備・端末間同期は引き続き未完成・未検証です。

JSON正本とseedのGit差分はなし。60地点・250予定、旧193/SOS改訂57、座標確認14/概略46を保持。ユーザー本人のブラウザ保存にはアクセスしていません。有料API有効化、データ初期化、commit、pushは行っていません。

## 継続調査（2026-11-06・今回の作業）

今回の開始時点では既に変更済み10ファイルと未追跡のサービス実装・Leaflet等がありました。以下の既存記録の「作業開始時のGit差分はなし」は前回作業の記述です。既存差分を保持して調査しました。JSON正本3ファイルは今回も変更せず、60地点、250予定（旧旅程193・SOS展改訂57）、座標確認14・概略46をデータ検査とNodeテストで確認しました。ユーザー本人のlocalStorageは取得・変更していません。

`tests/test_revision.py` の `[data-event]` 待機タイムアウトは、現作業ツリーでは変更前・変更後とも実Chromeで再現せず、全操作がPASSしました。既存差分でLeafletのCDN依存がローカル同梱へ置き換わっていますが、元の失敗時のログがないためCDNを根本原因と断定できません。確認できた初期化上の欠陥は、`filters(); initMap(); render();` で地図初期化が例外になると時刻表DOMの描画まで停止することです。`app.js` で地図初期化の例外を隔離し、部分初期化した地図を破棄、フォールバックを表示して時刻表・編集を継続するよう修正しました。元のタイムアウト原因の確定は未解決です。

追加した `tests/test_startup.py` は実Chromeで通常HTTP、地図初期化例外の注入、Leaflet取得失敗、外部通信遮断のfile単一HTMLを検証します。すべて予定DOMが表示され、60地点・250予定と編集ダイアログを保持してPASS。通常HTTPではJSエラーなし、観測したHTTP応答29件は200、初期範囲変更に伴うタイル要求中断12件も別に記録しました。注入した障害や遮断した通信を実サービスの障害とは扱いません。DOMの表示状態・通信・警告は `tests/artifacts/startup-report.json` に保存。`test_revision.py` にも初期待機失敗時のJSエラー・通信失敗・DOM・スクリーンショット出力を追加し、例外は再送出します。

今回の実行結果（テストのskipなし）：

- `tools/check_data.py`、6ファイルのJS構文検査、Node 22件、`tools/build_seed.py`、`tests/test_revision.py`、`tests/test_services_browser.py`、`tests/test_startup.py`、`tests/test_patch_guard.py`、`git diff --check` はPASS。
- `tests/test_google_routes.py` は初回ローカル資産の `ERR_CONNECTION_REFUSED` と `RouteNotebook` 未定義でFAIL。再実行は終了コード0、通常JS・consoleエラーなし、全4幅・単一HTML・空旅行・編集データ連携をPASS。初回の接続拒否の原因は未確定で、失敗を無かったことにはしません。
- Google Mapsの外部リンクは実通信で徒歩・公共交通の遷移を確認。無効EmbedキーへのHTTP 403は想定した拒否確認で、正常なAPI認証成功ではありません。`tests/artifacts/route-browser-report.json` に再実行結果を保存。
- 経路の徒歩・バス描画、候補選択、時刻変更での再取得、固定予定を動かさない挿入、パス期限・対象照合・交通追加支払、地点編集・Undo・永続化、同期競合とUID別保存はフィクスチャでPASS。鉄道形状の解釈はNodeテストで確認。実Valhalla・GTFSでの日本の徒歩／鉄道／バス経路取得は未検証です。
- 1440・390・375・320pxで地図の高さ、横はみ出し、日付切替を検証。320pxスクリーンショットも目視しました。実iOS／Android機での操作確認は未実施です。

残る機能制限：鉄道・バスの登録手段はいずれも `multimodal` 検索になり、鉄道のみ／バスのみの限定は未対応。予定挿入は前後の余裕から追加時刻を計算しますが、既存の可動予定を一括で移動する自動調整は未実装。パスの部分適用・自動運賃取得も未実装です。FirebaseはSDKフィクスチャでの検証のみで、実Googleログイン、デプロイ済みFirestoreルール、実端末間同期は未検証。利用可能な自己管理ルーター・GTFS・Firebase設定はこの作業では提供されていません。有料APIの有効化・契約・デプロイは行っていません。

今回追加・変更した対象は `app.js`、`tests/test_revision.py`、`tests/test_startup.py`、本記録と生成HTMLです。seedと単一HTMLはビルドで再生成しました。単一HTMLはGit ignore対象です。commit・pushは行わず親PowerShellでの操作に委ねています。

## 実装と保持したデータ

作業開始時のGit差分はなし。AGENTS.mdを確認し、`data/points.json`、`data/schedule.json`、`data/trips.json`は変更していません。60地点、250予定、旧旅程193件、SOS展改訂57件、座標確認14件・未確認46件を保持。ブラウザ保存キー `haruhi-pilgrimage-map:v1` も継続使用します。ユーザー本人のブラウザ保存はこの作業では取得していません。

公開HTTPSでも端末内編集を有効化しました。地点タップ→編集、ドラッグ、地図タップによる既存地点の移動・追加、数値座標、座標入りGoogle Maps URL、名称・住所・撮影位置メモ・説明・撮影ルール・出典、削除に対応。削除した地点を参照する予定は地点未割当として保持。移動した座標は未検証に戻します。短縮URL・施設名だけのURLの展開やスクレイピングはしません。URLの `@lat,lon` は施設の位置でなく地図中心の場合があるため位置確認が必要です。

保存直後にピン・予定を再描画し、経路再計算を予約。20件までの端末内履歴とUndo、JSONバックアップ、取込前バックアップを追加。容量不足時は履歴を減らし、本体保存を優先します。保存が失敗した場合は画面に表示します。履歴は端末内のみで同期しません。

## 実経路の使い方

「移動」→「実経路・Google同期設定」に、管理権限または継続利用許諾のある **ValhallaサーバーのベースURL** を入力し、確認チェック後に保存してください。例：ローカルの `http://127.0.0.1:8002` または自己管理の `https://router.example.org`。クライアントは `/route` に公式JSON形式でPOSTします。公開デモは初期設定に含めず、代表的なOSMデモURLは拒否します。外部ホストに送信するのは地点座標・日時・移動手段です。

サーバー側で必要なもの：

1. [Valhalla公式ビルド・運用手順](https://valhalla.github.io/valhalla/)に従ったインスタンスと、対象地域のOSMルーティングタイル。
2. 公共交通には、対象日付をカバーする利用許諾済みGTFSと、Valhallaの公共交通データ構築。**OSM道路データだけでは鉄道・路線バスは使えません。** 日本の全事業者・2026年11月の日付が網羅される保証はありません。
3. HTTPS公開、アプリのOriginを許可するCORS（POST・Content-Type）、サーバー側のレート制限とアクセス制御。端末の `localhost` はその端末自身です。PCとスマホ共用には到達可能な自己管理HTTPSが必要です。
4. 運用者負担のサーバー・データ更新。無料API利用料とサーバー運用費は別です。本改修ではサーバーを契約・起動していません。

選択中の旅程・日付（「全日程」も可）の同日内の連続する異なる割当地点を対象に、1件ずつ取得します。徒歩＝pedestrian、公共交通＝multimodal、自転車＝bicycle、車＝auto。レスポンスのpolyline6をデコードし、maneuverの形状範囲から徒歩は緑、鉄道は紫、バスは橙に分けて **既存の1枚のOSM地図** へ描画します。形状・モード情報の欠落、公共交通検索なのに徒歩のみの応答は未取得エラーです。直線で代用しません。KMLも地点のみです。

返された代替候補は選択可能。時間・距離・取得できた乗換回数・案内を表示し、運賃は未確認とします。時間はルーター算出の計画値であり、公式ダイヤ確認には変更しません。公共交通の検索出発時刻は「出発地の予定時刻＋滞在予定分」です。滞在分が未入力なら公共交通は取得を止めます。徒歩等は出発日時を指定せず経路形状・移動目安を取得します。元データには滞在分がないため、交通の検索には利用者の入力が必要です。時刻を推測で埋めていません。

Valhalla公式仕様では時刻依存検索の代替経路は未対応です。そのため日時指定のない道路検索でのみ代替候補を要求し、公共交通等の日時指定検索には `alternates` を送りません。公共交通の複数候補比較は本番機能として完成していません。プロバイダーが返した複数候補の表示処理と、徒歩の代替候補をテストしています。フェリー等の鉄道・バス以外の公共交通は灰色で表示します。

地点・訪問時刻・日付・順序・手段が変わると古いリクエストを取り消し、400ms後に再計算。キャッシュは端末メモリ内のみ（最大500区間）。変更した区間のキーは日時・座標・イベントID等を含みます。「再取得」でキャッシュを破棄します。画面を切り替えた際、古い取得結果が新しい選択へ混入しない世代チェックを行います。

仕様と制約の根拠：[Valhalla API](https://valhalla.github.io/valhalla/api/)、[route request/response公式仕様](https://github.com/valhalla/valhalla/blob/master/docs/docs/api/route/api-reference.md)。OSRMは道路向けで公共交通を一括して満たせず、OpenTripPlannerはGTFSによる公共交通の別候補ですが、今回の接続実装はValhallaです。

## Google Mapsの調査と課金防止

無料OAuthログインはGoogle Mapsの経路座標取得権限ではありません。Firebaseログイン処理からMaps APIを呼びません。

| 公式手段 | 利用範囲・条件 | 今回の扱い |
|---|---|---|
| Maps URLs | 外部Google Mapsへ経路検索を開く。座標応答APIではない | 補助リンクを維持 |
| Maps Embed API | 利用料無料・APIキーが必要。iframeを表示するがサイトから経路座標を読めない | 既存の任意キーの補助パネルを維持 |
| Routes API | APIキー/OAuth等に加えてMaps Platformの有効化・課金設定が必要。無料上限を超えると課金対象 | 呼出コード・有効化なし |
| Maps JavaScript API | Google主地図を構築可能。課金設定とSKU別利用管理が必要 | 未導入 |

[Google公式料金表](https://developers.google.com/maps/billing-and-pricing/pricing)には、Compute Routes Essentialsの月10,000、Proの月5,000、Enterpriseの月1,000件の無料上限が掲載されています。SKU判定は使用する機能によって変わります。料金表・条件は導入時に再確認してください。[Routes APIの公式課金・割当説明](https://developers.google.com/maps/documentation/routes/usage-and-billing)も参照してください。

[Google Routesの表示規約](https://developers.google.com/maps/documentation/routes/policies)では、地図上の結果表示にはGoogle Mapが必要です。OSM主地図へGoogleの経路座標を重ねる実装は採用していません。[Embedの公式無料利用説明](https://developers.google.com/maps/documentation/embed/usage-and-billing)の無料表示だけでは、全旅程の座標取得・同一主地図への描画・自動運賃取得は実現できません。

**料金発生を防ぐ現在の状態：Google Routes・Maps JavaScript APIを有効化しない／呼び出さない。Firebaseは請求先をリンクしないSparkのまま利用する。** キーなし・設定なしで有料Google APIへアクセスするコードはありません。任意のEmbedキーはGoogle Cloud側で **Maps Embed APIだけ** にAPI制限し、HTTPリファラーを本番URLと必要なlocalhostに限定してください。不要なAPIは無効にします。

将来Googleを主地図に変更する場合は、Cloud側のAPI別日次割当、サーバー側の月間ハード上限、SKU別件数管理を先に設けます。月の無料枠を日次枠だけで保証せず、他アプリの使用分も合算します。**予算通知は課金停止機能ではありません。** 今回は課金アカウントの接続・有料APIの有効化を一切していません。

## Google認証・端末間同期の設定

1. Firebaseプロジェクトを **Spark（請求先未リンク）** で作成。Blazeへ変更しない。Webアプリを登録。
2. AuthenticationのSign-in methodでGoogleを有効化。Authorized domainsへ実際のGitHub Pagesドメイン等を登録。ローカル検証する場合はlocalhostも確認。Google側の同意画面・サポートメール等を設定。
3. Cloud Firestoreを作成し、リポジトリの `firestore.rules` を **コンソールでデプロイ**。テストモードの公開ルールを使わない。別ユーザー・未認証アクセスの拒否をエミュレーター等で確認してから運用する。
4. FirebaseのWeb設定JSONをアプリの設定欄へ入力して「Googleログイン」。公式SDK 12.5.0をgstaticから遅延ロードします。サービスアカウント秘密鍵・OAuthクライアントシークレットを入力しないでください。Web設定は端末のlocalStorageだけに保存し、Gitには追加しません。公開可能なWeb APIキーでもAPI制限・ドメイン・ルールの設定は必要です。
5. 初回は「この端末をクラウドへ保存」または「クラウドを取り込む」。既存クラウドがある場合は、先に全旅行JSONで端末を退避して取り込み・必要なJSONマージを行います。自動上書きしません。
6. もう一台の端末で同じ設定・アカウントでログインし、「クラウドを取り込む」。自動同期をONにすると変更を2秒後にクラウド保存。別端末の更新は監視して通知し、取込は明示操作です。

保存先は `/users/{Firebase UID}/notebooks/main`。ルールは本人UIDだけに読書きを許可します。全旅行JSON、パス・新しい運賃台帳を1ドキュメントへ保存します（850KB上限）。履歴・経路キャッシュ・API設定・旧Googleパネルの台帳は含みません。旧Googleパネルの台帳は従来の専用JSON出力でバックアップしてください。

更新はFirestoreトランザクション内でrevisionを照合。競合・ネットワーク・容量・認証エラー時は自動同期を停止し、端末内編集は維持。取り込み前は端末JSONをバックアップします。ログアウト・アカウント変更時は自動同期と前ユーザーの監視を停止。ログアウトしても端末内のコピーは残ります。共用端末では他の利用者が端末内コピーを見られるため、端末データは別途管理してください。

Sparkの無料枠と上限は [Firebase料金プラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)、[Firestore割当](https://firebase.google.com/docs/firestore/quotas)を参照。読み書き・容量の無料上限を超えると利用制限があり、無料だから無制限ではありません。認証は [公式Googleサインイン手順](https://firebase.google.com/docs/auth/web/google-signin)、競合制御は [公式トランザクション仕様](https://firebase.google.com/docs/firestore/manage-data/transactions)に基づきます。

## 挿入・パス・費用

予定には固定/変更可能、営業時間、滞在分、乗換余裕分、費用区分を追加。未入力の営業時間・乗換余裕を既知扱いしません。空き時間挿入は、選択中の1日で隣接する予定の間を調べ、新地点への実経路と戻る実経路をその出発計画時刻で取得します。既存予定は固定指定の有無を問わず動かしません。比較可能な取得時間の増分が少ない候補から提示し、挿入前後・変更時間・料金差未確認を表示します。取得中に旅程が変わった場合は結果を無効にします。

パスは旅行別に名称・対象路線/区間・有効日・購入額・出典を登録。経路候補ごとに通常運賃と公式出典を入力し、「全乗車区間がパス対象」を手動照合した場合だけ追加支払0円。対象外・期限外は通常運賃、不明なら未確認。部分適用・区間外精算は自動計算できません。

速さ・安さ・パス活用で取得済み候補を比較。未確認運賃を最安扱いしません。徒歩/公共交通の組合せはルーターが返した候補の範囲です。日別に交通追加支払・入場・宿泊・その他費用・パス購入を表示します。旧費用はその他に維持し、交通費との重複がある場合は利用者が予定の費用区分を修正。未入力・未確認の金額を合計済みと偽らず「把握済合計」と表示します。

## 不具合対応

- Leafletをローカル同梱し、外部CDNの失敗で初期化が不安定になる依存を除去。ライセンスは `lib/leaflet-LICENSE`。
- OSMタイルは公式の `https://tile.openstreetmap.org/{z}/{x}/{y}.png`、著作権表示を保持。[OSM公式ポリシー](https://operations.osmfoundation.org/policies/tiles/)に従いRefererを消さず、`strict-origin-when-cross-origin` を使用。403にはReferer除去、拡張機能、file直開き、利用制限等の可能性があり、画面に案内を表示。403の全件を一つの原因と断定していません。大量取得・オフラインタイル取得はしません。
- 320pxでヘッダー・編集項目を折り返す。ResizeObserver、画面切替、向き変更でLeafletのサイズを再計算。
- ローカル資産のクエリ版を更新。Service Workerによる強制キャッシュは導入していません。更新直後に旧表示なら通常の再読み込みまたは強制再読み込みを行ってください。localStorageをキャッシュ対策で消さないでください。
- Google補助パネルは毎回現在のデータを参照し、選択区間の手段を反映。データ変更中に開いているパネルも再構築します。

## テストと未完了

実行コマンド（この環境ではWindowsのpythonエイリアスが使用不能のためPython313の実体を指定）：

```text
python tools/check_data.py
node --check app.js
node --check notebook-services.js
node --check travel-ledger.js
node --test tests/route_core.test.cjs tests/google_routes.test.cjs tests/routing_planner.test.cjs
python tools/build_seed.py
python tests/test_revision.py
python tests/test_services_browser.py
python tests/test_patch_guard.py
```

Nodeの22テスト、既存Chromium編集回帰、追加Chromiumの1440/390/375/320px検査を実施。追加テストは経路形状・徒歩/バス色分け・複数候補・時刻変更時の再取得・固定予定を保つ挿入・パス適用・URL座標・Undo・地図タップ・保存再読込・日付切替・認証設定エラーを確認します。Firebase SDKフィクスチャでログイン/ログアウト、UID別パス、クラウド保存/取込、競合停止も検証します。画像は `tests/artifacts/services-map-*.png` / `services-panel-*.png` に出力（Git対象外）。403案内のテストは意図的な403応答を使用しています。

最終結果：データ検査、6ファイルのJavaScript構文検査、Node 22件、既存編集回帰、追加サービス回帰、旧移行ツールのガード検査はすべてPASS。既存 `tests/test_google_routes.py` もPASSし、Googleパネルと編集中データの一致、単一HTML、空旅行、全4画面幅を確認しました。実通信で観測したOSMタイル応答は317件すべてHTTP 200、Refererあり、通常操作のJavaScriptエラーなし。元のOSM 403はこのHTTP環境では再現していないため原因確定とはしません。意図的な無効Embedキーの試験だけはGoogle側HTTP 403を確認しており、正常なGoogle API認証の成功とは扱っていません。`tests/artifacts/route-browser-report.json` に記録しています。

**未完了・外部設定待ち：**

- 自己管理Valhallaの起動、関西の対象日のGTFS投入と、日本の実徒歩/鉄道/バス全区間の本番取得。今回の経路テスト応答は合成フィクスチャであり実経路取得成功の証明ではありません。
- 日をまたぐ区間、地点未割当の予定、手段未指定の区間、公共交通で滞在分未登録の区間は自動経路を完成できません。元データを推測で補完していません。
- Google主地図への切替・Google Routes座標取得は未実装。課金・規約上の理由と無料手段の限界は上記の通り。
- Firebaseプロジェクト作成・Google認証の本番操作・Firestoreルールのデプロイ/エミュレータ検証・PCと実スマホ間の本番同期は未実施。テストのUID分離はクライアント保存先の検証であり、配備先ルールの検証とは別です。
- 営業時間・予約・運賃の外部自動収集、部分パス精算、全交通手段を横断する網羅的最安探索、既存の可動予定を動かす全体最適化は未実装。挿入候補は現時点の予定を動かさない局所比較です。日またぎ営業は別予定に分ける必要があります。
- スマホはChromeの実ブラウザで画面サイズを変更して確認。実iOS/Android端末でのタッチ・Google認証は未確認です。

## 変更ファイル

`app.js`、`index.html`、`styles.css`、`google-route-panel.js`、`lib/route-core.js`、`lib/route-engine.js`、`lib/travel-planner.js`、`notebook-services.js`、`travel-ledger.js`、`firestore.rules`、`tools/build_seed.py`、`tools/apply_patch.py`、`tests/route_core.test.cjs`、`tests/test_revision.py`、`tests/routing_planner.test.cjs`、`tests/test_services_browser.py`、`README.md`、本書、同梱Leafletと画像/ライセンス。`data/seed.js`と単一HTMLは生成処理で再生成（初期データ内容は同一）。commit/pushは実行していません。
