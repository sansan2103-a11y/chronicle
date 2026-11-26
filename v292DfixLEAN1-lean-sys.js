/* v292DfixLEAN1-lean-sys.js — ★LEAN1 r2（2026-11-26・試験専用・既定 OFF: localStorage v292DfixLEAN1On='1'）
 * GPT #127-YJ「足す前に引く」。system の見出し（行頭の【…】）のうち「表現の制限」に当たるものを、送信のいちばん最後で外す。
 * ほかの仕組みが見出しを足し終えた後に外すため、index.html で送信の仕組みより前に読む（＝fetch の最も内側）。
 * 残すもの: 事実の保護（状態・呼称・話者・居場所）と出力形式の決まり。user・model・ほかの値には触れない。保存データにも触れない。
 * 外す見出し: v292DfixLEAN1Drop（「|」区切り・見出しの先頭の一致）で差し替え可。未設定なら下の既定（r2 では出力の形に関わる「表記」「読ませ方」は外さない）。
 * 追加（任意）: v292DfixLEAN1Add='1' で、短い書き方の約束 5 行を system の末尾に足す（既定 OFF）。
 * 診断: window.__v292DfixLEAN1.stats() / .list() / .fromBody(body) */
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : this);
  if (!G || G.__v292DfixLEAN1) return;
  var TAG = '[LEAN1]';
  var DEF = ['良い1ターンの形', '展開を前に進める', '書き方の見本', '反応と身体', 'ダッシュ', '文体の基本ルール', 'NPCの登場', '展開の推進ルール', '描写の作り方'];
  var st = { seen: 0, cut: 0, err: 0, last: null };
  function ls(k){ try { return G.localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ return ls('v292DfixLEAN1On') === '1'; }
  function list(){ var v = ls('v292DfixLEAN1Drop'); if (v) { var a = String(v).split('|').map(function(x){ return x.trim(); }).filter(Boolean); if (a.length) return a; } return DEF; }
  /* ★ADD（v292DfixLEAN1Add='1' のときだけ・LEAN1On と併用）: 外した決まりの代わりに置く、短い書き方の約束 5 行（Owner が良いと判断した見本から取り出した型）。
     演技の指示（苦しそうに 等）は書かない。誰が語るかの役割分担と、文の形だけ。 */
  var ADD = '\n\n【書き方（これだけ）】\n'
    + '・短い文で書く。1 文に動作は 1 つ。見えるもの・聞こえるもの・手に触れるものを、起きた順に書く。比喩は重ねない。\n'
    + '・人物の気持ちや事情を、本人の台詞で説明させない。体の反応と行動で見せ、それが何の反応かは地の文に書く。\n'
    + '・息が上がっている・痛みが強い・動揺が大きいとき、台詞は整った文にならない（息、短い音、一語、途切れ、無言）。口調や丁寧さより、その時に話せる量が先に決まる。\n'
    + '・その場にいる人物は、それぞれ自分の目的で小さく動く。全員が同じ反応をしない。言うだけで終わらせず、何かをしようとする。\n'
    + '・前の場面で起きたこと（物・傷・見られたこと・約束）は消えない。次の場面の出発点にする。場面は、次が気になるところで終える。';
  function addOn(){ return ls('v292DfixLEAN1Add') === '1'; }
  function fromBody(body){
    if (typeof body !== 'string' || body.indexOf('"messages"') < 0) return body;
    var b = JSON.parse(body); if (!b || !Array.isArray(b.messages)) return body;
    var si = -1; for (var i = 0; i < b.messages.length; i++){ var m = b.messages[i]; if (m && m.role === 'system' && typeof m.content === 'string' && m.content.indexOf('＜あなたの役割＞') >= 0 && m.content.indexOf('\n【') >= 0){ si = i; break; } }
    if (si < 0) return body;   /* 物語の本送信だけ（外見の提案・要約などの別の送信には触れない） */
    st.seen++;
    var drop = list(), src = b.messages[si].content, parts = src.split(/(\n+)(?=【[^】\n]{1,90}】)/), out = parts[0], cut = [], kept = [];
    for (var k = 1; k + 1 < parts.length; k += 2){
      var sep = parts[k], p = parts[k + 1], h = /^【([^】\n]{1,90})】/.exec(p), name = h ? h[1] : '';
      if (name && drop.some(function(d){ return name.indexOf(d) === 0; })) cut.push(name.slice(0, 20)); else { out += sep + p; kept.push(name.slice(0, 12)); }
    }
    var add = addOn() ? ADD : '';
    st.last = { cut: cut, kept: kept, before: src.length, after: out.length + add.length, add: !!add };
    if (!cut.length && !add) return body;
    /* r3: 足す 5 行は末尾ではなく、最初の見出しの前（役割の直後）に置く。実機 lean2: 末尾に置いた C だけ <state> の出力が 3 回欠けた
       （出力の形の決まりより後ろに書き方の約束が来て、最後に読む内容が変わったためと見ている）。v292DfixLEAN1AddPos='end' で元の位置に戻せる。 */
    if (add && ls('v292DfixLEAN1AddPos') !== 'end') { var m1 = /\n+(?=【[^】\n]{1,90}】)/.exec(out); if (m1) out = out.slice(0, m1.index) + add + out.slice(m1.index); else out += add; }
    else out += add;
    st.last.addPos = add ? (ls('v292DfixLEAN1AddPos') === 'end' ? 'end' : 'top') : null;
    b.messages[si].content = out; st.cut++;
    return JSON.stringify(b);
  }
  var of = G.fetch;
  if (typeof of === 'function'){
    var w = function(u, o){
      try { if (on() && o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))){ var nb = fromBody(o.body); if (nb !== o.body) o = Object.assign({}, o, { body: nb }); } }
      catch(e){ st.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function(k){ w[k] = of[k]; }); } catch(e){}
    w.__fLEAN1 = true; G.fetch = w;
  }
  G.__v292DfixLEAN1 = { VER: 'lean1-20261127-r3', on: on, addOn: addOn, list: list, stats: function(){ return st; }, fromBody: fromBody };
})();
