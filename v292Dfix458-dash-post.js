// =====================================================================
// Chronicle TRPG - v292Dfix458: ダッシュ「——」の後処理（生成後に整える最後の砦）
// ---------------------------------------------------------------------
// ★経緯（実測ベース）:
//   ・fix454 で sys に独立ブロック【ダッシュ】を足した → 8.5 → 4.5回/千字（不十分）
//   ・fix457c で **sysの見本(few-shot)からダッシュを一掃** → 新スロットの序盤で 2.5回/千字
//     ところが **ターンが進むと 4.1回/千字 に戻る**。
//     真因: モデルは「自分が直前に書いた本文」も見て真似る（自己強化）。
//           一度ダッシュを書くと、以後それが手本になり増えていく。
//   → **生成された本文そのものを整える**（＝手本を汚さない）のが最後の砦。
//
// 変換ルール（意味を壊さない範囲）:
//   ・1ターンに **1回目のダッシュは残す**（表現として有効なので全滅させない）
//   ・2回目以降を置換:
//       - 行末 / 「」の閉じ直前（＝言いよどみ・中断） → 「……」
//       - それ以外（文中の切断）                     → 「、」
//   ・処理は **新しく生成されたターンだけ**。過去の物語は書き換えない。
//   ・_convSays[].say（会話ログのセリフ）にも同じ処理をする。
//
// 安全策: 初回書き換え前にアクティブslotを chr6_bk_fix458_* へ退避。
//         ターンごとに t.__f458=1 を立てて冪等。
// 冪等: window.__v292Dfix458   /   OFF: localStorage.v292Dfix458Off='1'
// 検証口: window.__v292Dfix458.clean('文——文') / .stats()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix458 && window.__v292Dfix458.__armed) return;
  var TAG = '[v292Dfix458:dash-post]';
  var stats = { turns: 0, replaced: 0 };
  var backedUp = false;

  function off(){ try { return localStorage.getItem('v292Dfix458Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }

  // 1つの文字列を整える（keep = 残してよいダッシュの数）
  function cleanStr(s, state){
    if (typeof s !== 'string' || s.indexOf('——') < 0) return s;
    var out = '';
    var i = 0;
    while (i < s.length){
      if (s.charAt(i) === '—' && s.charAt(i + 1) === '—'){
        // 連続する — をすべて食う（———— のような重ねにも対応）
        var j = i;
        while (j < s.length && s.charAt(j) === '—') j++;
        state.seen++;
        if (state.seen <= state.keep){
          out += '——';                                  // 1回目は残す
        } else {
          var nx = s.charAt(j);
          if (nx === '' || nx === '\n' || nx === '」' || nx === '』' || nx === '"'){
            out += '……';                                // 中断・言いよどみ
          } else {
            out += '、';                                 // 文中の切断
          }
          state.replaced++;
        }
        i = j;
      } else {
        out += s.charAt(i); i++;
      }
    }
    return out;
  }

  function clean(text){
    var st = { seen: 0, keep: 1, replaced: 0 };
    return cleanStr(String(text || ''), st);
  }

  function backupOnce(){
    if (backedUp) return true;   // fix495(C2): 成功時のみtrue/backedUp化(fail-closed用)
    try {
      // fix495(C2): activeが未設定/defaultの実体は'chr6'キー(従来はchr6_slot_defaultを読んで
      // 空振り=defaultスロットでは控えゼロのまま本文書換していた)。控えは新しい順2件にtrim。
      var slot = JSON.parse(localStorage.getItem('chr6_active_slot') || '""');
      var key = (slot && slot !== 'default') ? ('chr6_slot_' + slot) : 'chr6';
      var tag = (slot && slot !== 'default') ? slot : 'default';
      var blob = localStorage.getItem(key);
      if (blob) localStorage.setItem('chr6_bk_fix458_' + tag + '_' + Date.now(), blob);
      backedUp = true;
      try {
        var bks = [];
        for (var bi = 0; bi < localStorage.length; bi++){
          var bk = localStorage.key(bi);
          if (bk && bk.indexOf('chr6_bk_fix458_' + tag + '_') === 0 && /_\d+$/.test(bk)) bks.push(bk);
        }
        bks.sort(function(a,b){ return (+a.split('_').pop()||0) - (+b.split('_').pop()||0); });
        while (bks.length > 2) { var oldk = bks.shift(); try { localStorage.removeItem(oldk); } catch(e){} }
      } catch(e){}
    } catch(e){ return false; }
    return backedUp;
  }

  function narrText(t){
    var n = t && t.narrative;
    if (typeof n === 'string') return n;
    return null;
  }

  function processTurn(t){
    if (!t || t.__f458) return 0;
    var st = { seen: 0, keep: 1, replaced: 0 };
    var changed = 0;

    var n = t.narrative;
    if (typeof n === 'string'){
      var v = cleanStr(n, st);
      if (v !== n){ if (!backupOnce()){ return 0; } t.narrative = v; changed = 1; }   // fix495(C2): 控え不能なら書換中止(fail-closed)
    } else if (n && typeof n === 'object'){
      ['text', 'body', 'content'].forEach(function(k){
        if (typeof n[k] === 'string'){
          var v2 = cleanStr(n[k], st);
          if (v2 !== n[k]){ if (!backupOnce()) return; n[k] = v2; changed = 1; }   // fix495(C2)
        }
      });
    }
    if (Array.isArray(t._convSays)){
      for (var i = 0; i < t._convSays.length; i++){
        var c = t._convSays[i];
        if (c && typeof c.say === 'string'){
          var v3 = cleanStr(c.say, st);
          if (v3 !== c.say){ if (!backupOnce()) break; c.say = v3; changed = 1; }   // fix495(C2)
        }
      }
    }
    try { Object.defineProperty(t, '__f458', { value: 1, enumerable: false, configurable: true }); } catch(e){ t.__f458 = 1; }
    if (changed){ stats.replaced += st.replaced; }   // fix495(C2): 控えは書換前に取得済み
    stats.turns++;
    return st.replaced;
  }

  // 起動時に存在したターンは「過去の物語」として触らない（印だけ付ける）
  var sealed = false;
  function seal(){
    if (sealed) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns)) return;
    for (var i = 0; i < S.turns.length; i++){
      var t = S.turns[i];
      if (!t) continue;
      try { Object.defineProperty(t, '__f458', { value: 1, enumerable: false, configurable: true }); } catch(e){ t.__f458 = 1; }
    }
    sealed = true;
  }

  function run(){
    if (off()) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    if (!sealed){ seal(); return; }              // 初回＝既存ターンを封印して終わり
    var last = S.turns[S.turns.length - 1];
    var n = processTurn(last);
    if (n) { try { console.log(TAG, 'replaced', n, 'dash(es) in the new turn'); } catch(e){} }
  }

  function install(){
    try {
      var UI = (0,eval)('typeof UI!=="undefined"?UI:null');
      if (UI && Array.isArray(UI._renderHooks)) UI._renderHooks.push(function v292Dfix458Hook(){ try { run(); } catch(e){} });
    } catch(e){}
    try { setInterval(function(){ try { run(); } catch(e){} }, 4000); } catch(e){}
    setTimeout(function(){ try { seal(); } catch(e){} }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  window.__v292Dfix458 = { __armed: true, clean: clean, run: run, stats: function(){ return stats; }, isOff: off };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
