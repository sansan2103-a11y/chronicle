// =====================================================================
// Chronicle TRPG - v292Dfix880: SETTINGS_THREE_TIER_FOLD_V1
//   (lane 15 / GPT 裁定 #L15entry F5 F7 / sp10A)
// ---------------------------------------------------------------------
// ■ これは何か
//   ⚙ システム tab を **3 段**に畳み直す。DOM の **移動だけ**で、
//   欄そのもの・id・保存経路は 1 バイトも変えない。
//     【通常】     いま ⚙ システム にある欄（sp10A では API 欄もここに残る = F1 待ち）
//     【詳細設定】 既定で閉じた <details>。topbar から降りてきた創作ノブ 5 個 + 危険操作
//     【開発者向け】既定で非表示。開発診断（dsadm-1 / dscmf-1 / dsmon-1）を収容
//
// ■ 壊さない約束（1 つでも破ったら実装ミス）
//   NO_ID_CHANGE      … cfg* / v292-*-sel の id を 1 つも変えない。移動するだけ。
//                       UI.saveSettings()/loadCfg() は getElementById 配線なので出力は不変。
//   FIX275_UNTOUCHED  … tab 機構（v292Dfix275）に触らない。新 section は **.sec の文言**だけで
//                       sys tab に入る（fix275 の classify: /主人公|NPC/→chr, /世界|シーン/→wld, else sys）。
//                       「詳細設定」「開発者向け」はどちらにも一致しないので sys。
//   FIX243_UNTOUCHED  … topbar 折りたたみ（v292Dfix243）の allowlist に触らない。
//                       ★「📁 セーブ」は **外さない**（裁定: データ管理が到達可能になってから）。
//   FIX355_UNTOUCHED  … 反応 / アイコン / エンジンの 3 ノブは fix355 が非表示の正本。触らない。
//   FIXP0_UNTOUCHED   … v292DfixP0 のシナリオテンプレ封鎖を**解除しない**。
//                       「📚 シナリオ」は topbar から **退役**させるだけ（dev mode では出す）。
//   DEV_GATE_NOT_AUTH … v292DevMode は **表示 gate であり権限ではない**（裁定 F1）。
//                       server 側の admin 権限（worker /admin の x-admin-token 検証）は不変。
//   LS_WRITE_0        … localStorage へ 1 バイトも書かない（読むのは gate key だけ）。
//   NO_NETWORK        … fetch / XHR 0。
//
// ■ dev gate（裁定 F2: 既存 flag OR v292DevMode）
//     localStorage['v292DevMode']==='1'
//   ｜localStorage['v292Dfix867ShowCodes']==='1'
//   ｜localStorage['v292ProxyShowUrl']==='1'
//
// 検証口: window.__v292Dfix880 = { version, api }
// kill:  localStorage['v292Dfix880Off'] = '1' → 何もしない（sp9 と同じ DOM）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix880) return;
  var TAG = '[v292Dfix880:settings-fold]';
  var VERSION = 'v292Dfix880-20260919-sp10a-v1.0';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix880Off') === '1'; }
  /* ★裁定 F2: 既存 opt-in key を残したまま OR で束ねる。既存 kill を 1 つも失わない。 */
  var DEV_KEYS = ['v292DevMode', 'v292Dfix867ShowCodes', 'v292ProxyShowUrl'];
  function devOn(){
    for (var i = 0; i < DEV_KEYS.length; i++){ if (lsg(DEV_KEYS[i]) === '1') return true; }
    return false;
  }
  function el(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* topbar から【詳細設定】へ降ろす創作ノブ。値・change handler は不触。 */
  var KNOB_IDS = ['v292-drama-sel', 'v292-dlg-sel', 'v292-len-sel', 'v292-tone-sel', 'v292-style-sel'];
  /* 退役させる topbar ボタン（機能は残す。dev mode では出す）＝ テンプレライブラリ */
  var RETIRE_BTN_ID = 'v41-topbar-btn';

  var stats = { applies: 0, knobsMoved: 0, devMoved: 0, dangerMoved: 0, retired: 0, built: false };

  /* ---------- CSS（topbar を離れたノブの見た目だけ。display には触らない） ---------- */
  function injectStyle(){
    if (el('v880css')) return;
    var css = [
      '#v880-detail > .v880-knobs{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}',
      '#settingsPanel .v880-knob{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px}',
      '#settingsPanel .v880-knob > span:first-child{opacity:.8;white-space:nowrap}',
      '#settingsPanel .v880-knob select{flex:0 0 auto;min-width:130px;background:#15152a;color:#d6d7ee;',
      '  border:1px solid #32324e;border-radius:7px;padding:4px 8px;font-size:12px;min-height:26px;cursor:pointer}',
      '#settingsPanel details.v880-fold{border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;',
      '  padding:8px 10px;margin-bottom:10px;background:rgba(255,255,255,.02)}',
      '#settingsPanel details.v880-fold > summary{cursor:pointer;font-size:13px;opacity:.9;list-style:revert}',
      '#settingsPanel details.v880-fold[open] > summary{margin-bottom:10px}',
      '#settingsPanel .v880-hidden{display:none !important}',
      '#settingsPanel .v880-note{font-size:11px;color:var(--dim,#888);line-height:1.5;margin:6px 0 4px}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'v880css'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 2 つの section を .mpanel-body の末尾に作る ---------- */
  function mkSec(id, text){
    var d = document.createElement('div');
    d.className = 'sec'; d.id = id; d.textContent = text;   /* ★文言が fix275 の tab 割当を決める */
    return d;
  }
  function mkFold(id, summaryText, noteText){
    var f = document.createElement('details');
    f.className = 'v880-fold'; f.id = id;                    /* ★open を付けない = 既定で閉じている */
    var s = document.createElement('summary'); s.textContent = summaryText;
    f.appendChild(s);
    if (noteText){
      var n = document.createElement('div'); n.className = 'v880-note'; n.textContent = noteText;
      f.appendChild(n);
    }
    return f;
  }

  function build(){
    var body = document.querySelector('#settingsPanel .mpanel-body');
    if (!body) return null;
    if (!el('v880-detail')){
      body.appendChild(mkSec('v880-sec-detail', '詳細設定'));
      var fd = mkFold('v880-detail', '物語の調整と、やり直し',
                      '物語の雰囲気をあとから変えられます。迷ったらそのままで大丈夫です。');
      var kn = document.createElement('div'); kn.className = 'v880-knobs';
      fd.appendChild(kn);
      body.appendChild(fd);
    }
    if (!el('v880-dev')){
      body.appendChild(mkSec('v880-sec-dev', '開発者向け'));
      body.appendChild(mkFold('v880-dev', '開発者向け（表示のみ）',
                              'ここは動作の確認用です。ここから設定は変わりません。'));
    }
    stats.built = true;
    return body;
  }

  /* ---------- 移動（べき等。すでに行き先に居れば何もしない） ---------- */
  function moveInto(node, host){
    if (!node || !host || node.parentNode === host) return false;
    host.appendChild(node); return true;
  }

  function moveKnobs(){
    var host = el('v880-detail'); if (!host) return;
    var kn = host.querySelector('.v880-knobs'); if (!kn) return;
    for (var i = 0; i < KNOB_IDS.length; i++){
      var sel = el(KNOB_IDS[i]); if (!sel) continue;
      /* features.js / fix192 が作る wrapper は <span>ラベル<select></span>。親ごと動かす。 */
      var wrap = sel.parentNode;
      if (!wrap || wrap === kn) continue;
      if (wrap.id === 'settingsPanel' || wrap === document.body) continue;
      wrap.classList.add('v880-knob');
      wrap.classList.remove('v243-foldable');          /* topbar を離れるので折りたたみ対象から外れる */
      wrap.style.marginLeft = '';                       /* topbar 用のインライン余白だけ落とす */
      if (moveInto(wrap, kn)) stats.knobsMoved++;
    }
  }

  function moveDanger(){
    var host = el('v880-detail'); if (!host) return;
    var dz = document.querySelector('#settingsPanel .mpanel-footer-danger');
    if (dz && dz.parentNode !== host){ if (moveInto(dz, host)) stats.dangerMoved++; }
  }

  function moveDev(){
    var host = el('v880-dev'); if (!host) return;
    /* index.html 側で data-v15-dev="1" を付けた開発診断ブロックだけを収容する */
    var list = document.querySelectorAll('#settingsPanel [data-v15-dev="1"]');
    for (var i = 0; i < list.length; i++){
      if (list[i].parentNode === host) continue;
      if (host.contains(list[i])) continue;
      if (moveInto(list[i], host)) stats.devMoved++;
    }
  }

  function applyDevGate(){
    var on = devOn();
    var sec = el('v880-sec-dev'), fold = el('v880-dev');
    if (sec) sec.classList.toggle('v880-hidden', !on);
    if (fold){
      fold.classList.toggle('v880-hidden', !on);
      if (!on && fold.open) fold.open = false;
    }
  }

  /* ---------- テンプレライブラリの topbar 退役（裁定 F5） ---------- */
  function retireTemplateBtn(){
    var b = el(RETIRE_BTN_ID); if (!b) return;
    var on = devOn();
    /* ★fixP0 の封鎖には触らない。ここは topbar からの見え方だけ。 */
    if (!on){
      if (b.style.display !== 'none'){ b.style.display = 'none'; stats.retired++; }
      b.setAttribute('data-v880-retired', '1');
    } else {
      if (b.getAttribute('data-v880-retired') === '1'){ b.style.display = ''; b.removeAttribute('data-v880-retired'); }
    }
  }

  function apply(){
    if (off()) return;
    try {
      injectStyle();
      if (!build()) return;
      moveKnobs(); moveDanger(); moveDev();
      applyDevGate(); retireTemplateBtn();
      stats.applies++;
    } catch(e){ try { console.warn(TAG, 'apply failed'); } catch(_){} }
  }

  function boot(){
    if (off()){ try { console.log(TAG, 'disabled (v292Dfix880Off)'); } catch(e){} return; }
    apply();
    /* 後着 inject（features.js / fix192 は interval で topbar を作り直す）に追従 */
    try { setInterval(apply, 2000); } catch(e){}
    try {
      var tb = el('topbar');
      if (tb) new MutationObserver(function(){ apply(); }).observe(tb, { childList: true });
    } catch(e){}
    try { console.log(TAG, 'armed (dev=' + (devOn() ? 'on' : 'off') + ')'); } catch(e){}
  }

  window.__v292Dfix880 = {
    version: VERSION,
    api: {
      apply: apply, devOn: devOn, isOff: off,
      DEV_KEYS: DEV_KEYS, KNOB_IDS: KNOB_IDS, RETIRE_BTN_ID: RETIRE_BTN_ID,
      state: function(){ var o = {}; for (var k in stats) o[k] = stats[k]; o.dev = devOn(); return o; }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
