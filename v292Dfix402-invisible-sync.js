// =====================================================================
// Chronicle TRPG - v292Dfix402: 不可視の双方向セーブ同期(操作不要・confirm廃止)
// ---------------------------------------------------------------------
// 背景(2026-07-08 Deep Research#3 / 引き継ぎ「双方向同期の堅牢化設計」):
//   ・fix399のbootPull confirm()はiPhoneフリーズの一因 → 確認ダイアログを出さず静かに同期。
//   ・KV書込1000/日で毎ターンpushは破綻 → デバウンス+差分ハッシュno-op skipで書込を削減。
//     (保存本体はWorker v14でD1(書込10万行/日・強整合)へ移行済み)
//   ・衝突は rev/baseRev の楽観ロック: 早送りは自動、真の分岐(fork)だけ非モーダルの1文選択UI。
//     負けた側もサーバーにforkとして保持(絶対に黙って消さない)。
//   ・iOSの同期トリガ: visibilitychange(hidden)+pagehideでflush / load+pageshow+visibleでpull。
//     beforeunload/unload/sendBeacon(64KiB上限)は使わない。
//   ・アイコン: この端末で生成/再生成された画像(v292av2_*への書込)を検知し、その1枚だけを
//     op:putimgで自動アップ → 全端末が同じサーバーURL(fix400)で同じ絵を見る。
// 前提: Worker v14(/save op:put{baseRev}/forceput/forks・認証名寄せ)。v13以下でも後方互換で動く
//   (fork検出が効かずLWWになるだけ・rev=0扱い)。
// スイッチ: 全体OFF = v292Dfix402Off='1' / 先行ON = v292Dfix402On='1'(DEFAULT_ONがfalseの間)。
//   有効時はfix399の自動系(bootPull confirm/自動push)を停止(v292Dfix399AutoOff='1'を維持)。
//   fix399の手動ボタン(☁️/⬇️)とバックアップ(chr6_bk_cloudsync_*)はそのまま生きる。
// 検証: window.__v292Dfix402 = { status, flush, pullCheck, pullApply, state, perf, ... }
// ---------------------------------------------------------------------
// ★fix411(2026-07-10深夜): putimg取りこぼしの根治。pending台帳(v292Dfix402_pimg)に記録し
//   成功時に消す。boot時に残があれば再送(リロードでデバウンスタイマーが消えた分・Worker/KV
//   予算枯渇で失敗した分を自己修復)。hidden時は即時送信。OFF=v292Dfix411Off='1'。
// ★fix411強化(2026-07-11・Worker v15連携): single-flight(二重送信防止)+hash契約照合
//   (内容一致を確認してから台帳を消す)+413/retryable:false隔離台帳(無限再送防止)+上限50件evict。
//   pending値を{ts,h}に(旧数値エントリはtypeofで後方互換読み)。OFFスイッチは既存のv292Dfix411Off継続。
// ★fix402c(2026-07-10): 全物語まるごと常時同期。
//   ・collectLS を「アクティブスロットのみ」→「chr6_slots_meta の全スロット+base(chr6)
//     +既存グローバル」に拡張(allSlotIds)。端末Aにしかない物語も端末Bに出る。
//   ・削除の伝播: 取り込んだ pkg の chr6_slots_meta を唯一の権威とし、metaに無いスロットの
//     ローカル本体(chr6_slot_<id>)を、chr6_bk_cloudsync_del_* に退避してから削除(復活防止)。
//     本体キーの有無ではなくメタ基準。metaが空/破損の pkg では絶対に削除しない(安全弁)。
//   ・Worker v14/D1/rev/fork/forceput/applySave(fix399)/isGlobalKey は一切変更しない。
//   ・OFFスイッチ: v292Dfix402cOff='1' で従来(アクティブのみ収集+削除伝播無効)へ即戻し。
//     既定ON。全体OFF(v292Dfix402Off)配下でもある。
// ★fix402c堅牢化(2026-07-11): pkgに full:true 印を付け、削除伝播は full pkg かつ「メタ完全性
//   (Array/非空/全要素id/id重複なし)」かつ「退避read-backで全doomedキー確認」の三重ゲートで
//   のみ発動。退避キーは新しい順5件だけ残す。空ガードは全スロット合計turnsで判定。lastHashは
//   length接頭形式に強化(初回1回だけno-op skipが外れ再pushされるのは許容)。
// ★fix402d(2026-07-11・mutationSeq状態機械): 同期レース根治。push飛行中の新規保存を誤clean化
//   しない/pull適用直前に飛行中の変異を再確認して中止/ローカルturns>remoteのsilent applyを拒否
//   してforkへ委譲。明示pull(force)はガード迂回。OFFスイッチ=v292Dfix402dOff='1'(既定ONで従来動作)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix402) return; window.__v292Dfix402 = { __boot: true };
  var TAG = '[v292Dfix402:invisible-sync]';
  var SCHEMA = 1;
  var DEFAULT_ON = true;           // ★fix402b(2026-07-10): PC実機検証済→既定ON(全体OFF=v292Dfix402Off)
  var DEBOUNCE_MS = 12000;         // 保存後まとめ送りの待ち
  var MAXWAIT_MS  = 45000;         // 連続プレイ中でもこの間隔では必ず送る
  var IMG_DEBOUNCE_MS = 3500;

  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, v); } catch(e){} }
  function on(){
    if (lsGet('v292Dfix402Off') === '1') return false;
    return DEFAULT_ON || lsGet('v292Dfix402On') === '1';
  }
  function proxyUrl(){
    try {
      var u = (lsGet('v292ProxyUrl') || '').trim();
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (lsGet('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function callSave(bodyObj){
    return fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(bodyObj) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, json: j }; }); });
  }
  function hash(s){ var h=0; s=String(s||''); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); }
  function lsHash(s){ s = String(s || ''); return String(s.length) + ':' + hash(s); }   // ★fix402c堅牢化: length接頭で衝突耐性
  function getNum(k){ return +(lsGet(k) || 0) || 0; }
  function setNum(k,v){ lsSet(k, String(v)); }
  function baseRev(){ return getNum('v292Dfix402_baseRev'); }
  function toast(msg){ try { if (window.UI && UI.setStatus) UI.setStatus(msg); } catch(e){} try { console.log(TAG, msg); } catch(e){} }

  // ---- 収集(fix399と同じ規約・軽量ls onlyのみ) ----
  function activeSlot(){ try { return JSON.parse(lsGet('chr6_active_slot') || '"chr6"'); } catch(e){ return 'chr6'; } }
  function activeSlotTurns(){
    try { var slot = activeSlot(); var raw = lsGet(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot)); if (!raw) return 0; var d = JSON.parse(raw); return (d && Array.isArray(d.turns)) ? d.turns.length : 0; } catch(e){ return 0; }
  }
  function isGlobalKey(k){
    return /^v292avrec_/.test(k) || /^v292appr_/.test(k)
        || k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'
        || /genderMap_"?default"?$/.test(k);
  }
  // ★fix402c: 同期対象スロットの列挙(chr6_slots_meta 全件 + アクティブ保険 + base 'chr6')
  function allSlotIds(){
    var ids = [];
    try { var meta = JSON.parse(lsGet('chr6_slots_meta')||'[]')||[]; meta.forEach(function(s){ if(s&&s.id) ids.push(String(s.id)); }); } catch(e){}
    var act = activeSlot(); if (act && ids.indexOf(act)<0) ids.push(act);   // メタ未登録のアクティブも拾う(healSlotMeta前の保険)
    if (ids.indexOf('chr6')<0) ids.push('chr6');                            // base物語
    return ids;
  }
  // ★fix402c: slotId(単体) → slotIds(配列)。判定式は現行と同一のものをスロット毎に評価。
  function collectLS(slotIds){
    if (!Array.isArray(slotIds)) slotIds = (slotIds == null) ? [] : [slotIds];
    var out = {};
    for (var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if (!k) continue;
      if (/^__gen_/.test(k)) continue;
      if (/^chr6_bk_/.test(k)) continue;
      if (/^v292Dfix399_/.test(k)) continue;
      if (/^v292Dfix402_/.test(k)) continue;
      var isSlot = false;
      for (var j = 0; j < slotIds.length; j++){
        var slotId = slotIds[j];
        if (slotId && slotId !== 'chr6' && k.indexOf(slotId) >= 0) { isSlot = true; break; }
        if (slotId === 'chr6' && (k === 'chr6' || /_slot_chr6$|genderMap_"?chr6"?$/.test(k))) { isSlot = true; break; }
      }
      if (isSlot || isGlobalKey(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }
  function collectLight(ts){
    var slot = activeSlot();
    // ★fix402c: 既定は全スロット収集。OFF(402cOff)時のみ従来どおりアクティブのみ=完全互換。
    var cOff = (lsGet('v292Dfix402cOff') === '1');
    var slotIds = cOff ? [slot] : allSlotIds();
    var pkg = { schema: SCHEMA, updatedAt: ts || Date.now(), device: (navigator.userAgent||'').slice(0,60), activeSlot: slot, ls: collectLS(slotIds) };
    if (!cOff) pkg.full = true;   // ★fix402c堅牢化: 全スロット収集の印(削除伝播はfull:true時のみ発動)
    return pkg;
  }
  // ★fix402c堅牢化/★fix402d: pkg.ls内の全スロット合計turnsとparse失敗の有無を返す
  function pkgTurnsInfo(pkg){
    var total = 0, parseFail = false;
    try {
      var ls = (pkg && pkg.ls) || {};
      for (var k in ls){ if (!ls.hasOwnProperty(k)) continue;
        if (k === 'chr6' || /^chr6_slot_/.test(k)){
          var raw = ls[k];
          if (typeof raw === 'string' && raw){
            try { var d = JSON.parse(raw); total += (d && Array.isArray(d.turns)) ? d.turns.length : 0; }
            catch(e){ parseFail = true; }
          }
        }
      }
    } catch(e){}
    return { total: total, parseFail: parseFail };
  }

  // ---- fix399の自動系を停止(confirm bootPull/自動pushの二重走行防止) ----
  function muteFix399(){
    if (!on()) return;
    lsSet('v292Dfix399f_migrated', '1');   // fix399fの「一度だけAutoOff解除」を先回りで無効化
    lsSet('v292Dfix399AutoOff', '1');
  }

  // ---- push(デバウンス+maxWait+差分ハッシュ) ----
  var dirtySince = 0, pushTimer = null, pushing = false, retryTimer = null;
  var mutationSeq = 0;   // ★fix402d: 状態機械。markDirtyで++、flushのsentSeqと突合して誤clean/誤pullを防ぐ
  function markDirty(){
    mutationSeq++;   // ★fix402d: 冒頭で必ずインクリメント(飛行中の新規保存を検出するため)
    if (!on() || !isLoggedIn()) return;
    var now = Date.now();
    if (!dirtySince) dirtySince = now;
    setNum('v292Dfix402_dirtyTs', now);
    if (pushTimer) clearTimeout(pushTimer);
    var wait = DEBOUNCE_MS;
    if (now - dirtySince > MAXWAIT_MS) wait = 50;   // 長時間書きっぱなし→即flush
    pushTimer = setTimeout(function(){ flush('debounce'); }, wait);
  }
  function flush(why){
    if (!on() || !isLoggedIn() || pushing) return Promise.resolve('skip');
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    var f402dOn = (lsGet('v292Dfix402dOff') !== '1');
    var sentSeq = mutationSeq;                       // ★fix402d: pkg構築"前"にseqを記録(飛行中の新規保存検出用)
    var pkg = collectLight(Date.now());
    // ★fix402c堅牢化: 空ガード刷新。収集済みpkgの全スロット合計turns===0 && baseRev>0 でskip
    //   (parse不能スロットありなら従来のactiveSlotTurnsガードにフォールバック)
    var ti = pkgTurnsInfo(pkg);
    var emptyGuard = ti.parseFail ? (activeSlotTurns() === 0 && baseRev() > 0) : (ti.total === 0 && baseRev() > 0);
    if (emptyGuard) { dirtySince = 0; return Promise.resolve('empty-guard'); }
    // ★fix402d: 性能計測フック(例外安全)
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var str = JSON.stringify(pkg.ls);
    var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    var h = lsHash(str);                             // ★fix402c堅牢化: length接頭hash
    var t2 = (window.performance && performance.now) ? performance.now() : Date.now();
    try {
      var _sk = 0, _ls = pkg.ls || {};
      for (var _k in _ls){ if (_ls.hasOwnProperty(_k) && (_k === 'chr6' || /^chr6_slot_/.test(_k))) _sk++; }
      window.__v292Dfix402.perf = { stringifyMs: (t1 - t0), hashMs: (t2 - t1), pkgBytes: str.length, slots: _sk, turns: ti.total, at: Date.now() };
    } catch(e){}
    if (h === (lsGet('v292Dfix402_lastHash') || '')) {   // 変化なし=書かない(phantom write除去)
      dirtySince = 0; setNum('v292Dfix402_pushedTs', Date.now());
      return Promise.resolve('noop');
    }
    pushing = true;
    return callSave({ op: 'put', baseRev: baseRev(), pkg: pkg }).then(function(r){
      pushing = false;
      if (r.status === 200 && r.json && r.json.ok && r.json.fork) { forkBanner(r.json.server || {}); return 'fork'; }   // fork応答はclean化しない(現行維持)
      if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      if (r.json.rev != null) setNum('v292Dfix402_baseRev', +r.json.rev || 0);
      lsSet('v292Dfix402_lastHash', h);
      if (f402dOn && sentSeq !== mutationSeq) {
        // ★fix402d: 飛行中に新規保存(dirty)あり→誤clean化せず再送予約(pushedTs/dirtyTsは触らない)
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(function(){ flush('post-flight'); }, 3000);
        try { console.log(TAG, 'pushed rev=' + (r.json.rev != null ? r.json.rev : '?') + ' (' + (why||'') + ') seq変化→post-flight再送予約'); } catch(e){}
      } else {
        dirtySince = 0; setNum('v292Dfix402_pushedTs', Date.now());
        try { console.log(TAG, 'pushed rev=' + (r.json.rev != null ? r.json.rev : '?') + ' (' + (why||'') + ') perf=' + JSON.stringify(window.__v292Dfix402 && window.__v292Dfix402.perf)); } catch(e){}
      }
      return 'pushed';
    }).catch(function(e){
      pushing = false;
      try { console.warn(TAG, 'push failed (' + (why||'') + '):', e && e.message); } catch(_){}
      if (!retryTimer) retryTimer = setTimeout(function(){ retryTimer = null; if (dirtySince) flush('retry'); }, 30000);
      return 'error';
    });
  }
  function isDirty(){ return getNum('v292Dfix402_dirtyTs') > getNum('v292Dfix402_pushedTs'); }

  // ---- pull(静かに取り込み・confirm無し・上書き前は必ず自動バックアップ=applySave内蔵) ----
  var pulling = false, lastPullCheck = 0, applying = false;
  function applyPkg(pkg, rev){
    var api = window.__v292Dfix399x;
    var doApply = (api && api.applySave) ? api.applySave(pkg) : Promise.reject(new Error('fix399 applySave不在'));
    return doApply.then(function(){
      setNum('v292Dfix402_baseRev', +rev || 0);
      try { lsSet('v292Dfix402_lastHash', lsHash(JSON.stringify(pkg.ls || {}))); } catch(e){}   // ★fix402c堅牢化: length接頭
      var now = Date.now(); setNum('v292Dfix402_pushedTs', now); setNum('v292Dfix402_dirtyTs', 0); dirtySince = 0;
    });
  }
  // ★fix402d: opts.force=true(明示pull=forkBanner「別端末のつづき」等)はturns/conflictガードを迂回。
  //   force時もapplyPkg→applySave(fix399)内で上書き前に必ず自動バックアップが走る。
  function pullApplyReload(label, opts){
    if (applying) return Promise.resolve();
    var force = !!(opts && opts.force);
    var f402dOn = (lsGet('v292Dfix402dOff') !== '1');
    applying = true;
    var seq0 = mutationSeq;   // ★fix402d: op:get発行"前"のseqを記録
    return callSave({ op: 'get' }).then(function(r){
      if (r.status !== 200 || !r.json || !r.json.ok || !r.json.data) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      // ★fix402d: 応答受信後・applyPkg"前"に飛行中の変異/push/dirtyを再確認→あればpull中止しpushへ委譲
      if (f402dOn && !force && (mutationSeq !== seq0 || pushing || isDirty())) {
        applying = false;
        try { console.log(TAG, 'pull中止(conflict-probe): seq0=' + seq0 + ' now=' + mutationSeq + ' pushing=' + pushing + ' dirty=' + isDirty()); } catch(e){}
        flush('conflict-probe');
        return;
      }
      // ★fix402d turnsガード: silent applyでローカルturns>remote turnsなら被せずforkへ(明示forceは迂回)
      if (f402dOn && !force) {
        var localAhead = false;
        try {
          var slot = activeSlot();
          var slotKey = (slot === 'chr6') ? 'chr6' : ('chr6_slot_' + slot);
          var rls = (r.json.data && r.json.data.ls) || {};
          var rraw = rls[slotKey];
          if (typeof rraw === 'string' && rraw) {
            var rd = JSON.parse(rraw);   // parse失敗→catchでガード不発(従来どおり適用へ進む)
            var remoteTurns = (rd && Array.isArray(rd.turns)) ? rd.turns.length : 0;
            if (activeSlotTurns() > remoteTurns) localAhead = true;
          }
        } catch(e){ localAhead = false; }
        if (localAhead) {
          applying = false;
          try { console.log(TAG, 'pull中止(local-ahead)→forkへ委譲'); } catch(e){}
          flush('local-ahead');
          return;
        }
      }
      return applyPkg(r.json.data, r.json.rev).then(function(){
        // ★fix402c(+堅牢化): メタ権威の削除伝播。full pkg・メタ完全性・退避read-back検証の三重ゲート
        try {
          if (lsGet('v292Dfix402cOff') !== '1') {
            var pkg = r.json.data || {};
            if (pkg.full === true) {                                  // ★fix402c堅牢化: 部分pkg/旧pkgでは削除しない
              var meta = null; try { meta = JSON.parse((pkg.ls && pkg.ls['chr6_slots_meta']) || '[]'); } catch(e){ meta = null; }
              var metaOk = false, inMeta = {};
              if (Array.isArray(meta) && meta.length > 0) {          // メタ完全性: Array/非空/全要素id/id重複なし
                metaOk = true;
                for (var mi = 0; mi < meta.length; mi++){ var s = meta[mi];
                  if (!(s && s.id)) { metaOk = false; break; }
                  var sid = String(s.id);
                  if (inMeta[sid]) { metaOk = false; break; }         // id重複=不完全とみなし削除しない
                  inMeta[sid] = 1;
                }
              }
              if (metaOk) {
                var doomed = [];
                for (var di = 0; di < localStorage.length; di++){ var dk = localStorage.key(di);
                  var dmatch = /^chr6_slot_(.+)$/.exec(dk || '');
                  if (dmatch && !inMeta[dmatch[1]]) doomed.push(dk); }
                if (doomed.length) {
                  var snap = {}; doomed.forEach(function(dk){ snap[dk] = localStorage.getItem(dk); });
                  var bkKey = 'chr6_bk_cloudsync_del_' + Date.now();
                  lsSet(bkKey, JSON.stringify({ ls: snap }));
                  var verified = false;                                // ★fix402c堅牢化: read-back検証(全doomed退避を確認できた時だけ削除)
                  try { var rb = JSON.parse(lsGet(bkKey) || 'null'); if (rb && rb.ls) { verified = true; for (var vi = 0; vi < doomed.length; vi++){ if (!(doomed[vi] in rb.ls)) { verified = false; break; } } } } catch(e){ verified = false; }
                  if (verified) { doomed.forEach(function(dk){ try { localStorage.removeItem(dk); } catch(e){} }); }
                  else { try { console.warn(TAG, '削除退避のread-back検証に失敗→削除中止', doomed.length); } catch(_){} }
                }
                // ★fix402c堅牢化: 退避キーの世代管理(新しい順5件だけ残す)
                try {
                  var bks = [];
                  for (var bi = 0; bi < localStorage.length; bi++){ var bk = localStorage.key(bi); if (/^chr6_bk_cloudsync_del_/.test(bk || '')) bks.push(bk); }
                  bks.sort();
                  while (bks.length > 5) { var oldk = bks.shift(); try { localStorage.removeItem(oldk); } catch(e){} }
                } catch(e){}
              }
            }
          }
        } catch(e){}
        toast('☁️ ' + (label || '別端末のつづき') + 'を取り込みました。再読み込みします…');
        setTimeout(function(){ try { location.reload(); } catch(e){} }, 700);
      });
    }).catch(function(e){ applying = false; try { console.warn(TAG, 'pull失敗:', e && e.message); } catch(_){} });
  }
  function pullCheck(why){
    if (!on() || !isLoggedIn() || pulling || applying) return;
    var now = Date.now(); if (now - lastPullCheck < 5000) return; lastPullCheck = now;
    pulling = true;
    callSave({ op: 'meta' }).then(function(r){
      pulling = false;
      if (r.status !== 200 || !r.json || !r.json.ok) return;
      var meta = r.json.meta; if (!meta) return;
      var srv = +r.json.rev || 0;
      var newer = (srv > 0) ? (srv > baseRev())
                            : ((+meta.updatedAt || 0) > getNum('v292Dfix399_baseTs'));  // 旧Worker/移行前はupdatedAt比較
      if (!newer) { if (isDirty()) flush('pullcheck-dirty'); return; }
      if (isDirty()) { flush('conflict-probe'); return; }   // 両方進んでいる→pushに任せてfork判定
      pullApplyReload('別端末のつづき');
    }).catch(function(){ pulling = false; });
  }

  // ---- 真の分岐(fork)だけ出す非モーダル選択UI(confirm不使用) ----
  var bannerEl = null;
  function forkBanner(server){
    if (bannerEl && bannerEl.parentNode) return;
    var dev = String((server && server.device) || '').slice(0, 22);
    var el = document.createElement('div');
    el.id = 'v292Dfix402-fork';
    el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;max-width:92vw;box-sizing:border-box;'
      + 'background:#1d2733;color:#dfe8f2;border:1px solid #4a7ad0;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;box-shadow:0 4px 18px rgba(0,0,0,.45);';
    el.innerHTML = '☁️ <b>この端末と別端末' + (dev ? '(' + dev + ')' : '') + 'の両方に新しいつづきがあります。</b>どちらを続けますか？(選ばなかった方も自動バックアップに残ります)<br>';
    function mkBtn(txt, main){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='margin:6px 8px 0 0;padding:7px 12px;font-size:13px;border-radius:7px;cursor:pointer;border:1px solid '+(main?'#4a7ad0':'#666')+';background:'+(main?'#2a4a8a':'#333')+';color:#fff;'; return b; }
    var bLocal = mkBtn('この端末のつづき', true);
    var bCloud = mkBtn('別端末のつづき', false);
    var bX = mkBtn('あとで', false);
    bLocal.onclick = function(){
      el.textContent = '☁️ この端末のつづきで統一しています…';
      callSave({ op: 'forceput', pkg: collectLight(Date.now()) }).then(function(r){
        if (r.status === 200 && r.json && r.json.ok) {
          if (r.json.rev != null) setNum('v292Dfix402_baseRev', +r.json.rev || 0);
          setNum('v292Dfix402_pushedTs', Date.now()); dirtySince = 0;
          try { lsSet('v292Dfix402_lastHash', ''); } catch(e){}
          toast('☁️ この端末のつづきで統一しました(相手側はバックアップ保存)');
        } else { toast('☁️ 統一に失敗しました。あとで自動再試行します'); }
        rm();
      }).catch(function(){ toast('☁️ 統一に失敗しました。あとで自動再試行します'); rm(); });
    };
    bCloud.onclick = function(){ rm(); pullApplyReload('別端末のつづき', { force: true }); };   // ★fix402d: 明示pull=ガード迂回
    bX.onclick = function(){ rm(); };
    function rm(){ try { if (el.parentNode) el.parentNode.removeChild(el); } catch(e){} bannerEl = null; }
    el.appendChild(bLocal); el.appendChild(bCloud); el.appendChild(bX);
    (document.body || document.documentElement).appendChild(el);
    bannerEl = el;
  }

  // ---- S.saveに相乗り(自前wrap・fix399のAutoOff結合と独立) ----
  function wrapSave(){
    try {
      var S = window.S || (function(){ try { return (0,eval)('S'); } catch(e){ return null; } })();
      if (!S || typeof S.save !== 'function' || S.__f402wrapped) return !!(S && S.__f402wrapped);
      var os = S.save.bind(S);
      S.save = function(){ var r = os.apply(this, arguments); try { markDirty(); } catch(e){} return r; };
      S.__f402wrapped = true;
      try { console.log(TAG, 'S.save wrapped'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- アイコン自動アップ: この端末で生成/再生成された画像1枚だけをputimg ----
  //   fix197(genOne)→persistSet→localStorage.setItem('v292av2_...', dataURL)→(fix346がIDBへ)。
  //   その呼び出しを最外殻で検知して、その1枚だけをサーバーへ(全端末のfix400表示が即揃う)。
  var imgQueue = {}, imgTimer = null, imgSending = false;   // ★fix411強化: single-flight
  // ★fix411: pending台帳(送信し損ねの自己修復用。v292Dfix402_はcollectLS除外済みで同期に混入しない)
  function f411off(){ return lsGet('v292Dfix411Off') === '1'; }
  // ★fix411強化: hash契約(Worker v15と共有・厳守)。length接頭 djb2。putimg内容一致検証に使う
  function imgHash(s){ s = String(s || ''); var h = 5381; for (var i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return String(s.length) + ':' + (h >>> 0).toString(36); }
  function pimgAll(){ try { return JSON.parse(lsGet('v292Dfix402_pimg') || '{}') || {}; } catch(e){ return {}; } }
  function pimgEntryTs(e){ return (typeof e === 'number') ? e : ((e && e.ts) || 0); }   // ★後方互換: 旧エントリ=数値
  // ★fix411強化: 値を{ts,h}に(旧数値エントリは読む側でtypeof分岐)。pending上限50=超過は最古(ts最小)evict
  function pimgSet(k, h){
    if (f411off()) return;
    try {
      var m = pimgAll();
      var ex = m[k];
      var ts = (ex && typeof ex === 'object' && ex.ts) ? ex.ts : Date.now();
      if (h) m[k] = { ts: ts, h: h };
      else if (!(ex && typeof ex === 'object')) m[k] = { ts: ts };   // hなし&既存object=そのまま保持
      var keys = Object.keys(m);
      while (keys.length > 50) {                                      // 上限50件: 超過したら最古から削除
        var oldestK = null, oldestTs = Infinity;
        for (var i = 0; i < keys.length; i++){ var t = pimgEntryTs(m[keys[i]]); if (t < oldestTs) { oldestTs = t; oldestK = keys[i]; } }
        if (oldestK == null) break;
        delete m[oldestK];
        keys = Object.keys(m);
      }
      lsSet('v292Dfix402_pimg', JSON.stringify(m));
    } catch(e){}
  }
  function pimgDel(k){ try { var m = pimgAll(); if (k in m){ delete m[k]; lsSet('v292Dfix402_pimg', JSON.stringify(m)); } } catch(e){} }
  function pimgDeadSet(k){ try { var m = JSON.parse(lsGet('v292Dfix402_pimg_dead') || '{}') || {}; m[k] = Date.now(); lsSet('v292Dfix402_pimg_dead', JSON.stringify(m)); } catch(e){} }   // ★fix411強化: 隔離台帳(無限再送防止)
  function scheduleImgPush(k){
    imgQueue[k] = Date.now();
    pimgSet(k);                                   // ★fix411
    if (imgTimer) clearTimeout(imgTimer);
    imgTimer = setTimeout(sendImgs, IMG_DEBOUNCE_MS);
  }
  function sendImgs(){
    imgTimer = null;
    if (!on() || !isLoggedIn()) { imgQueue = {}; return; }
    var keys = Object.keys(imgQueue);
    // ★fix411強化 single-flight: 飛行中なら今回分をqueueへ戻して次タイマーで再送(二重送信しない)
    if (imgSending) {
      keys.forEach(function(k){ if (!(k in imgQueue)) imgQueue[k] = Date.now(); });
      if (!imgTimer) imgTimer = setTimeout(sendImgs, IMG_DEBOUNCE_MS);
      return;
    }
    imgQueue = {};
    if (!keys.length) return;
    imgSending = true;
    (function next(){
      var k = keys.shift();
      if (!k) { imgSending = false; return; }     // 全完了→single-flight解除
      var v = null; try { v = localStorage.getItem(k); } catch(e){}
      if (typeof v === 'string' && v.indexOf('data:image') === 0 && v.length < 2*1024*1024) {
        var h = imgHash(v);
        try { pimgSet(k, h); } catch(e){}          // ★fix411強化: 送信直前に実データからh計算→台帳更新
        callSave({ op: 'putimg', k: k, data: v, hash: h }).then(function(r){
          try {
            var j = r && r.json;
            if (r && r.status === 200 && j && j.ok && (j.hash == null || j.hash === h)) {
              pimgDel(k);                            // ★fix411強化: 成功(hash一致 or hash無し=旧Worker)で消す
            } else if (r && r.status === 200 && j && j.ok) {
              console.warn(TAG, 'img hash不一致→pending保持', k, j.hash, h);   // 内容不一致=保持して再送
            } else if (r && (r.status === 413 || (j && j.retryable === false))) {
              pimgDeadSet(k); pimgDel(k);            // ★fix411強化: 隔離(無限再送防止)
            }
            // それ以外の失敗→pending保持(何もしない)
          } catch(e){}
          try { console.log(TAG, 'img pushed', k, r && r.status); } catch(e){}
          next();
        }).catch(function(e){ try { console.warn(TAG, 'img push failed (pending保持・次回再送)', k, e && e.message); } catch(_){} next(); });
      } else { pimgDel(k); next(); }
    })();
  }
  function wrapSetItem(){
    try {
      var prev = localStorage.setItem;
      if (prev.__f402) return;
      var wrapped = function(k, v){
        try { if (on() && typeof k === 'string' && k.indexOf('v292av2_') === 0 && typeof v === 'string' && v.indexOf('data:image') === 0) scheduleImgPush(k); } catch(e){}
        return prev.apply(localStorage, arguments);
      };
      wrapped.__f402 = true;
      localStorage.setItem = wrapped;
    } catch(e){}
  }

  // ---- トリガ配線(iOS向け: hidden/pagehideでflush・load/pageshow/visibleでpull) ----
  function boot(){
    muteFix399();
    wrapSetItem();
    (function wpoll(){ wpoll._n=(wpoll._n||0)+1; if (wrapSave()) return; if (wpoll._n>120) return; setTimeout(wpoll, 500); })();
    setTimeout(function(){ pullCheck('boot1'); }, 2500);
    setTimeout(function(){ pullCheck('boot2'); }, 6500);
    setInterval(muteFix399, 60000);
    try {
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'hidden') {
          if (isDirty() || dirtySince) flush('hidden');
          if (!f411off()) { try { if (imgTimer){ clearTimeout(imgTimer); imgTimer = null; } sendImgs(); } catch(e){} }   // ★fix411: 画像は隠れた瞬間に即送
        }
        else { pullCheck('visible'); }
      });
    } catch(e){}
    // ★fix411: 前セッションで送信し損ねたアイコンの再送(putimg失敗/リロードでタイマー消滅の自己修復)
    setTimeout(function(){ try { if (!f411off()){ var pm = pimgAll(); Object.keys(pm).forEach(function(k){ scheduleImgPush(k); }); } } catch(e){} }, 5000);
    try { window.addEventListener('pagehide', function(){ if (isDirty() || dirtySince) flush('pagehide'); }); } catch(e){}
    try { window.addEventListener('pageshow', function(ev){ if (ev && ev.persisted) { lastPullCheck = 0; pullCheck('bfcache'); } }); } catch(e){}
    try { window.addEventListener('online', function(){ if (isDirty()) flush('online'); }); } catch(e){}
  }

  window.__v292Dfix402 = {
    __real: true,
    perf: null,
    status: function(){ return { on: on(), defaultOn: DEFAULT_ON, loggedIn: isLoggedIn(), baseRev: baseRev(), dirty: isDirty(), proxy: proxyUrl() }; },
    state: function(){ return { baseRev: baseRev(), lastHash: (lsGet('v292Dfix402_lastHash')||'').slice(0,12), dirtyTs: getNum('v292Dfix402_dirtyTs'), pushedTs: getNum('v292Dfix402_pushedTs'), mutationSeq: mutationSeq }; },
    flush: flush,
    pullCheck: function(){ lastPullCheck = 0; pullCheck('manual'); },
    pullApply: function(force){ lastPullCheck = 0; return pullApplyReload('手動取込', { force: !!force }); },   // ★fix402d: 明示pull(forceでturns/conflictガード迂回)
    forkBanner: forkBanner,
    imgHash: imgHash, sendImgs: sendImgs, scheduleImgPush: scheduleImgPush   // ★fix411強化: 検証フック
  };

  if (on()) boot();
  try { console.log(TAG, 'loaded', on() ? 'ON' : 'OFF(default:' + (DEFAULT_ON?'on':'off') + ')', '(login=' + isLoggedIn() + ')'); } catch(e){}
})();
