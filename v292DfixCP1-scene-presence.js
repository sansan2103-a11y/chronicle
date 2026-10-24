/* v292DfixCP1-scene-presence.js (2026-10-22 CONT-02-FIX CP1-R2・GPT #127-JM → #127-JQ 改訂準拠・Local only)
 * ─ 「今の場面に誰がいるか」の最小の正本（NPC ごとに PRESENT / ABSENT / UNKNOWN）─
 *
 * 背景（CONT02_REPORT.md）: Chronicle には NPC の所在・同席・退場を表す正本が無い。千景の分離は T3 の playerText
 *   「千景はいない」にしか無く、T7 生成時の文脈（recentScenes=直近 2 ターン）からは消えていた。一方 fix192 の
 *   stateBlock は fix77 store の全キャラ行を無条件に注入し、cast 一覧・psychAnchors・objective も「いる」側の信号だった。
 *
 * ■ R2 で変えたこと（GPT #127-JQ 裁定・拘束）
 *   ① scene_move: 主人公が別の場面へ動いたら、旧場面の ABSENT も含めて **全員 UNKNOWN**（r1 は ABSENT を維持していた）。
 *      移動後の ABSENT は、移動後に明示された証拠があるときだけ。UNKNOWN は自動で PRESENT にならない（同行・再入場の明示が要る）。
 *      場面の同一性は <scene_move> タグ（構造化イベント）だけで決め、古い S.scene.loc 文字列は証拠にしない（読まない）。
 *      タグは fix645 と同じ検証（who=hero・to 非空・ev が本文に一字一句ある・ev⊇to・到着語あり・未遂語なし）を通ったものだけ
 *      （window.__v292Dfix645.judge があればそれを使う。無ければ who/to/ev-in-body の最小検証）。
 *   ② 本文（AI 生成の地の文）は v0 では状態を **一切更新しない**（「入ってきた」も「立ち去った」も）。正本を動かすのは
 *      プレイヤーの明示入力（playerText）と検証済みの構造化イベント（scene_move）だけ。AI が捏造した再入場を次ターンの事実にしない。
 *      本文由来の更新は矛盾チェック設計ができるまで保留（proseHints() に読み取り専用の診断だけ残す。保存も注入もしない）。
 *   ③ 1 文字の名前形（「澪」「柊」）は使わない。stable id（character_id）で鍵を持ち、曖昧な表現は UNKNOWN のまま。
 *   ④ 注入は fix192 出力の後処理のまま（入力側の差し替えは stateBlock が fix77 store と fix850x.realStore の 2 経路を読み、
 *      seed は同じ store の「鍵を落とす」、agenda は S.cast.npcs を要求するため、こちらの方が大きくなる＝設計ノート §3 参照）。
 *      その代わり **厳格アンカー**（見出しは丁度 1 回・状態行頭は sys 全体で丁度 1 回・種/自発行は fix192 の実際の書式で始まる行だけ）と
 *      **往復自己検査**（結果から自分の操作を逆適用して元の sys と byte 一致しなければ「無変更」= byte 同一で返す）を入れた。
 *
 * ■ データ（保存場所 = body.scene に ADDED field。新 DB 表・新 sidecar 域・座標モデルは作らない）
 *   S.scene.presenceCP1 = {
 *     v: 1,
 *     sceneId:   '<最後に検証を通った scene_move の to（無ければ "start"）>',
 *     sceneTurn: <その場面が始まった turn index（0 始まり）>,
 *     turnsLen:  <この状態が反映している S.turns.length>,          再構築カーソル（取消・ロールバックで食い違えば再導出）
 *     npcs: { '<stable id>': { name, state:'PRESENT'|'ABSENT'|'UNKNOWN', turn:<最終確認 turn index>, src:<証拠の種類>, ev:'<証拠の抜粋 ≤60字>', scene:'<その時の sceneId>' } }
 *   }
 *   stable id = cast.npcs[i].character_id ＞ body.bindings[name] ＞ 'name:'+name。
 *   S.save の payload は { cfg, cast, scene, turns, mode } を丸ごと書く（features.js:6295）ので、追加 field は既存の保存経路
 *   （localStorage chr6_slot_<id> → 同期）でそのまま運ばれる。Worker は story body.scene を素通し（worker_r4_prod.js:4630）。
 *   既存物語の一括書換えは行わない（開いた物語を ON で build / save したときだけ、その物語の scene に 1 field 足す）。
 *
 * ■ 更新規則（S.turns からの決定的な再導出。ターン順に適用、同一ターン内は 移動 → 入力 の順＝入力が勝つ）
 *   初期値: 全 NPC = UNKNOWN（名前の言及・who タグ・say・cast.appeared は証拠にしない）。
 *   (1) 検証済み scene_move → sceneId 更新・**全 NPC を UNKNOWN**（src=scene_move）。
 *   (2) playerText の明示文: 「<名>がいない／姿が見えない／立ち去った／とはぐれた」= ABSENT、「<名>が戻ってきた／合流した／入ってきた」= PRESENT。
 *       同じテキスト内は後に書かれた方が勝つ。移動ターンの「<名>(と|は|が|も)一緒に／を連れて／の手を引いて」= PRESENT（同行の明示）。
 *   名前の形: 完全名・空白区切りの部分（2 字以上）・姓/名の推定（2 字以上）。cast 全体で一意な形だけ。
 *   ABSENT は「今の場面にいない」であり世界からの退場ではない。
 *
 * ■ 注入（engineMode=1 の fix192 buildSys の出力を最外ラップで後処理。sys に長い規則は足さない。ABSENT 0 人なら byte 同一）
 *   ・【各キャラの現在の状態】の ABSENT NPC の行頭 '・名前｜' → '・名前（現在の場面にはいない）｜'（傷・心理などの永続情報は消さない）
 *   ・同ブロック末尾に 1 行: '・現在の場面にいない: 名前（最終確認 T3「千景はいない」）。理由なく同じ場所に登場させない。離れた場所での行動、電話・声・記憶・噂としての登場、納得できる合流の描写は可。'
 *     （状態行が無い物語では【守ること】の直前に【各キャラの所在】として置く。どちらのアンカーも無ければ sys は無変更）
 *   ・【この場面の種】【自発】の ABSENT NPC の行（fix192 の実書式 '・名の未解決「' '・名の傷(' '・名の関係(' '・名は内心『' '・名は傷('）を落とす
 *   ・user 側: cast.npcs[i] に presence:'現在の場面にはいない（最終確認 T3…）' を足す（Planner._userExtensions・fix58 の後）
 *
 * ■ スイッチ: 既定 OFF。opt-in localStorage v292DfixCP1On='1'／kill v292DfixCP1Off='1'（常に優先）。
 *   OFF のとき: sys・user とも byte 同一、S.scene への書込 0、S.save の中身も不変（ラップは素通し）。CTX/GQ4 とは独立。
 * 冪等: window.__v292DfixCP1。診断: .state() / .derive() / .last()（直近 build の操作と自己検査結果）/ .proseHints()
 *
 * ■ R4（GPT #127-JY・拘束）で変えたこと（更新規則・注入文面・印の位置・保存形・スイッチは r3 と同一）
 *   ① 装着: fix192/fix277 の両フラグ（P.build.__v292NewEngine && __v292Dfix277b2）が出てから最後にラップする方式は維持。
 *      r3 の「30 秒で諦めて装着」は廃止。読み込みから 30 秒たってもフラグが揃わなければ **このページでは CP1 を無効化**
 *      （build をラップしない・注入しない・presence を書かない・2 秒周期の取り返しも止める）。理由 'install-timeout' と時刻を
 *      .status() / .last() に残す（物語の文字列は残さない）。待機中（waiting）も無効化後（disabled）も OFF と同じ素通し。
 *   ② engineMode=0（fix192 の新エンジン OFF＝旧エンジン）の build では何もしない（sys/user/保存とも OFF と同じ）。
 *   ③ 送信直前の観測（純粋な観測器・送る中身は 1 バイトも変えない）: 早期に読む小さな tap（v292DfixCP1-final-tap.js、
 *      fix950 の直後＝sendgate/fix950 のすぐ外側＝fix459/fix441/KP1/fix247 など全部の書き換えの後）が、本文生成の POST の
 *      body 文字列をこのファイルの hook に渡す。ON・装着済み・直前の build に ABSENT が 1 人以上いるとき、
 *      system に（印＋不在注記）、user の cast.npcs[名].presence があるかを調べ、結果を .last().finalBody と .finalBody() に記録する。
 *      記録は件数・真偽・字数・FNV-1a 32bit の hash だけ（名前・本文・入力文は記録しない）。失敗しても送信は止めない・変えない。
 *      tap は「読み込み時に ON のときだけ」fetch を包む（OFF/kill で読み込んだページには包みが 1 枚も増えない）。
 *
 * ■ R5（GPT #127-KA・拘束）で変えたこと（更新規則・注入文面・印の位置・保存形・スイッチ・装着待ち・30 秒無効化は r4 と同一）
 *   ① 公開の診断（.last() / .status() / .finalBody() / .finalBodyLog() / .proseHints() / console 出力）には NPC 名・台詞・地の文・
 *      入力文など物語の文字列を一切入れない。件数・真偽・字数・hash・理由コードだけ。
 *      r4 の last().absent（名前の配列）→ last().nAbsent（件数）。ops/skipped の 'mark:<名>' → 'mark:#<不在リスト内の番号>'。
 *      proseHints() → [{turn, npc:<S.cast.npcs の添字>, would, evLen}]。例外の console 出力は e.name だけ（JSON.parse の
 *      エラー文は入力の断片を含みうるため e.message は出さない）。
 *      ※ .state() / .derive() は診断ではなくデータの読み出し口（S.scene.presenceCP1 そのもの＝物語データ。S と同じ扱い）。
 *   ② 「ABSENT の NPC が user の cast.npcs に無い」だけでは失敗にしない（userNotListed として件数を記録するだけ）。
 *      代わりに危険な矛盾を検出する: system は ABSENT と言っているのに、user（currentInput.text＝今回のプレイヤー入力）が
 *      その NPC を「今いる／戻ってきた／同行している」と明示している場合（CP1 の入力走査と同じ語彙・同じ名前形・後に書かれた方が勝つ・
 *      推量／夢／電話／噂などの節は数えない＝strict 走査）、
 *      または user の cast.npcs[名].presence が不在以外の値になっている場合。理由コード contra:input-present / contra:input-comove /
 *      contra:user-presence-value。送信の観測（送信の後）でだけ判定する読み取り専用の診断で、送信は止めない・変えない。
 *   ③ tap は r4 と同じ（読み込み時に ON のときだけ・送る中身は不変・例外は握る）。VER だけ r5。
 *   ④ engineMode=0（旧エンジン）では CP1 は何もしない（r4 と同じ。sys/user/保存とも OFF と同一・finalBody は skip:engine0）。
 *      旧エンジンで sys が実行ごとに揺れる件は CP1 の範囲外として別チケット（TICKET_ENGINE0_SYS_VARIANCE.md）。
 *
 * ■ R6（GPT #127-KK・拘束）で変えたこと（r5 の更新規則・注入文面・印の位置・保存形・診断・矛盾検出・tap は同じ）
 *   ① fix333 の前面化（【この一手で前面に出す人物】【背景の人物】・強制ローテ・その回の選択と公平カウンタ更新）から、
 *      **今の場面で ABSENT の NPC を外す**。fix333 は Api.call の包みの中で selectForeground(states) を呼ぶので、r6 の fix333 は
 *      その直前に window.__v292DfixCP1Fg333(states, text) を 1 回だけ呼ぶ受け口を持つ（未定義・null・例外なら従来どおり）。
 *      CP1 はこの関数を **ON で読み込んだページだけ** 定義し、CP1 が実効 ON（ON・装着済み・新エンジン）のときだけ、
 *      states の浅い写しから ABSENT の NPC を落としたものを返す（落とす者がいなければ null＝従来どおり）。
 *      誰が ABSENT かは CP1 の正本（S.scene.presenceCP1・無ければ derive）の stable id で決める。states の鍵（名前）は
 *      cast.npcs の完全名一致 → その NPC の stable id、または bindings の完全一致だけで id に結ぶ（部分一致・別名推定はしない）。
 *      0 人になれば fix333 の選択は null → 前面化の行は出ない（全員へのフォールバックに ABSENT を戻さない）。
 *      S.cast・fix77 ストアは触らない（一時的にも）。新しい保存域は作らない（正本は書かない＝derive は読み取り）。
 *   ② ABSENT は「今の場面にいない」だけ。電話・回想・別場面での行動・納得できる合流・プレイヤーの戻りの指示は妨げない（r5 の注記のまま。
 *      sys に新しい長いガードは足さない）。今回の入力が戻りを明示しても正本は書き換えない（次ターンに playerText から導出）。
 *   ③ **読み込み時に OFF/kill なら CP1 固有のものを何も装着しない**（Planner.build・S.save の素通しラッパ・userExt・2 秒周期・
 *      送信直前の hook・fix333 の受け口・tap〔tap 側も同じ判定〕）。公開口 window.__v292DfixCP1 は状態の読み出しだけ（state='inactive-at-load'）。
 *      後から装着物を外す仕組みは作らない。ON で読み込んだページを途中で kill にしたら、注入・保存・前面化の除外はすべて止まる（各経路が on() を見る）。
 *      OFF で読み込んだページを ON にしても reload するまで何も起きない（運用仕様: ON への切り替えは reload 後に有効）。
 *
 * ■ R6b（GPT #127-KQ ②・r6 の検査 t11 が落ちたので直した。ほかは r6 と同じ）
 *   fix333 の前面化から外すのは、states の鍵（名前）が CP1 の stable id に**一意に**結べるときだけ。
 *   同名の NPC が別 id で 2 人以上・bindings どうし／character_id と bindings が別 id を指す・別の名前の 2 人が同じ id・
 *   主人公と同じ名前・どの id にも結べない鍵は、外さずに候補へ残し、理由コード（same-name / binding-conflict / id-shared /
 *   hero-name / unresolved）を status().fg333.reasons に数える（名前・本文は持たない）。r6 は最初に当たった 1 人の id で決めていた。
 *
 * ■ bundle43-a Owner ゲート（GPT #127-KW G1・ほかは r6b と同じ。除外の判定・注入・保存・観測のロジックは変えていない）
 *   実効 ON = v292DfixCP1On==='1' かつ v292DfixCP1Off!=='1' かつ 匿名経路でない（window.__v292Dfix886.api.active() が false）
 *            かつ Owner（window.__v292Dfix893.serverMe() が entitlement==='owner' && status==='active'）。RC1 r2（bundle42-a）の gate() と同じ読み口・AND 条件。
 *   どれか不明・例外・null（/auth/me 未応答・401・未ログイン・アカウント切替中）・非 Owner・停止中・API 不在・storage 不可 → OFF（fail-closed）。
 *   (a) 読み込み時は従来どおり opt-in/kill だけで決める（LOAD_ON）。opt-in が無い・kill なら何も装着しない（OFF と byte 同一・r6 ③のまま）。
 *       読み込み時は /auth/me がまだ返っていないことがあるので、Owner 判定を読み込み時には固定しない。
 *   (b) opt-in で読み込んだページだけ装着し、build・userExt・保存・fix333 の受け口・送信直前の観測の **呼び出しごとに** Owner 判定する（eff()）。
 *       非 Owner・不明のときは素通し（送信本文・保存は OFF と byte 同一・presenceCP1 を書かない・fix333 の候補を絞らない）。
 *   新しい認証 API・保存域・DB 変更は無い。読むのは既存の公開口 2 つだけ（どちらも書込なし）。診断 status().gate = 'killed'|'unset'|'anon'|'owner'|'not-owner'。
 *
 * ■ bundle43-a r2（GPT #127-LA §2・§3。除外の判定・注入・保存・観測のロジックは r6b のまま。足したのは小さなガードだけ）
 *   §2 ターンの確定: Planner.build（＝生成の開始）のたびに、そのターンで CP1 を使うか（Owner ゲート＋互換）と、
 *      アカウント（serverMe().accountId）・物語（__chronicleDocumentStoryKey、無ければ URL の ?story=）・S の参照を 1 回だけ確定する（turn）。
 *      同じターンの userExt・sys の後処理・fix333 の受け口・送信直前の観測はこの確定値に従う（途中で判定が変わっても半分だけ効くことはない）。
 *      最終送信の直前（tap → onFinal）に、CP1 を使ったターンなら、今も Owner で・同じアカウント・同じ物語・同じ S かを確かめ、違えば送らない
 *      （tap が fetch を reject。古い生成を新しいアカウント・物語へ続けない）。同じターンの保存も、アカウント・物語が変わっていれば行わない
 *      （そのターンの S を新しい側へ保存しない）。同じアカウントの kill はそのターンの確定を変えない（次のターンから OFF）。
 *      永続ストア・認証 API・transaction の仕組みは作らない（メモリ上の 1 オブジェクトだけ）。
 *   §3 混在キャッシュ: fix333 の受け口（__v292Dfix333api.cp1Hook === 'fg333-r6'）と tap のガード（__v292DfixCP1Tap.guard === 1）が
 *      揃っていなければ CP1 全体を OFF（装着時に disable('fix333-incompatible' / 'tap-incompatible')、各ターンの確定でも確認）。従来の生成はそのまま。
 *
 * ■ bundle43-a r3（GPT #127-LC H1〜H3。除外の判定・注入・保存・観測のロジックは r6b のまま。r2 のガードを締めただけ）
 *   H1 一度止めたターンは二度と送らない（turn.aborted は戻らない）。元の口座・物語・権限に戻っても、fix80 などの自動リトライが
 *      古い build の本文を後から送ることはない（r2 は戻った瞬間に通ってしまった＝実測）。送り直すのはユーザーが既存の送信／再実行を選んだときだけで、
 *      それは新しい Planner.build＝新しいターンの確定になる。ページを開いて最初に見えたアカウントと違うアカウントで始まったターンは CP1 を使わない
 *      （'account-changed-page'＝他口座の状態で CP1 を組まない）。CP1 を使わないターンの通常の通信エラーのリトライは従来どおり。
 *   H2 CP1 を使ったターンの応答が返った時点で側が変わっていたら（ログアウト・別口座・別物語・権限喪失）、その応答を捨てる（tap が応答を reject。
 *      本文・state・presence はアプリに渡らないので保存されない。課金済みの可能性はあるが自動再送はしない＝H1）。応答の後・保存の前に変わった場合は、
 *      そのターンで増えた分を含む保存を止める（ログアウトも含む）。ターンが増えていない保存（別の保存・入力の下書き）は止めない。
 *   H3 kill（v292DfixCP1Off='1'）は新しい CP1 送信に常に勝つ: build の前 → そのターンは OFF、build の後・最終送信の前 → その CP1 付きの送信を出さない
 *      （部分的に剥がして送ることはしない。中止してアプリの既存の失敗→再実行へ戻す）、送信の後 → 取り消せないので応答は通常どおり（次のターンから OFF）。
 *
 * ■ bundle43-a r4（GPT #127-LG H4。除外の判定・注入・保存・観測のロジックは r6b のまま）
 *   中断した回の結果を「正式なターン」として採用させない。確かめるのは生成結果を使う 3 か所（どれも既存の流れの中の小さな関門）:
 *     ① Api.call が結果を返す直前（CP1 を使った回で、その回が止めた回・側が変わった回なら結果を返さずに失敗させる。結果の本文はこの回の印として記録）
 *     ② Planner.parsePlan に ① の本文が渡された直前（同上。止めるときは fix77 などの parse 拡張を一度も走らせない）
 *     ③ ターン確定（TURN_COMMIT）の S.turns.push そのもの: CP1 を使った回では S.turns（配列）に列挙されない push の関門を置き、② で記録した plan を持つ
 *        ターンが入ろうとした時点で中断が分かったら、追加させずに失敗させる（branches・保存・fix444 の台帳など後続は一切走らない）。fix77 の状態は
 *        既存の巻き戻し経路（__v292Dfix302api.restoreTo(その回の前の長さ)）で戻す。
 *     ③' 予備（push の関門が無い配列に入った場合）: 確定の保存（S.save）で中断が分かったら、その回が追加したターン（② で記録した plan と
 *        同一のオブジェクトを持つターン）だけを S.turns から取り除き（末尾を削るのではなく同一性で探す）、分岐候補をその回の前に戻し、
 *        fix77 の状態は既存の巻き戻し経路（__v292Dfix302api.restoreTo(その回の前の長さ)）で戻す（無ければ ② の直前の写しへ。
 *        ② の後に他の変更が入っていたら戻さずに数える）。そのうえで保存を失敗させ、アプリの既存の失敗経路（会話カードを描かない・入力を戻す）へ。
 *   入力欄の下書きはアプリの既存の失敗経路が戻す（CP1 は触らない）。新しい保存エンジン・transaction・永続キューはなし。
 *
 * ■ bundle43-a r5（GPT #127-LI G5・G6・理由コード／独立レビュー Astra。除外の判定・注入・保存・観測のロジックは r6b のまま）
 *   G5 試行の同一性: 試行は Planner.build 1 回ごとに作る in-memory のオブジェクト（id = 世代番号）。本文や hash では見分けない。
 *     build の結果に列挙されない印 __cp1Attempt を付け、r5 の index.html（G.submit）が __v292DfixCP1Att.of(結果) で受け取って、
 *     Api.call の 4 番目の引数 { __cp1Att }（CP1 の包みが内側へ渡す前に取り除き、引数の形は従来どおり）・fix265 の再送・fix216 の書き直し・
 *     _cmfTry・fix797・parse と確定の同期区間（within）・finally（end）へ明示的に引き継ぐ。リトライ時に「今の試行」を取り直さない。
 *     Api.call の入口で、その試行が取消済み・kill・側の変化・採用済みなら送信前に断る（待機していた再送も実行の直前に確かめる）。
 *     新しい試行の送信が始まったら、応答待ちの古い試行は取消（SUPERSEDED。既存の reqId と同じ意味）。
 *     fetch の層（tap）: Api.call の同期区間で出た要求はその呼び出しに結び付く。非同期の内側の再送は未完了の Api.call が 1 つならそれ、
 *     割れたら本文の一致で絞り（整合確認だけ）、なお割れて中断済みの試行が含まれれば送らない（AMBIGUOUS_REQUEST・fail-closed）。
 *     応答の確認（onAfter）は、送信時に結び付けた呼び出しをそのまま使う。
 *     状態は open → adopted（確定の S.turns.push が通った瞬間＝採用完了）／cancelled（取消成立）のどちらか 1 回だけ。採用後は取り消さない。
 *     1 つの試行が採用するのは 1 回だけ（採用後に届いた同じ試行の応答・parse・push・送信は DUPLICATE_ADOPTION で断る）。
 *     理由コード: ACCOUNT_CHANGED / LOGOUT / STORY_CHANGED / STORY_RELOADED / CP1_PERMISSION_LOST / KILL_BEFORE_SEND / SUPERSEDED /
 *     NOT_COMMITTED / AMBIGUOUS_REQUEST / DUPLICATE_ADOPTION / STATE_UNSAFE_HOLD。エラーは e.code = 'CP1_INTERRUPTED'・e.terminal = true
 *     （fix265 の再送条件〔HTTP 5xx・Failed to fetch 等〕に当たらない）。
 *   G6 採用前の仮の state: parse（fix77 の取り込み）で変わった store はメモリにだけ置き、保存先（v292Dfix77States）は parse の直前の値へ戻す。
 *     採用（push が通った瞬間・TURN_COMMIT の admission の中）で fix77 の正式な commit（__v292Dfix77Commit）から保存先へ書く。
 *     取消のときの撤回: (1) 今の store が parse 直後と内容で同じ、かつ fix302 の snapshot（len0）が試行の前の store と内容で同じなら
 *     fix302.restoreTo（fix77 の store と保存先だけを戻す。turns・plan には触らない） (2) それ以外は人物ごとの 3 者比較で、その試行が
 *     変えて今もその値のままの人物だけ前の値へ戻す（後から別の正当な変更が入った人物・試行が触っていない人物は触らない）
 *     (3) 試行が変えた人物を後から別の変更が書き換えていた（どちらの値でもない）→ 戻さない（上書きしない）→ HOLD。
 *     admission の外（G.submit の finally）で決まった撤回は G._dadmRun('CP1_REVERT') の中で行い、入れなければ HOLD（3 秒ごとに再試行）。
 *     取消済みで撤回が残っている試行は、次の build の前（TURN_BUILD の中）で撤回する。
 *     HOLD（この物語だけ・fail-closed）: 新しい生成（build）・S.save・Worker への物語の state の書込（put / putstory / putcanonical /
 *     commitstate / forceput。tap が送らない）を止め、短い通知を出す。端末内の localStorage（同期対象外の key）に印を残し、再読込・タブの開き直しでも続ける。
 *     解除は (a) admission の中での撤回の成功（検証済みの復旧）か (b) 通知のボタン: fix781 の Recovery Draft（IndexedDB・読み戻し検証）を
 *     作れたときだけ、安全に戻せなかった人物を試行の前の値へ戻して再読込（既存の起動時の解決へ）。Draft が作れなければ止めたまま。
 *     採用前の仮の state が保存先に書かれてしまった試行がある間は、Worker への物語の state の書込を止める（決着まで）。
 *   compat: r5 の index（window.__v292DfixCP1IdxAtt = 'att-r5'）と guard 3 の tap が揃わなければ CP1 全体 OFF（混在キャッシュ）。
 *
 * ■ bundle43-a r6（2026-10-24・本番 r5 の Owner 先行試用で見つかった 2 点。PRES_VER = pres-r6-20261024。G5/G6・HOLD・kill・Owner ゲート・互換・注入の文面は r5 のまま）
 *   #1 戻りの言い方が狭すぎた（「真田はもういない」の後の「真田刑事が事務所にやって来た」「真田は今この事務所にいる」で ABSENT のまま、
 *      以後のターンも「真田は現在の場面にいない…」と送り続けた）→ プレイヤー入力の PRESENT の判定（presentIn）を広げ、否定・仮定・伝聞・電話・問いを除く。
 *      名前の照合（一意な形だけ）・本文からは決めない・ABSENT の語は r5 のまま。
 *   #2 そのターンの入力がそのターンの指示に入らなかった（presence は採用済みのターンからだけ導いていた）→ build の開始で、その試行だけの
 *      仮の判定（確定済み＋今回の入力）を作って注入に使う（T.prov・メモリだけ）。保存する presence は r5 と同じく採用済みのターンからの再導出で、
 *      採用の瞬間（push の後の保存）に確定する。取消・中断・採用後は仮の判定を捨てる。
 *   OFF・kill・非 Owner・未装着・旧エンジンでは何も変わらない（仮の判定は CP1 を使う試行のときだけ作る）。
 *   過去分（GPT #127-LW Q3）: r6 を入れる前に確定済みのターン（r5 が保存した field の turnsLen まで）は r5 の読み方のまま。新しい規則はそれ以降のターンだけ（field.r6from）。
 *   表示（統括・UI45）: HOLD 通知を #composer の上 8px（BASE の A2 通知が見えていればその上 8px）へ。幅 720px 以下は左右 12px。
 *      #composer の大きさの変化・window の resize・1 秒ごとに置き直す。文面・ボタン・復旧の動き・最前面は r5 のまま（holdPlace）。
 *
 * ■ cp1r-c（2026-10-25）: HOLD 専用の包みの付け直しは、包みが鎖から消えたときだけ（このページの印 HO_TOK で判定）。fix697 との 2 秒ごとの
 *   取り合いで S.save の層が増え続けた cp1r-b（r5 以来の HOLD 中の OFF / kill ページも同じ）を止める。止める判定・対象・HOLD の扱いは cp1r-b のまま。
 * ■ cp1r-b（2026-10-25・GPT #127-MW）: OFF / kill で読み込んだページも、HOLD 専用の包み（installHoldOnly＝生成・S.save・state 書込の関門）を必ず置き、
 *   C の読み直しで後から別タブでできた同じ物語の HOLD を実行の時点で止める。HOLD が無ければ素通し（CP1 の働きは何も装着しない）。
 * ■ cp1r-a（2026-10-25・GPT #127-MQ・P1。VER・GATE_VER・PRES_VER・注入／保存／観測のロジックは r6 のまま。HOLD の守りと装着の判定だけ）
 *   A  互換の不一致（fix333 / tap / index）は、文書の同期 script がすべて実行された後（readyState が 'loading' でなくなった後）に確定する。
 *      fix333 はこのファイルより後の同期 script なので、上流フラグが先に揃っても fix333 の実行前に 'fix333-incompatible' と決めない。WAIT_MS は 30 秒のまま。
 *   B  opt-in で読み込んで無効化したページ（互換・install-timeout）にも、OFF / kill と同じ HOLD 専用の包み（installHoldOnly）を必ず置く。
 *   B2 opt-in で読み込んだページで、読み込み時にこの物語の HOLD の記録があれば、装着を待つ間も HOLD 専用の包みを先に置く。
 *   C  HOLD の記録は、生成・保存・state 書込を実行するその時点で端末の印（v292DfixCP1Hold）を読み直し、増えた記録（別タブで作られた HOLD）を取り込む。
 *      取り込むのは追加だけ（このページで持っている記録を別タブの変化で消さない＝止める側）。opt-in で読み込んだページだけ（OFF / kill の読み込みは r6 のまま）。
 *   tap（guard 3）が居るページでは、HOLD 専用の包みは fetch を包まない（tap が同じ onSave で state 書込を止めるので二重にしない）。
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__v292DfixCP1) return;
  var TAG = '[v292DfixCP1]', VER = 'cp1-r6b-20261022', FIELD = 'presenceCP1';
  var MAX_EV = 60;
  var MARK = '（現在の場面にはいない）', NOTE_HEAD = '・現在の場面にいない: ', LOC_HEAD = '【各キャラの所在】', RULE_HEAD = '【守ること】';
  var ST_HEAD = '【各キャラの現在の状態', SEED_HEAD = '【この場面の種', AGENDA_HEAD = '【自発';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ return lsg('v292DfixCP1Off') !== '1' && lsg('v292DfixCP1On') === '1'; }
  /* ★bundle43-a Owner ゲート（RC1 r2 の ownerGate()/anonActive()/gate() と同じ読み口・同じ fail-closed）。BF1 の gateOf()（手動 opt-in で非 Owner も有効）は使わない */
  var GATE_VER = 'owner-r43e-20261024';
  var PRES_VER = 'pres-r6-20261024';   /* bundle43-a r6: 戻りの言い方の拡張＋そのターンの入力の仮の判定（VER・GATE_VER・cb は r5 のまま＝index・tap・fix333 との互換は変わらない） */
  function ownerGate(){
    try {
      var A = window.__v292Dfix893;
      if (!A || typeof A.serverMe !== 'function') return false;              /* account API 不在 = fail-closed */
      var me = A.serverMe();                                                  /* server 由来の cache（未応答・401・未ログイン = null） */
      return !!(me && me.entitlement === 'owner' && me.status === 'active');
    } catch(e){ return false; }
  }
  function anonActive(){
    try { var P = window.__v292Dfix886; return !!(P && P.api && typeof P.api.active === 'function' && P.api.active()); } catch(e){ return true; }   /* 判定不能 = 匿名扱い = OFF */
  }
  /* 戻り: 'killed' | 'unset' | 'anon' | 'owner' | 'not-owner'（呼び出し時点の判定・書込なし） */
  function gate(){
    var kill, opt;
    try { kill = localStorage.getItem('v292DfixCP1Off'); opt = localStorage.getItem('v292DfixCP1On'); } catch(e){ return 'killed'; }   /* storage 不可 = OFF */
    if (kill === '1') return 'killed';
    if (opt !== '1') return 'unset';
    if (anonActive()) return 'anon';
    return ownerGate() ? 'owner' : 'not-owner';
  }
  function eff(){ return gate() === 'owner'; }
  /* ★r2 §3: 互換（混在キャッシュ）。fix333 は受け口つきの版だけが cp1Hook を公開する。tap はガードつきの版だけが guard=1 を持つ */
  var FIX333_HOOK = 'fg333-r6';
  function fix333Ok(){ try { var a = window.__v292Dfix333api; return !!(a && a.cp1Hook === FIX333_HOOK); } catch(e){ return false; } }
  function tapOk(){ try { var t = window.__v292DfixCP1Tap; return !!(t && t.installed === true && t.guard === 3); } catch(e){ return false; } }   /* r5: guard 3（保存の関門・応答の帰属）を持つ tap だけ */
  function idxOk(){ try { return window.__v292DfixCP1IdxAtt === 'att-r5'; } catch(e){ return false; } }   /* r5: 試行を引き継ぐ G.submit（index.html）だけ */   /* r3: guard 2 = 送信前の停止＋応答の破棄を持つ tap（r2 の guard 1 は非互換＝CP1 OFF） */
  function compatWhy(){ return !fix333Ok() ? 'fix333-incompatible' : !tapOk() ? 'tap-incompatible' : !idxOk() ? 'index-incompatible' : null; }
  /* ★r2 §2: アカウント・物語の識別（読み出しだけ） */
  function acctKey(){ try { var A = window.__v292Dfix893; var m = (A && typeof A.serverMe === 'function') ? A.serverMe() : null; return (m && m.accountId) ? String(m.accountId) : null; } catch(e){ return null; } }
  function storyKey(){
    try { if (typeof window.__chronicleDocumentStoryKey === 'string' && window.__chronicleDocumentStoryKey) return 'doc:' + window.__chronicleDocumentStoryKey; } catch(e){}
    try { var q = new URLSearchParams(String((window.location && window.location.search) || '')).get('story'); if (q) return 'url:' + q; } catch(e2){}
    return null;
  }
  /* ==== r5（GPT #127-LI G5・G6・理由コード）: 試行（attempt）の同一性・採用と取消の境界・採用前の仮の state ====
     ・試行 = Planner.build 1 回ごとにここで作る in-memory のオブジェクト（id は世代番号 turnSeq）。本文や hash では見分けない。
       G.submit（index.html）は build の結果から __v292DfixCP1Att.of(r) で試行を受け取り、その試行を Api.call の 4 番目の引数
       （{ __cp1Att }。CP1 の包みが内側へ渡す前に取り除く）・parse と確定の同期区間（within）・fix265 の再送・fix216 の書き直し・
       _cmfTry に明示的に引き継ぐ。リトライのときに「今の試行」を取り直さない。
     ・状態は open → adopted（S.turns.push が通った瞬間＝採用完了）か cancelled（取消成立）のどちらか一方へ 1 回だけ進む。
       採用済みの試行は後から取り消さない。取り消した試行は終端（terminal）で、自動再送はすべて送信前に断る。
     ・fetch の層（tap）では、Api.call の同期区間（apiCur）で送られた要求はその呼び出しの試行に結び付く。非同期の内側の再送（fix80・fix333 の
       修復・fix643 の救済）は「まだ終わっていない Api.call」が 1 つならそれに結び付け、複数で試行が割れるときは本文の一致で絞り、なお割れて
       中断した試行が含まれていれば送らない（fail-closed）。本文の一致は追加の整合確認にだけ使う。 */
  var turn = null, turnSeq = 0, pageAcct = null, recent = [], apiCur = null, scopeT = null, inflight = [], holds = {}, _holdIv = null,
   guardStats = { turns: 0, turnsOn: 0, offCompat: 0, offIdent: 0, offPageAcct: 0, sendBlocked: 0, abortedResend: 0, respDiscarded: 0, resultDiscarded: 0, parseBlocked: 0, commitReverted: 0,
                  stateRevert: { fix302: 0, own: 0, unsafe: 0, none: 0, deferred: 0 }, saveBlocked: 0, fgSkipped: 0, entryRefused: 0, unbound: 0, ambiguous: 0, ambiguousBlocked: 0, adopted: 0, cancelled: 0,
                  endCancelled: 0, provisional: 0, lsRestored: 0, provisionalPersisted: 0, workerWriteBlocked: 0, holds: 0, holdsXtab: 0, holdBuildRefused: 0, holdSaveRefused: 0, holdReleased: 0, nested: 0, lastBlock: null, reasons: {},
                  prov: { built: 0, changed: 0, discarded: 0, adopted: 0, fallback: 0 } };   /* r6: 仮の presence の件数だけ */
  /* 理由コード（通常のネットワーク失敗と区別できる）。エラーは e.code = 'CP1_INTERRUPTED'・e.reason = コード・e.terminal = true */
  var REASON = { 'account-changed': 'ACCOUNT_CHANGED', 'account-changed-page': 'ACCOUNT_CHANGED', 'logged-out': 'LOGOUT', 'story-changed': 'STORY_CHANGED', 'state-changed': 'STORY_RELOADED',
                 'not-owner-now': 'CP1_PERMISSION_LOST', 'killed': 'KILL_BEFORE_SEND', 'not-committed': 'NOT_COMMITTED', 'ambiguous': 'AMBIGUOUS_REQUEST', 'hold': 'STATE_UNSAFE_HOLD', 'duplicate': 'DUPLICATE_ADOPTION', 'superseded': 'SUPERSEDED' };
  function codeOf(why){ return REASON[why] || String(why || 'INTERRUPTED').toUpperCase().replace(/[^A-Z0-9]+/g, '_'); }
  /* 生成の開始（build）でその試行を確定する。eff は Owner ゲート・互換・識別が揃ったときだけ true */
  function beginTurn(){
    var g = gate(), acct = acctKey(), story = storyKey(), why = null;
    if (acct && !pageAcct) pageAcct = acct;   /* r3 H1: このページで最初に見えたアカウント */
    if (g === 'owner'){ why = compatWhy(); if (!why && (!acct || !story)) why = 'identity-unknown'; if (!why && pageAcct && acct !== pageAcct) why = 'account-changed-page'; }
    var S = getS();
    turn = { id: ++turnSeq, eff: g === 'owner' && !why, gate: g, why: why, acct: acct, story: story, sRef: S, len0: (S && Array.isArray(S.turns)) ? S.turns.length : -1, closed: false, blocked: null,
             state: 'open', reason: null, aborted: false, texts: [], plans: [], branches0: undefined, hasBranches0: false, provisional: false, store0: null, storePost: null, ls0: undefined, revertPending: false, inText: null, prov: null };
    if (turn.eff) guardPush(S);   /* r4 ③ */
    guardStats.turns++; if (turn.eff) guardStats.turnsOn++; else if (why === 'identity-unknown') guardStats.offIdent++; else if (why === 'account-changed-page') guardStats.offPageAcct++; else if (why) guardStats.offCompat++;
    recent.push(turn); if (recent.length > 8) recent.shift();
    return turn;
  }
  /* 確定した試行のまま続けてよいか（今も Owner・匿名でない・同じアカウント・同じ物語・同じ S）。kill はここでは見ない（次の試行から） */
  function sameSide(T){ return !!T && ownerGate() && !anonActive() && acctKey() === T.acct && storyKey() === T.story && getS() === T.sRef; }
  function sameAcctStory(T){ if (!T) return false; var a = acctKey(); return (a === null || a === T.acct) && storyKey() === T.story; }   /* r2 の保存判定（記録用に残す） */
  function killNow(){ try { return localStorage.getItem('v292DfixCP1Off') === '1'; } catch(e){ return true; } }   /* r3 H3: storage 不可 = kill 扱い */
  function sideWhy(T){ return !ownerGate() || anonActive() ? (acctKey() === null ? 'logged-out' : 'not-owner-now') : acctKey() !== T.acct ? 'account-changed' : storyKey() !== T.story ? 'story-changed' : getS() !== T.sRef ? 'state-changed' : null; }
  function isStoryBody(b){ return typeof b === 'string' && b.indexOf('"messages"') >= 0 && b.indexOf('protagonist') >= 0; }
  function interruptedWhy(T){ return T.state === 'cancelled' ? 'aborted' : sideWhy(T); }
  /* 取消成立（open からだけ・1 回だけ）。採用済み（adopted）は取り消さない */
  function cancel(T, where, why){
    if (!T || T.state !== 'open') return !!(T && T.state === 'cancelled');
    T.state = 'cancelled'; T.aborted = true; T.reason = codeOf(why); T.blocked = T.blocked || (where + ':' + why);
    if (T.prov){ T.prov = null; guardStats.prov.discarded++; }   /* r6: 取消・中断の試行の仮の presence は捨てる（保存先には最初から書いていない） */
    guardStats.cancelled++; guardStats.reasons[T.reason] = (guardStats.reasons[T.reason] || 0) + 1;
    guardStats.lastBlock = { turn: T.id, why: where + ':' + why, code: T.reason, at: now() };
    try { console.warn(TAG, 'attempt cancelled (terminal)', T.id, where, T.reason); } catch(_w){}
    return true;
  }
  function markDiscard(T, where, why){ return cancel(T, where, why); }
  function cp1Err(T, stage, why){
    var code = (why === 'aborted' && T && T.reason) ? T.reason : codeOf(why);
    var e = new Error('[v292DfixCP1] ' + (stage === 'send' ? 'request not sent: ' : stage === 'commit' ? 'result not adopted: ' : 'result discarded: ') + why + ' [CP1_INTERRUPTED:' + code + ']');
    try { e.code = 'CP1_INTERRUPTED'; e.reason = code; e.terminal = true; e.stage = stage; e.attempt = T ? T.id : null; } catch(_a){}
    return e;
  }
  function getApi(){ try { return (0, eval)('typeof Api !== "undefined" ? Api : null'); } catch(e){ return null; } }
  function invDone(inv){ inv.done = true; var i = inflight.indexOf(inv); if (i >= 0) inflight.splice(i, 1); }
  function jsonInner(s){ try { return JSON.stringify(String(s)).slice(1, -1); } catch(e){ return ''; } }
  /* fetch の層での帰属: 同期区間 → その呼び出し。非同期 → 未完了の Api.call が 1 つならそれ。割れたら本文で絞る（整合確認）→ なお割れたら amb */
  function attrib(body){
    if (apiCur) return { inv: apiCur };
    var c = inflight.slice();
    if (!c.length) return { inv: null };
    var Ts = function(L){ var o = []; L.forEach(function(x){ if (o.indexOf(x.T) < 0) o.push(x.T); }); return o; };
    if (Ts(c).length > 1 && typeof body === 'string'){ var n = c.filter(function(x){ return x.user && body.indexOf(jsonInner(x.user).slice(0, 160)) >= 0; }); if (n.length) c = n; }
    if (Ts(c).length === 1) return { inv: c[c.length - 1] };
    guardStats.ambiguous++;
    return { amb: Ts(c) };
  }
  function wrapApi(){
    if (inst.state === 'disabled') return true;
    var A = getApi(); if (!A || typeof A.call !== 'function') return false;
    if (A.call.__v292DfixCP1) return true;
    var oc = A.call;
    var w = async function(){
      var args = arguments, o = arguments[3], T = null;
      /* r5b: CP1 の別の層の同期区間の中（後から Api.call を包んだ別の包みの上に、2 秒ごとの取り返しで CP1 がもう一層重なった場合）。
         外側の層が試行を受け取り、確認し、__cp1Att を取り除いてある。ここで新しい呼び出し記録（試行なし）を作ると、fix333 の受け口・tap の帰属が
         外側の試行を見失う（実測 ms_fromnon: Owner の通常のターンで前面化の除外が効かなかった）。外側の記録のまま素通しする */
      if (apiCur && !(o && typeof o === 'object' && o.__cp1Att)){ guardStats.nested++; return oc.apply(this, arguments); }
      if (o && typeof o === 'object' && o.__cp1Att){   /* G.submit が引き継いだ試行。内側へは渡さない（引数の形を元に戻す） */
        T = o.__cp1Att; var o2 = {}, n = 0; Object.keys(o).forEach(function(k){ if (k !== '__cp1Att'){ o2[k] = o[k]; n++; } });
        var keep = n ? 4 : (arguments[2] !== undefined ? 3 : 2); args = Array.prototype.slice.call(arguments, 0, keep); if (n) args[3] = o2;
        if (!(T && T.eff)) T = null;
      }
      if (T){   /* 実行の直前に、その試行がまだ有効か（取消済み・kill・側の変化）。無効ならネットワークに出さない */
        var w0 = (T.state === 'cancelled') ? 'aborted' : killNow() ? 'killed' : sideWhy(T);
        if (T.state === 'adopted') w0 = 'duplicate';   /* 採用済みの試行はもう送らない */
        if (w0){ if (w0 === 'aborted') guardStats.abortedResend++; else if (w0 !== 'duplicate'){ cancel(T, 'entry', w0); guardStats.sendBlocked++; } guardStats.entryRefused++; throw cp1Err(T, 'send', w0); }
        /* 新しい試行の送信が始まったら、まだ応答待ちの古い試行は取消（既存の reqId と同じ意味: 追い越された古い応答は使わない） */
        inflight.forEach(function(x){ if (x && x.T && x.T !== T && x.T.eff && x.T.state === 'open' && x.T.id < T.id) cancel(x.T, 'superseded', 'superseded'); });
      }
      var inv = { T: T, user: (typeof args[1] === 'string') ? args[1] : null, done: false };
      inflight.push(inv);
      var p, prev = apiCur; apiCur = inv;
      try { p = oc.apply(this, args); } catch(eS){ apiCur = prev; invDone(inv); throw eS; }
      apiCur = prev;
      var r;
      try { r = await p; }
      catch(e){ invDone(inv); if (T && T.state === 'cancelled') throw (e && e.code === 'CP1_INTERRUPTED') ? e : cp1Err(T, 'result', 'aborted'); throw e; }
      invDone(inv);
      if (T){
        var why = null;
        try { why = (T.state === 'adopted') ? 'duplicate' : interruptedWhy(T); if (!why && r && typeof r.text === 'string') T.texts.push(r.text); } catch(e2){ why = null; }   /* 採用後に届いた同じ試行の応答は使わない */
        if (why){ if (why !== 'duplicate') cancel(T, 'result', why); guardStats.resultDiscarded++; throw cp1Err(T, 'result', why); }   /* ① */
      }
      return r;
    };
    try { Object.keys(oc).forEach(function(k){ w[k] = oc[k]; }); } catch(e){}
    w.__v292DfixCP1 = true; A.call = w; return true;
  }
  /* ---- G6: 採用前の仮の state（fix77 の store）---- */
  function store77(){ try { return window.__v292Dfix77Store || null; } catch(e){ return null; } }
  function cloneJ(o){ try { return JSON.parse(JSON.stringify(o)); } catch(e){ return null; } }
  function canon(v){ if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v); if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; return '{' + Object.keys(v).sort().map(function(k){ return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; }
  function ls77(){ try { return localStorage.getItem('v292Dfix77States'); } catch(e){ return undefined; } }   /* fix246 がこの物語の key へ振り替える */
  function setLs77(v){ try { if (v === null) localStorage.removeItem('v292Dfix77States'); else localStorage.setItem('v292Dfix77States', v); return true; } catch(e){ return false; } }
  function commit77(){ try { var f = window.__v292Dfix77Commit, st = store77(); if (typeof f === 'function' && st) return f(st) === true; } catch(e){} return false; }
  function wrapParse(){
    if (inst.state === 'disabled') return true;
    var P = window.Planner; if (!P || typeof P.parsePlan !== 'function') return false;
    if (P.parsePlan.__v292DfixCP1) return true;
    var op = P.parsePlan;
    var w = function(raw){
      var T = scopeT, why = null;
      if (!(T && T.eff)) return op.apply(this, arguments);   /* 試行に結び付いていない parse は素通し */
      try { why = (T.state === 'adopted') ? 'duplicate' : interruptedWhy(T); } catch(e){ why = null; }
      if (why){ if (why !== 'duplicate') cancel(T, 'parse', why); guardStats.parseBlocked++; throw cp1Err(T, 'parse', why); }   /* ② parse 拡張（fix77 など）を走らせない */
      try {
        if (!T.hasBranches0){ var S0 = T.sRef; T.branches0 = (S0 && S0.scene) ? S0.scene.branches : undefined; T.hasBranches0 = true; }
        if (T.store0 === null){ var s0 = store77(); T.store0 = s0 ? cloneJ(s0) : null; T.ls0 = ls77(); }   /* この試行の最初の parse の直前 */
      } catch(e){}
      var plan = op.apply(this, arguments);
      try {
        if (plan && typeof plan === 'object') T.plans.push(plan);
        var s1 = store77();
        if (s1 && T.store0 !== null){
          T.storePost = cloneJ(s1);
          if (canon(T.storePost) !== canon(T.store0) || ls77() !== T.ls0){
            if (!T.provisional){ T.provisional = true; guardStats.provisional++; }
            if (ls77() !== T.ls0 && T.ls0 !== undefined){ setLs77(T.ls0); guardStats.lsRestored++; }   /* 採用までは保存先に書かない（メモリだけ） */
          }
        }
      } catch(e){}
      return plan;
    };
    try { Object.keys(op).forEach(function(k){ w[k] = op[k]; }); } catch(e){}
    w.__v292DfixCP1 = true; P.parsePlan = w; return true;
  }
  /* その試行の仮の state だけを撤回する。戻り: 'fix302' | 'own' | 'unsafe' | 'none'
     ・fix302.restoreTo（fix77 の store と保存先だけを snapshot へ戻す。turns・plan には触らない）を使うのは、今の store がその試行の
       parse 直後と完全に同じ（＝他の変更が無い）で、かつ fix302 の snapshot（len0）がその試行の前の store と内容で一致するときだけ。
     ・それ以外は人物ごとに 3 者比較: その試行が変えた人物のうち、今も試行の値のままのものだけ前の値へ戻す。試行が変えていない人物は触らない。
       試行が変えた人物を後から別の変更が書き換えていたら（どちらの値でもない）安全に戻せない → 'unsafe'（上書きしない・hold）。 */
  function revertState(T){
    var how = 'none';
    try {
      if (!T.provisional){ guardStats.stateRevert.none++; T.stateRevert = 'none'; return 'none'; }
      var st = store77(), cur = st ? cloneJ(st) : null, pre = T.store0, post = T.storePost;
      if (!st || !cur || !pre || !post){ how = 'unsafe'; }
      else {
        var A3 = window.__v292Dfix302api;
        if (canon(cur) === canon(post) && A3 && A3.snaps && A3.snaps[T.len0] && canon(A3.snaps[T.len0]) === canon(pre) && typeof A3.restoreTo === 'function'){
          var r3 = A3.restoreTo(T.len0); if (r3 === true && canon(cloneJ(store77())) === canon(pre)) how = 'fix302';
        }
        if (how === 'none'){
          var keys = {}, k; Object.keys(pre).forEach(function(x){ keys[x] = 1; }); Object.keys(post).forEach(function(x){ keys[x] = 1; });
          var back = [], amb = [];
          for (k in keys){ var o = canon(pre[k]), p = canon(post[k]); if (o === p) continue; var c = canon(cur[k]); if (c === p) back.push(k); else if (c !== o) amb.push(k); }
          if (amb.length){ how = 'unsafe'; T.ambKeys = amb; }
          else {
            back.forEach(function(x){ if (Object.prototype.hasOwnProperty.call(pre, x)) st[x] = cloneJ(pre[x]); else delete st[x]; });
            if (ls77() !== T.ls0){ if (!commit77()) setLs77(JSON.stringify(st)); }   /* 保存先は試行の前のまま（parse の直後に戻した）。その後に誰かが store 全体を書いていたときだけ、撤回後の今の store を書き直す */
            how = 'own';
          }
        }
      }
    } catch(e){ how = 'unsafe'; }
    guardStats.stateRevert[how] = (guardStats.stateRevert[how] || 0) + 1; T.stateRevert = how;
    if (how !== 'unsafe'){ T.provisional = false; T.revertPending = false; }
    else enterHold(T, 'STATE_UNSAFE');
    return how;
  }
  /* admission（fix748）の外で取り消しが決まったとき（G.submit の finally）: 既存の Class D admission の中で撤回する。入れなければ hold して再試行 */
  function revertInAdmission(T){
    T.revertPending = true;
    var G0 = null; try { G0 = (0, eval)('typeof G !== "undefined" ? G : null'); } catch(e){ G0 = null; }
    var runIt = function(){ var x = revertState(T); return x; };
    if (!G0 || typeof G0._dadmRun !== 'function'){ return runIt(); }
    guardStats.stateRevert.deferred++;
    var p = null; try { p = G0._dadmRun('CP1_REVERT', runIt); } catch(e){ p = null; }
    if (!p || typeof p.then !== 'function'){ return runIt(); }
    p.then(function(x){ if (!(x && x.ran === true)) enterHold(T, 'REVERT_ADMISSION_HOLD'); }, function(){ enterHold(T, 'REVERT_ADMISSION_HOLD'); });
    return 'deferred';
  }
  /* ---- G6 hold（fail-closed・この物語に限る）: 新しい生成・S.save・この物語の state を運ぶ Worker への書込を止める。
     解除は (a) 検証済みの復旧（admission の中で撤回が通った）か (b) Recovery Draft（fix781・IndexedDB・読み戻し検証済み）を作ってからの再読込だけ */
  /* HOLD の印は端末内の localStorage（タブを閉じて開き直しても続く）。key に物語 id を含めないので同期パッケージ（fix402 / fix399 は key に
     slot id を含むものだけを載せる）にも fix781 の物語の変更検知にも載らない。値は物語の識別・理由・戻せなかった人物の試行前の値だけ */
  var HOLD_SS = 'v292DfixCP1Hold';
  function ssg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function sss(k, v){ try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){} }
  function docStoryId(){ try { var k = window.__chronicleDocumentStoryKey; return (typeof k === 'string' && k.indexOf('chr6_slot_') === 0) ? k.slice(10) : (typeof k === 'string' ? k : null); } catch(e){ return null; } }
  /* r5 final（GPT #127-LS ②）: 印は物語ごと（1 つの key の中に物語の識別 → 記録）。別の物語の HOLD・解除・保存は他の物語の記録に触らない。
     記録は物語に結び付く（その物語の端末内の state に未復旧の値があるため、口座が変わってもその物語は止めたまま＝fail-closed）。acct は試行の口座（記録用） */
  /* 物語の識別は id にそろえて比べる（起動の途中は __chronicleDocumentStoryKey がまだ無く、URL の ?story= で見えることがある＝'url:<id>' と 'doc:chr6_slot_<id>' は同じ物語） */
  function sidOf(k){ if (!k) return null; var x = String(k).replace(/^(doc|url):/, ''); if (x.indexOf('chr6_slot_') === 0) x = x.slice(10); if (x === 'default') x = 'chr6'; return x || null; }
  function holdOf(k){ var kk = sidOf(k) || '*'; return Object.prototype.hasOwnProperty.call(holds, kk) ? holds[kk] : null; }
  /* 今の物語の記録。物語がまだ分からない（起動の途中）ときに記録が 1 件でもあれば止める側（fail-closed） */
  function curHold(){ var sk = storyKey(); if (!sk){ var ks = Object.keys(holds); return ks.length ? holds[ks[0]] : null; } return holdOf(sk) || holdOf('*'); }
  function nHolds(){ return Object.keys(holds).length; }
  function saveHolds(){ var o = {}, n = 0; Object.keys(holds).forEach(function(k){ var h = holds[k]; o[k] = { sid: h.sid, story: h.story, acct: h.acct || null, kind: h.kind, attempt: h.attempt, at: h.at, amb: h.amb, pre: h.pre }; n++; }); sss(HOLD_SS, n ? JSON.stringify({ v: 2, holds: o }) : null); }
  function enterHold(T, kind){
    var k = sidOf(T ? T.story : storyKey()) || '*', h = holdOf(k);
    if (h){ if (kind === 'STATE_UNSAFE') h.kind = kind; saveHolds(); return; }
    h = { sid: k, story: (T ? T.story : storyKey()) || null, acct: T ? (T.acct || null) : acctKey(), kind: kind, attempt: T ? T.id : null, at: now(), T: T || null, amb: (T && T.ambKeys) ? T.ambKeys.slice() : [], pre: null };
    try { if (T && T.store0 && h.amb.length){ var pr = {}; h.amb.forEach(function(x){ pr[x] = Object.prototype.hasOwnProperty.call(T.store0, x) ? T.store0[x] : null; }); h.pre = pr; } } catch(e){}
    holds[k] = h; guardStats.holds++;
    saveHolds();
    try { console.warn(TAG, 'HOLD: generation and saving of this story are stopped until it is safe', kind); } catch(_w){}
    holdNotice();
    if (kind === 'REVERT_ADMISSION_HOLD' && !_holdIv){ try { _holdIv = setInterval(function(){ try { var L = Object.keys(holds).map(function(x){ return holds[x]; }).filter(function(x){ return x && x.kind === 'REVERT_ADMISSION_HOLD' && x.T; }); if (!L.length){ clearInterval(_holdIv); _holdIv = null; return; } var G0 = (0, eval)('typeof G !== "undefined" ? G : null'); if (!G0 || typeof G0._dadmRun !== 'function') return; L.forEach(function(x){ G0._dadmRun('CP1_REVERT', function(){ return revertState(x.T); }).then(function(r){ if (r && r.ran === true && r.result !== 'unsafe' && holds[x.sid] === x) releaseHold('verified-revert', x); }, function(){}); }); } catch(e){} }, 3000); } catch(e){} }
  }
  function releaseHold(why, h){ h = h || curHold(); if (!h || holds[h.sid] !== h) return; delete holds[h.sid]; saveHolds(); guardStats.holdReleased++; try { if (!curHold()){ var n = document.getElementById('v292DfixCP1-hold'); if (n && n.parentNode) n.parentNode.removeChild(n); } } catch(e){} try { console.warn(TAG, 'hold released', why); } catch(_w){} }
  /* ★cp1r-a C: 実行の時点で端末の印を読み直し、別タブで増えた記録を取り込む（追加だけ・opt-in で読み込んだページだけ） */
  var _hlsRaw = null;
  function holdRecsOf(raw){ var ho = JSON.parse(raw); return (ho && ho.v === 2 && ho.holds && typeof ho.holds === 'object') ? Object.keys(ho.holds).map(function(k){ return ho.holds[k]; }) : (ho && ho.story ? [ho] : []); }
  function holdObjOf(x, sx){ return { sid: sx, story: x.story || null, acct: x.acct || null, kind: x.kind || 'STATE_UNSAFE', attempt: x.attempt || null, at: x.at || now(), T: null, amb: x.amb || [], pre: x.pre || null, fromReload: true }; }
  function refreshHolds(){
    if (LOAD_ON !== true && LOAD_ON !== false) return;   /* ★cp1r-b: 読み込み時の判定（LOAD_ON）が決まった後なら ON / OFF / kill のどれでも読み直す（決まる前＝読み込みの記録の取り込みの途中は何もしない） */
    try {
      var raw = ssg(HOLD_SS); if (raw === _hlsRaw) return; _hlsRaw = raw; if (!raw) return;
      var L1 = null; try { L1 = holdRecsOf(raw); } catch(_p){ L1 = null; }
      if (!L1) return;   /* 読めない印は読み込み時と同じく取り込まない（r5 final と同じ扱い） */
      L1.forEach(function(x){ var sx = x && sidOf(x.sid || x.story); if (sx && !Object.prototype.hasOwnProperty.call(holds, sx)){ var h = holdObjOf(x, sx); h.fromXtab = true; holds[sx] = h; guardStats.holdsXtab++; } });
    } catch(e){}
  }
  function heldHere(){ refreshHolds(); return !!curHold(); }
  /* hold の解除（再読込）: 先に Recovery Draft を作り、読み戻し検証が通ったときだけ、安全に戻せなかった人物を試行の前の値へ戻して再読込する。
     Draft が作れないときは何もしない（止めたまま）。 */
  function holdResolve(cb){
    cb = (typeof cb === 'function') ? cb : function(){};
    var hold = storyKey() ? curHold() : null;   /* r5 final: この物語の記録だけ（別の物語の記録・store には触らない。物語が分からないうちは何もしない） */
    if (!hold) return cb(false, nHolds() ? 'NOT_HELD_HERE' : 'NO_HOLD');
    var F = null; try { F = window.__v292Dfix781; } catch(e){ F = null; }
    var id = docStoryId();
    if (!F || typeof F.draftCreate !== 'function' || !id) return cb(false, 'NO_RECOVERY_DRAFT');
    var sch = 1; try { var F5 = window.__v292Dfix705; var st5 = F5 && F5.status && F5.status().state; if (st5 && st5.schema === 2) sch = 2; } catch(eS){}
    try {
      F.draftCreate(id, { schema: sch, reason: 'CP1_STATE_UNSAFE' }, function(ok, err, draftId){
        if (!ok || !draftId) return cb(false, err || 'DRAFT_FAILED');
        try {
          var st = store77(), pre = hold.pre || {};
          if (st) Object.keys(pre).forEach(function(k){ if (pre[k] === null) delete st[k]; else st[k] = cloneJ(pre[k]); });
          if (st && !commit77()) setLs77(JSON.stringify(st));
        } catch(e2){ return cb(false, 'RESET_FAILED'); }
        hold.resolvedDraft = draftId; if (holds[hold.sid] === hold) delete holds[hold.sid]; saveHolds(); guardStats.holdReleased++;
        cb(true, null, draftId);
        try { location.reload(); } catch(e3){}   /* 既存の再読込経路（fix705/fix781 の起動時の解決）へ */
      });
    } catch(e){ cb(false, 'DRAFT_THREW'); }
  }
  /* ★bundle43-a r6（統括・UI45 の試験）: HOLD 通知の置き場所（表示だけ。文面・ボタン・復旧の動きは r5 のまま）。
     r5 は「画面の下から 16px・最前面」固定で、入力欄（#composer）に重なり、UI1 の「⋯ その他」の枠が通知の下に入った。
     r6: BASE の A2 通知（fix758）と同じく #composer の上端から 8px 上に置く（#composer が無い・測れないときは r5 と同じ下から 16px）。
     A2 通知（#v292Dfix758Banner）が見えているときは、その上端から 8px 上（HOLD が上・A2 が下の縦並び。fix758 には触れない）。
     幅 720px 以下は左右 12px の余白。置き直すのは作ったとき・#composer の大きさが変わったとき（ResizeObserver）・window の resize・
     1 秒ごと（A2 の出入りと #composer の作り直しを拾う。通知が消えたら止める）。最前面（z-index 100001）は r5 のまま。 */
  var HOLD_ID = 'v292DfixCP1-hold', HOLD_NARROW = 720, HOLD_SIDE = 12, A2_ID = 'v292Dfix758Banner';
  var _hpIv = null, _hpRO = null, _hpROel = null, _hpRz = false, holdPos = { places: 0, composer: 0, a2: 0, fallback: 0 };
  function holdPlace(d){
    try {
      d = d || document.getElementById(HOLD_ID); if (!d) return;
      var w = window.innerWidth || 0, h = window.innerHeight || 0;
      if (w > 0 && w <= HOLD_NARROW){ d.style.boxSizing = 'border-box'; d.style.maxWidth = 'none'; d.style.width = (w - HOLD_SIDE * 2) + 'px'; }
      else { d.style.boxSizing = ''; d.style.width = ''; d.style.maxWidth = '92vw'; }
      holdPos.places++;
      var cp = document.getElementById('composer'), r = (cp && cp.getBoundingClientRect) ? cp.getBoundingClientRect() : null;
      if (cp && _hpROel !== cp && typeof window.ResizeObserver === 'function'){ try { if (_hpRO) _hpRO.disconnect(); _hpRO = new window.ResizeObserver(function(){ holdPlace(); }); _hpRO.observe(cp); _hpROel = cp; } catch(_ro){} }
      if (!(r && r.height > 0 && r.top > 0 && h > 0)){ d.style.bottom = '16px'; d.style.maxHeight = ''; holdPos.fallback++; return; }
      var b = h - r.top + 8, via = 'composer';
      var a2 = document.getElementById(A2_ID);
      if (a2 && a2 !== d){
        var cs = (typeof window.getComputedStyle === 'function') ? window.getComputedStyle(a2) : a2.style;
        if (cs && cs.display !== 'none' && cs.visibility !== 'hidden'){ var ra = a2.getBoundingClientRect(); if (ra && ra.height > 0 && (h - ra.top + 8) > b){ b = h - ra.top + 8; via = 'a2'; } }
      }
      b = Math.max(8, Math.round(b)); d.style.bottom = b + 'px';
      d.style.maxHeight = Math.max(96, h - b - 8) + 'px'; d.style.overflowY = 'auto';   /* 上へ押し上げられても画面の外へ出さない（確認の文を開いたとき） */
      holdPos[via]++;
    } catch(e){}
  }
  function holdPlaceArm(){
    try { if (!_hpRz){ _hpRz = true; window.addEventListener('resize', function(){ holdPlace(); }); } } catch(e){}
    try { if (_hpIv === null) _hpIv = setInterval(function(){ try { if (!document.getElementById(HOLD_ID)){ clearInterval(_hpIv); _hpIv = null; if (_hpRO){ _hpRO.disconnect(); _hpRO = null; _hpROel = null; } return; } holdPlace(); } catch(_i){} }, 1000); } catch(e2){}
  }
  function holdNotice(){
    try {
      if (!document || !document.body || typeof document.createElement !== 'function') return;
      if (document.getElementById && document.getElementById('v292DfixCP1-hold')) return;
      var d = document.createElement('div'); d.id = 'v292DfixCP1-hold';
      try { d.setAttribute('role', 'status'); } catch(e0){}
      d.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100001;background:#2a2333;color:#efe6ff;border:1px solid #7a5ea0;border-radius:10px;padding:8px 12px;font-size:12.5px;max-width:92vw;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
      var m = document.createElement('span'); m.textContent = '取り消した回の変更を安全に戻せなかったため、この物語の保存と生成を止めています。止めている間の変更は保存されません。'; d.appendChild(m);
      var b = document.createElement('button'); b.textContent = '退避して開き直す…';
      b.style.cssText = 'background:#7a5ea0;color:#fff;border:0;border-radius:8px;padding:4px 10px;cursor:pointer;flex:none';
      /* #127-LU §2: 開き直す前に、守られる範囲と失われる範囲を伝えて確認する（無言で捨てない）。Recovery Draft（fix781）が退避するのは、
         この物語の端末内に保存済みの内容（本文と付随の 13 種のキー）だけ。HOLD 中は保存を止めているので、その間の変更は Draft にも入らない */
      b.onclick = function(){
        try {
          if (document.getElementById('v292DfixCP1-hold-confirm')) return;
          var h0 = curHold(), n0 = (h0 && h0.amb) ? h0.amb.length : 0;
          var c = document.createElement('div'); c.id = 'v292DfixCP1-hold-confirm'; c.style.cssText = 'flex-basis:100%;display:flex;flex-direction:column;gap:6px;margin-top:4px';
          var t = document.createElement('div'); t.style.cssText = 'white-space:pre-line;line-height:1.5';
          t.textContent = '開き直す前に確認してください。\n・保存済みの内容（本文・登場人物の状態など）は、いまの時点のものをこの端末の中に退避します。退避したものを画面から元に戻すことはできません。\n・止めている間の変更（手での編集、キャラ一覧の変更など）は保存されていないため、消えます。入力欄の文字も消えることがあります。必要なら先に書き写してください。\n・安全に戻せなかった人物（' + n0 + ' 人）の状態は、取り消した回の前の値に戻ります。';
          c.appendChild(t);
          var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
          var yes = document.createElement('button'); yes.textContent = '開き直す'; yes.style.cssText = b.style.cssText;
          var no = document.createElement('button'); no.textContent = 'やめる'; no.style.cssText = 'background:transparent;color:#efe6ff;border:1px solid #7a5ea0;border-radius:8px;padding:4px 10px;cursor:pointer;flex:none';
          no.onclick = function(){ try { if (c.parentNode) c.parentNode.removeChild(c); } catch(_n){} };
          yes.onclick = function(){ yes.disabled = true; no.disabled = true; m.textContent = '退避しています…'; holdResolve(function(ok, err){ if (!ok){ m.textContent = '退避できなかったため、止めたままにしています。'; try { if (c.parentNode) c.parentNode.removeChild(c); } catch(_r){} } }); };
          row.appendChild(no); row.appendChild(yes); c.appendChild(row); d.appendChild(c); holdPlace(d);
        } catch(e){}
      };
      d.appendChild(b);
      document.body.appendChild(d);
      holdPlace(d); holdPlaceArm();   /* r6: #composer の上（A2 があればその上）へ */
    } catch(e){}
  }
  /* 読み込み時: hold のまま再読込・開き直された物語なら、hold を続ける（解除は上の 2 つだけ）。r5 final: 物語ごとの記録（v2）。旧形（1 件）も読む */
  try { var hs0 = ssg(HOLD_SS); if (hs0){ var ho = JSON.parse(hs0), L0 = (ho && ho.v === 2 && ho.holds && typeof ho.holds === 'object') ? Object.keys(ho.holds).map(function(k){ return ho.holds[k]; }) : (ho && ho.story ? [ho] : []);
    L0.forEach(function(x){ var sx = x && sidOf(x.sid || x.story); if (sx) holds[sx] = { sid: sx, story: x.story || null, acct: x.acct || null, kind: x.kind || 'STATE_UNSAFE', attempt: x.attempt || null, at: x.at || now(), T: null, amb: x.amb || [], pre: x.pre || null, fromReload: true }; }); _hlsRaw = hs0;
    if (on() && heldHere()) { try { setTimeout(function(){ if (heldHere()) holdNotice(); }, 1500); } catch(_t){} } } } catch(e){}
  /* Worker への書込のうち、物語の state を運ぶもの（tap から呼ばれる）。hold 中は止める。採用前の仮の state が保存先へ書かれてしまった
     （＝parse の後に他の誰かが store 全体を書いた）試行があれば、その試行が決着するまで止める */
  var WRITE_OPS = { put: 1, putstory: 1, putcanonical: 1, commitstate: 1, forceput: 1 };
  function onSave(u, body){
    try {
      if (!/\/save(\?|$)/.test(String(u && u.url ? u.url : u))) return;
      var j = null; try { j = JSON.parse(body); } catch(e0){ return; }
      if (!j || !WRITE_OPS[String(j.op)]) return;
      var why = null;
      if (heldHere()) why = 'STATE_UNSAFE_HOLD';
      else { for (var i = 0; i < recent.length; i++){ var T = recent[i]; if (T && T.provisional && T.state !== 'adopted' && T.ls0 !== undefined && ls77() !== T.ls0){ why = 'PROVISIONAL_STATE'; break; } } }
      if (!why) return;
      guardStats.workerWriteBlocked++;
      return { block: true, why: why };
    } catch(e){ return; }
  }
  /* r5 final（GPT #127-LS ①）: kill（v292DfixCP1Off）や opt-in を外して読み込んだページでも、この物語に HOLD の記録が残っていれば、
     未復旧の state を既存の保存経路（S.save・Worker への物語の state 書込＝fix402 / fix399 / fix697 / putcanonical など）へ出さない。
     CP1 の働き（印・注記・presence・除外）は何も装着しない。止めるのは HOLD の 3 点（S.save・state 書込・生成）だけで、出口は通知のボタン
     （Recovery Draft → 未復旧の人物を試行前の値へ → 印を消して再読込）だけ。HOLD の記録が無い物語では何もしない（kill = CP1 を外す、のまま） */
  function holdOnlyErr(){ var e = new Error('[v292DfixCP1] held [CP1_INTERRUPTED:STATE_UNSAFE_HOLD]'); try { e.code = 'CP1_INTERRUPTED'; e.reason = 'STATE_UNSAFE_HOLD'; e.terminal = true; } catch(_e){} return e; }
  var _hoSave = null, _hoBuild = null, holdWraps = { save: 0, build: 0, fetch: 0 };   /* cp1r-c: 包みを作った回数（診断・件数だけ） */   /* 自分の包みが一番外にあるか（fix274 が __v292* の印を後の包みへ写すので、印ではなく参照で見る） */
  /* ★cp1r-c（GPT #127-MX の後・統括）: 包み直しは「包みが鎖から消えたとき」だけ。r5〜cp1r-b は参照（S.save !== _hoSave）で判定していたため、
     同じく参照で一番外を取りに来る fix697（S.save を 2 秒ごとに identity で再装着）と交互に上書きし合い、S.save の層が 2 秒ごとに 1 枚ずつ増えた（実測）。
     このページで作った包みに固有の印（HO_TOK・__cp1HoTok）を付け、今の関数（と、外側の包みが写した印）にそれが見えれば鎖の中にあるとみなして包み直さない。
     S（物語の state）や Planner の object そのものが替わったときは、印に関係なく新しい側へ付ける。
     HOLD が付いている間も同じ（一番外でなくても、鎖の中で呼ばれたその場で heldHere() を確かめる）。自分の包みどうしは __cp1HoIn で内側をたどれる（上限 HO_WALK 回）。 */
  var HO_TOK = { cp1HoldOnly: 'cp1r-c' }, HO_WALK = 16, hoSObj = null, hoPObj = null;
  /* 印の名前は __v292 で始めない（fix274 は Planner.build への代入のたびに旧関数の __v292* を新関数へ写すため、鎖を捨てた差し替えにも印が写ってしまう）。
     鎖の上の包み（fix697・fix277 など）は内側の own props を写すので、印が見えれば鎖の中に関門がある。 */
  function hoInChain(f){
    try { for (var n = 0; f && typeof f === 'function' && n < HO_WALK; n++){ if (f.__cp1HoTok === HO_TOK) return true; f = f.__cp1HoIn; } } catch(e){}
    return false;
  }
  function holdOnlyWrap(){
    try { var S = getS(); if (S && typeof S.save === 'function' && (S !== hoSObj || !hoInChain(S.save))){ var os = S.save; var w = function(){ if (heldHere()){ guardStats.holdSaveRefused++; guardStats.saveBlocked++; try { console.warn(TAG, 'save skipped: hold (CP1 off at load)'); } catch(_w){} return undefined; } return os.apply(this, arguments); }; try { Object.keys(os).forEach(function(k){ w[k] = os[k]; }); } catch(_k){} w.__v292DfixCP1Hold = true; w.__cp1HoTok = HO_TOK; w.__cp1HoIn = os; S.save = w; _hoSave = S.save; hoSObj = S; holdWraps.save++; } } catch(e){}
    try { var P = window.Planner; if (P && typeof P.build === 'function' && (P !== hoPObj || !hoInChain(P.build))){ var ob = P.build; var wb = function(){ if (heldHere()){ guardStats.holdBuildRefused++; holdNotice(); throw holdOnlyErr(); } return ob.apply(this, arguments); }; try { Object.keys(ob).forEach(function(k){ wb[k] = ob[k]; }); } catch(_k2){} wb.__v292DfixCP1Hold = true; wb.__cp1HoTok = HO_TOK; wb.__cp1HoIn = ob; P.build = wb; _hoBuild = P.build; hoPObj = P; holdWraps.build++; } } catch(e2){}
  }
  function installHoldOnly(){
    inst.holdOnly = true;
    var tapRoutes = false; try { tapRoutes = (LOAD_ON === true && tapOk()); } catch(_tr){ tapRoutes = false; }   /* ★cp1r-a: tap（guard 3）が同じ onSave で止めるので fetch は包まない（二重にしない） */
    inst.holdOnlyFetch = !tapRoutes;
    try { var f0 = window.fetch; if (!tapRoutes && typeof f0 === 'function' && !f0.__v292DfixCP1Hold){ var gf = function(u, o){ try { if (o && typeof o.body === 'string' && String(o.method || '').toUpperCase() === 'POST'){ var v = onSave(u, o.body); if (v && v.block === true) return Promise.reject(holdOnlyErr()); } } catch(_e){} return f0.apply(this, arguments); }; try { Object.keys(f0).forEach(function(k){ gf[k] = f0[k]; }); } catch(_k){} gf.__v292DfixCP1Hold = true; window.fetch = gf; holdWraps.fetch++; } } catch(e){}
    holdOnlyWrap();
    try { setInterval(function(){ holdOnlyWrap(); }, 2000); } catch(e3){}   /* ★cp1r-b: ON / OFF / kill のどのページでも、後から増えた HOLD（別タブ）に備えて包みを保つ（中身は heldHere() の素通し） */
    try { setTimeout(function(){ if (heldHere()) holdNotice(); }, 1500); } catch(e4){}
  }
  /* ③ 採用（S.turns.push）の関門。試行の同期区間（within）の中の push だけを見る（列挙されないプロパティ・JSON には出ない）。
     通れば adopted（採用完了）＝この瞬間からは取り消さない。止めるときは追加させずに失敗させる（branches・保存・fix444 は走らない） */
  function guardPush(S){
    try {
      var arr = S && S.turns; if (!Array.isArray(arr) || arr.__cp1PushGuard) return;
      var nativePush = Array.prototype.push;
      Object.defineProperty(arr, 'push', { configurable: true, enumerable: false, writable: true, value: function(){
        var T = scopeT, why = null;
        if (T && T.eff && this === (T.sRef && T.sRef.turns)){
          try { why = (T.state === 'adopted') ? 'duplicate' : interruptedWhy(T); } catch(e){ why = null; }   /* 1 つの試行が採用するのは 1 回だけ */
          if (!why && heldHere()) why = 'hold';
          if (why === 'duplicate'){ guardStats.duplicateRefused = (guardStats.duplicateRefused || 0) + 1; throw cp1Err(T, 'commit', 'duplicate'); }
          if (why){ cancel(T, 'commit', why); if (T.provisional) revertState(T); guardStats.commitReverted++; throw cp1Err(T, 'commit', why); }
          var res = nativePush.apply(this, arguments);
          if (T.state === 'open'){ T.state = 'adopted'; guardStats.adopted++; if (T.prov){ T.prov = null; guardStats.prov.adopted++; }   /* r6: 採用後は仮の判定を使わない（次の ensure が採用したターンから確定） */
            if (T.provisional){ if (commit77()) guardStats.provisionalPersisted++; else { try { var st = store77(); if (st && setLs77(JSON.stringify(st))) guardStats.provisionalPersisted++; } catch(e3){} } T.provisional = false; } }
          return res;
        }
        return nativePush.apply(this, arguments);
      } });
      Object.defineProperty(arr, '__cp1PushGuard', { configurable: true, enumerable: false, value: true });
    } catch(e){}
  }
  /* ③' 予備: 取り消した試行のターンが何かの経路で S.turns に入っていたら、その試行の plan を持つターンだけを取り除く（末尾ではなく同一性） */
  function revertAttempt(S, T){
    if (T.state === 'adopted') return 0;
    var removed = 0, i;
    for (i = S.turns.length - 1; i >= T.len0 && i >= 0; i--){ var t = S.turns[i]; if (t && T.plans.indexOf(t.plan) >= 0){ S.turns.splice(i, 1); removed++; } }
    if (!removed) return 0;
    try { if (T.hasBranches0 && S.scene && S.scene.branches !== T.branches0) S.scene.branches = T.branches0; } catch(e){}
    if (T.provisional) revertState(T);
    guardStats.commitReverted++;
    return removed;
  }
  /* index.html（G.submit）へ渡す口。CP1 を使う試行のときだけ値を返す（OFF・kill・非 Owner・未装着では null＝G.submit は従来の経路のまま） */
  function within(T, fn){ var prev = scopeT; scopeT = T; try { return fn(); } finally { scopeT = prev; } }
  function attOf(r){ try { var T = r && r.__cp1Attempt; return (T && T.eff && LOAD_ON && inst.state === 'installed') ? T : null; } catch(e){ return null; } }
  function attApi(T){ var A = getApi(); return { call: function(s, u, m, o){ var o2 = {}; if (o && typeof o === 'object') Object.keys(o).forEach(function(k){ o2[k] = o[k]; }); o2.__cp1Att = T; return A.call(s, u, m, o2); } }; }
  function superseded(T){ return !!(T && turn && turn !== T && turn.id > T.id); }
  /* G.submit の finally: 採用されずに終わった試行は取消（NOT_COMMITTED）。仮の state があれば admission の中で撤回する */
  function endAttempt(T){
    try {
      if (!T || !T.eff) return;
      if (T.state === 'open'){ cancel(T, 'end', 'not-committed'); guardStats.endCancelled++; }
      if (T.state === 'cancelled' && T.provisional && !T.revertPending && T.stateRevert !== 'unsafe') revertInAdmission(T);   /* 安全に戻せないと判定済み（hold 中）なら再試行しない */
    } catch(e){}
  }
  function turnActive(){ return !!(turn && turn.eff) && LOAD_ON && inst.state === 'installed' && engineNew(); }   /* 実効 ON（呼び出しごと）。on() は読み込み時の装着判定（opt-in かつ非 kill）にだけ使う */
  function getS(){
    try { if (typeof window.__chronicleGetState === 'function'){ var s = window.__chronicleGetState('fixCP1'); if (s) return s; } } catch(e){}
    try { return window.S || (0, eval)('typeof S !== "undefined" ? S : null'); } catch(e2){ return null; }
  }
  function errName(e){ try { return String((e && e.name) || 'Error').slice(0, 40); } catch(_e){ return 'Error'; } }   /* r5: 例外の文面（入力の断片を含みうる）は出さない */
  function esc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function snip(s){ s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > MAX_EV ? s.slice(0, MAX_EV - 1) + '…' : s; }

  /* ---- 名前の形（完全名・空白区切りの部分・姓/名の推定）。③ 1 文字形は作らない。cast 全体で一意な形だけ使う ---- */
  function rawForms(name){
    var n = String(name || '').trim(), out = [];
    if (!n) return out;
    out.push(n);
    var parts = n.split(/[\s　・]+/).filter(Boolean);
    if (parts.length > 1){ parts.forEach(function(p){ if (p.length >= 2) out.push(p); }); return out; }
    var L = n.length;
    if (L === 3){ out.push(n.slice(1)); out.push(n.slice(0, 2)); }                       /* 姓1+名2 の名 と 姓2+名1 の姓（どちらも 2 字） */
    else if (L === 4){ out.push(n.slice(0, 2)); out.push(n.slice(2)); }
    else if (L >= 5){ out.push(n.slice(0, 2)); out.push(n.slice(-3)); out.push(n.slice(-2)); }
    return out.filter(function(f){ return f.length >= 2; });
  }
  function formTable(S){
    var cast = (S && S.cast) || {}, names = [], i;
    try { if (cast.hero && cast.hero.name) names.push(String(cast.hero.name)); } catch(e){}
    var npcs = Array.isArray(cast.npcs) ? cast.npcs : [];
    for (i = 0; i < npcs.length; i++) if (npcs[i] && npcs[i].name) names.push(String(npcs[i].name));
    var count = {}, all = names.map(function(n){ var fs = rawForms(n); fs.forEach(function(f){ count[f] = (count[f] || 0) + 1; }); return { name: n, forms: fs }; });
    var tbl = {};
    all.forEach(function(e){ tbl[e.name] = e.forms.filter(function(f){ return count[f] === 1; }); });   /* cast 全体で一意な形だけ（「霧 涼太」「霧 悠真」の「霧」は 1 字なので最初から無い） */
    return tbl;
  }
  var HON = '(?:先輩|せんぱい|さん|くん|君|ちゃん|様|さま|氏|先生|部長)?';
  /* GAP = 助詞と動詞の間に許す短い語。別の助詞 は/が/も を含む語は許さない（「千景は澪がいない」を 千景 の不在にしない）。
     て/で も許さない（「傘を持っていない」「怯えていない」の補助動詞「〜ていない」を存在の「いない」に取らない。実コピー smvf5qox8ze T3 で捕捉した誤検出） */
  var GAP = '(?:どこにも|どこへも|もう|既に|すでに|まだ|また|やはり|やっぱり)*[^、。！？!?\\nはがもてで]{0,10}?';
  var ABSENT_V = '(?:は|が|も|の姿(?:は|が|も)?|とは)?' + GAP + '(?:いない|居ない|いなかった|居なかった|いなくなった|居なくなった|いなくなって|消えた|消えていた|姿がない|姿が見えない|姿はない|姿は無い|見当たらない|見あたらない|はぐれた|はぐれて|置いていかれた|取り残された|連れ去られた|さらわれた|攫われた|離れ離れ|別行動|置いてき|置いて行|立ち去った|出て行った|出ていった|去った|去っていった|帰った|帰っていった|帰ってしまった|姿を消した)';
  var ABSENT_T = '(?:と|とは|とも)(?:はぐれ|別れ|離れ|分かれ)';
  /* r5 の PRESENT の正規表現（r6 では presentIn の PRES_OLD_VERB / oldT に移した。記録として残す・使わない） */
  var PRESENT_V = '(?:は|が|も)?' + GAP + '(?:戻ってき|戻って来|帰ってき|帰って来|現れた|現われた|姿を見せた|合流し|合流する|追いついた|追い付いた|駆けつけ|駆け込んで|駆け寄って|やってきた|やって来た|来てくれた|入ってきた|入って来た|到着し|再会し)';
  var PRESENT_T = '(?:と|とも)(?:合流|再会)';
  var COMOVE = '(?:と|は|が|も)(?:一緒に|共に|ともに)|を連れて|の手を(?:引|取|握)';
  var UNREAL = /かもしれ|だろう|だろうか|ような気|気がした|思い出|回想|夢|幻|電話|通話|受話器|画面|スマホ|端末|メッセージ|噂|らしい|はず|だったら|つもり|かのよう|もし|想像|錯覚|声だけ|声しか/;
  function clauses(text){ return String(text || '').split(/[。！？!?\n]/); }
  /* ★bundle43-a r6（Owner 先行試用 #1・戻りの言い方が狭すぎた）: プレイヤー入力の「戻った・いる」の判定（PRESENT の側だけ。ABSENT の語は r5 のまま）。
     ・肩書き（刑事・警部・課長・先生など）を名前と助詞の間に許す（r5 は「真田刑事がやって来た」を取れなかった）。
     ・新しい言い方は名前の直後に は/が/も（「一緒に」は と も）が要る: 来た／来ている／やって来る／入ってくる／戻ってくる／帰ってくる／加わった／姿を現し／顔を出し、
       「（場所）にいる」（場所の語に ここ・この・目の前・隣・そば・同じ… か今の場面名があるときだけ。離れた場所にいるは戻りにしない）、「一緒にいる」、「〜がいる」。
     ・戻さないもの（r5 の語にも同じ除外をかける）: 否定（来なかった・来ていない・合流しなかった・わけではない）、仮定（来たら・来れば・来るかも・来るなら・来るはず・来てほしい）、
       伝聞（来たらしい・来たそうだ・来たって・来たと聞いた・噂）、電話・画面越し（電話で・電話が・画面に・メールで・写真に…）、問い（？で終わる節）、
       夢・回想・想像、「出来た／以来／将来」などの「来」を含む別の語。
     ・名前の照合（formTable・一意な形だけ）と「同じテキスト内は後に書かれた方が勝つ」は r5 のまま。本文（AI の地の文）からは決めない（derive は playerText だけ） */
  var RET_HON = '(?:巡査部長|警部補|警部|警視|刑事|巡査|署長|課長|係長|部長|社長|店長|主任|隊長|団長|班長|室長|局長|会長|教授|博士|先生|先輩|せんぱい|さん|くん|君|ちゃん|様|さま|氏|殿)?';
  var GAP2 = '(?:どこにも|どこへも|もう|既に|すでに|まだ|また|やはり|やっぱり)*[^。！？!?\\nはがもてで]{0,14}?';   /* 「（場所）にいる」だけ: 読点を 1 つ越えてよい（「真田は今、この事務所にいる」） */
  var PRES_OLD_VERB = '戻ってき|戻って来|帰ってき|帰って来|現れた|現われた|姿を見せた|合流し|合流する|追いついた|追い付いた|駆けつけ|駆け込んで|駆け寄って|やってきた|やって来た|来てくれた|入ってきた|入って来た|到着し|再会し';
  var PRES_NEW_VERB = 'やってくる|やって来る|入ってくる|入って来る|戻ってくる|戻って来る|帰ってくる|帰って来る|来ていた|来ている|来ています|来てる|来ました|来た|加わった|加わって|加わり|加わる|姿を現し|顔を出し|顔を見せ';
  var PRES_PAT = [
    { k: 'old',  re: '(?:は|が|も)?' + GAP + '(' + PRES_OLD_VERB + ')' },            /* r5 の語（助詞は任意のまま） */
    { k: 'oldT', re: '(?:と|とも)((?:合流|再会)(?:する|し)?)' },   /* 「し・する」まで含めて、続く否定・仮定（合流しなかった・合流したら）を見る */
    { k: 'new',  re: '(?:は|が|も)' + GAP + '(' + PRES_NEW_VERB + ')' },
    { k: 'with', re: '(?:と|は|が|も)' + GAP + '((?:一緒に|共に|ともに)(?:いる|居る|います|おります))' },
    { k: 'here', re: '(?:は|が|も)' + GAP2 + '(に(?:いる|居る|います|おります))', place: true },
    { k: 'bare', re: '(?:は|が|も)(?:今|いま|ちゃんと|まだ|ずっと|確かに)?((?:いる|居る|います))' }
  ];
  var RET_COMPOUND = '出以将未本従元家由到往再伝外舶古爾襲去近';
  var RET_MODAL = /かもしれ|だろう|でしょう|らしい|はず|もし|だったら|つもり|噂|夢|幻|想像|錯覚|思い出|回想|ような気|気がした|かのよう|声だけ|声しか|って聞|と聞|予定|明日|あした|明後日|来週|そのうち|いずれ/;
  var RET_MEDIA = /(?:電話|通話|受話器|画面|スマホ|端末|メッセージ|メール|LINE|ライン|ビデオ|オンライン|モニター|無線|手紙|連絡|映像|動画|テレビ|中継|写真)(?:で|が|に|から|越し|ごし|の向こう|の中|口|を通|経由)/;
  var RET_NEG = /^(?:た|ました)?(?:わけ|の|ん)(?:では|じゃ)(?:な|あり)|^(?:て|で)?(?:い|お|は|も)?(?:ない|なかっ|なく|ません|らず|ず)|^ませ/;
  var RET_HYPO = /^(?:た|ました)?(?:ら|り|ば(?!かり)|れば|なら|としたら|とすれば|場合|限り|かも|か(?:$|、|ね|な|い|の|も|しら|どうか)|のか|はず|べき|よう|みたい|そう(?:だ|です|な|に|で)|らしい|って|とか|と(?:の|は)?(?:聞|言|い[うっ]|思|話|噂|知ら|電話|連絡|メール|知らせ|報告|伝え)|ことに|つもり|予定|ため|まで|前に|のでは|んじゃ|たい|たかっ|てほし|て欲し|てくれ(?:たら|れば|な|ませ)|のを待|でしょう|だろう|道|方向|方角)/;
  var RET_HERE = /ここ|こちら|この|目の前|眼前|隣|となり|そば|傍|横|後ろ|背後|同じ|その場|一緒/;
  var retStats = { tried: 0, hit: 0, neg: 0, hypo: 0, media: 0, modal: 0, ask: 0, compound: 0, place: 0 };   /* 件数だけ（名前・本文は持たない） */
  /* 1 つの節の中で、その名前の「今いる・戻った」の最後の有効な証拠（無ければ null）。c は伏せ字済みの節、term は節の区切りの文字 */
  function presentIn(c, nm, sceneId, term){
    if (term === '？' || term === '?'){ retStats.ask++; return null; }
    var best = null, modal = RET_MODAL.test(c);
    for (var q = 0; q < PRES_PAT.length; q++){
      var P = PRES_PAT[q], re = new RegExp(nm + RET_HON + P.re, 'g'), m;
      while ((m = re.exec(c))){
        retStats.tried++;
        var end = m.index + m[0].length, vb = m[1] || '', vs = end - vb.length, tail = c.slice(end), ok = true;
        if (modal){ ok = false; retStats.modal++; }
        else if (vb.charAt(0) === '来' && RET_COMPOUND.indexOf(c.charAt(vs - 1)) >= 0){ ok = false; retStats.compound++; }
        else if (RET_NEG.test(tail)){ ok = false; retStats.neg++; }
        else if (RET_HYPO.test(tail)){ ok = false; retStats.hypo++; }
        else if (RET_MEDIA.test(c.slice(0, end))){ ok = false; retStats.media++; }
        else if (P.place && !(RET_HERE.test(m[0]) || (sceneId && sceneId !== 'start' && String(sceneId).length >= 2 && m[0].indexOf(String(sceneId)) >= 0))){ ok = false; retStats.place++; }
        if (ok){ retStats.hit++; if (!best || m.index >= best.at) best = { ev: snip(m[0]), at: m.index }; }
        re.lastIndex = m.index + 1;
      }
    }
    return best;
  }
  /* ★r6 final（GPT #127-LW Q3）: r5 の読み方（r5 の scan と 1 文字も同じ）。r6 を入れる前に確定済みのターンはこちらで読み直す（黙って読み替えない） */
  function scanR5(text, forms, strict){
    var res = {}, src = String(text || ''), cls = clauses(src), off = 0;
    var sorted = forms.slice().sort(function(a, b){ return b.length - a.length; });
    for (var i = 0; i < cls.length; i++){
      var c = cls[i], base = off; off += c.length + 1;
      if (!c) continue;
      if (strict && UNREAL.test(c)) continue;
      for (var f = 0; f < sorted.length; f++){
        var x = sorted[f]; if (c.indexOf(x) < 0) continue;
        var nm = esc(x), m;
        if ((m = new RegExp(nm + HON + '(?:' + ABSENT_V + '|' + ABSENT_T + ')').exec(c))) res.absent = { ev: snip(m[0]), at: base + m.index };
        if ((m = new RegExp(nm + HON + '(?:' + PRESENT_V + '|' + PRESENT_T + ')').exec(c))) res.present = { ev: snip(m[0]), at: base + m.index };
        if ((m = new RegExp(nm + HON + '(?:' + COMOVE + ')').exec(c))) res.comove = { ev: snip(m[0]), at: base + m.index };
        c = c.split(x).join(new Array(x.length + 1).join('〓'));   /* 〓 で伏せ字（長さ不変＝位置不変）。「柊千景」の中の「千景」を二重に拾わない */
      }
    }
    return res;
  }

  /* 1 本のテキストから NPC ごとの証拠を集める。strict=true は節に推量・遠隔語があれば無視（② により v0 では proseHints の診断にだけ使う）。
     r6: sceneId（任意）は「（場所）にいる」の場所が今の場面かの確認にだけ使う */
  function scan(text, forms, strict, sceneId){
    var res = {}, src = String(text || ''), cls = clauses(src), off = 0;
    var sorted = forms.slice().sort(function(a, b){ return b.length - a.length; });
    for (var i = 0; i < cls.length; i++){
      var c = cls[i], base = off, term = src.charAt(off + c.length); off += c.length + 1;
      if (!c) continue;
      if (strict && UNREAL.test(c)) continue;
      for (var f = 0; f < sorted.length; f++){
        var x = sorted[f]; if (c.indexOf(x) < 0) continue;
        var nm = esc(x), m, pr;
        if ((m = new RegExp(nm + HON + '(?:' + ABSENT_V + '|' + ABSENT_T + ')').exec(c))) res.absent = { ev: snip(m[0]), at: base + m.index };
        if ((pr = presentIn(c, nm, sceneId, term))) res.present = { ev: pr.ev, at: base + pr.at };   /* r6: r5 の 1 本の正規表現 → presentIn（語を足し、否定・仮定・伝聞・電話を除く） */
        if ((m = new RegExp(nm + HON + '(?:' + COMOVE + ')').exec(c))) res.comove = { ev: snip(m[0]), at: base + m.index };
        c = c.split(x).join(new Array(x.length + 1).join('〓'));   /* 〓 で伏せ字（長さ不変＝位置不変）。「柊千景」の中の「千景」を二重に拾わない */
      }
    }
    return res;
  }

  /* ---- scene_move（構造化イベント）。検証を通ったものだけ採る。S.scene.loc は読まない ---- */
  var RE_TAG = /<scene_move\b([^<>]*?)\/>/i, RE_STRIP = /<scene_move\b[^<>]*\/?>|<\/\s*scene_move\s*>/gi;
  function attrsOf(s){ var out = {}, re = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/g, m; while ((m = re.exec(String(s || '')))) out[m[1].toLowerCase()] = m[2]; return out; }
  function countOcc(hay, needle){ if (!needle) return 0; var n = 0, from = 0, at; while ((at = hay.indexOf(needle, from)) >= 0){ n++; from = at + 1; } return n; }
  function sceneMoveOf(t, heroName){
    try {
      var pn = t && t.plan && t.plan.narrative, raw = Array.isArray(pn) ? pn.join('\n') : String(pn || '');
      if (!RE_TAG.test(raw)) raw = String((t && t.narrative) || '');
      var m = RE_TAG.exec(raw); if (!m) return null;
      var a = attrsOf(m[1]), who = String(a.who || '').trim(), to = String(a.to || '').trim(), ev = String(a.ev || '');
      var body = raw.replace(RE_STRIP, '');
      var F = window.__v292Dfix645;
      if (F && typeof F.judge === 'function'){
        var j = F.judge(raw, body, { hero: heroName || '' });
        return (j && j.accepted && j.to) ? { to: String(j.to), reason: 'fix645:accepted' } : { to: null, reason: 'fix645:' + ((j && j.reason) || 'rejected') };
      }
      /* fix645 未読込時の最小検証（fix645 verify の中核と同じ: who=hero・to・ev 非空・ev が本文に丁度 1 回・ev⊇to） */
      if (!(who.toLowerCase() === 'hero' || (heroName && who === heroName))) return { to: null, reason: 'who-not-hero' };
      if (!to) return { to: null, reason: 'to-empty' };
      if (!ev) return { to: null, reason: 'ev-empty' };
      var n = countOcc(body, ev);
      if (n === 0) return { to: null, reason: 'ev-not-in-body' };
      if (n > 1) return { to: null, reason: 'ev-ambiguous' };
      if (ev.indexOf(to) < 0) return { to: null, reason: 'ev-missing-to' };
      return { to: to, reason: 'minimal:accepted' };
    } catch(e){ return null; }
  }
  function npcId(S, n){
    if (n && n.character_id) return String(n.character_id);
    try { var b = S && S.bindings; if (b && n && n.name && b[n.name]) return String(b[n.name]); } catch(e){}
    return 'name:' + String((n && n.name) || '');
  }
  function pickEv(r){ var a = r.absent, p = r.present; if (a && p) return a.at > p.at ? { st: 'ABSENT', ev: a.ev } : { st: 'PRESENT', ev: p.ev }; if (a) return { st: 'ABSENT', ev: a.ev }; if (p) return { st: 'PRESENT', ev: p.ev }; return null; }

  /* ---- 決定的な再導出（S.turns 全走査・書込 0） ---- */
  /* ★r6 final（GPT #127-LW Q3）: 規則の切り替え点 r6from。これより前のターンは r5 の読み方、以降は r6 の読み方。
     ・保存済みの field に r6from があればそれ（r6 が書いた field）。
     ・r6from の無い field（r5 が書いた）なら、その turnsLen まで＝r5 で確定済み → そこから先だけ r6。
     ・field が無い物語（CP1 で一度も確定していない）は 0（全部 r6）。
     ・取消などでターンが減っていれば今のターン数で頭打ち（以後に足されるターンは r6）。
     derive は全ターンを走査し直すが、確定済みのターンは確定したときの規則で読むので、既存の物語の過去分の判定は変わらない。 */
  function epochOf(S, len){
    var f = null; try { f = S && S.scene ? S.scene[FIELD] : null; } catch(e){ f = null; }
    var from = 0;
    if (f && f.v === 1 && f.npcs){ from = (typeof f.r6from === 'number' && f.r6from >= 0) ? f.r6from : ((typeof f.turnsLen === 'number' && f.turnsLen >= 0) ? f.turnsLen : 0); }
    return Math.min(from, len);
  }
  function derive(S){
    var out = { v: 1, sceneId: 'start', sceneTurn: 0, turnsLen: 0, npcs: {} };
    if (!S || !S.cast) return out;
    var npcs = (Array.isArray(S.cast.npcs) ? S.cast.npcs : []).filter(function(n){ return n && n.name; });
    var tbl = formTable(S), turns = Array.isArray(S.turns) ? S.turns : [];
    var heroName = (S.cast.hero && S.cast.hero.name) ? String(S.cast.hero.name) : '';
    npcs.forEach(function(n){ out.npcs[npcId(S, n)] = { name: String(n.name), state: 'UNKNOWN', turn: -1, src: 'init', ev: '', scene: out.sceneId }; });
    var from = epochOf(S, turns.length);   /* r6 final: これより前は r5 の読み方 */
    for (var i = 0; i < turns.length; i++){
      var t = turns[i] || {};
      var mv = sceneMoveOf(t, heroName), to = mv && mv.to;
      if (to){
        /* ① 場面が変わったら全員 UNKNOWN（ABSENT も）。移動後の在不在は移動後の明示証拠だけで決める */
        out.sceneId = to; out.sceneTurn = i;
        npcs.forEach(function(n){ var e = out.npcs[npcId(S, n)]; e.state = 'UNKNOWN'; e.turn = i; e.src = 'scene_move'; e.ev = snip('<scene_move to="' + to + '">'); e.scene = to; });
      }
      applyPlayer(out, S, npcs, tbl, t.playerText, i, !!to, i < from);
    }
    out.turnsLen = turns.length;
    out.r6from = from;   /* r6 final: 切り替え点を field に残す（r5 は読まない key。r5 が導き直すと消え、次に r6 が読むと「その turnsLen まで r5」になる） */
    return out;
  }
  /* 1 ターン分のプレイヤー入力を当てる（derive と r6 の仮の判定で共通。r5 の derive の内側と同じ規則） */
  function applyPlayer(out, S, npcs, tbl, text, i, moved, r5rules){
    npcs.forEach(function(n){
      var id = npcId(S, n), e = out.npcs[id], forms = tbl[String(n.name)] || [];
      if (!e) e = out.npcs[id] = { name: String(n.name), state: 'UNKNOWN', turn: -1, src: 'init', ev: '', scene: out.sceneId };   /* 仮の判定の土台に無い NPC（derive では常にある） */
      if (!forms.length) return;
      var pv = r5rules ? scanR5(text, forms, false) : scan(text, forms, false, out.sceneId);   /* ② 本文（AI 生成）は読まない。入力だけ。r6 final: 確定済みのターンは r5 の読み方 */
      var set = function(state, src, ev){ e.state = state; e.turn = i; e.src = src; e.ev = ev; e.scene = out.sceneId; };
      if (moved && pv.comove) set('PRESENT', 'player_comove', pv.comove.ev);
      var p1 = pickEv(pv); if (p1) set(p1.st, 'player', p1.ev);
    });
  }
  /* ★bundle43-a r6（Owner 先行試用 #2・そのターンの入力がそのターンの指示に入らない）:
     r5 は presence を S.turns（採用済みのターン）からだけ導くので、今回の入力（Planner.build の第 2 引数＝採用後の turn.playerText）は
     次のターンからしか効かなかった（「美咲と再会し」のターンでまだ「美咲は現在の場面にいない」と送っていた。「篠原はもういない」も同じく次のターンから）。
     r6: build の開始で、その試行（T）だけの仮の判定 = 確定済みの presence（ensure＝r5 と同じ）＋今回の入力を 1 ターン分当てたもの、を作り、
     そのターンの注入（sys の印・注記、user の presence、fix333 の除外、送信直前の観測の期待値）に使う。
     ・仮の判定はメモリの T.prov だけ。S.scene.presenceCP1 には書かない（保存するのはこれまでどおり ensure＝採用済みのターンからの再導出）。
       採用（S.turns.push が通る）でターンが増えれば、次の ensure がそのターンの playerText から同じ規則で確定する（G6 の「採用まで保存しない」とは別の仕組み）。
     ・取消・中断（cancel）・採用後・別の S・ターン数が変わった後は使わない（捨てる）。fix265 の再送・書き直しは同じ試行なので同じ仮の判定を使う。
     ・場面の移動（scene_move）はまだ起きていないので当てない（同じターンの移動は採用後の再導出で r5 と同じ「移動 → 入力」の順に当たる）。 */
  function provisionalOf(S, text){
    var base = ensure(S); if (!base) return null;
    var p = cloneJ(base); if (!p || !p.npcs) return null;
    var npcs = (S.cast && Array.isArray(S.cast.npcs) ? S.cast.npcs : []).filter(function(n){ return n && n.name; });
    applyPlayer(p, S, npcs, formTable(S), text, Array.isArray(S.turns) ? S.turns.length : 0, false);
    var d = 0; Object.keys(p.npcs).forEach(function(k){ var b = base.npcs[k]; if (!b || b.state !== p.npcs[k].state) d++; });
    p.__delta = d;   /* 件数だけ（保存されない: この object は S に入れない） */
    return p;
  }
  function provOf(T, S){ return (T && T.eff && T.state === 'open' && T.prov && S && T.sRef === S && Array.isArray(S.turns) && S.turns.length === T.len0) ? T.prov : null; }
  /* この build の presence: 開いている CP1 の試行に今回の入力があれば仮の判定、それ以外は r5 と同じ ensure */
  function presFor(S){
    var T = turn;
    if (T && T.eff && T.state === 'open' && typeof T.inText === 'string' && S && T.sRef === S && Array.isArray(S.turns) && S.turns.length === T.len0){
      if (!T.prov){
        var pv = null; try { pv = provisionalOf(S, T.inText); } catch(e){ pv = null; }
        if (!pv){ guardStats.prov.fallback++; return ensure(S); }
        T.prov = pv; guardStats.prov.built++; if (pv.__delta) guardStats.prov.changed++;
      }
      ensure(S);   /* r5 と同じ: 確定済みの field を最新に（カーソル一致なら書かない） */
      return T.prov;
    }
    return ensure(S);
  }
  /* ② の保留分の診断: 本文が何を言っていたか（保存も注入もしない・読み取り専用。矛盾チェック設計の材料） */
  function proseHints(S){
    var hints = [], tbl = formTable(S), turns = (S && Array.isArray(S.turns)) ? S.turns : [], npcs = (S && S.cast && Array.isArray(S.cast.npcs)) ? S.cast.npcs : [];
    for (var i = 0; i < turns.length; i++) npcs.forEach(function(n, ix){ if (!n || !n.name) return; var r = scan((turns[i] || {}).narrative, tbl[String(n.name)] || [], true), p = pickEv(r); if (p) hints.push({ turn: i, npc: ix, would: p.st, evLen: String(p.ev || '').length }); });   /* r5: 名前・抜粋は返さない（添字・字数だけ） */
    return hints;
  }
  /* 保存域 S.scene.presenceCP1 を最新にする（ON のときだけ呼ぶ。カーソル一致なら書かない） */
  function ensure(S){
    if (!S || !S.scene) return null;
    var cur = S.scene[FIELD], len = Array.isArray(S.turns) ? S.turns.length : 0;
    if (cur && cur.v === 1 && cur.turnsLen === len && cur.npcs) return cur;
    var d = derive(S); S.scene[FIELD] = d; return d;
  }
  function absentList(S){
    var p = presFor(S), out = []; if (!p) return out;   /* r6: 開いている試行は今回の入力を当てた仮の判定（保存はしない） */
    Object.keys(p.npcs).forEach(function(k){ var e = p.npcs[k]; if (e.state === 'ABSENT') out.push(e); });
    return out;
  }
  function label(e){ return '最終確認 T' + e.turn + (e.ev ? '「' + e.ev + '」' : ''); }
  /* r4: 注記 1 行の組み立てを関数に出しただけ（文面は r3 と同一）。送信直前の観測で「期待する注記」と照合するために使う */
  function noteFor(abs){ return NOTE_HEAD + abs.map(function(e){ return e.name + '（' + label(e) + '）'; }).join('、') + '。理由なく同じ場所に登場させない。離れた場所での行動、電話・声・記憶・噂としての登場、納得できる合流の描写は可。'; }

  /* ---- sys 後処理（厳格アンカー＋往復自己検査。アンカーが丁度 1 回でなければその操作は行わず、全体が往復一致しなければ無変更） ---- */
  var last = null, userHit = false;   /* userExt は inner build の中（patchSys より前）で走るので、user 側の変更は旗で受け渡す */
  function onceIdx(lines, pred){ var at = -1, n = 0; for (var i = 0; i < lines.length; i++) if (pred(lines[i])){ n++; at = i; } return n === 1 ? at : (n === 0 ? -1 : -2); }
  function bulletEnd(lines, head){ var k = head + 1; while (k < lines.length && lines[k].indexOf('・') === 0) k++; return k; }
  function patchSys(sys, S){
    var abs = absentList(S);
    last = { ver: VER, turns: S.turns ? S.turns.length : 0, nAbsent: abs.length, sysChanged: false, userChanged: userHit, ops: [], skipped: [], selfcheck: 'n/a', prov: (function(){ var pp = provOf(turn, S); return pp ? { delta: pp.__delta || 0 } : null; })() }; userHit = false;
    if (!abs.length) return sys;
    var src = String(sys);
    if (src.indexOf(MARK) >= 0 || src.indexOf(NOTE_HEAD) >= 0){ last.selfcheck = 'already-marked'; return sys; }   /* 二重適用の防止 */
    var lines = src.split('\n'), i, j;
    var names = abs.map(function(e){ return e.name; });
    var stAt = onceIdx(lines, function(l){ return l.indexOf(ST_HEAD) === 0; });
    var ruleAt = onceIdx(lines, function(l){ return l === RULE_HEAD; });
    var seedAt = onceIdx(lines, function(l){ return l.indexOf(SEED_HEAD) === 0; });
    var agAt = onceIdx(lines, function(l){ return l.indexOf(AGENDA_HEAD) === 0; });
    /* 注記の置き場が無ければ何もしない（byte 同一） */
    if (stAt < 0 && ruleAt < 0){ last.selfcheck = 'no-anchor'; last.skipped.push('note:no-anchor'); return sys; }
    var items = lines.map(function(l, ix){ return { text: l, orig: ix, mark: null }; });
    /* (a) 状態行頭: '・名｜' が sys 全体で丁度 1 回、かつ状態ブロックの箇条書き範囲内にあるときだけ印を付ける */
    if (stAt >= 0){
      var stEnd = bulletEnd(lines, stAt);
      for (j = 0; j < names.length; j++){
        var head = '・' + names[j] + '｜';
        var at = onceIdx(lines, function(l){ return l.indexOf(head) === 0; });
        if (at > stAt && at < stEnd){ items[at].text = '・' + names[j] + MARK + '｜' + lines[at].slice(head.length); items[at].mark = head; last.ops.push('mark:#' + j); }
        else last.skipped.push('mark:#' + j + ':' + (at === -1 ? 'absent' : at === -2 ? 'dup' : 'outside'));   /* r5: 名前でなく不在リスト内の番号 */
      }
    }
    /* (b) 種/自発: 見出しが丁度 1 回のときだけ、その箇条書き範囲で fix192 の実書式の行頭に一致する行を落とす。空になれば見出し（と直前の空行）も落とす */
    var dropped = {};
    function dropBlock(headAt, prefixes, tag){
      if (headAt < 0) return;
      var end = bulletEnd(lines, headAt), kept = 0;
      for (var k = headAt + 1; k < end; k++){
        var ln = lines[k], hit = names.some(function(nm){ return prefixes.some(function(p){ return ln.indexOf('・' + nm + p) === 0; }); });
        if (hit){ dropped[k] = 1; last.ops.push('drop:' + tag + ':' + k); } else kept++;
      }
      if (!kept && end > headAt + 1){ dropped[headAt] = 1; if (headAt > 0 && lines[headAt - 1] === '' && !dropped[headAt - 1]) dropped[headAt - 1] = 1; last.ops.push('drop:' + tag + ':block'); }
    }
    dropBlock(seedAt, ['の未解決「', 'の傷(', 'の関係('], 'seed');
    dropBlock(agAt, ['は内心『', 'は傷('], 'agenda');
    /* (c) 1 行の不在注記 */
    var note = noteFor(abs);
    var ins = [];   /* { before: 元 index, lines: [...] } */
    if (stAt >= 0){ ins.push({ before: bulletEnd(lines, stAt), lines: [note] }); last.ops.push('note:state'); }
    else { ins.push({ before: ruleAt, lines: [LOC_HEAD, note, ''] }); last.ops.push('note:rule'); }
    /* 組み立て */
    var out = [];
    for (i = 0; i <= lines.length; i++){
      ins.forEach(function(x){ if (x.before === i) x.lines.forEach(function(l){ out.push({ text: l, orig: null, mark: null }); }); });
      if (i < lines.length && !dropped[i]) out.push(items[i]);
    }
    /* 往復自己検査: 結果から挿入を除き・印を外し・落とした行を元の位置へ戻して、元と byte 一致するか */
    var rebuilt = new Array(lines.length), seen = 0;
    for (i = 0; i < out.length; i++){
      var it = out[i]; if (it.orig === null) continue;
      var txt = it.text;
      if (it.mark){ var pre = '・' + it.mark.slice(1, -1) + MARK + '｜'; if (txt.indexOf(pre) !== 0){ last.selfcheck = 'fail:unmark'; return sys; } txt = it.mark + txt.slice(pre.length); }
      if (rebuilt[it.orig] !== undefined){ last.selfcheck = 'fail:dup-orig'; return sys; }
      rebuilt[it.orig] = txt; seen++;
    }
    Object.keys(dropped).forEach(function(k){ k = +k; if (rebuilt[k] !== undefined){ last.selfcheck = 'fail:drop-overlap'; } rebuilt[k] = lines[k]; seen++; });
    if (last.selfcheck.indexOf('fail') === 0) return sys;
    if (seen !== lines.length || rebuilt.join('\n') !== src){ last.selfcheck = 'fail:roundtrip'; return sys; }
    var res = out.map(function(x){ return x.text; }).join('\n');
    if (res === src){ last.selfcheck = 'ok:nochange'; return sys; }
    last.selfcheck = 'ok'; last.sysChanged = true;
    return res;
  }
  /* ---- user 後処理（fix58 の後に走る _userExtensions。cast.npcs[i].presence を足すだけ） ---- */
  function userExt(ctx){
    if (!turnActive()) return ctx.user;   /* r2: このターンの確定（build の開始時）に従う。r4: ON かつ装着済みかつ engineMode=1 のときだけ */
    try {
      var S = ctx.state || getS(); if (!S) return ctx.user;
      var abs = absentList(S); if (!abs.length) return ctx.user;
      var parsed = JSON.parse(ctx.user);
      if (!parsed || !parsed.cast || !Array.isArray(parsed.cast.npcs)) return ctx.user;
      var byName = {}; abs.forEach(function(e){ byName[e.name] = e; });
      var hit = false;
      parsed.cast.npcs.forEach(function(n){ var e = n && byName[String(n.name)]; if (e){ n.presence = '現在の場面にはいない（' + label(e) + '）'; hit = true; } });
      if (!hit) return ctx.user;
      userHit = true;
      return JSON.stringify(parsed, null, 2);
    } catch(e){ try { console.warn(TAG, 'userExt err', errName(e)); } catch(_e){} return ctx.user; }
  }
  userExt.__v292DfixCP1 = true;
  /* ---- r6 ①: fix333 の前面化の候補から ABSENT を外す（fix333 の受け口 window.__v292DfixCP1Fg333 から呼ばれる。S0 は計測器用） ---- */
  var fgStats = { calls: 0, inactive: 0, noAbsent: 0, filtered: 0, excluded: 0, emptied: 0, unresolved: 0, ambiguous: 0, errors: 0, reasons: {} };
  /* r6b: states の鍵 → stable id。一意に結べるときだけ id、そうでなければ null と理由コード（名前・本文は返さない） */
  function idOfKey(S, key){
    var npcs = (S && S.cast && Array.isArray(S.cast.npcs)) ? S.cast.npcs : [], i, k = String(key);
    var heroN = (S && S.cast && S.cast.hero && S.cast.hero.name) ? String(S.cast.hero.name) : null;
    var cast = {}, nc = 0;
    for (i = 0; i < npcs.length; i++) if (npcs[i] && String(npcs[i].name) === k){ var cid = npcId(S, npcs[i]); if (!cast[cid]){ cast[cid] = 1; nc++; } }   /* 完全名一致だけ */
    var bnd = {}, nb = 0;
    [S && S.bindings, S && S.cast && S.cast.av2 && S.cast.av2.bindings].forEach(function(b){ try { if (b && Object.prototype.hasOwnProperty.call(b, k) && b[k]){ var v = String(b[k]); if (!bnd[v]){ bnd[v] = 1; nb++; } } } catch(e){} });
    var id = null;
    if (nc > 1) return { id: null, why: 'same-name' };
    if (nc === 1){ id = Object.keys(cast)[0]; if (nb > 1 || (nb === 1 && !bnd[id])) return { id: null, why: 'binding-conflict' }; }
    else if (nb > 1) return { id: null, why: 'binding-conflict' };
    else if (nb === 1) id = Object.keys(bnd)[0];
    if (id === null) return { id: null, why: heroN === k ? 'hero' : 'unresolved' };
    if (heroN === k) return { id: null, why: 'hero-name' };
    var names = {}, nn = 0;   /* 逆向き: この id を持つ cast の名前が 1 つだけか */
    for (i = 0; i < npcs.length; i++) if (npcs[i] && npcs[i].name && npcId(S, npcs[i]) === id){ var nm = String(npcs[i].name); if (!names[nm]){ names[nm] = 1; nn++; } }
    if (nn > 1) return { id: null, why: 'id-shared' };
    return { id: id, why: null };
  }
  function fgFilter(states, text, S0){
    fgStats.calls++;
    try {
      var TT = apiCur ? apiCur.T : (function(){ var a = attrib(null); return a.inv ? a.inv.T : null; })();   /* r5: この送信の試行（同期区間）。帰属できなければ絞らない */
      if (!S0 && !(TT && TT.eff && LOAD_ON && inst.state === 'installed' && engineNew())){ fgStats.inactive++; return null; }   /* r2: このターンの確定に従う（r4: 送られる本文の回） */
      if (!S0 && (!sameSide(TT) || TT.aborted || killNow())){ fgStats.inactive++; guardStats.fgSkipped++; return null; }   /* r3: 止めたターン・kill 後も絞らない（送信は tap が止める） */   /* r2: 途中で側が変わった（この送信は tap が止める） */
      if (!states || typeof states !== 'object') return null;
      var S = S0 || getS(); if (!S || !S.cast) return null;
      var cur = S.scene && S.scene[FIELD], len = Array.isArray(S.turns) ? S.turns.length : 0;
      var p = (!S0 && provOf(TT, S)) || ((cur && cur.v === 1 && cur.turnsLen === len && cur.npcs) ? cur : derive(S));   /* 読み取りだけ（ensure は呼ばない）。r6: この送信の試行の仮の判定があればそれ */
      var absIds = {}, nAbs = 0; Object.keys(p.npcs).forEach(function(id){ if (p.npcs[id].state === 'ABSENT'){ absIds[id] = 1; nAbs++; } });
      if (!nAbs){ fgStats.noAbsent++; return null; }
      var out = {}, ex = 0, keys = Object.keys(states);
      keys.forEach(function(k){
        var r = idOfKey(S, k);
        if (r.id === null && r.why && r.why !== 'hero'){ fgStats.reasons[r.why] = (fgStats.reasons[r.why] || 0) + 1; if (r.why === 'unresolved') fgStats.unresolved++; else fgStats.ambiguous++; }
        if (r.id !== null && absIds[r.id]){ ex++; return; } out[k] = states[k]; });
      if (!ex){ fgStats.noAbsent++; return null; }
      fgStats.filtered++; fgStats.excluded += ex;
      if (!Object.keys(out).filter(function(k){ return !(S.cast.hero && String(S.cast.hero.name) === k); }).length) fgStats.emptied++;
      return out;
    } catch(e){ fgStats.errors++; return null; }
  }

  /* ---- 装着（r4: GPT #127-JY ①） ---- */
  /* 実ブラウザでは fix192（engineMode=1 で r.sys = buildSys() と sys を丸ごと差し替える）と fix277（状態行の '・名｜' の名が
     キャスト外なら行を落とす）の Planner.build ラップが CP1 より後（約 2.7 秒後）に装着される（CP1-R2-BROWSER 実測）。
     両フラグが現れてから最後にラップする（r3 と同じ）。r4: 読み込みから WAIT_MS たってもフラグが揃わなければ、強制装着せず
     このページでは無効化する（ラップしない・注入しない・presence を書かない）。待機中・無効化後とも OFF と同じ素通し。 */
  var WAIT_MS = 30000;
  var LOAD_ON = on();   /* r6 ③: 読み込み時の判定。OFF/kill で読み込んだページには CP1 固有の装着物を一つも置かない */
  function now(){ return Date.now(); }
  function pnow(){ try { if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return Math.round(performance.now()); } catch(e){} return -1; }
  var inst = { state: 'waiting', reason: null, waitStart: now(), tLoad: pnow(), tDone: null, waitedMs: null, tries: 0, flags: null };
  var _iv = null;
  function flagsOf(P){
    var f = { planner: false, newEngine: false, f277: false };
    try { f.planner = !!(P && typeof P.build === 'function'); if (f.planner){ f.newEngine = !!P.build.__v292NewEngine; f.f277 = !!P.build.__v292Dfix277b2; } } catch(e){}
    return f;
  }
  /* engineMode=1（fix192 の新エンジン）かどうか。fix192 の公開口だけを見る（無ければ旧エンジン扱い＝何もしない） */
  function engineNew(){ try { var N = window.__v292NewEngine; if (N && typeof N.engineOn === 'function') return !!N.engineOn(); } catch(e){} return false; }
  function active(){ return LOAD_ON && eff() && !compatWhy() && inst.state === 'installed' && engineNew(); }   /* bundle43-a: on() → eff()（Owner ゲート） */
  function disable(reason){
    if (inst.state !== 'waiting') return;
    inst.state = 'disabled'; inst.reason = reason; inst.tDone = pnow(); inst.waitedMs = now() - inst.waitStart; inst.flags = flagsOf(window.Planner);
    try { if (_iv !== null) clearInterval(_iv); } catch(e){}
    if (on()){
      last = { ver: VER, disabled: true, reason: reason, waitedMs: inst.waitedMs, tLoad: inst.tLoad, tDone: inst.tDone, tries: inst.tries, flags: inst.flags,
               turns: 0, nAbsent: 0, sysChanged: false, userChanged: false, ops: [], skipped: ['disabled:' + reason], selfcheck: 'n/a' };
      try { console.warn(TAG, 'disabled for this page (no wrap / no injection / no presence write):', reason, JSON.stringify({ waitedMs: inst.waitedMs, flags: inst.flags })); } catch(_e){}
    }
    /* ★20261024-laneCP1race-a (B): opt-in で読み込んだが無効化したページでも、この物語に HOLD の記録があれば OFF / kill で読み込んだときと同じく
       HOLD の 3 点（生成・S.save・state 書込）だけを止める（r5 final の installHoldOnly をそのまま使う）。r6 は無効化で build / save の包みを
       置かないため、HOLD の記録があっても生成と端末への保存が通っていた（Worker への書込は tap が止めていた） */
    try { if (!inst.holdOnly){ inst.holdOnlyAt = { sk: storyKey(), keys: Object.keys(holds), held: heldHere(), from: 'disabled:' + reason }; installHoldOnly(); } } catch(_h){}   /* ★cp1r-a B: HOLD の記録が無くても置く（後から別タブで HOLD ができたとき、実行の時点で止めるため） */
  }

  /* ---- 送信直前の観測（r4: GPT #127-JY ②）。純粋な観測器: tap から body 文字列を受け取り、送信の後（setTimeout 0）で読むだけ ---- */
  var EXPECT_TTL = 120000, FB_RING = 10, PRESENCE_HEAD = '現在の場面にはいない';
  var expect = null;          /* 直前の build が期待する中身。名前・注記はこの関数内だけで使い、記録・公開しない */
  var fbLog = [], fbSeq = 0, fbWarned = {};
  var fbStats = { hookCalls: 0, inactive: 0, notGen: 0, notStory: 0, story: 0, noExpect: 0, stale: 0, inert: 0, noAbsent: 0, checked: 0, ok: 0, fail: 0, failSys: 0, failUser: 0, userNotListed: 0, contra: 0, contraNpc: 0, contraInputPresent: 0, contraInputComove: 0, contraPresenceValue: 0, errors: 0 };
  function fnv(s){ var h = 0x811c9dc5; s = String(s || ''); for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function armExpect(S){
    try {
      var abs = absentList(S), names = abs.map(function(e){ return e.name; }), tbl = abs.length ? formTable(S) : {};
      var heads = names.filter(function(nm, j){ return last && last.ops && last.ops.indexOf('mark:#' + j) >= 0; }).map(function(nm){ return '・' + nm + MARK + '｜'; });
      /* names / forms はこのクロージャ内（矛盾検出）だけで使い、記録・公開しない */
      expect = { t: now(), n: abs.length, names: names, forms: names.map(function(nm){ return tbl[nm] || []; }), heads: heads, note: abs.length ? noteFor(abs) : null, ref: last };
    } catch(e){ expect = null; }
  }
  function userJsonOf(u){
    try { return JSON.parse(u); } catch(e){}
    try { var k = u.indexOf('\n}\n'); if (k > 0) return JSON.parse(u.slice(0, k + 2)); } catch(e2){}
    return null;
  }
  function fbRecord(res, ex){
    res.seq = ++fbSeq; res.at = now();
    fbLog.push(res); if (fbLog.length > FB_RING) fbLog.shift();
    try { if (ex && ex.ref) ex.ref.finalBody = res; } catch(e){}
  }
  function analyzeFinal(body, ex, tSend){
    var j = null; try { j = JSON.parse(body); } catch(e){ j = null; }
    if (!j || !Array.isArray(j.messages)){ fbStats.notGen++; return; }
    var sys = null, user = null;
    for (var i = 0; i < j.messages.length; i++){ var m = j.messages[i]; if (!m || typeof m.content !== 'string') continue; if (m.role === 'system' && sys === null) sys = m.content; if (m.role === 'user') user = m.content; }
    if (sys === null || user === null){ fbStats.notStory++; return; }
    var uj = userJsonOf(user);
    if (!uj || !uj.cast || !Array.isArray(uj.cast.npcs) || !uj.currentInput){ fbStats.notStory++; return; }   /* Planner.build の本文生成だけを見る（要約・補完などの別用途は対象外） */
    fbStats.story++;
    var res = { status: null, missing: [], info: [], nAbsent: 0, marksExpected: 0, marksFound: 0, noteFound: false, userListed: 0, userFound: 0, userNotListed: 0, contra: 0, contraCodes: [],
                sysLen: sys.length, userLen: user.length, sysFnv: fnv(sys), userFnv: fnv(user), buildSelfcheck: null, ageMs: null };
    if (!ex){ fbStats.noExpect++; res.status = 'skip:no-build'; fbRecord(res, null); return; }
    res.ageMs = tSend - ex.t; res.buildSelfcheck = ex.ref ? ex.ref.selfcheck : null;
    if (res.ageMs > EXPECT_TTL){ fbStats.stale++; res.status = 'skip:stale'; fbRecord(res, null); return; }
    if (ex.inert){ fbStats.inert++; res.status = 'skip:' + ex.inert; fbRecord(res, ex); return; }
    if (!ex.n){ fbStats.noAbsent++; res.status = 'skip:no-absent'; fbRecord(res, ex); return; }
    fbStats.checked++;
    res.nAbsent = ex.n; res.marksExpected = ex.heads.length;
    res.marksFound = ex.heads.filter(function(h){ return sys.indexOf(h) >= 0; }).length;
    res.noteFound = !!ex.note && sys.indexOf(ex.note) >= 0;
    /* r5 ②: 危険な矛盾＝system は ABSENT と言うのに、user（今回のプレイヤー入力 currentInput.text）がその NPC を今いる／戻った／同行と明示 */
    var inText = (uj.currentInput && typeof uj.currentInput.text === 'string') ? uj.currentInput.text : '', codes = {};
    ex.names.forEach(function(nm, j){
      var e = null; for (var k = 0; k < uj.cast.npcs.length; k++){ var n = uj.cast.npcs[k]; if (n && String(n.name) === nm){ e = n; break; } }
      if (e){ res.userListed++; if (typeof e.presence === 'string' && e.presence.indexOf(PRESENCE_HEAD) === 0) res.userFound++; }
      var c = null;
      try {
        var fm = (ex.forms && ex.forms[j]) || [];
        if (inText && fm.length){
          var r = scan(inText, fm, true), a = r.absent, lastAt = a ? a.at : -1;   /* strict: 推量・夢・電話・噂などの節は「今いる」の明示に数えない */
          if (r.comove && r.comove.at > lastAt) c = 'contra:input-comove';
          else if (r.present && r.present.at > lastAt) c = 'contra:input-present';
        }
        if (!c && e && typeof e.presence === 'string' && e.presence.indexOf(PRESENCE_HEAD) !== 0) c = 'contra:user-presence-value';
      } catch(_c){ fbStats.errors++; }
      if (c){ res.contra++; codes[c] = 1; }
    });
    res.contraCodes = Object.keys(codes).sort();
    res.userNotListed = Math.max(0, res.nAbsent - res.userListed);
    if (!res.noteFound) res.missing.push('sys-note');
    if (res.marksFound < res.marksExpected) res.missing.push('sys-mark');
    if (res.userFound < res.userListed) res.missing.push('user-presence');
    if (res.userNotListed) { res.info.push('user-npc-not-listed'); fbStats.userNotListed++; }   /* r5 ②: 失敗にしない（cast.npcs は appeared 等で絞られうる）。件数だけ */
    if (res.contra){
      fbStats.contra++; fbStats.contraNpc += res.contra;
      if (codes['contra:input-present']) fbStats.contraInputPresent++;
      if (codes['contra:input-comove']) fbStats.contraInputComove++;
      if (codes['contra:user-presence-value']) fbStats.contraPresenceValue++;
      var ck = 'contra|' + res.contraCodes.join('|');
      if (!fbWarned[ck]){ fbWarned[ck] = 1; try { console.warn(TAG, 'final body: system says ABSENT but the user message marks that NPC as present (observer only; request unchanged)', JSON.stringify({ codes: res.contraCodes, contra: res.contra, nAbsent: res.nAbsent })); } catch(_e){} }
    }
    res.status = res.missing.length ? 'fail' : 'ok';
    if (res.status === 'ok') fbStats.ok++;
    else {
      fbStats.fail++;
      if (res.missing.indexOf('sys-note') >= 0 || res.missing.indexOf('sys-mark') >= 0) fbStats.failSys++;
      if (res.missing.indexOf('user-presence') >= 0) fbStats.failUser++;
      var key = res.missing.join('|');
      if (!fbWarned[key]){ fbWarned[key] = 1; try { console.warn(TAG, 'final body: absence info missing at send (observer only; request unchanged)', JSON.stringify({ missing: res.missing, nAbsent: res.nAbsent, marks: res.marksFound + '/' + res.marksExpected, user: res.userFound + '/' + res.userListed, sysLen: res.sysLen, userLen: res.userLen, buildSelfcheck: res.buildSelfcheck })); } catch(_e){} }
    }
    fbRecord(res, ex);
  }
  /* tap（v292DfixCP1-final-tap.js）が POST の body 文字列を渡してくる。ここでは参照を積むだけで、読むのは送信の後 */
  function onFinal(u, body){
    fbStats.hookCalls++;
    var a = attrib(body), inv = a.inv || null, T = inv ? inv.T : null;   /* r5: その要求を出した試行（本文では見分けない） */
    try {
      if (a.amb && isStoryBody(body)){
        var bad = a.amb.filter(function(x){ return x && x.eff && (x.state === 'cancelled' || (x.state === 'open' && sideWhy(x))); });
        if (bad.length){ guardStats.ambiguousBlocked++; guardStats.sendBlocked++; guardStats.lastBlock = { turn: null, why: 'ambiguous', code: 'AMBIGUOUS_REQUEST', at: now() }; return { block: true, why: 'ambiguous', code: 'AMBIGUOUS_REQUEST' }; }
      }
      /* r2 §2・r3 H1/H3: CP1 を使った試行の本文生成の送信なら、取消済み・kill・側の変化を確かめ、該当すれば送らせない（tap が reject） */
      if (T && T.eff && inst.state === 'installed' && isStoryBody(body) && T.state !== 'adopted'){
        var why = T.state === 'cancelled' ? 'aborted' : killNow() ? 'killed' : sideWhy(T);
        if (why){
          if (why === 'aborted') guardStats.abortedResend++; else { cancel(T, 'send', why); guardStats.sendBlocked++; }
          try { console.warn(TAG, 'request not sent: this CP1 attempt was interrupted', why); } catch(_w){}
          return { block: true, why: why, code: T.reason || codeOf(why) };
        }
      }
    } catch(_g){ fbStats.errors++; }
    if (!(inst.state === 'installed' && T && T.eff)){ fbStats.inactive++; if (!T && !a.amb && isStoryBody(body) && inst.state === 'installed') guardStats.unbound++; return; }
    if (typeof body !== 'string' || body.indexOf('"messages"') < 0){ fbStats.notGen++; return; }
    var ex = expect, tSend = now();
    try { setTimeout(function(){ try { analyzeFinal(body, ex, tSend); } catch(e){ fbStats.errors++; } }, 0); } catch(e){ fbStats.errors++; }
    return isStoryBody(body) ? { watch: true, ref: inv } : undefined;   /* r3 H2: 応答を tap が返す前に onAfter で確かめる（r5: 同じ呼び出しに結び付けたまま） */
  }
  /* r3 H2: CP1 を使った試行の応答が返った時点で側が変わっていたら（取消済みを含む）、その応答を捨てさせる（kill は見ない＝送信後の kill は取り消さない） */
  function onAfter(u, body, ref){
    var inv = ref || attrib(body).inv || null, T = inv ? inv.T : null;
    try {
      if (!(T && T.eff && isStoryBody(body)) || T.state === 'adopted') return;
      var why = T.state === 'cancelled' ? 'aborted' : sideWhy(T);
      if (!why) return;
      cancel(T, 'discard', why); T.blocked = T.blocked || ('discard:' + why); guardStats.respDiscarded++;
      try { console.warn(TAG, 'response discarded: this CP1 attempt was interrupted after the send', why); } catch(_w){}
      return { discard: true, why: why, code: T.reason || codeOf(why) };
    } catch(e){ fbStats.errors++; }
  }

  function wrapBuild(){
    if (inst.state === 'disabled') return true;   /* 無効化したページでは二度とラップしない */
    var P = window.Planner;
    if (!P || typeof P.build !== 'function'){ if (inst.state === 'waiting' && now() - inst.waitStart > WAIT_MS) disable('install-timeout'); return inst.state === 'disabled'; }
    if (P.build.__v292DfixCP1) return true;
    inst.tries++;
    var f = flagsOf(P);
    if (!(f.newEngine && f.f277)){
      if (inst.state === 'waiting' && now() - inst.waitStart > WAIT_MS){ disable('install-timeout'); return true; }
      return false;   /* 装着済みのあと誰かが差し替えた場合も、上流フラグが揃うまで待つだけ（強制装着しない） */
    }
    var cw = compatWhy(); if (cw && inst.state === 'waiting'){
      /* ★20261024-laneCP1race-a (A): fix333 は index.html でこのファイルより後に読まれる同期 script。上流フラグ（fix192/fix277）が先に揃うと
         （このファイルの到着が約 2 秒以上遅れた読み込み）、fix333 がまだ実行されていないだけで 'fix333-incompatible' と決めていた（tries 1・waitedMs 0）。
         互換の不一致は、文書の同期 script がすべて実行された後（readyState が 'loading' でなくなった後）に初めて確定とする。それまでは待つだけ（素通し＝OFF と同じ）。
         互換の判定そのもの・確定後の disable・WAIT_MS の打ち切りは r6 のまま */
      var parsing = false; try { parsing = (typeof document !== 'undefined' && document.readyState === 'loading'); } catch(_rs){ parsing = false; }
      if (parsing && now() - inst.waitStart <= WAIT_MS){ inst.compatWait = (inst.compatWait || 0) + 1; inst.compatWaitWhy = cw; return false; }
      disable(cw); return true; }   /* r2 §3: 混在キャッシュ → CP1 全体 OFF（何も包まない） */
    var inner = P.build;
    var wrapped = function(){
      /* r5 G6: 取り消した試行の仮の state がまだ残っていれば、新しい生成の前に（TURN_BUILD の admission の中で）撤回する。戻せない・hold 中なら生成しない */
      try { recent.forEach(function(X){ if (X && X.state === 'cancelled' && X.provisional) revertState(X); }); } catch(_rv){}
      if (heldHere()){ guardStats.holdBuildRefused++; var eh = new Error('[v292DfixCP1] generation held [CP1_INTERRUPTED:STATE_UNSAFE_HOLD]'); try { eh.code = 'CP1_INTERRUPTED'; eh.reason = 'STATE_UNSAFE_HOLD'; eh.terminal = true; } catch(_e){} holdNotice(); throw eh; }
      var T = null; try { T = beginTurn(); } catch(_t){ turn = null; }   /* r2 §2: 生成の開始でこの試行を確定 */
      try { if (T && T.eff) T.inText = (typeof arguments[1] === 'string') ? arguments[1] : ''; } catch(_i){}   /* r6: 今回の入力（G.submit の Planner.build(S.mode, text)・採用後の playerText と同じ）。CP1 を使う試行だけ・メモリだけ */
      var r = inner.apply(this, arguments);
      try { if (T && T.eff && r && typeof r === 'object') Object.defineProperty(r, '__cp1Attempt', { value: T, enumerable: false, configurable: true, writable: false }); } catch(_rc){}   /* r5: G.submit へ試行を渡す（列挙されない・本文には入らない） */
      try {
        if (T && T.eff && r && typeof r.sys === 'string'){   /* r2: このターンの確定（Owner・互換・識別）に従う。非 Owner・不明は素通し */
          if (!engineNew()){ userHit = false; last = { ver: VER, inert: 'engine0', turns: 0, nAbsent: 0, sysChanged: false, userChanged: false, ops: [], skipped: ['engine0'], selfcheck: 'n/a' }; expect = { t: now(), n: 0, inert: 'engine0', ref: last }; }
          else { var S = getS(); if (S && S.scene){ r.sys = patchSys(r.sys, S); armExpect(S); } else expect = null; }
        }
      } catch(e){ try { console.warn(TAG, 'build err', errName(e)); } catch(_e){} }
      return r;
    };
    try { Object.keys(inner).forEach(function(k){ wrapped[k] = inner[k]; }); } catch(e){}   /* fix419c の掟: 既存フラグ（__v292NewEngine 等）を引き継ぎ、fix192 の再装着を誘発しない */
    wrapped.__v292DfixCP1 = true;
    P.build = wrapped;
    if (inst.state === 'waiting'){ inst.state = 'installed'; inst.tDone = pnow(); inst.waitedMs = now() - inst.waitStart; inst.flags = f; }
    return true;
  }
  function wrapSave(){
    if (inst.state === 'disabled') return true;
    var S = getS(); if (!S || typeof S.save !== 'function') return false;
    if (S.save.__v292DfixCP1) return true;
    var os = S.save;
    var w = function(){
      var discardErr = null, self = this;
      try {
        /* r5 G6: hold 中はこの物語を保存しない（安全が確認できるまで） */
        if (heldHere()){ guardStats.holdSaveRefused++; guardStats.saveBlocked++; try { console.warn(TAG, 'save skipped: hold'); } catch(_w){} return undefined; }
        var L = recent.slice();
        for (var i = 0; i < L.length; i++){
          var T = L[i]; if (!(T && T.eff && self === T.sRef && self && Array.isArray(self.turns))) continue;
          /* r4 ③' 予備: 取り消した試行のターンが入っていたら、その試行の plan を持つターンだけを取り除いて保存しない */
          if (T.state === 'cancelled'){ if (revertAttempt(self, T) > 0){ guardStats.saveBlocked++; if (scopeT === T) discardErr = cp1Err(T, 'commit', 'aborted'); else return undefined; } continue; }
          /* r3 H2: 採用済みでまだ保存していない試行を、側が変わった後（ログアウトを含む）に保存しない（取り消しはしない） */
          if (T.state === 'adopted' && !T.closed && self.turns.length > T.len0){ var sw = sideWhy(T);
            if (sw){ T.blocked = T.blocked || ('save:' + sw); guardStats.saveBlocked++; guardStats.lastBlock = { turn: T.id, why: 'save-after-switch', code: codeOf(sw), at: now() }; try { console.warn(TAG, 'save skipped: this CP1 attempt was interrupted', sw); } catch(_w){} return undefined; } }
        }
        if (!discardErr){
          var T0 = turn;
          if (active() && self && self.scene && !(T0 && !T0.closed && self === T0.sRef && !T0.eff)) ensure(self);   /* r2: 確定 OFF の試行の保存では field を作らない */
          L.forEach(function(X){ if (X && !X.closed && self === X.sRef && Array.isArray(self.turns) && self.turns.length > X.len0 && (X.state === 'adopted' || !X.eff)) X.closed = true; });
        }
      } catch(e){}
      if (discardErr) throw discardErr;
      return os.apply(this, arguments);
    };
    try { Object.keys(os).forEach(function(k){ w[k] = os[k]; }); } catch(e){}
    w.__v292DfixCP1 = true;
    S.save = w;
    return true;
  }
  function install(){
    if (inst.state === 'disabled') return;
    var P = window.Planner;
    if (P){ P._userExtensions = P._userExtensions || []; if (!P._userExtensions.some(function(f){ return f && f.__v292DfixCP1; })) P._userExtensions.push(userExt); }
    var a = wrapBuild(), b = wrapSave();
    if (inst.state === 'disabled') return;
    var c = (inst.state === 'installed') ? (wrapApi() && wrapParse()) : false;   /* r4: build の装着（＝上流が揃った）後に Api.call / parsePlan の最外へ */
    if (!a || !b || !c) setTimeout(install, 400);
  }
  /* 他 fix が後から S.save / Planner.build を差し替えても取り返す（fix645 と同じ 2 秒周期・フラグは関数側に置く）。無効化で止める。r6: ON で読み込んだときだけ */
  if (LOAD_ON){ try { _iv = setInterval(function(){ try { if (inst.state === 'disabled') return; wrapBuild(); wrapSave(); if (inst.state === 'installed'){ wrapApi(); wrapParse(); } } catch(e){} }, 2000); } catch(e){} }
  else { inst.state = 'inactive'; inst.reason = lsg('v292DfixCP1Off') === '1' ? 'kill-at-load' : 'off-at-load'; }
  function status(){
    var T = window.__v292DfixCP1Tap, o = {};
    for (var k in fbStats) o[k] = fbStats[k];
    return { ver: VER, on: on(), state: inst.state, reason: inst.reason, waitMs: WAIT_MS, tLoad: inst.tLoad, tDone: inst.tDone, waitedMs: inst.waitedMs, tries: inst.tries, raceFix: '20261024-laneCP1race-a', holdFix: 'cp1r-c-20261025', holdWraps: { save: holdWraps.save, build: holdWraps.build, fetch: holdWraps.fetch }, compatWait: inst.compatWait || 0, holdOnlyFetch: (inst.holdOnlyFetch === undefined ? null : inst.holdOnlyFetch),
             flags: inst.flags, flagsNow: flagsOf(window.Planner), engineNew: engineNew(), tap: !!(T && T.installed), tapVer: T ? T.ver || null : null, fb: o, loadOn: LOAD_ON, gate: gate(), gateVer: GATE_VER, presVer: PRES_VER, ret: (function(){ var r = {}; for (var k6 in retStats) r[k6] = retStats[k6]; return r; })(), compat: compatWhy() || 'ok', guard: (function(){ var g = {}; for (var k4 in guardStats) g[k4] = guardStats[k4]; g.reasons = {}; for (var k5 in guardStats.reasons) g.reasons[k5] = guardStats.reasons[k5]; g.turn = turn ? { id: turn.id, eff: turn.eff, gate: turn.gate, why: turn.why, closed: turn.closed, blocked: turn.blocked, aborted: !!turn.aborted, state: turn.state, reason: turn.reason, stateRevert: turn.stateRevert || null, prov: turn.prov ? { delta: turn.prov.__delta || 0 } : null } : null; g.attempts = recent.map(function(X){ return { id: X.id, eff: X.eff, state: X.state, reason: X.reason, stateRevert: X.stateRevert || null, provisional: !!X.provisional }; }); g.hold = (function(h){ return h ? { kind: h.kind, attempt: h.attempt, nAmb: (h.amb || []).length, fromReload: !!h.fromReload, others: nHolds() - 1 } : null; })(curHold()); g.holdOnly = !!inst.holdOnly; g.holdOnlyAt = inst.holdOnlyAt || null; g.__x = null; g.inflight = inflight.length; return g; })(), fg333: (function(){ var g = {}; for (var k2 in fgStats) g[k2] = fgStats[k2]; g.reasons = {}; for (var k3 in fgStats.reasons) g.reasons[k3] = fgStats.reasons[k3]; return g; })() };
  }
  /* r4 H4: 口座の変化は /auth/me の再取得（fix893 が 'chr:account-me' を出す）で観測できる。開いている CP1 の回の途中で側が変わったら、
     その時点で中断として記録する（後で元に戻っても、その回の結果は採用しない） */
  if (LOAD_ON){ try { window.addEventListener('chr:account-me', function(){ try { var L = recent.slice(); L.forEach(function(T){ try { if (T && T.eff && T.state === 'open'){ var w = sideWhy(T); if (w) cancel(T, 'event', w); } } catch(_e){} }); } catch(e){} });   /* r4: 開いている試行すべて（r5: 採用済みは対象外） */ } catch(e){} }
  if (LOAD_ON){ try { window.__v292DfixCP1FinalHook = onFinal; window.__v292DfixCP1AfterHook = onAfter; window.__v292DfixCP1SaveHook = onSave; window.__v292DfixCP1Att = { of: attOf, within: within, api: attApi, superseded: superseded, end: endAttempt }; } catch(e){} try { window.__v292DfixCP1Fg333 = function(states, text){ return fgFilter(states, text); }; } catch(e2){} }
  window.__v292DfixCP1 = { VER: VER, GATE_VER: GATE_VER, PRES_VER: PRES_VER, FIELD: FIELD, on: on, gate: gate, effective: eff, derive: derive, ensure: ensure, scan: scan, scanR5: scanR5, epochOf: function(S){ return epochOf(S, (S && Array.isArray(S.turns)) ? S.turns.length : 0); }, formTable: formTable, rawForms: rawForms, patchSys: patchSys, sceneMoveOf: sceneMoveOf, proseHints: proseHints,
    state: function(){ var S = getS(); return S && S.scene ? S.scene[FIELD] || null : null; }, last: function(){ return last; }, status: status,
    finalBody: function(){ return fbLog.length ? fbLog[fbLog.length - 1] : null; }, finalBodyLog: function(){ return fbLog.slice(); }, __userExt: userExt, __analyzeFinal: analyzeFinal, __fnv: fnv, __fgFilter: fgFilter,
    hold: function(){ var h = curHold(); return h ? { kind: h.kind, attempt: h.attempt, nAmb: (h.amb || []).length, fromReload: !!h.fromReload, others: nHolds() - 1 } : null; }, __holdResolve: holdResolve,
    holdPos: function(){ var o = {}; for (var k7 in holdPos) o[k7] = holdPos[k7]; return o; }, __holdPlace: function(){ holdPlace(); } };   /* r6: 通知の置き場所の件数だけ */
  /* ★20261024-laneCP1race-a (B2): opt-in で読み込んだページでも、装着が決まるまで（waiting・約 2 秒）は build / save を包んでいない。
     この物語に HOLD の記録があれば、読み込みの時点で HOLD の 3 点だけを止める包み（OFF / kill と同じ installHoldOnly）を先に置く。
     記録が無い物語では何もしない（r6 と同じ）。CP1 本体の包みは後から内側／外側に重なっても、どちらも heldHere() で止めるだけ */
  if (LOAD_ON){ try { if (heldHere() && !inst.holdOnly){ inst.holdOnlyAt = { sk: storyKey(), keys: Object.keys(holds), held: true, from: 'load-on' }; installHoldOnly(); } } catch(_h0){} }
  if (LOAD_ON) install();
  else { try { inst.holdOnlyAt = { sk: storyKey(), keys: Object.keys(holds), held: heldHere(), from: LOAD_ON === false ? (lsg('v292DfixCP1Off') === '1' ? 'kill-at-load' : 'off-at-load') : 'n/a' }; } catch(_d){} installHoldOnly(); }   /* ★cp1r-b（GPT #127-MW）: OFF / kill で読み込んだページにも HOLD 専用の包み（生成・S.save・state 書込の関門）を必ず置く。HOLD が無ければ素通し（送信・保存は r6 と byte 同一）。後から別タブで HOLD ができても、実行の時点（C）で止める。CP1 の働き（印・注記・presence・除外）は何も装着しない */   /* r5 final: OFF / kill で読み込んだが、この物語は HOLD のまま */
})();
