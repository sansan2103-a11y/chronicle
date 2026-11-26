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
  /* r5: 「NPCの登場」は外さない（実機 lean4: 外した本で、頼んでいない登録人物が 2 人出てきた。GPT #127-YK「必要部分だけ戻す」） */
  var DEF = ['良い1ターンの形', '展開を前に進める', '書き方の見本', '反応と身体', 'ダッシュ', '文体の基本ルール', '展開の推進ルール', '描写の作り方'];
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
    + '・前の場面で起きたこと（物・傷・見られたこと・約束）は消えない。次の場面の出発点にする。場面は、次が気になるところで終える。\n'
    /* r4: 実機 lean3 で、5 行を足した形だけ <state> の無い回が増えた（C 4・2 回／今の形 1 回）。欠けた回は出力が短く、本文だけでタグが 1 つも無かった＝小説として書き切ってやめている。
       そこで、書き方の約束は本文だけのもので、後ろのタグは省かないことを 1 行で言う（v292DfixLEAN1AddTag='0' でこの行だけ外せる）。 */
    + (ls('v292DfixLEAN1AddTag') === '0' ? '' : '・ここまでの約束は本文の書き方だけに当てる。本文が短くても、本文の後ろに置くタグ（下の【出力の形式】と【状態の出力】）は、どのターンでも省かない。');
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
  /* ---- ★STFILL1（2026-11-27・試験専用・既定 OFF: localStorage v292DfixSTFILL1On='1'・GPT #127-YK 案 1）----
   * 物語の本送信の返事に <state> が 1 つも無いとき（実機 lean3/lean4: 書き方の約束を足した形で 10 ターン中 0〜4 回）、同じ回の中で 1 回だけ、
   * 「いま書かれた本文」から状態の行だけを取り直し、返事の末尾に足してから呼び出し元へ返す。呼び出し元から見ると、AI が <state> を付けて返したのと同じ形になる。
   *   ・根拠は、確定した本文（その回の AI の出力）と、送信に入っていた直前の状態・名前の表だけ。新しい展開を作らせない。本文から分からない項目は書かせない。
   *   ・同じ送信の中で完結するので、物語・ターン・本文の取り違えは起きない。取り消し・生成し直しで捨てた回は、その回の出力ごと捨てられる。
   *   ・取り直しは 1 回だけ。失敗・空・名前が表に無い行は足さない（＝その回は状態を更新しない。古い行を新しい状態として確定しない）。
   *   ・足すのは からだ／こころ だけ（r2。本能・目的は作文になるので書かせない）。傷・関係・未解決は取り直しでは書かせない（根拠なく増やさない・消さない）。 */
  var fs1 = { seen: 0, ok: 0, miss: 0, filled: 0, fail: 0, err: 0, last: null };
  function fillOn(){ return ls('v292DfixSTFILL1On') === '1'; }
  function sect(sys, head){ var i = sys.indexOf('【' + head); if (i < 0) return ''; var m = /\n+(?=【[^】\n]{1,90}】)/.exec(sys.slice(i + 1)); return sys.slice(i, m ? i + 1 + m.index : sys.length).slice(0, 1400); }
  var FILL_SYS = 'あなたは記録係。下の「本文」は物語の 1 ターン分で、すでに確定している。本文に書かれていることだけを根拠に、本文に出てきた人物の今の状態を書き出す。\n'
    + '・出力は次の形の行だけ。前置き・説明・本文の続きは書かない。\n<state who="名前" からだ="…" こころ="…"/>\n'
    + '・who は下の名前の表記どおり。表に無い人は書かない。最大 4 人。本文に出てこない人は書かない。\n'
    + '・からだ＝本文に書かれた姿勢・位置・息・けがの様子。こころ＝本文に書かれた表情・声・しぐさから直接分かる気持ち。各 30 字まで。本能は書かない。\n'
    + '・本文の言葉をなるべくそのまま使う。本文に無い動作・意図・事情を足さない。\n'
    + '・本文から分からない項目は、その属性ごと省く。推測で埋めない。新しい出来事・台詞・けが・回復を作らない。\n';
  function fillOne(self, u, o, reqBody, resp){
    return resp.clone().text().then(function(txt){
      var j = JSON.parse(txt), msg = j && j.choices && j.choices[0] && j.choices[0].message, c = msg && msg.content;
      if (typeof c !== 'string' || c.length < 120) return resp;
      fs1.seen++;
      /* r3 ★毎ターン（v292DfixSTFILL1Mode='all'）: 実機 fill2 では、今の形でも「気づけない記録の欠け」が 31/69（人物×ターン）あり、<state> が付いていても人物の行が抜ける・崩れる回が多かった。
         'all' では <state> の有無にかかわらず毎ターン本文から読み取り、AI 自身が書かなかった人物の行だけを足す（AI が書いた行は上書きしない）。 */
      var all = ls('v292DfixSTFILL1Mode') === 'all', hasSt = /<state\b[^>]*\bwho\s*=/.test(c);
      if (hasSt && !all) { fs1.ok++; return resp; }
      if (hasSt) fs1.ok++; else fs1.miss++;
      var have = {}; (c.match(/<state\b[^>]*>/g) || []).forEach(function(tg){ var w0 = /\bwho\s*=\s*"([^"]{1,24})"/.exec(tg); if (!w0) return; var hv = have[w0[1]] || (have[w0[1]] = {}); if (/(?:^|[\s"])からだ\s*=\s*"[^"…]{2,}/.test(tg)) hv['からだ'] = 1; if (/(?:^|[\s"])こころ\s*=\s*"[^"…]{2,}/.test(tg)) hv['こころ'] = 1; });   /* r4: 属性ごとに見る（実機: AI の行の からだ が崩れていたのに、行があるというだけで読み取りの行が捨てられた） */
      var sayWho = {}; (c.match(/<(?:say|react)\b[^>]*>/g) || []).forEach(function(tg){ var w1 = /\bwho\s*=\s*"([^"]{2,24})"/.exec(tg); if (w1 && !/^[?？]+$|不明/.test(w1[1])) sayWho[w1[1]] = 1; });
      var rb = JSON.parse(reqBody), sys = '';
      for (var i = 0; i < rb.messages.length; i++) if (rb.messages[i] && rb.messages[i].role === 'system' && typeof rb.messages[i].content === 'string') { sys = rb.messages[i].content; break; }
      var names = sect(sys, 'whoに使う名前') || sect(sys, 'キャラ属性'), prev = sect(sys, '各キャラの現在の状態');
      var body2 = {}; Object.keys(rb).forEach(function(k){ if (k !== 'messages') body2[k] = rb[k]; });
      body2.max_tokens = 400; body2.temperature = 0.2;
      /* r2（実機 fill1: 30 ターンで補完 7 回のうち 4 回が本文に無い内容。うち 2 回は参考に渡した前の状態の写し、2 回は本能の作文）→ 前の状態は渡さない。名前の表だけ渡す。 */
      /* r4: 「名前の表に無い」で判定する（実機 fill3: 宮下 誠は入力の文として system に出ていたため「登録済み」と誤って扱われ、読み取りの対象に入らなかった） */
      var extra = Object.keys(sayWho).filter(function(n){ return names.indexOf(n) < 0; });   /* 登録されていないが、この回に話した人（名前のある新しい人） */
      body2.messages = [ { role: 'system', content: FILL_SYS + '\n' + names + (extra.length ? '\n（この回に話した人）' + extra.join('、') : '') + (prev ? '\n\n（この場面にいる人の名前）\n' + (prev.match(/^・[^｜\n]{1,24}(?=｜)/gm) || []).join('\n') : '') },
                         { role: 'user', content: '本文:\n' + c.replace(/<\/?(?:say|react)\b[^>]*>/g, '').slice(0, 2400) } ];
      return of.apply(self, [u, Object.assign({}, o, { body: JSON.stringify(body2) })]).then(function(r2){
        if (!r2 || !r2.ok) { fs1.fail++; fs1.last = { why: 'http' }; return resp; }
        return r2.text().then(function(t2){
          var j2 = JSON.parse(t2), c2 = j2 && j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content;
          var tags = (typeof c2 === 'string' ? (c2.match(/<state\b[^>]*\/>/g) || []) : []).map(function(tg){
            var w = /\bwho\s*=\s*"([^"]{1,24})"/.exec(tg); if (!w || (sys.indexOf(w[1]) < 0 && !sayWho[w[1]])) return ''; var hv2 = have[w[1]] || {};
            /* r2: 姓だけ・名だけの短い形は足さない（実機: 「宮下」の行が「宮下 誠」と別の項目に入り、一度も送られなかった） */
            try { var esc = w[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (new RegExp(esc + '[ 　][一-龠々ぁ-んァ-ヶー]').test(sys) || new RegExp('[一-龠々ぁ-んァ-ヶー][ 　]' + esc + '(?![一-龠々ぁ-んァ-ヶー])').test(sys)) return ''; } catch(_){}
            var out = '<state who="' + w[1] + '"', n = 0;
            ['からだ', 'こころ'].forEach(function(a){ if (hv2[a]) return;   /* AI が自分で書いた属性は足さない（上書きしない） */
              var m = new RegExp(a + '\\s*=\\s*"([^"]{1,60})"').exec(tg); if (m && !/^[…\.。\s]*$/.test(m[1]) && !/^(?:不明|なし|無し|特になし|その場にいる|—|-)$/.test(m[1].trim())) { out += ' ' + a + '="' + m[1] + '"'; n++; } });
            return n ? out + '/>' : '';
          }).filter(Boolean).slice(0, 4);
          if (!tags.length) { if (!hasSt) fs1.fail++; fs1.last = { why: 'empty' }; return resp; }
          msg.content = c.replace(/\s+$/, '') + '\n' + tags.join('\n');
          fs1.filled++; fs1.last = { why: 'filled', n: tags.length };
          var h = {}; try { var ct = resp.headers && resp.headers.get && resp.headers.get('content-type'); if (ct) h['content-type'] = ct; } catch(_){}
          return new G.Response(JSON.stringify(j), { status: resp.status, statusText: resp.statusText, headers: h });
        });
      });
    }).catch(function(e){ fs1.err++; fs1.last = { why: 'err', m: String(e && e.message || e).slice(0, 80) }; return resp; });
  }
  var of = G.fetch;
  if (typeof of === 'function'){
    var w = function(u, o){
      var story = false, orig = o && o.body;
      try { story = !!(o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u)) && o.body.indexOf('＜あなたの役割＞') >= 0); } catch(_){}
      try { if (on() && story){ var nb = fromBody(o.body); if (nb !== o.body) o = Object.assign({}, o, { body: nb }); } }
      catch(e){ st.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      var p = of.apply(this, [u, o]);
      if (!story || !fillOn() || typeof G.Response !== 'function') return p;
      var self = this, sent = o.body;
      return p.then(function(resp){ try { if (!resp || !resp.ok) return resp; return fillOne(self, u, o, sent, resp); } catch(e){ fs1.err++; return resp; } });
    };
    try { Object.keys(of).forEach(function(k){ w[k] = of[k]; }); } catch(e){}
    w.__fLEAN1 = true; G.fetch = w;
  }
  G.__v292DfixLEAN1 = { VER: 'lean1-20261127-r8', on: on, addOn: addOn, list: list, stats: function(){ return st; }, fromBody: fromBody, fill: { on: fillOn, stats: function(){ return fs1; } } };
})();
