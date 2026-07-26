/* v292Dfix573-hero-guard.js (2026-07-26) — 主人公が「無言で消える」のを見張る
 *
 * ■なぜ必要か（2026-07-26 実機で起きたこと）
 *   おしんの物語(澪)で **`cast.hero.name` が空文字列になっていた**（desc も0字・gender だけ残存）。
 *   その結果:
 *     ・設定画面の主人公欄が空になり
 *     ・本文の「澪」も「白石澪」も登録キャストに一致しなくなって**自動抽出**へ落ち
 *     ・**「澪」と「白石澪」の2件に分裂**した
 *   気づいたのは**おしんが画面を見て違和感を持ったから**で、システムは何も言わなかった。
 *   **いつ・なぜ空になったのかは、記録が無いので特定できなかった。**
 *
 * ■このfixがやること
 *   ①`chr6` / `chr6_slot_*` への書込の境界で、**主人公の名前が「あった → 無くなった」瞬間を捕まえる**
 *   ②その瞬間に **旧値の控えを取る**（`chr6_bk_fix573_hero_<ident>_<ts>`）
 *   ③警告ログ＋トーストで**その場で知らせる**（無言にしない）
 *   ④記録を残す（`v292Dfix573_log`・上限20件）
 *   ⑤起動時に「いま空なら」警告し、**控えから復元候補を提示**する（`candidates()`）
 *
 * ■このfixがやらないこと
 *   **書込を止めない・値を書き換えない・自動で復元しない。**
 *   挙動は変えず、観測できるようにする（このプロジェクトで繰り返し有効だった型）。
 *   自動復元は「どの控えが正しいか」を機械が決めることになるので、人が選ぶ。
 *
 * OFF   = localStorage['v292Dfix573Off'] = '1'
 * 読出  = window.__v292Dfix573.stats() / .log() / .candidates() / .check()
 */
