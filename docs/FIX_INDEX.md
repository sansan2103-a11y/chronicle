# FIX_INDEX — Chronicle fix 辞典（開発担当向け）

> 下書き（laneDOCS・2026-10-31・第 1 段）。
> **基準の本番**：`20261031-bundle71-ednedg-a`（version `f45d7f71`・index `9a205026`・home `795af03c`）。Worker `v46.7-ns-converge`（`c4658504`）、管理者画面 `44aceb9c`。
> **「本番稼働」の判定は、上の本番の `index.html` / `home.html` が実際に読み込むかどうかだけで行っています。** ファイルが配信物にあるだけのもの・コメントアウトされたものは「読み込まれていない」と書きます。
> 確かめていないことは「未確認」と書きます。過去の資料（記憶メモ・2026-07 の knowledge/）にあった説明は、コードと照らして合っている部分だけ使いました。

## 0. この辞典の使い方

- **番号で探す**：このファイルを `fix333` のように検索。手書き項目（§2）と、全部品の一覧（付録 A）の両方に出ます。
- **ファイル名**：ほぼすべて `v292D<番号>-<名前>.js`（例 `fix333` → `v292Dfix333-actor-reality.js`）。正確な名前・読込順・sha は付録 A。`fix660` のように同じ番号で 2 ファイルあるものもあります。
- **分野で探す**：§1 の索引から §2 の各節へ。付録 A の「分野（推定）」列でも絞れます（ファイル名からの自動推定なので目安）。
- **スイッチ（localStorage キー）で探す**：付録 C（全 697 キー → それを読む部品）。
- 項目の書き方：
  - **状態**：本番稼働（読込位置 `i93` = index.html の 93 番目、`h5` = home.html の 5 番目）／Local 候補／読み込まれていない。
  - **sha**：本番ファイルの sha256 先頭 8 桁。**?cb=**：index.html に書かれたキャッシュ破棄の値（最後に入れ替わった出荷の目安）。
  - **スイッチ**：`キー='1'` の形。kill が常に優先するのが原則（例外は項目に記載）。端末ごと（localStorage）の設定です。
- 数字（件数・sha）は記録時点の値です。出荷のたびに、変わった項目だけを直してください。

### 用語

- **S**：ゲーム画面の状態オブジェクト（`index.html` の中核 inline script が持つ）。`S.turns`（ターン）・`S.cast`（主人公 `hero` と NPC `npcs`）・`S.scene`・`S.cfg`。正式な取得口は `window.__chronicleGetState`（fix539 系。古い部品は `window.S` や間接 eval で取る）。
- **ターン**：`{inputType, playerText, narrative, plan, _convSays, _convSayMeta, …}`。`_convSays` が会話ログのカード（`{who, say, …}`）。
- **sys**：AI へ送る指示文（system）。`Planner.build` が組み立て、多数の部品が包んで追記する。
- **store（fix77）**：キャラごとの状態（からだ・こころ・本能・傷）を持つ端末側の保存。`window.__v292Dfix77Store`。
- **canonical（正本）**：クラウド（D1）にある物語の正式な版。端末の `chr6_slot_*` は写し（キャッシュ）。詳しくは `DEVELOPMENT.md` §3。
- **影モード（shadow）**：判定や記録だけをして、挙動は変えない段階。

## 1. 分野別の索引

| 分野 | 主な部品（§2 に項目あり） |
|---|---|
| 生成の中心・プロンプト | features.js、fix192、fix226、fix379、fix459、smrc1、BF1、fix80、fix247 |
| NPC・キャラ状態 | fix77、fix305、fix333、fix414、fix145、fix298、fix277、fix307、fix641、fix853、CP1、E64、fix797 |
| 話者・会話ログ・編集 | fix66、fix469、fix606、fix611、fix620、fix957、SFL1、SFLTap、EDIT01、EDN（inline）、fix295 |
| 記憶 | fix135、fix313、fix314、fix670、fix796、fix793、fix905、fix950/953 |
| 保存・同期 | fix246、fix228、fix525、fix527、fix543、fix654、fix399、fix402、fix590、fix826、fix697、fix702、fix705、fix743/750/756、fix781、fix758、fix912、fix945、fix859、fix564/721/726/291 |
| 削除・墓標 | DL2、fix933、fix587、fix579、fix602、fix660、fix577、fix710、fix642、JR1 |
| Vault・ユーザー分離 | vault2-sendgate、vault2-copygate、vault2-ui、LE4、fix889、iso2、fix946 |
| 認証・アカウント | fix893、fix328、fix886/890、bav2-beta |
| アイコン・画像 | av2-data、av2-portrait、av2-migrate-ui、LD1、fg3、fix197、fix523、fix990、p8d |
| UI・画面 | UI1、IS1、LE3、fix777、fix243/270、fix880 |
| シナリオ・ホーム | fix819、fix825、fix873、fix335 |

---

## 2. 主要 fix の手書き項目

### 2.1 生成の中心・プロンプト

#### features.js — ゲーム本体のモジュール群
- 状態：本番稼働 `i62`・sha `143763f8`・?cb=`20261025-bundle55-sfl-a`。
- 役割：入力モード（DO/SAY/STORY）、`PromptRegistry` / `UserMessageRegistry` / `Planner._extensions` / `UI._renderHooks` などの登録口、会話ログ抽出、状態推論、表示の仕組み。index.html の中核 inline script（S・Api・Planner・UI・G.submit・保存）と組で動く。
- 注意：`Planner._extensions` は fix192（engineMode=1）では sys に乗らない「死に経路」（`.claude/rules/sys-injection.md`、fix226、fix313 の冒頭に記録）。新しい sys 注入は `Planner.build` を包むか、fix379 の keeper に登録する。

#### fix192 — 新プロンプトエンジン（生成の sys を丸ごと差し替える）
- 状態：本番稼働 `i105`・sha `21421bbb`・?cb=`20261025-bundle57-a1-b`。
- 役割：`Planner.build` を最も外側で包み、`engineMode=1` のとき sys を「良い 1 ターンの形＋見本」の短い指示へ差し替える。進行度・台詞量・続きの検知・キャラ状態（fix77 の store を直接読む `stateBlock`）・記憶の文字列（fix796 から）を自分で注入する。出力形式（`<say>` / `<react>` / `<state>` タグ）は旧エンジンと同じ。
- engineMode の決まり方：`S.cfg.engineMode` が主、無ければ localStorage `v292EngineMode`。**新しい物語での既定値がどこで 1 になるかは未確認**（コードの既定は 0＝従来。運用記録は engineMode=1 前提で書かれている）。
- 依存：fix77（store）、fix796（記憶）、fix226（旧エンジン用注入の退役）、fix379（keeper）。中に後から足された分岐が多い（fix812/813/832/903/930/932/956、A1、B0、B38、GQ2 など。スイッチは付録 C）。
- 既知の問題（laneNPRES 2026-10-31・合成物語で実測）：`stateBlock` は store の**全員**の状態を、何ターン前のものでも載せる。退場した NPC の様子が sys に残る。→ Local 候補 73-npres-d3（§3）。

#### fix226 — 旧エンジン用 sys 注入の退役
- 状態：本番稼働 `i108`。役割：engineMode=1 で無駄に計算されていた旧注入（fix74/71/76/77/69/79/82 の sys 側）を、印を保ったまま無害な関数に置き換える。parse 側は残す。戻し：`v292EngineUnifyOff='1'`。

#### fix379 — wrap-keeper（sys 注入の登録簿と予算）
- 状態：本番稼働 `i195`・sha `36077976`。
- 役割：sys 注入ブロックを `window.__f379reg` に `{off, marker, text}` で登録すると、毎ターン確実に、優先度つきの文字数予算の中で注入する（build の包みが外れる競合の根治）。
- 注意：予算からあふれた低優先のブロックは黙って落ちる前歴あり（記憶メモ「keeper 予算飽和」）。新しいブロックを足すときは実際の sys を傍受して確かめる。スイッチ：`v292Dfix379Off`・`v292Dfix379V4Off` ほか。

#### fix459 — sys の重複クラスタの統合
- 状態：本番稼働 `i260`・sha `8243a236`。役割：話者の同一性・出力形式・展開の進め方などで重複していたブロックを 1 つにまとめる。スイッチ：`v292Dfix459Off`、クラスタ別 `v292Dfix459AOff`〜`DOff`。

#### smrc1-model-registry — 使う AI モデルの登録簿
- 状態：本番稼働 `i16`・`h9`・sha `52ca67f1`。
- 役割：文章の主モデルを 1 行で決める（`deepseek/deepseek-v4.1-flash`、表示名「DS V4.1 Flash」）。モデル切替の UI は fix256・fix354・fix370。
- 注意：Worker 側にも使ってよいモデルの許可リストがある。

#### BF1 — 推論で使い切った空応答の再送を「条件を変えた 1 回」にする
- 状態：本番稼働 `i96`。既定：**Owner だけ既定 ON**（`/auth/me` の entitlement owner・active）。ほかは `v292DfixBF1On='1'` で opt-in。kill：`v292DfixBF1Off='1'`。
- 背景：DeepSeek V4.1 Flash の一部 provider が推論で `max_tokens` を食い潰し、空の応答（finish_reason=length）を返す（2026-10-21 実測）。fix80 の再送と組み合わせて動く。

#### fix80 — 生成のゲートと再送
- 状態：本番稼働 `i97`・sha `6b90a1f2`。役割：応答が空・壊れているときの再送。fix494 の「1 論理ターンの送信は最大 3 回」の共通予算（記憶メモ 2026-07-19。現行コードでの上限値は未確認）。E65 系（1 ターンの送信回数と料金）の調査対象。

#### fix247 — API プロキシ切替（鍵をブラウザに置かない）
- 状態：本番稼働 `i57`・`h43`・sha `06dd6d0f`。
- 役割：`openrouter.ai/...` や画像 provider への通信を Worker（`novel-proxy`）の `/openrouter.ai` `/image` などへ書き換える。さらに pages.dev では fix893 が Worker 宛てを same-origin の `/api/*` へ付け替える（2 段）。

### 2.2 NPC・キャラ状態

#### fix77 — 状態の記憶（state memory）
- 状態：本番稼働 `i93`・sha `d53f65aa`・?cb=`20261019-bundle31-a`。
- 役割：AI に本文末で `<state who="名前" からだ="…" こころ="…" 本能="…"/>` を出させ、解析して端末に保存し（localStorage `v292Dfix77States`。fix246 で物語ごとのキーに振り分け）、表示からは必ず剥がす。次のターンで状態を sys に戻す（engineMode=1 では fix192 の stateBlock が担当）。
- データ：`window.__v292Dfix77Store`。fix190（傷の正本）・fix961（保留）と関わる。
- 依存・関係：fix192、fix305、fix333、fix414、fix853（切り詰め名の防止）、fix970（取り込み脱落の記録・既定 OFF）、E64（捨てた応答の取り込みを残さない）。
- 既知の問題：store の値は退場後も残り、fix192 と fix333 がそれを使う（§2.1 fix192、§2.2 fix333）。✎ 編集（EDIT01）は store を直さない。
- スイッチ：`v292Dfix532Off`・`v292Dfix901Off`・`v292Dfix938Off`・`v292Dfix961Off`（後から足された分岐。fix77 全体を止めるキーはファイル内に見当たらない＝未確認）。

#### fix305 — キャラ状態のトリガー注入（登場中の人だけ）
- 状態：本番稼働 `i132`・sha `1e1d23c9`。スイッチ：`v292Dfix305Off='1'`。
- 役割：fix77 が sys に入れた「【各キャラの現在の状態】」ブロックを、直近 4 ターンに名前が出た人物（＋主人公）の行だけに絞る。
- **既知の問題：新エンジン（fix192）の sys にはこの見出しが無いため、engineMode=1 では実質的に効いていない**（laneNPRES 2026-10-31 の実測）。

#### fix333 — 身体の現実エンジン ＋ NPC の前面化（actor-reality）
- 状態：本番稼働 `i171`・sha `5a1f258e`・?cb=`20261023-bundle43a-r2`。**保護ファイル**（出荷時に変えない 9 本の 1 つ）。
- 役割：
  - A：キャラの身体状態（fix77 の store）から、不可能な命令（拘束中に走る等）を「試してみる」形と身体状態の正史に差し替えてから生成させる（user 側の書き換え）。
  - C：前面化（foregroundSelector）。重要度で 1〜2 人の NPC を前に出し、しばらく黙っている NPC を順番に出す。指示は `Api.call` の直前（最後尾）に入れる。
- スイッチ：全体 `v292Dfix333Off='1'`、モード `v292Dfix333`=`observe`/`off`、NPC 前面化だけ止める `v292Dfix333Npc='0'`、`v292Dfix333HeroLabelOff`・`v292Dfix333SelOnceOff`・`v292Dfix927Off`。
- 既知の問題：前面化の候補を store の全員から選ぶため、退場した人物が強制的に戻ることがある。弱い離れの語（「画面」「電話」「待って」）で同席者まで外す害も記録あり（laneNPRES・台帳 2156）。→ 73-npres-d3（§3）。

#### fix414 — 身体・心理の制約エンジン（重傷・解離・凍結のコスト）
- 状態：本番稼働 `i221`・sha `fdad99f5`。既定 ON（fix428 で ON 化）。止める：`v292Dfix414Off='1'`。
- 役割：store から毎ターン導出したキャラ別の【制約】行を keeper（fix379・prio2）で注入する。関連：fix416（痛覚・既定 ON）、fix417（反応系の統合ブロック）、fix850〜852（同じターンの身体・姿勢・精神の能力制約。RR-1〜3）。

#### fix145 — キャラ一覧（モーダル）
- 状態：本番稼働 `i66`・sha `9856b244`。
- 役割：登場したキャラ（主人公・登録 NPC・長期記憶の自動抽出）の一覧、自動抽出キャラの正式 NPC への昇格、説明の編集、検索、入力欄への名前の挿入、「🎨 外見を作り直す」（fix773）。
- 書くもの：`S.cast.npcs`（昇格・編集）→ `S.save()`。
- 既知の問題：「最終登場」は本文から、状態は store から読むので表示が食い違うことがある（laneNPRES）。

#### fix298 — 永続キャラロスター（死亡・負傷の表示、手動退場）
- 状態：本番稼働 `i168`。止める：`v292Dfix298Off`。役割：fix277 由来の登場キャラを一覧に常に出し、死亡・負傷の表示と手動の退場を持つ。

#### fix277 — 準登録カルテ ＋ 帰属品質パック
- 状態：本番稼働 `i119`・sha `581842fc`。**保護ファイル**。
- 役割：未登録キャラが累計 3 ターン登場したら「準登録」にして状態行を整える。別名台帳（fix528/537/538/540）など同一性の処理も内蔵。
- 既知の問題：過去に別の物語のカルテが混入した前歴（記憶メモ 2026-07-28〜29。汚染データは削除済み）。fix641 はこのカルテを読まない設計。

#### fix307 — NPC 重要度ロスター抽出器
- 状態：本番稼働 `i140`。役割：要約 AI に弧の文脈を渡し、無名の重要な存在（「濡れた黒髪の女」等）に呼称を付けて一覧に載せる。止める：`v292Dfix307Off`。

#### fix641 — 証拠が揃った人物だけを NPC として自動登録
- 状態：本番稼働 `i310`。役割：fix640 の証拠台帳だけを見て、2 ターン以上・強い証拠 2 系統以上の人物を `S.cast.npcs` へ登録。止める：`v292Dfix641Off`。

#### fix853 — 切り詰めた名前（「菅野」→「野」）の幽霊 NPC 防止
- 状態：本番稼働 `i339`・sha `14e1e6de`。**保護ファイル**。役割：AI が既知キャラの名前を切り詰めて出したタグで store に別人が作られるのを防ぐ。止める：`v292Dfix853Off`。

#### CP1 — 今の場面に誰がいるか（PRESENT / ABSENT / UNKNOWN）
- ファイル：`v292DfixCP1-scene-presence.js`（`i145`・sha `5ef63c79`）と観測口 `v292DfixCP1-final-tap.js`（`i4`・sha `22ac1bca`）。どちらも**保護ファイル**。
- 既定：**OFF**。opt-in `v292DfixCP1On='1'`、kill `v292DfixCP1Off='1'`（常に優先）。index.html に `window.__v292DfixCP1IdxAtt='att-r5'` の印があることが前提。
- 役割：NPC ごとの所在の最小の正本。場面移動（`<scene_move>` タグ）で全員 UNKNOWN に戻すなど。

#### E64 — 捨てた応答の取り込み・保存を止める
- ファイル：`v292DfixE64-save-tap.js`（`i5`・`h3`、保存の共通の出口）と `v292DfixE64-discard-guard.js`（`i328`）。**保護ファイル**。
- 既定：OFF（Owner opt-in `v292DfixE64On='1'`）。kill `v292DfixE64Off`。
- 役割：書き直しの際に捨てた 1 回目の応答の `<state>` などが残らないようにし、「続きを止めた」印のある物語の汚染されたかもしれない state を Worker へ送らない。

#### fix797 — 同じターンの能力の矛盾（Layer2）
- 状態：本番稼働 `i327`・sha `346c7119`。**保護ファイル**。既定 ON（fix817）。kill `v292Dfix797Off`。
- 役割：明示された能力の境界（例：両手を縛られている）を、同じターンの生成が無視して完遂したときに検出し、書き直しを頼む。E65-D（中断の扱い）の対象。

### 2.3 話者・会話ログ・編集

#### fix66 — 会話ログの描画フック修復（＋未登録キャラのアバター文体）
- 状態：本番稼働 `i84`・sha `9dda0a16`。
- 役割：会話ログのカードが毎ターン消える不具合（fix54〜65 の包みの連鎖）を描画フックで根治。`repair()` は**足すだけ**（古いカードは消さない）。スイッチ多数（付録 C）。

#### fix469 — 話者同定「点数制＋否定証拠＋棄権」
- 状態：本番稼働 `i270`・sha `d968b745`。
- 役割：会話カードの話者を、台詞の前後の文から点数で判定する。元のタグは +60 で保護し、強い反証のときだけ変える。
- 既知の問題：隣の行の動作（「真鍋は封筒の口を開けた」）を話者の証拠と数えて反転させた事故（fix610 で「口を開」を発話動詞から除外）。→ fix611（中央ゲート）・fix620（適用）へ。

#### fix606 / fix611 / fix620 — 話者の来歴・中央ゲート・適用
- fix606（`i273`）：どのカードの話者が何を根拠に決まったかを数えるだけ（書かない）。
- fix611（`i274`）：話者を書き換える補正器 9 本（fix303/376/383/388/390/462/465/469/489）の変更を「中央で通すか」判定する影モード。kill `v292Dfix611SpeakerGateOff`、`v292Dfix619ReconcilerOff`。
- fix620（`i276`）：新しいターンが確定した瞬間に、fix611 の 12 条件をすべて満たすカードだけ `who` を AI のタグに揃える。過去のターンは `repairPast()` を明示的に呼んだときだけ（既定は dryRun）。元の値は `v292Dfix620_restore_<スロットid>` に残す。kill `v292Dfix620ApplyOff`。

