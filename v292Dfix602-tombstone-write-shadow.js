/* v292Dfix602-tombstone-write-shadow.js (2026-07-27)
 * 墓標(tombstone)が立ったスロットのキーへの setItem を「影監視」する。拒否しない・記録するだけ。
 *
 * ■なぜ必要か（実機で起きたこと）
 *   物語を削除すると `chr6_slots_meta` に `deleted===true` の墓標が立つ。ところが実機で
 *   **墓標が立った後に本体 `chr6_slot_<id>` へ2ターン書き足されていた**
 *   （12785B/4ターン → 18132B/6ターン）。取り込み経路の穴を1つ塞いだが、
 *   **他にも書き込み経路が残っている可能性が高い**。
 *   GPT裁定:「墓標 slot への setItem を影監視すると強い。発生しても即座に止めず、
 *            **経路・key・slotId を記録**せよ」。
 *   → 止めるのは経路が判ってから。いま止めると「拒否が呼び出し元へ伝わらない事故」を新しく作る
 *     （fix569 §で実証済み。setItem は成功も失敗も undefined を返す）。
 *
 * ■このfixが絶対にやらないこと
 *   書き込みの拒否・遅延・改変 / 戻り値の変更 / 例外の握り潰し /
 *   **localStorage への書き込み（ログも書かない）**。
 *   記録はメモリを正本にする。容量満杯で困っている時こそ理由が要るのに、
 *   localStorage へ書くと真っ先にその理由が消えるため。
 *
 * ■二段階初期化（★このプロジェクトで何度も事故になっている所）
 *   setItem のラッパは既に **fix490 / fix543 / fix346 / fix246 / fix402 の5枚**ある。
 *   単純に読込順で被せると、後から読み込まれるfixが**先に捕捉した参照を直接呼ぶ**ので監視を迂回される。
 *   ①Phase1: native を早期に closure へ捕捉（読み取り・後始末はこれで行い、他fixを起こさない）
 *   ②Phase2: **全ラッパの読込後（解析完了後）**に最外殻へ設置する（fix569 の arm()/armWhenParsed() と同形）。
 *   ★fix569 は `<head>` 先頭＝最初の実行スクリプトでなければならない。**そこより前には絶対に置かない**。
 *
 * ■「全件0」を信じないための設計
 *   ・**分類ごと**に生存証明(canary)を持つ。総数>0 では分類器の欠陥を捕まえられない
 *     （2026-07-26 fix569 で実際に踏んだ: 総数は増えていたのに7経路が1件も数えられていなかった）。
 *   ・★スタック照合は**自分自身のフレームを必ず除く**。除かないと全件が自分由来に見える（同上のバグ）。
 *   ・★分類器(fix562)が居ない時に全件を1つのラベルへ倒さない。
 *     `classifierUnavailable`（判定できなかった）と `unknownTombstoneWrites`（経路が判らなかった）を別に数える。
 *
 * ■slotId の判定（★部分一致禁止）
 *   `window.__v292Dfix562.classifyKey(k).slotId` を唯一の正とする。
 *   ただし fix562 は⑧サイドストアの判定で `k.indexOf(liveSlot) >= 0` の**部分一致**を使うので、
 *   墓標 `sm1` が生きている `sm12` のキーを巻き込みうる。ここで**トークン境界**を必ず確認する:
 *   IDの前後が英数字でないこと。これで `..._"sm12"` が `sm1` に化けない。
 *   引用符付きID（`chr6_v292Dfix54_genderMap_"smrg85jwsn6"`）は境界が `"` なので正しく通る。
 *   分類器が無ければ「判定不能」として `classifierUnavailable` を数え、**書き込みは当然通す**。
 *
 * ■重い処理を挟まない
 *   fix543 の健康プローブが1ページ読込で20回以上 setItem を呼ぶ実測がある。
 *   墓標一覧は短いTTL(2秒)でキャッシュし、**墓標IDを含まないキーでは分類器を呼ばない**。
 *
 * OFF   = localStorage['v292Dfix602ShadowOff'] = '1'
 * 読出  = window.__v292Dfix602.stats() / .recent() / .selfTest() / .isOff()
 */
