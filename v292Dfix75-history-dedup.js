// Chronicle TRPG - v292Dfix75: user-payload history dedup (storySoFar / recentDialogues)
// 症状(監査#2): ユーザーペイロードに同じ履歴が三重に積まれていた。
//   - recentScenes[].narrative … 直近ターンの本文（正本・詳細）
//   - recentDialogues[] … その narrative 内の <say>/「」セリフを再抽出（実機 4/4 が逐語存在＝100%重複）
//   - storySoFar … 「これまで N ターン経過。直近の状況: <narrative をほぼ逐語コピー>」（実機 6/7 窓が一致）
//   → 1ターンの内容が3か所に重複。ターンが増えると雪だるま式にトークンを浪費し、
//     モデルの recap 誘発（fix71 で対処した症状）の燃料にもなる。
// 修正: Planner.build を wrap し、build が完成させた最終ペイロード(r.user)を後段で dedup。
//   先頭 JSON だけを brace-match で取り出し、
//   (1) recentDialogues から recentScenes 本文に逐語存在するセリフを除去（空なら key 削除）、
//   (2) storySoFar を文分割し、recentScenes に逐語含有 or 窓被覆>=60% の文を除去（先頭ヘッダは保持）。
//   JSON 末尾以降の付随テキスト（逐語反映の指示など）は温存して再連結。recentScenes(正本)は不可侵。
//   ※当初は _userExtensions 後置だったが、build は履歴注入(fix35系)を後段で行うため push 位置に
//     よっては履歴が入る前に走り no-op になる（実機 fix75@idx5 / 履歴注入@idx6 で素通り）。
//     よって build 最終出力を wrap して叩く方式に変更＝拡張の並び順に非依存。
//   ※fix74 も build を wrap。相互に毎tick再wrapして無限ネストするのを防ぐため、wrap 時に元関数の
//     __v292*w フラグを引き継ぐ。
// 実機計測（1ターン）: user 3159→2673字（-486）、recentDialogues 4→0、storySoFar→「これまで 1 ターン経過。」
// 互換: 純追加。flag: window.__v292Dfix75Active
(function v292Dfix75(){
  'use strict';
  if (window.__v292Dfix75Active) return;
  window.__v292Dfix75Active = true;
  var TAG = '[v292Dfix75:history-dedup]';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }

  function norm(s){ return String(s==null?'':s).replace(/[「」『』（）()\s　…⋯。、！？!?.,<>\/="]/g,''); }
  function splitSentences(text){
    var out=[],buf='';
    for (var i=0;i<text.length;i++){ var c=text.charAt(i); buf+=c; if(c==='。'||c==='！'||c==='？'||c==='\n'){ if(buf.trim())out.push(buf); buf=''; } }
    if (buf.trim()) out.push(buf);
    return out;
  }
  function findJsonEnd(s){
    var d=0,inS=false,esc=false;
    for (var i=0;i<s.length;i++){
      var c=s[i];
      if (esc){ esc=false; continue; }
      if (c==='\\'){ esc=true; continue; }
      if (c==='"'){ inS=!inS; continue; }
      if (inS) continue;
      if (c==='{') d++;
      else if (c==='}'){ d--; if (d===0) return i+1; }
    }
    return -1;
  }
  function covered(sentence, blob){
    var k = norm(sentence);
    if (k.length < 3) return false;
    if (blob.indexOf(k) >= 0) return true;
    if (k.length < 12) return false;
    var hit=0,win=0;
    for (var i=0;i+12<=k.length;i+=6){ win++; if (blob.indexOf(k.substr(i,12))>=0) hit++; }
    return win>0 && (hit/win) >= 0.6;
  }

  function dedupUserString(u){
    if (typeof u !== 'string') return u;
    try {
      var je = findJsonEnd(u);
      if (je < 0) return u;
      var head = u.slice(0, je), tail = u.slice(je);
      var obj;
      try { obj = JSON.parse(head); } catch(e){ return u; }
      if (!obj || typeof obj !== 'object') return u;
      var blob = '';
      if (Array.isArray(obj.recentScenes)) obj.recentScenes.forEach(function(s){ blob += norm(s && s.narrative || ''); });
      if (!blob) return u;
      var changed = false;
      if (Array.isArray(obj.recentDialogues)){
        var before = obj.recentDialogues.length;
        obj.recentDialogues = obj.recentDialogues.filter(function(d){
          var t = norm(d && d.text || '');
          return !(t.length >= 2 && blob.indexOf(t) >= 0);
        });
        if (obj.recentDialogues.length !== before) changed = true;
        if (obj.recentDialogues.length === 0){ delete obj.recentDialogues; changed = true; }
      }
      if (typeof obj.storySoFar === 'string'){
        var parts = splitSentences(obj.storySoFar);
        var kept = parts.filter(function(s, idx){
          if (idx === 0) return true;
          return !covered(s, blob);
        });
        var ns = kept.join('').trim();
        if (ns !== obj.storySoFar){ obj.storySoFar = ns; changed = true; }
      }
      if (!changed) return u;
      var nu = JSON.stringify(obj, null, 2) + tail;
      try { console.log(TAG, 'deduped user payload', u.length, '->', nu.length); } catch(_){}
      return nu;
    } catch(e){
      try { console.warn(TAG, 'err:', e && e.message); } catch(_){}
      return u;
    }
  }
  window.__v292Dfix75Dedup = dedupUserString;

  function wrapBuild(){
    var P = getPlanner();
    if (!P || typeof P.build !== 'function' || P.build.__v292Dfix75w) return false;
    var orig = P.build.bind(P);
    var prev = P.build;
    var w = function(){
      var r = orig.apply(this, arguments);
      try { if (r && typeof r.user === 'string') r.user = dedupUserString(r.user); } catch(e){}
      return r;
    };
    try { for (var k in prev){ if (/^__v292.*w$/.test(k)) w[k] = prev[k]; } } catch(e){}
    w.__v292Dfix75w = true;
    P.build = w;
    try { console.log(TAG, 'build wrapped'); } catch(_){}
    return true;
  }

  function tick(){ wrapBuild(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  setTimeout(tick, 400); setTimeout(tick, 1500); setTimeout(tick, 4000);
  setInterval(tick, 2000);
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
