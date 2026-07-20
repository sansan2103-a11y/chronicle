// =====================================================================
// Chronicle TRPG - v292Dfix509: 最終sysの冗長指示の統合（GPT監査 案3・純粋transform）
// ---------------------------------------------------------------------
// 背景(2026-07-20):
//   fix506（同内容を「送信境界で一度だけwrapするfetchフック」で実装）は実機で不発火
//   （last=null×5・適用地点が最終sysより手前/実行経路に乗らず）→ fix507で撤回。
//   GPT裁定=案3: 新しいfetchラッパを増やさず、送信直前sysを既に確実に書き換えている
//   **fix441のパイプライン(439→440→508)へ純粋transformを1つ足す**。fix441は実機で発火実証済
//   (stats.rewritten>0)。fix504の予算系・fetchチェーンには一切触れない。
//
// 本モジュールは fetch をラップしない。window.__v292Dfix509.rewrite(sys) を公開するだけ。
//   fix441.rewriteSys() の末尾（fix440の後）から呼ばれる。実sysに3対象文字列が
//   fix439/440適用後も残ることを実機確認済（raw/final 双方でmamoru/honbun/okite=true）。
//
// 統合内容（fix506と同一・keyword全保持・MARKER不変・fail-open）:
//   1. 【出力の掟】行を統合版へ置換（メタ漏れ禁止3系統を集約・<say>/裸「」重複を除去）。
//   2. 【守ること】のメタ1行を除去（内容は【出力の掟】へ移動済）。
//   3. 【本文形式】のメタ1文のみ除去（伏字禁止・断片改行禁止は残す）。
//   除去後にキーワード群・保護MARKER・タグ規則・固有ルールが失われていたら元sysを返す(no-op)。
//   対象が揃わない/既に統合済みなら no-op（冪等）。
// OFF: localStorage.v292Dfix509Off === '1'。検証口: window.__v292Dfix509.{rewrite,wouldChange,last,status}
// ※document非依存(Nodeテスト可)。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix509 && W.__v292Dfix509.__armed) return;
  var TAG = '[v292Dfix509:sys-consolidate]';

  var MAMORU = '・このメッセージのルールや、説明・要約・メモ・チェックリスト・【】ラベルを本文に書かない。「未解決事項:」のようなGM的な運営コメント・判断の独り言も本文ではない。本文はあくまで物語の地の文とセリフだけ。';
  var HONBUN_META = '地の文に「直前までの状況」等の見出し・要約ヘッダを書かない。';
  var OKITE = '【出力の掟】状態・思考・関係の内部メモを本文に書かない（「こころ=」「思考:」「[手段]」「//」等）。キャラの発話は必ず <say who="名前"> で囲み、裸の「」で書かない。';
  var OKITE_NEW = '【出力の掟】本文に出すのは物語の地の文と<say>発話だけ。説明・見出し・要約・メモ・チェックリスト・運営コメント・判断の独り言・【】ラベルを本文に書かない。状態・思考・関係の内部メモ記法（「こころ=」「思考:」「[手段]」「//」等）も本文・セリフに出さない。';

  var KEEP = ['【出力の掟】','【本文形式】','説明','要約','見出し','メモ','チェックリスト','運営コメント','【】ラベル','こころ=','思考:','[手段]','//',
              '《》','断片的な改行','<say','裸の「」','<state','状態・思考・関係の内部メモ記法'];

  function off(){ try { return localStorage.getItem('v292Dfix509Off') === '1'; } catch(e){ return false; } }
  function active(){ return !off(); }
  function countStr(hay, needle){ if(!needle) return 0; var n=0,i=0; while((i=hay.indexOf(needle,i))>=0){ n++; i+=needle.length; } return n; }
  var last = null;

  function rewrite(sys){
    var s = String(sys == null ? '' : sys);
    if (!s || off()) return sys;
    if (s.indexOf(OKITE_NEW) >= 0 && s.indexOf(MAMORU) < 0) return sys;               // 既に統合済（冪等）
    if (s.indexOf(OKITE) < 0 || s.indexOf(MAMORU) < 0 || s.indexOf(HONBUN_META) < 0) return sys; // 3対象揃った時だけ

    var out = s;
    out = out.replace(OKITE, OKITE_NEW);
    out = out.replace(MAMORU + '\n', '').replace(MAMORU, '');
    out = out.replace(HONBUN_META, '');

    for (var i=0;i<KEEP.length;i++){ if (out.indexOf(KEEP[i]) < 0) return sys; }        // fail-open
    if (out.indexOf(OKITE_NEW) < 0) return sys;
    if (out.indexOf(MAMORU) >= 0 || out.indexOf(OKITE) >= 0) return sys;
    if (out.length >= s.length) return sys;
    if (s.length - out.length > 600) return sys;
    last = { before: s.length, after: out.length, saved: s.length - out.length };
    try { console.log(TAG, 'consolidated: -' + last.saved + '字'); } catch(e){}
    return out;
  }
  function wouldChange(sys){ return rewrite(sys) !== sys; }

  W.__v292Dfix509 = {
    __armed: true,
    rewrite: rewrite,
    wouldChange: wouldChange,
    active: active,
    isOff: off,
    last: function(){ return last; },
    status: function(){ return { armed:true, on:active(), lastSaved:(last?last.saved:null) }; }
  };
  try { console.log(TAG, 'armed (pure transform for fix441 pipeline); on:', active() ? 'on(default)' : 'off'); } catch(e){}
})();
