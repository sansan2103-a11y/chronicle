// =====================================================================
// Chronicle TRPG - v292DfixECHO1: 前のターンの最後の一拍を、次のターンの書き出しで言い直させない
// ---------------------------------------------------------------------
// laneECHO1（2026-11-14・LOCAL 試作・未出荷）。
// 現象（PLAY1 実プレイ 14 ターン）: T2 末 つばさ「……起きたんだ」→ T3 冒頭「……やっと起きた。動かないで」／T5 末「……なんで」→ T6「……言ったのに」／
//   T7 末「影は追ってこなかった」→ T8「影はもういない」／T12 末 膝のハンカチと血 → T13 ほぼ同じ文／同じ情報の台詞が T11・T13・T14。
//   既存の重複止め（DEDUPQ1・CLICHE2・fix71）は同じ言い回しだけを見るので、言葉を変えた言い直しは通る。
// 原因（rig・偽 AI で送信を実測）:
//   ① user の nowScene が直前の本文の終わり（地の文だけ・台詞は除く）を「いまの場面」として渡す → NPC が既に言った反応が「いま」に無い。
//   ② sys【良い1ターンの形】1.「直前の場面を引き継いで書き出す」／「続きを書く」の回の【続きの転換点】「前ターン末の発言/動作/各キャラの状態を
//      今ターン冒頭で引き継いでから」＝冒頭でもう一度書けという指示。
//   ③ まだ名前が出ていない登録 NPC は user の cast.npcs に入らない（features.js fix95）のに、sys の【キャラ属性】【口調】【話者】には名前が出る
//      → モデルが自分から登場させた回は人物像なしで書かれ、次の回に人物像が届いて第一声をやり直す。
// 直し（鍵 v292DfixECHO1On='1'・既定 OFF＝送信バイト同一・毎回評価。kill v292DfixECHO1Off='1' が常に優先）:
//   (a1) user: nowScene の直後に alreadyDone（直前ターンの最後の台詞 1 行＋最後の出来事 1 文＝済んだこと。次の新しい動き・返事から書き出す）。
//        ★GPT #127-TP の条件: 最後の台詞が問い・頼みで終わる／最後の動きが途中のときは「済んだこと」に入れず、alreadyDone.stillOpen に
//        「まだ閉じていない＝今回その返事・続きを書く」として渡す（未回答の質問・未完了の行動は引き継ぐ）。
//   (a2) sys: 上の ② の 2 文だけを差し替える（【良い1ターンの形】1. と、「続きを書く」の回の【続きの転換点】の先頭の 1 文）。
//   (a3) user: まだ登場していない登録 NPC の人物像を cast.offstage に渡す（その場にはいない印つき・合計 500 字まで）。
//        個別に止める: v292DfixECHO1ProfOff='1'（a3 だけ）／v292DfixECHO1SysOff='1'（a2 だけ）。
//   (b)  出口の影の検出（数えるだけ・本文も会話ログも変えない）: 新しい本文の書き出しが直前ターンの最後の一拍の言い直しかを判定し、
//        メモリ内の件数と plan._echo1（鍵 ON のときだけ・{v,hit,k}）に残す。hit＝書き出しの言い直し（A 同じ話者の同じ反応／B 同じ事実の報告し直し）。
//        C（同じ話者が直近 3 ターンと同じ情報を台詞で言う）は参考の数で、hit には入れない。鍵が無ければ何もしない。
//   比較用の別腕: v292DfixECHO1On='2' … '1' に加えて nowScene の見出し「いまの場面：」を「直前の本文の終わり（ここまでは済んでいる）：」に替える。
// 過去の不具合（fix35/fix71/fix75）への配慮: 過去の文を並べて「続けて」と渡すと語り直しが起きた → 並べるのは台詞 1 行（80 字まで）と
//   地の文 1 文（70 字まで）だけ・「済んだこと／次から書く」を同じ場所に書く。
// 保存・localStorage への書き込み 0（plan._echo1 は次の通常の保存に乗るだけ）。AI の呼び出し 0。fetch / parsePlan / submit を包まない。
// 呼び出し元: v292Dfix58 userExt（userApply）・v292Dfix192（sysLine1）・v292Dfix443（contHint）・index.html の保存直前（exit）。
// 検証口: window.__v292DfixECHO1
// =====================================================================
(function(root){
  'use strict';
  var VER = 'echo1-20261114-r2';
  var LINE_MAX = 80, EVENT_MAX = 70, PROF_CAP = 500, PROF_DESC = 160;
  var RULE = 'alreadyDone は、直前の本文の最後にすでに書かれて済んだ台詞と出来事（読者は読み終えている）。今回の本文は、その次の瞬間に起きる新しい動き・新しい返事から書き出す。同じ人物に同じ出来事への反応をもう一度言わせない（言葉を変えても同じこと）。同じ事実・同じ様子を書き出しで報告し直さない。';
  /* ★GPT #127-TP の条件: まだ閉じていない一拍（NPC の問い・頼み、途中で止まった動き）は「済んだこと」にしない。その返事・続きは今回書く。 */
  var RULE_OPEN = 'stillOpen は、まだ閉じていないこと（答えの出ていない問い・頼み、途中で止まった動き）。済んだことではない。同じ問いを言い直させず、今回の本文でその返事・結果・続きを書く（この回の入力が答えになっているなら、それを答えとして受ける）。';
  var PROF_RULE = '登録済みだが、まだ本文に登場していない人物。いまこの場にはいない。無理に登場させない。本文に初めて出すときは、最初の一言・最初の態度から、この人物像と主人公との関係のとおりに書く（知らない相手として書かない）。';
  var NOW_HEAD_OLD = 'いまの場面：', NOW_HEAD_NEW = '直前の本文の終わり（ここまでは済んでいる）：';
  var SYS1_OLD = '1. 直前の場面（場所・各キャラの状態・感情・位置）を引き継いで書き出す。前の文をそのまま繰り返さない。';
  var SYS1_NEW = '1. 直前の場面（場所・各キャラの状態・感情・位置）を引き継ぐ。書き出しは、直前の本文の最後の台詞・出来事の次の瞬間から（答えの出ていない問い・途中の動きには、その返事・続きを書く）。済んだ反応や描写を繰り返さない・言い換えない。';
  var HINT_OLD = '前ターン末の発言/動作/各キャラの状態（負傷・拘束等）を今ターン冒頭で引き継いでから、状況を次へ動かす。';
  var HINT_NEW = '前ターン末の発言/動作/各キャラの状態（負傷・拘束等）は前提として引き継ぐ。済んだ反応や描写は冒頭で書き直さず、答えの出ていない問い・途中の動きがあればその返事・続きから、状況を次へ動かす。';

  function ls(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function mode(){ if (ls('v292DfixECHO1Off') === '1') return ''; var v = ls('v292DfixECHO1On'); return (v === '1' || v === '2') ? v : ''; }
  function profOn(){ return !!mode() && ls('v292DfixECHO1ProfOff') !== '1'; }
  function sysOn(){ return !!mode() && ls('v292DfixECHO1SysOff') !== '1'; }
  function str(v){ return v == null ? '' : String(v); }
  function isCont(t){ t = str(t); return /続きを(?:自然に)?進めて/.test(t) || /^続きを書/.test(t); }

  // ---- 本文を「台詞」と「地の文の文」に分ける（順番を保つ） ----
  // narr: 文字列 か 行の配列。<say who="X">…</say> と 「…」 を台詞にする。<react>/<state>/<summary>/<scene_move> の行は捨てる。
  function norm(s){ return str(s).replace(/[\s　。、．，,.・…‥—―–‐－\-〜～！？!?「」『』（）()【】“”"'’‘<>]/g, ''); }
  function units(narr){
    var ls0 = Array.isArray(narr) ? narr : str(narr).split('\n'), out = [];
    for (var a = 0; a < ls0.length; a++){
      var l = str(ls0[a]);
      if (/^\s*<(react|state|summary|scene_move)\b/.test(l)) continue;
      l = l.replace(/<say\b[^>]*\bwho=["']([^"']*)["'][^>]*>([\s\S]*?)<\/say>/g, function(_, w, b){ return '\u0001' + w + '\u0002' + b + '\u0003'; }).replace(/<[^>]*>/g, ' ');
      var buf = '', i = 0;
      var flush = function(){ var x = buf.replace(/\s+/g, ' ').trim(); if (x && x.length >= 2 && /[ぁ-んァ-ヶ一-龠]/.test(x)) out.push({ t: 'n', s: x }); buf = ''; };
      while (i < l.length){
        var c = l.charAt(i);
        if (c === '\u0001'){ flush(); var e2 = l.indexOf('\u0002', i), e3 = l.indexOf('\u0003', i); if (e2 < 0 || e3 < 0){ i++; continue; } out.push({ t: 's', who: l.slice(i + 1, e2), s: l.slice(e2 + 1, e3).replace(/^「|」$/g, '') }); i = e3 + 1; continue; }
        if (c === '「'){ var d = 1, j = i + 1; while (j < l.length && d > 0){ var cj = l.charAt(j); if (cj === '「') d++; else if (cj === '」') d--; j++; }
          var body = l.slice(i + 1, d === 0 ? j - 1 : j);
          /* 文の途中の短い引用（「入るな」と書かれた 等）は台詞にしない: 直後が と/って/という で地の文が続くときは地の文に残す */
          var after = l.slice(j, j + 3);
          if (buf.replace(/\s+/g, '') && /^(?:と|って|という)/.test(after) && body.length <= 12){ buf += '「' + body + '」'; i = j; continue; }
          flush(); out.push({ t: 's', who: '', s: body }); i = j; continue; }
        if (c === '。' || c === '！' || c === '？'){ buf += c; flush(); i++; continue; }
        buf += c; i++;
      }
      flush();
    }
    return out;
  }
  // 台詞の話者を会話ログ（[{who,say}]）から補う
  function fillWho(us, says){
    if (!Array.isArray(says) || !says.length) return us;
    var pool = says.map(function(c){ return { who: str(c && c.who), k: norm(c && c.say), used: false }; });
    us.forEach(function(u){ if (u.t !== 's' || u.who) return; var k = norm(u.s); if (!k) return;
      for (var i = 0; i < pool.length; i++){ var p = pool[i]; if (p.used || !p.k) continue; if (p.k === k || (k.length >= 6 && (p.k.indexOf(k) >= 0 || k.indexOf(p.k) >= 0))){ u.who = p.who; p.used = true; return; } } });
    return us;
  }
  function heroName(state){ try { return str(state && state.cast && state.cast.hero && state.cast.hero.name); } catch(e){ return ''; } }
  function isHeroSay(u, hero, playerText, inputType){
    if (u.t !== 's') return false;
    if (hero && u.who === hero) return true;
    if (str(inputType).toUpperCase() === 'SAY' && playerText){ var a = norm(u.s), b = norm(playerText); if (a && b && (a === b || (a.length >= 6 && b.indexOf(a) >= 0) || (b.length >= 6 && a.indexOf(b) >= 0))) return true; }
    return false;
  }

  // ---- 最後の一拍（直前ターンの最後の NPC の台詞 1 行＋最後の地の文 1 文） ----
  function clipTail(s, max){ s = str(s).replace(/\s+/g, ' ').trim(); return s.length > max ? ('…' + s.slice(s.length - (max - 1))) : s; }
  function clipHead(s, max){ s = str(s).replace(/\s+/g, ' ').trim(); return s.length > max ? (s.slice(0, max - 1) + '…') : s; }
  function lastBeat(turn, hero){
    if (!turn) return null;
    var us = fillWho(units(turn.narrative), turn._convSays);
    var line = null, ev = '', i;
    for (i = us.length - 1; i >= 0; i--){ if (us[i].t === 's' && !isHeroSay(us[i], hero, turn.playerText, turn.inputType) && norm(us[i].s)){ line = us[i]; break; } }
    for (i = us.length - 1; i >= 0; i--){ if (us[i].t === 'n' && us[i].s.length >= 4){ ev = us[i].s; break; } }
    if (!line && !ev) return null;
    return { who: line ? line.who : '', say: line ? line.s : '', event: ev, sayOpen: line ? openLine(line.s) : '', eventOpen: ev ? openEvent(ev) : false };
  }
  // まだ閉じていない一拍か（決定的に読める形だけ。迷うものは「済んだこと」にも「開いている」にも強く寄せない＝済んだ側）
  //   台詞: 最後の文が問い（？ / 〜か・〜かな・〜でしょ・〜だろ・〜よね で終わる）＝'q'、頼み・指示（〜て・〜で・〜ないで・〜なさい・〜ください・〜くれ・〜よう・〜ろ で終わる）＝'r'
  //   地の文: 文末が途中の動き（〜かけた・〜（よ）うとした・〜始めた・〜ところだった・〜つつある）か、句点なしで切れている
  function lastSentence(s){ var p = str(s).replace(/[\s\u3000]+$/, '').split(/[。！!]+/).filter(function(x){ return x.replace(/[…‥\s]/g, ''); }); return p.length ? p[p.length - 1] : ''; }
  function openLine(say){
    var t = lastSentence(say).replace(/[…‥—―\s\u3000]+$/g, '');
    if (!t) return '';
    if (/[？?]$/.test(t)) return 'q';
    if (/^[\s\u3000]*[…‥]/.test(t)) return '';   /* 「……まだ、あるのか」「……誰か、いるの」「……なんで」: ？の無い「……」始まりは、相手への問いでなく漏れた反応として扱う（済んだ側） */
    if (/(?:ですか|ますか|のか|かな|かしら|でしょ|でしょう|だろ|だろう|よね|だよな|のかい|かい)$/.test(t)) return 'q';
    var bare = t.replace(/[、，\s…‥—―・]/g, '');
    var QW = /(?:誰|だれ|何|なに|なん[でのだ]|どこ|どう|どれ|どっち|どちら|なぜ|いつ)/;
    if (bare.length >= 4 && QW.test(t) && /(?:の|んだ|のだ|んです|だ|か)$/.test(t)) return 'q';
    var t2 = t.replace(/(?:何|なに|誰|だれ|どこ|いつ|どう|なん)(?:か(?!ら)|も|でも|せ|にか|とか)/g, '');   /* 「何か」「誰も」「どうせ」等は問いの語にしない */
    if (bare.length >= 4 && QW.test(t2) && !/(?:のに|けど|けれど|から|ない|なかった|ても|って)$/.test(t)) return 'q';   /* 疑問詞のある問い（「……誰か、いるの」「どうするんだ」）。「……なんで」だけの短い反応は入れない */
    if (bare.length >= 3 && /(?:ないで|なさい|ください|下さい|くれ|てて|て|で|よう|こう|ろう|しろ|せよ)$/.test(t) && !/(?:だって|ですって|なんで|なんて|まで|ので|だけ|くて|みたいで|ようで|そうで|とかで|せいで|おかげで)$/.test(t)) return 'r';
    return '';
  }
  function openEvent(ev){
    var t = str(ev).trim();
    if (/(?:かけた|かけている|うとした|うとしている|うとする|始めた|始めている|はじめた|はじめている|ところだった|つつある)[。]?$/.test(t)) return true;
    if (!/[。！？!?」』）)]$/.test(t)) return true;
    return false;
  }

  // ---- (a1) user: alreadyDone を nowScene の直後（無ければ recentScenes の直後）に置く ----
  var _last = null;
  function userApply(parsed, state, roster){
    var md = mode(); _last = { mode: md, done: 0, prof: 0, chars: 0 };
    if (!md || !parsed) return parsed;
    try {
      var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
      var hero = heroName(state), out = parsed;
      if (turns.length){
        var b = lastBeat(turns[turns.length - 1], hero);
        if (b){
          var blk = { rule: RULE }, open = [];
          var lineTxt = b.say ? ((b.who ? b.who : '（声）') + '「' + clipTail(b.say, LINE_MAX) + '」') : '';
          if (lineTxt){ if (b.sayOpen) open.push(lineTxt + (b.sayOpen === 'q' ? '（まだ答えが出ていない問い）' : '（まだ応えていない頼み・指示）')); else blk.lastLine = lineTxt; }
          if (b.event){ if (b.eventOpen) open.push(clipHead(b.event, EVENT_MAX) + '（途中の動き）'); else blk.lastEvent = clipHead(b.event, EVENT_MAX); }
          if (open.length) blk.stillOpen = { rule: RULE_OPEN, items: open };
          if (!blk.lastLine && !blk.lastEvent) delete blk.rule;   /* 済んだものが無い回は「済んだこと」の規則を付けない（開いているものだけ渡す） */
          var o = {}, k, placed = false, anchor = Object.prototype.hasOwnProperty.call(parsed, 'nowScene') ? 'nowScene' : 'recentScenes';
          for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'alreadyDone') continue; o[k] = parsed[k];
            if (k === 'nowScene' && md === '2' && o[k] && typeof o[k].text === 'string' && o[k].text.indexOf(NOW_HEAD_OLD) === 0) o[k] = { rule: o[k].rule, text: NOW_HEAD_NEW + o[k].text.slice(NOW_HEAD_OLD.length) };
            if (k === anchor){ o.alreadyDone = blk; placed = true; } }
          if (!placed) o.alreadyDone = blk;
          out = o; _last.done = (blk.lastLine || blk.lastEvent) ? 1 : 0; _last.open = open.length; _last.line = blk.lastLine || ''; _last.event = blk.lastEvent || ''; _last.openItems = open;
        }
      }
      out = profApply(out, state, roster);
      return out;
    } catch(e){ _last.err = str(e && e.message || e); return parsed; }
  }

  // ---- (a3) user: まだ登場していない登録 NPC の人物像（cast.offstage） ----
  function profApply(parsed, state, roster){
    if (!profOn()) return parsed;
    try {
      if (!parsed || !parsed.cast || !Array.isArray(parsed.cast.npcs)) return parsed;
      var full = Array.isArray(roster) ? roster : null;
      if (!full || !full.length) return parsed;   /* 全員が登場済みなら fix95 は名簿を置かない＝何もしない */
      var have = {}; parsed.cast.npcs.forEach(function(e){ if (e && e.name) have[str(e.name)] = 1; });
      var want = full.filter(function(n){ return n && n.name && !have[str(n.name)] && n.appeared !== true; });
      if (!want.length) return parsed;
      var cap = PROF_DESC, list = null, total = 0;
      for (;;){
        list = want.map(function(n){ var o = { name: str(n.name) }; var d = clipHead(n.desc, cap); if (d && cap > 0) o.desc = d; if (n.gender) o.gender = str(n.gender); return o; });
        total = JSON.stringify(list).length;
        if (total <= PROF_CAP || cap <= 0) break;
        cap = cap > 40 ? cap - 20 : cap - 10;
      }
      if (total > PROF_CAP) return parsed;   /* 名前だけでも上限を超える（人数が極端に多い）→ 何もしない */
      var cast = {}, k; for (k in parsed.cast){ if (Object.prototype.hasOwnProperty.call(parsed.cast, k) && k !== 'offstage') cast[k] = parsed.cast[k]; }
      cast.offstage = { rule: PROF_RULE, npcs: list };
      var o2 = {}; for (k in parsed){ if (Object.prototype.hasOwnProperty.call(parsed, k)) o2[k] = (k === 'cast') ? cast : parsed[k]; }
      if (_last){ _last.prof = list.length; _last.profChars = total; }
      return o2;
    } catch(e){ if (_last) _last.profErr = str(e && e.message || e); return parsed; }
  }

  // ---- (a2) sys: 2 文だけの差し替え（鍵が無ければ引数をそのまま返す） ----
  function sysLine1(line){ return (sysOn() && line === SYS1_OLD) ? SYS1_NEW : line; }
  function contHint(text){ text = str(text); return (sysOn() && text.indexOf(HINT_OLD) >= 0) ? text.split(HINT_OLD).join(HINT_NEW) : text; }

  // ---- (b) 影の検出 ----
  var STOP = { '中':1,'方':1,'前':1,'後':1,'上':1,'下':1,'時':1,'事':1,'物':1,'者':1,'何':1,'誰':1,'今':1,'間':1,'一':1,'二':1,'三':1,'十':1,'人':1,'彼':1,'女':1,'彼女':1,'私':1,'自分':1,'主人公':1 };
  function toks(s, names){
    s = str(s); if (names) names.forEach(function(n){ if (n) s = s.split(n).join(' '); });
    var m = s.match(/[一-鿿㐀-䶿々]+|[ァ-ヺー]{2,}/g) || [], set = {}, n = 0;
    m.forEach(function(x){ if (STOP[x]) return; if (!set[x]){ set[x] = 1; n++; } });
    return { set: set, n: n };
  }
  function shared(a, b){ var c = 0, k; for (k in a.set) if (b.set[k]) c++; return c; }
  /* 述語の語: 漢字の直後が送りがな（助詞 の が を に は へ で と も や か 以外のひらがな）＝動詞・形容詞の語幹とみなす */
  function preds(s, names){
    s = str(s); if (names) names.forEach(function(n){ if (n) s = s.split(n).join(' '); });
    var re = /([\u4E00-\u9FFF\u3400-\u4DBF])([\u3041-\u3096])/g, m, set = {};
    while ((m = re.exec(s))){ if ('のがをにはへでともやか'.indexOf(m[2]) < 0 && !STOP[m[1]]) set[m[1]] = 1; }
    return set;
  }
  function sharedPred(a, b, names){ var pa = preds(a, names), pb = preds(b, names), c = 0, k; for (k in pa) if (pb[k]) c++; return c; }
  function lcs(a, b){   /* 最長の共通の連続した文字数（記号・空白を除いた文字で） */
    a = norm(a); b = norm(b); if (!a || !b) return 0;
    var prev = new Array(b.length + 1), cur = new Array(b.length + 1), best = 0, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = 0;
    for (i = 1; i <= a.length; i++){ cur[0] = 0; for (j = 1; j <= b.length; j++){ cur[j] = (a.charAt(i - 1) === b.charAt(j - 1)) ? prev[j - 1] + 1 : 0; if (cur[j] > best) best = cur[j]; } var t = prev; prev = cur; cur = t; }
    return best;
  }
  function nameParts(names){ var out = []; (names || []).forEach(function(n){ n = str(n); if (!n) return; out.push(n); n.split(/[\s　]+/).forEach(function(p){ if (p && p.length >= 2 && p !== n) out.push(p); }); }); return out.sort(function(x, y){ return y.length - x.length; }); }
  var OPEN_SENT = 5, OPEN_CHARS = 260, TAIL_SENT = 2, BACK_TURNS = 3;
  // detect(prev, cur, o) — prev/cur: { narrative, says:[{who,say}], inputType, playerText }。o: { hero, names:[], earlier:[古い順の turn 形] }
  //   A 言い直し: 書き出しの最初の NPC の台詞が、直前ターンの最後の NPC の台詞と同じ話者で、前の台詞の内容の語の半分以上を含む（または 6 字以上の同じ並び）
  //   B 事実の報告し直し: 書き出しの地の文 1 文が、直前ターンの最後の地の文 2 文のどちらかと 内容の語を 3 つ以上（少ない方の半分以上）共有し、うち述語（動詞・形容詞の語幹）が 1 つ以上同じ
  //   C 同じ情報の台詞: この回の NPC の台詞が、同じ話者の直近 3 ターンの台詞と 6 字以上の同じ並び＋内容の語 3 つ以上（または語 4 つ以上・6 割以上）を共有する
  function detect(prev, cur, o){
    o = o || {}; var res = { hit: false, info: false, k: [], ev: [] };
    if (!prev || !cur) return res;
    var hero = str(o.hero), names = nameParts((o.names || []).concat(hero ? [hero] : []));
    var pu = fillWho(units(prev.narrative), prev.says), cu = fillWho(units(cur.narrative), cur.says), i, j;
    var pLine = null; for (i = pu.length - 1; i >= 0; i--){ if (pu[i].t === 's' && !isHeroSay(pu[i], hero, prev.playerText, prev.inputType) && norm(pu[i].s)){ pLine = pu[i]; break; } }
    var pTail = []; for (i = pu.length - 1; i >= 0 && pTail.length < TAIL_SENT; i--){ if (pu[i].t === 'n' && pu[i].s.length >= 4) pTail.unshift(pu[i].s); }
    var open = [], ns = 0, ch = 0;
    for (i = 0; i < cu.length; i++){ var u = cu[i]; if (isHeroSay(u, hero, cur.playerText, cur.inputType)) continue; if (u.t === 'n'){ if (ns >= OPEN_SENT || ch > OPEN_CHARS) break; ns++; } ch += u.s.length; open.push(u); }
    // A
    var first = null; for (i = 0; i < open.length; i++){ if (open[i].t === 's'){ first = open[i]; break; } }
    if (first && pLine && first.who && pLine.who && first.who === pLine.who){
      var ta = toks(first.s, names), tb = toks(pLine.s, names), sh = shared(ta, tb), mn = Math.min(ta.n, tb.n), l = lcs(first.s, pLine.s);
      if ((sh >= 1 && tb.n >= 1 && sh / tb.n >= 0.5 && l >= 2) || l >= 6){ res.k.push('A'); res.ev.push({ k: 'A', who: first.who, a: clipHead(first.s, 40), b: clipHead(pLine.s, 40), sh: sh, lcs: l }); }
    }
    // B
    var bHit = false;
    for (i = 0; i < open.length && !bHit; i++){ if (open[i].t !== 'n') continue; var t1 = toks(open[i].s, names);
      for (j = 0; j < pTail.length; j++){ var t2 = toks(pTail[j], names), s2 = shared(t1, t2), m2 = Math.min(t1.n, t2.n);
        if (s2 >= 3 && m2 > 0 && s2 / m2 >= 0.5 && sharedPred(open[i].s, pTail[j], names) >= 1){ res.k.push('B'); res.ev.push({ k: 'B', a: clipHead(open[i].s, 40), b: clipHead(pTail[j], 40), sh: s2, of: m2 }); bHit = true; break; } } }
    // C
    var olds = [];
    var back = (o.earlier || []).slice(-(BACK_TURNS - 1)).concat([prev]);
    back.forEach(function(t){ if (!t) return; fillWho(units(t.narrative), t.says).forEach(function(u){ if (u.t === 's' && u.who && !isHeroSay(u, hero, t.playerText, t.inputType)) olds.push(u); }); });
    var cHit = false;
    for (i = 0; i < cu.length && !cHit; i++){ var c = cu[i]; if (c.t !== 's' || !c.who || isHeroSay(c, hero, cur.playerText, cur.inputType)) continue; var tc = toks(c.s, names); if (tc.n < 2) continue;
      for (j = 0; j < olds.length; j++){ if (olds[j].who !== c.who) continue; var to = toks(olds[j].s, names), s3 = shared(tc, to), m3 = Math.min(tc.n, to.n), l3 = lcs(c.s, olds[j].s);
        if ((l3 >= 6 && s3 >= 3) || (s3 >= 4 && m3 > 0 && s3 / m3 >= 0.6)){ res.k.push('C'); res.ev.push({ k: 'C', who: c.who, a: clipHead(c.s, 40), b: clipHead(olds[j].s, 40), sh: s3, lcs: l3 }); cHit = true; break; } } }
    res.info = cHit;                                             /* C は「同じ情報の台詞」＝参考の数（質問への答え直しも拾うので、書き出しの判定には入れない） */
    res.hit = res.k.indexOf('A') >= 0 || res.k.indexOf('B') >= 0;   /* 書き出しの言い直し＝ A か B */
    return res;
  }
  function turnShape(t){ return t ? { narrative: t.narrative, says: t._convSays || t.says || [], inputType: t.inputType, playerText: t.playerText } : null; }

  // ---- 出口（index.html の保存直前から呼ぶ。本文は変えない。鍵が無ければ何もしない） ----
  var stats = { seen: 0, hit: 0, info: 0, A: 0, B: 0, C: 0, err: 0 }, _lastExit = null;
  function exit(narr, convSays, state, plan, playerText, inputType){
    if (!mode()) return null;
    try {
      var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
      if (!turns.length) return null;
      var names = []; try { (state.cast.npcs || []).forEach(function(n){ if (n && n.name) names.push(str(n.name)); }); } catch(e1){}
      var r = detect(turnShape(turns[turns.length - 1]), { narrative: narr, says: convSays || [], inputType: inputType, playerText: playerText },
        { hero: heroName(state), names: names, earlier: turns.slice(-BACK_TURNS, -1).map(turnShape) });
      stats.seen++; if (r.hit) stats.hit++; if (r.info) stats.info++; r.k.forEach(function(k){ stats[k]++; });
      _lastExit = { turn: turns.length + 1, hit: r.hit, info: r.info, k: r.k.slice(), ev: r.ev };
      try { if (plan && typeof plan === 'object') plan._echo1 = { v: VER, hit: r.hit ? 1 : 0, k: r.k.join('') }; } catch(e2){}
      if (r.hit){ try { console.log('[ECHO1]', 'shadow: opening restates the previous beat', r.k.join('')); } catch(e3){} }
      return r;
    } catch(e){ stats.err++; return null; }
  }

  root.__v292DfixECHO1 = { VER: VER, mode: mode, profOn: profOn, sysOn: sysOn, units: units, lastBeat: lastBeat, userApply: userApply, profApply: profApply,
    sysLine1: sysLine1, contHint: contHint, detect: detect, exit: exit, toks: toks, lcs: lcs, openLine: openLine, openEvent: openEvent,
    RULE: RULE, RULE_OPEN: RULE_OPEN, PROF_RULE: PROF_RULE, SYS1_OLD: SYS1_OLD, SYS1_NEW: SYS1_NEW, HINT_OLD: HINT_OLD, HINT_NEW: HINT_NEW,
    last: function(){ return _last; }, lastExit: function(){ return _lastExit; }, status: function(){ return { ver: VER, mode: mode(), prof: profOn(), sys: sysOn(), stats: JSON.parse(JSON.stringify(stats)) }; } };
})(typeof window !== 'undefined' ? window : globalThis);
