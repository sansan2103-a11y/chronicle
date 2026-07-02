// =====================================================================
// Chronicle TRPG - v292Dfix351: 設定の下書き保持(draft-commit)＋おまかせ堅牢化
// 真因(2026-07-02実機診断): 設定フォームの入力は「保存してゲーム開始」まで S に
//   同期されない片方向設計。①「閉じる」でfix149 cleanEmptyが"名無し"NPCを
//   S.castから間引く(名前はDOMにしか無い) ②再オープンでSから再構築 →
//   おまかせ結果・手入力が全消え=「おまかせでも入力されない」に見える。
//   さらにおまかせのfillは固定タイマー(モーダルDOM構築は実測~1秒)で
//   低速環境では空振りの余地。
// 対策(おしん承認済み・閉じる=下書き保持に仕様変更):
//   A) 設定内の入力をデバウンスでS.cast/S.sceneへ同期＋S.save()(下書き保持)
//   B) 閉じる操作(閉じる/✕/Esc)をcaptureで検知し即コミット
//   C) __v334Omakase をラップ: 設定が閉じていたら先に開いて cfgHName の
//      出現を待ってから本体を呼ぶ(fix335本体は不触・fix340のskip-open分岐が
//      即時fillしてくれる)＋fill完了を見届けてコミット
// DOM→Sマッピング(index.html保存ハンドラと同一):
//   cfgHName→S.cast.hero.name / cfgHDesc→S.cast.hero.desc
//   cfgLore→S.scene.lore / cfgLoc→S.scene.loc / cfgObj→S.scene.obj / cfgTone→S.scene.tone
//   NPCカード[data-f]→S.cast.npcs[i].{name,desc,personality,coreDesire,coreFear,wound}
//   性別radio(v108g_hero/v108g_npcN)はv108が変更時に直接Sへ書くが、
//   再構築レース保険としてcommit時にもchecked値を反映。
// 注意: カードが0枚の時はS.cast.npcsに触らない(モーダル未構築時の誤全消し防止)。
//   cleanEmpty(名無し間引き)は温存=空カードはこれまで通り掃除される。
// OFF: localStorage v292Dfix351Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix351) return; window.__v292Dfix351 = true;
  var TAG = '[v292Dfix351:draft]';
  function off(){ try{ return localStorage.getItem('v292Dfix351Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ if (window.S) return window.S; return (0,eval)('S'); }catch(e){ return null; } }
  function ovOpen(){
    var ov = document.getElementById('settingsOv');
    if (!ov) return false;
    return ov.classList.contains('open') || ov.offsetParent !== null;
  }
  function val(id){ var e = document.getElementById(id); return e ? String(e.value||'') : null; }

  // ---------- A/B: DOM→S コミット ----------
  function commitDraft(reason){
    if (off()) return false;
    var S = getS(); if (!S || !S.cast) return false;
    if (!document.getElementById('cfgHName')) return false; // モーダル未構築なら何もしない
    try {
      S.cast.hero = S.cast.hero || {};
      var hn = val('cfgHName'); if (hn != null) S.cast.hero.name = hn.trim();
      var hd = val('cfgHDesc'); if (hd != null) S.cast.hero.desc = hd.trim();
      S.scene = S.scene || {};
      var v;
      v = val('cfgLore'); if (v != null) S.scene.lore = v.trim();
      v = val('cfgLoc');  if (v != null) S.scene.loc  = v.trim();
      v = val('cfgObj');  if (v != null) S.scene.obj  = v.trim();
      v = val('cfgTone'); if (v != null) S.scene.tone = v.trim();
      // 性別(v108は変更時に自前でSへ書くが、再構築レース保険で反映)
      var hg = document.querySelector('input[name="v108g_hero"]:checked');
      if (hg && hg.value) S.cast.hero.gender = hg.value;
      // NPCカード→S.cast.npcs(既存フィールドは温存マージ・カード0枚なら不触)
      var cards = document.querySelectorAll('#npcList .npc-card');
      if (cards.length) {
        var list = [];
        Array.prototype.forEach.call(cards, function(card, i){
          var prev = (S.cast.npcs && S.cast.npcs[i]) || {};
          var o = {}; for (var k in prev) { if (Object.prototype.hasOwnProperty.call(prev,k)) o[k] = prev[k]; }
          ['name','desc','personality','coreDesire','coreFear','wound'].forEach(function(fld){
            var e = card.querySelector('[data-f="'+fld+'"]');
            if (e) o[fld] = String(e.value||'').trim();
          });
          var g = card.querySelector('input[type="radio"][name^="v108g_npc"]:checked');
          if (g && g.value) o.gender = g.value;
          list.push(o);
        });
        S.cast.npcs = list;
      }
      if (typeof S.save === 'function') S.save();
      try{ console.log(TAG, 'committed('+reason+') hero="'+(S.cast.hero.name||'')+'" npcs='+((S.cast.npcs||[]).length)); }catch(_){}
      return true;
    } catch(e){ try{ console.warn(TAG, 'commit failed', e); }catch(_){}; return false; }
  }
  window.__v292Dfix351commit = commitDraft;

  // A) 設定内の入力をデバウンスでコミット(手入力・おまかせのinputイベント両方を拾う)
  var debTimer = null;
  document.addEventListener('input', function(ev){
    if (off()) return;
    try {
      var ov = document.getElementById('settingsOv');
      if (!ov || !ov.contains(ev.target)) return;
      if (debTimer) clearTimeout(debTimer);
      debTimer = setTimeout(function(){ debTimer = null; commitDraft('input'); }, 800);
    } catch(_){}
  }, true);

  // B) 閉じる操作をcaptureで検知して即コミット(fix149 cleanEmptyより先に走る)
  document.addEventListener('click', function(ev){
    if (off()) return;
    try {
      if (!ovOpen()) return;
      var b = ev.target && ev.target.closest ? ev.target.closest('button, .mpanel-close, [data-close]') : null;
      if (!b) return;
      var t = (b.textContent||'').trim();
      if (t === '閉じる' || t === '×' || t === '✕' || t === '✖' || b.classList.contains('mpanel-close')) {
        if (debTimer) { clearTimeout(debTimer); debTimer = null; }
        commitDraft('close');
      }
    } catch(_){}
  }, true);
  document.addEventListener('keydown', function(ev){
    if (off()) return;
    try {
      if (ev.key === 'Escape' && ovOpen()) {
        if (debTimer) { clearTimeout(debTimer); debTimer = null; }
        commitDraft('esc');
      }
    } catch(_){}
  }, true);

  // C) おまかせラッパ: モーダル出現を待ってから本体(fix335)を呼ぶ+完了後コミット
  function wrapOmakase(){
    var orig = window.__v334Omakase;
    if (typeof orig !== 'function' || orig._f351wrapped) return !!(orig && orig._f351wrapped);
    var wrapped = function(){
      if (off()) return orig.apply(this, arguments);
      var self = this, args = arguments;
      var run = function(){
        var r;
        try { r = orig.apply(self, args); } catch(e){ try{ console.warn(TAG,'omakase error',e); }catch(_){}; return; }
        // fill完了(cfgHNameが埋まる)を最長12s見届けてコミット
        var t0 = Date.now();
        (function watch(){
          var e = document.getElementById('cfgHName');
          if (e && e.value && e.value.trim()) { commitDraft('omakase'); return; }
          if (Date.now() - t0 > 12000) return;
          setTimeout(watch, 300);
        })();
        return r;
      };
      if (ovOpen() && document.getElementById('cfgHName')) return run();
      // 設定が閉じている: 先に開いてDOM出現を待つ(実測~1秒・上限10s)
      try { if (window.UI && UI.openSettings) UI.openSettings(); } catch(_){}
      var t0 = Date.now();
      (function poll(){
        if (document.getElementById('cfgHName')) { setTimeout(run, 120); return; }
        if (Date.now() - t0 > 10000) { run(); return; } // 諦めて原挙動(従来と同じ)
        setTimeout(poll, 200);
      })();
    };
    wrapped._f351wrapped = true;
    window.__v334Omakase = wrapped;
    return true;
  }
  // fix335のロード順に依存しない(後着でも拾う)
  if (!wrapOmakase()) {
    var tries = 0;
    var iv = setInterval(function(){ if (wrapOmakase() || ++tries > 40) clearInterval(iv); }, 500);
  }

  try{ console.log(TAG, 'loaded (draft-commit on input/close/omakase)', off()?'OFF':'ON'); }catch(_){}
})();
