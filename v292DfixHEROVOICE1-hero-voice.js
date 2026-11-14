/* =====================================================================
 * v292DfixHEROVOICE1-hero-voice.js — 物語ごとに「主人公の台詞と反応」をどこまで AI に書かせるかを選ぶ（★HEROVOICE1・laneHEROVOICE1 2026-11-12 → laneHV2 2026-11-14 に 6b22963〔20261114-guide1〕へ載せ直し）
 * ---------------------------------------------------------------------
 * ■なぜ（Owner 2026-11-12）
 *   「主人公が喋る喋らないって設定か調整のところにスイッチ作って切り替えれるようにできる？」
 *   「エネミーから剣で刺されても反応ないからRPG感ないとかあるんよね」
 *   いまは主人公の台詞・内面を書かせない指示（fix417・AGENCY1/1b・CONT1・ACTOR1b）と出口の主人公ロック（parsePlan）が全物語に一律にかかる。
 *   一方で一人称の物語では「頼んでいない主人公の台詞」がいちばん多い誤り（FLOWBENCH pass 1）。→ 全体を変えず、物語ごとの選択にする。
 * ■3 つのモード（enum。4 つ目を足すときは MODES と各表に 1 行足す）
 *   C おまかせ（既定）        : 今の動き（HV を入れる前と送信も保存も同じ）。新しい物語も既存の物語もこれ（Owner 決定）。
 *   A よく喋る・反応する      : 主人公の台詞・反応・内面は場面に必要なら書いてよい。次の大きな行動・決断と場面の決着は書かない。
 *   B 控えめに喋る（旧名：自分からは喋らない。Owner 11-14「多少喋る分にはいい・名前を直す」）: 痛み・驚きなどの体の反応と、10 字程度までの短い反射的な声だけ。会話・提案・決定の台詞は書かない（入力した台詞はそのまま出る）。
 *   （画面の名前は laneHV2 で付け直した。2026-11-12 の試作では A=おまかせ／B=反応だけ／C=入力したときだけ。値 A/B/C と中身は同じ）
 * ■保存（新しい保存形式を作らない）
 *   この端末の localStorage に物語ごとに 1 キー:  v292DfixHEROVOICE1:<物語キー>  = 'A' | 'B'（C は消す＝キーなし）。
 *   物語の本体（S / S.cfg）・クラウド・Worker・削除・Vault の経路には何も書かない。→ 別の端末（iPhone）には伝わらない（既知の制限）。
 *   物語キーは fix694 の document の物語キー（window.__chronicleDocumentStoryKey）。無い画面（ホームなど）では C・UI なし。
 * ■どこで効くか
 *   (1) 送信直前（fetch 境界。CP1-final-tap の外側・ACTOR1 の内側＝PRUNE1/PRUNE2/ACTOR1 の後）で、sys の決まった文を置き換える（表 SYS_REWRITE）。
 *       モード C では body に触れない（JSON も読まない）＝送信バイト同一。
 *   (2) 出口: index.html Planner.parsePlan の主人公ロックが lockMode() を聞き、A/B なら lockFilter() に任せる（C は従来のまま）。
 *   (3) ACTOR1(b)（台詞の無い回の「主人公の台詞を書かない」）は C のときだけ動く（ACTOR1 の flags() が mode() を聞く）。FF2p も同じ場所なので C だけ。
 * ■止める
 *   v292DfixHEROVOICE1Off='1' … 保存した選択に関係なく C（f2b6d56 と同じ）。UI も出さない。毎回評価・再読み込み不要。
 *   v292DfixHEROVOICE1Force='A'|'B'|'C' … この端末の全物語で一時的に上書き（A/B 試験の腕。試験が終わったら消す）。
 * ■診断（本文・入力文・名前・物語 ID は残さない）: window.__v292DfixHEROVOICE1.status()
 * ===================================================================== */
