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

  // ポーリング: 現ターン数をキーにfix77スナップを最新化(直近25ターン分だけ保持)
  try{ setInterval(function(){
    if(off()) return;
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
              var _r748 = restoreTo(s.turns.length-1);
              if (_r748 && _r748.hold === true) return _r748;
            }
          }
        }catch(e){}
        return orig.apply(this,arguments);
      };
    });
    g.__v292Dfix302=true;
    try{ console.log('[v292Dfix302] undo/retry state-rollback wired'); }catch(e){}
    return true;
  }
  (function w(){ w._n=(w._n||0)+1; if(wrap()) return; if(w._n>120) return; setTimeout(w,500); })();

  window.__v292Dfix302api={ snaps:snaps, restoreTo:restoreTo, curLen:curLen };
})();
