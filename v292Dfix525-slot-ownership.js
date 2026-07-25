/* v292Dfix525-slot-ownership.js (2026-07-25)
 * 目的: 「同じ物語が他スロットへ複写される / スロット切替で前の物語のキャラが混ざる」の根治。
 *
 * 真因A(複写): features.js fix30 の S.save は activeSlot() = localStorage['chr6_active_slot'] が
 *   指すスロットへ「そのタブが記憶している物語」を書く。ポインタは全タブ共有・物語はタブ毎。
 *   → タブが2つあると、片方の切替でもう片方が自分の物語を相手のスロットへ上書きする。
 *   実データ(2026-07-24 23:51=19T / 23:53=20T / 07-25 00:09=19Tが廃墟25Tを破壊)と一致。
 * 真因B(混在): fix30 loadSlot が Object.assign(S.cast,…)/Object.assign(S.scene,…) の"合成"。
 *   前の物語にしか無いキーが残り、次の保存でそのスロットへ焼き付く。
 *
 * 対処:
 *  [A] タブ所有権ピン: このタブが実際に読み込んだスロットidを own として保持。保存の直前に
 *      chr6_active_slot が own と違えば、保存の間だけ own に戻し(同期ブロック内)、直後に元へ復す。
 *      = 他タブの切替に巻き込まれず、必ず自分のスロットへ保存する。値は書き換えず復元する。
 *  [B] 切替後プルーン: chr6_active_slot がこのタブから書き換わったら(=同一タブの読込)、直後に
 *      S.cast / S.scene の"読み込んだ物語に存在しないキー"だけを削除(オブジェクト同一性は維持)。
 *  [C] 追記専用ログ v292Dfix525_log(上限80・本文テキストは一切入れない)。
 *
 * OFF = localStorage['v292Dfix525Off']='1'
 * 検証口 = window.__v292Dfix525 (.state() .dump() .clear())
 */
