// Chronicle TRPG - v292Dfix74: extension-array dedup + <say> enforcement
// 症状: system prompt に「これまでの経緯」(fix35) が5回も注入され、sys が 5834字に肥大。
//   原因: fix68/69/71 等が _extensions を .filter() で作り直した際、fix35-50 が依存する
//   配列プロパティのフラグ(__v292DfixNN)が消え、selfHeal が同じ関数を re-push し続けた連鎖。
//   _extensions 43個中18重複 / _parseExtensions 26個中11重複。
// 修正(1): Planner.build / parsePlan を wrap し、実行直前に各フック配列を同一関数で dedup
//   （in-place splice で配列 ref は保持）。経緯5回→1回、sys 5834→2643字（実測）。
// 修正(2): ??? root — 全セリフを <say who="名前"> で囲ませる system 指示。裸の「」を減らし
//   speaker 不明(???)カードの発生源を断つ（fix73 のクライアント側 dedup と合わせ技）。
// flag: window.__v292Dfix74Active
(function v292Dfix74(){
  'use strict';
  if (window.__v292Dfix74Active) return;
  window.__v292Dfix74Active = true;
  var TAG = '[v292Dfix74:ext-dedup+say]';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  function dedupInPlace(arr){
    if (!Array.isArray(arr)) return 0;
    var seen = new Set(), removed = 0;
    for (var i=0;i<arr.length;){ if (seen.has(arr[i])){ arr.splice(i,1); removed++; } else { seen.add(arr[i]); i++; } }
    return removed;
  }
  function dedupAll(){
    var P = getPlanner(); if (!P) return;
    dedupInPlace(P._extensions);
    dedupInPlace(P._userExtensions);
    dedupInPlace(P._parseExtensions);
  }

  // ---- (2) <say> 強制 system 指示 ----
  var SAY = '\n\n【セリフ表記ルール（fix74）】\n'
    + '・キャラのセリフは全て <say who="キャラ名">…</say> で囲む。地の文に裸の「」セリフを置かない。\n'
    + '・who には必ず cast に登録された名前を入れる（??? や代名詞は不可）。誰が言ったか曖昧にしない。\n'
    + '・心の声・独白も <say who="名前(心)">…</say> で囲んでよい。';
  function sayExt(ctx){ try { if (ctx && typeof ctx.sys==='string') return ctx.sys + SAY; } catch(e){} return ctx && ctx.sys; }
  sayExt.__v292Dfix74 = true;

  function ensureSayExt(){
    var P = getPlanner(); if (!P) return;
    P._extensions = P._extensions || [];
    if (!P._extensions.some(function(f){ return f && f.__v292Dfix74; })) P._extensions.push(sayExt);
  }

  // ---- (1) build / parsePlan を wrap して実行直前に dedup ----
  function wrapBuild(){
    var P = getPlanner();
    if (!P || typeof P.build!=='function' || P.build.__v292Dfix74w) return false;
    var orig = P.build.bind(P);
    var w = function(){ try{ ensureSayExt(); dedupAll(); }catch(e){} return orig.apply(this, arguments); };
    w.__v292Dfix74w = true;
    P.build = w;
    try { console.log(TAG,'build wrapped'); } catch(_){}
    return true;
  }
  function wrapParse(){
    var P = getPlanner();
    if (!P || typeof P.parsePlan!=='function' || P.parsePlan.__v292Dfix74w) return false;
    var orig = P.parsePlan.bind(P);
    var w = function(){ try{ dedupAll(); }catch(e){} return orig.apply(this, arguments); };
    w.__v292Dfix74w = true;
    P.parsePlan = w;
    try { console.log(TAG,'parsePlan wrapped'); } catch(_){}
    return true;
  }

  function tick(){ wrapBuild(); wrapParse(); ensureSayExt(); dedupAll(); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  setTimeout(tick,400); setTimeout(tick,1500); setTimeout(tick,4000);
  setInterval(tick,2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
