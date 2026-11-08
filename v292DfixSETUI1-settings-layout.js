/* ★SETUI1 v292DfixSETUI1（laneSETUI1・Owner 2026-11-07 iPhone 実機: 設定が読みにくい）
   設定画面（⚙ 設定）の下の固定フッターが、スマホでは画面の大半を占めて、入力欄が 1cm ほどしか見えなかった。
   やること（表示の置き場所だけ。通信 0・保存 0・localStorage 書き込み 0・ボタンの id / onclick / 確認画面は 1 つも変えない）:
     - 固定フッターに残すのは「✔ 保存してゲーム開始」「閉じる」の 1 行だけ。
     - 🎲 おまかせで埋める／🎲 設定の空欄をAIで埋める／（結果表示）／説明文 → 🌍世界タブの先頭（スクロールする側）へ。説明文は畳んだ「ⓘ 説明」に。
     - 物語リセット／完全リセットとその説明 → ⚙システムタブ（fix880 の「物語の調整と、やり直し」があればその中、無ければ「リセット」の節）へ。確認画面はそのまま。
     - 利用規約などの行 → ⚙システムタブのいちばん下へ。
     - 電話幅（600px 以下）では設定画面を画面いっぱい（100dvh・safe-area 対応）にし、横スクロールを出さない。PC の見た目はほぼ同じ。
   動かすのは既存の要素そのもの（移動のみ）なので、fix275（タブ）・fix880（畳み）・fix360/363/364/436・ICONUX2 などが id で探す配線はそのまま動く。
   kill: localStorage v292DfixSETUI1Off='1'（再読み込みで従来のフッターのまま）。 */
