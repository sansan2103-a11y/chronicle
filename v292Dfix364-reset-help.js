// =====================================================================
// Chronicle TRPG - v292Dfix364: リセット2種の説明をライトユーザー向けに明示
// おしん(2026-07-03)「物語リセット押しても反映されない/完全リセットの説明もおかしい。
//   ライトユーザーにわかりやすく」。真因＝機能は正常だが2種の違いが伝わらない:
//   ・物語リセット(設定は保持)=会話ログ/展開だけ消す。世界観・キャラ・設定・APIキーは残る
//     →世界観が残るので「リセットされてない」と誤認しやすい
//   ・完全リセット=全部(世界観・キャラ・設定・APIキー)を消してまっさら・取り消し不可
//     (実装はchr6_epochを進める論理全消し。体感は「全削除」で説明と一致)
// 対応: 両ボタンの下に常時見える平易な1行説明を差し込む(選ぶ前に読める=一瞬の確認より効く)。
//   コア不触・DOM追加のみ・ポーリング冪等・classList不使用(単純append)。
// OFF: localStorage v292Dfix364Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix364) return; window.__v292Dfix364 = true;
  var TAG = '[v292Dfix364:resetHelp]';
  function off(){ try{ return localStorage.getItem('v292Dfix364Off')==='1'; }catch(e){ return false; } }

  // v292Dfix365: 配布版はAPIキーを持たない(プロキシ方式・合言葉/Googleログイン)。
  //   完全リセット(chr6_epoch)は世界観/キャラ/スロット/設定を消すが、ログイン系
  //   (v292ProxyPass/v292GoogleToken)はepoch外で残る=ログイン維持。よって「APIキー削除」は
  //   配布版には不正確→「ログインはそのまま」に修正。
  var HELP_STORY = '📖 会話ログと展開だけ消して、最初の場面に戻ります。世界観・キャラ・設定・ログインはそのまま残ります。';
  var HELP_FULL  = '⚠️ 世界観・キャラ・すべてのスロット・設定を消してまっさらにします（取り消せません）。ログイン（合言葉／Googleログイン）はそのまま使えます。';

  function mkNote(text){
    var d = document.createElement('div');
    d.className = 'v292-reset-note';
    d.textContent = text;
    d.style.cssText = 'font-size:11px;line-height:1.5;opacity:.7;margin:4px 2px 10px;';
    return d;
  }

  function inject(){
    if (off()) return;
    try {
      var btns = Array.prototype.slice.call(document.querySelectorAll('#settingsOv button'))
        .filter(function(b){ return /リセット/.test(b.textContent); });
      btns.forEach(function(b){
        var isFull = b.textContent.indexOf('完全') >= 0;
        var row = b.parentElement; // .mpanel-footer-danger (2ボタン横並び)
        if (!row) return;
        // 行ごとに1回だけ、行の直後にまとめて2種の説明を出す
        var host = row.parentElement || row;
        if (host.querySelector && host.querySelector('.v292-reset-note-wrap')) return;
        // 行の直後に説明ラッパを挿入(物語→完全の順)
        var wrap = document.createElement('div');
        wrap.className = 'v292-reset-note-wrap';
        wrap.appendChild(mkNote(HELP_STORY));
        wrap.appendChild(mkNote(HELP_FULL));
        if (row.nextSibling) host.insertBefore(wrap, row.nextSibling);
        else host.appendChild(wrap);
      });
    } catch(e){ try{ console.warn(TAG, e); }catch(_){} }
  }

  inject();
  setInterval(inject, 2000); // 設定モーダル再構築に追従(冪等)

  try{ console.log(TAG, 'loaded', off()?'OFF':'ON'); }catch(_){}
})();
