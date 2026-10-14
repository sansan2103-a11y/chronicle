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
  var VERSION951='fix951-r4c-20261014';
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
    var an=pool.anchor||null;   // ★r4b（fix954 場面の要約）: pool.anchor が無い時（r3・fix954 停止）は r3 と同じ動き
    units.forEach(function(u){ if(an && u===an.unit) return; var f=(u.first||!pool.needFirst)?1:0, k=u.level+'|'+u.pr+'|'+f; if(!groups[k]){ groups[k]=[]; keys.push({ k:k, level:u.level, pr:u.pr, f:f }); } groups[k].push(u); });
    keys.sort(function(a,z){ return (a.level-z.level)||(z.pr-a.pr)||(z.f-a.f); });
    var used=0, n=0, firstTaken={}, firstTried={}, reserve=0, anStage=0;
    // 場面の要約: 段1 が使った後に ANCHOR_MIN 字を取り置き（段2・段3 はその残りで選ぶ）→ 段4 の最初に、全文が入れば全文、入らなければ文の区切りで抜粋（ANCHOR_MAX 字まで）
    function anReserve(){ if(!an||anStage!==0) return; anStage=1; reserve=Math.min(an.min, Math.max(0,pool.cap-used)); an.res.reserve=reserve; an.res.roomAfterL1=pool.cap-used; }
    function anTake(){ if(!an||anStage===2) return; if(anStage===0) anReserve(); anStage=2; reserve=0;
      var u=an.unit, room=pool.cap-used; an.res.room=room;
      if(u.cost<=room){ u.taken=true; u.anchor=true; used+=u.cost; n++; firstTaken[u.idx]=true; levelUse[u.level]=(levelUse[u.level]||0)+u.cost; an.res.mode='full'; an.res.len=u.cost; return; }
      var ex=an.excerpt(Math.min(an.max, room));
      if(ex){ ex.taken=true; ex.anchor=true; ex.excerpt=true; units.push(ex); used+=ex.cost; n++; firstTaken[u.idx]=true; levelUse[u.level]=(levelUse[u.level]||0)+ex.cost; an.res.mode='excerpt'; an.res.len=ex.cost; an.res.full=u.cost;
        skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.head, why:'場面の要約として抜粋（'+ex.cost+'字）で届けた（全文 '+u.cost+'字は段1・段3 の後の残り '+room+'字に入らない）', len:u.cost, important:true, anchorReplaced:true }); return; }
      an.res.mode='none';
      short.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, len:u.cost, cap:room, permanent:false, important:true, anchor:true, note:'場面の要約: 段1・段3 の後の残り '+room+'字に最初の 1 文も入らない' });
      skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.head, why:'場面の要約: 段1・段3 の後の残り'+room+'字に入らない', len:u.cost, important:true, anchorShort:true }); }
    keys.forEach(function(g){ var us=groups[g.k];
      if(an){ if(g.level>=2) anReserve(); if(g.level>=4) anTake(); }
      us=us.filter(function(u){
        if(u.cost>pool.maxCap){ var permanent=true;
          short.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, len:u.cost, cap:pool.maxCap, permanent:permanent, important:u.level<=4 });
          skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.gm?null:u.head, why:'予算不足: 1'+(pool.unit||'節')+'で'+pool.kind+'の枠('+pool.maxCap+'字)を超える（この腕では選ばれない。段'+u.level+'・'+LV_NAME[u.level]+'）', len:u.cost, important:true, budgetShort:true });
          if(u.first) firstTried[u.idx]=true; return false; }
        if(pool.needFirst && !g.f && u.level>1 && !firstTaken[u.idx]){
          skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.gm?null:u.head, why:'同じ札の概要の節が'+pool.kind+'の枠に入らなかった（段'+u.level+'）', len:u.cost, important:true }); return false; }
        return true; });
      var room=pool.cap-used-reserve, kroom=(pool.kmax==null)?null:(pool.kmax-n);
      var take=bestFit(us, room, kroom);
      us.forEach(function(u,i){ if(take[i]){ u.taken=true; used+=u.cost; n++; if(u.first) firstTaken[u.idx]=true; levelUse[u.level]=(levelUse[u.level]||0)+u.cost; }
        else { var why;
          if(kroom!=null && kroom<=0) why='件数上限('+pool.kmax+'枚)（段'+u.level+'・'+LV_NAME[u.level]+'）';
          else if(u.cost>room) why=pool.kind+'の枠('+pool.cap+'字)に入らない（段'+u.level+'・'+LV_NAME[u.level]+(u.first?'・概要':'・詳細')+'の'+(pool.unit||'節')+'。上の段・小段で'+(pool.cap-room)+'字使用済み'+(reserve?'（うち場面の要約の取り置き '+reserve+'字）':'')+'）';
          else why=pool.kind+'の枠('+pool.cap+'字)の残り'+room+'字で、同じ段の組み合わせから外れた（段'+u.level+'・'+LV_NAME[u.level]+'）';
          skipped.push({ name:u.name, kind:pool.kind, sec:u.sec, level:u.level, head:u.gm?null:u.head, why:why, len:u.cost, important:true, score:u.score }); } }); });
    if(an) anTake();
    return { used:used, n:n };
  }
  function headOf(text){ var m=HEAD_RE.exec(text); return m ? safe(m[0]).slice(0,40) : null; }
  var lastSel=null;
  function select(input, opt){
    var b=budget(), cards=getCards(), names=castNames(), cast=castList(), src=sources(input);
    var gmMode=(lsGet('v292Dfix951Gm')==='withhold')?'withhold':'rule';
    var pres=(opt&&opt.pres)?opt.pres:presence(input, cards, cast), present=pres.present;   // r4: fix954 の登場判定（N2）と同じものを使う
    var delivered=(opt&&opt.delivered)||null;   // r4: user の cast.npcs で実際に届く人物像（名前 → 5 欄の本文）
    var aU=[], gA=[], tU=[], gT=[], skipped=[], short=[], trigCards=[], dedupLog=[];
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
      // ★r4b（fix954 重複除去・GPT #125-GY）: 人物の札の公開の節から、登録の 5 欄（desc・personality・coreDesire・coreFear・wound）と
      //   「完全に同じ文・項目」だけを除く（札にしか無い情報〔しないこと・秘密・口調・内面 など〕は残す）。節を丸ごと外すのは、全文が完全一致の時だけ。
      //   登場中 → user の cast.npcs で届く分を除く。未登場 → 人物像（登録の欄と同じ文）は送らない。ただし今の出来事に関係する未登場の人物
      //   （名前が今回の入力・開始時の状況・直近 2 ターンに出た／札のトリガー語が当たった。最大 REL_MAX 人）は r3 どおり段5 で残す（登場扱いにはしない）。
      var dv=(person && delivered) ? delivered[person.name] : null;
      var relAbs=!!(person && !isPresent && opt && opt.relevant && opt.relevant[person.name]);
      var pref=dv ? dv : ((person && opt && opt.dropAbsent && !isPresent && !relAbs && opt.profile) ? opt.profile[person.name] : null);
      if(person && pref){ var nx=[]; pubS.forEach(function(sx){ var dd=exactDedup(sx.text, pref);
          if(!dd.removed){ nx.push(sx); return; }
          var lv0=isPresent?3:5, why0=(dv?'user の cast.npcs で届く文・項目（完全一致）を除いた':'未登場の人物の人物像（登録の欄と完全に同じ文）は送らない（登場したら user の cast.npcs で渡す）');
          dedupLog.push({ name:name, sec:sx.idx, level:lv0, before:sx.text.length, after:dd.text.length, removedSents:dd.removed, removedChars:dd.removedChars, keptSents:dd.kept, present:isPresent });
          if(!dd.text){ skipped.push({ name:name, kind:always?'常時':'トリガー', sec:sx.idx, level:lv0, head:headOf(sx.text), why:why0+'（節の全文が一致）', len:('■ '+safe(name)+'（常時）：'+safe(sx.text)).length+1, important:false, dedup:true }); return; }
          nx.push({ idx:sx.idx, gm:false, headed:sx.headed, text:dd.text, dedupFrom:sx.text.length }); });
        pubS=nx; }
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
          aU.push({ name:name, idx:idx, sec:s.idx, pr:pr, level:lv, ev:ev.ev, first:k===0, gm:false, head:headOf(s.text), line:line, cost:line.length+1, text:s.text, dedupFrom:s.dedupFrom||null }); });
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
    // ★r4b（fix954 場面の要約・GPT #125-GY）: 人物の情報を優先しても、公開の世界観・場面の概要が押し出されないよう、常時の枠の中に
    //   ANCHOR_MIN〜ANCHOR_MAX 字の「場面の要約」を取り置く（枠の上限は上げない）。元は人物以外の常時の札の最初の公開の節（段4）。GM の節は使わない。
    var anchorRes=null, anchorOpt=null;
    if(opt && opt.anchor){
      var cands=aU.filter(function(u){ return u.level===4 && u.first && !u.gm; });
      cands.forEach(function(u){ u.sceneHit=hasScene(u.text)?1:0; });
      cands.sort(function(a,z){ return (z.sceneHit-a.sceneHit)||(z.pr-a.pr)||(a.idx-z.idx)||(a.sec-z.sec); });
      anchorRes={ mode:'none', name:null, sec:null, reserve:0, min:ANCHOR_MIN, max:ANCHOR_MAX, cands:cands.length };
      if(cands.length){ var au=cands[0]; anchorRes.name=au.name; anchorRes.sec=au.sec;
        anchorOpt={ unit:au, min:ANCHOR_MIN, max:ANCHOR_MAX, res:anchorRes, excerpt:function(cap){ return anchorExcerpt(au, cap); } }; }
    }
    var rA;
    if(anchorOpt){
      // 取り置きで押し出された節（取り置きが無ければ入っていた節）を budgetShort に残す（dry run は複製で行い、本物には影響しない）
      var dryU=aU.map(function(u){ var o={}, k; for(k in u) o[k]=u[k]; o.taken=false; return o; }), dryS=[], dryB=[], dryL={};
      pickLevels(dryU, { kind:'常時', cap:b.alwaysTotal, maxCap:b.alwaysTotal, needFirst:true }, dryS, dryB, dryL);
      rA=pickLevels(aU, { kind:'常時', cap:b.alwaysTotal, maxCap:b.alwaysTotal, needFirst:true, anchor:anchorOpt }, skipped, short, lvA);
      aU.forEach(function(u,i){ if(i<dryU.length && dryU[i].taken && !u.taken && u!==anchorOpt.unit){
        short.push({ name:u.name, kind:'常時', sec:u.sec, level:u.level, len:u.cost, cap:b.alwaysTotal, permanent:false, important:u.level<=4, byAnchor:true, note:'場面の要約（'+(anchorRes.len||0)+'字）の取り置きで押し出された' });
        skipped.forEach(function(x){ if(x.kind==='常時' && x.name===u.name && x.sec===u.sec && !x.dedup) x.byAnchor=true; }); } });
    } else rA=pickLevels(aU, { kind:'常時', cap:b.alwaysTotal, maxCap:b.alwaysTotal, needFirst:true }, skipped, short, lvA);
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
    var outA=aU.filter(function(u){ return u.taken; }).sort(ord).map(function(u){ var o={ name:u.name, key:safe(u.name), line:u.line, sec:u.sec, level:u.level, ev:u.ev, len:u.cost }; if(u.anchor) o.anchor=u.excerpt?'excerpt':'full'; if(u.dedupFrom) o.dedupFrom=u.dedupFrom; return o; });
    var outT=tU.filter(function(u){ return u.taken; }).map(function(u){ return { name:u.name, key:u.key, line:u.line, why:u.why, level:u.level, ev:u.ev, len:u.cost }; });
    var outGA=gA.filter(function(u){ return u.taken; }).sort(ord).map(function(u){ return { name:u.name, key:'GM専用：'+safe(u.name), line:u.line, sec:u.sec, level:u.level, ev:u.ev, len:u.cost }; });
    var outGT=gT.filter(function(u){ return u.taken; }).map(function(u){ return { name:u.name, key:u.key, line:u.line, level:u.level, ev:u.ev, len:u.cost }; });
    var picked=outA.concat(outT).concat(outGA).concat(outGT);
    var uniq=function(a){ var o=[]; a.forEach(function(x){ if(o.indexOf(x.name)<0) o.push(x.name); }); return o.length; };
    var kept=outA.map(function(p){ var o={ name:p.name, kind:'常時', sec:p.sec, level:p.level, ev:p.ev, len:p.len }; if(p.anchor) o.anchor=p.anchor; if(p.dedupFrom) o.dedupFrom=p.dedupFrom; return o; }).concat(outT.map(function(p){ return { name:p.name, kind:'トリガー', sec:null, why:p.why, level:p.level, ev:p.ev, len:p.len }; }))
      .concat(outGA.map(function(p){ return { name:p.name, kind:'GM常時', sec:p.sec, level:p.level, ev:p.ev, len:p.len }; })).concat(outGT.map(function(p){ return { name:p.name, kind:'GMトリガー', sec:null, level:p.level, ev:p.ev, len:p.len }; }));
    lastSel={ at:Date.now(), version:VERSION951, arm:b.arm, budget:b, gmMode:gmMode, names:picked.map(function(p){ return p.key; }), kept:kept,
      always:uniq(outA), alwaysSecs:outA.length, trig:outT.length, gm:uniq(outGA.concat(outGT)), gmSecs:outGA.length+outGT.length,
      chars:{ always:rA.used, trig:rT.used, gm:usedGA+usedGT, gmAlways:usedGA, gmTrig:usedGT }, gmWithheld:gmWithheld,
      levels:{ always:lvA, trig:lvT, gmAlways:lvGA, gmTrig:lvGT }, caps:{ always:b.alwaysTotal, trig:b.trigTotal, trigMax:b.trigMax, gmAlways:(gmMode==='withhold'?0:Math.max(0,b.gmTotal-b.gmTrigReserve)), gmTrig:(gmMode==='withhold'?0:b.gmTotal-usedGA) }, present:present,
      budgetShort:short, skipped:skipped, cut:[] };
    if(opt && (opt.anchor!==undefined || opt.delivered || opt.dropAbsent)){ lastSel.anchor=anchorRes; lastSel.dedup=dedupLog; lastSel.relevant=opt.relevantNames?opt.relevantNames.slice():(opt.relevant?Object.keys(opt.relevant):[]); lastSel.relevantInCards=opt.relevant?Object.keys(opt.relevant):[]; }
    try{ var sig=skipped.filter(function(x){ return x.kind!=='トリガー'; }).map(function(x){ return x.kind+':'+x.name+(x.sec!=null?'#'+x.sec:''); }).join('|');
      if(sig && sig!==warnedSig){ warnedSig=sig; console.warn(TAG,'枠に入らず送らなかった節・札があります（lastSelection().skipped）', sig); } }catch(e){}
    try{ var ss=short.filter(function(x){ return x.important; }).map(function(x){ return x.kind+':'+x.name+(x.sec!=null?'#'+x.sec:'')+'('+x.len+'>'+x.cap+(x.permanent?'':'?')+')'; }).join('|');
      if(ss && ss!==warnedShort){ warnedShort=ss; console.warn(TAG,'予算不足: 重要な節・札が枠より大きく、この腕では選ばれません（lastSelection().budgetShort）', ss); } }catch(e){}
    return picked;
  }
  var warnedSig='', warnedShort='';
  function buildBlock(input){ return buildBlockWith(input, undefined, null); }
  // act: canary951() の結果（undefined なら、ここで 1 回だけ聞く）。opt: { pres, delivered }（r4 の fix954）
  function buildBlockWith(input, act, opt){
    if(off()) return '';
    if(act===undefined) act=canary951();
    if(!act || f951off()){ lastSel=null; return buildBlockLegacy(); }   // 本番の組み立て（canary 外・選択器 OFF）
    var cards=getCards(); if(!cards.length){ lastSel=null; return ''; }
    var picked=select(input, opt);
    if(!picked.length) return '';
    var hasGm=picked.some(function(p){ return p.key.indexOf('GM専用：')===0; });
    var rule=hasGm?RULE:RULE.split('\n')[0];
    return '\n\n'+MARK+'（常に効く確定設定・事典。参照用。本文に説明書きを混ぜない）】\n'+rule+'\n'+picked.map(function(p){ return p.line; }).join('\n');
  }
  // =====================================================================
  // ★fix954 r4b（2026-10-14・GPT 裁定 #125-GX → #125-GY の必須変更）: canary r4b の一部。fix953 の関所が true の時（canary 物語・開発者 PC）だけ動く。
  //   false の時・v292Dfix954Off='1' の時は 1 バイトも動かない（r3 と同じ）。保存しない・S を書き換えない・送信しない。読むのは S と localStorage のスイッチだけ。
  //   (1) 場面の要約（既定 ON）: 常時の枠（上限は上げない）の中に ANCHOR_MIN〜ANCHOR_MAX 字の公開の世界観・場面の概要を取り置く。
  //       順: 段1（規則）→ 取り置き ANCHOR_MIN → 段2・段3（登場中の人物の内面など）→ 段4 の先頭で場面の要約（全文が入れば全文、入らなければ文の区切りで抜粋）。
  //       元は人物以外の常時の札の最初の公開の節（GM の節は使わない）。押し出した節は lastSelection().budgetShort に byAnchor で残す。
  //   (2) 登場判定（N2・厳格化）: いま登場中 =
  //         ・直近 2 ターンの会話ログ・話者タグの確定話者（完全名・登録された別名）
  //         ・T0: 開始時の状況（startCondition）で「同席している」と明示された NPC（行方不明・探している・待っている・別の場所・伝聞は数えない）
  //         ・T1: 上と同じ。ただし 0 ターン目で場面が続き、その NPC の退場・移動・不在の兆しが無い時だけ
  //       今回の入力・直近 2 ターンの本文に名前が出ただけでは登場扱いにしない。fix95 の消えない印（appeared）だけでも登場扱いにしない（印は書き換えない）。
  //   (3) psychAnchors: 既定は触らない（本番の値のまま）。v292Dfix954PsychSync='1' で cast.npcs と同じ顔ぶれに値つきで合わせる／
  //       v292Dfix954PsychRef='1' で r4 と同じく NPC の値を繰り返さない（ref）。
  //   (4) 未登場の NPC: 人物像（登録の欄と同じ文）は既定で送らない。今の出来事に関係する未登場の NPC（名前が今回の入力・開始時の状況・直近 2 ターンに
  //       出た／札のトリガー語が当たった。最大 REL_MAX 人）だけ、札の人物像を r3 どおり段5 で残す。cast.npcs には入れない（登場扱いにしない）。
  //   (5) 重複除去: 人物の札の節から、登録の 5 欄と完全に同じ文・項目だけを除く（8 割で節ごと外す r4 の規則は廃止）。
  //   スイッチ（localStorage・canary の中だけ）: v292Dfix954Off='1'（全部止める＝r3）／v292Dfix954Anchor='off'／v292Dfix954Pres='r4'（r4 の広い登場判定）／
  //     v292Dfix954N2='off'（fix95・r3 の判定）／v292Dfix954Mode='union'（fix95 の印の人物も残す）／v292Dfix954StartWin='1'（開始時の状況は T0 だけ）／
  //     v292Dfix954PsychSync='1'／v292Dfix954PsychRef='1'／v292Dfix954AbsentRel='off'（関係する未登場の人物も人物像を送らない）／
  //     v292Dfix954Absent='keep'（未登場の人物の人物像を全員 r3 どおり）／v292Dfix954Dedup='off'（カードの重複除去を止める）
  //   ★r4c（2026-10-14・GPT 裁定 #126-C）: (A) 登場中の判定は「入った証拠 → 明示の退場・場面の切れ目まで続く」（黙っている・名前が出ないのは退場ではない。
  //     直近 CARRY_WIN ターンを毎回読み直す。保存しない）。送信 sys の fix192【自発】に出た NPC は登場中にそろえる。(B) 関係する未登場の NPC（最大 REL_MAX 人）は
  //     user の cast.offstage に REL_PROF_MIN〜REL_PROF_MAX 字の関係プロフィールで渡す（cast.npcs とは別・登場させない注記つき。v292Dfix954Offstage='off' で r4b どおり札の段5）。
  //     (D) 開始時の状況で主語が動作しているだけ（場所が主人公と同じと明示されない）は同席にしない（関係する人物）。(E) psychAnchors は保存値を変えず、
  //     送信時に登場中・関係する NPC の欄だけ残す（v292Dfix954PsychFilter='off' で止める）。v292Dfix954Pres='r4b' で r4b の登場判定。
  //   検証口（読むだけ・本文は出さない）: window.__v292Dfix954.last()
  // =====================================================================
  var VERSION954='fix954-r4h-20261015', N2_WIN=PRESENT_WIN, ANCHOR_MIN=200, ANCHOR_MAX=400, REL_MAX=2, CARRY_WIN=8, LOOKBACK_MAX=60, REL_PROF_MIN=100, REL_PROF_MAX=150;
  // ★r4d（GPT #126-E）: CARRY_WIN は登場の有効期限ではない。読み直しの範囲は「最後の場面の切れ目」まで（最大 LOOKBACK_MAX ターン）。
  //   【自発】（fix192）は登場の根拠にしない（info.agendaNotPresent に記録だけ）。psychAnchors の絞り込みは既定 OFF（'on' で有効）。cast.offstage の注記は自然な登場を妨げない文に。
  var NOTE24='各キャラの恐怖・欲望・傷は narrative の地の文に間接的に滲ませる。クリシェ反応(鼓動が速まる/息を呑む/身体が冷える 等)ではなく、そのキャラ固有の身体記憶・連想・過去の傷との結びつきで表現する。';
  var REF954='NPC の coreFear / coreDesire / wound は cast.npcs の同名の欄にある（ここでは繰り返さない）';
  var last954=null, done954=(typeof WeakMap==='function')?new WeakMap():null;   // build の結果 r → { pres, delivered, relevant }（同じ r を 2 回書き換えない）
  // ★r4h（BUNDLE2・2026-10-15）: 既定 OFF で配信（GPT #126-S: NPC は生成比較の後に既定を判断）。この端末で v292Dfix954On='1' の時だけ動く。
  //   DEFAULT_ON954 を true にした js 1 本で全体 ON に切り替える。v292Dfix954Off='1' は常に優先して止める。
  var DEFAULT_ON954 = true;   // ★BUNDLE3（2026-10-15・NPC 生成比較で悪化なし）: 既定 ON。停止 v292Dfix954Off=1
  function f954off(){ if(lsGet('v292Dfix954Off')==='1') return true; if(DEFAULT_ON954) return false; return lsGet('v292Dfix954On')!=='1'; }
  // fix533b と同じ許可方式（前: 語を作る文字でない／後: 行末・空白・閉じ括弧・句読点・助詞・敬称）
  var PRE_BAD=/[一-鿿゠-ヿｦ-ﾝーA-Za-z0-9０-９ａ-ｚＡ-Ｚ]/;
  var POST_OK=/[\s　」』）)】\]〉》〕｝}・…—―、。，．！？!?:：;；\n\r]/;
  var POST_PARTICLE=/^(?:は|が|を|に|へ|と|も|で|の|や|ね|よ|か|から|まで|より|こそ|さえ|しか|だけ|さん|ちゃん|くん|君|様|さま|殿|氏|先輩|先生|たち|達|ら)/;
  function okAt(s, i, w){ var before=(i===0)?'':s.charAt(i-1), rest=s.slice(i+w.length);
    return (before===''||!PRE_BAD.test(before)) && (rest===''||POST_OK.test(rest.charAt(0))||POST_PARTICLE.test(rest)); }
  function usedAsPerson(text, w){ if(!text||!w) return false; var s=String(text), i=s.indexOf(w);
    while(i>=0){ if(okAt(s, i, w)) return true; i=s.indexOf(w, i+1); }
    return false; }
  var KANJI_ONLY=/^[々〆一-鿿㐀-䶿豈-﫿]+$/, KANA_ONLY=/^[ぁ-ゟ゠-ヿｦ-ﾟ]+$/, HAS_KANJI=/[一-鿿㐀-䶿]/;
  function aliasesOf(name, n){ var out=[];
    try{ var m=String(n&&n.desc||'').match(/(^|\n)[\s　]*別名[:：]([^\n]+)/); if(m) m[2].split(/[、,，・\/／]/).forEach(function(a){ a=String(a).trim(); if(a && a!==name && a.length<=12) out.push(a); }); }catch(e){}
    try{ var qp=window.__v292QuasiPack; if(qp && typeof qp.aliasMap==='function'){ var am=qp.aliasMap()||{}; Object.keys(am).forEach(function(a){ if(am[a]===name && a && a!==name && out.indexOf(a)<0) out.push(a); }); } }catch(e){}
    return out; }
  // 名前の形: { w, kind: 'full' | 'part' | 'guess' | 'alias' | 'trig', plain: 素の一致か }
  function nameForms(n, cards){
    var name=String(n.name).trim(), forms=[], seen={};
    function add(w, kind){ w=String(w||'').trim(); if(!w || seen[w]) return; if(kind!=='full' && w.length<2) return; seen[w]=1;
      var plain=(kind==='full' && w.length>=3 && HAS_KANJI.test(w) && !KANA_ONLY.test(w));
      forms.push({ w:w, kind:kind, plain:plain }); }
    add(name,'full'); add(name.replace(/[\s　]+/g,''),'full');
    if(/[\s　・･]/.test(name)) name.split(/[\s　・･]+/).forEach(function(p){ add(p,'part'); });
    else if(KANJI_ONLY.test(name) && name.length>=3 && name.length<=6){ for(var k=2;k<name.length;k++){ add(name.slice(0,k),'guess'); add(name.slice(name.length-k),'guess'); } }
    aliasesOf(name, n).forEach(function(a){ add(a,'alias'); });
    (cards||[]).forEach(function(c){ if(personOf(c,[{ name:name, hero:false }])) trigWords(c).forEach(function(t){ add(t,'trig'); }); });
    return forms; }
  function formHit(text, f){ return f.plain ? String(text||'').indexOf(f.w)>=0 : usedAsPerson(text, f.w); }
  function hitsOf(text, f){ var s=String(text||''), out=[], i=s.indexOf(f.w); while(i>=0){ if(f.plain || okAt(s, i, f.w)) out.push(i); i=s.indexOf(f.w, i+1); } return out; }
  // ---- 開始時の状況の読み方（r4b）: 名前の出た節（読点・句点で区切った 1 区切り）の手がかりの語で分ける ----
  var SC_STRONG_ABS=/行方不明|失踪|消息を絶|消息不明|消息が途絶|姿を消|消えた|消えて|いなくな|亡くな|死ん|死去|他界|不在|来ない|来なかった|来られない|連絡が(取れ|つか|途絶)|音信不通|戻らな|戻って(こ|来)な|帰らな|帰って(こ|来)な|見つから|攫われ|さらわれ|連れ去|囚われ|捕らわれ|閉じ込め/;
  var SC_CO=/一緒|いっしょ|隣|となり|傍ら|かたわら|そば|側に|並んで|同行|連れ立|向かい合|向かいに|共に|ともに|二人で|三人で|四人で|と(いる|居る)|合流し(た|て)|目の前/;   // r4c: 「〜がいる」「〜もいる」だけでは主人公と同じ場か分からないので外した
  var SC_ACT=/座って|立って|佇ん|たたずん|笑って|話して|歩いて|構えて|振り返|俯い|うつむ|手を振|駆け寄|覗き込|見つめ|微笑|頷|うなず/;
  var SC_WEAK_ABS=/探し|探す|探さ|捜し|捜す|捜さ|捜索|待ち合わせ|待ち合せ|待って|待つ|待ち|向かっている|向かう途中|遅れ|別の場所|離れ|遠く|会いに|会う約束|約束|来る予定|来るはず|到着|合流する|合流予定|現れ(る|ない)|後から|あとから/;
  var SC_HEARSAY=/と言って|と言った|らしい|そうだ|と聞い|という話|噂|によると|からの(連絡|メッセージ|電話)|メッセージ|電話|メール|LINE|手紙/;
  var SC_BREAK=/<scene_move|場面が変わ|場面転換|翌日|翌朝|翌晩|翌週|数日後|数時間後|一週間後|一か月後|その夜|後日|◇◇|◆◆|＊＊＊|\*\*\*|――――/;
  // ★r4e（#126-F B）: 実行済みの場面移動（モデルの <scene_move> タグ）だけを同席の解除にする。時間の経過・区切り線・plan の移動の記録は「同席の再確認が要る」に
  // ★r4f（#126-G の確認）: <scene_move> は fix645 の「主人公が移動を完了した」印で、S.save の時に turn.narrative から剥がされ（t.__f645nprev・plan.narrative に残る）、
  //   本文との一致で受理された物だけ端末の v292Dfix645_log に記録される。主人公と一緒に NPC が移ることもあるので **NPC の退場の証拠にはしない**（同席の再確認にする）。
  var SC_MOVE_EXEC=/<scene_move/, SC_TIMESKIP=/場面が変わ|場面転換|翌日|翌朝|翌晩|翌週|数日後|数時間後|一週間後|一か月後|その夜|後日|◇◇|◆◆|＊＊＊|\*\*\*|――――/;
  var SC_EXIT=/去っ|去る|去り|立ち去|帰っ|帰る|帰宅|出て行|出ていっ|出ていく|別れ|離れ|姿を消|いなくな|見えなくな|行ってしま|走り去|消え/;
  var SC_MOVE_IN=/向かう|移動|出かけ|出発|立ち去|帰る|帰宅|別れ|離れる/;
  function spanOf(s, i, re){ var a=i, b=i; while(a>0 && !re.test(s.charAt(a-1))) a--; while(b<s.length && !re.test(s.charAt(b))) b++; return s.slice(a, Math.min(s.length, b+1)); }
  var CLAUSE_END=/[。！？!?\n、，,]/, SENT_END=/[。！？!?\n]/;
  // 戻り: null（名前が無い）| 'present' | 'absent:missing' | 'absent:elsewhere' | 'mention:hearsay' | 'mention:ambiguous' | 'mention:neutral'
  function classifyStart(text, forms){
    var s=String(text||''), tags=[];
    forms.forEach(function(f){ hitsOf(s, f).forEach(function(i){ var cl=spanOf(s, i, CLAUSE_END), se=spanOf(s, i, SENT_END), c;
      var subj=new RegExp(f.w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:さん|ちゃん|くん)?(?:が|は|も)').test(cl);
      if(SC_STRONG_ABS.test(cl)) c='absent:missing';
      else if(SC_CO.test(cl)) c='present';
      else if(subj && SC_ACT.test(cl) && !SC_WEAK_ABS.test(cl)) c='mention:ambiguous';   // r4c（#126-C D）: 主語で動作していても主人公と同じ場と明示されていなければ同席にしない（関係する人物として扱う）
      else if(SC_WEAK_ABS.test(cl)) c='absent:elsewhere';
      else if(SC_HEARSAY.test(cl)) c='mention:hearsay';
      else if(SC_CO.test(se) && !SC_STRONG_ABS.test(se) && !SC_WEAK_ABS.test(se) && !SC_HEARSAY.test(se)) c='present';
      else c='mention:neutral';
      tags.push(c); }); });
    if(!tags.length) return null;
    if(tags.indexOf('absent:missing')>=0) return 'absent:missing';
    if(tags.indexOf('present')>=0) return 'present';
    if(tags.indexOf('absent:elsewhere')>=0) return 'absent:elsewhere';
    return tags[0];
  }
  function sceneContinues(t0, input){
    var why=[];
    try{ var nar=String(t0&&t0.narrative||''); if(SC_BREAK.test(nar)) why.push('0ターン目に場面の切れ目'); }catch(e){}
    try{ var p=t0&&t0.plan; if(p && Object.keys(p).some(function(k){ return /scene_?move|moveTo|newLoc/i.test(k) && p[k]; })) why.push('0ターン目に移動の記録'); }catch(e){}
    if(input && SC_MOVE_IN.test(String(input))) why.push('今回の入力に移動の語');
    return { ok:!why.length, why:why };
  }
  function exitIn(t0, forms){ var txt=String(t0&&t0.narrative||'')+'\n'+String(t0&&(t0.playerText||t0.player)||''), bad=false;
    forms.forEach(function(f){ hitsOf(txt, f).forEach(function(i){ var cl=spanOf(txt, i, CLAUSE_END); if(SC_EXIT.test(cl) || SC_STRONG_ABS.test(cl)) bad=true; }); }); return bad; }
  function whoOf(rec){ var who={}; rec.forEach(function(t){
      try{ (t&&t._convSays||[]).forEach(function(c){ if(c&&c.who) who[String(c.who).trim()]=true; }); }catch(e){}
      try{ ((t&&t.plan&&t.plan._v254who)||[]).forEach(function(w){ if(w) who[String(w).trim()]=true; }); }catch(e){} }); return who; }
  // r4b の登場判定（厳格）。戻り { present:{名前:理由}, who, ev:{名前:{why,kind}}, start:{名前:分類}, mentioned:{名前:[出所]}, scene:{ok,why} }
  function presentStrict(input){
    var s=getS(), turns=(s&&Array.isArray(s.turns))?s.turns:[], cast=castList(), cards=getCards(), out={}, ev={}, start={}, mentioned={};
    var npcs=(s&&s.cast&&Array.isArray(s.cast.npcs))?s.cast.npcs:[];
    var sw=(lsGet('v292Dfix954StartWin')==='1')?1:N2_WIN;   // 開始時の状況を見る期間（既定 2 = T0 と T1。'1' = T0 だけ）
    var useStart=(turns.length<sw && s && s.scene), sc=(turns.length===0)?{ ok:true, why:[] }:sceneContinues(turns[0], input);
    var stext=useStart?String(s.scene.startCondition||''):'';
    var rec=turns.slice(-N2_WIN), who=whoOf(rec);
    var recText=rec.map(function(t){ return (t&&t.narrative||'')+'\n'+(t&&(t.playerText||t.player)||''); }).join('\n');
    cast.forEach(function(m){ if(m.hero) out[m.name]='主人公'; });
    npcs.forEach(function(n){ if(!n||!n.name) return; var name=String(n.name), forms=nameForms(n, cards);
      if(out[name]) return;
      var mm=[]; if(input && forms.some(function(f){ return formHit(input, f); })) mm.push('今回の入力');
      if(stext && forms.some(function(f){ return formHit(stext, f); })) mm.push('開始時の状況');
      if(recText && forms.some(function(f){ return formHit(recText, f); })) mm.push('直近'+N2_WIN+'ターン');
      if(mm.length) mentioned[name]=mm;
      for(var a=0;a<forms.length;a++){ var f=forms[a]; if((f.kind==='full'||f.kind==='alias') && who[f.w]){ out[name]='会話ログの話者'; ev[name]={ why:'会話ログの話者', kind:f.kind }; return; } }
      if(stext){ var c=classifyStart(stext, forms); if(c) start[name]=c;
        if(c==='present'){
          if(turns.length===0){ out[name]='開始時の状況（同席）'; ev[name]={ why:out[name], kind:'start' }; return; }
          if(sc.ok && !exitIn(turns[0], forms)){ out[name]='開始時の状況（T1・場面が続く）'; ev[name]={ why:out[name], kind:'start' }; return; }
          start[name]=c+(sc.ok?'/退場の兆し':'/場面が切れた'); } }
    });
    return { present:out, who:who, ev:ev, start:start, mentioned:mentioned, scene:sc };
  }
  // r4 の登場判定（v292Dfix954Pres='r4' の時だけ・A/B 用）
  function presentR4(input){
    var s=getS(), turns=(s&&Array.isArray(s.turns))?s.turns:[], cast=castList(), cards=getCards(), out={}, ev={}, texts=[];
    var npcs=(s&&s.cast&&Array.isArray(s.cast.npcs))?s.cast.npcs:[];
    if(input) texts.push({ why:'今回の入力', text:String(input) });
    var sw=(lsGet('v292Dfix954StartWin')==='1')?1:N2_WIN;
    if(turns.length<sw && s&&s.scene) texts.push({ why:'開始時の状況', text:[s.scene.startCondition, s.scene.startRules, s.scene.obj].map(function(x){ return String(x||''); }).join('\n') });
    var rec=turns.slice(-N2_WIN), who=whoOf(rec);
    rec.forEach(function(t){ texts.push({ why:'直近'+N2_WIN+'ターン', text:(t&&t.narrative||'')+'\n'+(t&&(t.playerText||t.player)||'') }); });
    cast.forEach(function(m){ if(m.hero) out[m.name]='主人公'; });
    npcs.forEach(function(n){ if(!n||!n.name) return; var name=String(n.name), forms=nameForms(n, cards);
      if(out[name]) return;
      for(var a=0;a<forms.length;a++){ var f=forms[a]; if(f.kind==='full'||f.kind==='alias'){ if(who[f.w]){ out[name]='会話ログの話者'; ev[name]={ why:'会話ログの話者', kind:f.kind }; return; } } }
      for(var i=0;i<texts.length;i++){ for(var j=0;j<forms.length;j++){ if(formHit(texts[i].text, forms[j])){ out[name]=texts[i].why; ev[name]={ why:texts[i].why, kind:forms[j].kind }; return; } } }
    });
    return { present:out, who:who, ev:ev, start:{}, mentioned:{}, scene:null };
  }
  // ---- r4c（GPT #126-C）: 登場判定 = 入った証拠 → 明示の退場・場面の切れ目まで続く（黙っていること・名前が出ないことは退場ではない）----
  //   入った証拠: 直近 CARRY_WIN ターンの中の 会話ログの確定話者／本文で名前の区切りに登場の語（現れた・やって来た・駆け寄った・合流した 等）／
  //     fix192 と同じ在場の窓（直近 2 ターン）で本文に名前が出て、その区切りが遠隔（電話・写真・噂 等）・不在・退場でない／T0 の開始時の状況で同席と明示。
  //   出た証拠: 名前の区切りに退場の語（立ち去った・帰った・別れた 等）・強い不在の語／その後の場面の切れ目（翌朝・<scene_move> 等）／
  //     プレイヤーの入力が「一人で・置いて・別れて」＋移動（主人公だけが離れる）。
  //   さらに、送信 sys の fix192【自発】に名前が出た NPC は登場中にそろえる（sys で動くよう促す人を cast.npcs から外さない）。
  //   入力・直近の本文に名前が出ただけ（遠隔の言及）・fix95 の印だけ は登場扱いにしない（関係する未登場の候補）。保存しない（毎回 S.turns から組み立てる）。
  var SC_ENTER=/現れ|やって来|やってき|入って来|入ってき|駆け寄|駆けて来|駆けてく|姿を見せ|姿を現|合流し|顔を出|戻って来|戻ってき|追いつ|到着し|近づいてき|近づいて来/;
  var SC_REMOTE=/電話|メッセージ|メール|LINE|手紙|写真|思い出|噂|話題|名前を|と言って|と言った|らしい|夢|画面|スマホ|通知|SNS|記憶|昔|かつて|聞いた|聞かされ/;
  var SC_CALL=/電話|通話|受話器|メッセージ|メール|LINE|手紙|画面|スマホ|通知|SNS|写真|ビデオ/;   // ★r4g: 通話・文字・画像越し（不在）。噂・回想・伝聞は同席未確認
  var SC_LEAVE_IN=/(一人で|ひとりで|置いて|別れて|別れ、|残して)/;
  function sysAgendaNames(sys){ var out={}; try{ var s=String(sys||''), at=s.indexOf('【自発('); if(at<0) return out; var nx=s.indexOf('\n【', at+1), blk=s.slice(at, nx>=0?nx:s.length);
      blk.split('\n').forEach(function(l){ var m=/^・(.+?)は(内心『|傷\()/.exec(l); if(m) out[m[1]]=true; }); }catch(e){} return out; }
  function presentR4c(input, sys){
    var s=getS(), turns=(s&&Array.isArray(s.turns))?s.turns:[], cast=castList(), cards=getCards(), out={}, ev={}, start={}, mentioned={}, track={};
    var npcs=(s&&s.cast&&Array.isArray(s.cast.npcs))?s.cast.npcs:[];
    var base=Math.max(0, turns.length-LOOKBACK_MAX), rec2=turns.length-N2_WIN;
    if(lsGet('v292Dfix954Carry')==='win') base=Math.max(0, turns.length-CARRY_WIN);   // r4c と同じ 8 ターン窓（A/B 用）
    // ★r4f: 読み直しの起点を場面移動で切らない（主人公の移動は NPC の退場ではない）。上限 LOOKBACK_MAX ターンだけ
    var capped=(lsGet('v292Dfix954Carry')!=='win' && base===Math.max(0, turns.length-LOOKBACK_MAX) && base>0);
    var sw=(lsGet('v292Dfix954StartWin')==='1')?1:N2_WIN;
    var useStartMention=(turns.length<sw && s && s.scene);
    var stext=(s && s.scene)?String(s.scene.startCondition||''):'';
    var formsBy={}, callOnly={}; npcs.forEach(function(n){ if(n&&n.name) formsBy[String(n.name)]=nameForms(n, cards); });
    var names=Object.keys(formsBy);
    cast.forEach(function(m){ if(m.hero) out[m.name]='主人公'; });
    function setIn(nm, why, at){ track[nm]={ st:'in', why:why, at:at }; }
    function setOut(nm, why, at){ if(track[nm] && (track[nm].st==='in'||track[nm].st==='recheck')) track[nm]={ st:'out', why:why, at:at }; }
    function setRecheck(nm, why, at){ if(track[nm] && track[nm].st==='in') track[nm]={ st:'recheck', why:why, at:at, was:track[nm].why }; }
    // 開始時の状況（T0 の前）: 同席と明示された NPC だけ入る。T0・T1 では言及を「関係する」の候補にする
    if(stext && base===0) names.forEach(function(nm){ var c=classifyStart(stext, formsBy[nm]); if(!c) return; start[nm]=c;
      if(c==='present') setIn(nm, '開始時の状況（同席）', -1); });
    if(stext && useStartMention) names.forEach(function(nm){ if(start[nm]) (mentioned[nm]=mentioned[nm]||[]).push('開始時の状況'); });
    for(var i=base;i<turns.length;i++){ var t=turns[i]||{}, nar=String(t.narrative||''), pt=String(t.playerText||t.player||'');
      var mvTag=SC_MOVE_EXEC.test(nar) || SC_MOVE_EXEC.test(String(t.__f645nprev||'')) || SC_MOVE_EXEC.test(String((t.plan&&t.plan.narrative)||''));
      var mvx=false, tsk=mvTag || SC_TIMESKIP.test(nar), pmv=false;   // ★r4f: 主人公の移動（<scene_move>）は時間の経過と同じ「同席の再確認」 try{ var p=t.plan; if(p && Object.keys(p).some(function(k){ return /scene_?move|moveTo|newLoc/i.test(k) && p[k]; })) pmv=true; }catch(e){}
      if(mvx || (pt && SC_LEAVE_IN.test(pt) && SC_MOVE_IN.test(pt))) names.forEach(function(nm){ setOut(nm, mvx?'場面移動（実行済み）':'主人公だけが離れた（入力）', i); });
      else if(tsk || pmv) names.forEach(function(nm){ setRecheck(nm, mvTag?'主人公が移動した（同席は再確認が要る）':(tsk?'時間の経過・場面の区切り（同席は再確認が要る）':'plan の移動の記録（実行は未確認）'), i); });
      var who=whoOf([t]);
      names.forEach(function(nm){ var fs=formsBy[nm], spoke=false;
        for(var a=0;a<fs.length;a++){ if((fs[a].kind==='full'||fs[a].kind==='alias') && who[fs[a].w]){ spoke=true; break; } }
        if(spoke) setIn(nm, '会話ログの話者', i);
        var exitHit=false, enterHit=false, inScene=false, remote=false, callHit=false;
        fs.forEach(function(f){ hitsOf(nar, f).forEach(function(k){ var cl=spanOf(nar, k, CLAUSE_END);
          if(SC_EXIT.test(cl) || SC_STRONG_ABS.test(cl)) exitHit=true;
          else if(SC_REMOTE.test(cl) || SC_WEAK_ABS.test(cl) || SC_HEARSAY.test(cl)){ remote=true; if(SC_CALL.test(cl)) callHit=true; }
          else if(SC_ENTER.test(cl)) enterHit=true;
          else inScene=true; }); });
        if(!spoke && enterHit) setIn(nm, '本文で登場', i);
        else if(!spoke && inScene && i>=rec2) setIn(nm, '場面にいる（直近 '+N2_WIN+' ターンの本文・fix192 と同じ窓）', i);
        if(exitHit) setOut(nm, '本文で退場', i);
        if(i>=rec2 && (remote||enterHit||inScene||exitHit) && (mentioned[nm]||[]).indexOf('直近'+N2_WIN+'ターン')<0) (mentioned[nm]=mentioned[nm]||[]).push('直近'+N2_WIN+'ターン');
        if(i>=rec2 && callHit && !inScene && !enterHit) callOnly[nm]=true; else if(i>=rec2 && (inScene||enterHit)) delete callOnly[nm];
      });
    }
    if(input && SC_LEAVE_IN.test(String(input)) && SC_MOVE_IN.test(String(input))) names.forEach(function(nm){ setOut(nm, '主人公だけが離れる（今回の入力）', turns.length); });
    var ag=sysAgendaNames(sys), agendaNot=[], recheck={}, unknown={};
    names.forEach(function(nm){
      if(input && formsBy[nm].some(function(f){ return formHit(input, f); })) (mentioned[nm]=mentioned[nm]||[]).unshift('今回の入力');
      if(track[nm] && track[nm].st==='in'){ out[nm]=track[nm].why; ev[nm]={ why:track[nm].why, at:track[nm].at }; }
      else if(ag[nm]) agendaNot.push(nm);   // ★r4d: 【自発】は登場の根拠にしない（記録だけ）
      if(track[nm] && track[nm].st==='recheck'){ recheck[nm]=track[nm].why; (mentioned[nm]=mentioned[nm]||[]).push('同席の再確認'); }
    });
    var gone={}; names.forEach(function(nm){ if(track[nm] && track[nm].st==='out') gone[nm]=track[nm].why; });
    // ★r4e（#126-F A）: 探索の上限の外でだけ登場していた人は「存在不明」（退場ではない・cast.npcs には入れない・記録だけ）
    if(capped){ names.forEach(function(nm){ if(out[nm] || track[nm]) return; var fs=formsBy[nm], seen=false;
      for(var j=Math.max(0, base-LOOKBACK_MAX); j<base && !seen; j++){ var tt=turns[j]||{}, w=whoOf([tt]); for(var a=0;a<fs.length;a++){ if((fs[a].kind==='full'||fs[a].kind==='alias') && w[fs[a].w]){ seen=true; break; } } }
      if(seen) unknown[nm]='探索範囲（'+LOOKBACK_MAX+' ターン）の外で話者（存在不明）'; }); }
    return { present:out, who:whoOf(turns.slice(-N2_WIN)), ev:ev, start:start, mentioned:mentioned, scene:null, gone:gone, agendaNotPresent:agendaNot, lookbackFrom:base, recheck:recheck, unknown:unknown, callOnly:callOnly };
  }
  // 関係する未登場の NPC（最大 REL_MAX 人。入力 → 開始時の状況 → 直近 の順、同じなら登録順）。登場扱いにはしない
  function relevantOf(pres){ var s=getS(), npcs=(s&&s.cast&&Array.isArray(s.cast.npcs))?s.cast.npcs:[], cand=[];
    npcs.forEach(function(n, i){ if(!n||!n.name) return; var nm=String(n.name); if(pres.present[nm]) return; var mm=pres.mentioned&&pres.mentioned[nm]; if(!mm||!mm.length) return;
      var rank=mm.indexOf('今回の入力')>=0?0:(mm.indexOf('開始時の状況')>=0?1:(mm.indexOf('同席の再確認')>=0?1.5:2)); cand.push({ nm:nm, rank:rank, i:i }); });
    cand.sort(function(a,z){ return (a.rank-z.rank)||(a.i-z.i); });
    var out={}; cand.slice(0, REL_MAX).forEach(function(c){ out[c.nm]=true; }); return out; }
  // ---- 重複除去（完全一致の文・項目だけ）----
  var SENT_RE=/[^。！？!?]+[。！？!?」』）)]*|[。！？!?]+/g;
  var LABEL_RE=/^([\s　]*(?:[・\-－●◆■○◇※][\s　]*)?)([^：:「」『』\s　。、]{1,8}[：:][\s　]*)?([\s\S]*)$/;
  function normS(x){ return String(x||'').replace(/^[\s　]+|[\s　]+$/g,'').replace(/^[・\-－●◆■○◇※][\s　]*/,''); }
  // 比べる形: 前後の空白・行頭の記号を除き、文末の句点（。．.）の有無だけは同じとみなす（それ以外は 1 字でも違えば別の文として残す）
  function keyS(x){ return normS(x).replace(/[。．.]+$/,''); }
  function sentsOf(x){ return String(x||'').match(SENT_RE)||[]; }
  function fieldSet(fields){ var set={}; String(fields||'').split('\n').forEach(function(l){ var q=keyS(l); if(q) set[q]=1; sentsOf(l).forEach(function(x){ var p=keyS(x); if(p) set[p]=1; }); }); return set; }
  // 戻り { text: 残った本文（'' = 節ごと一致）, removed: 除いた文の数, removedChars, kept: 残した文の数 }
  function exactDedup(text, fields){
    var set=fieldSet(fields), out=[], removed=0, rc=0, kept=0, bodyLeft=0;
    String(text||'').split('\n').forEach(function(line){
      var hm=HEAD_RE.exec(line), head=hm?hm[0]:'', rest=hm?line.slice(head.length):line;
      var m=LABEL_RE.exec(rest), pre=m[1]||'', lab=m[2]||'', body=m[3]||'';
      if(!normS(body)){ out.push(line); if(!head && normS(rest)) bodyLeft++; return; }
      if(set[keyS(body)]){ removed+=Math.max(1, sentsOf(body).length); rc+=normS(body).length; if(head) out.push(head); return; }
      var ks=[]; sentsOf(body).forEach(function(x){ var q=keyS(x); if(q && set[q]){ removed++; rc+=normS(x).length; } else { ks.push(x); if(q) kept++; } });
      if(!ks.length || !normS(ks.join(''))){ if(head) out.push(head); return; }
      out.push(head+pre+lab+ks.join('')); bodyLeft++; });
    var t=out.join('\n').replace(/^\s+|\s+$/g,'');
    if(!bodyLeft) t='';
    return { text:removed?t:String(text||''), removed:removed, removedChars:rc, kept:kept };
  }
  // 場面の要約の抜粋（文の区切りで、行の長さ cap 以下。最初の 1 文が入らなければ null）
  function anchorExcerpt(u, cap){
    var label='■ '+safe(u.name)+'（常時・場面の要約・抜粋）：', parts=sentsOf(u.text), acc='';
    for(var i=0;i<parts.length;i++){ var nx=acc+parts[i]; if((label+safe(nx.replace(/\s+$/,''))).length+1>cap) break; acc=nx; }
    acc=acc.replace(/\s+$/,''); if(!acc || !normS(acc.replace(HEAD_RE,''))) return null;
    var line=label+safe(acc);
    return { name:u.name, idx:u.idx, sec:u.sec, pr:u.pr, level:u.level, ev:(u.ev||[]).concat(['場面の要約・抜粋']), first:true, gm:false, head:u.head, line:line, cost:line.length+1, text:acc };
  }
  function profileMap(){ var s=getS(), m={}; try{ ((s&&s.cast&&s.cast.npcs)||[]).forEach(function(n){ if(n&&n.name&&!m[n.name]) m[n.name]=fieldsText(n); }); }catch(e){} return m; }
  function fieldsText(e){ return ['desc','personality','coreDesire','coreFear','wound'].map(function(k){ return (e&&typeof e[k]==='string')?e[k]:''; }).join('\n'); }
  // ---- r4c（#126-C B）: 関係する未登場の NPC の短い関係プロフィール（登録の desc の先頭の文から REL_PROF_MIN〜REL_PROF_MAX 字。保存しない）----
  var OFFSTAGE_NOTE='いまこの場面での同席が確認できていない人物（関係の参照）。到着する・呼ばれて来る・場面が移るなど、登場が成り立つまでは、この場の会話・行動に参加させない。';
  // ★r4f（#126-G）: 不在と同席未確認を注記で分ける（キーは増やさない。各人の status と、条件に合わせた note）
  var OFFSTAGE_NOTE_ABSENT='いまこの場面にはいない人物（関係の参照）。到着する・呼ばれて来る・場面が移るなど、登場が成り立つまでは、この場の会話・行動に参加させない。';
  var OFFSTAGE_NOTE_RECHECK='現在の同席が未確認の人物。退場・不在が確定したわけではない。場面内で存在が確認されるまでは、その場での発話や身体行動を確定させない。自然な登場・同席の再確認は妨げない。';
  var OFFSTAGE_NOTE_MIXED='status が「不在」の人物はいまこの場面にいない。「同席未確認」の人物は退場・不在が確定したわけではなく、場面内で存在が確認されるまでは、その場での発話や身体行動を確定させない。どちらも、到着する・呼ばれて来る・場面が移るなど登場が成り立てば参加できる。';
  var REL_WHY={ 'absent:elsewhere':'開始時の状況: 待ち合わせ・別の場所（まだこの場にいない）', 'absent:missing':'開始時の状況: 行方不明・不在', 'mention:hearsay':'開始時の状況: 話に出ている',
    'mention:ambiguous':'開始時の状況: 名前が出ている（同席は未確定）', 'mention:neutral':'開始時の状況: 名前が出ている（同席は未確定）', 'present':'開始時の状況: 同席（この場面では続いていない）' };
  function relProfile(n){
    var parts=[];
    if(lsGet('v292Dfix954RelProf')!=='desc'){   // ★r4e（#126-F）: mix を既定に（'desc' で r4c/r4d の desc 先頭）
      // ★r4d（#126-E）: 外見に偏らないよう、desc・personality・coreDesire の先頭の文を 1 つずつ順に（足りなければ各欄の 2 文目以降）
      var by=['desc','personality','coreDesire'].map(function(k){ var a=[]; String(n&&n[k]||'').split('\n').forEach(function(l){ sentsOf(l).forEach(function(x){ x=x.replace(/^[\s　]+|[\s　]+$/g,''); if(x) a.push(x); }); }); return a; });
      for(var r=0; r<4; r++) by.forEach(function(a){ if(a[r]) parts.push(a[r]); });
      var acc='';
      for(var q=0;q<parts.length;q++){ if((acc+parts[q]).length<=REL_PROF_MAX) acc+=parts[q]; }
      if(acc.length>=Math.min(REL_PROF_MIN, 40)) return acc;
      parts=[];
    }
    ['desc','personality'].forEach(function(k){ String(n&&n[k]||'').split('\n').forEach(function(l){ sentsOf(l).forEach(function(x){ x=x.replace(/^[\s　]+|[\s　]+$/g,''); if(x) parts.push(x); }); }); });
    var out='';
    for(var i=0;i<parts.length;i++){ if((out+parts[i]).length<=REL_PROF_MAX){ out+=parts[i]; if(out.length>=REL_PROF_MIN) break; } else if(out) break; else { var cut=parts[i].slice(0, REL_PROF_MAX-1), k=Math.max(cut.lastIndexOf('、'), cut.lastIndexOf('，')); out=(k>=REL_PROF_MIN/2?cut.slice(0,k):cut)+'…'; break; } }
    return out; }
  // ★r4f: 不在（退場・行方不明・別の場所・伝聞・遠隔の言及）か、同席未確認（時間の経過・主人公の移動・入力だけ・開始時の状況で同席が曖昧）か
  function offStatus(nm, pres){ var mm=(pres.mentioned&&pres.mentioned[nm])||[], st=pres.start&&pres.start[nm], g=pres.gone&&pres.gone[nm];
    if(g) return '不在'; if(pres.recheck && pres.recheck[nm]) return '同席未確認';
    if(st && /^absent:/.test(st)) return '不在';   // ★r4g（#126-H）: 伝聞（mention:hearsay）は不在と断定しない → 下で同席未確認
    if(mm.indexOf('今回の入力')>=0) return '同席未確認';
    if(pres.callOnly && pres.callOnly[nm]) return '不在';   // 電話・メッセージ・画面越しだけ（★r4h: 開始時の状況の「話に出ている」より新しい直近の証拠なので先に見る）
    if(st && /^mention:/.test(st)) return '同席未確認';
    if(g===undefined && mm.some(function(x){ return /^直近/.test(x); })) return '同席未確認';   // ★r4g: 直近の本文で話題になっただけ（遠隔かどうかは本文の語しだい）も不在と断定しない
    return '不在'; }
  function relWhy(nm, pres){ var mm=(pres.mentioned&&pres.mentioned[nm])||[], st=pres.start&&pres.start[nm], g=pres.gone&&pres.gone[nm];
    if(g) return /主人公だけが離れ/.test(g) ? '主人公だけが別の場所へ移った（この人物が退場したわけではない）' : '退場した（'+g+'）'; if(pres.recheck && pres.recheck[nm]) return '時間が経過した（いまの同席は未確認）'; if(mm.indexOf('今回の入力')>=0) return '今回の入力で話題'; if(st && REL_WHY[st.split('/')[0]]) return REL_WHY[st.split('/')[0]]; return (pres.callOnly && pres.callOnly[nm]) ? '直近の本文で電話・メッセージ越し（この場にはいない）' : '直近の本文で話題（同席は未確認）'; }
  function psychMode(){ return lsGet('v292Dfix954PsychRef')==='1' ? 'ref' : (lsGet('v292Dfix954PsychSync')==='1' ? 'sync' : 'raw'); }
  // user の cast.npcs（と、スイッチが ON の時だけ psychAnchors）を N2 の人物に組み直す。戻り: { obj, user, info }。書き換えない時は user=null
  function applyN2(user, pres, rel){
    var info={ skipped:null, inner:[], final:[], added:[], removed:[] };
    var obj=null; try{ obj=JSON.parse(user); }catch(e){ info.skipped='user が JSON でない'; return { obj:null, user:null, info:info }; }
    if(!obj || !obj.cast || !Array.isArray(obj.cast.npcs)){ info.skipped='user に cast.npcs が無い'; return { obj:null, user:null, info:info }; }
    if(JSON.stringify(obj,null,2)!==user){ info.skipped='user の形が想定と違う（JSON.stringify(obj,null,2) でない）'; return { obj:obj, user:null, info:info }; }
    var s=getS(), full=(s&&s.cast&&Array.isArray(s.cast.npcs))?s.cast.npcs:[];
    var n2on=(lsGet('v292Dfix954N2')!=='off'), union=(lsGet('v292Dfix954Mode')==='union'), pm=psychMode();
    var innerBy={}; obj.cast.npcs.forEach(function(e){ if(e&&e.name&&!innerBy[e.name]){ innerBy[e.name]=e; info.inner.push(String(e.name)); } });
    var srcBy={}; full.forEach(function(n){ if(n&&n.name&&!srcBy[n.name]) srcBy[n.name]=n; });
    var list;
    if(!n2on) list=obj.cast.npcs.slice();
    else { list=[]; var used={};
      full.forEach(function(n){ if(!n||!n.name||used[n.name]) return; var nm=String(n.name);
        if(pres.present[nm] || (union && innerBy[nm])){ used[nm]=1;
          if(innerBy[nm]) list.push(innerBy[nm]);
          else { var e={ name:n.name, desc:n.desc, personality:n.personality, coreDesire:n.coreDesire, coreFear:n.coreFear, wound:n.wound };
            if(typeof n.gender==='string' && n.gender) e.gender=n.gender;
            list.push(e); info.added.push(nm); } } });
      info.inner.forEach(function(nm){ if(!used[nm]) info.removed.push(nm); });
    }
    obj.cast.npcs=list; info.final=list.map(function(e){ return String(e&&e.name); }); info.psych=pm;
    // r4c（#126-C B）: 関係する未登場の NPC を cast.offstage に（cast.npcs とは別。登場扱いにしない）。v292Dfix954Offstage='off' で入れない
    info.offstage=[];
    if(n2on && rel && lsGet('v292Dfix954Offstage')!=='off'){ var offs=[]; full.forEach(function(n){ if(!n||!n.name) return; var nm=String(n.name); if(!rel[nm] || pres.present[nm]) return;
        var pf=relProfile(n); if(!pf) return; var stt=offStatus(nm, pres); offs.push({ name:n.name, status:stt, why:relWhy(nm, pres), profile:pf }); info.offstage.push(nm); });
      if(offs.length){ var nR=offs.filter(function(o){ return o.status==='同席未確認'; }).length, note=(nR===0)?OFFSTAGE_NOTE_ABSENT:(nR===offs.length?OFFSTAGE_NOTE_RECHECK:OFFSTAGE_NOTE_MIXED);
        var c2={}; Object.keys(obj.cast).forEach(function(k){ if(k==='offstage') return; c2[k]=obj.cast[k]; if(k==='npcs') c2.offstage={ note:note, chars:offs }; }); obj.cast=c2; } }
    // r4c（#126-C E）: psychAnchors の送信時の絞り込み（保存された値は変えない）。既定 ON・v292Dfix954PsychFilter='off' で止める。
    //   raw の時だけ: 主人公の欄と、登場中・cast.npcs に入れた・関係する未登場の NPC の欄だけ残す（値は 1 字も変えない）。NPC の欄が全部外れて主人公の欄も無ければ psychAnchors ごと送らない（fix24 が作らない時と同じ形）。
    info.psychFiltered=[];
    if(pm==='raw' && n2on && lsGet('v292Dfix954PsychFilter')==='on' && obj.psychAnchors && Array.isArray(obj.psychAnchors.chars)){
      var keepC=obj.psychAnchors.chars.filter(function(c){ var w=String(c&&c.who||''); if(/\(主人公\)$/.test(w)) return true; var nm=w.replace(/\(NPC\)$/,'');
        var ok=!!(pres.present[nm] || (rel && rel[nm]) || info.final.indexOf(nm)>=0); if(!ok) info.psychFiltered.push(nm); return ok; });   // cast.npcs に残した人（union 等）の欄も残す
      if(info.psychFiltered.length){ if(keepC.length) obj.psychAnchors.chars=keepC; else delete obj.psychAnchors; } }
    // psychAnchors（既定 raw = 触らない。sync/ref の時だけ、fix24 が動いた＝inputSeed がある時に fix24 と同じ位置・同じ組み立てで作り直す）
    if(pm!=='raw' && Object.prototype.hasOwnProperty.call(obj,'inputSeed')){
      var keep=(pm==='sync'), old=obj.psychAnchors, oldChars=(old&&Array.isArray(old.chars))?old.chars:[];
      var anchors=oldChars.filter(function(c){ return /\(主人公\)$/.test(String(c&&c.who)); });
      var anyNpc=false;
      list.forEach(function(e){ var n=srcBy[e.name]||e; if(!(n.coreFear||n.coreDesire||n.wound)) return; anyNpc=true;
        if(keep){ var prev=oldChars.filter(function(c){ return String(c&&c.who)===String(n.name||'NPC')+'(NPC)'; })[0];
          anchors.push(prev||{ who:(n.name||'NPC')+'(NPC)', coreFear:n.coreFear||null, coreDesire:n.coreDesire||null, wound:n.wound||null }); }
        else anchors.push({ who:(n.name||'NPC')+'(NPC)' }); });
      if(anchors.length){
        var pa={ note:(old&&typeof old.note==='string')?old.note:NOTE24 }; if(!keep && anyNpc) pa.ref=REF954; pa.chars=anchors;
        if(old) obj.psychAnchors=pa;
        else { var o2={}; Object.keys(obj).forEach(function(k){ o2[k]=obj[k]; if(k==='inputSeed') o2.psychAnchors=pa; }); obj=o2; }
      } else if(old) delete obj.psychAnchors;
    }
    return { obj:obj, user:JSON.stringify(obj,null,2), info:info };
  }
  // fix313 の最外ラップから呼ぶ。関所の問い合わせは 1 回（r3 と同じ回数）
  function buildBlockR4(input, r){
    if(off()) return '';
    var act=canary951();
    if(!act || f951off() || f954off()){ last954=null; return buildBlockWith(input, act, null); }   // r3 と同じ
    var pv=lsGet('v292Dfix954Pres');
    var info={ at:Date.now(), version:VERSION954, n2:lsGet('v292Dfix954N2')!=='off', pres:(pv==='r4'||pv==='r4b')?pv:'r4c', offstage:lsGet('v292Dfix954Offstage')!=='off', psychFilter:lsGet('v292Dfix954PsychFilter')==='on', relProf:(lsGet('v292Dfix954RelProf')==='desc')?'desc':'mix', mode:(lsGet('v292Dfix954Mode')==='union')?'union':'present',
               psych:psychMode(), dedup:lsGet('v292Dfix954Dedup')!=='off', absent:(lsGet('v292Dfix954Absent')==='keep')?'keep':'drop', absentRel:lsGet('v292Dfix954AbsentRel')!=='off',
               anchor:lsGet('v292Dfix954Anchor')!=='off', present:{}, ev:{}, start:{}, mentioned:{}, relevant:[], userBefore:0, userAfter:0 };
    var pres=null, delivered=null, relevant={}, offDone=false;
    // カードへ渡す「関係する未登場」: r4c の既定（cast.offstage で渡す）では札の人物像を段5 に残さない（重複させない）。Offstage='off' か user を書き換えられなかった時は r4b どおり
    var mk=function(p, dlv, rel, offDone){ return { pres:p, delivered:info.dedup?dlv:null, dropAbsent:info.dedup && info.absent==='drop', profile:profileMap(), relevant:(info.absentRel && !offDone?rel:{}), relevantNames:(info.absentRel?Object.keys(rel||{}):[]), anchor:info.anchor }; };
    // fix313 のラップが二重の時（内側が付けたカードを間の部品が外し、外側が付け直す）: user は 1 回だけ書き換え、カードは同じ判定で作り直す
    if(done954 && r && done954.has(r)){ var memo=done954.get(r); return buildBlockWith(input, act, mk(memo.pres, memo.delivered, memo.relevant||{}, memo.offDone)); }
    try{
      if(info.n2){ pres=(info.pres==='r4')?presentR4(input):(info.pres==='r4b'?presentStrict(input):presentR4c(input, r&&r.sys)); info.present=pres.present; info.ev=pres.ev; info.start=pres.start; info.mentioned=pres.mentioned; info.scene=pres.scene; info.gone=pres.gone||{}; info.agendaNotPresent=pres.agendaNotPresent||[]; info.recheck=pres.recheck||{}; info.unknown=pres.unknown||{}; info.lookbackFrom=(pres.lookbackFrom!=null)?pres.lookbackFrom:null;
        relevant=info.absentRel?relevantOf(pres):{}; info.relevant=Object.keys(relevant); }   // N2 を止めた時は、カードの段3 も r3 の判定（presence）に戻す
      else pres={ present:{}, who:{}, ev:{} };
      if(r && typeof r.user==='string'){
        info.userBefore=r.user.length;
        var res=applyN2(r.user, pres, relevant); Object.keys(res.info).forEach(function(k){ info[k]=res.info[k]; });
        info.userChanged=(res.user!=null && res.user!==r.user);
        if(info.userChanged){ r.user=res.user; }
        info.userAfter=r.user.length;
        var o=res.obj; if(o && o.cast && Array.isArray(o.cast.npcs)){ delivered={}; o.cast.npcs.forEach(function(e){ if(e&&e.name) delivered[e.name]=fieldsText(e); }); }
        offDone=!!(info.offstage && res.user!=null && Object.keys(relevant).every(function(nm){ return (res.info.offstage||[]).indexOf(nm)>=0; }));   // 関係する人が全員 cast.offstage に入った時だけ、札の人物像を段5 に残さない
        if(done954) done954.set(r, { pres:info.n2?pres:null, delivered:delivered, relevant:relevant, offDone:offDone });
      }
    }catch(e){ info.error=String(e&&e.message||e); }
    last954=info;
    if(!info.n2) pres=null;
    return buildBlockWith(input, act, mk(pres, delivered, relevant, offDone));
  }
  window.__v292Dfix954={ version:VERSION954, last:function(){ return last954; }, presentNow:function(input, sys){ return presentR4c(input, sys); }, presentR4b:function(input){ return presentStrict(input); }, relProfileLimits:{ min:REL_PROF_MIN, max:REL_PROF_MAX }, carryWin:CARRY_WIN, presentR4:function(input){ return presentR4(input); }, isOff:f954off, nameForms:function(n){ return nameForms(n, getCards()); }, usedAsPerson:usedAsPerson,
    classifyStart:function(text, name){ return classifyStart(text, nameForms({ name:name }, [])); }, exactDedup:exactDedup, anchorLimits:{ min:ANCHOR_MIN, max:ANCHOR_MAX }, relMax:REL_MAX };
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
        try{ if(r&&typeof r.sys==='string'){ var b=buildBlockR4(arguments[1], r); if(b && r.sys.indexOf(MARK)<0) r.sys=r.sys+b; } }catch(e){}
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