(function v292Dfix525(){
  if (window.__v292Dfix525) return;
  var TAG = '[v292Dfix525]';
  var LOGK = 'v292Dfix525_log', LOGMAX = 80;
  var ACT = 'chr6_active_slot';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix525Off') === '1'; }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function readPtr(){ try { return JSON.parse(lsg(ACT) || '"default"') || 'default'; } catch(e){ return 'default'; } }
  function slotKey(id){ return (!id || id === 'default' || id === 'chr6') ? 'chr6' : ('chr6_slot_' + id); }

  var own = null;           // このタブが所有するスロットid
  var pinned = 0, pruned = 0, mismatches = 0;

  function log(kind, o){
    try {
      var a = []; try { a = JSON.parse(lsg(LOGK) || '[]') || []; } catch(e){ a = []; }
      if (!Array.isArray(a)) a = [];
      a.push({ t: Date.now(), k: kind, own: String(o && o.own || ''), ptr: String(o && o.ptr || ''), n: (o && o.n) || 0 });
      while (a.length > LOGMAX) a.shift();
      localStorage.setItem(LOGK, JSON.stringify(a));
    } catch(e){}
  }

  // ---- [B] 読み込んだ物語に存在しないキーだけを落とす(同一性維持) ----
  function pruneAgainst(id){
    var S = getS(); if (!S) return 0;
    var raw = lsg(slotKey(id)); if (!raw) return 0;
    var d = null; try { d = JSON.parse(raw); } catch(e){ return 0; }
    if (!d || typeof d !== 'object') return 0;
    var n = 0;
    ['cast', 'scene'].forEach(function(sec){
      var cur = S[sec], src = d[sec];
      if (!cur || typeof cur !== 'object' || !src || typeof src !== 'object') return;   // 片方欠落=触らない(fail-open)
      Object.keys(cur).forEach(function(k){
        if (k === 'hero' || k === 'npcs') return;                                       // 中核は fix30 が置換済
        if (!Object.prototype.hasOwnProperty.call(src, k)) { try { delete cur[k]; n++; } catch(e){} }
      });
    });
    if (n) { pruned += n; log('prune', { own: id, ptr: id, n: n }); try { console.log(TAG, 'pruned', n, 'stale keys on slot switch'); } catch(e){} }
    return n;
  }

  function rerender(){
    try { if (window.__v292Dfix30 && window.__v292Dfix30.triggerReRender) { window.__v292Dfix30.triggerReRender(); return; } } catch(e){}
    try { if (typeof UI !== 'undefined' && UI && Array.isArray(UI._renderHooks)) UI._renderHooks.forEach(function(h){ try { h({}); } catch(e){} }); } catch(e){}
  }

  // ---- setItem フック: このタブが active を書き換えた=同一タブの読込 ----
  (function wrapSetItem(){
    try {
      var ls = window.localStorage, _set = ls.setItem.bind(ls);
      if (_set.__f525) return;
      var wrapped = function(k, v){
        var before = (k === ACT && !off()) ? lsg(ACT) : null;
        var r = _set(k, v);
        if (k === ACT && !off() && before !== v){
          var id = readPtr();
          own = id;                                    // 同一タブの切替 → 所有権も移る
          setTimeout(function(){ if (pruneAgainst(id)) rerender(); }, 0);
        }
        return r;
      };
      wrapped.__f525 = true;
      try { Object.defineProperty(wrapped, 'name', { value: 'setItem', configurable: true }); } catch(e){}
      ls.setItem = wrapped;
    } catch(e){}
  })();

  // ---- [A] 保存の直前にポインタを own へピン(同期ブロック内)・直後に復元 ----
  var wrapped = false;
  function wrapSave(){
    var S = getS();
    if (!S || typeof S.save !== 'function') return false;
    if (S.__f525wrapped) { wrapped = true; return true; }
    var inner = S.save.bind(S);
    S.save = function(){
      if (off() || !own) return inner.apply(this, arguments);
      var ptr = readPtr();
      if (ptr === own) return inner.apply(this, arguments);
      // 別タブ(または外部)が切り替えた → このタブは自分のスロットへ保存する
      mismatches++;
      var restore = lsg(ACT);
      try {
        localStorage.setItem(ACT, JSON.stringify(own));   // ここから
        pinned++;
        log('pin', { own: own, ptr: ptr });
        try { console.warn(TAG, 'active slot moved by another tab (' + ptr + '); saving to own slot ' + own); } catch(e){}
        return inner.apply(this, arguments);
      } finally {
        try { if (restore != null) localStorage.setItem(ACT, restore); } catch(e){}   // ここまで(同期)
      }
    };
    try { for (var p in inner) { if (!(p in S.save)) { try { S.save[p] = inner[p]; } catch(e){} } } } catch(e){}
    S.__f525wrapped = true;
    wrapped = true;
    try { console.log(TAG, 'S.save wrapped (own=' + own + ')'); } catch(e){}
    return true;
  }

  // ---- boot ----
  function boot(){
    own = readPtr();
    (function poll(){
      poll._n = (poll._n || 0) + 1;
      if (wrapSave()) return;
      if (poll._n > 240) { try { console.warn(TAG, 'S.save not found; idle'); } catch(e){} return; }
      setTimeout(poll, 500);
    })();
  }

  window.__v292Dfix525 = {
    state: function(){ return { own: own, ptr: readPtr(), wrapped: wrapped, off: off(), pinned: pinned, pruned: pruned, mismatches: mismatches }; },
    dump: function(){ try { return JSON.parse(lsg(LOGK) || '[]'); } catch(e){ return []; } },
    count: function(){ try { return (JSON.parse(lsg(LOGK) || '[]') || []).length; } catch(e){ return 0; } },
    clear: function(){ try { localStorage.removeItem(LOGK); } catch(e){} },
    pruneAgainst: pruneAgainst,
    _setOwn: function(id){ own = id; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
