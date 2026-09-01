/* ============================================================================
 * v292Dfix228: スロット自動世代バックアップ(直近3世代)+クロバー検知
 *
 * 背景: 2026-06-06、マルチタブ環境のクロバーでスロットa(22ターン)が初回1ターンに
 *   巻き戻る事故が発生(epoch更新・longmem空・fix77クリアの全リセット痕跡)。
 *   localStorage内にバックアップが無く復元不能だった。本fixはその恒久保険。
 *
 * 仕組み:
 *   ・2秒間隔でアクティブスロット(window.__chr6Key())の値を監視
 *   ・ターン数が変化したら、変化「前」の値を世代リング(最大3世代)へ退避
 *     キー: __gen_<slotKey> = [{t:保存時刻, turns:ターン数, data:生JSON}, ...] 新しい順
 *   ・激減検知: 新しい値のターン数が「前の半分未満かつ前>=5」なら console.error で警告
 *     (正規のリセットでも警告は出るが、世代に直前版が必ず残るので復元可能)
 *   ・復元: コンソールで window.__v292Restore() → 最新世代をスロットへ書き戻し+リロード
 *           window.__v292Restore(2) で2世代前。window.__v292Gens() で一覧。
 *
 * 容量: スロット~200KB×3世代×スロット数。localStorage上限(5-10MB)内に収まる想定。
 *   超過時(setItem例外)は最古世代から自動破棄。
 * OFF: localStorage v292SlotGenOff='1'
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix228]';
  try { if (localStorage.getItem('v292SlotGenOff') === '1') return; } catch(e){}
  if (window.__v292Dfix228) return; window.__v292Dfix228 = 1;

  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: 共有ポインタ chr6_active_slot(= __chr6Key()) は**全タブで1個**。別タブが物語を
       開いた瞬間このタブの key 解決が相手の story を指し、世代控え __gen_<key> と世代復元の書込先 が
       別 story へ着弾/汚染された(実測: ct_fix783_multitab.mjs R群)。
     対処: key 解決を fix694 document authority(__chronicleDocumentStoryKey)へ固定する
       (fix307f と同じ作法)。authority 無し document(home 等)では null=**読まない/書かない**。
     kill: localStorage v292Dfix783Off='1' → 全ファイル同時に旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return localStorage.getItem('v292Dfix783Off')==='1'; }catch(e){ return false; } }
  function slotKey(){
    if (!f783Off()){
      try { var dk = window.__chronicleDocumentStoryKey; if (typeof dk === 'string' && dk) return dk; } catch(e){}
      return null;                                   /* authority 無し = 触らない */
    }
    try { return (window.__chr6Key && window.__chr6Key()) || 'chr6'; } catch(e){ return 'chr6'; }
  }
  function genKey(k){ return '__gen_' + k; }
  function turnsOf(raw){ try { var d = JSON.parse(raw); return (d && Array.isArray(d.turns)) ? d.turns.length : -1; } catch(e){ return -1; } }
  function loadGens(k){ try { return JSON.parse(localStorage.getItem(genKey(k)) || '[]') || []; } catch(e){ return []; } }
  function saveGens(k, gens){
    while (true){
      try { localStorage.setItem(genKey(k), JSON.stringify(gens)); return true; }
      catch(e){ if (gens.length <= 1) return false; gens.pop(); /* 容量超過: 最古を捨てて再試行 */ }
    }
  }

  var lastSeen = null; /* このタブが最後に観測したスロット生値 */

  /* ==========================================================================
   * ★v292Dfix651(B): 物語の切替でこの監視が汚染される欠陥の根治
   * ---------------------------------------------------------------------
   * 旧実装は lastSeen が「どの物語の値か」を覚えていなかった。物語Aを見ている
   * 途中で物語Bへ切り替わると、次の tick で k=Bのキー / lastSeen=Aの生値 になり、
   * ターン数が違えば **Aの中身が __gen_<Bのキー> へ退避される**（他人の控えが
   * 別の物語の世代に混ざる＝復元すると別の物語が復活する）。
   * 対策: 観測キーを捕まえておき、
   *   ・キーが変わった tick では **絶対に退避しない**（armed=false / lastSeen=null）
   *   ・同じキーで次の tick まで安定して初めて基準を取り直し armed=true
   *   ・退避の直前にもう一度、捕捉キー・armed・lastSeen・指紋を確かめる
   * 2秒間隔は変えない。OFF: v292Dfix651SlotBackupGuardOff='1'（旧挙動へ戻す）
   * ======================================================================== */
  var capturedKey = null;   /* 前回の tick で見ていたスロットキー */
  var armed = false;        /* 同じキーで安定して基準が取れているか */
  function guardOff(){
    try { return localStorage.getItem('v292Dfix651SlotBackupGuardOff') === '1'; } catch(e){ return false; }
  }
  /* lastSeen の中に物語を特定できる指紋があるか。**無ければ推測しない**（null を返す）。 */
  function fingerprintOf(raw){
    try {
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      var cand = [d.slotId, d.storyId, d._slot,
                  d.cfg && d.cfg.slotId, d.cfg && d.cfg.storyId,
                  d.scene && d.scene.slotId, d.scene && d.scene.storyId];
      for (var i = 0; i < cand.length; i++){
        if (typeof cand[i] === 'string' && cand[i]) return cand[i];
      }
      return null;
    } catch(e){ return null; }
  }
  function idOfKey(k){ return (k === 'chr6') ? 'default' : String(k).replace(/^chr6_slot_/, ''); }

  function tick(){
    try {
      var k = slotKey();
      if (!k) return;                                  /* ■fix783: authority 無し = 監視しない */
      if (!guardOff()){
        /* ★切替 tick: 退避も比較もしない。基準を捨てて armed を降ろすだけ。 */
        if (k !== capturedKey){ capturedKey = k; armed = false; lastSeen = null; return; }
      }
      var cur = localStorage.getItem(k);
      if (cur == null) return;
      if (lastSeen === null){ lastSeen = cur; armed = true; return; } /* 初回観測は基準取りのみ */
      if (cur === lastSeen) return;
      var prevTurns = turnsOf(lastSeen), curTurns = turnsOf(cur);
      if (prevTurns !== curTurns && prevTurns >= 0){
        /* ★退避の直前に、いま退避しようとしている値が本当にこのスロットのものか確かめ直す */
        if (!guardOff()){
          if (!armed || lastSeen === null){ lastSeen = cur; return; }
          if (slotKey() !== k || k !== capturedKey){ armed = false; lastSeen = null; return; }
          var fp = fingerprintOf(lastSeen);
          if (fp && fp !== idOfKey(k)){
            try { console.warn(TAG, '退避を中止: 控えの指紋が現在の物語と違う (' + fp + ' vs ' + idOfKey(k) + ')'); } catch(e){}
            lastSeen = cur; return;
          }
        }
        /* 変化前の値を世代へ退避 */
        var gens = loadGens(k);
        gens.unshift({ t: Date.now(), turns: prevTurns, data: lastSeen });
        if (gens.length > 3) gens.length = 3;
        saveGens(k, gens);
        if (prevTurns >= 5 && curTurns >= 0 && curTurns < prevTurns / 2){
          try { console.error(TAG, '⚠ スロット激減検知: ' + k + ' turns ' + prevTurns + '→' + curTurns + '。直前版は世代に退避済み。復元= window.__v292Restore()'); } catch(e){}
        } else {
          try { console.log(TAG, 'gen saved: ' + k + ' (' + prevTurns + 'T→' + curTurns + 'T)'); } catch(e){}
        }
      }
      lastSeen = cur;
    } catch(e){}
  }

  window.__v292Gens = function(){
    var k = slotKey();
    if (!k) return [];                                /* ■fix783 */
    return loadGens(k).map(function(g, i){ return { gen: i + 1, turns: g.turns, savedAt: new Date(g.t).toLocaleString() }; });
  };
  window.__v292Restore = function(n){
    n = n || 1;
    var k = slotKey();
    if (!k){ try { console.warn(TAG, 'この document には書込権限がありません(fix694)'); } catch(e){} return false; }   /* ■fix783 */
    var gens = loadGens(k);
    var g = gens[n - 1];
    if (!g){ console.warn(TAG, '世代' + n + 'がありません。__v292Gens()で一覧確認。'); return false; }
    try {
      /* 現在値も世代へ退避してから復元(復元自体も巻き戻せるように) */
      var cur = localStorage.getItem(k);
      if (cur != null){ gens.unshift({ t: Date.now(), turns: turnsOf(cur), data: cur }); if (gens.length > 3) gens.length = 3; saveGens(k, gens); }
      /* ★v292Dfix651(C): 世代復元は「明示的な復元」＝正規経路。0ターン世代を書き戻す場合も通す。 */
      try { if (window.__v292Dfix651 && typeof window.__v292Dfix651.allowOnce === 'function') window.__v292Dfix651.allowOnce('fix228-restore'); } catch(e){}
      localStorage.setItem(k, g.data);
      console.log(TAG, '世代復元: ' + k + ' → ' + g.turns + 'ターン版。リロードします。');
      setTimeout(function(){ location.reload(); }, 300);
      return true;
    } catch(e){ console.error(TAG, 'restore err', e && e.message); return false; }
  };

  setInterval(tick, 2000);
  tick();
  try { console.log(TAG, 'slot generation backup armed (3 gens, 2s watch)'); } catch(e){}
})();


