// =====================================================================
// Chronicle TRPG - v292DfixPLACE1: 物の持ち主・置き場所と、その場にいない人の「いまの控え」を user に 1 欄で渡す
// ---------------------------------------------------------------------
// lanePLACE1（2026-11-14・LOCAL 試作・未出荷）。
// 現象（QAB 盲検 18 本・PLAY1）: 受け取った鍵束を次のターンで元の持ち主が握っている／扉に挿した鍵が人のポケットから出る／
//   昇降口へ送った人が説明なく同じ部屋にいる／12 ターン目の確認で「誰から受け取ったか・どこにあるか」を作り変える。
// 送信の実測（rig）: 物の持ち主・置き場所を「いまの値」として渡す欄が無い。あるのは
//   recentScenes（直近 2 ターンの本文）・earlierFacts（3 ターン以上前の入力の控え＝出来事の並び。80 字で切れる）・
//   【各キャラの現在の状態】（からだ 等。AI が書いた <state> の写しで、古い「鍵束を握り」が残る／間違いもそのまま載る）。
//   入力と本文が食い違ったとき、どちらが正しいかを言う欄も無い。
// 直し（鍵 v292DfixPLACE1On='1'・既定 OFF＝送信バイト同一・毎回評価。kill v292DfixPLACE1Off='1' が常に優先）:
//   その回の S.turns から毎回作る（保存しない・AI を呼ばない・sys 0 字・本文もカードも変えない）。
//   ・プレイヤーの入力（DO・STORY。SAY は読まない）から、決まった言い方だけを拾う（迷えば拾わない）:
//       渡す・預ける・返す・持たせる／〜から受け取る／〜に入れる・しまう・置く・挿したまま／持って・拾う／落とす
//       〜を〜に残し／〜に〜を〜まで送ってもらう／〜へ行く・戻る（主人公の移動）／（STORY）〜が去っていく・〜へ戻る
//   ・本文（地の文）からは、登録名どうしの「A が X を B に渡した／返した」「A が B から X を受け取った」「A が X を〜に置いた」と、
//     控えにある物の「A が X を落とした」だけを拾う（落とした行は 2 ターンだけ出し、その後はその物の行を出さない）
//     （v292DfixPLACE1NarrOff='1' でここだけ止まる）。
//   ・同じ物は新しい行で置き換える（古い所在の行は消える）。主人公がその場所へ戻る／後の入力がその人に呼びかける・一緒に動く／
//     本文に「A が戻ってきた・追いついた・合流した」があれば、「その場にいない人」の行は消える。主人公の現在地の行は出さない。
//   ・user の nowScene の直後（無ければ recentScenes の直後）に whereNow { rule, items }。最大 6 行・合計 360 字。無ければキーを足さない。
//     rule には「後の本文ではっきり描かれた受け渡しのほうが新しい。そうでなければ、状態の欄や前の本文よりこの控えが正しい」と書く
//     （AI が書いた <state> の誤り＝「鍵束を握り」が次の回の前提になって固定されるのを止めるため）。
// 正当な描写は削らない（本文・会話ログ・状態には触らない。足すのは user の 1 欄だけ）。
// 呼び出し元: v292Dfix58 userExt。検証口: window.__v292DfixPLACE1
// =====================================================================
(function(root){
  'use strict';
  var VER = 'place1-20261114-r1';
  var MAX_ITEMS = 6, MAX_CHARS = 360, EVID = 26;
  var RULE = 'whereNow は、プレイヤーの入力と本文で決まった、物の「いまの持ち主・置き場所」と「いまこの場にいない人」の控え（〔 〕は決まったターン）。それより後に、渡す・拾う・置く・戻ってくる様子が本文ではっきり描かれていれば、そちらが新しい。そうでなければ、状態の欄や前の本文に別の持ち主・別の場所が書かれていても、この控えのほうが正しい。その場にいない人を、戻る様子を書かずに同じ場所に居させない。持ち物や居場所を聞かれた人物には、この控えのとおりに答えさせる。本文でこの控えを説明・列挙しない。';
  function ls(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function on(){ return ls('v292DfixPLACE1Off') !== '1' && ls('v292DfixPLACE1On') === '1'; }
  function narrOn(){ return ls('v292DfixPLACE1NarrOff') !== '1'; }
  function str(v){ return v == null ? '' : String(v); }
  function isCont(t){ t = str(t); return /続きを(?:自然に)?進めて/.test(t) || /^続きを書/.test(t); }

  // ---- 語の部品 ----
  var NUMW = '[0-9０-９一二三四五六七八九十百]+\\s*(?:本|個|枚|つ|巻|切れ|斤|冊|通|脚|束|瓶|袋|丁|匹)';
  var GIVE = '(?:渡|手渡|預け|返|戻|持たせ|握らせ|譲|貸)';
  var RECV = '(?:受け取|預か|もら|借り)';
  var STOW = '(?:入れ|しま|仕舞|置|挿し|差し|残し|掛け|隠し|戻し)';
  var HOLD = '(?:持って|持ち、|持ち$|拾い|拾って|拾う|手に取|抱え)';
  var DROP = '(?:落と|捨て|手放)';
  var HONOR = /(?:さん|先輩|くん|君|ちゃん|様|さま|氏|殿)$/;
  var PERSON_WORD = /^(?:自分|私|わたし|俺|僕|あたし|お兄ちゃん|お姉ちゃん|兄さん|姉さん|兄|姉|お父さん|お母さん|父さん|母さん|父|母|頭|店長|先生|先輩|女将|隊長|みんな|全員|相手)$/;
  var BODY_PLACE = /(?:ポケット|鞄|カバン|かばん|リュック|背嚢|腰袋|袋|籠|かご|箱|棚|机|卓|引き出し|扉|戸|床|地面|懐|帯|上|中|下|隅|脇|そば|前|裏)$/;
  function clean(s){ return str(s).replace(/^[\s　、，]+|[\s　、，]+$/g, ''); }
  function stripLead(o){   /* 目的語の前の飾り（「受け取った」「残った」）を落とす。「自分の」は呼び出し側で主語の名前に替える */
    o = clean(o).replace(/^(?:受け取った|預かった|もらった|拾った|残った|残りの|さっきの|その|この|あの)/, '');
    return clean(o);
  }
  function makeCtx(heroName, npcNames){
    var names = (npcNames || []).map(str).filter(Boolean);
    return { hero: str(heroName), names: names,
      isPerson: function(w){ w = clean(w); if (!w) return false; var b = w.replace(HONOR, '');
        if (HONOR.test(w)) return true; if (PERSON_WORD.test(w)) return true; if (heroName && b === str(heroName)) return true;
        for (var i = 0; i < names.length; i++){ var n = names[i]; if (b === n || n.indexOf(b) >= 0 && b.length >= 2 || b.indexOf(n) >= 0) return true; }
        return false; },
      isSelf: function(w){ w = clean(w); return /^(?:自分|私|わたし|俺|僕|あたし)$/.test(w) || (!!heroName && w === heroName); } };
  }
  function splitQuotesOut(t){ return str(t).replace(/「[^」]*」|『[^』]*』/g, '〃'); }
  function sentences(t){ return splitQuotesOut(t).split(/[。！？!?\n]+/).map(clean).filter(Boolean); }
  function objList(o){   /* 「鍵束とろうそく」→ 2 つ。数の付いた語はそのまま */
    return clean(o).split(/と|・|および/).map(stripLead).filter(function(x){ return x && x.length <= 14; });
  }
  function short(s, n){ s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---- 1 つの入力（か本文の 1 文）から動きを拾う ----
  // 返す: [{ kind:'item', key, where:'人'|'場所'|'落', who, place, from, ev } | { kind:'person', who:[..], place, mode:'left'|'sent'|'gone', ev } | { kind:'hero', place, with:[..], ev }]
  function parseInput(text, actor, ctx, isStory){
    var out = [], ss = sentences(text), lastNoun = '';
    for (var a = 0; a < ss.length; a++){
      var s = ss[a], cls = s.split(/、|，/).map(clean).filter(Boolean), prevObj = '', pendingGive = [];
      var selfName = function(x){ return str(x).replace(/自分の/g, subj ? subj + 'の' : ''); };
      var subj = actor;   /* STORY は文頭の「A が／A は」を主語にする（DO は主人公。ACTOR1 と同じく「登録名＋が」があればその人） */
      var sm = s.match(/^([^、。をにでへと]{1,12}?)(?:が|は)(?=[^、。]*)/);
      if (sm && ctx.isPerson(sm[1].replace(/^.*の/, ''))) subj = clean(sm[1].replace(/^.*の/, ''));
      else if (isStory) subj = '';
      for (var c = 0; c < cls.length; c++){
        var cl = cls[c], m;
        var sc = cl.match(/^(.{1,12}?)(?:が|は)(?:〃と(?:言って|言い|告げて|告げ))?(.+)$/);   /* 節の頭の「A が／A は（「…」と言って）」＝その節の主語 */
        if (sc && ctx.isPerson(sc[1].replace(/^.*の/, '')) && !/を|に|で/.test(sc[1])){ subj = clean(sc[1].replace(/^.*の/, '')); cl = clean(sc[2]); }
        // 人を残す: 「A と B を P に残し」
        m = cl.match(/^(.{1,30}?)を(.{1,14}?)に残(?:し|す|して)/);
        if (m && m[1].split(/と/).every(function(p){ return ctx.isPerson(p); })){ out.push({ kind: 'person', who: m[1].split(/と/).map(clean), place: clean(m[2]), mode: 'left', ev: cl }); continue; }
        // 任せる: 「P を A と B に任せ」
        m = cl.match(/^(.{1,12}?)を(.{1,30}?)に任せ/);
        if (m && m[2].split(/と/).every(function(p){ return ctx.isPerson(p); })){ out.push({ kind: 'person', who: m[2].split(/と/).map(clean), place: clean(m[1]), mode: 'left', ev: cl }); continue; }
        // 送ってもらう: 「A に B を P まで送ってもらう」
        m = cl.match(/^(.{1,10}?)に(.{1,10}?)を(.{1,14}?)(?:まで|へ|に)送って(?:もら|くれ)/);
        if (m && ctx.isPerson(m[1]) && ctx.isPerson(m[2])){ out.push({ kind: 'person', who: [clean(m[2]), clean(m[1])], place: clean(m[3]), mode: 'sent', ev: cl }); continue; }
        // 受け取る: 「A から X（と Y）を（N 本）受け取り」
        m = cl.match(new RegExp('^(.{1,10}?)から(.{1,20}?)を(' + NUMW + ')?' + RECV));
        if (!m){ var mr = cl.match(new RegExp('^(.{1,20}?)を(.{1,10}?)から(' + NUMW + ')?' + RECV)); if (mr && ctx.isPerson(mr[2])) m = [mr[0], mr[2], mr[1], mr[3]]; }
        if (m && ctx.isPerson(m[1]) && subj){
          var ms = cl.match(new RegExp(RECV + '[^、。]{0,3}?(?:て|り)(?:自分の)?([^、。をはが]{1,14}?)に' + STOW));   /* 「預かって上着の内ポケットに入れ」 */
          if (ms && !ctx.isPerson(ms[1]) && BODY_PLACE.test(clean(ms[1]))){ objList(m[2]).forEach(function(o){ out.push({ kind: 'item', key: o, where: '場所', who: subj, place: clean(ms[1]), from: clean(m[1]), ev: cl }); lastNoun = o; }); prevObj = objList(m[2])[0] || ''; continue; } objList(m[2]).forEach(function(o){ out.push({ kind: 'item', key: o, n: clean(m[3] || ''), where: '人', who: subj, from: clean(m[1]), ev: cl }); lastNoun = o; }); prevObj = objList(m[2])[0] || ''; continue; }
        // 渡す（語順 2 通り）: 「X を A に渡し」「A に X を（N 本）渡し」
        var cnt = '', m0 = cl.match(new RegExp('^(.{1,20}?)(?:を|は)(' + NUMW + ')?(.{1,10}?)に' + GIVE));
        m = m0 ? [m0[0], m0[1], m0[3]] : null; if (m0 && m0[2]) cnt = clean(m0[2]);
        var m2 = !m && cl.match(new RegExp('^(.{1,10}?)に(.{1,20}?)を(' + NUMW + ')?' + GIVE));
        if (m2 && ctx.isPerson(m2[1])){ m = [m2[0], m2[2], m2[1]]; cnt = clean(m2[3] || ''); }
        if (m && ctx.isPerson(m[2])){
          var who = ctx.isSelf(m[2]) ? (subj || m[2]) : clean(m[2]);
          var os = objList(m[1]).map(function(o){ return fixOne(o, lastNoun); });
          pendingGive.forEach(function(p){ out.push({ kind: 'item', key: p.o, where: '人', who: p.who, ev: p.ev + '、' + cl }); }); pendingGive = [];
          os.forEach(function(o){ out.push({ kind: 'item', key: o, n: cnt, where: '人', who: who, ev: cl }); if (!/^もう|一[本個つ枚]/.test(o)) lastNoun = o.replace(/の.*$/, ''); });
          prevObj = os[0] || ''; continue; }
        // 動詞が次の節にある: 「X の一本を A に」（次の節の「…を B に渡す」と同じ動詞）
        m = cl.match(/^(.{1,20}?)を(.{1,10}?)に$/);
        if (m && ctx.isPerson(m[2])){ var o1 = fixOne(stripLead(m[1]), lastNoun); pendingGive.push({ o: o1, who: clean(m[2]), ev: cl }); lastNoun = o1.replace(/の.*$/, ''); continue; }
        // 目的語が前の節にある: 「（X を手に取り、）A に渡す」
        m = cl.match(new RegExp('^(.{1,10}?)に' + GIVE));
        if (m && ctx.isPerson(m[1]) && prevObj){ out.push({ kind: 'item', key: prevObj, where: '人', who: clean(m[1]), ev: (cls[c - 1] || '') + '、' + cl }); continue; }
        // 入れる・置く: 「X を（は）（自分の）P に入れ／しまう／置く／挿したまま」
        m = cl.match(new RegExp('^(.{1,20}?)(?:を|は)(自分の)?(.{1,14}?)に' + STOW));
        if (m) m = [m[0], selfName(m[1]), m[3], m[2]];
        if (m && !ctx.isPerson(m[2]) && BODY_PLACE.test(clean(m[2])) && !/に.+を/.test(m[1])){
          var selfP = !!m[3] || /(?:ポケット|鞄|カバン|かばん|リュック|背嚢|腰袋|懐)$/.test(clean(m[2]));
          objList(m[1]).map(function(o){ return fixOne(o, lastNoun); }).forEach(function(o){ out.push({ kind: 'item', key: o, where: '場所', who: selfP ? subj : '', place: clean(m[2]), ev: cl }); });
          prevObj = stripLead(m[1]); continue; }
        // 持つ・拾う: 「X を（N 本）持って／拾い」
        m = cl.match(new RegExp('^(.{1,20}?)を(?:' + NUMW + ')?(?:だけ)?' + HOLD));
        if (m && subj && !/に|で|へ/.test(m[1])){ var oh = stripLead(selfName(m[1])); if (oh && oh.length <= 14 && !ctx.isPerson(oh)){ out.push({ kind: 'item', key: oh, where: '人', who: subj, ev: cl, weak: true }); prevObj = oh; lastNoun = oh; } continue; }
        // 落とす
        m = cl.match(new RegExp('^(.{1,20}?)を' + DROP));
        if (m && !/に|で|へ/.test(m[1])){ var od = stripLead(m[1]); if (od && od.length <= 14) out.push({ kind: 'item', key: od, where: '落', who: subj, ev: cl }); continue; }
        // 主人公の移動: 「（A と（二人で））P へ行き／戻る／向かう／引き返す」
        m = !isStory && (cl.match(/^(?:(.{1,30})と(?:二人で|三人で|四人で|一緒に))(?:[^、。]{0,12}?を通って)?(.{1,16}?)(?:へ|まで)(?:行|向か|戻|引き返|入|上が|降り|下り)/) || cl.match(/^(?:(.{1,10}?)と)?(?:[^、。]{0,12}?を通って)?(.{1,16}?)(?:へ|まで)(?:行|向か|戻|引き返|入|上が|降り|下り)/));
        if (!m && !isStory){ var md = cl.match(/^(?:(.{1,30})と(?:二人で|三人で|四人で|一緒に))?(.{1,16}?)の(?:扉|戸|ドア|襖)を開け/); if (md) m = md; }
        if (m && !ctx.isPerson(m[2]) && !/を/.test(m[2])){ out.push({ kind: 'hero', place: clean(m[2]), with: m[1] ? m[1].split(/と/).map(clean).filter(function(p){ return ctx.isPerson(p); }) : [], ev: cl }); continue; }
        // STORY: 「A が…去っていく／帰っていく／P へ戻る・行く」（文の最後の節だけ）
        if (isStory && c === cls.length - 1 && subj && !ctx.isSelf(subj)){
          m = cl.match(/(?:^|[^ぁ-ん])(.{1,12}?)へ(?:戻|行|向か|出て|帰)/);
          if (m && !ctx.isPerson(m[1])) { var pl = clean(m[1].replace(/^.*(?:て|り|し)/, '')); out.push({ kind: 'person', who: [subj], place: pl, mode: /(?:窓辺|窓際|壁際|隅|戸口|入口|入り口|の前|そば|脇|奥|端)$/.test(pl) ? 'spot' : 'gone', ev: short(s, 40) }); continue; }
          if (/(?:去ってい|帰ってい|出てい|出て行|立ち去)/.test(cl)){ out.push({ kind: 'person', who: [subj], place: '', mode: 'gone', ev: short(s, 40) }); continue; }
        }
        // 前の節の目的語を覚える（「X を手に取り」）
        m = cl.match(/^(.{1,16}?)を/); if (m) prevObj = stripLead(m[1]);
      }
    }
    /* 「薬瓶を二本受け取り、一本を…、もう一本は腰袋に」: 同じ入力の中で分けて使った物は、まとめの行（薬瓶二本：…）を出さない */
    var parts = {}; out.forEach(function(e){ if (e.kind === 'item'){ var pm = e.key.match(/^(.+)の(?:もう)?一[本個つ枚巻]$/); if (pm) parts[pm[1]] = 1; } });
    if (/(?:^|、)一[本個つ枚巻]を/.test(splitQuotesOut(text))) out.forEach(function(e){ if (e.kind === 'item' && e.n && /^[二三四五六七八九十2-9２-９]/.test(e.n)) parts[e.key] = 1; });
    out = out.filter(function(e){ return !(e.kind === 'item' && e.n && parts[e.key] && !/の(?:もう)?一[本個つ枚巻]$/.test(e.key)); });
    return out;
  }
  function fixOne(o, lastNoun){ o = stripLead(o); if (/^(?:もう)?一[本個つ枚巻]$|^残り$|^もう一方$/.test(o) && lastNoun) return lastNoun + 'の' + o; return o; }

  // ---- 本文（地の文）から: 登録名どうしのはっきりした受け渡し・置く だけ ----
  function parseNarr(narr, ctx){
    var out = [], all = ctx.names.concat(ctx.hero ? [ctx.hero] : []).filter(Boolean);
    if (!all.length) return out;
    var esc = function(x){ return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var N = '(' + all.map(esc).sort(function(a, b){ return b.length - a.length; }).join('|') + ')';
    var t = Array.isArray(narr) ? narr.join('\n') : str(narr);
    t = t.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/^\s*<(react|state|summary|scene_move)\b.*$/gm, '').replace(/<[^>]*>/g, ' ');
    sentences(t).forEach(function(s){
      if (/(?:ようとし|かけた|ふり|つもり|まま|ない|なかった|たら|れば|なら)/.test(s)) return;   /* 未遂・否定・仮定は拾わない */
      var m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,24}?([^、。をはがにで\\s]{1,12})を' + N + '(?:の(?:手|手のひら|掌|胸元|腕))?に(?:渡し|手渡し|返し|戻し|押し戻し|押しつけ|押し付け|預け|握らせ)'));
      if (m && m[1] !== m[3]){ out.push({ kind: 'item', key: stripLead(m[2]), where: '人', who: m[3], from: m[1], ev: short(s, 40), narr: true }); return; }
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,16}?' + N + '(?:の手)?から([^、。をはがにで\\s]{1,12})を受け取'));
      if (m && m[1] !== m[2]){ out.push({ kind: 'item', key: stripLead(m[3]), where: '人', who: m[1], from: m[2], ev: short(s, 40), narr: true }); return; }
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,16}?([^、。をはがにで\\s]{1,12})を([^、。をはがで\\s]{1,12})に(?:置いた|置く|しまった|しまう|入れた|戻した)'));
      if (m && !ctx.isPerson(m[3]) && BODY_PLACE.test(m[3])){ out.push({ kind: 'item', key: stripLead(m[2]), where: '場所', who: /(?:ポケット|鞄|カバン|かばん|リュック|背嚢|腰袋|懐)$/.test(m[3]) ? m[1] : '', place: m[3], ev: short(s, 40), narr: true }); return; }
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,12}?([^、。をはがにで\\s]{1,12})を(?:[^、。をはが\\s]{1,8}に)?(?:落とす|落とした|落としてしまった|取り落とした)'));
      if (m && !ctx.isPerson(m[2])){ out.push({ kind: 'item', key: stripLead(m[2]), where: '落', who: m[1], ev: short(s, 40), narr: true, onlyKnown: true }); }
    });
    return out;
  }

  // ---- 台帳を作る（古い順に流す。同じ物は新しい行で置き換える） ----
  var NUM_TAIL = new RegExp('(?:' + NUMW + ')$');
  function sameKey(a, b){ a = str(a).replace(NUM_TAIL, ''); b = str(b).replace(NUM_TAIL, ''); if (!a || !b) return false; if (a === b) return true;
    var ha = a.replace(/^.*の/, ''), hb = b.replace(/^.*の/, '');   /* 「倉庫の鍵」と「鍵」 */
    if (/^(?:もう)?一[本個つ枚巻]$|^残り$/.test(ha) || /^(?:もう)?一[本個つ枚巻]$|^残り$/.test(hb)) return false;
    if (a === hb || b === ha) return true;
    var lo = a.length <= b.length ? a : b, hi = a.length <= b.length ? b : a;   /* 「父の丸眼鏡」と「眼鏡」: 短い方（2 字以上）が長い方の末尾 */
    return lo.length >= 2 && hi.slice(-lo.length) === lo; }
  function samePlace(a, b){ a = str(a); b = str(b); if (!a || !b) return false; var ta = a.replace(/^.*の/, ''), tb = b.replace(/^.*の/, ''); return a === b || ta === tb || a.indexOf(tb) >= 0 || b.indexOf(ta) >= 0; }
  function build(state, curInput){
    var turns = (state && Array.isArray(state.turns)) ? state.turns : [];
    var hero = ''; var npcs = [];
    try { hero = str(state.cast.hero.name); } catch(e){}
    try { npcs = (root.__v292Dfix95Roster || state.cast.npcs || []).map(function(n){ return n && n.name; }).filter(Boolean); } catch(e2){}
    var ctx = makeCtx(hero, npcs), items = [], people = [], heroAt = null, nOn = narrOn();
    function head(k){ return str(k).replace(NUM_TAIL, '').replace(/^.*の/, ''); }
    function qual(k){ var m = str(k).match(/^(.+)の[^の]+$/); return m ? m[1] : ''; }
    /* 同じ名前の物が 2 つある（ランタンを一つずつ）: 「匠が持っている一つ」の行を「遥のランタン」の行で置き換えない */
    function clash(x, newKey, newWho){ var qo = qual(newKey), xo = qual(x.key);
      if (qo && ctx.isPerson(qo) && x.e.where === '人' && x.e.who && x.e.who !== qo && !ctx.isSelf(x.e.who)) return x.e.who.replace(HONOR, '') !== qo.replace(HONOR, '');
      if (xo && ctx.isPerson(xo) && qo && ctx.isPerson(qo) && xo !== qo) return true;
      if (xo && ctx.isPerson(xo) && !qo && x.e.n) return false;
      return false; }
    function feed(evs, turn, src){
      evs.forEach(function(e){
        if (e.kind === 'item'){ if (!e.key || ctx.isPerson(e.key)) return;
          if (e.weak){ for (var i = items.length - 1; i >= 0; i--){ var x = items[i], q = qual(e.key);
              if (!(sameKey(x.key, e.key) || (head(x.key) === head(e.key) && q && x.e.place && (x.e.place === q || x.e.place.indexOf(q) >= 0)))) continue;
              if (clash(x, e.key, e.who)) continue;
              if (!(x.e.where === '人' && x.e.who === e.who)){ items.splice(i, 1); items.push({ key: x.key, e: { kind: 'item', key: x.key, n: x.e.n, where: '人', who: e.who, ev: e.ev }, turn: turn, src: src }); } break; } return; }
          var known = false; for (var j = items.length - 1; j >= 0; j--) if (sameKey(items[j].key, e.key) && !clash(items[j], e.key, e.who)){ known = true; if (e.onlyKnown) e = { kind: 'item', key: items[j].key, where: e.where, who: e.who, ev: e.ev, ttl: 2 }; items.splice(j, 1); }
          if (e.onlyKnown && !known) return;   /* 本文の「落とした」は、控えにある物の行を直すときだけ使う（新しい物は載せない） */
          items.push({ key: e.key, e: e, turn: turn, src: src }); }
        else if (e.kind === 'person'){ e.who.forEach(function(w){ for (var i = people.length - 1; i >= 0; i--) if (people[i].who === w) people.splice(i, 1); people.push({ who: w, place: e.place, mode: e.mode, ev: e.ev, turn: turn, src: src }); }); }
        else if (e.kind === 'hero'){ heroAt = { place: e.place, turn: turn, ev: e.ev };
          for (var k = people.length - 1; k >= 0; k--){ if (samePlace(people[k].place, e.place) || e.with.indexOf(people[k].who) >= 0) people.splice(k, 1); } }
      });
    }
    /* 人の行を消すのは、はっきりした合図があるときだけ:
         (a) 主人公がその場所へ移る入力（feed の hero）／(b) 後の入力がその人に呼びかける（SAY の文頭「A、」）か、その人と一緒に動く（hero.with）／
         (c) 本文の地の文に「A が戻ってきた・引き返してきた・追いついた・合流した・入ってきた」 */
    function vocative(pt, w){ var b = str(w).replace(HONOR, ''); if (!b) return false; return sentences(pt).some(function(x){ return x.indexOf(b) === 0 && /^(?:さん|先輩|くん|君|ちゃん|様)?[、，,！!？?\s　]/.test(x.slice(b.length) + ' '); }); }
    function cameBack(narr, w){ var b = str(w).replace(HONOR, ''); if (!b) return false; var t = Array.isArray(narr) ? narr.join('\n') : str(narr); t = t.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/<[^>]*>/g, ' ');
      return sentences(t).some(function(x){ return x.indexOf(b) >= 0 && /(?:戻ってき|戻って来|引き返してき|追いつい|合流し|入ってき|入って来|駆け込んでき|姿を見せ|現れた)/.test(x) && !/(?:ない|なかった)/.test(x); }); }
    for (var i = 0; i < turns.length; i++){
      var t = turns[i] || {}, typ = str(t.inputType).toUpperCase(), pt = str(t.playerText);
      if ((typ === 'DO' || typ === 'STORY') && pt && !isCont(pt)) feed(parseInput(pt, hero, ctx, typ === 'STORY'), i + 1, '入力');
      if (nOn) feed(parseNarr(t.narrative, ctx), i + 1, '本文');
      for (var p = people.length - 1; p >= 0; p--){ var pe = people[p]; if (i + 1 <= pe.turn) continue;
        if ((typ === 'SAY' && vocative(pt, pe.who)) || (nOn && cameBack(t.narrative, pe.who))) people.splice(p, 1); }
    }
    if (curInput && curInput.text && !isCont(curInput.text)){ var ct = str(curInput.type).toUpperCase(); if (ct === 'DO' || ct === 'STORY') feed(parseInput(curInput.text, hero, ctx, ct === 'STORY'), turns.length + 1, '入力');
      else if (ct === 'SAY'){ for (var q = people.length - 1; q >= 0; q--) if (vocative(curInput.text, people[q].who)) people.splice(q, 1); } }
    return { items: items, people: people, heroAt: heroAt, hero: hero, now: turns.length + 1 };
  }
  function lines(L){
    var out = [];
    L.items.forEach(function(it){ var e = it.e, body;
      if (e.ttl && L.now - it.turn > e.ttl) return;   /* 本文から読んだ「落とした」は 2 ターンだけ出す（その後どうなったかは分からないので、行そのものを出さない） */
      if (e.where === '人') body = e.who + 'が持っている' + (e.from ? '（' + e.from + 'から）' : '');
      else if (e.where === '場所') body = (e.who ? e.who + 'の' : '') + e.place + 'にある';
      else body = '落とした（誰も持っていない）';
      out.push({ turn: it.turn, s: it.key + (e.n ? '（' + e.n + '）' : '') + '：' + body + '〔' + it.turn + 'ターン目の' + it.src + '「' + short(e.ev, EVID) + '」〕' }); });
    var grp = {}, order = [];   /* 同じターン・同じ行き先の人は 1 行にまとめる */
    L.people.forEach(function(pe){ var k = pe.turn + '|' + pe.mode + '|' + pe.place; if (!grp[k]){ grp[k] = { pe: pe, who: [] }; order.push(k); } grp[k].who.push(pe.who); });
    order.forEach(function(k){ var pe = grp[k].pe, body; if (pe.mode === 'spot' && L.now - pe.turn > 1) return;   /* 同じ部屋の中の立ち位置（窓辺へ行く）は次のターンまで */
      body = pe.mode === 'spot' ? (pe.place + 'にいる') : pe.mode === 'left' ? (pe.place + 'に残った（' + (L.hero || '主人公') + 'と一緒にいない）') : pe.mode === 'sent' ? (pe.place + 'へ向かった（この場にいない）') : ((pe.place ? pe.place + 'へ行った' : '去った') + '（この場にいない）');
      out.push({ turn: pe.turn, s: grp[k].who.join('・') + '：' + body + '〔' + pe.turn + 'ターン目の' + pe.src + '〕' }); });
    /* 主人公の現在地の行は出さない（後の移動を拾い損ねると古い場所を「いま」と言ってしまうため。heroAt は「残した人」の行を消す判定にだけ使う） */
    out.sort(function(a, b){ return a.turn - b.turn; });
    /* 新しい方を優先して 6 行・360 字まで（古い方から落とす）。並びは古い順 */
    var keep = [], used = 0;
    for (var i = out.length - 1; i >= 0 && keep.length < MAX_ITEMS; i--){ if (used + out[i].s.length > MAX_CHARS) break; used += out[i].s.length; keep.unshift(out[i].s); }
    return keep;
  }

  var _last = null;
  function apply(parsed, state){
    _last = { on: on(), items: 0, chars: 0 };
    if (!_last.on || !parsed) return parsed;
    try {
      var L = build(state, parsed.currentInput), ls1 = lines(L);
      _last.raw = { items: L.items.length, people: L.people.length, hero: L.heroAt ? L.heroAt.place : '' };
      if (!ls1.length) return parsed;
      var blk = { rule: RULE, items: ls1 }, o = {}, k, placed = false, anchor = Object.prototype.hasOwnProperty.call(parsed, 'nowScene') ? 'nowScene' : 'recentScenes';
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'whereNow') continue; o[k] = parsed[k]; if (k === anchor){ o.whereNow = blk; placed = true; } }
      if (!placed) o.whereNow = blk;
      _last.items = ls1.length; _last.chars = ls1.join('').length; _last.lines = ls1;
      return o;
    } catch(e){ _last.err = str(e && e.message || e); return parsed; }
  }
  root.__v292DfixPLACE1 = { VER: VER, on: on, narrOn: narrOn, apply: apply, build: build, lines: lines, parseInput: parseInput, parseNarr: parseNarr, makeCtx: makeCtx, RULE: RULE,
    last: function(){ return _last; }, status: function(){ return { ver: VER, on: on(), narr: narrOn(), last: _last }; } };
})(typeof window !== 'undefined' ? window : globalThis);
