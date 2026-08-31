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
//   fix764(2026-08-31 / PHASE 4C = Entity Identity): 同一人物が表記差だけで別 entry に分裂する
//     不具合の根治。一次資料: モデルが同じ人物を「渔师」(T56)と「漁師」(T62)で書き、
//     mergeRoster の byKey[handle] が完全一致なのでキャラ一覧に2人並んだ。
//     対策= **キーの引き方だけ** を fix764 の字形フォールドにする（比較専用）。
//     ・格納する handle は表示形のまま（fold 形は 1 バイトも保存しない = fix455/456 の教訓）
//     ・既存 handle が簡体専用字を含み incoming が含まない時だけ handle を incoming の表示形へ寄せる
//       （以後 buildUserPrompt の「呼称固定」が日本語形を強制する）。名前固有リストは持たない。
//     ・既に台帳内に fold 同一の重複がある場合は 1 回だけ統合。統合前に roster 全体を
//       v292Dfix307_bk_fix764_<ts> へ退避し、退避できなければ **統合しない**（fail-closed / fix458 と同作法）。
//     OFF: v292Dfix764Off='1'（fix764 本体の kill）で従来動作へ戻る。
//   fix307f(2026-08-31): 別storyを開いたdocumentが、共有ポインタ__chr6Key()(chr6_active_slot)経由で
//     「いまアクティブなstory」のロスター/カーソルへ読み書き・削除していた不具合を修正。
//     slotSfx()をfix694のdocument authority(window.__chronicleDocumentStoryKey)基準へ固定。
//     authorityが無いdocumentはnullを返し、fix307のストアに一切触らない。OFF: v292Dfix307fOff='1'
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
  function slotSfx(){
    /* ★fix307f(2026-08-31): 共有ポインタ __chr6Key()(chr6_active_slot) は別 document の
       story を指し得る（実測: 0T document の resetCheck がアクティブ story の roster を削除）。
       この document が書いてよい story = fix694 の document authority に固定する。
       authority が無い(null) document では null を返し、呼び手は読み書き・削除を一切しない。
       OFF: localStorage v292Dfix307fOff='1' で旧挙動へ戻る */
    try {
      if (localStorage.getItem('v292Dfix307fOff') === '1') { /* 旧挙動 */
        if (typeof window.__chr6Key === 'function'){ var k0 = window.__chr6Key(); return (k0 && k0 !== 'chr6') ? k0.replace(/^chr6/, '') : ''; }
        return '';
      }
    } catch(e){}
    try {
      var dk = window.__chronicleDocumentStoryKey;
      if (typeof dk === 'string' && dk){ return (dk === 'chr6') ? '' : dk.replace(/^chr6/, ''); }
    } catch(e){}
    return null;   /* authority 無し = この document は fix307 のストアに触らない */
  }
  function STORE(){ var s=slotSfx(); return (s===null)?null:('v292Dfix307Roster'+s); }
  function LASTK(){ var s=slotSfx(); return (s===null)?null:('v292Dfix307Last'+s); }

  /* ★★fix748(Phase C / C5 = Class C): fix307 は 2 つのキーを書く。
       v292Dfix307Roster<sfx> … 直近12ターン窓から LLM が抽出した登場人物ロスター
       v292Dfix307Last<sfx>   … 「どのターンまで処理したか」のカーソル（companion key）
     両方とも同じ logical transaction の一部なので、片方だけ lock の外へ出さない。

     RECOMPUTATION_SOURCE  = S.turns の直近12ターン（recentTranscript）+ 既存 roster。
                             ロスターは「窓から再抽出してマージする」ので、1 回書き損ねても
                             同じ登場人物は次の抽出で再び出てくる。
     RECOMPUTATION_TRIGGER = 5000ms の setInterval run()（+ 起動 4000ms 後の run）。
                             ★カーソルを書けなかったときは LLM を撃たない = 次の run が同じ ct で再試行する。
                             ★ロスター書込を skip した場合はカーソルが進んでいるので、
                               同じ ct では再試行せず、次の INTERVAL ターン後の run で
                               同じ12ターン窓から再抽出される（窓が滑るだけで内容は失われない）。
     ★resetCheck の 2 キー削除は 1 つの transaction にまとめる。 */
  function f748(){ try { return window.__v292DfixDAdm || null; } catch(e){ return null; } }
  function f748Skip(who){
    var A = f748();
    if (!A || typeof A.skipGuard !== 'function') return null;
    return A.skipGuard(who);
  }
  function f748RunC(label, fn){
    var A = f748();
    if (!A || typeof A.runC !== 'function') return Promise.resolve({ ran:true, result: fn(), legacy:true });
    return A.runC(label, fn);
  }
  (function(){
    try {
      var A = f748();
      if (A && typeof A.registerC === 'function'){
        A.registerC('fix307.saveRoster',
          'S.turns の直近12ターン窓（recentTranscript → LLM 抽出）+ 既存 roster とのマージ',
          '5000ms setInterval run()（次の INTERVAL ターン後に同じ窓から再抽出される）',
          'C5 npc roster');
        A.registerC('fix307.saveLast',
          'S.turns.length - 1（カーソルは物語本体から常に再計算できる）',
          '5000ms setInterval run()。カーソルを書けなければ LLM を撃たないので次の run が同じ ct で再試行',
          'C5 cursor / companion of fix307.saveRoster');
      }
    } catch(e){}
  })();

  // single-writer(epoch)ゲート: 古い世代タブは書かない(longmem fix299と同方針)
  function canSave(){ try{ var ep=+(localStorage.getItem('chr6_epoch')||0); if(window.__chrEpoch&&ep>window.__chrEpoch) return false; }catch(e){} return true; }
  function getKey(){ try{ var c=JSON.parse(localStorage.getItem((typeof window.__chr6Key==='function'?window.__chr6Key():'chr6'))||'{}').cfg||{}; return c.orKey||''; }catch(e){ return ''; } }

  function loadRoster(){ var k=STORE(); if(k===null) return []; try{ return JSON.parse(localStorage.getItem(k)||'[]')||[]; }catch(e){ return []; } }
  function saveRoster(a){ var k=STORE(); if(k===null) return; if(!canSave())return; var g748=f748Skip('fix307.saveRoster'); if(g748&&(g748.skip||g748.hold)) return g748; try{ localStorage.setItem(k, JSON.stringify((a||[]).slice(0,CAP))); }catch(e){} }
  function loadLast(){ var k=LASTK(); if(k===null) return -1; try{ return parseInt(localStorage.getItem(k)||'-1',10); }catch(e){ return -1; } }
  function saveLast(i){ var k=LASTK(); if(k===null) return; if(!canSave())return; var g748=f748Skip('fix307.saveLast'); if(g748&&(g748.skip||g748.hold)) return g748; try{ localStorage.setItem(k, String(i)); }catch(e){} }
  // ★fix307e: スロット厳密化用のキー固定版。run()開始時に決めたキーへ書く(切替で揺れない)。
  function rosterKey(sfx){ return 'v292Dfix307Roster'+sfx; }
  function lastKey(sfx){ return 'v292Dfix307Last'+sfx; }
  function loadRosterK(k){ try{ return JSON.parse(localStorage.getItem(k)||'[]')||[]; }catch(e){ return []; } }
  function saveRosterK(k,a){ if(!canSave())return; var g748=f748Skip('fix307.saveRoster'); if(g748&&(g748.skip||g748.hold)) return g748; try{ localStorage.setItem(k, JSON.stringify((a||[]).slice(0,CAP))); }catch(e){} }
  function loadLastK(k){ try{ return parseInt(localStorage.getItem(k)||'-1',10); }catch(e){ return -1; } }
  function saveLastK(k,i){ if(!canSave())return; var g748=f748Skip('fix307.saveLast'); if(g748&&(g748.skip||g748.hold)) return g748; try{ localStorage.setItem(k, String(i)); }catch(e){} }
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
    '一度しか出ておらず再登場が読み取れない存在は載せない(保留)。人・怪異・動物・霊など"存在"のみ対象とし、単なる現象・物体・場所・水滴・物音は載せない。既存台帳の呼称が与えられたら、同一の存在には新しい名前を作らず既存の呼称をそのまま使う(呼称は固定)。同一存在は描写が違っても1件に名寄せ統合する。外見だけでなく役割・場面・関係が複数一致する場合も同一存在と判断し、新しい呼称を作らない(fix408強化)。該当無しは[]。JSONのみ出力。';

  // ★fix408強化(2026-07-11): 既存台帳を「呼称: 外見」の行形式でLLMへ渡す(新呼称乱立の抑止=二重登録防止)。
  //   量は件数でなく総文字数2,800字上限(超えたら新しい順=lastTurn降順を優先して古い行を切る)。apprの改行は1行化(→「/」)。
  function buildExistingLines(){
    var rs=(loadRoster()||[]).filter(function(r){return r&&r.handle;});
    rs.sort(function(a,b){ var la=(typeof a.lastTurn==='number'?a.lastTurn:-1), lb=(typeof b.lastTurn==='number'?b.lastTurn:-1); return lb-la; });
    var lines=[], total=0, CAPC=2800;
    for(var i=0;i<rs.length;i++){
      var a=String(rs[i].appr!=null?rs[i].appr:'').replace(/[\r\n]+/g,'/').trim().slice(0,80);
      var line='- '+rs[i].handle+(a?(': '+a):'');
      if(total+line.length>CAPC && lines.length>0) break; // 総文字数上限=新しい順に残す
      lines.push(line); total+=line.length+1;
    }
    return lines;
  }
  function buildUserPrompt(transcript){
    var existingLines=buildExistingLines();
    return '主役(以下)は絶対に載せない: '+(castNames().join('、')||'(不明)')+'\n既存台帳(同一存在には必ずこの呼称を再利用・外見や特徴が一致する存在に新しい呼称を作らない):\n'+(existingLines.join('\n')||'(なし)')+'\n\n--- 物語 ---\n'+transcript;
  }

  function callLLM(transcript, cb){
    var key=getKey(); if(!key){ cb(null); return; }
    var user=buildUserPrompt(transcript);   // ★fix408強化: 総文字数上限+改行1行化(buildExistingLines)
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

  /* ============ ★fix764(2026-08-31) PHASE 4C: 字形フォールド（比較専用） ============
     window.__v292Dfix764 が無い/kill されている場合は null を返し、周囲は従来動作へ戻る。
     ★ fold 形は **比較にしか使わない**。handle に入れない・sys に入れない・localStorage に入れない。 */
  function f764(){ try{ var f=window.__v292Dfix764; return (f && f.__armed && typeof f.fold==='function' && !f.isOff()) ? f : null; }catch(e){ return null; } }
  function fkey764(h){ var f=f764(); var s=String(h==null?'':h); if(!f) return s; try{ return f.fold(s); }catch(e){ return s; } }
  function fsimp764(h){ var f=f764(); if(!f) return false; try{ return !!f.hasSimplifiedOnly(h); }catch(e){ return false; } }

  /* 退避は 1 セッション 1 回・新しい順 2 件まで（fix458 backupOnce と同作法）。
     退避できなければ false を返し、呼び手は統合を **しない**（fail-closed）。 */
  var _bk764=false;
  function backupRosterOnce764(arr){
    if(_bk764) return true;
    var tag='v292Dfix307_bk_fix764_';
    try{
      localStorage.setItem(tag+Date.now(), JSON.stringify(arr||[]));
      _bk764=true;
    }catch(e){ return false; }
    try{
      var bks=[];
      for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k && k.indexOf(tag)===0 && /_\d+$/.test(k)) bks.push(k); }
      bks.sort(function(a,b){ return (+a.split('_').pop()||0)-(+b.split('_').pop()||0); });
      while(bks.length>2){ var oldk=bks.shift(); try{ localStorage.removeItem(oldk); }catch(e){} }
    }catch(e){}
    return _bk764;
  }

  /* 既に台帳内に fold 同一の重複がある場合だけ **1 回だけ** 統合する。
     生き残りは先出の entry（オブジェクト同一性を保つ）で、後出からは情報が多い側を取り込む。 */
  function dedupe764(existing){
    var f=f764(); if(!f || !existing || !existing.length) return existing;
    var seen={}, dup=false, i, e, k;
    for(i=0;i<existing.length;i++){
      e=existing[i]; if(!e||!e.handle) continue;
      k=fkey764(e.handle);
      if(seen[k]){ dup=true; break; }
      seen[k]=1;
    }
    if(!dup) return existing;
    if(!backupRosterOnce764(existing)){
      try{ console.warn(TAG,'fix764: roster を退避できなかったので重複統合を中止（fail-closed）'); }catch(e2){}
      return existing;
    }
    var byK={}, out=[], merged=0;
    for(i=0;i<existing.length;i++){
      var it=existing[i];
      if(!it || !it.handle){ out.push(it); continue; }
      var kk=fkey764(it.handle), keep=byK[kk];
      if(!keep){ byK[kk]=it; out.push(it); continue; }
      /* 統合: 情報が多い方を残す（同点なら先出） */
      if(String(it.appr||'').length > String(keep.appr||'').length) keep.appr=it.appr;
      if(!keep.kind && it.kind) keep.kind=it.kind;
      if(!keep.importance && it.importance) keep.importance=it.importance;
      if(typeof it.firstTurn==='number' && (typeof keep.firstTurn!=='number' || it.firstTurn<keep.firstTurn)) keep.firstTurn=it.firstTurn;
      if(typeof it.lastTurn==='number' && (typeof keep.lastTurn!=='number' || it.lastTurn>keep.lastTurn)) keep.lastTurn=it.lastTurn;
      /* 表示形は、簡体専用字を含まない方へ寄せる（一般規則・名前リストなし） */
      if(fsimp764(keep.handle) && !fsimp764(it.handle)) keep.handle=it.handle;
      merged++;
    }
    if(merged){
      existing.length=0;
      for(i=0;i<out.length;i++) existing.push(out[i]);
      try{ console.warn(TAG,'fix764: 表記差だけの重複を統合しました count=',merged,'（退避: v292Dfix307_bk_fix764_*）'); }catch(e2){}
    }
    return existing;
  }

  // 追記マージ: 既存呼称は維持(固定)・新規は追加・重要度/外見は更新・削除しない
  function mergeRoster(existing, incoming){
    existing=existing||[];
    existing=dedupe764(existing);                                                   // ★fix764
    var byKey={}; existing.forEach(function(e){ if(e&&e.handle) byKey[fkey764(e.handle)]=e; });  // ★fix764: 引きは fold ・格納は表示形
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
      var hk=fkey764(h);                                                            // ★fix764
      var ex=byKey[hk];
      if(ex){
        /* ★fix764: 表示形の寄せ。既存が簡体専用字を含み、incoming が含まないときだけ更新する。
           fold 形は代入しない（入るのは常にモデルが実際に書いた表示形）。 */
        if(ex.handle!==h && fsimp764(ex.handle) && !fsimp764(h)) ex.handle=h;
        ex.kind=kind; ex.importance=imp; if(appr) ex.appr=appr; ex.lastTurn=ct;
      }
      else { var o={handle:h, kind:kind, importance:imp, appr:appr, firstTurn:ct, lastTurn:ct}; byKey[hk]=o; existing.push(o); }
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
    var sfx=slotSfx(); if(sfx===null) return;
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
    /* ★fix748(C5): カーソル前進は「この run が ct を予約した」という mutation。
       書けなかった場合は **LLM を撃たない**（二重発火防止が効かなくなるため）。
       次の run が同じ ct で再試行する = SKIP_THIS_PERSIST の TRIGGER。 */
    f748RunC('FIX307_CURSOR', function(){ return saveLastK(lastK, ct); }).then(function(x){
      var w = x && x.result;
      if (!(x && x.ran) || (w && (w.skip || w.hold))){
        try{ console.log(TAG,'fix748: カーソルを書けなかったので今回は抽出しない（次の run で再試行）'); }catch(e){}
        return;
      }
      runLLM();
    });
    function runLLM(){
    callLLM(tr, function(out){
      // ★再確認: LLM(最大90s)中にスロット切替/物語差替が起きていたら、このスロットには書かない。
      var s2=getS();
      if(!s2 || !s2.scene || (s2.scene.loc||null)!==curLoc) return; // 物語が差し替わった
      if(slotSfx()!==sfx) return;                                   // アクティブスロットが変わった
      var arr=parseArr(out);
      if(!arr) return;                       // 失敗時は次INTERVALで再試行
      /* ★fix748(C5): roster 書込は Class C transaction。network(callLLM) は **この外**で終わっている。 */
      f748RunC('FIX307_ROSTER', function(){
        var merged=mergeRoster(loadRosterK(storeK), arr);
        var w = saveRosterK(storeK, merged);
        return { merged: merged, w: w };
      }).then(function(x){
        var r = x && x.result;
        if (!(x && x.ran) || (r && r.w && (r.w.skip || r.w.hold))){
          try{ console.log(TAG,'fix748: roster 保存を飛ばした（次の INTERVAL で同じ窓から再抽出）'); }catch(e){}
          return;
        }
        try{ console.log(TAG,'roster updated, count=', r.merged.length, 'slot=', sfx||'(default)'); }catch(e){}
      });
    });
    }
  }

  // リセット安全: turns=0なのにロスターが残ってたらクリア
  function resetCheck(){
    var s=getS(); if(!s||!Array.isArray(s.turns)) return;
    // ★fix307e: 中間状態での誤クリア防止。Sが空(新規)でも、保存先スロットのblobが別物語を
    //   持っているなら切替中なので触らない。blobも空/一致の時だけクリアする。
    var sfx=slotSfx(); if(sfx===null) return; var storeK=rosterKey(sfx), lastK=lastKey(sfx);
    var blobLoc=slotBlobLoc(sfx); var curLoc=(s.scene&&s.scene.loc)||null;
    if(blobLoc && curLoc && blobLoc!==curLoc) return;
    if(s.turns.length===0 && (loadRosterK(storeK).length || loadLastK(lastK)>=0)){
      /* ★fix748(C5): roster と cursor の削除は **同じ logical transaction**。
         片方だけ消すと「カーソルは進んだままロスターが空」という desync を作る。 */
      f748RunC('FIX307_RESET', function(){
        try{ localStorage.removeItem(storeK); localStorage.removeItem(lastK); }catch(e){}
        return true;
      }).then(function(x){
        if (!(x && x.ran)){ try{ console.log(TAG,'fix748: reset を飛ばした（4 秒後の resetCheck で再試行）'); }catch(e){} return; }
        try{ console.log(TAG,'no turns — roster cleared'); }catch(e){}
      });
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

  window.__v292Dfix307api={ loadRoster:loadRoster, saveRoster:saveRoster, run:run, mergeRoster:mergeRoster, dedupe764:dedupe764, fkey764:fkey764, parseArr:parseArr, recentTranscript:recentTranscript, installWiShim:installWiShim, SYS:SYS, buildExistingLines:buildExistingLines, buildUserPrompt:buildUserPrompt };
  try{ console.log(TAG,'loaded (fix307e slot-strict)'); }catch(e){}
})();
