// =====================================================================
// Chronicle TRPG - v292Dfix323: 内部スキーマと地の文の境界ガード(根治)
//   背景(おしんと2026-06-24に実プロンプト傍受で特定): 生成品質劣化の最深の根は
//     base プロンプトの設計ギャップだった:
//       根① sysに状態スキーマ語が大量(傷×10/関係×12…)＋前ターン状態も同ラベルで注入
//            されているのに「地の文に状態ラベルを書くな」という境界線が無い
//            (has_negative_guard=false)→劣化時にフォーマットが地の文へ滲む(=状態漏れ)。
//       根② 「続きを書く」の空アンカーで弱いアンチメタが突破され作業報告に滑る(=メタ漏れ)。
//       根③ キャラ識別ガードが無く似た名前(レナ/リナ)を混同・視点がぶれる。
//   対策(コア不触・全モデルに効く・無料): Planner.build 最外ラップで sys 末尾に3つの
//     境界ルールを毎ターン注入する。fix300/304と同方式。出力側で冪等(MARK重複注入を防ぐ)。
//     ★fix274が P.build の __v292* フラグを後続wrapへ継承するため、ラップ済みフラグは
//       非__v292名(__fix323wrap)を使う(誤スキップ回避)。
//   OFF: localStorage v292Dfix323Off='1'
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix323) return; window.__v292Dfix323 = true;
  var TAG = '[v292Dfix323:boundary]';
  function off(){ try { return localStorage.getItem('v292Dfix323Off') === '1'; } catch(e){ return false; } }

  var MARK = '【境界線ルール（内部管理と地の文の分離・最優先）】';
  var GUARD = [
    '',
    MARK,
    '・状態ラベル「からだ=」「こころ=」「本能=」「目的=」「傷=」「関係=」「未解決=」は内部管理専用の記法。地の文・セリフ・本文の中に【絶対に】書かない。これらの記法を使ってよいのは、本文を書き切った後に置く <state ...> タグの中だけ。引用符(全角・半角)を伴う「ラベル=値」を地の文に出さない。',
    '・あなたは物語の語り部に徹する。読者(ユーザー)に話しかけない／自分の作業を報告しない。「物語を進行させました」「入力をどうぞ」「逐語反映します」「次ターン以降も」「上記描写をもって」等の運営・アシスタント口調は【禁止】。箇条書き(・/-)で手順や仕様を説明しない。出力するのは物語の地の文と <say> のセリフだけ。',
    '・登場人物の名前を取り違えない。特に字面の似た名前(例: レナ と リナ)を混同せず、各文で「誰が」「誰の視点か」を明確に保つ。直前の主語と齟齬する代名詞・帰属を書かない。'
  ].join('\n');

  function getPlanner(){ try { return window.Planner || (typeof Planner !== 'undefined' ? Planner : null); } catch(e){ return null; } }
  function wrap(){
    var P = getPlanner(); if (!P || typeof P.build !== 'function') return false;
    if (P.build._v292f323 === true) return true;    // fix417b: 関数上フラグ(非__v292=非継承)。最外を奪われたら再装着できる(旧P.__fix323wrapは奪還不能の永久ロックだった)
    var orig = P.build.bind(P);
    var wrapped = function(){
      var r = orig.apply(this, arguments);
      try {
        if (!off() && r && typeof r.sys === 'string' && r.sys.indexOf(MARK) < 0){
          r.sys = r.sys + '\n' + GUARD;              // sys末尾に注入(最後=高優先で読ませる)
        }
      } catch(e){}
      return r;
    };
    try { Object.keys(P.build).forEach(function(k){ if (k.indexOf('__') === 0 || k.indexOf('_v292f') === 0) wrapped[k] = P.build[k]; /* fix419: _v292f*相互継承=奪還タイマー相互ラップ増殖の根治(GPT5.6監査#1) */ }); } catch(e){}
    wrapped._v292f323 = true;
    P.build = wrapped;
    P.__fix323wrap = true; // 互換(旧フラグ参照コード用・ガードには使わない)
    try { console.log(TAG, 'build wrap installed'); } catch(_){}
    return true;
  }
  (function poll(){ poll._n = (poll._n || 0) + 1; if (wrap()) return; if (poll._n > 80) return; setTimeout(poll, 400); })();
  try { setInterval(wrap, 2500); } catch(e){} // fix417b: 最外奪還(sys追記はMARK冪等で二重化しない)

  window.__v292Dfix323api = { wrapped: function(){ var P = getPlanner(); return !!(P && P.build && P.build._v292f323 === true); }, MARK: MARK };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
