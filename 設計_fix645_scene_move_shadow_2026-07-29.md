# 設計 fix645 — scene_move タグの shadow 収集（⑤位置引き継ぎ 第一歩）

- 日付: 2026-07-29
- ブランチ: v292-rebuild（BUILT=20260729-fix644 のまま。**BUILT / version.txt は触らない**）
- 状態: 実装済み・**shadow のみ**（本文・保存・生成へ影響させない）
- 前提の基準点: `node run_all_tests.cjs` = 66ファイル / 3980件 / 失敗0（実測・変更前）

---

## 0. 何をやるのか（スコープ）

GPT裁定どおり **P1 = 移動だけ・主人公のターン終了時の到着地点だけ** を集める。

- 在場（誰がその場に居るか）・姿勢・所持は**入れない**。
- モデルが出したタグを**そのまま信用しない**。本文との完全一致検証を通ったものだけを
  `derived observation`（= 採用済みの観測）として記録する。
- 記録は localStorage の自前キー1つだけ。**物語データ（chr6*）は1バイトも書かない**。
- 位置 state は**作らない**。fix630 の教訓（場所stateは存在しないので作らなかった）を踏襲する。

やらないこと（この fix では実装しない）:
- 現在地 state の作成・sys への現在地注入・`from` の要求
- 移動を理由にした再生成・スコア加算・警告表示

---

## 1. 追加する sys（keeper 経由・prio3）

`window.__f379reg` へ 1 ブロック登録する（既存作法。`Planner._extensions` は**死に経路**なので使わない
— fix377/fix414/fix416/fix427 のヘッダに実測記録あり）。

```
【移動タグ】主人公が移動を完了し、ターン終了時の居場所が変わった場合だけ、本文の後に
<scene_move who="hero" to="到着地点" ev="本文からの抜粋"/> を1つだけ出力する。
evは本文から一字も変えずに抜き出す。移動の予定・未遂・回想・視線だけの移動、
居場所が変わらない動作では出力しない。迷ったら出さない。
物語本文を優先し、タグのために本文を短くしない。該当しなければタグは完全に省略する。
```

設計上の決め:

| 決め | 理由 |
|---|---|
| 長い内省指示（「移動の有無を慎重に推論せよ」等）を**入れない** | 推論型モデルがタグ判断へトークンを浪費する（GPT裁定） |
| `from` を出させない | 現在地 state が無い段階で from を必須にすると捏造を誘発する |
| **prio3**（任意）で登録 | keeper の予算（prio2/3 で 1,600字）が逼迫したとき、**最初に落ちるのが fix645** になる。実験用ブロックが品質ブロックを押し出さない |
| marker = `【移動タグ】` | keeper の冪等キー。かつ **fix459 の MARKERS へ登録が必須**（下記 §2） |

## 2. fix459 MARKERS への登録（★これを忘れると毎ターン消える）

fix459 は送信直前に sys をブロック単位で組み替える。ブロック境界は `MARKERS` の
既知マーカーだけ。**未知マーカーのブロックは直前ブロックへ吸収され、直前が drop 対象なら
道連れで消える**（fix496(A1) が実測した事故。【表記】【読ませ方】等が毎ターン消失していた）。

→ `v292Dfix459-sys-v2.js` の `MARKERS` に `'【移動タグ】'` を1行追加する。
`dropA/B/C/D` のどれにも含まれないので、認識後は生存してモデルへ届く。

**これは網羅の追加であって削除ではない**（既存44件は1つも触らない）。
`test_fix645.cjs` が「MARKERS に【移動タグ】が在る」「fix496 追加の8件が全部残っている」を固定する。
（調査結果: `test_fix496*` というテストファイルは**存在しない**。MARKERS の網羅を守るテストは
これまで1つも無かったので、fix645 のテストで初めて固定する。）

---

## 3. パーサ側の検証（満たさないタグは保存せず、拒否理由だけ記録）

### 3.1 抽出

- well-formed = `<scene_move ... />`（自己閉じが必要）。
- `<scene_move` の出現数 > well-formed 数 のとき `incomplete-tag`（＝ max_tokens 途中で切れたタグ）。
- well-formed が2つ以上あるときは **1件目だけを評価し、2件目以降は無視**（GPT裁定）。

### 3.2 「本文」の定義（★ここが一番効く）

検証に使う本文 = **画面に出る本文（`turn.narrative`）から scene_move タグを取り除いたもの**。

