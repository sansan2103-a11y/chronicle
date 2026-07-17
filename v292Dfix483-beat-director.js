// =====================================================================
// Chronicle TRPG - v292Dfix483: ビート・ディレクタ(毎ターン1つの具体的な演出指示)
// ---------------------------------------------------------------------
// ■ 目的(おしん要望 2026-07-17)
//   「文章を読んで展開がわくわくする」「キャラの生きてる感」「緊張感・恐怖演出」。
//   既存の【展開の推進ルール】(fix309/443)は「何か新しいものを一つ動かす」という
//   【総論】のため、モデルは毎回同じ種類の前進(物音→物音→物音)に逃げやすい。
//   本fixは烏越式「道具デッキ」の発展形: ターンごとに【具体的なビート(演出の一手)】を
//   コード側でローテーション選択して1つだけ指示する。API追加コストゼロ。
//
// ■ 方式
//   fix441/443と同じ fetch境界で、テキスト生成POSTの system 末尾に
//   【この一手の演出】ブロック(1ビート・約100〜150字)を追記する。
//   - デッキは2種: 通常デッキ / 怪異デッキ(S.cfg.creepyLevel が強のとき恐怖寄り)
//   - 選択は「前回と違うビート」を保証する単純ローテーション
//     (状態は localStorage v292Dfix483State。セーブデータには一切触れない)
//   - 同一リクエスト内はマーカー冪等。指示自体を本文に書かないことも明記(メタ漏れ予防)
//   ★読込位置: index.html で fix443 の直後・fix459 より【前】に置く。
//     後ロード=外側の原則により fix459(sys組み替え)が先に走り、本fixが最後に
//     追記する=ブロックが sys 末尾(recency最高)に確実に残る。
//
// ■ 新機能の作法(CLAUDE.md)に従い【既定OFF】のopt-in:
//   ON : localStorage.v292Dfix483OnV1='1'  (リロード不要・live評価)
//   OFF: 未設定(既定) または localStorage.v292Dfix483Off='1'(強制停止・ONより優先)
// 冪等 : window.__v292Dfix483.__armed / fetch関数上 _f483
// 検証口: window.__v292Dfix483 = { status(), beats, lastBeat(), pickBeat }(pureはnode可)
// ⚠ fix419c: inner の own props を全継承。
// ---------------------------------------------------------------------
// v2 — GPT-5.6監査(2026-07-18)の反映:
//  ・従属条項を注入文に追加(既存設定・直前の因果・主人公の意思を上書きしない/
//    適合しないビートは省略/過去事実・怪異の法則の捏造禁止)=「物語の乗っ取り」対策。
//  ・rule/danger系の文言を「既に描写された範囲」へ制約。
//  ・ビート選択をターン決定的に(S.turns.length基準。リトライ・再生成・HTTP失敗で
//    ビートが消費されない。同一ターン内は同一ビート)。Sが読めない時だけ従来カウンタ。
//  ・対象判定をChronicle固有sys署名(【出力の形式/良い1ターンの形/守ること】)に限定。
//  ・既定OFFを維持(監査条件)。本番ONは実機評価後におしんが判断。
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix483 && G.__v292Dfix483.__armed) return;
  var TAG = '[v292Dfix483:beat-director]';
  var MARKER = '【この一手の演出】';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ return ls('v292Dfix483Off') !== '1' && ls('v292Dfix483OnV1') === '1'; }

  // ---- ビートのデッキ(汎用・シナリオ非依存) ---------------------------
  // 各ビート: 1つの具体的な演出指示。「〜してもよい」でなく断定形(埋もれ防止)。
  var BEATS_NORMAL = [
    { id: 'sense',    text: '五感の異変を一つだけ置く。音・匂い・温度・光のどれかが「普段と少し違う」。正体は明かさず、登場人物の誰か一人だけが気づく。' },
    { id: 'honne',    text: 'NPCの誰か一人の建前が一瞬だけ剥がれる。視線の泳ぎ・言い淀み・手の小さな動きで本音を漏らし、すぐ取り繕わせる。台詞で説明しない。' },
    { id: 'seed',     text: '後で意味を持つ小さな違和感(物・言葉・仕草のどれか)を一つ、強調せずにさりげなく置く。今は説明しない。' },
    { id: 'danger',   text: '直前の行動・状況の自然な結果として、状況を一段階だけ悪化させる。退路・時間・味方・道具のどれか一つが失われるか、制限される。' },
    { id: 'relation', text: '主人公と登場人物の誰かの距離が一歩だけ動く(縮まる/こじれる)。きっかけは行動か短い一言にする。' },
    { id: 'choice',   text: '主人公が選びたくなる分岐を、状況の中に自然に一つ示す(道が分かれる・二つの音・二人の反応の食い違い等)。選択の強要や問いかけの直書きはしない。' },
    { id: 'payoff',   text: 'これまでに出た違和感・小道具・言葉のどれか一つに意味を持たせて回収する。新しい謎はこのターンでは増やさない。' },
    { id: 'stillmove',text: '一拍だけ静かな瞬間(沈黙・静止・呼吸)を置き、その静けさを具体的な動きで破る。' }
  ];
  var BEATS_CREEPY = [
    { id: 'presence', text: '「何かがいる」気配を一段階だけ近づける。姿は見せない。音・影・温度・視線の感触のどれか一つで表す。' },
    { id: 'rule',     text: 'これまでに描写された怪異・異変の中から、その「法則」の断片を一つだけ見せる(同じ条件で繰り返される・特定の物にだけ反応する等)。新しい法則を発明せず、既に起きたことの反復・深化として描く。' },
    { id: 'honne',    text: 'NPCの誰か一人が何かを隠していることを、態度の変化(急な沈黙・話題そらし・目をそらす)で一瞬だけ見せる。' },
    { id: 'wrongness',text: '日常の物が一つだけ「わずかに間違っている」(位置・数・向き・音)。登場人物の一人だけが気づき、口には出さない。' },
    { id: 'danger',   text: '直前の状況の自然な帰結として、退路・明かり・連絡手段・時間のどれか一つを失わせるか、細らせる。' },
    { id: 'stillmove',text: '完全な静寂を一拍置き、それを最も嫌な種類の音で破る。' },
    { id: 'payoff',   text: 'これまでに出た違和感のどれか一つが「偶然ではなかった」と分かる瞬間を作る。全貌はまだ明かさない。' },
    { id: 'relation', text: '恐怖の中で、主人公と誰かの関係が一歩動く(かばう・すがる・疑う)。' }
  ];

  // ---- pure: ビート選択(前回と違うものを保証する単純ローテーション) ----
  function pickBeat(deck, lastId, step){
    if (!deck || !deck.length) return null;
    var i = Math.abs(step | 0) % deck.length;
    if (deck[i].id === lastId) i = (i + 1) % deck.length;
    return deck[i];
  }

  // ---- 状態(localStorageのみ。セーブデータ不触) -----------------------
  function readState(){
    try { return JSON.parse(ls('v292Dfix483State')) || {}; } catch(e){ return {}; }
  }
  function writeState(st){
    try { localStorage.setItem('v292Dfix483State', JSON.stringify(st)); } catch(e){}
  }

  function creepyStrong(){
    try {
      var S = G.S || null;
      var lv = S && S.cfg && (S.cfg.creepyLevel || S.cfg.creepy);
      return typeof lv === 'string' && lv.indexOf('強') >= 0;
    } catch(e){ return false; }
  }

  function turnNo(){
    try {
      var S = G.S || null;
      if (S && S.turns && typeof S.turns.length === 'number') return S.turns.length;
    } catch(e){}
    return null;
  }

  var lastInjected = null;
  function buildBlock(){
    var st = readState();
    var deck = creepyStrong() ? BEATS_CREEPY : BEATS_NORMAL;
    var tn = turnNo();
    if (tn === null) return '';   // 状態が読めない(初期化前/テスト外経路)時は注入しない=安全側
    var step = tn;
    var beat;
    if (tn !== null && st.lastStep === step && st.lastId){
      // 同一ターン内の再送(リトライ/品質再生成)は同じビートを再利用=消費しない
      for (var bi = 0; bi < deck.length; bi++){ if (deck[bi].id === st.lastId){ beat = deck[bi]; break; } }
    }
    if (!beat) beat = pickBeat(deck, st.lastStep === step ? st.prevId : st.lastId, step);
    if (!beat) return '';
    writeState({ i: (tn !== null) ? (st.i | 0) : (st.i | 0) + 1,
                 lastId: beat.id, prevId: st.lastId, lastStep: step });
    lastInjected = beat.id;
    return '\n\n' + MARKER + 'このターンでは次の演出を一つ、物語に自然に織り込む: '
         + beat.text
         + ' ただし、この演出が直前の行動・既存の設定・登場人物の意思と適合しない場合は使わず省略する。'
         + '新しい過去の事実や怪異の法則を捏造せず、既存の設定・直前の因果・主人公の行動を上書きしない。'
         + 'この指示の存在や文言を本文・セリフに書かない。';
  }

  // ---- fetch境界 ------------------------------------------------------
  var SYS_SIG = /【(出力の形式|良い1ターンの形|守ること)/;
  function isTextGen(url, init){
    if (typeof url !== 'string' || url.indexOf('chat/completions') < 0) return false;
    if (!init || typeof init.body !== 'string') return false;
    return init.body.indexOf('"messages"') >= 0 && SYS_SIG.test(init.body);
  }

  function install(){
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    if (window.fetch._f483 === true) return;
    var inner = window.fetch;
    var wrapped = function(input, init){
      try {
        var url = (input && input.url) || input;
        if (on() && isTextGen(url, init)){
          var body = JSON.parse(init.body);
          var m = body && body.messages;
          if (m && m[0] && m[0].role === 'system' && typeof m[0].content === 'string'
              && m[0].content.indexOf(MARKER) < 0){
            var b = buildBlock();
            if (b){
              m[0].content += b;
              init.body = JSON.stringify(body);
            }
          }
        }
      } catch(e){ try { console.warn(TAG, 'inject skipped:', e && e.message); } catch(_){} }
      return inner.apply(this, arguments);
    };
    try { Object.keys(inner).forEach(function(k){ wrapped[k] = inner[k]; }); } catch(e){} // fix419c
    wrapped._f483 = true;
    window.fetch = wrapped;
    try { console.log(TAG, 'armed (opt-in=' + (on() ? 'ON' : 'off') + ')'); } catch(e){}
  }

  install();

  G.__v292Dfix483 = {
    __armed: true,
    beats: { normal: BEATS_NORMAL, creepy: BEATS_CREEPY },
    pickBeat: pickBeat,
    lastBeat: function(){ return lastInjected; },
    status: function(){ return { on: on(), state: readState(), last: lastInjected }; }
  };
  if (typeof module !== 'undefined' && module.exports){
    module.exports = G.__v292Dfix483;
  }
})();