(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : globalThis;
  if (G.__v292DfixHEROVOICE1) return;
  var VER = 'herovoice1-20261114-a', TAG = '[v292DfixHEROVOICE1]';
  var KILL = 'v292DfixHEROVOICE1Off', FORCE = 'v292DfixHEROVOICE1Force', KPFX = 'v292DfixHEROVOICE1:';

  /* ---------------- モード（enum） ---------------- */
  var DEFAULT = 'C';
  var ORDER = ['C', 'A', 'B'];   /* 画面に並べる順（既定が先頭） */
  var MODES = {
    A: { label: 'よく喋る・反応する', note: '主人公の台詞や、痛み・驚きの反応もAIが書く。大事な行動や決断はあなたが決める' },
    B: { label: '控えめに喋る', note: '主人公の台詞は主にあなたが入力する。短い声や呟き、痛み・驚きの反応はAIが書くことがある' },
    C: { label: 'おまかせ', note: 'ふつうの設定（今までどおり）' }
  };
  function valid(m) { return typeof m === 'string' && Object.prototype.hasOwnProperty.call(MODES, m); }

  function ls(k) { try { return G.localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return ls(KILL) === '1'; }
  function storyKey() {
    try { var dk = G.__chronicleDocumentStoryKey; if (typeof dk === 'string' && dk) return dk; } catch (e) {}
    try { var u = (String(G.location && G.location.search || '').match(/[?&]story=([A-Za-z0-9_-]{1,80})/) || [])[1]; if (u) return 'chr6_slot_' + u; } catch (e) {}
    return null;
  }
  function stored(k) { if (!k) return null; var v = ls(KPFX + k); return (valid(v) && v !== DEFAULT) ? v : null; }
  function mode() {
    if (killed()) return DEFAULT;
    var f = ls(FORCE); if (valid(f)) return f;
    var s = stored(storyKey()); return s || DEFAULT;
  }
  function setMode(m) {
    if (!valid(m) || killed()) return false;
    var k = storyKey(); if (!k) return false;
    try { if (m === DEFAULT) G.localStorage.removeItem(KPFX + k); else G.localStorage.setItem(KPFX + k, m); } catch (e) { return false; }
    st.changes++; st.lastSet = m; return true;
  }

  /* ---------------- (1) 送信直前の sys の置き換え（純粋関数） ---------------- */
  /* old は f2b6d56 の送信文に「ちょうど 1 回」あるときだけ置き換える（無い・2 回以上＝何もしない。ops に残らない）。
     new が null の行はそのモードでは触らない。'' は消す。 */
  var S417 = '主人公には身体上の制約だけを適用し、内面・台詞・意図は決めない。';                                   /* fix417 【反応と身体】（全種類の回） */
  var SAG = '入力されていない主人公の意図・発話内容を勝手に確定しない。';                                          /* AGENCY1（SAY/DO の入力説明の行） */
  var SAGS = 'プレイヤーが台詞を入力していないターンでは、主人公の台詞（「」）を書かない。主人公は表情・視線・小さな動作などの描写にとどめ、言葉はプレイヤーに残す。';   /* AGENCY1b 版 A（STORY・続き・オート） */
  var SAGSB = 'プレイヤーが台詞を入力していないターンでは、主人公の台詞は短いひと言の反応（10字程度まで）にとどめ、新しい提案・決定・情報を主人公に言わせない。';           /* AGENCY1b 版 B（端末キー StoryMode=B のとき） */
  var SMONO = '主人公しかいない場面では、独白・つぶやき・心の声で内面を見せてよい。';                                /* fix192 【良い1ターンの形】4 */
  var SCONT = '決定的な行動（救出・脱出・攻撃・重大な決断）は書かず、知覚と身体の反射までにとどめて次の一手をプレイヤーに残す。';   /* CONT1（続きを書く） */
  var SCONTL = '主人公に重要な台詞も言わせない。';                                                                  /* CONT1 の添え文（AGENCY1b が無いときだけ） */
  var NEW = {
    A: {
      S417: '主人公にも身体上の制約と、受傷・衝撃への反応を適用する。主人公の台詞・反応・内面は場面に必要なら書いてよいが、主人公の次の大きな行動・決断と場面の決着は決めず、プレイヤーに残す。',
      SAG: '入力されていない主人公の意図や次の行動を勝手に確定しない（場面に必要な主人公の台詞・反応は書いてよいが、入力の台詞を言い換えて繰り返さない）。',
      SAGS: '主人公の台詞や反応は、場面に必要なら書いてよい。ただし主人公の次の大きな行動・決断と場面の決着は書かず、プレイヤーに残す。',
      SAGSB: '主人公の台詞や反応は、場面に必要なら書いてよい。ただし主人公の次の大きな行動・決断と場面の決着は書かず、プレイヤーに残す。',
      SMONO: null,
      SCONT: '決定的な行動（救出・脱出・攻撃・重大な決断）は書かず、知覚・身体の反射・その場の台詞までにとどめて次の一手をプレイヤーに残す。',
      SCONTL: ''
    },
    B: {
      S417: '主人公にも身体上の制約と、受傷・衝撃への反応を適用する。受傷・衝撃・驚きの直後は、主人公の体の反応（うめき・よろめき・息・こわばり）と、10字程度までの短い反射的な声を書く。主人公の会話・提案・決定・次の行動は決めない。',
      SAG: '入力されていない主人公の意図・発話内容を勝手に確定しない（痛み・驚きなどの短い反射的な声と体の反応だけは書いてよい）。',
      SAGS: SAGSB,          /* 既存の版 B の文（統括追加・AGENCY1）をそのまま使う */
      SAGSB: null,
      SMONO: '',            /* 独白・つぶやきは会話の台詞に当たるので B では外す（ACTOR1b と同じ扱い） */
      SCONT: null,
      SCONTL: null
    }
  };
  var TABLE = [['S417', S417], ['SAG', SAG], ['SAGS', SAGS], ['SAGSB', SAGSB], ['SMONO', SMONO], ['SCONT', SCONT], ['SCONTL', SCONTL]];
  function cnt(h, n) { var c = 0, k = 0; if (!n) return 0; while ((k = h.indexOf(n, k)) >= 0) { c++; k += n.length; } return c; }
  function isStorySys(s) { return typeof s === 'string' && s.length > 1500 && s.indexOf('＜あなたの役割＞') >= 0 && s.indexOf('【出力の形式（これだけは形式として守る）】') >= 0; }
  function rewriteSys(sys, m) {
    var ops = [];
    if (m === DEFAULT || !NEW[m] || !isStorySys(sys)) return { sys: sys, ops: ops };
    var s = sys;
    TABLE.forEach(function (row) {
      var id = row[0], old = row[1], nw = NEW[m][id];
      if (nw === null || nw === undefined) return;
      if (cnt(s, old) !== 1) return;
      s = s.replace(old, function () { return nw; });
      ops.push(id);
    });
    /* B の「続きを書く」：CONT1 の添え文「主人公に重要な台詞も言わせない。」を必ず 1 回付ける（CONT1 は AGENCY1b の文が無いときだけ付けるので、
       AGENCY1b の文を B の文に置き換えた後に CONT1 が走る順〔A/B 試験のタブ〕でも、その前に走る順〔出荷〕でも、同じ送信になる）。 */
    if (m === 'B' && cnt(s, SCONT) === 1 && s.indexOf(SCONT + SCONTL) < 0 && cnt(s, SCONTL) === 0) { s = s.replace(SCONT, function () { return SCONT + SCONTL; }); ops.push('SCONTL+'); }
    return { sys: s, ops: ops };
  }
  function userInput(u) {   /* user の JSON（末尾の逐語反映の前まで）から この回の入力・主人公 を読む（ACTOR1 と同じ読み方） */
    try {
      var i = u.indexOf('\n\n━'); var j = JSON.parse(i < 0 ? u : u.slice(0, i));
      var ci = j && j.currentInput, p = j && j.cast && j.cast.protagonist;
      return { type: ci && ci.type || null, text: ci && typeof ci.text === 'string' ? ci.text : '', hero: p && typeof p.name === 'string' ? p.name : '', desc: p && typeof p.desc === 'string' ? p.desc : '' };
    } catch (e) { return null; }
  }
  var LASTIN = null;   /* 出口の B 規則用（この回の入力。保存しない・status に出さない） */
  function rewriteBody(body, stringify, forceMode) {   /* forceMode: A/B 試験のタブだけ（ovHV.js）。出荷の経路は渡さない */
    var m = valid(forceMode) ? forceMode : mode();
    if (m === DEFAULT) { st.sendC++; return body; }                 /* C: 読まない・触らない */
    if (typeof body !== 'string' || body.length < 2000 || body.indexOf('＜あなたの役割＞') < 0) return body;
    var b = JSON.parse(body);
    if (!b || !Array.isArray(b.messages) || !b.messages.length) return body;
    var si = -1, ui = -1, i;
    for (i = 0; i < b.messages.length; i++) { var x = b.messages[i]; if (x && x.role === 'system' && typeof x.content === 'string') { si = i; break; } }
    if (si < 0 || !isStorySys(b.messages[si].content)) return body;
    for (i = b.messages.length - 1; i > si; i--) { var y = b.messages[i]; if (y && y.role === 'user' && typeof y.content === 'string') { ui = i; break; } }
    if (ui >= 0) LASTIN = userInput(b.messages[ui].content);
    var r = rewriteSys(b.messages[si].content, m);
    st.sends++; st.lastOps = r.ops.slice(); st.lastMode = m;
    r.ops.forEach(function (o) { st.ops[o] = (st.ops[o] || 0) + 1; });
    if (!r.ops.length) { st.noAnchor++; return body; }
    b.messages[si].content = r.sys;
    return (stringify || JSON.stringify)(b);
  }

  /* ---------------- (2) 出口（parsePlan の主人公ロック）。純粋関数 ---------------- */
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function sents(line) {   /* 「」の中では切らない文の区切り（FF1a と同じ考え方） */
    var out = [], d = 0, b = 0, i;
    for (i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '「' || ch === '『') d++;
      else if ((ch === '」' || ch === '』') && d > 0) d--;
      else if (d === 0 && /[。！？!?]/.test(ch)) { var e = i + 1; while (e < line.length && /[。！？!?」』）)]/.test(line[e])) e++; out.push([b, e]); b = e; i = e - 1; }
    }
    if (b < line.length) out.push([b, line.length]);
    return out;
  }
  function norm(s) { return String(s || '').replace(/[\s　、。．，！？!?…‥・ー〜―—「」『』（）()〈〉]/g, ''); }
  /* B: 残してよい「反射的な短い声」か。core = 記号を除いた中身。 */
  var DECIDE = /([えけげせぜてでねべめれ]ろ|しろ|せよ|しよう|しましょう|ましょう|ろう|こう[!！]?$|てくれ|ください|下さい|来い|行け|待て|止まれ|やめろ|伏せろ|走れ|離れろ|逃げろ|下がれ|任せ|頼む|行く|やる|決め|俺が|私が|僕が|あたしが)/;
  function isReaction(q, others) {
    var core = norm(q);
    if (!core.length) return true;                                            /* 「……！」など */
    if (core.length > 10) return false;
    if ((others || []).some(function (n) { return n && core.indexOf(norm(n)) >= 0; })) return false;   /* 誰かに呼びかけている＝会話 */
    if (/[?？]/.test(q) && !/[!！]/.test(q) && core.length >= 4) return false;                          /* 問いかけ＝会話 */
    if (DECIDE.test(core)) return false;                                                                 /* 指示・申し出・決定 */
    return true;
  }
  function fromInput(q, inText) { var a = norm(q), b = norm(inText); return !!(a.length >= 2 && b.length >= 2 && (b.indexOf(a) >= 0 || a.indexOf(b) >= 0)); }
  /* 入力そのものが「話しかける・尋ねる…」行動なら、その回の主人公の台詞は入力の実現として残す（B でも入力は削らない） */
  var SPEAK_IN = /(声をかけ|声を掛け|話しかけ|話し掛け|尋ね|訊|聞く|聞いて|聞き|言う|言って|頼む|頼んで|呼び|呼ぶ|叫|話す|伝え|打ち明け|告げ|謝|礼を|説明|答え|問いかけ|問う|誘)/;
  var SPEECH = '(?:言|呟|囁|尋|問|答|叫|返|応|告|呼|続|笑|声を|頼|促|うめ|呻|漏ら|絞り出)';
  /* 出荷版 FF1a（index.html parsePlan・20261112-ui4ff1gc1〜）の「台詞でない「」」の判定を写したもの（式を変えたら両方を合わせる） */
  var SP1A = '言|叫|呟|囁|答|告|問|尋|怒鳴|返|続け|頷|笑|声';
  var NONSP1A = new RegExp('^(?:と|って)?(?:だけ|のみ)?(?:(?!' + SP1A + ')[^。「」\\n]){0,6}?(?:書か|書い|書き|記さ|記し|刻ま|刻ん|彫ら|彫っ|印字|印刷|表示|貼ら|掲げ|描か|綴ら|浮か|読め|読みと|読み取)'
    + '|^(?:と|って)(?:だけ|のみ)?あ(?:る|った|り[、，。])'
    + '|^(?:という|といった|との|を|の|が|は|も|に|へ|で|や|と[、，]?[^。「」\\n]{0,3}?(?:並|同|一緒))(?![^。「」\\n]{0,5}?(?:' + SP1A + '|繰り返|口に|口走|告げ|読み上げ|合図))');
  var SIGN1A = /(?:看板|張り紙|貼り紙|貼紙|表札|名札|札|メモ|画面|表示|ラベル|掲示|標識|プレート|案内板|文字)(?:の|に|には|にも|で|では|、|，|：|:)?$/;
  /* 1 行の中の「主人公の声」を探す。返り値 [{kind:'say'|'pre'|'post', at, end, q}] */
  function heroQuotes(s, hero, fp, others) {
    var out = [], m;
    var rxSay = /([^]*)([^]*)|<say\s+who=["']([^"']*)["']\s*>([\s\S]*?)<\/say>/g;
    while ((m = rxSay.exec(s))) { var who = (m[1] != null ? m[1] : m[3] || '').trim(); if (who === hero) out.push({ kind: 'say', at: m.index, end: m.index + m[0].length, q: m[1] != null ? m[2] : m[4] }); }
    var subj = [hero].concat(fp ? [fp] : []).map(esc).join('|');
    var rxPre = new RegExp('(?:' + subj + ')[はが]([^「。]*)「([^」]*)」', 'g');
    while ((m = rxPre.exec(s))) {
      var mid = m[1]; if ((others || []).some(function (n) { return new RegExp(esc(n) + '[はがも]').test(mid); })) continue;   /* CL1-e と同じ：別の人物が主語 */
      var qa = m.index + m[0].length - m[2].length - 2;
      var post = s.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (NONSP1A.test(post)) continue;   /* 書かれた文字・名前・語の引用＝台詞ではない（出荷版 FF1a〔index.html parsePlan〕の _nonSp1a と同じ式） */
      if (SIGN1A.test(mid)) continue;     /* 看板・張り紙・表札・メモ・画面・ラベル などの文字の引用（同 _sign1a） */
      out.push({ kind: 'pre', at: qa, end: qa + m[2].length + 2, q: m[2] });
    }
    var rxPost = new RegExp('「([^」]*)」(?:と|って)?[、，\\s　]*(?:' + subj + ')(?:は|が|も)[^。「」]{0,12}?' + SPEECH, 'g');
    while ((m = rxPost.exec(s))) { if (!out.some(function (o) { return o.at === m.index; })) out.push({ kind: 'post', at: m.index, end: m.index + m[1].length + 2, q: m[1] }); }
    var rxVoice = new RegExp('「([^」]*)」(?:と)?[、，\\s　]*(?:' + subj + ')の(?:声|言葉|返事|囁き|呟き|うめき|呻き)', 'g');
    while ((m = rxVoice.exec(s))) { if (!out.some(function (o) { return o.at === m.index; })) out.push({ kind: 'post', at: m.index, end: m.index + m[1].length + 2, q: m[1] }); }
    return out;
  }
  /* SAY の回に AI が足した主人公の攻撃（f2b6d56 の rxAct のうち、主人公が「を」で受け身の文・うめき・押さえる・握る・掴むは外す）。消すのは 1 文だけ。 */
  function actRx(hero) { return new RegExp(esc(hero) + '[はが](?:(?!「).){0,20}?(殴|刺|捕まえ|蹴|縛)'); }
  function lockFilter(narr, o) {
    try {
      o = o || {}; var m = o.mode, hero = o.hero; if (!Array.isArray(narr) || !hero || (m !== 'A' && m !== 'B')) return narr;
      var others = (o.npcs || []).filter(function (n) { return n && n !== hero; });
      var fpm = typeof o.heroDesc === 'string' ? o.heroDesc.match(/一人称は「([^」]{1,4})」/) : null; var fp = fpm ? fpm[1] : '';
      var inText = (o.inputText != null) ? String(o.inputText) : ((LASTIN && LASTIN.hero === hero) ? LASTIN.text : '');
      var stats = { act: 0, kept: 0, dropped: 0 };
      var rx = actRx(hero);
      var out = narr.map(function (s) {
        if (typeof s !== 'string') return s;
        var t = s;
        if (o.inputType === 'SAY' && rx.test(t)) {
          t = sents(t).filter(function (r) { var x = t.slice(r[0], r[1]); return !(rx.test(x) && !fromInput(x, inText)); }).map(function (r) { return t.slice(r[0], r[1]); }).join('');
          if (t !== s) stats.act++;
        }
        if (m === 'B') {
          var hq = heroQuotes(t, hero, fp, others), dropSay = [], dropAt = [];
          hq.forEach(function (h) {
            if (fromInput(h.q, inText) || isReaction(h.q, others) || (o.inputType !== 'SAY' && SPEAK_IN.test(inText))) { stats.kept++; return; }
            stats.dropped++; if (h.kind === 'say') dropSay.push(h); else dropAt.push(h.at);
          });
          if (dropSay.length) { dropSay.sort(function (a, b) { return b.at - a.at; }).forEach(function (h) { t = t.slice(0, h.at) + t.slice(h.end); }); }
          if (dropAt.length) {
            var hq2 = heroQuotes(t, hero, fp, others).filter(function (h) { return h.kind !== 'say' && !fromInput(h.q, inText) && !isReaction(h.q, others) && !(o.inputType !== 'SAY' && SPEAK_IN.test(inText)); }).map(function (h) { return h.at; });
            t = sents(t).filter(function (r) { return !hq2.some(function (q) { return q >= r[0] && q < r[1]; }); }).map(function (r) { return t.slice(r[0], r[1]); }).join('');
          }
        }
        return t === s ? s : t.trim();
      }).filter(function (s) { return typeof s !== 'string' || s.length > 0; });
      st.lock[m] = (st.lock[m] || 0) + 1; st.lockAct += stats.act; st.lockKept += stats.kept; st.lockDropped += stats.dropped;
      return out;
    } catch (e) { st.err++; return narr; }
  }
  function lockMode() { return mode(); }

  /* ---------------- (3) fetch 境界 ---------------- */
  var st = { sends: 0, sendC: 0, noAnchor: 0, ops: {}, lastOps: null, lastMode: null, err: 0, changes: 0, lastSet: null, lock: {}, lockAct: 0, lockKept: 0, lockDropped: 0, ui: 0 };
  var of = G.fetch;
  if (typeof of === 'function') {
    var wrapped = function (u, o) {
      try {
        if (o && o.method === 'POST' && typeof o.body === 'string' && /workers\.dev|openrouter/.test(String(u))) {
          var nb = rewriteBody(o.body);
          if (nb !== o.body) o = Object.assign({}, o, { body: nb });
        }
      } catch (e) { st.err++; try { console.warn(TAG, 'skipped:', e && e.message); } catch (_) {} }
      return of.apply(this, [u, o]);
    };
    try { Object.keys(of).forEach(function (k) { wrapped[k] = of[k]; }); } catch (e) {}
    wrapped.__fHEROVOICE1 = true;
    G.fetch = wrapped;
  }

  /* ---------------- (4) 画面：「🎛 調整」と「⚙ 設定 → 詳細設定」に同じ欄 ---------------- */
  var LABEL = '主人公はどれくらい喋る？';
  var CSS = [
    '.hv1-wrap{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;margin-right:6px;font-size:12px;color:var(--dim,#888);max-width:100%}',
    '.hv1-wrap .hv1-cap{font-size:10px;white-space:nowrap;opacity:.85}',
    '.hv1-wrap select{background:var(--s2,#222);color:var(--tx,#eee);border:1px solid var(--border,#444);border-radius:6px;padding:3px 6px;font-size:12px;cursor:pointer;max-width:190px}',
    '.hv1-wrap .hv1-note{font-size:10.5px;line-height:1.35;color:var(--dim,#9999b8);white-space:normal;max-width:240px}',
    '#settingsPanel .hv1-wrap.v880-knob{display:flex;flex-direction:column;align-items:stretch;gap:4px}',
    '#settingsPanel .hv1-wrap .hv1-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
    '#settingsPanel .hv1-wrap .hv1-row > span:first-child{opacity:.8;white-space:nowrap}',
    '#settingsPanel .hv1-wrap select{min-width:130px}',
    '#settingsPanel .hv1-wrap .hv1-list{margin:0;padding:0;list-style:none;font-size:11px;line-height:1.5;color:var(--dim,#9999b8)}',
    '#settingsPanel .hv1-wrap .hv1-list li{opacity:.75;padding-left:1.2em;text-indent:-1.2em}',
    '#settingsPanel .hv1-wrap .hv1-list li::before{content:"・"}',
    '#settingsPanel .hv1-wrap .hv1-list li.hv1-on{color:var(--tx,#e0def0);opacity:1;font-weight:600}',
    '#settingsPanel .hv1-wrap .hv1-list li.hv1-on::before{content:"▶"}',
    '@media (max-width:520px){html body #topbar > #hv1-adj{flex:1 1 100% !important;align-items:center}html body #topbar > #hv1-adj .hv1-note{max-width:none;text-align:center}#settingsPanel .hv1-wrap .hv1-row select{flex:1 1 100%;max-width:none}}'
  ].join('\n');
  function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }
  function injectCss() { try { var s = $('hv1-style'); if (!s) { s = document.createElement('style'); s.id = 'hv1-style'; (document.head || document.documentElement).appendChild(s); } if (s.textContent !== CSS) s.textContent = CSS; } catch (e) {} }
  function mkSelect(id) {
    var sel = document.createElement('select'); sel.setAttribute('data-hv1', id); sel.setAttribute('aria-label', LABEL);
    ORDER.forEach(function (k) { var op = document.createElement('option'); op.value = k; op.textContent = MODES[k].label; sel.appendChild(op); });
    return sel;
  }
  /* 「🎛 調整」：画風・アイコンと同じ「小さい見出し＋select」。下に今のモードの一行説明。
     「⚙ 設定 → 詳細設定」：見出しと select を 1 行に、下に 3 つのモードの一行説明（今のモードを明るく）。 */
  function mkWrap(id, inSettings) {
    var w = document.createElement('span'); w.id = id; w.className = 'hv1-wrap' + (inSettings ? ' v880-knob' : '');
    w.title = ORDER.map(function (k) { return MODES[k].label + '：' + MODES[k].note; }).join('\n') + '\n（この物語だけの設定です。この端末に保存され、次のターンから変わります）';
    var sel = mkSelect(id);
    sel.addEventListener('change', function () { if (setMode(sel.value)) { syncAll(); flash(w); } else syncAll(); });
    var note = document.createElement('span'); note.className = 'hv1-note';
    if (inSettings) {
      var row = document.createElement('span'); row.className = 'hv1-row';
      var lab = document.createElement('span'); lab.textContent = '🗣 ' + LABEL;
      row.appendChild(lab); row.appendChild(sel); w.appendChild(row);
      var ul = document.createElement('ul'); ul.className = 'hv1-list';
      ORDER.forEach(function (k) { var li = document.createElement('li'); li.setAttribute('data-hv1-mode', k); li.textContent = MODES[k].label + '：' + MODES[k].note; ul.appendChild(li); });
      w.appendChild(ul); w.appendChild(note);
    } else {
      var cap = document.createElement('span'); cap.className = 'hv1-cap'; cap.textContent = '🗣 ' + LABEL;
      w.appendChild(cap); w.appendChild(sel); w.appendChild(note);
    }
    return w;
  }
  function flash(w) { try { var n = w.querySelector('.hv1-note'); if (!n) return; n.setAttribute('data-hv1-flash', '1'); n.textContent = (w.id === 'hv1-set' ? '' : MODES[mode()].note) + '（次のターンから変わります）'; clearTimeout(n.__t); n.__t = setTimeout(function () { try { n.removeAttribute('data-hv1-flash'); syncAll(); } catch (e) {} }, 5000); } catch (e) {} }
  function syncAll() {
    var m = mode(), forced = valid(ls(FORCE));
    ['hv1-adj', 'hv1-set'].forEach(function (id) {
      var w = $(id); if (!w) return; var sel = w.querySelector('select'), n = w.querySelector('.hv1-note');
      if (sel && document.activeElement !== sel && sel.value !== m) sel.value = m;
      if (sel) sel.disabled = forced;
      var lis = w.querySelectorAll('li[data-hv1-mode]'); for (var i = 0; i < lis.length; i++) { var on = lis[i].getAttribute('data-hv1-mode') === m; if (lis[i].classList.contains('hv1-on') !== on) lis[i].classList.toggle('hv1-on', on); }
      if (n && !n.getAttribute('data-hv1-flash')) { var t = (id === 'hv1-set' ? '' : MODES[m].note) + (forced ? '（試験用の上書き中）' : ''); if (n.textContent !== t) n.textContent = t; }
    });
  }
  function place() {
    var bar = $('topbar'), tg = $('v243-toggle');
    var a = $('hv1-adj'), s = $('hv1-set');
    if (killed() || !storyKey()) { if (a && a.parentNode) a.parentNode.removeChild(a); if (s && s.parentNode) s.parentNode.removeChild(s); return; }
    if (bar && tg && tg.parentNode === bar) {   /* 「🎛 調整」（fix243 の折りたたみ）＝画風（fg3/B37-F）と同じ置き方 */
      if (!a) { a = mkWrap('hv1-adj', false); st.ui++; }
      if (a.parentNode !== bar) { var ap = $('v292-artpreset-wrap'); if (ap && ap.parentNode === bar) bar.insertBefore(a, ap.nextSibling); else bar.insertBefore(a, tg.nextSibling); }
      if (!a.classList.contains('v243-foldable')) a.classList.add('v243-foldable');
    }
    var kn = document.querySelector('#v880-detail .v880-knobs');   /* 「⚙ 設定 → 詳細設定」（📖 進行・🗨 セリフ・🎭 トーンなど物語ごとの欄が並ぶ所） */
    if (kn) { if (!s) { s = mkWrap('hv1-set', true); st.ui++; } if (s.parentNode !== kn) kn.appendChild(s); }
    syncAll();
  }
  function tick() { try { injectCss(); place(); } catch (e) { st.err++; } }
  function boot() { if (G.__HV1_NO_UI) return; tick(); try { setInterval(tick, 1000); } catch (e) {} try { G.addEventListener('storage', function () { setTimeout(syncAll, 30); }); } catch (e) {} }
  try { if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); } } catch (e) {}

  G.__v292DfixHEROVOICE1 = {
    VER: VER, MODES: MODES, ORDER: ORDER, mode: mode, setMode: setMode, lockMode: lockMode, lockFilter: lockFilter,
    rewriteSys: rewriteSys, rewriteBody: rewriteBody, _setLastInput: function (x) { LASTIN = x || null; }, isReaction: isReaction, heroQuotes: heroQuotes, NEW: NEW,
    OLD: { S417: S417, SAG: SAG, SAGS: SAGS, SAGSB: SAGSB, SMONO: SMONO, SCONT: SCONT, SCONTL: SCONTL },
    status: function () { var o = JSON.parse(JSON.stringify(st)); o.ver = VER; o.mode = mode(); o.killed = killed(); o.forced = valid(ls(FORCE)) ? ls(FORCE) : null; o.hasStoryKey = !!storyKey(); return o; }
  };
  try { console.log(TAG, 'armed', VER); } catch (e) {}
})();