- 生の応答ではなく画面本文を正とする理由: プレイヤーが読む文字列と一致していることが
  「幻覚でない」の意味だから。生でだけ一致するケースは `ev-not-in-final-body` として
  別カウントし、後から「fix175/fix427 の後処理でズレた分」を切り分けられるようにする。

### 3.3 判定条件（すべて満たしたときだけ accepted）

| # | 条件 | 落ちたときの reason |
|---|---|---|
| 1 | 応答が途中で切れていない（finish_reason が length / max_tokens でない） | `finish-length` |
| 2 | タグが自己閉じで完全 | `incomplete-tag` |
| 3 | `who` が hero（`hero` またはキャストの主人公名） | `who-not-hero` |
| 4 | `to` が空でない | `to-empty` |
| 5 | `ev` が空でない | `ev-empty` |
| 6 | `ev` が 80 文字以下 | `ev-too-long` |
| 7 | `ev` が本文の**完全な部分文字列**（一字も違わない） | `ev-not-in-body` / `ev-not-in-final-body` |
| 8 | `ev` の一致箇所が本文中に**1か所だけ** | `ev-ambiguous` |
| 9 | `ev` の中に `to` がそのまま含まれる | `ev-missing-to` |
| 10 | `ev` が未遂・予定・仮定・回想・否定でない | `unrealized` |
| 11 | `ev` に到着完了を示す語がある（入った/着いた/出た/上がった/降りた/戻った 等の完了形） | `no-arrival-verb` |

語彙リストは**過剰に賢くしない**。完了形の語を並べただけの配列、否定・未遂の語を並べただけの
配列の2本だけ。形態素解析も推論もしない。

- 未遂判定を到着語判定より**先**に置いた。「厨房に入ろうとした」はどちらでも拒否されるが、
  拒否理由の内訳を読むときに「未遂」と分かる方が使えるから。
- 未遂リストは `うとした` / `うとして`（意志形）で1本にまとめている。
  `ようとした` だけだと **「入ろうとした」（ろ＋うとした）を取りこぼす**（実測でテストが落ちた）。

### 3.4 max_tokens 枯渇への防御（GPT裁定そのまま）

- 採用は 0 または 1 件のみ。
- `finish_reason === 'length'`（Anthropic 系は `stop_reason === 'max_tokens'`）のターンでは
  **scene_move を採用しない**。
- 閉じが不完全なタグは無視。
- **タグ欠落を生成失敗として扱わない。scene_move 欠落を理由に再生成しない。
  fix643 のスコアにも影響させない。**

---

## 4. 実配線（どこに入るか）

```
G.submit
  1804  Planner.build(...)          ← keeper(fix379)が【移動タグ】を sys 末尾へ足す
  1805  Api.call(sys, user)         ← fix645 の fetch ラッパが finish_reason だけ控える(clone・読むだけ)
  1808  Planner.parsePlan(raw)      ← fix645 が raw を控える(plan は一切いじらない)
  1839  narr = plan.narrative.join()
  1963  fix175 が <say> を「」へ    ← scene_move はここでは落ちない
  1984  const turn = { narrative: narr, plan, ... }
  1993  S.turns.push(turn)
  1995  S.save()                    ← ★fix645 の本体。ここで judge + 記録 + turn.narrative からタグを剥がす
  1996  UI.appendTurn(turn)         ← 剥がした後に描画される
```

- `S.save` ラップにした理由: 「保存とクラウド送出と表示の**すべてより前**」がここ1点だから
  （fix427 の A2 二重ネットが同じ位置を使っている実績がある）。
- `turn.plan.narrative`（一次証拠）は**触らない**。話者タグ（`<say>`）と同じ扱い。
- 二重ネット: `UI.renderNarr` を fix60 と同型でラップし、万一 S.save ラップが他fixに
  奪われても**画面には絶対にタグを出さない**。

### 4.1 タグ剥がしの位置（既存タグはどこで剥がされているか — 調査結果）

| タグ | 剥がす場所 | plan.narrative に残るか |
|---|---|---|
| `<state>` `<react>` `<summary>` | index.html:1218 `buildProsePlan`（parsePlan の中） | **残らない**（parse 時点で除去） |
| `<say>` | index.html:1963〜1982（fix175/214/215/216・`narr` に対して） | **残る**（fix640 実測 165/165） |
| `<scene_move>` | **fix645 の S.save ラップ**（`turn.narrative` に対して）＋ renderNarr 二重ネット | **残す**（話者タグと同じ扱い＝一次証拠） |

---

## 5. 既存fixへの副作用と、その封じ方

