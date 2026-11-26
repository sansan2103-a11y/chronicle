// =====================================================================
// Chronicle TRPG - v292DfixCONTRACT1: 今回の場面の契約（会話の順番と確定事実の小さな控え）を user に渡す（実験・既定 OFF）
// ---------------------------------------------------------------------
// 背景（laneCONTRACT1・2026-11-15・GPT #127-UP 最優先）: 「NPC が主人公の代わりに答える」「断られていないのに断られた前提で答える」は、
//   指示（〜せよ）を足しても PRUNE3／BEAT2 のどの腕でも減らなかった。GPT の提案は「誰の返事を待っているか・何が確定しているか」を
//   状況の事実として数行で渡すこと。PLACE1 の whereNow と同じく、毎回コードが作り直す短い欄（保存しない・sys は増やさない）。
// 中身（どれも「確実に言える時だけ」。疑わしければ出さない。何も言えない回は欄ごと出さない）:
//   1 直前のやり取り: 直前の回の会話カード（_convSays）のうち、由来が <say> タグか主人公の入力のもの（_convSayMeta の sourceKind が say-tag／hero-utterance。
//     裸の「」から推した話者・昇格・由来の記録が無いもの・_b/_bw は使わない）の最後の 1〜2 台詞（各 30 字まで）。
//   2 まだ返事が出ていない相手: 直前の回の最後の問い・頼み（「？」・〜ですか／〜ませんか／〜のか／〜てくれ／〜てください 等の確実な形）の相手が
//     呼びかけ（登録名＋さん／ちゃん・あんたら 等）で決まり（呼びかけが無ければ出さない）、その後に相手の台詞が無いとき。相手が主人公（を含む複数人）なら
//     「主人公の返事はプレイヤーが決める」、今回の入力が台詞なら「今回の入力が主人公の返事」。
//   3 断った・引き受けた: 頼み → その相手の明示の拒否／承諾（決まった言い方だけ）があったときだけ、いちばん新しいもの 1 行。無いときは書かない。
//   4 設定で確定した関係・出自: 主人公と登録 NPC の desc から、関係・出自の語（孫・娘・幼なじみ・初対面・転校・生まれ 等）を含む文だけ、2 行まで。
//     「実は・隠し・秘密・正体・知らない」等の印がある文は使わない。人物が何を知り得るかの推測はしない。
// 置き場所: user の JSON に "sceneContract": { rule, items } を whereNow（無ければ nowScene）の直後に足す（fetch 境界・HEROVOICE1 の直後に読む）。
//   直前の回は user の recentScenes の最後の本文と S.turns の本文が一致したときだけ使う（再生成などで食い違えば出さない）。
// 鍵: localStorage v292DfixCONTRACT1On='1' で ON（既定 OFF）。v292DfixCONTRACT1Off='1' は On より強い。読めない → 何もしない。毎回評価。
// 検証口: window.__v292DfixCONTRACT1 = { VER, build, contractFromBody, last, stats }。last() は各行の根拠（どの台詞・desc の文か・30 字まで）。
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixCONTRACT1) return;
  var TAG = '[v292DfixCONTRACT1]', VER = 'contract1-20261116-r2';
  function r2on(){ return ls('v292DfixCONTRACT1R2Off') !== '1'; }   /* ★r2（GPT #127-UR）: '1' で r1 と同じ規則に戻す。毎回評価 */
  function ls(k){ try { return G.localStorage.getItem(k); } catch(e){ return '__ERR__'; } }
  function on(){ var o = ls('v292DfixCONTRACT1Off'); if (o === '__ERR__' || o === '1') return false; return ls('v292DfixCONTRACT1On') === '1' || acct1('contract1'); }
  function expOn(){ var o = ls('v292DfixCONTRACT1ExpOff'); return o !== '1' && o !== '__ERR__'; }   /* 20261126-expqon: 同じ場面の引き直し 12 回（OFF 6・ON 6 交互）で 教え手を正しく答えた回 OFF 4/6・ON 6/6、台詞への写り込み 0 → 既定 ON（CONTRACT1 が働くアカウントだけ） */
  function pressOn(){ var o = ls('v292DfixPRESS1On'); return o === '1'; }
  function pressKey(){ try { var k = G.__chronicleDocumentStoryKey; return k ? 'v292DfixPRESS1_' + String(k) : ''; } catch(e){ return ''; } }
  function pressGet(){ try { var k = pressKey(); if (!k) return []; var a = JSON.parse(G.sessionStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function pressSet(who, p, kind){ try { var k = pressKey(); if (!k || !who) return false; kind = kind === 'l' ? 'l' : 'p'; var a = pressGet().filter(function(x){ return x && !(x.who === who && (x.k || 'p') === kind); }); if (p) a.push({ who: String(who), p: String(p), k: kind }); if (a.length) G.sessionStorage.setItem(k, JSON.stringify(a)); else G.sessionStorage.removeItem(k); return true; } catch(e){ return false; } }   /* press1b: 引数名が物語の鍵の変数と重なり、鍵 'p'/'l' に書いていた誤りを修正 */
  var EXPQ_ASK = /誰に|誰から|だれに|だれから|どなたに|どなたから|教わ|習っ|習い|教えてもら/;
  var EXPQ_RE = /^(.{1,14}?)(から|に)(.{2,24}?)(?:を|の)?(?:教わった|教わる|習った|教えてもらった|見せてもらった|見せられた|教えられた|手ほどきを受けた)$/;
  function acct1(n){ try { var A = G.__v292DfixACCT1; return !!(A && typeof A.want === 'function' && A.want(n) === true); } catch(e){ return false; } }   /* ★ACCT1 r3: Owner のアカウントなら端末の鍵が無くても PC と同じ */

  var RULE = 'sceneContract は、直前の会話の順番と、設定で確定した事実の控え。食い違わせないためだけに使い、本文や台詞に写さない。';
  var MAXQ = 30, MAXLINE = 90, MAXITEMS = 6, MAXCHARS = 320;
  function q(s){ s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > MAXQ ? s.slice(0, MAXQ) + '…' : s; }
  function lastSentence(s){
    var t = String(s || '').replace(/[」』\s]+$/, '').replace(/[…‥・]+$/, '');
    var parts = t.split(/(?<=[。！？!?])/).map(function(x){ return x.trim(); }).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : t;
  }
  function sentences(s){ return String(s || '').split(/(?<=[。！？!?])/).map(function(x){ return x.replace(/[」』\s]+$/, '').trim(); }).filter(Boolean); }
  var RE_Q = /(?:[？?]|(?:ですか|ますか|ませんか|でしょうか|のか|んか|かね|かい|だろうか)[。…]*|^(?!(?:そう|そっ|ほう|なるほど|まあ|そりゃ|あ|え|ふん)か)[^。]{3,}[^そっ]か[。…]*)$/;
  /* ★r2: 「か」で終わらない疑問詞の問い（「どこの子だ」「誰に頼んだんだ」）。疑問詞＋か／も／でも（何か・誰も・何でも）は除く・「なんだ」（＝のだ）は疑問詞にしない・25 字まで */
  var RE_QWH = /^(?=[^。]{0,25}$)(?:.*?)(?:どこ|誰|だれ|何|なに|なんで|なんて|なぜ|どうして|いつ|どれ|どっち|どちら|いくつ|いくら)(?!か|も|でも|だか|とか)[^。]*(?:だ|だい|の|んだ|んだい)[。…]*$/;
  var RE_REQ = /(?:てくれ|てくれよ|てくれないか|てくれませんか|てください|て下さい|てほしい|て欲しい|ていただけませんか|てもらえませんか|てもらえないか|お願いします|お願いです|お願い)[。！!…]*$/;
  var GROUP = /(あんたら|あんたたち|あんた方|お前さんたち|お前さんら|お前ら|おまえら|お二人|おふたり|二人とも|ふたりとも|三人とも|皆さん|みなさん|みんな|あなたたち|あなた方|君たち|きみたち|お前たち|おまえたち)/;
  var RE_REFUSE = /(?:断る|お断りだ|お断りします|お断りや|(?:出さ|出せ|貸さ|貸せ|通さ|通せ|入れ|乗せ|乗せられ|教えられ|教え|でき)(?:ん|ない|ません|ねぇ|ねえ)|無理だ|無理です|だめだ|駄目だ|ダメだ)(?:よ|ぞ|な|ね|わ|って)*[。！!…]*$/;
  var RE_ACCEPT = /(?:^(?:いいだろう|よかろう|いいですよ|構わん|かまわん|引き受け)|(?:出し|乗せ|連れて行っ|連れてっ|案内し|貸し)てやる(?:よ|ぞ|わ)?[。！!]*$|引き受けます|引き受けた|任せろ|任せとけ)/;
  var COND = /(ただし|なら|けど|けれど|だが|でも|条件|それより|考えて|かもしれ)/;
  var REL = /(孫|娘|息子|祖母|祖父|父親|母親|兄|姉|弟|妹|幼なじみ|幼馴染|同級生|同僚|初対面|初めて|転校|生まれ|出身|育ち|よそ者|知り合い|元用務員|卒業生|親戚|夫|妻|恋人|上司|部下|教え子|恩師|島の外|都会)/;
  var HIDDEN = /(実は|隠し|隠す|秘密|内緒|明かさ|明かして|知らない|知られ|正体|本当は|ふりを|偽)/;
  var STYLE = /(一人称|口調|丁寧語|ため口|方言|呼ぶ|呼び捨て|と呼|話し方)/;

  // ---- 純粋関数: ctx = { hero:{name,desc}, npcs:[{name,desc}], turns:[{type,text,says:[{who,say,bare}]}] (直前の回まで), cur:{type,text} }
  function build(ctx){
    var items = [], ev = [];
    if (!ctx || !ctx.hero || !ctx.hero.name || !Array.isArray(ctx.turns) || !ctx.turns.length) return { items: items, ev: ev };
    var hero = ctx.hero.name, npcs = (ctx.npcs || []).filter(function(n){ return n && n.name; }), names = [hero].concat(npcs.map(function(n){ return n.name; }));
    function reg(w){ return names.indexOf(w) >= 0; }
    function heroLbl(){ return '主人公（' + hero + '）'; }
    function lbl(w){ return w === hero ? heroLbl() : w; }
    var T = ctx.turns, ti = T.length - 1, prev = T[ti];
    var says = (prev.says || []).filter(function(c){ return c && c.say && String(c.say).trim(); });
    var sure = says.filter(function(c){ return !c.bare && reg(c.who); });

    // ---- 2: まだ返事が出ていない相手 ----
    // 呼びかけ: 台詞の頭か、問い・頼みの文の頭に「名前（＋さん等）、」「あんたら、」等があるときだけ。文の途中の名前（「澄ちゃんの二人です」）は呼びかけにしない。
    var NICK = {};   // desc の「X を「Y」と呼ぶ」から、話し手ごとの呼び名 → 登録名（設定で確定した呼び方だけ）
    npcs.concat([ctx.hero]).forEach(function(p){ var re = /([^、。「」\s]{1,12})を「([^」]{1,10})」[^。]{0,8}と呼/g, m; while ((m = re.exec(String(p.desc || '')))){ if (reg(m[1])) (NICK[p.name] = NICK[p.name] || {})[m[2]] = m[1]; } });
    var SUF = '(?:さん|ちゃん|くん|君|先輩|ねえ|姉ちゃん|兄ちゃん)?';
    function headOf(x){ return String(x || '').replace(/^[「『…‥・\s]+/, ''); }
    /* ★r2: 頭の感動詞（おう、／なあ、 等）を外して見る・「凪か」（名前＋か）も呼びかけに数える */
    var INTJ = /^(?:おお|ああ|おや|やあ|あら|ほう|おう|まあ|ねえ|なあ|おい|よう|ほら)[、…\s]*/;
    var UNREG = /^(?:嬢ちゃん|お嬢さん|お嬢ちゃん|兄ちゃん|姉ちゃん|あんた|お前さん|お前|おまえ|君|きみ|あなた|坊主|坊)[、。！!…]/;
    function vocAt2(x, speaker){
      var h = headOf(x).replace(INTJ, '');
      var v = vocAt(h, speaker); if (v) return v;
      for (var i = 0; i < names.length; i++){ var n = names[i]; if (n === speaker) continue;
        if (new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + SUF + 'か(?:[。！!…]|$)').test(h)) return { name: n, word: n + 'か' }; }
      return null;
    }
    /* ★r2: 問いの文に呼びかけが無いとき、同じ話し手が続けて話している間（この回の中・ほかの人の台詞を挟まない）に
       頭で呼びかけた相手がちょうど 1 人で、途中に別の呼びかけ（登録外の「嬢ちゃん、」「あんた、」等も含む）が無ければ、その人を相手とする */
    function isRecog(x, speaker){ var h = headOf(x).replace(INTJ, ''); return names.some(function(n){ return n !== speaker && new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + SUF + 'か[。！!…]*$').test(h); }); }
    function runAddressee(c, idx, list){
      var found = [], bad = false, grp = null;
      for (var j = idx; j >= 0; j--){
        var d = list[j]; if (!d || d.who !== c.who) break; if (d.bare) { bad = true; break; }
        var ss = sentences(d.say);
        ss.forEach(function(x){ var h = headOf(x).replace(INTJ, ''); if (UNREG.test(h)) bad = true;
          var v = vocAt2(x, c.who); if (v && v.group) grp = v.word; else if (v && found.indexOf(v.name) < 0) found.push(v.name);
          else if (!v && GROUP.test(h.slice(0, 8))) bad = true; });
      }
      if (bad) return null;
      if (grp && !found.length) return { to: names.filter(function(n){ return n !== c.who; }), how: '同じ話し手の続きの頭の呼びかけ「' + grp + '」', group: true };   // 「お前さんたち、…か」の続きの問い
      if (grp || found.length !== 1) return null;
      return { to: [found[0]], how: '同じ話し手の続きの頭の呼びかけ「' + found[0] + '」' };
    }
    function vocAt(x, speaker){
      var h = headOf(x), gm = h.match(new RegExp('^' + GROUP.source + '[、。！!…？?\\s]'));
      if (gm) return { group: true, word: gm[1] };
      for (var i = 0; i < names.length; i++){ var n = names[i]; if (n === speaker) continue;
        var mm = h.match(new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + SUF + '[、。！!…？?\\s]+'));
        if (mm && !/^(?:という|って|とは|は|も|の)/.test(h.slice(mm[0].length))) return { name: n, word: n }; }   // 「結衣、というのは」は名前の話（呼びかけでない）
      var nk = NICK[speaker] || {}; for (var y in nk){ if (h.indexOf(y) === 0 && /^[、。！!…？?\s]/.test(h.slice(y.length))) return { name: nk[y], word: y }; }
      return null;
    }
    function addressees(c, idx, list){
      var ss = sentences(c.say), lastS = ss[ss.length - 1] || '', v = vocAt(lastS, c.who) || vocAt(c.say, c.who);
      if (!v && ctx.r2){
        if (UNREG.test(headOf(lastS).replace(INTJ, ''))) return null;   // 問いの文の頭が登録外の呼びかけ（嬢ちゃん、等）→ 相手を決めない
        v = vocAt2(lastS, c.who); if (!v) return runAddressee(c, idx, list);   // 台詞の頭の呼びかけも、続きの中に別の呼びかけが無いかを見てから使う
      }
      if (!v) return null;   // 呼びかけが無い問いは相手を決めない（直前の話し手を相手と見なすと誤る実例があった）
      if (v.group) return { to: names.filter(function(n){ return n !== c.who; }), how: '呼びかけ「' + v.word + '」', group: true };
      return { to: [v.name], how: '呼びかけ「' + v.word + '」' };
    }
    var pending = null;
    if (sure.length && says[says.length - 1] === sure[sure.length - 1]){
      // 最後の確定台詞から後ろ向きに、最後の問い・頼みを探す（その後ろに台詞が 1 つまで）
      for (var k = says.length - 1; k >= Math.max(0, says.length - 2); k--){
        var c = says[k]; if (c.bare || !reg(c.who)) break;
        var ls1 = lastSentence(c.say), kind = (RE_Q.test(ls1) || (ctx.r2 && RE_QWH.test(ls1.replace(INTJ, '')))) ? '問い' : (RE_REQ.test(ls1) ? '頼み' : null);
        if (ctx.r2 && kind && isRecog(ls1, c.who)) kind = null;   // ★r2: 「おお、凪か」（名前＋か）は相手が誰かの確かめ＝問いにしない
        if (!kind) continue;
        var a = addressees(c, k, says); if (!a) break;
        var later = says.slice(k + 1);
        if (later.some(function(x){ return a.to.indexOf(x.who) >= 0; })) break;          // 相手がもう答えた
        if (later.length > 1) break;
        pending = { by: c.who, to: a.to, kind: kind, say: c.say, how: a.how, group: !!a.group, idx: k };
        break;
      }
    }
    if (pending){
      var toHero = pending.to.indexOf(hero) >= 0, others = pending.to.filter(function(n){ return n !== hero; });
      var head = pending.by + 'の' + pending.kind + '「' + q(lastSentence(pending.say)) + '」';
      var line;
      if (toHero){
        if (ctx.cur && ctx.cur.type === 'SAY' && ctx.cur.text) line = head + 'のあと、' + heroLbl() + 'の最初の台詞は今回の入力。';
        else line = head + 'への' + heroLbl() + 'の返事はまだ入力されていない（返事はプレイヤーが決める）。';
      } else line = head + 'への' + others.join('・') + 'の返事は、まだ出ていない。';
      items.push(line); ev.push({ item: 'pending', turn: ti + 1, by: pending.by, to: pending.to, how: pending.how, quote: q(pending.say) });
    }

    // ---- 1: 直前のやり取り（最後の 1〜2 台詞・話者が確定したものだけ） ----
    /* ★r2: 最後のカード 1 枚だけが話者の確定しない台詞（問い・頼みの形でない）なら、その前の確定した台詞を出し、その後に 1 つあると書き添える */
    var trail = 0, sayEnd = says;
    if (ctx.r2 && says.length >= 2 && says[says.length - 1] !== sure[sure.length - 1]){
      var lc = says[says.length - 1], lcs = lastSentence(lc.say);
      if ((lc.bare || !reg(lc.who)) && !RE_Q.test(lcs) && !RE_QWH.test(lcs) && !RE_REQ.test(lcs) && says[says.length - 2] === sure[sure.length - 1]){ trail = 1; sayEnd = says.slice(0, -1); }
    }
    if (sure.length && sayEnd[sayEnd.length - 1] === sure[sure.length - 1]){
      var tail = sure.slice(-2), last2 = sayEnd.slice(-2);
      if (tail.length === 2 && (last2[0] !== tail[0])) tail = tail.slice(-1);
      var seg = tail.map(function(c){ return lbl(c.who) + '「' + q(c.say) + '」'; }).join(' → ') + (trail ? '（このあとに話者の確定していない台詞が 1 つ）' : '');
      if (!pending || tail.length === 2 || tail[0].say !== pending.say){
        items.unshift('直前の回の終わりの台詞：' + seg);
        ev.push({ item: 'last', turn: ti + 1, quotes: tail.map(function(c){ return c.who + ':' + q(c.say); }) });
      }
    }

    // ---- 3: 断った・引き受けた（いちばん新しいもの 1 つ） ----
    var ask = null, fact = null;
    T.forEach(function(t, i){
      (t.says || []).forEach(function(c, j, list){
        if (!c || c.bare || !reg(c.who) || !c.say) return;
        var ss = sentences(c.say), last = ss[ss.length - 1] || '';
        if (ask && c.who !== ask.by && (ask.to ? ask.to.indexOf(c.who) >= 0 : ask.next === c)){
          var amb = COND.test(c.say), ref = !amb && ss.some(function(x){ return RE_REFUSE.test(x); }), acc = !amb && !ref && ss.some(function(x){ return RE_ACCEPT.test(x); });
          if (ref || acc){ var hitS = ss.filter(function(x){ return ref ? RE_REFUSE.test(x) : RE_ACCEPT.test(x); }).pop(); fact = { who: c.who, kind: ref ? '断った' : '引き受けた', ask: ask, turn: i + 1, quote: q(hitS || c.say), ti: i, sj: j }; return; }   // 頼みは生かしたまま（同じ頼みへの後の返事で上書きする）
          if (amb) { fact = null; ask = null; return; }   // 条件つき・あいまいな返事 → それまでの事実も使わない
        }
        if (RE_REQ.test(last)){
          var a = addressees(c, j, list);
          ask = { by: c.who, to: a ? a.to : null, text: last, turn: i + 1, next: list[j + 1] || null };
        }
      });
    });
    // 直前の回の、その人の最後の台詞が拒否／承諾のときだけ出す（その後に話が動いていれば古い事実になり得るので出さない）
    if (fact && fact.ti === ti && !(T[ti].says || []).slice(fact.sj + 1).some(function(x){ return x && x.who === fact.who; }) && fact.ask){
      items.push(lbl(fact.who) + 'は、' + lbl(fact.ask.by) + 'の頼み「' + q(fact.ask.text) + '」を' + fact.kind + '（' + fact.turn + 'ターン目「' + q(fact.quote) + '」）。');
      ev.push({ item: 'decision', who: fact.who, kind: fact.kind, askBy: fact.ask.by, askTurn: fact.ask.turn, turn: fact.turn, quote: fact.quote });
    }

    // ---- 4: 設定で確定した関係・出自（2 行まで） ----
    var rel = [];
    var near = []; ev.forEach(function(e){ [e.by].concat(e.to || [], (e.quotes || []).map(function(x){ return x.split(':')[0]; })).forEach(function(n){ if (n && near.indexOf(n) < 0) near.push(n); }); });
    var order = [ctx.hero].concat(npcs.filter(function(n){ return near.indexOf(n.name) >= 0; }), npcs.filter(function(n){ return near.indexOf(n.name) < 0; }));
    order.forEach(function(p){
      if (rel.length >= 2 || !p || !p.desc) return;
      var ss = String(p.desc).split(/(?<=[。])/).map(function(x){ return x.trim(); }).filter(Boolean);
      var hit = ss.filter(function(x){ return REL.test(x) && !HIDDEN.test(x) && !STYLE.test(x) && x.length <= 60; });
      if (!hit.length) return;
      var txt = hit.join('').replace(/。$/, '');
      if (txt.length > 60) txt = hit[0].replace(/。$/, '');
      rel.push((p.name === hero ? heroLbl() : p.name) + '：' + txt); ev.push({ item: 'relation', who: p.name, from: 'desc', quote: q(txt) });
    });
    rel.forEach(function(x){ items.push(x); });

    // ---- ★EXPQ（2026-11-26・GPT #127-XZ 案 D＋E・既定 OFF: localStorage v292DfixCONTRACT1ExpOn='1'・kill v292DfixCONTRACT1ExpOff='1'）----
    //   実 AI の実測: 経験の行（sys の末尾）が毎ターン届いていても、「誰に教わったんだっけ」と聞くと AI は新しい過去を作る。
    //   → 聞かれた回だけ、話しかけた相手の「教わった」経験 1 件を、確定した事実としてこの控えの先頭に入れる。
    //   条件: 入力に「誰に・誰から・教わ・習」等の語がある／話しかけた相手（登録人物）が 1 人に決まる／その人の確認済みの経験（EXP1 が門を通した記録）の題材が入力にある。
    //   どれか 1 つでも決まらなければ何も足さない。禁止文は足さない。
    try {
      if (expOn() && ctx.cur && ctx.cur.text && EXPQ_ASK.test(String(ctx.cur.text))) {
        var txq = String(ctx.cur.text), NH = G.__v292Dfix333api && G.__v292Dfix333api.nameHit, EX = G.__v292DfixEXP1;
        if (typeof NH === 'function' && EX && typeof EX.expOf === 'function') {
          var addr = npcs.map(function(n){ return n.name; }).filter(function(nm){ return NH(txq, nm, names) === 2; });
          if (addr.length === 1) {
            var who = addr[0], tn = txq.replace(/[\s　、。，．,.「」『』（）()！？!?…]+/g, ''), best = null;
            EX.expOf(who).forEach(function(x){ if (x.k !== 'taught') return; var m = EXPQ_RE.exec(String(x.s)); if (!m) return;
              var topic = m[3].replace(/[\s　]+/g, ''), hits = 0; for (var i = 0; i + 3 <= topic.length; i++){ var g3 = topic.slice(i, i + 3); if (/[一-鿿々ァ-ヶ]/.test(g3) && tn.indexOf(g3) >= 0) hits++; }
              if (hits >= 1 && (!best || hits > best.hits)) best = { hits: hits, x: x, teacher: m[1], topic: m[3] }; });
            if (best) {
              var short = who.split(/[\s　]+/).filter(Boolean).pop() || who;
              var line = 'T' + (best.x.t + 1) + '：' + best.teacher + 'が' + short + 'に' + best.topic + 'を教えた。' + short + 'は' + best.teacher + 'から指導を受けた。技能の習得は未確認。';
items.unshift(line); ev.push({ item: 'expq', who: who, turn: best.x.t + 1, quote: q(best.x.s) }); stats.expq = (stats.expq || 0) + 1;
            } else stats.expqNoTopic = (stats.expqNoTopic || 0) + 1;
          } else stats.expqNoAddr = (stats.expqNoAddr || 0) + 1;
        }
      }
    } catch (eXQ) {}

    // ---- ★PRESS1（2026-11-26・試験用・既定 OFF: localStorage v292DfixPRESS1On='1'）----
    //   「本心」と「行動」のずれを保つための事実 1 行。人物が何に強いられて動いているか（圧力）を、確定した事実として控えの先頭に入れる。
    //   記録は試験の間だけ sessionStorage（物語ごと）に置く。保存データ・sys には触れない。入れ方: __v292DfixCONTRACT1.press.set(名前, '圧力の中身')
    //   形 h（既定・GPT #127-YG）= 事実＋「従う行動だけから本心の変化を推定しない」。比較用に v292DfixPRESS1Mode='f'（本心は変わっていない）・'g'（＋ずれは残る）。体の事実は種類 'l'。演技の指示（苦しそうに 等）は書かない。
    try {
      if (Array.isArray(ctx.press) && ctx.press.length) {
        var pl = [];
        ctx.press.forEach(function(p){
          if (!p || !p.who || !p.p || names.indexOf(p.who) < 0 || pl.length >= 2) return;
          var w = p.who === hero ? heroLbl() : p.who;
          var ln;
          if (p.k === 'l') ln = w + 'の今の体：' + String(p.p).slice(0, 70) + '。';   /* 体の限界＝できること・できないことの事実だけ */
          else if (ctx.pressMode === 'f' || ctx.pressMode === 'g') { ln = w + 'への圧力：' + String(p.p).slice(0, 60) + '。従うのは強いられているからで、納得や同意ではない。本心は変わっていない。';
            if (ctx.pressMode === 'g') ln += '従う間も、本心とのずれは残る。'; }
          else ln = w + 'への圧力：' + String(p.p).slice(0, 60) + '。従う行動だけから、納得・同意・本心の変化を推定しない。';   /* 形 h（既定・GPT #127-YG）: 誤った推定だけを止める。本心は固定しない */
          pl.push(ln); ev.push({ item: 'press', who: p.who, mode: ctx.pressMode || 'f' });
        });
        for (var pi = pl.length - 1; pi >= 0; pi--) items.unshift(pl[pi]);
        if (pl.length) stats.press = (stats.press || 0) + 1;
      }
    } catch (ePR) {}

    // ---- 上限 ----
    var out = [], n = 0;
    items.forEach(function(x){ x = x.length > MAXLINE + 40 ? x.slice(0, MAXLINE + 39) + '…' : x; if (out.length < MAXITEMS && n + x.length <= MAXCHARS){ out.push(x); n += x.length; } });
    if (stats.press && items.length > out.length) stats.pressDrop = (stats.pressDrop || 0) + (items.length - out.length);   /* 圧力の行が他の項目を押し出した数 */
    return { items: out, ev: ev };
  }

  // ---- 実行時: body から ctx を作る ----
  function stateOf(){ try { return typeof G.__chronicleGetState === 'function' ? G.__chronicleGetState('contract1') : null; } catch(e){ return null; } }
  function narrOf(t){ var n = t && t.narrative; return Array.isArray(n) ? n.join('\n') : String(n || ''); }
  function ctxFrom(userObj, S){
    if (!S || !S.cast || !S.cast.hero || !Array.isArray(S.turns) || !S.turns.length) return null;
    var rs = userObj.recentScenes; if (!Array.isArray(rs) || !rs.length) return null;
    var lastN = rs[rs.length - 1] && rs[rs.length - 1].narrative; if (typeof lastN !== 'string' || !lastN) return null;
    var k = -1; for (var i = S.turns.length - 1; i >= 0; i--){ if (narrOf(S.turns[i]) === lastN){ k = i; break; } }
    if (k < 0) return null;                                                     // 直前の回が特定できない → 出さない
    var turns = S.turns.slice(0, k + 1).map(function(t){ return { type: t.inputType || null, text: t.playerText || '',
      says: (Array.isArray(t._convSays) ? t._convSays : []).map(function(c, j){
        // 話者が確定した台詞だけ使う: 由来（fix616 の _convSayMeta）が <say> タグそのもの（say-tag）か主人公の入力（hero-utterance）。
        // 裸の「」から推した話者（bare-inferred）・昇格（say-tag-promoted）・由来の記録が無いもの・_b/_bw は「確定でない」扱い。
        var mt = Array.isArray(t._convSayMeta) ? t._convSayMeta[j] : null, kind = mt && mt.sourceKind;
        var sure = !!(c && !c._b && !c._bw && mt && (kind === 'say-tag' || kind === 'hero-utterance'));
        return { who: c && c.who, say: c && c.say, bare: !sure }; }) }; });
    var ci = userObj.currentInput || {};
    return { r2: r2on(), hero: { name: S.cast.hero.name, desc: S.cast.hero.desc || '' }, npcs: (S.cast.npcs || []).map(function(n){ return { name: n && n.name, desc: n && n.desc || '' }; }),
      turns: turns, cur: { type: ci.type || null, text: ci.text || '' }, press: pressOn() ? pressGet() : null, pressMode: (function(){ var m = ls('v292DfixPRESS1Mode'); return m === 'f' || m === 'g' ? m : 'h'; })() };
  }
  var last = null, stats = { seen: 0, added: 0, empty: 0, skip: 0, err: 0 };
  function contractFromBody(body){
    if (!on() || typeof body !== 'string' || body.indexOf('protagonist') < 0) return body;
    var b = JSON.parse(body); if (!b || !Array.isArray(b.messages)) return body;
    var ui = -1; for (var i = b.messages.length - 1; i >= 0; i--){ var m = b.messages[i]; if (m && m.role === 'user' && typeof m.content === 'string' && m.content.indexOf('"protagonist"') >= 0){ ui = i; break; } }
    if (ui < 0) return body;
    var u = b.messages[ui].content, cut = u.indexOf('\n\n━'), head = cut < 0 ? u : u.slice(0, cut), tail = cut < 0 ? '' : u.slice(cut);
    var o; try { o = JSON.parse(head); } catch(e){ stats.skip++; return body; }
    if (!o || o.sceneContract || JSON.stringify(o, null, 2) !== head){ stats.skip++; return body; }   // 形が想定と違う → 触らない
    stats.seen++;
    var ctx = ctxFrom(o, stateOf()); if (!ctx){ stats.skip++; last = { t: Date.now(), items: [], why: 'no-prev-turn' }; return body; }
    var r = build(ctx);
    last = { t: Date.now(), items: r.items, ev: r.ev };
    if (!r.items.length){ stats.empty++; return body; }
    var n = {}, put = false, anchor = o.whereNow ? 'whereNow' : (o.nowScene ? 'nowScene' : null);
    Object.keys(o).forEach(function(key){
      if (!put && !anchor && key === 'deltaInstruction'){ n.sceneContract = { rule: RULE, items: r.items }; put = true; }
      n[key] = o[key];
      if (key === anchor){ n.sceneContract = { rule: RULE, items: r.items }; put = true; }
    });
    if (!put) n.sceneContract = { rule: RULE, items: r.items };
    b.messages[ui].content = JSON.stringify(n, null, 2) + tail;
    stats.added++;
    return JSON.stringify(b);
  }
  // ---- ★LEAN1（2026-11-26・試験専用・既定 OFF: localStorage v292DfixLEAN1On='1'・GPT #127-YJ「足す前に引く」）----
  //   system の見出し（【…】）のうち「表現の制限」に当たるものを、送信の直前に外す。事実の保護（状態・呼称・話者・居場所）と出力形式の決まりは残す。
  //   外す見出しは v292DfixLEAN1Drop（「|」区切り・見出しの先頭の一致）で差し替えられる。未設定なら下の既定。保存データ・既定の送信には触れない。
  var LEAN_DEF = ['良い1ターンの形', '展開を前に進める', '書き方の見本', '反応と身体', 'ダッシュ', '読ませ方', '表記', '文体の基本ルール', 'NPCの登場', '展開の推進ルール', '描写の作り方'];
  var leanStats = { seen: 0, cut: 0, last: null };
  function leanOn(){ return ls('v292DfixLEAN1On') === '1'; }
  function leanList(){ var v = ls('v292DfixLEAN1Drop'); if (v && v !== '__ERR__') { var a = String(v).split('|').map(function(x){ return x.trim(); }).filter(Boolean); if (a.length) return a; } return LEAN_DEF; }
  function leanFromBody(body){
    if (typeof body !== 'string' || body.indexOf('protagonist') < 0) return body;
    var b = JSON.parse(body); if (!b || !Array.isArray(b.messages)) return body;
    var si = -1; for (var i = 0; i < b.messages.length; i++){ var m = b.messages[i]; if (m && m.role === 'system' && typeof m.content === 'string' && m.content.indexOf('\n\n【') >= 0){ si = i; break; } }
    if (si < 0) return body;
    leanStats.seen++;
    /* 見出しは行頭の【…】。前の区切り（改行 1 個以上）ごと持って分け、外す見出しはその区切りと一緒に落とす（残す部分は 1 字も変えない） */
    var drop = leanList(), src = b.messages[si].content, parts = src.split(/(\n+)(?=【[^】\n]{1,90}】)/), out = parts[0], cut = [], before = src.length;
    for (var k = 1; k + 1 < parts.length; k += 2){
      var sep = parts[k], p = parts[k + 1], h = /^【([^】\n]{1,90})】/.exec(p), name = h ? h[1] : '';
      if (name && drop.some(function(d){ return name.indexOf(d) === 0; })) cut.push(name.slice(0, 20)); else out += sep + p;
    }
    if (!cut.length) return body;
    b.messages[si].content = out;
    leanStats.cut++; leanStats.last = { cut: cut, before: before, after: b.messages[si].content.length };
    return JSON.stringify(b);
  }
  var of = G.fetch;
  if (typeof of === 'function'){
    var wrapped = function(u, o){
      try { if (on() && o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))){ var nb = contractFromBody(o.body); if (nb !== o.body) o = Object.assign({}, o, { body: nb }); } }
      catch(e){ stats.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch(_){} }
      try { if (leanOn() && o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))){ var lb = leanFromBody(o.body); if (lb !== o.body) o = Object.assign({}, o, { body: lb }); } } catch(eL){ try { console.warn(TAG, 'lean skipped:', eL && eL.message); } catch(_){} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function(k){ wrapped[k] = of[k]; }); } catch(e){}
    wrapped.__fCONTRACT1 = true; G.fetch = wrapped;
  }
  G.__v292DfixCONTRACT1 = { VER: VER, build: build, contractFromBody: contractFromBody, last: function(){ return last; }, stats: function(){ return stats; }, press: { on: pressOn, get: pressGet, set: pressSet }, lean: { on: leanOn, list: leanList, stats: function(){ return leanStats; }, fromBody: leanFromBody } };
  try { console.log(TAG, 'armed', VER); } catch(e){}
})();