/* v292Dfix264b: quota自己回復。物語データの保存(setItem)がQuotaExceededで失敗したら、世代バックアップ(__gen_*)を古い順に間引き→残骸(__bak*)削除→保存リトライ。優先順位=現在の保存>過去のバックアップ。OFF: v292QuotaGuardOff='1' */
(function(){
  var TAG='[v292Dfix264b]';
  try { if (localStorage.getItem('v292QuotaGuardOff')==='1') return; } catch(e){}
  if (window.__v292QuotaGuard) return; window.__v292QuotaGuard=1;
  var prev = localStorage.setItem.bind(localStorage);
  function isQuota(e){ return !!e && (e.name==='QuotaExceededError' || e.code===22 || /quota/i.test(String(e))); }
  function shrinkOnce(){
    var gks=[]; try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k && k.indexOf('__gen_')===0) gks.push(k); } }catch(e){}
    var did=false;
    for(var j=0;j<gks.length;j++){
      try{
        var g=JSON.parse(localStorage.getItem(gks[j])||'[]');
        if(Array.isArray(g) && g.length>0){ g.pop(); did=true;
          if(g.length===0){ localStorage.removeItem(gks[j]); }
          else { try{ prev(gks[j], JSON.stringify(g)); }catch(e2){ try{ localStorage.removeItem(gks[j]); }catch(_){} } }
        }
      }catch(e3){ try{ localStorage.removeItem(gks[j]); }catch(_){} did=true; }
    }
    if(!did){
      var bks=[]; try{ for(var i2=0;i2<localStorage.length;i2++){ var k2=localStorage.key(i2); if(k2 && k2.indexOf('__bak')===0) bks.push(k2); } }catch(e){}
      for(var j2=0;j2<bks.length;j2++){ try{ localStorage.removeItem(bks[j2]); did=true; }catch(e){} }
    }
    return did;
  }
  localStorage.setItem = function(k, v){
    try { return prev(k, v); }
    catch(e){
      /* ★★fix572(2026-07-26・実機で発覚): `__v543hp` は fix543 が**空き容量を測るために
         わざと失敗させるプローブ**（二分探索で上限に当たるまで書く）。これを本物の保存失敗として
         扱っていたため、**測るたびにこの緊急GCが発動し、__gen_ 世代と __bak を削っていた**。
         実測: おしんの実機で `__gen_` が **0件**（事故復元の主力が食い尽くされていた）。
         さらに「保存領域が満杯」トーストまで出るので、**空きが2MBあっても満杯に見えていた**。
         → 診断プローブは削除の引き金にしない（削除意図の分類: probe は reclaim ではない）。 */
      if(String(k).indexOf('__v543')===0) throw e;
      if(!isQuota(e) || String(k).indexOf('__gen_')===0 || String(k).indexOf('chr6_bk_')===0) throw e; // fix495(C3): 控え(chr6_bk_*)のために__gen_世代(事故復元の主力)を食い潰さない。fix490側の自前quota処理に委ねる
      for(var n=0;n<8;n++){
        if(!shrinkOnce()) break;
        try { var r=prev(k, v); try{ console.warn(TAG,'quota回復: 世代を間引いて保存成功 ('+k+')'); }catch(_){} return r; } catch(e2){ if(!isQuota(e2)) throw e2; }
      }
      try { console.error(TAG,'⚠ 容量不足で保存失敗: '+k); } catch(_){}
      try {
        var t=document.getElementById('v264toast'); if(t) t.remove();
        t=document.createElement('div'); t.id='v264toast';
        t.style.cssText='position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:99999;background:#3a2a14;color:#ffe9c9;border:1px solid #a07c40;border-radius:10px;padding:10px 14px;font-size:13px;max-width:86vw';
        t.textContent='⚠ ブラウザ保存領域が満杯で保存できません。バックアップ削除や不要スロット整理が必要です。';
        document.body.appendChild(t); setTimeout(function(){ try{ t.remove(); }catch(_){} }, 15000);
      } catch(_){}
      throw e;
    }
  };
  try { console.log(TAG, 'quota guard armed'); } catch(e){}
})();
