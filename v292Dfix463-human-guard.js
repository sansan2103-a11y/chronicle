// =====================================================================
// Chronicle TRPG - v292Dfix463: 人間キャラが「人外」アイコンで生成される問題の根治
// ---------------------------------------------------------------------
// 症状(おしん報告 2026-07-13): ミアのアイコンを再生成したら人外(怪物)になった。
// 真因: fix338 の人外判定 isCreaturePrompt() が、説明文
//   「民俗学研究会の【幽霊】部員」の *幽霊* を拾って creature と判定し、
//   PREFIX_CREATURE(= creature concept art / no human face …) を前置していた。
//   判定語は「幽霊|亡霊|人影|化け物|怪物|異形|人形…」で、**慣用句**(幽霊部員・
//   人形のような・化け物じみた 等)を人外と誤読する。
//
// 修正(fix338 は触らない・その手前で入力を正す):
//   ①慣用句の中和: 「幽霊部員→部員」「人形のような→整った」等（人外語を消す）
//   ②人間ガード: プロンプト先頭の名前が **登録キャラで性別が男性/女性** なら、
//     残る人外語(幽霊/亡霊/人影/化け物/怪物/異形)を比喩とみなして除去する。
//   → fix338 は「人外語のないプロンプト」を見るので creature=false になり、
//     通常の人物PREFIX(または fix461 の英語外見)で生成される。
//
// 実装: fix338 より **後** に読み込まれる fetch ラッパ（=外側）でアバター生成の
//   prompt だけを書き換える。fix338/fix461/fix420 の経路には一切触れない。
// 既定ON。OFF: localStorage v292Dfix463Off='1'
// 検証口: window.__v292Dfix463 = { sanitize, isHuman, wouldCreature }
// =====================================================================
(function(){
  'use strict';
  if (window.__f463done) return; window.__f463done = 1;
  var TAG = '[v292Dfix463:human-guard]';

  function off(){ try { return localStorage.getItem('v292Dfix463Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // fix338 と同じ判定(検証用・参照コピー)
  var CREATURE_RE = /creature concept art|non-human creature|monster design|no human face|no human body|silhouette|faceless|no face|apparition|wraith|specter|spectre|shadowy figure|人影|亡霊|幽霊|化け物|怪物|異形|人の形をし|人形/i;
  function wouldCreature(s){ return CREATURE_RE.test(String(s || '')); }

  // ①慣用句の中和(人物描写として意味を保ったまま人外語を消す)
  var IDIOMS = [
    [/幽霊部員/g, '部員'],
    [/(幽霊|亡霊)の(ような|ように|如く)/g, '存在感の薄い'],
    [/(幽霊|亡霊)みたいな?/g, '存在感の薄い'],
    [/人形の(ような|ように|如く)/g, '整った'],
    [/(化け物|怪物)じみた/g, '圧倒的な'],
    [/(化け物|怪物)の(ような|ように|如く)/g, '圧倒的な'],
    [/影が薄い/g, '目立たない'],
    [/異形の(ような|ように)/g, '異様な']
  ];
  // ②人間ガードで落とす残存語(比喩として使われた人外語)
  var RESID_RE = /(人影|亡霊|幽霊|化け物|怪物|異形|人の形をした?|人形)/g;

  // 登録キャラ(hero+npcs)から 名前→性別 の表
  function castTable(){
    var out = [];
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push({ name: String(S.cast.hero.name).trim(), gender: String(S.cast.hero.gender || ''), desc: String(S.cast.hero.desc || '') });
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push({ name: String(n.name).trim(), gender: String(n.gender || ''), desc: String(n.desc || '') }); });
      }
    } catch(e){}
    return out;
  }

  // プロンプトが「人間の登録キャラ」のものか。性別が男性/女性 → 人間。
  // 性別が空でも、説明文に人間語(高校生/女子生徒/男/女/少年/少女…)があれば人間とみなす。
  var HUMAN_WORD = /(高校生|中学生|大学生|小学生|女子生徒|男子生徒|生徒|学生|教師|会社員|社会人|少年|少女|男性|女性|青年|男の子|女の子|人間|老人|婦人|主婦|警官|医師|看護師)/;
  var CREATURE_WORD = /(怪異|妖怪|化け物|怪物|幽霊|亡霊|人外|のっぺらぼう|異形|悪霊|魔物|精霊|人ならざる)/;
  function isHuman(prompt, cast){
    var p = String(prompt || '');
    var list = cast || castTable();
    for (var i = 0; i < list.length; i++){
      var m = list[i];
      if (!m.name || p.indexOf(m.name) < 0) continue;
      if (m.gender === '男性' || m.gender === '女性') return true;     // 本人が登録した性別が最優先
      if (CREATURE_WORD.test(m.desc)) return false;                    // 説明文が人外を名乗る=人外
      if (HUMAN_WORD.test(m.desc)) return true;                        // 判定は**説明文**に対してのみ
      return false;                                                    // 証拠なし=触らない
    }
    return false;                                                      // 未登録(妖怪・怪異など)=触らない
  }

  // 本体(pure)
  function sanitize(prompt, cast){
    var s = String(prompt || '');
    if (!s) return prompt;
    var before = s;
    for (var i = 0; i < IDIOMS.length; i++){ s = s.replace(IDIOMS[i][0], IDIOMS[i][1]); }
    if (wouldCreature(s) && isHuman(s, cast)){
      s = s.replace(RESID_RE, '').replace(/[、,]{2,}/g, '、').replace(/\s{2,}/g, ' ').trim();
    }
    if (s !== before){ try { console.log(TAG, 'prompt sanitized'); } catch(e){} }
    return s;
  }

  // ---- fetch ラッパ(fix338 より外側 = 先に見る) ----
  function isAvatarGen(url, init){
    try {
      var u = String((url && url.url) || url || '');
      if (u.indexOf('gen.pollinations.ai') < 0 || u.indexOf('/images/generations') < 0) return false;
      var b = init && init.body;
      if (typeof b !== 'string') return false;
      return (b.indexOf('384x384') >= 0 || b.indexOf('768x512') >= 0);
    } catch(e){ return false; }
  }
  var of = window.fetch;
  var wrapped = function(url, init){
    try {
      if (!off() && isAvatarGen(url, init)){
        var b = JSON.parse(String(init.body));
        if (b && typeof b.prompt === 'string'){
          var nv = sanitize(b.prompt);
          if (nv !== b.prompt){ b.prompt = nv; init = Object.assign({}, init, { body: JSON.stringify(b) }); }
        }
      }
    } catch(e){ try { console.warn(TAG, 'skip:', e && e.message); } catch(_){} }
    return of.apply(this, [url, init]);
  };
  try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}   // ★fix419教訓: 全own props継承
  wrapped.__f463 = true;
  window.fetch = wrapped;

  window.__v292Dfix463 = { __armed: true, sanitize: sanitize, isHuman: isHuman, wouldCreature: wouldCreature, isOff: off };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