`<scene_move>` は既存コードが知らないタグなので、「本文の終わり」を
`<react` / `<state` で切っている3か所が、タグを**本文の一部として数えてしまう**。
これは shadow の約束（生成・保存へ影響させない）を破るので、3か所に `|<scene_move` を足す。

| 場所 | 影響 | 対処 |
|---|---|---|
| `v292Dfix643-collapse-rescue.js` `bodyOf()` | タグ約60字（句読点なし・ASCII混じり）が崩壊スコアの分母に入り、「長すぎる文」「読点が少ない」を揺らす | split に `<scene_move` を追加。**タグが無い応答では挙動が1ビットも変わらない** |
| `v292Dfix553-punct-probe.js` `narrativeFromRaw()` | 同上（句読点計測の maxRun が伸びる） | 同上 |
| `index.html:1848` `_body`（会話ログ `_convSays` の抽出元） | `ev="「行ってくる」と言って部屋を出た"` のように **ev に「」が入ると、裸「」収穫器が会話ログへ偽の発話を1件混ぜる**＝保存汚染 | 同上。**これは index.html 本体への唯一の実質変更**（12バイト挿入・Python bytes で実施） |

いずれも「`<scene_move` は本文ではない」という**同じ1つの規則**であり、対症療法ではない。
fix645 が OFF／未ロードのときは応答にタグが現れないので、3か所とも完全に不活性。

その他の経路の確認（変更不要と判断した根拠）:
- `Api._hasForeignGarbage` は `<\/?[a-zA-Z][^>]*>` でタグを除去してから英字を数える → 誤検出なし。
- `_proseLen`（不完全出力リトライ判定）も `<[^>]+>` を除去してから数える → 影響なし。
- `Planner.parsePlan` の行フィルタ（かな1文字必須）でタグ行が落ちることがある
  → **だから raw を一次ソースにする**。plan.narrative からは拾わない。
- fix482 の反復畳み込みは `'<' '>' '《'` を含むユニットを畳まない（タグ保護済み）。
- fix427 のサニタイザは見出し語 `=`/`:` 行と角括弧行だけを落とす → タグ行は対象外。

---

## 6. 記録（shadow）

`localStorage['v292Dfix645_log']` — 全体で上限 100 件、古い方から捨てる。

```
{ ts, slotId, turnIndex, raw, accepted, rejectReason, to, evLen }
```
記録の健全性ガード（★これが無いと記録の意味が壊れる）:
控えた raw が「このターンのもの」であることを確かめてからでないと判定しない
（`rawMatchesTurn`：タグ除去・空白除去した本文を、先頭／1/3／2/3 の3か所×20字で照合）。
スロット切替・履歴読み込み・fix643 が捨てた候補で raw が古いまま残ると、
**実在しない拒否理由が内訳に混ざる**。一致しなければ判定も記録もせず `session.rawMismatch` を1増やすだけ。
（このときも本文からタグを剥がす処理は行う＝画面へは絶対に漏らさない。）

- `raw` = タグ文字列そのまま・**150字まで**。本文は1バイトも入れない。
- `to` は採用時のみ入れる（拒否時は幻覚の可能性がある文字列なので `null`）。
- `evLen` は長さだけ（ev 本体は保存しない）。

集計 API: `window.__v292Dfix645.stats()`
```
{ turnsObserved, tagTurns, accepted, rejected, byReason:{ reason: n, ... },
  acceptRate, wired:{ keeper, fetch, parsePlan, save, render }, off, logged }
```

その他の読出口: `.log()` / `.clearLog()` / `.status()` / `.selfTest()`
（`selfTest()` は固定サンプル10件を通して合否を返す。実機コンソールで1行で確認できる）

---

## 7. 将来基準（★コメントに残すだけ・この fix では実装しない）

| 段階 | 昇格条件 |
|---|---|
| shadow が有用と言える | 適合率 **>= 98%** ／ 移動完了ターンでのタグ出力率 **>= 60%** ／ 重大幻覚 **0** |
| location state へ昇格してよい | 固定検証セットでの適合率 **>= 99%** ／ タグ陽性 **200件**の人手監査 ／ 完全一致通過率 **>= 98%** |

この数字に届くまで、位置 state は作らない・sys へ現在地を注入しない・`from` を要求しない。

---

## 7.5 実機での確認（★Network傍受で実sysに入ることを見る）

順に3段階で見る。①②は通信せずに確認できる。

