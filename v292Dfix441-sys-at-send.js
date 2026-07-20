// =====================================================================
// Chronicle TRPG - v292Dfix441: sys書き換えを「送信直前(fetch境界)」で適用
// ---------------------------------------------------------------------
// ★2026-07-12 本番実測で確定した重大事実:
//   fix439(可読性の文字列置換)と fix440(fix105ブロック奪還+全トーン見本)は
//   Planner.build をラップして r.sys を書き換えるが、**実際に送信される sys には
//   反映されていなかった**。
//   実測: fix440.status() は rescued:true / blockPresent:true / examples.shizuka:true
//         なのに、傍受した実sysには1つも入らず、逆に旧文言「層を重ねて厚く描く」が復活。
//   真因: v292Dfix192-newengine.js の install() が 2秒 setInterval で Planner.build を
//         再ラップし、その中で `r.sys = buildSys(...)` と **sysを丸ごと作り直す**。
//         fix439/440 の定期奪還と fix192 の再installが奪い合い、ビルドの瞬間に
//         fix192 が外側だと、我々の書き換えは丸ごと捨てられる。
//   → ラップ順の奪い合いは原理的に決着しない。**送信直前(fetch境界)で書き換える**のが正解。
//      (memory: 「Lost-in-Middle 対策は API.call 境界(最後尾)」と同じ思想)
//
// 本fix: window.fetch をラップし、テキスト生成POSTの messages[0](role:system) に対して
//   fix439.rewrite() と fix440.transform() を **その場で** 適用する。
//   両者は純関数(マーカー冪等)なので、万一 build 側で既に当たっていても二重適用にならない。
//
// 冪等ガード: window.__v292Dfix441 / fetch上フラグ _f441
// OFF: localStorage.v292Dfix441Off = '1' (リロード不要・live評価)
// 検証口: window.__v292Dfix441.stats() / .rewriteSys(sys)
// ⚠ fix419c の教訓: ラッパーは内側関数の own props を全継承すること
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix441 && window.__v292Dfix441.__armed) return;
  var TAG = '[v292Dfix441:sys-at-send]';

  function off(){
    try { return localStorage.getItem('v292Dfix441Off') === '1'; } catch(e){ return false; }
  }

  var stats = { posts: 0, rewritten: 0, lastLenBefore: 0, lastLenAfter: 0, lastAt: 0, lastMarks: null };

  // pure: 439 → 440 の順に適用（439=koi見本/長さ指示、440=fix105ブロック奪還+静/動/会話劇見本）
  function rewriteSys(sys){
    var out = String(sys || '');
    try {
      var f439 = window.__v292Dfix439;
      if (f439 && typeof f439.rewrite === 'function' && !(f439.isOff && f439.isOff())) {
        out = f439.rewrite(out);
      }
    } catch(e){ try { console.warn(TAG, 'fix439.rewrite failed', e && e.message); } catch(_){} }
    try {
      var f440 = window.__v292Dfix440;
      if (f440 && typeof f440.transform === 'function' && !(f440.isOff && f440.isOff())) {
        out = f440.transform(out);
      }
    } catch(e){ try { console.warn(TAG, 'fix440.transform failed', e && e.message); } catch(_){} }
    // ★fix509(2026-07-20 GPT案3): メタ漏れ禁止3系統の統合を最終sysへ確実に適用（純粋transform・fail-open・OFF=v292Dfix509Off）
    try {
      var f509 = window.__v292Dfix509;
      if (f509 && typeof f509.rewrite === 'function' && !(f509.isOff && f509.isOff())) {
        out = f509.rewrite(out);
      }
    } catch(e){ try { console.warn(TAG, 'fix509.rewrite failed', e && e.message); } catch(_){} }
    return out;
  }

  function marks(sys){
    return {
      block:  sys.indexOf('【展開を前に進める（進行エンジン）】') >= 0,
      read:   sys.indexOf('【読みやすさ') >= 0,
      rules:  sys.indexOf('【出力の鉄則】') >= 0,
      onefact:sys.indexOf('一文一情報') >= 0,
      oldThick: sys.indexOf('層を重ねて厚く描く') >= 0
    };
  }

  function isTextGenUrl(u){
    var s = String(u || '');
    if (s.indexOf('/image') >= 0 || s.indexOf('/img') >= 0 || s.indexOf('/save') >= 0) return false;
    return (s.indexOf('openrouter.ai') >= 0) || (/workers\.dev/.test(s));
  }

  if (window.fetch && !window.fetch._f441) {
    var orig = window.fetch;
    var wrapped = function(url, opts){
      try {
        if (!off() && opts && typeof opts.body === 'string' &&
            String(opts.method || '').toUpperCase() === 'POST' && isTextGenUrl(url)) {
          var body = null;
          try { body = JSON.parse(opts.body); } catch(pe){ body = null; }
          if (body && body.messages && body.messages.length &&
              body.messages[0] && body.messages[0].role === 'system' &&
              typeof body.messages[0].content === 'string' && body.messages[0].content.length > 200) {
            stats.posts++;
            var before = body.messages[0].content;
            var after = rewriteSys(before);
            if (after !== before) {
              body.messages[0].content = after;
              var no = {};
              for (var k in opts) { if (Object.prototype.hasOwnProperty.call(opts, k)) no[k] = opts[k]; }
              no.body = JSON.stringify(body);
              opts = no;
              stats.rewritten++;
            }
            stats.lastLenBefore = before.length;
            stats.lastLenAfter = after.length;
            stats.lastAt = Date.now();
            stats.lastMarks = marks(after);
            try {
              if (!stats.lastMarks.block || stats.lastMarks.oldThick) {
                console.warn(TAG, '書き換えが不完全: ', JSON.stringify(stats.lastMarks));
              } else {
                console.log(TAG, 'sys rewritten at send', before.length, '->', after.length);
              }
            } catch(_){}
          }
        }
      } catch(e){ try { console.warn(TAG, 'wrap error', e && e.message); } catch(_){} }
      return orig.apply(this, (arguments.length > 1 || opts) ? [url, opts] : [url]);
    };
    // ★fix419c の教訓: 内側関数の own props を全継承（他fixのフラグを消さない）
    try { Object.keys(orig).forEach(function(k){ wrapped[k] = orig[k]; }); } catch(e){}
    wrapped._f441 = true;
    window.fetch = wrapped;
  }

  window.__v292Dfix441 = {
    __armed: true,
    stats: function(){ return stats; },
    rewriteSys: rewriteSys,
    marks: marks,
    isOff: off
  };
  try { console.log(TAG, 'armed (sys is rewritten at the fetch boundary, immune to Planner.build wrapper wars)'); } catch(e){}
})();
