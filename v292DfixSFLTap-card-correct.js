/* =====================================================================
 * Chronicle v292DfixSFLTap: 会話ログのカードをタップして、その場で話者を直す入口（SFL r7d の 2 つ目の入口・2026-10-31・Local 候補 bundle65）
 * ---------------------------------------------------------------------
 * ■やること
 *   SFL（v292DfixSFL1）が使えるとき（uiEnabled() が true・SFL の包みが入っている・この部品の停止キーが無い）だけ、
 *   #dialogue-stream の会話カードの本体（話者名と台詞の欄 .dlg-body）をタップすると、小さな選択シートを開く。
 *   ・アイコン（.dlg-av：fix777 の拡大表示）・✕（EDIT-01 の削除）・ボタン類は対象外（そのまま既存の動き）。
 *   ・スクロール直後（0.4 秒以内）のタップ・文字を選択しているときのタップは無視する。
 *   ・シートの候補は SFL 本体の buildList() が ✎ パネルに作る <select> をそのまま読む（＝candEntries と同じ候補・同じ順・同名の区別も同じ）。
 *   候補を選ぶと、SFL 本体の ✎ の経路をそのまま使う：UI.openEdit(ti)（SFL の守りの判定つき）→ そのカードの <select> を選んだ値にする
 *   → UI.saveEdit()（SFL の makeSaveEdit → EDIT-01b → S.saveD を 1 回）。記録（_sflCorrections・_convSayMeta manual・_sid）も、
 *   結果の表示（保存済み・未確認・409・失敗で元に戻す）も SFL 本体が作る。この部品は保存を呼ばない・データを書かない。
 *   ✎ パネルは操作の間だけ見えなくする（#editOv に class を 1 つ）。終わったら必ず外す（成功＝EDIT-01 が閉じる／失敗・止め＝この部品が閉じる／
 *   20 秒たっても結果が出ない＝見えるように戻す＝✎ で保存を押したときと同じ画面）。
 *
 * ■（ターン, ci）を一意に決める根拠（推測しない）
 *   1. カードの data-ti / data-ci：fix66 repair() が _convSays から作ったカードにだけ付ける（v292Dfix66:1347 の _ci = _convSays の添字、
 *      :1376 で EDIT-01 が有効なときに setAttribute）。EDIT-01 の ✕ もこの 2 つで宛先を決めている。無いカード（他の描画が作ったカード）は直せない。
 *   2. S.turns[ti]._convSays[ci] があり、カードの台詞（.dlg-text）が その say と同じ（EDIT-01 の ✕ と同じ正規化 norm）。表示が say の先頭だけ＝切り詰め → 直せない。
 *   3. カードの data-spk（fix66 buildCard が idKey457(cleanSpeakerName(who)) で付ける）が、今の who から同じ式で作った値と同じ（古い画面のカードを弾く）。
 *   4. 同じ台詞（先頭 80 字・norm）が全ターンの _convSays に 2 件以上ある／画面に同じ台詞のカードが 2 枚以上ある／同じ data-ti・data-ci のカードが 2 枚以上ある
 *      → どの発話か決められない（fix66 は「話者｜台詞」が同じカードを 1 枚にまとめる・P1card の 80 字の切り詰め）→ 直せない。
 *   5. 保存すると EDIT-01 の会話ログ整理（本文に無い台詞を外す・並べ替え）も一緒に起きるターン（reconcile() を選んだ話者で試算して変わる）・
 *      本文に \r がある（textarea で変わる）→ ここでは直さない。
 *   直せないとき：理由を 1 行出し、ターンが分かれば「✎ 編集を開く」ボタン（今までの ✎ と同じ経路）を出す。
 *
 * ■flag
 *   この部品の停止キー: localStorage v292DfixSFLTapOff='1'（常に勝つ）。SFL 全体の kill（v292DfixSFL1Off='1'）・SFL の OFF（v292DfixSFL1On='0'）・
 *   EDIT-01 の kill でも止まる（uiEnabled() が false）。OFF のとき：CSS も body の class も入れない・タップは何もしない（bundle62-b と同じ）。
 *   守りの状態（e64-stop・e64-hold・cp1-hold、SFL の guard()）のときはシートを出さず、SFL と同じお知らせを出す。
 *   新しい localStorage / sessionStorage キー 0・通信 0・保存の呼び出し 0（保存は SFL / EDIT-01 の既存の UI.saveEdit だけ）。
 * ■診断（コンソール）: window.__v292DfixSFLTap.{status(), enabled(), resolve(cardEl), close()}
 * ===================================================================== */