(function () {
  'use strict';
  try { if (window.localStorage.getItem('v292DfixSETUI1Off') === '1') return; } catch (e) {}
  if (window.__v292DfixSETUI1) return;
  var st = { moved: { tools: 0, danger: 0, legal: 0, ai: 0 }, ticks: 0, version: 'SETUI1-a' };
  window.__v292DfixSETUI1 = { status: function () { return JSON.parse(JSON.stringify(st)); }, apply: function () { try { apply(); } catch (e) {} } };

  var css = [
    '#settingsPanel .setui1-tools{margin:6px 0 10px}',
    '#settingsPanel .setui1-tools > button{display:block}',
    '#settingsPanel details.setui1-info{margin-top:6px;font-size:12px}',
    '#settingsPanel details.setui1-info > summary{cursor:pointer;color:var(--dim);font-size:12px}',
    '#settingsPanel details.setui1-info > #b37-dice-note{margin-top:4px}',
    '#settingsPanel #setui1-reset{margin-top:4px}',
    '#settingsPanel #v888legalCfg.setui1-legal{margin:18px 0 6px;font-size:11px}',
    '#settingsPanel .mpanel-footer-main > button{flex:1}',
    '#settingsPanel .mpanel-footer-main > .btn-p{flex:2}',
    '@media (max-width:600px){',
    '  #settingsOv{bottom:auto;height:100vh;height:100dvh;padding:8px;padding-top:max(8px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom));padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right));overflow:hidden;box-sizing:border-box}',
    '  #settingsPanel{height:calc(100vh - 16px);height:100%;max-height:100%;margin:0;min-height:0}',
    '  #settingsPanel .mpanel-hdr{padding:10px 14px 8px}',
    '  #settingsPanel .mpanel-hdr h2{font-size:16px}',
    '  #settingsPanel .mpanel-body{padding:2px 14px 10px;min-height:0;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}',
    '  #settingsPanel .mpanel-body *{max-width:100%;box-sizing:border-box}',
    '  #settingsPanel .mpanel-body textarea{min-height:96px}',
    '  #settingsPanel .mpanel-body .fld label{line-height:1.5;overflow-wrap:anywhere}',
    '  #settingsPanel .mpanel-footer{padding:8px 14px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px))}',
    '  #settingsPanel .mpanel-footer-main > button{padding:10px 6px;font-size:14px}',
    '  #settingsPanel .setui1-tools > button{padding:9px 8px}',
    '}'
  ].join('\n');
  var el = document.createElement('style'); el.id = 'setui1css'; el.textContent = css;
  (document.head || document.documentElement).appendChild(el);

  function $(id) { return document.getElementById(id); }
  function find(sel) { return document.querySelector(sel); }
  function secByText(body, re) {
    var l = body.children;
    for (var i = 0; i < l.length; i++) { var c = l[i]; if (c.classList && c.classList.contains('sec') && re.test((c.textContent || '').trim())) return c; }
    return null;
  }
  function apply() {
    st.ticks++;
    var panel = $('settingsPanel'); if (!panel) return;
    var body = panel.querySelector('.mpanel-body'), foot = panel.querySelector('.mpanel-footer');
    if (!body || !foot) return;
    /* 1) 🎲 の塊（おまかせ／AI で埋める／結果／説明）→ 🌍世界タブの先頭（「世界設定」見出しの直後） */
    var res = $('b37-dice-result'), tools = res && res.parentNode;
    if (tools && foot.contains(tools) && tools !== foot) {
      var sec = secByText(body, /世界設定|^世界/);
      if (sec) {
        var note = $('b37-dice-note');
        if (note && !note.closest('details.setui1-info')) {
          var d = document.createElement('details'); d.className = 'setui1-info';
          var sm = document.createElement('summary'); sm.textContent = 'ⓘ 説明'; d.appendChild(sm);
          tools.appendChild(d); d.appendChild(note);
        }
        tools.classList.add('setui1-tools');
        tools.style.marginTop = '';
        body.insertBefore(tools, sec.nextSibling); st.moved.tools++;
      }
    }
    /* 2) リセット 2 種＋説明 → システムタブ */
    var dz = panel.querySelector('.mpanel-footer-danger'), nw = foot.querySelector('.v292-reset-note-wrap');
    if (dz && foot.contains(dz)) {
      var host = $('v880-detail');
      if (!host) {
        host = $('setui1-reset');
        if (!host) {
          var s2 = document.createElement('div'); s2.className = 'sec'; s2.id = 'setui1-sec-reset'; s2.textContent = 'リセット';   /* 文言が fix275 の割当を sys にする */
          host = document.createElement('div'); host.id = 'setui1-reset';
          body.appendChild(s2); body.appendChild(host);
        }
      }
      host.appendChild(dz); st.moved.danger++;
    }
    /* 説明（fix364）はリセット行のすぐ後ろへ。行の先（fix880 の畳みの中など）に既にあれば、フッターに残った重複だけ取り除く */
    if (dz && nw && foot.contains(nw)) {
      var par = dz.parentNode, have = par.querySelector('.v292-reset-note-wrap');
      if (have && have !== nw) { if (nw.parentNode) nw.parentNode.removeChild(nw); }
      else par.insertBefore(nw, dz.nextSibling);
      st.moved.danger++;
    }
    /* 2b) 「🛠 AIへの追加指示」（fix297 が枠の外＝フッターの下に足す）→ システムタブの中へ（スクロールする側。畳みなどの外側の包みごと動かす） */
    var ai = $('v292-ai-instr-wrap');
    if (ai) {
      var top = ai; while (top.parentNode && top.parentNode !== panel && top.parentNode !== body) top = top.parentNode;
      if (top.parentNode === panel && top !== body && top !== foot && !top.classList.contains('mpanel-hdr')) { body.appendChild(top); st.moved.ai = (st.moved.ai || 0) + 1; }
    }
    /* 3) 利用規約の行 → システムタブのいちばん下 */
    var lg = $('v888legalCfg');
    if (lg) {
      lg.classList.add('setui1-legal'); lg.style.marginTop = '';
      if (body.lastElementChild !== lg) { body.appendChild(lg); st.moved.legal++; }
    }
  }
  function boot() {
    try { apply(); } catch (e) {}
    try { setInterval(function () { try { apply(); } catch (e) {} }, 1000); } catch (e) {}
    try { var ov = $('settingsOv'); if (ov) new MutationObserver(function () { try { apply(); } catch (e) {} }).observe(ov, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  try { console.log('[v292DfixSETUI1] armed'); } catch (e) {}
})();
