/* v292DfixLEAN1-lean-sys.js — （SLIM1 試験 2026-11-27 は下の slimOn）★LEAN1 r2（2026-11-26・試験専用・既定 OFF: localStorage v292DfixLEAN1On='1'）
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
  function on(){ return ls('v292DfixLEAN1Off') !== '1'; }   /* 2026-11-27 Owner 判断で既定 ON（kill: v292DfixLEAN1Off='1'） */
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
  /* ★SLIM1（2026-11-27・試験専用・既定 OFF: localStorage v292DfixSLIM1On='1'。Owner「制約になってそうなところ」→ 毎ターンの記録の仕事を AI から減らす）
     <state> の からだ・こころ・本能 を AI に書かせない（からだ・こころは STFILL1 が本文から毎ターン読み取る）。目的・傷・関係・未解決は今までどおり AI が書く。
     【状態の出力（…）】の節（からだ／こころ／本能 の指示）も外す。<react>・<say> は変えない。STFILL1 が切れているときは何もしない。 */
  function slimMode(){ var v = ls('v292DfixSLIM1On'); return (v === '1' || v === '2') && fillOn() ? v : ''; }   /* '2'（2026-11-28）: こころ は AI に残し、からだ・本能 だけ外す（実機 slim1: こころ の更新が抜けやすかった） */
  function slimOn(){ return !!slimMode(); }
  var SLIM_LINE = '・「からだ」は今この瞬間の様子（毎ターン変わる）、傷/関係/未解決は消えない記録。混同しない。';
  var SLIM_NEW = '・<state> は、目的・傷・関係・未解決のどれかに書くことがある人物だけ置く。からだ・こころ・本能は書かない（本文から別に読み取る）。';
  var SLIM_NEW2 = '・<state> の「こころ」は今の気持ち（毎ターン変わる）。からだ・本能は書かない（本文から別に読み取る）。目的・傷・関係・未解決は、書くことがあるときだけ。';
  function slim(t){
    var ops = [], two = slimMode() === '2', m = /<state who="名前" からだ="[^"\n]*" (こころ="[^"\n]*") 本能="[^"\n]*"/.exec(t);
    if (m) { t = t.slice(0, m.index) + '<state who="名前"' + (two ? ' ' + m[1] : '') + t.slice(m.index + m[0].length); ops.push(two ? 'attr2' : 'attr'); }
    var nw = two ? SLIM_NEW2 : SLIM_NEW;
    if (t.split(SLIM_LINE).length === 2) { t = t.replace(SLIM_LINE, function(){ return nw; }); ops.push('line'); }
    else if (m) { var e = t.indexOf('\n', m.index); if (e > 0) { t = t.slice(0, e) + '\n' + nw + t.slice(e); ops.push('line+'); } }
    return { text: t, ops: ops };
  }
  /* ★ADD v2（2026-11-28・試験専用: localStorage v292DfixLEAN1AddV='2'）: Owner の見本（11-27 の 13 枚）から。4 行目に「追い詰められた側にも手がある・同席者が先に気づく」、
     5 行目に「前に出た物や出来事が別の意味で戻る・短い台詞か 1 動作で終える」、6 行目に「入力の数字は体や景色の変化に置き換える」。 */
  var ADD_V2 = [
    ['・その場にいる人物は、それぞれ自分の目的で小さく動く。全員が同じ反応をしない。言うだけで終わらせず、何かをしようとする。\n',
     '・その場にいる人物は、それぞれ自分の目的で小さく動く。全員が同じ反応をしない。言うだけで終わらせず、何かをしようとする。追い詰められた側にも、その人なりの手（取引・言い逃れ・時間かせぎ・逃げ道さがし）がある。異変には、主人公より先に同席者が気づいてよい。\n'],
    ['・前の場面で起きたこと（物・傷・見られたこと・約束）は消えない。次の場面の出発点にする。場面は、次が気になるところで終える。\n',
     '・前の場面で起きたこと（物・傷・見られたこと・約束）は消えない。次の場面の出発点にする。前に出た物や出来事が、あとの場面で別の意味を持って戻ってきてよい。場面は、短い台詞か 1 つの動作で、次が気になるところで終える。\n・入力に数字や割合があれば、数字のまま並べず、体・物・景色の変化に置き換えて書く。\n']
  ];
  /* ★ADD v3（2026-11-28・試験専用: v292DfixLEAN1AddV='3a'｜'3b'｜'3'）: Owner の見本（11-28 の同じ場面の並べ比べ）から。v2 の言い換えの上に足す。
     3a＝人物の厚み（やる側の態度・動作を誰かに向ける・初めて出た人物の目印と狙い）／3b＝主人公の目と耳・間（主人公の状態で見え方が変わる・動きを止めて音を書く・弱った人物に意思を残す）。
     どちらにも「直前の回の言い回しや絵をもう一度使わない」を付ける。 */
  var ADD_V3A = '・害を加える側・命じる側にも、態度を 1 つ書く（無表情、愉しげ、面倒そう など）。動作は、その場の誰かに向けて行う（見せる、聞かせる、遮る）。初めて出てきた人物には、その瞬間に目印を 1 つ（体・服・持ち物）と、狙いが分かる短い台詞か動作を 1 つ与える。\n';
  var ADD_V3B = '・場面は、主人公の目と耳を通して書いてよい（見えた、聞こえた気がした）。主人公の今の状態（怒り・変化・立場）で、見え方と言葉の選び方が変わる。主人公が黙っている回でも、声の調子か体の反応を一言書く。\n'
    + '・山場では、動きを一度止めて、その間に聞こえる音か見えるものを一文書く。弱った人物にも、まだ向けている意思を 1 つ残す（視線、手、一語）。弱い声は、ひらがなや途切れで書く。\n';
  var ADD_V3R = '・直前の回で使った言い回しや絵（同じ体の描写、同じ台詞）を、もう一度使わない。状態は一段進める。\n';
  /* ★CONT1（2026-11-28・試験専用: localStorage v292DfixCONT1On='1'／kill v292DfixCONT1Off='1'・既定 OFF＝送信バイト同一）:
     Owner の実プレイ「ひなたに肩を揉むよう命じる → 次のターンに別の人へ別のことを命じる → ひなたが揉んでいることが無くなっている」「少し前に使った物をまだ手に持っている文が出る」。
     書き方の約束に 2 行足す（続けている動作は、やめる理由が出るまで続く／使い終えた物は 1 句で手放す）。まず文だけで効くかを測る。効かなければ記録（続けていること・手に持つ物）を持つ形へ進む。 */
  var ADD_K1 = '・だれかが続けている動作（揉む・押さえる・支える・縛る・見張る・運ぶ など）は、やめる理由が書かれるまで続いている。別の人に別のことをさせても、前の人の動作は止めない。続けているなら「〜しながら」「手を止めずに」と 1 句入れ、やめるなら、やめた動きを 1 句書く。\n'
             + '・手に持った物は、使い終えたら 置く・しまう・返す のどれかを 1 句書いて手放す。前の回で使い終えた物を、理由なく手に持ったままにしない。\n';
  function contOn(){ return ls('v292DfixCONT1Off') !== '1' && ls('v292DfixCONT1On') === '1'; }
  function addText(){
    var a = ADD, v = ls('v292DfixLEAN1AddV');
    if (v === '2' || v === '3a' || v === '3b' || v === '3') ADD_V2.forEach(function(r){ if (a.split(r[0]).length === 2) a = a.replace(r[0], function(){ return r[1]; }); });
    if (v === '3a' || v === '3b' || v === '3') { var ex = (v !== '3b' ? ADD_V3A : '') + (v !== '3a' ? ADD_V3B : '') + ADD_V3R, k = a.indexOf('・ここまでの約束は本文の書き方だけに当てる'); a = k >= 0 ? a.slice(0, k) + ex + a.slice(k) : a + ex; }
    if (contOn()) { var kc = a.indexOf('・ここまでの約束は本文の書き方だけに当てる'); a = kc >= 0 ? a.slice(0, kc) + ADD_K1 + a.slice(kc) : a + ADD_K1; }   /* ★CONT1 */
    return a;
  }
  function addOn(){ return ls('v292DfixLEAN1AddOff') !== '1'; }   /* 既定 ON（kill: v292DfixLEAN1AddOff='1'） */
  /* ★CONT2（2026-11-28・試験専用: localStorage v292DfixCONT2On='1'／kill v292DfixCONT2Off='1'・既定 OFF＝送信バイト同一・記録もしない）:
     Owner「（続けている動作が消える・使った物を持ったまま・脱いだ服を着ている）これは上手く直したい」。変わる出来事が本文に書かれるまで続くはずの状態を、人物ごとの短い控えとして持つ。
       ・読み取り（毎ターンの記録係・追加の呼び出しなし）に、その回の本文から 続き／手／服 を書いてもらう。分からないものは書かない。
       ・控えは、書かれなければそのまま残す（＝その回に触れられなくても続いている）。「終わり」「なし」と書かれたら消す。服は期限なし、続きは 8 ターン、手は 3 ターン触れられなければ消す。
       ・毎ターン、本文を書く AI に【いま続いていること】として渡す（人物の状態の節の直後）。
     前の回までの控えは読み取りの AI に渡さない（fill1 の実測: 渡すと写しを作る）。物語の ID が分からないときは何もしない。取り消しで戻ったターンより先の控えは使わない。
     参考にした作り: 利用者作の状態トラッカー（人物ごとに 位置・していること・着ている物 を持ち、直近の発言の直前に今の状態をまるごと渡す）、SCORE（説明の無い状態の変化は前の状態を保つ）。 */
  function cont2On(){ return ls('v292DfixCONT2Off') !== '1' && ls('v292DfixCONT2On') === '1'; }
  var ct2 = { take: 0, set: 0, clear: 0, expire: 0, inject: 0, lines: 0, last: null };
  var CONT2_SYS = '\n・同じ行に、本文に書かれているときだけ次も足す（書かれていない・分からないものは書かない。推測で埋めない）:'
    + '\n　続き="…"：だれかに命じられた・自分で決めて、しばらく続ける動作（揉む・見張る・支える・運ぶ・押さえる・縛られている など）を、その回の終わりの時点でまだ続けているときの動作と相手（例: 続き="律の肩を揉んでいる"）。その回でやめた・終わったと書かれていれば 続き="終わり"。書く・握る・見る・振り向く のような一瞬の動作は書かない。'
    + '\n　手="…"：その回の終わりに手に持っている物（例: 手="鍵束"）。置いた・しまった・渡した・落としたと書かれていれば 手="なし"。'
    + '\n　服="…"：脱いだ・着た・はだけた・濡れた・破れた など、服の状態が変わったと書かれているときの今の状態（例: 服="上着を脱いでシャツ姿"）。元どおりに着直したと書かれていれば 服="元どおり"。';
  function cont2Sid(){ try { var F = G.__v292Dfix697, x = F && typeof F.status === 'function' ? F.status() : null; var id = x && x.storyId; return (typeof id === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(id)) ? id : null; } catch(e){ return null; } }
  function cont2Turns(){ try { var S = typeof G.__chronicleGetState === 'function' ? G.__chronicleGetState() : null; return (S && Array.isArray(S.turns)) ? S.turns.length : null; } catch(e){ return null; } }
  function cont2Load(id){ try { var j = JSON.parse(G.localStorage.getItem('v292DfixCONT2_' + id) || '{}'); return (j && typeof j === 'object') ? j : {}; } catch(e){ return {}; } }
  function cont2Save(id, L){ try { var ks = Object.keys(L); if (!ks.length) G.localStorage.removeItem('v292DfixCONT2_' + id); else G.localStorage.setItem('v292DfixCONT2_' + id, JSON.stringify(L)); } catch(e){} }
  var CONT2_TTL = { c: 6, h: 3, w: 9999 }, CONT2_END = { c: /^(?:終わり|終了|なし|無し|やめた|止めた|不明)$/, h: /^(?:なし|無し|何も持っていない|不明|空)$/, w: /^(?:元どおり|元通り|着直した|着た|なし|無し|不明|普段どおり)$/ };
  function cont2Prune(L, now){   /* 取り消しで戻った先の控え・期限切れを外す */
    Object.keys(L).forEach(function(n){ var e = L[n]; if (!e || typeof e !== 'object') { delete L[n]; return; }
      ['c', 'h', 'w'].forEach(function(k){ var x = e[k]; if (!x) return; if (typeof x.t !== 'number' || x.t > now || now - x.t > CONT2_TTL[k])   /* r2: 読み取りは本文が積まれる前に走る（その回の番号＝本数＋1）。取り消し・生成し直しで捨てた回の控え（番号が今の本数より大きい）は使わない */ { delete e[k]; ct2.expire++; } });
      if (!e.c && !e.h && !e.w) delete L[n]; });
    return L;
  }
  function cont2Take(L, who, tg, turn){   /* 読み取りの 1 行から控えを直す */
    var map = { c: '続き', h: '手', w: '服' }, ch = 0;
    Object.keys(map).forEach(function(k){
      var m = new RegExp('(?:^|[\\s"])' + map[k] + '\\s*=\\s*"([^"<>]{1,40})"').exec(tg); if (!m) return;
      var v = m[1].replace(/[\r\n]/g, ' ').trim(); if (!v || /^[…\.。\s—-]*$/.test(v)) return;
      var e = L[who] || (L[who] = {});
      if (CONT2_END[k].test(v)) { if (e[k]) { delete e[k]; ct2.clear++; ch++; } }
      else { e[k] = { v: v, t: turn }; ct2.set++; ch++; }
      if (!e.c && !e.h && !e.w) delete L[who];
    });
    return ch;
  }
  /* r4（実機 recheck_ym10: 本文に「手が肩から離れた」と書かれた後も、控えの「続き」が 2 ターン残った。読み取りは前の回の控えを知らないので「終わり」と書けない）:
     前の回から続いていること（続き・手）だけを、名前と数語で読み取りに見せ、「この回の本文でやめた・終わった・手放したと書かれているか」だけを答えてもらう（状態の文は渡さない＝写しを作らせない）。 */
  function cont2Ask(){
    try { var id = cont2Sid(), now = cont2Turns(); if (!id || now == null) return '';
      var L = cont2Prune(cont2Load(id), now), ls2 = [];
      Object.keys(L).slice(0, 6).forEach(function(n){ var e = L[n]; if (e.c) ls2.push('・' + n + '｜続き: ' + e.c.v); if (e.h) ls2.push('・' + n + '｜手: ' + e.h.v); });
      if (!ls2.length) return '';
      return '\n・（前の回から続いていること）次のうち、この回の本文で やめた・終わった・続けられなくなった・手放した と書かれているものだけ、<end who="名前" k="続き"/>（持ち物は k="手"）を 1 行ずつ書く。書かれていなければ何も書かない。下の文を state の行に写さない。\n' + ls2.join('\n');
    } catch(e){ return ''; }
  }
  function cont2Block(){   /* 本文を書く AI に渡す節（無ければ空文字） */
    try {
      if (!cont2On()) return '';
      var id = cont2Sid(), now = cont2Turns(); if (!id || now == null) return '';
      var L = cont2Prune(cont2Load(id), now), names = Object.keys(L); if (!names.length) return '';
      var lines = names.slice(0, 6).map(function(n){ var e = L[n], p = [];
        if (e.c) p.push('続けている: ' + e.c.v); if (e.h) p.push('手に: ' + e.h.v); if (e.w) p.push('服: ' + e.w.v);
        return '・' + n + '｜' + p.join('／'); });
      ct2.inject++; ct2.lines += lines.length; ct2.last = { n: lines.length, turn: now };
      return '\n\n【いま続いていること（やめる・変える出来事が本文に出るまで、そのまま続いている）】\n' + lines.join('\n')
        + '\n・続けている動作を、書き手の判断で終わらせない。終わるのは、プレイヤーの入力がやめさせたとき・その人が場を離れたとき・体が続けられなくなったときだけ。別の指示が重なったら、両方を同時に続ける形で書く（例: 揉む手を止めずに、自分も揉まれる）。続けていることは 1 句で触れる。'
        + '\n・服は、着る・脱ぐ動作を書かずに変えない（その暇が無い場面では変えられない）。手に無い物を、理由なく持たせない。使い終えた物は 置く・しまう・返す の 1 句で手放す。';
    } catch(e){ return ''; }
  }
  function fromBody(body){
    if (typeof body !== 'string' || body.indexOf('"messages"') < 0) return body;
    var b = JSON.parse(body); if (!b || !Array.isArray(b.messages)) return body;
    var si = -1; for (var i = 0; i < b.messages.length; i++){ var m = b.messages[i]; if (m && m.role === 'system' && typeof m.content === 'string' && m.content.indexOf('＜あなたの役割＞') >= 0 && m.content.indexOf('\n【') >= 0){ si = i; break; } }
    if (si < 0) return body;   /* 物語の本送信だけ（外見の提案・要約などの別の送信には触れない） */
    st.seen++;
    var drop = list(), src = b.messages[si].content, parts = src.split(/(\n+)(?=【[^】\n]{1,90}】)/), out = parts[0], cut = [], kept = [];
    for (var k = 1; k + 1 < parts.length; k += 2){
      var sep = parts[k], p = parts[k + 1], h = /^【([^】\n]{1,90})】/.exec(p), name = h ? h[1] : '';
      if (name && (drop.some(function(d){ return name.indexOf(d) === 0; }) || (slimOn() && name.indexOf('状態の出力') === 0 && name.indexOf('状態の出力・拡張') !== 0))) cut.push(name.slice(0, 20)); else { out += sep + p; kept.push(name.slice(0, 12)); }
    }
    var add = addOn() ? addText() : '';
    var sl = slimOn() ? slim(out) : null; if (sl) { out = sl.text; if (add) add = add.replace('（下の【出力の形式】と【状態の出力】）', '（下の【出力の形式】）'); }
    st.last = { cut: cut, kept: kept, before: src.length, after: out.length + add.length, add: !!add };
    if (sl) st.last.slim = sl.ops;
    var cb2 = cont2Block();   /* ★CONT2 */
    if (!cut.length && !add && !(sl && sl.ops.length) && !cb2) return body;
    /* r3: 足す 5 行は末尾ではなく、最初の見出しの前（役割の直後）に置く。実機 lean2: 末尾に置いた C だけ <state> の出力が 3 回欠けた
       （出力の形の決まりより後ろに書き方の約束が来て、最後に読む内容が変わったためと見ている）。v292DfixLEAN1AddPos='end' で元の位置に戻せる。 */
    if (add && ls('v292DfixLEAN1AddPos') !== 'end') { var m1 = /\n+(?=【[^】\n]{1,90}】)/.exec(out); if (m1) out = out.slice(0, m1.index) + add + out.slice(m1.index); else out += add; }
    else out += add;
    st.last.addPos = add ? (ls('v292DfixLEAN1AddPos') === 'end' ? 'end' : 'top') : null;
    if (cb2) { var k2 = out.indexOf('【各キャラの現在の状態'), n2 = k2 >= 0 ? out.slice(k2 + 5).search(/\n+【[^】\n]{1,90}】/) : -1; if (n2 >= 0) { var at2 = k2 + 5 + n2; out = out.slice(0, at2) + cb2 + out.slice(at2); } else out += cb2; st.last.cont2 = true; }
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
  function fillOn(){ return ls('v292DfixSTFILL1Off') !== '1'; }   /* 既定 ON（kill: v292DfixSTFILL1Off='1'） */
  function sect(sys, head){ var i = sys.indexOf('【' + head); if (i < 0) return ''; var m = /\n+(?=【[^】\n]{1,90}】)/.exec(sys.slice(i + 1)); return sys.slice(i, m ? i + 1 + m.index : sys.length).slice(0, 1400); }
  var FILL_SYS = 'あなたは記録係。下の「本文」は物語の 1 ターン分で、すでに確定している。本文に書かれていることだけを根拠に、本文に出てきた人物の今の状態を書き出す。\n'
    + '・出力は次の形の行だけ。前置き・説明・本文の続きは書かない。\n<state who="名前" からだ="…" こころ="…"/>\n'
    + '・who は下の名前の表記どおり。表に無い人は書かない。最大 5 人。本文に出てこない人は書かない。\n'
    + '・本文で話した人・動いた人は全員書く。地の文で姓だけ・役割の呼び名（警備員 等）で書かれていても、台詞の前の名前と同じ人として扱う。\n'
    + '・からだ＝本文に書かれた姿勢・位置・息・けがの様子。こころ＝本文ではっきり示された気持ちだけ（怯え・安堵・苛立ち 等）。台詞や動作をそのまま写さない。はっきりしなければ こころ は書かない。各 30 字まで。本能は書かない。\n'
    + '・本文の言葉をなるべくそのまま使う。本文に無い動作・意図・事情を足さない。\n'
    + '・本文から分からない項目は、その属性ごと省く。推測で埋めない。新しい出来事・台詞・けが・回復を作らない。\n';
  /* ---- ★SAYKEEP1（2026-11-28・試験専用: localStorage v292DfixSAYKEEP1On='1'／kill v292DfixSAYKEEP1Off='1'）----
   * SAY の回に、入力した台詞が返事のどこにも無いとき（実機: 今の形で 3 回中 1 回・8 回中 3 回）、本文の先頭に主人公の台詞として入力のままの文を置く。
   * 「ある」とみなす: 入力の文（記号・空白を除く）の頭 8 字か末尾 8 字が返事にある／主人公の <say> に、入力と半分以上同じ字の台詞がある（言い換え）。主人公の名前が無い物語では何もしない。 */
  var sk1 = { seen: 0, kept: 0, add: 0, err: 0, last: null };
  function skOn(){ return ls('v292DfixSAYKEEP1Off') !== '1' && (SAYKEEP_DEFAULT || ls('v292DfixSAYKEEP1On') === '1'); }
  var SAYKEEP_DEFAULT = true /* rec4（2026-11-28）: 実機 Q2 で A/B/C とも 4/4（二重なし）→ 既定 ON。kill v292DfixSAYKEEP1Off='1' */, SPKFILL_DEFAULT = false;
  function nrm(t){ return String(t || '').replace(/[\s　、。，．,.!！?？…‥・「」『』（）()ー―—\-〜~]/g, ''); }
  function sayKeepText(c, reqBody){
    try {
      var rb = JSON.parse(reqBody), um = null; for (var i = rb.messages.length - 1; i >= 0; i--) if (rb.messages[i] && rb.messages[i].role === 'user' && typeof rb.messages[i].content === 'string') { um = rb.messages[i].content; break; }
      if (!um) return null; var k = um.indexOf('\n\n━'), j = JSON.parse(k < 0 ? um : um.slice(0, k));
      var ci = j && j.currentInput, hero = j && j.cast && j.cast.protagonist && j.cast.protagonist.name;
      if (!ci || String(ci.type || '').toUpperCase() !== 'SAY' || typeof ci.text !== 'string' || typeof hero !== 'string' || !hero.trim()) return null;
      var raw = ci.text.trim(), q = /「([^「」]{1,200})」/.exec(raw), txt = (q ? q[1] : raw).trim();
      if (!txt || txt.length > 200 || /[<>]/.test(txt)) return null;
      sk1.seen++;
      var n = nrm(txt), nc = nrm(c.replace(/<(?:state|react)\b[^>]*>/g, ''));
      if (n.length < 2) return null;
      if (n.length <= 8 ? nc.indexOf(n) >= 0 : (nc.indexOf(n.slice(0, 8)) >= 0 || nc.indexOf(n.slice(-8)) >= 0)) { sk1.kept++; return null; }
      var esc = hero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp('<say\\b[^>]*\\bwho\\s*=\\s*"' + esc + '"[^>]*>([\\s\\S]*?)<\\/say>', 'g'), m, para = false;
      while ((m = re.exec(c))) { var h = nrm(m[1]), same = 0; for (var x = 0; x < n.length; x++) if (h.indexOf(n.charAt(x)) >= 0) same++; if (h.length >= 2 && same / n.length >= 0.6 && Math.abs(h.length - n.length) <= Math.max(6, n.length * 0.6)) { para = true; break; } }
      if (para) { sk1.kept++; return null; }
      sk1.add++; sk1.last = { len: txt.length };
      return '<say who="' + hero.trim() + '">' + txt.replace(/^[「『]|[」』]$/g, '') + '</say>\n' + c.replace(/^\s+/, '');
    } catch (e) { sk1.err++; return null; }
  }
  /* ---- ★SPKFILL1（2026-11-28・試験専用: localStorage v292DfixSPKFILL1On='1'／kill v292DfixSPKFILL1Off='1'。STFILL1 の読み取りと同じ 1 回の呼び出しに相乗り）----
   * 新しい書き方で、<say> の印が無い「」の台詞が増え、その札が別人になる取り違えが増えた（実機 fill3: 30 ターンで 7 → 11。名前のある未登録の人の台詞・短い息の声）。
   * 読み取りの AI に、印の無い「」へ番号を付けて渡し、話者が本文からはっきり分かるものだけ <q n="番号" who="名前"/> で返してもらい、その台詞を <say who> で包む。
   * 分からないもの・声に出していない「」（看板・題名・引用）は包まない（今までの話者推定に任せる）。名前は 名前の表・この回の印・本文に出てくる形だけ。 */
  var sp1 = { seen: 0, bare: 0, wrapped: 0, none: 0, bad: 0 };
  function spkOn(){ return ls('v292DfixSPKFILL1Off') !== '1' && (SPKFILL_DEFAULT || ls('v292DfixSPKFILL1On') === '1'); }
  function bareQuotes(c){   /* [{s,e,q}] : <say>…</say> の外にある「…」 */
    var out = [], re = /<say\b[^>]*>[\s\S]*?<\/say>|<(?:state|react)\b[^>]*>|「([^「」<>]{1,200})」/g, m;
    while ((m = re.exec(c))) { if (m[1] != null) out.push({ s: m.index, e: m.index + m[0].length, q: m[1] }); }
    return out.slice(0, 24);
  }
  var SPK_SYS = '\n\n【話者の印】本文の中で【番号】が付いている「」は、誰の台詞かの印がまだ無い。番号ごとに、その台詞を口に出した人を 1 行ずつ書く: <q n="番号" who="名前"/>\n'
    + '・本文を読んで話者がはっきり分かるものだけ書く。どちらとも取れるものは書かない。\n・声に出した台詞ではない「」（看板や書類の文字・題名・呼び名の引用・心の中の言葉）は who="なし"。\n'
    + '・名前は、名前の表か本文に出てくる形のまま書く（主人公の台詞は主人公の名前）。名前の分からない人は、本文での呼び方（「フードの男」「老人」など）で書く。前に出た別の人の名前を当てない。';
  /* ---- ★WOUNDFILL1（2026-11-28・試験専用: localStorage v292DfixWOUNDFILL1On='1'／kill v292DfixWOUNDFILL1Off='1'）----
   * 実機 Q1（Q）: 足首のけがを AI が <state> に書かず、11 ターンのあいだ記録にも次の送信にも無かった。読み取りに「本文にはっきり書かれたけが」だけ 傷= で書かせ、
   * その人の記録に傷がまだ無く、AI もこの回に傷を書いていないときだけ足す（上書きしない・消さない）。けがの語を含まない値は足さない。 */
  var wf1 = { add: 0, skip: 0 };
  function woundOn(){ return ls('v292DfixWOUNDFILL1Off') !== '1' && (WOUNDFILL_DEFAULT || ls('v292DfixWOUNDFILL1On') === '1'); }
  var WOUNDFILL_DEFAULT = false;
  var WOUND_SYS = '\n・本文の中で、その人がけがをした・けがを負っていることがはっきり書かれているときだけ、同じ行に 傷="部位と状態" を足す（例: 傷="右足首の打撲・腫れ"）。書かれていなければ 傷 は書かない。治った・無傷 は書かない。からだ に 血・切り傷・腫れ・折れ を書いた人には、必ず 傷 も書く。';
  /* ---- ★CLEAN1（2026-11-28・既定 ON・kill v292DfixCLEAN1Off='1'）: 本文に混ざった表示用の記号だけを外す（実機 slim1・Q1: <ruby>…<rt>…</rt></ruby>、<br>、漢字(よみ)、「(以下本文続き)」）。<say>・<react>・<state> には触れない。 */
  var cl1 = { seen: 0, fixed: 0 };
  /* ★DUP1（2026-11-28・実機 Q2 C T7: 本文に「……痛えな」「それで終わりか」と書いたうえで、末尾の記録の並びに同じ台詞の <say> を重ねて出し、画面で台詞が二重になった）:
     記録の並び（最初の <react>／<state> より後ろ）にある <say> が、本文の印の無い「」と同じ台詞なら、その印を本文の「」へ移す（末尾のほうは消す）。本文で既に印の付いた同じ台詞があるなら、末尾のほうだけ消す。
     同じかどうかは、かぎ括弧・句読点・…・空白を除いて完全に一致するときだけ。既定 ON（CLEAN1 と同じ所で動く）。kill: v292DfixDUP1Off='1' */
  function dupFix(c){
    try {
      var m0 = /<(?:react|state)\b/.exec(c); if (!m0 || m0.index < 40) return c;
      var head = c.slice(0, m0.index), tail = c.slice(m0.index);
      var norm = function(t){ return String(t).replace(/[「」『』。、，,．.…‥！？!?\s　・―—─ー〜~-]/g, ''); };
      var bq = bareQuotes(head), used = {}, changed = false;
      tail = tail.replace(/<say\b[^>]*\bwho\s*=\s*"([^"<>]{1,24})"[^>]*>([^<]{1,200})<\/say>[ \t]*\n?/g, function(all, who, txt, off, whole){
        if (off > 0 && /[="']/.test(whole.charAt(off - 1))) return all;   /* 属性の値の中に入れ子になった印は触らない */
        var n = norm(txt); if (n.length < 2 || /^[?？]+$|不明/.test(who)) return all;
        for (var i = 0; i < bq.length; i++) if (!used[i] && norm(bq[i].q) === n) { used[i] = who; changed = true; return ''; }
        var re = /<say\b[^>]*>([^<]{1,200})<\/say>/g, mm; while ((mm = re.exec(head))) if (norm(mm[1]) === n) { changed = true; return ''; }
        return all;
      });
      if (!changed) return c;
      for (var k = bq.length - 1; k >= 0; k--) if (used[k]) head = head.slice(0, bq[k].s) + '<say who="' + used[k] + '">' + bq[k].q + '</say>' + head.slice(bq[k].e);
      return head + tail;
    } catch (e) { return c; }
  }
  function cleanText(c){
    var t = c;
    t = t.replace(/<rp>[\s\S]*?<\/rp>/g, '').replace(/<rt>[\s\S]*?<\/rt>/g, '').replace(/<\/?(?:ruby|rb)>/g, '');
    t = t.replace(/<br\s*\/?>/g, '\n');
    t = t.replace(/([一-龠々]{1,6})[（(][ぁ-ん]{2,10}[）)]/g, '$1');
    t = t.replace(/^[ \t　]*[（(]\s*(?:以下、?)?本文(?:の)?(?:続き|つづき)[^）)\n]{0,12}[）)][ \t　]*$/gm, '');
    return t;
  }
  function fillOne(self, u, o, reqBody, resp){
    return resp.clone().text().then(function(txt){
      var j = JSON.parse(txt), msg = j && j.choices && j.choices[0] && j.choices[0].message, c = msg && msg.content;
      if (typeof c !== 'string' || c.length < 120) return resp;
      fs1.seen++;
      /* r3 ★毎ターン（v292DfixSTFILL1Mode='all'）: 実機 fill2 では、今の形でも「気づけない記録の欠け」が 31/69（人物×ターン）あり、<state> が付いていても人物の行が抜ける・崩れる回が多かった。
         'all' では <state> の有無にかかわらず毎ターン本文から読み取り、AI 自身が書かなかった人物の行だけを足す（AI が書いた行は上書きしない）。 */
      var all = ls('v292DfixSTFILL1Mode') !== 'miss',   /* 既定は毎ターン（'miss' で欠けた回だけ） */ hasSt = /<state\b[^>]*\bwho\s*=/.test(c);
      if (hasSt && !all) { fs1.ok++; return resp; }
      if (hasSt) fs1.ok++; else fs1.miss++;
      var have = {}; (c.match(/<state\b[^>]*>/g) || []).forEach(function(tg){ var w0 = /\bwho\s*=\s*"([^"]{1,24})"/.exec(tg); if (!w0) return; var hv = have[w0[1]] || (have[w0[1]] = {}); if (/(?:^|[\s"])からだ\s*=\s*"[^"…]{2,}/.test(tg)) hv['からだ'] = 1; if (/(?:^|[\s"])こころ\s*=\s*"[^"…]{2,}/.test(tg)) hv['こころ'] = 1; if (/(?:^|[\s"])傷\s*=\s*"[^"…]{2,}/.test(tg)) hv['傷'] = 1; });   /* r4: 属性ごとに見る（実機: AI の行の からだ が崩れていたのに、行があるというだけで読み取りの行が捨てられた） */
      var sayWho = {}; (c.match(/<(?:say|react)\b[^>]*>/g) || []).forEach(function(tg){ var w1 = /\bwho\s*=\s*"([^"]{2,24})"/.exec(tg); if (w1 && !/^[?？]+$|不明/.test(w1[1])) sayWho[w1[1]] = 1; });
      var bq = spkOn() ? bareQuotes(c) : []; if (spkOn()) { sp1.seen++; sp1.bare += bq.length; }
      var rb = JSON.parse(reqBody), sys = '';
      for (var i = 0; i < rb.messages.length; i++) if (rb.messages[i] && rb.messages[i].role === 'system' && typeof rb.messages[i].content === 'string') { sys = rb.messages[i].content; break; }
      var names = sect(sys, 'whoに使う名前') || sect(sys, 'キャラ属性'), prev = sect(sys, '各キャラの現在の状態');
      var body2 = {}; Object.keys(rb).forEach(function(k){ if (k !== 'messages') body2[k] = rb[k]; });
      body2.max_tokens = bq.length ? 400 + Math.min(300, bq.length * 24) : 400; body2.temperature = 0.2;
      if (cont2On()) body2.max_tokens += 160;   /* ★CONT2 */
      /* r2（実機 fill1: 30 ターンで補完 7 回のうち 4 回が本文に無い内容。うち 2 回は参考に渡した前の状態の写し、2 回は本能の作文）→ 前の状態は渡さない。名前の表だけ渡す。 */
      /* r4: 「名前の表に無い」で判定する（実機 fill3: 宮下 誠は入力の文として system に出ていたため「登録済み」と誤って扱われ、読み取りの対象に入らなかった） */
      var extra = Object.keys(sayWho).filter(function(n){ return names.indexOf(n) < 0; });   /* 登録されていないが、この回に話した人（名前のある新しい人） */
      body2.messages = [ { role: 'system', content: FILL_SYS + (woundOn() ? WOUND_SYS : '') + (cont2On() ? CONT2_SYS + cont2Ask() : '') + (bq.length ? SPK_SYS : '') + '\n' + names + (extra.length ? '\n（この回に話した人）' + extra.join('、') : '') + (prev ? '\n\n（この場面にいる人の名前）\n' + (prev.match(/^・[^｜\n]{1,24}(?=｜)/gm) || []).join('\n') : '') },
                         { role: 'user', content: '本文:\n' + (function(){
                           /* r5: 台詞の印を消すと、誰が話したかが本文から消える（実機 fill3 r4: 宮下 誠は say の印で 2 回話したのに、読み取りに 1 行も出なかった。地の文では姓や役割でしか呼ばれない）。
                              印は「名前「台詞」」の形に直して渡す。<react> と <state> の行は渡さない。 */
                           var c9 = c; if (bq.length) { for (var b9 = bq.length - 1; b9 >= 0; b9--) c9 = c9.slice(0, bq[b9].s) + '【' + (b9 + 1) + '】' + c9.slice(bq[b9].s); }   /* ★SPKFILL1: 印の無い「」に番号 */
                           var t = c9.replace(/<state\b[^>]*>/g, '').replace(/<react\b[^>]*>[\s\S]*?<\/react>/g, '').replace(/<react\b[^>]*\/?>/g, '');
                           t = t.replace(/<say\b[^>]*\bwho\s*=\s*"([^"]{1,24})"[^>]*>\s*([\s\S]*?)\s*<\/say>/g, function(_, w, q){ q = String(q).trim(); return w + (/^[「『]/.test(q) ? q : '「' + q + '」'); });
                           return t.replace(/<\/?say\b[^>]*>/g, '').slice(0, 2600); })() } ];
      return of.apply(self, [u, Object.assign({}, o, { body: JSON.stringify(body2) })]).then(function(r2){
        if (!r2 || !r2.ok) { fs1.fail++; fs1.last = { why: 'http' }; return resp; }
        return r2.text().then(function(t2){
          var j2 = JSON.parse(t2), c2 = j2 && j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content;
          var c2Id = cont2On() ? cont2Sid() : null, c2Now = c2Id ? cont2Turns() : null, c2T = c2Now == null ? 0 : c2Now + 1, c2L = (c2Id && c2Now != null) ? cont2Prune(cont2Load(c2Id), c2Now) : null, c2Ch = false;   /* ★CONT2: この回の番号＝今の本数＋1（本文はまだ積まれていない） */
          var tags = (typeof c2 === 'string' ? (c2.match(/<state\b[^>]*\/>/g) || []) : []).map(function(tg){
            var w = /\bwho\s*=\s*"([^"]{1,24})"/.exec(tg); if (!w) return '';
            /* r6: 姓だけ・名だけの who は、記録にあるフルネームがちょうど 1 人なら、その名前に直す（実機 fill3 r5: 「宮下」の行が「宮下 誠」と別の項目になり、宮下 誠 が古いまま残った） */
            try { var stn = Object.keys(G.__v292Dfix77Store || {}).filter(function(k){ return k !== w[1] && k.split(/[ 　]+/).indexOf(w[1]) >= 0; }); if (stn.length === 1) w[1] = stn[0]; } catch(_){}
            if (sys.indexOf(w[1]) < 0 && !sayWho[w[1]] && !(G.__v292Dfix77Store && G.__v292Dfix77Store[w[1]])) return ''; var hv2 = have[w[1]] || {};
            if (c2L) { try { ct2.take++; if (cont2Take(c2L, w[1], tg, c2T)) c2Ch = true; } catch(_c2){} }   /* ★CONT2 */
            /* r2: 姓だけ・名だけの短い形は足さない（実機: 「宮下」の行が「宮下 誠」と別の項目に入り、一度も送られなかった） */
            try { var esc = w[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (new RegExp(esc + '[ 　][一-龠々ぁ-んァ-ヶー]').test(sys) || new RegExp('[一-龠々ぁ-んァ-ヶー][ 　]' + esc + '(?![一-龠々ぁ-んァ-ヶー])').test(sys)) return ''; } catch(_){}
            var out = '<state who="' + w[1] + '"', n = 0;
            ['からだ', 'こころ'].forEach(function(a){ if (hv2[a]) return;   /* AI が自分で書いた属性は足さない（上書きしない） */
              var m = new RegExp(a + '\\s*=\\s*"([^"]{1,60})"').exec(tg); if (m && !/^[…\.。\s]*$/.test(m[1]) && !/^(?:不明|なし|無し|特になし|その場にいる|—|-)$/.test(m[1].trim()) && !(a === 'こころ' && /[「」『』]|と(?:言|答|告|呟|聞)/.test(m[1]))) {   /* r7: こころに台詞の写しは入れない（GPT #127-YL） */ out += ' ' + a + '="' + m[1] + '"'; n++; } });
            if (woundOn()) { try { var mk = /傷\s*=\s*"([^"]{2,40})"/.exec(tg), stw = G.__v292Dfix77Store && G.__v292Dfix77Store[w[1]];
              if (mk && !hv2['傷'] && !(stw && stw.kizu) && !/^(?:不明|なし|無し|特になし|無傷|けがなし|—|-)$/.test(mk[1].trim()) && /切|裂|刺|折|打|腫|挫|捻|ひね|出血|血|傷|火傷|やけど|痣|あざ|擦|脱臼|骨|噛|咬|撃/.test(mk[1])) { out += ' 傷="' + mk[1].replace(/[<>]/g, '') + '"'; n++; wf1.add++; } else if (mk) wf1.skip++; } catch(_){} }
            return n ? out + '/>' : '';
          }).filter(Boolean).slice(0, 5);
          if (c2L && typeof c2 === 'string') { try { (c2.match(/<end\b[^>]*\/?>/g) || []).forEach(function(tg){ var w9 = /\bwho\s*=\s*"([^"<>]{1,24})"/.exec(tg), k9 = /\bk\s*=\s*"(続き|手)"/.exec(tg); if (!w9 || !k9) return; var e9 = c2L[w9[1]], kk = k9[1] === '続き' ? 'c' : 'h'; if (e9 && e9[kk] && e9[kk].t <= c2Now) { delete e9[kk]; ct2.clear++; ct2.ended = (ct2.ended || 0) + 1; if (!e9.c && !e9.h && !e9.w) delete c2L[w9[1]]; } }); } catch(_c4){} }   /* r4: 前の回からの控えだけを消す（この回に新しく書かれたものは消さない） */
          if (c2L) { try { cont2Save(c2Id, c2L); } catch(_c3){} }   /* ★CONT2 */
          /* ★SPKFILL1: <q n who> を読み、印の無い台詞を <say who> で包む（後ろから置き換える） */
          var cW = c, nW = 0;
          if (bq.length && typeof c2 === 'string') {
            var qs = {}; (c2.match(/<q\b[^>]*\/?>/g) || []).forEach(function(tg){ var n1 = /\bn\s*=\s*"(\d{1,2})"/.exec(tg), w1 = /\bwho\s*=\s*"([^"<>]{1,24})"/.exec(tg); if (n1 && w1) qs[+n1[1]] = w1[1].trim(); });
            var bodyTxt = c.replace(/<[^>]+>/g, '');
            for (var q9 = bq.length - 1; q9 >= 0; q9--) {
              var who9 = qs[q9 + 1]; if (!who9) continue;
              if (/^(?:なし|無し|不明|[?？]+)$/.test(who9)) { sp1.none++; continue; }
              try { var st9 = Object.keys(G.__v292Dfix77Store || {}).filter(function(k){ return k !== who9 && k.split(/[ 　]+/).indexOf(who9) >= 0; }); if (st9.length === 1) who9 = st9[0]; } catch(_){}
              /* q2（実機 Q1: 未登録の老人の台詞 5 枚が、この回の本文に出ていない別の未登録の人「宮下 誠」の札になった）: 名前の表（登録）・この回の印・この回の本文に出る名前だけ。前の回の記録にあるだけの名前は使わない */
              if (!(names.indexOf(who9) >= 0 || sayWho[who9] || bodyTxt.indexOf(who9) >= 0 || who9.split(/[ 　]+/).some(function(pp){ return pp.length >= 2 && bodyTxt.indexOf(pp) >= 0; }))) { sp1.bad++; continue; }
              cW = cW.slice(0, bq[q9].s) + '<say who="' + who9 + '">' + bq[q9].q + '</say>' + cW.slice(bq[q9].e); nW++;
            }
            sp1.wrapped += nW;
          }
          if (!tags.length && !nW) { if (!hasSt) fs1.fail++; fs1.last = { why: 'empty' }; return resp; }
          msg.content = cW.replace(/\s+$/, '') + (tags.length ? '\n' + tags.join('\n') : '');
          if (tags.length) fs1.filled++; fs1.last = { why: 'filled', n: tags.length, spk: nW };
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
      var clOn = ls('v292DfixCLEAN1Off') !== '1';
      if (!story || (!fillOn() && !skOn() && !clOn) || typeof G.Response !== 'function') return p;
      var self = this, sent = o.body;
      return p.then(function(resp){
        if (!resp || !resp.ok) return resp;
        var p2 = (!skOn() && !clOn) ? Promise.resolve(resp) : resp.clone().text().then(function(txt){   /* ★CLEAN1 → ★SAYKEEP1 */
          var j = JSON.parse(txt), msg = j && j.choices && j.choices[0] && j.choices[0].message, c = msg && msg.content;
          if (typeof c !== 'string' || c.length < 20) return resp;
          var c0 = c; if (clOn) { cl1.seen++; c = cleanText(c); if (c !== c0) cl1.fixed++; }
          if (clOn && ls('v292DfixDUP1Off') !== '1') { var cD = dupFix(c); if (cD !== c) { c = cD; cl1.dup = (cl1.dup || 0) + 1; } }   /* ★DUP1 */
          var nc = skOn() ? sayKeepText(c, sent) : null; if (!nc && c === c0) return resp;
          msg.content = nc || c; var h = {}; try { var ct = resp.headers && resp.headers.get && resp.headers.get('content-type'); if (ct) h['content-type'] = ct; } catch(_){}
          return new G.Response(JSON.stringify(j), { status: resp.status, statusText: resp.statusText, headers: h });
        }).catch(function(){ sk1.err++; return resp; });
        return p2.then(function(r1){ try { return fillOn() ? fillOne(self, u, o, sent, r1) : r1; } catch(e){ fs1.err++; return r1; } });
      });
    };
    try { Object.keys(of).forEach(function(k){ w[k] = of[k]; }); } catch(e){}
    w.__fLEAN1 = true; G.fetch = w;
  }
  G.__v292DfixLEAN1 = { VER: 'lean1-20261128-cont2d', on: on, addOn: addOn, list: list, stats: function(){ return st; }, fromBody: fromBody, fill: { on: fillOn, stats: function(){ return fs1; } }, slimMode: slimMode, addText: addText,
    sayKeep: { on: skOn, stats: function(){ return sk1; }, text: sayKeepText }, wound: { on: woundOn, stats: function(){ return wf1; } }, clean: { stats: function(){ return cl1; }, text: cleanText, dup: dupFix }, cont2: { on: cont2On, stats: function(){ return ct2; }, block: cont2Block, take: cont2Take, prune: cont2Prune, ledger: function(){ var id = cont2Sid(); return id ? cont2Load(id) : null; } }, spk: { on: spkOn, stats: function(){ return sp1; }, bare: bareQuotes } };
})();
