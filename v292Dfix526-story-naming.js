/* v292Dfix526-story-naming.js (2026-07-25) — P2-a: 物語の自動命名 + saveto撤去
 *
 * 目的(設計書 §10 P2-a): 「全カードが『新しい物語』」と「現在の状態を保存(saveto)」という
 *   2026-07-24 の消失事故(離島16Tが上書き)の直接原因を、UIから断つ。
 *
 * [A] 自動命名(1回だけ・冪等): chr6_slots_meta の既定名(新しい物語/マイ物語/スロット X/空)だけを
 *     保存済みJSONの scene.loc・cast.hero.name から命名し、summary/createdAt を補う。
 *     おしんが手で付けた名前は絶対に上書きしない。実行前に chr6_bk_p2a_<ts> へ meta 全体を控える。
 * [B] saveto 撤去: セーブ管理の [data-act="saveto"] を隠し、万一のクリックも capture で止める。
 *     (fix490 の安全化ラッパと常設ガードはそのまま残す＝二重の保険)
 *
 * ※ 名前は表示用であって同一性キーではない。カード本文/物語本文の DOM テキストには一切触れない。
 * OFF = localStorage['v292Dfix526Off']='1'
 * 検証口 = window.__v292Dfix526 (.state() .retitle(force) .preview())
 */
