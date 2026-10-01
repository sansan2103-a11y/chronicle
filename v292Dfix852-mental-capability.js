// =====================================================================
// Chronicle TRPG - v292Dfix852: MENTAL_CAPABILITY_DIRECTIVE（RR-3）
// ---------------------------------------------------------------------
// 何を直すか（DS_RR3_MENTAL_AUDIT_v1 で測定済み・production バイトに対する実測）:
//   精神・認知から能力制約への変換は **fix414 の rank6 ただ 1 本**しかない
//   （`即応・機転は出ない(型B/C)`）。そして fix414 は rank 昇順で **上位 3 件**しか返さない。
//   実測: 「右腕骨折 + 左脚裂傷 + 大量出血 + 解離」の人物の derive() は
//     [rank1 右腕使用不可, rank2.5 移動が鈍い, rank3 長い行動で意識が揺らぐ]
//   となり、**rank6 の精神コストがキャップで落ちる**。
//   → **重傷であるほど精神的コストが確実に消える**という逆転が起きている。
//   これはまさに排除したい Mode D（冷静 + 長台詞 + 高度戦術 + 広い注意 + 精密動作 が全部残る）。
//   加えて fix414 の精神語彙は 7 パターンのみで、パニック/思考がまとまらない/過呼吸/
//   手が震えて細かい作業ができない/呆然/混乱/集中できない/記憶が飛ぶ 等は **すべて MISS**。
//   fix333 の posture 'frozen'（硬直|立ちすく|凍りつ）も算出されるが誰も使っていない。
//
// 責務は 1 つだけ:
//   精神・認知の負荷を **短い能力 directive 1 行**として既存 authority block へ足す。
//   **fix414 には触らない**（キャップも rank も変えない）ので、精神コストが
//   身体制約に押し出されて消えることが構造的に無くなる。
//
// ★感情を強制しない。
//   「叫べ」「泣け」「恐怖しろ」は書かない。書くのは **能力の上限だけ**:
//     発話量 / 注意幅 / 複雑判断 / 精密動作 / 初動
//   どの能力を落とすかは人物ごとに変わってよい（キャラ差を潰さない）。
//   A/B/C（SIA系・解離系・freeze系）の医学説明は **毎ターン注入しない**（1 文字も書かない）。
//
// 機構: `__v292Dfix333api.authorityBlock` をラップし、既存 marker
//   `【身体状態・正史(絶対に覆らない)】` の中に 1 行足す。**新 SYS marker 0**
//   （fix459 の未知マーカー吸収事故を構造的に回避／fix459 は 1 バイトも変更しない）。
//   RR-2(fix851) が先にラップしていても **その出力を壊さず後ろに足す**（両立する）。
//
// flag: 既定 OFF（opt-in）
//   v292Dfix852On='1' 有効 / v292Dfix852Off='1' 最優先で無効 / v292DrrOff='1' lane master kill
// 検証口: window.__v292Dfix852x = { status, axesOf, directive, lastText, _classify }
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix852) return;
  G.__v292Dfix852 = true;
  var TAG = '[v292Dfix852:mental-capability]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix852Off') === '1' || ls('v292DrrOff') === '1'; }
  /* ★RR-3 default ON(2026-09-15): 既定を ON にする。
     未設定＝ON / '0'＝端末単位の opt-out / Off='1' と v292DrrOff='1' は従来どおり最優先。
     旧 On='1' も引き続き有効。語彙・軸・上限・出力文面は 1 文字も変えていない。 */
  function on(){ if (off()) return false; return ls('v292Dfix852On') !== '0'; }
  function str(v){ return String(v == null ? '' : v); }
  function store(){ try { return G.__v292Dfix77Store || {}; } catch(e){ return {}; } }

  /* ---- 証拠フィルタ（否定・仮定・引用の精神状態を制約にしない） ---- */
  var HYPO = /もし|仮に|たとえ|想像|夢の中|かもしれな|だろうか|と(考え|思っ|想像し)|ような気が/;
  function sentences(t){
    return str(t).split(/[。\n]/).map(function(s){ return s.trim(); }).filter(function(s){ return !!s; });
  }
  function stripQuoted(text){
    try {
      return str(text)
        .replace(/[「『][^「『」』]{0,400}[」』]/g, '　')
        .replace(/[“”][^“”]{0,400}[“”]/g, '　');
    } catch(e){ return str(text); }
  }
  /* 「混乱していない」「パニックになっていない」等は制約にしない。
     ★run1 の実欠陥（修正済み・開示事項）: 旧実装は精神語と否定の間に
     `[^。]{0,6}` の隙間を許していたため、**「手が震えて止まらない」**（＝震えが
     続いている＝陽性）を「震えの否定」と誤判定して節ごと落としていた。
     RR-1 の「能力の否定は負傷の否定ではない」と同じ型の誤り。
     否定は精神語に **直接** 付いている場合だけに限定する。 */
  var NEG_MENTAL = new RegExp(
    '(解離|混乱|パニック|放心|呆然|凍りつ|立ちすく|身がすく|過呼吸|真っ白)' +
    '(に|で|)(は|も|)(なって|なっ|して|し|)(は|)(い|)ない' +
    '|震え(て|)(は|も|)(い|)ない'
  );
  function evidenceOnly(text){
    var kept = [];
    sentences(stripQuoted(text)).forEach(function(s){
      if (HYPO.test(s)) return;
      if (NEG_MENTAL.test(s)) return;
      kept.push(s);
    });
    return kept.join('。');
  }

  /* ---- 能力軸（②C1 指定の 5 軸）。語彙は精神・認知側だけに限定し、
         身体側（fix414 の担当）と重複させない。 ---- */
  var AXES = [
    { key: '発話',   text: '長い発話が続かない',
      re: /言葉(が|も)出(て|)こな|声が出な|喉が詰ま|うまく話せ|言葉に詰ま|過呼吸|息が上が(って|り)[^。]{0,6}話/ },
    { key: '注意',   text: '注意の幅が狭い',
      re: /視野が狭|注意が狭|周り(が|を)[^。]{0,6}見え(て|)(い|)な|音が遠|耳鳴り|一点しか|他が目に入ら/ },
    { key: '判断',   text: '複雑な判断や手順の最適化ができない',
      re: /思考がまとまら|考えがまとまら|混乱し|頭が真っ白|判断(が|も)つかな|記憶が飛|集中でき(な|ず)|パニック/ },
    { key: '精密',   text: '細かい手元の作業が乱れる',
      re: /手(が|も)震え|指(が|も)震え|震えが止ま|手元が狂|力が入らな(い|)[^。]{0,4}手/ },
    { key: '初動',   text: '初動が遅れる',
      re: /凍りつ|立ちすく|身がすく|放心|呆然|解離|現実感が(薄|な)/ }
  ];
  var MAX_AXES = 3;   /* 1 人あたり最大 3 軸。SYS 肥大を防ぐ */

  function classify(kokoro, karada){
    /* fix414 の mindText と同じ素材（こころ＋からだ）。RR-1 が ON なら
       karada に今ターンのテキストが載っているので same-turn で効く。 */
    var t = evidenceOnly(str(kokoro) + '。' + str(karada));
    if (!t) return null;
    var hits = [];
    for (var i = 0; i < AXES.length && hits.length < MAX_AXES; i++){
      if (AXES[i].re.test(t)) hits.push(AXES[i].text);
    }
    return hits.length ? hits : null;
  }

  function axesMap(states){
    var st = store(), out = {}, any = false;
    var names = {};
    try { Object.keys(states || {}).forEach(function(n){ names[n] = 1; }); } catch(e){}
    Object.keys(st).forEach(function(n){ if (names[n]) { /* states に居る人だけ */ } });
    Object.keys(names).forEach(function(n){
      var e = st[n] || {};
      var s = (states && states[n]) || {};
      var hits = classify(e.kokoro, s.karada || e.karada);
      if (hits){ out[n] = hits; any = true; }
    });
    return any ? out : null;
  }

  var MARK = '【身体状態・正史(絶対に覆らない)】';
  var _last = '';

  function directive(states){
    var am = axesMap(states);
    if (!am){ _last = ''; return ''; }
    var parts = [];
    Object.keys(am).forEach(function(n){ parts.push(n + '=' + am[n].join('・')); });
    _last = '・認知と発話の上限: ' + parts.join(' / ') +
      '。これらは能力の上限であって感情の指定ではない。落ちた能力を性格や技能で取り戻さない。' +
      '何を我慢し何を諦めるかは人物ごとに違ってよい。';
    return _last;
  }

  function wrap(){
    var api = null;
    try { api = G.__v292Dfix333api; } catch(e){}
    if (!api || typeof api.authorityBlock !== 'function') return false;
    if (api.authorityBlock.__f852) return true;
    var orig = api.authorityBlock;
    var w = function(states){
      var base = '';
      try { base = str(orig.apply(this, arguments)); } catch(e){ base = ''; }
      if (!on()) return base;
      var d = '';
      try { d = directive(states); } catch(e){ d = ''; }
      if (!d) return base;
      if (base) return base + '\n' + d;
      return MARK + '\n' + d;
    };
    w.__f852 = true;
    try { for (var k in orig){ if (!(k in w)) w[k] = orig[k]; } } catch(e){}
    try { if (orig.__f851) w.__f851 = orig.__f851; } catch(e){}
    api.authorityBlock = w;
    try { console.log(TAG, 'authorityBlock wrapped'); } catch(e){}
    return true;
  }

  if (!wrap()){
    var tries = 0;
    var iv = setInterval(function(){ tries++; if (wrap() || tries > 80) clearInterval(iv); }, 250);
  }

  G.__v292Dfix852x = {
    status: function(){
      var api = null; try { api = G.__v292Dfix333api; } catch(e){}
      return { on: on(), off: off(), wrapped: !!(api && api.authorityBlock && api.authorityBlock.__f852) };
    },
    axesOf: axesMap,
    directive: directive,
    lastText: function(){ return _last; },
    _classify: classify,
    _evidenceOnly: evidenceOnly
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
