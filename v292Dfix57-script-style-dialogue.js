// =====================================================================
// Chronicle TRPG — v292Dfix57: script-style dialogue extraction
// ---------------------------------------------------------------------
// 目的: Hermes 4 405B が引用符を省略して「キャラ名\n台詞」のスクリプト体で
//       NPC 発話を出すと、既存の extractDialoguesEnhanced が引用符必須の
//       パターン A-H しか持たないため拾えず、会話ログから消える。
//
// 方針: window.__v292.dialogueLayout.extractDialogues を wrap し、
//       元の戻り値に script 体の追加抽出をマージする。
//       renderStreamV15 が turns を回して per-turn で呼ぶ設計を活かし、
//       scope は自動的に turn 単位。speaker+text ハッシュで重複排除。
//
// 廃止予定: v292Dfix59 (hybrid extractor) 完成時にこの機能は吸収される。
// =====================================================================
(function(){
  if (window.__v292Dfix57Active) return;
  window.__v292Dfix57Active = true;
  var TAG = '[v292Dfix57]';

  // 一般代名詞・一般名詞（speaker として誤検出されやすい単語）
  var COMMON_PRONOUNS = [
    '彼', '彼女', '私', 'あたし', '俺', '僕', 'わたし', 'ぼく', 'オレ',
    '誰か', 'その人', 'その男', 'その女', '少年', '少女', 'あの男', 'あの女',
    'みんな', '誰', '何者'
  ];
  var COMMON_NOUNS_RE = /^(教師|学生|男|女|人|声|誰|何|それ|これ|あれ|主人公|GM|NPC|ナレーター|語り手|？|？？？)$/;

  function getStateLocal(){
    try {
      if (typeof S !== 'undefined' && S) return S;
      if (window.S) return window.S;
      return JSON.parse(localStorage.getItem('chr6') || '{}');
    } catch(e){ return {}; }
  }

  function castNames(){
    var st = getStateLocal();
    var cast = st.cast || {};
    var names = [];
    if (cast.hero && cast.hero.name) names.push(cast.hero.name);
    if (Array.isArray(cast.npcs)){
      for (var i = 0; i < cast.npcs.length; i++){
        var n = cast.npcs[i];
        if (n && n.name) names.push(n.name);
      }
    }
    return names;
  }

  function isLikelySpeaker(name, names){
    if (!name) return false;
    if (name.length > 20) return false;
    if (COMMON_PRONOUNS.indexOf(name) >= 0) return false;
    if (COMMON_NOUNS_RE.test(name)) return false;
    // 厳しめ: 登録キャラ名と完全一致のみ採用（false-positive を抑える）
    return names.indexOf(name) >= 0;
  }

  function extractScriptStyle(narrative){
    var out = [];
    if (!narrative) return out;
    var names = castNames();
    if (!names.length) return out;
    var lines = String(narrative).split('\n');
    for (var i = 0; i < lines.length - 1; i++){
      var speakerLine = lines[i].trim();
      var dialogueLine = lines[i + 1].trim();
      if (!speakerLine || !dialogueLine) continue;
      if (dialogueLine.length < 3) continue;
      // すでに引用符で始まる行はパス（既存 extractor が拾う）
      if (/^[「『〝]/.test(dialogueLine)) continue;
      // 行が「キャラ名」だけになっていること（他のテキスト混在なら除外）
      if (!isLikelySpeaker(speakerLine, names)) continue;
      out.push({ speaker: speakerLine, text: dialogueLine, source: 'v292Dfix57' });
    }
    return out;
  }

  function mergeUnique(existing, extra){
    if (!extra || !extra.length) return 0;
    var seen = Object.create(null);
    for (var i = 0; i < existing.length; i++){
      var d = existing[i];
      seen[(d.speaker || '') + '|' + (d.text || '')] = true;
    }
    var added = 0;
    for (var j = 0; j < extra.length; j++){
      var e = extra[j];
      var k = (e.speaker || '') + '|' + (e.text || '');
      if (seen[k]) continue;
      seen[k] = true;
      existing.push(e);
      added++;
    }
    return added;
  }

  function tryWrap(){
    var dl = window.__v292 && window.__v292.dialogueLayout;
    if (!dl || typeof dl.extractDialogues !== 'function'){
      setTimeout(tryWrap, 300);
      return;
    }
    if (dl.__v292Dfix57Wrapped) return;

    var orig = dl.extractDialogues;
    var wrapped = function(narrSrc, turn){
      var out = orig.apply(this, arguments) || [];
      try {
        var narrative = Array.isArray(narrSrc) ? narrSrc.join('\n') : String(narrSrc || '');
        var extra = extractScriptStyle(narrative);
        if (extra.length){
          var added = mergeUnique(out, extra);
          if (added > 0){
            console.log(TAG, 'script-style extracted:', added, 'new (from', extra.length, 'candidates)');
          }
        }
      } catch(e){
        console.warn(TAG, 'error:', e && e.message);
      }
      return out;
    };

    dl.extractDialogues = wrapped;
    // 旧 dfix15 経由参照も差し替え
    if (window.__v292.dfix15 && window.__v292.dfix15.extractDialogues === orig){
      window.__v292.dfix15.extractDialogues = wrapped;
    }
    dl.__v292Dfix57Wrapped = true;
    console.log(TAG, 'extractDialogues wrapped (script-style extension active)');

    // 既存 turns の再描画
    try {
      if (typeof dl.renderStream === 'function') dl.renderStream();
    } catch(e){
      console.warn(TAG, 're-render skipped:', e && e.message);
    }
  }
  tryWrap();
})();
