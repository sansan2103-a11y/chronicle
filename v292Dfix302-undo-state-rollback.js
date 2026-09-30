// =====================================================================
// Chronicle TRPG - v292Dfix302: 取消/やり直し時のキャラ状態巻き戻し
//   問題(おしん実証): 取消(G.undo)はS.turns.pop()でターンは消すが、fix77のキャラ状態
//     (体/心/本能・window.__v292Dfix77Store)は巻き戻らない。取り消した展開の状態
//     (例:右腕で少女を貫いている)が残って毎ターンsys注入され、モデルが続けてしまう。
//   修正: ターン数ごとにfix77ストアのスナップショットを保持(ポーリング)。
//     G.undo/G.retryの直前に、巻き戻る先のターン数のスナップに状態を復元する。
//     これで「ターンも状態も」一緒に戻る。fix77/本体は不触・キルスイッチ付き。
//   注: スナップはメモリ保持(リロードで消える)。1セッション内の取消→続行を想定。
//   fix302b: wrap()の var G が巻き上げで素のグローバルGを隠す不具合を修正(実機でwindow.G未定義のため顕在化)。
//   OFF: localStorage v292Dfix302Off='1'
// =====================================================================
(function(){
  'use strict';
  if(window.__v292Dfix302) return; window.__v292Dfix302=true;
  function getS(){ try{ return window.S||(typeof S!=='undefined'?S:null); }catch(e){ return null; } }
  function getStore(){ return window.__v292Dfix77Store; }
  function clone(o){ try{ return JSON.parse(JSON.stringify(o||{})); }catch(e){ return null; } }
  function off(){ try{ return localStorage.getItem('v292Dfix302Off')==='1'; }catch(e){ return false; } }
  function curLen(){ var s=getS(); return (s&&Array.isArray(s.turns))?s.turns.length:-1; }

  var snaps={}; // turnCount -> fix77ストアのスナップショット(その時点の状態)

  /* ★★fix926 (N11 A2_POST_COMMIT_SNAPSHOT / GPT裁定827・候補・未出荷):
     根因 SNAPSHOT_POISONED_BEFORE_PUSH = 下の 1.2s ポーリングが captureState(parse) と S.turns.push の間に着地し、
     snaps[L] を「turn L+1 の状態」で上書きしていた。→ ポーリングは authority から外す（fix926 ON では何もしない）。
     snaps[L] は TURN_COMMIT transaction の内側、push+save 直後に同期で撮る（= turn L の committed state）。
     base は chr:engine-booted で snaps[len] が無いときだけ撮る。
     RELOAD 後の取消 = UNDO_AFTER_RELOAD_NO_SNAPSHOT は KNOWN_RESIDUAL（A2 では直らない）。
     OFF: localStorage v292Dfix926Off='1' → 旧 fix302（ポーリング）挙動へ完全復帰。 */
  /* ★★fix926L（GPT裁定834 L1 DARK_DEPLOY_STORY_SCOPED・live 確認専用）:
     fix926 は既定 OFF（= ac25 の fix302 と同じ挙動）。次の 2 つが両方そろった document だけで ON:
       (1) この document の物語 = LIVE926_STORY（bytes に固定した合成 test story 1 本）
       (2) localStorage v292Dfix926LiveStory が LIVE926_STORY と完全一致（明示 opt-in）
     欠落・不一致・不正値・kill（v292Dfix926Off='1'）はすべて OFF。Owner 本命・保護 story は (1) で構造的に除外。 */
  var LIVE926_STORY='smuo5irdupq';
  function gate926For(docKey, optIn){
    try{
      if(!/^[a-z0-9]{6,32}$/.test(LIVE926_STORY)) return false;
      if(typeof docKey!=='string' || typeof optIn!=='string') return false;
      return optIn===LIVE926_STORY && docKey===('chr6_slot_'+LIVE926_STORY);
    }catch(e){ return false; }
  }
  function gate926(){ try{ return gate926For(window.__chronicleDocumentStoryKey, localStorage.getItem('v292Dfix926LiveStory')); }catch(e){ return false; } }
  function off926(){ try{ if(localStorage.getItem('v292Dfix926Off')==='1') return true; }catch(e){ return true; } return !gate926(); }
  function h32(str){ var h=5381; str=String(str); for(var i=0;i<str.length;i++){ h=((h<<5)+h+str.charCodeAt(i))|0; } return (h>>>0).toString(16); }
  function turnId(t){ try{ return t ? h32(String(t.playerText||'')+'\u0001'+String(t.narrative||'').slice(0,400)) : null; }catch(e){ return null; } }
  var meta={};   // turnCount -> {kind:'commit'|'base'|'seed', hash, tid, t}
  var refs={};   // turnCount -> その時点で最後だった turn object（同一性で照合する。narrative の後処理に影響されない）
  var f926={ commits:0, bases:0, sameLenOverwriteOk:0, sameLenWithoutRollback:0, postCommitDrift:0, log:[], viol:[] };
  var rolledBackSinceCommit=false;
  function pushLog(a,x){ a.push(x); if(a.length>80) a.shift(); }
  function prune(L){ Object.keys(snaps).forEach(function(k){ if(L-(+k)>25 || (+k)>L){ delete snaps[k]; delete meta[k]; delete refs[k]; } }); }
  function commitSnap(){
    var s=getS(), st=getStore();
    if(!s || !Array.isArray(s.turns) || !st) return;
    var L=s.turns.length, c=clone(st); if(!c) return;
    var h=h32(JSON.stringify(c)), tid=turnId(s.turns[L-1]), prev=meta[L];
    if(prev && prev.kind==='commit'){
      if(rolledBackSinceCommit) f926.sameLenOverwriteOk++;
      else { f926.sameLenWithoutRollback++; pushLog(f926.viol,{ kind:'SAME_LEN_OVERWRITE_WITHOUT_ROLLBACK', len:L, prevHash:prev.hash, hash:h, prevTid:prev.tid, tid:tid }); }
    }
    snaps[L]=c; meta[L]={ kind:'commit', hash:h, tid:tid, t:Date.now() }; refs[L]=L>0?s.turns[L-1]:null;
    prune(L);
    rolledBackSinceCommit=false; f926.commits++;
    pushLog(f926.log,{ ev:'commit', len:L, idx:L, hash:h, tid:tid });
  }
  function baseSnap(why){
    if(off() || off926()) return;
    var L=curLen(), st=getStore();
    if(L<0 || !st || snaps[L]) return;
    var c=clone(st); if(!c) return;
    var s0=getS();
    snaps[L]=c; meta[L]={ kind:'base', hash:h32(JSON.stringify(c)), tid:(s0&&L>0)?turnId(s0.turns[L-1]):null, t:Date.now() }; refs[L]=(s0&&L>0)?s0.turns[L-1]:null; f926.bases++;
    pushLog(f926.log,{ ev:'base', why:why, len:L, idx:L, hash:meta[L].hash });
  }
  /* ★fix926 rev C: 起動済みで読み込まれた document（chr:engine-booted を聞き逃した）でも base を撮る。
     rev B 実測（CA1: 2 台目 device の fresh document）で engine-booted の listener 登録前に boot が完了し、base 0 件だった。 */
  function booted926(){ try{ var b=window.__chrEngineBoot; return (typeof b!=='function') || b.__ran===true; }catch(e){ return true; } }
  try{ window.addEventListener('chr:engine-booted', function(){ setTimeout(function(){ try{ baseSnap('engine-booted'); }catch(e){} }, 0); }); }catch(e){}

  // ポーリング: 現ターン数をキーにfix77スナップを最新化(直近25ターン分だけ保持)  ★fix926 ON では authority ではない（何もしない）
  try{ setInterval(function(){
    if(off()) return;
    if(!off926()) return;
    var L=curLen(), st=getStore();
    if(L>=0 && st){ var c=clone(st); if(c){ snaps[L]=c; Object.keys(snaps).forEach(function(k){ if(L-(+k)>25) delete snaps[k]; }); } }
  }, 1200); }catch(e){}

  /* ★★fix748(Phase C / C16 = Class D): この復元は
     「reload をまたぐと取り消したはずの状態が復活する」= 失うと再構成できない mutation なので Class D。
     ・意味的所有者は G.undo / G.retryRollback（＝ユーザーの取消・やり直し操作）であり、
       そこが GWS Class D admission を取る。
     ・ここは **同期のまま**。admission の外から呼ばれたら 1 バイトも書かず hold を返す
       （silent success 禁止 = メモリ側 store も書き換えない）。 */
  function dadm(){ try{ return window.__v292DfixDAdm || null; }catch(e){ return null; } }
  function admissionHold(){
    var A = dadm();
    if (!A || typeof A.syncGuard !== 'function') return null;   /* fix748 が無い環境は従来どおり */
    return A.syncGuard('fix302.restoreTo');
  }
  function restoreTo(L){
    var st=getStore(), snap=snaps[L];
    if(!st || !snap) return false;
    /* ★fix926 rev B: 復元は snapshot の **複製** を store へ入れる。
       rev A 実測(U77_BRANCH FAIL): 旧実装は snap の entry object をそのまま store へ入れるため、
       次ターンの fix77 captureState（store[who] を in-place 更新）が snaps[L] 自体を書き換えていた
       = SNAPSHOT_ALIASING_AFTER_RESTORE。旧ポーリングは毎回上書きしていたので顕在化しなかった。
       fix926Off なら旧挙動（参照のまま）。 */
    if(!off926()){
      /* ★fix926 rev C: snapshot は「長さ L の時点で最後だった turn」と結び付ける。復元先 L の現 turn と一致しなければ
         復元しない（別物語の in-memory 読込 / 別 branch の残骸を戻さない。rev B 実測 CA2 で別物語の snapshot を復元した）。 */
      try{
        var m926=meta[L], s926=getS();
        if(m926 && s926 && Array.isArray(s926.turns) && L>0 && (L in refs) && refs[L]!==s926.turns[L-1]){
          f926.tidMismatch=(f926.tidMismatch||0)+1; pushLog(f926.viol,{ kind:'RESTORE_TID_MISMATCH', len:L, snapTid:m926.tid, curTid:turnId(s926.turns[L-1]) });
          delete snaps[L]; delete meta[L]; delete refs[L];   /* 古い snapshot は捨てる（直後の post-rollback seed が現 turn で埋め直す） */
          return false;
        }
      }catch(_t926){}
      snap=clone(snap); if(!snap) return false;
    }
    /* ★fix748: lock の外なら **メモリも localStorage も触らない**。
       メモリだけ巻き戻して persist しないと、次の persist で巻き戻し後の状態が
       別 transaction として書かれてしまうため、両方まとめて止める。 */
    var _h748 = admissionHold();
    if (_h748 && _h748.hold){
      try{ console.warn('[v292Dfix302]', 'class D admission 外からの復元要求のため何もしない'); }catch(e){}
      return _h748;
    }
    try{
      // __v292Dfix77Storeの参照を保ったまま中身を差し替え(buildStatesBlockが読む実体)
      Object.keys(st).forEach(function(k){ delete st[k]; });
      Object.keys(snap).forEach(function(k){ st[k]=snap[k]; });
      try{ localStorage.setItem('v292Dfix77States', JSON.stringify(st)); }catch(e){} // fix246がスロット接尾辞へ
      try{ console.log('[v292Dfix302] fix77 state rolled back to '+L+' turns'); }catch(e){}
      return true;
    }catch(e){ return false; }
  }

  function wrap(){
    // 注意: var G にすると巻き上げで typeof G が未定義のローカルを指す→素のグローバルGを取れない(fix302b)
    var g=window.G||(typeof G!=='undefined'?G:null);
    if(!g) return false;
    if(g.__v292Dfix302) return true;
    /* ★fix748: wrap 先を 'retry' から 'retryRollback' へ移した。
       'retry' は network(submit) を含む async 入口になったため、そこを wrap すると
       復元が Class D admission の外側になってしまう。巻き戻しだけを持つ retryRollback を wrap する。
       retryRollback が無い旧構成では従来どおり 'retry' を wrap する（互換）。 */
    var _targets748 = ['undo', (typeof g.retryRollback === 'function') ? 'retryRollback' : 'retry'];
    _targets748.forEach(function(fn){
      if(typeof g[fn]!=='function') return;
      var orig=g[fn].bind(g);
      g[fn]=function(){
        // popされる前に「巻き戻り先=現ターン数-1」の状態へ先に復元(retryの再生成にも効く)
        /* ★fix748: 復元が hold されたら **上位操作も成功させない**（pop も save もしない）。 */
        try{
          if(!off()){
            var s=getS();
            if(s && !s.inFlight && Array.isArray(s.turns) && s.turns.length>0){
              /* ★fix926: 取消直前に「committed snapshot 以降に fix77 が変わっていないか」を記録（assertion のみ・挙動不変） */
              if(!off926()){
                try{
                  var _L926=s.turns.length, _m926=meta[_L926], _st926=getStore();
                  var _h926=_st926 ? h32(JSON.stringify(_st926)) : null;
                  if(_m926 && _m926.kind==='commit' && _h926!==_m926.hash){ f926.postCommitDrift++; pushLog(f926.viol,{ kind:'POST_COMMIT_DRIFT', len:_L926, snapHash:_m926.hash, storeHash:_h926 }); }
                  pushLog(f926.log,{ ev:fn, len:_L926, target:_L926-1, haveTarget:!!snaps[_L926-1], targetHash:meta[_L926-1] ? meta[_L926-1].hash : null, storeHash:_h926 });
                  rolledBackSinceCommit=true;
                }catch(_e926){}
              }
              var _r748 = restoreTo(s.turns.length-1);
              if (_r748 && _r748.hold === true) return _r748;
            }
          }
        }catch(e){}
        var _ret926=orig.apply(this,arguments);
        /* ★fix926 rev C: rollback（pop）直後、現在長の snapshot が無ければ今の store で 1 回だけ seed する（既存 key は上書きしない）。
           rev B 実測（CA1_REOPEN）: 復元できなかった取消の後、旧 polling は snaps[len] を埋めていたが A2 では空のままで、
           次の「turn → 取消」で取り消した turn の state が残った（OFF より悪化）。論理境界での seed に置き換える。 */
        try{
          if(!off() && !off926()){
            var s2=getS();
            if(s2 && !s2.inFlight && Array.isArray(s2.turns)){
              var L2=s2.turns.length, st2=getStore();
              if(L2>=0 && st2 && !snaps[L2]){ var c2=clone(st2); if(c2){ snaps[L2]=c2; meta[L2]={ kind:'seed', hash:h32(JSON.stringify(c2)), tid:L2>0?turnId(s2.turns[L2-1]):null, t:Date.now() }; refs[L2]=L2>0?s2.turns[L2-1]:null; f926.seeds=(f926.seeds||0)+1; pushLog(f926.log,{ ev:'seed-after-'+fn, len:L2, hash:meta[L2].hash }); } }
            }
          }
        }catch(_s926){}
        return _ret926;
      };
    });
    /* ★fix926: TURN_COMMIT の transaction 内側（push + save の直後・同期）で committed snapshot を撮る。
       fn が走らなかった（admission hold）/ true を返さなかったターンは撮らない。fix926Off / fix302Off なら素通し。 */
    if(typeof g._dadmRun==='function' && !g._dadmRun.__f926){
      var origRun=g._dadmRun;
      var run926=function(label, fn){
        if(label==='TURN_COMMIT' && typeof fn==='function' && !off() && !off926()){
          var inner=fn;
          fn=function(){ var r=inner.apply(this, arguments); try{ if(r===true) commitSnap(); }catch(e){} return r; };
        }
        return origRun.call(this, label, fn);
      };
      run926.__f926=true; g._dadmRun=run926;
    }
    g.__v292Dfix302=true;
    try{ setTimeout(function(){ try{ if(booted926()) baseSnap('wired-after-boot'); }catch(e){} }, 0); }catch(e){}
    try{ console.log('[v292Dfix302] undo/retry state-rollback wired'); }catch(e){}
    return true;
  }
  (function w(){ w._n=(w._n||0)+1; if(wrap()) return; if(w._n>120) return; setTimeout(w,500); })();

  window.__v292Dfix302api={ snaps:snaps, restoreTo:restoreTo, curLen:curLen,
    /* ★fix926 assertion 面（read-only 診断） */
    f926:{ meta:meta, stats:f926, off:off926, gate:gate926, gateFor:gate926For, liveStory:LIVE926_STORY,
      verify:function(){ var L=curLen(), st=getStore(), m=meta[L]; var h=st ? h32(JSON.stringify(st)) : null; return { len:L, storeHash:h, snapHash:m ? m.hash : null, kind:m ? m.kind : null, eq:!!m && m.hash===h }; } } };
})();