(function (root) {
  'use strict';
  var TAG = '[v292DfixSFLTap]', VER = 'sfltap-20261031-b';
  var SHEET_ID = 'v292SFLT-sheet', CSS_ID = 'v292SFLT-css', ON_CLS = 'v292SFLT-on', HIDE_CLS = 'v292SFLT-hide', MSG_ID = 'v292SFLT-msg';
  var SETTLE_MS = 20000, SCROLL_QUIET_MS = 400;
  /* SFL 本体（v292DfixSFL1 r7d）の GUARD_MSG と同じ文言 */
  var GUARD_MSG = { 'cp1-hold': '保存と生成を止めている間は、話者を直せません。先にお知らせのボタンで復旧してください。', 'e64-hold': '本文の書き直しを確かめている間は、話者を直せません。生成が終わってからもう一度開いてください。', 'e64-stop': '保存と生成を止めている物語では、話者を直せません。' };
  var WHY_MSG = {
    'no-index': 'このカードは、どのターンの台詞か分からないため、ここでは直せません。',
    'no-entry': 'カードと保存データが一致しないため（画面が古いかもしれません）、ここでは直せません。',
    'mismatch': 'カードと保存データが一致しないため（画面が古いかもしれません）、ここでは直せません。',
    'speaker': 'カードの話者と保存データが一致しないため（画面が古いかもしれません）、ここでは直せません。',
    'trunc': '長い台詞の表示が途中で切れているため、どの台詞か決められません。',
    'dup': '同じ台詞が会話ログに複数あるため、どのカードか決められません。',
    'tidy': 'この発話は現在訂正できません。（保存すると、ほかの会話カードが外れるおそれがあります）',
    'nocand': '話者の候補を作れませんでした。',
    'changed': 'シートを開いた後に台詞や話者が変わりました。もう一度タップしてください。',
    'busy': '別の編集を開いているので、ここでは直せません。',
    'stale': 'この発話は現在訂正できません。（別のタブか別の端末で物語が変わりました。再読み込みしてください）',
    'pending': 'この発話は現在訂正できません。（前に保存できなかった話者の訂正が残っています）'
  };
  var TAIL_MSG = 'そのターンの「✎ 編集」から直してください。';
  var NO_EDIT = { tidy: 1, stale: 1, pending: 1 };   /* -b（OA 1）: ✎ へ誘導しない理由（書き込みもしない） */

  function lsGet(k) { try { var ls = root.localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function tapOff() { return lsGet('v292DfixSFLTapOff') === '1'; }
  function sfl() { try { return root.__v292DfixSFL1 || null; } catch (e) { return null; } }
  function getS() {
    try { if (typeof root.__chronicleGetState === 'function') { var s = root.__chronicleGetState('sfltap'); if (s) return s; } } catch (e) {}
    try { return (0, eval)('typeof S!=="undefined"?S:null'); } catch (e2) { return null; }
  }
  function getUI() { try { if (root.UI) return root.UI; } catch (e) {} try { return (0, eval)('typeof UI!=="undefined"?UI:null'); } catch (e2) { return null; } }
  function sflInstalled() { try { var U = getUI(); return !!(U && U.saveEdit && U.saveEdit.__sfl1 === true && U.openEdit && U.openEdit.__sfl1 === true && U.closeEdit && U.closeEdit.__sfl1 === true); } catch (e) { return false; } }
  function enabled() {
    if (tapOff()) return false;
    var F = sfl(); if (!F || typeof F.uiEnabled !== 'function' || typeof F.buildList !== 'function' || typeof F.readChanges !== 'function') return false;
    try { if (!F.uiEnabled()) return false; } catch (e) { return false; }
    return sflInstalled();
  }

  /* EDIT-01 の ✕ と同じ正規化（v292DfixEDIT01 NORM_RE） */
  var NORM_RE = /[\s　。、．，,.・…‥—―–‐－\-〜～！？!?「」『』（）()【】“”"'’‘<>]/g;
  function norm(s) { return String(s == null ? '' : s).replace(NORM_RE, ''); }
  /* fix66 buildCard の data-spk と同じ式: idKey457(cleanSpeakerName(who)) */
  function cleanSpeakerName(s) { s = String(s || '').trim(); var m = s.match(/^(.+?)(?:は|が|も|と)\1$/); if (m) s = m[1]; return s; }
  function idKey(n) {
    var raw = String(n == null ? '' : n).trim(), c = raw;
    try { if (lsGet('v292Dfix457Off') !== '1') { var f = root.__v292Dfix445; if (f && typeof f.canonLive === 'function') { var x = f.canonLive(raw); if (x) c = x; } } } catch (e) {}
    return String(c).replace(/[\s　]/g, '');
  }
  function heroName(S) { try { return (S && S.cast && S.cast.hero && S.cast.hero.name) || ''; } catch (e) { return ''; } }
  function turnSig(t) { try { return (t && t._convSays || []).map(function (c) { return String(c && c.who) + '|' + String(c && c.say); }).join('\n'); } catch (e) { return null; } }
  function intAttr(el, k) { var v = el && el.getAttribute ? el.getAttribute(k) : null; return (v != null && /^\d+$/.test(v)) ? parseInt(v, 10) : -1; }
  /* -b（D）: このタブのメモリのターンと、端末に保存されたそのターン（chr6_slot_<id>・読むだけ）の会話カードが同じか。読めない・物語が分からない＝確かめられない＝違う扱い（直さない） */
  function deviceDiffers(ti, turn) {   /* -b（OA 3）: この document の物語全体（全ターンの会話カード・_sid・本文）が、端末に保存された版と同じか。読めない＝違う扱い（直さない） */
    try { var dk = root.__chronicleDocumentStoryKey, k = (typeof dk === 'string' && dk) ? dk : (root.__chr6Key ? root.__chr6Key() : '');   /* fix246 と同じ順: この document の物語の key が先 */
      if (!k || String(k).indexOf('chr6_slot_') !== 0) return true; var ls = root.localStorage, raw = ls ? ls.getItem(String(k)) : null; if (!raw) return true;
      var o = JSON.parse(raw), S = getS(), A = o && Array.isArray(o.turns) ? o.turns : null, B = S && Array.isArray(S.turns) ? S.turns : null;
      if (!A || !B || A.length !== B.length || !A[ti] || B[ti] !== turn) return true;
      for (var i = 0; i < A.length; i++) if (storyTurnKey(A[i]) !== storyTurnKey(B[i])) return true;
      return false; } catch (e) { return true; }
  }
  function storyTurnKey(t) { try { return turnSig(t) + '\u0001' + JSON.stringify((t && t._convSays || []).map(function (c) { return (c && c._sid) || null; })) + '\u0001' + String(t && t.narrative); } catch (e) { return null; } }
  /* -b（OA 2）: 開いた時点の保存版（fix705 の文書の rev・fix781 の localGeneration）。選ぶ時点で違えば中止（別の保存が入った） */
  function verNow() { var v = { rev: null, gen: null }; try { var a = root.__v292Dfix705 && root.__v292Dfix705.docAuthority && root.__v292Dfix705.docAuthority(); if (a && typeof a.rev === 'number') v.rev = a.rev; } catch (e) {}
    try { var F = root.__v292Dfix781, id = null; try { var k = root.__chronicleDocumentStoryKey || (root.__chr6Key ? root.__chr6Key() : ''); id = String(k || '').replace(/^chr6_slot_/, ''); } catch (e) {} var m = (F && typeof F.marker === 'function') ? F.marker(id) : null; if (m) v.gen = +m.localGeneration || 0; } catch (e) {} return v; }
  function k80(say) { return norm(String(say == null ? '' : say).trim().slice(0, 80)); }

  var ST = { opens: 0, sheets: 0, fallbacks: {}, picks: 0, saves: 0, aborted: 0, guardBlocked: 0, busy: false, last: null };

  /* ---------- 一意に決める ---------- */
  /* -b（C）: ターンが分かるカードで、保存すると会話ログの整理（本文に無い台詞のカードが外れる等）が起きるなら、理由は必ず 'tidy'（✎ へは誘導しない） */
  function turnTidy(S, turn) { return !turn || typeof turn.narrative !== 'string' || turn.narrative.indexOf('\r') >= 0 || !Array.isArray(turn._convSays) || tidyChanges(S, turn, -1, null); }
  function resolve(card) {
    var r = resolve0(card);
    if (!r.ok && r.ti >= 0) { try { var S = getS(); if (S && Array.isArray(S.turns) && turnTidy(S, S.turns[r.ti])) r = { ok: false, why: 'tidy', ti: r.ti }; } catch (e) { r = { ok: false, why: 'tidy', ti: r.ti }; } }
    return r;
  }
  function resolve0(card) {
    var S = getS(), d = root.document;
    if (!card || !S || !Array.isArray(S.turns)) return { ok: false, why: 'no-index', ti: -1 };
    var ti = intAttr(card, 'data-ti'), ci = intAttr(card, 'data-ci');
    if (ti < 0 || ci < 0 || ti >= S.turns.length) return { ok: false, why: 'no-index', ti: -1 };
    var turn = S.turns[ti], cs = turn && turn._convSays;
    if (!Array.isArray(cs) || ci >= cs.length || !cs[ci] || typeof cs[ci] !== 'object' || !cs[ci].say) return { ok: false, why: 'no-entry', ti: ti };
    var c = cs[ci], tx = card.querySelector('.dlg-text');
    var shown = norm(tx ? tx.textContent : ''), full = norm(c.say);
    if (!shown || shown !== full) return { ok: false, why: (shown && full.length > shown.length && full.indexOf(shown) === 0) ? 'trunc' : 'mismatch', ti: ti };
    if (card.getAttribute('data-spk') !== idKey(cleanSpeakerName(c.who))) return { ok: false, why: 'speaker', ti: ti };
    /* 同じ台詞（先頭 80 字・norm）が他の発話にあるか */
    var key = k80(c.say), n = 0;
    for (var i = 0; i < S.turns.length; i++) { var a = S.turns[i] && S.turns[i]._convSays; if (!Array.isArray(a)) continue; for (var j = 0; j < a.length; j++) if (a[j] && typeof a[j] === 'object' && a[j].say && k80(a[j].say) === key) n++; }
    if (n !== 1) return { ok: false, why: 'dup', ti: ti };
    var stream = d.getElementById('dialogue-stream'), cards = stream ? stream.querySelectorAll('.v292-dlg-card') : [], sameText = 0, sameIdx = 0;
    for (var q = 0; q < cards.length; q++) { var t2 = cards[q].querySelector('.dlg-text'); if (t2 && norm(t2.textContent) === full) sameText++; if (intAttr(cards[q], 'data-ti') === ti && intAttr(cards[q], 'data-ci') === ci) sameIdx++; }
    if (sameText !== 1 || sameIdx !== 1) return { ok: false, why: 'dup', ti: ti };
    if (typeof turn.narrative !== 'string' || turn.narrative.indexOf('\r') >= 0) return { ok: false, why: 'tidy', ti: ti };
    if (tidyChanges(S, turn, ci, null)) return { ok: false, why: 'tidy', ti: ti };
    return { ok: true, ti: ti, ci: ci, entry: c, who: c.who, say: c.say, sid: c._sid || null, sig: turnSig(turn), turnObj: turn, ver: verNow() };   /* -b（OA 2）: ここで対象と保存版を固定する */
  }
  /* 保存（UI.saveEdit = EDIT-01b）が本文を変えないまま会話ログを整理するか（選んだ話者で試算。EDIT-01 の純関数 reconcile / reconcilePlan を読むだけ） */
  function tidyChanges(S, turn, ci, toName) {
    try {
      var E = root.__v292DfixEDIT01; if (!E || typeof E.reconcile !== 'function') return true;
      var t2 = turn, narr = turn.narrative;
      if (toName != null) { t2 = {}; for (var k in turn) if (Object.prototype.hasOwnProperty.call(turn, k)) t2[k] = turn[k]; t2._convSays = turn._convSays.slice(); var cc = {}, c0 = turn._convSays[ci]; for (var k2 in c0) if (Object.prototype.hasOwnProperty.call(c0, k2)) cc[k2] = c0[k2]; cc.who = toName; t2._convSays[ci] = cc; }
      var r = E.reconcile(t2, narr, { oldNarr: narr, hero: heroName(S) });
      if (!r || r.skipped || r.changed) return true;
      if (typeof E.reconcilePlan === 'function') { var pr = E.reconcilePlan(turn.plan, { dropped: r.dropped || [], reworded: r.reworded || [], oldNarr: narr, newNarr: narr }); if (pr && pr.changed) return true; }
      return false;
    } catch (e) { return true; }
  }

  /* ---------- 候補（SFL の buildList が作る <select> をそのまま読む） ---------- */
  function readOptions(ti, ci) {
    var d = root.document, F = sfl(), panel = d.getElementById('editPanel'), ov = d.getElementById('editOv');
    if (!F || !panel || !ov || ov.classList.contains('open') || d.getElementById('v292SFL1-list')) return null;
    var hadCls = panel.classList.contains('v292SFL1-on'), out = null;
    try {
      var ok = F.buildList(ti), box = d.getElementById('v292SFL1-list'), sel = box && box.querySelector('select[data-ci="' + ci + '"]');
      if (ok && sel) { out = { cur: sel.getAttribute('data-cur'), opts: [] }; for (var i = 0; i < sel.options.length; i++) { var o = sel.options[i]; out.opts.push({ value: o.value, label: o.textContent, name: o.getAttribute('data-name'), disabled: !!o.disabled, selected: !!o.selected }); } }
    } catch (e) { out = null; }
    try { var b2 = d.getElementById('v292SFL1-list'); if (b2 && b2.parentNode) b2.parentNode.removeChild(b2); if (!hadCls) panel.classList.remove('v292SFL1-on'); } catch (e) {}
    return (out && out.opts.length) ? out : null;
  }

  /* ---------- 見た目 ---------- */
  var CSS = 'body.' + ON_CLS + ' #dialogue-stream .v292-dlg-card .dlg-body{cursor:pointer;-webkit-tap-highlight-color:rgba(139,118,240,.18)}'   /* iOS: cursor:pointer が無い要素の click は document まで届かない */
    + 'body.' + ON_CLS + ' #dialogue-stream .v292-dlg-card[data-ci] .dlg-name::after{content:" \\25BE";opacity:.55;font-weight:400}'
    + '#editOv.' + HIDE_CLS + ',#editOv.' + HIDE_CLS + ' *{visibility:hidden !important;opacity:0 !important;pointer-events:none !important;transition:none !important}'
    + '#' + SHEET_ID + '{position:fixed;top:0;right:0;bottom:0;left:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}'
    + '#' + SHEET_ID + ' .sflt-box{box-sizing:border-box;width:min(480px,100vw);max-height:78vh;overflow:auto;-webkit-overflow-scrolling:touch;background:#1d1d3e;color:#ececf4;border:1px solid #444;border-bottom:0;border-radius:14px 14px 0 0;padding:12px 12px calc(12px + env(safe-area-inset-bottom,0px));font-size:15px;line-height:1.5}'
    + '@media (min-width:700px){#' + SHEET_ID + '{align-items:center}#' + SHEET_ID + ' .sflt-box{border-radius:14px;border-bottom:1px solid #444}}'
    + '#' + SHEET_ID + ' .sflt-h{font-weight:600;margin:0 0 4px}'
    + '#' + SHEET_ID + ' .sflt-say{opacity:.8;font-size:13px;margin:0 0 10px;word-break:break-word}'
    + '#' + SHEET_ID + ' .sflt-msg{margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#3a2a10;color:#ffe9c2;font-size:14px}'
    + '#' + SHEET_ID + ' button{display:block;box-sizing:border-box;width:100%;min-height:48px;margin:6px 0;padding:10px 14px;border-radius:10px;border:1px solid #555;background:#2a2a52;color:#ececf4;font-size:16px;text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none}'
    + '#' + SHEET_ID + ' button[disabled]{opacity:.45;cursor:default}'
    + '#' + SHEET_ID + ' button.sflt-cur{border-color:#8b76f0;background:#33306a}'
    + '#' + SHEET_ID + ' button.sflt-cancel,#' + SHEET_ID + ' button.sflt-edit{text-align:center;background:transparent}'
    + '#' + SHEET_ID + ' button:focus{outline:2px solid #8b76f0;outline-offset:1px}';
  function injectCss() { try { var d = root.document; if (!d || d.getElementById(CSS_ID)) return; var s = d.createElement('style'); s.id = CSS_ID; s.textContent = CSS; (d.head || d.documentElement).appendChild(s); } catch (e) {} }
  function sync() { try { var d = root.document; if (!d || !d.body) return false; var on = enabled(); if (on) { injectCss(); if (!d.body.classList.contains(ON_CLS)) d.body.classList.add(ON_CLS); } else if (d.body.classList.contains(ON_CLS)) d.body.classList.remove(ON_CLS); return on; } catch (e) { return false; } }

  function close() { try { var el = root.document.getElementById(SHEET_ID); if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {} try { root.document.removeEventListener('keydown', onKey, true); } catch (e) {} }
  function onKey(ev) { try { if (ev && ev.key === 'Escape') { close(); } } catch (e) {} }
  function mkBtn(d, text, cls, fn) { var b = d.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.textContent = text; b.onclick = function (ev) { try { ev.stopPropagation(); } catch (e) {} fn(); }; return b; }
  function sheet(build) {
    close(); injectCss();
    var d = root.document, ov = d.createElement('div'); ov.id = SHEET_ID; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '話者を選ぶ');
    var box = d.createElement('div'); box.className = 'sflt-box'; ov.appendChild(box);
    var openedAt = Date.now(); ov.addEventListener('click', function (ev) { if (ev.target === ov && Date.now() - openedAt > 500) close(); });   /* -b（A）: 開いたタップの遅れた click では閉じない */
    box.addEventListener('click', function (ev) { try { ev.stopPropagation(); } catch (e) {} });
    build(d, box); d.body.appendChild(ov);
    try { d.addEventListener('keydown', onKey, true); } catch (e) {}
    try { var f = box.querySelector('button:not([disabled])'); if (f && f.focus) f.focus({ preventScroll: true }); } catch (e) {}
    return ov;
  }
  function quoteOf(say) { var s = String(say == null ? '' : say).trim(); if (/^「[\s\S]*」$/.test(s)) s = s.slice(1, -1); return '「' + s.slice(0, 40) + (s.length > 40 ? '…' : '') + '」'; }   /* say は「」込みのことが多い → 外側の 1 組だけ外して付け直す */
  function fallback(why, ti, say) {
    if (ti >= 0 && !NO_EDIT[why]) { try { var S0 = getS(); if (!S0 || !Array.isArray(S0.turns) || turnTidy(S0, S0.turns[ti])) why = 'tidy'; } catch (e) { why = 'tidy'; } }   /* -b（C）: どの理由で止めても、そのターンを保存すると整理が起きるなら ✎ へは誘導しない */
    ST.fallbacks[why] = (ST.fallbacks[why] || 0) + 1; ST.last = { at: Date.now(), kind: 'fallback', why: why, ti: ti };
    sheet(function (d, box) {
      var h = d.createElement('div'); h.className = 'sflt-h'; h.textContent = 'この台詞の話者'; box.appendChild(h);
      if (say) { var q = d.createElement('div'); q.className = 'sflt-say'; q.textContent = quoteOf(say); box.appendChild(q); }
      var m = d.createElement('div'); m.className = 'sflt-msg'; m.id = MSG_ID; m.setAttribute('data-why', why); m.setAttribute('role', 'status'); m.textContent = (WHY_MSG[why] || WHY_MSG.mismatch) + (NO_EDIT[why] ? '' : TAIL_MSG); box.appendChild(m);
      if (ti >= 0 && !NO_EDIT[why]) box.appendChild(mkBtn(d, '✎ 編集を開く', 'sflt-edit', function () { var S1 = getS(); if (!S1 || !Array.isArray(S1.turns) || turnTidy(S1, S1.turns[ti])) { fallback('tidy', ti, say); return; } close(); try { var U = getUI(); if (U && typeof U.openEdit === 'function') U.openEdit(ti); } catch (e) {} }));   /* -b（OA 1）: ✎ は EDIT-01 の試算でカードが減らないときだけ（押した時点でもう一度確かめる） */
      box.appendChild(mkBtn(d, 'キャンセル', 'sflt-cancel', close));
    });
  }
  function guardNote(g) {
    ST.guardBlocked++; ST.last = { at: Date.now(), kind: 'guard', guard: g };
    sheet(function (d, box) {
      var m = d.createElement('div'); m.className = 'sflt-msg'; m.id = MSG_ID; m.setAttribute('data-why', 'guard:' + g); m.setAttribute('role', 'status'); m.textContent = GUARD_MSG[g] || GUARD_MSG['cp1-hold']; box.appendChild(m);
      box.appendChild(mkBtn(d, '閉じる', 'sflt-cancel', close));
    });
  }
  function curGuard() { try { var F = sfl(); return (F && typeof F.guard === 'function') ? (F.guard() || null) : null; } catch (e) { return 'e64-stop'; } }

  /* ---------- タップ ---------- */
  function openFor(card) {
    ST.opens++;
    var g = curGuard(); if (g) { guardNote(g); return; }
    try { var Fp = sfl(), Pp = Fp && typeof Fp.pending === 'function' ? Fp.pending() : null; if (Pp) { fallback('pending', -1, null); return; } } catch (e) {}   /* -b（OA 3）: HOLD で保存できなかった訂正が残っている間は、タップから新しい保存をしない */
    var r = resolve(card), tx = card.querySelector('.dlg-text'), sayShown = tx ? tx.textContent : '';
    if (!r.ok) { fallback(r.why, r.ti, r.entry ? r.entry.say : sayShown); return; }
    if (deviceDiffers(r.ti, r.turnObj)) { fallback('stale', r.ti, r.say); return; }   /* -b（D） */
    var o = readOptions(r.ti, r.ci); if (!o) { fallback('nocand', r.ti, r.say); return; }
    ST.sheets++; ST.last = { at: Date.now(), kind: 'sheet', ti: r.ti, ci: r.ci };
    sheet(function (d, box) {
      var h = d.createElement('div'); h.className = 'sflt-h'; h.textContent = 'この台詞の話者を選ぶ'; box.appendChild(h);
      var q = d.createElement('div'); q.className = 'sflt-say'; q.textContent = quoteOf(r.say); box.appendChild(q);
      o.opts.forEach(function (op) {
        var isCur = (op.value === o.cur) || op.value === '=';
        var b = mkBtn(d, op.label + (isCur ? '（今の話者）' : ''), isCur ? 'sflt-opt sflt-cur' : 'sflt-opt', function () { if (isCur) { close(); return; } choose(r, op); });
        b.setAttribute('data-value', op.value); if (op.disabled) b.disabled = true; box.appendChild(b);
      });
      box.appendChild(mkBtn(d, 'キャンセル', 'sflt-cancel', close));
    });
  }

  function unhide() { try { var ov = root.document.getElementById('editOv'); if (ov) ov.classList.remove(HIDE_CLS); } catch (e) {} }
  function abort(why, ti, closePanel) {
    ST.aborted++; ST.busy = false;
    try { if (closePanel) { var ov = root.document.getElementById('editOv'), U = getUI(); if (ov && ov.classList.contains('open') && U && typeof U.closeEdit === 'function') U.closeEdit(); } } catch (e) {}
    unhide();
    if (why) fallback(why, ti, null);
  }
  function choose(r, op) {
    close(); if (ST.busy) return;   /* -b（OA 3）: 連打の 2 回目（保存の途中）は何もしない（abort で busy を外さない） */
    ST.picks++;
    var S = getS(), d = root.document, F = sfl(), U = getUI(), ov = d.getElementById('editOv');
    if (ST.busy || !enabled() || !S || !F || !U || !ov) { abort(enabled() ? 'busy' : null, r.ti, false); return; }
    var g = curGuard(); if (g) { guardNote(g); return; }
    try { var Fq = sfl(); if (Fq && typeof Fq.pending === 'function' && Fq.pending()) { abort('pending', -1, false); return; } } catch (e) {}
    /* 開いた後に変わっていないか（同じオブジェクト・同じ話者と台詞・同じターンの全カード） */
    var turn = S.turns && S.turns[r.ti], c = turn && Array.isArray(turn._convSays) ? turn._convSays[r.ci] : null;
    if (turn !== r.turnObj || c !== r.entry || !c || c.who !== r.who || c.say !== r.say || (c._sid || null) !== r.sid || turnSig(turn) !== r.sig) { abort('changed', r.ti, false); return; }
    if (ov.classList.contains('open')) { abort('busy', r.ti, false); return; }
    if (deviceDiffers(r.ti, turn)) { abort('stale', r.ti, false); return; }
    var v1 = verNow(); if (!r.ver || v1.rev !== r.ver.rev || v1.gen !== r.ver.gen) { abort('changed', r.ti, false); return; }   /* -b（OA 2）: 開いた後に保存版が進んだ（どの保存でも）＝推測で移さず中止 */   /* -b（D）: 別タブがこのターンを書き換えた（端末の保存が、このタブのメモリと違う） */
    var toName = op.value.indexOf('id:') === 0 ? (op.name || '') : op.value;
    if (tidyChanges(S, turn, r.ci, toName)) { abort('tidy', r.ti, false); return; }
    var ST0 = null; try { ST0 = F.status(); } catch (e) {}
    ST.busy = true; ov.classList.add(HIDE_CLS);
    try {
      U.openEdit(r.ti);   /* SFL の包み: 守りの状態なら開かずにお知らせ（SFL が出す） */
      if (!ov.classList.contains('open')) { abort(null, r.ti, false); return; }
      var box = d.getElementById('v292SFL1-list'), ta = d.getElementById('editTa');
      if (S.editIdx !== r.ti || !box || +box.getAttribute('data-ti') !== r.ti || !ta || ta.value !== turn.narrative) { abort('mismatch', r.ti, true); return; }
      var sel = box.querySelector('select[data-ci="' + r.ci + '"]'), hit = -1;
      if (sel) for (var i = 0; i < sel.options.length; i++) { var x = sel.options[i]; if (x.value === op.value && x.textContent === op.label && !x.disabled) { hit = i; break; } }
      if (hit < 0) { abort('nocand', r.ti, true); return; }
      sel.selectedIndex = hit;
      var rc = F.readChanges();
      if (!rc || rc.ti !== r.ti || !rc.changes || rc.changes.length !== 1 || rc.changes[0].ci !== r.ci) { abort('mismatch', r.ti, true); return; }
      ST.saves++; ST.last = { at: Date.now(), kind: 'save', ti: r.ti, ci: r.ci, to: toName, toId: rc.changes[0].toId || null };
      U.saveEdit();   /* SFL makeSaveEdit → EDIT-01b → S.saveD を 1 回（新しい保存経路なし） */
    } catch (e) { try { console.warn(TAG, 'choose err', e && e.message); } catch (_) {} abort(null, r.ti, true); return; }
    settle(r, ST0);
  }
  /* 結果を待って、隠した ✎ パネルを必ず片づける。表示（トースト・バナー・お知らせ）は SFL / EDIT-01 / fix781 が出したものだけ */
  function settle(r, ST0) {
    var t0 = Date.now(), d = root.document, F = sfl(), U = getUI(), iv = null;
    var fin = function (kind) { try { clearInterval(iv); } catch (e) {} ST.busy = false; if (ST.last && ST.last.kind === 'save') ST.last.result = kind; unhide(); };
    var tick = function () {
      try {
        var ov = d.getElementById('editOv'), st = F && F.status ? F.status() : null, last = st && st.last;
        if (!ov || !ov.classList.contains('open')) { fin('closed:' + (last && last.outcome || '')); return; }   /* EDIT-01 が閉じた（保存できた） */
        var moved = st && ST0 && (st.reverted !== ST0.reverted || st.holdBlocked !== ST0.holdBlocked);
        if (moved && last && last.idx === r.ti && /^(reverted:|blocked:)/.test(String(last.outcome || ''))) { try { if (U && typeof U.closeEdit === 'function') U.closeEdit(); } catch (e) {} fin('closed-after:' + last.outcome); return; }
        if (Date.now() - t0 > SETTLE_MS) { fin('timeout-shown'); return; }   /* ✎ で保存を押して待っているのと同じ画面に戻す */
      } catch (e) { fin('err'); }
    };
    iv = setInterval(tick, 100); tick();
  }

  var lastScroll = 0, lastTouchEnd = 0, touch = null, TAP_MOVE_PX = 10, LONG_PRESS_MS = 500;
  function onScroll() { lastScroll = Date.now(); if (touch) touch.moved = true; }
  /* カードの本体で、開いてよいタップか（click とタッチで共通）。開けないときは null */
  function eligible(t) {
    if (!t || !t.closest) return null;
    var card = t.closest('#dialogue-stream .v292-dlg-card'); if (!card) return null;
    if (!t.closest('.dlg-body') || t.closest('.dlg-av, .v292-edit01-x, button, a, input, select, textarea, label, img, [role="button"]')) return null;
    if (!sync()) return null;   /* OFF: 何もしない */
    if (ST.busy || root.document.getElementById(SHEET_ID)) return null;
    var ov = root.document.getElementById('editOv'); if (ov && ov.classList.contains('open')) return null;
    if (Date.now() - lastScroll < SCROLL_QUIET_MS) return null;
    try { var sel = root.getSelection && root.getSelection(); if (sel && !sel.isCollapsed && String(sel).trim()) return null; } catch (e) {}
    return card;
  }
  function onClick(ev) {
    try {
      if (Date.now() - lastTouchEnd < 800) return;   /* -b（A）: 指で触った直後の click（タップ後・長押し後に合成されるもの）では何もしない。指のときは touchend の判定だけで決める */
      var card = eligible(ev.target); if (card) openFor(card);
    } catch (e) { try { console.warn(TAG, 'tap err', e && e.message); } catch (_) {} }
  }
  /* -b（A）: iOS / Android の指のタップ。1 本指・10px 以上動かない・0.5 秒未満・その間にスクロールが無い、のときだけ開き、
     後から来る合成 click を止める（preventDefault は開いたときだけ。それ以外は何もしない＝スワイプ・スクロール・長押し・選択は今までどおり） */
  function onTouchStart(ev) { try { var ts = ev.touches; if (!ts || ts.length !== 1) { touch = null; return; } touch = { x: ts[0].clientX, y: ts[0].clientY, t: Date.now(), target: ev.target, moved: false }; } catch (e) { touch = null; } }
  function onTouchMove(ev) { try { if (!touch) return; var ts = ev.touches; if (!ts || ts.length !== 1 || Math.abs(ts[0].clientX - touch.x) > TAP_MOVE_PX || Math.abs(ts[0].clientY - touch.y) > TAP_MOVE_PX) touch.moved = true; } catch (e) {} }
  function onTouchCancel() { touch = null; }
  function onTouchEnd(ev) {
    try {
      lastTouchEnd = Date.now(); var T = touch; touch = null; if (!T || T.moved) return;
      if (ev.touches && ev.touches.length) return;
      var ct = ev.changedTouches && ev.changedTouches[0]; if (ct && (Math.abs(ct.clientX - T.x) > TAP_MOVE_PX || Math.abs(ct.clientY - T.y) > TAP_MOVE_PX)) return;
      if (Date.now() - T.t >= LONG_PRESS_MS) return;   /* 長押し（文字選択・メニュー）は触らない */
      if (lastScroll >= T.t - SCROLL_QUIET_MS) return;  /* 触る直前・触っている間にスクロールがあった */
      var card = eligible(T.target); if (!card) return;
      try { ev.preventDefault(); } catch (e) {}
      openFor(card);
    } catch (e) { try { console.warn(TAG, 'touch err', e && e.message); } catch (_) {} }
  }

  var api = { ver: VER, enabled: enabled, resolve: function (card) { var r = resolve(card); return { ok: r.ok, why: r.why || null, ti: r.ti, ci: r.ci == null ? -1 : r.ci, who: r.who == null ? null : r.who, sid: r.sid || null }; }, close: close, sync: sync,
    status: function () { return { ver: VER, enabled: enabled(), tapOff: tapOff(), sflInstalled: sflInstalled(), bodyOn: !!(root.document && root.document.body && root.document.body.classList.contains(ON_CLS)), opens: ST.opens, sheets: ST.sheets, picks: ST.picks, saves: ST.saves, aborted: ST.aborted, guardBlocked: ST.guardBlocked, busy: ST.busy, fallbacks: Object.assign({}, ST.fallbacks), last: ST.last ? Object.assign({}, ST.last) : null }; } };
  root.__v292DfixSFLTap = api;

  try {
    var d = root.document;
    if (d && d.addEventListener) {
      d.addEventListener('click', onClick, false);
      d.addEventListener('scroll', onScroll, { capture: true, passive: true });
      d.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
      d.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
      d.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
      d.addEventListener('touchend', onTouchEnd, { capture: false, passive: false });   /* preventDefault（開いたときだけ）に passive:false が要る。touchend はスクロールの性能に影響しない */
      /* SFL は EDIT-01 の包みを待って最大 20 秒かけて入る → 入ったら見た目の印を付ける。停止キー・SFL OFF のときは 1 回見るだけ */
      var arm = function () { if (tapOff()) return; var F = sfl(); var want = false; try { want = !!(F && F.enabled && F.enabled()); } catch (e) {} if (!want) return; var n = 0, iv = setInterval(function () { n++; if (sync() || n > 50) clearInterval(iv); }, 500); };
      if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', arm); else arm();
      try { console.log(TAG, 'loaded', VER); } catch (_) {}
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
