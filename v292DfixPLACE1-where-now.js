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
// ★r2（2026-11-14・実 AI の P1-ON 13 ターンで出た古い行・重複行への手当て。鍵・置き場所・保存しないことは r1 と同じ）:
//   ・同じ物の同定: 「自分の／私の X」は主語の名前に直す（入力も本文も）。持ち主つきの物は「持ち主が同じなら同じ物」。
//     持ち主＝キーの「A の」／置いた人／数つきで渡された相手。「床の X」は床にある行を先に当てる。決められなければ古い行を消して言わない。
//   ・不明なら言わない: 行が決まったターンより後の本文で、その物が目的語になって「動きの語」（渡す・置く・落とす・拾う・しまう…）が続けば行を落とす。
//     置いてある物は「握る・持つ・掲げる」でも落とす。誰かが持っている行は「別の人が握っている」だけでは落とさない（直したい誤りのほうなので）。
//   ・本文から読んだ行は 3 ターンだけ出す。本文の「置いた」は控えにある物の行を直すときだけ使う（新しい物は載せない）。
//   ・その場にいない人の行は、後の本文でその人が主語として動いていたら消す（声・物音として出るだけの文は除く）。
//   ・主人公の現在地の行を出す（入力で動いたターンと次の 2 ターンだけ）。
//   ・拾える言い方: 「X は机の上に戻す」「もう一つは自分で持つ」「A は自分の X を持って」「〜を上がって〜まで行く」「一人で〜へ下りる」。
// ★r3（2026-11-14・GPT #127-TR 1。r2 の実走 3 本で古いまま残った行への手当て。鍵・置き場所・保存しないことは同じ）:
//   ・優先順位: 最新の明示的なプレイヤー入力 ＞ 後続の確定した出来事（本文）＞ 古い行。
//     同じターンの本文は、そのターンの入力で決まった行を動かさない。後のターンの本文は古い行を替える・落とす。この回の入力は最後に当てる。
//   ・落とす条件を足した: 本文で「X を床に下ろす・載せる」／別の人がその物を手にした・使った（持ち主を確定できない）／
//     誰かが持っている行なのに本文では「傍らの X・足元の X・机の上の X」。時間がたっただけでは入力の行は落とさない。
//     持ち主が自分のポケットから出す・しまうだけの文では落とさない。
//   ・複数ある同種の物: 入力に「X が三本」「二つの X」と書かれた物は、持ち主（A の X）・ほかの名前（倉庫の X）・全部まとめて（X 三巻）で
//     見分けられる行だけ出す。見分けられない行は出さない。「X を一つ A に／もう一本は B に」は「A の X」「B の X」と書く。
//   ・拾える言い方を足した（託す・押しつける・持ってもらう・ひったくる・返してもらう・A には X を・腰に差す・ねじ込む・立てかける・
//     下ろす・放り出す／〜へ走る・〜に駆け込む・〜をよじ登って〜へ出る）。行き先として弱い語（先・奥・向こう・人のところ）は場所にしない。
//   ・観測の口 obs()（読み取り専用・件数だけ・本文や入力の文は入れない）: 行数、落とした行数と理由、動きの語があるのに行にならなかった入力の数。
// 正当な描写は削らない（本文・会話ログ・状態には触らない。足すのは user の 1 欄だけ）。
// 呼び出し元: v292Dfix58 userExt。検証口: window.__v292DfixPLACE1
// =====================================================================
(function(root){
  'use strict';
  var VER = 'place1-20261114-r3';
  var MAX_ITEMS = 8, MAX_CHARS = 480, EVID = 18;   /* r3: 8 行・480 字まで（根拠の引用は 18 字に短く）。古い順に落とすので、長く有効な入力の行が押し出されないように */
  var RULE = 'whereNow は、プレイヤーの入力と本文で決まった、物の「いまの持ち主・置き場所」と「いまこの場にいない人」の控え（〔 〕は決まったターン）。それより後に、渡す・拾う・置く・戻ってくる様子が本文ではっきり描かれていれば、そちらが新しい。そうでなければ、状態の欄や前の本文に別の持ち主・別の場所が書かれていても、この控えのほうが正しい。その場にいない人を、戻る様子を書かずに同じ場所に居させない。持ち物や居場所を聞かれた人物には、この控えのとおりに答えさせる。本文でこの控えを説明・列挙しない。';
  function ls(k){ try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch(e){ return null; } }
  function on(){ return ls('v292DfixPLACE1Off') !== '1' && ls('v292DfixPLACE1On') === '1'; }
  function narrOn(){ return ls('v292DfixPLACE1NarrOff') !== '1'; }
  function str(v){ return v == null ? '' : String(v); }
  function isCont(t){ t = str(t); return /続きを(?:自然に)?進めて/.test(t) || /^続きを書/.test(t); }

  // ---- 語の部品 ----
  var NUMW = '[0-9０-９一二三四五六七八九十百]+\\s*(?:本|個|枚|つ|巻|切れ|斤|冊|通|脚|束|瓶|袋|丁|匹)';
  var GIVE = '(?:渡|手渡|預け|返|戻|持たせ|握らせ|譲|貸|託|押しつけ|押し付け|放って|投げ渡|持ってもら|持っていてもら|預かってもら)';   /* r3: 自由な言い方（託す・押しつける・持ってもらう） */
  var RECV = '(?:受け取|預か|もら|借り|奪|取り上げ|ひったく|もぎ取|引き取)';   /* r3 */
  var STOW = '(?:入れ|しま|仕舞|置|挿|差し|差す|残し|掛け|隠し|戻し|戻す|突っ込|ねじ込|押し込|放り込|滑り込ませ|収め|納め|忍ばせ|詰め|立てかけ|引っかけ|ぶら下げ|下げ|載せ|乗せ|のせ|下ろ|降ろ|おろし|結|括り|巻|ほっぽ|放って|放置|立て)';   /* r2: 「机の上に戻す」（「広間に戻る」は入れない） */
  var SELF_OF = /(?:自分|私|わたし|あたし|俺|僕|おれ|ぼく)の/g;   /* r2: 「自分の／私の X」は主語の名前に直して同じ物として扱う */
  var HOLD = '(?:持って|持ち、|持ち$|拾い|拾って|拾う|手に取|抱え|握りしめ|掴ん|掴み|つかん|つかみ|背負|担い|担ぎ|取り上げ|持ち上げ|引っつか|ひっつか|取り出し|取り出して|抜き取)';
  var DROP = '(?:落と|捨て|手放|放り出|投げ捨|置き去り|放り投げ)';
  var HONOR = /(?:さん|先輩|くん|君|ちゃん|様|さま|氏|殿)$/;
  var PERSON_WORD = /^(?:自分|私|わたし|俺|僕|あたし|お兄ちゃん|お姉ちゃん|兄さん|姉さん|兄|姉|お父さん|お母さん|父さん|母さん|父|母|頭|店長|先生|先輩|女将|隊長|みんな|全員|相手)$/;
  var BODY_PLACE = /(?:ポケット|鞄|カバン|かばん|リュック|背嚢|腰袋|袋|籠|かご|箱|棚|机|卓|引き出し|扉|戸|床|地面|懐|帯|上|中|下|隅|脇|そば|前|裏|腰|首|肩|背中|背|手首|指|ベルト|柱|壁|釘|フック|鍵穴|台|椅子|ベンチ|窓辺|窓枠|手すり|荷台|座席|真ん中|中央|端|角|奥|手前|横|隣)$/;
  var SELF_PLACE = /(?:ポケット|鞄|カバン|かばん|リュック|背嚢|腰袋|懐|腰|首|肩|背中|背|手首|指|ベルト)$/;   /* r3: 身につける場所（「剣を腰に差す」「鍵を首から下げる」） */
  function clean(s){ return str(s).replace(/^[\s　、，]+|[\s　、，]+$/g, ''); }
  function stripLead(o){   /* 目的語の前の飾り（「受け取った」「残った」）を落とす。「自分の」は呼び出し側で主語の名前に替える */
    o = clean(o).replace(/^(?:受け取った|預かった|もらった|拾った|残った|残りの(?!一)|さっきの|その|この|あの)/, '');
    o = o.replace(/^.+(?:った|いた|えた|れた|きた|した|けた|げた|せた|てた|ねた|べた|めた|んだ|いだ)(?=[^、。]{2,}$)/, '');   /* r3: 「邪魔になった合鍵の束」「消えたろうそく」→ 名前だけ */
    o = o.replace(/^.*(?:から|まで)(?=[^、。]{2,}$)/, '');
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
      var selfName = function(x){ return str(x).replace(SELF_OF, subj ? subj + 'の' : ''); };
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
          if (ms && !ctx.isPerson(ms[1]) && BODY_PLACE.test(clean(ms[1]))){ objList(m[2]).forEach(function(o){ out.push({ kind: 'item', key: o, where: '場所', who: subj, place: clean(ms[1]), from: clean(m[1]), ev: cl }); lastNoun = o; }); prevObj = objList(m[2])[0] || ''; continue; } objList(m[2]).forEach(function(o){ out.push({ kind: 'item', key: o, n: clean(m[3] || ''), where: '人', who: subj, actor: subj, from: clean(m[1]), ev: cl }); lastNoun = o; }); prevObj = objList(m[2])[0] || ''; continue; }
        // r3: 「A に X を返してもらう／貸してもらう」＝主語が持つ
        m = cl.match(/^(.{1,10}?)に(.{1,16}?)を(?:返して|渡して|貸して|預けて|譲って)(?:もら|くれ)/);
        if (m && ctx.isPerson(m[1]) && subj){ objList(m[2]).forEach(function(o){ out.push({ kind: 'item', key: selfName(o), where: '人', who: subj, actor: subj, from: clean(m[1]), ev: cl }); }); continue; }
        // r3: 「A には X を（、B には Y を渡す）」
        m = cl.match(new RegExp('^(.{1,10}?)には(.{1,16}?)を(?:$|' + GIVE + ')'));
        if (m && ctx.isPerson(m[1]) && (new RegExp(GIVE)).test(s)){ objList(m[2]).forEach(function(o){ out.push({ kind: 'item', key: selfName(stripLead(o)), where: '人', who: clean(m[1]), actor: subj, ev: cl }); }); continue; }
        // 渡す（語順 2 通り）: 「X を A に渡し」「A に X を（N 本）渡し」
        var cnt = '', m0 = cl.match(new RegExp('^(.{1,20}?)(?:を|は)(' + NUMW + ')?(.{1,10}?)に' + GIVE));
        m = m0 ? [m0[0], m0[1], m0[3]] : null; if (m0 && m0[2]) cnt = clean(m0[2]);
        var m2 = !m && cl.match(new RegExp('^(.{1,10}?)に(.{1,20}?)を(' + NUMW + ')?' + GIVE));
        if (m2 && ctx.isPerson(m2[1])){ m = [m2[0], m2[2], m2[1]]; cnt = clean(m2[3] || ''); }
        if (m && ctx.isPerson(m[2])){
          var who = ctx.isSelf(m[2]) ? (subj || m[2]) : clean(m[2]);
          var os = objList(m[1]).map(function(o){ return fixOne(o, lastNoun); });
          pendingGive.forEach(function(p){ out.push({ kind: 'item', key: p.o, where: '人', who: p.who, ev: p.ev + '、' + cl }); }); pendingGive = [];
          os.forEach(function(o){ if (!o) return; out.push({ kind: 'item', key: o, n: cnt, where: '人', who: who, actor: subj, ev: cl }); if (!/^もう|一[本個つ枚]/.test(o)) lastNoun = o.replace(/の.*$/, ''); });
          prevObj = os[0] || ''; continue; }
        // 動詞が次の節にある: 「X の一本を A に」（次の節の「…を B に渡す」と同じ動詞）
        m = cl.match(/^(.{1,20}?)を(.{1,10}?)に$/);
        if (m && ctx.isPerson(m[2])){ var o1 = fixOne(stripLead(m[1]), lastNoun); if (!o1) continue; pendingGive.push({ o: o1, who: clean(m[2]), ev: cl }); lastNoun = o1.replace(/の.*$/, ''); continue; }
        // 目的語が前の節にある: 「（X を手に取り、）A に渡す」
        m = cl.match(new RegExp('^(.{1,10}?)に' + GIVE));
        if (m && ctx.isPerson(m[1]) && prevObj){ out.push({ kind: 'item', key: prevObj, where: '人', who: clean(m[1]), ev: (cls[c - 1] || '') + '、' + cl }); continue; }
        // r3: 目的語が前の節にある: 「（X を拾い、）上着のポケットに入れる」
        m = cl.match(new RegExp('^(自分の)?([^、。をはが]{1,14}?)に' + STOW));
        if (m && prevObj && !ctx.isPerson(m[2]) && BODY_PLACE.test(clean(m[2]))){ out.push({ kind: 'item', key: prevObj, where: '場所', who: (m[1] || SELF_PLACE.test(clean(m[2]))) ? subj : '', actor: subj, place: clean(m[2]), ev: (cls[c - 1] || '') + '、' + cl }); continue; }
        // 入れる・置く: 「X を（は）（自分の）P に入れ／しまう／置く／挿したまま」
        m = cl.match(new RegExp('^(.{1,20}?)(?:を|は)(.{1,10}?)の(?:肩|手|膝|首|背中|腕|頭|指)に(?:掛け|かけ|載せ|乗せ|のせ|握らせ|持たせ|巻|置)'));   /* r3: 「毛布を千夏の肩に掛けてやる」＝千夏が持つ */
        if (m && ctx.isPerson(m[2]) && !ctx.isSelf(m[2])){ objList(selfName(m[1])).forEach(function(o){ o = fixOne(o, lastNoun); if (o) out.push({ kind: 'item', key: o, where: '人', who: clean(m[2]), actor: subj, ev: cl }); }); continue; }
        m = cl.match(/^(.{1,20}?)(?:を|は)(自分の)?(首|肩|腰|ベルト|手首)から(?:下げ|提げ|ぶら下げ|吊)/);   /* r3: 「合鍵の束を首から下げて」 */
        if (m && subj){ objList(selfName(m[1])).forEach(function(o){ o = fixOne(o, lastNoun); if (o) out.push({ kind: 'item', key: o, where: '場所', who: subj, actor: subj, place: m[3], ev: cl }); }); prevObj = stripLead(selfName(m[1])); continue; }
        m = cl.match(new RegExp('^(.{1,20}?)(?:を|は)(自分の)?(.{1,14}?)に' + STOW));
        if (m) m = [m[0], selfName(m[1]), m[3].replace(/^.*(?:ながら|[てで])(?=[^てで、]{2,}$)/, ''), m[2]];   /* r3: 「一本灯して卓の真ん中に立て」→ 置き場所は「卓の真ん中」 */
        if (m && !ctx.isPerson(m[2]) && BODY_PLACE.test(clean(m[2])) && !/に.+を/.test(m[1])){
          var selfP = !!m[3] || SELF_PLACE.test(clean(m[2]));
          objList(m[1]).map(function(o){ return fixOne(o, lastNoun); }).forEach(function(o){ out.push({ kind: 'item', key: o, where: '場所', who: selfP ? subj : '', actor: subj, place: clean(m[2]), ev: cl }); });
          prevObj = stripLead(m[1]); if (prevObj && !/^(?:もう|残りの)?一[本個つ枚巻]$/.test(prevObj)) lastNoun = prevObj.replace(/^.*の(?=.{2,}$)/, ''); continue; }
        // r2: 「もう一つは自分で持つ」「X は自分で持つ」＝主語が持つ（同じ名前の物が 2 つあるときの自分の分）
        m = cl.match(/^(.{1,14}?)(?:は|を)自分で(?:持つ|持って|持ち)/);
        if (m && subj){ var om = stripLead(m[1]); if (/^(?:もう)?一[本個つ枚巻]$|^残り$|^もう一方$/.test(om)) om = lastNoun ? subj + 'の' + lastNoun : ''; else om = subj + 'の' + om;
          if (om && om.length <= 16) out.push({ kind: 'item', key: om, where: '人', who: subj, actor: subj, ev: cl }); continue; }
        // r3: 「（A が）X をひったくる・奪う・取り上げる」＝主語が持つ
        m = cl.match(/^(.{1,14}?)を(?:ひったく|奪|もぎ取|取り上げ|引ったく)/);
        if (m && subj && !/に|で|へ|から/.test(m[1])){ var osn = stripLead(selfName(m[1])); if (osn && !ctx.isPerson(osn.replace(/^.*の/, ''))) out.push({ kind: 'item', key: osn, where: '人', who: subj, actor: subj, ev: cl }); continue; }
        // 持つ・拾う: 「X を（N 本）持って／拾い」
        m = cl.match(new RegExp('^(.{1,20}?)を(?:' + NUMW + ')?(?:だけ)?' + HOLD));
        if (m && subj && !/に|で|へ/.test(m[1])){ var oh = stripLead(selfName(m[1])); if (oh && oh.length <= 14 && !ctx.isPerson(oh.replace(/^.*の/, ''))){
            var ownQ = oh.match(/^(.+?)の[^の]+$/), owned = !!(ownQ && ctx.isPerson(ownQ[1]) && SELF_OF.test(m[1])); SELF_OF.lastIndex = 0;
            /* r2: 「自分の X を持って」は持ち主つきなので新しい行にしてよい。それ以外の「持って・拾い」は既にある行を動かすだけ */
            out.push({ kind: 'item', key: oh, where: '人', who: subj, actor: subj, ev: cl, weak: !owned }); prevObj = oh; lastNoun = oh; } if (!(isStory && /へ/.test(cl))) continue; }   /* r3: STORY「A が X を持って P へ行く」は、行き先も読む */
        // 落とす
        m = cl.match(new RegExp('^(.{1,20}?)を' + DROP));
        if (m && !/に|で|へ/.test(m[1])){ var od = stripLead(m[1]); if (od && od.length <= 14) out.push({ kind: 'item', key: od, where: '落', who: subj, ev: cl }); continue; }
        // 主人公の移動: 「（A と（二人で））P へ行き／戻る／向かう／引き返す」
        var VIA = '(?:[^、。]{0,12}?を(?:通って|上がって|上って|下りて|降りて|抜けて|渡って|駆け上がって|駆け下りて|横切って|くぐって|よじ登って|登って|伝って|越えて))?';
        var GO = '(?:行|向か|戻|引き返|入|上が|降り|下り|走|駆け|逃げ|急|移|出る|出て|進|飛び込|抜け|歩|這|よじ登|登)';   /* r3: 走る・駆け込む・逃げる・移る 等 */   /* r2: 「螺旋階段を上がって灯室の扉の前まで行く」 */
        m = !isStory && (cl.match(new RegExp('^(?:(.{1,30})と(?:二人で|三人で|四人で|一緒に))' + VIA + '(.{1,16}?)(?:へ|まで)' + GO)) || cl.match(new RegExp('^(?:(.{1,10}?)と)?(?:一人で|ひとりで)?' + VIA + '(.{1,16}?)(?:へ|まで)' + GO)) || cl.match(new RegExp('^(?:(.{1,10}?)と)?(?:一人で|ひとりで)?' + VIA + '(.{1,30}?)に(?:入る|入って|入り|戻る|戻って|戻り|向かう|向かって|向かい|上がる|上がって|下りる|下りて|降りる|降りて|駆け込|逃げ込|飛び込|移る|移って|移動|着く|着いた|辿り着|たどり着)')) || cl.match(new RegExp('^()(.{1,30}?)(?:へ|まで)' + GO)));
        if (!m && !isStory){ var md = cl.match(/^(?:(.{1,30})と(?:二人で|三人で|四人で|一緒に))?(.{1,16}?)の(?:扉|戸|ドア|襖)を開け/); if (md) m = md; }
        if (m && m[1] && !m[1].split(/と/).every(function(p){ return ctx.isPerson(p) && !/の$/.test(p); })) m = [m[0], '', m[1] + 'と' + m[2]];   /* 「匠のところへ」の「と」は連れの区切りではない */
        if (m && !ctx.isPerson(m[2])){
          var hp = clean(m[2]).replace(/^[^、。をにでへの]{1,8}?は/, '').replace(/^(?:一人で|ひとりで|二人で|三人で|四人で|一緒に|みんなで|急いで|走って|そのまま|まっすぐ|先に|すぐに?)/, '');
          hp = hp.replace(/^.*(?:ながら|[てで])(?=[^てで、]{2,}$)/, '');   /* 「ぐるりと回り込んで向こう」「手すりにつかまって二階」→ 最後の行き先だけ */
          /* r3: 行き先として弱い語（先・奥・外・向こう・〜の方・人のところ）は場所にしない */
          var vague = hp.length < 2 || /^(?:先|奥|前|後ろ|外|中|上|下|向こう|反対|そちら|あちら|こちら|そこ|ここ|あそこ|どこか|元|もと)$/.test(hp) || /(?:方向|の方|ほう|ところ|もと|そば|隣|反対側|後ろ|あと)$/.test(hp) || ctx.isPerson(hp.replace(/の.*$/, ''));
          if (/を|から/.test(hp) || hp.length > 16) vague = true;
          if (!vague){ out.push({ kind: 'hero', place: hp, with: m[1] ? m[1].split(/と/).map(clean).filter(function(p){ return ctx.isPerson(p); }) : [], ev: cl }); continue; } }
        // r3 STORY: 「A は…二階に残っている」＝その場にいない／「A が…下りてきて・戻ってくる」＝合流
        if (isStory && subj && !ctx.isSelf(subj)){
          var kz = cl.search(/に残(?:って|る|った)/);
          if (kz > 0){ var pz = clean(cl.slice(0, kz).replace(/^.*(?:まま|を|は|が|て|で|、)/, '')); if (pz && pz.length <= 12 && !ctx.isPerson(pz)){ out.push({ kind: 'person', who: [subj], place: pz, mode: 'left', ev: short(s, 40) }); continue; } }
          if (/(?:下りてき|降りてき|上がってき|戻ってき|戻って来|やってき|入ってき|追いつ|合流|駆けつけ)/.test(cl)){ out.push({ kind: 'back', who: [subj], ev: short(s, 40) }); if (!/を/.test(cl)) continue; }
        }
        // STORY: 「A が…去っていく／帰っていく／P へ戻る・行く」（文の最後の節だけ）
        if (isStory && c === cls.length - 1 && subj && !ctx.isSelf(subj)){
          m = cl.match(/(?:^|[^ぁ-ん])(.{1,12}?)へ(?:[^、。へ]{0,10}?に)?(?:戻|行|向か|出て|帰)/) || cl.match(/(?:持って|抱えて|連れて)(.{1,12}?)へ(?:[^、。へ]{0,10}?に)?(?:戻|行|向か|出て|帰)/);
          if (m && !ctx.isPerson(m[1])) { var pl = clean(m[1].replace(/^.*(?:て|り|し)/, '')); out.push({ kind: 'person', who: [subj], place: pl, mode: /(?:窓辺|窓際|壁際|隅|戸口|入口|入り口|の前|そば|脇|奥|端)$/.test(pl) ? 'spot' : 'gone', ev: short(s, 40) }); continue; }
          if (/(?:去ってい|帰ってい|出てい|出て行|立ち去)/.test(cl)){ out.push({ kind: 'person', who: [subj], place: '', mode: 'gone', ev: short(s, 40) }); continue; }
        }
        // 前の節の目的語を覚える（「X を手に取り」）
        m = cl.match(/^(.{1,30}?)を/); if (m){ var po = stripLead(selfName(m[1])); if (po && po.length <= 14){ prevObj = po; if (!/^(?:もう|残りの)?一[本個つ枚巻]$/.test(po)) lastNoun = po.replace(/^.*の(?=.{2,}$)/, ''); } }
        m = cl.match(/^(.{1,30}?)は$/); if (m){ var pt2 = stripLead(selfName(m[1])); if (pt2 && pt2.length <= 14 && !ctx.isPerson(pt2)) prevObj = pt2; }   /* r3: 「邪魔になった合鍵の束は、（台所の柱の釘に引っかけておく）」 */
      }
    }
    /* 「薬瓶を二本受け取り、一本を…、もう一本は腰袋に」: 同じ入力の中で分けて使った物は、まとめの行（薬瓶二本：…）を出さない */
    var parts = {}; out.forEach(function(e){ if (e.kind === 'item'){ var pm = e.key.match(/^(.+)の(?:もう|残りの)?一[本個つ枚巻]$/); if (pm) parts[pm[1]] = 1; } });
    if (/(?:^|、)一[本個つ枚巻]を/.test(splitQuotesOut(text))) out.forEach(function(e){ if (e.kind === 'item' && e.n && /^[二三四五六七八九十2-9２-９]/.test(e.n)) parts[e.key] = 1; });
    out = out.filter(function(e){ return !(e.kind === 'item' && e.n && parts[e.key] && !/の(?:もう|残りの)?一[本個つ枚巻]$/.test(e.key)); });
    return out;
  }
  function fixOne(o, lastNoun){ o = stripLead(o); if (/^(?:もう|残りの)?一[本個つ枚巻]$|^残り$|^もう一方$/.test(o)) return lastNoun ? (lastNoun + 'の' + o) : ''; return o; }   /* r3: 何の一本か分からなければ行にしない */

  var NARR_TTL = 3;   /* r2: 本文から読んだ行は 3 ターンだけ出す（入力の行より確かさが低い。古い行を「いま」と言い続けない） */
  var HERO_TTL = 2;   /* r2: 主人公の現在地の行は、その入力のターンと次の 2 ターンだけ */
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
      var m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,24}?([^、。をはがにで\\s]{1,16})を' + N + '(?:の(?:手|手のひら|掌|胸元|腕))?に(?:渡し|手渡し|返し|戻し|押し戻し|押しつけ|押し付け|預け|握らせ)'));
      var own = function(k, who){ return stripLead(str(k).replace(SELF_OF, who + 'の')); };   /* r2: 「遥は自分のランタンを」→ 遥のランタン */
      if (m && m[1] !== m[3]){ objList(own(m[2], m[1])).forEach(function(o){ out.push({ kind: 'item', key: o, where: '人', who: m[3], actor: m[1], from: m[1], ev: short(s, 40), narr: true, ttl: NARR_TTL }); }); return; }
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,16}?' + N + '(?:の手)?から([^、。をはがにで\\s]{1,16})を受け取'));
      if (m && m[1] !== m[2]){ objList(own(m[3], m[1])).forEach(function(o){ out.push({ kind: 'item', key: o, where: '人', who: m[1], actor: m[1], from: m[2], ev: short(s, 40), narr: true, ttl: NARR_TTL }); }); return; }
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,16}?([^、。をはがにで\\s]{1,16})を([^、。をはがで\\s]{1,12})に(?:置いた|置く|置いて|置き、|しまった|しまう|入れた|戻した|下ろし|下ろした|降ろし|降ろした|載せた|載せ、|乗せた)'));   /* r2: 置いて／置き、 r3: 下ろし・載せた */
      if (m && !ctx.isPerson(m[3]) && BODY_PLACE.test(m[3])){ out.push({ kind: 'item', key: own(m[2], m[1]), where: '場所', who: /(?:ポケット|鞄|カバン|かばん|リュック|背嚢|腰袋|懐)$/.test(m[3]) ? m[1] : '', actor: m[1], place: m[3], ev: short(s, 40), narr: true, onlyKnown: true, keepKind: true, ttl: NARR_TTL }); return; }
      /* r2: 控えにある物を「A が（床の）X を拾い上げ／持ち上げ／手に取った」＝A が持っている（新しい物は載せない） */
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,16}?([^、。をはがにで\\s]{1,14})を(?:拾い上げ|拾った|拾って|拾い、|持ち上げ|取り上げ|手に取っ|手に取り)'));
      if (m && !ctx.isPerson(m[2])){ out.push({ kind: 'item', key: own(m[2], m[1]), where: '人', who: m[1], actor: m[1], ev: short(s, 40), narr: true, weak: true, ttl: NARR_TTL }); return; }
      m = s.match(new RegExp('^' + N + '(?:は|が)[^。]{0,12}?([^、。をはがにで\\s]{1,12})を(?:[^、。をはが\\s]{1,8}に)?(?:落とす|落とした|落としてしまった|取り落とした)'));
      if (m && !ctx.isPerson(m[2])){ out.push({ kind: 'item', key: own(m[2], m[1]), where: '落', who: m[1], actor: m[1], ev: short(s, 40), narr: true, onlyKnown: true }); }
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
    var bare = function(w){ return str(w).replace(HONOR, ''); };
    function head(k){ return str(k).replace(NUM_TAIL, '').replace(/^.*の/, ''); }
    function qual(k){ var m = str(k).replace(NUM_TAIL, '').match(/^(.+)の[^の]+$/); return m ? m[1] : ''; }
    function sameHead(a, b){ a = head(a); b = head(b); if (!a || !b) return false; if (a === b) return true; var lo = a.length <= b.length ? a : b, hi = a.length <= b.length ? b : a; return lo.length >= 2 && hi.slice(-lo.length) === lo; }
    function partitive(k){ return /(?:^|の)(?:もう|残りの)?一[本個つ枚巻]$|(?:^|の)残り$|(?:^|の)もう一方$/.test(str(k)); }
    /* ★r2 持ち主つきの物の同定:
         行の持ち主 = キーの「A の」（A が人）／置いた・しまった人（actor）／数つきで渡された相手（「ランタン（一つ）：匠」＝匠の分）。
         新しい出来事の持ち主 = キーの「A の」／数つきで渡す相手。無ければ動かした人（actor）で照らす。
         両方に持ち主 → 同じ人なら同じ物。片方だけ → 動かした人・いまの持ち主がその人なら同じ物。その名前の行が 1 つしか無ければ同じ物。
         どちらにも無い → 同じ名前なら同じ物（「倉庫の鍵」と「鍵」）。「床の X」は、床にある行を先に当てる。 */
    function ownerOfKey(k){ var q = qual(k); return q && ctx.isPerson(q) ? bare(q) : ''; }
    function ownerOf(x){ return ownerOfKey(x.key) || (x.e.owner ? bare(x.e.owner) : '') || (x.e.n && x.e.where === '人' ? bare(x.e.who) : ''); }
    function holderOf(x){ return x.e.who ? bare(x.e.who) : ''; }
    function gqOf(k){ var q = qual(k); return (q && !ctx.isPerson(q) && !BODY_PLACE.test(q)) ? q : ''; }   /* 「寝室の鍵」の「寝室」＝ほかの名前（置き場所の語や人ではない） */
    function cands(key){ return items.filter(function(x){ if (partitive(x.key) || partitive(key)) return x.key === key; if (!sameHead(x.key, key)) return false; var a = gqOf(x.key), b = gqOf(key); return !(a && b && a !== b); }); }
    function same(x, e, all){
      var ox = ownerOf(x), on = ownerOfKey(e.key) || (e.n && e.where === '人' ? bare(e.who) : ''), actor = bare(e.actor || ''), q = qual(e.key), pq = (q && !ctx.isPerson(q)) ? q : '';
      var gq = qual(x.key), gx = (gq && !ctx.isPerson(gq)) ? gq : '';
      if (gx && pq && gx !== pq && !(x.e.place && x.e.place.indexOf(pq) >= 0)) return false;   /* 「職員室の鍵」と「倉庫の鍵」は別の物 */
      if (e.from && holderOf(x) && holderOf(x) === bare(e.from)) return true;   /* 「B から X を受け取る」: B が持っていた行がその物 */
      if (ox && on) return ox === on;
      if (ox && !on){ if (actor && (actor === ox || actor === holderOf(x))) return true; if (pq && x.e.place && x.e.place.indexOf(pq) >= 0) return true; return !actor && all.length === 1; }   /* 別の人が動かした同じ名前の物は、その人の分とは限らない */
      if (!ox && on) return holderOf(x) === on || all.length === 1;
      return true;
    }
    var multi = {};   /* 同じ名前の物が 2 つ以上あると分かった名前（数つきで分けた・行が 2 本並んだ） */
    function noteMulti(){ var c = {}; items.forEach(function(x){ var h = head(x.key); c[h] = (c[h] || 0) + 1; if (x.e.n || c[h] > 1) multi[h] = 1; }); }
    function removeItem(x){ var k = items.indexOf(x); if (k >= 0) items.splice(k, 1); }
    /* ★r3 複数ある同種の物（GPT #127-TR 1(c)）: プレイヤーの入力に「X が三本」「二つの X」のように 2 つ以上あると書かれた物は、
         持ち主（A の X）・ほかの名前（倉庫の X）・全部まとめて（X 三巻）のどれかで見分けられる行だけ出す。
         見分けられない「X：A が持っている」は出さない（「ろうそく 3 本」と「特定の 1 本」を混同しない）。 */
    var inTxt = turns.map(function(t){ var ty = str(t && t.inputType).toUpperCase(); return (ty === 'DO' || ty === 'STORY') ? splitQuotesOut(str(t.playerText)) : ''; }).join('。') + '。' + ((curInput && /^(?:DO|STORY)$/i.test(str(curInput.type))) ? splitQuotesOut(str(curInput.text)) : '');
    var inTxtA = null;   /* 書き方ちがいをそろえた入力の文（最初に使うときに作る） */
    var NUM2 = '((?:[二三四五六七八九十百]|[2-9２-９]|[0-9０-９]{2,})[0-9０-９一二三四五六七八九十百]*\\s*(?:本|個|枚|つ|巻|切れ|斤|冊|通|脚|束|瓶|袋|丁|匹))';
    function totalOf(h){ if (!h) return ''; if (inTxtA === null) inTxtA = alias(inTxt); var e = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); var m = inTxtA.match(new RegExp(e + '(?:が|を|は|も|の)?\\s*' + NUM2)) || inTxtA.match(new RegExp(NUM2 + 'の' + e)); return m ? m[1].replace(/\s/g, '') : ''; }
    function pluralPass(){
    for (var z = items.length - 1; z >= 0; z--){ var it = items[z], hk = alias(head(it.key)), base = partitive(it.key) ? alias(str(it.key).replace(/の(?:もう|残りの)?一[本個つ枚巻]$|の残り$|のもう一方$/, '')) : hk, tot = totalOf(base); if (!tot) continue;
      if (ownerOfKey(it.key) && !partitive(it.key)) continue;
      var tail = (str(it.key).match(NUM_TAIL) || [''])[0].replace(/\s/g, '');
      if ((it.e.n && it.e.n.replace(/\s/g, '') === tot) || (tail && tail === tot)) continue;   /* 全部まとめて */
      var gq = qual(it.key); if (gq && !ctx.isPerson(gq) && !partitive(it.key)) continue;   /* ほかの名前で見分ける（倉庫の鍵） */
      var who = it.e.where === '人' ? it.e.who : (it.e.who || it.e.owner || '');
      if (who && (it.e.n || partitive(it.key) || it.e.where === '場所')){ it.key = who + 'の' + base; it.e.key = it.key; it.e.n = ''; continue; }   /* 持ち主で見分ける */
      items.splice(z, 1); drops.plural = (drops.plural || 0) + 1; }
    }
    function feed(evs, turn, src){
      evs.forEach(function(e){
        if (e.kind === 'item'){ if (!e.key || ctx.isPerson(head(e.key))) return;
          var all = cands(e.key), hit = all.filter(function(x){ return same(x, e, all); }), q = qual(e.key), pq = (q && !ctx.isPerson(q)) ? q : '';
          if (src === '本文'){ var n0 = hit.length; hit = hit.filter(function(x){ return !(x.turn === turn && x.src === '入力'); }); if (n0 && !hit.length) return; }   /* r3: 同じターンの入力で決まった行は、そのターンの本文では動かさない（入力が上） */
          if (pq){ var byPlace = hit.filter(function(x){ return x.e.place && x.e.place.indexOf(pq) >= 0; }); if (byPlace.length) hit = byPlace; }
          if (hit.length > 1){ var mine = hit.filter(function(x){ var a = bare(e.actor || e.who || ''); return a && (ownerOf(x) === a || holderOf(x) === a); }); if (mine.length === 1) hit = mine; }
          if (e.narr && hit.length === 1){ var x0 = hit[0];   /* 本文が同じことを言っているだけなら、元の行（入力の行）をそのまま残す */
            var inOwn = x0.e.where === '場所' && e.where === '人' && holderOf(x0) && holderOf(x0) === bare(e.who);   /* 「遥の内ポケットにある」と本文の「遥が受け取った」は同じこと */
            if (inOwn || (x0.e.where === e.where && (e.where !== '場所' || x0.e.place === e.place) && (e.where !== '人' || holderOf(x0) === bare(e.who)))){ x0.seen = turn; if (x0.e.narr && !inOwn){ x0.turn = turn; x0.e.ev = e.ev; } return; } }
          if (e.weak || e.onlyKnown){   /* 既にある行を動かすだけ（新しい物は載せない） */
            if (!hit.length) return;
            if (hit.length > 1){ hit.forEach(removeItem); drops.ambiguous = (drops.ambiguous || 0) + hit.length; return; }   /* どの行のことか決められない → 古い行を残さず、言わない */
            var x = hit[0]; if (e.weak && x.e.where === '人' && holderOf(x) === bare(e.who)) return;
            removeItem(x);
            var io = ownerOfKey(x.key) ? '' : ownerOf(x), nk = io ? (io + 'の' + head(x.key)) : x.key;   /* 「ランタン（一つ）：匠」→ 動いた後は「匠のランタン」と書く */
            items.push({ key: nk, e: { kind: 'item', key: nk, n: io ? '' : x.e.n, owner: '', where: e.where, who: (e.where === '落') ? e.who : e.who, place: e.place, from: e.from, ev: e.ev, ttl: e.where === '落' ? 2 : e.ttl, narr: e.narr }, turn: turn, src: src });
            return; }
          var keepKey = e.key, keepOwner = e.owner || '';
          hit.forEach(function(x){ if ((ownerOfKey(x.key) && !ownerOfKey(e.key)) || (pq && ((x.e.place && x.e.place.indexOf(pq) >= 0) || (hit.length === 1 && BODY_PLACE.test(pq))))) keepKey = x.key;   /* 「机の鍵」の「机の」は置き場所の説明。名前は元の行のまま */ if (!keepOwner && !ownerOfKey(keepKey)) keepOwner = x.e.owner || (x.e.n && x.e.where === '人' ? x.e.who : ''); removeItem(x); });
          var ne = {}; for (var kk in e) ne[kk] = e[kk]; ne.key = keepKey; if (!ne.owner && e.where === '場所' && e.actor && !ownerOfKey(keepKey)) ne.owner = keepOwner || e.actor; else if (!ne.owner && keepOwner) ne.owner = keepOwner;
          items.push({ key: keepKey, e: ne, turn: turn, src: src }); }
        else if (e.kind === 'person'){ e.who.forEach(function(w){ for (var i = people.length - 1; i >= 0; i--) if (people[i].who === w) people.splice(i, 1); people.push({ who: w, place: e.place, mode: e.mode, ev: e.ev, turn: turn, src: src }); }); }
        else if (e.kind === 'back'){ e.who.forEach(function(w){ for (var i = people.length - 1; i >= 0; i--) if (bare(people[i].who) === bare(w)) people.splice(i, 1); }); }
        else if (e.kind === 'hero'){ heroAt = { place: e.place, turn: turn, ev: e.ev };
          for (var k = people.length - 1; k >= 0; k--){ if (samePlace(people[k].place, e.place) || e.with.indexOf(people[k].who) >= 0) people.splice(k, 1); } }
      });
      pluralPass();   /* r3: 複数ある物の行は、作った時点で「A の X」に直すか外す（後の出来事が同じ行に当たるように） */
      noteMulti();
    }
    function narrSents(narr){ var t = Array.isArray(narr) ? narr.join('\n') : str(narr); t = t.replace(/<say\b[^>]*>[\s\S]*?<\/say>/g, '\n').replace(/^\s*<(react|state|summary|scene_move)\b.*$/gm, '').replace(/<[^>]*>/g, ' '); return sentences(t); }
    /* ★r2「不明なら言わない」: 行が決まったターンより後の本文で、その物の語が「動きの語」と同じ文に出たら、その行を落とす
         （同じターンの本文の読み取りで新しい行が作れれば、そちらが載る）。古い行を「いま」と言い続けて正しい本文を巻き戻すより、行が無い方が安全。
         ・誰かが持っている行: 渡す・置く・落とす・拾う・しまう・取り出す 等（持ち主が変わる動き）の語だけで落とす。
           「握る・持つ・掲げる」だけの文では落とさない（別の人が握っている、という本文は直したい誤りのほうなので行を残す）。
         ・どこかに置いてある行: 上に加えて「握る・持つ・掲げる・掴む」でも落とす（置いてある物を誰かが手にしている＝動いた）。
         ・未遂・否定・仮定の文、その物の持ち主と関係のない人の文は数えない。 */
    var MOVE_T = /(?:渡し|渡す|渡さ|手渡|返し|返す|預け|受け取|置い|置き|置く|置か|落と|投げ|放り|しまっ|しまい|しまう|仕舞|入れ|滑り込ませ|掛け|拾|取り上げ|持ち上げ|つまみ上げ|抜き|抜い|取り出|奪|ひったく|押し戻|押しつけ|押し付け|下ろ|降ろ|載せ|乗せ|手放|使い切|使い果た|配っ|配り|分け)/;
    var RELEASE = /(?:渡し|渡す|渡さ|手渡|返し|返す|預け|置い|置き|置く|置か|落と|投げ|放り|しまっ|しまい|しまう|仕舞|入れ|滑り込ませ|掛け|押し戻|押しつけ|押し付け|下ろ|降ろ|載せ|乗せ|手放|使い切|使い果た|配っ|配り|分け)/;
    var drops = {};   /* r3: 落とした行の数（理由ごと・件数だけ） */
    /* r3: 同じ物の書き方ちがい（本文が漢字で書く）をそろえてから照らす */
    var ALIAS = [[/蝋燭|蠟燭|ロウソク|ローソク/g, 'ろうそく'], [/カバン|かばん/g, '鞄'], [/メガネ|めがね/g, '眼鏡'], [/カギ|かぎ(?![ぁ-ん])/g, '鍵'], [/ライター/g, 'ライター']];
    function alias(t){ t = str(t); ALIAS.forEach(function(a){ t = t.replace(a[0], a[1]); }); return t; }
    var MOVE_H = /(?:握|持っ|持ち|掲げ|提げ|抱え|差し出|かざ|つまみ|つまん|掴|つかん)/;
    function mentions(sn, h){ var k = sn.indexOf(h); while (k >= 0){ var nx = sn.charAt(k + h.length), pv = k > 0 ? sn.charAt(k - 1) : ''; if (h.length >= 2 || (!/[一-鿿]/.test(nx) && !/[一-鿿]/.test(pv))) return true; k = sn.indexOf(h, k + 1); } return false; }
    function subjOf(sn){ var all = ctx.names.concat(hero ? [hero] : []), best = '', pos = 1e9; all.forEach(function(n){ var k = sn.indexOf(n); if (k >= 0 && k < pos && /^(?:は|が|も)/.test(sn.slice(k + n.length))){ pos = k; best = n; } }); return best; }
    /* ★r3 の優先順位（GPT #127-TR）: 最新の明示的なプレイヤー入力 ＞ 後続の確定した出来事（本文）＞ 古い行。
         ・同じターンの本文は、そのターンの入力で決まった行を置き換えない・落とさない（入力が上）。
         ・後のターンの本文で、その物が動いた／別の人が手にしている／脇・床に置いてあると書かれたら、古い行は落とす（読めれば新しい行に替える）。
         ・時間がたっただけでは入力の行は落とさない。この回の入力は最後に当てる（いちばん新しい）。 */
    function staleDrop(narr, turn){
      var ss = narrSents(narr).map(alias); if (!ss.length || !items.length) return;
      var sjs = [], lastSj = ''; ss.forEach(function(sn){ var q = subjOf(sn); if (q) lastSj = q; else if (/^(?:彼女|彼|二人|三人|その|誰か)/.test(sn)) lastSj = ''; sjs.push(q || lastSj); });   /* 主語の無い文は、前の文の主語を引き継ぐ（「彼女は」等は誰か決めない） */
      for (var a = items.length - 1; a >= 0; a--){ var x = items[a]; if (x.turn >= turn || x.seen === turn) continue; var h = alias(head(x.key)); if (!h) continue;   /* このターンの本文で確かめ直した行は落とさない */
        for (var b = 0; b < ss.length; b++){ var sn = ss[b]; if (!mentions(sn, h)) continue;
          if (/(?:ようとし|かけた|ふり|つもり|ない|なかった|たら|れば|なら)/.test(sn)) continue;
          var sj = bare(sjs[b]), ox = ownerOf(x), why = '';
          if (multi[h] && sj && ox && sj !== ox && holderOf(x) !== sj) continue;   /* 同じ名前の物が 2 つあって、別の人の分の話 */
          /* r3: 誰かが持っている行なのに、本文では「傍らの X」「足元の X」「机の上の X」＝手を離れて置いてある */
          if (x.e.where === '人' && (new RegExp('(?:傍ら|かたわら|脇|そば|足元|足もと|床|机|卓|棚|地面|隅|椅子|台|膝の上)(?:の上)?の[^、。をはがにの]{0,6}' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).test(sn)) why = 'setAside';
          /* その物が目的語（X を／X は／X の取っ手を…）で、すぐ後ろに動きの語がある文（「ランタンの灯りが影を投げる」は数えない） */
          var k0 = sn.indexOf(h), tail = '', mo; while (!why && k0 >= 0 && !tail){ mo = sn.slice(k0 + h.length).match(/^(?:[0-9０-９一二三四五六七八九十]{1,3}[本個枚つ巻冊通束脚])?(?:の[^、。をはがに]{1,6})?(?:を|は)([^。]{0,22})/); if (mo) tail = mo[1]; k0 = sn.indexOf(h, k0 + 1); }
          if (!why && tail){
            var T = MOVE_T.test(tail), H = MOVE_H.test(tail);
            var own = x.e.where === '人' && (!sj || sj === holderOf(x)) && /(?:ポケット|懐|鞄|腰袋|リュック|背嚢|上着)/.test(sn) && !/(?:渡し|渡す|手渡|返し|返す|預け|置い|置き|置く|落と|投げ|放り)/.test(tail);   /* 持ち主が自分のポケットから出す・しまうだけ */
            if (own){ /* 持ち主は変わらない */ }
            else if (x.e.where !== '人'){ if (T || H) why = 'moved'; }
            else if (sj && sj !== holderOf(x)){ if (T || H) why = 'otherHolder'; }   /* r3: 別の人が使った・持った → 持ち主を確定できないので落とす */
            else if (T && RELEASE.test(tail)) why = 'moved';                          /* 持ち主本人（か主語の無い文）が 渡す・置く・落とす・しまう */
            else if (T && !sj && RELEASE.test(tail)) why = 'moved'; }
          if (!why) continue;
          drops[why] = (drops[why] || 0) + 1; items.splice(a, 1); break; } }
    }
    /* 人の行を消す合図:
         (a) 主人公がその場所へ移る入力（feed の hero）／(b) 後の入力がその人に呼びかける（SAY の文頭「A、」）か、その人と一緒に動く（hero.with）／
         (c) 本文の地の文に「A が戻ってきた・引き返してきた・追いついた・合流した・入ってきた」／
         ★r2 (d) 後のターンの本文の地の文で、その人が主語（A が・A は・A も）として動いている（声・物音・階下の様子として出てくる文は除く）
              ＝本文ではもうその場にいる。いない、と言い続けない（不明なら言わない）。 */
    function vocative(pt, w){ var b = bare(w); if (!b) return false; return sentences(pt).some(function(x){ return x.indexOf(b) === 0 && /^(?:さん|先輩|くん|君|ちゃん|様)?[、，,！!？?\s　]/.test(x.slice(b.length) + ' '); }); }
    function cameBack(narr, w){ var b = bare(w); if (!b) return false;
      return narrSents(narr).some(function(x){ if (x.indexOf(b) < 0 || /(?:ない|なかった)/.test(x)) return false;
        if (/(?:戻ってき|戻って来|引き返してき|追いつい|合流し|入ってき|入って来|駆け込んでき|姿を見せ|現れた)/.test(x)) return true;
        var k = x.indexOf(b); return /^(?:さん|先輩|くん|君|ちゃん|様)?(?:は|が|も)/.test(x.slice(k + b.length)) && !/(?:声|聞こえ|階下|下から|上から|向こうから|遠く|電話|足音|物音|気配)/.test(x); }); }
    /* r3 観測: 入力に「物を動かす語・移動の語」があるのに、行が 1 つも作れなかった入力の数（本文は記録しない・件数だけ） */
    var moveIn = 0, moveNoLine = 0, MOVE_IN = new RegExp('(?:' + GIVE + '|' + RECV + '|' + STOW + '|' + DROP + '|持って|持たせ|拾|走|駆け|逃げ|向か|戻る|戻って|入る|入って|上が|下り|降り|出る|出て|移動)');
    function noteInput(text, evs){ if (!MOVE_IN.test(splitQuotesOut(text))) return; moveIn++; if (!evs.some(function(e){ return !(e.kind === 'item' && e.weak); })) moveNoLine++; }
    /* 主人公が動く入力なのに行き先が読めなかったら、前の現在地の行は消す（不明なら言わない） */
    function heroMoved(typ, text, evs){ if (typ !== 'DO' || !heroAt) return; if (evs.some(function(e){ return e.kind === 'hero'; })) return;
      if (/(?:走|駆け|逃げ|進む|進ん|歩い|歩く|上が|上る|上って|下り|降り|出る|出て|入る|入って|戻る|戻って|向か|移動|離れ|渡る|渡って|追い)/.test(splitQuotesOut(text))) { heroAt = null; drops.heroUnreadable = (drops.heroUnreadable || 0) + 1; } }
    for (var i = 0; i < turns.length; i++){
      var t = turns[i] || {}, typ = str(t.inputType).toUpperCase(), pt = str(t.playerText);
      if ((typ === 'DO' || typ === 'STORY') && pt && !isCont(pt)){ var ev1 = parseInput(pt, hero, ctx, typ === 'STORY'); noteInput(pt, ev1); heroMoved(typ, pt, ev1); feed(ev1, i + 1, '入力'); }
      if (nOn){ feed(parseNarr(t.narrative, ctx), i + 1, '本文'); staleDrop(t.narrative, i + 1); }   /* 先に読める文で行を作り直し、残った古い行だけを「動きの語」で落とす */
      for (var p = people.length - 1; p >= 0; p--){ var pe = people[p]; if (i + 1 <= pe.turn) continue;
        if ((typ === 'SAY' && vocative(pt, pe.who)) || (nOn && cameBack(t.narrative, pe.who))) people.splice(p, 1); }
    }
    if (curInput && curInput.text && !isCont(curInput.text)){ var ct = str(curInput.type).toUpperCase(); if (ct === 'DO' || ct === 'STORY'){ var ev2 = parseInput(curInput.text, hero, ctx, ct === 'STORY'); noteInput(curInput.text, ev2); heroMoved(ct, curInput.text, ev2); feed(ev2, turns.length + 1, '入力'); }
      else if (ct === 'SAY'){ for (var q = people.length - 1; q >= 0; q--) if (vocative(curInput.text, people[q].who)) people.splice(q, 1); } }
    return { items: items, people: people, heroAt: heroAt, hero: hero, now: turns.length + 1, drops: drops, moveIn: moveIn, moveNoLine: moveNoLine };
  }
  function lines(L){
    var out = [];
    L.items.forEach(function(it){ var e = it.e, body;
      if (e.ttl && L.now - it.turn > e.ttl){ L.expired = (L.expired || 0) + 1; return; }   /* 本文から読んだ行は 3 ターン（「落とした」は 2 ターン）だけ出す。その後どうなったかは分からないので、行そのものを出さない */
      if (e.where === '人') body = e.who + 'が持っている' + (e.from ? '（' + e.from + 'から）' : '');
      else if (e.where === '場所') body = (e.who ? e.who + 'の' : '') + e.place + 'にある';
      else body = '落とした（誰も持っていない）';
      out.push({ turn: it.turn, s: it.key + (e.n ? '（' + e.n + '）' : '') + '：' + body + '〔' + it.turn + 'ターン目の' + it.src + '「' + short(e.ev, EVID) + '」〕' }); });
    var grp = {}, order = [];   /* 同じターン・同じ行き先の人は 1 行にまとめる */
    L.people.forEach(function(pe){ var k = pe.turn + '|' + pe.mode + '|' + pe.place; if (!grp[k]){ grp[k] = { pe: pe, who: [] }; order.push(k); } grp[k].who.push(pe.who); });
    order.forEach(function(k){ var pe = grp[k].pe, body; if (pe.mode === 'spot' && L.now - pe.turn > 1) return;   /* 同じ部屋の中の立ち位置（窓辺へ行く）は次のターンまで */
      body = pe.mode === 'spot' ? (pe.place + 'にいる') : pe.mode === 'left' ? (pe.place + 'に残った（' + (L.hero || '主人公') + 'と一緒にいない）') : pe.mode === 'sent' ? (pe.place + 'へ向かった（この場にいない）') : ((pe.place ? pe.place + 'へ行った' : '去った') + '（この場にいない）');
      out.push({ turn: pe.turn, s: grp[k].who.join('・') + '：' + body + '〔' + pe.turn + 'ターン目の' + pe.src + '〕' }); });
    /* ★r2: 主人公の現在地の行。入力で主人公が動いたターンと次の 2 ターンだけ出す（後の移動を拾い損ねても、古い場所を「いま」と言い続けない） */
    if (L.heroAt && L.now - L.heroAt.turn <= HERO_TTL) out.push({ turn: L.heroAt.turn, s: (L.hero || '主人公') + 'のいまの場所：' + L.heroAt.place + '〔' + L.heroAt.turn + 'ターン目の入力「' + short(L.heroAt.ev, EVID) + '」〕' });
    out.sort(function(a, b){ return a.turn - b.turn; });
    /* 新しい方を優先して 6 行・360 字まで（古い方から落とす）。並びは古い順 */
    var keep = [], used = 0;
    for (var i = out.length - 1; i >= 0 && keep.length < MAX_ITEMS; i--){ if (used + out[i].s.length > MAX_CHARS) break; used += out[i].s.length; keep.unshift(out[i].s); }
    return keep;
  }

  var _last = null, _obs = { ver: VER, applies: 0, withLines: 0, last: null };   /* r3 観測（件数だけ。本文・入力の文は入れない） */
  function apply(parsed, state){
    _last = { on: on(), items: 0, chars: 0 };
    if (!_last.on || !parsed) return parsed;
    try {
      var L = build(state, parsed.currentInput), ls1 = lines(L);
      _last.raw = { items: L.items.length, people: L.people.length, hero: L.heroAt ? L.heroAt.place : '' };
      var dr = {}, dk; for (dk in L.drops) dr[dk] = L.drops[dk]; if (L.expired) dr.expired = L.expired;
      _obs.applies++; if (ls1.length) _obs.withLines++;
      _obs.last = { turn: L.now, lines: ls1.length, chars: ls1.join('').length, dropped: dr, inputsWithMoveWords: L.moveIn, inputsWithMoveWordsNoLine: L.moveNoLine };
      if (!ls1.length) return parsed;
      var blk = { rule: RULE, items: ls1 }, o = {}, k, placed = false, anchor = Object.prototype.hasOwnProperty.call(parsed, 'nowScene') ? 'nowScene' : 'recentScenes';
      for (k in parsed){ if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'whereNow') continue; o[k] = parsed[k]; if (k === anchor){ o.whereNow = blk; placed = true; } }
      if (!placed) o.whereNow = blk;
      _last.items = ls1.length; _last.chars = ls1.join('').length; _last.lines = ls1;
      return o;
    } catch(e){ _last.err = str(e && e.message || e); return parsed; }
  }
  root.__v292DfixPLACE1 = { VER: VER, on: on, narrOn: narrOn, apply: apply, build: build, lines: lines, parseInput: parseInput, parseNarr: parseNarr, makeCtx: makeCtx, RULE: RULE,
    obs: function(){ return JSON.parse(JSON.stringify(_obs)); },   /* r3: 読み取り専用。{ ver, applies, withLines, last:{ turn, lines, chars, dropped:{理由:件数}, inputsWithMoveWords, inputsWithMoveWordsNoLine } }。dropped は物語の最初からの通算（毎回作り直すので）。 */
    last: function(){ return _last; }, status: function(){ return { ver: VER, on: on(), narr: narrOn(), last: _last }; } };
})(typeof window !== 'undefined' ? window : globalThis);
