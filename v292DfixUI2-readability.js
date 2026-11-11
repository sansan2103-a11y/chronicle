// v292DfixUI2: 読みやすさの小修正（CSS だけ・ロジック無し・保存/同期/生成には触れない）
// 1 入力欄の例文が切れない  2 「その他」を開いても本文が潰れない（背の低い画面だけ説明文を畳む）
// 3 ホームの主ボタンを 1 つに（続きから遊ぶ）  4 削除シートの実行ボタンを下に固定  5 PC 詳細ボタンの折り返し/シナリオ行のはみ出し
// kill: localStorage v292DfixUI2Off='1' → 何も入れない（従来の見た目）
(function(){
  'use strict';
  try { if (localStorage.getItem('v292DfixUI2Off') === '1') return; } catch (e) {}
  var css = [
    /* 1 入力欄: 例文(placeholder)を小さく・2 行を許す高さ（入力文字は 16px のまま＝iOS のズーム回避） */
    '@media (max-width:520px){',
    'html body #inp{min-height:56px}',
    'html body #inp::placeholder{font-size:12.5px;line-height:1.35}',
    /* 2 背の低い画面で「その他」を開いたとき、説明文(3 行)を畳んで本文を残す（ボタンの名前だけで足りる） */
    '}',
    '@media (max-width:520px) and (max-height:800px){html body #ui1-more .ui1-legend{display:none}}',
    /* 小さすぎる文字・指で押しにくい ✎編集 を少しだけ */
    '@media (max-width:520px){',
    'html body #ui1-dlg-toggle{font-size:12px;padding:4px 12px}',
    'html body .edit-btn{min-height:32px;font-size:13px}',
    '}',
    /* 3 ホームの主ボタン 1 つ化は Owner 判断で見送り（2026-11-11） */
    /* 4 削除シート: 実行/やめるを常に見える位置へ */
    '#dl2sheet .dl2btns{position:sticky;bottom:-18px;z-index:2;background:#1b1b20;padding:10px 0 12px;margin:12px 0 -18px;border-top:1px solid #33333c}',
    /* 5 PC 詳細ボタンの 1 文字折り返し・シナリオ行のはみ出し */
    'html body #detail .mini{display:flex;flex-wrap:wrap;gap:6px}',
    'html body #detail .mini button{white-space:nowrap;flex:1 1 auto}',
    '@media (max-width:520px){html body .sc-row{flex-direction:column;gap:4px}html body .sc-row .sc-m{white-space:normal;font-size:12px}}'
  ].join('\n');
  function put(){
    if (document.getElementById('v292DfixUI2-style')) return;
    var s = document.createElement('style'); s.id = 'v292DfixUI2-style'; s.textContent = css;
    (document.body || document.documentElement).appendChild(s);
  }
  put();
})();
