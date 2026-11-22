/* =====================================================================
 * v292DfixMEMSTATE1-longmem-state.js — 長期記憶の人物の説明・あらすじに、古くなった「未経験」の状態が残り続ける件（MEMSTATE1・2026-11-22・LOCAL・出荷しない・既定 ON）
 * ---------------------------------------------------------------------
 * ■なぜ（realai_out_voiceex1 の腕 A の実測）: 最初の作り直し（T1〜T3）で、要約 AI は灯里の desc に T1・T2 の状態「糊に触れた経験がない」を書き、
 *   同じ応答の exp には「背に薄く糊を引くことに成功した（first・T3）」を書いた。以後の作り直しでは、KNOWN WORLD INFO に出した前の版の desc を
 *   そのまま写し続けた（A3 は 4 回とも同じ文）。指示は desc を「1 sentence: who/what」としか書いておらず、いつの状態かの形が無い。
 * ■やること（長期記憶が渡る人＝MEM2.aOn()・kill v292DfixMEMSTATE1Off='1' が常に勝つ）:
 *   (1) 指示: worldinfo の desc の形に「人物は NEW TURNS の終わりの時点の状態。前の状態が変わったら新しい状態に書き換える（経緯は 以前は〜だったが、Tnで〜した の 1 節）」を足す（形式の説明・禁止文は足さない）。
 *   (2) fix(result): EXP1 の検査を通った経験（first・learned・taught）がある人物について、その技の漢字を含む「未経験」の節（一度も・経験がない・〜したことがない・
 *       初めて・未経験・知らない。learned の技ならさらに できない・苦手）を、その人物の desc と、その人物の名前を含む summary の文から落とす。
 *       「以前は〜だったが」の経緯の文と、成功の語（できた・成功・ようになった・覚えた・教わった）を含む節は落とさない。推測で書き足さない。
 * ■診断: window.__v292DfixMEMSTATE1.stats()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixMEMSTATE1) return;
  var VER = 'memstate1-20261122-r1', ST = { on: 0, offWhy: {}, prompt: 0, promptMiss: 0, descCut: 0, sumCut: 0, kept: 0 };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return undefined; } }
  function why() { var k = lsg('v292DfixMEMSTATE1Off'); if (k === undefined) return 'STORAGE'; if (k === '1') return 'KILLED';
    try { var M = root.__v292DfixMEM2; if (!M || typeof M.aOn !== 'function' || M.aOn() !== true) return 'MEM2A_OFF'; } catch (e) { return 'MEM2A_OFF'; } return ''; }
  function on() { var w = why(); if (w) { ST.offWhy[w] = (ST.offWhy[w] || 0) + 1; return false; } ST.on++; return true; }
  var DESC_OLD = '"desc": "1 sentence Japanese: who/what';
  var DESC_NEW = '"desc": "1 sentence Japanese: who/what; for a character, the state as of the end of NEW TURNS — when NEW TURNS change an earlier state (never having done something, not knowing someone, not having something, where they are, a relationship), write the new state in place of the old one, and if the change matters keep it as one clause such as 以前は〜だったが、Tnで〜した';
  function prompt(p) { if (typeof p !== 'string' || !on()) return p; if (p.split(DESC_OLD).length !== 2) { ST.promptMiss++; return p; } ST.prompt++; return p.split(DESC_OLD).join(DESC_NEW); }
  var NEVER = /一度も|経験がな|経験が無|経験はな|ことがな|ことはな|ことな[いく]|未経験|初めて|はじめて|知らな/, CANNOT = /できな|でき(ませ|ず)|苦手|下手/;
  var OK = /できた|成功|ようになっ|覚え|教わ|習っ|身につ|身に付/, PAST = /以前は|かつては|だったが|ていたが|なかったが/;
  function kanji(s) { var o = {}; (String(s || '').match(/[一-鿿々]/g) || []).forEach(function (k) { o[k] = 1; }); return o; }
  var COMMON = { '人': 1, '物': 1, '事': 1, '手': 1, '日': 1, '一': 1, '度': 1, '初': 1, '経': 1, '験': 1, '知': 1 };
  function topicsOf(w) { var t = { never: {}, cannot: {} }; (Array.isArray(w.exp) ? w.exp : []).forEach(function (x) { if (!x || !x.s) return; if (x.k !== 'first' && x.k !== 'learned' && x.k !== 'taught') return;
      var ks = kanji(x.s); for (var k in ks) if (!COMMON[k]) { t.never[k] = 1; if (x.k === 'learned') t.cannot[k] = 1; } }); return t; }
  function stale(clause, t) { if (!clause || OK.test(clause) || PAST.test(clause)) return false; var ks = kanji(clause), hitN = false, hitC = false;
    for (var k in ks) { if (t.never[k]) hitN = true; if (t.cannot[k]) hitC = true; } return (hitN && NEVER.test(clause)) || (hitC && CANNOT.test(clause)); }
  function cutDesc(desc, t) {
    var sents = String(desc || '').split(/(?<=[。！？])/), out = [], changed = false;
    sents.forEach(function (snt) { if (!snt) return; var cls = snt.replace(/[。！？]$/, '').split('、'), keep = cls.filter(function (c) { return !stale(c, t); });
      if (keep.length === cls.length) { out.push(snt); return; } changed = true; if (!keep.length) return;
      var last = keep[keep.length - 1]; if (/し$/.test(last)) keep[keep.length - 1] = last + 'ている'; else if (/て$/.test(last)) keep[keep.length - 1] = last + 'いる'; else if (/[^ん]で$/.test(last)) keep[keep.length - 1] = last.slice(0, -1) + 'だ'; else { var U = { 'り': 'る', 'き': 'く', 'ぎ': 'ぐ', 'み': 'む', 'び': 'ぶ', 'ち': 'つ' }, ch = last.slice(-1); if (U[ch] && /[一-鿿ぁ-ん]{2}$/.test(last)) keep[keep.length - 1] = last.slice(0, -1) + U[ch]; }   /* 五段の連用形（預かり→預かる） */   /* 続ける形で終わる節を言い切りに */
      out.push(keep.join('、') + '。'); });
    return changed ? out.join('') : null;
  }
  function forms(n) { var a = [String(n)]; String(n).split(/[\s　・]+/).forEach(function (x) { if (x.length >= 2 && a.indexOf(x) < 0) a.push(x); }); return a; }
  function fix(result) {
    if (!result || !Array.isArray(result.worldinfo) || !on()) return result;
    var people = [];
    result.worldinfo.forEach(function (w) { if (!w || w.type !== 'character' || !w.name || typeof w.desc !== 'string') return; var t = topicsOf(w);
      if (!Object.keys(t.never).length) return; people.push({ name: w.name, t: t }); var d = cutDesc(w.desc, t); if (d != null) { if (d) { w.desc = d; ST.descCut++; } else ST.kept++; } });
    if (people.length && typeof result.summary === 'string' && result.summary) {
      var ss = result.summary.split(/(?<=[。！？\n])/), changed = false;
      ss = ss.filter(function (snt) { for (var i = 0; i < people.length; i++) { var p = people[i]; if (!forms(p.name).some(function (f) { return snt.indexOf(f) >= 0; })) continue;
          var others = people.filter(function (q) { return q !== p; }).some(function (q) { return forms(q.name).some(function (f) { return snt.indexOf(f) >= 0; }); });
          var head = snt.replace(/^(確定|経過|未定)：/, ''); if (!others && stale(head, p.t)) { changed = true; ST.sumCut++; return false; } } return true; });
      if (changed) result.summary = ss.join('');
    }
    return result;
  }
  var api = { VER: VER, why: why, on: on, prompt: prompt, fix: fix, stats: function () { return JSON.parse(JSON.stringify(ST)); } };
  try { Object.defineProperty(root, '__v292DfixMEMSTATE1', { value: Object.freeze(api), configurable: false, enumerable: false, writable: false }); } catch (e) { root.__v292DfixMEMSTATE1 = api; }
})(typeof window !== 'undefined' ? window : globalThis);
