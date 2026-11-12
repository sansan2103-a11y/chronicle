// v292DfixUI3: 見た目の小さな手直し（CSS と、表示だけの言い換え。保存・同期・生成・削除の動きには触れない）
// 1 iPhone 幅: 押しにくい小さなボタン／チェック欄を少し大きく（削除の帯・削除/空き容量シートのチェック・設定の ✕・キャラ一覧のボタン）
// 2 iPhone 幅: 「物語を紡いでいます…」の表示が見出しの文字と半分重なるのを、見出しの行まで覆う高さに
// 3 iPhone 幅: 「削除が止まっている物語」の帯が画面の最下部を隠さないよう、HOME の下に余白
// 4 表示の言い換え（保存されている文字は変えない・送る文も変えない）
//   ・「続きを書く」で送った内部の指示文「続きを自然に進めてください。」→「◈ 続きを書く」（fix415 と同じやり方）
//   ・キャラ一覧の「最終: T6（最新）」→「最終: 6ターン目（最新）」
//   ・キャラ一覧の主人公の案内から「（旧来の「アイコン再生成」は使いません）」を外す
//   ・HOME の詳細の「続きから始める」→「続きから遊ぶ」（左の「▶ 続きから遊ぶ」とそろえる）
// kill: localStorage v292DfixUI3Off='1' → 何もしない（従来の見た目）
(function(){
  'use strict';
  try { if (localStorage.getItem('v292DfixUI3Off') === '1') return; } catch (e) {}
  if (window.__v292DfixUI3) return; window.__v292DfixUI3 = { n: 0 };
  var css = [
    '@media (max-width:520px){',
    /* 1 押しやすさ */
    'html body #dl2-bar{padding-left:8px;padding-right:8px}',
    'html body #dl2-bar button{min-height:40px;padding-top:6px;padding-bottom:6px;margin-left:6px}',
    'html body #dl2-bar button[data-dl2bar="x"]{min-width:36px}',
    'html body #dl2sheet input[type=checkbox],html body #s1bsheet input[type=checkbox]{width:22px;height:22px;flex:0 0 auto;margin-top:0}',
    'html body #settingsPanel .mclose{min-width:40px;min-height:40px}',
    'html body .v292Dfix145-modal button{min-height:36px}',
    /* 2 状態表示が見出しを半分だけ隠さない */
    'html body #topbar #topStatus{padding-top:7px;padding-bottom:8px;background:#141422}',
    /* 3 帯の下に隠れない */
    'html body:has(#dl2-bar){padding-bottom:64px}',
    '}'
  ].join('\n');
  function put(){
    if (document.getElementById('v292DfixUI3-style')) return;
    var s = document.createElement('style'); s.id = 'v292DfixUI3-style'; s.textContent = css;
    (document.body || document.documentElement).appendChild(s);
  }
  /* ---- 表示だけの言い換え（元の文は data-ui3orig に残す・同じ要素は 1 回だけ） ---- */
  var CONT = '続きを自然に進めてください。';
  var GUIDE_OLD = 'この物語の絵は、ここの「最初の絵を作る」「候補から選ぶ」「外見を設定」で作ります（旧来の「アイコン再生成」は使いません）';
  var GUIDE_NEW = 'この物語の絵は、ここの「最初の絵を作る」「候補から選ぶ」「外見を設定」で作ります';
  var LAST_RE = /^最終: T(\d+)(（[^）]*）)?$/;
  function swap(el, to){ if (!el || el.textContent === to) return; if (!el.hasAttribute('data-ui3orig')) el.setAttribute('data-ui3orig', el.textContent); el.textContent = to; window.__v292DfixUI3.n++; }
  function pass(){
    try {
      var i, a;
      a = document.querySelectorAll('#story .player-line .ptext');
      for (i = 0; i < a.length; i++) if (a[i].children.length === 0 && String(a[i].textContent).replace(/\s+/g, '') === CONT) swap(a[i], '◈ 続きを書く');
      a = document.querySelectorAll('[data-fg3-hero-guide]');
      for (i = 0; i < a.length; i++) if (a[i].children.length === 0 && a[i].textContent === GUIDE_OLD) swap(a[i], GUIDE_NEW);
      a = document.querySelectorAll('.v292Dfix145-card span');
      for (i = 0; i < a.length; i++) { if (a[i].children.length) continue; var m = LAST_RE.exec(a[i].textContent || ''); if (m) swap(a[i], '最終: ' + m[1] + 'ターン目' + (m[2] || '')); }
      var pb = document.getElementById('playBtn');
      if (pb && pb.children.length === 0 && pb.textContent === '続きから始める') swap(pb, '続きから遊ぶ');
    } catch (e) {}
  }
  var queued = false;
  function soon(){ if (queued) return; queued = true; setTimeout(function(){ queued = false; pass(); }, 60); }
  function arm(){
    put(); pass();
    try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    try { setInterval(pass, 1500); } catch (e) {}
  }
  if (document.body) arm(); else document.addEventListener('DOMContentLoaded', arm);
})();
