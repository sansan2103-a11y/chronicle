// =====================================================================
// Chronicle TRPG - v292DfixUI1: プレイ画面の「引き算」（Astra UI レビュー / GPT 裁定 UI_SUBTRACT・独立レーン C）
// ---------------------------------------------------------------------
//   表示だけを整える。保存・生成・送信・取り消しの処理、localStorage・通信・他スクリプトのコードには触れない。
//   (1) Asset v2 移行の入口: 画面左下の固定ボタン（入力欄に重なる）をプレイ画面から外す。
//       Owner（/auth/me の entitlement owner・active・匿名でない）のときだけ、⚙ 設定 → ⚙ システム →「詳細設定」の中に
//       同じボタンを置く。移行の処理・データ・サーバー側の許可（CHR_ASSET_V2_ALLOW / MIGRATION_ALLOW）は不変。
//   (2) 空の会話ログ: 0 ターンかつ会話ログが空のときだけ自動で畳む（見出しの細い帯だけ残す）。帯のボタンで手動開閉。
//       会話が 1 件でも出たら自動で開く（従来の独立スクロール）。全ターン強制で閉じることはしない。
//   (3) 補助操作: 「👻怪異」「🖼アイコン（大きさ・顔の寄せ）」を既存の設定（fix880 の「詳細設定」）へ移す（fix880 と同じ移し方）。
//       「⏩ オート」「✨展開を提案」は入力欄の下の「⋯ その他」の中へ（1 段だけ・新しい画面は作らない）。
//       DO / SAY / STORY・入力欄・送信・続きを書く・生成し直す・取り消す・取消を戻すはその場に残す。
//   (4) 名前: やり直す→生成し直す / ↩ 取消→↩ 取り消す / ↪ 戻す→↪ 取消を戻す / 👁 見る→🖼 場面を絵に / 送信ボタンの「▶」→「送信 ▶」。
//       読み上げ名（aria-label）は見た目の名前から先頭の記号（↩ ↪ 🖼 ▶）を除いた同じ文字列（GPT #127-LQ: 可視名と一致）。
//   r2（GPT #127-LQ C-R1/C-R2）: redo を「取消を戻す」へ。移行の入口は Owner と beta（サーバーが移行を許す可能性のある口座）の設定内に残す。
//       「⋯ その他」は入力欄にフォーカスした・送信した・Esc で自動で閉じる。
//       ボタンの textContent は変えない（他のスクリプトが文字でボタンを探しているため）。見た目の文字だけを CSS で差し替える。
//       「▶ 物語を始める」の下に、入力して送信との違いを 1 行添える（機能はそのまま）。
//   kill: localStorage v292DfixUI1Off='1'（読み込み時に何もしない＝bundle42-a と同じ画面）
//   部分 kill: v292DfixUI1MigOff / v292DfixUI1DlgOff / v292DfixUI1AuxOff / v292DfixUI1LabelOff = '1'
//   観測口: window.__v292DfixUI1.status()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixUI1) return;
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  if (lsg('v292DfixUI1Off') === '1') { window.__v292DfixUI1 = { off: true, status: function(){ return { off: true }; } }; return; }
  var SUB = { mig: lsg('v292DfixUI1MigOff') !== '1', dlg: lsg('v292DfixUI1DlgOff') !== '1', aux: lsg('v292DfixUI1AuxOff') !== '1', label: lsg('v292DfixUI1LabelOff') !== '1' };
  var VERSION = 'v292DfixUI1-20261024-r2';
  var st = { version: VERSION, sub: SUB, ticks: 0, mig: { owner: null, placed: false, hiddenOnPlay: 0, rule: 'owner|beta,active,!anon' }, dlg: { collapsed: null, auto: null, manual: null, toggles: 0 }, aux: { moved: {}, more: false }, label: { applied: 0, released: 0 } };
  function $(id){ try { return document.getElementById(id); } catch(e){ return null; } }
  function getS(){ try { return window.__chronicleGetState ? window.__chronicleGetState('ui1') : null; } catch(e){ return null; } }

  /* ---------------- CSS ---------------- */
  var CSS = [
    /* (1) 移行ボタン: プレイ画面（body 直下）では出さない。設定の中に置いたものだけ見える */
    SUB.mig ? 'html body > #v292Dav2-migrate-entry{display:none !important}' : '',
    SUB.mig ? '#ui1-admin{margin:10px 0 4px;padding:8px 10px;border:1px dashed rgba(224,192,128,.45);border-radius:8px;font-size:12px;color:var(--dim,#999)}' : '',
    SUB.mig ? '#ui1-admin[hidden]{display:none !important}' : '',
    SUB.mig ? 'html body #ui1-admin #v292Dav2-migrate-entry{position:static !important;left:auto !important;bottom:auto !important;z-index:auto !important;opacity:1 !important;margin:6px 0 0 !important}' : '',
    /* (2) 空の会話ログを畳む（帯だけ残す）。開いているときは何も足さない＝従来どおり */
    SUB.dlg ? '#ui1-dlg-toggle{margin-left:8px;padding:2px 10px;border-radius:999px;border:1px solid var(--border,rgba(139,118,240,.3));background:var(--s2,#17172a);color:var(--tx,#e0def0);font:inherit;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;min-height:24px}' : '',
    SUB.dlg ? 'html body.ui1-dlg-collapsed #content-cols #dialogue-stream{display:none !important}' : '',
    SUB.dlg ? 'html body.ui1-dlg-collapsed #content-cols #dialogue-col{flex:0 0 auto !important;height:auto !important;min-height:0 !important;max-height:none !important;overflow:hidden !important}' : '',
    SUB.dlg ? 'html body.ui1-dlg-collapsed #content-cols #narrative-col{flex:1 1 auto !important;max-height:none !important;min-height:0 !important}' : '',
    SUB.dlg ? '@media (min-width:761px){html body.ui1-dlg-collapsed #content-cols{flex-direction:column !important}}' : '',
    /* (3) その他（オート・展開を提案）。1 段だけの開閉 */
    SUB.aux ? '#ui1-more{display:none;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;padding:6px;border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;background:rgba(255,255,255,.02)}' : '',
    SUB.aux ? '#ui1-more.ui1-open{display:flex}' : '',
    SUB.aux ? '#ui1-more > button{flex:0 0 auto}' : '',
    SUB.aux ? '#ui1-more .ui1-legend{flex:1 1 100%;font-size:11px;line-height:1.6;color:var(--dim,#999);margin-top:2px}' : '',
    SUB.aux ? '#ui1-more-btn{flex:0 0 auto !important;padding-left:10px !important;padding-right:10px !important}' : '',
    SUB.aux ? '#ui1-more-btn[aria-expanded="true"]{color:var(--tx,#e0def0);border-color:rgba(139,118,240,.6)}' : '',
    SUB.aux ? '#ui1-start-note{font-size:12px;color:var(--dim,#999);margin-top:6px;line-height:1.6}' : '',
    /* (4) 見た目の名前だけ差し替える（textContent は元のまま） */
    SUB.label ? 'html body #composer button[data-ui1-label],html body #topbar button[data-ui1-label]{font-size:0 !important}' : '',
    SUB.label ? 'html body #composer button[data-ui1-label]::after,html body #topbar button[data-ui1-label]::after{content:attr(data-ui1-label);font-size:var(--ui1-fs,13px);line-height:1.25;white-space:nowrap}' : '',
    /* iPhone 幅: 操作の行を 1 行に収める（文字を少し小さく・折り返さない） */
    (SUB.aux || SUB.label) ? '@media (max-width:520px){html body #composer .tool-row{gap:4px !important}html body #composer .tool-row > button{flex:1 1 auto !important;min-width:0 !important;padding-left:2px !important;padding-right:2px !important;font-size:12px !important;white-space:nowrap !important;overflow:hidden;--ui1-fs:12px !important}html body #composer .tool-row > button[data-ui1-label]{font-size:0 !important}html body #composer .tool-row > #ui1-more-btn{flex:0 0 auto !important}}' : ''
  ].filter(Boolean).join('\n');
  function injectCss(){
    try { var s = $('v292DfixUI1-style'); if (!s){ s = document.createElement('style'); s.id = 'v292DfixUI1-style'; (document.head || document.documentElement).appendChild(s); } if (s.textContent !== CSS) s.textContent = CSS; } catch(e){}
  }

  /* ---------------- (1) Asset v2 移行の入口 ---------------- */
  /* r2 (GPT #127-LQ C-R2): 入口を出す口座 = /auth/me が active・匿名でない・entitlement が owner か beta。
     サーバー側では移行の各段階を許す口座が CHR_ASSET_V2_ALLOW / CHR_ASSET_V2_MIGRATION_ALLOW で決まり（entitlement は問わない）、
     /auth/me にはその答えが無いので、旧来この入口が出ていた口座（assetV2Beta / assetV2New = owner / beta）をそのまま対象にする。
     実行できるかはサーバーが判定する（UI では判定しない）。 */
  function migEligible(){
    try {
      var F = window.__v292Dfix893; var me = (F && typeof F.serverMe === 'function') ? F.serverMe() : null;
      if (!me || me.status !== 'active' || (me.entitlement !== 'owner' && me.entitlement !== 'beta')) return false;
      var A = window.__v292Dfix886 && window.__v292Dfix886.api; if (A && typeof A.active === 'function' && A.active()) return false;
      return true;
    } catch(e){ return false; }
  }
  function adminHost(){
    var box = $('ui1-admin'); if (box) return box;
    var host = $('v880-detail') || document.querySelector('#settingsPanel .mpanel-body'); if (!host) return null;
    box = document.createElement('div'); box.id = 'ui1-admin'; box.hidden = true;
    var t = document.createElement('div'); t.textContent = '画像の方式の移行（移行を許可されたアカウント向け。遊び方には関係しません。実行できるかはサーバーが判定します）'; box.appendChild(t);
    host.appendChild(box); return box;
  }
  function sweepMig(){
    var entry = $('v292Dav2-migrate-entry'); var owner = migEligible(); st.mig.owner = owner;
    var box = $('ui1-admin');
    if (!entry){ if (box) box.hidden = true; st.mig.placed = false; return; }
    if (!owner){
      /* 一般ユーザー: 設定の中に置いていたら body へ戻す（CSS で見えない）。どこにも出さない */
      if (box && box.contains(entry)){ (document.body || document.documentElement).appendChild(entry); }
      if (box) box.hidden = true; st.mig.placed = false;
      if (entry.parentNode === document.body) st.mig.hiddenOnPlay++;
      return;
    }
    box = adminHost(); if (!box){ st.mig.placed = false; return; }
    if (entry.parentNode !== box){ box.appendChild(entry); }
    box.hidden = false; st.mig.placed = true;
  }

  /* ---------------- (2) 空の会話ログ ---------------- */
  var manual = null;   /* { collapsed: bool, key: 'E'|'N' } — 空/非空が変わったら手動の選択は外す */
  function dlgEls(){ var col = $('dialogue-col'); var stream = $('dialogue-stream'); var hdr = col ? col.querySelector('.col-hdr') : null; return { col: col, stream: stream, hdr: hdr }; }
  function countSays(stream){ try { var n = stream.querySelectorAll('.v292-dlg-card').length; if (n) return n; return String(stream.textContent || '').trim() ? 1 : 0; } catch(e){ return 0; } }
  function sweepDlg(){
    var e = dlgEls(); if (!e.col || !e.stream || !e.hdr) return;
    var S = getS(); var turns = (S && Array.isArray(S.turns)) ? S.turns.length : null;
    var says = countSays(e.stream);
    var empty = (turns === 0) && says === 0;
    var key = empty ? 'E' : 'N';
    if (manual && manual.key !== key) manual = null;
    var auto = empty; var collapsed = manual ? manual.collapsed : auto;
    st.dlg.auto = auto; st.dlg.manual = manual ? manual.collapsed : null; st.dlg.collapsed = collapsed; st.dlg.turns = turns; st.dlg.says = says;
    if (document.body.classList.contains('ui1-dlg-collapsed') !== collapsed) document.body.classList.toggle('ui1-dlg-collapsed', collapsed);
    var b = $('ui1-dlg-toggle');
    if (!b){
      b = document.createElement('button'); b.type = 'button'; b.id = 'ui1-dlg-toggle';
      b.addEventListener('click', function(ev){ try { ev.stopPropagation(); } catch(_){} var cur = document.body.classList.contains('ui1-dlg-collapsed'); var e2 = dlgEls(); var S2 = getS(); var t2 = (S2 && Array.isArray(S2.turns)) ? S2.turns.length : null; manual = { collapsed: !cur, key: ((t2 === 0) && e2.stream && countSays(e2.stream) === 0) ? 'E' : 'N' }; st.dlg.toggles++; sweepDlg(); });
      e.hdr.appendChild(b);
    }
    var label = collapsed ? ('▸ 開く' + (says ? '（' + says + '件）' : '（まだ発言はありません）')) : '▾ たたむ';
    if (b.textContent !== label) b.textContent = label;
    b.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    b.title = collapsed ? '会話ログを開く' : '会話ログをたたんで本文を広くする';
  }

  /* ---------------- (3) 補助操作 ---------------- */
  function moveKnob(wrap, key){
    var host = $('v880-detail'); var kn = host && host.querySelector('.v880-knobs'); if (!kn || !wrap) return;   /* fix880 が無ければ動かさない（従来の topbar のまま） */
    if (wrap.parentNode === kn) return;
    if (wrap === document.body || wrap.id === 'topbar' || wrap.id === 'settingsPanel') return;
    wrap.classList.add('v880-knob'); wrap.classList.remove('v243-foldable'); wrap.style.marginLeft = '';
    kn.appendChild(wrap); st.aux.moved[key] = (st.aux.moved[key] || 0) + 1;
  }
  function sweepKnobs(){
    var c = $('v292-creepy-sel'); if (c && c.parentNode) moveKnob(c.parentNode, 'creepy');
    var le2 = $('v292DfixLE2-ctl'); if (le2) moveKnob(le2, 'iconFace');
    else { var is1 = $('v292DfixIS1-ctl'); if (is1) moveKnob(is1, 'iconSize'); }
  }
  function findBtn(re, root){ var bs = (root || document).querySelectorAll('button'); for (var i = 0; i < bs.length; i++){ var t = (bs[i].textContent || '').trim(); if (re.test(t)) return bs[i]; } return null; }
  function moreBox(row){
    var box = $('ui1-more');
    if (!box){
      box = document.createElement('div'); box.id = 'ui1-more'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'その他の操作');
      var lg = document.createElement('div'); lg.className = 'ui1-legend';
      lg.textContent = '生成し直す＝直前のターンを同じ入力でもう一度書かせる ／ ↩ 取り消す＝直前のターンを消す（確認あり） ／ ↪ 取消を戻す＝取り消したターンを元の位置に戻す';
      box.appendChild(lg);
      row.parentNode.insertBefore(box, row.nextSibling);
      box.addEventListener('click', function(ev){ try { var b = ev.target && ev.target.closest ? ev.target.closest('button') : null; if (b) setTimeout(function(){ setMore(false); }, 0); } catch(_){} });
    }
    return box;
  }
  function setMore(open){ var box = $('ui1-more'), b = $('ui1-more-btn'); if (box) box.classList.toggle('ui1-open', !!open); if (b){ b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.textContent = open ? '⋯ 閉じる' : '⋯ その他'; } st.aux.more = !!open; }
  function sweepTools(){
    var row = document.querySelector('#composer .tool-row'); if (!row || !row.parentNode) return;
    var box = moreBox(row); var lg = box.querySelector('.ui1-legend');
    var teian = document.querySelector('.v292Dfix140-propose-btn'); var auto = document.querySelector('.v292Dfix406-btn');
    /* fix406 は ⏩オートを「展開を提案」の左へ置き直すので、提案ボタンを移せばオートもついて来る。ちらつかないよう同時に移す */
    if (teian && teian.parentNode !== box) box.insertBefore(teian, lg);
    if (auto && auto.parentNode !== box){ if (teian && teian.parentNode === box) box.insertBefore(auto, teian); else box.insertBefore(auto, lg); }
    var mb = $('ui1-more-btn');
    if (!mb){ mb = document.createElement('button'); mb.type = 'button'; mb.id = 'ui1-more-btn'; mb.className = 'tbtn'; mb.textContent = '⋯ その他'; mb.setAttribute('aria-expanded', 'false'); mb.setAttribute('aria-controls', 'ui1-more'); mb.title = 'オート・展開を提案・ボタンの説明';
      mb.addEventListener('click', function(){ setMore(!(box.classList.contains('ui1-open'))); }); row.appendChild(mb); }
    else if (mb.parentNode !== row || row.lastElementChild !== mb) row.appendChild(mb);
  }
  function sweepStartNote(){
    var wa = $('welcomeActions'); if (!wa) return; var sb = wa.querySelector('button[onclick*="startScene"]'); if (!sb) return;
    if ($('ui1-start-note')) return;
    var n = document.createElement('div'); n.id = 'ui1-start-note'; n.textContent = '最初の場面を AI が書きます。自分で始めるときは、下の入力欄に書いて「送信 ▶」。';
    sb.parentNode.insertBefore(n, sb.nextSibling);
  }

  /* ---------------- (4) 名前（見た目だけ） ---------------- */
  /* src = いまの textContent。一致するときだけ差し替え、他のスクリプトが文字を変えたら（生成中…など）元の表示へ戻す */
  var LABELS = [
    { sel: function(){ return findBtn(/^やり直す$/, document.querySelector('#composer')); }, src: 'やり直す', to: '生成し直す', aria: '生成し直す' },
    { sel: function(){ return findBtn(/^↩\s*取消$/, document.querySelector('#composer')); }, src: '↩ 取消', to: '↩ 取り消す', aria: '取り消す' },
    { sel: function(){ return $('v33-redo-btn'); }, src: '↪ 戻す', to: '↪ 取消を戻す', aria: '取消を戻す' },
    { sel: function(){ return $('v315-btn'); }, src: '👁 見る', to: '🖼 場面を絵に', aria: '場面を絵に' },
    { sel: function(){ return $('sendBtn'); }, src: '▶', to: '送信 ▶', aria: '送信' }
  ];
  var tracked = [];
  function sweepLabels(){
    LABELS.forEach(function(L){
      var b = null; try { b = L.sel(); } catch(e){}
      if (!b) return;
      if (tracked.indexOf(b) < 0) tracked.push(b);
      var t = (b.textContent || '').trim();
      var want = (t === L.src);
      var has = b.getAttribute('data-ui1-label') !== null;
      if (want && !has){
        if (b.getAttribute('data-ui1-aria-prev') === null) b.setAttribute('data-ui1-aria-prev', b.getAttribute('aria-label') || '');
        try { var fs = getComputedStyle(b).fontSize; if (fs && fs !== '0px') b.style.setProperty('--ui1-fs', fs); } catch(e){}
        b.setAttribute('data-ui1-label', L.to); b.setAttribute('aria-label', L.aria); st.label.applied++;
      } else if (!want && has){
        b.removeAttribute('data-ui1-label'); var pa = b.getAttribute('data-ui1-aria-prev'); if (pa) b.setAttribute('aria-label', pa); else b.removeAttribute('aria-label'); st.label.released++;
      }
    });
  }

  /* ---------------- loop ---------------- */
  function tick(){
    st.ticks++;
    injectCss();
    if (!$('composer')) return;   /* 物語画面だけ */
    try { if (SUB.mig) sweepMig(); } catch(e){ st.err = 'mig:' + String(e).slice(0, 80); }
    try { if (SUB.dlg) sweepDlg(); } catch(e){ st.err = 'dlg:' + String(e).slice(0, 80); }
    try { if (SUB.aux){ sweepKnobs(); sweepTools(); sweepStartNote(); } } catch(e){ st.err = 'aux:' + String(e).slice(0, 80); }
    try { if (SUB.label) sweepLabels(); } catch(e){ st.err = 'label:' + String(e).slice(0, 80); }
  }
  var pending = false; function soon(){ if (pending) return; pending = true; setTimeout(function(){ pending = false; tick(); }, 150); }
  function boot(){
    tick();
    /* r2: 「⋯ その他」を開いたままにして入力欄・送信の場所を取り続けない（入力欄にフォーカス・送信・Esc で閉じる） */
    try {
      document.addEventListener('focusin', function(ev){ try { if (ev.target && ev.target.id === 'inp' && st.aux.more) setMore(false); } catch(_){} }, true);
      document.addEventListener('click', function(ev){ try { var b = ev.target && ev.target.closest ? ev.target.closest('#sendBtn') : null; if (b && st.aux.more) setMore(false); } catch(_){} }, true);
      document.addEventListener('keydown', function(ev){ try { if (ev.key === 'Escape' && st.aux.more) setMore(false); } catch(_){} }, true);
    } catch(e){}
    try { setInterval(tick, 1000); } catch(e){}
    try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, characterData: true }); } catch(e){}
  }
  window.__v292DfixUI1 = { version: VERSION, off: false, status: function(){ try { return JSON.parse(JSON.stringify(st)); } catch(e){ return null; } }, tick: tick, setMore: setMore };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  try { console.log('[v292DfixUI1] armed', VERSION); } catch(e){}
})();
