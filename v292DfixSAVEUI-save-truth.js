/* v292DfixSAVEUI-save-truth.js (2026-11-11 · GPT #127-SC (A) SPBASE2 残件 / (B) fix635 の成功表示)
 * ─ 保存されていないのに「保存しました」と見せない・選ぶ前に進めたものを黙って消さない ─
 *
 * ■Local で再現した場面（直す前 = 本番 8b688f2）
 *   (B) fix635（新しい物語に別の物語の内容が入り込んだ）が保存を止めても、S.save は undefined を返すだけで、
 *       ・設定の保存は「設定を保存しました」（閉じる）・Ctrl+S は「💾 保存しました」・本文の編集は何も言わずに閉じる。
 *       ・物語画面には何も出ない（知らせはホームへ戻ったときの 1 回だけ）。生成はそのまま進む（進めたターンは保存されない）。
 *   (B) fix945（古いタブ）が保存を止めた（hold を返す）のに、Ctrl+S は「💾 保存しました」・本文の編集は閉じる（設定は正しく断る）。
 *   (A) 差分の帯（DIVERGED。schema2 切替の通信中に保存したときなど）が出ている間も、ターンの生成・設定の保存が普通に進み、
 *       「設定を保存しました」と出る（端末だけ・クラウドへは行かない）。その後「ローカルを退避してクラウド版を開く」を押すと、
 *       帯の間に進めたターンと設定が、物語・クラウド・退避（Recovery Draft）・控え・入力欄のどこにも残らない（Recovery Draft は帯が出た時点のもの）。
 *
 * ■この部品がすること（保存の契約は変えない：書く・書かない・送る・送らないの判断は今のまま。変えるのは表示と、生成を始めるかどうかだけ）
 *   1. 生成の関門（G.submit を包む・index.html は変えない）: 差分の帯がまだ選ばれていない間／fix635 が保存を止めている間は、
 *      新しいターンを作らない。入力欄は消さない。理由を画面に出す。kill v292DfixSAVEUIGateOff='1'
 *   2. 「ローカルを退避してクラウド版を開く」を押したとき、クラウド版へ切り替える前に
 *      (a) クラウド版に無いターン（帯の間に進めたもの等）と入力欄の文を RESCUE1 の控えに残す（再読み込み後に入力欄の上から見られる・戻せる）
 *      (b) 今の端末の内容で Recovery Draft を作り直す（fix781 の draftCreate そのまま・読み戻し確認つき）。作れなければ切り替えない（fail-closed）。
 *      ＝「このままローカル」→「クラウド版に戻す」（fix927・GPT #127-CW）と同じ手順。kill v292DfixSAVEUIAdoptOff='1'
 *   3. 文言の口（呼び手は index.html の設定保存・EDIT01・SFL1・Ctrl+S）:
 *      reasonText(result) … S.save が書かずに hold を返したときの短い理由（無ければ null）
 *      localOnlyText(what) … 差分の帯がまだ選ばれていない間の「この端末にだけ保存しました（クラウドへは送っていません）」
 *   4. fix635 が保存を止めたら、物語画面に常設の帯を出す（今まではホームへ戻ったときの 1 回だけ）。
 * ■止める: localStorage v292DfixSAVEUIOff='1'（全部。fix635 の戻り値も前の undefined に戻る＝前の版と同じ動き）
 * ■検証口: window.__v292DfixSAVEUI.state()
 */
