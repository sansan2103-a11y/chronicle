// =====================================================================
// Chronicle TRPG - v292Dfix490: スロット上書き事故の根治(セーブ消失ガード)
// ---------------------------------------------------------------------
// ★経緯(2026-07-19・実データで確定した2事故):
//   ① 2026-07-13 19:53 セーブ管理UIテスト(fix460)中、confirmスタブ下で
//      「現在の状態を保存」が別カード上で発火 → テスト中の離島16Tが
//      デフォルト枠と smr8p8wfr8b(廃墟の物語25T)を上書きし消失。
//   ② 2026-07-16 23:44 おしんの実プレイ中、同ボタンが澪のカードで押され
//      グレイヘイヴン1Tが澪の学園10Tを上書きし消失。
//   共通の構造欠陥(v30コア saveto):
//     - 「activeを一時切替 → S.save() → 戻す」方式のため、押した瞬間に
//       今プレイ中のデータが対象スロットへ流れ込む
//     - 確認文が「何が消えるか」を示さない(全カード名が『新しい物語』で区別不能)
//     - 上書き前のバックアップが無い → 押した時点で即消失
//
// ★修正(2段構え・コア不触・後方互換):
//   [A] saveto差し替え: captureで元ハンドラを止め、
//       - activeカード → 従来どおり S.save()(意味は「今を保存」)
//       - 別カード → activeを切り替えず対象キーへ直接書込。
//         上書き前に (1)消える物語と入る物語を明示する確認
//                    (2)chr6_bk_saveto_<id>_<ts> へ自動控え(2世代)
//   [B] 最後の砦(常設ガード): localStorage.setItem 境界で
//       'chr6' / 'chr6_slot_*' への「確立した物語(3ターン以上)を
//       別物語または大幅縮小データで上書き」する書込を検知したら、
//       書込前に chr6_bk_guard_<key>_<ts> へ自動控え(2世代)。
//       ★ブロックはしない(リセット/JSON取込/強制pull等の正規縮小を壊さない)。
//       どの経路の事故でも「消えても必ず戻せる」状態にする。
//
// 冪等: window.__v292Dfix490 / OFF: localStorage.v292Dfix490Off='1'
// 検証口: __v292Dfix490.check(oldRaw,newRaw) / .stats() / .lastGuard
// 注意: 確認文に「読込/読み込む」を含めない(fix407の自動承諾に拾われるため)
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix490 && window.__v292Dfix490.__armed) return;
  var TAG = '[v292Dfix490:slot-write-guard]';
  var stats = { guarded: 0, savetoSafe: 0, savetoActive: 0, backups: 0, backupSkipped: 0 };   /* fix576: 控えを諦めた回数 */
  var suppressGuardUntil = 0;   // [A]が自前で控えを取った直後の二重控え抑止(500ms)

  function off(){ try { return localStorage.getItem('v292Dfix490Off') === '1'; } catch(e){ return false; } }
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }

  // ---- 共通: スロットraw文字列の要約(turns数・場所・turn1指紋) ----
  function summarize(raw){
    if (typeof raw !== 'string' || !raw) return null;
    try {
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      var turns = Array.isArray(d.turns) ? d.turns.length : 0;
      var loc = '';
      try { loc = String((d.scene && d.scene.loc) || '').slice(0, 24); } catch(e){}
      var t1 = '';
      try { if (turns > 0) t1 = JSON.stringify(d.turns[0]).slice(0, 400); } catch(e){}
      return { turns: turns, loc: loc, t1: t1 };
    } catch(e){ return null; }
  }

  // ---- [B] 危険判定: 「確立した物語が別物語/大幅縮小で上書きされようとしている」 ----
  //   true = 書込前に自動控えを取るべき(ブロックはしない)
  function check(oldRaw, newRaw){
    if (typeof oldRaw !== 'string' || !oldRaw || oldRaw === newRaw) return false;
    var o = summarize(oldRaw), n = summarize(newRaw);
    if (!o) return true;                          // fix495(C6): 旧値がparse不能=破損でも手作業復元の望みがあるため控えを取る
    if (o.turns < 3) return false;                // 確立した物語(3ターン以上)だけ守る
    if (!n) return true;                          // parse不能なもので潰す=危険
    if (n.turns <= 1) return true;                // ほぼ空で潰す(リセット含む=控えだけ取る)
    if (n.t1 && o.t1 && n.t1 !== o.t1) return true; // 1ターン目が別物=別の物語で潰す
    if (n.turns < o.turns - 5) return true;       // 6ターン以上の巻き戻し
    return false;
  }

  // ---- バックアップ(世代管理つき・Quotaで本体の書込を絶対に妨げない) ----
  function trimBackups(prefix, keep){
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0 && /^\d+$/.test(k.slice(prefix.length))) ks.push(k); // fix495(C6): '_'を含む別slot idの控えを誤算入しない
      }
      ks.sort();                                   // 末尾ts昇順
      while (ks.length > keep){ var old = ks.shift(); try { localStorage.removeItem(old); } catch(e){} }
    } catch(e){}
  }
  /* ★fix565(2026-07-26・実データで踏んだ): ここは以前「**全スロットを通じて最も古い控え**を1件消す」
     だった。容量が逼迫した状態で控えを取ろうとすると、**別の物語の唯一の控え**を消しうる。
     実際に 2026-07-26、テスト物語の復元(640KB書込)でquotaに達し、
     `chr6_bk_saveto_smriifzelrt_...`(その物語の唯一の控え)が**無言で消えた**。
     ログも警告も出ないので、消えたことに誰も気づけない。
     直し方(最小):
       ①スロットごとに数え、**残り1件のスロットの控えは消さない**
       ②もう存在しないスロットの孤児控えを最優先で消す(失って困らない)
       ③消せるものが無ければ **false を返して控えを諦める**
         = 新しい控えより「別の物語の唯一の控え」を優先する
       ④何を消したかを記録する(無言の失敗にしない)
     この関数は容量逼迫時にしか呼ばれないので、走査コストは問題にならない。 */
  /* ★fix576: 削除・断念の理由は**必ず**残す。
     旧実装は localStorage にだけ書いていたので、いちばん知りたい容量満杯のときに
     記録そのものが失敗して無言になっていた（fix399/fix575 で踏んだのと同じ型）。
     メモリ側を正本にし、localStorage への永続化は best-effort。
     読み出し: window.__v292Dfix490.dropLog() */
  var DROPLOG = [], DROPLOG_MAX = 20;
  function dropNote(rec){
    try { rec.at = Date.now(); DROPLOG.push(rec); if (DROPLOG.length > DROPLOG_MAX) DROPLOG.shift(); } catch(e){}
    try { if (rec.result === 'backup-skipped') stats.backupSkipped++; } catch(e){}
  }
  function backupSlotOf(k){
    var rest = k.replace(/^chr6_bk_(guard|saveto)_/, '').replace(/_\d+$/, '');
    return rest.replace(/^chr6_slot_/, '') || null;
  }
  function dropOldestGuardBackup(){
    try {
      var ks = [], bySlot = {};
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf('chr6_bk_guard_') !== 0 && k.indexOf('chr6_bk_saveto_') !== 0) continue;
        var s = backupSlotOf(k);
        ks.push({ key: k, slot: s, ts: (+String(k).split('_').pop() || 0) });
        if (s) bySlot[s] = (bySlot[s] || 0) + 1;
      }
      if (!ks.length) return false;
      // fix495(C6): |0 はint32折返しで13桁msが壊れ「最新を消す」ので使わない
      ks.sort(function(a, b){ return a.ts - b.ts; });

      // ②もう存在しないスロットの孤児を最優先
      var pick = null;
      for (var j = 0; j < ks.length; j++){
        if (ks[j].slot && lsg('chr6_slot_' + ks[j].slot) == null){ pick = ks[j]; break; }
      }
      // ①残り1件のスロットは守る
      if (!pick){
        for (var j2 = 0; j2 < ks.length; j2++){
          if (!ks[j2].slot) { pick = ks[j2]; break; }        // スロット不明の控えは守る対象にしない
          if (bySlot[ks[j2].slot] > 1){ pick = ks[j2]; break; }
        }
      }
      // ③消せるものが無い = 全スロットが「唯一の控え」しか持っていない → 諦める
      if (!pick) { dropNote({ path:'fix490Quota', result:'backup-skipped', reason:'no-safe-candidate' }); return false; }

      /* ★fix576(A2・GPT裁定): 候補選択は上のロジックのまま。**物理削除だけ**を
         fix569 の exact-delete ゲートへ通す。fix399(fix575)と同じ契約:
           quota → 安全候補を1件だけ選ぶ → tryDeleteExact → 実削除を read-back
           → 成功時だけ書込みを1回再試行 → 再度quotaなら諦める（追加削除0）
         **ループで別候補へ進んではいけない**。protected 等はその場で失敗を返す。
         ここで返す失敗は「新しい guard 控えを作れなかった」という意味であって、
         **すでに成功している本体セーブは巻き戻さない**（fix565で決めた親処理契約を維持）。 */
      var raw = null; try { raw = localStorage.getItem(pick.key); } catch(e){}
      if (raw == null){ dropNote({ path:'fix490Quota', result:'backup-skipped', reason:'missing' }); return false; }

      if (lsg('v292Dfix576Off') === '1'){
        /* 明示的な緊急ロールバックのときだけ旧経路を使う（記録は残す） */
        dropNote({ path:'fix490Quota', result:'rollbackModeUsed', key:pick.key });
        try { localStorage.removeItem(pick.key); } catch(e){ return false; }
      } else {
        var gw = null;
        try { var g569 = window.__v292Dfix569;
              if (g569 && typeof g569.tryDeleteExact === 'function') gw = g569; } catch(e){}
        if (!gw){
          /* ★中央保護がロードできなかったことを理由に、旧削除経路へ自動で戻らない(GPT裁定) */
          dropNote({ path:'fix490Quota', result:'backup-skipped', reason:'gateway-unavailable' });
          return false;
        }
        var res = gw.tryDeleteExact({ key: pick.key, expectedBytes: raw.length,
                                      intent: 'reclaim', path: 'fix490Quota',
                                      reason: 'guard-backup-write-quota' });
        if (!res || !res.ok || !res.deleted){
          dropNote({ path:'fix490Quota', result:'backup-skipped', key:pick.key,
                     reason:(res && res.code) || 'gateway-unavailable' });
          return false;   /* protected/stale/missing 等では**別候補へ進まない** */
        }
        // 呼び出し元でも再確認する（ゲートの ok を鵜呑みにしない）
        var back = null; try { back = localStorage.getItem(pick.key); } catch(e){}
        if (back != null){
          dropNote({ path:'fix490Quota', result:'backup-skipped', key:pick.key, reason:'delete-readback-failed' });
          return false;
        }
      }
      // ④記録(容量が無いので localStorage 側は失敗しうる。★メモリ側は必ず残す)
      dropNote({ path:'fix490Quota', result:'dropped', key: pick.key, slot: pick.slot });
      try {
        var log = JSON.parse(lsg('v292Dfix490_dropped') || '[]');
        if (!Array.isArray(log)) log = [];
        log.push({ key: pick.key, slot: pick.slot, at: Date.now() });
        localStorage.setItem('v292Dfix490_dropped', JSON.stringify(log.slice(-20)));
      } catch(e){}
      try { console.warn(TAG, '容量不足のため古い控えを1件削除: ' + pick.key); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  function backup(prefix, ident, raw){
    var ts = Date.now();
    while (lsg(prefix + ident + '_' + ts) != null) ts++;   // 同一ms衝突の回避
    var key = prefix + ident + '_' + ts;
    try { localStorage.setItem(key, raw); }
    catch(e){
      // Quota: 古い控えを1つ落として1回だけ再試行。それでも駄目なら諦める(本体書込は通す)
      if (dropOldestGuardBackup()){ try { localStorage.setItem(key, raw); } catch(e2){ return false; } }
      else return false;
    }
    trimBackups(prefix + ident + '_', 2);
    stats.backups++;
    return true;
  }

  // ---- [B] setItem境界の常設ガード ----
  function wrapSetItem(){
    try {
      var prev = localStorage.setItem;
      if (prev.__f490) return;
      var wrapped = function(k, v){
        try {
          if (!off() && typeof k === 'string' && (k === 'chr6' || k.indexOf('chr6_slot_') === 0)){
            if (Date.now() > suppressGuardUntil){
              var oldRaw = lsg(k);
              if (check(oldRaw, v)){
                var ident = (k === 'chr6') ? 'chr6' : k.slice(10);
                if (backup('chr6_bk_guard_', ident, oldRaw)){
                  stats.guarded++;
                  window.__v292Dfix490.lastGuard = { key: k, at: Date.now() };
                  try { console.warn(TAG, '確立した物語への上書きを検知→書込前に自動控え:', k); } catch(e){}
                }
              }
            }
          }
        } catch(e){}
        return prev.apply(localStorage, arguments);   // 本来の書込(先にガード、書込は必ず通す)
      };
      // ★fix419cの教訓: 内側関数のown propsを全継承(他fixのフラグを見えなくしない)
      try { for (var p in prev){ if (Object.prototype.hasOwnProperty.call(prev, p)) { try { wrapped[p] = prev[p]; } catch(e){} } } } catch(e){}
      wrapped.__f490 = true;
      localStorage.setItem = wrapped;
    } catch(e){}
  }

  // ---- [A] saveto(現在の状態を保存)の安全化 ----
  function readMeta(){ try { var m = JSON.parse(lsg('chr6_slots_meta') || '[]'); return Array.isArray(m) ? m : []; } catch(e){ return []; } }
  function writeMetaTouch(id){
    try {
      var meta = readMeta();
      for (var i = 0; i < meta.length; i++){ if (meta[i] && meta[i].id === id){ meta[i].updatedAt = new Date().toISOString(); break; } }
      localStorage.setItem('chr6_slots_meta', JSON.stringify(meta));
    } catch(e){}
  }
  function getActiveId(){ try { return JSON.parse(lsg('chr6_active_slot') || '"default"') || 'default'; } catch(e){ return 'default'; } }
  function slotKeyOf(id){ return (id === 'default' || id === 'chr6') ? 'chr6' : ('chr6_slot_' + id); }
  function reopenManager(){
    try {
      var close = document.querySelector('#v30-overlay [data-act="close"], #v30-close-x');
      if (close) close.click();
      setTimeout(function(){
        var b = document.querySelector('[title^="セーブ管理"]') || document.getElementById('v30-topbar-btn');
        if (b) b.click();
      }, 60);
    } catch(e){}
  }
  function toast(msg, isErr){
    try {
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#e06060' : '#8b76f0') + ';color:#fff;padding:10px 18px;border-radius:6px;font-size:13px;z-index:10001;box-shadow:0 4px 12px rgba(0,0,0,.4)';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
    } catch(e){}
  }
  /* ★fix549(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     このファイルは localStorage.setItem をラップする(fix543 と同じ層)ので、
     **取得経路だけ**を差し替え、ラッパの構造・順序・__f490 フラグには一切触れていない。
     第二経路は従来の式をそのまま残す。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix490') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; }
  }
  function buildPayloadRaw(){
    var S = getS();
    if (!S) return null;
    try { return JSON.stringify({ cfg: S.cfg, cast: S.cast, scene: S.scene, turns: S.turns, mode: S.mode }); } catch(e){ return null; }
  }
  function onSavetoClick(e){
    if (off()) return;
    var btn = e.target && e.target.closest ? e.target.closest('[data-act="saveto"]') : null;
    if (!btn) return;
    if (!document.getElementById('v30-overlay')) return;     // セーブ管理が開いている時だけ
    // 元ハンドラ(active一時切替方式)を完全に止め、こちらで安全に実行
    e.stopPropagation();
    try { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); } catch(_){}
    e.preventDefault();

    var id = btn.dataset && btn.dataset.id;
    if (!id) return;
    var activeId = getActiveId();

    // (1) activeカード = 従来どおり「今を保存」
    if (id === activeId){
      stats.savetoActive++;
      try { var Sa = getS(); if (Sa && typeof Sa.save === 'function') Sa.save(); } catch(err){}
      toast('保存しました');
      return;
    }

    // (2) 別カード = activeを切り替えず直接書込(確認+自動控え)
    var raw = buildPayloadRaw();
    if (!raw){ toast('保存できません(ゲーム未初期化)', true); return; }
    var targetKey = slotKeyOf(id);
    var oldRaw = lsg(targetKey);
    var o = summarize(oldRaw), n = summarize(raw);
    if (o && o.turns > 0){
      var msg = '【上書きの確認】\n'
        + 'このスロットの物語: 「' + (o.loc || '?') + '」 ' + o.turns + 'ターン\n'
        + '↓\n'
        + '今プレイ中の物語: 「' + ((n && n.loc) || '?') + '」 ' + ((n && n.turns) || 0) + 'ターン で上書きします。\n\n'
        + '元の物語はこのスロットから消えます(自動控えは2世代まで保持)。実行しますか？';
      if (!window.confirm(msg)) return;
      var ident = (targetKey === 'chr6') ? 'chr6' : targetKey.slice(10);
      backup('chr6_bk_saveto_', ident, oldRaw);
      suppressGuardUntil = Date.now() + 500;   // [B]の二重控えを抑止
    }
    try {
      localStorage.setItem(targetKey, raw);
      writeMetaTouch(id);
      stats.savetoSafe++;
      // クラウド同期に載せる(fix402はS.save相乗り。activeへの通常保存で全スロット収集pushが走る)
      try { var Sb = getS(); if (Sb && typeof Sb.save === 'function') Sb.save(); } catch(err){}
      toast('このスロットへ保存しました' + (o && o.turns > 0 ? '(元の内容は自動控えあり)' : ''));
      reopenManager();
    } catch(err){
      toast('保存に失敗: ' + (err && err.message), true);
    }
  }

  function install(){
    wrapSetItem();
    document.addEventListener('click', onSavetoClick, true);   // capture: v30コアのbubbleより先
    try { console.log(TAG, 'armed (saveto安全化 + 上書きガード常設)'); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  // setItemガードは即時にも張る(DOM前の書込にも効かせる)
  wrapSetItem();

  window.__v292Dfix490 = {
    __armed: true,
    check: check,
    summarize: summarize,
    stats: function(){ return stats; },
    dropLog: function(){ return DROPLOG.slice(); },   /* fix576: 削除・断念の理由(容量満杯でも残る) */
    /* fix576の検証口。quota経路は本体書込に埋まっていて外から再現しづらいので、
       回帰テストが**実物**を叩けるようにする(テスト用のコピーを作ると本物と乖離する)。 */
    _dropOldestGuardBackup: dropOldestGuardBackup,
    lastGuard: null,
    isOff: off
  };
})();
