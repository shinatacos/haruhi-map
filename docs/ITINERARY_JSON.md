# ChatGPT旅程JSON

「書き出し → ChatGPT旅程JSON」を会話の入力に渡し、同じIDを維持して編集を依頼できます。個人情報・認証情報は含めないでください。

```json
{
  "kind": "route-notebook-itinerary",
  "version": 1,
  "points": [],
  "events": [
    {"id": "ev_0194", "time": "07:05", "confidence": "計画", "source": "ユーザーの計画。公式ダイヤ未照合"}
  ]
}
```

`points` と `events` は必須です。既存IDは指定したフィールドを更新、新規IDは追加、省略IDは保持します。`trips` は任意です。実際のIDはエクスポートで確認してください。ID自体の変更は新規作成になります。

取り込み前に変更前後を表示します。既存行の変更はすべて競合候補として初期選択を外してあります。更新したい行だけ選択します。新規行は初期選択されます。依存する旅行・地点を選択しない場合は適用時の検査で拒否します。競合は行単位です。フィールド単位の調整はJSONを修正して再プレビューしてください。省略したフィールドは維持されます。取り込み前データは同じブラウザに1世代バックアップされます。

kindのない「全旅行JSON」は全置換の復元です。削除されるIDもプレビューに表示します。両形式とも最大10MB、重複ID、日付、HH:MM、数値座標、地点参照、旅行間参照、出典を検査します。未知の拡張フィールドは保持します。

新規旅行：`{id,title,startDate,endDate,budget,note}`。日程はYYYY-MM-DD、予算は0以上の数値（円）。新規地点：`{id,tripId,name,lat,lon}`。新規予定：`{id,tripId,plan,day,time,action,pointId}`。dayはMM/DDまたはYYYY-MM-DD、timeはHH:MMを1個。`pointId` は同じ旅行の地点IDかnull。既存旅行IDは `legacy` で、元データのtripId省略はこの旅行を表します。新規旅行ではtripIdを明示してください。

任意の地点属性：`category,works,area,address,precision,days,note,rule,source,visited,photo`。移動した座標は自動的に「手動調整（未検証）」へ変更します。写真は公開してよいhttp(s) URLのみ使用してください。

任意の予定属性：`order,category,note,status,confidence,source,travelMode,stayMinutes,cost`。orderは同時刻の順序です。タイムライン・地図の接続とも日付・時刻順です。滞在予定分と費用は0以上の数値。移動手段は直前の地点からこの予定までを表し、unspecified / walking / transit / hankyu / jr / hanshin / subway / bus / driving / bicycling を使用できます。

confidenceは通常「計画」または「要確認」。公式ダイヤ・実測にはsourceが必要です。sourceには公式URL、対象日、照合日、または測定方法を記録してください。これらは入力者の申告であり、アプリは出典を自動検証しません。ChatGPTの提案やGoogle検索リンクを公式時刻表の検証済み情報として扱わないでください。所要時間は推定を含み、地図の直線から算出しません。

差分JSONで日付・時刻を変更し、confidenceを省略した場合は「要確認」に戻します。古いsourceは履歴として保持します。再照合した場合はconfidenceとsourceを明示してください。ローカル編集でも、公式ダイヤ・実測の時刻を変えて同じ出典を残した場合は「要確認」に戻します。

旅行設定の任意項目 `defaultPlan` で初期表示する旅程案を指定できます。旅程名や作品別の色は汎用ロジックに固定しません。

機械可読の差分エンベロープは [itinerary.schema.json](itinerary.schema.json)。実際の参照整合性・部分更新後の検査は `lib/route-core.js` が担当します。