(function v292DfixSAVEUI(){
  'use strict';
  if (window.__v292DfixSAVEUI) return;
  var TAG = '[v292DfixSAVEUI]';
  var BUILD = 'saveui.a';
  function lsg(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function off(){ return lsg('v292DfixSAVEUIOff') === '1'; }
  function gateOff(){ return off() || lsg('v292DfixSAVEUIGateOff') === '1'; }
  function adoptOff(){ return off() || lsg('v292DfixSAVEUIAdoptOff') === '1'; }
  var st = { gateStops: 0, gateWhy: {}, adoptPrep: 0, adoptRescued: 0, adoptRescueRefused: 0, adoptDraft: 0, adoptFail: 0, lastAdopt: null, f635Banner: 0, submitWrapped: 0 };
  function getS(){ try { var g = window.__chronicleGetState; if (typeof g === 'function'){ var s = g('saveui'); if (s) return s; } } catch (e) {} try { return window.S || (0, eval)('typeof S!=="undefined"?S:null'); } catch (e) { return null; } }
  function G781(){ return window.__v292Dfix781 || null; }
  function sid(){ try { var G = G781(); var id = G && typeof G.storyId === 'function' ? G.storyId() : null; return id ? String(id) : null; } catch (e) { return null; } }
  function vis(el){ try { return !!(el && el.isConnected && el.style.display !== 'none' && el.getBoundingClientRect().height > 0); } catch (e) { return false; } }

  /* ---- 差分の帯がまだ選ばれていないか（fix781 の marker が DIVERGED／BOOTSTRAP_HOLD で、帯が画面に出ている） ---- */
  function bandUndecided(){
    if (off()) return false;
    var G = G781(), id = sid(); if (!G || !id) return false;
    var s = null; try { s = G.state(id); } catch (e) { return false; }
    if (s !== 'DIVERGED' && s !== 'BOOTSTRAP_HOLD') return false;
    return vis(document.getElementById('v781banner'));
  }
  /* ---- fix635 が今この物語の保存を止めているか ---- */
  function f635Blocking(){
    if (off()) return false;
    try { var F = window.__v292Dfix635; return !!(F && typeof F.shouldBlock === 'function' && F.shouldBlock()); } catch (e) { return false; }
  }

  /* ---- 3. 文言 ---- */
  var F635_REASON = '別の物語の内容が入り込んだため止めました。ホームからもう一度始めてください';
  function reasonText(r){
    if (off() || !r || typeof r !== 'object' || r.hold !== true) return null;
    var c = String(r.code || '');
    if (c === 'NEW_STORY_GUARD') return F635_REASON;
    if (c === 'XTAB_STALE') return 'この画面は最新ではありません。再読み込みしてください';
    return '今は保存できません。もう一度お試しください';
  }
  function localOnlyText(what){
    if (!bandUndecided()) return null;
    return String(what || '変更') + 'はこの端末にだけ保存しました（クラウドと差分があるため、クラウドへは送っていません。下の帯でどちらで続けるか選んでください）';
  }

  /* ---- 1. 生成の関門 ---- */
  var GATE_BAND = 'クラウドと差分があるため、下の帯で「このままローカルで続ける」か「ローカルを退避してクラウド版を開く」を選ぶまで、新しいターンは作りません（入力した文は残っています）。';
  var GATE_635 = 'この新しい物語に別の物語の内容が入り込んだため、保存を止めています。ここでは新しいターンを作りません（入力した文は残っています）。ホームへ戻り、物語画面のタブを1つだけにして「＋ 新しい物語を始める」からやり直してください。';
  function gateWhy(){
    if (gateOff()) return null;
    if (bandUndecided()) return 'band';
    if (f635Blocking()) return 'f635';
    return null;
  }
  function say(msg){ try { if (window.UI && typeof window.UI.setStatus === 'function') { window.UI.setStatus(msg, true); return; } } catch (e) {} try { var U = (0, eval)('typeof UI!=="undefined"?UI:null'); if (U && typeof U.setStatus === 'function') U.setStatus(msg, true); } catch (e) {} }
  function getG(){ try { return window.G || (0, eval)('typeof G!=="undefined"?G:null'); } catch (e) { return null; } }
  function wrapSubmit(){
    var g = getG(); if (!g || typeof g.submit !== 'function') return false;
    if (g.submit.__saveuiG) return true;
    var os = g.submit;
    var w = function(){
      try {
        var why = gateWhy();
        if (why){
          st.gateStops++; st.gateWhy[why] = (st.gateWhy[why] || 0) + 1;
          try { console.warn(TAG, 'turn not started (' + why + ')'); } catch (e) {}
          say(why === 'band' ? GATE_BAND : GATE_635);
          if (why === 'f635') showF635Banner();
          return Promise.resolve();
        }
      } catch (e) {}
      return os.apply(this, arguments);
    };
    try { for (var p in os){ if (!(p in w)){ try { w[p] = os[p]; } catch (e) {} } } } catch (e) {}
    w.__saveuiG = true; g.submit = w; st.submitWrapped++;
    return true;
  }
  (function pollG(){ if (off()) return; if (wrapSubmit()) return; pollG._n = (pollG._n || 0) + 1; if (pollG._n > 240) return; setTimeout(pollG, 250); })();

  /* ---- 4. fix635 の常設の帯 ---- */
  var f635El = null;
  function showF635Banner(){
    if (off() || f635El) return;
    try {
      var d = document.createElement('div'); d.id = 'v292DfixSAVEUI-f635';
      d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147482990;background:#7a1f1f;color:#fff;font:14px/1.5 system-ui,sans-serif;padding:10px 14px;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.4)';
      d.textContent = 'この新しい物語に別の物語の内容が入り込んだため、保存を止めています。この画面で進めた内容は保存されません。ホームへ戻り、物語画面のタブを1つだけにして「＋ 新しい物語を始める」からやり直してください。';
      (document.body || document.documentElement).appendChild(d); f635El = d; st.f635Banner++;
    } catch (e) {}
  }
  (function watch635(){
    if (off()) return;
    try { var F = window.__v292Dfix635; if (F && typeof F.state === 'function'){ var s = F.state(); if (s && s.tripped) { showF635Banner(); return; } } } catch (e) {}
    watch635._n = (watch635._n || 0) + 1; if (watch635._n > 3600) return; setTimeout(watch635, 1000);
  })();

  /* ---- 2. 「ローカルを退避してクラウド版を開く」の前に ---- */
  function fnv(s){ var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }
  function tfp(t){ var n = (t && t.narrative != null) ? t.narrative : ''; if (Array.isArray(n)) n = n.join('\n'); return fnv(String((t && t.inputType) || '') + '\u0001' + String((t && t.playerText) == null ? '' : t.playerText) + '\u0001' + String(n)); }
  function turnsOfRecord(rec){ try { var b = rec && (rec.body || rec); return (b && Array.isArray(b.turns)) ? b.turns : null; } catch (e) { return null; } }
  function schemaNow(){ var sch = 1; try { var F5 = window.__v292Dfix705; var s5 = F5 && F5.status && F5.status().state; if (s5 && s5.schema === 2) sch = 2; } catch (e) {} return sch; }
  function prepareAdopt(id, cb){
    var G = G781(); if (!G || typeof G.draftCreate !== 'function') return cb(false, 'NO_781');
    st.adoptPrep++;
    var m = null; try { m = G.marker(id); } catch (e) {}
    var after = function(back){
      var out = { at: Date.now(), base: null, extra: 0, input: 0, rescued: false, draft: null };
      /* (a) クラウド版に無いターン（最初に食い違うターンから後ろ）と入力欄の文を控えへ */
      try {
        var S = getS(); var mt = (S && Array.isArray(S.turns)) ? S.turns : [];
        var srvT = turnsOfRecord(back && back.serverRecord);
        if (!srvT){ try { var raw = back && back.snapshot ? back.snapshot['chr6_slot_' + id] : null; var o = raw ? JSON.parse(raw) : null; srvT = (o && Array.isArray(o.turns)) ? o.turns : null; out.baseFrom = 'draft'; } catch (e) { srvT = null; } }
        else out.baseFrom = 'server';
        var base = mt.length; if (srvT){ base = 0; while (base < mt.length && base < srvT.length && tfp(mt[base]) === tfp(srvT[base])) base++; }
        var extra = mt.slice(base);
        var inp = null; try { var el = document.getElementById('inp'); inp = (el && el.value) ? String(el.value) : null; } catch (e) {}
        out.base = base; out.extra = extra.length; out.input = inp ? 1 : 0;
        var R = window.__v292DfixRESCUE1;
        if ((extra.length || inp) && R && R.armed === true && typeof R.store === 'function'){
          var dt = 0; try { var od = JSON.parse(lsg('chr6_slot_' + id) || 'null'); dt = (od && Array.isArray(od.turns)) ? od.turns.length : 0; } catch (e) {}
          var rec = R.store(id, { storyId: id, why: 'SAVEUI_ADOPT_SERVER', fromTurn: base, memTurns: mt.length, diskTurns: dt, turns: extra, pendingInput: inp, build: BUILD });
          if (rec){ out.rescued = true; st.adoptRescued++; } else st.adoptRescueRefused++;
        }
      } catch (e) { out.rescueErr = String(e && e.message || e).slice(0, 60); }
      /* (b) 今の端末の内容で Recovery Draft を作り直す（読み戻し確認つき）。作れなければ切り替えない */
      try {
        G.draftCreate(id, { schema: schemaNow(), reason: 'SAVEUI_ADOPT_REFRESH',
                            serverRev: (m && m.pendingServerRev != null) ? m.pendingServerRev : null,
                            serverHash: (m && m.pendingServerHash != null) ? String(m.pendingServerHash) : null,
                            serverRecord: (back && back.serverRecord) ? back.serverRecord : null },
          function(ok, err, newId){
            out.draft = ok ? String(newId || '').slice(-24) : ('FAIL:' + String(err || ''));
            st.lastAdopt = out;
            if (!ok){ st.adoptFail++; return cb(false, err || 'DRAFT_FAILED'); }
            st.adoptDraft++; cb(true);
          });
      } catch (e) { st.adoptFail++; cb(false, 'DRAFT_THREW'); }
    };
    if (m && m.draftId && typeof G.draftGet === 'function'){ try { G.draftGet(m.draftId, function(back){ after(back || null); }); return; } catch (e) {} }
    after(null);
  }
  function onClickCapture(ev){
    try {
      if (adoptOff()) return;
      var bn = document.getElementById('v781banner'); var t = ev.target;
      if (!bn || !t || !bn.contains(t)) return;
      var btn = (t.closest ? t.closest('button') : null); if (!btn || !bn.contains(btn)) return;
      if (!/クラウド版を開く/.test(btn.textContent || '')) return;
      if (btn.__saveuiPass){ btn.__saveuiPass = false; return; }          /* 準備が済んだ 2 回目は fix781 の元の手順へそのまま */
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (btn.__saveuiBusy) return; btn.__saveuiBusy = true; btn.disabled = true;
      var id = sid(); var msgEl = bn.querySelector('span');
      if (!id){ btn.__saveuiBusy = false; btn.disabled = false; return; }
      try { if (msgEl) msgEl.textContent = 'この端末の内容を退避しています…'; } catch (e) {}
      prepareAdopt(id, function(ok, why){
        btn.__saveuiBusy = false; btn.disabled = false;
        if (!ok){ try { if (msgEl) msgEl.textContent = 'この端末の内容を退避できなかったため、クラウド版には切り替えていません（' + String(why || '') + '）。'; } catch (e) {} return; }
        btn.__saveuiPass = true; btn.click();
      });
    } catch (e) {}
  }
  try { document.addEventListener('click', onClickCapture, true); } catch (e) {}

  window.__v292DfixSAVEUI = {
    build: BUILD,
    on: function(){ return !off(); },
    reasonText: reasonText, localOnlyText: localOnlyText,
    bandUndecided: bandUndecided, f635Blocking: f635Blocking, gateWhy: gateWhy,
    state: function(){ try { return JSON.parse(JSON.stringify({ on: !off(), gateOn: !gateOff(), adoptOn: !adoptOff(), band: bandUndecided(), f635: f635Blocking(), stats: st })); } catch (e) { return null; } }
  };
  try { console.log(TAG, 'loaded (' + BUILD + (off() ? ', off' : '') + ')'); } catch (e) {}
})();
