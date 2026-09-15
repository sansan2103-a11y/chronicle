// =====================================================================
// Chronicle TRPG - v292Dfix851: POSTURE_DIRECTIVE（RR-2）
// ---------------------------------------------------------------------
// 何を直すか（DS_RR_PHASE1_RUNTIME_AUDIT_v1 / acceptance ④b で測定済み）:
//   fix333 は posture（suspended/frozen/prone/standing/unknown）を **算出しているのに**
//   constrainedChars() にも authorityBlock() にも使っていない。
//   さらに posture 正規表現に 仰向け / うつ伏せ / 座り込み が無い
//   （`倒れ|崩れ落|うずくま|這|床に伏` のみ）。
//   結果、「拘束も負傷も無く姿勢だけが不利」なケースは正史にも制約にも出ず、
//   仰向けのまま走る・座り込んだまま全力移動、が通ってしまう。
//
// 責務は 1 つだけ:
//   **明白な姿勢だけ**を、既存 authority block へ **短い directive 1 行**として足す。
//   新 physics engine 0 / 新 persistent state 0 / 新 LS キー 0 / 新医学説明 0。
//   拘束は既存の拘束制約（fix333 restrained / freeHands）に任せ、**二重化しない**。
//
// 機構:
//   `__v292Dfix333api.authorityBlock` をラップする。
//     ・orig が空でない → その末尾に姿勢 directive を 1 行足す
//     ・orig が空でも姿勢制約がある → 既存と **同じ marker** で始まるブロックを返す
//   marker を新設しないので fix459 の未知マーカー吸収事故を構造的に回避する
//   （`【身体状態・正史` は fix459 の MARKERS に既に載っている）。
//   注入は fix333 の wrapApi がそのまま行う（`sys.indexOf('【身体状態・正史')<0` 判定）。
//
// 姿勢の扱い（②C1 裁定・明白なものだけ / 曖昧は fail-closed で通常扱い）:
//   仰向け・仰臥 / うつ伏せ・伏臥 / 倒れている / 座り込み・崩れ落ち
//   standing・unknown・判定不能 → **何も足さない**（SYS 増分 0）
//
// flag: 既定 OFF（opt-in）
//   v292Dfix851On  = '1' … 有効化
//   v292Dfix851Off = '1' … 最優先で無効
//   v292DrrOff     = '1' … CORE_REACTION_REALISM lane の master kill
//   上位の既存 kill（v292Dfix333Off='1'）はそのまま効く。
// 検証口: window.__v292Dfix851x = { status, postureOf, directive, _classify }
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix851) return;
  G.__v292Dfix851 = true;
  var TAG = '[v292Dfix851:posture-directive]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix851Off') === '1' || ls('v292DrrOff') === '1'; }
  function on(){ if (off()) return false; return ls('v292Dfix851On') === '1'; }
  function str(v){ return String(v == null ? '' : v); }

  /* ---- 証拠フィルタ（RR-1 非搭載でも単体で成立させるため自前に持つ） ----
     否定・仮定・引用の姿勢を制約にしない。RR-1 と同じ考え方だが、
     こちらは **姿勢語** に対する否定を見る。 */
  var HYPO = /もし|仮に|たとえ|想像|夢の中|かもしれな|だろうか|と(考え|思っ|想像し)|ような気が/;
  var NEG_POSTURE = /(仰向け|仰臥|うつ伏せ|うつぶせ|伏臥|倒れ|座り込|しゃがみ込|膝をつ|へたり込|崩れ落ち)[^。]{0,4}(て|で|)(は|も|)(い|)ない/;

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
  function evidenceOnly(text){
    var kept = [];
    sentences(stripQuoted(text)).forEach(function(s){
      if (HYPO.test(s)) return;
      if (NEG_POSTURE.test(s)) return;
      kept.push(s);
    });
    return kept.join('。');
  }

  /* ---- 明白な姿勢だけを分類（曖昧は null = 通常扱い） ------------------
     ★体勢移行が書かれていれば姿勢制約は付けない（「起き上がる→立つ→走る」は正常）。 */
  /* ★体勢移行は「**完了した**移行」だけを認める。
     辞書形（起き上がる／立ち上がる）は意図・不可能の言及であることが多く、
     実測で「起き上が**る**支えが無い」を移行完了と誤認して姿勢制約を消していた。
     完了形（〜っ／〜り）だけを見て、否定が付くものは除外する。 */
  var RECOVERED = /(起き上が|立ち上が|身を起こ|体を起こ|上体を起こ|立ち直)(っ|り)/;
  var RECOVER_NEG = /(起き上が|立ち上が|身を起こ|体を起こ|上体を起こ|立ち直)[^。]{0,8}(ない|無い|ず|できな|られな)/;
  var ORDER = ['仰向け', 'うつ伏せ', '倒れている', '座り込み'];
  var PAT = {
    '仰向け':     /仰向け|仰臥|背中を(地面|床|地|土)に/,
    'うつ伏せ':   /うつ伏せ|うつぶせ|伏臥/,
    '倒れている': /倒れ(て|込|た|る)|這いつくば|床に伏|地面に伏/,
    '座り込み':   /座り込|しゃがみ込|膝をつ|膝から崩|へたり込|崩れ落ち/
  };

  function classify(karada){
    var t = evidenceOnly(str(karada));
    if (!t) return null;
    /* 体勢移行が同じテキスト内にあるなら、もう不利姿勢ではない */
    if (RECOVERED.test(t) && !RECOVER_NEG.test(t)) return null;
    for (var i = 0; i < ORDER.length; i++){
      if (PAT[ORDER[i]].test(t)) return ORDER[i];
    }
    return null;   /* fail-closed: 曖昧な姿勢は通常扱い */
  }

  function postureMap(states){
    var out = {}, any = false;
    try {
      Object.keys(states || {}).forEach(function(n){
        var st = states[n]; if (!st) return;
        /* 吊られている／拘束は既存の拘束制約の担当。二重化しない。 */
        if (st.suspended || st.restrained) return;
        var p = classify(st.karada);
        if (p){ out[n] = p; any = true; }
      });
    } catch(e){}
    return any ? out : null;
  }

  var MARK = '【身体状態・正史(絶対に覆らない)】';
  var _last = '';

  function directive(states){
    var pm = postureMap(states);
    if (!pm){ _last = ''; return ''; }
    var parts = [];
    Object.keys(pm).forEach(function(n){ parts.push(n + '=' + pm[n]); });
    _last = '・姿勢: ' + parts.join(' / ') +
      '。体勢を変える描写を挟まずに、その姿勢では不可能な行動（立位での移動・走行・上方への攻撃・全力の動作）を成立させない。体勢移行そのものは描いてよい。';
    return _last;
  }

  /* ---- authorityBlock ラップ（新 marker を作らない） ------------------ */
  function wrap(){
    var api = null;
    try { api = G.__v292Dfix333api; } catch(e){}
    if (!api || typeof api.authorityBlock !== 'function') return false;
    if (api.authorityBlock.__f851) return true;

    var orig = api.authorityBlock;
    var w = function(states){
      var base = '';
      try { base = str(orig.apply(this, arguments)); } catch(e){ base = ''; }
      if (!on()) return base;
      var d = '';
      try { d = directive(states); } catch(e){ d = ''; }
      if (!d) return base;
      if (base) return base + '\n' + d;
      /* orig が空でも姿勢だけで正史を出す。marker は既存と同一。 */
      return MARK + '\n' + d;
    };
    w.__f851 = true;
    try { for (var k in orig){ if (!(k in w)) w[k] = orig[k]; } } catch(e){}
    api.authorityBlock = w;
    try { console.log(TAG, 'authorityBlock wrapped'); } catch(e){}
    return true;
  }

  if (!wrap()){
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (wrap() || tries > 80) clearInterval(iv);
    }, 250);
  }

  G.__v292Dfix851x = {
    status: function(){
      var api = null; try { api = G.__v292Dfix333api; } catch(e){}
      return { on: on(), off: off(), wrapped: !!(api && api.authorityBlock && api.authorityBlock.__f851) };
    },
    postureOf: function(states){ return postureMap(states); },
    directive: directive,
    lastText: function(){ return _last; },
    _classify: classify,
    _evidenceOnly: evidenceOnly
  };
  try { console.log(TAG, 'loaded (on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
