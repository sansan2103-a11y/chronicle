// =====================================================================
// Chronicle TRPG - v292Dfix516b: 手動再生成したアイコンをローカル画像で表示固定
// ---------------------------------------------------------------------
// 真因(2026-07-20・fix515プローブ実機ログで確定):
//   登録キャラ(ミア)の「↻ アイコン再生成」は【正しく】新画像をローカル(IDB)へ保存し、
//   fix197.cachedFor(name)もその新画像を返す(=保存は成功)。しかし表示は fix400 の
//   サーバー配信URL(/img?ns&k=…)を最優先するため、サーバーにその画像が無い(404)と、
//   本来降りるべき「保存済みの新しいローカル画像」へ表示が切り替わらず、古い見た目のまま
//   残る=「再生成してもリロードで戻る」。つまり保存でなく【表示優先順位】のバグ。
//
// ── GPT監査(NO-GO・2件の重大)を反映した fix516b の設計 ───────────────
//   【重大1】旧版は「name」を保存し markedPks() が毎回 keyFor(name) で pk へ再変換していた。
//     fix493(スロット別キー)有効時に別セーブへ切替えると、同名の別キャラまでマーク対象に
//     なり得た。→ 対策: ↻クリック時点の keyFor(name)=確定pk を凍結保存し、照合は【pk一致のみ】。
//     レンダ時に name から pk を再導出しない(別スロットの同名は pk が異なるので巻き込まない)。
//   【重大2】旧版の urlFor ラッパは対象pkなら【無条件】に ''(サーバURL抑止)を返していた。
//     ローカル画像が消失/IDB未読/容量整理された場合、fix197 はローカルも無くサーバURLも無い→
//     空src/壊れ画像になる縦穴。→ 対策: '' を返すのは、その pk に対応する有効な data:image が
//     【現在取得できる場合だけ】。ローカル不在時は必ず元の urlFor(pk) を返す(=サーバへ降りる)。
//     最悪でも「元の挙動(サーバ表示)」に戻るだけで、壊れ画像は出さない(fail-open)。
//
// 二段構え(いずれも「有効なローカル data:image がある時のみ」作用):
//   (A) fix400.urlFor(pk) 透過ラップ: 凍結pk一致 かつ ローカル有 → '' を返す
//       → fix197 がサーバURLを使わずローカル(cachedFor→IDB)へ降りる。ローカル無 → 元URL。
//   (B) 保険の再アサート: 対象imgが古絵/サーバ画像のままなら cachedFor(name) の実データURLへ
//       張り替え(fix437/fix487hと同じ MutationObserver+周期sweep)。pkゲート付き=別スロット非干渉。
//
// 対象集合(凍結): localStorage['v292Dfix516pks'] = [{pk, name}] を永続(リロード跨ぎ有効)。
//   name は「そのpkのローカル有無確認(cachedFor)」専用。照合キーは常に pk。
//   旧 'v292Dfix516names' があれば一度だけ pk へ移行(現スロットの keyFor で確定→凍結)。
// 有効化(opt-in・既定OFF): localStorage.v292Dfix516OnV1==='1' かつ v292Dfix516Off!=='1'。
// 検証口: window.__v292Dfix516 = { sweep, getSet, addPk, markedPks, forceLocal, seedName, log, status }
// 撤去: index.htmlのscript1行削除で完全消滅(新規1ファイル・既存不変)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix516 && window.__v292Dfix516.__armed) return;
  var TAG = '[v292Dfix516b:regen-local-display]';
  var PKKEY = 'v292Dfix516pks';       // 凍結: [{pk,name}]
  var OLDNAMEKEY = 'v292Dfix516names';// 旧版(移行元)
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
  function bare(pk){ return String(pk == null ? '' : pk).replace(/^v292av2_/, ''); }
  function cachedFor(name){ try { var f = f197(); return (f && typeof f.cachedFor === 'function') ? (f.cachedFor(name) || '') : ''; } catch(e){ return ''; } }
  function keyFor(name){ try { var f = f197(); return (f && typeof f.keyFor === 'function') ? (f.keyFor(name) || '') : ''; } catch(e){ return ''; } }
  function isData(s){ return !!(s && s.indexOf('data:image') === 0); }

  // ---- 凍結対象集合 [{pk,name}]。pk は ↻時点の keyFor で確定=以後 name から再導出しない ----
  function getEntries(){
    try { var a = JSON.parse(localStorage.getItem(PKKEY) || '[]'); return Array.isArray(a) ? a.filter(function(e){ return e && e.pk; }) : []; }
    catch(e){ return []; }
  }
  function saveEntries(a){ try { if (a.length > 200) a = a.slice(-200); localStorage.setItem(PKKEY, JSON.stringify(a)); } catch(e){} }
  function hasPk(pk){ var b = bare(pk); if (!b) return false; var a = getEntries(); for (var i=0;i<a.length;i++){ if (bare(a[i].pk) === b) return true; } return false; }
  function entryByPk(pk){ var b = bare(pk); if (!b) return null; var a = getEntries(); for (var i=0;i<a.length;i++){ if (bare(a[i].pk) === b) return a[i]; } return null; }
  function addPk(pk, name){
    try {
      var b = bare(pk); if (!b) return;
      var a = getEntries();
      for (var i=0;i<a.length;i++){ if (bare(a[i].pk) === b){ if (name) a[i].name = norm(name); saveEntries(a); return; } }
      a.push({ pk: b, name: norm(name) }); saveEntries(a);
    } catch(e){}
  }
  // name→(現スロットの)pk を凍結保存。↻捕捉や手動seed用。
  function seedName(name){ var n = norm(name); if (!n) return ''; var pk = keyFor(n); if (pk){ addPk(pk, n); } return pk; }

  // 旧 name マーカーの一度きり移行(現スロットの keyFor で pk 確定→凍結)。以後は参照しない。
  (function migrate(){
    try {
      if (getEntries().length) { try { localStorage.removeItem(OLDNAMEKEY); } catch(e){} return; }
      var old = [];
      try { old = JSON.parse(localStorage.getItem(OLDNAMEKEY) || '[]'); } catch(e){}
      if (Array.isArray(old) && old.length){
        old.forEach(function(n){ var nn = norm(n); if (nn){ var pk = keyFor(nn); if (pk) addPk(pk, nn); } });
        try { localStorage.removeItem(OLDNAMEKEY); } catch(e){}
        log({ ev: 'migrated', from: old.length, to: getEntries().length });
      }
    } catch(e){}
  })();

  var logged = 0;
  function log(ev){ try { if (logged > 40) return; logged++; var a = []; try { a = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch(e){} if (!Array.isArray(a)) a = []; a.push(ev); if (a.length > 40) a = a.slice(-40); localStorage.setItem(LOGKEY, JSON.stringify(a)); } catch(e){} }

  // 照合用 pk マップ(凍結pkのみ。name→pk 再導出はしない=重大1対策)
  function markedPks(){
    var m = {};
    try { getEntries().forEach(function(e){ var b = bare(e.pk); if (b){ m[b] = 1; m['v292av2_' + b] = 1; } }); } catch(e){}
    return m;
  }

  // ---- (A) fix400.urlFor ラッパ: 凍結pk一致 かつ ローカル有 のときだけ ''(=fix197がローカルへ) ----
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
          var e = entryByPk(pk);                       // 照合はpkのみ(重大1対策)
          if (e){
            var c = cachedFor(e.name);                 // そのpkに対応する現行ローカルデータ
            if (isData(c)) return '';                  // ローカル有→サーバURL抑止
            // ローカル無→元URL(サーバへ降りる)=壊れ画像を出さない(重大2対策)
          }
        } catch(err){}
        return orig.apply(this, arguments);
      };
      w.__f516 = true;
      f4.urlFor = w;
      wrapped400 = true;
      try { console.log(TAG, 'fix400.urlFor wrapped (marked+local-present -> local; else server)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- (B) 保険: 対象キャラの<img>をローカル実データURLへ張り替え(pkゲート付き=別スロット非干渉) ----
  function forceLocal(img){
    try {
      if (!img || img.tagName !== 'IMG') return;
      var alt = norm(img.getAttribute('alt'));
      if (!alt) return;
      var pk = keyFor(alt);                            // 現スロットのpk
      if (!pk || !hasPk(pk)) return;                   // 凍結pkに一致する時だけ(別スロット同名は不一致)
      var c = cachedFor(alt);
      if (isData(c)){                                   // ローカル有の時だけ張替(無ければ何もしない)
        if (img.getAttribute('src') !== c){ img.setAttribute('data-f516', '1'); img.src = c; }
      }
    } catch(e){}
  }
  function sweep(){ try { var imgs = document.getElementsByTagName('img'); for (var i = 0; i < imgs.length; i++) forceLocal(imgs[i]); } catch(e){} }

  // ---- ↻クリック捕捉(受動・capture): 現スロットのpkを凍結→新画像が届くまでpollしてsweep ----
  function onRegen(name){
    var n = norm(name); if (!n) return;
    var pk = seedName(n);
    log({ ev: 'regen-marked', name: n.slice(0, 24), pk: bare(pk), t: (function(){ try { return Math.floor(performance.now()); } catch(e){ return 0; } })() });
    wrap400();
    var before = cachedFor(n), tries = 0;
    var itv = setInterval(function(){
      tries++;
      var cur = cachedFor(n);
      sweep();
      if ((cur && cur !== before && isData(cur)) || tries > 60){ clearInterval(itv); sweep(); }
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
      try {
        var ents = getEntries();
        if (ents.length){
          setTimeout(function(){
            var rep = ents.slice(0, 5).map(function(e){ var c = cachedFor(e.name); return { name: (e.name||'').slice(0,16), pk: bare(e.pk), local: isData(c), wrapped: wrapped400 }; });
            log({ ev: 'boot-check', marked: ents.length, wrapped: wrapped400, rep: rep });
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
    sweep: sweep, getSet: getEntries, getEntries: getEntries, addPk: addPk, seedName: seedName,
    markedPks: markedPks, forceLocal: forceLocal,
    log: function(){ try { return JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch(e){ return []; } },
    status: function(){ return { on: on(), wrapped400: wrapped400, marked: getEntries() }; }
  };
  try { console.log(TAG, 'armed (b)'); } catch(e){}
})();
