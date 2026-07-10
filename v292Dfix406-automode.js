// =====================================================================
// Chronicle TRPG - v292Dfix406: オートモード(指定ターンまで自動進行・途中停止可)
//   目的: 「続きを書く」をN回自動実行して物語を進める。1ボタン+数字入力だけの
//     ライトユーザー向け。途中停止可能。暴走・課金事故を絶対に起こさない。
//   安全の要:
//     - 上限20ターン(入力>20は20へ丸め)。
//     - 「続きを書く」相当以外の操作(送信・リセット等)を一切発火しない。
//     - S.turnsが増えない限り次のclickをしない(1イテレーション=最大1生成)。
//     - 停止後は残タイマーが発火しても再開しない(running/クリアの二重ガード)。
//   OFF: localStorage v292Dfix406Off==='1'(注入しない/scanもスキップ)。
//   冪等: window.__v292Dfix406。ボタン挿入は __v292f406done 属性で二重防止。
//   検証口: window.__v292Dfix406api = { start(n), stop(), running(), remaining() }。
//   テスト用: window.__v292Dfix406_test で内部定数(POLL_MS/TIMEOUT_MS/GAP_MS/SCAN_MS)
//     と onToast フックを上書き可(既定値は本文どおり)。内部関数は
//     window.__v292Dfix406_internal から参照可。
// =====================================================================
(function v292Dfix406(){
  'use strict';
  if (window.__v292Dfix406) return;
  window.__v292Dfix406 = true;
  var TAG = '[v292Dfix406:automode]';

  function off(){ try { return localStorage.getItem('v292Dfix406Off') === '1'; } catch(e){ return false; } }
  function tcfg(){ try { return window.__v292Dfix406_test || null; } catch(e){ return null; } }
  function K(name, def){ var t = tcfg(); if (t && typeof t[name] === 'number') return t[name]; return def; }
  function POLL_MS(){ return K('POLL_MS', 1000); }
  function TIMEOUT_MS(){ return K('TIMEOUT_MS', 120000); }
  function GAP_MS(){ return K('GAP_MS', 1500); }
  function SCAN_MS(){ return K('SCAN_MS', 2000); }

  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function turnsLen(){ try { var s = getS(); return (s && Array.isArray(s.turns)) ? s.turns.length : 0; } catch(e){ return 0; } }

  // ---- 状態 ----
  var running = false, target = 0, done = 0;
  var pollTimer = null, gapTimer = null;
  var floatingEl = null, panelEl = null;

  // ★fix406スロット固定(2026-07-11): オート開始時のスロットを固定し、途中でスロットが変わったら即停止(別スロット誤爆防止)。
  //   オート実行中は手動の「続きを書く」「送信」も無効化(⏹停止は常に有効)。
  function activeSlot(){ try { return JSON.parse(localStorage.getItem('chr6_active_slot') || '"chr6"'); } catch(e){ return 'chr6'; } }
  var lockedSlot = null;    // 開始時に固定するスロット
  var autoFiring = false;   // 真=オート自身の合成クリック中(手動ガードを素通しする)

  function clampTarget(n){
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > 20) n = 20;
    return n;
  }

  // ---- トースト ----
  function toast(msg){
    try { console.log(TAG, 'toast:', msg); } catch(_){}
    try { var t = tcfg(); if (t && typeof t.onToast === 'function') t.onToast(msg); } catch(_){}
    try {
      var d = document.createElement('div');
      d.className = 'v292Dfix406-toast';
      d.textContent = msg;
      var st = d.style;
      st.position = 'fixed'; st.left = '50%'; st.bottom = '84px'; st.transform = 'translateX(-50%)';
      st.background = 'rgba(20,20,28,0.94)'; st.color = '#fff'; st.padding = '8px 14px';
      st.borderRadius = '10px'; st.fontSize = '13px'; st.zIndex = '2147483646';
      st.maxWidth = '90vw'; st.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
      document.body.appendChild(d);
      setTimeout(function(){ try { if (d.parentNode) d.parentNode.removeChild(d); } catch(_){} }, 2600);
    } catch(_){}
  }

  // ---- 「続きを書く」ボタン探索 ----
  function findContinueBtn(){
    try {
      var btns = document.querySelectorAll ? document.querySelectorAll('button') : [];
      for (var i = 0; i < btns.length; i++){
        var b = btns[i];
        var t = (b.textContent || '');
        if (t.indexOf('続きを書く') >= 0 && t.indexOf('オート') < 0) return b;
      }
    } catch(e){}
    return null;
  }

  // ---- 「続きを書く」相当を1回だけ発火(送信・リセットには触れない) ----
  function fireContinue(){
    autoFiring = true;   // ★fix406: オート自身のクリックは手動ガードを素通しさせる
    try {
      var btn = findContinueBtn();
      if (btn && typeof btn.click === 'function'){ btn.click(); return true; }
      var G = null;
      try { G = (0,eval)('typeof G!=="undefined"?G:null'); } catch(_){ G = null; }
      if (!G) { try { G = window.G || null; } catch(_){ G = null; } }
      if (G && typeof G.cont === 'function'){ G.cont(); return true; }
      return false;
    } catch(e){ return false; }
    finally { autoFiring = false; }
  }

  // ★fix406: オート実行中の手動「続きを書く」「送信」クリックを無効化(⏹停止ボタンは必ず生かす)。
  function isBlockedManualBtn(el){
    try {
      var b = (el && el.closest) ? el.closest('button,[role="button"],a') : null;
      if (!b) return false;
      var cls = (b.className != null) ? String(b.className) : '';
      if (cls.indexOf('v292Dfix406-floating') >= 0) return false;   // ⏹停止は通す
      if (cls.indexOf('v292Dfix406-btn') >= 0) return false;        // ⏩オート自身は通す
      var t = (b.textContent || '');
      if (t.indexOf('⏹') >= 0) return false;                        // 停止は通す
      if (t.indexOf('続きを書く') >= 0) return true;
      if (t.indexOf('送信') >= 0) return true;
      return false;
    } catch(e){ return false; }
  }
  function guardManualClick(ev){
    try {
      if (!running) return;        // オート中でなければ何もしない
      if (autoFiring) return;      // オート自身の合成クリックは素通し
      if (isBlockedManualBtn(ev && ev.target)){
        try { if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch(_){}
        try { ev.stopPropagation(); } catch(_){}
        try { ev.preventDefault(); } catch(_){}
        toast('⏩ オート中です（⏹ 停止で解除できます）');
      }
    } catch(e){}
  }

  function insertAfter(ref, node){
    try {
      var p = ref.parentNode;
      if (!p){ document.body.appendChild(node); return; }
      if (ref.nextSibling && p.insertBefore) p.insertBefore(node, ref.nextSibling);
      else p.appendChild(node);
    } catch(e){ try { document.body.appendChild(node); } catch(_){} }
  }

  function styleAuto(b){
    var st = b.style;
    st.marginLeft = '6px'; st.padding = '4px 10px'; st.fontSize = '13px';
    st.borderRadius = '8px'; st.border = '1px solid rgba(255,255,255,0.25)';
    st.background = 'rgba(90,120,200,0.85)'; st.color = '#fff'; st.cursor = 'pointer';
  }

  // ---- ⏩ オート ボタンの冪等挿入 ----
  function scanInsert(){
    try {
      if (off()) return;
      if (running) return;
      var btn = findContinueBtn();
      if (!btn) return;
      if (btn.getAttribute && btn.getAttribute('__v292f406done') === '1') return;
      if (document.querySelector && document.querySelector('.v292Dfix406-btn')){
        try { btn.setAttribute('__v292f406done', '1'); } catch(_){}
        return;
      }
      var auto = document.createElement('button');
      auto.className = 'v292Dfix406-btn';
      auto.textContent = '⏩ オート';
      styleAuto(auto);
      auto.addEventListener('click', onAutoClick);
      insertAfter(btn, auto);
      try { btn.setAttribute('__v292f406done', '1'); } catch(_){}
    } catch(e){}
  }

  function removeAutoBtn(){
    try {
      var btns = document.querySelectorAll ? document.querySelectorAll('.v292Dfix406-btn') : [];
      var arr = [];
      for (var i = 0; i < btns.length; i++) arr.push(btns[i]);
      arr.forEach(function(b){ try { if (b.parentNode) b.parentNode.removeChild(b); } catch(_){} });
      var c = findContinueBtn();
      if (c && c.setAttribute) c.setAttribute('__v292f406done', '0');
    } catch(e){}
  }

  // ---- パネル(非モーダル・confirm/promptは使わない) ----
  function onAutoClick(){
    try { if (running) return; openPanel(); } catch(e){}
  }

  function stylePanel(w){
    var st = w.style;
    st.position = 'fixed'; st.left = '50%'; st.bottom = '18px'; st.transform = 'translateX(-50%)';
    st.background = 'rgba(24,26,34,0.97)'; st.color = '#fff'; st.padding = '12px 14px';
    st.borderRadius = '12px'; st.zIndex = '2147483646'; st.boxShadow = '0 4px 16px rgba(0,0,0,0.45)';
    st.display = 'flex'; st.flexDirection = 'column'; st.gap = '8px'; st.maxWidth = '92vw';
    st.fontSize = '14px'; st.alignItems = 'stretch';
  }

  function openPanel(){
    try {
      closePanel();
      var wrap = document.createElement('div');
      wrap.className = 'v292Dfix406-panel';
      stylePanel(wrap);

      var label = document.createElement('div');
      label.textContent = '何ターン自動で進める？';

      var input = document.createElement('input');
      input.type = 'number'; input.min = '1'; input.max = '20'; input.value = '3';
      input.className = 'v292Dfix406-num';
      try { input.style.fontSize = '15px'; input.style.padding = '4px 6px'; input.style.borderRadius = '6px'; } catch(_){}

      var row = document.createElement('div');
      try { row.style.display = 'flex'; row.style.gap = '8px'; } catch(_){}

      var startBtn = document.createElement('button');
      startBtn.textContent = '開始';
      try { var s1 = startBtn.style; s1.flex = '1'; s1.padding = '6px 10px'; s1.borderRadius = '8px'; s1.border = '0'; s1.background = 'rgba(90,160,110,0.95)'; s1.color = '#fff'; s1.cursor = 'pointer'; } catch(_){}
      startBtn.addEventListener('click', function(){
        var v; try { v = input.value; } catch(_){ v = 3; }
        startAuto(v);
      });

      var closeBtn = document.createElement('button');
      closeBtn.textContent = '閉じる';
      try { var s2 = closeBtn.style; s2.flex = '1'; s2.padding = '6px 10px'; s2.borderRadius = '8px'; s2.border = '1px solid rgba(255,255,255,0.25)'; s2.background = 'transparent'; s2.color = '#fff'; s2.cursor = 'pointer'; } catch(_){}
      closeBtn.addEventListener('click', closePanel);

      row.appendChild(startBtn);
      row.appendChild(closeBtn);
      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(row);
      document.body.appendChild(wrap);
      panelEl = wrap;
    } catch(e){}
  }

  function closePanel(){
    try { if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl); } catch(_){}
    panelEl = null;
  }

  // ---- フローティング停止ボタン ----
  function styleFloating(b){
    var st = b.style;
    st.position = 'fixed'; st.left = '50%'; st.bottom = '18px'; st.transform = 'translateX(-50%)';
    st.padding = '8px 16px'; st.fontSize = '14px'; st.borderRadius = '20px'; st.border = '0';
    st.background = 'rgba(200,80,80,0.95)'; st.color = '#fff'; st.cursor = 'pointer';
    st.zIndex = '2147483646'; st.boxShadow = '0 3px 12px rgba(0,0,0,0.4)';
  }

  function showFloating(){
    try {
      removeFloating();
      var b = document.createElement('button');
      b.className = 'v292Dfix406-floating';
      styleFloating(b);
      b.addEventListener('click', function(){ doStop(true); });
      document.body.appendChild(b);
      floatingEl = b;
      updateFloating();
    } catch(e){}
  }

  function updateFloating(){
    try {
      if (floatingEl){
        var rem = target - done; if (rem < 0) rem = 0;
        floatingEl.textContent = '⏹ 停止(あと' + rem + 'ターン)';
      }
    } catch(e){}
  }

  function removeFloating(){
    try { if (floatingEl && floatingEl.parentNode) floatingEl.parentNode.removeChild(floatingEl); } catch(_){}
    floatingEl = null;
  }

  // ---- タイマー掃除 ----
  function clearTimers(){
    try { if (pollTimer !== null) clearTimeout(pollTimer); } catch(_){}
    try { if (gapTimer !== null) clearTimeout(gapTimer); } catch(_){}
    pollTimer = null; gapTimer = null;
  }

  // ---- 停止 ----
  function doStop(fromUser){
    var wasRunning = running;
    running = false;
    clearTimers();
    removeFloating();
    scanInsert(); // ⏩ボタンを再表示
    if (wasRunning){ try { console.log(TAG, 'stop (done=' + done + '/' + target + ')'); } catch(_){} }
    else if (fromUser){ try { console.log(TAG, 'stop (idle)'); } catch(_){} }
  }

  function finishOk(){
    var n = done;
    doStop(false);
    toast('⏩ ' + n + ' ターン進めました');
  }

  function stopErr(){
    doStop(false);
    toast('⏩ オート停止(応答なし)');
  }

  // ---- ループ本体(1イテレーション=最大1生成) ----
  function startAuto(n){
    if (off()) return;
    if (running) return; // 多重起動防止
    target = clampTarget(n);
    done = 0;
    running = true;
    lockedSlot = activeSlot();   // ★fix406: 開始時のスロットを固定
    try { console.log(TAG, 'start target=' + target); } catch(_){}
    closePanel();
    removeAutoBtn();
    showFloating();
    runIteration();
  }

  function runIteration(){
    if (!running) return;
    // ★fix406: 開始時のスロットと変わっていたら即停止(既存の停止経路でUIも戻す)
    if (lockedSlot !== null && activeSlot() !== lockedSlot){
      try { console.log(TAG, 'slot changed (' + lockedSlot + '->' + activeSlot() + ') - auto stopped'); } catch(_){}
      doStop(false);
      toast('⏩ スロットが変わったのでオートを停止しました');
      return;
    }
    if (done >= target){ finishOk(); return; }
    var turns0;
    try { turns0 = turnsLen(); } catch(e){ stopErr(); return; }

    var fired;
    try { fired = fireContinue(); } catch(e){ fired = false; }
    if (!fired){ stopErr(); return; }

    var waited = 0;
    var poll = function(){
      if (!running) return; // 停止済み: 送信済みの1ターンには触れない
      var len;
      try { len = turnsLen(); } catch(e){ stopErr(); return; }
      if (len < turns0){ stopErr(); return; }      // turns減少 → 即停止
      if (len > turns0){                            // 1ターン完了
        done++;
        updateFloating();
        if (done >= target){ finishOk(); return; }
        gapTimer = setTimeout(runIteration, GAP_MS());
        return;
      }
      waited += POLL_MS();
      if (waited >= TIMEOUT_MS()){ stopErr(); return; } // タイムアウト → 即停止
      pollTimer = setTimeout(poll, POLL_MS());
    };
    pollTimer = setTimeout(poll, POLL_MS());
  }

  // ---- 検証口 ----
  window.__v292Dfix406api = {
    start: function(n){ startAuto(n); },
    stop: function(){ doStop(true); },
    running: function(){ return running; },
    remaining: function(){ return running ? Math.max(0, target - done) : 0; }
  };

  // ---- 内部参照(テスト用) ----
  window.__v292Dfix406_internal = {
    scan: scanInsert,
    findContinueBtn: findContinueBtn,
    fireContinue: fireContinue,
    activeSlot: activeSlot,
    isBlockedManualBtn: isBlockedManualBtn,
    guardManualClick: guardManualClick,
    runIteration: runIteration,
    doStop: doStop,
    _getState: function(){ return { running: running, lockedSlot: lockedSlot, target: target, done: done, autoFiring: autoFiring }; },
    _setState: function(o){ if (o){ if ('running' in o) running = o.running; if ('lockedSlot' in o) lockedSlot = o.lockedSlot; if ('target' in o) target = o.target; if ('done' in o) done = o.done; } }
  };

  // ---- 起動: 冪等挿入(初回 + MutationObserver + ポーリング) ----
  try { scanInsert(); } catch(e){}
  try {
    if (typeof MutationObserver !== 'undefined'){
      var mo = new MutationObserver(function(){ try { scanInsert(); } catch(_){} });
      try { mo.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch(_){}
    }
  } catch(e){}
  try { setInterval(function(){ try { scanInsert(); } catch(_){} }, SCAN_MS()); } catch(e){}

  // ★fix406: 手動操作ガードを capture 段で常設(running中のみ作用)。
  try { document.addEventListener('click', guardManualClick, true); } catch(e){}

  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(_){}
})();
