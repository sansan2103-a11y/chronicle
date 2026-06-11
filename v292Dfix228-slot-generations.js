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

  function slotKey(){ try { return (window.__chr6Key && window.__chr6Key()) || 'chr6'; } catch(e){ return 'chr6'; } }
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

  function tick(){
    try {
      var k = slotKey();
      var cur = localStorage.getItem(k);
      if (cur == null) return;
      if (lastSeen === null){ lastSeen = cur; return; } /* 初回観測は基準取りのみ */
      if (cur === lastSeen) return;
      var prevTurns = turnsOf(lastSeen), curTurns = turnsOf(cur);
      if (prevTurns !== curTurns && prevTurns >= 0){
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
    return loadGens(k).map(function(g, i){ return { gen: i + 1, turns: g.turns, savedAt: new Date(g.t).toLocaleString() }; });
  };
  window.__v292Restore = function(n){
    n = n || 1;
    var k = slotKey();
    var gens = loadGens(k);
    var g = gens[n - 1];
    if (!g){ console.warn(TAG, '世代' + n + 'がありません。__v292Gens()で一覧確認。'); return false; }
    try {
      /* 現在値も世代へ退避してから復元(復元自体も巻き戻せるように) */
      var cur = localStorage.getItem(k);
      if (cur != null){ gens.unshift({ t: Date.now(), turns: turnsOf(cur), data: cur }); if (gens.length > 3) gens.length = 3; saveGens(k, gens); }
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
      if(!isQuota(e) || String(k).indexOf('__gen_')===0) throw e;
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