#### fix957 — 独立行の裸の「」の後方照応
- 状態：本番稼働 `i275`。**既定 ON**（コードの `DEFAULT_ON = true`）。端末で止める `v292Dfix957Off='1'`。
- 注意：index.html のこの行のコメントは「既定 OFF」と書いてあるが古い。

#### SFL1 — 話者の手動訂正（✎ 編集パネルの中）
- 状態：本番稼働 `i83`・sha `63e3554f`・?cb=`20261025-bundle55-sfl-a`。
- 既定：**OFF**。opt-in `v292DfixSFL1On='1'`（home の `?sfl=1` で書く・`?sfl=0` で消す）、kill `v292DfixSFL1Off='1'`。記録時点では Owner の端末だけ ON（台帳）。
- 役割：✎ 編集パネルに、カードごとの話者の選択欄を足す。保存は本文の編集と同じ 1 回の `S.saveD('UI.saveEdit')`。訂正の記録はターンの中（`turn._sflCorrections[]`、カードの安定 ID `_convSays[i]._sid`）。
- Local 候補：78-admf-c（管理者画面からアカウントごとに ON/OFF。§3）。

#### SFLTap — 会話カードをタップして話者を直す
- 状態：本番稼働 `i86`・sha `197a15c6`（65-b）。SFL1 が使えるときだけ動く。kill `v292DfixSFLTapOff`。
- 役割：カード本体をタップ → 小さな選択シート → SFL1 の ✎ 経路（`UI.openEdit` → `UI.saveEdit`）をそのまま使って保存。アイコン・✕・ボタンのタップは対象外。スクロール直後 0.4 秒以内・文字選択中は無視。

#### EDIT01 — 本文を編集したら会話ログを本文に合わせる ＋ カード ✕
- 状態：本番稼働 `i85`・sha `5a41e946`・?cb=`20261031-bundle71-ednedg-a`（71-a で更新）。既定 ON。kill `v292DfixEdit01Off='1'`。
- 役割：✎ で本文を保存したとき、本文から消えた台詞のカードを外し、言い回しを直した行は話者を残して台詞だけ更新する。**71-a（69-edg）**：本文が変わっていなければ（改行コードの違いだけでも）整理をしない＝カードが消えない。この部分だけ止める `v292DfixEDGOff='1'`。
- 既知の問題：本文を**書き換えた**とき、本文にそのままの形で無い台詞のカードが外れることがある（案 B・未着手）。store（fix77）と `plan._v254who` は直さない。

#### EDN（inline script `v292DfixEDN-btn`）— ✎ 編集ボタンを本文の終わりへ
- 状態：本番稼働（index.html 553 行目の inline。71-a で追加）。CSS だけ。kill `v292DfixEDNBtnOff='1'`。

#### fix295 — 会話ログのスクロール保持 ＋ アイコン即同期
- 状態：本番稼働 `i124`・sha `3e3c528b`。
- 役割：会話ログが再描画されても、読んでいた位置（最下部なら最下部）へ戻す。再描画直後 350ms のスクロールは記録しない。fix197.sweep() でアイコンのずれを即同期。
- 既知の問題：新しいターンのあと会話ログが上端に戻ることがある（fix295 が直前の最下部への移動を記録していない。laneJMP の観察、71-a でも同じ）。止めるキーはファイル内に見当たらない（未確認）。

### 2.4 記憶

#### fix135 — 長期記憶（あらすじ・自動ワールド情報・重要イベント）
- 状態：本番稼働 `i64`。役割：数ターンごとに 1 回の AI 呼び出しで、あらすじ（約 300 字）・登場人物や場所の DB（fix136）・重要イベント（fix137）を作り、端末に保存（fix246 で物語ごとのキー）。`window.__longmem`。fix299 で永続化の欠落を根治した記録あり。

#### fix313 — 設定カード（トリガー式の永久の設定）
- 状態：本番稼働 `i155`。保存：`S.scene.cards[]`（物語の保存に相乗り）。注入：`Planner.build` を外側で包み、常時カード＋直近に語が出たカードを sys 末尾へ。止める：`v292Dfix313Off`。関連：fix951〜954（カード選択・届いたかの検出。fix953 は全体既定 ON）。

#### fix314 — 記憶メモ ＋ コンテキスト透視
- 状態：本番稼働 `i156`。保存：`S.scene.memoryNote`。毎ターン sys へ注入。透視（エンジンが今どう覚えているか）は読むだけ。止める：`v292Dfix314Off`（データは残る）。

#### fix670 / fix796 / fix793 / fix905 — Memory Engine（ME）
- fix670（`i316`）：採用済みターンから「世界の事実の候補」を決定的なルールで抽出し、端末の IndexedDB に記録。物語生成には使わない。
- fix793（`i322`）：canonical memory（memoryV1）を保存に載せる。fix796（`i104`）：記憶の取り出し（memoryText / guardText を fix192 へ渡す）。**既定 OFF**（`v292Dfix796On='1'`）。
- fix905（`i15`）：本番での ME の有効条件 = サーバー由来の entitlement owner **かつ** account_feature.memoryEngine（`/auth/me` の `features.memoryEngine`）**かつ** `v292DmeOff` が '1' でない。本番では端末の On フラグだけでは ON にならない。
- 全体の kill：`v292DmeOff='1'`。

### 2.5 保存・同期（危険領域）

全体像は `DEVELOPMENT.md` §3。ここでは部品ごとの役割だけ。

| 部品 | 状態・位置 | 役割（ひとこと） | 主なスイッチ |
|---|---|---|---|
| fix246 | `i35` | per-story の付随データ（fix77 状態・longmem・会話ログ抽出など）を `localStorage` の読み書きの段階で物語ごとのキーへ振り分ける | `v292Dfix783Off` |
| fix228 | `i109` | スロットの自動世代バックアップ（直近 3 世代 `__gen_<slotKey>`）と巻き戻り検知。`window.__v292Restore()` | `v292SlotGenOff` |
| fix525 | `i298` | タブの所有権ピン（他タブの切替で自分の物語を他スロットへ書かない） | `v292Dfix525Off` |
| fix527 | `i60` | 開いている物語の真実を URL の `?story=` にする（`chr6_active_slot` は互換用ミラー） | `v292Dfix527Off` |
| fix543 | `i36` | 保存（setItem）の失敗を無言にしない。物語の保存失敗はトースト | `v292Dfix543Off` |
| fix654 | `i7` `h4` | iOS Safari で localStorage のラッパが素通りする問題（第 18 型）を `Storage.prototype` のアクセサで根治。localStorage を包む部品より前に読まれることが前提（index では 7 番目。前にある部品との関係は未整理） | `v292Dfix654Off` |
| fix399 | `i210` | 旧方式の端末間同期（アカウント単位のパッケージ）。起動時 pull・保存時 push・楽観ロック | `v292Dfix399Off`・`v292Dfix399AutoOff` |
| fix402 | `i216` | 不可視の双方向同期（確認ダイアログなし・rev/baseRev・fork は非モーダルの選択）。既定 ON | `v292Dfix402Off` |
| fix590 | `i32` `h19` | コミット台帳（送ったが応答を取り逃した「結果不明」を記録して自力で決着） | `v292Dfix590Off` |
| fix826 | `i29` `h35` | fork を保存成功と扱わない・古い pull 応答を当てない | `v292Dfix826Off` |
| fix697 | `i39` `h22` | per-story canonical への書き込み（putstory / putcanonical / commitstate）。多数の後続分岐を内蔵（fix781b/c・909・910・911・913・914・BCJ1/2 など） | `v292Dfix697Off` ほか |
| fix702 | `i45` | legacy → per-story canonical の権限の切替（promotestory 等）。**既定 OFF**（`v292Dfix702On`）。C1 の in-memory permit でも通る。legacy apply mask は既定 ON | `v292Dfix702Off`・`v292Dfix702MaskOff` |
| fix705 | `i25` | 起動時に物語を server の getstory で分類し、canonical を当てる読み取りの関門（fix706/707/757 の改訂を含む） | `v292Dfix705Off` |
| fix743 | `i329`・動的 | schema2 の組み立て・当て込みの関数群（CC2）。単体では何もしない | `v292DfixCC2On`／`Off`・`v292Dfix743Off` |
| fix750 | `i330` | 1 つの物語を schema1 → schema2 canonical へ移す状態機械（prepare は可逆・commitSchema2 は不可逆） | `v292Dfix750On`／`Off` |
| fix756 | `i331` | **サーバーに行が無い新しい物語は最初から schema2 にする**（製品の既定。fix750 を 1 回だけ呼ぶ） | `v292Dfix756Off`・`v292Dfix810Off` |
| fix781 | `i17` | 未同期のローカル進行を server canonical で上書きしない（データ消失の根治） | `v292Dfix781Off` ほか |
| fix758 | `i333` | 「クラウドに保存できていません」等のバナー（表示だけ・5 秒ごとに fix697 を読む） | `v292Dfix758Off` |
| fix912 | `i40` | 開いたままの物語で別端末が進めたとき、PUT せず idle で 1 回 reload して収束 | `v292Dfix912Off` |
| fix945 | `i299` | 同じ物語を 2 タブで開いたとき、古いタブが新しい編集を巻き戻すのを防ぐ | `v292Dfix945Off` |
| fix745 / fix746 / fix748 | `i18`〜`i20` | 複数キーをまたぐ書き込みの直列化（Web Lock）・スロット分離の権限・Class D の受け入れ | 各 `Off` |
| fix698 | `i21` `h10` | 正本の変更を許可された経路だけに通すバス | `v292Dfix698Off` |
| fix859 | `i24` `h21` | 物語ごとの合言葉（STORY_PASSCODE）のセッショントークンを sessionStorage に持つ | `v292Dfix859Off` |
| fix490 | `i290` | スロット上書き事故の防止（上書き前の自動控え・setItem の常設ガード） | `v292Dfix490Off` |
| fix564 / fix721 / fix726 / fix291 | `i50`・`i52`・`i51`・`i122` | 付随データ込みのスナップショット／安全な丸ごと復元（`localStorage.clear()` 禁止）／書き出す控えから認証情報を落とす／書き出し・読み込みの UI | 各 `Off` |

### 2.6 削除・墓標（危険領域）

#### DL2 — サーバーの版を基準にした物語の削除（S-2）
- 状態：本番稼働 `i154`（`data-dl2="index"`）・`h32`（`data-dl2="home"`）・sha `34507755`。kill `v292DfixDL2Off`。
- 役割：**削除の入口はホームだけ**。確認シート（画面内。confirm/alert は使わない）を開く前に `/api/auth/me` の accountId と listshadow を読み、server の rev / hash を基準に `deletestory2` を送る。ゲーム画面とギャラリーの削除の入口はホームへ誘導するだけ。
- サーバーが拒否するもの：保護している物語、Vault で隠した物語、この端末にしかない物語。サーバーに墓標を書くソフト削除で、**元に戻す手段は無い**。
- 関連：DP3（端末の一覧から外す。`v292DfixDP3On`。HOLD 中）、DP4。

#### fix933 — 招待テスト中は owner 以外に削除を使わせない
- 状態：本番稼働 `i153`・`h27`。owner 以外（beta・paid・不明）は削除ボタンを出さない（fail-closed）。kill `v292Dfix933Off`。

#### fix587 / fix579 / fix602 / fix660 / fix577 / fix710 / fix642 / JR1 — 旧来の削除の安全装置群
- fix587（`i149` `h26`）：StoryLifecycleService。削除の正規の手順（再読込 → exact key と hash → 控え → 墓標 → …）。cc2 を必要時に動的読込。
- fix579（`i148` `h18`）：墓標のスキーマとマージ規則（`chr6_slots_meta` の `deleted:true`）。
- fix602（`i150` `h28`）：墓標が立ったスロットへの書き込みを影監視（拒否しない・記録だけ）。
- fix660（`v292Dfix660-delete-gateway.js` `i34` `h12`、`v292Dfix660-backup-gc.js` `i53` `h17`）：物理削除の唯一の実行者と、何を消すかを決める BackupGC。
- fix577（`i151`）：削除の入口を 1 つに寄せる。fix710（`h31`）：ホームで保留中の削除を起動時に 1 回再開。fix642（`h29`）：削除の read-back（操作専用）。
- JR1（`i332` `h34`）：サーバーで削除済みの物語を指したまま残った fix750 の journal を退避し、新しい物語が作れない・全物語が止まる状態を解く。

### 2.7 Vault（物語を隠す）・ユーザー分離（危険領域）

#### vault2-sendgate / vault2-copygate / vault2-ui / LE4 — Vault v2
- sendgate（`i1` `h1`、**最初に読まれる**）：物語由来の外部送信の関門。プロキシ経路には `body.chrStoryId` を付けて Worker に毎回見える状態か判定させ、直接の外部送信は直前に `vault2visible` で確認。kill `v292Dvault2GateOff`。
- copygate（`i2` `h2`）：隠した物語の新しい複製（localStorage・sessionStorage などへの新規キー）を作らせない。kill `v292Dvault2CopyGateOff` ほか。
- vault2-ui（`h49`）：ホームの右上の鍵ボタン 1 つ（閉じている／開いている。開くと全端末で閉じるまで隠した物語が一覧に戻る）。kill `v292Dvault2UiOff`。
- LE4（`i69` `h50`）：開いている物語ページが再施錠・非表示化に追従（覆いを掛けて reload → fix889 の扉へ）。kill `v292DfixLE4Off`。
- 冒頭コメントは「OFFLINE CANDIDATE / NOT FOR DEPLOY」のままだが、本番で読み込まれている。
- Worker 側にも Vault v2 の判定がある（誰に使わせるかの設定はサーバー側。現在値は非公開の記録を参照）。

#### fix889 — 旧 Vault（v1）クライアント
- 状態：本番稼働 `i22` `h42`。v7.8 で**通常の利用者には入口を出さない**（`v292Dfix889QA='1'` の端末だけ）。扉・起動時の関門は動いている。実装は凍結。

#### iso2 / fix946 — 送信時の持ち主照合・画像のアカウント境界
- iso2（`i13` `h8`）：送信の時点で「データの持ち主」と「送信先のアカウント」を照合。kill `v292Diso2Off`。
- fix946（`i12`）：アカウントが変わったら、画像系の端末状態を退避してから持ち主の印を付け替える（第 1 段 M3）。

### 2.8 認証・アカウント（危険領域）

#### fix893 — アカウント cookie の付け替え（same-origin）
- 状態：本番稼働 `i8` `h5`・sha `74df8dc8`。kill `v292Dfix893Off`（`v292Dfix897Off` も）。
- 役割：pages.dev でだけ動く。Worker 宛ての fetch / XHR を same-origin の `/api/*` へ付け替え、旧来の認証ヘッダを外して CSRF 対策のヘッダを付ける。認証は HttpOnly の cookie だけ。localStorage に認証情報を置かせない。ログインは Google → `POST /api/auth/google` → cookie。`window.__v292Dfix893.me()` が `/auth/me` の結果（accountId・status・entitlement・features）を配る。
- 他の部品が頼る：fix905（ME の Owner 判定）、fix933、UI1、BF1、DL2 など。
- Local 候補：78-admf-c で `flags()`（accountFlags）を足す。

#### fix328 — Google ログイン（GIS）
- 状態：本番稼働 `i167`。Google Identity Services を読み込んで ID トークンを得る（pages.dev では、その後の認証は fix893 の cookie 方式）。

#### fix886 / fix890 — 匿名のお試し（public anon）
- 状態：本番稼働 `i347` `i348`。Worker が匿名の経路を使えると名乗るときだけ動く。Owner の方針は「匿名お試しは無しでよい」。

#### bav2-beta — 招待者（beta）を最初から Asset v2 で始める
- 状態：本番稼働 `i9` `h6`。`/auth/me` の `features.assetV2Beta` が true の端末で Asset v2 の端末フラグを ON にする（自分で ON にした分だけ戻す）。

### 2.9 アイコン・画像

#### av2-data / av2-portrait / av2-migrate-ui / LD1 / fg3 — Asset v2（新しいアイコンの仕組み）
- av2-data（`i23` `h20`）：データ層。キャラごとの ID と絵の結び付け（bindings）をサーバーが正として持つ。保存の 4 か所の境界（fix697・fix743・fix705）で押し引きする。
- av2-portrait（`i340`）：表示層。`portrait.list` / `asset.get`、asset_id ごとの IndexedDB キャッシュ、保留・拒否・競合の理由表示、明示の削除 UI。
- av2-migrate-ui（`i345`）：Owner 向けの移行 UI（準備 → 今の絵を候補として確保 → 採用 → …）。入口は UI1 で「⚙ 設定 → ⚙ システム → 詳細設定」へ。サーバー側の許可リストが最終の権限。
- LD1（`i341`）：今の画風（preset）で採用された絵を出す。opt-in `v292DfixLD1On`（既定の状態は未確認）。
- fg3（`i346`）：Asset v2 の物語の画風を 3 択（デフォルト／クール／ダーク）にする。正本は canonical の `body.cfg.artPreset`。
- 冒頭コメントはどれも「offline candidate, NOT DEPLOYED」のままだが、本番で読み込まれている。
- Worker：画像生成の失敗は理由を問わず 502 GENERATION_FAILED になり、画面には「絵を作れませんでした」。→ 75-icf-a（失敗の記録）・Worker の失敗分類（v46.9 に入れる裁定）が候補（§3）。

#### fix197 / fix523 / fix990 / p8d — 旧アイコンの仕組みと安全装置
- fix197（`i106`）：AI アイコン（seed 固定・キャラ単位）。再生成（fix403）・サーバー URL 優先（fix400）・正名寄せ（fix424）など多数の追加を内蔵。
- fix523（`i297`）：アイコンの端末間伝播（Worker の imgmanifest の rev で新しいときだけ上書き）。
- fix990（`i10`）：Asset v2 必須のアカウントで旧画像の op が 409 を返し続ける空回りを、10 分止める。
- p8d（`i14`）：画像生成の送信直前に、人物名や日本語の文がそのまま provider へ出るのを止める（fail-closed）。

### 2.10 UI・画面

| 部品 | 状態・位置 | 役割 | スイッチ |
|---|---|---|---|
| UI1 | `i350`（最後） | プレイ画面の引き算：Asset v2 移行の固定ボタンを外し（Owner だけ詳細設定に置く）、空の会話ログを畳み、補助操作を設定へ移す | `v292DfixUI1Off` ほか |
| IS1 | `i70` | アイコンの大きさ（小・中・大）。表示だけ。「🎛 調整」から選べるようにするのは 77-ui-a（候補） | `v292DfixIS1Off` |
| LE3 | `i68` | iPhone 幅（520px 以下）だけ上のバーを 1 行にして ☰ にまとめ、展開の描写を広げる | `v292DfixLE3Off` |
| fix777 | `i67` | アイコンをタップで拡大表示 | — |
| fix243 / fix270 | `i112` / `i115` | 上のバーの折りたたみ・整理 | — |
| fix880 | `i173` | ⚙ システムを 3 段（通常・詳細・開発）に畳む（DOM の移動だけ） | `v292Dfix880Off` |
| fix334 / fix335 | `i172` / `i176` `h37` | 入口ハブ（空白フォームで始めない）・おまかせ生成 | — |

