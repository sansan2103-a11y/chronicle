// =====================================================================
// Chronicle TRPG - v292Dfix461: アイコンの外見忠実度（年齢・体格・特徴が絵に出ない）の根治
// ---------------------------------------------------------------------
// ★症状（おしん報告・2026-07-13）: 「70代男性。灯台守だった老人。片目が白い。」で登録した
//   キャラのアイコンが、20代の美形アニメ顔になる。年齢・体格・肌・服装の「幅」が出ない。
//
// ★真因（実測）: 画像生成に渡している文字列が
//     [英語のスタイル接頭辞（anime / JRPG / semi-realistic …）] + [キャラ説明文の生テキスト（日本語）]
//   になっていた。実測した実プロンプト:
//     "神奈月蓮, 顔立ちは年齢より少し幼く見えるが…（性格・生い立ち・人間関係の日本語散文が続く）"
//   ・FLUX は日本語をほぼ解さない
//   ・しかも説明文の大半が **外見ではなく性格・関係・生い立ち**
//   → 効いているのは英語のスタイル接頭辞だけ ＝ 全員「若いアニメ美形」に収束していた。
//
// ★対策: キャラの説明文を、**一度だけ LLM で英語の外見タグ列へ変換**して保存し、
//   以後の画像生成はそのタグを使う。年齢・体格・肌・髪・目・服装・佇まいを必ず含める。
//   例: elderly man in his 70s, deeply wrinkled weathered face, grey stubble,
//       one clouded blind white eye, sun-damaged skin, worn fisherman jacket, stooped posture
//   これで「幅」（年齢・体格・民族・肌質・服装）が絵に乗る。
//
// 実装:
//   ・本ファイル = 変換とキャッシュ（localStorage `v292en_<hash>`・説明文が変われば作り直し）
//   ・v292Dfix197 の buildCurrentAppearancePrompt が、タグがあればそれを使う（同ファイル内で分岐）
//   ・APIは fix436 と同じ経路（proxy 経由の chat completions・1キャラ1回だけ・数百トークン）
//
// 冪等: window.__v292Dfix461
// OFF : localStorage.v292Dfix461Off = '1'（従来の日本語プロンプトに戻る）
// 検証口: window.__v292Dfix461.tagsFor('名前') / .ensure() / .stats() / .verNow() / .sysNow()
// ---------------------------------------------------------------------
// ★v2.1(2026-07-16・GPT-5.6監査済 / 設計書_V4アイコン品質パイプライン): v2-noinventの副作用
//   （外見文の情報量まで痩せ、画像モデルの事前分布に負ける＝金髪+革ジャンの少女が女性顔に
//   ならない）を是正。方針=「指定あり項目の完全抽出 + 未指定項目の完全省略 + 弱い文頭アンカー」。
//   ・完全抽出: シートに書かれた属性は**あれば必ず**外見文へ（v2の『省略』は維持しつつ『書かれて
//     いるのに落とす』を禁止）
//   ・完全省略: 書かれていない項目は一切書かない・推測しない・創作しない（v2原則を維持）
//   ・弱い文頭アンカー: 先頭に `Anime portrait of a <性別×年齢帯>.`。媒体+性別表現+年齢帯のみ。
//     exact age・民族・老化cue・価値語(beautiful/handsome)・画風語(semi-realistic)は禁止。
//     性別・年齢帯の**明記がある場合のみ**、欠けたら書ける方だけ、両方不明ならアンカー省略、人外には付けない。
//   ・キャッシュVERは v21-extract（旧 v2-noinvent とキーが衝突しない）
//   ・**opt-in**: localStorage.v292Dfix461V21On==='1' のときだけ v2.1。無ければ従来の v2 のまま。
//     v292Dfix461V21Off==='1' で v2.1を無効化して v2へ戻す（Offが優先・live評価）。ON/OFFでVERも切替。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix461 && window.__v292Dfix461.__armed) return;
  var TAG = '[v292Dfix461:appearance-en]';
  var PFX = 'v292en_';
  // ★C(2026-07-14): SYS を変えたので **キャッシュVERを上げる**（旧 v292en_* を再利用しない）
  // ★v2.1(2026-07-16): opt-inフラグで VER/SYS を切替。ON/OFFでVERも変え、キャッシュ混線を防ぐ。
  var VER_V2 = 'v2-noinvent';
  var VER_V21 = 'v21-extract';
  function v21on(){
    try {
      if (localStorage.getItem('v292Dfix461V21Off') === '1') return false; // Offが最優先（v2へ戻す）
      return localStorage.getItem('v292Dfix461V21On') === '1';             // opt-in: Onのときだけv2.1
    } catch(e){ return false; }
  }
  function verOf(){ return v21on() ? VER_V21 : VER_V2; }
  function sysNow(){ return v21on() ? SYS_V21 : SYS_V2; }
  var TIMEOUT_MS = 45000;
  var stats = { made: 0, cached: 0, failed: 0, lastErr: '' };
  var inflight = {};

  function off(){ try { return localStorage.getItem('v292Dfix461Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined"?S:null'); } catch(e){ return null; } }
  function getUI(){ try { return window.UI || (0,eval)('typeof UI!=="undefined"?UI:null'); } catch(e){ return null; } }
  function hash(s){ var h=0; s=String(s); for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); }

  function members(){
    var S = getS(), out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push({ name: String(S.cast.hero.name).trim(), desc: String(S.cast.hero.desc || ''), gender: String(S.cast.hero.gender || '') });
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push({ name: String(n.name).trim(), desc: String(n.desc || ''), gender: String(n.gender || '') }); });
      }
    } catch(e){}
    return out.filter(function(m){ return m.name && m.desc; });
  }
  function keyOf(m){ return PFX + hash(verOf() + '|' + m.name + '|' + m.desc + '|' + m.gender); }

  function tagsFor(name){
    if (off()) return '';
    var ms = members();
    for (var i = 0; i < ms.length; i++){
      if (ms[i].name === name){
        try { return localStorage.getItem(keyOf(ms[i])) || ''; } catch(e){ return ''; }
      }
    }
    return '';
  }

  // ---- LLM 呼び出し（fix436 と同じ経路: proxy が XHR を Worker へ差し替える） ----
  /* ★GPT-5.6監査の反映:
   *   ・FLUXは「タグ列」より **短い自然な英文** の方が効く（BFL公式の推奨構造）
   *   ・1boy/1girl は「少年/少女」を強く示すため 70代男性と正面衝突する → 廃止
   *   ・年齢は数字＋**視覚的な証拠**（deep forehead lines / sagging eyelids / sparse gray hair …）
   *   ・"exactly as described" のようなメタ指示は弱い。実際に描くものを書く
   *   ・否定（avoid generic idol face）ではなく肯定（mature asymmetrical features …） */
  // ★C(2026-07-14・おしん指示 / GPT-5.6監査):
  //   「必ず明示せよ」系の強制（年齢・性別・民族の必須 / 年齢cue最低3つ / 体格・肌・髪・目・服の必須列挙 /
  //   不足特徴の創作）を **全部やめる**。設定に書かれた属性だけを出し、書かれていない項目は **行ごと省略**する。
  var SYS_V2 = 'You rewrite a Japanese character description into a SHORT English image prompt for FLUX.\n'
    + 'Output ONLY the English prompt. No Japanese, no quotes, no tags like 1boy, no explanation, no character name.\n'
    + 'Write only what the description states. Never invent, guess or add anything that is not written.\n'
    + 'If an attribute (age, sex, ethnicity, build, skin, hair, eyes, clothing, accessories) is not stated, omit that item entirely.\n'
    + 'Keep the order: subject, build/posture, face, hair and eyes, clothing. Skip any item with no source in the description.\n'
    + 'Do not use 1boy/1girl/handsome/beautiful/idol. Do not describe personality, backstory or relationships unless they are visible.\n'
    + 'Do not add art style, lighting, camera or quality words. Those are added later by application code.';

  // ★v2.1 SYS: 完全抽出 + 完全省略 + 弱い文頭アンカー（GPT-5.6監査済）
  var SYS_V21 = 'You rewrite a Japanese character description into a SHORT English image prompt for FLUX.\n'
    + 'Output ONLY the English prompt. No Japanese, no quotes, no tags like 1boy, no explanation, no character name.\n'
    + 'Write only what the description states. Never invent, guess or add anything that is not written.\n'
    + 'If an attribute (age, sex, ethnicity, build, skin, hair, eyes, clothing, accessories) is not stated, omit that item entirely.\n'
    + 'But every attribute that IS stated (age, sex, ethnicity, eye colour, skin, expression, build, posture, hair, clothing) MUST appear in the prompt. Never drop an attribute that the description states.\n'
    + 'Begin the prompt with a short anchor line of the form "Anime portrait of a <SEX> <AGE-BAND>." only when the description states them. Examples: "Anime portrait of a teenage girl.", "Anime portrait of an elderly man.", "Anime portrait of a middle-aged woman.".\n'
    + 'If only one of sex or age band is stated, write just that one (e.g. "Anime portrait of a woman."). If neither is stated, omit the anchor line entirely. If the subject is not human (a creature, monster, spirit, robot, etc.), omit the anchor line.\n'
    + 'The anchor may contain ONLY the medium (Anime portrait), a sex word and an age band. Never put an exact age number, ethnicity, ageing cues, value words (beautiful, handsome, idol) or style words (semi-realistic) inside the anchor.\n'
    + 'After the anchor, keep the order: subject, build/posture, face, hair and eyes, clothing. Skip any item with no source in the description.\n'
    + 'Do not use 1boy/1girl/handsome/beautiful/idol. Do not describe personality, backstory or relationships unless they are visible.\n'
    + 'Do not add art style, lighting, camera or quality words. Those are added later by application code.';

  function ask(m, cb, _retry){
    var S = getS(), cfg = (S && S.cfg) || {};
    // ★C: **世界観(scene.lore)を入力から外す**。疎なキャラ説明のとき、世界観から服・装飾を
    //   「補完」してしまう余地を断つ（設定に無いものは出さない）。
    var world = '';
    var user = '説明文:\n' + m.desc.slice(0, 400)
             + (m.gender ? ('\n性別: ' + m.gender) : '')
             + (world ? ('\n世界観: ' + world) : '')
             + '\n\nEnglish tags:';
    var body = {
      model: cfg.orModel || 'deepseek/deepseek-v4-flash',
      temperature: 0.2,
      // fix497(D3): 推論型モデル(deepseek/hermes等)が外見判定でmax_tokensを推論に使い切り
      //   content空(finish=length)になる根治。初回260、空/length時のみ700で1回だけ再試行
      //   (blanket700を避け、通常成功時のトークン枠拡大を最小化=GPT裁定)。
      max_tokens: _retry ? 700 : 260,
      messages: [{ role: 'system', content: sysNow() }, { role: 'user', content: user }]
    };
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://openrouter.ai/api/v1/chat/completions', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + (cfg.orKey || ''));
      xhr.timeout = TIMEOUT_MS;
      xhr.onload = function(){
        try {
          if (xhr.status !== 200) return cb(new Error('HTTP ' + xhr.status));
          var j = JSON.parse(xhr.responseText);
          var ch0 = (j && j.choices && j.choices[0]) || {};
          var txt = (ch0.message && ch0.message.content) || '';
          var finish = ch0.finish_reason || '';
          if (!txt && !_retry && (finish === 'length' || finish === '' || finish == null)){
            try { console.warn(TAG, (m && m.name), 'appearance empty (finish=' + finish + ') → max_tokens700で1回再試行'); } catch(e){}
            try { stats.retried = (stats.retried || 0) + 1; } catch(e){}
            return ask(m, cb, true);   // fix497(D3): 1回だけ700で再試行
          }
          if (!txt){ try { console.warn(TAG, (m && m.name), 'appearance still empty after retry (finish=' + finish + ')'); } catch(e){} }
          cb(txt ? null : new Error('empty'), txt);
        } catch(e){ cb(e); }
      };
      xhr.onerror = function(){ cb(new Error('network')); };
      xhr.ontimeout = function(){ cb(new Error('timeout')); };
      xhr.send(JSON.stringify(body));
    } catch(e){ cb(e); }
  }

  function clean(t){
    var s = String(t || '').replace(/\r/g, '').trim();
    s = s.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
    s = s.replace(/[「」『』]/g, '').replace(/\n{2,}/g, '\n').trim();
    if (/[぀-ヿ一-鿿]/.test(s)) return '';          // 日本語が残っていたら不採用
    if (/\b(1boy|1girl)\b/i.test(s)) s = s.replace(/,?\s*\b(1boy|1girl)\b/gi, '');
    return s.slice(0, 600);
  }

  function ensure(force){
    if (off()) return;
    var ms = members();
    ms.forEach(function(m){
      var k = keyOf(m);
      var cur = '';
      try { cur = localStorage.getItem(k) || ''; } catch(e){}
      if (cur && !force){ stats.cached++; return; }
      if (inflight[k]) return;
      inflight[k] = 1;
      ask(m, function(err, txt){
        delete inflight[k];
        if (err){ stats.failed++; stats.lastErr = String(err && err.message || err).slice(0, 40); return; }
        var v = clean(txt);
        if (!v){ stats.failed++; stats.lastErr = 'not-english'; return; }
        try { localStorage.setItem(k, v); } catch(e){}
        stats.made++;
        try { console.log(TAG, m.name, '->', v); } catch(e){}
      });
    });
  }

  function install(){
    setTimeout(function(){ try { ensure(false); } catch(e){} }, 2500);
    try { setInterval(function(){ try { ensure(false); } catch(e){} }, 20000); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  window.__v292Dfix461 = {
    __armed: true,
    tagsFor: tagsFor,
    ensure: ensure,
    members: members,
    stats: function(){ return stats; },
    isOff: off,
    v21on: v21on,
    verNow: verOf,
    sysNow: sysNow
  };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
