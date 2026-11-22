/* =====================================================================
 * v292DfixREAD1abc-readability.js — 読みやすさの 3 つの小さな直し（READ1a・READ1b・READ1c・2026-11-23・どれも既定 OFF・鍵は別々）
 * ---------------------------------------------------------------------
 * ■なぜ（quality/urakyo_test_story/READABILITY_NOTE.md の案 ①②③）
 *   合成の 8 ターンで T5〜T8 が「どこ・誰はわかるが、何の最中で何が変わったか」が読めなかった。
 *   状態の欄の目的・未解決が毎ターン同じまま渡り、NPC が同じ問いを 3 回くり返した。【良い1ターンの形】1 は書き出しの形を言っていない。
 *   画面にも送信にも「いまの場面」をまとめた 1 行が無い。
 * ■READ1a（鍵 v292DfixREAD1aOn='1'・kill v292DfixREAD1aOff='1'）: 【各キャラの現在の状態】の主人公以外の 目的・未解決
 *   ・同じ値が 3 ターン以上続いていたら見出しに「（N ターン目から同じ）」を添える（このタブで最初に見たターン。保存しない。読み込み直すと数え直す）。
 *   ・その人物が直近 2 ターンの自分の台詞で、その値の語（人の名前・物の名前）を含む問いをもう出していたら、その回はその項目を渡さない。
 *     同じ理由で【この場面の種】の「◯◯の未解決「…」」の候補にも入れない。保存値（fix77 の記録）は触らない。
 * ■READ1b（鍵 v292DfixREAD1bOn='1'・kill v292DfixREAD1bOff='1'）: 送信の直前に sys の 3 か所の文言を置き換える（禁止文は足さない）
 *   ・【良い1ターンの形】1 を書き出しの形で書く（1 文目で、どこ・誰と何の最中か・何が変わったか）。
 *   ・【この一手で前面に出す人物】の「場面転換・時間経過…はしない」と、進行エンジンの「時間を飛ばさない・場面を変えない」を、
 *     入力が移動・時間の経過を書いた回は妨げない書き方にする。見つからない文言は何もしない（数えるだけ）。
 * ■READ1c（鍵 v292DfixREAD1cOn='1'・kill v292DfixREAD1cOff='1'）: 「いまの場面」を 1 行
 *   ・材料: PLACE1 の build（主人公の現在地・この場にいない人。PLACE1 が OFF なら開始の場所だけ）・直近のターンに出た登録の人物・
 *     長期記憶のあらすじ（storySoFar）の「経過」の最後の 1 文。新しい台帳は作らない（毎回作り直す・保存しない）。
 *   ・AI への送信: user の nowScene の直前に sceneNow { rule, text }。
 *   ・画面: 本文の枠（#story）の上に同じ 1 行（送信の前は、あらすじの部分を長期記憶の保存値から作る）。費用や内部の語は出さない。
 * ■OFF・kill は 1 字も変えない（各鍵を毎回読む）。診断: window.__v292DfixREAD1abc.stats()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (!root || root.__v292DfixREAD1abc) return;
  var VER = 'read1abc-20261123-r1';
  var ST = { a: { built: 0, aged: 0, dropped: 0, seedDropped: 0 }, b: { sends: 0, hit: {}, miss: {} }, c: { sends: 0, lines: 0, shown: 0 } };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function onK(x) { return lsg('v292DfixREAD1' + x + 'Off') !== '1' && lsg('v292DfixREAD1' + x + 'On') === '1'; }
  function aOn() { return onK('a'); } function bOn() { return onK('b'); } function cOn() { return onK('c'); }
  function str(v) { return String(v == null ? '' : v); }
  function nrm(s) { return str(s).replace(/[\s　・]/g, ''); }
  function esc(s) { return str(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function getS() { try { return root.__chronicleGetState ? root.__chronicleGetState('read1abc') : null; } catch (e) { return null; } }
  function castNames(S) { try { var c = S && S.cast; if (!c) return []; return [str(c.hero && c.hero.name)].concat((c.npcs || []).map(function (n) { return str(n && n.name); })).filter(Boolean); } catch (e) { return []; } }

  /* =================== READ1a =================== */
  var FIRST = { sk: null, m: {} };   /* このタブだけの控え（保存しない） */
  var STOP = /^(?:情報|内容|不明|理由|本当|気持|気持ち|様子|状態|関係|自分|相手|場所|意味|事情|真相|正体|今後|何|誰|確認|説明|会話|相談|話題|主人公|理解|安心|信頼|距離|反応|答え|返事)$/;
  function tokensOf(v, S, self) {
    var cast = castNames(S), out = [];
    (str(v).match(/[一-龥々ァ-ヶー]{2,}/g) || []).forEach(function (t) {
      if (STOP.test(t)) return;
      var hitCast = false;
      cast.forEach(function (c) { var cn = nrm(c); if (!cn) return; if (t.indexOf(cn) >= 0 || (cn.length >= 2 && cn.indexOf(t) >= 0)) { hitCast = true;
        if (nrm(c) === nrm(self)) return;   /* 本人の名前は手がかりにしない */
        str(c).split(/[\s　・]+/).forEach(function (p) { if (p.length >= 2 && out.indexOf(p) < 0) out.push(p); }); if (out.indexOf(cn) < 0) out.push(cn); } });
      if (!hitCast && out.indexOf(t) < 0) out.push(t);
    });
    var hero = cast[0] || '', hp = [nrm(hero)].concat(str(hero).split(/[\s\u3000・]+/)).filter(Boolean);   /* 主人公の名前も手がかりにしない（目的の多くは「主人公から…」） */
    return out.filter(function (t) { return hp.indexOf(t) < 0; });
  }
  var Q_END = /(?:[？?]|ですか|ますか|ましたか|でしょうか|のか|かしら|だろうか|んですか|ないか)[」。…\s]*$/;
  function askedRecently(n, v, S) {
    try {
      var T = (S && S.turns) || [], toks = tokensOf(v, S, n); if (!toks.length || !T.length) return false;
      for (var i = Math.max(0, T.length - 2); i < T.length; i++) {
        var cs = (T[i] && T[i]._convSays) || [];
        for (var j = 0; j < cs.length; j++) { var c = cs[j]; if (!c || nrm(c.who) !== nrm(n)) continue;
          var say = str(c.say); if (!(Q_END.test(say) || /[？?]/.test(say))) continue;
          for (var k = 0; k < toks.length; k++) if (say.indexOf(toks[k]) >= 0) return true; }
      }
    } catch (e) {}
    return false;
  }
  function sinceOf(n, f, v, S) {
    var sk = null; try { sk = root.__chronicleDocumentStoryKey || null; } catch (e) {}
    if (sk !== FIRST.sk) { FIRST.sk = sk; FIRST.m = {}; }
    var cur = (S && S.turns) ? S.turns.length : 0, key = n + '\u0001' + f, r = FIRST.m[key];
    if (!r || r.v !== v) r = FIRST.m[key] = { v: v, t: cur };
    return r;
  }
  /* fix192 の状態の欄から呼ぶ: { mo, mi, moLb, miLb }（OFF なら呼ばれない） */
  function aItems(n, mo, mi, S) {
    var out = { mo: mo, mi: mi, moLb: '目的:', miLb: '未解決:' };
    try {
      S = S || getS(); var cur = (S && S.turns) ? S.turns.length : 0; ST.a.built++;
      var hero = castNames(S)[0] || ''; if (hero && nrm(hero) === nrm(n)) return out;   /* 主人公の行は触らない */
      [['mo', '目的'], ['mi', '未解決']].forEach(function (p) {
        var v = out[p[0]]; if (!v) return;
        if (askedRecently(n, v, S)) { out[p[0]] = ''; ST.a.dropped++; return; }
        var r = sinceOf(n, p[0], v, S);
        if (cur - r.t >= 2 && r.t >= 1) { out[p[0] + 'Lb'] = p[1] + '（' + r.t + ' ターン目から同じ）:'; ST.a.aged++; }
      });
    } catch (e) {}
    return out;
  }
  /* fix192 の【この場面の種】から呼ぶ: 未解決をその回の候補にしないなら true */
  function aSeedDrop(n, mi, S) { try { if (mi && askedRecently(n, mi, S || getS())) { ST.a.seedDropped++; return true; } } catch (e) {} return false; }

  /* =================== READ1b =================== */
  var B_PAIRS = [
    ['good1', '1. 直前の場面（場所・各キャラの状態・感情・位置）を引き継いで書き出す。前の文をそのまま繰り返さない。',
              '1. 1 文目で、いまどこで、誰と、何をしている最中か、直前から何が変わったかが分かるように書き出す（直前の場面の場所・各キャラの状態・感情・位置は引き継ぐ）。前の文をそのまま繰り返さない。'],
    ['fg333', '場面転換・時間経過・新キャラ/新場所/新事実・物語の結末確定はしない。',
              '場面転換・時間経過・新キャラ/新場所/新事実・物語の結末確定は NPC の側から起こさない（入力が移動・時間の経過・場面の切り替えを書いた回は、それに沿って進める）。'],
    ['engine', '時間を飛ばさない・場面を変えない・',
              '入力が移動・時間の経過を書いた回はそれに沿って進め、そうでなければ時間を飛ばさない・場面を変えない・']
  ];
  function count(h, n) { var c = 0, k = 0; while ((k = h.indexOf(n, k)) >= 0) { c++; k += n.length; } return c; }
  function bFix(sys) {
    if (typeof sys !== 'string' || sys.indexOf('＜あなたの役割＞') < 0) return sys;
    var out = sys; ST.b.sends++;
    B_PAIRS.forEach(function (p) { var n = count(out, p[1]); if (n === 1) { out = out.replace(p[1], p[2]); ST.b.hit[p[0]] = (ST.b.hit[p[0]] || 0) + 1; } else ST.b.miss[p[0] + (n ? ':many' : ':none')] = (ST.b.miss[p[0] + (n ? ':many' : ':none')] || 0) + 1; });
    return out;
  }
  function bBody(body) {
    if (typeof body !== 'string' || body.indexOf('＜あなたの役割＞') < 0) return body;
    var b; try { b = JSON.parse(body); } catch (e) { return body; }
    if (!b || !Array.isArray(b.messages)) return body;
    for (var i = 0; i < b.messages.length; i++) { var m = b.messages[i];
      if (m && m.role === 'system' && typeof m.content === 'string' && m.content.indexOf('＜あなたの役割＞') >= 0) { var t = bFix(m.content); if (t === m.content) return body; m.content = t; return JSON.stringify(b); } }
    return body;
  }
  (function wrapFetch() {
    var of = root.fetch; if (typeof of !== 'function') return;
    var w = function (u, o) {
      try { if (bOn() && o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(str(u))) { var nb = bBody(o.body); if (nb !== o.body) o = Object.assign({}, o, { body: nb }); } } catch (e) {}
      if (o !== arguments[1]) { var a2 = Array.prototype.slice.call(arguments); a2[1] = o; return of.apply(this, a2); }
      return of.apply(this, arguments);
    };
    try { root.fetch = w; } catch (e) {}
  })();

  /* =================== READ1c =================== */
  var C_RULE = 'sceneNow は、いまの場面の 1 行のまとめ（場所・いる人・最近の出来事）。本文と食い違わせないために使う。';
  var _lastLine = '';
  function lastEventOf(sum) {
    var s = str(sum); if (!s) return '';
    var m = s.match(/経過[：:]([\s\S]*?)(?:\n[^\n]{0,8}[：:]|$)/); if (!m) return ''; var seg = m[1];   /* 長期記憶のあらすじの「経過：」の段だけ（無ければ出さない） */
    var ss = seg.split(/(?<=[。！？])/).map(function (x) { return x.replace(/^[\s　]+|[\s　]+$/g, ''); }).filter(Boolean);
    var last = ss.length ? ss[ss.length - 1] : ''; if (!last) return '';
    return last.length > 60 ? last.slice(0, 59) + '…' : last;
  }
  function present(S) {
    var cast = castNames(S), T = (S && S.turns) || [], t = T[T.length - 1], out = [];
    if (cast[0]) out.push(cast[0]);
    if (!t) return out;
    var txt = str(t.narrative).replace(/「[^」]*」/g, '') + '\n'   /* 台詞の中で名前を呼んだだけの人は数えない */ + ((t._convSays || []).map(function (c) { return str(c && c.who); }).join('\n'));
    cast.slice(1).forEach(function (c) { var parts = [nrm(c)].concat(str(c).split(/[\s　・]+/).filter(function (p) { return p.length >= 2; }));
      if (parts.some(function (p) { return p && txt.indexOf(p) >= 0; }) && out.indexOf(c) < 0) out.push(c); });
    return out;
  }
  function shortName(c) { var p = str(c).split(/[\s　]+/).filter(Boolean); return p.length > 1 ? p[p.length - 1] : str(c); }
  function cLine(S, sum, curIn) {
    try {
      if (!S || !Array.isArray(S.turns) || !S.turns.length) return '';
      var P = root.__v292DfixPLACE1, L = null;
      try { if (P && typeof P.on === 'function' && P.on() && typeof P.build === 'function') L = P.build(S, curIn || null);   /* 送信のときはこの回の入力も当てる（PLACE1 の whereNow と同じ） */ } catch (e) { L = null; }
      var place = (L && L.heroAt && L.heroAt.place) ? str(L.heroAt.place) + (L.heroAt.pend ? 'へ向かう途中' : '') : str(S.scene && S.scene.loc);   /* ★EXIT2 (2): PLACE1 Pend が ON のときだけ pend が立つ */
      var away = [];
      if (L && Array.isArray(L.people)) L.people.forEach(function (pe) { if (/^(?:left|sent|gone|ahead)$/.test(str(pe.mode))) { var w = str(pe.who); if (w && away.indexOf(w) < 0) away.push(w); } });
      var here = present(S).filter(function (c) { return !away.some(function (a) { return nrm(a) === nrm(c) || nrm(c).indexOf(nrm(a)) >= 0; }); }).slice(0, 5);
      var parts = [];
      if (place) parts.push(place);
      if (here.length) parts.push(here.map(shortName).join('・') + (away.length ? '（' + away.map(shortName).join('・') + 'はこの場にいない）' : ''));
      var ev = lastEventOf(sum); if (ev) parts.push('最近の出来事：' + ev);
      return parts.length ? 'いまの場面：' + parts.join('｜') : '';
    } catch (e) { return ''; }
  }
  /* fix58 の user の組み立てから呼ぶ（OFF なら呼ばれない） */
  function cApply(parsed, state) {
    try {
      if (!parsed || typeof parsed !== 'object') return parsed;
      ST.c.sends++;
      var line = cLine(state || getS(), storedSummary(), parsed.currentInput || null);   /* 画面の行と同じ材料（長期記憶のあらすじの保存値） */
      if (!line) return parsed;
      _lastLine = line; ST.c.lines++;
      var blk = { rule: C_RULE, text: line }, o = {}, k, placed = false, anchor = Object.prototype.hasOwnProperty.call(parsed, 'nowScene') ? 'nowScene' : 'recentScenes';
      for (k in parsed) { if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'sceneNow') continue; if (k === anchor) { o.sceneNow = blk; placed = true; } o[k] = parsed[k]; }
      if (!placed) o.sceneNow = blk;
      return o;
    } catch (e) { return parsed; }
  }
  function show(line) {
    try {
      var doc = root.document; if (!doc) return; var st = doc.getElementById('story'); if (!st || !st.parentNode) return;
      var el = doc.getElementById('read1cSceneLine');
      if (!cOn() || !line) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
      if (!el) { el = doc.createElement('div'); el.id = 'read1cSceneLine'; el.setAttribute('aria-live', 'polite');
        el.style.cssText = 'font-size:12px;line-height:1.5;padding:4px 16px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(127,127,127,.25)';   /* 1 行（2 行にすると上の見出しの帯と重なった・実測）。全文は title */
        st.parentNode.insertBefore(el, st); }
      if (el.textContent !== line) { el.textContent = line; el.title = line; ST.c.shown++; }
    } catch (e) {}
  }
  function storedSummary() { try { return str(root.localStorage.getItem('chr6_v292Dfix135_sum')); } catch (e) { return ''; } }   /* fix135 の loadSummary と同じ読み方（読むだけ） */
  (function tick() {
    try { if (cOn()) { var S = getS(); var n = S && S.turns ? S.turns.length : 0; if (n !== tick.n || !tick.done) { tick.n = n; tick.done = true; var line = cLine(S, storedSummary()) || _lastLine; show(line); } } else if (tick.done) { tick.done = false; show(''); } } catch (e) {}
    try { setTimeout(tick, 1500); } catch (e2) {}
  })();

  root.__v292DfixREAD1abc = { VER: VER, aOn: aOn, bOn: bOn, cOn: cOn, aItems: aItems, aSeedDrop: aSeedDrop, askedRecently: askedRecently, tokensOf: tokensOf,
    bFix: bFix, cLine: cLine, cApply: cApply, lastEventOf: lastEventOf,
    stats: function () { return JSON.parse(JSON.stringify({ ver: VER, a: aOn(), b: bOn(), c: cOn(), st: ST, lastLine: _lastLine ? _lastLine.length : 0 })); } };
})(typeof window !== 'undefined' ? window : globalThis);
