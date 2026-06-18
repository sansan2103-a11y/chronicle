// =====================================================================
// Chronicle TRPG - v292Dfix307: NPC重要度ロスター抽出器(Phase2・独立モジュール)
//   背景(おしんと設計・2026-06-18 実機検証済): 貞子型の「無名だが重要な存在」を
//     キャラ一覧に載せたい。モデルは重要度を分かるが、ホラー怪異は"あえて無名"に
//     するので名前ベース登録(fix277)では拾えない。
//   解決(おしん案=文章から呼称を取る・実機6/6パス):
//     要約LLMに弧の文脈を渡し、散らばった描写から呼称生成(「濡れた黒髪の女」)+
//     弧の文脈で重要度判定+「一度きりは載せない(保留)」+名寄せ。
//     → 過剰登録を防ぎつつ重要な再登場存在だけ一覧に。
//   実装方針(他の不具合が出にくい独立設計):
//     - longmem(fix135)本体は不触。独自の周期LLM呼び出しで抽出し、独自ストアに
//       追記マージ(置換しない=呼称固定)。
//     - 表示は loadWorldInfo に"もう一段"シムを重ねてロスター項目を追記(fix298の上)。
//     - リセット安全(turns=0でクリア・stale lastTurnは非表示)。
//   OFF: localStorage v292Dfix307Off='1'
// =====================================================================
(function(){
  'use strict';
  var TAG='[v292Dfix307:npc-roster]';
  if(window.__v292Dfix307) return; window.__v292Dfix307=true;

  var ENDPOINT='https://openrouter.ai/api/v1/chat/completions';  // fix247がプロキシへ書換
  var MODEL='deepseek/deepseek-v4-flash';  // 背景タスクは軽量Flash固定
  var INTERVAL=3;     // 何ターンごとに抽出するか
  var WINDOW=12;      // 弧の文脈として遡るターン数
  var CAP=60;         // ロスター上限

  function off(){ try{ return localStorage.getItem('v292Dfix307Off')==='1'; }catch(e){ return false; } }
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function slotSfx(){ try{ if(typeof window.__chr6Key==='function'){ var k=window.__chr6Key(); return (k&&k!=='chr6')?k.replace(/^chr6/,''):''; } }catch(e){} return ''; }
  function STORE(){ return 'v292Dfix307Roster'+slotSfx(); }
  function LASTK(){ return 'v292Dfix307Last'+slotSfx(); }

  // single-writer(epoch)ゲート: 古い世代タブは書かない(longmem fix299と同方針)
  function canSave(){ try{ var ep=+(localStorage.getItem('chr6_epoch')||0); if(window.__chrEpoch&&ep>window.__chrEpoch) return false; }catch(e){} return true; }
  function getKey(){ try{ var c=JSON.parse(localStorage.getItem((typeof window.__chr6Key==='function'?window.__chr6Key():'chr6'))||'{}').cfg||{}; return c.orKey||''; }catch(e){ return ''; } }

  function loadRoster(){ try{ return JSON.parse(localStorage.getItem(STORE())||'[]')||[]; }catch(e){ return []; } }
  function saveRoster(a){ if(!canSave())return; try{ localStorage.setItem(STORE(), JSON.stringify((a||[]).slice(0,CAP))); }catch(e){} }
  function loadLast(){ try{ return parseInt(localStorage.getItem(LASTK())||'-1',10); }catch(e){ return -1; } }
  function saveLast(i){ if(!canSave())return; try{ localStorage.setItem(LASTK(), String(i)); }catch(e){} }

  function curTurn(){ var s=getS(); return (s&&Array.isArray(s.turns))?s.turns.length-1:-1; }
  function castNames(){
    var out=[]; try{ var s=getS(); if(s&&s.cast){ if(s.cast.hero&&s.cast.hero.name) out.push(String(s.cast.hero.name)); (s.cast.npcs||[]).forEach(function(n){ if(n&&n.name) out.push(String(n.name)); }); } }catch(e){} return out;
  }
  function recentTranscript(){
    var s=getS(); if(!s||!Array.isArray(s.turns)) return '';
    var n=Math.min(WINDOW, s.turns.length);
    var sl=s.turns.slice(-n);
    return sl.map(function(t,i){ return 'T'+(i+1)+': '+((t&&t.narrative)||'')+((t&&t.playerText)?(' 〔行動〕'+t.playerText):''); }).join('\n\n').slice(0,6000);
  }

  var SYS='あなたは長編物語の登場人物台帳を維持するAI。物語(複数ターン)を読み、主役以外の存在のうち【一覧に載せるべき重要な存在】だけをJSON配列で返す。'+
    '各要素:{"呼称":安定した短い呼称(固有名or外見の核8字以内・例「黒髪の女」「顔のない男」),"種別":"人物"|"怪異"|"動物"等,"重要度":"高"|"中","理由":簡潔に}。'+
    '載せる基準=再登場した/再登場しそう・物語の脅威や鍵となる存在。'+
    '載せない=一度きりで以後出ない脅かし・通行人・背景・単なる物音や影・主役。'+
    '一度しか出ておらず再登場が読み取れない存在は載せない(保留)。同一存在は描写が違っても1件に名寄せ統合する。該当無しは[]。JSONのみ出力。';

  function callLLM(transcript, cb){
    var key=getKey(); if(!key){ cb(null); return; }
    var user='主役(以下)は絶対に載せない: '+(castNames().join('、')||'(不明)')+'\n\n--- 物語 ---\n'+transcript;
    var body=JSON.stringify({ model:MODEL, temperature:0.2, max_tokens:500, messages:[{role:'system',content:SYS},{role:'user',content:user}] });
    try{
      var xhr=new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.setRequestHeader('Authorization','Bearer '+key);
      xhr.timeout=90000;
      xhr.onload=function(){ if(xhr.status>=200&&xhr.status<300){ try{ var j=JSON.parse(xhr.responseText); cb((j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||null); }catch(e){ cb(null); } } else cb(null); };
      xhr.onerror=function(){ cb(null); };
      xhr.ontimeout=function(){ cb(null); };
      xhr.send(body);
    }catch(e){ cb(null); }
  }

  function parseArr(txt){
    if(!txt) return null;
    var m=txt.match(/\[[\s\S]*\]/); if(!m) return null;
    try{ var a=JSON.parse(m[0]); return Array.isArray(a)?a:null; }catch(e){ return null; }
  }

  // 追記マージ: 既存呼称は維持(固定)・新規は追加・重要度は更新・削除しない
  function mergeRoster(existing, incoming){
    existing=existing||[];
    var byKey={}; existing.forEach(function(e){ if(e&&e.handle) byKey[e.handle]=e; });
    var ct=curTurn(); var cast=castNames();
    (incoming||[]).forEach(function(it){
      if(!it) return;
      var h=String((it['呼称']!=null?it['呼称']:it.handle)||'').trim();
      if(!h || h.length>24) return;
      if(cast.indexOf(h)>=0) return;
      var kind=String((it['種別']!=null?it['種別']:it.kind)||'人物');
      var imp=String((it['重要度']!=null?it['重要度']:it.importance)||'中');
      if(byKey[h]){ byKey[h].kind=kind; byKey[h].importance=imp; byKey[h].lastTurn=ct; }
      else { var o={handle:h, kind:kind, importance:imp, firstTurn:ct, lastTurn:ct}; byKey[h]=o; existing.push(o); }
    });
    return existing;
  }

  function run(){
    if(off()) return;
    var s=getS(); if(!s||!Array.isArray(s.turns)||s.turns.length<2) return;
    if(!canSave()) return;                  // 単一writerだけがLLMを叩く
    var ct=s.turns.length-1;
    var last=loadLast();
    if(last>ct){ saveLast(-1); last=-1; }   // 別ゲーム/リセット由来のstale lastを自己修復
    if(ct<=last) return;                     // 新ターン無し
    if(last>=0 && (ct-last)<INTERVAL) return; // INTERVALターン待つ
    var tr=recentTranscript(); if(!tr) return;
    saveLast(ct);                            // 呼び出し前に進めて二重発火防止
    callLLM(tr, function(out){
      var arr=parseArr(out);
      if(!arr) return;                       // 失敗時は次INTERVALで再試行
      var merged=mergeRoster(loadRoster(), arr);
      saveRoster(merged);
      try{ console.log(TAG,'roster updated, count=', merged.length); }catch(e){}
    });
  }

  // リセット安全: turns=0なのにロスターが残ってたらクリア
  function resetCheck(){
    var s=getS(); if(!s||!Array.isArray(s.turns)) return;
    if(s.turns.length===0 && (loadRoster().length || loadLast()>=0)){
      try{ localStorage.removeItem(STORE()); localStorage.removeItem(LASTK()); }catch(e){}
      try{ console.log(TAG,'no turns — roster cleared'); }catch(e){}
    }
  }

  // 表示: loadWorldInfo にもう一段シムを重ね、ロスター項目をcharacterとして追記
  function installWiShim(){
    try{
      var lm=window.__longmem; if(!lm||!lm.raw||typeof lm.raw.loadWorldInfo!=='function') return false;
      if(lm.raw.__v292Dfix307wi) return true;
      var prev=lm.raw.loadWorldInfo.bind(lm.raw);
      lm.raw.loadWorldInfo=function(){
        var base=prev()||[];
        try{
          if(off()) return base;
          var have={}; base.forEach(function(e){ if(e&&e.name) have[e.name]=1; });
          castNames().forEach(function(n){ have[n]=1; });
          var ct=curTurn();
          loadRoster().forEach(function(r){
            if(!r||!r.handle||have[r.handle]) return;
            if(typeof r.lastTurn==='number' && ct>=0 && r.lastTurn>ct) return; // stale(別ゲーム)
            var label=(r.kind==='怪異')?'怪異':(r.kind==='動物')?'存在':'人物';
            base.push({ name:r.handle, type:'character', desc:'（物語に登場した'+(r.importance==='高'?'重要な':'')+label+'）' });
            have[r.handle]=1;
          });
        }catch(e){}
        return base;
      };
      lm.raw.__v292Dfix307wi=true;
      try{ console.log(TAG,'worldinfo display shim installed'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }

  try{ setInterval(run, 5000); }catch(e){}
  try{ setTimeout(run, 4000); }catch(e){}
  try{ setInterval(resetCheck, 4000); }catch(e){}
  try{ setInterval(installWiShim, 2000); }catch(e){}
  installWiShim();
  try{ window.addEventListener('focus', function(){ try{ run(); }catch(e){} }); }catch(e){}

  window.__v292Dfix307api={ loadRoster:loadRoster, saveRoster:saveRoster, run:run, mergeRoster:mergeRoster, parseArr:parseArr, recentTranscript:recentTranscript, installWiShim:installWiShim };
  try{ console.log(TAG,'loaded'); }catch(e){}
})();
