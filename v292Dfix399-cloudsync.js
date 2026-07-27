// =====================================================================
// Chronicle TRPG - v292Dfix399: クロスデバイス・セーブ同期
//   Phase A(手動ボタン) + Phase B(自動: 起動プル + 保存デバウンスpush + 楽観ロック)
// ---------------------------------------------------------------------
// 前提: Worker v11 以上（/save が本文/画像を分割保存。GETで合成して返す）。
//   ・自動アップ = S.save に相乗り。通常は「本文(ls, 約65KB)」だけをデバウンス送信。
//     画像はキー集合が変わった時だけ full 送信（モバイル通信を軽く）。
//   ・起動プル = 起動時、クラウドが自分の基準(baseTs)より新しく、かつ手元に未同期の
//     変更が無ければ自動で取り込み。両方進んでいたら盲目上書きせず選ばせる(楽観ロック)。
//   ・取り込み前は必ずローカルをバックアップ(chr6_bk_cloudsync_*)。
// 認証: 既存プロキシと同じ x-google-id / x-chronicle-pass(fix247)。ログイン必須。
// スイッチ: 全体OFF=v292Dfix399Off / 自動だけOFF=v292Dfix399AutoOff。手動ボタンは常時。
// 同期状態(端末ローカル・同期対象外): v292Dfix399_baseTs / _localTs / _imgHash
// 検証: window.__v292Dfix399x = { collectLight, push, pull, bootPull, verify, status, syncState }
//   fix399j(2026-07-07): iOS向け再設計。WebKit推奨=短い1txで全put+起動時selfHealで不足補充。多パス/reload前sweepは廃止(フリーズ/画風崩れの原因)。verify/selfHeal口あり。
//   fix399k(2026-07-07): selfHeal自動pullがiPhoneフリーズ誘発→既定OFF(opt-in=v292Dfix399SelfHealOn)。書込は1txのまま。exact-matchは別方式(Cache API)検討中。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix399) return; window.__v292Dfix399 = true;
  var TAG = '[v292Dfix399:cloudsync]';
  var IDB_DB = 'chr6av', IDB_STORE = 'imgs';
  var SCHEMA = 1;
  var DEBOUNCE_MS = 15000;   // 保存後この時間まとめて1回だけ送る(KVの1書込/秒/キー制約に余裕)
  var workerVer = 0;         // Workerのv。v11未満は分割保存が無い→常にfull送信(v10互換・画像喪失防止)
  function detectWorkerVer(){ try { fetch(proxyUrl() + '/', { method: 'GET' }).then(function(r){ return r.json(); }).then(function(j){ workerVer = +(j && j.v) || 0; }).catch(function(){}); } catch(e){} }

  function off(){ try { return localStorage.getItem('v292Dfix399Off') === '1'; } catch(e){ return false; } }
  function autoOff(){ try { return localStorage.getItem('v292Dfix399AutoOff') === '1'; } catch(e){ return false; } }
  function proxyUrl(){
    try {
      var u = (localStorage.getItem('v292ProxyUrl') || '').trim();
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch(e){}
    try { var p = (localStorage.getItem('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }
  function activeSlot(){ try { return JSON.parse(localStorage.getItem('chr6_active_slot') || '"chr6"'); } catch(e){ return 'chr6'; } }
  function hasLocalGame(){   // このスロットに実際の進行(turns)があるか(データ保護判定)
    try {
      var slot = activeSlot();
      var raw = localStorage.getItem(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot));
      if (!raw) return false;
      var d = JSON.parse(raw);
      return !!(d && Array.isArray(d.turns) && d.turns.length > 0);
    } catch(e){ return false; }
  }

  // ---- 同期状態(端末ローカル) ----
  function getNum(k){ try { return +(localStorage.getItem(k) || 0) || 0; } catch(e){ return 0; } }
  function setNum(k,v){ try { localStorage.setItem(k, String(v)); } catch(e){} }
  function baseTs(){ return getNum('v292Dfix399_baseTs'); }
  function localTs(){ return getNum('v292Dfix399_localTs'); }
  function imgHashStored(){ try { return localStorage.getItem('v292Dfix399_imgHash') || ''; } catch(e){ return ''; } }
  function hash(s){ var h=0; s=String(s||''); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); }

  // ---- localStorage収集(このスロット + グローバル) ----
  function isGlobalKey(k){
    return /^v292avrec_/.test(k) || /^v292appr_/.test(k)
        || k === 'chr6_slots_meta' || k === 'chr6_active_slot' || k === 'chr6_epoch'
        || /genderMap_"?default"?$/.test(k);
  }
  /* ★fix588(GPT裁定D): 墓標が立ったスロットの本体・サイドストアは送らない。
     meta の中の墓標そのものは送る（削除を伝えるため）。判定は fix562 の classifyKey
     （正規化済み slotId・引用符付きキーも扱える）。部分一致は使わない＝生きている物語を
     取りこぼさないため。分類器が居なければ従来どおり送る（fail-open）。 */
  function deadSlotIds(){
    var out = {};
    try { if (localStorage.getItem('v292Dfix588Off') === '1') return out; } catch(e){}
    try { var meta = JSON.parse(localStorage.getItem('chr6_slots_meta') || '[]') || [];
          meta.forEach(function(e){ if (e && e.deleted === true && e.id) out[String(e.id)] = 1; }); } catch(e){}
    return out;
  }
  var filterUnavailableNoted = false;
  function isDeadSlotKey(k, dead){
    if (!dead || !k) return false;
    try {
      var c = window.__v292Dfix562;
      if (!c || typeof c.classifyKey !== 'function'){
        /* ★GPT裁定D-5: fail-open は許容するが、記録は必ず残す（物理削除側は fail-closed） */
        if (!filterUnavailableNoted){
          filterUnavailableNoted = true;
          try { var s = window.__chronicleStoryLifecycle;
                if (s && typeof s.noteFilterUnavailable === 'function') s.noteFilterUnavailable(); } catch(e2){}
        }
        return false;
      }
      var r = c.classifyKey(k);
      return !!(r && r.slotId && dead[String(r.slotId)]);
    } catch(e){ return false; }
  }
  function collectLS(slotId){
    var out = {}, dead = deadSlotIds();
    for (var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if (!k) continue;
      if (/^__gen_/.test(k)) continue;
      if (/^chr6_bk_/.test(k)) continue;
      if (/^v292Dfix399_/.test(k)) continue;     // 同期状態は運ばない
      if (isDeadSlotKey(k, dead)) continue;      // ★fix588: 削除済みスロットの実体は送らない
      var isSlot = slotId && slotId !== 'chr6' && k.indexOf(slotId) >= 0;
      if (slotId === 'chr6' && (k === 'chr6' || /_slot_chr6$|genderMap_"?chr6"?$/.test(k))) isSlot = true;
      if (isSlot || isGlobalKey(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }

  // ---- IndexedDB ----
  function idbOpen(){
    return new Promise(function(res, rej){
      try {
        var r = indexedDB.open(IDB_DB, 1);
        r.onupgradeneeded = function(e){ try { if (!e.target.result.objectStoreNames.contains(IDB_STORE)) e.target.result.createObjectStore(IDB_STORE); } catch(_){} };
        r.onsuccess = function(e){ res(e.target.result); };
        r.onerror = function(){ rej(r.error); };
      } catch(e){ rej(e); }
    });
  }
  function idbReadKeys(){   // 画像のキーだけ(軽い) → ハッシュ用
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var keys = [];
        try {
          var cur = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).openKeyCursor();
          cur.onsuccess = function(e){ var c = e.target.result; if (c){ keys.push(c.key); c.continue(); } else { db.close(); res(keys); } };
          cur.onerror = function(){ db.close(); res(keys); };
        } catch(e){ try { db.close(); } catch(_){}; res(keys); }
      });
    }).catch(function(){ return []; });
  }
  function idbReadAll(){
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var out = {};
        try {
          var cur = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).openCursor();
          cur.onsuccess = function(e){ var c = e.target.result; if (c){ out[c.key] = c.value; c.continue(); } else { db.close(); res(out); } };
          cur.onerror = function(){ db.close(); res(out); };
        } catch(e){ try { db.close(); } catch(_){}; res(out); }
      });
    }).catch(function(){ return {}; });
  }
  // ★iOS Safari対策(DeepResearch 2026-07-07): IndexedDBは大量(160件・5MB)を1トランザクションで
  //   書くとサイレント失敗/停止する(oncomplete不発・"Connection to IDB server lost")。
  //   → 小分け(20件/tx)で書き、読み戻して不足分を1回再試行(検証付き)。
  // ★fix399j(2026-07-07・Deep Research裏取り): iOSは「時間分散した多tx書き込み」に最も弱い
  //   (WebKit bug202705: background suspendで進行中txを強制abort+JS凍結)。→ WebKit推奨に沿い
  //   「1回の短いtxで全put(await挟まず同期発行)→oncomplete待ち+短timeout保険」。多パス/長timeoutは廃止。
  function idbPutAllOneTx(map, keys){
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var done=false; function go(){ if(done)return; done=true; try{ db.close(); }catch(_){} res(); }
        try {
          var tx = db.transaction(IDB_STORE, 'readwrite'); var st = tx.objectStore(IDB_STORE);
          for (var i=0;i<keys.length;i++){ try { st.put(map[keys[i]], keys[i]); } catch(_){} }  // 全putを同一スタックで同期発行(Safari auto-commit対策)
          tx.oncomplete = go; tx.onerror = go; tx.onabort = go;
          setTimeout(go, 2000);   // iOS: oncomplete不発の保険(短め)
        } catch(e){ go(); }
      });
    }).catch(function(){});
  }
  // 期待画像キー集合を永続化(起動時の自己修復=idempotent replayの基準)。
  function saveExpectedImgKeys(keys){ try { localStorage.setItem('v292Dfix399_imgKeys', JSON.stringify(keys.slice().sort())); } catch(e){} }
  function idbWriteAll(map){
    if (!map || !Object.keys(map).length) return Promise.resolve(0);
    var allKeys = Object.keys(map);
    // ①1回の短いtxで全部書く(時間分散しない=iOSでabortされにくい)。
    return idbPutAllOneTx(map, allKeys).then(function(){ return idbReadKeys(); }).then(function(present){
      var set = {}; present.forEach(function(k){ set[k] = 1; });
      var missing = allKeys.filter(function(k){ return !set[k]; });
      saveExpectedImgKeys(allKeys);   // 何が揃うべきかを記録(不足があっても起動時selfHealが拾う)
      if (!missing.length) return allKeys.length;
      // ②不足は「もう1回だけ」短いtxで再試行(多パス廃止=フリーズ回避)。残りは次回起動のselfHealが補充。
      try { console.log(TAG, 'idbWriteAll missing after 1st tx', missing); } catch(e){}
      return idbPutAllOneTx(map, missing).then(function(){ return idbReadKeys(); }).then(function(p2){
        var s2 = {}; p2.forEach(function(k){ s2[k] = 1; });
        var still = allKeys.filter(function(k){ return !s2[k]; });
        try { console.log(TAG, 'idbWriteAll still-missing (selfHealに委譲)', still); } catch(e){}
        return still.length ? -(still.length) : allKeys.length;
      });
    }).catch(function(){ return -1; });
  }

  // ---- サーバー通信 ----
  function callSave(bodyObj){
    return fetch(proxyUrl() + '/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(bodyObj) })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, json: j }; }); });
  }
  function getMeta(){ return callSave({ op: 'meta' }).then(function(r){ return (r.json && r.json.meta) || null; }).catch(function(){ return null; }); }

  // ---- 収集(light/full) ----
  function collectLight(ts){
    var slot = activeSlot();
    return { schema: SCHEMA, updatedAt: ts || Date.now(), device: (navigator.userAgent||'').slice(0,60), activeSlot: slot, ls: collectLS(slot) };
  }
  function collectFull(ts){
    var pkg = collectLight(ts);
    return idbReadAll().then(function(imgs){ pkg.idb = imgs; return pkg; });
  }

  // ---- スロット整合ヘルパー(データ保護) ----
  function activeSlotTurns(){
    try { var slot = activeSlot(); var raw = localStorage.getItem(slot === 'chr6' ? 'chr6' : ('chr6_slot_' + slot)); if (!raw) return 0; var d = JSON.parse(raw); return (d && Array.isArray(d.turns)) ? d.turns.length : 0; } catch(e){ return 0; }
  }
  // ★根本修復: ターンがあるのに登録簿(chr6_slots_meta)に無いアクティブスロットを登録する。
  //   これが無いと fix30 の activeSlot()=findSlot()||meta[0] が default に化けてスロットが崩れる(今回のデータ消失の芯)。
  function healSlotMeta(){
    try {
      var slot = activeSlot();
      if (!slot || slot === 'default' || slot === 'chr6') return;
      var raw = localStorage.getItem('chr6_slot_' + slot); if (!raw) return;
      var d; try { d = JSON.parse(raw); } catch(e){ return; }
      if (!(d && Array.isArray(d.turns) && d.turns.length > 0)) return;      // 中身がある時だけ
      var meta; try { meta = JSON.parse(localStorage.getItem('chr6_slots_meta') || '[]'); } catch(e){ meta = []; }
      if (!Array.isArray(meta)) meta = [];
      if (meta.some(function(s){ return s && s.id === slot; })) return;      // 既に登録済み
      meta.push({ id: slot, name: 'マイ物語', key: 'chr6_slot_' + slot, updatedAt: new Date().toISOString() });
      localStorage.setItem('chr6_slots_meta', JSON.stringify(meta));
      try { console.log(TAG, 'healed slots_meta: registered', slot); } catch(e){}
    } catch(e){}
  }

  // ---- push(自動/手動共通) ----
  //   force=true: 必ずfull送信(手動ボタン用)。それ以外はキー集合が変わった時だけfull。
  var pushing = false;
  /* ★fix582(2026-07-26・GPT裁定): この push は**サーバの競合検査に参加していなかった**。
     Worker(v23b:1501) は `hasBase = body.baseRev !== undefined && !== null` で分岐し、
     hasBase が false なら **fork判定を一切しない**（＝無条件上書きの経路へ進む）。
     fix402 は baseRev を送っていたが、こちらは送っていなかったため、
     サーバから見ると「別端末が何を書いていようが上書きする」要求だった。

     直し方(GPT指定):
       ・fix399 と fix402 が **Coordinator の同じ数値rev** を baseRev として使う
       ・正本は **Worker の数値rev**。v292Dfix399_baseTs は競合制御から外し**診断値へ降格**
       ・fork応答なら **再取得→1回だけ再push**。それでも fork なら **fail-closed**（dirtyを残す）
       ・**成功応答のrevだけ**を正本へ昇格する（fork応答のrevはサーバの現在値であって、
         自分の書込みが通った証拠ではない）

     ★壊れ方の向きが変わる: 以前は「別端末のセーブが消える」、以後は「pushが本流に入らない(fork)」。
       forkはサーバが**両方保持**するので失われない。気づけるし戻せる。
     緊急停止: v292Dfix582Off='1' で旧挙動（baseRevなし）へ戻す。 */
  function coord(){
    try { var c = window.__v292Dfix580;
          return (c && typeof c.rev === 'function') ? c : null; } catch(e){ return null; }
  }
  function fix582Off(){ try { return localStorage.getItem('v292Dfix582Off') === '1'; } catch(e){ return false; } }

  /* ==================================================================
     ★★fix596: 送ったのに応答を取り逃したときの決着（Worker v25 の commitstate を使う）

     何のためにあるのか:
       put の応答を受け取れないまま離脱すると、「サーバは受け取ったのか」が分からない。
       分からないまま次の put を送ると、前回のコミットの証拠が消えて、
       rev が食い違ったまま fork し続ける（2026-07-27 に実際に起きた 429/430 デッドロック）。
       サーバに「いま canonical に入っている中身のhash」と「最後に成功した commit の op id」を
       聞けば、自分が送ったものと突き合わせて自力で判断できる。

     ★呼ぶ契機（GPT裁定）:
       (1) 起動時に pending が残っている
       (2) fork / conflict の直後に1回
       (3) timeout・通信切断・応答解析失敗の直後に1回
       (4) スリープ／非表示から復帰したときに pending があり、前回から一定以上経過している
     ★呼ばない: 正常な成功応答を受け取った push / pending の無い通常起動 / 通常のターンごとの保存
     ★single-flight: 走っている間の要求は「終わったあと最大1回だけ」やり直す（台帳側で管理） */
  function ledger(){ try { return window.__v292Dfix590 || null; } catch(e){ return null; } }

  /* ★★fix596c: サーバが返す ns（アカウントごとの名前空間）を覚えておく。
     Google トークンは期限切れで消えるし、取得元も経路によって違うので、
     ヘッダから作った identity は**同じ人でも時間で変わってしまう**。
     ns はアカウントに紐づく安定した値なので、これを identity の基準にする。 */
  /* ★★fix597(GPT指定): ns の**生値を localStorage へ保存しない**。
     Worker の ns は SHA256(secret salt | codeKey) の先頭32hexで、すでに非可逆・非PIIだが、
     「生値は端末に置かない」を方針として固定する。
     保存するのは台帳側が作る SHA-256 指紋だけ（v292Dfix597_nsfp）。生の ns はメモリのみ。
     ★identity の優先順（GPT指定）:
         commitstate.ns → meta.ns → 成功put応答.ns → ヘッダ由来（最後の手段）
     ★identity を確定できない場合は identity-unverified とし、
       appliedRev変更0 / pending削除0 / 自動再送0。foreign へ捨ててはいけない。 */
  var NS_KEY = 'v292Dfix596_ns';       /* ★旧キー。移行のため読むだけ、書かない */
  var NS_MEM = null;                   /* このセッション中の生の ns（保存しない） */
  function rememberNs(j){
    var ns = (j && j.ns) ? String(j.ns) : null;
    if (!ns) return null;
    NS_MEM = ns;
    var led = ledger();
    try { if (led && typeof led.learnNs === 'function') led.learnNs(ns); } catch(e){}
    /* ★旧キーに生値が残っていたら消す（fix596 で書いてしまっていたもの） */
    try { localStorage.removeItem(NS_KEY); } catch(e){}
    return ns;
  }
  function knownNs(){
    if (NS_MEM) return NS_MEM;
    /* ★移行: 旧キーに生値が残っていたら、一度だけ指紋へ移して生値を消す */
    try {
      var old = localStorage.getItem(NS_KEY);
      if (old){ NS_MEM = String(old); var l = ledger();
                if (l && typeof l.learnNs === 'function') l.learnNs(NS_MEM);
                localStorage.removeItem(NS_KEY); return NS_MEM; }
    } catch(e){}
    return null;
  }
  /* 台帳へ渡す識別情報。ns があればそれを使い、無ければ従来どおりヘッダから作る。 */
  function identityArgs(){
    var h = authHeaders();
    return { ns: knownNs(),
             identity: (h['x-google-id'] || h['x-chronicle-pass'] || null),
             identityKind: (h['x-google-id'] ? 'google' : 'pass') };
  }
  /* ★★fix597(GPT指定): v25 の commitstate には ns が無い。
     **pending があり、かつ安定 identity をまだ取れていないときだけ** op:'meta' を1回叩いて ns を得る。
     毎回叩かない。セッション中に取れたらメモリで再利用する。
     （次の Worker 更新で commitstate に ns が入れば、この往復は不要になる） */
  function ensureStableNs(cap){
    /* ★★fix598: Worker v26 以降は commitstate 自身が ns を返すので、この往復は**不要**。
       同じ read-back 応答から identity を取れる方が、
         ・通信が1回で済む
         ・その間に別の書き込みが割り込む余地（race）が小さい
         ・照合の証拠が1つの応答にまとまる
         ・一度も成功 put をしていない端末でも安定 identity を得られる
       という点で優れている（GPT結論）。v25 のときだけ meta を1回叩く。 */
    if (cap && cap.nsInCommitState) return Promise.resolve(knownNs());
    if (knownNs()) return Promise.resolve(knownNs());
    return callSave({ op:'meta' }).then(function(r){
      if (r && r.status === 200 && r.json && r.json.ok === true) return rememberNs(r.json);
      return null;
    }, function(){ return null; });
  }

  function workerSupportsCommitState(){
    /* v25 未満では commitstate が無い。root の capabilities で判定する。
       ★「D1が無い環境だから」で能力表示を変えない（実装の有無と利用可否を混ぜない）ので、
         クライアント側で d1:true も併せて確かめる（GPT指定）。

       ★★fix598: 能力の値は**単調増加**する（GPT指定）。
         commitState: 1 … rev / packageHash / lastCommitOpId / hashAlg を返す（Worker v25）
         commitState: 2 … 上記に加えて **ns** も返す（Worker v26）
         ここを `=== 1` で書いていると、**サーバを新しくした瞬間に照合が丸ごと止まる**。
         能力判定は必ず「その機能が使えるだけの版か」＝ `>=` で書く。 */
    return fetch(proxyUrl() + '/', { method: 'GET' }).then(function(r){ return r.json(); })
      .then(function(j){
        var cap = j && j.capabilities;
        var cs = (cap && typeof cap.commitState === 'number') ? cap.commitState : 0;
        return { ok: !!(cs >= 1 && j.d1 === true),
                 commitStateVersion: cs,
                 /* ★ns が commitstate 応答に入るのは v26 以降 */
                 nsInCommitState: cs >= 2,
                 hashAlg: cap && cap.packageHash, packageSpec: cap && cap.packageSpec,
                 workerBuild: j && j.workerBuild };
      }, function(){ return { ok:false, commitStateVersion: 0, nsInCommitState: false }; });
  }

  /* 現在のローカル状態の packageHash（送るときと**完全に同じ規則**で作る）
     ★★fix596: ts を渡せるようにしてある。collectLight は `updatedAt: ts` を埋めるので、
       現在時刻で作り直すと**中身が同じでもhashが必ず変わる**。
       照合では「送ったときの ts」で作り直し、**中身が変わったときだけ**差が出るようにする。
       （2026-07-27 の実機で、ここを現在時刻にしていたため三者一致が常に false になっていた） */
  function currentLocalPackageHash(ts){
    var led = ledger();
    if (!led || typeof led.payloadHash !== 'function') return Promise.resolve(null);
    try { return led.payloadHash(collectLight(ts == null ? Date.now() : +ts)); }
    catch(e){ return Promise.resolve(null); }
  }

  var reconcileLast = { status:'never', at:0, why:null, conflictState:null };
  /* ★★fix597(GPT裁定D1ケースB): local-diverged-after-commit は「通常のpullで直る状態」ではない。
     local-ahead 保護で pull がスキップされると永久に fork し続けるので、
     **明示的な競合状態**として保持し、解決はユーザーの選択（クラウドを取り込む /
     この端末をクラウドの正にする＝墓標保護付きforceput）に委ねる。 */
  var divergedState = null;
  function divergedAfterCommit(){ return divergedState; }
  function clearDivergedState(why){
    if (!divergedState) return { ok:false };
    divergedState = null;
    try { console.log(TAG, 'local-diverged 解消:', String(why || '')); } catch(e){}
    return { ok:true };
  }
  function reconcileNow(reason){
    var led = ledger();
    if (!led || typeof led.runReconcile !== 'function') return Promise.resolve({ status:'no-ledger' });
    if (!isLoggedIn()) return Promise.resolve({ status:'not-logged-in' });
    return led.runReconcile(function(ctx){
      return workerSupportsCommitState().then(function(cap){
        if (!cap.ok){
          /* v25未満 or D1なし。ここで appliedRev を動かしてはいけない。pull を要求する。 */
          reconcileLast = { status:'unsupported', at: Date.now(), why:'no-commitstate' };
          return { status:'unsupported', needsPull:true };
        }
        /* ★fix597/598: 安定 identity（ns）を先に確保する。
           Worker v26 以降は commitstate 自身が ns を返すので、ここでは何もしない。 */
        return ensureStableNs(cap).then(function(){
        return callSave({ op:'commitstate' }).then(function(r){
          if (r.status !== 200 || !r.json || r.json.ok !== true){
            reconcileLast = { status:'remote-read-failed', at: Date.now(), why:'http ' + r.status };
            return led.classify({ remoteReadFailed:true, pendingAtStart: ctx.pendingAtStart })
                      .then(function(){ return { status:'remote-read-failed' }; });
          }
          var j = r.json;
          /* ★★fix598: identity の優先順（GPT指定）
                 commitstate.ns → meta.ns → 成功put応答.ns → ヘッダ由来（最後の手段）
             commitstate の ns は「いま読んだ canonical と同じ応答」から来るので最も強い。
             ★v25 には ns が無い。その場合 rememberNs は何もせず、
               直前の ensureStableNs が meta から取った値がそのまま使われる。 */
          rememberNs(j);
          var c = fix582Off() ? null : coord();
          var applied = c ? c.rev() : 0;
          /* ★送ったときと同じ ts で作り直す（そうしないと必ず不一致になる） */
          return currentLocalPackageHash(ctx.pendingAtStart && ctx.pendingAtStart.pkgTs).then(function(curHash){
            return led.classify({
              remote: { rev: j.rev, packageHash: j.packageHash, lastCommitOpId: j.lastCommitOpId,
                        hashAlg: j.hashAlg, packageSpec: cap.packageSpec },
              appliedRev: applied,
              /* ★★fix598: identity は commitstate の ns を最優先で使う。
                 j.ns はいま読んだ canonical と**同じ応答**から来るので、
                 別の往復で取った値より強い（間に別の書き込みが入る余地がない）。
                 v25 には j.ns が無いので identityArgs().ns（meta 由来）へ落ちる。 */
              ns: (j.ns ? String(j.ns) : identityArgs().ns),
              identity: identityArgs().identity,
              identityKind: identityArgs().identityKind,
              currentHash: curHash,
              pendingAtStart: ctx.pendingAtStart
            });
          }).then(function(v){
            reconcileLast = { status: v.status, at: Date.now(), why: v.why || null,
                              conflictState: v.conflictState || null };
            var fullMatch = (v.status === 'commit-confirmed' || v.status === 'state-equivalent-rebased');
            if (fullMatch){
              /* ★rev は巻き戻さない。進めてよいと言われたときだけ進める。 */
              if (v.canAdvanceAppliedRev && c && v.remoteRev != null){
                c.promoteRev(v.remoteRev, 'fix596:' + v.status);
              }
              /* ★三者一致なので、同期対象の中身は remote と同じ＝同期dirtyを解除できる。
                 端末設定やUI状態の dirty までは触らない（GPT指定）。 */
              try { led.clear(); } catch(e){}
              setNum('v292Dfix399_baseTs', Date.now());
            }
            /* ★★fix597(GPT裁定D1): 「曖昧ではなくなった」なら pending の役目は終わり。
               ここを解放しないと、**未解決の pending が残り続けて以後の送信が永久に止まる**。
               ただし fix596 のように2種類を同じ扱いにしてはいけない。
                 pending-superseded-by-remote
                   canonical は自分が送った内容ではない。遮断解除・rev不変・dirty・pull要求。
                   ★「自分のcommitは通らなかった」とは断定しない（別端末の後続commitで
                     置き換わった可能性がある）。
                 commit-confirmed-local-diverged / state-equivalent-local-diverged
                   canonical は自分が送ったもの。そのあとローカルが先へ進んだ。
                   遮断解除・dirty維持・★自動rev昇格なし。
                   ★通常の needsPull にしない。local-ahead 保護で pull がスキップされると
                     appliedRev が古いまま・ローカルが先・次putでまた fork になるため、
                     **明示的な競合状態 local-diverged-after-commit** として持つ。 */
            if (!fullMatch && v.releasePending){
              try { led.clear(); } catch(e){}
              setNum('v292Dfix399_localTs', Date.now());     /* 未同期のまま残す */
              if (v.conflictState === 'local-diverged-after-commit'){
                divergedState = { at: Date.now(), remoteRev: (v.remoteRev == null ? null : +v.remoteRev),
                                  commitOutcome: v.commitOutcome || 'unknown',
                                  choices: v.choices || ['adopt-remote', 'make-this-device-canonical'] };
                try { console.log(TAG, '競合状態: local-diverged-after-commit（自動pullでは解決しない）'); } catch(e){}
              } else {
                try { console.log(TAG, 'pendingを解放:', v.status); } catch(e){}
              }
            }
            /* ★identity を確定できないときは何も変えない（GPT指定）。 */
            if (v.why === 'identity-unverified'){
              try { console.log(TAG, 'identity未確定のため何も変更しません'); } catch(e){}
            }
            return { status: v.status, remoteRev: v.remoteRev, canAdvance: !!v.canAdvanceAppliedRev,
                     conflictState: v.conflictState || null,
                     commitOutcome: v.commitOutcome || 'unknown',
                     released: !!v.releasePending,
                     needsPull: (v.needsPull === undefined ? !fullMatch : !!v.needsPull) };
          });
        }, function(e){
          reconcileLast = { status:'remote-read-failed', at: Date.now(), why:String(e && e.message || e).slice(0,60) };
          return { status:'remote-read-failed' };
        });
        });   /* ensureStableNs */
      });
    }).then(function(r){
      try { console.log(TAG, 'reconcile(' + String(reason || '?') + ') → ' + (r && r.status)); } catch(e){}
      return r;
    });
  }

  /* ★契機(1): 起動時に pending が残っていれば1回だけ。**無ければ何もしない**。 */
  function reconcileOnBoot(){
    try {
      var led = ledger();
      if (!led || typeof led.hasAwaiting !== 'function' || !led.hasAwaiting()) return;
      setTimeout(function(){ try { reconcileNow('boot'); } catch(e){} }, 9000);
    } catch(e){}
  }
  /* ★契機(4): 復帰時。visibilitychange が頻発しても、pending が無ければ何もしない。 */
  function armVisibilityReconcile(){
    try {
      if (!document || !document.addEventListener) return;
      document.addEventListener('visibilitychange', function(){
        try {
          if (document.visibilityState !== 'visible') return;
          var led = ledger();
          if (!led || typeof led.shouldReconcileOnResume !== 'function') return;
          if (!led.shouldReconcileOnResume()) return;
          reconcileNow('resume');
        } catch(e){}
      });
    } catch(e){}
  }

  function push(force){
    if (!isLoggedIn()) return Promise.reject(new Error('ログインが必要です'));
    if (pushing) return Promise.reject(new Error('同期中'));
    pushing = true;
    var ts = Date.now();
    var c = fix582Off() ? null : coord();
    var baseAtStart = c ? c.rev() : null;   /* 診断用に控える（判断には使わない・fix585） */
    var lastServerRev = null;
    return getMeta().then(function(meta){
      var serverTs = meta ? (+meta.updatedAt || 0) : 0;
      /* ★fix582: 数値revが使えるときは、**時刻比較を書込み認可に使わない**（GPT指定）。
         時刻はサーバとクライアントでずれるうえ、revと二重の判断基準を持つと
         「どちらを信じるか」で挙動が割れる。時刻は診断としてだけ残す。 */
      if (!c && serverTs > baseTs() && !force){
        var e = new Error('CONFLICT'); e.conflict = true; e.serverTs = serverTs; e.device = meta && meta.device; throw e;
      }
      // ★空ガード: ローカルが0ターンなのにクラウドに本物のセーブがある→潰さない(空でクラウドを上書きしない)
      if (activeSlotTurns() === 0 && meta && (+meta.lsSize || +meta.size || 0) > 3000){
        var eg = new Error('EMPTY_LOCAL_GUARD'); eg.emptyGuard = true; throw eg;
      }
      /* ★★ここで meta.rev を自分の基準へ採用してはいけない（実装中に踏んだ設計バグ）。
         push直前にサーバの現在revを basedRev として採用すると、**必ず一致して fork が起きない**。
         それは「サーバに何が入っていようが自分で上書きする」という、
         いま無くそうとしている無条件上書きそのものになる。
         baseRev は「自分のローカル状態が derive された版」でなければ意味がない。
         取得した meta は診断（と将来のtombstone合成）にだけ使う。 */
      lastServerRev = (meta && meta.rev != null) ? (+meta.rev || 0) : null;
      return idbReadKeys();
    }).then(function(imgKeys){
      var curHash = hash(imgKeys.slice().sort().join('|'));
      var needFull = force || (curHash !== imgHashStored()) || (workerVer < 11); // v11未満/未検出は安全側でfull
      var build = needFull ? collectFull(ts) : Promise.resolve(collectLight(ts));
      return build.then(function(pkg){ return { pkg: pkg, needFull: needFull, curHash: curHash }; });
    }).then(function(o){
      function attempt(){
        var body = { op: 'put', pkg: o.pkg };
        if (c) body.baseRev = c.rev();          /* ★これが無いとサーバは競合検査をしない */
        /* ★fix590: 「何を送ったか」を put の**直前に永続化**する。
           2026-07-27 の実機で「サーバでは成功したのに、応答を受け取る前にページを離脱して
           appliedRev が取り残される」が実際に起きた。ページ離脱をまたぐので、メモリでは足りない。
           ★★fix596: ここで commitOpId を発行して body に載せる。Worker v25 がそれを保存し、
           次に commitstate で読めば「自分の commit が canonical になったか」を自力で判定できる。
           ★★fix596(GPT指定3): 未解決の pending が残っているなら**送らない**。
           上書きすると前回コミットの証拠が消える。ローカル変更は dirty のまま溜める。 */
        var led = null;
        try { led = window.__v292Dfix590; } catch(e){ led = null; }
        var prep;
        if (led && typeof led.notePut === 'function'){
          var ia = identityArgs();
          prep = led.notePut({ pkg: o.pkg, baseRev: body.baseRev, op: 'put', pkgTs: ts,
                               ns: ia.ns, identity: ia.identity, identityKind: ia.identityKind,
                               source: 'fix399' });
        } else {
          prep = Promise.resolve({ ok:false, code:'no-ledger' });
        }
        return Promise.resolve(prep).then(function(pr){
          if (pr && pr.blocked){
            /* 前回の送信の結末がまだ分かっていない。まず決着させる。 */
            setNum('v292Dfix399_localTs', Date.now());   /* 未同期であることを残す */
            var eb = new Error('PENDING_COMMIT_UNRESOLVED');
            eb.pendingCommit = true; eb.pending = pr.pending || null;
            throw eb;
          }
          if (pr && pr.ok && pr.commitOpId) body.commitOpId = pr.commitOpId;
          return callSave(body);
        }).then(function(r){
          if (r.status !== 200 || !r.json) throw new Error('HTTP ' + r.status);
          var j = r.json;
          if (j.fork){
            /* ★fork = 自分の基準とサーバの版が違った。サーバは**両方保持**しているのでデータは失われていない。
               ここで「サーバの現在revを採用してもう一度押す」のは**やってはいけない**。
               それは相手の版を確認せずに自分で塗り替えることであり、無条件上書きと同じになる。

               再試行してよいのは**自端末の別経路（fix402）が同期中にrevを進めた場合だけ**。
               この場合は同じ端末の同じデータなので、新しい基準で押し直すのが正しい。
               判定: 開始時に控えた基準と、いまの共有基準が違っていれば同時発火。 */
            /* ★★fix585(GPT裁定): 「共有revの変化だけで自端末競合と判断する再試行も安全ではない」。
               共有revが動いた理由が本当に自端末の別経路かどうかは、rev の変化だけでは区別できない。
               （別端末のpush成功を、こちらのpull/metaが拾って共有revを進めた場合も同じ見え方になる）
               **現段階では、forkはすべて fail-closed** にする。
               将来 全状態の再マージが実装できた時点で「再取得→再マージ→新payload作成→1回だけ再put」へ格上げする。 */
            if (c) c.noteFailClosed('fork。上書きせず中止（全状態の再マージが未実装のため一律fail-closed）');
            /* ★fix590: fork も「応答を受け取れた」＝結果は確定している。台帳は消さずに残す
               （次段で read-back と突き合わせるため）。 */
            try { if (led && typeof led.noteResult === 'function')
                    led.noteResult({ fork:true, serverRev: (j.server && j.server.rev), source:'fix399' }); } catch(e){}
            setNum('v292Dfix399_localTs', Date.now());   /* 未同期であることを残す */
            /* ★fix596 契機(2): fork の直後に1回だけ照合する。
               fork は「サーバの版が違った」という事実だが、自分の前回コミットが
               入っていたのかどうかはこれだけでは分からない。 */
            try { setTimeout(function(){ reconcileNow('fork'); }, 0); } catch(e){}
            var ef = new Error('CONFLICT'); ef.conflict = true; ef.fork = true;
            ef.serverRev = (j.server && j.server.rev) != null ? j.server.rev : lastServerRev;
            throw ef;
          }
          if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
          rememberNs(j);   /* ★fix596c: 安定した identity の基準にする */
          /* ★★fix596(GPT指定2): 成功応答を `ok:true` だけで信用しない。
             rev / hashAlg / packageHash / lastCommitOpId をすべて突き合わせ、
             **commit-confirmed のときだけ** rev を正本へ昇格し台帳を消す。
             どれかが食い違えば台帳を残したまま appliedRev を動かさず、照合(commitstate)へ回す。 */
          var verdict = { status:'legacy-ok' };
          try { if (led && typeof led.noteResult === 'function')
                  verdict = led.noteResult({ rev: j.rev, source:'fix399', response: j }) || verdict; } catch(e){}
          if (verdict.status === 'ambiguous-response' || verdict.status === 'response-integrity-mismatch'){
            /* サーバは 200 を返したが、自分の commit が入った証明にならない。
               ここで rev を進めると「入っていないものを入った」ことにしてしまう。 */
            if (c) c.noteFailClosed('応答の整合が取れない(' + verdict.status + ')。revを進めず照合へ回す');
            setNum('v292Dfix399_localTs', Date.now());
            var ea = new Error('AMBIGUOUS_RESULT');
            ea.ambiguous = true; ea.verdict = verdict.status;
            throw ea;
          }
          /* ★成功。ここで初めて rev を正本へ昇格する */
          if (c && j.rev != null) c.promoteRev(j.rev, 'push成功');
          setNum('v292Dfix399_baseTs', ts); setNum('v292Dfix399_localTs', ts);
          if (o.needFull) { try { localStorage.setItem('v292Dfix399_imgHash', o.curHash); } catch(e){} }
          return { lsSize: j.lsSize, imgUpdated: j.imgUpdated, rev: j.rev };
        });
      }
      return attempt();
    }).then(function(res){ pushing = false; return res; }, function(err){
      pushing = false;
      /* ★fix596 契機(3): timeout・通信切断・応答解析失敗の直後に1回だけ照合する。
         ★即座に何度も read-back しない。失敗したら pending を維持して、
           次の起動・復帰・ユーザーpull へ回す（GPT指定）。
         ★fork は上で既に1回呼んでいるので、ここでは呼ばない（二重に走らせない）。
         ★pending が未解決で送信を止めた場合も、まず照合させる。 */
      try {
        var isFork = !!(err && err.fork);
        if (!isFork) setTimeout(function(){ reconcileNow(err && err.pendingCommit ? 'pending-blocked' : 'io-error'); }, 0);
      } catch(e){}
      throw err;
    });
  }

  // ---- pull(取得のみ・適用は別) ----
  function pullData(){
    if (!isLoggedIn()) return Promise.reject(new Error('ログインが必要です'));
    return callSave({ op: 'get' }).then(function(r){
      if (r.status !== 200 || !r.json || !r.json.ok) throw new Error((r.json && r.json.error) || ('HTTP ' + r.status));
      return r.json.data;
    });
  }

  /* ★fix575: 中止・削除の理由は**必ず**残す。
     旧実装は localStorage にだけ書いていたので、**容量が満杯のときは記録そのものが失敗**し、
     いちばん知りたい「なぜ取り込みを中止したか」が無言で消えていた（回帰テストで発覚）。
     メモリ側を正本にし、localStorage への永続化は best-effort にする。
     読み出し: window.__v292Dfix399x.bkLog() */
  var BKLOG = [], BKLOG_MAX = 20;
  function bkLog(){
    var ls = [];
    try { ls = JSON.parse(localStorage.getItem('v292Dfix399_bkLog') || '[]') || []; } catch(e){ ls = []; }
    return { mem: BKLOG.slice(), persisted: ls, persistedOk: ls.length > 0 };
  }

  // ---- 復元(取り込み) ----
  function backupBeforeApply(pkg){
    // fix495(C1): ①先に世代trim(新しい順2件) ②控えを書く ③quotaなら同系統をもう1つ削って1回再試行
    // ④それでも書けなければ false(=取り込み中止・fail-closed)。従来は無制限に溜まり(1個~全スロット
    // 合計サイズ)十数回のpullでquota飽和→保存失敗連鎖の温床だった。_del_退避(5世代管理)は対象外。
    function listBk(){
      var bks = [];
      try { for (var bi = 0; bi < localStorage.length; bi++){ var bk = localStorage.key(bi); if (/^chr6_bk_cloudsync_\d+$/.test(bk || '')) bks.push(bk); } } catch(e){}
      bks.sort(); return bks;
    }
    /* ★fix568(2026-07-26・GPT裁定「案B」): ここは以前「書く前に必ず既存を1件まで削る」だった。
       ところが cloudsync の丸ごと控えは、**サイドストアまで運べる唯一の控え**であり、
       棚卸し(fix562)では最優先の保護対象になっている。
       つまり「絶対に消すな」と決めた対象を、pull のたびに自分で削っていた。
       これは同日 fix490/fix565 で踏んだ「多重所有」とまったく同じ型。

       直した順序(GPT指定):
         ①旧完全控え(最新の、読めて展開できるもの)を**保護**する
         ②保護対象ではない余剰世代だけを整理する
         ③新しい控えを書く
         ④**読み戻して完全性を確認**する
         ⑤成功して初めて、旧控えを削除対象へ降格する
       容量確保に失敗したら、pull を通す fail-open ではなく **pull を中止する fail-closed**。
       クラウドのデータは残っているので、取り込みを諦める方が安全。
       削除・中止の理由は必ず記録する(無言にしない)。 */
    function readableFullDump(k){
      /* 「読めて展開できる」= JSONとして読めて ls を持ち、本体が1つ以上入っていること。
         ここを緩めると、壊れた控えを保護してしまい本物を消すことになる。 */
      try {
        var o = JSON.parse(localStorage.getItem(k) || 'null');
        if (!o || !o.ls || typeof o.ls !== 'object') return false;
        /* ★本体セーブは `chr6_slot_<id>` だけでなく、既定枠の **`chr6`** もある。
           `chr6_slot_` だけを見ると既定枠だけの控えを「不完全」と誤判定し、
           書いた直後の検証に落ちて pull が通らなくなる(実装時に回帰テストで踏んだ)。 */
        return Object.keys(o.ls).some(function(x){ return x === 'chr6' || /^chr6_slot_/.test(x); });
      } catch(e){ return false; }
    }
    function note(rec){
      /* ★まずメモリへ。容量が満杯でも理由が消えないようにする(fix575) */
      try { BKLOG.push(rec); if (BKLOG.length > BKLOG_MAX) BKLOG.shift(); } catch(e){}
      try {
        var a = JSON.parse(localStorage.getItem('v292Dfix399_bkLog') || '[]');
        if (!Array.isArray(a)) a = [];
        a.push(rec);
        localStorage.setItem('v292Dfix399_bkLog', JSON.stringify(a.slice(-20)));
      } catch(e){}   /* 永続化は best-effort。失敗しても mem 側に残る */
    }
    try {
      var snap = {};
      Object.keys(pkg.ls || {}).forEach(function(k){ var v = localStorage.getItem(k); if (v != null) snap[k] = v; });
      var payload = JSON.stringify({ activeSlot: activeSlot(), ls: snap });

      /* ① 保護対象 = 読める完全控えのうち最新1件(listBk はキー昇順=時刻昇順) */
      var readable = listBk().filter(readableFullDump);
      var keep = readable.length ? readable[readable.length - 1] : null;

      /* ② 保護対象**以外**だけを整理する。保護対象は絶対に触らない。 */
      function dropOneSpare(){
        var cur = listBk();
        for (var i = 0; i < cur.length; i++){
          if (cur[i] === keep) continue;
          try { localStorage.removeItem(cur[i]); } catch(e){ return false; }
          note({ at: Date.now(), act: 'dropSpare', key: cur[i], kept: keep });
          return true;
        }
        return false;   /* 消せる余剰が無い = 保護対象しか残っていない */
      }
      /* 書く前は「保護対象＋余剰1件」までに減らしておく。書いた直後に3件へ膨らませない。 */
      while (listBk().length > (keep ? 1 : 1)) {
        if (!dropOneSpare()) break;
      }

      /* ③④ 新しい控えを書き、読み戻して完全性を確認する */
      var newKey = 'chr6_bk_cloudsync_' + Date.now();
      function writeAndVerify(){
        try { localStorage.setItem(newKey, payload); } catch(e){ return 'quota'; }
        if (!readableFullDump(newKey)){
          try { localStorage.removeItem(newKey); } catch(e){}
          return 'verify';
        }
        return 'ok';
      }
      /* ★fix575(2026-07-26・GPT裁定): 容量回復の削除だけを fix569 の exact-delete ゲートへ通す。
         **候補の選択は上の dropOneSpare と同じロジックのまま**（最小変更）。変えるのは物理削除の実行だけ。
         ゲートが見るもの: ①exact key の存在 ②bytes 一致(候補作成時からの変化＝stale を弾く)
         ③fix562 の保護判定を**その場で**取り直す ④protected／分類器不在なら削除しない
         ⑤fix569 が最初に捕捉した native removeItem で削除（fix246 のキー書換を迂回）⑥read-back。
         ★⑤が要。`localStorage.removeItem()` を呼んで後から read-back するだけでは不十分で、
           fix246 が別キーへ書き換えた場合「候補は残ったまま**別キーが消える**」事故になる。 */
      /* ★fix576(GPT裁定・fix575の修正): 「ゲートが見つからない」を旧経路への自動フォールバックにしない。
         中央の保護機構がロードできなかったことを理由に、**いちばん危険な旧削除経路へ自動で戻る**のは
         不変条件と矛盾する。分けるのは次の2つだけ:
           v292Dfix575Off === '1'  → 明示的な緊急ロールバック。旧経路を使い rollbackModeUsed を記録
           OFFではないのに tryDeleteExact が無い → policy-unavailable として **pull中止**。旧経路へ戻らない */
      function gateOff(){ try { return localStorage.getItem('v292Dfix575Off') === '1'; } catch(e){ return false; } }
      function gateway(){
        try {
          var g = window.__v292Dfix569;
          return (g && typeof g.tryDeleteExact === 'function') ? g : null;
        } catch(e){ return null; }
      }
      function dropOneSpareChecked(){
        if (gateOff()){
          note({ at: Date.now(), act: 'rollbackModeUsed', why: 'v292Dfix575Off=1 による明示的な緊急ロールバック', kept: keep });
          return dropOneSpare();
        }
        var g = gateway();
        if (!g){
          /* ★旧経路へ戻らない。中央保護が居ないなら消さない。 */
          note({ at: Date.now(), act: 'dropSpareGated', key: null, code: 'policy-unavailable',
                 why: 'fix569のexact-deleteゲートが見つからない。旧削除経路へは戻らず取り込みを中止', kept: keep });
          return false;
        }
        var cur = listBk();
        for (var i = 0; i < cur.length; i++){
          var k = cur[i];
          if (k === keep) continue;                       /* 保護対象は呼び出し元でも触らない */
          var v = null; try { v = localStorage.getItem(k); } catch(e){}
          if (v == null) continue;                        /* 既に無い候補は数に入れない */
          var res = g.tryDeleteExact({ key: k, expectedBytes: v.length, intent: 'reclaim',
                                       path: 'fix399', reason: 'cloudsync-pre-pull-quota' });
          note({ at: Date.now(), act: 'dropSpareGated', key: k, code: (res && res.code) || 'none', kept: keep });
          if (res && res.ok && res.deleted){
            /* ★ゲートの判定を鵜呑みにせず、呼び出し元でも消えたことを確認する(GPT指定) */
            var back = null; try { back = localStorage.getItem(k); } catch(e){}
            if (back == null) return true;
            note({ at: Date.now(), act: 'dropSpareUnverified', key: k, kept: keep });
          }
          /* protected / stale / missing / policy-unavailable / delete-failed は
             **次の候補へ進まない**。候補選択と保護判定が食い違っている合図なので、
             取り込みを中止する方（fail-closed）が安全。クラウドのデータは残っている。 */
          return false;
        }
        return false;   /* 消せる余剰が無い = 保護対象しか残っていない */
      }

      var r = writeAndVerify();
      if (r === 'quota'){
        /* ★fix575: 以前はここが `while` で、容量が足りない限り控えを**次々に**消し続けられた。
           GPT裁定の不変条件「1回の容量回復につき、削除は最大1論理単位／書込み再試行も最大1回」。 */
        if (!dropOneSpareChecked()){
          note({ at: Date.now(), act: 'abortPull', why: '容量不足。安全に消せる余剰が無いため取り込みを中止(no-safe-space)', kept: keep });
          return false;
        }
        r = writeAndVerify();
      }
      if (r !== 'ok'){
        note({ at: Date.now(), act: 'abortPull',
               why: (r === 'quota' ? '容量不足。1件回復して再試行しても書けなかった' : '新しい控えの読み戻し検証に失敗'),
               kept: keep });
        return false;
      }

      /* ⑤ 新しい控えが完成して初めて、旧控えを「削除してよい」側へ降格する。
         ★降格 = 即削除ではない。fix495(C1)で決めた **2世代**の約束は守る
         (1世代しか持たないと、新しい控え自体が壊れていたときに戻れない)。
         ここで初めて、保護を解いた状態で古い順に2件まで落とす。 */
      var fin = listBk();
      while (fin.length > 2){
        var oldest = fin.shift();
        try { localStorage.removeItem(oldest); note({ at: Date.now(), act: 'demoteOld', key: oldest, newKey: newKey }); } catch(e){}
      }
      return true;
    } catch(e){ return false; }
  }
  function applySave(pkg){
    if (!pkg || pkg.schema !== SCHEMA) return Promise.reject(new Error('セーブ形式が不明です'));
    if (!backupBeforeApply(pkg)) return Promise.reject(new Error('安全バックアップを作成できないため取り込みを中止しました(端末の保存容量不足)'));   // fix495(C1): fail-closed(GPT裁定)
    var expectedIdb = Object.keys(pkg.idb || {});   // fix399i: 検証用に期待キーを控える
    /* ★fix587(T2 pull barrier): 墓標が立っているスロットのキーは**書き戻さない**。
       ここを通さないと「削除したのに、クラウドの古い本体が次のpullで戻ってくる」が残る。
       正規サービスが居なければ従来どおり全部書き戻す（fail-open。取り込み自体は止めない）。 */
    var incoming = pkg.ls || {};
    try {
      var svc = window.__chronicleStoryLifecycle;
      if (svc && typeof svc.filterIncoming === 'function'){
        var f = svc.filterIncoming(incoming);
        if (f && f.ls){
          incoming = f.ls;
          if (f.blocked && f.blocked.length){
            try { console.warn('[v292Dfix399] 墓標により ' + f.blocked.length + ' キーを書き戻しませんでした'); } catch(e){}
          }
        }
      }
    } catch(e){}
    /* ★★fix591: `chr6_slots_meta` を**丸ごと上書きしてはいけない**。
       2026-07-27 の実機で実際に起きた事故:
         使い捨て物語#2 の墓標を立てた → クラウドへの push が fork で失敗した →
         その後の取り込みで**クラウド側の（墓標が無い）meta がローカルへ書き戻され**、
         墓標が消えて **削除した物語が live として一覧に戻った**。
       （#1 は墓標の push に成功していたのでクラウドにも墓標があり、無事だった）
       T2 の barrier は「墓標が立ったスロットの**キー**を書き戻さない」ものなので、
       meta そのものは global キーとして素通りしていた。
       → fix579 の mergeMeta（対称・墓標優先・restoreOfDeleteOpId 一致時だけ解除）を通す。
         GPT指定の「条件A: サーバまたは同期層が tombstone をマージする」に当たる。
       ★mergeMeta が無い/失敗したときは**ローカルのmetaを残す**（＝墓標を消さない側へ倒す）。 */
    try {
      if (Object.prototype.hasOwnProperty.call(incoming, 'chr6_slots_meta')){
        var T = window.__v292Dfix579;
        var localMeta = null, remoteMeta = null;
        try { localMeta = JSON.parse(localStorage.getItem('chr6_slots_meta') || '[]'); } catch(e){ localMeta = null; }
        try { remoteMeta = JSON.parse(incoming['chr6_slots_meta'] || '[]'); } catch(e){ remoteMeta = null; }
        if (T && typeof T.mergeMeta === 'function' && Array.isArray(localMeta) && Array.isArray(remoteMeta)){
          var merged = T.mergeMeta(localMeta, remoteMeta);
          if (Array.isArray(merged)) incoming['chr6_slots_meta'] = JSON.stringify(merged);
          else delete incoming['chr6_slots_meta'];
        } else if (Array.isArray(localMeta) && localMeta.some(function(e){ return e && e.deleted === true; })){
          /* マージできないのに、ローカルに墓標がある → **上書きしない**（削除を復活させない） */
          delete incoming['chr6_slots_meta'];
          try { console.warn('[v292Dfix399] mergeMetaが使えないため、墓標のあるmetaを上書きしませんでした'); } catch(e){}
        }
      }
    } catch(e){}
    try { Object.keys(incoming).forEach(function(k){ localStorage.setItem(k, incoming[k]); }); } catch(e){ return Promise.reject(e); }
    return idbWriteAll(pkg.idb || {}).then(function(writeResult){
      try { window.__v292Dfix399_lastApply = { expected: expectedIdb, writeResult: writeResult, ts: Date.now() }; } catch(e){}
      try { if (pkg.activeSlot) localStorage.setItem('chr6_active_slot', JSON.stringify(pkg.activeSlot)); } catch(e){}
      // 取り込んだ版を基準にする(ループ防止)。imgHashは全書き込み完了後の実在庫で計算(不足0前提)。
      var ts = +pkg.updatedAt || Date.now();
      setNum('v292Dfix399_baseTs', ts); setNum('v292Dfix399_localTs', ts);
      return idbReadKeys().then(function(keys){
        try { localStorage.setItem('v292Dfix399_imgHash', hash(keys.slice().sort().join('|'))); } catch(e){}
        // ★fix399j: reload前のsweepは旧cfgで誤上書き(画風崩れの原因)なので廃止。取り込み後はcallerがreload→fix197が正cfgで再描画。
        //   不足キーは起動時selfHeal(idempotent replay)がクラウドから補充する。
        return true;
      });
    });
  }

  function toast(msg, isErr){ try { if (window.UI && UI.setStatus) UI.setStatus(msg); } catch(e){} try { console.log(TAG, msg); } catch(e){} if (isErr){ try { alert(msg); } catch(e){} } }

  // ---- 起動プル(自動) ----
  var bootPullDone = false;
  function bootPull(){
    if (off() || autoOff() || bootPullDone || !isLoggedIn()) return;
    bootPullDone = true;
    getMeta().then(function(meta){
      var serverTs = meta ? (+meta.updatedAt || 0) : 0;
      if (!serverTs) return;                       // クラウド空
      if (serverTs <= baseTs()) return;            // 既に持っている
      // ★おしん選択: 取り込みは必ず確認(黙って上書きしない)。クラウドが新しい時だけ聞く。
      var dev = (meta && meta.device) ? ('（' + String(meta.device).slice(0, 20) + '）') : '';
      if (confirm('☁️ クラウド' + dev + 'に新しいセーブがあります。\nこの端末に取り込みますか？\n\n「OK」= 取り込む（今のこの端末の内容は上書き・自動バックアップあり）\n「キャンセル」= この端末を保持')){
        pullData().then(function(pkg){ if (!pkg) return; return applySave(pkg).then(function(){ toast('☁️ 取り込みました。再読み込みします…'); setTimeout(function(){ location.reload(); }, 900); }); }).catch(function(e){ toast('取り込み失敗: '+(e&&e.message), true); });
      } else {
        setNum('v292Dfix399_baseTs', serverTs);   // この端末優先 → 次のpushでクラウドへ反映
        toast('この端末を保持します。');
      }
    });
  }

  // ---- S.save に相乗り(自動push・デバウンス) ----
  var pushTimer = null;
  function scheduleAutoPush(){
    if (off() || autoOff() || !isLoggedIn()) return;
    setNum('v292Dfix399_localTs', Date.now());     // ローカル変更あり
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function(){
      push(false).then(function(r){ try { console.log(TAG,'auto-pushed', r); } catch(e){} })
        .catch(function(e){ if (e && e.conflict){ toast('⚠️ 別端末で更新あり。自動アップを保留しました（設定から手動同期）。'); } else { console.warn(TAG,'auto-push',e); } });
    }, DEBOUNCE_MS);
  }
  function wrapSave(){
    try {
      /* ★fix549(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
         この関数は S.save をラップする(=実行順に依存する)ので、**取得経路だけ**を差し替え、
         ラップの仕組み・順序・冪等フラグ(__f399wrapped)には一切触れていない。
         第二経路は従来の式をそのまま残す(index.htmlが古いキャッシュでも挙動不変)。 */
      var S = (function(){
        try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix399') : null; if (a) return a; } catch(e){}
        try { return window.S || (0,eval)('S'); } catch(e){ return null; }
      })();
      if (!S || typeof S.save !== 'function' || S.__f399wrapped) return !!(S && S.__f399wrapped);
      var os = S.save.bind(S);
      S.save = function(){ var r = os.apply(this, arguments); try { scheduleAutoPush(); } catch(e){} return r; };
      S.__f399wrapped = true;
      try { console.log(TAG, 'S.save wrapped (auto-push on)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  (function wpoll(){ wpoll._n=(wpoll._n||0)+1; if (wrapSave()) return; if (wpoll._n>120) return; setTimeout(wpoll, 500); })();

  // ---- 手動同期ボタンの共通生成(置き場所=📁セーブ管理パネル) ----
  function mkSyncBtn(txt, fn){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='margin-right:6px;margin-bottom:4px;padding:6px 12px;font-size:13px;border-radius:6px;border:1px solid #4a7;background:#274;color:#dfe;cursor:pointer;'; b.onclick=function(){ fn(b); }; return b; }
  function onUp(b){ b.disabled=true; toast('アップロード中…'); push(true).then(function(){ toast('☁️ 保存しました'); }).catch(function(e){ if(e&&e.emptyGuard){ toast('この端末は空なのでアップしません（クラウドの本物を守ります）。', true); } else { toast('失敗: '+(e&&e.message), true); } }).then(function(){ b.disabled=false; }); }
  function onDown(b){ if(!confirm('クラウドのセーブを取り込みます。今の端末は上書きされます（自動バックアップあり）。よろしいですか？')) return; b.disabled=true; toast('取り込み中…'); pullData().then(function(pkg){ if(!pkg) throw new Error('クラウドにセーブがありません'); return applySave(pkg); }).then(function(){ toast('⬇️ 取り込みました。再読み込みします…'); setTimeout(function(){ location.reload(); }, 800); }).catch(function(e){ toast('失敗: '+(e&&e.message), true); b.disabled=false; }); }
  // 旧: キャラ欄に置いていた同期ボタンを撤去(セーブ管理パネルへ移動したため)
  function cleanupOldWrap(){ try { var old = document.querySelector('.v292Dfix399-wrap'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch(e){} }
  setInterval(cleanupOldWrap, 2000);

  // ---- 同期先(ログイン方式)の判定: Google優先(Workerと同じ) ----
  function syncIdentity(){
    try {
      var api = window.__v292Dfix328api;
      if (api && api.valid && api.valid()){ return { kind: 'google', label: 'Googleアカウント（' + (api.email() || '') + '）' }; }
      var pass = (localStorage.getItem('v292ProxyPass') || '').trim();
      if (pass){ return { kind: 'pass', label: '合言葉' }; }
      return { kind: 'none', label: '未ログイン' };
    } catch(e){ return { kind: 'none', label: '未ログイン' }; }
  }

  // ---- 📁セーブ管理パネルに自動同期の説明を出す(おしん要望: セーブのところに簡単な説明) ----
  function injectSaveHelp(){
    if (off()) return;
    try {
      var closeX = document.getElementById('v30-close-x');
      if (!closeX) return;                             // セーブ管理パネルが開いていない
      var h2 = closeX.closest ? closeX.closest('h2') : (closeX.parentNode && closeX.parentNode.tagName === 'H2' ? closeX.parentNode : null);
      if (!h2 || !h2.parentNode) return;
      if (h2.parentNode.querySelector('.v292Dfix399-savehelp')) return; // 冪等
      var box = document.createElement('div');
      box.className = 'v292Dfix399-savehelp';
      box.style.cssText = 'margin:8px 0; padding:10px; border:1px solid #3a5a5a; border-radius:8px; background:rgba(60,120,120,.10); font-size:12px; line-height:1.6; color:#bde;';
      box.innerHTML = '☁️ <b>端末間で自動同期しています</b><br>'
        + '同じログイン（合言葉 または 同じGoogleアカウント）にすれば、<b>開いた時に最新を自動で取り込み</b>／<b>遊ぶと自動でクラウド保存</b>されます（PC⇔iPhone）。ふだんはボタン操作は不要です。<br>'
        + '下のボタンで「今すぐ」手動同期もできます。'
        + (isLoggedIn() ? '' : '<br>※ 同期にはログイン（合言葉／Google）が必要です。');
      h2.insertAdjacentElement('afterend', box);
      // 手動ボタンも同じセーブ管理パネルに置く(おしん要望: キャラ欄→セーブのところへ移動)
      var btnRow = document.createElement('div');
      btnRow.className = 'v292Dfix399-savebtns';
      btnRow.style.cssText = 'margin:4px 0 8px;';
      btnRow.appendChild(mkSyncBtn('☁️ いま上げる', onUp));
      btnRow.appendChild(mkSyncBtn('⬇️ いま取り込む', onDown));
      box.insertAdjacentElement('afterend', btnRow);
      // ★同期先の表示 + Googleログイン導線(iPhone共有の要): PC↔iPhoneは同じGoogleに揃えるのが確実
      var idn = syncIdentity();
      var idBox = document.createElement('div');
      idBox.className = 'v292Dfix399-idbox';
      idBox.style.cssText = 'margin:2px 0 6px; font-size:12px; color:#9cc;';
      idBox.innerHTML = '同期先: <b>' + idn.label + '</b>' + (idn.kind === 'google' ? ' ✓（この端末とPCが同じGoogleなら共有OK）' : '');
      btnRow.insertAdjacentElement('afterend', idBox);
      if (idn.kind !== 'google'){
        var api = window.__v292Dfix328api;
        if (api && api.enabled && api.enabled()){
          var gBtn = document.createElement('button');
          gBtn.className = 'v292Dfix399-glogin';
          gBtn.textContent = '🔑 Googleでログイン（PCと同じアカウントで共有）';
          gBtn.style.cssText = 'display:block; width:100%; box-sizing:border-box; margin:2px 0 8px; padding:9px 12px; font-size:13px; border-radius:6px; border:1px solid #4a7ad0; background:#2a4a8a; color:#fff; cursor:pointer;';
          gBtn.onclick = function(){ try { api.login(); } catch(e){} };
          idBox.insertAdjacentElement('afterend', gBtn);
        }
      }
    } catch(e){}
  }
  setInterval(injectSaveHelp, 800);

  // ★fix399f: 起動時に登録簿を修復(データ消失の芯を根治) + 事故時の安全OFFを一度だけ解除(安全ガード実装済みのため自動を復活)
  function healAndMigrate(){
    try { healSlotMeta(); } catch(e){}
    try {
      if (localStorage.getItem('v292Dfix399f_migrated') !== '1'){
        localStorage.removeItem('v292Dfix399Off');
        localStorage.removeItem('v292Dfix399AutoOff');
        localStorage.setItem('v292Dfix399f_migrated', '1');
        try { console.log(TAG, 'fix399f: 安全ガード実装済み → 自動同期を復活'); } catch(_){}
      }
    } catch(e){}
  }
  setTimeout(healAndMigrate, 700); setTimeout(healAndMigrate, 2200);
  // ★永続化を要求(退避対策・研究推奨)。iOS Safariでは許可されないこともあるが無害。
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function(g){ try { console.log(TAG, 'storage.persist granted=' + g); } catch(_){} }); } catch(e){}

  // Workerバージョン検出(v11未満なら常にfull送信) + 起動プル(ログイン確定を少し待つ)
  detectWorkerVer();
  setTimeout(bootPull, 3000); setTimeout(bootPull, 6500);
  // ★fix399j: 起動時とforeground復帰時に、ローカルIDBが期待集合に足りているか点検し不足だけ静かに補充。
  setTimeout(selfHeal, 4500); setTimeout(selfHeal, 9500);
  try { document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') selfHeal(); }); } catch(e){}

  // ★fix399i: 取り込み後に「アイコンが全枚数そろったか」を実機コンソールで確認する検証口。
  //   使い方: __v292Dfix399x.verify().then(r=>console.log(r))  → allPresent:true / missing:[] を確認。
  function verify(){
    var la = null; try { la = window.__v292Dfix399_lastApply; } catch(e){}
    var exp = (la && la.expected) || null;
    return idbReadKeys().then(function(keys){
      var set = {}; keys.forEach(function(k){ set[k] = 1; });
      var missing = exp ? exp.filter(function(k){ return !set[k]; }) : [];
      var r = {
        idbCount: keys.length,
        keys: keys,
        expected: exp ? exp.length : null,
        missing: missing,
        allPresent: exp ? (missing.length === 0) : null,
        lastWriteResult: (la && la.writeResult),
        lastApplyTs: (la && la.ts) || null
      };
      try { console.log(TAG, 'verify', 'idbCount=' + r.idbCount, 'expected=' + r.expected, 'allPresent=' + r.allPresent, 'missing=' + JSON.stringify(r.missing)); } catch(e){}
      return r;
    });
  }
  // ★fix399j: 自己修復(idempotent replay)。ローカルIDBが期待集合(v292Dfix399_imgKeys)に足りない時だけ、
  //   クラウドから不足キーのみ1短txで補充→fix197.sweepで表示反映。iOSがtxをabort/1枚落とした時の受け皿。
  var lastHealTs = 0;
  function expectedImgKeys(){ try { return JSON.parse(localStorage.getItem('v292Dfix399_imgKeys') || '[]') || []; } catch(e){ return []; } }
  function selfHeal(){
    try {
      // ★fix399k(2026-07-07): fix399jのselfHeal自動pull(読込時にクラウド全体をfetch&parse)がiPhoneでフリーズを誘発。
      //   iOSのIDB地雷が未解決のため、確実な代替(Cache API)へ移すまで既定OFF。opt-in=v292Dfix399SelfHealOn=1。
      if (localStorage.getItem('v292Dfix399SelfHealOn') !== '1') return;
      if (off() || !isLoggedIn()) return;
      var now = Date.now(); if (now - lastHealTs < 30000) return; lastHealTs = now;
      var expected = expectedImgKeys(); if (!expected.length) return;
      idbReadKeys().then(function(keys){
        var set = {}; keys.forEach(function(k){ set[k] = 1; });
        var missing = expected.filter(function(k){ return !set[k]; });
        if (!missing.length) return;
        try { console.log(TAG, 'selfHeal: missing', missing, '-> pull&refill'); } catch(e){}
        pullData().then(function(pkg){
          if (!pkg || !pkg.idb) return;
          var map = {}; missing.forEach(function(k){ if (pkg.idb[k] != null) map[k] = pkg.idb[k]; });
          var mk = Object.keys(map); if (!mk.length) return;
          return idbPutAllOneTx(map, mk).then(function(){
            try { var f = window.__v292Dfix197 || window.__v292Dfix199; if (f && typeof f.sweep === 'function') { f.sweep(); setTimeout(function(){ try { f.sweep(); } catch(_){} }, 1000); } } catch(e){}
            try { console.log(TAG, 'selfHeal: refilled', mk); } catch(e){}
          });
        }).catch(function(e){ try { console.warn(TAG, 'selfHeal', e && e.message); } catch(_){} });
      });
    } catch(e){}
  }
  window.__v292Dfix399x = {
    collectLight: collectLight, push: push, pull: pullData, applySave: applySave, bootPull: function(){ bootPullDone=false; bootPull(); },
    /* ★fix544(2026-07-25・GPT指定): 世代trimを単体で検証できるようにする。
       実データで chr6_bk_cloudsync_* が11世代溜まっていたので原因を調べた結果、
       **全部 fix495(C1・2世代trim) が入った 2026-07-19 より前**に作られたもので、
       それ以降に pull が一度も走っていないため trim が実行されていなかっただけだった
       (= trim の不具合ではない)。それでも「コードが本当に2世代へ落とすか」を
       回帰テストで固定しておくために検証口を出す。副作用は従来どおり(呼べば控えを1件書く)。 */
    backupBeforeApply: backupBeforeApply,
    bkLog: bkLog,   /* fix575: 削除・中止の理由（容量満杯でも消えないメモリ側を含む） */
    verify: verify, selfHeal: selfHeal,
    /* ★fix596: 照合を手で叩ける口（実機での確認用） */
    reconcileNow: reconcileNow,
    reconcileState: function(){
      var led = ledger();
      return { last: reconcileLast,
               ledger: (led && typeof led.reconcileState === 'function') ? led.reconcileState() : null,
               pending: (led && typeof led.pendingCommit === 'function') ? led.pendingCommit() : null };
    },
    currentLocalPackageHash: currentLocalPackageHash,
    workerSupportsCommitState: workerSupportsCommitState,
    /* ★fix597 */
    ensureStableNs: ensureStableNs,
    divergedAfterCommit: divergedAfterCommit,
    clearDivergedState: clearDivergedState,
    syncState: function(){
      var c = null; try { c = window.__v292Dfix580; } catch(e){}
      return { /* ★fix582: baseTs は競合制御から外れ、診断値へ降格した */
               baseTs_diagnosticOnly: baseTs(), localTs: localTs(), imgHash: imgHashStored(),
               rev: (c && typeof c.rev === 'function') ? c.rev() : null,
               casEnabled: !!(c && typeof c.rev === 'function') && !fix582Off() };
    },
    status: function(){ return { off: off(), autoOff: autoOff(), loggedIn: isLoggedIn(), proxy: proxyUrl(), activeSlot: activeSlot() }; }
  };
  try { console.log(TAG, 'loaded', off()?'OFF':(autoOff()?'manual-only':'AUTO'), '(login='+isLoggedIn()+')'); } catch(e){}
  /* ★★fix596: 照合の契機を仕掛ける。
     ★どちらも「pending が残っているときだけ」動く。無ければ1バイトも通信しない。 */
  try { if (!off()) { reconcileOnBoot(); armVisibilityReconcile(); } } catch(e){}
})();
