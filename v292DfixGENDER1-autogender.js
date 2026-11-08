// =====================================================================
// Chronicle TRPG - v292DfixGENDER1: 自動で作ったキャラの性別を自動で決める（共通部品）
// ---------------------------------------------------------------------
// ★GENDER1（おしん 2026-11-07）:
//   「おまかせでキャラを作ってくれるのはいいが、性別が未設定になるのは良くない。自動でも設定されるようにして。
//    工程数が少ない方がいい。」
//   → 利用者に操作を増やさない（ダイアログ 0・ボタン 0）。自動生成の途中で性別を決め、ラジオ / シナリオの
//      cast.*.gender へ入れる。
//
// ■ 決め方（優先順）
//   1. 利用者が既に選んだ性別（女性/男性のラジオ・シナリオの gender）= 不可侵。絶対に上書きしない。
//   2. 本文（外見・立場の説明）に **はっきりした語**がある → それを採用（AI の答えより優先 = 本文に逆らわない）。
//   3. AI が返した性別欄（fix436 / fix823 のプロンプトに 1 項目足しただけ・追加の通信 0）。
//   4. 種バンクのおまかせ（AI 無し）→ 名前プールの性別（fix335 が自分で選んだ名前に限る）。
//   5. どれでも決められない（人外・曖昧）→ 未設定のまま。当て推量はしない。
//
// ■ 本文から決める語（保守的）
//   使う: 少女 女性 女の子 乙女 令嬢 婦人 老婆 魔女 王女 女王 巫女 尼僧 淑女 女子 / 少年 男性 男の子 青年 紳士 老爺 王子 男子
//         ＋「性別: 女/男」の明記 ＋ 代名詞 彼女 / 彼（弱）
//   使わない: 老人 / 母 父 姉 兄 妹 弟 娘 息子 妻 夫（= 「誰かの母」など**他人の**性別を指すことがあるため）
//   男女の語が混ざる文は決めない（'' を返す）。
//
// 公開: window.__v292DfixGENDER1 = { on, norm, inferFromText, resolve, genderForName, applyHero, applyCard,
//                                    sweepModal, sweepSoon, readHero, readCard, VERSION }
// kill: localStorage v292DfixGENDER1Off='1' → on()=false → 呼び出し側は従来動作のまま（全フックが no-op）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292DfixGENDER1) return;
  var VERSION = 'v292DfixGENDER1-20261107-v1';
  var F = '女性', M = '男性';

  function on(){ try { return localStorage.getItem('v292DfixGENDER1Off') !== '1'; } catch(e){ return true; } }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }

  /* ---------- AI / 外部入力の値 → '女性' | '男性' | ''（自由文字列を enum に通さない） ---------- */
  function norm(v){
    if (v === F || v === M) return v;
    var s = trim(v).toLowerCase().replace(/[\s。．.、,「」『』"'\[\]()（）]/g, '');
    if (!s) return '';
    if (/^(女性|女|おんな|女の子|女子|少女|female|woman|girl|f|she|her|♀)$/.test(s)) return F;
    if (/^(男性|男|おとこ|男の子|男子|少年|male|man|boy|m|he|him|♂)$/.test(s)) return M;
    return '';   /* 不明 / 中性 / 無性 / その他 = 決めない */
  }

  /* ---------- 本文から（保守的）。'' = 決められない ---------- */
  var F_STRONG = /(少女|女性|女の子|乙女|令嬢|婦人|老婆|魔女|王女|女王|巫女|尼僧|淑女|女子|聖女|姫君|お嬢様|お嬢さん|女医|女将|女剣士|女騎士|女戦士)/g;
  var M_STRONG = /(少年|男性|男の子|青年|紳士|老爺|王子|男子|好青年|美青年)/g;
  var F_PRON = /彼女(?!ら|たち)/g;
  var M_PRON = /彼(?!女|ら|等|方|岸)/g;
  function cnt(re, s){ var m = s.match(re); return m ? m.length : 0; }
  function inferFromText(text){
    var s = str(text);
    if (!trim(s)) return '';
    var ex = /(?:^|[\s、。／\/(（【\[])性別\s*[:：]\s*(女|男)/.exec(s);
    if (ex) return ex[1] === '女' ? F : M;
    var f = cnt(F_STRONG, s) * 2, m = cnt(M_STRONG, s) * 2;
    /* 「男の子」「女の子」は上の語に含まれる。「男装」「男爵」「女神」等は拾わない（語表に無い）。 */
    f += cnt(F_PRON, s); m += cnt(M_PRON, s);
    if (f > 0 && m === 0) return F;
    if (m > 0 && f === 0) return M;
    return '';   /* 無し / 混在 = 決めない */
  }
  /* 本文が決められる時は本文、そうでなければ AI の値（本文に逆らわない） */
  function resolve(aiValue, text){
    var t = inferFromText(text);
    if (t) return t;
    return norm(aiValue);
  }

  /* ---------- 種バンクのおまかせ（fix335）の名前プール ---------- */
  var NAME_LEAN = { 'アオイ':F, 'ハルカ':F, 'ミナト':M, 'シオリ':F, 'ツカサ':M, 'ノゾミ':F, 'カイ':M, 'スミレ':F, 'リク':M,
    'アヤメ':F, 'ジン':M, 'ソウ':M, 'クレハ':F, 'セナ':F, 'ヒロ':M, 'マコト':M, 'サギリ':F, 'ルカ':F, 'コウ':M, 'フユ':F,
    'ミオ':F, 'ハク':M };   /* レイ ユキ ナギ トワ イオリ ナオ アサヒ シンク は中性 → 乱数 */
  function genderForName(name){
    var n = trim(name);
    if (NAME_LEAN.hasOwnProperty(n)) return NAME_LEAN[n];
    return Math.random() < 0.5 ? F : M;
  }

  /* ---------- 設定モーダルのラジオ（既存 features.js gender_radio の DOM を読み書きするだけ） ---------- */
  function checkedOf(radios){
    for (var i = 0; i < radios.length; i++){ if (radios[i].checked && (radios[i].value === F || radios[i].value === M)) return radios[i].value; }
    return '';
  }
  function setRadios(radios, g){
    if (g !== F && g !== M) return false;
    if (!radios || !radios.length) return false;
    if (checkedOf(radios)) return false;              /* ★既に選ばれている = 不可侵 */
    var hit = false;
    for (var i = 0; i < radios.length; i++){
      if (radios[i].value === g){
        radios[i].checked = true; hit = true;
        try { radios[i].dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
      }
    }
    return hit;
  }
  function heroRadios(){ try { return document.querySelectorAll('input[name="v108g_hero"]'); } catch(e){ return []; } }
  function cardRadios(card){ try { return card ? card.querySelectorAll('.v292-grow input[type="radio"]') : []; } catch(e){ return []; } }
  function readHero(){ return checkedOf(heroRadios()); }
  function readCard(card){ return checkedOf(cardRadios(card)); }

  /* ラジオは設定を開いた後 / カード追加の 100〜500ms 後に注入される → 現れるまで少し待って 1 回だけ書く（未選択の時だけ） */
  var DELAYS = [0, 150, 350, 700, 1200, 2000, 3200];
  function poll(get, g, done){
    if (!on() || (g !== F && g !== M)) return;
    var i = 0;
    (function step(){
      var r = null;
      try { r = get(); } catch(e){}
      if (r === 'gone') return;
      if (r && r.length){ if (setRadios(r, g) && done) { try { done(); } catch(e){} } return; }
      if (++i < DELAYS.length) setTimeout(step, DELAYS[i] - DELAYS[i - 1]);
    })();
  }
  function applyHero(g){ poll(function(){ return heroRadios(); }, g); }
  function applyCard(card, g){
    poll(function(){ if (card && card.isConnected === false) return 'gone'; return cardRadios(card); }, g);
  }

  /* 本文だけから埋める保険（AI が性別を返さなかった / ローカル雛形に落ちた時用）。未選択のラジオにだけ書く */
  function descOfCard(card){ var d = card && card.querySelector('[data-f="desc"]'); return d ? d.value : ''; }
  function sweepModal(aiHero, aiNpcs){
    if (!on()) return 0;
    var n = 0;
    try {
      var hd = document.getElementById('cfgHDesc');
      var hg = resolve(aiHero, hd ? hd.value : '');
      if (hg && !readHero()){ applyHero(hg); n++; }
      var cards = document.querySelectorAll('#npcList .npc-card');
      for (var i = 0; i < cards.length; i++){
        var g = resolve(aiNpcs && aiNpcs[i], descOfCard(cards[i]));
        if (g && !readCard(cards[i])){ applyCard(cards[i], g); n++; }
      }
    } catch(e){}
    return n;
  }
  /* 旧経路の別タイマーが本文を書き終えるのを待ってから掃く */
  function sweepSoon(){
    if (!on()) return;
    [400, 1500, 3500].forEach(function(ms){ setTimeout(function(){ try { sweepModal(); } catch(e){} }, ms); });
  }

  window.__v292DfixGENDER1 = {
    VERSION: VERSION, on: on, norm: norm, inferFromText: inferFromText, resolve: resolve, genderForName: genderForName,
    applyHero: applyHero, applyCard: applyCard, sweepModal: sweepModal, sweepSoon: sweepSoon, readHero: readHero, readCard: readCard,
    LABEL_HERO: '主人公の性別（「女性」か「男性」のどちらか1語。人間でない等で本当に決められない時だけ「不明」）',
    LABEL_NPC: '性別（「女性」か「男性」のどちらか1語。人間でない等で本当に決められない時だけ「不明」）'
  };
  try { console.log('[v292DfixGENDER1] loaded', on() ? 'ON' : 'OFF'); } catch(e){}
})();
