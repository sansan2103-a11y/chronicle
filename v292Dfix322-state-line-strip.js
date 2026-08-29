// =====================================================================
// Chronicle TRPG - v292Dfix322: 内部スキーマ/整形アーティファクトの本文混入を除去
//   症状(おしん報告・2026-06-24): 「展開の描写」に内部のキャラ状態＋アシスタント作業報告＋
//     markdown(**)が漏れる。
//   真因: 本来モデルは状態を <state .../> タグで本文後に出力し parse時除去される設計だが、
//     DS V4 Flash 等が稀にタグに包まず【生の key=“value” 行】や、アシスタント口調の作業報告、
//     markdown強調を plan.narrative に出力→<state>タグ専用ストリッパをすり抜けて本文に残る。
//   設計(コア不触):
//     (1) Planner.parsePlan をラップし、plan.narrative から ①末尾のメタ報告ブロック ②生の状態行
//         ③markdown強調(**,__,#) を除去(今後のターン)。<say>等の正規タグは不触。
//     (2) 既存の汚染ターンは fix320型ガード(S.scene.loc==アクティブslot blob.loc)付きの一度きり
//         移行(物語ごと1回)で S.turns を掃除して再保存＋再描画。
//   OFF: localStorage v292Dfix322Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix322) return; window.__v292Dfix322 = true;
  var TAG = '[v292Dfix322:stateleak]';
  function off(){ try { return localStorage.getItem('v292Dfix322Off') === '1'; } catch(e){ return false; } }

  // 生の状態行(6スキーマ語=引用符・全引用符対応)。地の文に「ラベル=引用符」は出ない安全判別子。
  var STATE = /(?:からだ|こころ|本能|傷|関係|未解決)\s*=\s*[”“"'「『]/;
  // メタ漏れ(アシスタント作業報告)。地の文(常体小説)に出ない語のみ。
  var META = /(逐語反映|入力をどうぞ|お好きなタイミング|上記描写|次ターン以降|物語を進行させ|進行させました|描写しました|プレイヤーからの\s*SAY|SAY\s*\/\s*DO)/;
  // markdown整形の混入(強調**/__・見出し#)。中身は残しマーカーだけ除去。
  function stripMd(s){
    return String(s || '')
      .replace(/\*\*/g, '').replace(/__/g, '')        // 太字マーカー
      .replace(/(^|\n)\s*#{1,6}\s+/g, '$1');          // 行頭見出し
  }
  function cleanArr(arr){
    if (!Array.isArray(arr)) return { arr: arr, modified: false };
    // (a) 末尾のメタ報告ブロックを切り落とす(最初のMETA行以降を全削除)
    var cut = arr.length;
    for (var i = 0; i < arr.length; i++){ if (META.test(String(arr[i] || ''))){ cut = i; break; } }
    var work = arr.slice(0, cut);
    // (b) 生の状態行を除去 + (c) 生存エントリのmarkdownを除去
    var out = [];
    work.forEach(function(e){ if (STATE.test(String(e || ''))) return; out.push(stripMd(e)); });
    if (!out.length && arr.length){ return { arr: arr, modified: false }; }   // 安全網: 全消えは避ける
    var modified = (out.length !== arr.length);
    if (!modified){ for (var j = 0; j < arr.length; j++){ if (arr[j] !== out[j]){ modified = true; break; } } }
    return { arr: out, modified: modified };
  }
  function cleanStr(s){
    s = String(s || '');
    var lines = s.split('\n');
    var cut = lines.length;
    for (var i = 0; i < lines.length; i++){ if (META.test(lines[i])){ cut = i; break; } }
    var work = lines.slice(0, cut).filter(function(l){ return !STATE.test(l); }).map(stripMd);
    if (!work.length) return s;
    var res = work.join('\n');
    return res;
  }

  // ---- (1) 今後のターン: Planner.parsePlan をラップ ----
  function getPlanner(){ try { return window.Planner || (typeof Planner !== 'undefined' ? Planner : null); } catch(e){ return null; } }
  function wrapParse(){
    var P = getPlanner(); if (!P || typeof P.parsePlan !== 'function') return false;
    if (P.__v292Dfix322) return true;
    var orig = P.parsePlan.bind(P);
    P.parsePlan = function(){
      var plan = orig.apply(this, arguments);
      try {
        if (!off() && plan && Array.isArray(plan.narrative)){
          var r = cleanArr(plan.narrative);
          if (r.modified){ plan.narrative = r.arr; try { console.log(TAG, 'cleaned new turn narrative (state/meta/md)'); } catch(_){} }
        }
      } catch(e){}
      return plan;
    };
    P.__v292Dfix322 = true;
    try { console.log(TAG, 'parsePlan wrap installed'); } catch(_){}
    return true;
  }
  (function poll(){ poll._n = (poll._n || 0) + 1; if (wrapParse()) return; if (poll._n > 80) return; setTimeout(poll, 400); })();

  // ---- (2) 既存の汚染ターン: fix320型ガード付き一度きり移行 ----
  function getS(){ try { return window.S || (typeof S !== 'undefined' ? S : null); } catch(e){ return null; } }
  function slotSfx(){ try { if (typeof window.__chr6Key === 'function'){ var k = window.__chr6Key(); return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : ''; } } catch(e){} return ''; }
  function slotBlobLoc(sfx){ try { var b = JSON.parse(localStorage.getItem('chr6' + sfx) || 'null'); return (b && b.scene) ? (b.scene.loc || null) : null; } catch(e){ return null; } }
  var lastMigratedLoc = null;
  function migrate(){
    if (off()) return;
    var s = getS(); if (!s || !Array.isArray(s.turns) || !s.scene) return;
    var sfx = slotSfx(); var blobLoc = slotBlobLoc(sfx); var sLoc = (s.scene.loc || null);
    if (blobLoc && sLoc && blobLoc !== sLoc) return;          // 中間状態 → 触らない
    if (sLoc && sLoc === lastMigratedLoc) return;             // この物語は処理済み
    var changed = false;
    s.turns.forEach(function(t){
      if (!t) return;
      if (Array.isArray(t.narrative)){ var r = cleanArr(t.narrative); if (r.modified){ t.narrative = r.arr; changed = true; } }
      else if (typeof t.narrative === 'string'){ var c = cleanStr(t.narrative); if (c !== t.narrative){ t.narrative = c; changed = true; } }
      if (t.plan && Array.isArray(t.plan.narrative)){ var r2 = cleanArr(t.plan.narrative); if (r2.modified){ t.plan.narrative = r2.arr; changed = true; } }
    });
    lastMigratedLoc = sLoc;
    if (changed){
      try { if (typeof s.save === 'function') (typeof s.saveC==='function'?s.saveC('fix322.migrate'):s.save()); else if (window.S && window.S.save) (typeof window.S.saveC==='function'?window.S.saveC('fix322.migrate'):window.S.save()); } catch(e){}
      try { if (window.UI && UI.renderAll) UI.renderAll(); } catch(e){}
      try { console.log(TAG, 'migrated existing turns (state/meta/md) & re-saved'); } catch(_){}
    }
  }
  try { setInterval(migrate, 1500); } catch(e){}
  try { window.addEventListener('focus', migrate); } catch(e){}

  window.__v292Dfix322api = { cleanArr: cleanArr, cleanStr: cleanStr, stripMd: stripMd, migrate: migrate };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
