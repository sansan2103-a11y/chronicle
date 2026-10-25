// Chronicle TRPG - v292Dfix71: anti-recap (履歴逆流・反復崩壊の除去)
// 原因: fix35 が注入する番号付き「これまでの経緯」recap を、モデルが prose 化して
//   本文に吐き出し、turn.narrative に保存→次ターンで増幅→反復ループ崩壊。
// 修正: (1) anti-recap system 指示を後置 (2) クロスターン dedup で既出文を出力段で除去。
// flag: window.__v292Dfix71Active
(function v292Dfix71(){
  'use strict';
  if (window.__v292Dfix71Active) return;
  window.__v292Dfix71Active = true;
  var TAG = '[v292Dfix71:anti-recap]';
  var ANTI = '\n\n【最重要・出力規律：過去の再ナレーション禁止】\n'
    + '・「これまでの経緯」「storySoFar」「recentScenes」「recentDialogues」等の履歴は文脈把握のためだけ。本文(narrative)で再現しない。\n'
    + '・本文で過去の出来事を再ナレーション・要約・列挙しない。既に起きたこと（指を折った/腕を切った 等）を書き直さない。\n'
    + '・過去形で物語を頭から振り返る文（「○○は目を覚ました。…が現れ…」等）を書き出しに使わない。\n'
    + '・本文に書くのはプレイヤーの今回の入力の直後に起きる新しい一場面だけ（5〜10文）。\n'
    + '・キャラの現在の状態（傷の様子等）への言及は可。ただし「どう負ったか」の経緯再説明は不可。';
  function getPlanner(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } }
  function getState(){ try { var S=(0,eval)('typeof S!=="undefined"?S:null'); if(S&&S.turns)return S; } catch(e){} try { var r=localStorage.getItem('chr6'); if(r){var p=JSON.parse(r); if(p&&p.turns)return p;} } catch(e){} return {turns:[]}; }
  function antiRecapExt(ctx){ try { if (ctx && typeof ctx.sys==='string') return ctx.sys + ANTI; } catch(e){} return ctx && ctx.sys; }
  antiRecapExt.__v292Dfix71 = true;
  function norm(t){ return String(t==null?'':t).replace(/[「」『』（）()\s　…⋯。、！？!?.,<>\/="]/g,''); }
  function splitSentences(text){ var out=[],buf=''; for(var i=0;i<text.length;i++){ var c=text.charAt(i); buf+=c; if(c==='。'||c==='！'||c==='？'||c==='\n'){ if(buf.trim())out.push(buf); buf=''; } } if(buf.trim())out.push(buf); return out; }
  /* ★E6-1: 台詞の内側の文の扱い。DLG_DEFAULT_ON=false にすると v292Dfix71DlgOn='1' の端末だけ。Off が常に勝つ。
     診断 window.__v292Dfix71Dlg（件数だけ。本文・名前は持たない）。 */
  var DLG_DEFAULT_ON = true;
  var F71DLG = { VER: '20261024-laneE61-b', s: { calls: 0, kept: 0 } };
  function f71DlgOn(){ try { if (localStorage.getItem('v292Dfix71DlgOff') === '1') return false; if (DLG_DEFAULT_ON) return true; return localStorage.getItem('v292Dfix71DlgOn') === '1'; } catch(e){ return false; } }
  try { window.__v292Dfix71Dlg = { VER: F71DLG.VER, defaultOn: DLG_DEFAULT_ON, on: f71DlgOn, stats: function(){ return { calls: F71DLG.s.calls, kept: F71DLG.s.kept }; } }; } catch(_d){}
  function crossTurnDedup(plan, ctx){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      var S = (ctx && ctx.state) || getState();
      var turns = (S && S.turns) || [];
      var prev = Object.create(null), prevLast = Object.create(null);
      turns.forEach(function(t, ti){ splitSentences(String(t&&t.narrative||'')).forEach(function(s){ var k=norm(s); if(k.length>=8){ prev[k]=1; if (ti === turns.length - 1) prevLast[k]=1; } }); });
      /* ★CL1-g（GPT #125-BG 残件・fix71）: 台詞（「」や say を含む文）は、直前 1 ターンの同文（再掲癖）だけを落とす。
         何ターンも前と同じ台詞（問い直し・口癖・呼びかけ）は残す。地の文は従来どおり全ターンと照合。OFF: v292DfixCL1gOff='1'。 */
      var off1g = false; try { off1g = localStorage.getItem('v292DfixCL1gOff') === '1'; } catch(_e1g){}
      /* ★E6-1（GPT #127-MA §D・P1）: CL1-g の判定は「切った後の 1 文」に括弧があるかだけを見ていたので、
         「…。申し訳ありませんでした！」の 2 文目以降（括弧を含まない文）が地の文として全ターンと照合され、消えていた。
         同じ行の中で「」『』や <say> の内側にある文（台詞の中で始まる／終わる文＝開き・途中・閉じの断片）は照合しない＝消さない
         （GPT #127-MO B・案 B）。括弧だけの 1 文の台詞（「…」）も同じ。台詞と地の文が混ざった文（「行くぞ」と篠原は言った。）と地の文の判定は 44-b のまま。
         消す文は 44-b の部分集合なので、44-b が台詞の内側の文を消さない本文は 1 バイトも変わらない。
         OFF: v292Dfix71DlgOff='1'（v292DfixCL1gOff='1' のときも 44-b と同じ）。 */
      var dlgFix = !off1g && f71DlgOn(); var ds = F71DLG.s; ds.calls++;
      var dropped = 0;
      plan.narrative = plan.narrative.map(function(line){
        if (typeof line!=='string') return line;
        var depth = 0, sayOpen = 0;
        var kept = splitSentences(line).filter(function(s){ var k=norm(s); var dlg = !off1g && /[「」『』]|<\/?say\b/.test(s);
          var inner = false;
          if (dlgFix){ inner = depth>0 || sayOpen>0; var m;
            m = s.match(/[「『]/g); depth += m ? m.length : 0; m = s.match(/[」』]/g); depth -= m ? m.length : 0; if (depth<0) depth=0;
            m = s.match(/<say\b/g); sayOpen += m ? m.length : 0; m = s.match(/<\/say\s*>/g); sayOpen -= m ? m.length : 0; if (sayOpen<0) sayOpen=0;
            inner = inner || depth>0 || sayOpen>0 || /^\s*[「『][^「『」』]*[」』]\s*$/.test(s); }   /* 台詞の中で始まる文・台詞の中で終わる文（開き・途中・閉じの断片）・括弧だけの 1 文の台詞 */
          var hit = k.length>=8 && (dlg ? prevLast[k] : prev[k]);
          if (inner){ if (hit) ds.kept++; return true; }
          if (hit){ dropped++; return false; }
          return true; });
        return kept.join('').trim();
      }).filter(function(l){ return l && String(l).trim().length>1; });
      if (dropped>0){ try{ console.log(TAG,'cross-turn dedup removed',dropped,'recap sentence(s)'); }catch(_){} }
    } catch(e){ try{ console.warn(TAG,'dedup err:',e&&e.message); }catch(_){} }
    return plan;
  }
  crossTurnDedup.__v292Dfix71 = true;
  function install(){
    var P = getPlanner();
    if (!P) { setTimeout(install,200); return false; }
    P._extensions = P._extensions || [];
    P._parseExtensions = P._parseExtensions || [];
    if (!P._extensions.some(function(f){return f&&f.__v292Dfix71;})) P._extensions.push(antiRecapExt);
    if (!P._parseExtensions.some(function(f){return f&&f.__v292Dfix71;})) P._parseExtensions.push(crossTurnDedup);
    try { console.log(TAG,'installed'); } catch(_){}
    return true;
  }
  function selfHeal(){
    var P = getPlanner();
    if (!P || !Array.isArray(P._extensions) || !Array.isArray(P._parseExtensions)) return;
    if (!P._extensions.some(function(f){return f&&f.__v292Dfix71;})) P._extensions.push(antiRecapExt);
    if (!P._parseExtensions.some(function(f){return f&&f.__v292Dfix71;})) P._parseExtensions.push(crossTurnDedup);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  setTimeout(install,400); setTimeout(install,1500); setTimeout(install,4000);
  setInterval(selfHeal,2000);
  try { console.log(TAG,'loaded'); } catch(_){}
})();
