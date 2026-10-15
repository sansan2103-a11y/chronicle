// =====================================================================
// Chronicle TRPG - v292Dfix957: 独立行の裸「」の話者を、引用の「後ろ」の文で確かめる（GPT #126-M Local GO）
//
// ■なぜ
//   index.html の会話ログ組み立て（fix217/218 の窓推測）は、独立行の裸「」の話者を
//   「引用の前 200 字に出てくる登録名（フルネーム）」で決める。
//   ・本文は「千景」「悠真」のように下の名前で書かれることが多く、フルネームが窓に無いと
//     候補 0 人 → 主人公に倒れる（実機: 「ここ、座れるよ」\n千景が…指した → 悠真）。
//   ・引用の後ろに話者が出る型（「お待たせ」\n背後から声がした。振り向くと…澄香）は見ていない。
//
// ■何をするか（窓推測で決まった時だけ。タグ・後置話者・「Xの声」前置などの確かな経路には触らない）
//   後ろ 1〜2 文（次の「の手前まで）を読む。名前はフルネームと下の名前・名字（キャストから機械的に作る）で照合。
//   (1) 強い証拠＝「Xが/Xは …言った・呟いた・答えた…」「Xの声だった」「声の主はX」「そう言ったのはX」
//       → X に決める（窓推測より優先）。
//   (2) 弱い証拠＝後ろの文の主語が窓推測と別の人物（「千景が…指した」「澄香が立っていた」など動作だけ）
//       → 決めない（保留）。保留は既存の第 2 層（attribQuotes218）へ回り、決まらなければ会話ログに載せない
//         （既存の「誤帰属より欠落が安全」の扱い）。
//   (3) それ以外 → 何もしない（従来どおり）。
//   後ろの主語が主人公だけの時（「悠真は千景の方を振り向いた」）も何もしない。
//
// ■守ること
//   ・本文・引用の文字・数・順序は変えない。動かすのは話者の決め方だけ。
//   ・タグ付き <say who> は対象外（モデルのタグ誤りはここでは直さない＝別原因として記録）。
//   ・既存セーブは書き換えない（新しいターンの組み立て時だけ）。
//   ・r4: 全ユーザー既定 ON（DEFAULT_ON）。端末の停止: v292Dfix957Off='1'。全体の停止: DEFAULT_ON=false の js を上げ直す
// 観測: window.__v292Dfix957.stats() / last()
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292Dfix957 && G.__v292Dfix957.__installed) return;
  var VERSION = 'fix957-r5-fix974-20261015';
  var st = { calls: 0, strong: 0, abstain: 0, none: 0, errors: 0, fallback: 0, resolved: 0 }, lastRec = null;
  var pend = {};   // 保留にした引用 → 元の窓推測（第 2 層で決まらなかった時に戻す＝引用数を減らさない）
  // r4（GPT 裁定変更・FIX957_DEFAULT_ON）: 全ユーザー既定 ON。
  //   配信側の全体スイッチ = DEFAULT_ON。false にしたこの js を 1 本上げ直せば、全端末で次の読み込みから止まる（Cache-Control: max-age=0, must-revalidate を確認済み）。
  //   端末ごとの停止 = localStorage v292Dfix957Off='1'（常に優先）。DEFAULT_ON=false の時だけ v292Dfix957On='1' の端末で動く。
  var DEFAULT_ON = true;
  function off(){ try { var ls = G.localStorage; if (!ls) return true; if (ls.getItem('v292Dfix957Off') === '1') return true; if (DEFAULT_ON) return false; return ls.getItem('v292Dfix957On') !== '1'; } catch(e){ return true; } }

  // フルネーム → 照合に使う呼び名（重複する呼び名は使わない）
  function aliasMap(names){
    var m = {}, cnt = {};
    function add(a, full){ if (!a || a.length < 2) return; (m[a] = m[a] || {})[full] = 1; }
    (names || []).forEach(function(n){
      n = String(n || '').trim(); if (!n) return;
      add(n, n);
      var parts = n.split(/[\s　・]+/).filter(Boolean);
      if (parts.length >= 2){ parts.forEach(function(p){ add(p, n); }); return; }
      if (/^[㐀-鿿々]{3,4}$/.test(n)){            // 漢字 3〜4 字の和名: 上 2 字・下 2 字を呼び名の候補にする
        add(n.slice(-2), n); add(n.slice(0, 2), n);   // 3 字は 1+2 か 2+1 か分からないので上下 2 字とも候補（他の人と重なれば使わない）
      }
    });
    var out = {}; Object.keys(m).forEach(function(a){ var f = Object.keys(m[a]); if (f.length === 1) out[a] = f[0]; });
    return out;   // alias -> full
  }
  function afterSentences(after){
    var s = String(after || '').replace(/^[\s　」』]+/, '');
    var q = s.search(/[「<]/); if (q >= 0) s = s.slice(0, q);   // 次の引用・タグの手前まで
    var out = [], buf = '';
    for (var i = 0; i < s.length && out.length < 2; i++){
      var ch = s[i]; if (ch === '\n'){ if (buf.trim()) out.push(buf.trim()); buf = ''; continue; }
      buf += ch; if (ch === '。'){ out.push(buf.trim()); buf = ''; }
    }
    if (out.length < 2 && buf.trim()) out.push(buf.trim());
    return out.slice(0, 2);
  }
  // ★fix974: 強い証拠の文が「次の引用の手前の最後の文」で、その直後が同じ人物の <say who> なら導入文とみなす
  function k1IsIntro(after, ev, who){
    try {
      if (k1Off()) return false;
      var s = String(after || '').replace(/^[\s　」』]+/, '');
      var q = s.search(/[「<]/); if (q < 0) return false;
      var head = s.slice(0, q), p = head.lastIndexOf(ev); if (p < 0) return false;
      if (/[。\n][\s　]*[^\s　]/.test(head.slice(p + ev.length))) return false;   // 証拠の後ろにまだ別の文がある＝導入文ではない
      return k1Intro(s.slice(q), who);
    } catch(e){ return false; }
  }
  var SPEECH = '(言った|言って|言う|呟いた|呟く|つぶやいた|囁いた|ささやいた|尋ねた|訊ねた|訊いた|問うた|答えた|叫んだ|返した|応じた|告げた|続けた|付け加えた|口にした|言い添えた|声をかけた|声を掛けた|声を上げた)';
  function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // ★fix974（K1・GPT #127-AN Local GO）: 「次の台詞の導入文」を前の台詞の話者の証拠に使わない。
  //   判定は明示の say タグだけ：導入文の直後（空白を除く）が <say who="X"> で、X が証拠の人物と同じ時に限る。
  //   タグの無い「」は誰の台詞か分からないので使わない（推測どうしを証拠にする循環を作らない）。
  //   端末の停止: localStorage v292Dfix974Off='1'（fix957 の ON/OFF とは独立）。
  function k1Off(){ try { return G.localStorage && G.localStorage.getItem('v292Dfix974Off') === '1'; } catch(e){ return true; } }
  function k1Intro(rest, name){
    try {
      if (k1Off()) return false;
      var m = String(rest || '').replace(/^[\s　]+/, '').match(/^<say\b[^>]*?\bwho="([^"]*)"/);
      return !!(m && name && m[1].trim() === String(name).trim());
    } catch(e){ return false; }
  }
  function decide(o){
    st.calls++;
    try {
      if (off()) return null;
      var hero = String(o.hero || ''), sw = o.sw == null ? '' : String(o.sw);
      var say = String(o.say == null ? '' : o.say);
      if (!say.replace(/[\s　。、！？!?…・ッぁぃぅぇぉ「」『』ー〜]/g, '')){ st.none++; return null; }   // 記号・息だけは触らない（第 2 層に回らず消えるため）
      var al = aliasMap(o.names || []);
      var aliases = Object.keys(al).sort(function(a, b){ return b.length - a.length; });
      if (!aliases.length){ st.none++; return null; }
      var sents = afterSentences(o.after);
      if (!sents.length){ st.none++; return null; }
      var text = sents.join('\n');
      var nameRe = '(' + aliases.map(esc).join('|') + ')';
      // (1) 強い証拠
      var pats = [
        new RegExp(nameRe + '(?:が|は)[^。\\n「」]{0,24}?' + SPEECH),
        new RegExp(nameRe + 'の声(?:だった|だ|が|で)'),
        new RegExp('声の主は[、\\s]*' + nameRe),
        new RegExp('(?:そう|と)(?:言った|呟いた|告げた|口にした)のは[、\\s]*' + nameRe)
      ];
      for (var i = 0; i < pats.length; i++){
        var m = pats[i].exec(text);
        if (m){
          // 「Xは答えない／言わなかった」は対象外（話していない）
          var tailStr = text.slice(m.index + m[0].length, m.index + m[0].length + 4);
          if (/^(ない|なかった|ず)/.test(tailStr)) continue;
          var who = al[m[1]];
          if (who && k1IsIntro(o.after, m[0], who)){ st.k1skip = (st.k1skip || 0) + 1; lastRec = { kind: 'k1-intro', who: who, from: sw, ev: m[0].slice(0, 30) }; continue; }   // ★fix974: 次の <say who=X> の導入文＝前の台詞の証拠にしない
          if (who){ st.strong++; lastRec = { kind: 'strong', who: who, from: sw, ev: m[0].slice(0, 30) }; return { who: who, kind: 'strong', ev: m[0] }; }
        }
      }
      // (2) 弱い証拠: 後ろの文の主語（Xが／Xは）が窓推測と別人で、主人公以外
      var subjRe = new RegExp(nameRe + '(?:が|は)', 'g'), subs = {}, mm;
      while ((mm = subjRe.exec(text))){ var f = al[mm[1]]; if (f) subs[f] = 1; }
      var list = Object.keys(subs);
      var others = list.filter(function(n){ return n !== hero; });
      if (others.length && list.indexOf(sw) < 0){
        st.abstain++; lastRec = { kind: 'abstain', from: sw, subjects: list }; if (say) pend[say] = sw || null;
        return { abstain: true, kind: 'weak-conflict', subjects: list };
      }
      st.none++; return null;
    } catch(e){ st.errors++; return null; }
  }
  // 第 2 層のあと・保留を捨てる filter の直前に呼ぶ。決まらなかった保留は元の窓推測へ戻す（引用数・順序を保つ）。
  function restore(list){
    try {
      if (!Array.isArray(list)) { pend = {}; return 0; }
      var n = 0;
      list.forEach(function(c){
        if (!c || !c.say || !Object.prototype.hasOwnProperty.call(pend, c.say)) return;
        if (c.who){ st.resolved++; return; }
        if (pend[c.say]){ c.who = pend[c.say]; c._f957fb = 1; st.fallback++; n++; }
      });
      pend = {}; return n;
    } catch(e){ st.errors++; pend = {}; return 0; }
  }
  G.__v292Dfix957 = { __installed: true, version: VERSION, decide: decide, restore: restore, aliasMap: aliasMap, afterSentences: afterSentences, k1Intro: k1Intro, k1IsIntro: k1IsIntro,
    stats: function(){ var o = {}; for (var k in st) o[k] = st[k]; o.off = off(); o.version = VERSION; return o; },
    last: function(){ return lastRec; }, isOff: off };
  try { console.log('[v292Dfix957]', VERSION); } catch(e){}
})();
