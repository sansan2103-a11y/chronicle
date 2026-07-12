// =====================================================================
// Chronicle TRPG - v292Dfix427: 本文への内部メモ漏れ / 会話ログの話者誤帰属
// ---------------------------------------------------------------------
// 背景(2026-07-12・実スロット smrg85jwsn6 の最終ターンで実測):
//   モデルが <say> も <state> も一切使わずに出力した。その結果2つの事故が同時に起きた。
//
//   (a) 内部メモ漏れ: narrative 末尾に状態プロトコルが【平文】で残った。
//       実物: "こころ=\n思考:\n[手段]\nこの程度じゃ…\n目的=\n…\n関係＝\n白石澪:\n…\n//秘密保持:青信号"
//       ・リテラルの \n(バックスラッシュ+n)が文字列として混在する
//       ・全角イコール ＝ も混じる
//       ・既存の除去ガード(fix175/fix271/fix322)は全て <state …> という【タグ前提】の正規表現。
//         タグが無いと素通しする。これが真因。
//   → 実装A: タグ非依存の【行単位】サニタイザ。parsePlan を全extension適用後にラップし、
//      保存前(=履歴に残る前)に落とす。安全弁: 本文が半分未満に縮むなら適用中止。
//
//   (b) 話者誤帰属: <say> が無いのでシステムが地の文から話者を推測しフォールバックした。
//       裸の「」が【連続】しているとき、後ろの1つだけが直後の地の文から正しく帰属され、
//       前の1つは「直前に喋った人」を引き継いで誤る(実測2箇所)。実際は両方とも同一話者。
//   → 実装B: 既存の帰属パイプラインは【書き換えず】後処理で補正(fix385「逆打ち」と同じ思想)。
//      S.save の直前に、確定済みの _convSays を narrative と突き合わせて連続ブロックを統一。
//      補正前は t.__f427prev に退避(ロールバック可能)。
//      ★<say>タグが1つでも使われたターンには一切触らない(正常ターンの破壊を構造的に防ぐ)。
//
//   実装C: sys へ一文追加(keeper prio2・__f379reg 経由。Planner._extensionsは死に経路のため不使用)。
//
// OFF: localStorage v292Dfix427Off='1'(全停止=A/B/C すべて)
//      localStorage v292Dfix427TailOff='1'(B の規則(b)=末尾話者フォールバックだけ停止)
// 冪等ガード: window.__v292Dfix427
// 検証口: window.__v292Dfix427 = { sanitizeNarrative, regroupSpeakers, ... }(pure関数・node可)
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window
        : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix427) return;              // 冪等(二重実行回避)
  var TAG = '[v292Dfix427:output-sanitize]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix427Off') === '1'; }          // 全停止
  function offTail(){ return ls('v292Dfix427TailOff') === '1'; }  // 規則(b)のみ停止
  function getS(){ try { return G.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ===================================================================
  // A. 出力サニタイザ(pure・タグ非依存)
  // ===================================================================
  // 状態プロトコルの見出し語。半角/全角の = : を等価に扱う。
  //   ★「関係が壊れた。」のような普通の文は落とさない(見出し語の直後が =／: のときだけ)。
  var RE_HEADER  = /^[\s　]*(からだ|こころ|本能|目的|関係|未解決|思考|状態|感情)[\s　]*[=＝:：]/;
  // [手段] [対象] [相手評価] … のような角括弧だけの行(全角［］も)
  var RE_BRACKET = /^[\s　]*[\[［][^\]］\n]{0,16}[\]］][\s　]*$/;
  // //秘密保持:青信号 のようなコメント行
  var RE_SLASH   = /^[\s　]*\/\//;
  // タグ断片(保険。タグ付きは既存fixが落とすが、壊れた断片が残る場合に備える)
  var RE_TAGFRAG = /<\/?(state|react|voice|summary)\b/i;
  // セリフ行(絶対に落とさない)
  var RE_QUOTE   = /^[\s　]*[「『]/;
  // 地の文の終端(句点・感嘆・閉じ括弧など)。これで終わる行はブロックの続きとみなさない。
  var RE_ENDSENT = /[。．.！？!?…‥」』♪]$/;
  // ブロック継続とみなす最大字数(実データ最長は24字=「そこで揺さぶれる要素入れるならこれくらい丁度良い」)
  var CONT_MAXLEN = 30;

  function isMetaLine(line){
    var t = String(line == null ? '' : line);
    if (!t.replace(/[\s　]/g, '')) return false;
    if (RE_TAGFRAG.test(t)) return true;
    if (RE_SLASH.test(t))   return true;
    if (RE_BRACKET.test(t)) return true;
    if (RE_HEADER.test(t))  return true;
    return false;
  }
  // 直前に除去行があるときだけ効く「ブロックの続き」判定。
  function isContinuation(line){
    var t = String(line == null ? '' : line).trim();
    if (!t) return false;
    if (RE_QUOTE.test(t)) return false;      // セリフ保護(最優先)
    if (RE_ENDSENT.test(t)) return false;    // 句点等で終わる=地の文
    if (t.indexOf(':') >= 0 || t.indexOf('：') >= 0) return true;
    return t.length <= CONT_MAXLEN;
  }

  // text(string) -> { text, removed:[], aborted:bool }
  function sanitizeNarrative(text){
    var src = String(text == null ? '' : text);
    // ① リテラル \n を先に実改行へ正規化(しないと1行に固まっていて行単位で落とせない)
    var norm = src.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
    if (!norm.replace(/[\s　]/g, '')) return { text: norm, removed: [], aborted: false };

    var lines = norm.split('\n');
    var out = [], removed = [], prevRemoved = false;
    for (var i = 0; i < lines.length; i++){
      var ln = lines[i];
      var blank = !String(ln).replace(/[\s　]/g, '');
      var drop = false;
      if (blank){
        // ブロック直後の空行は落とすが、連鎖は切る(空行を跨いで地の文へ食い込ませない)
        if (prevRemoved) drop = true;
        prevRemoved = false;
      } else if (isMetaLine(ln)){
        drop = true; prevRemoved = true;
      } else if (prevRemoved && isContinuation(ln)){
        drop = true;   // prevRemoved は true のまま(ブロック継続)
      } else {
        prevRemoved = false;
      }
      if (drop) removed.push(ln); else out.push(ln);
    }
    if (!removed.length) return { text: norm, removed: [], aborted: false };

    var res = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[\s　]+$/, '');
    // ② 安全弁: 半分未満に縮むなら誤爆とみなし適用中止(本文を消す事故の防止)
    var baseLen = norm.replace(/[\s　]/g, '').length;
    var outLen  = res.replace(/[\s　]/g, '').length;
    if (baseLen > 0 && outLen < baseLen * 0.5){
      try { console.warn(TAG, 'sanitize aborted (would drop ' + (baseLen - outLen) + '/' + baseLen + ' chars = over 50%)'); } catch(e){}
      return { text: norm, removed: [], aborted: true };
    }
    return { text: res, removed: removed, aborted: false };
  }

  // plan.narrative(配列) へ適用。変更したら true。
  function sanitizePlan(plan){
    if (!plan || !Array.isArray(plan.narrative) || !plan.narrative.length) return false;
    var joined = plan.narrative.join('\n');
    var r = sanitizeNarrative(joined);
    if (r.aborted) return false;
    if (!r.removed.length && r.text === joined) return false;
    var arr = r.text.split('\n').filter(function(x){ return String(x == null ? '' : x).trim(); });
    if (!arr.length) return false;   // 安全網: 全消えは避ける
    plan.narrative = arr;
    _lastRemoved = r.removed;
    return true;
  }

  // ===================================================================
  // B. 連続する裸「」は同一話者(pure)
  // ===================================================================
  // 一般名詞は話者候補にしない(cast名がたまたまこれらでも候補から外す)
  var RE_GENERIC = /^(男|女|人|子|声|影|者)$/;
  // 呼び名の直後に許容する文字(助詞・句読点・閉じ括弧・行末)
  var RE_AFTER   = /[のはがもをにへとでや、。，．！？!?…‥」』\s　]/;
  // 呼び名の直前に許容する文字(助詞・句読点・括弧・行頭)。これ以外(漢字・カナ・英字・
  //   助詞でないひらがな)が直前にあれば別語の一部とみなし不採用。
  //   ・許容例: 「蓮は澪の腕を掴んだ」の 澪(直前=は) → 候補に採る
  //   ・排除例: 「あなたは誰」の なた(直前=あ)   → 朝比奈ひなたに誤爆させない
  //             「紅蓮の炎」の 蓮(直前=紅=漢字)  → 神奈月蓮に誤爆させない
  var RE_BEFORE_OK = /[はがをにへともでやのか、。，．！？!?…‥「」『』（）()\s　\-—―]/;

  function normQ(s){
    return String(s == null ? '' : s).replace(/[\s　。、！？!?…‥・「」『』―—\-～〜゛゜]/g, '');
  }
  // 行全体がセリフのときだけセリフとみなす(「…」と彼は言った。 は地の文=手がかり)
  function quoteOf(line){
    var t = String(line == null ? '' : line).trim();
    var m = t.match(/^[「『]([\s\S]*?)[」』]$/);
    return m ? m[1] : null;
  }
  function usableNames(castNames){
    var out = [];
    for (var i = 0; i < (castNames || []).length; i++){
      var n = String(castNames[i] == null ? '' : castNames[i]).trim();
      if (!n) continue;
      if (RE_GENERIC.test(n)) continue;
      if (out.indexOf(n) < 0) out.push(n);
    }
    return out;
  }
  // 1字の呼び名は漢字のみ許可(「た」「な」等のかな1字は誤爆源)
  function aliasOk(a){
    if (a.length >= 2) return true;
    return /[一-龥々]/.test(a);
  }
  // prose に name(フルネーム or 末尾一致の呼び名)が現れるか
  function nameHits(prose, name){
    var s = String(prose == null ? '' : prose);
    if (!s || !name) return false;
    if (s.indexOf(name) >= 0) return true;                 // フルネーム
    for (var L = name.length - 1; L >= 1; L--){            // 末尾一致の呼び名(長い順)
      var alias = name.slice(name.length - L);
      if (!aliasOk(alias) || RE_GENERIC.test(alias)) continue;
      var at = s.indexOf(alias);
      while (at >= 0){
        var after  = s.charAt(at + alias.length);
        var before = at > 0 ? s.charAt(at - 1) : '';
        var okAfter  = (after === '' || RE_AFTER.test(after));
        var okBefore = (before === '' || RE_BEFORE_OK.test(before));
        if (okAfter && okBefore) return true;
        at = s.indexOf(alias, at + 1);
      }
    }
    return false;
  }
  function findCastInProse(prose, castNames){
    var names = usableNames(castNames), hits = [];
    for (var i = 0; i < names.length; i++){ if (nameHits(prose, names[i])) hits.push(names[i]); }
    return hits;
  }
  function isCastName(w, castNames){ return usableNames(castNames).indexOf(String(w || '')) >= 0; }

  function cloneCS(c){
    if (!c || typeof c !== 'object') return c;
    var o = {};
    for (var k in c){ if (Object.prototype.hasOwnProperty.call(c, k)) o[k] = c[k]; }
    return o;
  }

  // narrative(原文) と convSays を突き合わせ、連続する裸「」ブロックの話者を統一した
  // 【新しい配列】を返す(引数は非破壊)。opts.noTail=true で規則(b)を停止。
  function regroupSpeakers(narrative, convSays, castNames, opts){
    var result = (convSays || []).map(cloneCS);
    if (result.length < 2) return result;
    var lines = String(narrative == null ? '' : narrative).split('\n');
    var noTail = !!(opts && opts.noTail);

    function findCS(qtext, from){
      var qn = normQ(qtext); if (!qn) return -1;
      for (var j = from; j < result.length; j++){
        var e = result[j];
        if (!e || e._rv) continue;                       // react声由来は本文に無い=対象外
        var en = normQ(e.say); if (!en) continue;
        if (en === qn) return j;
        if (en.length >= 4 && qn.length >= 4 && (qn.indexOf(en) === 0 || en.indexOf(qn) === 0)) return j; // 80字切詰め対策
      }
      return -1;
    }

    var i = 0, pos = 0;
    while (i < lines.length){
      if (quoteOf(lines[i]) == null){ i++; continue; }
      // 連続セリフ行を収集(空行は透過)
      var run = [], j = i;
      while (j < lines.length){
        var qq = quoteOf(lines[j]);
        if (qq != null){ run.push(qq); j++; continue; }
        if (!String(lines[j]).trim()){ j++; continue; }
        break;
      }
      if (run.length >= 2){
        var idxs = [], ok = true, from = pos, r, k;
        for (r = 0; r < run.length; r++){
          k = findCS(run[r], from);
          if (k < 0){ ok = false; break; }
          idxs.push(k); from = k + 1;
        }
        if (ok && idxs.length >= 2){
          pos = idxs[idxs.length - 1] + 1;
          // ブロック直後の最初の地の文(セリフ行に当たったら手がかり無し)
          var prose = '';
          for (var p = j; p < lines.length; p++){
            if (!String(lines[p]).trim()) continue;
            if (quoteOf(lines[p]) != null) break;
            prose = String(lines[p]).trim(); break;
          }
          // ブロック内の話者が既に一致しているなら何もしない
          var seen = {}, distinct = 0;
          for (r = 0; r < idxs.length; r++){
            var w = String(result[idxs[r]].who || '');
            if (w && !seen[w]){ seen[w] = 1; distinct++; }
          }
          if (distinct >= 2){
            var cands = findCastInProse(prose, castNames);
            var target = null;
            if (cands.length === 1){
              target = cands[0];                                   // 規則(a): 直後の地の文に候補1人
            } else if (cands.length === 0 && !noTail && run.length <= 4){
              // 規則(b): 手がかりゼロのとき、ブロック末尾の話者へ統一。
              //   実測の規則性=「後ろの1つだけが直後の地の文から正しく帰属され、前の1つは
              //   直前に喋った人を引き継いで誤る」。候補2人以上(曖昧)のときは何もしない。
              var lw = String(result[idxs[idxs.length - 1]].who || '');
              if (lw && isCastName(lw, castNames)) target = lw;
            }
            if (target){
              for (r = 0; r < idxs.length; r++){ result[idxs[r]].who = target; }
            }
          }
        }
      } else if (run.length === 1){
        var k1 = findCS(run[0], pos); if (k1 >= 0) pos = k1 + 1;
      }
      i = (j > i) ? j : (i + 1);
    }
    return result;
  }

  // ===================================================================
  // 設置(impure)
  // ===================================================================
  var _lastRaw = null;        // 直近 parsePlan に渡された生応答(タグ有無の判定に使う)
  var _lastRemoved = [];      // 診断用
  var _armed = false;         // このセッションで生成が走った=新ターンだけ処理する(履歴は不触)

  function hasSayTag(raw){ return /<say\b/i.test(String(raw == null ? '' : raw)); }
  // stale-raw ガード: _lastRaw がこのターンのものか(convSaysの過半が raw に含まれるか)
  function rawMatchesTurn(raw, cs){
    var rn = normQ(raw), tot = 0, hit = 0;
    for (var i = 0; i < cs.length; i++){
      var e = cs[i]; if (!e || !e.say || e._rv) continue;
      tot++;
      var n = normQ(e.say).slice(0, 10);
      if (n && rn.indexOf(n) >= 0) hit++;
    }
    return tot > 0 && hit * 2 >= tot;
  }
  function castNamesOf(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
        var np = S.cast.npcs || [];
        for (var i = 0; i < np.length; i++){ if (np[i] && np[i].name) out.push(String(np[i].name)); }
      }
    } catch(e){}
    return out;
  }

  // ---- A: parsePlan ラップ(fix155/fix322と同流儀・全extension適用後) ----
  function getPlanner(){ try { return G.Planner || ((typeof Planner !== 'undefined') ? Planner : null); } catch(e){ return null; } }
  function wrapParse(){
    var P = getPlanner(); if (!P || typeof P.parsePlan !== 'function') return false;
    if (P.__f427parse) return true;
    var orig = P.parsePlan.bind(P);
    P.parsePlan = function(rawText){
      var plan = orig.apply(this, arguments);
      try {
        _lastRaw = String(rawText == null ? '' : rawText);
        _armed = true;
        if (!off() && plan){
          if (sanitizePlan(plan)){
            try { console.log(TAG, 'narrative sanitized:', _lastRemoved.length, 'meta line(s) removed'); } catch(_){}
          }
        }
      } catch(e){ try { console.warn(TAG, 'parse wrap err:', e && e.message); } catch(_){} }
      return plan;
    };
    P.__f427parse = true;
    try { console.log(TAG, 'parsePlan wrap installed'); } catch(_){}
    return true;
  }
  (function poll(){ poll._n = (poll._n || 0) + 1; if (wrapParse()) return; if (poll._n > 80) return; setTimeout(poll, 400); })();

  // ---- A2 + B: S.save の直前に最終ターンを処理(保存前=履歴に残る前) ----
  var _lastLen = -1;
  function processLastTurn(){
    if (off()) return;
    var S = getS(); if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    var t = S.turns[S.turns.length - 1];
    if (!t || t.__f427) return;
    if (!_armed) { _lastLen = S.turns.length; return; }   // このセッションで生成していない=履歴は触らない
    if (S.turns.length <= _lastLen) return;               // 新ターンではない
    _lastLen = S.turns.length;
    t.__f427 = 1;

    // A2: 二重ネット(parsePlanラップが他fixに奪われていた場合の保険)
    try {
      if (typeof t.narrative === 'string' && t.narrative){
        var r = sanitizeNarrative(t.narrative);
        if (!r.aborted && r.removed.length && r.text.replace(/[\s　]/g, '')){
          t.__f427nprev = t.narrative;                    // 退避(ロールバック可能)
          t.narrative = r.text;
          try { console.log(TAG, 'turn.narrative sanitized (2nd net):', r.removed.length, 'line(s)'); } catch(_){}
        }
      }
    } catch(e){ try { console.warn(TAG, 'sanitize turn err:', e && e.message); } catch(_){} }

    // B: 話者再編(<say>タグを使ったターンには一切触らない)
    try {
      var cs = t._convSays;
      if (!Array.isArray(cs) || cs.length < 2) return;
      if (!_lastRaw) return;                              // 生応答が無い=判定不能→現状維持
      if (hasSayTag(_lastRaw)) return;                    // 正常ターン→不触
      if (!rawMatchesTurn(_lastRaw, cs)) return;          // rawがこのターンのものでない→中止
      var names = castNamesOf(S);
      if (names.length < 2) return;
      var next = regroupSpeakers(String(t.narrative || ''), cs, names, { noTail: offTail() });
      var changed = false;
      for (var i = 0; i < cs.length; i++){
        if (!cs[i] || !next[i]) continue;
        if (String(cs[i].who || '') !== String(next[i].who || '')) { changed = true; break; }
      }
      if (!changed) return;
      t.__f427prev = cs.map(function(c){ return cloneCS(c); });   // ★退避(ロールバック可能)
      t._convSays = next;
      try {
        for (var k = 0; k < cs.length; k++){
          if (cs[k] && next[k] && cs[k].who !== next[k].who) console.log(TAG, 'speaker regrouped:', cs[k].who, '->', next[k].who, '|', String(cs[k].say || '').slice(0, 20));
        }
      } catch(_){}
    } catch(e){ try { console.warn(TAG, 'regroup err:', e && e.message); } catch(_){} }
  }

  function wrapSave(){
    var S = getS();
    if (!S || typeof S.save !== 'function') return false;
    if (S.__f427save) return true;
    var os = S.save.bind(S);
    S.save = function(){
      try { processLastTurn(); } catch(e){}
      return os.apply(this, arguments);
    };
    S.__f427save = true;
    try { console.log(TAG, 'S.save wrap installed'); } catch(_){}
    return true;
  }
  (function pollS(){ pollS._n = (pollS._n || 0) + 1; if (wrapSave()) return; if (pollS._n > 80) return; setTimeout(pollS, 400); })();

  // ---- C: sys へ一文追加(keeper prio2・150字以内) ----
  var C_MARKER = '【出力の掟】';
  var C_TEXT = '\n' + C_MARKER + '状態・思考・関係の内部メモを本文に書かない（「こころ=」「思考:」「[手段]」「//」等）。キャラの発話は必ず <say who="名前"> で囲み、裸の「」で書かない。';
  function cTextFn(){ return C_TEXT; }   // 副作用なし・毎ターン同じ文字列
  (function registerKeeper(){
    try {
      G.__f379reg = G.__f379reg || [];
      var reg = G.__f379reg;
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === C_MARKER) return; }  // 二重登録回避
      reg.push({ off: 'v292Dfix427Off', marker: C_MARKER, prio: 2, text: cTextFn });
      try { console.log(TAG, 'keeper registered (prio2, ' + C_TEXT.length + ' chars)'); } catch(_){}
    } catch(e){ try { console.warn(TAG, 'keeper reg err:', e && e.message); } catch(_){} }
  })();

  // ---- 検証口(pure関数をnodeから単体テストできるように公開) ----
  G.__v292Dfix427 = {
    sanitizeNarrative: sanitizeNarrative,
    sanitizePlan:      sanitizePlan,
    regroupSpeakers:   regroupSpeakers,
    findCastInProse:   findCastInProse,
    nameHits:          nameHits,
    quoteOf:           quoteOf,
    isMetaLine:        isMetaLine,
    isContinuation:    isContinuation,
    hasSayTag:         hasSayTag,
    C_TEXT:            C_TEXT,
    C_MARKER:          C_MARKER,
    status: function(){ return { off: off(), offTail: offTail(), armed: _armed, lastRemoved: _lastRemoved.slice(0), hasRaw: !!_lastRaw }; }
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
