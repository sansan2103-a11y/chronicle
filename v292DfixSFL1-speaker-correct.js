/* =====================================================================
 * Chronicle v292DfixSFL1: 話者の手動訂正＋訂正データ蓄積（SFL-01・2026-10-22・Local）
 * ---------------------------------------------------------------------
 * ■やること
 *   1. 既存の ✎ 編集パネル（#editPanel）の中に、そのターンの会話カード（_convSays）ごとの話者 <select> を足す。
 *        候補 = キャスト（主人公＋NPC）＋この物語で既出の話者（直近 30 ターン）＋ 話者不明(???)。新しいボタン・画面・自由入力は作らない。
 *   2. 既存の「保存」（UI.saveEdit = EDIT-01b の包み）に相乗りし、本文の編集と話者の訂正を **1 回の S.saveD('UI.saveEdit')** で保存する。
 *   3. 訂正の記録は保存データ（ターンオブジェクト）の中だけ:
 *        ・カードに安定 ID `_convSays[ci]._sid`（無ければ付ける。配列添字には頼らない。同文が複数あっても取り違えない）
 *        ・`turn._sflCorrections[]` = 1 発話 1 件（再訂正は同じ sid の記録を置き換える。履歴は無限に増えない）
 *            { v, sid, ci, say, key, orig, from, to, ts, src:'manual', rev, build, fromKind, fromConf, n, eff:true,
 *              toId, fromId, idAmbiguous, origMeta }   … r3: toId/fromId = cast の character_id（同名・改名に強い。cast に無い名前・???・同名複数は null）
 *                                                         origMeta = 最初に人手で直す前の自動の由来（_convSayMeta の sourceKind / sourceWhoRaw / tagMappingConfidence 等）。再訂正でも最初の値を保つ
 *            to==='???' は「話者不明と判断した」。to が人名なら「その人だと確認した」。訂正していない発話には何も書かない（正解扱いにしない）。
 *        ・`_convSayMeta[ci]`（fix616・_convSays と長さが揃う時だけ）に sourceKind:'manual' / manual:{to,from,ts,prevKind} / speakerRevision+1
 *        新 localStorage キー 0・cast/設定カード/Memory/sys への書込 0・Worker 新 op 0。S.save が turns を JSON 化する既存経路にだけ乗る。
 *   4. 後段の自動帰属が人手の値を上書きしない「決定的な順序」= 各層の判定点が人手の印を尊重する（r3: flag ON/OFF/kill に関係なく、保存済みで今も有効な訂正がある時だけ・各 1 行の hunk）:
 *        fix66 strongTag922（起動時 migrate）/ fix469 _highProvenance（新ターン採点）/ fix620 applyTurn（repairPast）/ fix383 f972Protected（呼びかけ振替）
        / features.js fix29 fixDomCards（表示層: 「Q」と<NAME>は…型で .dlg-name を毎描画書き換える DOM sweep。データは触らないが表示が人手の値と食い違い、fix66 が重複カードを足し続ける）
 *        判定は isManual(turn, ci) = 「そのカードの _sid の記録が台帳にあり、今の who がその to と一致」。印が無い／一致しないカードは従来どおり。
 *        「保存前に台帳から再適用」「起動 3 秒後に再適用」は **本番の保証としては採用しない**（GPT #127-JW）。reassert() はコンソールからの手動のみ。
 *   5. 次ターンの文脈は fix221（Planner.build ごとに _convSays.who から dialogues を作り直す）→ fix58 recentDialogues で自動反映。配線追加なし。
 *
 * ■flag（既定 OFF）
 *   opt-in: localStorage v292DfixSFL1On='1' / kill: v292DfixSFL1Off='1'（kill が常に勝つ）
 *   enabled()   = SFL1 の flag だけ（後段の保護 hunk と記録の読み取りに使う）
 *   uiEnabled() = enabled() && EDIT-01 が有効（__v292DfixEDIT01.enabled()）… <select> の表示と訂正の記録は EDIT-01b のパネルに住むので EDIT-01 が必要
 *   OFF/kill: **新しい訂正の UI と新しい記録だけ**を止める（GPT #127-KC）。保存済みの訂正の保護（protects()）は OFF/kill でも効く（このモジュールは常に受け身で読み込まれる）。
 *     保存済みの _sflCorrections / _sid / sourceKind:'manual' は消さない・戻さない（後始末は purge() の手動だけ）。
 *     訂正の無い物語（_sid も台帳も無い）では protects() は常に false＝OFF/kill/ON とも bundle41-a と同じコードパス。
 *   保護を止めるキーは無い（GPT #127-KM: r3 で提案した v292DfixSFL1GuardOff は削除）。保存済みの人手の訂正は常に守る。
 *
 * ■r5（2026-10-24・統括の依頼。SFL 側だけ・最小限）
 *   1. CP1 が「保存と生成を止めている」（HOLD）物語では、SFL が有効でも ✎ パネルを開かない。開こうとしたら 1 行のお知らせ（HOLD_MSG）を出す。
 *        パネルが開いている間に HOLD になった場合も、話者の変更がある「保存」は何もせず（パネルは開いたまま）同じお知らせを出す。
 *        判定は読むだけ: __v292DfixCP1.hold()（その物語の記録）。CP1 が無い／kill のときは localStorage v292DfixCP1Hold にこの物語の記録があるかを見る。
 *        判定できない（読めない・物語が分からない）ときは HOLD ではないとして r4 と同じ動き。SFL が OFF（uiEnabled()=false）のときは何もしない（EDIT-01 のまま）。
 *   2. 保存の呼び出し（S.saveD）が ran:true を返さなかったとき（undefined・null・ran:false・reject・throw）は成功扱いにしない（r4 から: 名前は元に戻す・
 *        パネルは EDIT-01 が開いたままにする）。r5: そのとき SAVE_FAIL_MSG を出し、話者の欄（選んだ値）も残す。
 *   新 localStorage キー 0・保存データの形は r4 と同じ。
 *
 * ■r6（2026-10-25・GPT #127-MP C2 FIX_REQUIRED_BEFORE_RELEASE。SFL 側だけ・読むだけで E64 / CP1 には手を出さない）
 *   1. 守りの状態 guardOf() = 'cp1-hold'（r5 と同じ判定）| 'e64-hold'（E64 が書き直しの確認でこの物語の保存を保留中: __v292DfixE64SaveTap.holds()、
 *        tap が無いときは localStorage v292DfixE64Hold のこの物語の印〔3 分以内〕）| 'e64-stop'（__v292DfixE64.stopped()、無いときは v292DfixE64Stop の印。
 *        印が壊れていれば止める側）| null。どれかのときは ✎ の話者の欄を出さない（パネルも開かない）でお知らせを出す。
 *   2. 欄が開いている間に守りの状態になったら、「保存」の直前にもう一度確かめて、話者の変更がある保存は何もしない（名前もデータも変えない・
 *        EDIT-01 の保存も呼ばない・パネルと選んだ値はそのまま）。選んだ訂正は「保留の訂正」としてこのタブの sessionStorage
 *        （v292DfixSFL1Pending・1 件・物語 id / ターン / 欄 / 元の話者と台詞つき）に残す。
 *        お知らせは CP1 HOLD なら r5 と同じ HOLD_MSG、E64 の保留なら PEND_MSG、E64Stop なら PEND_STOP_MSG。
 *   3. 守りが解けたら: 同じターンの欄がまだ開いていれば、改めて保存を 1 回だけ出す（新しい保存の呼び出し）。閉じていれば、次にそのターンの ✎ を
 *        開いたとき選んだ値を戻してお知らせを出す（保存は利用者が押す）。台詞や元の話者が変わっていたら戻さずに捨てて知らせる。
 *   4. 保存が ran:true でなければ成功扱いにしない（r5 のまま）。保存の途中で E64 の保留／停止が始まった場合は「保存済み」と言わず、
 *        「端末には保存・クラウドへは解けてから」と知らせる（outcome = 'saved-local:<理由>'）。
 *   5. SFL が OFF / kill（uiEnabled() = false）のときは r5 と同じく何もしない（保留の訂正も使わない）。E64 の kill（v292DfixE64Off）は E64Stop を解かないので、
 *        Stop の間は SFL も直させない。新しい localStorage キー 0（sessionStorage 1 つは守りで止めたときだけ書く）。保存データの形は r4/r5 と同じ。
 *
 * ■r7（2026-10-25・laneSFB0 の観察と GPT #127-MV §6。SFL 本体だけ・新しい保存経路なし・fix781 / fix697 は読むだけ）
 *   1. 「保存」の結果は 2 段に分ける。S.saveD が ran:true ＝端末に保存できた（outcome 'saved-local:pending'）。クラウドで確定したかは
 *        fix781 の印で見る：印が CLEAN で localGeneration が保存直後の値以上 → 'saved'（cloud 'confirmed'）／ DIVERGED → 'saved-local:diverged'
 *        （お知らせ DIVERGED_MSG。fix781 のバナーと同じ向きの案内）／ 30 秒たっても確定しない → 'saved-local:unconfirmed'（お知らせ UNCONF_MSG）。
 *        その後も 10 分まで見て、確定したら 'saved' に上げる（お知らせなし。応答なしでも保存できていた可能性は否定しない）。
 *        名前は戻さない（端末にある訂正は捨てない。食い違いの解決は fix781 の画面の仕事）。fix781 が無い・印が無いときは 'saved-local:unknown'。
 *        GPT #127-MW §6 の 4 区分は status().state4 / status().last.state4 で読める: cloud_confirmed ('saved') | local_only_conflict ('saved-local:diverged') |
 *        cloud_unknown ('saved-local:pending' / 'unconfirmed' / 'unknown') | held ('blocked:*' / 'saved-local:e64-*')。それ以外は not_saved（'reverted:*'）/ stale。
 *        SFL は送り直さない（409 の解決＝最新 revision の確認は fix781 / fix697 の画面と流れ）。食い違い（DIVERGED）の間は、保留の訂正の自動の保存し直しもしない。
 *   2. 古い非同期の結果が新しい訂正を上書きしない：保存ごとに番号を振り、後から届いた古い保存の失敗では元に戻さない（outcome 'stale-ignored'）。
 *        確定の見張りも最新の保存だけが lastResult を書き換える。
 *   3. 保留の訂正を戻すときの確認を足した：口座 id（読めるとき）・カードの _sid・そのターンの全カード（話者と台詞）の指紋が保留にした時と同じこと。
 *        rev は記録するが一致は求めない（同じタブの確定でも rev は進むため）。他の端末で変わったターンは指紋で外れる。
 *
 * ■r7c（2026-10-25・GPT #127-MX Q8。r7 の続き・SFL 本体だけ）
 *   1. fix781 の kill（v292Dfix781Off='1'）・fix781 が無い・印が読めないときは確定の根拠が無いので 'saved-local:unknown'（cloud_unknown）のまま。
 *        kill 中も前の印（CLEAN のこともある）は読めてしまうので、kill の印を先に見る（r7 はここで誤って cloud_confirmed にし得た）。
 *   2. cloud_confirmed にする前に「その訂正を含む世代」かを確かめる：保存の直前と直後の localGeneration を読み、直後 > 直前（＝fix781 がこの保存を
 *        数えた）でなければ unknown。確定は 印が CLEAN かつ localGeneration ≥ 直後の値 かつ その訂正が今もカードにある（_sid と話者が一致・いちばん新しい保存）。
 *   3. 409（DIVERGED）のときは SFL のトーストを出さない（主な表示は fix781 のバナー）。SFL の状態は訂正欄の中に 1 行で出す
 *        （そのターンの ✎ を開いたとき・保留の訂正が食い違いで止まっているときも同じ）。応答なしの 30 秒後のトーストは残す（Q8 で可）。
 *
 * ■診断（コンソールのみ）: window.__v292DfixSFL1.{status(), list(ti), export(), isManual(turn, ci), isManualCard(cardEl, speaker, text), reassert(), purge(), enabled(), uiEnabled()}
 *   export() は speaker01/measure/labels_bare.json と同じ形（{ [story_id]: { "ti|norm(say)": who | 'HERO' | 'UNDETERMINED' } } ＋ _records）
 * ===================================================================== */
