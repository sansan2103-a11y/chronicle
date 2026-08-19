/* v292Dfix654-storage-trap.js (2026-07-31) — iOS「ラッパ素通り」第18型の根治
 *
 * ■なぜ必要か（実機で確定）
 *   iOS Safari では `localStorage.getItem = fn` のような**インスタンスへのメソッド代入が効かない**。
 *   リロード直後でも `String(localStorage.getItem)` は native のまま。
 *   真因（高確度）: Storage は WebIDL の named-setter オブジェクトで、iOS は代入を named setter に流す
 *   （= 'getItem' という名の**保存アイテム**を作り得る）。own property が作られないので、
 *   読み取りは prototype のメソッドが先に解決され、**ラッパは完全に素通り**する。
 *   影響: index.html / home.html が読む 18 モジュール
 *   （fix346/246/543/490/402/651/569/602/573/472/228/197/632/634/519/523/525/527）の
 *   localStorage ラッパが iOS で全滅していた。`localStorage.__v346raw = fn` のエキスパンド代入も同様。
 *
 * ■方式（既存モジュールは1バイトも変えない）
 *   `Storage.prototype` の getItem / setItem / removeItem を **accessor property**（get/set）に置換し、
 *   既存モジュールの「インスタンスへの代入」を **setter で捕獲**する。
 *   捕獲した実装は WeakMap（receiver インスタンス毎）に持ち、getter が
 *     this === Storage.prototype → protoImpl / インスタンスに実装あり → それ / 無ければ protoImpl
 *   を返す。これは**通常の JS プロパティ意味論の忠実な再実装**であり、
 *   PC の従来挙動（own property が prototype を隠す・代入順＝重ね順）と完全に一致する。
 *   iOS では [[Set]] が prototype chain を歩いて accessor setter に当たるため、
 *   named setter（＝ゴミアイテム生成）へ到達する前に捕獲できる。
 *   sessionStorage など別インスタンスへは WeakMap が分かれているので**漏れない**。
 *   `localStorage.removeItem === Storage.prototype.removeItem`（fix569 の protoPristineAtLoad 判定）は
 *   「代入前なら true」で従来と同値。getter は**代入された関数そのもの**（または native そのもの）を返し、
 *   bind ラップを一切挟まないので、他fixの `===` 判定・関数 identity も従来どおり。
 *
 * ■このfixが絶対にやらないこと
 *   localStorage への書き込み（設置・selfTest・status・garbageScan すべて読み取りのみ）。
 *   ラッパの追加・削除・順序変更。呼び出し結果の改変。
 *   例外が起きたら**素の状態のまま**（現状と同じ＝悪化ゼロ）。
 *
 * ■観測口
 *   window.__v292Dfix654.status()       … 設置状態・代入回数・捕獲したラッパ名・自己点検・ゴミ検査
 *                       .selfTest()     … 実際の代入経路で end-to-end 検査（storage には触らない）
 *                       .garbageScan()  … iOS が作った「関数ソースが入った 'getItem' 等」を列挙（読むだけ）
 *                       .cleanup()      … 上記だけを native removeItem で削除（**明示呼出しのみ**）
 *                       .wrap(m, fn)    … setter と同じ登録経路（保険。モジュール移行用の器）
 *
 * ■OFF 手順（緊急停止）
 *   コンソールで  localStorage.setItem('v292Dfix654Off','1')  → リロード。
 *   何も設置せず素の状態に戻る（＝PC は従来どおりインスタンス代入で動く）。
 *   戻す時は localStorage.removeItem('v292Dfix654Off') → リロード。
 *   accessor は configurable:true のままなので、手で元へ戻すことも可能。
 *
 * ■ロード位置
 *   index.html / home.html の**最初の script**（fix569 より前）。
 *   ここで Storage.prototype を accessor 化してから、以後の全モジュールの代入を捕獲する。
 */
