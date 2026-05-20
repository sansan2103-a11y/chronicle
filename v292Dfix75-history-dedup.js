// Chronicle TRPG - v292Dfix75: user-payload history dedup (storySoFar / recentDialogues)
// 症状(監査#2): ユーザーペイロードに同じ履歴が三重に積まれていた。
//   - recentScenes[].narrative … 直近ターンの本文（正本・詳細）
//   - recentDialogues[] … その narrative 内の <say>/「」セリフを再抽出（実機 4/4 が narrative に逐語存在＝100%重複）
//   - storySoFar … 「これまで N ターン経過。直近の状況: <narrative をほぼ逐語コピー>」（実機 6/7 窓が recentScenes に一致）
//   → 1ターンの内容が3か所に重複。ターンが増えると雪だるま式にトークンを浪費し、
//     モデルの recap 誘発（fix71 で対処した症状）の燃料にもなる。
// 修正: _userExtensions に dedup フックを後置（build-core が storySoFar/recentScenes を
//   組んだ後に走る）。ctx.user の先頭 JSON だけを brace-match で取り出し、
//   (1) recentDialogues から recentScenes 本文に逐語存在するセリフを除去（空なら key 削除）、
//   (2) storySoFar を文分割し、recentScenes に逐語含有 or 窓被覆>=60% の文を除去（先頭の
//       「これまで N ターン経過。」ヘッダは常に保持）。
//   JSON 末尾以降の付随テキスト（逐語反映の指示など）はそのまま温存して再連結。
//   recentScenes（正本）は一切触らない＝文脈の情報量は減らさず、重複ぶんだけ削る。
// 実機計測（1ターン状態）: user 3159→2673字（-486 / 約15%）、recentDialogues 4→0、
//   storySoFar 221→「これまで 1 ターン経過。」、JSON 妥当性 OK。
// 互換: 純追加。contract = function(ctx{user,state}) -> newUserString。
// flag: window.__v292Dfix75Active
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
  // 先頭 JSON オブジェクトの終端を brace-match で求める（文字列内の {} やエスケープを無視）
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
  // 文が recentScenes 本文に十分カバーされているか（逐語含有 or 長文の窓被覆>=60%）
  function covered(sentence, blob){
    var k = norm(sentence);
    if (k.length < 3) return false;          // ごく短い断片は判定不能 → 残す
    if (blob.indexOf(k) >= 0) return true;   // 文まるごと逐語存在 → 重複
    if (k.length < 12) return false;         // 中程度で非逐語 → 残す
    var hit=0,win=0;
    for (var i=0;i+12<=k.length;i+=6){ win++; if (blob.indexOf(k.substr(i,12))>=0) hit++; }
    return win>0 && (hit/win) >= 0.6;
  }

  function dedupHistory(ctx){
    var u = ctx && ctx.user;
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
      if (!blob) return u; // 正本が無ければ判定材料が無い → 触らない
      var changed = false;

      // (1) recentDialogues: recentScenes に逐語存在するセリフを除去
      if (Array.isArray(obj.recentDialogues)){
        var before = obj.recentDialogues.length;
        obj.recentDialogues = obj.recentDialogues.filter(function(d){
          var t = norm(d && d.text || '');
          return !(t.length >= 2 && blob.indexOf(t) >= 0);
        });
        if (obj.recentDialogues.length !== before) changed = true;
        if (obj.recentDialogues.length === 0){ delete obj.recentDialogues; changed = true; }
      }

      // (2) storySoFar: recentScenes と重複する文を除去（先頭ヘッダは保持）
      if (typeof obj.storySoFar === 'string'){
        var parts = splitSentences(obj.storySoFar);
        var kept = parts.filter(function(s, idx){
          if (idx === 0) return true;        // 「これまで N ターン経過。」ヘッダは常に残す
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
      return ctx && ctx.user;
    }
  }
  dedupHistory.__v292Dfix75 = true;

  function install(){
    var P = getPlanner();
    if (!P){ setTimeout(install, 200); return false; }
    P._userExtensions = P._userExtensions || [];
    if (!P._userExtensions.some(function(f){ return f && f.__v292Dfix75; })) P._userExtensions.push(dedupHistory);
    try { console.log(TAG, 'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._userExtensions)) return;
    if (!P._userExtensions.some(function(f){ return f && f.__v292Dfix75; })) P._userExtensions.push(dedupHistory);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  setTimeout(install, 400); setTimeout(install, 1500); setTimeout(install, 4000);
  setInterval(selfHeal, 2000);
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
