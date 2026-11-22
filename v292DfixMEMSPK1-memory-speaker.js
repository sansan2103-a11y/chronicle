/* =====================================================================
 * v292DfixMEMSPK1-memory-speaker.js — 長期記憶の要約 AI へ渡す本文の台詞に、話し手の札を付ける（MEMSPK1・2026-11-23・既定 OFF）
 * ---------------------------------------------------------------------
 * ■なぜ（quality/READ1_MEMORY_POV_NOTE.md §2）: fix135 の NEW TURNS は、<say> の札を外した後の本文（「」だけ）を渡す。
 *   台詞の話し手は要約 AI が地の文から推しはかるので、VXC C1 では T7 の千景と灯里の発言が要約で入れ替わった。
 * ■やること: 要約 AI へ渡す NEW TURNS の各ターンの本文（1500 字に切った後）の「」の前に、確かめられた話し手の名前だけを付ける（例: 千景「…」）。
 *   ★GPT #127-WX: 札を無条件に信用しない。付けるのは次を全部満たすカードだけ（今ある部品の判定を使う・新しい名寄せは作らない）:
 *     ・who が登録人物（主人公を含む）
 *     ・主人公の入力の写し（_convSayMeta.sourceKind 'hero-utterance' で who が主人公）か、
 *       SPKCHK1 の analyze がそのカードを「X 側の根拠あり」（P1 名乗り・P2 直前直後の発話の文や声・P3 直前の主語）で残したもの
 *       （no-strong-evidence・W1-only・not-say-tag など、話し手を確かめられないカードには付けない）
 *     ・主人公の入力の写し以外は、そのターンの地の文（「」の外）にその人の名前の形（SPKCHK1 の formsOf）が出る
 *   未登録・「???」・不明の札は付けない（登録名へ置き換えない）。照らせない台詞もそのまま。
 *   保存データ・画面・本番の本文は変えない（要約の依頼の文字列だけ）。送信の経路は fix135 のまま（VAULTGATE2 などの関門もそのまま）。
 * ■発言と事実の区別（別の鍵 v292DfixMEMSPK1FactOn='1'・既定 OFF・kill は v292DfixMEMSPK1Off と共通）: 要約の依頼の NEW TURNS の直後に 1 句（FACT_LINE）。
 * ■鍵: v292DfixMEMSPK1On='1'（既定 OFF）・kill v292DfixMEMSPK1Off='1'（常に勝つ）。OFF・kill は 1 字も変えない。
 * ■診断: window.__v292DfixMEMSPK1.stats()（付けた数・付けなかった数・増えた字数）
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixMEMSPK1) return;
  var VER = 'memspk1-20261123-r2', ST = { turns: 0, tagged: 0, skipped: 0, notFound: 0, added: 0, why: {} };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function on() { return lsg('v292DfixMEMSPK1Off') !== '1'; }   /* 20261123: 既定 ON（長期記憶が ON の人だけ働く。実 AI 9 本: 害なし・誤った話し手の固定 OFF 1 → 0）。区別の 1 句（FactOn）は既定 OFF のまま。止めるのは kill v292DfixMEMSPK1Off='1' */
  var NO = /^(?:\?+|？+|不明な声|不明|群衆)$/;
  var FACT_LINE = 'Dialogue lines are what the speaker claims, not confirmed facts: write a claim found only in dialogue as 「AはXと言った」, and record as fact only what the narration shows.\n\n';
  function factOn() { return lsg('v292DfixMEMSPK1Off') !== '1' && lsg('v292DfixMEMSPK1FactOn') === '1'; }
  function factLine() { if (!factOn()) return ''; ST.fact = (ST.fact || 0) + 1; return FACT_LINE; }
  function getS() { try { return root.__chronicleGetState ? root.__chronicleGetState('memspk1') : null; } catch (e) { return null; } }
  function castOf(S) { try { var c = S && S.cast; if (!c) return []; return [String((c.hero && c.hero.name) || '')].concat((c.npcs || []).map(function (n) { return String((n && n.name) || ''); })).filter(Boolean); } catch (e) { return []; } }
  function nrm(x) { return String(x == null ? '' : x).replace(/[\s　・]/g, ''); }
  /* そのターンのカードごとに「話し手を付けてよいか」を決める。返り値: [true/false/理由]（カードの添字ごと） */
  function verdicts(turn, cast) {
    var cards = turn._convSays || [], meta = Array.isArray(turn._convSayMeta) && turn._convSayMeta.length === cards.length ? turn._convSayMeta : null;
    var hero = cast[0] || '', narr = String(turn.narrative || ''), plain = narr.replace(/「[^」]*」/g, '。').replace(/『[^』]*』/g, '。');
    var C = root.__v292DfixSPKCHK1, an = null;
    try { if (C && typeof C.analyze === 'function' && meta) an = C.analyze(narr, cards, meta, cast, hero); } catch (e) { an = null; }
    var why = {}; (an || []).forEach(function (r) { why[r.ci] = r.act === 'keep' ? r.why : 'flip'; });
    return cards.map(function (c, i) {
      var who = String((c && c.who) || '').trim();
      if (!who || NO.test(who)) return 'unknown';
      if (cast.map(nrm).indexOf(nrm(who)) < 0) return 'not-registered';
      var m = meta ? meta[i] : null;
      if (m && m.sourceKind === 'hero-utterance' && nrm(who) === nrm(hero)) return true;
      if (!an) return 'no-check';
      if (!/^P[123]/.test(String(why[i] || ''))) return 'not-verified:' + (why[i] || 'none');
      var forms = [nrm(who)]; try { if (typeof C.formsOf === 'function') forms = C.formsOf(who, cast, narr); } catch (e2) {}
      if (!forms.some(function (f) { return f && plain.indexOf(f) >= 0; })) return 'not-in-narration';
      return true;
    });
  }
  /* nr: 要約へ渡す本文（切った後）・turn: 保存済みのターン。返り値: 札を付けた本文 */
  function tag(nr, turn, castIn) {
    var s = String(nr == null ? '' : nr), cards = (turn && Array.isArray(turn._convSays)) ? turn._convSays : [];
    if (!s || !cards.length) return s;
    ST.turns++;
    var cast = Array.isArray(castIn) ? castIn : castOf(getS()), ok = verdicts(turn, cast);
    var ins = [], used = {}, from = 0;
    cards.forEach(function (c, ci) {
      if (!c) return; var who = String(c.who || '').trim(), say = String(c.say || '').trim();
      if (!say) return;
      var q = '「' + say + '」', i = s.indexOf(q, from);
      if (i < 0) { i = s.indexOf(q); while (i >= 0 && used[i]) i = s.indexOf(q, i + 1); }
      if (i < 0) { ST.notFound++; return; }
      used[i] = 1; from = i + q.length;
      if (ok[ci] !== true) { ST.skipped++; var k = String(ok[ci]).split(':')[0]; ST.why[k] = (ST.why[k] || 0) + 1; return; }
      if (s.slice(Math.max(0, i - who.length), i) === who) { ST.skipped++; return; }
      ins.push({ at: i, who: who });
    });
    if (!ins.length) return s;
    ins.sort(function (a, b) { return b.at - a.at; });
    var out = s; ins.forEach(function (x) { out = out.slice(0, x.at) + x.who + out.slice(x.at); ST.tagged++; ST.added += x.who.length; });
    return out;
  }
  root.__v292DfixMEMSPK1 = { VER: VER, on: on, factOn: factOn, factLine: factLine, verdicts: verdicts, tag: tag, stats: function () { return JSON.parse(JSON.stringify({ ver: VER, on: on(), st: ST })); } };
})(typeof window !== 'undefined' ? window : globalThis);
