// =====================================================================
// Chronicle TRPG - v292Dfix443: 反復の禁止 / 物語の推進(進行セレクタ) / 続きを書く の奪還
// ---------------------------------------------------------------------
// ★2026-07-12 本番実測で確定した重大事実:
//   features.js の v292Dfix105 は Planner.build をラップし、BLOCK(進行エンジン)以外にも
//   多数の指示を最終 sys へ追記していた。ところが
//     ・fix105 は `P.__v292Dfix105Build = true` を **Planner オブジェクト**に立てる
//       (関数上でない) ため、build が作り直されると「ラッパーは消えるがフラグは残る」
//       → 二度と再ラップされない
//     ・v292Dfix192-newengine.js の install() が 2秒 setInterval で build を再ラップし、
//       その中で `r.sys = buildSys(...)` と **sys を丸ごと作り直す**
//   → fix105 が注入していた指示が実 sys から恒久消失していた。
//
//   fix440 は BLOCK だけを、fix441 は「fetch境界(送信直前)で書き換える」方式を確立した。
//   本 fix443 は **まだ消えたままだった残り** を同じ fetch境界方式で奪還する:
//     1) 【反復の禁止】                     (常時)
//     2) 【物語の推進】= トップバー「進行」セレクタ(S.cfg.dramaLevel) 連動
//        ★これが1文字も届いていなかった = 進行セレクタが完全に死んでいた
//     3) fix138「続きを書く」強化ブロック（横原則 + 幅 + 続きの転換点）
//        ★「続きを書く」ボタンの指示も届いていなかった
//     4) fix108b サンプル名スクラブ（ミリア/フィオナ/サクラ → 相手/主人公）
//
// 方式: Planner.build はラップしない（ラップ合戦は原理的に決着しない）。
//       window.fetch をラップし、テキスト生成POSTの messages[0](role:system) を書き換える。
//       fix441 と同じ境界。index.html では fix441 → fix443 の順に読む(=fix443 が外側)ので
//       「fix443 が先に走り → fix441(439/440) が後」だが、双方 **マーカー冪等** なので
//       どちらが先でも最終 sys には両方の変更が入る。
//
// 文字列は features.js の fix105 ラッパー内から1文字違わずコピー（test_fix443.mjs が
// features.js に実在することを assert する＝将来ズレたらテストが落ちる）。
//
// 冪等ガード: window.__v292Dfix443.__armed / fetch上フラグ _f443
// OFF: localStorage.v292Dfix443Off = '1' (リロード不要・live評価)
// 検証口: window.__v292Dfix443.status() / .rewriteSys(sys, opts) / .texts() / .dramaLevel()
// ⚠ fix419c の教訓: ラッパーは内側関数の own props を全継承すること
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix443 && window.__v292Dfix443.__armed) return;
  var TAG = '[v292Dfix443:drama-rescue]';

  function off(){
    try { return localStorage.getItem('v292Dfix443Off') === '1'; } catch(e){ return false; }
  }

  // ===================================================================
  // features.js v292Dfix105 内の実物（1文字違わずコピー）
  // ===================================================================
  var T = {
    // fix111: anti-repetition（常時）
    antiRep: '【反復の禁止】直近ターンの文・言い回し・同じ動作を繰り返さない。同じ対象に同じ行為を再描写しない。毎ターン新しい言葉と絵で書く。',

    // fix111: drama engine（S.cfg.dramaLevel 0=off / 1=弱 / 2=標準(既定) / 3=強）
    dramaWeakHdr: '【物語の推進（弱め）】',
    dramaWeakLine: '・時々でよいので、目的・賭け・緊張を思い出させ、単調な繰り返しを避けて変化をつける。プレイヤーの自由と雰囲気を最優先。',
    dramaStd: '【物語の推進＝標準】前の局面を引き継いだ上で、状況を一歩前へ動かす（場所・状況・登場人物・時間のどれかが変わる）。同じ局面の足踏みや同じ行為の再描写だけで終えない。',
    dramaStrong: '【物語の推進＝強め】前の局面を引き継いだ上で、毎ターン状況を次の段階へ動かす（転換点/新事実/急変/賭けの上昇/場面転換）。同じ局面の足踏みや、同じ相手への加害・同じ行為を細かく描き直すだけにしない。プレイヤー入力は尊重し主人公は勝手に動かさない。',

    // fix138 / fix191: 「続きを書く」= 物語を"横"に広げる
    contHead: '【続きを書く＝物語を"横"に広げる】',
    yoko: '重要な原則："縦"（同じ行為・同じ被害の強度を上げる＝グロや痛みを激しくするだけ）は前進ではない。"横"＝新しい要素（新キャラや存在の登場／場所の移動・転換／脱出や追跡／時間経過／重要な事実・謎の発覚／力関係や関係性の変化／思いがけない選択肢や申し出）で世界を広げること。主人公は受け身の観察に留めず、状況に応じて自分から動く（抵抗・逃走・対峙・利用・取引・救出・探索・呼びかけ等。冷静なキャラなら計算ずくの選択として）。同じ被害描写の反復で終えない。',
    widthWeak: '前ターンを丁寧に引き継いだ上で、新しい要素を1つだけ、控えめに小さく持ち込む（1ビート）。一気に話を飛ばさず、プレイヤーが次の大きな選択をしやすいよう半歩〜一歩だけ進める。',
    widthStd: '前ターンを引き継いだ上で、新しい要素を1つ持ち込み、状況を一段階はっきり進める。',
    widthStrong: '前ターンを引き継いだ上で、新しい要素を2つ以上持ち込み、複数の展開を一気に動かして話を大胆に転がす（場面転換＋新事実、追跡＋関係の急変などを組み合わせてよい）。足踏みは厳禁。',

    // fix138A: 続きの転換点
    contHint: '【続きの転換点】前ターン末の発言/動作/各キャラの状態（負傷・拘束等）を今ターン冒頭で引き継いでから、状況を次へ動かす。動かし方の例：場所/移動・新人物や物の登場・時間経過・状況急変（逃走/拘束変化/治療/別の脅威の出現）・重要事実判明・関係性の変化。直近数ターンと同じ種類の転換は避ける。起きる出来事を主人公の五感で具体的に描き、「〜寸前まで追い込まれる」のような要約で済ませない。'
  };

  // fix108b: サンプル名スクラブ（fix58 の <say> 見本に焼き込まれた固有名）
  var SCRUB = [
    ['<say who="ミリア">走れ！振り向くな！</say> ミリアはナイフを構えた。', '<say who="相手">走れ！振り向くな！</say> 相手はナイフを構えた。'],
    ['<say who="フィオナ">置いていけない</say>', '<say who="主人公">置いていけない</say>'],
    ['サクラは小さく頷いた。', '相手は小さく頷いた。']
  ];

  // マーカー（冪等）
  var M_REP   = '【反復の禁止';
  var M_DRAMA = '【物語の推進';
  var M_CONT  = '【続きを書く＝';
  var M_HINT  = '【続きの転換点';

  // ===================================================================
  // pure なヘルパ
  // ===================================================================

  // fix138 と同一判定（features.js: /続きを(?:自然に)?進めて/ || /^続きを書/）
  // 「続きを書く」ボタンは playerText='続きを自然に進めてください。' を送る（index.html G.cont）
  function isContinueText(pt){
    var s = (pt == null) ? '' : String(pt);
    if (!s) return false;
    return /続きを(?:自然に)?進めて/.test(s) || /^続きを書/.test(s);
  }

  // S.cfg.dramaLevel を毎ターン読む（セレクタ変更が次ターンで即反映される）。既定 2。
  function dramaLevel(){
    var lvl = 2;
    try {
      var c = (window.S && window.S.cfg) ? window.S.cfg : null;
      if (c && c.dramaLevel != null && String(c.dramaLevel) !== ''){
        var n = +c.dramaLevel;
        if (!isNaN(n)) lvl = n;
      }
    } catch(e){}
    return lvl;
  }

  // fix105 と同じ構成: 「続きを書く」検知時は 推進ブロックを 続きを書くブロックで“置き換える”
  function buildDramaBlock(lvl, cont){
    if (cont){
      var w;
      if (lvl <= 1)      w = T.widthWeak;     // ① 小さく一歩（弱め・OFFも含む＝fix105 の挙動）
      else if (lvl >= 3) w = T.widthStrong;   // ② 大胆に転がす（強め）
      else               w = T.widthStd;      // 標準
      return T.contHead + w + ' ' + T.yoko;
    }
    if (lvl === 1)  return T.dramaWeakHdr + '\n' + T.dramaWeakLine;
    if (lvl >= 3)   return T.dramaStrong;
    if (lvl === 2)  return T.dramaStd;
    return '';                                // 0 = off（何も足さない）
  }

  var stats = {
    posts: 0, rewritten: 0,
    lastLenBefore: 0, lastLenAfter: 0,
    lastDrama: null, lastPlayerText: '',
    applied: { antiRep:false, drama:false, scrub:false },
    lastAt: 0
  };
  stats.applied['continue'] = false;

  var _warned = {};
  function warnOnce(k, msg){
    if (_warned[k]) return;
    _warned[k] = true;
    try { console.warn(TAG, msg); } catch(e){}
  }

  // -------------------------------------------------------------------
  // ★ pure: sys 書き換え本体（node テストはこれを直接叩く）
  //    opts = { dramaLevel: number, playerText: string }
  //    opts 未指定なら S.cfg から読む（playerText 不明なら「続きを書く」ブロックは足さない＝安全側）
  // -------------------------------------------------------------------
  function rewriteSys(sys, opts){
    if (typeof sys !== 'string' || !sys) return sys;
    if (off()) return sys;                     // OFF は完全素通し

    opts = opts || {};
    var lvl = (opts.dramaLevel != null && String(opts.dramaLevel) !== '') ? +opts.dramaLevel : dramaLevel();
    if (isNaN(lvl)) lvl = 2;
    var pt   = (opts.playerText == null) ? '' : String(opts.playerText);
    var cont = isContinueText(pt);

    var applied = { antiRep:false, drama:false, scrub:false };
    applied['continue'] = false;

    var out = sys;

    /* 4) fix108b: サンプル名スクラブ（既にスクラブ済みなら no-op ＝冪等） */
    for (var i = 0; i < SCRUB.length; i++){
      if (out.indexOf(SCRUB[i][0]) >= 0){
        out = out.split(SCRUB[i][0]).join(SCRUB[i][1]);
        applied.scrub = true;
      }
    }

    /* 1) 【反復の禁止】（常時・マーカー冪等） */
    if (out.indexOf(M_REP) < 0){
      out = out + '\n\n' + T.antiRep;
      applied.antiRep = true;
    }

    /* 2)/3) 【物語の推進】 or 【続きを書く＝…】（どちらか一方・マーカー冪等） */
    if (out.indexOf(M_DRAMA) < 0 && out.indexOf(M_CONT) < 0){
      var blk = buildDramaBlock(lvl, cont);
      if (blk){
        out = out + '\n\n' + blk;
        applied.drama = true;
      }
    }

    /* 3b) 【続きの転換点】（「続きを書く」のときだけ・マーカー冪等） */
    if (cont && out.indexOf(M_HINT) < 0){
      out = out + '\n\n' + T.contHint;
      applied['continue'] = true;
    }

    /* サイレント失敗を防ぐ */
    if (out.indexOf(M_REP) < 0){
      warnOnce('norep', '【反復の禁止】を sys へ追記できなかった（想定外）。__v292Dfix443.status() を確認のこと。');
    }
    if ((lvl > 0 || cont) && out.indexOf(M_DRAMA) < 0 && out.indexOf(M_CONT) < 0){
      warnOnce('nodrama', '【物語の推進】/【続きを書く】を sys へ追記できなかった（想定外・dramaLevel=' + lvl + '）。__v292Dfix443.status() を確認のこと。');
    }

    stats.lastDrama = lvl;
    stats.lastPlayerText = pt.slice(0, 40);
    stats.applied = applied;
    return out;
  }

  // ===================================================================
  // fetch 境界（fix441 と同じ判定）
  // ===================================================================
  function isTextGenUrl(u){
    var s = String(u || '');
    if (s.indexOf('/image') >= 0 || s.indexOf('/img') >= 0 || s.indexOf('/save') >= 0) return false;
    return (s.indexOf('openrouter.ai') >= 0) || (/workers\.dev/.test(s));
  }

  // 実 body の user メッセージ（index.html Planner.build の user＝pretty JSON 文字列）から
  // playerText を取り出す。Planner.build の第2引数はここでは取れないため body から復元する。
  //   user = JSON.stringify({ ..., currentInput:{type,text}, CRITICAL_INSTRUCTION:'この入力「…」を…' }, null, 2)
  //   (+ _userExtensions / UserMessageRegistry が末尾へ追記しうる → 全体 JSON.parse は最後の手段)
  function extractPlayerText(body){
    try {
      if (!body || !body.messages || !body.messages.length) return null;
      var uc = null;
      for (var i = body.messages.length - 1; i >= 0; i--){
        var m = body.messages[i];
        if (m && m.role === 'user' && typeof m.content === 'string'){ uc = m.content; break; }
      }
      if (!uc) return null;

      var m1 = uc.match(/"currentInput"\s*:\s*\{[\s\S]*?"text"\s*:\s*("(?:\\.|[^"\\])*")/);
      if (m1){
        try { return JSON.parse(m1[1]); } catch(e){}
      }
      var m2 = uc.match(/この入力「([\s\S]*?)」を完全に受け入れ/);
      if (m2) return m2[1];
      try {
        var o = JSON.parse(uc);
        if (o && o.currentInput && typeof o.currentInput.text === 'string') return o.currentInput.text;
      } catch(e){}
    } catch(e){}
    return null;   // 判定できない → 「続きを書く」ブロックは足さない（安全側）
  }

  if (window.fetch && !window.fetch._f443){
    var orig = window.fetch;
    var wrapped = function(url, opts){
      try {
        if (!off() && opts && typeof opts.body === 'string' &&
            String(opts.method || '').toUpperCase() === 'POST' && isTextGenUrl(url)){
          var body = null;
          try { body = JSON.parse(opts.body); } catch(pe){ body = null; }
          if (body && body.messages && body.messages.length &&
              body.messages[0] && body.messages[0].role === 'system' &&
              typeof body.messages[0].content === 'string' && body.messages[0].content.length > 200){
            stats.posts++;
            var before = body.messages[0].content;
            var pt = extractPlayerText(body);
            var after = rewriteSys(before, { dramaLevel: dramaLevel(), playerText: (pt == null ? '' : pt) });
            if (after !== before){
              body.messages[0].content = after;
              var no = {};
              for (var k in opts){ if (Object.prototype.hasOwnProperty.call(opts, k)) no[k] = opts[k]; }
              no.body = JSON.stringify(body);
              opts = no;
              stats.rewritten++;
            } else {
              warnOnce('nochange', 'sys を書き換えなかった（全マーカーが既に在る＝fix105 が生きている、または OFF）。');
            }
            stats.lastLenBefore = before.length;
            stats.lastLenAfter = after.length;
            stats.lastAt = (new Date()).getTime();
            try {
              console.log(TAG, 'sys rewritten at send', before.length, '->', after.length,
                          '| drama=' + stats.lastDrama,
                          '| applied=' + JSON.stringify(stats.applied));
            } catch(_){}
          }
        }
      } catch(e){ try { console.warn(TAG, 'wrap error', e && e.message); } catch(_){} }
      return orig.apply(this, (arguments.length > 1 || opts) ? [url, opts] : [url]);
    };
    // ★fix419c の教訓: 内側関数の own props を全継承（他fixのフラグを消さない）
    try { Object.keys(orig).forEach(function(k){ wrapped[k] = orig[k]; }); } catch(e){}
    wrapped._f443 = true;
    window.fetch = wrapped;
  }

  window.__v292Dfix443 = {
    __armed: true,
    rewriteSys: rewriteSys,
    dramaLevel: dramaLevel,
    isContinueText: isContinueText,
    buildDramaBlock: buildDramaBlock,
    extractPlayerText: extractPlayerText,
    texts: function(){ return T; },
    scrubs: function(){ return SCRUB; },
    isOff: off,
    status: function(){
      return {
        off: off(),
        posts: stats.posts,
        rewritten: stats.rewritten,
        lastLenBefore: stats.lastLenBefore,
        lastLenAfter: stats.lastLenAfter,
        lastDrama: stats.lastDrama,
        lastPlayerText: stats.lastPlayerText,
        applied: stats.applied,
        lastAt: stats.lastAt
      };
    }
  };
  try { console.log(TAG, 'armed (反復の禁止 / 物語の推進[進行セレクタ] / 続きを書く を送信直前に注入)'); } catch(e){}
})();