### 2.11 シナリオ・ホーム

- fix819（`h38`）：原本（シナリオ）から独立した物語を作る。fix820（原本の保存）・fix872（原本のクラウド同期）・fix823（種の変換）・fix829（種の文の補強）。
- fix825（`h45`）：ホームの原本 UI と「この物語を始める」。fix873（`h47`）：シナリオ作成。fix870（`h46`）：ホームの入口。fix885（`h48`）：ホームのデータ欄の折りたたみ。B37-home-menu（`h33`）。

---

## 3. Local 候補（まだ本番ではない）

記録時点（2026-10-31）。いずれも **Owner の承認前で、本番には入っていません**。土台・sha は各パッケージの MANIFEST が正。

| 候補 | 中身 | 土台 | 状態（GPT 裁定） | 置き場所 |
|---|---|---|---|---|
| 77-ui-a | 74-ux72a（「🎛 調整」の中に 🖼 アイコン欄。kill `v292DfixUX72Off`）＋ 76-jmp（「↓ 最新へ」ボタン。kill `v292DfixJMPOff`） | 71-a | #127-OM：Owner への出荷 GO。J6 の単独再試験の結果待ち（#127-OO） | 作業環境 |
| 78-admf-c | 管理者画面からアカウントごとに SFL を ON/OFF。Worker・Pages 6 本・管理者画面 | 77-ui-a | #127-OM：設計採用。#127-OO：C6 の限定再現 QA が出荷の条件（サーバーの OFF が ON になる可能性が残るなら HOLD） | 作業環境 |
| 73-npres-d3 | NPC の前面化・状態注入から、場面にいない人物を外す（電話の相手は「声だけ」で残す） | （c333 系） | #127-OO：限定 QA（3〜5 ターン続く通話・通話終了後・代名詞では同席を確定しない・すぐ OFF に戻せる）を通れば、77・78 の上で Owner 限定カナリア候補。一般の既定 ON は HOLD | 作業環境 |
| 75-icf-a | アイコン生成の失敗を端末に記録（最大 100 件・名前や文章は持たない）。kill `v292DfixICFOff` | 71-a | Tier 1 Local GO | 作業環境 |
| EDLOG | 本文の手動編集の記録（`_narrEdits`） | — | Owner の QA 物語に限った GO | （場所未確認） |
| DP3 | 削除済み・未保存の物語を端末の一覧から外す | — | HOLD | — |
| UX72 単体 / 76-jmp 単体 / 74 単体 | 77-ui-a に合流 | — | — | — |

## 4. まだ整理していないこと（第 2 段で拡充）

- 手書き項目は主要分野の約 110 部品（単独の見出し 47、表・まとめ項目を含む）。残り約 250 部品は付録 A の機械抽出（ファイル名・読込順・sha・スイッチ）のみ。
- 各部品の「書く保存データ」の網羅（localStorage・IndexedDB・sessionStorage のキー一覧）。
- 同じ関数を包む部品どうしの順序と競合（`window.fetch`、`localStorage.setItem`、`Planner.build`、`UI.appendTurn`、`S.save`）の表。
- Worker の op ごとの説明と、client のどの部品が呼ぶか。
- engineMode の既定値の決まり方（未確認）。
## 付録A　本番で読み込まれる部品の全一覧（機械抽出）

- 抽出元：本番 `20261031-bundle71-ednedg-a` の `pages_full.zip`（index `9a205026`・home `795af03c`・version `f45d7f71` を照合済み）。
- 判定：`index.html` / `home.html` / `backup.html` の `<script src>` を、HTML コメント `<!-- -->` を除いて読んだ順。ほかに動的読込 1 件（`v292Dfix743-cc2-client.js` を home.html の inline と fix587 が必要時に読む）。
- 「分野」はファイル名からの**自動推定**です。正確な役割は本文の手書き項目か、ファイル冒頭のコメントを見てください（冒頭コメントは古いことがあります）。
- 「?cb=」は index.html（無ければ home.html）に書かれたキャッシュ破棄の値。そのファイルが最後に入れ替わった出荷の**目安**です（正確な履歴ではありません）。
- スイッチは、そのファイルの中に現れる `v292D…Off` / `…On` の localStorage キー（最大 4 件。全件は付録 C）。