(function (root) {
  'use strict';
  var TAG = '[v292DfixSFL1]', VER = 'sfl1-20261025-r7d';
  var UNKNOWN = '???', MAX_PER_TURN = 50, SEEN_TURNS = 30;
  var LIST_ID = 'v292SFL1-list', CSS_ID = 'v292SFL1-css', PANEL_CLS = 'v292SFL1-on';
  /* r5 */
  var NOTE_ID = 'v292SFL1-note';
  var HOLD_MSG = '保存と生成を止めている間は、話者を直せません。先にお知らせのボタンで復旧してください。';
  var SAVE_FAIL_MSG = '保存できませんでした。話者の名前は変えていません。';

  /* ---------- flag ---------- */
  function lsGet(k) { try { var ls = root.localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function enabled() { return lsGet('v292DfixSFL1On') === '1' && lsGet('v292DfixSFL1Off') !== '1'; }
  function edit01On() { try { var E = root.__v292DfixEDIT01; return !!(E && typeof E.enabled === 'function' && E.enabled()); } catch (e) { return false; } }
  function uiEnabled() { return enabled() && edit01On(); }
  /* r5: CP1 の HOLD（読むだけ）。true = この物語は止められている。分からないときは false（r4 と同じ動き）。 */
  function sidOf(k) { if (k == null) return null; var x = String(k).replace(/^(doc|url):/, ''); if (x.indexOf('chr6_slot_') === 0) x = x.slice(10); return x || null; }
  function cp1Held() {
    var killed = lsGet('v292DfixCP1Off') === '1', F = null;
    try { F = root.__v292DfixCP1 || null; } catch (e) { F = null; }
    if (F && typeof F.hold === 'function') { try { if (F.hold()) return true; } catch (e) {} }   /* r7d（B1）: 別タブの HOLD 記録は F.hold() にまだ出ないことがある（CP1r-c は保存の関門の heldHere() でだけ読み直す）→ CP1 が居ても記録を見る（CP1 の refreshHolds と同じ範囲） */
    try {
      var raw = lsGet('v292DfixCP1Hold'); if (!raw) return false;
      var sid = null; try { var k = root.__chr6Key ? root.__chr6Key() : ''; sid = k ? sidOf(k) : null; } catch (e) {}
      if (!sid) { try { sid = sidOf(new URLSearchParams(root.location.search).get('story')); } catch (e) {} }
      if (!sid) return false;
      var o = JSON.parse(raw);
      if (o && o.v === 2 && o.holds && typeof o.holds === 'object') return Object.keys(o.holds).some(function (kk) { var h = o.holds[kk] || {}; return sidOf(kk) === sid || sidOf(h.sid) === sid || sidOf(h.story) === sid; });
      if (o && o.story) return sidOf(o.story) === sid;
    } catch (e) {}
    return false;
  }
  /* r6: E64 の保留・停止（読むだけ）と、まとめた守りの状態 */
  function curSid() { var sid = null; try { var k = root.__chr6Key ? root.__chr6Key() : ''; sid = k ? sidOf(k) : null; } catch (e) {} if (!sid) { try { sid = sidOf(new URLSearchParams(root.location.search).get('story')); } catch (e) {} } return sid; }
  function e64Stopped() {
    var E = null; try { E = root.__v292DfixE64 || null; } catch (e) { E = null; }
    if (E && typeof E.stopped === 'function') { try { return E.stopped() === true; } catch (e) { return true; } }
    var raw = lsGet('v292DfixE64Stop'); if (raw === null || raw === undefined) return false;
    var sid = curSid();
    try { var j = JSON.parse(raw); if (j && j.v === 2 && Array.isArray(j.list)) return j.list.some(function (x) { return !x || !x.story || x.story === '*' || !sid || sidOf(x.story) === sid; });
      if (j && j.v === 1 && typeof j.story === 'string' && j.story) return !sid || sidOf(j.story) === sid; } catch (e) {}
    return true;   /* 印が壊れている＝止める側（E64 と同じ） */
  }
  function e64Held() {
    var sid = curSid(), T = null; try { T = root.__v292DfixE64SaveTap || null; } catch (e) { T = null; }
    if (T && typeof T.holds === 'function') { try { return (T.holds() || []).some(function (h) { return !h || !h.story || h.story === '*' || !sid || sidOf(h.story) === sid; }); } catch (e) { return true; } }
    var raw = lsGet('v292DfixE64Hold'); if (raw === null || raw === undefined) return false;
    try { var j = JSON.parse(raw), now = Date.now(); if (j && j.v === 1 && Array.isArray(j.list)) return j.list.some(function (x) { if (!x || typeof x.story !== 'string') return true; if (x.story !== '*' && sid && sidOf(x.story) !== sid) return false; var t = +(x.hb || x.at || 0); return !t || now - t < 180000; }); } catch (e) {}
    return true;
  }
  function guardOf() { try { if (e64Stopped()) return 'e64-stop'; } catch (e) { return 'e64-stop'; } try { if (e64Held()) return 'e64-hold'; } catch (e) { return 'e64-hold'; } try { if (cp1Held()) return 'cp1-hold'; } catch (e) {} return null; }
  var GUARD_MSG = { 'cp1-hold': HOLD_MSG, 'e64-hold': '本文の書き直しを確かめている間は、話者を直せません。生成が終わってからもう一度開いてください。', 'e64-stop': '保存と生成を止めている物語では、話者を直せません。' };
  var PEND_MSG = '保存を止めている間なので、話者の訂正はまだ保存していません。選んだ値は残してあります。止めが解けたら、この欄が開いていれば自動でもう一度保存します。';
  var PEND_STOP_MSG = '保存と生成を止めているので、話者の訂正は保存していません。選んだ値はこのタブに残してあります。復旧の後にそのターンの ✎ を開くと戻ります。';
  var PEND_READY_MSG = '保存できるようになりました。前に保存できなかった話者の訂正は、そのターンの ✎ を開くと選んだ状態で出ます。';
  var PEND_BACK_MSG = '前に保存できなかった話者の訂正を戻しました。確かめて「保存」を押してください。';
  var PEND_STALE_MSG = '前に保存できなかった話者の訂正は、その後に台詞や話者が変わったので使いませんでした。もう一度選び直してください。';
  var LOCAL_ONLY_MSG = '話者の訂正は端末には保存しました。クラウドへは、保存の止めが解けてから送ります。';
  /* r6: 保留の訂正（このタブだけ・1 件） */
  var PKEY = 'v292DfixSFL1Pending', _pendMem = null, _wIv = null;
  function pendingGet() { try { var ss = root.sessionStorage; var raw = ss ? ss.getItem(PKEY) : null; if (raw) { var o = JSON.parse(raw); if (o && o.v === 1) return o; } } catch (e) {} return _pendMem; }
  function pendingPut(o) { _pendMem = o; try { var ss = root.sessionStorage; if (ss) ss.setItem(PKEY, JSON.stringify(o)); } catch (e) {} }
  function pendingClear() { _pendMem = null; try { var ss = root.sessionStorage; if (ss) ss.removeItem(PKEY); } catch (e) {} }
  function pendingValid(S, P) { try { var t = S && S.turns && S.turns[P.idx], cs = t && t._convSays; if (!cs) return false;
      if (P.acct && acctNow() && P.acct !== acctNow()) return false;   /* r7: 別の口座 */
      if (P.sig != null && turnSig(t) !== P.sig) return false;   /* r7: そのターンの本文の版（全カードの話者と台詞）が変わった */
      return (P.changes || []).every(function (c) { var x = cs[c.ci]; return !!x && String(x.say) === String(c.say) && canon(x.who) === canon(c.from) && (!c.sid || x._sid === c.sid); }); } catch (e) { return false; } }
  function acctNow() { try { var A = root.__v292Dfix893; var me = (A && typeof A.serverMe === 'function') ? A.serverMe() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch (e) { return null; } }
  function turnSig(t) { try { return (t && t._convSays || []).map(function (c) { return String(c && c.who) + '|' + String(c && c.say); }).join('\n'); } catch (e) { return null; } }
  function m781() { try { var F = root.__v292Dfix781; if (!F || typeof F.marker !== 'function') return null; return F.marker(curSid()) || null; } catch (e) { return null; } }
  var DIVERGED_MSG = '話者の訂正は端末には保存しましたが、クラウドの内容と食い違いがあり、まだ確定していません。画面のお知らせから、どちらを残すか決めてください。';
  var UNCONF_MSG = '話者の訂正は端末には保存しました。クラウドに保存できたかどうかは、まだ確認できていません。つながれば自動で確かめます。';
  var CONFLICT_PEND_MSG = 'クラウドとの食い違いが解決していないので、保留の話者の訂正はまだ保存していません。食い違いを解決してから保存してください。';
  function state4Of(o) { o = String(o || ''); if (o === 'saved') return 'cloud_confirmed'; if (o === 'saved-local:diverged') return 'local_only_conflict'; if (o.indexOf('blocked:') === 0 || o.indexOf('saved-local:e64') === 0) return 'held'; if (o.indexOf('saved-local:') === 0 || o === 'pending') return 'cloud_unknown'; if (o.indexOf('stale-ignored') === 0) return 'stale'; if (o.indexOf('reverted:') === 0) return 'not_saved'; return o ? 'unknown' : null; }
  var _seq = 0, _cloudTick = null;
  function f781Killed() { return lsGet('v292Dfix781Off') === '1'; }
  var _cloudBySid = {};   /* r7c: 最新の保存の状態（カードの _sid ごと・訂正欄の 1 行用） */
  function stillHas(idx, items) { try { var S = getS(), t = S && S.turns && S.turns[idx], cs = t && t._convSays; if (!cs) return false; return items.every(function (it) { var c = cs[it.ci]; return !!c && c._sid === it.sid && canon(c.who) === canon(it.to); }); } catch (e) { return false; } }
  function watchCloud(seq, gen, res, g0, idx, items) {   /* r7 / r7c: この訂正を含む世代がクラウドで確定したかを fix781 の印で見る（読むだけ） */
    var t0 = Date.now(), warned = false, iv = null;
    var mark = function (st) { (items || []).forEach(function (it) { if (it.sid) _cloudBySid[it.sid] = st; }); };
    var setU = function () { if (res.outcome.indexOf('saved-local:e64') !== 0) res.outcome = 'saved-local:unknown'; res.cloud = 'unknown'; mark('cloud_unknown'); };
    var tick = function () {
      if (seq !== _seq) { clearInterval(iv); return; }   /* もっと新しい保存がある */
      if (f781Killed() || gen === null || g0 === null) { setU(); clearInterval(iv); return; }   /* 確定の根拠が無い */
      if (!(gen > g0)) { setU(); res.why = 'gen-not-advanced'; clearInterval(iv); return; }   /* fix781 がこの保存を数えていない */
      var m = m781(), now = Date.now();
      if (!m) { setU(); clearInterval(iv); return; }
      if (m.state === 'DIVERGED') { res.outcome = 'saved-local:diverged'; res.cloud = 'diverged'; mark('local_only_conflict'); clearInterval(iv); refreshPanelState(); return; }   /* r7c: トーストは出さない（主な表示は fix781 のバナー） */
      if (m.state === 'CLEAN' && (+m.localGeneration || 0) >= gen) {
        if (!stillHas(idx, items)) { setU(); res.why = 'card-changed'; clearInterval(iv); return; }
        res.outcome = 'saved'; res.cloud = 'confirmed'; res.confirmedMs = now - t0; mark('cloud_confirmed'); clearInterval(iv); refreshPanelState(); return; }
      if (!warned && now - t0 > 30000) { warned = true; res.outcome = 'saved-local:unconfirmed'; res.cloud = 'unconfirmed'; mark('cloud_unknown'); showNote(UNCONF_MSG); clearInterval(iv); iv = setInterval(tick, 3000); return; }
      if (now - t0 > 600000) { clearInterval(iv); }
    };
    mark('cloud_unknown');
    _cloudTick = function () { if (seq === _seq) tick(); };   /* status() は読む時点でもう一度確かめる（0.5 秒の遅れを残さない） */
    iv = setInterval(tick, 500);
  }
  /* r7c: 訂正欄の中の 1 行（そのターンのカードに、まだ確定していない最新の保存があるとき／保留の訂正が食い違いで止まっているとき） */
  var STATE_ID = 'v292SFL1-state';
  var PANEL_MSG = { local_only_conflict: '保存の状態：端末には保存しました。クラウドとは食い違いがあり、まだ確定していません（画面上のお知らせから解決してください）。',
    cloud_unknown: '保存の状態：端末には保存しました。クラウドでの確定はまだ確認できていません。', pend_conflict: '保存の状態：クラウドとの食い違いが解決していないので、保留の訂正はまだ保存していません。' };
  function panelStateFor(idx) {
    try { var S = getS(), t = S && S.turns && S.turns[idx], cs = (t && t._convSays) || [], worst = null;
      cs.forEach(function (c) { var st = c && c._sid ? _cloudBySid[c._sid] : null; if (st === 'local_only_conflict') worst = 'local_only_conflict'; else if (st === 'cloud_unknown' && !worst) worst = 'cloud_unknown'; });
      var P = pendingGet(); if (P && P.story === curSid() && P.idx === idx && P.conflictNoted) worst = 'pend_conflict';
      return worst; } catch (e) { return null; }
  }
  function refreshPanelState() {
    try { var d = root.document, box = d && d.getElementById(LIST_ID); if (!box) return; var idx = +box.getAttribute('data-ti'), st = panelStateFor(idx), el = d.getElementById(STATE_ID);
      if (!st) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
      if (!el) { el = d.createElement('div'); el.id = STATE_ID; el.setAttribute('role', 'status'); el.style.cssText = 'margin:4px 0 6px;padding:6px 8px;border-radius:6px;background:#3a2a10;color:#ffe9c2;font-size:13px;line-height:1.5'; box.insertBefore(el, box.children[1] || null); }
      el.setAttribute('data-state', st); el.textContent = PANEL_MSG[st] || ''; } catch (e) {}
  }
  function stopWatch() { if (_wIv) { try { clearInterval(_wIv); } catch (e) {} _wIv = null; } }
  function startWatch() { if (_wIv) return; try { _wIv = setInterval(watchTick, 1000); } catch (e) {} }
  function watchTick() {
    var P = pendingGet(); if (!P) { stopWatch(); return; }
    if (!uiEnabled() || P.story !== curSid() || guardOf()) return;
    try { var mk = f781Killed() ? null : m781(); if (mk && mk.state === 'DIVERGED') { if (!P.conflictNoted) { P.conflictNoted = true; pendingPut(P); refreshPanelState(); } return; } } catch (_) {}   /* r7: 食い違いの間は送り直さない（r7c: トーストではなく欄の中に出す） */
    var S = getS(), d = root.document, ov = d && d.getElementById('editOv'), box = d && d.getElementById(LIST_ID);
    if (!S || !Array.isArray(S.turns) || S.turns.length <= P.idx) return;   /* 読み込みの途中（ターンがまだ無い）は判断しない */
    if (!pendingValid(S, P)) { pendingClear(); stopWatch(); ST.pendDropped = (ST.pendDropped || 0) + 1; showNote(PEND_STALE_MSG); return; }
    if (ov && ov.classList.contains('open') && S && S.editIdx === P.idx && box && +box.getAttribute('data-ti') === P.idx) {
      keepPicks(P.idx, P.changes); pendingClear(); stopWatch(); ST.retries = (ST.retries || 0) + 1;
      try { var U = getUI(); if (U && typeof U.saveEdit === 'function') U.saveEdit(); } catch (e) { try { console.warn(TAG, 'retry save err', e && e.message); } catch (_) {} }
      return;
    }
    if (!P.notified) { P.notified = true; pendingPut(P); showNote(PEND_READY_MSG); }
    stopWatch();
  }
  var _noteT = null;
  function showNote(text) {
    try {
      var d = root.document; if (!d || !d.body) return;
      var n = d.getElementById(NOTE_ID);
      if (!n) { n = d.createElement('div'); n.id = NOTE_ID; n.setAttribute('role', 'status');
        n.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:100002;box-sizing:border-box;width:max-content;max-width:min(640px, calc(100vw - 24px));background:#3a2a10;color:#ffe9c2;border:1px solid #b9863a;border-radius:10px;padding:8px 12px;font-size:14px;line-height:1.5;pointer-events:auto;cursor:pointer';
        n.onclick = function () { try { n.style.display = 'none'; } catch (e) {} }; d.body.appendChild(n); }
      n.textContent = text; n.style.display = 'block';
      if (_noteT) clearTimeout(_noteT); _noteT = setTimeout(function () { try { n.style.display = 'none'; } catch (e) {} }, 10000);
    } catch (e) {}
  }
  /* r3/r4: 保護は flag と無関係（OFF/kill でも保存済みの訂正を守る）。止めるキーは無い（GPT #127-KM）。 */

  /* ---------- 純関数 ---------- */
  function canon(s) { var x = String(s == null ? '' : s); try { x = x.normalize('NFC'); } catch (e) {} return x.replace(/[\s　]+/g, '').trim(); }
  function isUnknown(s) { return /^[?？]+$/.test(String(s == null ? '' : s).trim()); }
  /* speaker01/measure/table.cjs の norm と同じ（labels_bare.json の key） */
  function sayKey(s) { return String(s || '').replace(/[\s　。、！？!?…・「」『』—–―-]/g, ''); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  var _sidN = 0;
  function newSid() { _sidN++; return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36) + _sidN.toString(36); }
  function metaAligned(turn) { return !!(turn && Array.isArray(turn._convSays) && Array.isArray(turn._convSayMeta) && turn._convSayMeta.length === turn._convSays.length); }
  function ledgerOf(turn) { return (turn && Array.isArray(turn._sflCorrections)) ? turn._sflCorrections : null; }
  function recBySid(turn, sid) { var L = ledgerOf(turn); if (!L || !sid) return null; for (var i = L.length - 1; i >= 0; i--) { var r = L[i]; if (r && r.sid === sid) return r; } return null; }

  /* isManual(turn, ci[, where]) — そのカードの今の who が「人手で決めた値」か。
     判定は _sid → 台帳の記録 → canon(to) === canon(who)。印が無い／既に別の値に変わっている（＝人手の値が失われている）カードは false（従来どおり扱う）。 */
  var guardHits = {};
  /* r3: cast の character_id（hero + npcs）。同じ canon 名が複数あれば null（曖昧）。 */
  function castIdMap(S) {
    var m = {}, amb = {};
    try { var c = S && S.cast; if (!c) return { m: m, amb: amb };
      [c.hero].concat(c.npcs || []).forEach(function (x) { if (!x || !x.name) return; var k = canon(x.name), id = x.character_id || x.id || null; if (!k) return;
        if (has(m, k)) { amb[k] = 1; m[k] = null; } else m[k] = id || null; });   /* r4: 同じ名前が 2 人以上なら（id の有無に関係なく）名前からは決めない */
    } catch (e) {}
    return { m: m, amb: amb };
  }
  function castHasId(cast, id, name) { try { return [cast.hero].concat(cast.npcs || []).some(function (x) { return x && x.character_id === id && canon(x.name) === canon(name); }); } catch (e) { return false; } }
  function castIdOf(S, name, cm) { if (!name || isUnknown(name)) return null; cm = cm || castIdMap(S); var k = canon(name); return has(cm.m, k) ? cm.m[k] : null; }
  /* 記録 r が今の who を「保っている」か: 名前一致、または（改名後も）同じ character_id を指す */
  function holdsRec(r, who) {
    if (!r) return false;
    if (canon(r.to) === canon(who)) return true;
    if (r.toId) { try { return castIdOf(getS(), who) === r.toId; } catch (e) { return false; } }
    return false;
  }
  function protects(turn, ci, where) { return isManual(turn, ci, where); }
  function protectsCard(cardEl, speaker, text) { return isManualCard(cardEl, speaker, text); }
  function isManual(turn, ci, where) {
    try {
      var cs = turn && turn._convSays; if (!Array.isArray(cs)) return false;
      var c = cs[ci]; if (!c || typeof c !== 'object') return false;
      var r = c._sid ? recBySid(turn, c._sid) : null;
      var ok = !!(r && r.src === 'manual' && holdsRec(r, c.who));
      if (!ok && metaAligned(turn)) {       /* 旧形・_sid 無し用の第 2 判定（meta の印） */
        var m = turn._convSayMeta[ci];
        ok = !!(m && m.sourceKind === 'manual' && m.manual && canon(m.manual.to) === canon(c.who));
      }
      if (ok && where) guardHits[where] = (guardHits[where] || 0) + 1;
      return ok;
    } catch (e) { return false; }
  }

  /* isManualCard(cardEl, speaker, text) — 表示層（features.js fix29 の DOM sweep）用。data-ti/data-ci があれば isManual、無ければ
     「同じ key の live な手動記録があり、その to が今の表示名と一致」で判定（同文が複数あっても、表示名が手動の値のカードだけ守る）。 */
  function isManualCard(cardEl, speaker, text) {
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return false;
      var ti = NaN, ci = NaN;
      try { if (cardEl && cardEl.getAttribute) { ti = parseInt(cardEl.getAttribute('data-ti'), 10); ci = parseInt(cardEl.getAttribute('data-ci'), 10); } } catch (e) {}
      if (ti >= 0 && ci >= 0 && S.turns[ti]) return isManual(S.turns[ti], ci, 'fix29');
      var k = sayKey(text), sp = canon(speaker); if (!k || !sp) return false;
      for (var i = 0; i < S.turns.length; i++) {
        var t = S.turns[i], L = ledgerOf(t); if (!L) continue;
        for (var j = 0; j < L.length; j++) {
          var r = L[j]; if (!r || r.src !== 'manual' || r.key !== k || !holdsRec(r, speaker)) continue;
          var cs = t._convSays || [];
          for (var q = 0; q < cs.length; q++) if (cs[q] && cs[q]._sid === r.sid && canon(cs[q].who) === sp) { guardHits.fix29 = (guardHits.fix29 || 0) + 1; return true; }
        }
      }
    } catch (e) {}
    return false;
  }

  /* planCorrections(turn, changes, ctx) — 入力を変更しない。changes=[{ci, to}]
     戻り値 { applicable, items:[{ci, card, from, to, sidNew, sid, rec, prevMeta}], ledger(新配列), skipped[] } */
  function planCorrections(turn, changes, ctx) {
    ctx = ctx || {};
    var res = { applicable: false, items: [], ledger: null, skipped: [] };
    var cs = turn && turn._convSays;
    if (!Array.isArray(cs) || !Array.isArray(changes)) return res;
    res.applicable = true;
    var L0 = ledgerOf(turn) || [], L = L0.slice(), aligned = metaAligned(turn), usedCi = {};
    for (var i = 0; i < changes.length; i++) {
      var ch = changes[i]; if (!ch) continue;
      var ci = +ch.ci, to = String(ch.to == null ? '' : ch.to).trim();
      if (!(ci >= 0) || ci >= cs.length || usedCi[ci]) { res.skipped.push({ ci: ci, why: 'bad-ci' }); continue; }
      var c = cs[ci];
      if (!c || typeof c !== 'object' || !c.say) { res.skipped.push({ ci: ci, why: 'no-card' }); continue; }
      if (!to || (to !== UNKNOWN && isUnknown(to))) to = UNKNOWN;
      var cm0 = ctx.cast ? castIdMap({ cast: ctx.cast }) : null, chId = ch.toId ? String(ch.toId) : null;
      if (chId && cm0 && !castHasId(ctx.cast, chId, to)) { res.skipped.push({ ci: ci, why: 'unknown-id' }); continue; }
      if (!chId && to !== UNKNOWN && cm0 && cm0.amb[canon(to)]) { res.skipped.push({ ci: ci, why: 'ambiguous-name' }); continue; }   /* r4: 同名の人物を名前だけで決めない */
      if (canon(to) === canon(c.who) && !(chId && (function () { var o = recBySid(turn, c._sid); return !o || o.toId !== chId; })())) { res.skipped.push({ ci: ci, why: 'same' }); continue; }
      usedCi[ci] = 1;
      var sid = c._sid || newSid(), sidNew = !c._sid, old = recBySid(turn, sid);
      var m = aligned ? turn._convSayMeta[ci] : null;
      var cm = ctx.cast ? castIdMap({ cast: ctx.cast }) : null;
      var rec = { v: 1, sid: sid, ci: ci, say: String(c.say).slice(0, 60), key: sayKey(c.say),
        orig: old ? old.orig : String(c.who == null ? '' : c.who), from: String(c.who == null ? '' : c.who), to: to,
        ts: ctx.ts || Date.now(), src: 'manual', rev: (ctx.rev == null ? null : ctx.rev), build: ctx.build || null,
        fromKind: old ? old.fromKind : ((m && m.sourceKind) || null), fromConf: old ? old.fromConf : ((m && m.tagMappingConfidence) || null),
        n: (old && old.n ? old.n : 0) + 1, eff: true,
        toId: chId || (cm ? castIdOf(null, to, cm) : null), fromId: (old && old.toId && holdsRec(old, c.who)) ? old.toId : (cm ? castIdOf(null, c.who, cm) : null), idAmbiguous: !chId && !!(cm && (cm.amb[canon(to)] || cm.amb[canon(c.who)])),
        origMeta: old ? (old.origMeta || null) : pickMeta(m) };
      var at = -1; for (var j = 0; j < L.length; j++) if (L[j] && L[j].sid === sid) { at = j; break; }
      if (at >= 0) L[at] = rec; else L.push(rec);
      res.items.push({ ci: ci, card: c, from: c.who, to: to, sid: sid, sidNew: sidNew, rec: rec, metaObj: (m && typeof m === 'object') ? m : null, prevMeta: m ? { sourceKind: m.sourceKind, hasManual: has(m, 'manual'), manual: m.manual, speakerRevision: m.speakerRevision } : null });
    }
    while (L.length > MAX_PER_TURN) L.shift();
    res.ledger = L;
    return res;
  }
  /* r3: 自動の由来（sourceKind など）の写し。'manual' は自動の由来ではないので、既に manual なら manual.prevKind を sourceKind として残す。 */
  function pickMeta(m) {
    if (!m || typeof m !== 'object') return null;
    var o = {}, ks = ['sourceKind', 'sourceWhoRaw', 'tagMappingConfidence', 'promotedBy', 'promoteScore', 'tagOrdinal', 'speakerRevision'];
    for (var i = 0; i < ks.length; i++) if (has(m, ks[i])) o[ks[i]] = m[ks[i]];
    if (o.sourceKind === 'manual') o.sourceKind = (m.manual && m.manual.prevKind) || null;
    return o;
  }
  /* applyPlan(turn, plan) — カード／meta はオブジェクトをその場で書き換える（EDIT-01b の snapshot と同じオブジェクトを指すため、失敗時の復元が順序に依らない）。
     台帳は新しい配列に差し替える。戻り値 = revert 関数。 */
  function applyPlan(turn, plan) {
    var hadLedger = has(turn, '_sflCorrections'), oldLedger = turn._sflCorrections, aligned = metaAligned(turn), i;
    for (i = 0; i < plan.items.length; i++) {
      var it = plan.items[i], c = it.card;
      if (it.sidNew) c._sid = it.sid;
      c.who = it.to;
      if (aligned) {
        var m = it.metaObj;
        if (m) {
          m.sourceKind = 'manual';
          m.manual = { to: it.to, from: it.from, ts: it.rec.ts, prevKind: it.prevMeta ? (it.prevMeta.hasManual && it.prevMeta.manual ? it.prevMeta.manual.prevKind : it.prevMeta.sourceKind) : null };
          m.speakerRevision = ((+m.speakerRevision) || 0) + 1;
        }
      }
    }
    turn._sflCorrections = plan.ledger;
    return function revert() {
      try {
        for (var k = plan.items.length - 1; k >= 0; k--) {
          var it2 = plan.items[k], c2 = it2.card;
          c2.who = it2.from;
          if (it2.sidNew) { try { delete c2._sid; } catch (e) {} }
          if (aligned && it2.prevMeta && it2.metaObj) {   /* オブジェクト参照で戻す（EDIT-01b が meta 配列を差し替えていても同じ entry を戻せる） */
            var m2 = it2.metaObj;
            if (m2) { m2.sourceKind = it2.prevMeta.sourceKind; if (it2.prevMeta.hasManual) m2.manual = it2.prevMeta.manual; else delete m2.manual; m2.speakerRevision = it2.prevMeta.speakerRevision; }
          }
        }
        if (hadLedger) turn._sflCorrections = oldLedger; else delete turn._sflCorrections;
      } catch (e) {}
    };
  }

  /* ---------- 実行環境 ---------- */
  var ST = { installed: false, reason: 'init', saves: 0, reverted: 0, applied: 0, opens: 0, holdBlocked: 0, lastResult: null };
  function getS() {
    try { if (typeof root.__chronicleGetState === 'function') { var s = root.__chronicleGetState('sfl1'); if (s) return s; } } catch (e) {}
    try { return (0, eval)('typeof S!=="undefined"?S:null'); } catch (e2) { return null; }
  }
  function getUI() { try { if (root.UI) return root.UI; } catch (e) {} try { return (0, eval)('typeof UI!=="undefined"?UI:null'); } catch (e2) { return null; } }
  function heroName(S) { try { return (S && S.cast && S.cast.hero && S.cast.hero.name) ? String(S.cast.hero.name).trim() : ''; } catch (e) { return ''; } }
  function castNames(S) { var out = [], h = heroName(S); if (h) out.push(h); try { (S.cast.npcs || []).forEach(function (n) { if (n && n.name) out.push(String(n.name).trim()); }); } catch (e) {} return out; }
  function curRev() { try { var a = root.__v292Dfix705 && root.__v292Dfix705.docAuthority && root.__v292Dfix705.docAuthority(); return (a && typeof a.rev === 'number') ? a.rev : null; } catch (e) { return null; } }
  function curBuild() {   /* index.html の BUILT は IIFE 内で外から読めない → この script の ?cb=（出荷版）＋ VER を build 識別子にする */
    try { var sc = root.document && root.document.querySelector('script[src*="v292DfixSFL1-speaker-correct.js"]'); var m = sc && String(sc.getAttribute('src') || '').match(/[?&]cb=([^&]+)/); return (m ? m[1] : 'nocb') + '/' + VER; } catch (e) { return VER; }
  }
  function storyId() { try { var k = root.__chr6Key ? root.__chr6Key() : ''; return k ? String(k).replace(/^chr6_slot_/, '') : ''; } catch (e) { return ''; } }
  /* r4（GPT #127-KM 4）: 候補を人物単位で作る。cast に同じ名前が複数いる時は、character_id が別々なら id ごとに別の選択肢
     （value='id:<character_id>'・名前＋見分けの手がかり）、id で区別できない時は選べない選択肢（disabled）にする。名前だけで人物を決めない。 */
  function candEntries(S, turn) {
    var out = [], byKey = {}, seen = {};
    try {
      var c = S && S.cast, members = c ? [c.hero].concat(c.npcs || []) : [];
      members.forEach(function (x) { if (!x || !x.name) return; var k = canon(x.name); if (!k) return; (byKey[k] = byKey[k] || []).push(x); });
      members.forEach(function (x) {
        if (!x || !x.name) return; var k = canon(x.name); if (!k || seen[k]) return; seen[k] = 1;
        var g = byKey[k], name = String(x.name).trim();
        if (g.length === 1) { out.push({ value: name, label: name, name: name, id: x.character_id || null }); return; }
        var ids = {}, dupId = false; g.forEach(function (m) { var id = m.character_id || ''; if (!id || ids[id]) dupId = true; ids[id] = 1; });
        if (dupId) { out.push({ value: '', label: name + '（同名の人物を区別できないため選べません）', name: name, id: null, disabled: true }); return; }
        g.forEach(function (m, n) { var hint = String(m.desc || '').trim().slice(0, 12); out.push({ value: 'id:' + m.character_id, label: name + '（' + (hint || ('同名 ' + (n + 1))) + '）', name: name, id: m.character_id }); });
      });
    } catch (e) {}
    candidates(S, turn).forEach(function (n) { if (!seen[canon(n)]) { seen[canon(n)] = 1; out.push({ value: n, label: n, name: n, id: null }); } });
    return out;
  }
  function candidates(S, turn) {
    var out = [], seen = {}, add = function (n) { n = String(n == null ? '' : n).trim(); if (!n) return; var k = canon(n); if (!k || seen[k]) return; seen[k] = 1; out.push(n); };
    castNames(S).forEach(add);
    try { var ts = S.turns || [], from = Math.max(0, ts.length - SEEN_TURNS); for (var i = from; i < ts.length; i++) { var cs = ts[i] && ts[i]._convSays; if (!Array.isArray(cs)) continue; for (var j = 0; j < cs.length; j++) { var w = cs[j] && cs[j].who; if (w && !isUnknown(w)) add(w); } } } catch (e) {}
    try { (turn && turn._convSays || []).forEach(function (c) { if (c && c.who && !isUnknown(c.who)) add(c.who); }); } catch (e) {}
    return out;
  }

  var CSS = '#' + LIST_ID + '{max-height:30vh;overflow:auto;margin:10px 0 6px;font-size:13px;border-top:1px solid var(--border,#444);padding-top:8px}'
    + '#' + LIST_ID + ' .v292SFL1-h{opacity:.75;margin-bottom:6px}'
    + '#' + LIST_ID + ' .v292SFL1-row{display:flex;gap:8px;align-items:center;margin:4px 0}'
    /* r2: WebKit（iOS）はネイティブ外観の select を白地で描き、fix53 の明るい文字色（#ececf4）が読めなくなる（実測 qa/shots）。
       外観を none にして背景・文字・矢印を自前で描く。色は fix53 と同じ値（このアプリは暗色テーマのみ・prefers-color-scheme 無し）。
       index.html の --tx は不正値（#e0dhcf0）なので var(--tx) は使わない。このモジュールの CSS の中だけ＝OFF では注入されない。 */
    + '#' + LIST_ID + ' select{max-width:46%;font-size:13px;line-height:1.3;-webkit-appearance:none;-moz-appearance:none;appearance:none;color-scheme:dark;'
    + 'background-color:#1d1d3e !important;color:#ececf4 !important;border:1px solid var(--border,#444);border-radius:6px;padding:4px 22px 4px 8px;'
    + 'background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22%3E%3Cpath d=%22M0 0l5 6 5-6z%22 fill=%22%23ececf4%22/%3E%3C/svg%3E");'
    + 'background-repeat:no-repeat;background-position:right 7px center;background-size:10px 6px}'
    + '#' + LIST_ID + ' select:focus{outline:2px solid var(--acc,#8b76f0);outline-offset:1px}'
    + '#' + LIST_ID + ' option{background-color:#1d1d3e;color:#ececf4}'
    + '#' + LIST_ID + ' .v292SFL1-say{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}'
    + '#editPanel.' + PANEL_CLS + '{max-height:92vh;overflow:auto;box-sizing:border-box}';
  function injectCss() { try { var d = root.document; if (!d || d.getElementById(CSS_ID)) return; var s = d.createElement('style'); s.id = CSS_ID; s.textContent = CSS; (d.head || d.documentElement).appendChild(s); } catch (e) {} }
  function removeList() { try { var d = root.document, l = d.getElementById(LIST_ID); if (l && l.parentNode) l.parentNode.removeChild(l); var p = d.getElementById('editPanel'); if (p) p.classList.remove(PANEL_CLS); } catch (e) {} }
  function buildList(idx) {
    var d = root.document, S = getS(), turn = S && S.turns && S.turns[idx], panel = d.getElementById('editPanel'), acts = panel && panel.querySelector('.edit-acts');
    if (!panel || !acts || !turn) return false;
    removeList(); injectCss(); panel.classList.add(PANEL_CLS);
    var box = d.createElement('div'); box.id = LIST_ID; box.setAttribute('data-ti', String(idx));
    var cs = Array.isArray(turn._convSays) ? turn._convSays : null;
    var h = d.createElement('div'); h.className = 'v292SFL1-h';
    if (!cs || !cs.length) { h.textContent = 'このターンには会話ログのカードがありません'; box.appendChild(h); acts.parentNode.insertBefore(box, acts); return true; }
    h.textContent = '会話ログの話者（違っていれば選び直してから保存）'; box.appendChild(h);
    var cand = candEntries(S, turn);
    for (var ci = 0; ci < cs.length; ci++) {
      var c = cs[ci]; if (!c || typeof c !== 'object' || !c.say) continue;
      var row = d.createElement('label'); row.className = 'v292SFL1-row';
      var sel = d.createElement('select'); sel.setAttribute('data-ci', String(ci)); sel.setAttribute('aria-label', 'このセリフの話者');
      var cur = String(c.who == null ? '' : c.who).trim(), curU = isUnknown(cur) || !cur, list = cand.slice(), i;
      /* 今の値の選択肢: 記録に人物 id があればその人物、名前が一意ならその名前、同名で決められない時は「今のまま」(value='=') */
      var rec0 = c._sid ? recBySid(turn, c._sid) : null, curVal = null;
      if (!curU) {
        if (rec0 && rec0.toId && holdsRec(rec0, cur)) for (i = 0; i < list.length; i++) if (list[i].id === rec0.toId && list[i].value) { curVal = list[i].value; break; }
        if (curVal === null) { var hits = list.filter(function (e) { return e.value && canon(e.name) === canon(cur); }); if (hits.length === 1) curVal = hits[0].value; }
        if (curVal === null) { list.unshift({ value: '=', label: cur, name: cur, id: null }); curVal = '='; }
      }
      for (i = 0; i < list.length; i++) { var o = d.createElement('option'); o.value = list[i].value; o.textContent = list[i].label; o.setAttribute('data-name', list[i].name); if (list[i].disabled) o.disabled = true; if (!curU && list[i].value === curVal) o.selected = true; sel.appendChild(o); }
      var ou = d.createElement('option'); ou.value = UNKNOWN; ou.textContent = '話者不明(???)'; if (curU) ou.selected = true; sel.appendChild(ou);
      sel.setAttribute('data-cur', curU ? UNKNOWN : curVal);
      var sp = d.createElement('span'); sp.className = 'v292SFL1-say'; sp.textContent = '「' + String(c.say).slice(0, 40) + (String(c.say).length > 40 ? '…' : '') + '」';
      row.appendChild(sel); row.appendChild(sp); box.appendChild(row);
    }
    acts.parentNode.insertBefore(box, acts);
    refreshPanelState();   /* r7c */
    return true;
  }
  function readChanges() {
    var out = [], d = root.document, box = d.getElementById(LIST_ID); if (!box) return { ti: -1, changes: out };
    var sels = box.querySelectorAll('select[data-ci]');
    for (var i = 0; i < sels.length; i++) {
      var v = String(sels[i].value || '').trim(), cur = sels[i].getAttribute('data-cur') || '', ci = +sels[i].getAttribute('data-ci');
      if (!v || v === '=' || v === cur) continue;
      if (v.indexOf('id:') === 0) { var opt = sels[i].options[sels[i].selectedIndex], nm = String(opt && opt.getAttribute('data-name') || '').trim(); out.push({ ci: ci, to: nm, toId: v.slice(3) }); continue; }
      if (cur.indexOf('id:') !== 0 && canon(v) === canon(cur)) continue;
      out.push({ ci: ci, to: v });
    }
    return { ti: +box.getAttribute('data-ti'), changes: out };
  }

  function clearStream() { try { var st = root.document.getElementById('dialogue-stream'); if (st) st.innerHTML = ''; } catch (e) {} }
  function rebuildStream() { clearStream(); try { if (typeof root.regenerateConvLogV66 === 'function') root.regenerateConvLogV66(); else if (root.__v292Dfix66 && typeof root.__v292Dfix66.repair === 'function') root.__v292Dfix66.repair(); } catch (e) {} }

  /* r5: 保存に失敗した後も、利用者が選んだ値を欄に残す（名前のデータは元のまま） */
  function keepPicks(idx, changes) {
    try { var box = root.document.getElementById(LIST_ID); if (!box || +box.getAttribute('data-ti') !== idx) return;
      (changes || []).forEach(function (c) { var sel = box.querySelector('select[data-ci="' + c.ci + '"]'); if (!sel) return; var v = c.toId ? 'id:' + c.toId : c.to; for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) { sel.value = v; break; } }); } catch (e) {}
  }
  /* 保存: EDIT-01b の包み（inner）のさらに外側。inner が同期的に呼ぶ S.saveD を 1 回だけ包んで結果を見る。 */
  function makeSaveEdit(inner) {
    return function saveEdit() {
      var self = this, args = arguments;
      if (!uiEnabled()) { removeList(); return inner.apply(self, args); }
      var S = getS(); if (!S || !(S.editIdx >= 0) || !S.turns || !S.turns[S.editIdx]) { removeList(); return inner.apply(self, args); }
      var rd = readChanges();
      if (rd.ti !== S.editIdx || !rd.changes.length) { removeList(); return inner.apply(self, args); }
      var g0 = guardOf();
      if (g0) {   /* r6: 保存の直前にもう一度確かめる。何も変えない・パネルと選んだ値はそのまま・保留の訂正として残し、解けたら出し直す */
        ST.holdBlocked++; var t0 = S.turns[S.editIdx], cs0 = (t0 && t0._convSays) || [];
        pendingPut({ v: 1, story: curSid(), acct: acctNow(), idx: S.editIdx, reason: g0, at: Date.now(), rev: curRev(), sig: turnSig(t0), changes: rd.changes.map(function (c) { var x = cs0[c.ci] || {}; return { ci: c.ci, to: c.to, toId: c.toId || null, say: x.say, from: x.who, sid: x._sid || null }; }) });
        ST.lastResult = { idx: S.editIdx, outcome: 'blocked:' + g0, pending: true }; showNote(g0 === 'cp1-hold' ? HOLD_MSG : g0 === 'e64-stop' ? PEND_STOP_MSG : PEND_MSG); keepPicks(S.editIdx, rd.changes); startWatch(); return;   /* CP1 HOLD は r5 と同じお知らせ（復旧は CP1 のボタン） */
      }
      var idx = S.editIdx, turn = S.turns[idx];
      var plan = planCorrections(turn, rd.changes, { ts: Date.now(), rev: curRev(), build: curBuild(), cast: S.cast || null });
      if (!plan.applicable || !plan.items.length) { removeList(); return inner.apply(self, args); }
      var g0 = null; try { if (!f781Killed()) { var mb = m781(); g0 = mb ? (+mb.localGeneration || 0) : null; } } catch (_) {}   /* r7c: 保存の直前の世代 */
      var revert = applyPlan(turn, plan), done = false, seq = ++_seq;   /* r7: 保存の番号 */
      ST.lastResult = { idx: idx, items: plan.items.map(function (it) { return { ci: it.ci, from: it.from, to: it.to, sid: it.sid, n: it.rec.n }; }), skipped: plan.skipped, outcome: 'pending' };
      var res = ST.lastResult;
      var fail = function (why) { if (done) return; done = true; if (seq !== _seq) { res.outcome = 'stale-ignored:' + why; ST.staleIgnored = (ST.staleIgnored || 0) + 1; return; }   /* r7: 新しい保存の後に届いた古い失敗では戻さない */
        revert(); ST.reverted++; ST.lastResult.outcome = 'reverted:' + why; try { console.warn(TAG, 'save failed -> reverted', why); } catch (_) {}
        showNote(SAVE_FAIL_MSG); try { if (!root.document.getElementById(LIST_ID) && S.editIdx === idx) buildList(idx); keepPicks(idx, rd.changes); } catch (_) {} };   /* r5: 知らせる・欄と選んだ値を残す */
      var ok = function () { if (done) return; done = true; ST.saves++; ST.applied += plan.items.length; res.outcome = 'saved-local:pending'; res.cloud = 'pending'; if (seq === _seq) removeList();
        var gen = null; try { if (!f781Killed()) { var m0 = m781(); gen = m0 ? (+m0.localGeneration || 0) : null; } } catch (_) {} res.gen = gen; res.gen0 = g0;
        try { var P = pendingGet(); if (P && P.story === curSid() && P.idx === idx) pendingClear(); } catch (_) {}
        try { var g1 = guardOf(); if (g1 === 'e64-hold' || g1 === 'e64-stop') { res.outcome = 'saved-local:' + g1; showNote(LOCAL_ONLY_MSG); } } catch (_) {}   /* r6: クラウド未確定を「保存済み」と言わない */
        watchCloud(seq, gen, res, g0, idx, plan.items.map(function (it) { return { ci: it.ci, sid: it.sid, to: it.to }; })); };   /* r7: 確定は fix781 の印で見る */
      var orig = S.saveD, called = false, hadOwn = has(S, 'saveD');
      var restore = function () { try { if (S.saveD === oneShot) { if (hadOwn) S.saveD = orig; else delete S.saveD; } } catch (e) {} };
      var oneShot = function () {
        called = true; restore();
        var p; try { p = orig.apply(this === undefined ? S : this, arguments); } catch (e) { fail('saveD-throw'); throw e; }
        Promise.resolve(p).then(function (x) { if (!x || x.ran !== true) fail('ran-false'); else ok(); }, function () { fail('rejected'); });
        return p;
      };
      if (typeof orig !== 'function') { fail('no-saveD'); removeList(); return inner.apply(self, args); }
      S.saveD = oneShot;
      try { return inner.apply(self, args); }
      catch (e) { fail('inner-throw'); throw e; }
      finally { restore(); if (!called) fail('saveD-not-called'); }
    };
  }
  function install() {
    var UI = getUI();
    if (!UI || typeof UI.saveEdit !== 'function' || typeof UI.openEdit !== 'function' || typeof UI.closeEdit !== 'function') { ST.reason = 'no-UI'; return false; }
    if (UI.saveEdit.__sfl1) { ST.installed = true; ST.reason = 'ok'; return true; }
    var E = root.__v292DfixEDIT01;
    if (!E) { ST.reason = 'no-edit01'; return false; }
    if (!UI.saveEdit.__edit01) { try { if (E.status && E.status().reason === 'signature-mismatch') { ST.reason = 'edit01-signature-mismatch'; return 'stop'; } } catch (e) {} ST.reason = 'wait-edit01'; return false; }
    var w = makeSaveEdit(UI.saveEdit); w.__sfl1 = true; w.__edit01 = true; w.__inner = UI.saveEdit; UI.saveEdit = w;
    var oo = UI.openEdit; UI.openEdit = function (idx) {
      try { if (uiEnabled()) { var g = guardOf(); if (g) { ST.holdBlocked++; ST.openBlocked = (ST.openBlocked || 0) + 1; ST.lastBlock = g; removeList(); showNote(GUARD_MSG[g] || HOLD_MSG); return; } } } catch (e0) {}   /* r5/r6: CP1 HOLD・E64 の保留・E64Stop の間はパネルを開かない */
      var r = oo.apply(this, arguments); try { if (uiEnabled()) { ST.opens++; buildList(idx);
          var P = pendingGet(); if (P && P.story === curSid() && P.idx === idx) { if (pendingValid(getS(), P)) { keepPicks(idx, P.changes); ST.pendRestored = (ST.pendRestored || 0) + 1; showNote(PEND_BACK_MSG); } else { pendingClear(); ST.pendDropped = (ST.pendDropped || 0) + 1; showNote(PEND_STALE_MSG); } }   /* r6 */
        } else removeList(); } catch (e) { try { console.warn(TAG, 'openEdit list err', e && e.message); } catch (_) {} } return r; }; UI.openEdit.__sfl1 = true;
    var oc = UI.closeEdit; UI.closeEdit = function () { var r = oc.apply(this, arguments); removeList(); return r; }; UI.closeEdit.__sfl1 = true;
    ST.installed = true; ST.reason = 'ok'; return true;
  }

  /* ---------- 診断（コンソールのみ） ---------- */
  function listTurn(S, ti) {
    var t = S.turns[ti], L = ledgerOf(t) || [], cs = t && t._convSays || [], out = [];
    for (var i = 0; i < L.length; i++) { var r = L[i]; if (!r) continue; var ci = -1; for (var j = 0; j < cs.length; j++) if (cs[j] && cs[j]._sid === r.sid) { ci = j; break; }
      out.push({ ti: ti, ci: ci, live: ci >= 0, holds: ci >= 0 && holdsRec(r, cs[ci].who), who: ci >= 0 ? cs[ci].who : null, rec: r }); }
    return out;
  }
  function status() {
    try { if (_cloudTick) _cloudTick(); } catch (e) {}
    var S = getS(), turnsWith = 0, bytes = 0, recs = 0, live = 0, drift = 0;
    try { (S && S.turns || []).forEach(function (t, ti) { var L = ledgerOf(t); if (!L || !L.length) return; turnsWith++; bytes += JSON.stringify(L).length; listTurn(S, ti).forEach(function (x) { recs++; if (x.live) { live++; if (!x.holds) drift++; } }); }); } catch (e) {}
    var sync = null; try { var G = root.__v292Dfix781; if (G && typeof G.marker === 'function') { var mk = G.marker(); sync = mk ? { state: mk.state, reason: mk.reason || null, userChoice: mk.userChoice ? mk.userChoice.kind : null } : null; } } catch (e) {}
    return { ver: VER, enabled: enabled(), uiEnabled: uiEnabled(), sync: sync, edit01: edit01On(), installed: ST.installed, reason: ST.reason, saves: ST.saves, reverted: ST.reverted, applied: ST.applied, opens: ST.opens,
      holdBlocked: ST.holdBlocked || 0, cp1Held: (function () { try { return cp1Held(); } catch (e) { return null; } })(), guard: (function () { try { return guardOf(); } catch (e) { return 'err'; } })(), staleIgnored: ST.staleIgnored || 0, state4: ST.lastResult ? state4Of(ST.lastResult.outcome) : null, f781Killed: f781Killed(), panelState: (function () { try { var b = root.document && root.document.getElementById(STATE_ID); return b ? b.getAttribute('data-state') : null; } catch (e) { return null; } })(), openBlocked: ST.openBlocked || 0, lastBlock: ST.lastBlock || null, pending: pendingGet(), retries: ST.retries || 0, pendRestored: ST.pendRestored || 0, pendDropped: ST.pendDropped || 0, turnsWithLedger: turnsWith, records: recs, live: live, drift: drift, bytes: bytes, guardHits: guardHits, last: ST.lastResult ? Object.assign({}, ST.lastResult, { state4: state4Of(ST.lastResult.outcome) }) : null };
  }
  function exportLabels() {
    var S = getS(), sid = storyId() || 'story', hero = heroName(S), map = {}, recs = [];
    try { (S && S.turns || []).forEach(function (t, ti) { listTurn(S, ti).forEach(function (x) { var r = x.rec, lb = (r.to === UNKNOWN) ? 'UNDETERMINED' : (hero && canon(r.to) === canon(hero) ? 'HERO' : r.to); map[ti + '|' + (r.key || sayKey(r.say))] = lb; recs.push({ ti: ti, ci: x.ci, live: x.live, holds: x.holds, sid: r.sid, key: r.key, say: r.say, orig: r.orig, from: r.from, to: r.to, label: lb, ts: r.ts, rev: r.rev, build: r.build, fromKind: r.fromKind, fromConf: r.fromConf, n: r.n, toId: r.toId == null ? null : r.toId, fromId: r.fromId == null ? null : r.fromId, idAmbiguous: !!r.idAmbiguous, origMeta: r.origMeta || null }); }); }); } catch (e) {}
    var out = { _note: 'SFL-01 manual speaker corrections (one record per utterance; uncorrected utterances are NOT labelled). Same key shape as speaker01/measure/labels_bare.json: "<turnIdx>|<norm(say)>": who | HERO | UNDETERMINED(=???)', _meta: { purpose: 'evaluation-labels', story_id: sid, hero: hero, cast: castNames(S), castIds: (function () { var o = {}; try { [S.cast.hero].concat(S.cast.npcs || []).forEach(function (x) { if (x && x.character_id) o[x.character_id] = String(x.name || ''); }); } catch (e) {} return o; })(), build: curBuild(), ver: VER, exportedAt: new Date().toISOString(), records: recs.length }, _records: recs };
    out[sid] = map;
    return out;
  }
  /* r4（GPT #127-KM 3）: 読み取りのみ。fix781 の Recovery Draft（IndexedDB chr6_unsynced_recovery / drafts）に退避された
     この物語の訂正記録を返す（クラウド版へ戻った後に、元の訂正を取り出して保存し直すため）。書き込み・削除は一切しない。 */
  function draftCorrections(id) {
    id = id || storyId();
    return new Promise(function (res) {
      try {
        var rq = root.indexedDB.open('chr6_unsynced_recovery');
        rq.onerror = function () { res({ ok: false, why: 'open-error', drafts: [] }); };
        rq.onsuccess = function () {
          try {
            var db = rq.result; if (!db.objectStoreNames.contains('drafts')) { res({ ok: true, drafts: [] }); return; }
            var g = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
            g.onerror = function () { res({ ok: false, why: 'read-error', drafts: [] }); };
            g.onsuccess = function () {
              var out = [];
              (g.result || []).filter(function (d) { return d && String(d.storyId) === String(id); }).sort(function (a, b) { return b.createdAt - a.createdAt; }).forEach(function (d) {
                var recs = [];
                try { var raw = d.snapshot && d.snapshot['chr6_slot_' + id]; var st = raw ? JSON.parse(raw) : null; (st && st.turns || []).forEach(function (t, ti) {
                  (Array.isArray(t && t._sflCorrections) ? t._sflCorrections : []).forEach(function (r) { var cs = t._convSays || [], ci = -1; for (var k = 0; k < cs.length; k++) if (cs[k] && cs[k]._sid === r.sid) { ci = k; break; }
                    recs.push({ ti: ti, ci: ci, sid: r.sid, key: r.key, from: r.from, to: r.to, toId: r.toId == null ? null : r.toId, fromId: r.fromId == null ? null : r.fromId, origMeta: r.origMeta || null, ts: r.ts, n: r.n, holdsInDraft: ci >= 0 && canon(cs[ci].who) === canon(r.to) }); }); }); } catch (e) {}
                out.push({ draftId: d.id, createdAt: d.createdAt, reason: d.reason, records: recs });
              });
              res({ ok: true, drafts: out });
            };
          } catch (e) { res({ ok: false, why: 'tx-error', drafts: [] }); }
        };
      } catch (e) { res({ ok: false, why: 'no-indexeddb', drafts: [] }); }
    });
  }
  /* 手動のみ（タイマー・保存フックからは呼ばない）: 台帳の to を live カードへ戻す。 */
  function reassert() {
    var S = getS(), n = 0; if (!S || !Array.isArray(S.turns)) return { ok: false, why: 'no-S' };
    if (!enabled()) return { ok: false, why: 'off' };
    S.turns.forEach(function (t, ti) { listTurn(S, ti).forEach(function (x) { if (x.live && !x.holds) { t._convSays[x.ci].who = x.rec.to; n++; } }); });
    if (!n) return { ok: true, changed: 0 };
    var p; try { p = (typeof S.saveD === 'function') ? S.saveD('SFL1.reassert') : Promise.resolve({ ran: true, result: S.save() }); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (x) { if (x && x.ran === true) { rebuildStream(); return { ok: true, changed: n }; } return { ok: false, why: 'save-refused', changed: n }; }, function () { return { ok: false, why: 'save-rejected', changed: n }; });
  }
  /* 手動のみ: 記録を全部消す（who は今のまま。meta の印は訂正前の sourceKind へ戻す） */
  function purge() {
    var S = getS(), n = 0; if (!S || !Array.isArray(S.turns)) return { ok: false, why: 'no-S' };
    S.turns.forEach(function (t) { if (!t) return; if (has(t, '_sflCorrections')) { n += (t._sflCorrections || []).length; delete t._sflCorrections; }
      (t._convSays || []).forEach(function (c) { if (c && has(c, '_sid')) delete c._sid; });
      (Array.isArray(t._convSayMeta) ? t._convSayMeta : []).forEach(function (m) { if (m && m.sourceKind === 'manual') { m.sourceKind = (m.manual && m.manual.prevKind) || 'unmatched'; delete m.manual; } }); });
    var p; try { p = (typeof S.saveD === 'function') ? S.saveD('SFL1.purge') : Promise.resolve({ ran: true, result: S.save() }); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (x) { return { ok: !!(x && x.ran === true), purged: n }; }, function () { return { ok: false, purged: n }; });
  }

  var api = { ver: VER, enabled: enabled, uiEnabled: uiEnabled, protects: protects, protectsCard: protectsCard, castIdOf: function (name) { return castIdOf(getS(), name); }, isManual: isManual, isManualCard: isManualCard, planCorrections: planCorrections, applyPlan: applyPlan, canon: canon, sayKey: sayKey, candidates: candidates,
    install: install, status: status, list: function (ti) { var S = getS(); return S && S.turns && S.turns[ti] ? listTurn(S, ti) : []; }, 'export': exportLabels, draftCorrections: draftCorrections, reassert: reassert, purge: purge, buildList: buildList, readChanges: readChanges, guard: guardOf, pending: pendingGet };
  root.__v292DfixSFL1 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------- 起動（EDIT-01 の包みが入るのを待ってから最外に包む） ---------- */
  try {
    if (root.document) {
      var r0 = install();
      if (r0 !== true && r0 !== 'stop') {
        var tries = 0, iv = setInterval(function () { tries++; var r = install(); if (r === true || r === 'stop' || tries > 80) { clearInterval(iv); if (!ST.installed) { try { console.warn(TAG, 'not installed:', ST.reason); } catch (_) {} } } }, 250);
      }
      try { if (pendingGet()) startWatch(); } catch (_) {}   /* r6: 再読込の後も保留の訂正を見張る（このタブ） */
      try { console.log(TAG, 'loaded', VER, '(enabled=' + enabled() + ', installed=' + ST.installed + ')'); } catch (_) {}
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
