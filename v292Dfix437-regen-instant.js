// =====================================================================
// Chronicle TRPG - v292Dfix437: ↻アイコン再生成を「押した瞬間」から画面に反映する
// ---------------------------------------------------------------------
// 【症状】キャラ一覧の「↻ アイコン再生成」を押しても画面のアイコンが変わらない。
//   裏では新画像が生成され v292av2_<pk> に保存されているのに、古い絵のまま。
//   ユーザーには「押しても何も起きない」に見える。
//
// 【実コードで確認した真因(2026-07-12・jsdomで実挙動を再現)】
//   (1) fix145 の ↻ ハンドラは __aiAvatar.regen(name) を呼び、
//       setTimeout(renderModal, 1500) でモーダルを丸ごと作り直す。
//       実際の画像生成(fix197.regenFor)は fix197 側のクリック捕捉(+300ms)から始まり、
//       MIN_INTERVAL(1500ms)+課金API往復で通常 3〜8 秒かかる。
//       → 【再描画のほうが必ず先に来る】。作り直された <img> の初期 src は
//         fix145 の cached410 = fix197.cachedFor(name) = 【persistの旧画像】
//         (fix197 H-3 で旧画像は生成成功まで消されない)。
//   (2) その直後 fix197.applyOne が走るが、cache[pk]==='pending' の間は
//       fresh403v=false なので【fix400 のサーバー配信URLが最優先】になる。
//       サーバーにあるのは当然まだ【旧画像】。
//       → 生成が終わるまでの数秒間、画面は旧アイコンのまま・進捗表示ゼロ。
//   (3) 生成完了後の applyAll は data-avpk 付きの img しか差し替えない。
//       innerHTML 経由で描かれた img・再描画直後でまだ sweep が触っていない img・
//       fix430 が placeholder を rawSrcSet で直接書いた img は取りこぼす。
//       さらに fix277/fix237/features(fix118) の各スイープが独自に src を書き戻すため、
//       「誰が最後に書くか」に依存する不安定な状態になる。
//   (4) 生成失敗・GEN_BUDGET(15/セッション)到達時は fix197 が旧画像を復元するので、
//       押しても本当に何も起きない(この場合は新画像も保存されない)。
//
// 【対策】「このセッションで↻したpk」だけを対象に、DOM書き込み境界で強制する。
//   ・↻を押した瞬間 → そのpkの全imgを【生成中スピナー】に(features.js fix121f と同一のSVG。
//     新しいUIは増やさない)。押した実感が即出る。
//   ・生成中は、そのpkに対してだけ【サーバーURL/旧画像/DiceBear/carrierの書き込みを拒否】し
//     スピナーを維持(fix400優先ロジックの局所無効化。他のpkは一切不触)。
//   ・生成完了 → そのpkの全img(キャラ一覧・会話ログ・設定・モーダル)の src を
//     新しい data: URL へ即座に差し替え、以後どのモジュールが書き戻しても上書きし返す。
//   ・モーダル再描画・innerHTML描画にも追随(MutationObserver + 定期sweep)。
//   ・生成失敗/予算切れ → 旧画像へ静かに復帰(スピナーが残らない)。
//
//   実装点: HTMLImageElement.prototype.src セッター と Element.prototype.setAttribute を
//   【fix430 の外側】でラップ(index.html で fix430 より後に読み込む)。fix197.applyOne は
//   モジュール内ローカルで差し替え不能なため、全書き手が必ず通るこの1点で決着させる。
//
// OFF: localStorage v292Dfix437Off='1'(リロード不要=live。スピナーを撤去し従来動作へ)
// 冪等ガード: window.__v292Dfix437
// 検証口: window.__v292Dfix437 = { decide, regenStart, state, sweep, ... }(pureはnode可)
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix437 && window.__v292Dfix437.__installed) return;   // 冪等
  var TAG = '[v292Dfix437:regen-instant]';

  // features.js(v292Dfix121f)が「生成中…」に使っているスピナーと同一のdata URI(新UIを増やさない)
  var SPIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='15' fill='none' stroke='%23b39ddb' stroke-width='4' stroke-linecap='round' stroke-dasharray='71' stroke-dashoffset='30'%3E%3CanimateTransform attributeName='transform' type='rotate' from='0 24 24' to='360 24 24' dur='0.9s' repeatCount='indefinite'/%3E%3C/circle%3E%3C/svg%3E";

  var GRACE   = 2500;     // クリック→fix197.regenFor(+300ms)→pump が立ち上がるまでの猶予
  var TIMEOUT = 90000;    // これを超えたら生成失敗とみなして旧画像へ復帰
  var SWEEP_MS = 700;

  // pk -> { name, state:'gen'|'done', prev:<旧data:URL>, url:<新data:URL>, t0 }
  var reg = {};
  var swept = 0, forced = 0, blocked = 0;

  function off(){ try { return localStorage.getItem('v292Dfix437Off') === '1'; } catch(e){ return false; } }
  function f197(){ return window.__v292Dfix197 || window.__v292Dfix199 || null; }
  function keyFor(name){ var f = f197(); try { return (f && typeof f.keyFor === 'function') ? f.keyFor(name) : ''; } catch(e){ return ''; } }
  function cachedFor(name){ var f = f197(); try { return (f && typeof f.cachedFor === 'function') ? (f.cachedFor(name) || '') : ''; } catch(e){ return ''; } }
  function diceFor(name){ var f = f197(); try { return (f && typeof f.diceUrl === 'function') ? f.diceUrl(name) : ''; } catch(e){ return ''; } }
  function stateOf(name){ var f = f197(); try { return (f && typeof f.__test_state === 'function') ? f.__test_state(name) : null; } catch(e){ return null; } }

  // ---------- 素のDOM API(自分より内側=fix430のラッパ)を退避 ----------
  var IMGP = window.HTMLImageElement && window.HTMLImageElement.prototype;
  var prevDesc = IMGP ? Object.getOwnPropertyDescriptor(IMGP, 'src') : null;
  var prevSet = prevDesc && prevDesc.set;
  var prevGet = prevDesc && prevDesc.get;
  var prevSetAttr = window.Element.prototype.setAttribute;

  function getSrc(img){ try { return img.getAttribute('src') || ''; } catch(e){ return ''; } }
  // 内側(fix430)のsetterを通して書く。fix430のcarrier遮断は生かしたまま。
  function writeSrc(img, v){
    try { if (prevSet) { prevSet.call(img, v); return; } } catch(e){}
    try { prevSetAttr.call(img, 'src', v); } catch(e){}
  }

  // ---------- pure: このimg(pk)へのsrc書き込みをどうするか ----------
  //   戻り値 null   = 素通し(このpkは管理外 / 書いてよい値)
  //          文字列 = その値に強制差し替え
  function decide(pk, value){
    if (!pk) return null;
    var r = reg[pk];
    if (!r) return null;
    var v = String(value == null ? '' : value);
    if (r.state === 'done'){
      if (!r.url) return null;
      return (v === r.url) ? null : r.url;         // 何を書かれても新画像へ戻す
    }
    if (r.state === 'gen'){
      if (v === SPIN) return null;                                             // スピナーはそのまま
      if (v.indexOf('data:') === 0 && v !== r.prev) return null;               // 生成直後の新data:は通す
      return SPIN;                                                             // サーバーURL/旧画像/DiceBear/carrier → 拒否
    }
    return null;
  }

  // img から pk を解決(data-avpk 優先。無ければ alt→keyFor=fix424の名寄せ込み)
  function pkOfImg(img){
    try {
      if (!img || img.nodeName !== 'IMG') return '';
      var pk = img.getAttribute('data-avpk');
      if (pk) return pk;
      var alt = (img.getAttribute('alt') || '').trim();
      if (!alt) return '';
      return keyFor(alt);
    } catch(e){ return ''; }
  }

  // ---------- ① src セッター(fix430の外側) ----------
  if (prevDesc && prevSet){
    Object.defineProperty(IMGP, 'src', {
      configurable: true,
      enumerable: prevDesc.enumerable,
      get: function(){ return prevGet ? prevGet.call(this) : getSrc(this); },
      set: function(v){
        try {
          if (!off()){
            var pk = pkOfImg(this);
            var f = decide(pk, v);
            if (f != null){
              blocked++;
              if (getSrc(this) === f) return;      // 既に目的の値 → 書かない(churn/ループ防止)
              prevSet.call(this, f);
              return;
            }
          }
        } catch(e){}
        prevSet.call(this, v);
      }
    });
  }

  // ---------- ② setAttribute('src', ...)(fix430の外側) ----------
  var wrapSetAttr = function(name, value){
    try {
      if (!off() && this && this.nodeName === 'IMG' && String(name).toLowerCase() === 'src'){
        var pk = pkOfImg(this);
        var f = decide(pk, value);
        if (f != null){
          blocked++;
          if (getSrc(this) === f) return;
          return prevSetAttr.call(this, 'src', f);
        }
      }
    } catch(e){}
    return prevSetAttr.apply(this, arguments);
  };
  // ★fix419cの教訓: ラップする関数の own プロパティは全継承する(ラッパー相互ダンス防止)
  try { Object.keys(prevSetAttr).forEach(function(k){ try { wrapSetAttr[k] = prevSetAttr[k]; } catch(e){} }); } catch(e){}
  window.Element.prototype.setAttribute = wrapSetAttr;

  // ---------- ③ 状態遷移(gen → done / 失敗復帰) ----------
  function finish(pk, url){
    var r = reg[pk]; if (!r) return;
    r.state = 'done'; r.url = url;
    try { console.log(TAG, 'regen done:', r.name); } catch(e){}
    applyToDom();
  }
  function abandon(pk, why){
    var r = reg[pk]; if (!r) return;
    delete reg[pk];                       // 管理から外す=以後は従来動作(fix400のサーバーURL等)
    try {
      var back = cachedFor(r.name) || r.prev || diceFor(r.name);
      if (back){
        var imgs = document.getElementsByTagName('img');
        for (var i = 0; i < imgs.length; i++){
          if (pkOfImg(imgs[i]) !== pk) continue;
          if (getSrc(imgs[i]) === SPIN) writeSrc(imgs[i], back);   // スピナーを残さない
        }
      }
    } catch(e){}
    try { console.warn(TAG, 'regen not completed (' + why + '):', r.name); } catch(e){}
  }
  function poll(){
    var now = Date.now();
    for (var pk in reg){
      if (!Object.prototype.hasOwnProperty.call(reg, pk)) continue;
      var r = reg[pk];
      if (r.state !== 'gen') continue;
      var st = stateOf(r.name);
      var cur = cachedFor(r.name);
      if (st && st.dataUrl && cur && cur.indexOf('data:') === 0 && cur !== r.prev){ finish(pk, cur); continue; }
      if (now - r.t0 < GRACE) continue;                          // 立ち上がり待ち
      if (st && (st.pending || st.queued)){
        if (now - r.t0 > TIMEOUT) abandon(pk, 'timeout');
        continue;
      }
      // 生成キューから消えたのに新画像が無い = 失敗 / DiceBear退避 / GEN_BUDGET到達
      abandon(pk, (st && st.dice) ? 'dice-fallback' : 'no-new-image');
    }
  }

  // ---------- ④ DOMへ反映(innerHTML描画・モーダル再描画にも追随) ----------
  //   ★判定は必ず decide() に一本化する。ここで「want」を独自計算すると、生成完了直後に
  //     fix197 が入れた【新data:】をスピナーへ引き戻し→fix197 が再度書く→…の
  //     ピンポン無限ループになる(実測: 自己テストがハングして発覚)。
  //     decide() は「今のsrcが許されない値のときだけ」強制値を返す = 必ず収束する。
  function applyToDom(){
    try {
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++){
        var img = imgs[i];
        var pk = pkOfImg(img);
        if (!pk || !reg[pk]) continue;
        var cur = getSrc(img);
        var f = decide(pk, cur);
        if (f == null || f === cur) continue;
        try { img.onerror = null; } catch(e){}
        writeSrcGuarded(img, f);
        forced++;
      }
    } catch(e){}
  }
  function writeSrcGuarded(img, v){ try { img.src = v; } catch(e){ writeSrc(img, v); } }   // 自分のsetter→fix430→native

  function restoreAll(){
    var pks = Object.keys(reg);
    for (var i = 0; i < pks.length; i++){
      var pk = pks[i], r = reg[pk];
      var back = cachedFor(r.name) || r.url || r.prev || diceFor(r.name);
      delete reg[pk];
      try {
        var imgs = document.getElementsByTagName('img');
        for (var j = 0; j < imgs.length; j++){
          if (pkOfImg(imgs[j]) !== pk) continue;
          if (getSrc(imgs[j]) === SPIN && back) writeSrc(imgs[j], back);
        }
      } catch(e){}
    }
  }

  function sweep(){
    swept++;
    if (off()){ if (Object.keys(reg).length) restoreAll(); return; }
    poll();
    applyToDom();
  }

  // ---------- ⑤ ↻クリック捕捉(fix197と同じ検出。ここでは即座にスピナー) ----------
  function regenStart(name){
    if (!name || off()) return null;
    var pk = keyFor(name);
    if (!pk) return null;
    var prev = cachedFor(name);           // fix197.regenFor が cache を消す前の【旧画像】
    reg[pk] = { name: name, state: 'gen', prev: prev, url: '', t0: Date.now() };
    applyToDom();                          // 押した瞬間にスピナー
    try { console.log(TAG, 'regen start:', name, pk); } catch(e){}
    return pk;
  }

  try {
    document.addEventListener('click', function(ev){
      try {
        if (off()) return;
        var t = ev.target; if (!t || !t.closest) return;
        var probe = t.closest('button,[role="button"],a') || t;
        var txt = (probe.textContent || '') + ' ' + ((probe.getAttribute && (probe.getAttribute('title') || probe.getAttribute('aria-label'))) || '');
        if (txt.length > 40) return;
        if (!/再生成|↻|↺|⟳|🔄/.test(txt)) return;
        var card = t.closest('.npc-card') || t.closest('.v100-clean') || t.closest('[class*="card"]') || t.parentNode;
        var nm = '';
        var img = (card && card.querySelector) ? card.querySelector('img[alt]') : null;
        if (img) nm = (img.getAttribute('alt') || '').trim();
        if (!nm && card && card.querySelector){ var ni = card.querySelector('input[type="text"]'); if (ni) nm = (ni.value || '').trim(); }
        if (nm) regenStart(nm);
      } catch(e){}
    }, true);
  } catch(e){}

  // ---------- ⑥ 監視 ----------
  function start(){
    try {
      var obs = new MutationObserver(function(muts){
        if (off() || !Object.keys(reg).length) return;
        for (var i = 0; i < muts.length; i++){
          var m = muts[i];
          if (m.type === 'attributes' && m.target && m.target.nodeName === 'IMG'){ applyToDom(); return; }
          if (m.addedNodes && m.addedNodes.length){ applyToDom(); return; }
        }
      });
      obs.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-avpk'] });
      window.__v292Dfix437Observer = obs;
    } catch(e){}
    try { setInterval(sweep, SWEEP_MS); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.__v292Dfix437 = {
    __installed: true,
    SPIN: SPIN,
    decide: decide,                 // pure(検証口)
    regenStart: regenStart,
    sweep: sweep,
    poll: poll,
    applyToDom: applyToDom,
    restoreAll: restoreAll,
    pkOfImg: pkOfImg,
    state: function(){ var o = {}; for (var k in reg){ if (Object.prototype.hasOwnProperty.call(reg, k)) o[k] = { name: reg[k].name, state: reg[k].state, hasPrev: !!reg[k].prev, hasUrl: !!reg[k].url }; } return o; },
    stats: function(){ return { swept: swept, forced: forced, blocked: blocked, tracked: Object.keys(reg).length }; },
    __reset: function(){ reg = {}; swept = 0; forced = 0; blocked = 0; }   // テスト用
  };
  try { console.log(TAG, 'armed', off() ? '(OFF)' : ''); } catch(e){}
})();