| # | 番号 | ファイル | 読込（index順/home順） | sha256先頭 | ?cb= | 分野（推定） | スイッチ（例） |
|---|---|---|---|---|---|---|---|
| 1 | vault2-sendgate | `v292Dvault2-sendgate.js` | i1 h1 | `d430be8b` | 20261021-laneE-a | Vault・非表示 | `v292Dvault2GateOff` |
| 2 | vault2-copygate | `v292Dvault2-copygate.js` | i2 h2 | `2ac107be` | 20261011-ab8 | Vault・非表示 | `v292Dfix893Off` `v292Dvault2AB8Off` `v292Dvault2ABOff` `v292Dvault2CopyGateOff` |
| 3 | fix950 | `v292Dfix950-card-delivery-probe.js` | i3 | `7a74b853` | 20261014-f950r2 | 記憶 | `v292Dfix950Off` |
| 4 | fixCP1 | `v292DfixCP1-final-tap.js` | i4 | `22ac1bca` | 20261023-bundle43a-r5 | NPC・キャラ状態 | `v292DfixCP1Off` `v292DfixCP1On` |
| 5 | fixE64 | `v292DfixE64-save-tap.js` | i5 h3 | `104547ff` | 20261024-bundle45-e64-d | NPC・キャラ状態 | `v292DfixE64Off` `v292DfixE64On` |
| 6 | fix953 | `v292Dfix953-card-canary-gate.js` | i6 | `99598aed` | 20261015-bundle1-cardA-f957on | 記憶 | `v292Dfix953Off` `v292Dfix953On` |
| 7 | fix654 | `v292Dfix654-storage-trap.js` | i7 h4 | `9ee9821a` | v292Dfix731 | 保存・同期 | `v292Dfix654Off` |
| 8 | fix893 | `v292Dfix893-account-cookie-shim.js` | i8 h5 | `74df8dc8` | 20261019-bundle33-b | 認証・アカウント | `v292Dfix893Off` `v292Dfix897Off` |
| 9 | bav2-beta | `v292Dbav2-beta.js` | i9 h6 | `de95b737` | 20261019-bundle33-b | 認証・アカウント | `v292Dav2On` `v292Dbav2Off` |
| 10 | fix990 | `v292Dfix990-legacy-img-breaker.js` | i10 | `bdb527d2` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix990Off` |
| 11 | fixS1 | `v292DfixS1-entry-notice.js` | i11 h7 | `980196d5` | 20261019-bundle31-a | 認証・アカウント | `v292DfixS1Off` |
| 12 | fix946 | `v292Dfix946-img-isolation.js` | i12 | `54d22bd5` | 20261014-iso1c | アイコン・画像 | `v292Dfix946M3Off` `v292Dfix946Off` |
| 13 | iso2-owner-send-guard | `v292Diso2-owner-send-guard.js` | i13 h8 | `621fc588` | 20261014-iso2b | Vault・非表示 | `v292Dfix946M3Off` `v292Dfix946Off` `v292Diso2Off` |
| 14 | p8d-image-egress-guard | `v292Dp8d-image-egress-guard.js` | i14 | `15e91a71` | 20261009-p8d2 | アイコン・画像 | `v292Dp8dOff` |
| 15 | fix905 | `v292Dfix905-me-owner-gate.js` | i15 | `701becfa` | 20260929-ac17 | 認証・アカウント | `v292Dfix905Off` `v292Dfix905cOff` `v292Dfix917Off` `v292DmeOff` |
| 16 | smrc1-model-registry | `v292Dsmrc1-model-registry.js` | i16 h9 | `52ca67f1` | 20261022-bf1owner | モデル・API | `v292DfixBF1Off` `v292DfixBF1On` `v292DfixCmfOff` |
| 17 | fix781 | `v292Dfix781-unsynced-guard.js` | i17 | `8c861398` | 20261019-bundle31-a | 保存・同期 | `v292Dfix729tOff` `v292Dfix781Off` `v292Dfix781bOff` `v292Dfix781cOff` |
| 18 | fix745 | `v292Dfix745-gws-lock.js` | i18 | `4e422c58` | 20260830-fix756 | 保存・同期 | `v292Dfix743Off` `v292Dfix745Off` `v292Dfix750Off` `v292Dfix750On` |
| 19 | fix746 | `v292Dfix746-slot-isolation-authority.js` | i19 | `2cbe79e5` | 20260829-fix748 | 保存・同期 | `v292Dfix746Off` |
| 20 | fix748 | `v292Dfix748-class-d-admission.js` | i20 | `c9ba87aa` | 20260829-fix748 | 保存・同期 |  |
| 21 | fix698 | `v292Dfix698-mutation-bus.js` | i21 h10 | `406075da` | 20260908-fix837 | 保存・同期 | `v292Dfix698Off` `v292Dfix698On` `v292Dfix837Off` |
| 22 | fix889 | `v292Dfix889-secret-vault.js` | i22 h42 | `82edc1ad` | 20260928-ac9 | Vault・非表示 | `v292Dfix889Off` `v292Dfix902Off` |
| 23 | av2-data | `v292Dav2-data.js` | i23 h20 | `2ebd0127` | 20261021-laneE-a | アイコン・画像 | `v292Dav2Off` `v292Dav2On` `v292DbndOff` `v292DknwOff` |
| 24 | fix859 | `v292Dfix859-story-session.js` | i24 h21 | `5bb41ddd` | 20260916-sp2 | Vault・非表示 | `v292Dfix859Off` |
| 25 | fix705 | `v292Dfix705-canonical-read-gate.js` | i25 | `337ec0b1` | 20261019-bundle33-b | 認証・アカウント | `v292Dfix705Off` `v292Dfix705bdOff` `v292Dfix781Off` `v292Dfix837Off` |
| 26 | fix900 | `v292Dfix900-hydrate-ui-gate.js` | i26 | `48c9765f` | 20260928-ac8 | 保存・同期 | `v292Dfix900Off` |
| 27 | fix892 | `v292Dfix892-held-input-guard.js` | i27 | `95996398` | 20261011-s1b | 保存・同期 | `v292Dfix892Off` `v292DfixS1BOff` |
| 28 | fix569 | `v292Dfix569-gc-shadow.js` | i28 h11 | `3d87ed16` | v292Dfix574 | 削除・墓標 | `v292Dfix569Off` `v292Dfix574DenyOff` |
| 29 | fix826 | `v292Dfix826-revision-coherence.js` | i29 h35 | `11f7f450` | 20260907-fix826 | 保存・同期 | `v292Dfix826Off` |
| 30 | fix827 | `v292Dfix827-mat-recovery-ux.js` | i30 | `803d894b` | 20260907-fix827 | 保存・同期 | `v292Dfix827Off` |
| 31 | fix580 | `v292Dfix580-meta-sync-coordinator.js` | i31 | `e9d45e63` | v292Dfix583 | 保存・同期 | `v292Dfix580Off` |
| 32 | fix590 | `v292Dfix590-commit-ledger.js` | i32 h19 | `b6c6d8f7` | 20261006-n1 | 保存・同期 | `v292Dfix590Off` `v292Dfix828Off` `v292DlpsGate1Off` `v292Dlpsid1Off` |
| 33 | fix658 | `v292Dfix658-lineage-shadow.js` | i33 h30 | `7f30422b` | 20260908-fix837 | 保存・同期 | `v292Dfix658Off` `v292Dfix837Off` |
| 34 | fix660 | `v292Dfix660-delete-gateway.js` | i34 h12 | `63ebcb33` | v292Dfix680 | 削除・墓標 | `v292Dfix660Off` |
| 35 | fix246 | `v292Dfix246-store-slot-isolation.js` | i35 | `1304aea2` | 20260901-fix783 | 保存・同期 | `v292Dfix783Off` |
| 36 | fix543 | `v292Dfix543-save-guard.js` | i36 | `28bf9923` | 20260829-fix748 | 保存・同期 | `v292Dfix543Off` |
| 37 | fix802 | `v292Dfix802-refresh-orchestrator.js` | i37 | `092278a1` | 20260930-ac24 | 保存・同期 | `v292Dfix802Off` `v292Dfix802On` `v292Dfix924Off` `v292DmeOff` |
| 38 | fix803 | `v292Dfix803-auto-materialize.js` | i38 | `4b113de5` | 20260930-ac25 | 保存・同期 | `v292Dfix803Off` `v292Dfix803On` `v292Dfix904Off` `v292Dfix924Off` |
| 39 | fix697 | `v292Dfix697-shadow-story-commit.js` | i39 h22 | `7c4bb95c` | 20261024-bundle44-b | 保存・同期 | `v292Dfix697Off` `v292Dfix697pOff` `v292Dfix697q2Off` `v292Dfix697qOff` |
| 40 | fix912 | `v292Dfix912-s2-insession.js` | i40 | `fa9862e1` | 20261022-bundle41-a | 保存・同期 | `v292Dfix911Off` `v292Dfix912Off` `v292Dfix913Off` `v292DfixGC1Off` |
| 41 | fix729 | `v292Dfix729-title-sync.js` | i41 h24 | `95ce2b1d` | 20261010-rs1 | 保存・同期 | `v292Dfix729Off` `v292Dfix729tOff` `v292Dfix842Off` |
| 42 | fix843 | `v292Dfix843-capability-notice.js` | i42 h25 | `d9c8ef62` | 20260909-fix843 | 認証・アカウント | `v292Dfix843Off` |
| 43 | fix846 | `v292Dfix846-access-gate-notice.js` | i43 | `6c2d01ae` | 20260926-sp24 | 認証・アカウント | `v292Dfix846Off` |
| 44 | fix700 | `v292Dfix700-nonauthoritative-mirror.js` | i44 | `cef9e3ac` | 20260916-sp2 | 保存・同期 | `v292Dfix700Off` `v292Dfix700On` `v292Dfix837Off` |
| 45 | fix702 | `v292Dfix702-authority-cutover.js` | i45 | `44e19d8c` | 20261019-bundle31-a | 保存・同期 | `v292Dfix702MaskOff` `v292Dfix702Off` `v292Dfix702On` `v292Dfix837Off` |
| 46 | fix860 | `v292Dfix860-story-unlock-ui.js` | i46 h23 | `6de33b75` | 20260916-sp2 | Vault・非表示 | `v292Dfix860Off` |
| 47 | fix573 | `v292Dfix573-hero-guard.js` | i47 | `c90d8be8` | 20261009-f573b | NPC・キャラ状態 | `v292Dfix573Off` `v292Dfix573bOff` |
| 48 | fix553 | `v292Dfix553-punct-probe.js` | i48 | `1d54eb16` | 20260913-q119b5 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292DQ119PhaseBOn` `v292Dfix553Off` |
| 49 | fix562 | `v292Dfix562-backup-inventory.js` | i49 h13 | `a878f4d0` | v292Dfix735 | 保存・同期 | `v292Dfix562Off` |
| 50 | fix564 | `v292Dfix564-snapshot.js` | i50 h14 | `134543bc` | v292Dfix567 | 保存・同期 | `v292Dfix564Off` |
| 51 | fix726 | `v292Dfix726-export-secret-guard.js` | i51 h15 backup | `fecc81d7` | 20261019-bundle31-a | 保存・同期 | `v292Dfix726Off` |
| 52 | fix721 | `v292Dfix721-safe-restore.js` | i52 h16 | `62e39f67` | 20260829-fix748 | 保存・同期 | `v292Dfix721Off` |
| 53 | fix660 | `v292Dfix660-backup-gc.js` | i53 h17 | `ea2ac157` | v292Dfix680 | 削除・墓標 | `v292Dfix660Off` |
| 54 | fix555 | `v292Dfix555-punct-repair.js` | i54 | `b3aa85c8` | v292Dfix560 | 文章品質・プロンプト | `v292Dfix555Off` |
| 55 | fix499 | `v292Dfix499-freeget-style-canon.js` | i55 | `d63bcfc4` | v292Dfix499 | 認証・アカウント | `v292Dfix499Off` |
| 56 | fix484 | `v292Dfix484-style-canon.js` | i56 | `726c2038` | 20261019-bundle31-a | 認証・アカウント | `v292Dfix484Off` `v292Dfix980Off` |
| 57 | fix247 | `v292Dfix247-proxy.js` | i57 h43 | `06dd6d0f` | 20260909-fix841 | 認証・アカウント | `v292Dfix837Off` `v292Dfix841Off` |
| 58 | fix247b | `v292Dfix247b-proxy-admin.js` | i58 | `3bdbfbac` | v292Dfix247b | 認証・アカウント | `v292Dfix247bOff` |
| 59 | fix600 | `v292Dfix600-new-story-guard.js` | i59 | `d874abc9` | v292Dfix601 | 保存・同期 | `v292Dfix600Off` |
| 60 | fix527 | `v292Dfix527-story-url.js` | i60 | `59d65c75` | 20261011-sn1 | 保存・同期 | `v292Dfix527NoopHomeSaveOff` `v292Dfix527Off` `v292Dfix588Off` `v292DfixSN1aOff` |
| 61 | fix659 | `v292Dfix659-fork-choice.js` | i61 | `d6e39622` | v292Dfix680 | 保存・同期 | `v292Dfix659Off` |
| 62 | features | `features.js` | i62 | `143763f8` | 20261025-bundle55-sfl-a | 本体（ゲーム中核） | `v292Dfix190Off` `v292Dfix205gOff` `v292Dfix748SaveRefuseOff` `v292Dfix834Off` |
| 63 | fixP0 | `v292DfixP0-scenario-blocker.js` | i63 | `7c6d79f0` | v292Dfix680 | シナリオ・ホーム |  |
| 64 | fix135 | `v292Dfix135-longmem.js` | i64 | `1eb21253` | 20260927-ac3 | 記憶 | `v292Dfix894Off` |
| 65 | fix138 | `v292Dfix138-continue.js` | i65 | `db8f5e85` | 20260929-ac18 | 記憶 | `v292Drp1Off` |
| 66 | fix145 | `v292Dfix145-charlist.js` | i66 | `9856b244` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix410Off` `v292Dfix487ListOff` `v292Dfix529Off` `v292Dfix773Off` |
| 67 | fix777 | `v292Dfix777-icon-lightbox.js` | i67 | `19adb4d6` | 20261021-laneE-a | アイコン・画像 | `v292Dfix777Off` `v292DfixLE2Off` |
| 68 | fixLE3 | `v292DfixLE3-iphone-nav.js` | i68 | `d4a5a7f5` | 20261021-laneE-a | UI・画面 | `v292DfixLE3Off` |
| 69 | fixLE4 | `v292DfixLE4-relock-follow.js` | i69 h50 | `a67a87f4` | 20261022-bundle40-b | Vault・非表示 | `v292DfixLE4Off` |
| 70 | fixIS1 | `v292DfixIS1-icon-size.js` | i70 | `dc33c66f` | 20261022-bundle41-a | アイコン・画像 | `v292DfixIS1Off` `v292DfixLE2Off` |
| 71 | fix53 | `v292Dfix53-readability-v2.js` | i71 | `75e08f3a` | v292Dfix53 | 文章品質・プロンプト |  |
| 72 | fix54 | `v292Dfix54-gender-pronoun.js` | i72 | `c17c4838` | 20260901-fix783 | NPC・キャラ状態 | `v292Dfix783Off` |
| 73 | fix55 | `v292Dfix55-gm-mode.js` | i73 | `f465582c` | v292Dfix55c | 文章品質・プロンプト |  |
| 74 | fix56 | `v292Dfix56-conversation-log-fix.js` | i74 | `551d0c71` | v292Dfix200 | 話者・会話ログ |  |
| 75 | fix57 | `v292Dfix57-script-style-dialogue.js` | i75 | `bfea0dfd` | v292Dfix57 | 話者・会話ログ |  |
| 76 | fix58 | `v292Dfix58-prompt-rebuild.js` | i76 | `dbe6a382` | 20260829-fix748 | 文章品質・プロンプト |  |
| 77 | fix60 | `v292Dfix60-display-pipeline.js` | i77 | `fc5144f4` | v292Dfix60 | アイコン・画像 |  |
| 78 | fix59 | `v292Dfix59-hybrid-extractor.js` | i78 | `12c56db5` | v292Dfix59 | NPC・キャラ状態 |  |
| 79 | fix61 | `v292Dfix61-alpha-strip-protect.js` | i79 | `7cbb4781` | 20260829-fix748 | 文章品質・プロンプト |  |
| 80 | fix63 | `v292Dfix63-avatar-style.js` | i80 | `3c12b0a9` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix979Off` |
| 81 | fix65 | `v292Dfix65-dialogue-rescue.js` | i81 | `a616558a` | v292Dfix65b | 話者・会話ログ |  |
| 82 | fix74 | `v292Dfix74-ext-dedup-and-say.js` | i82 | `a7131790` | 20260912-q119s4 | 話者・会話ログ | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` |
| 83 | fixSFL1 | `v292DfixSFL1-speaker-correct.js` | i83 | `63e3554f` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix781Off` `v292DfixCP1Off` `v292DfixSFL1Off` `v292DfixSFL1On` |
| 84 | fix66 | `v292Dfix66-renderhook-repair.js` | i84 | `9dda0a16` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix455Off` `v292Dfix457Off` `v292Dfix783Off` `v292Dfix808Off` |
| 85 | fixEDIT01 | `v292DfixEDIT01-edit-reconcile.js` | i85 | `5a41e946` | 20261031-bundle71-ednedg-a | 話者・会話ログ | `v292DfixEDGOff` `v292DfixEdit01Off` |
| 86 | fixSFLTap | `v292DfixSFLTap-card-correct.js` | i86 | `197a15c6` | 20261031-bundle65-sfltap-b | 話者・会話ログ | `v292Dfix457Off` `v292DfixSFLTapOff` |
| 87 | fix68 | `v292Dfix68-cliche-sentence-aware.js` | i87 | `0b3e2a28` | v292Dfix68 | 文章品質・プロンプト |  |
| 88 | fix69 | `v292Dfix69-literary-prose.js` | i88 | `35c17050` | v292Dfix69 | 文章品質・プロンプト |  |
| 89 | fix71 | `v292Dfix71-anti-recap.js` | i89 | `f44a7f21` | 20261025-bundle48-qa-a | 文章品質・プロンプト | `v292Dfix71DlgOff` `v292Dfix71DlgOn` `v292DfixCL1gOff` |
| 90 | fix72 | `v292Dfix72-within-turn-dedup.js` | i90 | `a47966c7` | 20261009-bh1 | 文章品質・プロンプト | `v292DfixCL1hOff` |
| 91 | fix75 | `v292Dfix75-history-dedup.js` | i91 | `4ae2143f` | v292Dfix75 | 文章品質・プロンプト |  |
| 92 | fix76 | `v292Dfix76-human-foundation.js` | i92 | `e60a34f5` | v292Dfix76b | NPC・キャラ状態 |  |
| 93 | fix77 | `v292Dfix77-state-memory.js` | i93 | `d53f65aa` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix532Off` `v292Dfix901Off` `v292Dfix938Off` `v292Dfix961Off` |
| 94 | fix78 | `v292Dfix78-tag-case-normalize.js` | i94 | `bd33ee86` | 20260912-q119s4 | 話者・会話ログ | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` |
| 95 | fix79 | `v292Dfix79-momentum-anchor.js` | i95 | `78d3c840` | v292Dfix79 | NPC・キャラ状態 |  |
| 96 | fixBF1 | `v292DfixBF1-reasoning-fallback.js` | i96 | `85c75741` | 20261022-bf1owner | モデル・API | `v292DfixBF1Off` `v292DfixBF1On` |
| 97 | fix80 | `v292Dfix80-gen-gate-retry.js` | i97 | `6b90a1f2` | 20260929-ac23 | モデル・API | `v292Dfix504Off` `v292Dfix923Off` |
| 98 | fix82 | `v292Dfix82-injury-reaction-root.js` | i98 | `cf4e514f` | v292Dfix82 | NPC・キャラ状態 |  |
| 99 | fix83 | `v292Dfix83-name-truncation-repair.js` | i99 | `109f7ff6` | v292Dfix83 | NPC・キャラ状態 |  |
| 100 | fix84 | `v292Dfix84-sampling.js` | i100 | `1e09b21d` | v292Dfix482 | 文章品質・プロンプト |  |
| 101 | fix85 | `v292Dfix85-reaction-spectrum.js` | i101 | `0f0ee85b` | v292Dfix85 | NPC・キャラ状態 |  |
| 102 | fix81 | `v292Dfix81-strip-incomplete-tags.js` | i102 | `f58f2480` | v292Dfix81 | 文章品質・プロンプト |  |
| 103 | fix90 | `v292Dfix90-extension-dedup.js` | i103 | `4434f189` | v292Dfix90 | 文章品質・プロンプト |  |
| 104 | fix796 | `v292Dfix796-memory-retrieve.js` | i104 | `c7b43471` | 20261021-bundle38-b | 記憶 | `v292Dfix796BackfillOff` `v292Dfix796DedupeOff` `v292Dfix796F1On` `v292Dfix796HonOn` |
| 105 | fix192 | `v292Dfix192-newengine.js` | i105 | `21421bbb` | 20261025-bundle57-a1-b | 文章品質・プロンプト（生成の中心） | `v292Dfix425Off` `v292Dfix796HonOn` `v292Dfix812Off` `v292Dfix813Off` |
| 106 | fix197 | `v292Dfix197-avatar-key.js` | i106 | `ef0ec3e6` | 20261019-bundle31-a | アイコン・画像 | `v292DavProvOff` `v292Dfix403Off` `v292Dfix403cOff` `v292Dfix411Off` |
| 107 | fix221 | `v292Dfix221-recent-dialogues-authoritative.js` | i107 | `9def1578` | v292Dfix221 | 話者・会話ログ |  |
| 108 | fix226 | `v292Dfix226-engine-unify.js` | i108 | `d966519b` | v292Dfix226 | 文章品質・プロンプト |  |
| 109 | fix228 | `v292Dfix228-slot-generations.js` | i109 | `392213e5` | 20260901-fix783 | 保存・同期 | `v292Dfix651SlotBackupGuardOff` `v292Dfix783Off` |
| 110 | fix237 | `v292Dfix237-avatar-carrier-guard.js` | i110 | `94dbe30c` | 20261002-ac36 | アイコン・画像 |  |
| 111 | fix239 | `v292Dfix239-noncast-avatar-race.js` | i111 | `c55ec8b1` | v292Dfix239 | アイコン・画像 |  |
| 112 | fix243 | `v292Dfix243-topbar-collapse.js` | i112 | `f4b82fc3` | 20260916ux2 | 文章品質・プロンプト |  |
| 113 | fix244 | `v292Dfix244-psych-merge.js` | i113 | `4d3cebae` | 20261020-bundle35-b | NPC・キャラ状態 | `v292Dfix244F3Off` |
| 114 | fix256 | `v292Dfix256-model-select.js` | i114 | `6b5a0306` | 20261021-laneE-a | モデル・API |  |
| 115 | fix270 | `v292Dfix270-topbar-ui.js` | i115 | `76c1bfca` | 20260916-sp3 | UI・画面 |  |
| 116 | fix274 | `v292Dfix274-build-flag-guard.js` | i116 | `388ea580` | v292Dfix274 | 保存・同期 |  |
| 117 | fix275 | `v292Dfix275-settings-tabs.js` | i117 | `0691b349` | v292Dfix275 | UI・画面 |  |
| 118 | fix854 | `v292Dfix854-firstrun-key-tab.js` | i118 | `ab98b76f` | 20260916-ux4 | UI・画面 | `v292Dfix854Off` |
| 119 | fix277 | `v292Dfix277-quasi-pack.js` | i119 | `581842fc` | 20261025-bundle58-npcp1-b | NPC・キャラ状態 | `v292DQ119PageCanaryOff` `v292Dfix277CaseViewOff` `v292Dfix277rOff` `v292Dfix528Off` |
| 120 | fix288 | `v292Dfix288-tooltips.js` | i120 | `c99a08cb` | 20260913-dsmrc1 | UI・画面 |  |
| 121 | fix290 | `v292Dfix290-mobile.js` | i121 | `79f7e619` | v292Dfix290 | UI・画面 |  |
| 122 | fix291 | `v292Dfix291-saveexport.js` | i122 | `3ece608e` | v292Dfix721 | 保存・同期 |  |
| 123 | fix292 | `v292Dfix292-health.js` | i123 | `330545d5` | v292Dfix398 | UI・画面 |  |
| 124 | fix295 | `v292Dfix295-convlog-stability.js` | i124 | `3e3c528b` | v292Dfix295d | 話者・会話ログ |  |
| 125 | fix297 | `v292Dfix297-ai-instructions.js` | i125 | `9de10919` | 20260901-fix783 | 文章品質・プロンプト | `v292Dfix783Off` |
| 126 | fix300 | `v292Dfix300-readability.js` | i126 | `ac3a0993` | v292Dfix419c | 文章品質・プロンプト | `v292Dfix300Off` |
| 127 | fix301 | `v292Dfix301-longmem-stale-guard.js` | i127 | `a740bd94` | v292Dfix301 | 記憶 | `v292Dfix301Off` |
| 128 | fix302 | `v292Dfix302-undo-state-rollback.js` | i128 | `75fd08d4` | 20261009-bh1 | NPC・キャラ状態 | `v292Dfix302Off` `v292Dfix926Off` |
| 129 | fix732 | `v292Dfix732-session-turn-scope.js` | i129 | `13991982` | v292Dfix732 | （未分類） |  |
| 130 | fix303 | `v292Dfix303-speaker-backref.js` | i130 | `0850a3af` | 20260829-fix748 | 話者・会話ログ | `v292Dfix303Off` |
| 131 | fix304 | `v292Dfix304-emotion.js` | i131 | `18b944a7` | v292Dfix419c | NPC・キャラ状態 | `v292Dfix304Off` |
| 132 | fix305 | `v292Dfix305-trigger-states.js` | i132 | `1e1d23c9` | v292Dfix305 | NPC・キャラ状態 | `v292Dfix305Off` |
| 133 | fix306 | `v292Dfix306-npc-liveliness.js` | i133 | `f60ae3fb` | v292Dfix738 | NPC・キャラ状態 | `v292Dfix306Off` |
| 134 | fix764 | `v292Dfix764-name-variant-fold.js` | i134 | `78be3ba8` | v292Dfix764 | NPC・キャラ状態 | `v292Dfix764Off` |
| 135 | fix830 | `v292Dfix830-entity-match-resolver.js` | i135 | `34dd81e4` | 20260907-fix832 | NPC・キャラ状態 | `v292Dfix764Off` `v292Dfix830Off` |
| 136 | fix766 | `v292Dfix766-canonical-appearance.js` | i136 | `960c7d11` | 20261019-bundle31-a | 認証・アカウント | `v292Dfix766Off` `v292Dfix766On` `v292Dfix776Off` `v292Dfix778Off` |
| 137 | fix983 | `v292Dfix983-appearance-dict.js` | i137 | `e63a1b85` | 20261019-bundle31-a | アイコン・画像 |  |
| 138 | fix767 | `v292Dfix767-icon-recipe-adapter.js` | i138 | `05be1ba0` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix769Off` `v292Dfix770Off` `v292Dfix773Off` `v292Dfix774Off` |
| 139 | fixRC | `v292DfixRC-regen-candidate.js` | i139 | `ee717776` | 20261019-bundle31-a | アイコン・画像 | `v292DfixRCOff` |
| 140 | fix307 | `v292Dfix307-npc-roster.js` | i140 | `bada1da9` | 20261009-bh1 | NPC・キャラ状態 | `v292Dfix307Off` `v292Dfix307fOff` |
| 141 | fixSC1 | `v292DfixSC1-sidecar-eligibility.js` | i141 | `b1b3b546` | 20261009-bh1 | （未分類） | `v292DfixSC1Off` `v292DfixSC1On` |
| 142 | fixGQ4 | `v292DfixGQ4-summary-request.js` | i142 | `d98338e2` | 20261010-gq1 | 記憶 | `v292DfixGQ4Off` `v292DfixGQ4On` |
| 143 | fixCTX | `v292DfixCTX-context-restore.js` | i143 | `80e1aec4` | 20261010-gq1 | 記憶 | `v292DfixCTXOff` `v292DfixCTXOn` |
| 144 | fixRC1 | `v292DfixRC1-recall-inputs.js` | i144 | `eb5b13e5` | 20261022-bundle42-a | 記憶 | `v292DfixRC1Off` `v292DfixRC1On` |
| 145 | fixCP1 | `v292DfixCP1-scene-presence.js` | i145 | `5ef63c79` | 20261025-bundle47-cp1r-c | NPC・キャラ状態 | `v292DfixCP1Off` `v292DfixCP1On` |
| 146 | fix308 | `v292Dfix308-creepy-toggle.js` | i146 | `c198ae9f` | v292Dfix308 | 文章品質・プロンプト | `v292Dfix308Disable` |
| 147 | fix309 | `v292Dfix309-progression.js` | i147 | `dd7bc61c` | v292Dfix419c | NPC・キャラ状態 | `v292Dfix309Off` |
| 148 | fix579 | `v292Dfix579-tombstone-schema.js` | i148 h18 | `fcdbf7df` | v292Dfix588 | 削除・墓標 |  |
| 149 | fix587 | `v292Dfix587-story-lifecycle.js` | i149 h26 | `34b53284` | 20261020-bundle35-b | 削除・墓標 | `v292Dfix587Off` `v292Dfix708Off` `v292DfixDP1Off` |
| 150 | fix602 | `v292Dfix602-tombstone-write-shadow.js` | i150 h28 | `625d0bf2` | v292Dfix602 | 削除・墓標 | `v292Dfix602ShadowOff` |
| 151 | fix577 | `v292Dfix577-delete-entry-guard.js` | i151 | `08fdce73` | v292Dfix577 | 削除・墓標 | `v292Dfix577Off` |
| 152 | fix310 | `v292Dfix310-gallery.js` | i152 | `85178fee` | 20261009-p8b2 | アイコン・画像 | `v292DcoverExtOn` `v292Dfix310Off` |
| 153 | fix933 | `v292Dfix933-beta-delete-off.js` | i153 h27 | `844607ec` | 20261019-bundle31-a | 削除・墓標 | `v292Dfix933Off` |
| 154 | fixDL2 | `v292DfixDL2-server-delete.js` | i154 h32 | `34507755` | 20261020-bundle35-b | 削除・墓標 | `v292DfixDL2Off` `v292DfixDP3On` `v292DfixDP4Off` |
| 155 | fix313 | `v292Dfix313-story-cards.js` | i155 | `1a5ff334` | 20261019-bundle31-a | 記憶 | `v292Dfix313Off` `v292Dfix951Off` `v292Dfix954Off` `v292Dfix954On` |
| 156 | fix314 | `v292Dfix314-memory.js` | i156 | `977ccdf0` | 20260829-fix748 | 記憶 | `v292Dfix314Off` |
| 157 | fix315 | `v292Dfix315-see.js` | i157 | `166d3ac5` | v292Dfix315b2 | アイコン・画像 |  |
| 158 | fix316 | `v292Dfix316-gallery-search.js` | i158 | `8010df68` | v292Dfix316 | アイコン・画像 | `v292Dfix316Off` |
| 159 | fix317 | `v292Dfix317-slot-leak.js` | i159 | `50557366` | 20260901-fix783 | 保存・同期 | `v292Dfix317Off` `v292Dfix783Off` |
| 160 | fix318 | `v292Dfix318-perslot-len-creepy.js` | i160 | `5fcd8478` | 20260901-fix783 | 保存・同期 | `v292Dfix318Off` `v292Dfix783Off` |
| 161 | fix322 | `v292Dfix322-state-line-strip.js` | i161 | `d1c1d809` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix322Off` |
| 162 | fix323 | `v292Dfix323-boundary-guards.js` | i162 | `0e868be8` | v292Dfix419c | 文章品質・プロンプト | `v292Dfix323Off` |
| 163 | fix324 | `v292Dfix324-show-dont-tell.js` | i163 | `cb420c8d` | v292Dfix419c | 文章品質・プロンプト | `v292Dfix324Off` |
| 164 | fix325 | `v292Dfix325-state-rederive.js` | i164 | `c6841692` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix325Off` `v292Dfix894Off` |
| 165 | fix326 | `v292Dfix326-story-scroll.js` | i165 | `ae9e2108` | v292Dfix326 | UI・画面 | `v292Dfix326Off` |
| 166 | fix327 | `v292Dfix327-turn-counter.js` | i166 | `f6c82db7` | v292Dfix327 | UI・画面 | `v292Dfix327Off` |
| 167 | fix328 | `v292Dfix328-google-login.js` | i167 | `378383bd` | 20260908-fix837 | 認証・アカウント | `v292Dfix831Off` `v292Dfix835Off` `v292Dfix837Off` |
| 168 | fix298 | `v292Dfix298-roster.js` | i168 | `e615c276` | 20261001-ac34 | NPC・キャラ状態 | `v292Dfix298Off` `v292Dfix783Off` `v292DlbRosterAuthOff` |
| 169 | fix330 | `v292Dfix330-somatic-guard.js` | i169 | `7222de72` | v292Dfix419c | NPC・キャラ状態 | `v292Dfix330Off` |
| 170 | fix332 | `v292Dfix332-uifold.js` | i170 | `d4eed8fa` | v292Dfix332 | UI・画面 |  |
| 171 | fix333 | `v292Dfix333-actor-reality.js` | i171 | `5a1f258e` | 20261023-bundle43a-r2 | NPC・キャラ状態 | `v292Dfix333HeroLabelOff` `v292Dfix333Off` `v292Dfix333SelOnceOff` `v292Dfix927Off` |
| 172 | fix334 | `v292Dfix334-entryhub.js` | i172 | `36b8568a` | 20261021-bundle37-a | シナリオ・ホーム | `v292DfixB37eOff` |
| 173 | fix880 | `v292Dfix880-settings-fold.js` | i173 | `d6a1b061` | 20260919-sp10a | UI・画面 | `v292Dfix880Off` |
| 174 | fix881 | `v292Dfix881-public-strings.js` | i174 | `7f0e75f1` | 20260921-sp18r2 | 認証・アカウント | `v292Dfix881Off` |
| 175 | fix884 | `v292Dfix884-byok-dev-only.js` | i175 | `f5cfe849` | 20260919-sp14 | 認証・アカウント | `v292Dfix884Off` |
| 176 | fix335 | `v292Dfix335-omakase.js` | i176 h37 | `b986073b` | v292Dfix335k | シナリオ・ホーム |  |
| 177 | fix351 | `v292Dfix351-settings-draft.js` | i177 | `ba802aca` | 20261008-int1 | UI・画面 | `v292Dfix351Off` `v292Dfix351dOff` |
| 178 | fix352 | `v292Dfix352-hero-placeholder.js` | i178 | `2f89677d` | v292Dfix352 | NPC・キャラ状態 | `v292Dfix352Off` |
| 179 | fix353 | `v292Dfix353-omakase-fill-rest.js` | i179 | `a6e99b70` | v292Dfix353 | シナリオ・ホーム | `v292Dfix353Off` |
| 180 | fix354 | `v292Dfix354-default-model.js` | i180 | `d20657ac` | 20260913-dsmrc1 | モデル・API | `v292Dfix354Off` |
| 181 | fix355 | `v292Dfix355-selector-cleanup.js` | i181 | `7fa6a56c` | 20260829-fix748 | UI・画面 | `v292Dfix355Off` |
| 182 | fix359 | `v292Dfix359-gender-avatar.js` | i182 | `64ef641c` | v292Dfix359 | アイコン・画像 | `v292Dfix359Off` |
| 183 | fix360 | `v292Dfix360-seed-ux.js` | i183 | `a0355998` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix360Off` |
| 184 | fix361 | `v292Dfix361-phaseb-preview.js` | i184 | `0ad7e105` | v292Dfix361 | シナリオ・ホーム |  |
| 185 | fix363 | `v292Dfix363-player-seed.js` | i185 | `648c3a3e` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix363Off` |
| 186 | fix364 | `v292Dfix364-reset-help.js` | i186 | `593e0057` | v292Dfix365 | UI・画面 | `v292Dfix364Off` |
| 187 | fix366 | `v292Dfix366-cast-gender.js` | i187 | `dbaadf16` | v292Dfix369 | NPC・キャラ状態 | `v292Dfix366Off` |
| 188 | fix370 | `v292Dfix370-model-guard.js` | i188 | `210a5e98` | 20260913-dsmrc1 | UI・画面 | `v292Dfix370Off` |
| 189 | fix371 | `v292Dfix371-reset-dialog-text.js` | i189 | `5720d35d` | v292Dfix371 | 文章品質・プロンプト | `v292Dfix371Off` |
| 190 | fix372 | `v292Dfix372-gender-radio-guard.js` | i190 | `867ce977` | v292Dfix372 | NPC・キャラ状態 | `v292Dfix372Off` |
| 191 | fix374 | `v292Dfix374-default-style-guard.js` | i191 | `635abe5a` | 20260901-fix783 | UI・画面 | `v292Dfix374Off` `v292Dfix783Off` |
| 192 | fix376 | `v292Dfix376-speaker-guard.js` | i192 | `c282fa65` | 20260902-fix800 | 話者・会話ログ | `v292Dfix376Off` `v292Dfix469Off` |
| 193 | fix377 | `v292Dfix377-voice-anchor.js` | i193 | `442efa8b` | 20261010-gq1 | 話者・会話ログ | `v292Dfix377COff` `v292Dfix377Off` `v292DfixGQ1aOff` `v292DfixGQ1bOff` |
| 194 | fix378 | `v292Dfix378-species-judge.js` | i194 | `c0e2fa1f` | v292Dfix378 | NPC・キャラ状態 | `v292Dfix378Off` |
| 195 | fix379 | `v292Dfix379-wrap-keeper.js` | i195 | `36077976` | v292Dfix646 | 文章品質・プロンプト | `v292Dfix363Off` `v292Dfix366Off` `v292Dfix376Off` `v292Dfix377Off` |
| 196 | fix822 | `v292Dfix822-start-rules-block.js` | i196 | `45f8e559` | 20260906-fix822 | 文章品質・プロンプト | `v292Dfix822Off` |
| 197 | fix381 | `v292Dfix381-reaction.js` | i197 | `eeaf39ce` | v292Dfix381 | NPC・キャラ状態 | `v292Dfix381Off` |
| 198 | fix382 | `v292Dfix382-auto-dial.js` | i198 | `329ba7a6` | 20260901-fix783 | 文章品質・プロンプト | `v292Dfix382Off` `v292Dfix783Off` |
| 199 | fix383 | `v292Dfix383-vocative-fix.js` | i199 | `b8ed502d` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix383Off` `v292Dfix972Off` |
| 200 | fix384 | `v292Dfix384-auto-restore.js` | i200 | `e38b334e` | 20260901-fix783 | 保存・同期 | `v292Dfix382Off` `v292Dfix384Off` `v292Dfix783Off` |
| 201 | fix385 | `v292Dfix385-voice-correction.js` | i201 | `a8bf77a1` | v292Dfix385 | 話者・会話ログ | `v292Dfix385Off` |
| 202 | fix386 | `v292Dfix386-relation-gauge.js` | i202 | `caee1459` | v292Dfix386b | NPC・キャラ状態 | `v292Dfix386HeroOff` `v292Dfix386Off` |
| 203 | fix387 | `v292Dfix387-confession.js` | i203 | `a7c89168` | v292Dfix387 | NPC・キャラ状態 | `v292Dfix387Off` |
| 204 | fix388 | `v292Dfix388-first-person-speaker.js` | i204 | `f1b8de3f` | 20260829-fix748 | 話者・会話ログ | `v292Dfix388Off` |
| 205 | fix389 | `v292Dfix389-npc-relations.js` | i205 | `454756f8` | v292Dfix389 | NPC・キャラ状態 | `v292Dfix389Off` |
| 206 | fix390 | `v292Dfix390-speaker-fullname.js` | i206 | `5c5a6623` | 20260829-fix748 | 話者・会話ログ | `v292Dfix390Off` |
| 207 | fix393 | `v292Dfix393-restyle-unify.js` | i207 | `22a0d356` | 20261021-laneE-a | アイコン・画像 | `v292Dfix393Off` |
| 208 | fix395 | `v292Dfix395-default-darkanime.js` | i208 | `ffd1364b` | 20260901-fix783 | アイコン・画像 | `v292Dfix395Off` `v292Dfix783Off` |
| 209 | fix398 | `v292Dfix398-scream-attribution.js` | i209 | `dd510800` | v292Dfix496 | 話者・会話ログ | `v292Dfix398Off` |
| 210 | fix399 | `v292Dfix399-cloudsync.js` | i210 | `fa028ed2` | 20261014-iso2b | 保存・同期 | `v292DbbhOff` `v292Dfix399AutoOff` `v292Dfix399Off` `v292Dfix399SelfHealOn` |
| 211 | fix400 | `v292Dfix400-img-url.js` | i211 | `442fe5d2` | 20261014-iso1c | アイコン・画像 | `v292Dfix400Off` `v292Dfix837Off` |
| 212 | fix336 | `v292Dfix336-proxy-sentinel-fix.js` | i212 | `3b41d7ad` | 20261006-a0 | 認証・アカウント | `v292Dfix336MemOnlyOff` `v292Dfix336Off` `v292Dfix837Off` `v292Dfix841Off` |
| 213 | fix338 | `v292Dfix338-artstyle.js` | i213 | `d16e7eef` | 20260829-fix748 | アイコン・画像 | `v292Dfix338Off` `v292Dfix396Off` `v292Dfix429Off` `v292Dfix461Off` |
| 214 | fix346 | `v292Dfix346-idb-avatars.js` | i214 | `4f6ac713` | 20261014-iso1c | アイコン・画像 | `v292Dfix346Off` |
| 215 | fix356 | `v292Dfix356-avatar-eager.js` | i215 | `c89ecbad` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix356EagerOff` `v292Dfix450Off` `v292Dfix977Off` |
| 216 | fix402 | `v292Dfix402-invisible-sync.js` | i216 | `0771aa4a` | 20261019-bundle31-a | 保存・同期 | `v292DbbhOff` `v292Dfix399AutoOff` `v292Dfix402Off` `v292Dfix402On` |
| 217 | fix405 | `v292Dfix405-state-freshness.js` | i217 | `e0e7e38b` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix405D1SuppressOff` `v292Dfix405Off` `v292Dfix405SlimOff` `v292Dfix962Off` |
| 218 | fix406 | `v292Dfix406-automode.js` | i218 | `4a563296` | v292Dfix417d | UI・画面 | `v292Dfix406Off` |
| 219 | fix407 | `v292Dfix407-load-noconfirm.js` | i219 | `9287401c` | v292Dfix407 | UI・画面 | `v292Dfix407Off` |
| 220 | fix409 | `v292Dfix409-handle-merge.js` | i220 | `297d7f30` | 20260901-fix784 | 保存・同期 | `v292Dfix409Off` `v292Dfix409bOff` `v292Dfix409cOff` `v292Dfix783Off` |
| 221 | fix414 | `v292Dfix414-constraint-engine.js` | i221 | `fdad99f5` | v292Dfix428 | NPC・キャラ状態 | `v292Dfix414Off` |
| 222 | fix77X | `v292Dfix77X-clear.js` | i222 | `71551453` | 20261019-bundle31-a | NPC・キャラ状態 |  |
| 223 | fix415 | `v292Dfix415-opening-mask.js` | i223 | `93e0d740` | v292Dfix415b | 文章品質・プロンプト | `v292Dfix415Off` |
| 224 | fix416 | `v292Dfix416-pain-style.js` | i224 | `7e4a98de` | v292Dfix428 | NPC・キャラ状態 | `v292Dfix416Off` `v292Dfix425Off` |
| 225 | fix417 | `v292Dfix417-reaction-unified.js` | i225 | `84166817` | v292Dfix426 | NPC・キャラ状態 | `v292Dfix379V4Off` `v292Dfix417Off` `v292Dfix425Off` |
| 226 | fix418 | `v292Dfix418-genkeep.js` | i226 | `a9c5e3a0` | v292Dfix418 | 文章品質・プロンプト | `v292Dfix418Off` |
| 227 | fix420 | `v292Dfix420-stylelora.js` | i227 | `510ea41b` | v292Dfix420v2 | アイコン・画像 | `v292Dfix420Off` |
| 228 | fix474 | `v292Dfix474-candidate.js` | i228 | `d68cac44` | 20261002-ac36 | アイコン・画像 |  |
| 229 | fix475 | `v292Dfix475-recipe-v3.js` | i229 | `f4cf5808` | v292Dfix486 | アイコン・画像 | `v292Dfix471Off` `v292Dfix471On` `v292Dfix475Off` |
| 230 | fix477 | `v292Dfix477-autocomplete-off.js` | i230 | `6ec39ad3` | v292Dfix477 | UI・画面 | `v292Dfix477Off` |
| 231 | fix478 | `v292Dfix478-imggen-retry.js` | i231 | `a51c89af` | v292Dfix478b | アイコン・画像 | `v292Dfix478Off` |
| 232 | fix491 | `v292Dfix491-imggen-freefallback.js` | i232 | `b0cf90ad` | v292Dfix491v4 | アイコン・画像 | `v292Dfix491Off` |
| 233 | fix476 | `v292Dfix476-pipeline.js` | i233 | `05f41bdf` | v292Dfix779 | アイコン・画像 | `v292Dfix476Off` `v292Dfix779Off` |
| 234 | fix481 | `v292Dfix481-provider-switch.js` | i234 | `f9ed6537` | v292Dfix481 | アイコン・画像 | `v292Dfix481Off` |
| 235 | fix483 | `v292Dfix483-genbudget-sync.js` | i235 | `29ccca69` | v292Dfix495 | 保存・同期 | `v292Dfix483Off` `v292Dfix483gbOff` |
| 236 | fix427 | `v292Dfix427-output-sanitize.js` | i236 | `f57387e8` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix427Off` `v292Dfix427TailOff` `v292Dfix975Off` |
| 237 | fix430 | `v292Dfix430-carrier-block.js` | i237 | `d74e943a` | v292Dfix430 | アイコン・画像 | `v292Dfix430Off` |
| 238 | fix436 | `v292Dfix436-seed-expand.js` | i238 h36 | `ff50b6f7` | 20261021-bundle37-a | シナリオ・ホーム | `v292Dfix436Off` `v292Dfix855Off` `v292DfixB37cOff` |
| 239 | fix437 | `v292Dfix437-regen-instant.js` | i239 | `cadb419f` | 20261002-ac36 | アイコン・画像 | `v292Dfix437Off` |
| 240 | fix438 | `v292Dfix438-inline-dialogue.js` | i240 | `7e44532e` | 20261019-bundle31-a | 話者・会話ログ | `v292Dfix438Off` `v292Dfix959Off` |
| 241 | fix439 | `v292Dfix439-readability.js` | i241 | `cec796ef` | v292Dfix457 | 文章品質・プロンプト | `v292Dfix439Off` |
| 242 | fix440 | `v292Dfix440-block-rescue.js` | i242 | `7c10214d` | 20261021-bundle38-b | 文章品質・プロンプト | `v292Dfix440Off` `v292DfixB38Off` |
| 243 | fix500 | `v292Dfix500-sys-dedup.js` | i243 | `3d792742` | v292Dfix500 | 文章品質・プロンプト | `v292Dfix500Off` |
| 244 | fix509 | `v292Dfix509-sys-consolidate.js` | i244 | `f0685e61` | v292Dfix509 | 文章品質・プロンプト | `v292Dfix509Off` |
| 245 | fix510 | `v292Dfix510-sys-p1-style.js` | i245 | `0f8e8762` | v292Dfix513 | 文章品質・プロンプト | `v292Dfix510Off` |
| 246 | fix512 | `v292Dfix512-say-attribution.js` | i246 | `010a7a8f` | v292Dfix512 | 話者・会話ログ | `v292Dfix512Off` |
| 247 | fix514 | `v292Dfix514-say-fullname.js` | i247 | `8f0cf53d` | v292Dfix514 | 話者・会話ログ | `v292Dfix514Off` |
| 248 | fix441 | `v292Dfix441-sys-at-send.js` | i248 | `868917f9` | v292Dfix514 | 文章品質・プロンプト | `v292Dfix441Off` |
| 249 | fix442 | `v292Dfix442-folklore.js` | i249 | `d7940bcd` | v292Dfix442 | 文章品質・プロンプト | `v292Dfix442Off` |
| 250 | fix443 | `v292Dfix443-drama-rescue.js` | i250 | `16a897f5` | v292Dfix443 | 文章品質・プロンプト | `v292Dfix443Off` |
| 251 | fix483 | `v292Dfix483-beat-director.js` | i251 | `2be886d6` | v292Dfix483 | 文章品質・プロンプト | `v292Dfix483Off` |
| 252 | fix444 | `v292Dfix444-world-law.js` | i252 | `39d1eeb9` | 20261014-iso2b-c953r3 | NPC・キャラ状態 | `v292Dfix444Off` `v292Dfix444gOff` `v292Dfix451Off` |
| 253 | fix445 | `v292Dfix445-handle-lock.js` | i253 | `a3e972f8` | 20260901-fix784 | 保存・同期 | `v292Dfix445LabelOff` `v292Dfix445Off` `v292Dfix445SpkOff` `v292Dfix445WiOff` |
| 254 | fix446 | `v292Dfix446-fill-robust.js` | i254 | `ab8f1d41` | v292Dfix446 | 文章品質・プロンプト | `v292Dfix446Off` |
| 255 | fix447 | `v292Dfix447-json-force.js` | i255 | `38463b2c` | v292Dfix447 | 文章品質・プロンプト | `v292Dfix447Off` |
| 256 | fix448 | `v292Dfix448-genloading.js` | i256 | `f5fc2bfb` | v292Dfix448 | UI・画面 | `v292Dfix448Off` |
| 257 | fix453 | `v292Dfix453-src-coalesce.js` | i257 | `b82f3cb8` | v292Dfix453 | 文章品質・プロンプト | `v292Dfix453Off` |
| 258 | fix454 | `v292Dfix454-dash.js` | i258 | `868cca04` | v292Dfix457 | 文章品質・プロンプト | `v292Dfix454Off` |
| 259 | fix458 | `v292Dfix458-dash-post.js` | i259 | `5f9a8424` | 20260901-fix784 | 文章品質・プロンプト | `v292Dfix458Off` `v292Dfix625Off` `v292Dfix760Off` `v292Dfix762Off` |
| 260 | fix459 | `v292Dfix459-sys-v2.js` | i260 | `8243a236` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix459AOff` `v292Dfix459BOff` `v292Dfix459COff` `v292Dfix459DOff` |
| 261 | fix460 | `v292Dfix460-slotgrid.js` | i261 | `7b19dfd7` | v292Dfix460 | 保存・同期 | `v292Dfix460Off` |
| 262 | fix461 | `v292Dfix461-appearance-en.js` | i262 | `775fcc85` | 20261002-ac36 | アイコン・画像 | `v292Dfix461Off` `v292Dfix461V21Off` `v292Dfix461V21On` |
| 263 | fix462 | `v292Dfix462-bare-speaker.js` | i263 | `e2c7f062` | 20260829-fix748 | 話者・会話ログ | `v292Dfix462Off` `v292Dfix469Off` |
| 264 | fix463 | `v292Dfix463-human-guard.js` | i264 | `02f85257` | v292Dfix463 | NPC・キャラ状態 | `v292Dfix463Off` |
| 265 | fix464 | `v292Dfix464-say-promote.js` | i265 | `518f21b3` | v292Dfix465 | 話者・会話ログ | `v292Dfix464Off` |
| 266 | fix465 | `v292Dfix465-role-who.js` | i266 | `4754d718` | 20260829-fix748 | 話者・会話ログ | `v292Dfix465Off` |
| 267 | fix466 | `v292Dfix466-dup-say.js` | i267 | `bbe05320` | v292Dfix466 | 話者・会話ログ | `v292Dfix466Off` |
| 268 | fix467 | `v292Dfix467-readability-rules.js` | i268 | `cf5dcbb3` | v292Dfix468 | 文章品質・プロンプト | `v292Dfix467Off` |
| 269 | fix468 | `v292Dfix468-gen-timing.js` | i269 | `37f638a7` | v292Dfix468 | UI・画面 | `v292Dfix468Off` |
| 270 | fix469 | `v292Dfix469-speaker-score.js` | i270 | `d968b745` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix469DropOn` `v292Dfix469Off` `v292Dfix469TagGuardOff` `v292Dfix469ToneFlipOff` |
| 271 | fix680 | `v292Dfix680-bare-speaker-provenance.js` | i271 | `653cc57c` | 20260829-fix748 | 話者・会話ログ | `v292Dfix680Off` `v292Dfix680On` |
| 272 | fix681 | `v292Dfix681-player-say-claim.js` | i272 | `a9683dc8` | 20260829-fix748 | 話者・会話ログ | `v292Dfix681Off` |
| 273 | fix606 | `v292Dfix606-speaker-provenance.js` | i273 | `77950540` | v292Dfix630 | 話者・会話ログ | `v292Dfix606Off` |
| 274 | fix611 | `v292Dfix611-speaker-gate.js` | i274 | `6795a98e` | v292Dfix630 | 話者・会話ログ | `v292Dfix611SpeakerGateOff` `v292Dfix619ReconcilerOff` |
| 275 | fix957 | `v292Dfix957-speaker-cataphora.js` | i275 | `ad2d8bff` | 20261022-bundle41-a | 話者・会話ログ | `v292Dfix957Off` `v292Dfix957On` `v292Dfix974Off` `v292DfixSP1BOff` |
| 276 | fix620 | `v292Dfix620-speaker-apply.js` | i276 | `3d4a774e` | 20261025-bundle55-sfl-a | 話者・会話ログ | `v292Dfix620ApplyOff` `v292Dfix783Off` |
| 277 | fix616 | `v292Dfix616-say-provenance-persist.js` | i277 | `4bf42e71` | 20260829-fix748 | 話者・会話ログ | `v292Dfix616Off` |
| 278 | fix805 | `v292Dfix805-speaker-abstain.js` | i278 | `1a3edab6` | 20260905-fix805v2 | 話者・会話ログ | `v292Dfix616Off` `v292Dfix805EphOff` `v292Dfix805Off` `v292Dfix805On` |
| 279 | fix806 | `v292Dfix806-npc-consistency-observer.js` | i279 | `3e1b7a0d` | 20260928-ac13 | NPC・キャラ状態 | `v292Dfix806Off` `v292Dfix806On` `v292DmeOff` |
| 280 | fix816 | `v292Dfix816-posture-transition-observer.js` | i280 | `36244da0` | 20260906-fix816b | NPC・キャラ状態 | `v292Dfix816Off` `v292Dfix816On` |
| 281 | fix624 | `v292Dfix624-degeneration-probe.js` | i281 | `7913f9ff` | v292Dfix630 | 文章品質・プロンプト | `v292Dfix624Off` |
| 282 | fix470 | `v292Dfix470-style-tail.js` | i282 | `87bb7a62` | v292Dfix470e | アイコン・画像 | `v292Dfix338Off` `v292Dfix470Off` `v292Dfix470On` `v292Dfix470WasOn` |
| 283 | fix471 | `v292Dfix471-style-c.js` | i283 | `b0b1bd27` | v292Dfix472 | アイコン・画像 | `v292Dfix338Off` `v292Dfix470Off` `v292Dfix470On` `v292Dfix471Off` |
| 284 | fix472 | `v292Dfix472-icon-protect.js` | i284 | `5e8bb3c5` | v292Dfix472 | アイコン・画像 | `v292Dfix472Off` |
| 285 | fix487 | `v292Dfix487-unknown-guard.js` | i285 | `495ae289` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix487IconOff` |
| 286 | fix488 | `v292Dfix488-nonhuman-detail.js` | i286 | `8960f249` | v292Dfix488b | アイコン・画像 | `v292Dfix488Off` |
| 287 | fix456 | `v292Dfix456-name-space.js` | i287 | `084cb79e` | v292Dfix456 | 話者・会話ログ | `v292Dfix456Off` |
| 288 | fix482 | `v292Dfix482-output-quality.js` | i288 | `895da7e1` | 20261019-bundle31-a | 文章品質・プロンプト | `v292Dfix482Off` `v292Dfix482RetryOff` `v292Dfix482RetryOn` `v292Dfix482mOff` |
| 289 | fix489 | `v292Dfix489-convlog-gate.js` | i289 | `2263d032` | 20260901-fix784 | 話者・会話ログ | `v292Dfix489DropOn` `v292Dfix489Off` `v292Dfix783Off` |
| 290 | fix490 | `v292Dfix490-slot-write-guard.js` | i290 | `874dce71` | v292Dfix565 | 保存・同期 | `v292Dfix490Off` `v292Dfix576Off` |
| 291 | fix492 | `v292Dfix492-genfail-toast.js` | i291 | `bca412ee` | v292Dfix492 | UI・画面 | `v292Dfix492Off` |
| 292 | fix501 | `v292Dfix501-legacy-appearance-probe.js` | i292 | `bd3bb1ca` | v292Dfix501 | アイコン・画像 | `v292Dfix501Off` |
| 293 | fix515 | `v292Dfix515-icon-persist-probe.js` | i293 | `dd96cd56` | v292Dfix515 | アイコン・画像 | `v292Dfix515Off` `v292Dfix515On` |
| 294 | fix516 | `v292Dfix516-regen-local-display.js` | i294 | `115a78e1` | 20261002-ac36 | アイコン・画像 | `v292Dfix516Off` |
| 295 | fix517 | `v292Dfix517-local-authoritative-avatar.js` | i295 | `85ef4054` | 20261002-ac36 | アイコン・画像 | `v292Dfix517Off` |
| 296 | fix519 | `v292Dfix519-icon-p2p.js` | i296 | `2f70451c` | 20260908-fix837 | アイコン・画像 | `v292Dfix519Off` `v292Dfix837Off` |
| 297 | fix523 | `v292Dfix523-icon-sync-versioned.js` | i297 | `1c4cea0e` | 20261019-bundle31-a | アイコン・画像 | `v292Dfix523Off` `v292Dfix837Off` `v292Dfix960Off` |
| 298 | fix525 | `v292Dfix525-slot-ownership.js` | i298 | `8543fc23` | v292Dfix525 | 保存・同期 | `v292Dfix525Off` |
| 299 | fix945 | `v292Dfix945-xtab-stale-guard.js` | i299 | `6c3bad75` | 20261010-rs1 | 保存・同期 | `v292Dfix945EvtOff` `v292Dfix945Off` |
| 300 | fix526 | `v292Dfix526-story-naming.js` | i300 | `d283a91f` | 20260829-fix748 | 保存・同期 | `v292Dfix526Off` |
| 301 | fix631 | `v292Dfix631-avatar-inventory.js` | i301 | `39c65cca` | fix631 | アイコン・画像 | `v292Dfix631Off` |
| 302 | fix632 | `v292Dfix632-img-content-dirty.js` | i302 | `08ed559c` | fix638 | アイコン・画像 | `v292Dfix632Off` |
| 303 | fix633 | `v292Dfix633-icon-sweep-full.js` | i303 | `3c2bdc64` | 20260908-fix837 | アイコン・画像 | `v292Dfix633Live` `v292Dfix633Off` `v292Dfix633Shadow` `v292Dfix655Off` |
| 304 | fix634 | `v292Dfix634-aiappearance-sync.js` | i304 | `be628cfb` | 20261005-c1 | アイコン・画像 | `v292Dfix634Off` `v292Dfix837Off` |
| 305 | fix635 | `v292Dfix635-new-story-guard-rearm.js` | i305 | `ff2bd338` | v292Dfix637 | 保存・同期 | `v292Dfix600Off` `v292Dfix635Off` |
| 306 | fix636 | `v292Dfix636-npc-presence-evidence.js` | i306 | `b5994d3d` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix636Off` |
| 307 | fix637 | `v292Dfix637-cast-bootstrap-probe.js` | i307 | `4094ba14` | 20260829-fix748 | NPC・キャラ状態 | `v292Dfix637Apply` `v292Dfix637Off` |
| 308 | fix638 | `v292Dfix638-pull-image-guard.js` | i308 | `2e24d579` | fix638 | アイコン・画像 | `v292Dfix638BackfillOff` `v292Dfix638LockOff` `v292Dfix638Off` |
| 309 | fix640 | `v292Dfix640-cast-evidence-ledger.js` | i309 | `b927d749` | 20260913-f640pga1 | NPC・キャラ状態 | `v292Dfix640Off` `v292Dfix640PgOff` `v292Dfix640PgOn` `v292Dfix783Off` |
| 310 | fix641 | `v292Dfix641-cast-auto-register.js` | i310 | `e301921a` | 20260926-sp20 | NPC・キャラ状態 | `v292Dfix641Live` `v292Dfix641Off` `v292Dfix765Off` `v292DmeOff` |
| 311 | fix643 | `v292Dfix643-collapse-rescue.js` | i311 | `381c9ce9` | v292Dfix680 | 文章品質・プロンプト | `v292Dfix643Live` `v292Dfix643Off` |
| 312 | fix645 | `v292Dfix645-scene-move-shadow.js` | i312 | `2cb3a791` | 20260912-q119s4 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292Dfix645Off` `v292Dfix647Off` |
| 313 | fix648 | `v292Dfix648-punct-collapse.js` | i313 | `dfb84a03` | 20260912-q119s4 | 文章品質・プロンプト | `v292DQ119PageCanaryOff` `v292DQ119PageCanaryOn` `v292Dfix648Off` |
| 314 | fix650 | `v292Dfix650-rescue-safety.js` | i314 | `9cd0ba28` | v292Dfix680 | 文章品質・プロンプト | `v292Dfix643Live` `v292Dfix650Off` |
| 315 | fix651 | `v292Dfix651-guards.js` | i315 | `296486c0` | v292Dfix680 | 文章品質・プロンプト | `v292Dfix651SlotBackupGuardOff` `v292Dfix651StreamGuardOff` `v292Dfix651ZeroTurnGuardOff` `v292Dfix652StreamGuardAllLive` |
| 316 | fix670 | `v292Dfix670-memory-engine.js` | i316 | `f4902ef3` | 20261001-ac34 | 記憶 | `v292Dfix670Off` `v292Dfix670On` `v292Dfix786Off` `v292Dfix787Off` |
| 317 | fix801 | `v292Dfix801-events-story-adapter.js` | i317 | `96a598db` | 20260903-fix802 | 記憶 |  |
| 318 | fix789 | `v292Dfix789-semantic-adjudication.js` | i318 | `54aa3fe7` | 20260928-ac13 | 記憶 | `v292Dfix670On` `v292Dfix789Off` |
| 319 | fix790 | `v292Dfix790-dedupe-lineage.js` | i319 | `795e2c4a` | 20260930-ac25 | 記憶 | `v292Dfix670On` `v292Dfix790Off` `v292Dfix906Off` `v292Dfix915Off` |
| 320 | fix791 | `v292Dfix791-lineage-relations.js` | i320 | `b4c721b2` | 20260928-ac13 | 記憶 | `v292Dfix670On` `v292Dfix791Off` |
| 321 | fix792 | `v292Dfix792-referent-resolution.js` | i321 | `c11974cd` | 20260929-ac15 | 記憶 | `v292Dfix670On` `v292Dfix792Off` `v292Dfix907Off` |
| 322 | fix793 | `v292Dfix793-memory-canonical.js` | i322 | `6ce684c6` | 20260930-ac25 | 認証・アカウント | `v292Dfix793Off` `v292Dfix793On` `v292Dfix904Off` `v292Dfix915Off` |
| 323 | fix804 | `v292Dfix804-memory-preserve.js` | i323 | `ad1a7ea3` | 20260928-ac13 | 記憶 | `v292Dfix793Off` `v292Dfix793On` `v292Dfix804Off` |
| 324 | fix740 | `v292Dfix740-cap-telemetry.js` | i324 | `a328e139` | v292Dfix740 | NPC・キャラ状態 | `v292Dfix740Off` |
| 325 | fix741 | `v292Dfix741-severity-lane.js` | i325 | `bbc576e3` | v292Dfix741 | NPC・キャラ状態 | `v292Dfix741Off` |
| 326 | fix742 | `v292Dfix742-physical-bridge.js` | i326 | `5c13f1ec` | v292Dfix742 | NPC・キャラ状態 | `v292Dfix742Off` |
| 327 | fix797 | `v292Dfix797-layer2-contradiction.js` | i327 | `346c7119` | 20261025-bundle50-e65d-d | NPC・キャラ状態 | `v292Dfix797N1P2Off` `v292Dfix797N1P2On` `v292Dfix797Off` `v292Dfix797On` |
| 328 | fixE64 | `v292DfixE64-discard-guard.js` | i328 | `cdbc8c70` | 20261025-bundle50-e65d-d | NPC・キャラ状態 | `v292DfixE64Off` `v292DfixE64On` `v292DfixE65DOff` |
| 329 | fix743 | `v292Dfix743-cc2-client.js` | i329 動的 | `dd0106ac` | 20261019-bundle33-b | 保存・同期 | `v292Dfix743Off` `v292DfixCC2Off` `v292DfixCC2On` |
| 330 | fix750 | `v292Dfix750-c1-materialize.js` | i330 | `37b8aa65` | 20261019-bundle31-c | 保存・同期 | `v292Dfix750Off` `v292Dfix750On` `v292DfixM3Off` `v292DfixOrgfOff` |
| 331 | fix756 | `v292Dfix756-new-story-schema2.js` | i331 | `113db1e4` | 20261021-bundle36-a | 保存・同期 | `v292Dfix756Off` `v292Dfix756rOff` `v292Dfix810Off` `v292Dfix810On` |
| 332 | fixJR1 | `v292DfixJR1-journal-retire.js` | i332 h34 | `af07f42a` | 20261021-bundle36-a | 削除・墓標 | `v292DfixJR1Off` |
| 333 | fix758 | `v292Dfix758-cloud-save-pending.js` | i333 | `7f34f1b1` | 20261024-bundle44-b | 保存・同期 | `v292Dfix758Off` `v292Dfix758bOff` `v292Dfix758cOff` |
| 334 | fix844 | `v292Dfix844-provisional-handle-prompt-semantics.js` | i334 | `408757bf` | 20260912-fix844v22 | 記憶 | `v292Dfix844Off` `v292Dfix844On` |
| 335 | fix845 | `v292Dfix845-selfnaming-shadow-observer.js` | i335 | `a6298d05` | 20260913-f845ss1 | 保存・同期 | `v292Dfix783Off` `v292Dfix845Off` |
| 336 | fix850 | `v292Dfix850-turn-local-physical.js` | i336 | `f7c9d872` | 20261001-ac31 | NPC・キャラ状態 | `v292Dfix850Off` `v292Dfix850On` `v292Dfix929Off` `v292Dfix930Off` |
| 337 | fix851 | `v292Dfix851-posture-directive.js` | i337 | `22543ee2` | 20261001-ac33 | NPC・キャラ状態 | `v292Dfix851Off` `v292Dfix851On` `v292Dfix936Off` `v292DrrOff` |
| 338 | fix852 | `v292Dfix852-mental-capability.js` | i338 | `dbd6fffe` | 20261001-ac33 | NPC・キャラ状態 | `v292Dfix852Off` `v292Dfix852On` `v292Dfix936Off` `v292DrrOff` |
| 339 | fix853 | `v292Dfix853-truncated-name-guard.js` | i339 | `14e1e6de` | 20261025-bundle58-npcp1-b | NPC・キャラ状態 | `v292Dfix853Off` `v292Dfix853pOff` `v292DfixA4Off` |
| 340 | av2-portrait | `v292Dav2-portrait.js` | i340 | `c3a24336` | 20261021-laneE-a-lc1-ld1 | アイコン・画像 | `v292Dav2pOff` `v292Dfix993Off` `v292DfixB37aOff` `v292DfixFG1cOff` |
| 341 | fixLD1 | `v292DfixLD1-preset-portrait.js` | i341 | `1beaa8c7` | 20261021-laneD-a | アイコン・画像 | `v292DfixD1Off` `v292DfixLD1On` |
| 342 | fixB37 | `v292DfixB37-onboard.js` | i342 | `1c20fead` | 20261021-laneE-a-lc1 | シナリオ・ホーム | `v292DfixB37bOff` |
| 343 | fixLC1 | `v292DfixLC1-appearance-proposal.js` | i343 | `a012e615` | 20261021-lc1-a | アイコン・画像 | `v292DfixLC1Off` |
| 344 | fixLC1 | `v292DfixLC1-workbench.js` | i344 | `00fbe972` | 20261021-lc1-a | アイコン・画像 | `v292DfixLC1Off` `v292DfixLC1On` |
| 345 | av2-migrate-ui | `v292Dav2-migrate-ui.js` | i345 | `488999e4` | 20261019-bundle31-a | アイコン・画像 | `v292Dav2Off` `v292Dav2On` `v292Dav2mOff` |
| 346 | fg3-artpreset | `v292Dfg3-artpreset.js` | i346 | `5c575d27` | 20261021-bundle37-a | アイコン・画像 | `v292Dfg3Off` `v292DfixB37fOff` |
| 347 | fix886 | `v292Dfix886-public-anon-client.js` | i347 | `0d4b103e` | 20260921-sp16r | 認証・アカウント | `v292Dfix837Off` `v292Dfix841Off` `v292Dfix886Off` `v292Dfix886TurnOff` |
| 348 | fix890 | `v292Dfix890-anon-gate-yield.js` | i348 | `f832fbfc` | 20260920-sp14j | 認証・アカウント |  |
| 349 | fix970 | `v292Dfix970-state-intake-shadow.js` | i349 | `66ae0ba2` | 20261019-bundle31-a | NPC・キャラ状態 | `v292Dfix970Off` `v292Dfix970On` |
| 350 | fixUI1 | `v292DfixUI1-subtract.js` | i350 | `f1abc3e3` | 20261025-bundle54-ui1-a | UI・画面 | `v292DfixUI1AuxOff` `v292DfixUI1DlgOff` `v292DfixUI1LabelOff` `v292DfixUI1MigOff` |
| 351 | fix642 | `v292Dfix642-delete-readback.js` | h29 | `e6a4102d` | 20260927-ac1 | 削除・墓標 | `v292Dfix642Off` |
| 352 | fix710 | `v292Dfix710-home-delete-autoresume.js` | h31 | `38dc93b4` | 20261020-bundle34-a | 削除・墓標 | `v292Dfix708Off` `v292Dfix710Off` |
| 353 | fixB37 | `v292DfixB37-home-menu.js` | h33 | `0bfa028b` | 20261021-bundle37-a | シナリオ・ホーム | `v292DfixB37dOff` |
| 354 | fix819 | `v292Dfix819-story-instantiator.js` | h38 | `b48b4522` | 20261019-bundle31-a | シナリオ・ホーム | `v292Dfix819Off` `v292Dfix871Off` |
| 355 | fix820 | `v292Dfix820-scenario-original-store.js` | h39 | `44d2c23f` | 20261020-bundle35-b | シナリオ・ホーム | `v292Dfix820Off` `v292Dfix868Off` `v292Dfix871Off` `v292Dfix872AutoOff` |
| 356 | fix872 | `v292Dfix872-scenario-cloud-sync.js` | h40 | `d59abecd` | 20261020-bundle35-b | 保存・同期 | `v292Dfix837Off` `v292Dfix872AutoOff` `v292Dfix872Off` `v292Dfix872On` |
| 357 | fix823 | `v292Dfix823-scenario-seed-adapter.js` | h41 | `e86d3a62` | 20260907-schema3 | シナリオ・ホーム | `v292Dfix823Off` |
| 358 | fix829 | `v292Dfix829-seed-text-enrichment.js` | h44 | `6336e81b` | 20260907-fix829r | 文章品質・プロンプト | `v292Dfix829Off` |
| 359 | fix825 | `v292Dfix825-scenario-ui.js` | h45 | `ec3c0b71` | 20261020-bundle35-b | シナリオ・ホーム | `v292Dfix825Off` `v292Dfix872Off` `v292Dfix872On` `v292Dfix966Off` |
| 360 | fix870 | `v292Dfix870-home-entry.js` | h46 | `57c331fd` | 20260919-sp6 | シナリオ・ホーム | `v292Dfix870Off` |
| 361 | fix873 | `v292Dfix873-scenario-creator.js` | h47 | `cc7c42f3` | 20261020-uifix-a | シナリオ・ホーム | `v292Dfix873Off` |
| 362 | fix885 | `v292Dfix885-home-data-fold.js` | h48 | `f1447152` | 20260919-sp14 | シナリオ・ホーム | `v292Dfix885Off` |
| 363 | vault2-ui | `v292Dvault2-ui.js` | h49 | `1a3eba03` | 20261021-bundle37-a | Vault・非表示 | `v292Dfix964Off` `v292DfixB37dOff` `v292Dvault2MsOff` `v292Dvault2UiOff` |

## 付録B　ファイルはあるが読み込まれていないもの（＝本番で動いていない）

| ファイル | 状態 | sha256先頭 | メモ |
|---|---|---|---|
| `v292Dfix52-readability.js` | index.html でコメントアウト（4406 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix62-avatar-fix.js` | index.html でコメントアウト（4417 行目付近） | `d6c08a38` | 廃止扱い。ファイルは残っている |
| `v292Dfix64-conversation-log-restore.js` | index.html でコメントアウト（4421 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix70b-order-convsays.js` | index.html でコメントアウト（4437 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix73-card-dedup.js` | index.html でコメントアウト（4437 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix86-avatar-eager-blob.js` | index.html でコメントアウト（4451 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `v292Dfix89-convlog-cleanup.js` | index.html でコメントアウト（4453 行目付近） | `d8e0b580` | **本番に実体が無い**。手元の配信物の写しは中身が HTML（本番の「無いパスにも index を返す」動作を、2026-10-15 の本番の写し取りで保存してしまったもの） |
| `worker_r4_prod.js` | どこからも読まれない（コメントの中で行番号として言及されるだけ） | `b6f9b3ab` | 旧 Worker のソースの写し。**本番では配信されていない**（2026-11-01 の本番確認で、無いパスと同じ index の応答だった）。手元の配信物の写しにだけ入っている |

- このほか：`scripts.txt`（345 行の古い読込一覧。**現行の読込順ではない**）は本番で実際に配信されている（GitHub のルートにもある）。`_PROVENANCE.txt` は手元の写しにだけあり、本番では配信されていない。どちらも HTML・JS・Worker から参照されていない。
- 手元の配信物の写し（`pages_full.zip`）は、2026-10-15 に本番をブラウザで取得して組み直した木（prod5、348 本）を土台にしている。上の HTML の写し 6 本・旧 Worker の写し・`_PROVENANCE.txt` はその時から入っている。出荷では変わったファイルだけを GitHub に上げるので、これらは GitHub にも本番にも無い。

### inline script（ファイルではなく HTML の中に直接書かれた部品）

- index.html：10 個。[47行目・11748字] [331行目・1235字] [553行目・id=v292DfixEDN-btn・881字] [566行目・id=v292Dfix890-early・3002字] [753行目・13800字] [1009行目・151字] [1033行目・153999字] [3413行目・id=v100-patch・35064字] [4164行目・9509字] [4518行目・38字]
- home.html：3 個。[251行目・1198字] [277行目・749字] [420行目・162047字]
  - index.html の主なもの：1033 行目（約 15 万字）＝ゲーム本体の中核（S・UI・G・保存）、3413 行目 `v100-patch`、553 行目 `v292DfixEDN-btn`（✎ の位置）、566 行目 `v292Dfix890-early`。
## 付録C　スイッチ（localStorage キー）→ それを読む部品（機械抽出）

- 本番で読み込まれる部品と index.html の中に現れる `v292…Off` / `v292…On` の文字列を全部拾ったもの（697 件：Off 626・On 71）。
- 拾っただけなので、**そのキーが実際にどう効くか（全体停止か一部か、既定 ON/OFF のどちらを切り替えるか）は部品のコードで確かめてください**。名前が `Off` で終わらない停止キー（例 `v292SlotGenOff`・`v292EngineUnifyOff`・`v292GoogleLoginOff`）や値で切り替えるキー（例 `v292Dfix333`=`observe`）は一部しか拾えていません。
- 「読む部品」は id（`fix77` など。fix 以外はファイル名）。index.html は inline の中を含む。

- `v292AgendaOff` — fix192
- `v292AiInstrOff` — fix297
- `v292AliasOff` — fix277, fix830, index.html
- `v292AvCarrierGuardOff` — fix237
- `v292BuildGuardOff` — fix274
- `v292ConvlogSoloOff` — features
- `v292ConvStabilityOff` — fix295
- `v292Dav2mOff` — av2
- `v292Dav2Off` — av2
- `v292Dav2On` — av2, bav2
- `v292Dav2pOff` — av2
- `v292DavProvOff` — fix197
- `v292Dbav2Off` — bav2
- `v292DbbhOff` — fix399, fix402
- `v292DbndOff` — av2
- `v292DcoverExtOn` — fix310
- `v292Dfg3Off` — fg3
- `v292Dfix190Off` — features
- `v292Dfix205gOff` — features
- `v292Dfix244F3Off` — fix244
- `v292Dfix247bOff` — fix247b
- `v292Dfix277CaseViewOff` — fix277
- `v292Dfix277rOff` — fix277
- `v292Dfix298Off` — fix298
- `v292Dfix300Off` — fix300
- `v292Dfix301Off` — fix301
- `v292Dfix302Off` — fix302
- `v292Dfix303Off` — fix303
- `v292Dfix304Off` — fix304
- `v292Dfix305Off` — fix305
- `v292Dfix306Off` — fix306
- `v292Dfix307fOff` — fix307
- `v292Dfix307Off` — fix307
- `v292Dfix309Off` — fix309
- `v292Dfix310Off` — fix310
- `v292Dfix313Off` — fix313
- `v292Dfix314Off` — fix314
- `v292Dfix316Off` — fix316
- `v292Dfix317Off` — fix317
- `v292Dfix318Off` — fix318
- `v292Dfix322Off` — fix322
- `v292Dfix323Off` — fix323
- `v292Dfix324Off` — fix324
- `v292Dfix325Off` — fix325
- `v292Dfix326Off` — fix326
- `v292Dfix327Off` — fix327
- `v292Dfix330Off` — fix330
- `v292Dfix333HeroLabelOff` — fix333
- `v292Dfix333Off` — fix333
- `v292Dfix333SelOnceOff` — fix333
- `v292Dfix336MemOnlyOff` — fix336
- `v292Dfix336Off` — fix336
- `v292Dfix338Off` — fix338, fix470, fix471
- `v292Dfix346Off` — fix346
- `v292Dfix351dOff` — fix351
- `v292Dfix351Off` — fix351
- `v292Dfix352Off` — fix352
- `v292Dfix353Off` — fix353
- `v292Dfix354Off` — fix354
- `v292Dfix355Off` — fix355
- `v292Dfix356EagerOff` — fix356
- `v292Dfix359Off` — fix359
- `v292Dfix360Off` — fix360
- `v292Dfix363Off` — fix363, fix379
- `v292Dfix364Off` — fix364
- `v292Dfix366Off` — fix366, fix379
- `v292Dfix370Off` — fix370
- `v292Dfix371Off` — fix371
- `v292Dfix372Off` — fix372
- `v292Dfix374Off` — fix374
- `v292Dfix376Off` — fix376, fix379
- `v292Dfix377COff` — fix377
- `v292Dfix377Off` — fix377, fix379
- `v292Dfix378Off` — fix378
- `v292Dfix379Off` — fix379
- `v292Dfix379V4Off` — fix379, fix417
- `v292Dfix381Off` — fix381
- `v292Dfix382Off` — fix382, fix384
- `v292Dfix383Off` — fix383
- `v292Dfix384Off` — fix384
- `v292Dfix385Off` — fix385
- `v292Dfix386HeroOff` — fix386
- `v292Dfix386Off` — fix386
- `v292Dfix387Off` — fix387
- `v292Dfix388Off` — fix388
- `v292Dfix389Off` — fix389
- `v292Dfix390Off` — fix390
- `v292Dfix393Off` — fix393
- `v292Dfix395Off` — fix395
- `v292Dfix396Off` — fix338
- `v292Dfix398Off` — fix398
- `v292Dfix399AutoOff` — fix399, fix402
- `v292Dfix399Off` — fix399
- `v292Dfix399SelfHealOn` — fix399
- `v292Dfix400Off` — fix400
- `v292Dfix402cOff` — fix402
- `v292Dfix402dOff` — fix402
- `v292Dfix402Off` — fix402
- `v292Dfix402On` — fix402
- `v292Dfix403cOff` — fix197
- `v292Dfix403Off` — fix197
- `v292Dfix405D1SuppressOff` — fix405
- `v292Dfix405Off` — fix405
- `v292Dfix405SlimOff` — fix405
- `v292Dfix406Off` — fix406
- `v292Dfix407Off` — fix407
- `v292Dfix409bOff` — fix409
- `v292Dfix409cOff` — fix409
- `v292Dfix409Off` — fix409
- `v292Dfix410Off` — fix145
- `v292Dfix411Off` — fix197, fix402
- `v292Dfix412Off` — fix197
- `v292Dfix414Off` — fix414
- `v292Dfix415Off` — fix415
- `v292Dfix416Off` — fix416
- `v292Dfix417cOff` — index.html
- `v292Dfix417Off` — fix417
- `v292Dfix418Off` — fix418
- `v292Dfix420Off` — fix420
- `v292Dfix424Off` — fix197
- `v292Dfix425Off` — fix192, fix416, fix417
- `v292Dfix427Off` — fix427
- `v292Dfix427TailOff` — fix427
- `v292Dfix429Off` — fix338
- `v292Dfix430Off` — fix430
- `v292Dfix436Off` — fix436
- `v292Dfix437Off` — fix437
- `v292Dfix438Off` — fix438
- `v292Dfix439Off` — fix439
- `v292Dfix440Off` — fix440
- `v292Dfix441Off` — fix441
- `v292Dfix442Off` — fix442
- `v292Dfix443Off` — fix443
- `v292Dfix444gOff` — fix444
- `v292Dfix444Off` — fix444
- `v292Dfix445LabelOff` — fix445
- `v292Dfix445Off` — fix445
- `v292Dfix445SpkOff` — fix445
- `v292Dfix445WiOff` — fix445
- `v292Dfix446Off` — fix446
- `v292Dfix447Off` — fix447
- `v292Dfix448Off` — fix448
- `v292Dfix450Off` — fix356
- `v292Dfix451Off` — fix444
- `v292Dfix453Off` — fix453
- `v292Dfix454Off` — fix454
- `v292Dfix455Off` — fix66
- `v292Dfix456Off` — fix197, fix445, fix456
- `v292Dfix457Off` — fix197, fix66, fixSFLTap
- `v292Dfix458Off` — fix458
- `v292Dfix459AOff` — fix459
- `v292Dfix459BOff` — fix459
- `v292Dfix459COff` — fix459
- `v292Dfix459DOff` — fix459
- `v292Dfix459Off` — fix459
- `v292Dfix460Off` — fix460
- `v292Dfix461Off` — fix338, fix461
- `v292Dfix461V21Off` — fix461
- `v292Dfix461V21On` — fix461
- `v292Dfix462Off` — fix462
- `v292Dfix463Off` — fix463
- `v292Dfix464Off` — fix464
- `v292Dfix465Off` — fix465
- `v292Dfix466Off` — fix466
- `v292Dfix467Off` — fix467
- `v292Dfix468Off` — fix468
- `v292Dfix469DropOn` — fix469
- `v292Dfix469Off` — fix376, fix462, fix469
- `v292Dfix469TagGuardOff` — fix469
- `v292Dfix469ToneFlipOff` — fix469
- `v292Dfix470Off` — fix470, fix471
- `v292Dfix470On` — fix470, fix471
- `v292Dfix470WasOn` — fix470
- `v292Dfix471Off` — fix471, fix475
- `v292Dfix471On` — fix471, fix475
- `v292Dfix471WasOn` — fix471
- `v292Dfix472Off` — fix472
- `v292Dfix475Off` — fix475
- `v292Dfix476Off` — fix476
- `v292Dfix477Off` — fix477
- `v292Dfix478Off` — fix478
- `v292Dfix480Off` — fix197
- `v292Dfix481Off` — fix481
- `v292Dfix482mOff` — fix482
- `v292Dfix482Off` — fix482
- `v292Dfix482RetryOff` — fix482
- `v292Dfix482RetryOn` — fix482
- `v292Dfix482sOff` — fix482
- `v292Dfix483gbOff` — fix483
- `v292Dfix483Off` — fix483
- `v292Dfix484Off` — fix484
- `v292Dfix487IconOff` — fix487
- `v292Dfix487ListOff` — fix145
- `v292Dfix488Off` — fix488
- `v292Dfix489DropOn` — fix489
- `v292Dfix489Off` — fix489
- `v292Dfix490Off` — fix490
- `v292Dfix491Off` — fix491
- `v292Dfix492Off` — fix492
- `v292Dfix493Off` — fix197
- `v292Dfix499Off` — fix499
- `v292Dfix500Off` — fix500
- `v292Dfix501Off` — fix501
- `v292Dfix504Off` — fix80
- `v292Dfix509Off` — fix509
- `v292Dfix510Off` — fix510
- `v292Dfix512Off` — fix512
- `v292Dfix514Off` — fix514
- `v292Dfix515Off` — fix515
- `v292Dfix515On` — fix515
- `v292Dfix516Off` — fix516
- `v292Dfix517Off` — fix517
- `v292Dfix519Off` — fix519
- `v292Dfix523Off` — fix523
- `v292Dfix525Off` — fix525
- `v292Dfix526Off` — fix526
- `v292Dfix527NoopHomeSaveOff` — fix527
- `v292Dfix527Off` — fix527
- `v292Dfix528Off` — fix277
- `v292Dfix529Off` — fix145
- `v292Dfix532Off` — fix77
- `v292Dfix535Off` — fix469
- `v292Dfix536Off` — fix469
- `v292Dfix537Off` — fix277
- `v292Dfix537PtOff` — fix277
- `v292Dfix537PtOn` — fix277
- `v292Dfix537SlotLogOff` — fix277
- `v292Dfix537SlotLogOn` — fix277
- `v292Dfix538Off` — fix277
- `v292Dfix540Off` — fix277
- `v292Dfix543Off` — fix543
- `v292Dfix553Off` — fix553
- `v292Dfix553PbOff` — fix553
- `v292Dfix553PbOn` — fix553
- `v292Dfix555Off` — fix555
- `v292Dfix562Off` — fix562
- `v292Dfix564Off` — fix564
- `v292Dfix569Off` — fix569
- `v292Dfix573bOff` — fix573
- `v292Dfix573Off` — fix573
- `v292Dfix574DenyOff` — fix569
- `v292Dfix575Off` — fix399
- `v292Dfix576Off` — fix490
- `v292Dfix577Off` — fix577
- `v292Dfix580Off` — fix580
- `v292Dfix582Off` — fix399
- `v292Dfix584Off` — fix402
- `v292Dfix587Off` — fix587
- `v292Dfix588Off` — fix399, fix402, fix527
- `v292Dfix590Off` — fix590
- `v292Dfix600Off` — fix600, fix635
- `v292Dfix602ShadowOff` — fix602
- `v292Dfix604Off` — fix469
- `v292Dfix605Off` — fix399
- `v292Dfix606Off` — fix606
- `v292Dfix610Off` — fix469
- `v292Dfix611SpeakerGateOff` — fix611
- `v292Dfix616Off` — fix616, fix805
- `v292Dfix619ReconcilerOff` — fix611
- `v292Dfix620ApplyOff` — fix620
- `v292Dfix624Off` — fix624
- `v292Dfix625Off` — fix458
- `v292Dfix631Off` — fix631
- `v292Dfix632Off` — fix632
- `v292Dfix633Off` — fix633
- `v292Dfix634Off` — fix634
- `v292Dfix635Off` — fix635
- `v292Dfix636Off` — fix636
- `v292Dfix637Off` — fix637
- `v292Dfix638BackfillOff` — fix638
- `v292Dfix638LockOff` — fix638
- `v292Dfix638Off` — fix638
- `v292Dfix640Off` — fix640
- `v292Dfix640PgOff` — fix640
- `v292Dfix640PgOn` — fix640
- `v292Dfix641Off` — fix641
- `v292Dfix642Off` — fix642
- `v292Dfix643Off` — fix643
- `v292Dfix645Off` — fix645
- `v292Dfix646Off` — fix379
- `v292Dfix647Off` — fix645
- `v292Dfix648Off` — fix648
- `v292Dfix650Off` — fix650
- `v292Dfix651SlotBackupGuardOff` — fix228, fix651
- `v292Dfix651StreamGuardOff` — fix651
- `v292Dfix651ZeroTurnGuardOff` — fix651
- `v292Dfix654Off` — fix654
- `v292Dfix655Off` — fix633
- `v292Dfix658Off` — fix658
- `v292Dfix659Off` — fix659
- `v292Dfix660Off` — fix660
- `v292Dfix670Off` — fix670
- `v292Dfix670On` — fix670, fix789, fix790, fix791, fix792
- `v292Dfix680Off` — fix680
- `v292Dfix680On` — fix680
- `v292Dfix681Off` — fix681
- `v292Dfix694Off` — index.html
- `v292Dfix697Off` — fix697
- `v292Dfix697pOff` — fix697
- `v292Dfix697q2Off` — fix697
- `v292Dfix697qOff` — fix697
- `v292Dfix698Off` — fix698
- `v292Dfix698On` — fix698
- `v292Dfix700Off` — fix700
- `v292Dfix700On` — fix700
- `v292Dfix702MaskOff` — fix702
- `v292Dfix702Off` — fix702
- `v292Dfix702On` — fix702
- `v292Dfix705bdOff` — fix705
- `v292Dfix705Off` — fix705
- `v292Dfix708Off` — fix587, fix710
- `v292Dfix710Off` — fix710
- `v292Dfix71DlgOff` — fix71
- `v292Dfix71DlgOn` — fix71
- `v292Dfix721Off` — fix721
- `v292Dfix726Off` — fix726
- `v292Dfix729Off` — fix729
- `v292Dfix729tOff` — fix697, fix729, fix781
- `v292Dfix740Off` — fix740
- `v292Dfix741Off` — fix741
- `v292Dfix742Off` — fix742
- `v292Dfix743Off` — fix743, fix745
- `v292Dfix745Off` — fix745
- `v292Dfix746Off` — fix746
- `v292Dfix748SaveRefuseOff` — features
- `v292Dfix750Off` — fix745, fix750
- `v292Dfix750On` — fix745, fix750
- `v292Dfix756Off` — fix756
- `v292Dfix756rOff` — fix756
- `v292Dfix757Off` — index.html
- `v292Dfix758bOff` — fix758
- `v292Dfix758cOff` — fix758
- `v292Dfix758Off` — fix758
- `v292Dfix760Off` — fix458
- `v292Dfix761Off` — index.html
- `v292Dfix762Off` — fix458
- `v292Dfix763Off` — fix458
- `v292Dfix764Off` — fix764, fix830
- `v292Dfix765Off` — fix641
- `v292Dfix766Off` — fix766
- `v292Dfix766On` — fix766
- `v292Dfix769Off` — fix767
- `v292Dfix770Off` — fix767
- `v292Dfix773Off` — fix145, fix767
- `v292Dfix774Off` — fix767
- `v292Dfix775Off` — fix767
- `v292Dfix776Off` — fix766, fix767
- `v292Dfix777Off` — fix777
- `v292Dfix778Off` — fix766, fix767
- `v292Dfix779Off` — fix476, fix766
- `v292Dfix781bOff` — fix697, fix781
- `v292Dfix781cOff` — fix697, fix781
- `v292Dfix781Off` — fix705, fix781, fixSFL1
- `v292Dfix783Off` — fix228, fix246, fix277, fix297, fix298, fix317, fix318, fix374, fix382, fix384, fix395, fix409, fix445, fix458, fix469, fix489, fix54, fix620, fix640, fix66, fix766, fix845, index.html
- `v292Dfix786Off` — fix670
- `v292Dfix787Off` — fix670
- `v292Dfix788Off` — fix670
- `v292Dfix789Off` — fix789
- `v292Dfix790Off` — fix790
- `v292Dfix791Off` — fix791
- `v292Dfix792Off` — fix792
- `v292Dfix793Off` — fix793, fix804
- `v292Dfix793On` — fix793, fix804
- `v292Dfix796BackfillOff` — fix796
- `v292Dfix796DedupeOff` — fix796
- `v292Dfix796F1On` — fix796
- `v292Dfix796HonOn` — fix192, fix796
- `v292Dfix796Off` — fix796
- `v292Dfix796On` — fix796
- `v292Dfix796RerOff` — fix796
- `v292Dfix797N1P2Off` — fix797
- `v292Dfix797N1P2On` — fix797
- `v292Dfix797Off` — fix797
- `v292Dfix797On` — fix797
- `v292Dfix802Off` — fix802
- `v292Dfix802On` — fix802
- `v292Dfix803Off` — fix803
- `v292Dfix803On` — fix803
- `v292Dfix804Off` — fix804
- `v292Dfix805EphOff` — fix805
- `v292Dfix805Off` — fix805
- `v292Dfix805On` — fix805
- `v292Dfix806Off` — fix806
- `v292Dfix806On` — fix806
- `v292Dfix807Off` — index.html
- `v292Dfix808Off` — fix66
- `v292Dfix809Off` — fix697
- `v292Dfix810Off` — fix756
- `v292Dfix810On` — fix756
- `v292Dfix811Off` — index.html
- `v292Dfix811On` — index.html
- `v292Dfix812Off` — fix192
- `v292Dfix813Off` — fix192
- `v292Dfix815Off` — fix645
- `v292Dfix816Off` — fix816
- `v292Dfix816On` — fix816
- `v292Dfix818Off` — index.html
- `v292Dfix819Off` — fix819
- `v292Dfix820Off` — fix820
- `v292Dfix821Off` — fix399, fix402
- `v292Dfix821On` — fix399, fix402
- `v292Dfix822Off` — fix822
- `v292Dfix823Off` — fix823
- `v292Dfix825Off` — fix825
- `v292Dfix826Off` — fix826
- `v292Dfix827Off` — fix827
- `v292Dfix828Off` — fix402, fix590
- `v292Dfix829Off` — fix829
- `v292Dfix830Off` — fix830
- `v292Dfix831Off` — fix328
- `v292Dfix832Off` — fix192
- `v292Dfix833Off` — index.html
- `v292Dfix834Off` — features
- `v292Dfix835Off` — fix328
- `v292Dfix837Off` — fix247, fix328, fix336, fix399, fix400, fix402, fix519, fix523, fix633, fix634, fix658, fix697, fix698, fix700, fix702, fix705, fix872, fix886
- `v292Dfix838Off` — fix697, fix705
- `v292Dfix840Off` — fix705
- `v292Dfix841Off` — fix247, fix336, fix705, fix886
- `v292Dfix842Off` — fix697, fix729
- `v292Dfix843Off` — fix843
- `v292Dfix844Off` — fix844
- `v292Dfix844On` — fix844
- `v292Dfix845Off` — fix845
- `v292Dfix846Off` — fix846
- `v292Dfix850Off` — fix850
- `v292Dfix850On` — fix850
- `v292Dfix851Off` — fix851
- `v292Dfix851On` — fix851
- `v292Dfix852Off` — fix852
- `v292Dfix852On` — fix852
- `v292Dfix853Off` — fix853
- `v292Dfix853pOff` — fix853
- `v292Dfix854Off` — fix854
- `v292Dfix855Off` — features, fix436
- `v292Dfix859Off` — fix859
- `v292Dfix860Off` — fix860
- `v292Dfix868Off` — fix820
- `v292Dfix870Off` — fix870
- `v292Dfix871Off` — fix697, fix819, fix820
- `v292Dfix872AutoOff` — fix820, fix872
- `v292Dfix872Off` — fix820, fix825, fix872
- `v292Dfix872On` — fix820, fix825, fix872
- `v292Dfix873Off` — fix873
- `v292Dfix880Off` — fix880, index.html
- `v292Dfix881Off` — fix881, index.html
- `v292Dfix884Off` — fix884, index.html
- `v292Dfix885Off` — fix885
- `v292Dfix886Off` — fix886
- `v292Dfix886TurnOff` — fix886
- `v292Dfix889Off` — fix889, index.html
- `v292Dfix892Off` — fix892
- `v292Dfix893Off` — fix893, vault2
- `v292Dfix894Off` — fix135, fix325
- `v292Dfix895Off` — fix697
- `v292Dfix896Off` — fix705
- `v292Dfix897Off` — fix893
- `v292Dfix898Off` — fix697
- `v292Dfix899bOff` — index.html
- `v292Dfix899Off` — index.html
- `v292Dfix900Off` — fix900
- `v292Dfix901Off` — fix77
- `v292Dfix902Off` — fix889
- `v292Dfix903Off` — fix192
- `v292Dfix904Off` — fix793, fix803
- `v292Dfix905cOff` — fix905
- `v292Dfix905Off` — fix905
- `v292Dfix906Off` — fix790
- `v292Dfix907Off` — fix792
- `v292Dfix908Off` — fix670
- `v292Dfix909bOff` — fix697, fix781
- `v292Dfix909Off` — fix697
- `v292Dfix910cOff` — fix697
- `v292Dfix910Off` — fix697
- `v292Dfix911Off` — fix697, fix705, fix781, fix912
- `v292Dfix912Off` — fix912
- `v292Dfix913Off` — fix697, fix912
- `v292Dfix914Off` — fix697
- `v292Dfix915Off` — fix670, fix790, fix793
- `v292Dfix916Off` — fix705
- `v292Dfix917Off` — fix905
- `v292Dfix918Off` — fix793
- `v292Dfix919Off` — fix670
- `v292Dfix921Off` — fix796
- `v292Dfix922Off` — fix66
- `v292Dfix923Off` — fix80, index.html
- `v292Dfix924Off` — fix697, fix790, fix793, fix796, fix802, fix803
- `v292Dfix925aOff` — fix790, fix793, fix796, fix803
- `v292Dfix925bOff` — fix796
- `v292Dfix925Off` — fix402
- `v292Dfix926Off` — fix302, fix702
- `v292Dfix927Off` — fix333, fix402, fix705, fix781
- `v292Dfix928Off` — fix277, fix697
- `v292Dfix929Off` — fix850
- `v292Dfix930Off` — fix192, fix850
- `v292Dfix932Off` — fix192
- `v292Dfix933Off` — fix933
- `v292Dfix934Off` — fix850
- `v292Dfix936Off` — fix851, fix852
- `v292Dfix938Off` — features, fix77
- `v292Dfix945EvtOff` — fix945
- `v292Dfix945Off` — fix945
- `v292Dfix946M3Off` — fix946, iso2
- `v292Dfix946Off` — fix946, iso2
- `v292Dfix950Off` — fix950
- `v292Dfix951Off` — fix313, fix459
- `v292Dfix952Off` — fix459
- `v292Dfix953Off` — fix953
- `v292Dfix953On` — fix953
- `v292Dfix954Off` — fix313
- `v292Dfix954On` — fix313
- `v292Dfix955Off` — features
- `v292Dfix955On` — features
- `v292Dfix956Off` — fix192
- `v292Dfix956On` — fix192
- `v292Dfix957Off` — fix957
- `v292Dfix957On` — fix957
- `v292Dfix958Off` — fix459
- `v292Dfix959Off` — fix438, index.html
- `v292Dfix960Off` — fix523
- `v292Dfix961Off` — fix77
- `v292Dfix962Off` — fix405
- `v292Dfix962On` — fix405
- `v292Dfix963Off` — fix145
- `v292Dfix964Off` — vault2
- `v292Dfix965Off` — fix766
- `v292Dfix966Off` — fix825
- `v292Dfix967Off` — fix766
- `v292Dfix970Off` — fix970
- `v292Dfix970On` — fix970
- `v292Dfix971Off` — fix482
- `v292Dfix972Off` — fix383
- `v292Dfix974Off` — fix957
- `v292Dfix975Off` — fix427
- `v292Dfix976Off` — fix197
- `v292Dfix977Off` — fix356
- `v292Dfix978Off` — fix197
- `v292Dfix979Off` — fix63
- `v292Dfix980Off` — fix484
- `v292Dfix983FrameOff` — fix767
- `v292Dfix983Off` — fix767
- `v292Dfix990Off` — fix990
- `v292Dfix993Off` — av2
- `v292DfixA1Off` — fix192
- `v292DfixA4Off` — fix853
- `v292DfixB0Off` — fix192
- `v292DfixB0On` — fix192
- `v292DfixB37aOff` — av2
- `v292DfixB37bOff` — fixB37
- `v292DfixB37cOff` — fix436
- `v292DfixB37dOff` — fixB37, vault2
- `v292DfixB37eOff` — fix334
- `v292DfixB37fOff` — fg3
- `v292DfixB38Off` — fix192, fix440
- `v292DfixBCJ1Off` — fix697
- `v292DfixBCJ2Off` — fix697
- `v292DfixBCJ3Off` — fix697
- `v292DfixBF1Off` — fixBF1, smrc1
- `v292DfixBF1On` — fixBF1, smrc1
- `v292DfixCC2Off` — fix743, fix745
- `v292DfixCC2On` — fix743, fix745
- `v292DfixCL1aOff` — fix66
- `v292DfixCL1bOff` — index.html
- `v292DfixCL1cOff` — index.html
- `v292DfixCL1dOff` — index.html
- `v292DfixCL1eOff` — index.html
- `v292DfixCL1fOff` — index.html
- `v292DfixCL1gOff` — fix71
- `v292DfixCL1hOff` — fix72
- `v292DfixCmfOff` — smrc1
- `v292DfixCP1Off` — fixCP1, fixSFL1
- `v292DfixCP1On` — fixCP1
- `v292DfixCTXOff` — fixCTX
- `v292DfixCTXOn` — fixCTX
- `v292DfixD1Off` — fixLD1
- `v292DfixDL2Off` — fixDL2
- `v292DfixDP1Off` — fix587
- `v292DfixDP3On` — fixDL2
- `v292DfixDP4Off` — fixDL2
- `v292DfixE64Off` — fixE64
- `v292DfixE64On` — fixE64
- `v292DfixE65AOff` — index.html
- `v292DfixE65DOff` — fix797, fixE64
- `v292DfixE65Off` — features
- `v292DfixE65On` — features
- `v292DfixEDGOff` — fixEDIT01
- `v292DfixEdit01Off` — fixEDIT01
- `v292DfixEDNBtnOff` — index.html
- `v292DfixFG1cOff` — av2
- `v292DfixGC1Off` — fix912
- `v292DfixGC1On` — fix912
- `v292DfixGQ1aOff` — fix377
- `v292DfixGQ1bOff` — fix377
- `v292DfixGQ1bOn` — fix377
- `v292DfixGQ2Off` — fix192
- `v292DfixGQ3Off` — fix797
- `v292DfixGQ4Off` — fixGQ4
- `v292DfixGQ4On` — fixGQ4
- `v292DfixHK1Off` — fix697
- `v292DfixIS1Off` — fixIS1
- `v292DfixJR1Off` — fixJR1
- `v292DfixKP1Off` — index.html
- `v292DfixKP1On` — index.html
- `v292DfixLC1Off` — fixLC1
- `v292DfixLC1On` — fixLC1
- `v292DfixLD1On` — fixLD1
- `v292DfixLE1pvOff` — av2
- `v292DfixLE2Off` — fix777, fixIS1
- `v292DfixLE3Off` — fixLE3
- `v292DfixLE4Off` — fixLE4
- `v292DfixM3Off` — fix750
- `v292DfixOrgfOff` — fix697, fix750
- `v292DfixOrgOff` — features
- `v292DfixRC1Off` — fixRC1
- `v292DfixRC1On` — fixRC1
- `v292DfixRCOff` — fixRC
- `v292DfixS1AOff` — fix697, fix705
- `v292DfixS1BOff` — fix892
- `v292DfixS1Off` — fixS1
- `v292DfixS4bUiOff` — fix825
- `v292DfixSC1Off` — fixSC1
- `v292DfixSC1On` — fixSC1
- `v292DfixScDateOff` — fix820, fix825
- `v292DfixSFL1Off` — fixSFL1
- `v292DfixSFL1On` — fixSFL1
- `v292DfixSFLTapOff` — fixSFLTap
- `v292DfixSN1aOff` — fix527, fix697
- `v292DfixSN1bOff` — fix697
- `v292DfixSP1BOff` — fix957, index.html
- `v292DfixSP1BOn` — fix957, index.html
- `v292DfixSP1Off` — fix66, fix957, index.html
- `v292DfixUI1AuxOff` — fixUI1
- `v292DfixUI1DlgOff` — fixUI1
- `v292DfixUI1LabelOff` — fixUI1
- `v292DfixUI1MigOff` — fixUI1
- `v292DfixUI1Off` — fixUI1
- `v292DiconS2Off` — fix197
- `v292Diso2Off` — fix399, fix402, iso2
- `v292DknwOff` — av2
- `v292DlbMeAuthOff` — fix670
- `v292DlbRosterAuthOff` — fix298
- `v292DlpsGate1Off` — fix590
- `v292Dlpsid1Off` — fix590
- `v292DmeOff` — fix641, fix670, fix793, fix796, fix802, fix803, fix806, fix905
- `v292DngsOff` — features
- `v292Dp8dOff` — p8d
- `v292DpafOff` — fix399, fix402
- `v292Dpcp1Off` — fix399, fix402
- `v292DpcpOff` — fix399, fix402
- `v292DQ119PageCanaryOff` — fix277, fix553, fix645, fix648, fix74, fix78
- `v292DQ119PageCanaryOn` — fix553, fix645, fix648, fix74, fix78
- `v292DQ119PhaseBOn` — fix553
- `v292Drp1bOff` — fix66
- `v292Drp1Off` — fix138, fix66
- `v292DrrOff` — fix850, fix851, fix852
- `v292Dvault2AB8Off` — vault2
- `v292Dvault2ABOff` — vault2
- `v292Dvault2CopyGateOff` — vault2
- `v292Dvault2F1Off` — vault2
- `v292Dvault2GateOff` — vault2
- `v292Dvault2GKOff` — vault2
- `v292Dvault2MsOff` — vault2
- `v292Dvault2O1Off` — vault2
- `v292Dvault2ODOff` — vault2
- `v292Dvault2UiOff` — vault2
- `v292EngineUnifyOff` — fix226
- `v292GoogleLoginOff` — fix328, fix893
- `v292HealthOff` — fix292
- `v292IconUnifyOff` — fix277
- `v292Lane16Off` — fix885
- `v292MiniExOff` — fix192
- `v292MobileUiOff` — fix290
- `v292ModelSelOff` — fix256
- `v292NcAvRaceOff` — fix239
- `v292NoTagJudgeOff` — index.html
- `v292ProxyOff` — fix247, fix336, fix476, fix491
- `v292PsychMergeOff` — fix244
- `v292PublicAiOff` — fix886
- `v292QuasiCastOff` — fix277
- `v292QuotaGuardOff` — fix228
- `v292ReactVoiceOff` — index.html
- `v292RecentDlgAuthOff` — fix221
- `v292ReconcileOff` — fix66
- `v292ResetModalOff` — features
- `v292SaveExportOff` — fix291, fix721
- `v292ScrollGuardOff` — fix66
- `v292SeedOff` — fix192
- `v292SelfMimicOff` — fix192
- `v292SettingsTabsOff` — fix275
- `v292ShortGateOff` — index.html
- `v292SlotGenOff` — fix228
- `v292SpiceOff` — fix192
- `v292StoreSlotIsoOff` — fix246, fix746
- `v292SuspenseOff` — fix192
- `v292TagFixOff` — index.html
- `v292TooltipsOff` — fix288
- `v292TopbarCollapseOff` — fix243
- `v292TopbarUiOff` — fix270