```js
// ① 積み込み確認（コンソール）
window.__v292Dfix645.status()
//   → { keeperRegistered: true, wired:{ keeper:true, fetch:true, parsePlan:true, save:true, render:true }, off:false }
window.__v292Dfix645.selfTest().ok            // → true（固定10ケースの判定が全部正しい）

// ② keeper が sys へ実際に足しているか（★通信しない。build するだけ）
Planner.build('DO', 'テスト').sys.indexOf('【移動タグ】') >= 0    // → true
// false のときは keeper の注入予算落ち。次を見る:
//   コンソールに [v292Dfix379:wrap-keeper] budget: dropped 【移動タグ】 が出ていないか
//   （prio3 なので予算が逼迫すると最初に落ちる＝設計どおり。品質ブロックは守られている）

// ③ ★実sys（fix459 の書き換え後・実際に送信される中身）の傍受
//   iPhone: Safari → Mac の Web インスペクタ。PC: Brave/Chrome DevTools → Network
//   1ターン送信し、openrouter.ai/api/v1/chat/completions（または workers.dev）の
//   Request Payload → messages[0].content（role:"system"）を開き、
//   「【移動タグ】」と「<scene_move who="hero"」が **そのまま入っている** ことを目で見る。
//   ★fix459 は fetch 境界で sys を組み替えるので、②で入っていても③で消えることがありうる。
//     消えていたら MARKERS 登録が効いていない＝この確認だけが真実。
```

そのあと収穫を見る:

```js
window.__v292Dfix645.stats()
//   { turnsObserved, tagTurns, accepted, rejected, byReason:{…}, acceptRate, session:{ rawMismatch, … } }
window.__v292Dfix645.log()        // 1行ずつ: {ts,slotId,turnIndex,raw,accepted,rejectReason,to,evLen}
```

見るべき点:
- `byReason` が `ev-not-in-body` ばかり → モデルが本文から抜き出していない（sys の文面を疑う）
- `byReason` が `ev-not-in-final-body` ばかり → 後処理（fix175/fix427/fix555）で本文がズレている
- `session.rawMismatch` が増え続ける → raw の捕捉がどこかで切れている（配線の問題）
- `tagTurns` が 0 のまま → sys に届いていない（②③へ戻る）

## 8. スイッチとロールバック

| 操作 | 手段 |
|---|---|
| 全停止（sys注入もパーサも） | `localStorage.v292Dfix645Off='1'` → リロード不要で次ターンから停止 |
| 完全撤去 | index.html の `<script src="v292Dfix645-...">` 1行削除 |
| 記録の消去 | `window.__v292Dfix645.clearLog()` |

OFF のとき: keeper の `off` キーで sys 注入がスキップされ、`textFn()` も空文字を返し、
S.save / renderNarr ラッパも即 return する（＝**剥がしもしない**。タグが出ないので剥がす対象も無い）。

---

## 9. テスト契約（`test_fix645.cjs`）

1. ev 完全一致でないタグは拒否
2. ev の一致箇所が2か所あるタグは拒否
3. ev に to を含まないタグは拒否
4. 未遂・回想は拒否
5. `finish_reason==='length'` のターンは不採用
6. 2件目以降のタグは無視（1件目だけ評価）
7. OFF で sys 注入もパーサも停止
8. 画面用 narrative からタグが剥がれ、`plan.narrative` には残る
9. fix643 のスコアに影響しない（同じ本文＋タグ有無で score/level が完全一致）
10. fix459 MARKERS に【移動タグ】が在り、fix496 追加の8件も全部残っている
11. 記録の上限100件・raw 150字・本文を保存しない
12. index.html の配線（script タグ・`?cb=fix645`・fix643 の後・`_body` split）
13. fix459 の `rewrite()` を実際に通しても【移動タグ】が sys に残る
    （負の対照: 未知マーカーに差し替えると道連れで消える＝MARKERS 登録が効いている証明）

## 10. 実測値（2026-07-29）

| 項目 | 値 |
|---|---|
| 変更前 | 66ファイル / 3980件 / 失敗0 |
| 変更後 | **67ファイル / 4103件 / 失敗0** |
| `test_fix645.cjs` 単体 | 123件 / 失敗0 |
| index.html | 209,891 → 210,617 バイト・NUL **1個のまま**・CR 0 |
| sys ブロック | 【移動タグ】 211字（keeper 予算 1,600字に対して 13%・prio3） |

`test_fix547.cjs` の「`__chronicleGetState` を参照するのは N ファイル」台帳を 34 → **35** に更新した
（新しく S を読むモジュールを足したら必ず正式API(fix539)経由にする、という契約の台帳。
fix645 は `getS()` の第一経路が `__chronicleGetState` なので、この台帳に載るのが正しい）。
