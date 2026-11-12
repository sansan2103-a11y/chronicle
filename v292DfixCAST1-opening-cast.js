// =====================================================================
// Chronicle TRPG - v292DfixCAST1: 開始場面にいると確定している NPC の説明を、最初の回から user の cast.npcs に渡す
// ---------------------------------------------------------------------
// laneCAST1（2026-11-13・LOCAL 試作・未出荷）: GPT #127-SU ① 条件付 GO。
// 現象: 1 ターン目の入力が NPC の名前を言わないと、fix95（名前が出た NPC だけ渡す）で user の cast.npcs が空になり、
//       sys には名前だけ出る。説明（関係・口調・年齢）なしで 1 ターン目が書かれる（laneCONTRA1 実測）。
// 直し: 物語の最初の回（S.turns.length === 0）だけ、「開始場面にいると確定している NPC」の説明をその回の user に補う。
//   ・「確定」の根拠は決定的に読めるものだけ（推定しない）:
//       N 名前: 開始条件（S.scene.startCondition）の文に NPC の名前があり、その節に 不在・別の場所・未来・過去・所有（〜の家）の語が無い
//       C 人数: 開始条件 か 1 ターン目の入力に「N 人」があり、N が 主人公＋登録 NPC 全員 の人数とちょうど同じ（＝全員がその場にいる）
//               （「三人目」「三人分」「三人のうち」「三人ほど」は数えない。v292DfixCAST1CountOff='1' でこの根拠だけ止められる）
//       ※ 1 ターン目の入力に名前がある NPC は fix95 が従来どおり登場させる（ここでは何もしない）。
//   ・根拠が無い NPC は渡さない。場にいると推定しない。
//   ・fix95 の登場管理（appeared 印）は読むだけ。書かない・保存しない。その回の送信だけの補い。
//   ・補う中身は 名前・説明（desc）・性別・性格（personality）。合計の増分は user で 600 字まで。超えるときは説明文のうち
//     口調・呼び方・一人称・年齢・関係・役割 を含む文を優先して残し、それ以外の文から落とす。それでも超えれば末尾を切る。
//   ・sys は 1 字も変えない。2 ターン目以降は何もしない（従来と同じ送信）。
// 鍵（毎回評価・再読込不要。既定 OFF＝送信バイト同一）:
//   localStorage v292DfixCAST1On='1' … 上の動き（候補）
//   localStorage v292DfixCAST1On='2' … 比較用の別腕（候補ではない）: 未登場の登録 NPC 全員の説明を渡し、確定の根拠が無い人には
//                                      presence:'まだこの場面にはいない（登場していない）' の印を付ける。上限 900 字。
//   kill: v292DfixCAST1Off='1'（常に優先）
// 呼び出し: v292Dfix58 の userExt（parsed を渡す）。全 NPC の名簿は features.js の fix95 が build の間だけ window.__v292Dfix95Roster に置く。
// 検証口: window.__v292DfixCAST1Core
// =====================================================================
(function(root){
  'use strict';
  var VER = 'cast1-20261113-r1';
  var CAP1 = 600, CAP2 = 900;
  var ABSENT_MARK = 'まだこの場面にはいない（登場していない）';
  function lsGet(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function mode(){ if (lsGet('v292DfixCAST1Off') === '1') return ''; var v = lsGet('v292DfixCAST1On'); return (v === '1' || v === '2') ? v : ''; }
  function countOn(){ return lsGet('v292DfixCAST1CountOff') !== '1'; }
  function str(v){ return v == null ? '' : String(v); }

  // ---- 文・節 ----
  function stripQuotes(t){ return str(t).replace(/「[^」]*」|『[^』]*』/g, '〃'); }   // 台詞・引用の中は根拠にしない
  function sentences(t){ return stripQuotes(t).split(/[。！？!?\n]+/).map(function(s){ return s.trim(); }).filter(Boolean); }
  // 不在・別の場所・未来・過去・伝聞・所有 の語（この語が同じ節にあれば「その場にいる」とは読まない＝渡さない側に倒す）
  var NOT_HERE = /いない|居ない|おらず|居らず|不在|留守|欠席|まだ(?:来|戻|着|帰|現れ|姿|起き)|戻ってい?な|来てい?な|帰ってい?な|遅れ|あとから|後から|これから|やがて|のちに|後で|あとで|別の|離れた|遠く|外出|出かけ|出掛け|電話|通話|無線|手紙|写真|肖像|遺|亡くな|死ん|故人|行方|失踪|消え|探し|捜し|待って|待ち|会いに|訪ね|向かって|向かう|向かい|について|のこと|噂|うわさ|名前|思い出|昔|かつて|以前|だった|はず|らしい|かもしれ|予定|つもり|来る(?:まで|前|の)|呼び|呼ん|頼ま|頼ん|から(?:聞|預|届|もら|渡され|の)|宛/;
  function nameAt(text, name, from){
    // 名前の出現位置（後ろが「の」＝所有・「たち／達／ら」は不可。短い名前・かなだけの名前は fix955 と同じ前後の確認）
    var i = text.indexOf(name, from || 0);
    while (i >= 0){
      var rest = text.slice(i + name.length), ok = true;
      if (/^の/.test(rest)) ok = false;
      if (ok && root.__v292Dfix955 && typeof root.__v292Dfix955.nameHit === 'function'){ try { ok = !!root.__v292Dfix955.nameHit(text.slice(Math.max(0, i - 1), i + name.length + 3), name); } catch(e){ ok = true; } }
      if (ok) return i;
      i = text.indexOf(name, i + 1);
    }
    return -1;
  }
  // 名前の根拠: 文を「、」で節に分け、名前のある節から、別の登録名が出る節の手前までを範囲にして、不在の語が無ければ確定
  function nameEvidence(text, name, allNames){
    var ss = sentences(text);
    for (var a = 0; a < ss.length; a++){
      var chunks = ss[a].split(/[、，,]/), pos = -1, k;
      for (k = 0; k < chunks.length; k++){ if (nameAt(chunks[k], name) >= 0){ pos = k; break; } }
      if (pos < 0) continue;
      var scope = chunks[pos];
      for (k = pos + 1; k < chunks.length; k++){
        var other = false;
        for (var o = 0; o < allNames.length; o++){ if (allNames[o] !== name && allNames[o] && chunks[k].indexOf(allNames[o]) >= 0){ other = true; break; } }
        if (other) break;
        scope += '、' + chunks[k];
      }
      if (NOT_HERE.test(scope)) continue;
      return { kind: 'N', src: 'startCondition', text: ss[a].slice(0, 40) };
    }
    return null;
  }
  // 人数の根拠
  var KN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function toNum(s){
    s = str(s).replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s === '十') return 10;
    var m = s.match(/^十([一二三四五六七八九])$/); if (m) return 10 + KN[m[1]];
    m = s.match(/^([二三四五六七八九])十([一二三四五六七八九])?$/); if (m) return KN[m[1]] * 10 + (m[2] ? KN[m[2]] : 0);
    return KN[s] || 0;
  }
  var CNT_RE = /([0-9０-９]{1,2}|[一二三四五六七八九十]{1,3})人(?!目|分|ずつ|前|組|部屋|用|掛け|がかり|乗り|以上|以下|ほど|くらい|ぐらい|近く|あまり|余り|のうち|の中の|中[一二三四五六七八九十0-9０-９])/g;
  function countEvidence(text, total, src){
    if (total < 2) return null;
    var ss = sentences(text);
    for (var a = 0; a < ss.length; a++){
      var s = ss[a], m; CNT_RE.lastIndex = 0;
      var nums = [];
      while ((m = CNT_RE.exec(s)) !== null){ var before = s.slice(Math.max(0, m.index - 2), m.index); if (/[数何幾]$/.test(before) || /(?:あと|残り|ほか|他)(?:の)?$/.test(before)) { nums.push(-1); continue; } nums.push(toNum(m[1])); }
      if (!nums.length) continue;
      if (nums.length !== 1 || nums[0] !== total) continue;        // 同じ文に人数が 2 つ以上・全員の人数と違う → 読まない
      if (NOT_HERE.test(s)) continue;
      return { kind: 'C', src: src, text: s.slice(0, 40) };
    }
    return null;
  }

  // ---- 確定の判定 ----
  // pick(state, roster, inputText) → { turn0, total, items:[{ name, appeared, why:null|{kind,src,text} }] }
  function pick(state, roster, inputText){
    var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
    var npcs = (Array.isArray(roster) ? roster : []).filter(function(n){ return n && n.name; });
    var out = { turn0: turns.length === 0, total: npcs.length + 1, items: [] };
    if (!out.turn0 || !npcs.length) return out;
    var cond = str(state && state.scene && state.scene.startCondition);
    var names = npcs.map(function(n){ return str(n.name); });
    try { if (state.cast && state.cast.hero && state.cast.hero.name) names.push(str(state.cast.hero.name)); } catch(e){}
    var cAll = null;
    if (countOn()){ cAll = countEvidence(cond, out.total, 'startCondition') || countEvidence(inputText, out.total, 'input'); }
    npcs.forEach(function(n){
      var nm = str(n.name), why = nameEvidence(cond, nm, names) || cAll || null;
      out.items.push({ name: nm, appeared: n.appeared === true, why: why });
    });
    return out;
  }

  // ---- 説明の短縮（必要な属性の文を優先） ----
  var KEY_ATTR = /口調|ため口|タメ口|丁寧語|敬語|方言|訛|語尾|話し方|喋り方|しゃべり方|ぶっきらぼう|一人称|呼ぶ|呼び|呼ばれ|歳|才|年生|年上|年下|同い年|年配|幼なじみ|幼馴染|兄|姉|弟|妹|父|母|娘|息子|祖|夫|妻|恋人|親友|友人|先輩|後輩|同期|同僚|上司|部下|初対面|師|弟子|役|係|職|仕事|担当/;
  function descSentences(desc){
    var out = [], buf = '', depth = 0;
    desc = str(desc);
    for (var i = 0; i < desc.length; i++){
      var c = desc.charAt(i); buf += c;
      if (c === '「' || c === '（' || c === '(') depth++;
      else if (c === '」' || c === '）' || c === ')') { if (depth > 0) depth--; }
      else if (depth === 0 && (c === '。' || c === '\n')){ if (buf.trim()) out.push(buf); buf = ''; }
    }
    if (buf.trim()) out.push(buf);
    return out;
  }
  function shrinkDesc(desc, cap){
    desc = str(desc);
    if (desc.length <= cap) return desc;
    var ss = descSentences(desc), keep = ss.map(function(){ return true; }), len = desc.length, i;
    for (i = ss.length - 1; i >= 0 && len > cap; i--){ if (!KEY_ATTR.test(ss[i])){ keep[i] = false; len -= ss[i].length; } }   // 属性の語が無い文を後ろから落とす
    var r = ss.filter(function(_, k){ return keep[k]; }).join('');
    if (r.length > cap) r = r.slice(0, Math.max(0, cap - 1)) + '…';
    return r;
  }
  function entry(n, cap, mark){
    var o = { name: str(n.name) };
    var d = shrinkDesc(n.desc, cap); if (d) o.desc = d;
    if (n.personality && cap >= 40) o.personality = shrinkDesc(n.personality, Math.max(20, Math.floor(cap / 3)));
    if (n.gender) o.gender = str(n.gender);
    if (mark) o.presence = mark;
    return o;
  }

  // ---- 適用（parsed = user の JSON。返すのは同じ形。変えるのは cast.npcs だけ） ----
  var _last = null;
  function apply(parsed, state, roster){
    var md = mode(); _last = { mode: md, added: 0, chars: 0, items: [] };
    if (!md) return parsed;
    try {
      if (!parsed || !parsed.cast || !Array.isArray(parsed.cast.npcs)) return parsed;
      var full = Array.isArray(roster) ? roster : ((state && state.cast && Array.isArray(state.cast.npcs)) ? state.cast.npcs : []);
      var inputText = str(parsed.currentInput && parsed.currentInput.text);
      var pk = pick(state, full, inputText);
      if (!pk.turn0 || !pk.items.length) return parsed;
      var have = {}; parsed.cast.npcs.forEach(function(e){ if (e && e.name) have[str(e.name)] = e; });
      var want = [];   // [{ n, mark }]
      full.forEach(function(n){
        if (!n || !n.name || have[str(n.name)]) return;
        var it = null; for (var i = 0; i < pk.items.length; i++) if (pk.items[i].name === str(n.name)) { it = pk.items[i]; break; }
        if (!it) return;
        if (it.why) want.push({ n: n, mark: '', why: it.why });
        else if (md === '2') want.push({ n: n, mark: ABSENT_MARK, why: null });
      });
      _last.items = pk.items.map(function(x){ return { name: x.name, appeared: x.appeared, kind: x.why ? x.why.kind : '', src: x.why ? x.why.src : '' }; });
      if (!want.length) return parsed;
      var CAP = md === '2' ? CAP2 : CAP1;
      var parsed0 = parsed.cast.npcs, orig = parsed0;
      var base = JSON.stringify(parsed, null, 2).length, cap = 400, built = null, grow = 0;
      function build(c){
        var byName = {}; want.forEach(function(w){ byName[str(w.n.name)] = entry(w.n, c, w.mark); });
        var merged = parsed0.slice();   // 既存の行（fix95 が通した人）は順番も中身もそのまま。補う行は名簿の順で後ろに足す（添字で対応を取る後段の部品をずらさない）
        full.forEach(function(n){ var nm = n && n.name ? str(n.name) : ''; if (nm && byName[nm]) merged.push(byName[nm]); });
        return merged;
      }
      for (;;){
        built = build(cap); parsed.cast.npcs = built;
        grow = JSON.stringify(parsed, null, 2).length - base;
        if (grow <= CAP || cap <= 0) break;
        cap = cap > 60 ? cap - 20 : cap - 10;
      }
      if (grow > CAP){ parsed.cast.npcs = orig; _last.over = grow; return parsed; }   // 名前だけでも上限を超える（人数が極端に多い）→ 何もしない
      _last.added = want.length; _last.chars = grow; _last.cap = cap;
      return parsed;
    } catch(e){ _last.err = String(e && e.message || e); return parsed; }
  }

  root.__v292DfixCAST1Core = { VER: VER, mode: mode, countOn: countOn, pick: pick, apply: apply, nameEvidence: nameEvidence, countEvidence: countEvidence,
    shrinkDesc: shrinkDesc, toNum: toNum, CAP1: CAP1, CAP2: CAP2, ABSENT_MARK: ABSENT_MARK, last: function(){ return _last; } };
})(typeof window !== 'undefined' ? window : globalThis);
