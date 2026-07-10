// =====================================================================
// Chronicle TRPG - v292Dfix307: NPC重要度ロスター抽出器(Phase2・独立モジュール)
//   背景(おしんと設計・2026-06-18 実機検証済): 貞子型の「無名だが重要な存在」を
//     キャラ一覧に載せたい。モデルは重要度を分かるが、ホラー怪異は"あえて無名"に
//     するので名前ベース登録(fix277)では拾えない。
//   解決(おしん案=文章から呼称を取る・実機6/6パス):
//     要約LLMに弧の文脈を渡し、散らばった描写から呼称生成(「濡れた黒髪の女」)+
//     弧の文脈で重要度判定+「一度きりは載せない(保留)」+名寄せ。
//   実装方針(他の不具合が出にくい独立設計):
//     - longmem(fix135)本体は不触。独自の周期LLM呼び出しで抽出し、独自ストアに
//       追記マージ(置換しない=呼称固定)。
//     - 表示は loadWorldInfo に"もう一段"シムを重ねてロスター項目を追記(fix298の上)。
//     - リセット安全(turns=0でクリア・stale lastTurnは非表示)。
//   OFF: localStorage v292Dfix307Off='1'
//   fix307b(2026-06-18): アイコンが怪物化する不具合修正。原因=descの「怪異」語で
//     外見抽出(fix197/286)が[人外]判定→モンスター化。対策=(1)descに怪異/妖怪等の語を
//     入れない(2)抽出時に容姿一文「外見」も取得しdescに使う→本来の姿でアイコン生成。
//   fix307c(2026-06-18): 再抽出で(a)呼称が毎回変わり同一存在が二重登録(b)現象/水滴等まで登録、
//     の2不具合修正。対策=既存台帳の呼称を渡して同一存在に再利用(呼称固定)＋現象/物/場所をkindで除外。
//   fix307d(2026-06-18): 人型の幽霊が外見抽出(fix197)で[人外]=モンスター化する件を修正。
//     外見文を「人の形の存在は霊/怪異でも人物として書く(霊体/半透明等の語を避ける)」に制約。
//   fix408(2026-07-10): (a)回想/過去描写/記録/写真/比喩/他者の背景説明の中にだけ出る存在を
//     除外(T16でカエデの過去描写から実体のない「孤児院の子」が登録された件)。(b)既存台帳を
//     「呼称: 外見」の行形式でLLMに渡し、外見一致の存在への新呼称乱立を抑止(同一存在の二重登録防止)。
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
  // ★fix307e: スロット厳密化用のキー固定版。run()開始時に決めたキーへ書く(切替で揺れない)。
  function rosterKey(sfx){ return 'v292Dfix307Roster'+sfx; }
  function lastKey(sfx){ return 'v292Dfix307Last'+sfx; }
  function loadRosterK(k){ try{ return JSON.parse(localStorage.getItem(k)||'[]')||[]; }catch(e){ return []; } }
  function saveRosterK(k,a){ if(!canSave())return; try{ localStorage.setItem(k, JSON.stringify((a||[]).slice(0,CAP))); }catch(e){} }
  function loadLastK(k){ try{ return parseInt(localStorage.getItem(k)||'-1',10); }catch(e){ return -1; } }
  function saveLastK(k,i){ if(!canSave())return; try{ localStorage.setItem(k, String(i)); }catch(e){} }
  // そのスロットのセーブ本体(blob)が保持する物語のloc。Sが指す物語と一致確認に使う。
  function slotBlobLoc(sfx){ try{ var b=JSON.parse(localStorage.getItem('chr6'+sfx)||'null'); return (b&&b.scene)?(b.scene.loc||null):null; }catch(e){ return null; } }

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
    '各要素:{"呼称":安定した短い呼称(固有名or外見の核8字以内・例「黒髪の女」「顔のない男」),"種別":"人物"|"怪異"|"動物"等,"重要度":"高"|"中","外見":画像生成用に容姿を日本語一文で。姿が人の形の存在(少女・男・人影など)は霊や怪異であっても【人物】として書く(髪・年齢層・性別・肌・服・表情。「霊体」「半透明」「姿が定かでない」「首がない」等の曖昧・異形の語は避け人として描く)。本当に人型でない存在(形のない影・塊・獣・物)だけ異形として姿形・色・質感を書く。物語の出来事や場所や心情は書かない,"理由":簡潔に}。'+
    '載せる基準=再登場した/再登場しそう・物語の脅威や鍵となる存在。'+
    '載せない=一度きりで以後出ない脅かし・通行人・背景・単なる物音や影・主役。回想・過去の説明・記録・写真・比喩・他者の背景説明の中にだけ出てくる存在は、現在の場面に実体として登場していない限り載せない(fix408)。'+
    '一度しか出ておらず再登場が読み取れない存在は載せない(保留)。人・怪異・動物・霊など"存在"のみ対象とし、単なる現象・物体・場所・水滴・物音は載せない。既存台帳の呼称が与えられたら、同一の存在には新しい名前を作らず既存の呼称をそのまま使う(呼称は固定)。同一存在は描写が違っても1件に名寄せ統合する。該当無しは[]。JSONのみ出力。';

  function callLLM(transcript, cb){
    var key=getKey(); if(!key){ cb(null); return; }
    // ★fix408: 既存台帳を「呼称: 外見」の行形式で渡し、外見や特徴が一致する存在への新呼称乱立を抑止(同一存在の二重登録防止)。
    var existingLines=(loadRoster()||[]).filter(function(r){return r&&r.handle;}).map(function(r){ var a=String(r.appr!=null?r.appr:'').trim().slice(0,80); return '- '+r.handle+(a?(': '+a):''); });
    var user='主役(以下)は絶対に載せない: '+(castNames().join('、')||'(不明)')+'\n既存台帳(同一存在には必ずこの呼称を再利用・外見や特徴が一致する存在に新しい呼称を作らない):\n'+(existingLines.join('\n')||'(なし)')+'\n\n--- 物語 ---\n'+transcript;
    var body=JSON.stringify({ model:MODEL, temperature:0.2, max_tokens:600, messages:[{role:'system',content:SYS},{role:'user',content:user}] });
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

  // 追記マージ: 既存呼称は維持(固定)・新規は追加・重要度/外見は更新・削除しない
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
      if(/現象|物体|場所|風景|景色|液体|物音|背景/.test(kind)) return; // 存在でないものは載せない(fix307c)
      var imp=String((it['重要度']!=null?it['重要度']:it.importance)||'中');
      var appr=String((it['外見']!=null?it['外見']:it.appr)||'').trim().slice(0,120);
      if(byKey[h]){ byKey[h].kind=kind; byKey[h].importance=imp; if(appr) byKey[h].appr=appr; byKey[h].lastTurn=ct; }
      else { var o={handle:h, kind:kind, importance:imp, appr:appr, firstTurn:ct, lastTurn:ct}; byKey[h]=o; existing.push(o); }
    });
    return existing;
  }

  function run(){
    if(off()) return;
    var s=getS(); if(!s||!Array.isArray(s.turns)||s.turns.length<2) return;
    if(!canSave()) return;                  // 単一writerだけがLLMを叩く
    // ★fix307e: 保存先スロットと、いまSが保持する物語の一致をここで固定/検証する。
    //   起動/切替の中間状態(キーは新スロット・Sはまだ前の物語)で書くと、別スロットの
    //   ロスターに前物語のキャラが混入する(=今回のキャラ一覧混入バグ)。fix320と同型の根治。
    var sfx=slotSfx();
    var storeK=rosterKey(sfx), lastK=lastKey(sfx);
    var curLoc=(s.scene&&s.scene.loc)||null;
    var blobLoc=slotBlobLoc(sfx);
    if(blobLoc && curLoc && blobLoc!==curLoc) return; // Sがこのスロットの物語と不一致=中間状態→書かない
    var ct=s.turns.length-1;
    var last=loadLastK(lastK);
    if(last>ct){ saveLastK(lastK,-1); last=-1; }   // 別ゲーム/リセット由来のstale lastを自己修復
    if(ct<=last) return;                     // 新ターン無し
    if(last>=0 && (ct-last)<INTERVAL) return; // INTERVALターン待つ
    var tr=recentTranscript(); if(!tr) return;
    saveLastK(lastK, ct);                     // 呼び出し前に進めて二重発火防止
    callLLM(tr, function(out){
      // ★再確認: LLM(最大90s)中にスロット切替/物語差替が起きていたら、このスロットには書かない。
      var s2=getS();
      if(!s2 || !s2.scene || (s2.scene.loc||null)!==curLoc) return; // 物語が差し替わった
      if(slotSfx()!==sfx) return;                                   // アクティブスロットが変わった
      var arr=parseArr(out);
      if(!arr) return;                       // 失敗時は次INTERVALで再試行
      var merged=mergeRoster(loadRosterK(storeK), arr);
      saveRosterK(storeK, merged);
      try{ console.log(TAG,'roster updated, count=', merged.length, 'slot=', sfx||'(default)'); }catch(e){}
    });
  }

  // リセット安全: turns=0なのにロスターが残ってたらクリア
  function resetCheck(){
    var s=getS(); if(!s||!Array.isArray(s.turns)) return;
    // ★fix307e: 中間状態での誤クリア防止。Sが空(新規)でも、保存先スロットのblobが別物語を
    //   持っているなら切替中なので触らない。blobも空/一致の時だけクリアする。
    var sfx=slotSfx(); var storeK=rosterKey(sfx), lastK=lastKey(sfx);
    var blobLoc=slotBlobLoc(sfx); var curLoc=(s.scene&&s.scene.loc)||null;
    if(blobLoc && curLoc && blobLoc!==curLoc) return;
    if(s.turns.length===0 && (loadRosterK(storeK).length || loadLastK(lastK)>=0)){
      try{ localStorage.removeItem(storeK); localStorage.removeItem(lastK); }catch(e){}
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
            // 外見(appr)があればそれをdescに=アイコン外見抽出が正しい姿を作る。
            // 無い時は中立ラベル(「怪異/妖怪/化け物」等の語は避ける=外見抽出が[人外]に誤分類しモンスター化するため)。
            var desc=(r.appr&&r.appr.length>=3)?r.appr:('（物語に登場した'+(r.importance==='高'?'重要な':'')+'存在）');
            base.push({ name:r.handle, type:'character', desc:desc });
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
  try{ console.log(TAG,'loaded (fix307e slot-strict)'); }catch(e){}
})();
