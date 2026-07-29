# 設計 fix647 — scene_move sys 再設計（2026-07-29）

- 対象: `v292Dfix645-scene-move-shadow.js`（fix645本体を直接修正・内部番号 fix647）
- 位置づけ: **今回1回限りの修正**。これで実プレイ出力率が改善しなければ fix645 は凍結。
- スコープ: shadow のまま（実書き込み・再生成・本文改変なし）。位置 state は作らない・from は要求しない。
- 緊急復帰: `localStorage v292Dfix647Off='1'` で「prio3＋旧文面」へ戻す（旧prio・旧文面を保持）。

## 背景（実測・確定）
- 49ターン（移動を大量投入）で `scene_move` が出たのは通算1回だけ・採用0＝出力率およそ2%。
- 原因は sys 指示の**置き場所（prio3＝予算逼迫で最初に落ちる）**と**文面の方向（省略優先=「迷ったら出さない」）**。

## GPT裁定の要約（厳守）
1. keeper ブロックを prio3 → **prio2** へ昇格（`<say>/<state>/<react>` と同じ出力形式ブロックの階層）。
2. sys 文面を「省略優先」から「肯定形の必須規則（明記なら必ず出す）」へ反転。**few-shot は足さない**。**タグは本文末尾のまま**（本文が無い段階で ev を完全引用できないため前へ移す案は却下）。
3. to規則をパーサ側コメントで明文化。`ev.includes(to)` は維持（緩めない）。許容する正規化は**XMLエスケープ復元・改行コード統一のみ**。空白削除・句読点削除・表記揺れ吸収は不可。
4. 出力率の分母を **eligibleMoveTurns 方式（近似）**へ。`rawRecall / validatedRecall / precision / eligibleApprox` を `stats()` に追加。

## 変更内容

### 変更1: prio3 → prio2 昇格
- `registerKeeper()` の `prio` を `PRIO`（通常 2／`v292Dfix647Off` 時のみ 3）で登録。
- `budgetSelect`（fix379）は prio2/3 を対象に BUDGET_V4=2400（fix646拡張済み）で収める。

### 変更2: sys 文面の反転（新文面 = 184字）
```
【移動タグ】主人公が別の場所へ到達し、ターン終了時の居場所が変わったことを本文に明記した場合は、
本文末尾に <scene_move who="hero" to="到着地点の原文" ev="移動完了箇所の原文"/> を必ず出す。
toとevは本文から一字も変えず抜き出し、toはev内に含まれる文字列にする。
移動未遂・予定・回想・視線移動、同じ場所内の動作では出さない。
```
- 「迷ったら出さない／完全に省略する／本文を短くしない」は削除。
- 「明記した場合は…を必ず出す」＝肯定形の必須規則。few-shot なし。タグは本文末尾のまま。

### 変更3: to規則・正規化ポリシーの明文化（`verify()` コメント）
- `ev` は本文の**部分文字列として一字一句一致**（正規化なし）。`ev.includes(to)` 維持。
- 現状の `verify()` は正規化を一切していない＝許容範囲（XMLエスケープ復元・改行統一）**より厳格**なので締め直し不要。

### 変更4: eligibleMoveTurns 方式（近似）
- `eligibleArrivalApprox(body)`: 本文**末尾付近（末尾60字）**に到着完了語彙（既存 `ARRIVE` を流用）があれば eligible とみなす近似。field 名 `eligibleApprox` が近似であることを明示。
- `stats()` 追加（セッション内カウンタから算出・分母0は null）:
  - `eligibleApprox` = eligible（近似）ターン数
  - `rawRecall` = scene_move出力あり / eligible
  - `validatedRecall` = 検証通過 / eligible
  - `precision` = 検証通過 / scene_move出力総数
- 既存フィールド（`tagTurns / accepted / rejected / byReason / acceptRate / turnsObserved`）は据え置き（後方互換）。

## prio2 昇格後の keeper 予算内訳（BUDGET_V4 = 2400・prio2/3 対象）

実チェーン計測（`fix379`→keeper系全fix→`fix645` をモックwindowに載せ、各 entry の `text()` 長を集計）:

| 区分 | 昇格前 | 昇格後 |
|---|---|---|
| prio1（予算外） | 981 | 981 |
| prio2 | 1436 | **1620**（+184＝新【移動タグ】） |
| prio3 | 261 | **50**（旧【移動タグ】211 が prio2 へ移動） |
| **prio2+3 合計** | 1697 | **1670** |

- 上記モック計測は cast 3名で条件成立ブロックのみの値。**fix646 の real-play 実測ではプレイ状態が埋まり prio2/3 合計は最大 2103**（旧【移動タグ】211 を含む）。
- fix647 後の real-play 上限見積り = 2103 − 211（旧prio3）+ 184（新prio2）= **2076 ≤ 2400**。
- 結論: **prio2 昇格後も BUDGET_V4(2400) 内**。`budgetSelect` は【移動タグ】を含め何も drop しない（実チェーンで確認）。
- 補足: prio3→prio2 は**総量を増やさない**（同じ 1 ブロックがどちらでも注入される。逼迫時の drop 順が変わるだけ＝逼迫時に真っ先に落ちるのが【移動タグ】でなくなる）。

## 変更しないこと（GPT明示）
- shadow のまま（実書き込み・再生成・本文改変なし）。出力漏れで再生成しない。
- 1ターン複数移動でも最終到着だけ採用（既存の 1件目のみ評価を維持）。
- MARKERS【移動タグ】網羅を維持（prio 変更でブロックが落ちないこと＝実チェーンで確認）。
- BUDGET_V4 / version.txt / BUILT はこの回では触らない（出荷時に上げる）。

## 実機確認コマンド（コンソール）
```js
window.__v292Dfix645.status();     // { prio:2, f647off:false, keeperPrio:2, sysChars:184, ... }
window.__v292Dfix645.text();       // 新文面（「必ず出す」を含み「迷ったら出さない」を含まない）
window.__v292Dfix645.stats();      // eligibleApprox / rawRecall / validatedRecall / precision
window.__v292Dfix645.selfTest();   // { ok:true }
// 緊急復帰:
localStorage.setItem('v292Dfix647Off','1'); location.reload();  // prio3＋旧文面へ
```

## テスト
- `node test_fix645.cjs` … PASS 147 / FAIL 0（122→147、fix647契約を追加）
- `node run_all_tests.cjs` … 68ファイル / 合格 4131 / 失敗 0