(function v292Dfix654(){
  'use strict';

  var api = null;
  try {
    if (typeof window === 'undefined') return;
    if (window.__v292Dfix654) return;             /* 冪等（二重読込で初期化し直さない） */
  } catch(e){ return; }

  var TAG   = '[v292Dfix654]';
  var BUILD = '20260819-fix700';
  var METHODS = ['getItem', 'setItem', 'removeItem'];
  var EXPANDO = '__v346raw';
  var MAXLOG  = 40;

  /* ===== 状態 ===== */
  var SP = null;                    /* Storage.prototype */
  var native   = {};                /* 置換前の生メソッド（最初に捕獲する） */
  var protoImpl = {};               /* prototype 上の現在値（初期値 = native） */
  var instImpls = {};               /* method -> WeakMap(receiver -> outermost 実装) */
  var counts    = { getItem: 0, setItem: 0, removeItem: 0 };
  var wrappers  = { getItem: [], setItem: [], removeItem: [] };
  var anomalies = [];
  var installed = false, expandoTrap = false, off = false, failReason = null;
  var expandoInst = null, expandoProto;         /* WeakMap / prototype 側の値 */

  function note(x){ try { if (anomalies.length < MAXLOG) anomalies.push(String(x)); } catch(e){} }
  function isObj(v){ return v !== null && (typeof v === 'object' || typeof v === 'function'); }
  function label(fn){
    try {
      var n = (fn && fn.name) ? String(fn.name) : '';
      if (n) return n.slice(0, 60);
      return String(fn).replace(/\s+/g, ' ').slice(0, 60);
    } catch(e){ return '?'; }
  }
  function LS(){ try { return window.localStorage; } catch(e){ return null; } }
  /* native 経由の読み（ラッパもリダイレクトも通さない。**読むだけ**） */
  function rawGet(k){
    try {
      var ls = LS();
      if (!ls || typeof native.getItem !== 'function') return null;
      var v = native.getItem.call(ls, k);
      return (v == null) ? null : v;
    } catch(e){ return null; }
  }

  try {
    /* ===== Phase 1: native の捕獲（置換より先に必ず行う） ===== */
    try { SP = window.Storage ? window.Storage.prototype : null; } catch(e){ SP = null; }
    if (!SP) { failReason = 'no-Storage-prototype'; throw new Error(failReason); }
    for (var i = 0; i < METHODS.length; i++){
      var m0 = METHODS[i];
      var f0 = SP[m0];
      if (typeof f0 !== 'function'){ failReason = 'no-native-' + m0; throw new Error(failReason); }
      native[m0] = f0; protoImpl[m0] = f0;
      instImpls[m0] = new WeakMap();
    }
    expandoInst = new WeakMap();

    /* ===== Phase 2: kill スイッチ（native 経由で読む・書かない） ===== */
    if (rawGet('v292Dfix654Off') === '1'){ off = true; throw new Error('off'); }

    /* ===== Phase 3: accessor 化 ===== */
    var origDesc = {}, done = [];
    function mkGet(m){
      return function v292Dfix654Get(){
        try {
          if (this === SP) return protoImpl[m];
          var wm = instImpls[m];
          if (wm && isObj(this) && wm.has(this)) return wm.get(this);
        } catch(e){ note('get:' + m + ':' + e); }
        return protoImpl[m];
      };
    }
    function mkSet(m){
      return function v292Dfix654Set(fn){
        try {
          if (typeof fn !== 'function'){ note('nonfn:' + m + ':' + (typeof fn)); return; }
          if (this === SP) protoImpl[m] = fn;                 /* 旧 v275 型のプロトタイプパッチ互換 */
          else if (isObj(this)) instImpls[m].set(this, fn);
          else { note('badthis:' + m); return; }
          counts[m]++;
          if (wrappers[m].length < MAXLOG) wrappers[m].push(label(fn));
        } catch(e){ note('set:' + m + ':' + e); }
      };
    }
    try {
      for (var j = 0; j < METHODS.length; j++){
        var m = METHODS[j];
        var d = Object.getOwnPropertyDescriptor(SP, m);
        origDesc[m] = d || null;
        Object.defineProperty(SP, m, {
          configurable: true,                                  /* 緊急時に手で戻せる */
          enumerable: d ? !!d.enumerable : true,               /* 元の可視性を保つ（for-in の見え方を変えない） */
          get: mkGet(m),
          set: mkSet(m)
        });
        done.push(m);
      }
      installed = true;
    } catch(e){
      /* 途中で失敗したら**素の状態へ戻す**（半端な設置を残さない） */
      failReason = 'defineProperty:' + e;
      for (var r = 0; r < done.length; r++){
        try {
          if (origDesc[done[r]]) Object.defineProperty(SP, done[r], origDesc[done[r]]);
          else SP[done[r]] = native[done[r]];
        } catch(_){}
      }
      installed = false;
      throw e;
    }

    /* ===== Phase 4: エキスパンドトラップ（__v346raw） =====
       fix346/569/562 の生アクセサチャネル。iOS ではここも named setter に流れて
       「29字の文字列が入ったゴミアイテム」になっていた（fix569 のコメント参照）。 */
    try {
      Object.defineProperty(SP, EXPANDO, {
        configurable: true,
        enumerable: false,
        get: function v292Dfix654ExpGet(){
          try {
            if (this === SP) return expandoProto;
            if (isObj(this) && expandoInst.has(this)) return expandoInst.get(this);
          } catch(e){ note('expget:' + e); }
          return expandoProto;
        },
        set: function v292Dfix654ExpSet(v){
          try {
            if (this === SP) expandoProto = v;
            else if (isObj(this)) expandoInst.set(this, v);
            else note('expbadthis');
          } catch(e){ note('expset:' + e); }
        }
      });
      expandoTrap = true;
    } catch(e){ note('expando:' + e); }

    try { console.log(TAG, 'storage trap armed (build ' + BUILD + ')'); } catch(e){}
  } catch(e){
    if (!failReason) failReason = String(e && e.message || e);
    if (!off) { try { console.warn(TAG, 'not installed:', failReason); } catch(_){} }
  }

  /* ===================== 観測・保守 API ===================== */

  /* 自己点検: **実際の代入構文**で end-to-end 検査する（iOS で最も疑わしい経路そのもの）。
     storage には1バイトも書かない。SENTINEL は実在しないキー名（読むだけ）。 */
  var SENTINEL = '__v292Dfix654_probe_key__';
  function selfTest(){
    var out = { installed: installed, assignCaptured: false, dispatchOk: false };
    if (!installed) return out;
    var ls = LS();
    if (!ls) { out.error = 'no-localStorage'; return out; }
    var wm = instImpls.getItem;
    var had = false, prev = null, prevOuter = null;
    var cnt0 = counts.getItem, log0 = wrappers.getItem.length;
    try { had = wm.has(ls); if (had) prev = wm.get(ls); } catch(e){}
    try { prevOuter = ls.getItem; } catch(e){}
    var hits = 0;
    var probe = function v292Dfix654Probe(k){
      hits++;
      try { return (typeof prevOuter === 'function') ? prevOuter.call(ls, k) : null; } catch(e){ return null; }
    };
    try { ls.getItem = probe; } catch(e){ out.error = 'assign-threw'; }
    try { out.assignCaptured = (counts.getItem > cnt0) && (ls.getItem === probe); } catch(e){}
    try { ls.getItem(SENTINEL); } catch(e){}
    out.dispatchOk = hits > 0;
    /* ★厳密復元: 元々 instImpls に無かったなら delete で「無」に戻す */
    try { if (had) wm.set(ls, prev); else wm.delete(ls); } catch(e){}
    /* 観測値を probe で汚さない */
    try { counts.getItem = cnt0; wrappers.getItem.length = log0; } catch(e){}
    return out;
  }

  /* iOS が named setter で作ってしまった「ゴミアイテム」を**読むだけ**で列挙する */
  var SUSPECT = ['getItem', 'setItem', 'removeItem', 'key', 'clear', 'length', EXPANDO];
  var FNSRC   = /^\s*(function|\(|class |[A-Za-z_$][\w$]*\s*=>)/;
  function garbageScan(){
    var out = [];
    for (var i = 0; i < SUSPECT.length; i++){
      var k = SUSPECT[i], v = rawGet(k);
      if (typeof v === 'string' && FNSRC.test(v)) out.push({ key: k, len: v.length, head: v.slice(0, 40) });
    }
    return out;
  }
  /* 上で挙がったものだけを native removeItem で消す。**明示呼出しのみ**（自動実行しない）。
     chr6* / v292* など通常のキーには一切触れない。 */
  function cleanup(){
    var removed = [], list = garbageScan(), ls = LS();
    if (!ls || typeof native.removeItem !== 'function') return removed;
    for (var i = 0; i < list.length; i++){
      try { native.removeItem.call(ls, list[i].key); removed.push(list[i].key); } catch(e){ note('cleanup:' + e); }
    }
    return removed;
  }

  /* setter と同じ登録経路（§2.5 の保険。iOS で setter すら発火しない個体が出た時の移行先）。
     戻り値 = 直前の実装（呼び出し側がチェーンを組めるように） / 失敗時 null */
  function wrap(method, fn, target){
    try {
      if (!installed) return null;
      if (METHODS.indexOf(method) < 0 || typeof fn !== 'function') return null;
      var t = target || LS();
      if (!isObj(t)) return null;
      var wmw = instImpls[method];
      var prev = wmw.has(t) ? wmw.get(t) : protoImpl[method];
      wmw.set(t, fn);
      counts[method]++;
      if (wrappers[method].length < MAXLOG) wrappers[method].push(label(fn));
      return prev;
    } catch(e){ note('wrap:' + e); return null; }
  }

  function status(){
    var st = {
      build: BUILD, installed: installed, off: off, reason: failReason,
      expandoTrap: expandoTrap,
      counts: { getItem: counts.getItem, setItem: counts.setItem, removeItem: counts.removeItem },
      wrappers: { getItem: wrappers.getItem.slice(), setItem: wrappers.setItem.slice(), removeItem: wrappers.removeItem.slice() },
      anomalies: anomalies.slice()
    };
    try { st.selfTest = selfTest(); } catch(e){ st.selfTest = { error: String(e) }; }
    try { st.garbage  = garbageScan(); } catch(e){ st.garbage = []; }
    return st;
  }

  api = {
    build: BUILD,
    installed: installed,
    off: off,
    reason: failReason,
    expandoTrap: expandoTrap,
    status: status, selfTest: selfTest, garbageScan: garbageScan, cleanup: cleanup, wrap: wrap,
    /* 診断用（読むだけ） */
    _hasInst: function(m, t){ try { return !!(instImpls[m] && instImpls[m].has(t || LS())); } catch(e){ return false; } },
    _protoImpl: function(m){ return protoImpl[m]; },
    _native: function(m){ return native[m]; },
    _counts: counts
  };
  try { window.__v292Dfix654 = api; } catch(e){}
})();
