// =====================================================================
// Chronicle - v292DfixNUM1: 序盤のプレイヤー入力の数・約束を終盤まで残す（laneLEAK1・2026-11-13・GPT #127-SW 3）
// 鍵 localStorage v292DfixNUM1On='1'（既定 OFF）／kill v292DfixNUM1Off='1'（On より優先）。FACTS1 の kill（v292DfixFACTS1Off='1'）のときも出さない。
// ---------------------------------------------------------------------
// 現象: earlierFacts（FACTS1/FACTS2）は合計 600 字・新しい行を優先するので、12 ターン目には 1〜2 ターン目の入力の行が窓から落ちる
//       （実測 prod4 K3_O: T12 の earlierFacts は 3 ターン目の行から。T1 の「銀貨三十枚」「薬瓶が五本」が無い）。
// 直し: earlierFacts.items の先頭に、窓から落ちたターンの「プレイヤーの入力にある数量・約束」だけを最大 5 行・合計 200 字で足す。
//   ・拾うのはプレイヤーの入力だけ（AI が書いた本文の数は対象外）。入力の語をそのまま写す（言い換えない）。
//   ・「N ターン目の入力の時点」と書き、今の数だとは言わない。同じ物について後の入力（数・受け渡し・消費）があれば「後の入力を優先：物=M ターン目」と付ける。
//     後の入力の行そのものは窓に残っていればそれを使い、落ちていればそのターンの行も同じ形で出す（新しい入力を先に予算へ入れる）。
//   ・約束・期限は、後の入力で果たした／取り消したことが分かるものは出さない。
//   ・その数（数＋助数詞）と物の名前が直近 2 ターンの本文に近く並んで出ている回は、その項目を出さない（毎ターンの言い直しを誘わない）。
//   ・保存しない。毎回その時点の S.turns から作り直す（取消・やり直しで消えたターンは入らない）。sys 0 字。AI の呼び出し 0。
// =====================================================================
(function(){
  'use strict';
  if (typeof window !== 'undefined' && window.__v292DfixNUM1Core) return;
  var VER = 'num1-20261113';
  var MAX_LINES = 5, MAX_CHARS = 200, CL_MAX = 18, PER_TURN = 3, PR_MAX = 30;
  var NUM = '[0-9０-９〇一二三四五六七八九十百千万]+';
  var CTR = '本|個|枚|冊|巻|斤|脚|台|匹|頭|羽|着|通|束|袋|箱|錠|発|粒|杯|瓶|缶|切れ|丁|振り|つ|名|人|円|両|ゴールド|ドル|キロ|グラム|リットル|部|点|輪|株|隻|艘|挺|張|組|樽|皿|膳|軒|席|個室|部屋';
  var RX_Q = new RegExp('(' + NUM + ')\\s*(' + CTR + ')', 'g');
  var SMALL = /^[一二三四五六七八九1-9１-９]$/;
  var CHG = /(払|渡|預|受け取|受取|もら|貰|使|飲|食べ|失く|無く|なく(?:し|す)|落と|捨|割|壊|売|買|返|配|分け|納め|持ち帰|置い|置き|しまっ|しまう|しまい|仕舞|入れ|減|増|足し|残|消え|点かな|切れ)/;
  var RX_PROMISE = new RegExp('約束|誓|必ず|取り置き|取りに来|迎えに|待ってて|待っていて|返します|返すから|戻ります|戻るから|戻ってくる'
    + '|(?:[0-9０-９一二三四五六七八九十]+時(?:半|[0-9０-９一二三四五六七八九十]+分)?|日没|夜明け|正午|明日|今夜|今晩|明朝)[^、。「」]{0,8}(?:までに?|には|を過ぎ|で[^、。「」]{0,4}閉)');
  var RX_DONE = /約束(?:どおり|通り|を果た|は果た|を守)|返した|返し終|渡した|届けた|納め|取りに来た|受け取りに来|引き取|迎えに来た|迎えに行った|戻ってきた|戻った|間に合|済ませ|済んだ|果たし|払った|支払|終え|終わっ|終わり|取り消|やめにし|破っ/;
  var RX_CONT = /続きを(?:自然に)?進めて|^続きを書/;

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ if (ls('v292DfixNUM1Off') === '1') return false; if (ls('v292DfixFACTS1Off') === '1') return false; return ls('v292DfixNUM1On') === '1'; }
  function str(x){ return String(x == null ? '' : x); }
  function plain(narr){ var t = Array.isArray(narr) ? narr.join('\n') : str(narr); return t.replace(/<[^>]*>/g, ' '); }
  function toks(s){ return (str(s).match(/[一-鿿々]{2,}|[ァ-ヶー]{2,}/g) || []); }

  // 入力 1 つから数量の言及を拾う → [{ key, num, ctr, clause, q }]
  function mentions(text){
    var t = str(text).replace(/\s+/g, ' ').trim(), out = [], m;
    RX_Q.lastIndex = 0;
    while ((m = RX_Q.exec(t)) !== null){
      var num = m[1], ctr = m[2], s = m.index, e = s + m[0].length, after = t.slice(e, e + 4), before = t.slice(0, s);
      if ((ctr === '人' || ctr === '名') && SMALL.test(num)) continue;                    // 二人で／三人で（人数の言い回し）は拾わない。十人以上は拾う
      if (ctr === 'つ' && /^(?:に(?:分|割|折|裂)|目)/.test(after)) continue;               // 二つに分かれ／一つ目
      if (ctr === '本' && /^(?:道|気|調子|槍|立ち)/.test(after)) continue;
      if (ctr === '部' && /^(?:屋|室|分|員|長|活)/.test(after)) continue;
      if (ctr === '台' && /^(?:所|本|詞|風)/.test(after)) continue;
      if (ctr === '点' && /^(?:け|か|い|灯|火)/.test(after)) continue;
      if (ctr === '通' && /^(?:り|っ|じ|す|る|行|路)/.test(after)) continue;
      if (/^(?:ぶん|分(?![か-ん])|ほど先|ずつ)/.test(after) && ctr !== 'つ') { /* 三本ぶん＝長さ */ if (/^(?:ぶん|分)/.test(after)) continue; }
      if (/[一二三四五六七八九十]$/.test(before) ) continue;
      // 物の名前: 数の直前（区切り 、。「」 から数の手前まで。助詞を外す）。無ければ数の直後の「の＋名詞」
      var cut = Math.max(before.lastIndexOf('、'), before.lastIndexOf('。'), before.lastIndexOf('「'), before.lastIndexOf('」'), before.lastIndexOf('『'), before.lastIndexOf('』'), before.lastIndexOf(' '));
      var segC = before.slice(cut + 1);                                                    // 写す範囲の頭
      var seg = segC.replace(/(?:約|計|全部で|合わせて|合計|残り|あと|もう|たった|ちょうど|それぞれ)$/, ''), lastP = (seg.match(/([がをはもにでとの])$/) || [])[1] || '';
      seg = seg.replace(/[がをはもにでとの\s]+$/, '');
      var key = seg.split(/には|では|から|まで|[はにでをともへのがや]/).pop() || '';
      if ((lastP === 'に' || lastP === 'で') && /は/.test(seg)){ var tp = seg.slice(0, seg.lastIndexOf('は')).split(/には|では|から|まで|[にでをともへのがや]/).pop(); if (tp) key = tp; }   // 「通行証は一行に一枚」→ 通行証
      if (key.length > 8) key = key.slice(-8);
      if (!/[一-鿿々ァ-ヶ]/.test(key) || /[ぁ-ん]$/.test(key.replace(/[りんきち]$/, '').slice(-1)) && !/^[おご]?[一-鿿々ァ-ヶー]+[りんきち]?$|^お[一-鿿ぁ-ん]{1,4}$/.test(key) || new RegExp(NUM + '(?:' + CTR + ')').test(key)) key = '';
      if (key && !/^[おご]?[一-鿿々ァ-ヶー]+[りんきち]?$/.test(key)){ var kr = key.match(/[一-鿿々ァ-ヶー]{2,}$/) || key.match(/[一-鿿々ァ-ヶー]{2,}(?=[ぁ-ん]{0,2}$)/); if (kr) key = kr[0]; }   // 「古い地図帳」→ 地図帳（後の入力とつなぐため、名詞の芯だけにする）
      if (!key){ var am = t.slice(e).match(/^(?:の|ある|入りの)([一-鿿々ァ-ヶー]{1,8})/); if (am) key = am[1]; }
      var cs = Math.max(cut + 1, s - 12), kp = key ? before.lastIndexOf(key) : -1;
      if (kp >= cs && (s - cs > 10 || new RegExp(NUM + '\\s*(?:' + CTR + ')').test(before.slice(cs, kp)))) cs = kp;   // 物の名前から写す（長い前置き・別の数を含む前置きは落とす）
      var clause = t.slice(cs, e).replace(/^[と、\s]+/, '');
      if (!segC.trim() && key) clause = t.slice(s, Math.min(t.length, e + 1 + key.length + 1)).replace(/[、。「」].*$/, '');   // 「三本の鍵」
      if (clause.length > CL_MAX) clause = clause.slice(-CL_MAX);
      out.push({ key: key, num: num, ctr: ctr, q: num + ctr, clause: clause, seg: segC });
    }
    return out;
  }
  function promiseClause(text){
    var t = str(text).replace(/\s+/g, ' ').trim(), parts = t.split(/(?<=[。！？])|(?=「)|(?<=」)/), i;
    for (i = 0; i < parts.length; i++){ var p = parts[i].replace(/^[「『]|[」』]$/g, '').trim(); if (p && RX_PROMISE.test(p)) return p.length > PR_MAX ? (p.slice(0, PR_MAX - 1) + '…') : p; }
    return RX_PROMISE.test(t) ? (t.length > PR_MAX ? t.slice(0, PR_MAX - 1) + '…' : t) : '';
  }

  // build(turns, items, currentInput) → { lines:[…], dbg:{…} }   turns = S.turns（このターンを送る時点）／items = いまの earlierFacts.items
  function build(turns, items, currentInput){
    turns = Array.isArray(turns) ? turns : []; items = Array.isArray(items) ? items : [];
    var N = turns.length, dbg = { cand: 0, visible: 0, repeat: 0, done: 0, over: 0 };
    if (N <= 2) return { lines: [], dbg: dbg, detail: [] };
    var vis = {}, i, j;
    items.forEach(function(r){ var m = str(r).match(/^(\d+)ターン目/); if (m) vis[+m[1]] = str(r); });
    var recent = plain((turns[N - 1] || {}).narrative) + '\n' + plain((turns[N - 2] || {}).narrative);
    // 全ターンの入力（直近 2 ターンも「後の入力」として見る）
    var T = [];
    for (i = 0; i < N; i++){ var pt = str((turns[i] || {}).playerText).replace(/\s+/g, ' ').trim(); if (RX_CONT.test(pt)) pt = ''; T.push({ n: i + 1, text: pt, ms: pt ? mentions(pt) : [], pr: pt ? promiseClause(pt) : '' }); }
    // 名前の無い数（「一本を」「五個は」）は、同じ助数詞で直前に出た物につなぐ
    var lastByCtr = {};
    T.forEach(function(t){ t.ms.forEach(function(m){ if (m.key) lastByCtr[m.ctr] = m.key; else if (lastByCtr[m.ctr]) { m.key = lastByCtr[m.ctr]; m.linked = true; } }); });
    function laterTurns(key, n, ctr, seg){   // その物について n ターン目より後の入力（数の言及／名前＋受け渡しの語）
      var out = []; if (!key) return out;
      for (var a = 0; a < T.length; a++){ var t = T[a]; if (t.n <= n || !t.text) continue;
        if (t.ms.some(function(m){ return m.key === key || (ctr && m.ctr === ctr && share(seg, m.seg)); }) || (CHG.test(t.text) && (t.text.indexOf(key) >= 0 || share(seg, t.text)))) out.push(t.n); }
      return out;
    }
    function share(a, b){   // 数の手前の語どうしが 2 字以上（漢字かカタカナを含む）重なる＝同じ物の話とみなす（つなぎ過ぎる側に倒す）
      a = str(a); b = str(b); for (var x = 0; x + 2 <= a.length; x++){ var w = a.substr(x, 2); if (/[一-鿿々ァ-ヶ]/.test(w) && !/[はがをにでともへのや、。]/.test(w) && b.indexOf(w) >= 0) return true; } return false;
    }
    function near(hay, key, q){   // 直近の本文で、その数と物の名前が近く（20 字以内）に出ているか
      var p = hay.indexOf(q); while (p >= 0){ if (hay.slice(Math.max(0, p - 20), p + q.length + 20).indexOf(key) >= 0) return true; p = hay.indexOf(q, p + 1); } return false;
    }
    var cands = [], seenKQ = {}, firstOf = {};
    for (i = 0; i <= N - 3; i++){
      var t = T[i]; if (!t.text) continue;
      var row = vis[t.n], seen = {};
      t.ms.forEach(function(m){
        if (!m.key || m.linked || seen[m.key + m.q]) return; seen[m.key + m.q] = 1; dbg.cand++;
        var isFirst = !firstOf[m.key]; if (isFirst) firstOf[m.key] = t.n;
        if (seenKQ[m.key + '|' + m.q]){ dbg.repeat++; return; } seenKQ[m.key + '|' + m.q] = 1;                       // 同じ物・同じ数の言い直し（前の入力で出した）
        if (row && row.indexOf(m.q) >= 0 && row.indexOf(m.key) >= 0){ dbg.visible++; return; }                 // その入力の行が窓に残っている
        if (near(recent, m.key, m.q)){ dbg.repeat++; return; }                   // 直近の本文・今回の入力にもう出ている
        var lt = laterTurns(m.key, t.n, m.ctr, m.seg);
        cands.push({ n: t.n, kind: 'q', key: m.key, clause: m.clause, later: lt, newest: lt.length === 0, first: isFirst });
      });
      if (t.pr){
        dbg.cand++;
        var tk = toks(t.text), done = false;
        for (j = i + 1; j < N; j++){ var u = T[j].text; if (!u) continue; if (/約束(?:どおり|通り|を果た|は果た|を守)/.test(u) || (RX_DONE.test(u) && tk.some(function(w){ return u.indexOf(w) >= 0; }))) { done = true; break; } }
        if (done) dbg.done++;
        else if (row && row.indexOf(t.pr.replace(/…$/, '').slice(0, 12)) >= 0) dbg.visible++;
        else cands.push({ n: t.n, kind: 'p', clause: t.pr });
      }
    }
    // 予算に入れる順: 果たしていない約束（新しい順）→ その物の最後の言及と最初の言及（新しい順）→ 途中の言及（新しい順）
    function pr(c){ return c.kind === 'p' ? 0 : ((c.newest || c.first) ? 1 : 2); }
    cands.sort(function(a, b){ return pr(a) - pr(b) || b.n - a.n; });
    var groups = {}, order = [], used = 0;
    function render(g){
      var qs = g.q.map(function(c){ return c.clause; }), lat = [];
      g.q.forEach(function(c){ if (c.later.length) lat.push(c.key + '=' + c.later.slice(-2).join('・') + 'ターン目'); });
      var s = g.n + 'ターン目の入力の時点';
      if (qs.length) s += '：' + qs.join('／') + '（今の数とは限らない' + (lat.length ? '。後の入力を優先：' + lat.join('、') : '') + '）';
      if (g.p) s += (qs.length ? '・' : '：') + '約束・期限「' + g.p + '」（果たした入力はまだ無い）';
      return s;
    }
    for (i = 0; i < cands.length; i++){
      var c = cands[i], g = groups[c.n], isNew = !g;
      if (isNew){ if (order.length >= MAX_LINES){ dbg.over++; continue; } g = { n: c.n, q: [], p: '' }; }
      var before = isNew ? 0 : render(g).length;
      if (c.kind === 'p'){ if (g.p){ continue; } g.p = c.clause; }
      else { if (g.q.length >= PER_TURN){ dbg.over++; continue; } g.q.push(c); }
      var after = render(g).length;
      if (used - before + after > MAX_CHARS){ if (c.kind === 'p') g.p = ''; else g.q.pop(); dbg.over++; continue; }
      used += after - before; if (isNew){ groups[c.n] = g; order.push(c.n); }
    }
    order.sort(function(a, b){ return a - b; });
    return { lines: order.map(function(n){ return render(groups[n]); }), dbg: dbg, detail: order.map(function(n){ var g = groups[n]; return { n: n, q: g.q.map(function(c){ return { key: c.key, clause: c.clause, later: c.later.slice() }; }), p: g.p }; }) };
  }

  var _last = null;
  // apply(parsed, state, factsRule) → parsed（earlierFacts.items の先頭に足す。earlierFacts が無ければ storySoFar の直後に作る）
  function apply(parsed, state, factsRule){
    _last = null;
    try {
      if (!on() || !parsed) return parsed;
      var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
      var items = (parsed.earlierFacts && Array.isArray(parsed.earlierFacts.items)) ? parsed.earlierFacts.items : [];
      var r = build(turns, items, parsed.currentInput && parsed.currentInput.text);
      _last = { turns: turns.length, lines: r.lines.slice(), chars: r.lines.join('').length, dbg: r.dbg };
      if (!r.lines.length) return parsed;
      if (parsed.earlierFacts && Array.isArray(parsed.earlierFacts.items)){ parsed.earlierFacts.items = r.lines.concat(parsed.earlierFacts.items); return parsed; }
      var o = {}, k, placed = false;
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue; o[k] = parsed[k]; if (k === 'storySoFar'){ o.earlierFacts = { rule: str(factsRule), items: r.lines }; placed = true; } }
      if (!placed) o.earlierFacts = { rule: str(factsRule), items: r.lines };
      return o;
    } catch(e){ return parsed; }
  }
  var api = { VER: VER, on: on, build: build, apply: apply, mentions: mentions, promiseClause: promiseClause, last: function(){ return _last; }, MAX_LINES: MAX_LINES, MAX_CHARS: MAX_CHARS };
  if (typeof window !== 'undefined'){ window.__v292DfixNUM1Core = api; window.__v292DfixNUM1 = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
