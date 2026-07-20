// =====================================================================
// Chronicle TRPG - v292Dfix506: 最終sysの冗長指示の統合（P0・GPT監査ロードマップ）
// ---------------------------------------------------------------------
// 背景(2026-07-20・GPTプロンプト品質監査):
//   最終sysで「メタを本文に出すな」系の禁止が3系統に分散し、密度が高く追従性を下げていた。
//   同義が散ると各々が弱く感じられ、モデルが守りにくい。GPT推奨=末尾recencyの【出力の掟】へ
//   1本化。加えて【出力の掟】末尾の<say>/裸「」規則はタグ規則ブロックと完全重複→除去。
//   ★MARKER文字列は一切変えない（fix459の道連れ削除の前歴=fix496事件を回避）。
//   ★キーワードは1つも捨てない（説明/要約/見出し/メモ/チェックリスト/運営コメント/内部記法）。
//   固有ルール（人物名の伏字禁止《》/読点ごとの断片改行禁止）は【本文形式】に残す。
//
// 変換（送信境界の最終sysに対し、全一致でのみ実行）:
//   1. 【出力の掟】行を統合版へ置換（メタ全種を集約・say重複を除去）。
//   2. 【守ること】のメタ1行を除去（内容は【出力の掟】へ移動済み）。
//   3. 【本文形式】のメタ1文だけ除去（伏字禁止・断片改行禁止は残す）。
//
// 安全装置(fail-open・不変条件の事後検証):
//   変換後に、集約したキーワード群・保護MARKER・タグ規則・固有ルールのいずれかが失われていたら
//   【元のsysをそのまま返す】(no-op)。対象が揃っていない/既に統合済みなら no-op（冪等）。
//
// 配置(デプロイ時): index.html で v292Dfix441 の【直前】（fix500と同様に最内・送信直前）。
//   fix459再構築にもfix440追記にも一切フィードバックしない（MARKER不変条件を侵さない）。
// 既定ON（GPT: 低リスク高効果）。OFF: localStorage.v292Dfix506Off==='1'。
// 検証口: window.__v292Dfix506 = { consolidate, wouldChange, active, status, last }
// ※document非依存(Nodeテスト可)。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix506 && W.__v292Dfix506.__armed) return;
  var TAG = '[v292Dfix506:sys-consolidate]';

  // ---- 対象の実文字列（実機capture・2026-07-20） ----
  var MAMORU = '・このメッセージのルールや、説明・要約・メモ・チェックリスト・【】ラベルを本文に書かない。「未解決事項:」のようなGM的な運営コメント・判断の独り言も本文ではない。本文はあくまで物語の地の文とセリフだけ。';
  var HONBUN_META = '地の文に「直前までの状況」等の見出し・要約ヘッダを書かない。';
  var OKITE = '【出力の掟】状態・思考・関係の内部メモを本文に書かない（「こころ=」「思考:」「[手段]」「//」等）。キャラの発話は必ず <say who="名前"> で囲み、裸の「」で書かない。';
  var OKITE_NEW = '【出力の掟】本文に出すのは物語の地の文と<say>発話だけ。説明・見出し・要約・メモ・チェックリスト・運営コメント・判断の独り言・【】ラベルを本文に書かない。状態・思考・関係の内部メモ記法（「こころ=」「思考:」「[手段]」「//」等）も本文・セリフに出さない。';

  // 変換後に必ず生存すべきキーワード/マーカー（1つでも欠けたら fail-open で元を返す）
  var KEEP = ['【出力の掟】','【本文形式】','説明','要約','見出し','メモ','チェックリスト','運営コメント','【】ラベル','こころ=','思考:','[手段]','//',
              '《》','断片的な改行','<say','裸の「」','<state','状態・思考・関係の内部メモ記法'];

  function off(){ try { return localStorage.getItem('v292Dfix506Off') === '1'; } catch(e){ return false; } }
  function active(){ return !off(); }
  function countStr(hay, needle){ if(!needle) return 0; var n=0,i=0; while((i=hay.indexOf(needle,i))>=0){ n++; i+=needle.length; } return n; }
  var last = null;

  function consolidate(sys){
    var s = String(sys == null ? '' : sys);
    if (!s || off()) return sys;
    // 既に統合済み（冪等）
    if (s.indexOf(OKITE_NEW) >= 0 && s.indexOf(MAMORU) < 0) return sys;
    // 3対象すべて揃っている時だけ実行（部分的な状態には触れない）
    if (s.indexOf(OKITE) < 0 || s.indexOf(MAMORU) < 0 || s.indexOf(HONBUN_META) < 0) return sys;

    var out = s;
    out = out.replace(OKITE, OKITE_NEW);                 // 1. 出力の掟を統合版へ
    out = out.replace(MAMORU + '\n', '').replace(MAMORU, ''); // 2. 守ることのメタ行を除去
    out = out.replace(HONBUN_META, '');                  // 3. 本文形式のメタ1文のみ除去

    // ---- 不変条件の事後検証（fail-open） ----
    for (var i=0;i<KEEP.length;i++){ if (out.indexOf(KEEP[i]) < 0) return sys; }
    if (out.indexOf(OKITE_NEW) < 0) return sys;
    if (out.indexOf(MAMORU) >= 0 || out.indexOf(OKITE) >= 0) return sys; // 旧文が残っていたら異常
    if (out.length >= s.length) return sys;              // 短くなっていないと変（想定外）
    if (s.length - out.length > 600) return sys;         // 削りすぎ（想定外）は戻す
    last = { before: s.length, after: out.length, saved: s.length - out.length };
    try { console.log(TAG, 'consolidated: -' + last.saved + '字'); } catch(e){}
    return out;
  }
  function wouldChange(sys){ return consolidate(sys) !== sys; }

  // ---- fetch境界（fix500と同じ検出・fix441より内=最終形を掴む） ----
  var of = W.fetch;
  var wrapped = function(u, o){
    try {
      if (active() && o && o.method === 'POST' && o.body && /workers\.dev|openrouter/.test(String(u))){
        var b = JSON.parse(String(o.body));
        if (b && b.messages && b.messages.length){
          for (var i = 0; i < b.messages.length; i++){
            var m = b.messages[i];
            if (m && m.role === 'system' && typeof m.content === 'string' && m.content.length > 1500){
              var nv = consolidate(m.content);
              if (nv !== m.content){ m.content = nv; o = Object.assign({}, o, { body: JSON.stringify(b) }); }
              break;
            }
          }
        }
      }
    } catch(e){ try { console.warn(TAG, 'skip:', e && e.message); } catch(_){} }
    return of.apply(this, [u, o]);
  };
  // own props 全継承（fix419cの教訓・fix504の予算計上を乱さない）
  try {
    Object.getOwnPropertyNames(of).forEach(function(k){
      if (k==='length'||k==='name'||k==='arguments'||k==='caller'||k==='prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(of, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped,'name',{value:(of&&of.name)||'fetch',configurable:true}); } catch(e){}
    if (of && of.prototype){ try { wrapped.prototype = of.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix506 = true;
  W.fetch = wrapped;

  W.__v292Dfix506 = {
    __armed: true, consolidate: consolidate, wouldChange: wouldChange,
    active: active, off: off, last: function(){ return last; },
    status: function(){ return { armed:true, on:active() }; }
  };
  try { console.log(TAG, 'armed; on:', active() ? 'on(default)' : 'off'); } catch(e){}
})();