(function v292Dfix602(){
  if (window.__v292Dfix602) return;
  var TAG = '[v292Dfix602]';
  var VERSION = 'fix602.1';
  var OFF_KEY = 'v292Dfix602ShadowOff';
  var META_KEY = 'chr6_slots_meta';

  /* ================= Phase 1: native の捕捉 ===================================== */
  /* 読み取りと後始末は native で行う。他fixのラッパを起こすと、観測が観測を呼ぶ再入になる。 */
  /* ★捕捉するのは読み取り系だけ。削除の参照は**捕捉しない**。
     読込時に removeItem を変数へ取ると、fix569(削除の影監視)から見て
     「監視を構造的に迂回する書き方」になり、scan_delete_api.cjs の bypass 判定にも当たる。
     canary の後始末は**呼び出し時に解決される** localStorage.removeItem で行い、
     fix569 に見せる（後始末を隠さない）。 */
  var nativeSet = null, nativeGet = null, nativeKey = null;
  try {
    /* nativeSet は「捕捉できたことの証明」と非常時の読み替え用。**このfixは1バイトも書かない**ので使わない。 */
    nativeSet = localStorage.setItem;
    nativeGet = localStorage.getItem;
    nativeKey = localStorage.key;
  } catch(e){}
  function rawGet(k){
    try { return nativeGet ? nativeGet.call(localStorage, k) : localStorage.getItem(k); }
    catch(e){ return null; }
  }
  function rawRemove(k){
    try { localStorage.removeItem(k); } catch(e){}
  }
  function now(){ try { return Date.now(); } catch(e){ return 0; } }
  function isArr(a){ return Object.prototype.toString.call(a) === '[object Array]'; }
  function nkeys(o){ var n = 0; for (var k in o){ if (Object.prototype.hasOwnProperty.call(o, k)) n++; } return n; }

  /* ================= 計測値（すべてメモリ・localStorage へは1バイトも書かない） ==== */
  var S = {
    installed:false, installCount:0, isOutermost:null, capturedNative:!!nativeSet,
    installedAtReadyState:null,
    /* 分母 */
    setItemsSeen:0,
    /* ★本命: 墓標スロットのキーへの書き込み */
    observed:0,
    /* ★観測できたが「どこから来たか」が判らなかったもの（= byPath.unknownPath と一致する） */
    unknownTombstoneWrites:0,
    /* ★判定そのものができなかったもの。observed には含めない（0へ倒さない・1ラベルへ倒さない） */
    classifierUnavailable:0,
    metaUnavailable:0,
    /* ★このモジュールは何も止めないので常に0。将来 block する側が現れた時のための口。 */
    blocked:0,
    tombstoneWriteObservedByPath:{
      fix399:0, fix402:0, home:0, fix587:0, features:0, index:0, fix602probe:0, unknownPath:0
    },
    tombstoneWriteBlockedByPath:{},
    /* 内訳・健康状態 */
    byFamily:{}, bytesObserved:0,
    candidateNotTombstone:0, candidateUnresolved:0, prefilterPassed:0,
    slotIdFromClassifier:0, slotIdFromBoundary:0, boundaryRejectedClassifier:0,
    tombstonesKnown:0, metaReads:0, metaCacheHits:0, metaParseErrors:0,
    classifierErrors:0, wrapperErrors:0, reentrantSkips:0, skippedWhileOff:0,
    probeWrites:0
  };
  var RING = [], RING_MAX = 20;
  function push(ev){ try { RING.push(ev); if (RING.length > RING_MAX) RING.shift(); } catch(e){} }

  /* ================= 墓標一覧（短いTTLでキャッシュ） ============================= */
  /* 形は fix579 の墓標スキーマ: chr6_slots_meta の配列要素 {id, deleted:true, deletedAt, ...} */
  var extraTombstones = Object.create(null);   /* selfTest / テスト用の差し込み口（LSは触らない） */
  var probeSlots = Object.create(null);        /* canary のスロットID。経路を probe として分離する */
  var TS_TTL = 2000;
  var tsCache = null, tsAt = 0, tsGen = 0, offCached = false;

  function readTombstones(){
    var raw = rawGet(META_KEY);
    if (raw == null) return {};                       /* meta が無い＝墓標0件。判定はできている */
    var a;
    try { a = JSON.parse(raw); } catch(e){ S.metaParseErrors++; return null; }
    if (a && !isArr(a)) a = a.slots || a.list || a.entries || null;
    if (!isArr(a)){ S.metaParseErrors++; return null; }
    var m = {};
    for (var i = 0; i < a.length; i++){
      var e = a[i];
      if (e && typeof e === 'object' && e.deleted === true && e.id != null) m[String(e.id)] = e;
    }
    return m;
  }
  function tombstones(force){
    var t = now();
    if (!force && tsCache !== null && (t - tsAt) < TS_TTL){ S.metaCacheHits++; return tsCache; }
    tsAt = t; tsGen++; S.metaReads++;
    offCached = (rawGet(OFF_KEY) === '1');
    var m = null;
    try { m = readTombstones(); } catch(e){ S.metaParseErrors++; m = null; }
    if (m){
      for (var k in extraTombstones){
        if (Object.prototype.hasOwnProperty.call(extraTombstones, k)) m[k] = extraTombstones[k];
      }
    }
    tsCache = m;
    S.tombstonesKnown = m ? nkeys(m) : 0;
    return m;
  }
  function invalidate(){ tsCache = null; tsAt = 0; memo = Object.create(null); memoGen = -1; }

  /* ================= slotId の解決（★部分一致禁止） ============================= */
  /* IDがキーの中で「トークン」として現れているか。前後が英数字なら別IDの一部とみなす。
     例) key='chr6_v292Dfix54_genderMap_"sm12"' に対して id='sm1' は false（後ろが '2'）。 */
  var ALNUM = /[A-Za-z0-9]/;
  function tokenBounded(key, id){
    if (!id) return false;
    var i = key.indexOf(id);
    while (i >= 0){
      var before = i === 0 ? '' : key.charAt(i - 1);
      var after  = key.charAt(i + id.length);          /* 末尾なら '' */
      if (!ALNUM.test(before) && !ALNUM.test(after)) return true;
      i = key.indexOf(id, i + 1);
    }
    return false;
  }

  var memo = Object.create(null), memoGen = -1, MEMO_MAX = 200;
  function classifier(){
    try {
      var f = window.__v292Dfix562;
      if (f && typeof f.classifyKey === 'function') return f;
    } catch(e){}
    return null;
  }
  /* 返り値: {unavailable:bool, slotId:string|null, source:'classifier'|'boundary'|null, family:string|null} */
  function resolveSlot(key, ts){
    if (memoGen === tsGen && Object.prototype.hasOwnProperty.call(memo, key)) return memo[key];
    var out = { unavailable:true, slotId:null, source:null, family:null };
    var f = classifier();
    if (!f){ out.why = 'fix562(分類器)が未ロード'; return remember(key, out); }
    var c = null;
    try { c = f.classifyKey(key); }
    catch(e){ S.classifierErrors++; out.why = 'classifyKey が例外'; return remember(key, out); }
    if (!c){ out.why = 'classifyKey が空を返した'; return remember(key, out); }
    out.unavailable = false;
    out.family = c.family || null;
    var sid = (c.slotId == null) ? null : String(c.slotId);
    var best = null, bestLen = -1;

    if (sid){
      /* 生セーブ本体・台帳はキーそのものから確定するので、そのまま信じてよい
         （chr6 → 'default'、chr6_slot_<id> → <id>。部分一致の余地が無い） */
      if (c.family === 'live-story'){ best = sid; bestLen = sid.length; S.slotIdFromClassifier++; }
      else if (tokenBounded(key, sid)){ best = sid; bestLen = sid.length; S.slotIdFromClassifier++; }
      else { S.boundaryRejectedClassifier++; }        /* ★部分一致で拾われた候補は採らない */
    }
    /* 墓標側からもトークン一致を探し、より長い（＝より具体的な）IDを優先する。
       生セーブ本体は上で確定済みなので触らない。 */
    if (c.family !== 'live-story' && c.family !== 'live-index'){
      for (var id in ts){
        if (!Object.prototype.hasOwnProperty.call(ts, id)) continue;
        if (id.length > bestLen && tokenBounded(key, id)){
          if (best !== id) S.slotIdFromBoundary++;
          best = id; bestLen = id.length;
        }
      }
    }
    out.slotId = best;
    out.source = best ? (best === sid ? 'classifier' : 'boundary') : null;
    return remember(key, out);
  }
  function remember(key, out){
    try {
      if (memoGen !== tsGen){ memo = Object.create(null); memoGen = tsGen; }
      if (nkeys(memo) < MEMO_MAX) memo[key] = out;
    } catch(e){}
    return out;
  }

  /* ================= 呼び出し元の識別（スタック → 経路） ========================= */
  /* ★fix569 の PATHS に倣う。少なくともこの6経路 + unknownPath を区別する。 */
  var PATHS = [
    { id:'fix399',   re:/v292Dfix399-cloudsync/ },
    { id:'fix402',   re:/v292Dfix402-invisible-sync/ },
    { id:'fix587',   re:/v292Dfix587-story-lifecycle/ },
    { id:'features', re:/features\.js/ },
    { id:'home',     re:/home\.html/ },
    { id:'index',    re:/index\.html/ }
  ];
  var SELF_RE = /v292Dfix602/;
  /* ★★自分自身のフレームを必ず取り除く（2026-07-26 に fix569 で実際に踏んだバグ）。
     除かないと**全件が自分由来に見えて、経路が1つも数えられない**。
     stackOf() は必ずこのファイルの中で例外を作るので、先頭数行は常に自分のフレームである。 */
  function stackOf(){
    var s = '';
    try { throw new Error('s'); } catch(e){ s = String((e && e.stack) || ''); }
    if (!s) return '';
    var lines = s.split('\n'), out = [];
    for (var i = 0; i < lines.length; i++){
      if (SELF_RE.test(lines[i])) continue;
      out.push(lines[i]);
    }
    return out.join('\n');
  }
  /* スタックは**上から**見る。呼び出し元に近いフレームを優先するため、
     「パターン優先」ではなく「行の順序優先」で決める。 */
  function matchStack(stack){
    var lines = String(stack || '').split('\n');
    for (var i = 0; i < lines.length; i++){
      var ln = lines[i];
      if (!ln || SELF_RE.test(ln)) continue;
      for (var j = 0; j < PATHS.length; j++){
        if (PATHS[j].re.test(ln)) return { id: PATHS[j].id, frame: ln.replace(/^\s+/, '') };
      }
    }
    return { id:'unknownPath', frame:null };
  }
  function pathOf(key, slotId, stack){
    /* canary は経路ではなく**スロットID**で判定する。
       キー名の前置きで判定すると、生セーブ本体の形（chr6_slot_<id>）を作れず canary にならない。 */
    if (slotId && probeSlots[slotId]) return { id:'fix602probe', frame:null };
    return matchStack(stack);
  }

  /* ================= 観測本体（拒否しない・記録するだけ） ======================== */
  var inObserve = false;
  function observe(key, val){
    if (inObserve){ S.reentrantSkips++; return; }      /* 分類器の getItem が setItem を呼ぶ事故の保険 */
    inObserve = true;
    try {
      S.setItemsSeen++;
      var ts = tombstones(false);
      if (offCached){ S.skippedWhileOff++; return; }
      if (ts === null){
        /* 墓標一覧が読めない＝判定不能。**0件へ倒さない** */
        if (key.indexOf('chr6') === 0) S.metaUnavailable++;
        return;
      }
      var ids = [], id;
      for (id in ts){ if (Object.prototype.hasOwnProperty.call(ts, id)) ids.push(id); }
      if (!ids.length) return;                          /* 墓標が無ければ何も起こりえない */

      /* 事前ふるい（安いものだけ）: 墓標IDを一切含まないキーでは分類器を呼ばない。
         ★これは「候補を絞る」だけで、判定そのものではない。判定は必ずトークン境界で行う。 */
      var cand = false;
      for (var i = 0; i < ids.length; i++){ if (key.indexOf(ids[i]) >= 0){ cand = true; break; } }
      if (!cand && !(key === 'chr6' && ts['default'])) return;
      S.prefilterPassed++;

      var res = resolveSlot(key, ts);
      if (res.unavailable){ S.classifierUnavailable++; return; }   /* ★書き込みは当然通す */
      if (!res.slotId){ S.candidateUnresolved++; return; }
      if (!Object.prototype.hasOwnProperty.call(ts, res.slotId)){ S.candidateNotTombstone++; return; }

      /* ---- ここから先は「墓標が立ったスロットのキーへの書き込み」 ---- */
      var p = pathOf(key, res.slotId, stackOf());
      var bytes = 0;
      try { bytes = (val == null ? 0 : String(val).length); } catch(e){ bytes = -1; }

      S.observed++;
      S.tombstoneWriteObservedByPath[p.id] = (S.tombstoneWriteObservedByPath[p.id] || 0) + 1;
      if (p.id === 'unknownPath') S.unknownTombstoneWrites++;      /* ★1ラベルへ倒さない */
      if (p.id === 'fix602probe') S.probeWrites++;
      var fam = res.family || 'unknown';
      S.byFamily[fam] = (S.byFamily[fam] || 0) + 1;
      if (bytes > 0) S.bytesObserved += bytes;

      push({ at: now(), key: key, slotId: res.slotId, path: p.id, bytes: bytes,
             family: fam, source: res.source, frame: p.frame,
             deletedAt: (ts[res.slotId] && ts[res.slotId].deletedAt) || null });
      if (p.id !== 'fix602probe'){
        try { console.warn(TAG, '★墓標スロットへ書き込み:', key, 'slot=' + res.slotId,
                           '経路=' + p.id, bytes + 'B'); } catch(e){}
      }
    } catch(e){ S.wrapperErrors++; }
    finally { inObserve = false; }
  }

  /* 将来 block する側が現れた時のための口。**このモジュールからは呼ばない**（blocked は常に0）。 */
  function noteBlocked(pathId){
    var id = pathId || 'unknownPath';
    S.blocked++;
    S.tombstoneWriteBlockedByPath[id] = (S.tombstoneWriteBlockedByPath[id] || 0) + 1;
  }

  /* ================= Phase 2: 最外殻へ設置 ====================================== */
  var down = null, shadow = null;
  function install(){
    if (S.installed) return true;
    if (rawGet(OFF_KEY) === '1') return false;
    var prev;
    try { prev = localStorage.setItem; } catch(e){ return false; }
    if (typeof prev !== 'function') return false;
    down = prev;
    shadow = function(k, v){
      try { observe(String(k), v); } catch(e){ S.wrapperErrors++; }
      /* ★何があっても下流をそのまま呼ぶ。例外（QuotaExceededError など）も素通しする。 */
      return down.apply(localStorage, arguments);
    };
    try { localStorage.setItem = shadow; } catch(e){ return false; }
    S.installed = true; S.installCount++;
    try { S.isOutermost = (localStorage.setItem === shadow); } catch(e){ S.isOutermost = null; }
    try { S.installedAtReadyState = document.readyState; } catch(e){}
    try { console.log(TAG, 'armed (read-only, never blocks)'); } catch(e){}
    return true;
  }
  function arm(){ try { install(); } catch(e){ S.wrapperErrors++; } }
  /* ★fix573 の教訓（実機）: 保険の setTimeout が**全スクリプトの解析が終わる前に発火**すると、
     後から読み込まれる fix346/fix402/fix490 の下に入ってしまい isOutermost:false になる。
     保険は「解析中は待つ」ポーリングにする。最後の砦として60秒で諦めて入れる。 */
  var lateTries = 0;
  function armWhenParsed(){
    if (S.installed) return;
    var st = null; try { st = document.readyState; } catch(e){}
    if (st !== 'loading'){ arm(); return; }
    if (++lateTries > 120){ arm(); return; }
    try { setTimeout(armWhenParsed, 500); } catch(e){}
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once:true });
    else setTimeout(arm, 0);
    window.addEventListener('load', arm, { once:true });
    setTimeout(armWhenParsed, 3000);
  } catch(e){ try { setTimeout(arm, 0); } catch(e2){ arm(); } }

  /* ================= canary（生存証明） ========================================= */
  /* ★総数だけの canary は分類器の欠陥を捕まえられない。
     ①墓標の本体キー ②墓標の引用符付きサイドストア ③生きているスロット（数えない）
     ④紛らわしいID（sm1 の墓標で sm12 を巻き込まない） ⑤**経路ラベルごと**の生存証明
     を全部通してから ok を返す。 */
  function nonce(){
    var s = '', t = String(now());
    for (var i = 0; i < 6; i++) s += 'abcdefghijklmnopqrstuvwxyz'.charAt((i * 7 + 11) % 26);
    return s + t.slice(-6);
  }
  function selfTest(){
    var r = { ok:false, steps:[], installed:S.installed, isOutermost:null,
              classifierAvailable: !!classifier(), pathLabels:{}, pathLabelsOk:false };
    try { r.isOutermost = (localStorage.setItem === shadow); } catch(e){}
    if (!S.installed){ r.why = '未設置（install() がまだ走っていない）'; return r; }
    if (rawGet(OFF_KEY) === '1'){ r.why = 'OFFスイッチが入っている'; return r; }

    /* ---- ★分類ごとの生存証明: 経路ラベルが1つずつ実際に出せること ---- */
    var frames = {
      fix399:   '    at doPull (v292Dfix399-cloudsync.js:302:11)',
      fix402:   '    at sync (v292Dfix402-invisible-sync.js:357:9)',
      fix587:   '    at commit (v292Dfix587-story-lifecycle.js:120:5)',
      features: '    at save (features.js:5901:7)',
      home:     '    at onclick (https://x/home.html:44:3)',
      index:    '    at boot (https://x/index.html:2300:5)'
    };
    var allLabels = true;
    for (var pid in frames){
      if (!Object.prototype.hasOwnProperty.call(frames, pid)) continue;
      var got = matchStack('Error: s\n    at stackOf (v292Dfix602-tombstone-write-shadow.js:1:1)\n' + frames[pid]);
      r.pathLabels[pid] = got.id;
      if (got.id !== pid) allLabels = false;
    }
    var un = matchStack('Error: s\n    at stackOf (v292Dfix602-tombstone-write-shadow.js:1:1)\n    at anon (unknown-file.js:1:1)');
    r.pathLabels.unknownPath = un.id;
    if (un.id !== 'unknownPath') allLabels = false;
    /* ★自分自身のフレームしか無いスタックが、経路として数えられないこと */
    var selfOnly = matchStack('Error: s\n    at v292Dfix602-tombstone-write-shadow.js:1:1');
    r.pathLabels.selfFrameOnly = selfOnly.id;
    if (selfOnly.id !== 'unknownPath') allLabels = false;
    r.pathLabelsOk = allLabels;

    /* ---- 人工の既知1件（＋対照）を実際に setItem で通す ----
       ★canary のキーを **`chr6_slot_<id>` の形にしてはいけない**。
         本物の setItem を通す以上、下流の fix490(控え作成) / fix246(キー書換) /
         fix402・fix580(同期) が偽スロットに反応してしまう。
         fix569 が `chr6_gc_probe_*` を使っているのと同じ理由。
         この形なら fix562 は test-fixture として分類し、slotId は**トークン境界**で解決される
         （＝引用符付きサイドストアと同じ経路の生存証明になる）。
       ★本体キー(`chr6_slot_<id>`)の判定は **書かずに** resolveSlot() で確認する。 */
    var n = nonce();
    var SID  = 'smprobe' + n.replace(/[^A-Za-z0-9]/g, '');
    var LIVE = SID + '9';                         /* ★紛らわしいID: SID を含むが別スロット */
    var kHit  = 'chr6_gc_probe_tsw602_"' + SID + '"';
    var kMiss = 'chr6_gc_probe_tsw602_"' + LIVE + '"';
    var b = { observed:S.observed, probe:S.tombstoneWriteObservedByPath.fix602probe,
              unknown:S.unknownTombstoneWrites, blocked:S.blocked };
    var byPathBefore = JSON.parse(JSON.stringify(S.tombstoneWriteObservedByPath));

    try {
      extraTombstones[SID] = { id:SID, deleted:true, deletedAt: now(), deleteOpId:'canary' };
      probeSlots[SID] = 1; probeSlots[LIVE] = 1;
      invalidate();

      var o0 = S.observed;
      localStorage.setItem(kHit, '{"canary":1}');
      r.steps.push({ name:'★墓標スロットのキーへの書込を観測する', delta: S.observed - o0 });

      var o1 = S.observed;
      localStorage.setItem(kMiss, '{"canary":1}');
      r.steps.push({ name:'★紛らわしいID（sm1の墓標で sm12 を巻き込まない）', delta: S.observed - o1 });

      /* 書かずに判定だけ確認する（本体キー・生きているスロット） */
      var ts2 = tombstones(true) || {};
      var rb = resolveSlot('chr6_slot_' + SID, ts2);
      var rl = resolveSlot('chr6_slot_' + LIVE, ts2);
      r.steps.push({ name:'墓標の本体キーを墓標と判定（書かずに確認）',
                     delta: (rb.slotId === SID && !rb.unavailable) ? 1 : 0, slotId: rb.slotId });
      r.steps.push({ name:'別スロットの本体キーは墓標ではない（書かずに確認）',
                     delta: (rl.slotId === LIVE && !ts2[rl.slotId]) ? 0 : 1, slotId: rl.slotId });
    } catch(e){ r.error = String((e && e.message) || e).slice(0, 120); }
    finally {
      try { delete extraTombstones[SID]; } catch(e){}
      try { delete probeSlots[SID]; delete probeSlots[LIVE]; } catch(e){}
      /* 後始末（LSに1バイトも残さない）。削除は**呼び出し時に解決される** removeItem で行う＝
         fix569 の影監視にも見せる。捕捉済み参照でこっそり消さない。 */
      rawRemove(kHit); rawRemove(kMiss);
      invalidate();
    }

    var s0 = r.steps[0] || {}, s1 = r.steps[1] || {}, s2 = r.steps[2] || {}, s3 = r.steps[3] || {};
    r.observedDelta = S.observed - b.observed;
    r.probeDelta    = S.tombstoneWriteObservedByPath.fix602probe - b.probe;
    r.leftover = [kHit, kMiss].filter(function(k){ return rawGet(k) != null; });
    /* ★canary が実経路のカウンタを汚していないこと（fix569 で踏んだ「全件が canary に見える」の裏返し） */
    r.realPathsUntouched = ['fix399','fix402','home','fix587','features','index','unknownPath']
      .every(function(p){ return S.tombstoneWriteObservedByPath[p] === byPathBefore[p]; });
    r.ok = (s0.delta === 1 && s1.delta === 0 && s2.delta === 1 && s3.delta === 0
            && r.observedDelta === 1 && r.probeDelta === 1
            && r.realPathsUntouched === true
            && r.pathLabelsOk === true
            && r.leftover.length === 0
            && S.blocked === b.blocked
            && r.classifierAvailable === true);
    if (!r.ok && !r.classifierAvailable) r.why = 'fix562(分類器)が未ロード。ラッパは生きているが slotId を確定できない';
    return r;
  }

  /* ================= 読み出し =================================================== */
  function clone(o){ try { return JSON.parse(JSON.stringify(o)); } catch(e){ return {}; } }
  function stats(){
    var out = {};
    for (var k in S){
      if (!Object.prototype.hasOwnProperty.call(S, k)) continue;
      out[k] = (S[k] && typeof S[k] === 'object') ? clone(S[k]) : S[k];
    }
    /* GPT指定の名前と、短い別名の両方を出す（同じ実体） */
    out.byPath = clone(S.tombstoneWriteObservedByPath);
    out.blockedByPath = clone(S.tombstoneWriteBlockedByPath);
    try { out.isOutermost = (localStorage.setItem === shadow); } catch(e){ out.isOutermost = null; }
    out.classifierAvailable = !!classifier();
    out.off = isOff();
    out.VERSION = VERSION;
    out.ringSize = RING.length;
    var sum = 0, p;
    for (p in out.byPath){ if (Object.prototype.hasOwnProperty.call(out.byPath, p)) sum += out.byPath[p]; }
    out.byPathSum = sum;
    out.consistency = {
      observedEqualsByPathSum: (sum === S.observed),
      unknownEqualsUnknownPath: (S.unknownTombstoneWrites === (S.tombstoneWriteObservedByPath.unknownPath || 0)),
      neverBlocks: (S.blocked === 0 && nkeys(S.tombstoneWriteBlockedByPath) === 0)
    };
    out.observedScope = {
      note: 'observed=0 は「観測できた経路・観測期間で0件」でしかない。分母(setItemsSeen)と生存証明(selfTest)を必ず併記する',
      undecidable: S.classifierUnavailable + S.metaUnavailable,
      undecidableNote: '★判定できなかった件は observed にも「安全」にも数えない。分類器不在で全件を1ラベルへ倒さないため',
      pathsSeen: (function(){ var a = []; for (var q in S.tombstoneWriteObservedByPath){
        if (S.tombstoneWriteObservedByPath[q] > 0) a.push(q); } return a; })(),
      pathsNeverSeen: ['fix399','fix402','home','fix587','features','index']
        .filter(function(q){ return !S.tombstoneWriteObservedByPath[q]; }),
      writesNothing: 'このモジュールは localStorage へ1バイトも書かない（記録はメモリが正本）',
      /* ★observed=0 を読む前に、何が見えていないかを明示する。 */
      blindSpot: '一枚(outer)だけの監視。設置(解析完了後)より前の書き込みと、'
               + '設置前に localStorage.setItem の参照を捕捉して**自分の入口として**呼ぶコードは映らない。'
               + '既存5枚(fix246/fix543/fix346/fix402/fix490)は捕捉参照を**下流**として使うので迂回にはならない。',
      installedAtReadyState: S.installedAtReadyState
    };
    return out;
  }
  function recent(){ return RING.slice(); }
  function isOff(){ return rawGet(OFF_KEY) === '1'; }

  window.__v292Dfix602 = {
    VERSION: VERSION,
    isOff: isOff,
    armed: function(){ return S.installed; },
    install: arm,
    stats: stats,
    recent: recent,
    selfTest: selfTest,
    /* 将来 block する側のための口（このモジュールは呼ばない） */
    _noteBlocked: noteBlocked,
    /* テスト専用の内部露出（本番コードからは使わない） */
    _pathOf: pathOf, _matchStack: matchStack, _stackOf: stackOf,
    _tombstones: tombstones, _resolveSlot: function(k){ return resolveSlot(String(k), tombstones(true) || {}); },
    _tokenBounded: tokenBounded, _extraTombstones: extraTombstones, _probeSlots: probeSlots,
    _invalidate: invalidate, _native: function(){ return { set: nativeSet, get: nativeGet }; }
  };
  try { console.log(TAG, 'phase1 native=' + (!!nativeSet) + ' (outer は解析完了後に設置)'); } catch(e){}
})();
