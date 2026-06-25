// =====================================================================
// Chronicle TRPG - v292Dfix324: 「見せる」描写ガード(読みやすさ＆反応リアリティの根治)
//   背景(おしんと2026-06-24・AIダンジョン烏越高校と実機比較): Chronicleの文章が
//     「展開をイメージしにくい／反応にリアリティがない」原因を実プロンプト＋出力で特定:
//       (a) DS V4 Flash(推論型)が出来事を「説明・要約・名詞化」する癖→映像が結ばない
//          (例「〜ための牽引だった」「〜だけの吐息だった」「見えなくなる感覚が広がっている」)。
//       (b) 痛み/衝撃の身体反応を飛ばして静かな言葉に行く→抑制的で非現実的(眼球を抉られても
//          "乾いた吐息"だけ)。fix304はあるが1行で長文脈Flashに負ける。
//       (c) 冷静キャラを「ロボット」と一本調子に解釈→深みが消える。
//       (d) markdown(**)や数値の精密さ(0.2秒)が距離を作る。
//     AIダンジョンが読みやすい核心=「説明を長く続けず、会話・行動・物音・視界・沈黙・
//     環境描写で表現」をハード指定していること(=show-don't-tell)。それを移植する。
//   設計(コア不触・全モデル・無料): Planner.build 最外ラップで sys 末尾に描写ガードを毎ターン注入。
//     fix323と同方式(非__v292マーク__fix324wrap・出力側冪等・OFF=v292Dfix324Off)。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix324) return; window.__v292Dfix324 = true;
  var TAG = '[v292Dfix324:showdonttell]';
  function off(){ try { return localStorage.getItem('v292Dfix324Off') === '1'; } catch(e){ return false; } }

  var MARK = '【描写の作り方（説明せず"見せる"・最優先）】';
  var GUARD = [
    '',
    MARK,
    '・出来事は「説明・要約」で片づけず、具体的な動作・物音・手触り・におい・温度を順に書いて"見せる"。「〜ための〜だった」「〜だけの〜だった」のような名詞化・分類でまとめない。読者の頭に映像が浮かぶように、何がどう動いたかを一つずつ。',
    '・痛み・恐怖・衝撃・興奮は、まず体が反応し（息が詰まる・崩れる・痙攣・震え・声にならない声）、それから言葉になる。出来事が激しいほど身体反応を厚く描く。重大な負傷や衝撃を「乾いた吐息」程度で軽く流さない。',
    '・冷静・無感情なキャラでも、必ず微小な揺れを一つ描く（奥歯を噛む・一瞬の硬直・指の強張り・呼吸の乱れ）。完全な無反応＝ロボットにしない。冷たさは「抑えている」ことが伝わって初めて深みになる。',
    '・セリフは生で短く、その人物固有の感情の機微を出す。状況説明をセリフで代弁させない。',
    '・一文は短めに、瞬間を一つずつ積む。地の文に Markdown（** や *、#、行頭の・/-）を使わない。強調は語順と描写で出す。',
    '・数値の精密さ（「0.2秒」等）や俯瞰的な分析で距離を作らない。場面の【中】から、登場人物の感覚に寄り添って書く。'
  ].join('\n');

  function getPlanner(){ try { return window.Planner || (typeof Planner !== 'undefined' ? Planner : null); } catch(e){ return null; } }
  function wrap(){
    var P = getPlanner(); if (!P || typeof P.build !== 'function') return false;
    if (P.__fix324wrap) return true;                 // 非__v292マーク(fix274継承回避)
    var orig = P.build.bind(P);
    P.build = function(){
      var r = orig.apply(this, arguments);
      try {
        if (!off() && r && typeof r.sys === 'string' && r.sys.indexOf(MARK) < 0){
          r.sys = r.sys + '\n' + GUARD;
        }
      } catch(e){}
      return r;
    };
    P.__fix324wrap = true;
    try { console.log(TAG, 'build wrap installed'); } catch(_){}
    return true;
  }
  (function poll(){ poll._n = (poll._n || 0) + 1; if (wrap()) return; if (poll._n > 80) return; setTimeout(poll, 400); })();

  window.__v292Dfix324api = { wrapped: function(){ var P = getPlanner(); return !!(P && P.__fix324wrap); }, MARK: MARK };
  try { console.log(TAG, 'loaded'); } catch(_){}
})();
