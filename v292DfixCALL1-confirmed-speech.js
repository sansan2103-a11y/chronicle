// =====================================================================
// Chronicle TRPG - v292DfixCALL1 / SPK3: 話者が確定した発話だけを使う 2 つの参照（呼称の先例・直近の台詞の話者）
// ---------------------------------------------------------------------
// laneCAST1（2026-11-13・LOCAL 試作・未出荷）: GPT #127-SU ②③。どちらも既定 OFF・鍵は別々・片方だけで動く。
// 共通: 「話者が確定した発話」＝
//     (a) モデルが <say who="X"> を明示したカード（_convSayMeta が _convSays と揃っていて sourceKind 'say-tag'・tagMappingConfidence 'exact'・
//         speakerRevision 0・sourceWhoRaw = who。v292DfixRC1 / fix915 と同じ基準）
//     (b) 人が話者を直したカード（SFL1: sourceKind 'manual'、または _sflCorrections に同じ _sid の有効な記録があり to = 今の who）
//     (c) プレイヤーの SAY 入力（話者 = 主人公）… CALL1 だけが使う
//   窓推測で付いたカード（bare-inferred・harvest・say-tag-promoted・say-tag-renamed・unmatched・meta 無し・'???'・心の声）は使わない。
//   AI の呼び出しなし。保存しない（S・localStorage に書かない）。毎回その回の S.turns から作り直す（取消・編集・話者の訂正に追従）。sys は 0 字。
//
// ★CALL1（鍵 v292DfixCALL1On='1'・kill v292DfixCALL1Off='1'）: earlierFacts.items の最後に 1 行（最大 120 字）
//     例: 呼称の先例：灯里→凪「凪」／志保→朔「朔さん」（以前の確定発話）
//   ・拾う: 確定発話の中の呼びかけ（文頭の「名前（＋さん・先輩…）、」／文末の「…、名前」）。相手は登録人物（主人公＋NPC）で話者と別の人。
//     台詞の中の「」（呼び方の説明・引用）は拾わない。「名前＋よ、」は拾う。
//     名前を含まない呼び方（部長・先生…）は、相手が 1 人に決まるときだけ（設定文に「Bを「部長」と呼ぶ」等がある／その肩書きが設定文にある登録人物が 1 人だけ）。
//   ・同じ組は、最後に確定した呼称で上書き（関係・愛称・敬語の変化を妨げない）。命令の文は足さない（earlierFacts の今の rule の下に置くだけ）。
//   ・出さない: 先例が無い／その組の呼びかけが直近 2 ターンにある（手本が recentScenes に見えている）／2 人のどちらかがその場にいない
//     （主人公以外は、直近 2 ターンの本文・入力か今回の入力に名前がある人だけ「いる」とみなす）／設定文の呼び方と食い違う先例（誤りを固定しない）。
//   ・出し続けない: 先例が直近 2 ターンの外へ出てから 3 回（経過 3・4・5 ターン）だけ続けて出し、その後は 4 ターンに 1 回（経過 9・13・17…）。
//     呼びかけが本文に出れば、その組は直近 2 ターンの間また出なくなる。
//   ・プレイヤーの SAY 入力から拾った先例で、その入力の行が earlierFacts にそのまま載っている回は出さない（同じ呼び方がもう見えている）。
//   ・FACTS1 の kill（v292DfixFACTS1Off='1'）のときは出さない。earlierFacts の 600 字の枠・既存の行は変えない（足すだけ）。
//
// ★SPK3（鍵 v292DfixSPK3On='1'・kill v292DfixSPK3Off='1'）: user JSON の recentScenes の直後に recentSpeakers を足す
//     例: "recentSpeakers": { "rule": "…", "items": [ { "turnOffset": -1, "speaker": "凪", "quote": "……煙" } ] }
//   ・直近 2 ターン（recentScenes と同じ窓）の、話者が確定した台詞だけ。本文（recentScenes）は 1 字も書き換えない。
//   ・quote は台詞の先頭 14 字まで（長ければ「…」）。その回の本文に実際にある台詞だけ（本文に無いカードは入れない）。最大 10 件（新しいターンを優先）。
//   ・窓推測の話者は入れない（不明としても入れない）。プレイヤーの SAY 入力は recentScenes[].input にあるので入れない。
//   ・既存の recentDialogues は fix75 が「recentScenes の本文に同じ台詞があるもの」を落とすので、recentSpeakers とは重ならない。
// 呼び出し: v292Dfix58 の userExt。検証口: window.__v292DfixCALL1Core / window.__v292DfixSPK3Core
// =====================================================================
(function(root){
  'use strict';
  var VER = 'call1spk3-20261113-r2';
  function lsGet(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function callOn(){ return lsGet('v292DfixCALL1Off') !== '1' && lsGet('v292DfixCALL1On') === '1'; }
  function spkOn(){ return lsGet('v292DfixSPK3Off') !== '1' && lsGet('v292DfixSPK3On') === '1'; }
  function str(v){ return v == null ? '' : String(v); }
  function nfc(s){ s = str(s).trim(); try { return s.normalize('NFC'); } catch(e){ return s; } }
  function esc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---------------- 共通: 話者の確かさ ----------------
  var UNCLEAR = /^(?:[?？]+|謎の声|不明|誰か|声|[?？]{3})$/;
  function unclearWho(w){ w = nfc(w); return !w || UNCLEAR.test(w) || /[?？]{2,}/.test(w); }
  function monologue(w){ return /[（(]\s*心\s*[)）]|\(心\)|（心）|内心|心の声/.test(str(w)); }
  // confirmedKind(turn, j) → 'tag' | 'manual' | ''
  function confirmedKind(turn, j){
    try {
      var cs = turn && turn._convSays, meta = turn && turn._convSayMeta, c = cs && cs[j];
      if (!c || typeof c.say !== 'string' || unclearWho(c.who) || monologue(c.who)) return '';
      var corr = turn._sflCorrections;
      if (Array.isArray(corr) && c._sid != null){
        for (var k = 0; k < corr.length; k++){ var r = corr[k]; if (r && r.sid === c._sid && r.eff !== false && nfc(r.to) === nfc(c.who)) return 'manual'; }
      }
      if (Array.isArray(meta) && meta.length === cs.length){
        var e = meta[j]; if (!e || typeof e !== 'object') return '';
        if (e.sourceKind === 'manual') return 'manual';
        if (e.sourceKind === 'say-tag' && e.tagMappingConfidence === 'exact' && !((+e.speakerRevision || 0) > 0) && nfc(e.sourceWhoRaw) === nfc(c.who)) return 'tag';
      }
    } catch(e2){}
    return '';
  }
  function sayText(s){ return str(s).replace(/^[\s　]*[「『]/, '').replace(/[」』][\s　]*$/, '').trim(); }
  function narrText(turn){ var n = turn && turn.narrative; return Array.isArray(n) ? n.join('\n') : str(n); }
  function squash(s){ return str(s).replace(/[「」『』\s　]/g, ''); }

  // ---------------- 名簿 ----------------
  // people(state, roster) → [{ name, forms:[…], desc, hero }]
  function people(state, roster){
    var out = [], seen = {};
    function add(n, hero){ if (!n || !n.name) return; var nm = nfc(n.name); if (!nm || seen[nm]) return; seen[nm] = 1;
      var forms = [nm]; nm.split(/[\s　・=＝]+/).forEach(function(p){ if (p.length >= 2 && forms.indexOf(p) < 0) forms.push(p); });
      forms.sort(function(a, b){ return b.length - a.length; });
      out.push({ name: nm, forms: forms, desc: str(n.desc), hero: !!hero }); }
    try { add(state.cast.hero, true); } catch(e){}
    var full = Array.isArray(roster) ? roster : ((state && state.cast && Array.isArray(state.cast.npcs)) ? state.cast.npcs : []);
    full.forEach(function(n){ add(n, false); });
    return out;
  }
  function whoOf(ppl, who){ who = nfc(who); for (var i = 0; i < ppl.length; i++){ if (ppl[i].forms.indexOf(who) >= 0) return ppl[i]; } return null; }

  // ---------------- CALL1: 呼びかけの抽出 ----------------
  var ROLES = ['機関長', '看護師長', '師長', '隊長', '部長', '団長', '班長', '社長', '店長', '船長', '艦長', '村長', '館長', '所長', '課長', '主任', '監督', '警部', '刑事', '軍曹', '大尉', '番頭', '博士', '教授'];
  var SUF = '(?:先輩|先生|さん|くん|君|ちゃん|さま|様|殿|どの|氏|' + ROLES.join('|') + '|兄さん|姉さん|兄ちゃん|姉ちゃん|おじさん|おばさん|っち|ちん|たん|嬢|坊)';
  var PRE_START = '(?:^|[。！？!?…‥―—─])';   // 台詞の中の「」（呼び方の説明・引用）は呼びかけにしない
  var LEAD = '(?:[\\s　]*(?:ねえ|ねぇ|なあ|なぁ|おい|あの|ほら|ちょっと|ああ|あ|え|えっと|その)[、…\\s　]*)?[\\s　…‥―—─]*';
  var POST_ANY = '(?=$|[、。！？!?…‥―—─っッ〜ー\\s　]|よ[、。！？!?])';   // 「黒田さんよ。」「柏木よ、」も呼びかけ
  var POST_END = '(?=$|[。！？!?…‥〜ー]|っ[！!。]?)';
  var TITLES = ['先輩', '後輩', '機関長', '看護師長', '師長', '部長', '隊長', '団長', '班長', '社長', '店長', '船長', '艦長', '村長', '館長', '所長', '課長', '主任', '監督', '警部', '刑事', '軍曹', '大尉', '番頭', '先生', '博士', '教授', '女将さん', '女将', '親方', '師匠', 'お頭', 'マスター', '神父様', '神父', '司祭様', '司祭',
    'お兄ちゃん', 'お姉ちゃん', 'お兄さん', 'お姉さん', '兄さん', '姉さん', '兄貴', '姉貴', '兄ちゃん', '姉ちゃん', 'お父さん', 'お母さん', '父さん', '母さん', 'おじいちゃん', 'おばあちゃん', 'お嬢さん', 'お嬢様', '坊ちゃん'];
  var ROLE_TITLE = /^(?:機関長|看護師長|師長|部長|隊長|団長|班長|社長|店長|船長|艦長|村長|館長|所長|課長|主任|監督|警部|刑事|軍曹|大尉|番頭|先生|博士|教授|女将|親方|師匠|お頭|マスター|神父|司祭)/;
  // vocatives(text, ppl, speaker) → [{ target, form, at, titleOnly }]
  function vocatives(text, ppl, speaker){
    var t = sayText(text), out = [], i, f;
    if (!t) return out;
    for (i = 0; i < ppl.length; i++){
      var p = ppl[i]; if (speaker && p.name === speaker.name) continue;
      for (f = 0; f < p.forms.length; f++){
        var nm = esc(p.forms[f]), m, re;
        // 文頭（発話の頭・句点や「…」の後）: 名前＋敬称 の後が 区切り
        re = new RegExp(PRE_START + LEAD + '(' + nm + SUF + '?)' + POST_ANY, 'g');
        while ((m = re.exec(t)) !== null){
          var at = m.index + m[0].length - m[1].length, after = t.slice(at + m[1].length);
          if (listLike(after, ppl)) continue;
          out.push({ target: p.name, form: m[1], at: at, titleOnly: false });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
        // 文末（読点・空白の後に名前＋敬称で文が終わる）
        re = new RegExp('[、，\\s　]' + '(' + nm + SUF + '?)' + POST_END, 'g');
        while ((m = re.exec(t)) !== null){ out.push({ target: p.name, form: m[1], at: m.index + 1, titleOnly: false }); if (m.index === re.lastIndex) re.lastIndex++; }
        if (out.some(function(x){ return x.target === p.name; })) break;   // 長い形で取れたら短い形は見ない
      }
    }
    // 名前を含まない呼び方
    for (i = 0; i < TITLES.length; i++){
      var tt = esc(TITLES[i]), m2, re2;
      re2 = new RegExp(PRE_START + LEAD + '(' + tt + ')' + POST_ANY, 'g');
      while ((m2 = re2.exec(t)) !== null){ pushTitle(m2.index + m2[0].length - m2[1].length, m2[1]); if (m2.index === re2.lastIndex) re2.lastIndex++; }
      re2 = new RegExp('[、，\\s　]' + '(' + tt + ')' + POST_END, 'g');
      while ((m2 = re2.exec(t)) !== null){ pushTitle(m2.index + 1, m2[1]); if (m2.index === re2.lastIndex) re2.lastIndex++; }
    }
    function pushTitle(at, form){
      for (var k = 0; k < out.length; k++){ if (at >= out[k].at && at < out[k].at + out[k].form.length) return; if (out[k].titleOnly && out[k].at === at) return; }   // 名前＋敬称の一部・重複
      out.push({ target: null, form: form, at: at, titleOnly: true });
    }
    out.sort(function(a, b){ return a.at - b.at; });
    var uniq = [], seenAt = {};
    out.forEach(function(x){ var k = x.at + '|' + x.form; if (seenAt[k]) return; seenAt[k] = 1; uniq.push(x); });
    return uniq;
  }
  // 「凪、灯里、宗介の三人で」のような列挙は呼びかけにしない
  function listLike(after, ppl){
    var m = after.match(/^[、，]\s*/); if (!m) return false;
    var rest = after.slice(m[0].length);
    for (var i = 0; i < ppl.length; i++) for (var f = 0; f < ppl[i].forms.length; f++){
      var nm = ppl[i].forms[f];
      if (rest.indexOf(nm) === 0 && /^(?:[、，とやも]|の(?:[一二三四五六七八九十\d]+人|三人|二人))/.test(rest.slice(nm.length).replace(new RegExp('^' + SUF), ''))) return true;
    }
    return false;
  }
  function descPlain(d){ return str(d).replace(/「[^」]*」|『[^』]*』/g, '〃'); }
  // 設定文に書かれた呼び方: A の説明の「B（のこと）を「X」」／B の説明の「A から（は）「X」と呼ばれ」
  function settingForm(a, b){
    var m, forms = [];
    b.forms.forEach(function(bf){ var re = new RegExp(esc(bf) + '(?:のこと)?を「([^」]{1,12})」', 'g'); while ((m = re.exec(a.desc)) !== null) forms.push(m[1]); });
    a.forms.forEach(function(af){ var re = new RegExp(esc(af) + '(?:から|に)は?「([^」]{1,12})」と呼ばれ', 'g'); while ((m = re.exec(b.desc)) !== null) forms.push(m[1]); });
    return forms;
  }
  // その人自身の肩書きとして設定文に書かれているか（「部長の朔に憧れている」のような、同じ句に別の人の名前がある肩書きは数えない）
  function roleSelf(p, key, ppl){
    var d = descPlain(p.desc), i = d.indexOf(key);
    while (i >= 0){
      var before = d.slice(Math.max(0, i - 8), i).split(/[。、．，]/).pop(), after = d.slice(i + key.length, i + key.length + 4), other = false;
      for (var a = 0; a < ppl.length && !other; a++){ if (ppl[a].name === p.name) continue; for (var f = 0; f < ppl[a].forms.length; f++) if (before.indexOf(ppl[a].forms[f]) >= 0 || after.split(/[。、．，]/)[0].indexOf(ppl[a].forms[f]) >= 0){ other = true; break; } }
      if (!other && /^(?:$|[。、．，\s　）)]|で|だ|を務|をし|として|兼)/.test(after)) return true;
      i = d.indexOf(key, i + 1);
    }
    return false;
  }
  // 名前を含まない呼び方の相手（1 人に決まるときだけ）
  function titleTarget(form, speaker, ppl){
    var cand = [], i;
    for (i = 0; i < ppl.length; i++){ if (ppl[i].name === speaker.name) continue; if (settingForm(speaker, ppl[i]).indexOf(form) >= 0) cand.push(ppl[i]); }
    if (cand.length === 1) return cand[0];
    if (cand.length > 1) return null;
    if (!ROLE_TITLE.test(form)) return null;
    var key = form.replace(/(?:さん|様)$/, '');
    for (i = 0; i < ppl.length; i++){ if (ppl[i].name === speaker.name) continue; if (roleSelf(ppl[i], key, ppl)) cand.push(ppl[i]); }
    return cand.length === 1 ? cand[0] : null;
  }

  // ---------------- CALL1: 先例の表 ----------------
  // precedents(state, roster, uptoTurns) → { ppl, map:{ 'A→B': { a, b, form, turn(1 始まり), src } }, recent:{ 'A→B': true }, hits:[{ turn, a, b, form, confirmed, src, titleOnly }] }
  function precedents(state, roster, upto){
    var turns = (state && Array.isArray(state.turns)) ? state.turns : [], n = (upto == null) ? turns.length : Math.min(upto, turns.length);
    var ppl = people(state, roster), hero = null, map = {}, recent = {}, hits = [], i, j;
    for (i = 0; i < ppl.length; i++) if (ppl[i].hero) hero = ppl[i];
    function take(sp, text, ti, src, confirmedSay){
      var vs = vocatives(text, ppl, sp);
      for (var k = 0; k < vs.length; k++){
        var v = vs[k], tg = v.target ? whoOf(ppl, v.target) : titleTarget(v.form, sp, ppl);
        if (!tg || tg.name === sp.name) continue;
        var key = sp.name + '→' + tg.name;
        hits.push({ turn: ti + 1, a: sp.name, b: tg.name, form: v.form, confirmed: !!confirmedSay, src: src || '', titleOnly: !!v.titleOnly });
        if (ti >= n - 2) recent[key] = true;                       // 直近 2 ターンにこの組の呼びかけがある（確定でなくても）
        if (confirmedSay) map[key] = { a: sp.name, b: tg.name, form: v.form, turn: ti + 1, src: src };   // 最後に確定した呼称で上書き
      }
    }
    for (i = 0; i < n; i++){
      var t = turns[i]; if (!t) continue;
      if (hero && String(t.inputType || '').toUpperCase() === 'SAY' && str(t.playerText).trim()) take(hero, t.playerText, i, 'input', true);
      var cs = Array.isArray(t._convSays) ? t._convSays : [];
      for (j = 0; j < cs.length; j++){
        var c = cs[j]; if (!c || typeof c.say !== 'string') continue;
        var sp = whoOf(ppl, c.who); if (!sp) continue;
        var kind = confirmedKind(t, j);
        take(sp, c.say, i, kind, !!kind);
      }
    }
    return { ppl: ppl, map: map, recent: recent, hits: hits, n: n };
  }
  function inFacts(items, e){ if (!Array.isArray(items)) return false; var head = e.turn + 'ターン目'; for (var i = 0; i < items.length; i++){ var s = str(items[i]); if (s.indexOf(head) === 0 && s.indexOf(e.form) >= 0) return true; } return false; }
  var BURST_FROM = 3, BURST_TO = 5, REFRESH = 4, LINE_MAX = 120, HEAD = '呼称の先例：', TAIL = '（以前の確定発話）';
  function dueGap(g){ return (g >= BURST_FROM && g <= BURST_TO) || (g > BURST_TO && (g - BURST_TO) % REFRESH === 0); }
  // line(state, roster, currentInputText[, upto]) → { line, parts:[…], trace:[…] }
  function line(state, roster, inputText, upto, factsItems){
    var P = precedents(state, roster, upto), turns = (state && state.turns) || [], n = P.n, cur = n + 1, trace = [], parts = [];
    if (n < 3) return { line: '', parts: parts, trace: trace };     // 先例が直近 2 ターンの外に出るのは 4 ターン目の送信から
    var near = str(inputText);
    for (var i = Math.max(0, n - 2); i < n; i++){ var t = turns[i] || {}; near += '\n' + str(t.playerText) + '\n' + narrText(t); }
    function here(name){ var p = whoOf(P.ppl, name); if (!p) return false; if (p.hero) return true; for (var f = 0; f < p.forms.length; f++) if (near.indexOf(p.forms[f]) >= 0) return true; return false; }
    var keys = Object.keys(P.map).sort(function(x, y){ return P.map[y].turn - P.map[x].turn; });
    keys.forEach(function(k){
      var e = P.map[k], g = cur - e.turn, why = '';
      if (g < 3 || P.recent[k]) why = 'recent';
      else if (e.src === 'input' && inFacts(factsItems, e)) why = 'in-facts';   // プレイヤーの入力がそのまま earlierFacts に載っている＝同じ呼び方がもう見えている
      else if (!here(e.a) || !here(e.b)) why = 'absent';
      else {
        var sf = settingForm(whoOf(P.ppl, e.a), whoOf(P.ppl, e.b));
        if (sf.length && sf.indexOf(e.form) < 0) why = 'setting-conflict';
        else if (!dueGap(g)) why = 'rest';
      }
      trace.push({ pair: k, form: e.form, turn: e.turn, gap: g, src: e.src, out: why || 'emit' });
      if (!why) parts.push(e.a + '→' + e.b + '「' + e.form + '」');
    });
    var kept = [], len = HEAD.length + TAIL.length;
    for (var q = 0; q < parts.length; q++){ var add = parts[q].length + (kept.length ? 1 : 0); if (len + add > LINE_MAX) break; kept.push(parts[q]); len += add; }
    return { line: kept.length ? (HEAD + kept.join('／') + TAIL) : '', parts: kept, trace: trace };
  }
  var _callLast = null;
  // applyCall(parsed, state, roster, factsRule) → parsed（earlierFacts.items の最後に 1 行。無ければ earlierFacts を storySoFar の直後に作る）
  function applyCall(parsed, state, roster, factsRule){
    _callLast = { on: callOn(), line: '' };
    if (!_callLast.on) return parsed;
    try {
      if (lsGet('v292DfixFACTS1Off') === '1') { _callLast.skip = 'facts1-off'; return parsed; }
      var r = line(state, roster, parsed && parsed.currentInput && parsed.currentInput.text, null, parsed && parsed.earlierFacts && parsed.earlierFacts.items);
      _callLast.trace = r.trace; _callLast.line = r.line;
      if (!r.line) return parsed;
      if (parsed.earlierFacts && Array.isArray(parsed.earlierFacts.items)){ parsed.earlierFacts.items = parsed.earlierFacts.items.concat([r.line]); return parsed; }
      var o = {}, k, placed = false;
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue; o[k] = parsed[k]; if (k === 'storySoFar'){ o.earlierFacts = { rule: str(factsRule), items: [r.line] }; placed = true; } }
      if (!placed) o.earlierFacts = { rule: str(factsRule), items: [r.line] };
      return o;
    } catch(e){ _callLast.err = String(e && e.message || e); return parsed; }
  }

  // ---------------- SPK3 ----------------
  var SPK_N = 2, SPK_QUOTE = 14, SPK_MAX = 10;
  var SPK_RULE = 'recentSpeakers は recentScenes の台詞のうち、話者が確定しているものの参照用メタデータ（載っていない台詞の話者は未確定）。誰の台詞かを取り違えないためだけに使う。本文へ「名前：」の形で転記しない・引用しない。';
  function speakerItems(state, upto){
    var turns = (state && Array.isArray(state.turns)) ? state.turns : [], n = (upto == null) ? turns.length : Math.min(upto, turns.length), per = [], total = 0, i, j;
    for (i = Math.max(0, n - SPK_N); i < n; i++){
      var t = turns[i] || {}, cs = Array.isArray(t._convSays) ? t._convSays : [], blob = squash(narrText(t)), row = [], seen = {};
      for (j = 0; j < cs.length; j++){
        var c = cs[j]; if (!c) continue;
        if (!confirmedKind(t, j)) continue;
        var q = sayText(c.say), sq = squash(q); if (!sq || blob.indexOf(sq) < 0) continue;                 // その回の本文に実際にある台詞だけ
        var quote = q.length > SPK_QUOTE ? (q.slice(0, SPK_QUOTE) + '…') : q, key = nfc(c.who) + '|' + quote;
        if (seen[key]) continue; seen[key] = 1;
        row.push({ turnOffset: i - n, speaker: nfc(c.who), quote: quote });
      }
      per.push(row); total += row.length;
    }
    // 上限を超えるときは古いターンの後ろから落とす（新しいターンを優先）
    for (i = 0; i < per.length && total > SPK_MAX; i++){ while (per[i].length && total > SPK_MAX){ per[i].pop(); total--; } }
    var out = []; per.forEach(function(r){ r.forEach(function(x){ out.push(x); }); });
    return out;
  }
  var _spkLast = null;
  function applySpk(parsed, state){
    _spkLast = { on: spkOn(), items: 0, chars: 0 };
    if (!_spkLast.on) return parsed;
    try {
      var items = speakerItems(state);
      if (!items.length) return parsed;
      var o = {}, k, placed = false, v = { rule: SPK_RULE, items: items };
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'recentSpeakers') continue; o[k] = parsed[k]; if (k === 'recentScenes'){ o.recentSpeakers = v; placed = true; } }
      if (!placed) o.recentSpeakers = v;
      _spkLast.items = items.length; _spkLast.chars = JSON.stringify(v, null, 2).length;
      return o;
    } catch(e){ _spkLast.err = String(e && e.message || e); return parsed; }
  }

  root.__v292DfixCALL1Core = { VER: VER, on: callOn, confirmedKind: confirmedKind, people: people, vocatives: vocatives, titleTarget: titleTarget, settingForm: settingForm,
    precedents: precedents, line: line, apply: applyCall, dueGap: dueGap, LINE_MAX: LINE_MAX, HEAD: HEAD, TAIL: TAIL, last: function(){ return _callLast; } };
  root.__v292DfixSPK3Core = { VER: VER, on: spkOn, confirmedKind: confirmedKind, items: speakerItems, apply: applySpk, RULE: SPK_RULE, QUOTE: SPK_QUOTE, MAX: SPK_MAX, last: function(){ return _spkLast; } };
})(typeof window !== 'undefined' ? window : globalThis);
