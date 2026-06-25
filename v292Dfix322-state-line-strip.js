// =====================================================================
// Chronicle TRPG - v292Dfix322: 状態スキーマ「生行漏れ」の根治
//   症状(おしん報告・2026-06-24): 「展開の描写」に内部のキャラ状態＋アシスタント作業報告が漏れる。
//     例: こころ=“怒り／依存拒否反射” / 傷=“左肩口〜胴部…” / 未解決=“…”
//   真因: 本来モデルは状態を <state who="…" からだ="…" こころ="…" …/> タグで
//     本文の後に出力し、parse時に除去される設計。しかし DS V4 Flash 等が稀に
//     タグに包まず【生の key=“value” 行】として plan.narrative に出力すると、
//     <state>タグ専用ストリッパをすり抜けて本文に残り、保存・表示・モデル文脈を汚染。
//     ※引用符が全角(” “)/半角(")/和文(「『) と揺れるのも一因。
//   設計(コア不触): 
//     (1) Planner.parsePlan をラップし、plan.narrative から bare state行を除去(今後のターン)。
//         通常の地の文に「6スキーマ語 = 引用符」表記は出ない=安全な判別子。<say>等の正規タグは不触。
//         ※bare行は元々fix77/fix190に状態として捕捉されない(タグでないため)＝除去で機能損失なし。
//     (2) 既存の汚染ターンは、fix320型ガード(S.scene.loc==アクティブslot blob.loc)付きの
//         一度きり移行で S.turns を掃除して再保存＋再描画。物語ごとに1回だけ。
//   OFF: localStorage v292Dfix322Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix322) return; window.__v292Dfix322 = true;
  var TAG = '[v292Dfix322:stateleak]';
  function off(){ try { return localStorage.getItem('v292Dfix322Off') === '1'; } catch(e){ return false; } }

  // fix77/fix190 の6スキーマ語の直後に「=引用符」が来る=内部状態の生漏れ。
  // 引用符は全角” “ / 半角" ' / 和文「『 を許容。値内部の「原因:」「発生:」等は=引用符でないので不一致。
  var STATE = /(?:からだ|こころ|本能|傷|関係|未解決)\s*=\s*[”“"'「『]/;
  // メタ漏れ(アシスタント作業報告)。本文末尾に付く運営口調ブロック。地の文(常体小説)には絶対出ない語のみ。
  var META = /(逐語反映|入力をどうぞ|お好きなタイミング|上記描写|次ターン以降|物語を進行させ|進行させました|描写しました|プレイヤーからの\s*SAY|SAY\s*\/\s*DO)/;
  function isLeak(s){ s = String(s || ''); return STATE.test(s) || META.test(s); }
  function cleanArr(arr){
    if (!Array.isArray(arr)) return { arr: arr, removed: 0 };
    // (a) 末尾のメタ報告ブロックを切り落とす(最初のMETA行以降を全削除=報告は本文の後に付くため)
    var cut = arr.length;
    for (var i = 0; i < arr.length; i++){ if (META.test(String(arr[i] || ''))){ cut = i; break; } }
    var work = arr.slice(0, cut);
    var metaRemoved = arr.length - cut;
    // (b) 生の状態行を除去
    var out = [], stateRemoved = 0;
    work.forEach(function(e){ if (STATE.test(String(e || ''))){ stateRemoved++; } else out.push(e); });
    var removed = metaRemoved + stateRemoved;
    if (!out.length && removed > 0) return { arr: arr, removed: 0 };   // 安全網: 全消えは避ける
    return { arr: out, removed: removed };
  }
  function cleanStr(s){
    s = String(s || ''); if (s.indexOf('=') < 0 && !META.test(s)) return s;
    var lines = s.split('\n');
    var cut = lines.length;
    for (var i = 0; i < lines.length; i++){ if (META.test(lines[i])){ cut = i; break; } }
    var work = lines.slice(0, cut);
    var kept = work.filter(function(l){ return !STATE.test(l); });
    return kept.length ? kept.join('\n') : s;
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
          if (r.removed > 0){ plan.narrative = r.arr; try { console.log(TAG, 'stripped', r.removed, 'bare state line(s) from new turn'); } catch(_){} }
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
    if (blobLoc && sLoc && blobLoc !== sLoc) return;          // 起動/切替の中間状態 → 触らない(次tickで再評価)
    if (sLoc && sLoc === lastMigratedLoc) return;             // この物語は処理済み
    var changed = 0;
    s.turns.forEach(function(t){
      if (!t) return;
      if (Array.isArray(t.narrative)){ var r = cleanArr(t.narrative); if (r.removed){ t.narrative = r.arr; changed += r.removed; } }
      else if (typeof t.narrative === 'string'){ var c = cleanStr(t.narrative); if (c !== t.narrative){ t.narrative = c; changed++; } }
      if (t.plan && Array.isArray(t.plan.narrative)){ var r2 = cleanArr(t.plan.narrative); if (r2.removed){ t.plan.narrative = r2.arr; changed += r2.removed; } }
    });
    lastMigratedLoc = sLoc;                                    // 物語ごとに1回だけ
    if (changed > 0){
      try { if (typeof s.save === 'function') s.save(); else if (window.S && window.S.save) window.S.save(); } catch(e){}
      try { if (window.UI && UI.renderAll) UI.renderAll(); } catch(e){}
      try { console.log(TAG, 'migrated existing turns — removed', changed, 'leaked line(s) & re-saved'); } catch(_){}
    }
  }
  try { setInterval(migrate, 1500); } catch(e){}
  try { window.addEventListener('focus', migrate); } catch(e){}

  window.__v292Dfix322api = { isLeak: isLeak, cleanArr: cleanArr, cleanStr: cleanStr, migrate: migrate };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