(function v292Dfix526(){
  if (window.__v292Dfix526) return;
  var TAG = '[v292Dfix526]';
  var DONE = 'v292Dfix526_named';
  var PLACEHOLDER = /^(新しい物語|マイ物語|スロット\s*[A-Za-z]|)$/;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lss(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function off(){ return lsg('v292Dfix526Off') === '1'; }

  var renamed = 0, hidden = 0, blockedClicks = 0;

  function readMeta(){ try { var m = JSON.parse(lsg('chr6_slots_meta') || '[]'); return Array.isArray(m) ? m : []; } catch(e){ return []; } }
  function slotData(id){
    try {
      var raw = lsg(id === 'default' || id === 'chr6' ? 'chr6' : ('chr6_slot_' + id));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e){ return null; }
  }
  function clean(s){ return String(s || '').replace(/【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim(); }

  function deriveTitle(d){
    if (!d) return null;
    var loc = clean(d.scene && d.scene.loc);
    if (loc) return loc.slice(0, 26);
    var hero = clean(d.cast && d.cast.hero && d.cast.hero.name);
    if (hero) return (hero + 'の物語').slice(0, 26);
    return null;
  }
  function deriveSummary(d){
    if (!d) return '';
    var lore = clean(d.scene && d.scene.lore);
    if (lore) return lore.slice(0, 44);
    var loc = clean(d.scene && d.scene.loc);
    var hero = clean(d.cast && d.cast.hero && d.cast.hero.name);
    return [loc, hero].filter(Boolean).join(' ／ ').slice(0, 44);
  }

  // ---- [A] 命名 ---------------------------------------------------------
  function retitle(force){
    if (off()) return { skipped: 'off' };
    var meta = readMeta();
    if (!meta.length) return { skipped: 'no-meta' };

    // ★毎回走らせるが、既定名が1件も無ければ本体JSONを読まずに即return(自己修復かつ低コスト)。
    //   クラウドから古い登録簿が降ってきて既定名に戻っても、次回起動で自動的に命名し直す。
    if (!force){
      var need = false;
      for (var z = 0; z < meta.length; z++){
        var mz = meta[z]; if (!mz || !mz.id || String(mz.id) === 'default') continue;
        if (PLACEHOLDER.test(String(mz.name == null ? '' : mz.name).trim()) || !mz.summary){ need = true; break; }
      }
      if (!need) return { skipped: 'nothing-to-do' };
    }

    // 控え(1回だけ・容量が無ければ命名を中止=fail-closed)
    if (lsg(DONE) !== '1'){
      if (!lss('chr6_bk_p2a_' + Date.now(), JSON.stringify(meta))){
        try { console.warn(TAG, 'backup failed → skip retitle'); } catch(e){}
        return { skipped: 'backup-failed' };
      }
    }

    var n = 0, changed = false;
    for (var i = 0; i < meta.length; i++){
      var s = meta[i];
      if (!s || !s.id) continue;
      if (String(s.id) === 'default') continue;                 // 互換のため固定
      var d = slotData(s.id);
      var cur = String(s.name == null ? '' : s.name).trim();
      if (PLACEHOLDER.test(cur)){
        var t = deriveTitle(d);
        if (t && t !== cur){ s.name = t; n++; changed = true; }
      }
      if (!s.summary){ var sm = deriveSummary(d); if (sm){ s.summary = sm; changed = true; } }
      if (!s.createdAt && s.updatedAt){ s.createdAt = s.updatedAt; changed = true; }
    }
    /* ★★fix748 + 裁定11 GATE3: chr6_slots_meta は protected domain（本体の companion key）。
       この boot 時の正規化は GWS を通っていなかった（GLOBAL_WRITE_BYPASS_AUDIT で検出）。
         分類 = Class C
         RECOMPUTATION_SOURCE  = chr6_slots_meta + 各 slot の durable body
                                 （deriveTitle / deriveSummary は純関数。同じ入力から同じ題名を作る）
         RECOMPUTATION_TRIGGER = 次 boot の retitle(false)
       ★重要: DONE marker は **payload と同じ transaction の中**で立てる。
         別々にすると「meta は書けなかったのに『済』だけ立つ」→ 次 boot で再実行されず
         永久に収束しない（裁定11 が名指しした one-shot marker の罠）。 */
    var _write748 = function(){
      if (changed) lss('chr6_slots_meta', JSON.stringify(meta));
      lss(DONE, '1');
    };
    var _A748 = null;
    try { _A748 = window.__v292DfixDAdm; } catch(e){}
    if (_A748 && typeof _A748.registerC === 'function')
      _A748.registerC('fix526.retitle',
        'chr6_slots_meta + 各 slot の durable body（deriveTitle / deriveSummary は純関数）',
        '次 boot の retitle(false)。DONE marker を payload と同一 transaction で立てるので、書けなければ再実行される',
        'C18 story naming / companion of chr6_slot_');
    if (changed && _A748 && typeof _A748.persistC === 'function')
      _A748.persistC('fix526.retitle', _write748);
    else _write748();
    renamed += n;
    try { console.log(TAG, 'retitled ' + n + ' / ' + meta.length); } catch(e){}
    return { renamed: n, total: meta.length };
  }
  function preview(){
    return readMeta().map(function(s){
      var d = s && s.id ? slotData(s.id) : null;
      return { id: s && s.id, now: s && s.name, would: deriveTitle(d), turns: (d && d.turns && d.turns.length) || 0 };
    });
  }

  // ---- [B] saveto 撤去 --------------------------------------------------
  function hideSaveto(){
    try {
      var bs = document.querySelectorAll('[data-act="saveto"]');
      for (var i = 0; i < bs.length; i++){
        var b = bs[i];
        if (b.__f526hidden) continue;
        b.__f526hidden = 1; b.style.display = 'none'; hidden++;
      }
    } catch(e){}
  }
  function installClickBlock(){
    try {
      document.addEventListener('click', function(e){
        if (off()) return;
        var t = e.target && e.target.closest ? e.target.closest('[data-act="saveto"]') : null;
        if (!t) return;
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        blockedClicks++;
        try { console.warn(TAG, 'saveto blocked (廃止された操作です)'); } catch(e2){}
        try { if (window.UI && UI.setStatus) UI.setStatus('この操作は廃止されました（物語はホームから開いてください）'); } catch(e2){}
      }, true);
    } catch(e){}
  }
  function watch(){
    hideSaveto();
    try {
      var mo = new MutationObserver(function(){ hideSaveto(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch(e){}
  }

  function boot(){
    if (off()) { try { console.log(TAG, 'off'); } catch(e){} return; }
    try { retitle(false); } catch(e){ try { console.warn(TAG, 'retitle err', e && e.message); } catch(e2){} }
    installClickBlock();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
    else watch();
  }

  window.__v292Dfix526 = {
    state: function(){ return { off: off(), done: lsg(DONE) === '1', renamed: renamed, hiddenSaveto: hidden, blockedClicks: blockedClicks }; },
    retitle: retitle,
    preview: preview,
    deriveTitle: deriveTitle,
    deriveSummary: deriveSummary
  };

  boot();
})();
