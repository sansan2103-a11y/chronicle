// =====================================================================
// Chronicle TRPG - v292Dfix516: 手動再生成したアイコンをローカル画像で表示固定
// ---------------------------------------------------------------------
// 真因(2026-07-20・fix515プローブ実機ログで確定):
//   登録キャラ(ミア)の「↻ アイコン再生成」は【正しく】新画像をローカル(IDB)へ保存し、
//   fix197.cachedFor(name)もその新画像を返す(=保存は成功)。しかし表示は fix400 の
//   サーバー配信URL(/img?ns&k=…)を最優先するため、サーバーにその画像が無い(404)と、
//   本来降りるべき「保存済みの新しいローカル画像」へ表示が切り替わらず、古い見た目のまま
//   残る=「再生成してもリロードで戻る」。つまり保存でなく【表示優先順位】のバグ。
//   ※fix400のサーバー優先は iOS の IDB 不安定対策。ローカルに実画像がある時はそちらが
//     正しい(=iOS でローカル欠損時のみサーバーに降りる、という優先が本来望ましい)。
//
// 方針(最小・追加のみ・既存不変・fail-open):
//   「ユーザーが手動で↻したキャラ」だけを対象に、そのキャラのアイコン表示を
//   ローカル画像優先へ切り替える。二段構え:
//   (A) fix400.urlFor(pk) を透過ラップ: 対象キャラの pk のときは '' を返す
//       → fix197 はサーバーURLを使わずローカル(cachedFor→IDB)へ降りる(=本来の設計の分岐)。
//   (B) 保険の再アサート: 対象キャラの <img> が(HTTPキャッシュ等で)サーバー画像/古い絵の
//       ままなら、fix197.cachedFor(name) の実データURLへ src を張り替える(fix437/fix487hと
//       同じ MutationObserver+周期sweep 方式)。キーのドリフト(同名で別キー)にも name 基準で追従。
//   対象集合は「↻クリックを捕捉した name」を localStorage に永続(リロードを跨いで有効)。
//   生成もネットワーク送信もしない(表示の張り替えのみ)。
//
// 有効化(opt-in・既定OFF): localStorage.v292Dfix516OnV1==='1' かつ v292Dfix516Off!=='1'。
// 検証口: window.__v292Dfix516 = { sweep, getSet, addSet, markedPks, forceLocal, log, status }
// 動作ログ(実機確認用・任意): localStorage['v292Dfix516log'](最大40件)。
// 撤去: index.htmlのscript1行削除で完全消滅(新規1ファイル・既存不変)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix516 && window.__v292Dfix516.__armed) return;
  var TAG = '[v292Dfix516:regen-local-display]';
  var SETKEY = 'v292Dfix516names';
  var LOGKEY = 'v292Dfix516log';

  function on(){
    try {
      if (localStorage.getItem('v292Dfix516Off') === '1') return false;
      return localStorage.getItem('v292Dfix516OnV1') === '1';
    } catch(e){ return false; }
  }
  if (!on()) { try { console.log(TAG, 'idle (set v292Dfix516OnV1=1 to arm)'); } catch(e){} return; }

  function f197(){ return window.__v292Dfix197 || window.__v292Dfix199 || null; }
  function norm(s){ return String(s == null ? '' : s).trim(); }
  function cachedFor(name){ try { var f = f197(); return (f && typeof f.cachedFor === 'function') ? (f.cachedFor(name) || '') : ''; } catch(e){ return ''; } }
  function keyFor(name){ try { var f = f197(); return (f && typeof f.keyFor === 'function') ? (f.keyFor(name) || '') : ''; } catch(e){ return ''; } }

  // ---- 対象集合(手動↻された name)。localStorage永続=リロードを跨いで有効 ----
  function getSet(){ try { var a = JSON.parse(localStorage.getItem(SETKEY) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function inSet(name){ var n = norm(name); if (!n) return false; return getSet().indexOf(n) >= 0; }
  function addSet(name){ try { var n = norm(name); if (!n) return; var a = getSet(); if (a.indexOf(n) < 0){ a.push(n); if (a.length > 200) a = a.slice(-200); localStorage.setItem(SETKEY, JSON.stringify(a)); } } catch(e){} }

  var logged = 0;
  function log(ev){ try { if (logged > 40) return; logged++; var a = []; try { a = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch(e){} if (!Array.isArray(a)) a = []; a.push(ev); if (a.length > 40) a = a.slice(-40); localStorage.setItem(LOGKEY, JSON.stringify(a)); } catch(e){} }

  // ---- 対象 name 群の現在の pk 集合(keyForはドリフトし得るので都度再計算) ----
  function markedPks(){
    var m = {};
    try { getSet().forEach(function(n){ var pk = keyFor(n); if (pk){ m[pk] = 1; m['v292av2_' + pk] = 1; } }); } catch(e){}
    return m;
  }

  // ---- (A) fix400.urlFor ラッパ: 対象pkはサーバURLを出さない('')=fix197がローカルへ降りる ----
  var wrapped400 = false;
  function wrap400(){
    try {
      if (wrapped400) return true;
      var f4 = window.__v292Dfix400;
      if (!f4 || typeof f4.urlFor !== 'function') return false;
      if (f4.urlFor.__f516) { wrapped400 = true; return true; }
      var orig = f4.urlFor.bind(f4);
      var w = function(pk){
        try {
          var key = String(pk || '');
          var m = markedPks();
          if (key && (m[key] || m['v292av2_' + key] || m[key.replace(/^v292av2_/, '')])) return '';   // 対象=サーバURLを出さない
        } catch(e){}
        return orig.apply(this, arguments);
      };
      w.__f516 = true;
      f4.urlFor = w;
      wrapped400 = true;
      try { console.log(TAG, 'fix400.urlFor wrapped (marked chars -> local)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- (B) 保険: 対象キャラの<img>をローカル実データURLへ張り替え(サーバ/古絵のまま防止) ----
  function forceLocal(img){
    try {
      if (!img || img.tagName !== 'IMG') return;
      var alt = norm(img.getAttribute('alt'));
      if (!alt || !inSet(alt)) return;
      var c = cachedFor(alt);
      if (c && c.indexOf('data:image') === 0){
        if (img.getAttribute('src') !== c){ img.setAttribute('data-f516', '1'); img.src = c; }
      }
    } catch(e){}
  }
  function sweep(){ try { var imgs = document.getElementsByTagName('img'); for (var i = 0; i < imgs.length; i++) forceLocal(imgs[i]); } catch(e){} }

  // ---- ↻クリック捕捉(受動・capture): name をマーク→新画像が届くまで数十秒pollしてsweep ----
  function onRegen(name){
    var n = norm(name); if (!n) return;
    addSet(n);
    log({ ev: 'regen-marked', name: n.slice(0, 24), t: (function(){ try { return Math.floor(performance.now()); } catch(e){ return 0; } })() });
    wrap400();
    var before = cachedFor(n), tries = 0;
    var itv = setInterval(function(){
      tries++;
      var cur = cachedFor(n);
      sweep();
      if ((cur && cur !== before && cur.indexOf('data:image') === 0) || tries > 60){ clearInterval(itv); sweep(); }
    }, 1000);
  }
  try {
    document.addEventListener('click', function(ev){
      try {
        var t = ev.target; if (!t || !t.closest) return;
        var probe = t.closest('button,[role="button"],a') || t;
        var txt = (probe.textContent || '') + ' ' + ((probe.getAttribute && (probe.getAttribute('title') || probe.getAttribute('aria-label'))) || '');
        if (txt.length > 40) return;
        if (!/再生成|↻|↺|⟳|🔄/.test(txt)) return;
        var card = t.closest('.npc-card') || t.closest('.v100-clean') || t.closest('[class*="card"]') || t.parentNode;
        var nm = '';
        var img = (card && card.querySelector) ? card.querySelector('img[alt]') : null;
        if (img) nm = (img.getAttribute('alt') || '').trim();
        if (!nm && card && card.querySelector){ var ni = card.querySelector('input[type="text"]'); if (ni) nm = (ni.value || '').trim(); }
        if (nm) onRegen(nm);
      } catch(e){}
    }, true);
  } catch(e){}

  // ---- 起動: fix400ラップを確保(遅延ロード対策で数回リトライ)+ sweep + 監視 ----
  function start(){
    try {
      wrap400();
      var wt = 0; var witv = setInterval(function(){ wt++; if (wrap400() || wt > 20) clearInterval(witv); }, 500);
      sweep();
      // 起動直後に対象がいれば一度ローカル確定を記録(実機確認用)
      try {
        var setNow = getSet();
        if (setNow.length){
          setTimeout(function(){
            var rep = setNow.slice(0, 5).map(function(n){ var c = cachedFor(n); return { name: n.slice(0,16), local: !!(c && c.indexOf('data:image') === 0), wrapped: wrapped400 }; });
            log({ ev: 'boot-check', marked: setNow.length, wrapped: wrapped400, rep: rep });
          }, 4000);
        }
      } catch(e){}
      var obs = new MutationObserver(function(muts){
        for (var i = 0; i < muts.length; i++){
          var m = muts[i];
          if (m.type === 'attributes' && m.target && m.target.nodeName === 'IMG'){ forceLocal(m.target); }
          else if (m.addedNodes && m.addedNodes.length){ sweep(); return; }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'alt'] });
      setInterval(sweep, 1000);
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.__v292Dfix516 = {
    __armed: true,
    sweep: sweep, getSet: getSet, addSet: addSet, markedPks: markedPks, forceLocal: forceLocal,
    log: function(){ try { return JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch(e){ return []; } },
    status: function(){ return { on: on(), wrapped400: wrapped400, marked: getSet() }; }
  };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