(function v292Dfix573(){
  if (window.__v292Dfix573 && window.__v292Dfix573.__armed) return;
  var TAG = '[v292Dfix573:hero-guard]';
  var LOGK = 'v292Dfix573_log', BKPRE = 'chr6_bk_fix573_hero_';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix573Off') === '1'; }
  function keys(){ try { return Object.keys(localStorage); } catch(e){ return []; } }
  function isStoryKey(k){ return k === 'chr6' || (typeof k === 'string' && k.indexOf('chr6_slot_') === 0); }

  var stats = { checked:0, losses:0, backups:0, backupFailures:0, lastLoss:null, emptyAtBoot:null };

  /* 主人公の名前を取り出す。形が違っても落ちないようにする */
  function heroNameOf(raw){
    try {
      var o = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      var h = o && o.cast && o.cast.hero;
      if (!h) return null;                       /* 入れ物ごと無い＝別の話。ここでは扱わない */
      return typeof h.name === 'string' ? h.name : '';
    } catch(e){ return null; }
  }
  function heroDescLen(raw){
    try { var o=(typeof raw==='string')?JSON.parse(raw):raw; var h=o&&o.cast&&o.cast.hero;
      return h && typeof h.desc === 'string' ? h.desc.length : 0; } catch(e){ return 0; }
  }

  function note(rec){
    try {
      var a = []; try { a = JSON.parse(lsg(LOGK) || '[]'); } catch(e){}
      if (!Array.isArray(a)) a = [];
      a.push(rec); if (a.length > 20) a = a.slice(-20);
      localStorage.setItem(LOGK, JSON.stringify(a));
    } catch(e){}   /* 容量が無くて記録できなくても、本処理は止めない */
  }

  function toast(msg){
    try {
      var d = document.getElementById('v573toast');
      if (d) d.remove();
      d = document.createElement('div');
      d.id = 'v573toast';
      d.textContent = msg;
      d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:99999;'
        + 'background:#7f1d1d;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;'
        + 'max-width:90vw;box-shadow:0 4px 16px rgba(0,0,0,.4);line-height:1.5;';
      document.body.appendChild(d);
      setTimeout(function(){ try { if (d.parentNode) d.remove(); } catch(e){} }, 15000);
    } catch(e){}
  }

  /* 主人公が消える書込を見つけたら、消える前の値を控える */
  function backupOld(key, oldRaw){
    try {
      var ident = (key === 'chr6') ? 'chr6' : key.slice(10);
      var bk = BKPRE + ident + '_' + Date.now();
      localStorage.setItem(bk, oldRaw);
      if (lsg(bk) == null){ stats.backupFailures++; return null; }   /* 読み戻して確認 */
      stats.backups++;
      /* 同じ物語の控えは3件まで（古い順に落とす） */
      var mine = keys().filter(function(k){ return k.indexOf(BKPRE + ident + '_') === 0; }).sort();
      while (mine.length > 3){ var old = mine.shift(); try { localStorage.removeItem(old); } catch(e){} }
      return bk;
    } catch(e){ stats.backupFailures++; return null; }
  }

  /* ---- setItem 境界の見張り（書込は必ず通す） ---------------------------- */
  function wrapSetItem(){
    try {
      var prev = localStorage.setItem;
      if (!prev || prev.__f573) return;
      var wrapped = function(k, v){
        try {
          if (!off() && isStoryKey(k)){
            stats.checked++;
            var oldRaw = lsg(k);
            if (oldRaw != null){
              var oldName = heroNameOf(oldRaw);
              var newName = heroNameOf(v);
              /* 「名前があった → 空になった」だけを拾う。
                 入れ物ごと無い(null)や、元から空だった場合は対象外（誤検知を作らない）。 */
              if (oldName && newName === ''){
                stats.losses++;
                var bk = backupOld(k, oldRaw);
                var rec = { at: Date.now(), key: String(k).slice(0,40), lostName: oldName,
                            lostDescLen: heroDescLen(oldRaw), backup: bk, stack: '' };
                try { throw new Error('s'); } catch(e){
                  rec.stack = String(e && e.stack || '').split('\n').slice(1,5).join(' | ').slice(0,300);
                }
                stats.lastLoss = rec;
                note(rec);
                try { console.warn(TAG, '★主人公の名前が消える書込を検知:', oldName,
                      '控え=' + (bk || '取れず'), rec.stack); } catch(e){}
                toast('主人公「' + oldName + '」の名前が消えました。書込前の控えを取りました。'
                      + '設定画面で「保存してゲーム開始」を押す前に確認してください。');
              }
            }
          }
        } catch(e){}
        return prev.apply(localStorage, arguments);   /* ★書込は必ず通す */
      };
      /* ★fix419cの教訓: 内側関数の own props を全継承する（他fixのフラグを消さない） */
      try { for (var p in prev){ if (Object.prototype.hasOwnProperty.call(prev, p)){ try { wrapped[p] = prev[p]; } catch(e){} } } } catch(e){}
      wrapped.__f573 = true;
      localStorage.setItem = wrapped;
    } catch(e){}
  }

  /* ---- 復元候補を控えから探す（読み取り専用） --------------------------- */
  function candidates(slotKey){
    var key = slotKey || activeStoryKey();
    var out = [];
    keys().forEach(function(k){
      if (k.indexOf('chr6_bk_') !== 0 && k.indexOf('chr6_snapd_') !== 0) return;
      var raw = lsg(k); if (raw == null) return;
      var picks = [];
      try {
        var o = JSON.parse(raw);
        if (o && o.cast) picks.push(o);
        if (o && o.blob){ try { var b = JSON.parse(o.blob); if (b && b.cast) picks.push(b); } catch(e){} }
        if (o && o.ls){ Object.keys(o.ls).forEach(function(x){
          if (x === key){ try { var v = JSON.parse(o.ls[x]); if (v && v.cast) picks.push(v); } catch(e){} } }); }
      } catch(e){ return; }
      for (var i = 0; i < picks.length; i++){
        var h = picks[i].cast && picks[i].cast.hero;
        if (h && h.name){
          out.push({ from: k, name: h.name, descLen: (h.desc || '').length,
                     turns: (picks[i].turns || []).length });
          break;
        }
      }
    });
    /* ターン数が多い＝新しい可能性が高い順 */
    out.sort(function(a, b){ return b.turns - a.turns; });
    return out;
  }
  function activeStoryKey(){
    try { if (typeof window.__chr6Key === 'function') return window.__chr6Key(); } catch(e){}
    try { var a = JSON.parse(lsg('chr6_active_slot') || 'null');
      return (a && a !== 'default') ? ('chr6_slot_' + a) : 'chr6'; } catch(e){ return 'chr6'; }
  }

  /* ---- 起動時の点検 ------------------------------------------------------ */
  function check(){
    var key = activeStoryKey();
    var raw = lsg(key);
    var name = raw == null ? null : heroNameOf(raw);
    stats.emptyAtBoot = (name === '');
    if (name === ''){
      var c = candidates(key);
      try { console.warn(TAG, '★いま主人公の名前が空です。復元候補=' + c.length + '件', c.slice(0,3)); } catch(e){}
      if (c.length){
        toast('主人公の名前が空になっています。控えに「' + c[0].name + '」が残っています。'
              + '設定画面で「保存してゲーム開始」を押すと空のまま確定するので注意してください。');
      }
    }
    return { key: key, heroName: name, empty: (name === ''), candidates: (name === '') ? candidates(key) : [] };
  }

  wrapSetItem();
  try { setTimeout(wrapSetItem, 800); setTimeout(wrapSetItem, 3000); } catch(e){}   /* 他fixが包み直した後にも掛け直す */
  try { setTimeout(check, 5000); } catch(e){}

  window.__v292Dfix573 = {
    __armed: true, off: off,
    stats: function(){ var o = {}; Object.keys(stats).forEach(function(k){ o[k] = stats[k]; }); return o; },
    log: function(){ try { return JSON.parse(lsg(LOGK) || '[]'); } catch(e){ return []; } },
    clearLog: function(){ try { localStorage.removeItem(LOGK); } catch(e){} },
    candidates: candidates, check: check, activeStoryKey: activeStoryKey,
    _heroNameOf: heroNameOf, _wrap: wrapSetItem
  };
  try { if (!off()) console.log(TAG, 'armed (読み取り＋控えのみ。書込は止めない)'); } catch(e){}
})();
