// =====================================================================
// Chronicle TRPG - v292Dfix313: 設定カード(編集できるトリガー式の永久canon/事典)
//   背景: 長期記憶の弱点(自動要約が毎回置換で古い重要事実が消える/間接参照を拾えない)を
//     補う。AIダンジョンのStory Card型=「名前＋トリガー語＋本文＋常時フラグ」を手書きでき、
//     常時カードは毎ターン必ず注入、トリガーカードは直近ターンに語が出た時だけ注入。
//   設計(コア不触):
//     - 保存: S.scene.cards[] に持つ → 既存セーブ機構(fix205/225/230)でスロット分離＋
//       JSON書出/読込/まるごと書出に自動で乗る。
//     - 注入: Planner.build を最外ラップ(fix309/300/304と同型)。組み上がったsys末尾へ
//       【設定カード】ブロックを足す(常時＋直近トリガー命中のみ・冪等)。
//       ※当初Planner._extensionsを使ったが現行送信経路で適用されず実機傍受で発覚→build wrapに変更。
//     - UI: トップバーに「🗂 カード」ボタン→管理モーダル(一覧/追加/編集/削除/常時トグル)。
//   OFF: localStorage v292Dfix313Off='1' で注入停止(データは保持)。
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix313:story-cards]';
  if(window.__v292Dfix313) return; window.__v292Dfix313=true;
  var RECENT=6, MARK='【設定カード';

  function off(){ try{ return localStorage.getItem('v292Dfix313Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function getCards(){ var s=getS(); if(!s) return []; if(!s.scene) s.scene={}; if(!Array.isArray(s.scene.cards)) s.scene.cards=[]; return s.scene.cards; }
  function persist(){ try{ var s=getS(); if(s&&typeof s.save==='function'){ (typeof s.saveD==='function'?s.saveD('fix313.persist'):s.save()); return; } }catch(e){}
    try{ if(window.S&&typeof window.S.save==='function') window.S.save(); }catch(e){} }
  function recentText(){ var s=getS(); if(!s||!Array.isArray(s.turns)) return ''; return s.turns.slice(-RECENT).map(function(t){ return (t&&t.narrative||'')+' '+(t&&(t.playerText||t.player)||''); }).join(' '); }

  // ---- 注入 ----
  // 旧(fix313 原版)の組み立て。v292Dfix951Off='1' のときはこれを 1 バイトも変えずに使う。
  function buildBlockLegacy(){
    if(off()) return '';
    var cards=getCards(); if(!cards.length) return '';
    var rt=recentText();
    var lines=[];
    cards.forEach(function(c){
      if(!c||!c.entry||!String(c.entry).trim()) return;
      var trig=Array.isArray(c.triggers)?c.triggers:String(c.triggers||'').split(/[,、\s]+/);
      var hit=c.always || trig.some(function(t){ t=String(t||'').trim(); return t && rt.indexOf(t)>=0; });
      if(hit) lines.push('■ '+(c.name||'無題')+(c.always?'（常時）':'')+'：'+String(c.entry).trim());
    });
    if(!lines.length) return '';
    return '\n\n'+MARK+'（常に効く確定設定・事典。参照用。本文に説明書きを混ぜない）】\n'+lines.join('\n');
  }

  // =====================================================================
  // ★fix951 r3（2026-10-14・GPT 裁定 #125-GP / #125-GU canary 限定 / #125-GV r2 / #125-GW r3）: カードの「選択」と「量の上限」と「GM 秘密の扱い」
  //   ・全量注入ではなく、重要度・発動条件・現在の場面でカードを選ぶ。
  //   ・r2 から継ぐもの: カードを途中で切らない（節＝行頭の【…】見出し・ラベル行から次の見出しまで。見出しの無い先頭部分も 1 節。
  //     節を丸ごと入れるか外すかだけ）。GM 判定は節ごと。GM 専用は規則つきでブロック末尾。【】は〔〕に変えて送る。
  //   ・★r3（#125-GW）: 選ぶ順を「段」で決める。上の段が先に枠を使い、同じ段の中でだけ「入る節の組み合わせ（届く字数が最大）」を考える。
  //       段1 明示された重要規則・破ってはいけない制約（根拠: 節見出しの規則語・本文の制約表現〔〜しない・必ず・禁止 など〕の行の割合・
  //            箇条書き・常時フラグ。カード名の規則語は参考の +1 だけ。名前だけでは段1 にしない）
  //       段2 今回の行動（入力）や開始条件（T0 の開始時の状況・開始ルール）に一致したトリガー
  //       段3 いま登場している人物の人物像・心理（登録人物の札。登場の証拠 = 名前／札のトリガー語が 入力・T0 の開始条件・直近 2 ターンの
  //            本文と入力に出た、または直近 2 ターンの会話ログ・話者タグの確定話者。部分一致・短縮名では立てない）
  //       段4 場面に関係する世界観と GM 情報（人物以外の常時の札の概要の節・GM の節、場面の語〔現在地・今回当たった語・登場中の人物名〕を含む節、
  //            直近や現在地で当たったトリガー）
  //       段5 補足的な背景設定（それ以外。登場していない人物の札など）
  //     段の中の小段: 作者の priority（高い順）→ 札の最初の節（概要）→ それ以外の節（詳細）。概要が入らなかった札の詳細は入れない（段1 の規則の節は例外）。
  //   ・枠（腕 A/B の値は r2 と同じ・変えない）: 常時 / トリガー（件数・字数）/ GM 常時（= gmTotal − gmTrigReserve）/ GM トリガー（= gmTotal − GM 常時の使用分）。
  //   ・★r3: 1 節（トリガーは 1 枚）で枠そのものを超えて「この腕では永久に選ばれない」ものは lastSelection().budgetShort に
  //     予算不足として記録し、段1〜4 なら console に 1 回だけ出す（同じ内容は繰り返さない）。
  //   ・枠に入らなかった節・札は黙って捨てず、lastSelection().skipped に名前・区分・段・節の番号・理由・字数で残す。
  //   腕（A/B。端末ごと・送信ごとに評価）: localStorage.v292Dfix951Arm = 'B' → B（常時 3,800／GM 2,600）。それ以外・無し → A（常時 2,400／GM 1,200）。
  //   OFF: localStorage.v292Dfix951Off='1' → 上の buildBlockLegacy に完全に戻る（fix952 も見出しを登録しない＝本番と同じく届かない）。
  //   GM の扱い: localStorage.v292Dfix951Gm = 'rule'(既定) | 'withhold'(送らない)
  //   トリガー源: localStorage.v292Dfix951Src = 'scene'(既定: 入力・T0開始条件・直近・現在地) | 'legacy'(直近6ターンのみ)
  // =====================================================================
  var VERSION951='fix951-r3-20261014';
  var ARMS={
    A:{ alwaysTotal:2400, gmTotal:1200, gmTrigReserve:400, trigMax:4, trigTotal:1200, minTrig:1 },
    B:{ alwaysTotal:3800, gmTotal:2600, gmTrigReserve:600, trigMax:4, trigTotal:1200, minTrig:1 }
  };
  var LV_NAME={ 1:'規則・制約', 2:'今回の行動・開始条件', 3:'登場中の人物', 4:'場面の世界観・GM', 5:'補足の背景' };
  var PRESENT_WIN=2;   // 登場の証拠を見る直近のターン数（fix192 の在場判定窓と同じ 2）
  function f951off(){ try{ return localStorage.getItem('v292Dfix951Off')==='1'; }catch(e){ return false; } }
  // ★canary 限定（GPT 裁定 #125-GU）: 選択器は fix953 が active と答えた時だけ動く。それ以外は buildBlockLegacy（本番と 1 バイトも同じ）。
  //   fix953 が無い・例外 → 動かない（fail-closed）。
  function canary951(){ try{ var g=window.__v292Dfix953; return !!(g && typeof g.active==='function' && g.active()===true); }catch(e){ return false; } }
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function armName(){ return lsGet('v292Dfix951Arm')==='B' ? 'B' : 'A'; }
  function budget(){ var a=ARMS[armName()], b={}, k; for(k in a) b[k]=a[k]; b.arm=armName(); return b; }
  var RULE='・下の設定は物語の内部資料。地の文・セリフで説明として書き写さず、人物の言動・物・場の様子ににじませる。\n'
          +'・「GM専用」の項目は語り手（あなた）だけが知る裏設定。展開の筋道と伏線の整合のためだけに使う。地の文・セリフ・NPCの独白で直接明かさない。プレイヤーが手がかりを積み上げる前に真相を言い当てる描写をしない。手がかりは一度に一つ、物・痕跡・言い淀みで間接的に示す。';
  function safe(s){ return String(s==null?'':s).replace(/【/g,'〔').replace(/】/g,'〕'); }
  // ---- 節の分け方（fix444g の splitGm と同じ規則。QA で 2 つの出力が一致することを確かめている。r2 から変えていない） ----
  var GM_NAME=/（\s*(GM|ＧＭ)\s*）|\(\s*(GM|ＧＭ)\s*\)|(GM|ＧＭ)専用|【\s*(GM|ＧＭ)/;   // カード名の GM 印
  var HEAD_RE=/^\s*[【［\[]([^】］\]\n]{0,60})[】］\]]/;                                   // 行頭の見出し・ラベル【…】
  var GM_TOKEN=/(^|[^A-Za-z])(GM|ＧＭ)(?![A-Za-z])/;                                       // 見出しの中の GM の語
  var GM_LEAD=/^\s*(GM|ＧＭ)\s*(専用|秘密|メモ|向け|情報)?\s*[：:]|^\s*(GM|ＧＭ)専用/;      // 「GM専用：」「GM：」で始まる行
  function sectionsOf(name, entry){
    var nameGm=GM_NAME.test(String(name==null?'':name));
    var lines=String(entry==null?'':entry).replace(/^\s+|\s+$/g,'').split('\n'), secs=[], cur=null;
    for(var i=0;i<lines.length;i++){ var L=lines[i], m=HEAD_RE.exec(L);
      if(m){ cur={ gm:GM_TOKEN.test(m[1]), headed:true, lines:[L] }; secs.push(cur); continue; }
      if(GM_LEAD.test(L)){ cur={ gm:true, headed:true, lines:[L] }; secs.push(cur); continue; }
      if(!cur){ if(!L.trim()) continue; cur={ gm:nameGm, headed:false, lines:[L] }; secs.push(cur); continue; }
      cur.lines.push(L);   // 見出しの無い行・空行は直前の節の続き（GM の節の後の段落は GM のまま）
    }
    return secs.map(function(s,k){ var t=s.lines.join('\n').replace(/^\s+|\s+$/g,''); return { idx:k, gm:s.gm, headed:s.headed, text:t }; })
               .filter(function(s){ return !!s.text; });
  }
  function splitGm(c){
    var secs=sectionsOf(c&&c.name, c&&c.entry), pub=[], gm=[];
    secs.forEach(function(s){ (s.gm?gm:pub).push(s.text); });
    return { pub:pub.join('\n'), gm:gm.join('\n'), secs:secs };
  }
  // ---- 段1 の根拠（規則・制約らしさ）。カード名は参考の +1 だけ ----
  var RULE_HEAD=/ルール|規則|掟|禁止|禁忌|制約|厳守|注意|約束|原則|方針|タブー|ＮＧ|NG|必須|守ること|進行|文体/;
  var RULE_NAME=/ルール|規則|掟|文体|禁止|進行|方針|原則|制約|約束|注意/;
  var C_STRONG=/禁止|厳守|厳禁|必ず|絶対|してはいけない|してはならない|しては駄目|してはダメ|べからず|ＮＧ|NG|タブー|禁忌|ならない|いけない|最優先|徹底/;
  var C_DIR=/(しない|させない|書かない|出さない|明かさない|言わない|使わない|語らない|描かない|触れない|変えない|与えない|許さない|入れない|混ぜない|繰り返さない|進めない|決めない|見せない|答えない|教えない)(こと|。|$|、|）|\)|」|\s)|こと[。]?$|すること|させること|しすぎない|控える|避ける|守る[。]?$/;
  var C_NEG=/ない(。|$|、|こと)|ません|られない|できない/;
  var BULLET=/^\s*([・\-－●◆■○◇※]|\d+[\.．)）]|[①-⑳])/;
  function ruleEvidence(cardName, sec, always){
    var raw=String(sec&&sec.text||'').split('\n'), hm=sec&&sec.headed?HEAD_RE.exec(raw[0]||''):null;
    var headRule=!!(hm && RULE_HEAD.test(hm[1]));
    var body=raw.slice(); if(hm) body[0]=body[0].replace(HEAD_RE,'');
    body=body.filter(function(l){ return l.replace(/\s+/g,'').length>0; });
    var nL=body.length||1, cL=0, nN=0, bl=0, strong=false;
    body.forEach(function(l){ var s=C_STRONG.test(l), d=C_DIR.test(l); if(s) strong=true; if(s||d) cL++; if(s||d||C_NEG.test(l)) nN++; if(BULLET.test(l)) bl++; });
    var bodyScore = (cL>=1 && cL/nL>=0.5) ? 3 : (cL>=2 && cL/nL>=0.2) ? 2 : (nN>=3 && nN/nL>=0.5) ? 2 : (cL>=1 ? 1 : 0);
    var bullet=(bl>=2 && cL>=2)?1:0, nameRule=RULE_NAME.test(String(cardName||'').replace(/（[^）]*）|\([^)]*\)/g,'').replace(/\s+/g,''));
    var score=(headRule?3:0)+bodyScore+bullet+(strong?1:0)+(always?1:0)+(nameRule?1:0);
    var rule = score>=4 && (headRule || bodyScore>=2) && (!sec.gm || headRule || bodyScore>=3);
    var ev=[]; if(headRule) ev.push('見出し'); if(bodyScore) ev.push('制約行'+cL+'/'+nL); if(bullet) ev.push('箇条'); if(strong) ev.push('強い語'); if(always) ev.push('常時'); if(nameRule) ev.push('名前(参考)');
    return { rule:rule, score:score, ev:ev };
  }
  // ---- 人物と登場 ----
  function baseName(n){ return String(n==null?'':n).replace(/（[^）]*）|\([^)]*\)/g,'').replace(/\s+/g,''); }
  function castList(){ var s=getS(), a=[]; try{ if(s&&s.cast){ if(s.cast.hero&&s.cast.hero.name) a.push({ name:String(s.cast.hero.name), hero:true }); (s.cast.npcs||[]).forEach(function(n){ if(n&&n.name) a.push({ name:String(n.name), hero:false }); }); } }catch(e){} return a; }
  function castNames(){ var a=[]; castList().forEach(function(m){ a.push(m.name); m.name.split(/\s+/).forEach(function(p){ if(p && p!==m.name) a.push(p); }); }); return a; }
  function trigWords(c){ return (Array.isArray(c&&c.triggers)?c.triggers:String(c&&c.triggers||'').split(/[,、\s]+/)).map(function(t){ return String(t||'').trim(); }).filter(function(t){ return !!t; }); }
  // 登録人物の札か: 札の名前（括弧を除く）が登録名と一致・登録名で始まる、または札のトリガー語に登録名がある
  function personOf(c, cast){ var bn=baseName(c&&c.name), tw=trigWords(c);
    for(var i=0;i<cast.length;i++){ var nm=cast[i].name.replace(/\s+/g,''); if(!nm) continue; if(bn===nm || bn.indexOf(nm)===0 || tw.indexOf(cast[i].name)>=0) return cast[i]; }
    return null; }
  function presence(input, cards, cast){
    var s=getS(), turns=(s&&Array.isArray(s.turns))?s.turns:[], out={}, texts=[];
    if(input) texts.push({ why:'今回の入力', text:String(input) });
    if(turns.length===0 && s&&s.scene) texts.push({ why:'開始時の状況', text:String(s.scene.startCondition||'')+' '+String(s.scene.startRules||'') });
    var rec=turns.slice(-PRESENT_WIN), who={};
    rec.forEach(function(t){ texts.push({ why:'直近'+PRESENT_WIN+'ターン', text:(t&&t.narrative||'')+' '+(t&&(t.playerText||t.player)||'') });
      try{ (t&&t._convSays||[]).forEach(function(c){ if(c&&c.who) who[String(c.who).trim()]=true; }); }catch(e){}
      try{ ((t&&t.plan&&t.plan._v254who)||[]).forEach(function(w){ if(w) who[String(w).trim()]=true; }); }catch(e){} });
    cast.forEach(function(m){
      if(m.hero){ out[m.name]='主人公'; return; }
      var words=[m.name]; cards.forEach(function(c){ var p=personOf(c, [m]); if(p) trigWords(c).forEach(function(w){ if(w.length>=2 && words.indexOf(w)<0) words.push(w); }); });
      if(who[m.name]){ out[m.name]='会話ログの話者'; return; }
      for(var i=0;i<texts.length;i++){ for(var j=0;j<words.length;j++){ if(texts[i].text.indexOf(words[j])>=0){ out[m.name]=texts[i].why; return; } } }
    });
    return { present:out, who:who };
  }
  function sources(input){
    var s=getS(), src=[];
    var legacy=(lsGet('v292Dfix951Src')==='legacy');
    var turns=(s&&Array.isArray(s.turns))?s.turns:[];
    if(!legacy && input) src.push({ w:4, why:'今回の入力', text:String(input) });
    if(!legacy && turns.length===0 && s&&s.scene){ src.push({ w:3, why:'開始時の状況', text:String(s.scene.startCondition||'')+' '+String(s.scene.startRules||'') }); }
    var rec=turns.slice(-RECENT);
    for(var i=rec.length-1;i>=0;i--){ var t=rec[i]; src.push({ w:2+(i/(rec.length||1)), why:'直近'+(rec.length-i)+'ターン前', text:(t&&t.narrative||'')+' '+(t&&(t.playerText||t.player)||'') }); }
    if(!legacy && s&&s.scene&&s.scene.loc) src.push({ w:1, why:'現在地', text:String(s.scene.loc) });
    return src;
  }
  // 同じ小段の中で「枠に入る組み合わせのうち、届く字数が最大」を選ぶ（同点なら先の節を取る）。kmax を渡すと件数の上限も守る。
  function bestFit(units, cap, kmax){
    var n=units.length, i, c, k, take=[]; if(!n || cap<=0 || kmax===0) return units.map(function(){ return false; });
    var K=(kmax==null||kmax>n)?n:kmax, W=cap+1, B=[];
    for(i=0;i<=n;i++){ B.push(new Int32Array((K+1)*W)); }
    for(i=n-1;i>=0;i--){ var w=units[i].cost;
      for(k=0;k<=K;k++) for(c=0;c<=cap;c++){ var v=B[i+1][k*W+c]; if(k>0 && w<=c){ var t=w+B[i+1][(k-1)*W+c-w]; if(t>v) v=t; } B[i][k*W+c]=v; } }
    c=cap; k=K; for(i=0;i<n;i++){ var w2=units[i].cost; if(k>0 && w2<=c && w2+B[i+1][(k-1)*W+c-w2]>=B[i+1][k*W+c]){ take.push(true); c-=w2; k--; } else take.push(false); }
    return take;
  }
  // 段 → 小段（priority 高い順 → 概要の節 → 詳細の節）の順に bestFit。上の段が先に枠を使う。
  //   pool: { kind, cap, maxCap(永久判定用), kmax(件数上限・トリガーだけ), needFirst(概要が入らない札の詳細を入れない) }
  function pickLevels(units, pool, skipped, short, levelUse){
    var groups={}, keys=[];
    units.forEach(function(u){ var f=(u.first||!pool.needFirst)?1:0, k=u.level+'|'+u.pr+'|'+f; if(!groups[k]){ groups[k]=[]; keys.push({ k:k, level:u.level, pr:u.pr, f:f }); } groups[k].push(u); });
    keys.sort(function(a,z){ return (a.level-z.level)||(z.pr-a.pr)||(z.f-a.f); });
    var used=0, n=0, firstTaken={}, firstTried={};
    keys.forEach(function(g){ var us=groups[g.k];
      us=us.filter(function(u){
        if(u.cost>pool.maxCap){ var permanent=true;
          short.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, len:u.cost, cap:pool.maxCap, permanent:permanent, important:u.level<=4 });
          skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.gm?null:u.head, why:'予算不足: 1'+(pool.unit||'節')+'で'+pool.kind+'の枠('+pool.maxCap+'字)を超える（この腕では選ばれない。段'+u.level+'・'+LV_NAME[u.level]+'）', len:u.cost, important:true, budgetShort:true });
          if(u.first) firstTried[u.idx]=true; return false; }
        if(pool.needFirst && !g.f && u.level>1 && !firstTaken[u.idx]){
          skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.gm?null:u.head, why:'同じ札の概要の節が'+pool.kind+'の枠に入らなかった（段'+u.level+'）', len:u.cost, important:true }); return false; }
        return true; });
      var room=pool.cap-used, kroom=(pool.kmax==null)?null:(pool.kmax-n);
      var take=bestFit(us, room, kroom);
      us.forEach(function(u,i){ if(take[i]){ u.taken=true; used+=u.cost; n++; if(u.first) firstTaken[u.idx]=true; levelUse[u.level]=(levelUse[u.level]||0)+u.cost; }
        else { var why;
          if(kroom!=null && kroom<=0) why='件数上限('+pool.kmax+'枚)（段'+u.level+'・'+LV_NAME[u.level]+'）';
          else if(u.cost>room) why=pool.kind+'の枠('+pool.cap+'字)に入らない（段'+u.level+'・'+LV_NAME[u.level]+(u.first?'・概要':'・詳細')+'の'+(pool.unit||'節')+'。上の段・小段で'+(pool.cap-room)+'字使用済み）';
          else why=pool.kind+'の枠('+pool.cap+'字)の残り'+room+'字で、同じ段の組み合わせから外れた（段'+u.level+'・'+LV_NAME[u.level]+'）';
          skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.gm?null:u.head, why:why, len:u.cost, important:true, score:u.score }); } }); });
    return { used:used, n:n };
  }
  function headOf(text){ var m=HEAD_RE.exec(text); return m ? safe(m[0]).slice(0,40) : null; }
  var lastSel=null;
  function select(input){
    var b=budget(), cards=getCards(), names=castNames(), cast=castList(), src=sources(input);
    var gmMode=(lsGet('v292Dfix951Gm')==='withhold')?'withhold':'rule';
    var pres=presence(input, cards, cast), present=pres.present;
    var aU=[], gA=[], tU=[], gT=[], skipped=[], short=[], trigCards=[];
    // 場面の語（段4 の判定）: 現在地・登場中の人物名・今回当たったトリガー語
    var sceneWords=[]; try{ var s0=getS(); if(s0&&s0.scene&&s0.scene.loc && String(s0.scene.loc).trim().length>=2) sceneWords.push(String(s0.scene.loc).trim()); }catch(e){}
    Object.keys(present).forEach(function(nm){ sceneWords.push(nm); });
    var hitWords=[];
    cards.forEach(function(c,idx){
      if(!c||!c.entry||!String(c.entry).trim()) return;
      var name=String(c.name||'無題'), pr=+c.priority||0, secs=sectionsOf(name, c.entry), always=!!c.always;
      var trs=trigWords(c).filter(function(t){ return t && (t.length>=b.minTrig || names.indexOf(t)>=0); });
      var score=0, why='', hitWord='';
      if(!always){ for(var i=0;i<src.length;i++){ for(var j=0;j<trs.length;j++){ if(src[i].text.indexOf(trs[j])>=0 && src[i].w>score){ score=src[i].w; why=src[i].why; hitWord=trs[j]; } } } }
      if(!always && !(score>0)) return;
      if(hitWord && hitWord.length>=2) hitWords.push(hitWord);
      var gsum=(typeof c.gmSummary==='string' && c.gmSummary.trim()) ? c.gmSummary.trim() : '';
      var pubS=secs.filter(function(s){ return !s.gm; }), gmS=secs.filter(function(s){ return s.gm; });
      if(gsum && gmS.length) gmS=[{ idx:gmS[0].idx, gm:true, headed:false, text:gsum, summary:true }];
      var person=personOf(c, cast), who=baseName(name);
      var isPresent = person ? !!present[person.name] : !!pres.who[who];
      trigCards.push({ c:c, name:name, idx:idx, pr:pr, always:always, score:score, why:why, word:hitWord, pub:pubS, gm:gmS, person:person, present:isPresent });
    });
    hitWords.forEach(function(w){ if(sceneWords.indexOf(w)<0) sceneWords.push(w); });
    var hasScene=function(text){ for(var i=0;i<sceneWords.length;i++){ if(sceneWords[i] && text.indexOf(sceneWords[i])>=0) return true; } return false; };
    trigCards.forEach(function(tc){
      var name=tc.name, idx=tc.idx, pr=tc.pr;
      if(tc.always){
        tc.pub.forEach(function(s,k){ var ev=ruleEvidence(name, s, true), lv;
          if(ev.rule) lv=1; else if(tc.person) lv=tc.present?3:5; else lv=(k===0||hasScene(s.text))?4:5;
          var line='■ '+safe(name)+'（常時）：'+safe(s.text);
          aU.push({ name:name, idx:idx, sec:s.idx, pr:pr, level:lv, ev:ev.ev, first:k===0, gm:false, head:headOf(s.text), line:line, cost:line.length+1 }); });
        tc.gm.forEach(function(s,k){ var ev=ruleEvidence(name, s, true), lv;
          if(ev.rule) lv=1; else if(tc.person) lv=tc.present?3:5; else lv=(k===0||hasScene(s.text))?4:5;
          var line='■ GM専用：'+safe(name)+'：'+safe(s.text);
          gA.push({ name:name, idx:idx, sec:s.idx, pr:pr, level:lv, ev:ev.ev, first:k===0, gm:true, line:line, cost:line.length+1 }); });
      } else {
        var anyRule=false, ev1=[]; tc.pub.forEach(function(s){ var ev=ruleEvidence(name, s, false); if(ev.rule){ anyRule=true; ev1=ev.ev; } });
        var lv = anyRule ? 1 : (tc.score>=3 ? 2 : ((tc.present && tc.score>=2) ? 3 : 4));
        tc.level=lv;
        if(tc.pub.length){ var line='■ '+safe(name)+'（'+tc.why+'：'+safe(tc.word)+'）：'+tc.pub.map(function(s){ return safe(s.text); }).join('\n');
          tU.push({ name:name, idx:idx, sec:null, pr:pr, level:lv, ev:anyRule?ev1:[tc.why], first:true, gm:false, why:tc.why, score:tc.score, line:line, cost:line.length+1, key:safe(name) }); }
        if(tc.gm.length){ var gl='■ GM専用：'+safe(name)+'（'+tc.why+'：'+safe(tc.word)+'）：'+tc.gm.map(function(s){ return safe(s.text); }).join('\n');
          gT.push({ name:name, idx:idx, sec:null, pr:pr, level:lv, ev:[tc.why], first:true, gm:true, why:tc.why, score:tc.score, line:gl, cost:gl.length+1, key:'GM専用：'+safe(name) }); }
      }
    });
    // トリガーの小段内は「重み（入力>開始時>直近>現在地）→ 並び順」で並べてから bestFit（同点は先を取る）
    var byScore=function(a,z){ return (z.score-a.score)||(a.idx-z.idx); }; tU.sort(byScore); gT.sort(byScore);
    var lvA={}, lvT={}, lvGA={}, lvGT={};
    // ---- 常時（公開の節） ----
    var rA=pickLevels(aU, { kind:'常時', cap:b.alwaysTotal, maxCap:b.alwaysTotal, needFirst:true }, skipped, short, lvA);
    // ---- トリガー（公開の部分。札は丸ごと） ----
    var rT=pickLevels(tU, { kind:'トリガー', cap:b.trigTotal, maxCap:b.trigTotal, kmax:b.trigMax, needFirst:false, unit:'枚' }, skipped, short, lvT);
    // ---- GM: 常時の札の GM 節（枠 = gmTotal − gmTrigReserve）→ トリガーの札の GM 部分（枠 = gmTotal − 常時 GM の使用分） ----
    var usedGA=0, usedGT=0, gmWithheld=0;
    if(gmMode==='withhold'){
      gA.forEach(function(u){ gmWithheld+=u.cost; skipped.push({ name:u.name, kind:'GM常時', sec:u.sec, level:u.level, head:null, why:'GM専用は送らない設定', len:u.cost }); });
      trigCards.forEach(function(tc){ if(tc.always) return; tc.gm.forEach(function(s){ gmWithheld+=s.text.length; skipped.push({ name:tc.name, kind:'GMトリガー', sec:s.idx, level:tc.level, head:null, why:'GM専用は送らない設定', len:s.text.length }); }); });
      gA=[]; gT=[];
    } else {
      var capGA=Math.max(0, b.gmTotal-b.gmTrigReserve);
      usedGA=pickLevels(gA, { kind:'GM常時', cap:capGA, maxCap:capGA, needFirst:true }, skipped, short, lvGA).used;
      var capGT=b.gmTotal-usedGA;
      // GM トリガーは「GM 合計」を超える 1 枚だけが永久に入らない（取り置きは常に残るが、常時 GM の使用分しだいで残りが変わる）
      usedGT=pickLevels(gT, { kind:'GMトリガー', cap:capGT, maxCap:b.gmTotal, needFirst:false, unit:'枚' }, skipped, short, lvGT).used;
      gT.forEach(function(u){ if(!u.taken && u.cost>b.gmTrigReserve && u.cost<=b.gmTotal) short.push({ name:u.name, kind:'GMトリガー', sec:null, level:u.level, len:u.cost, cap:b.gmTrigReserve, permanent:false, important:u.level<=4, note:'取り置き('+b.gmTrigReserve+'字)を超える。常時 GM の使用分しだいで入らない' }); });
    }
    // 出力の順: 常時（札の並び順・節の順）→ トリガー（重み順）→ GM 常時（札の並び順）→ GM トリガー（重み順）
    var ord=function(a,z){ return (a.idx-z.idx)||(a.sec-z.sec); };
    var outA=aU.filter(function(u){ return u.taken; }).sort(ord).map(function(u){ return { name:u.name, key:safe(u.name), line:u.line, sec:u.sec, level:u.level, ev:u.ev, len:u.cost }; });
    var outT=tU.filter(function(u){ return u.taken; }).map(function(u){ return { name:u.name, key:u.key, line:u.line, why:u.why, level:u.level, ev:u.ev, len:u.cost }; });
    var outGA=gA.filter(function(u){ return u.taken; }).sort(ord).map(function(u){ return { name:u.name, key:'GM専用：'+safe(u.name), line:u.line, sec:u.sec, level:u.level, ev:u.ev, len:u.cost }; });
    var outGT=gT.filter(function(u){ return u.taken; }).map(function(u){ return { name:u.name, key:u.key, line:u.line, level:u.level, ev:u.ev, len:u.cost }; });
    var picked=outA.concat(outT).concat(outGA).concat(outGT);
    var uniq=function(a){ var o=[]; a.forEach(function(x){ if(o.indexOf(x.name)<0) o.push(x.name); }); return o.length; };
    var kept=outA.map(function(p){ return { name:p.name, kind:'常時', sec:p.sec, level:p.level, ev:p.ev, len:p.len }; }).concat(outT.map(function(p){ return { name:p.name, kind:'トリガー', sec:null, why:p.why, level:p.level, ev:p.ev, len:p.len }; }))
      .concat(outGA.map(function(p){ return { name:p.name, kind:'GM常時', sec:p.sec, level:p.level, ev:p.ev, len:p.len }; })).concat(outGT.map(function(p){ return { name:p.name, kind:'GMトリガー', sec:null, level:p.level, ev:p.ev, len:p.len }; }));
    lastSel={ at:Date.now(), version:VERSION951, arm:b.arm, budget:b, gmMode:gmMode, names:picked.map(function(p){ return p.key; }), kept:kept,
      always:uniq(outA), alwaysSecs:outA.length, trig:outT.length, gm:uniq(outGA.concat(outGT)), gmSecs:outGA.length+outGT.length,
      chars:{ always:rA.used, trig:rT.used, gm:usedGA+usedGT, gmAlways:usedGA, gmTrig:usedGT }, gmWithheld:gmWithheld,
      levels:{ always:lvA, trig:lvT, gmAlways:lvGA, gmTrig:lvGT }, caps:{ always:b.alwaysTotal, trig:b.trigTotal, trigMax:b.trigMax, gmAlways:(gmMode==='withhold'?0:Math.max(0,b.gmTotal-b.gmTrigReserve)), gmTrig:(gmMode==='withhold'?0:b.gmTotal-usedGA) }, present:present,
      budgetShort:short, skipped:skipped, cut:[] };
    try{ var sig=skipped.filter(function(x){ return x.kind!=='トリガー'; }).map(function(x){ return x.kind+':'+x.name+(x.sec!=null?'#'+x.sec:''); }).join('|');
      if(sig && sig!==warnedSig){ warnedSig=sig; console.warn(TAG,'枠に入らず送らなかった節・札があります（lastSelection().skipped）', sig); } }catch(e){}
    try{ var ss=short.filter(function(x){ return x.important; }).map(function(x){ return x.kind+':'+x.name+(x.sec!=null?'#'+x.sec:'')+'('+x.len+'>'+x.cap+(x.permanent?'':'?')+')'; }).join('|');
      if(ss && ss!==warnedShort){ warnedShort=ss; console.warn(TAG,'予算不足: 重要な節・札が枠より大きく、この腕では選ばれません（lastSelection().budgetShort）', ss); } }catch(e){}
    return picked;
  }
  var warnedSig='', warnedShort='';
  function buildBlock(input){
    if(off()) return '';
    if(!canary951() || f951off()){ lastSel=null; return buildBlockLegacy(); }   // 本番の組み立て（canary 外・選択器 OFF）
    var cards=getCards(); if(!cards.length){ lastSel=null; return ''; }
    var picked=select(input);
    if(!picked.length) return '';
    var hasGm=picked.some(function(p){ return p.key.indexOf('GM専用：')===0; });
    var rule=hasGm?RULE:RULE.split('\n')[0];
    return '\n\n'+MARK+'（常に効く確定設定・事典。参照用。本文に説明書きを混ぜない）】\n'+rule+'\n'+picked.map(function(p){ return p.line; }).join('\n');
  }
  window.__v292Dfix951={ version:VERSION951, lastSelection:function(){ return lastSel; }, select:select, isOff:f951off, isCanary:canary951, budget:budget, arm:armName, splitGm:splitGm, sections:sectionsOf, ruleEvidence:ruleEvidence, levelNames:LV_NAME };
  // 注入はfix309/300/304と同型のPlanner.build最外ラップで行う。
  // (Planner._extensionsは現行の送信経路で適用されないことを実機傍受で確認したため不採用。)
  function installBuild(){
    try{
      var P=window.Planner||(typeof Planner!=='undefined'?Planner:null);
      if(!P||typeof P.build!=='function') return false;
      if(P.build._v292f313===true) return true; // 既に最外
      var inner=P.build.bind(P);
      var wrapped=function(){
        var r=inner.apply(this,arguments);
        try{ if(r&&typeof r.sys==='string'){ var b=buildBlock(arguments[1]); if(b && r.sys.indexOf(MARK)<0) r.sys=r.sys+b; } }catch(e){}
        return r;
      };
      try{ Object.keys(P.build).forEach(function(k){ wrapped[k]=P.build[k]; }) /* fix419c: 全プロパティ継承(9者相互ラップダンスの根治) */; }catch(e){}
      wrapped._v292f313=true;
      P.build=wrapped;
      return true;
    }catch(e){ return false; }
  }
  installBuild(); try{ setInterval(installBuild, 2500); }catch(e){}

  // ---- UI ----
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ensureStyles(){
    if(document.getElementById('v313-style')) return;
    var css=[
      '.v313-modal{width:min(820px,94vw);max-height:88vh;overflow:auto}',
      '.v313-row{border:1px solid var(--border,rgba(139,118,240,.25));border-radius:10px;padding:12px;margin-bottom:12px;background:var(--bg,#09090f)}',
      '.v313-row .v313-top{display:flex;gap:8px;align-items:center;margin-bottom:8px}',
      '.v313-row input[type=text]{flex:1;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:13px;font-family:inherit}',
      '.v313-row textarea{width:100%;min-height:54px;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical}',
      '.v313-lab{font-size:11px;color:var(--dim,#888);margin:6px 0 3px}',
      '.v313-always{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--acc,#a78bfa);white-space:nowrap;cursor:pointer}',
      '.v313-del{background:transparent;border:1px solid rgba(224,96,96,.4);color:var(--err,#e06060);border-radius:6px;padding:5px 9px;font-size:12px;cursor:pointer}',
      '.v313-add{background:var(--acc,#8b76f0);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer}',
      '.v313-hint{font-size:11.5px;color:var(--dim,#888);line-height:1.7;margin:4px 0 12px}',
      '.v313-empty{color:var(--dim,#888);font-size:13px;padding:18px 0;text-align:center}',
      // v243フォールド機構に隠されないよう高詳細度で常時表示を強制
      '#topbar.v243-collapsed #v313-btn{display:inline-flex !important}',
      '#v313-btn{display:inline-flex;align-items:center}'
    ].join('');
    var st=document.createElement('style'); st.id='v313-style'; st.textContent=css; document.head.appendChild(st);
  }
  function rowHtml(c,i){
    var trig=Array.isArray(c.triggers)?c.triggers.join(', '):(c.triggers||'');
    return '<div class="v313-row" data-i="'+i+'">'+
      '<div class="v313-top">'+
        '<input type="text" data-f="name" placeholder="名前（例: 前任者ハル）" value="'+esc(c.name||'')+'">'+
        '<label class="v313-always"><input type="checkbox" data-f="always"'+(c.always?' checked':'')+'> 常時</label>'+
        '<button class="v313-del" data-del="'+i+'">削除</button>'+
      '</div>'+
      '<div class="v313-lab">トリガー語（カンマ区切り・常時ONなら不要）</div>'+
      '<input type="text" data-f="triggers" placeholder="例: ハル, 前任者, 灯" value="'+esc(trig)+'">'+
      '<div class="v313-lab">内容（確定設定・事典として常に効かせたい事実）</div>'+
      '<textarea data-f="entry" placeholder="例: 前任灯台守ハルは15年前に岩礁で死亡。その霊が霧の夜に灯室に現れる。">'+esc(c.entry||'')+'</textarea>'+
    '</div>';
  }
  function render(modal){
    var cards=getCards();
    var html=['<h2>🗂 設定カード <button class="v30-close" id="v313-x">×</button></h2>'];
    html.push('<div class="v313-hint">AIに常に効かせたい確定設定やキャラ事典を書けます。<b>常時</b>＝毎ターン必ず注入（世界ルール・誰かの死・重大な因果向き）。<b>トリガー語</b>＝その語が直近の話に出た時だけ注入（脇役・場所など）。物語は要約で薄れても、ここに書いた事実は消えません。</div>');
    if(!cards.length) html.push('<div class="v313-empty">まだカードがありません。「＋カードを追加」から作成してください。</div>');
    else cards.forEach(function(c,i){ html.push(rowHtml(c,i)); });
    html.push('<div style="margin-top:10px"><button class="v313-add" id="v313-add">＋ カードを追加</button></div>');
    modal.innerHTML=html.join('');
    bind(modal);
  }
  function bind(modal){
    var x=modal.querySelector('#v313-x'); if(x) x.addEventListener('click', close);
    var add=modal.querySelector('#v313-add'); if(add) add.addEventListener('click', function(){ getCards().push({name:'',triggers:[],entry:'',always:false}); persist(); render(modal); });
    modal.addEventListener('input', function(e){
      var t=e.target, row=t.closest&&t.closest('.v313-row'); if(!row) return;
      var i=+row.getAttribute('data-i'), f=t.getAttribute('data-f'), cards=getCards(), c=cards[i]; if(!c) return;
      if(f==='name') c.name=t.value;
      else if(f==='entry') c.entry=t.value;
      else if(f==='triggers') c.triggers=t.value.split(/[,、]+/).map(function(x){return x.trim();}).filter(Boolean);
      else if(f==='always') c.always=t.checked;
      persist();
    });
    modal.addEventListener('click', function(e){
      var d=e.target.getAttribute&&e.target.getAttribute('data-del'); if(d==null) return;
      var cards=getCards(); cards.splice(+d,1); persist(); render(modal);
    });
  }
  function close(){ var ov=document.getElementById('v313-overlay'); if(ov&&ov.parentNode) ov.parentNode.removeChild(ov); }
  function open(){
    close(); ensureStyles();
    var ov=document.createElement('div'); ov.className='v30-overlay'; ov.id='v313-overlay';
    ov.addEventListener('click', function(e){ if(e.target===ov) close(); });
    var modal=document.createElement('div'); modal.className='v30-modal v313-modal';
    ov.appendChild(modal); document.body.appendChild(ov);
    render(modal);
  }
  window.__v292Dfix313api={ open:open, buildBlock:buildBlock, getCards:getCards };

  // ---- トップバーにボタン ----
  function topbarAnchor(){
    // 最優先=可視トップバーの「⚙設定」ボタン(右端・常時表示)。無ければ「キャラ」「📁セーブ」。
    var bar=document.getElementById('topbar');
    if(bar){
      var kids=Array.prototype.slice.call(bar.children);
      var gear=kids.filter(function(c){return /^⚙?設定$/.test((c.textContent||'').replace(/\s+/g,''));})[0];
      if(gear) return gear;
      var chara=kids.filter(function(c){return /^👥?キャラ$/.test((c.textContent||'').replace(/\s+/g,''));})[0];
      if(chara) return chara;
    }
    var a=document.getElementById('v30-topbar-btn');
    if(a&&a.getBoundingClientRect().width>0) return a;
    return null;
  }
  function ensureBtn(){
    ensureStyles(); // 可視化CSS(v243フォールド対策)を常に効かせる
    var anchor=topbarAnchor(); if(!anchor||!anchor.parentNode) return;
    var b=document.getElementById('v313-btn');
    if(b){
      if(b.parentNode!==anchor.parentNode){ try{ anchor.parentNode.insertBefore(b, anchor.nextSibling); }catch(e){} }
      // v243が毎回foldable化するので念のため外す(CSSが本命の保険)
      try{ b.classList.remove('v243-foldable'); }catch(e){}
      return;
    }
    b=document.createElement('button'); b.id='v313-btn'; b.textContent='🗂 カード';
    // 設定/キャラと同じ見た目(top-btn)に寄せる
    b.className='top-btn';
    b.title='設定カード（トリガー式の確定設定・事典）';
    b.addEventListener('click', open);
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    try{ b.classList.remove('v243-foldable'); }catch(e){}
  }
  try{ setInterval(ensureBtn, 1500); }catch(e){} ensureBtn();

  try{ console.log(TAG,'loaded'); }catch(e){}
})();
