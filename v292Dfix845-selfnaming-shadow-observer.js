// =====================================================================
// v292Dfix845 — SELF_NAMING_SHADOW_OBSERVER v1   ★観測専用。書き込み 0。production 未適用
// ---------------------------------------------------------------------
// ②C1 裁定 CK Q65:
//   EVENT_SELF_NAMING_v3 = SHADOW_OBSERVER_CANDIDATE
// ②C1 裁定 CM Q69: fix845 を割り当て。★名前は最後まで observer であることが分かる形にする。
//   fix845 は edge を「作る機能」ではなく、候補 edge を **観測するだけ**である。
//   まだ IDENTITY_AUTHORITY_PRODUCER にはしない。
//   production の実行経路上で **判定だけ** 走らせ、
//   edge / state / alias / cast には **一切書かない**。
//
// ■ 絶対にしないこと（設計で担保する）
//   ・alias を書かない（addAlias を呼ばない）
//   ・store を merge しない・触らない
//   ・cast を登録しない
//   ・roster / quasi 台帳を書き換えない
//   ・fix537 の動作を変更しない（ラップも差し替えもしない）
//   ・localStorage へ書かない（telemetry は **メモリ上のみ**・上限あり）
//   ・canonical を決めない（claimedNames を保持するだけ）
//
// ■ 有効化（既定 OFF・QA slot のみ）
//   OFF_OVERRIDE  localStorage['v292Dfix845Off']  === '1'      → 常に無効
//   QA_SLOT_ON    localStorage['v292Dfix845On_slot_<slot>'] === '1'
//   ★グローバル ON は **用意しない**（②C1: QA slot のみ ON 可能）
//
// ■ event 時点の cast をその場で使う
//   CAST_GUARD_MUST_USE_CAST_AS_OF_EVENT_TURN。
//   shadow は生成のたびに走るので、**その瞬間の cast** がそのまま event 時点の cast になる。
//   後から現在 cast で過去を再評価する方式は ②C1 が REJECT 済み。
//
// ■ 他 producer との関係（②C1 CK Q66）
//   ★②C1 裁定 CQ: これは arbitration ではなく CROSS_PRODUCER_RELATION_OBSERVER。
//   分類: NO_OTHER_PRODUCER / SAME_EDGE / CONFLICTING_EDGE / CHAIN_FORWARD / CHAIN_REVERSE / UNRELATED
//   ★CROSSCHECK_MUST_BE_EVENT_SCOPED — 異なる event の edge 同士を chain 扱いしない
//   ★CHAIN = PRESERVE BOTH EDGES AS EVIDENCE / NO CANONICALIZATION / NO COLLAPSE / NO MERGE
//     identityDecision は常に ABSTAIN
//
// 検証口: window.__v292Dfix845
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix845 && window.__v292Dfix845.__armed) return;

  var VERSION='v292Dfix845 SELF_NAMING_SHADOW_OBSERVER v2.5-LENGTH-ORDERED-RELATION'
    +' (observe-only / no writes / GRADED EVIDENCE / +fixN +fixL +fixM +fixO'
    +' / COMMIT15 DISABLE_ONLY + COMMIT16 segment dedup'
    +' + COMMIT17 evidence-preserving multi + COMMIT18 length-ordered relation)';
  var MAX_EVENTS = 40;                 /* bounded telemetry */
  var _events = [], _weakEvents = [], _installed = false, _origParse = null,
      _stats = { turns:0, detections:0, errors:0,
        /* ★②C1 裁定 DA Q105: raw diagnostic のみ。valid say event とは呼ばない。
           verdict / claimed evidence / crossCheck には一切使わない。
           FIX845_SINGLE_QUOTE_EVENT_PARSE = HOLD（単引用を発話タグとして解釈はしない） */
        SINGLE_QUOTED_SAY_LIKE_TOKEN_COUNT:0 };
  /* ★fixC(COMMIT 1): submit 時点のプレイヤー入力を控える。読むだけ・戻り値も引数も変えない。 */
  var _origSubmit = null, _submitWrapped = false, _pendingInput = '', _pendingAt = 0;

  /* ★COMMIT15 (②C1 裁定 DF / Q118) DISABLE_ONLY_LIFECYCLE
     canary 4 で判明した欠陥 Q への対応。
       INSTALL_ONCE_PER_PAGE
       PHYSICAL_UNINSTALL = UNSUPPORTED（他 fix が握る参照を壊す危険の方が大きい）
       DISABLE = SUPPORTED SAFETY OPERATION
       OUTER MARKER = DIAGNOSTIC ONLY
       PAGE SINGLETON = DUPLICATE-INSTALL GUARD（chain 探索は authority にしない）
     production の fix74 / fix645 / fix648 は 2 秒ごとに parsePlan を包み直し、
     その際に他 fix の marker を引き継がない。したがって最外殻の __f845Wrapped は
     **装着状態の証拠にならない**。page 単位の小さな record だけを真実とする。 */
  function rt(){
    var R=null;
    try{ R=window.__v292Dfix845Runtime; }catch(e){}
    if(!R || typeof R!=='object'){
      R={ wrapperRef:null, installedOnce:false, disabled:false, hits:0,
          NOTE:'PAGE_SCOPED_SINGLETON / OUTER_MARKER_IS_DIAGNOSTIC_ONLY' };
      try{ window.__v292Dfix845Runtime=R; }catch(e){}
    }
    return R;
  }

  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function slot(){ return String(ls('chr6_active_slot')||'').replace(/"/g,''); }
  function offOverride(){ return ls('v292Dfix845Off')==='1'; }
  function enabled(){
    if (offOverride()) return false;
    if (rt().disabled) return false;                       /* ★COMMIT15: DISABLE は最優先 */
    var s=slot();
    return !!(s && ls('v292Dfix845On_slot_'+s)==='1');    /* ★QA slot のみ。global ON は無い */
  }
  function getS(){ try{ var g=window.__chronicleGetState; return (typeof g==='function')?g():window.S; }catch(e){ return null; } }
  function castNow(){                                     /* ★event 時点の cast */
    var out=[], S=getS();
    try{ if(S&&S.cast){ if(S.cast.hero&&S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
      (S.cast.npcs||[]).forEach(function(n){ if(n&&n.name) out.push(String(n.name).trim()); }); } }catch(e){}
    return out.filter(Boolean);
  }
  function heroNow(){ try{ var S=getS(); return (S&&S.cast&&S.cast.hero&&S.cast.hero.name)?String(S.cast.hero.name).trim():''; }catch(e){ return ''; } }
  function prevPlayerInput(){
    try{ var S=getS(); var t=S&&S.turns&&S.turns[S.turns.length-1];
      return t? String(t.playerText||'') : ''; }catch(e){ return ''; }
  }
  /* ★fixC(COMMIT 1) RUNTIME_WIRING_CORRECTION
     parsePlan 実行時点では**当該ターンがまだ S.turns に積まれていない**ため、
     prevPlayerInput() は 1 つ前のターンの入力を返す（live canary 欠陥 C）。
     opener には **当該ターンの入力**を使う。取得できない場合は空文字を返し、
     cross-turn opener を成立させない（誤った turn の入力を opener にしない）。 */
  function inputElValue(){
    try{ var el=document.getElementById('inp');
      return el? String(el.value==null?'':el.value).trim() : ''; }catch(e){ return ''; }
  }
  function currentPlayerInput(){
    if(_pendingInput) return _pendingInput;        /* submit で控えた当該ターンの入力 */
    var v=inputElValue();                          /* submit 前なら入力欄がまだ生きている */
    return v || '';                                /* ★prev へフォールバックしない */
  }

  /* ---- 判定器 v3 本体（純関数・副作用なし） ---- */
  function sayTags(raw){ var out=[],m,re=/<say\s+who="([^"]{1,24})"\s*>([\s\S]*?)<\/say>/g;
    while((m=re.exec(raw))) out.push({who:m[1].trim(),text:m[2].trim()}); return out; }
  var ASK=[/名前.{0,8}(教え|言っ|言う|聞かせ|なんて|何て|なに|何|は[？?？]?$|は[\s　]*[？?])/,
   /(なんて|何て|なんと|何と).{0,4}(呼べば|言う|いう)/,
   /(君|きみ|あなた|お前|あんた|お二人|そちら).{0,8}(名前|お名前)/,
   /(自分|お|ご)?名前(は|を)/, /お名前.{0,8}(お聞き|伺|聞い)/];
  var THIRD=/(あの子|あの人|彼女|彼|その人|そちらの方|あの方|この子)[のは][\s　]*.{0,4}名前|名前.{0,4}(あの子|あの人|彼女|彼|その人)|(って|という)名前.{0,8}(心当たり|覚え|知って|由来)/;
  function isAsk(t){ return ASK.some(function(r){ return r.test(String(t||'')); }); }
  /* ★fixI(COMMIT 7) TIGHTEN_POSITIVE_ASK_GRAMMAR（②C1 裁定 CY Q98）
     live canary 2 欠陥 I: プレイヤー入力「自分の名前は**名乗らない**。」の「名前は」に
     ASK が一致し、cross-turn opener が成立して誤検出になった。
     ★否定語 stoplist では直さない（②C1: NEGATION_STOPLIST = REJECT）。
       否定表現を列挙すると LLM 語彙への追従になるため。
     代わりに **positive grammar を狭くする**。会話中の「名前は？」と、
     プレイヤーの行動記述中の「名前は」は意味が違うので、source 別 grammar に分ける。
     プレイヤー入力由来の opener は次のどちらかを要求する:
       (a) 明示的な質問・依頼の動作（尋ねる/聞く/訊く/教えてもらう/名乗ってもらう/伺う 等）
       (b) 明示的な疑問形（お名前は？ / 名前は？ / なんて呼べば 等）
     これで「名乗らない」は否定語を特別扱いせずとも ASK にならない。 */
  /* ★fixN(COMMIT 11) BOUNDED_NAME_QUERY_LEXEMES（②C1 裁定 DB Q108）
     live canary 3 で「あなたの**フルネーム**も聞かせてもらっていいか」が ASK にならず、
     真正な qualifying positive を取り逃した（RECALL_REGRESSION_INTRODUCED_BY_FIX_I）。
     名詞側を**閉じた lexeme family** へ広げる。質問・依頼動作の要求は維持するので、
     「自分の名前は名乗らない」は依然 ASK にならない。
     ★NO_OPEN_ENDED_VOCABULARY_GROWTH: 想像で「呼び名」「本名」等を足さない。
       実 raw で新しい正当表現が出た時だけ追加する。 */
  var NAME_LEX='(?:お名前|名前|フルネーム|氏名|姓名|名字|苗字|下の名前)';
  var ASK_INPUT_VERB=new RegExp(NAME_LEX+'[^。！!?？\n]{0,12}(尋ね|訊(い|く|ね)|聞(い|く|か|き出)|問(い|う|いかけ)|教えてもら|教わ|伺(っ|う|い)|名乗ってもら|名乗らせ|確認す|確かめ)');
  var ASK_INPUT_Q=new RegExp(NAME_LEX+'[はをも]?[\\s　]*[？?]|(なんて|何て|なんと|何と)[\\s　]*(呼べば|言う|いう|呼ぶ)');
  function isAskFromPlayerInput(t){
    var s=String(t||'');
    if(!s) return false;
    return ASK_INPUT_VERB.test(s) || ASK_INPUT_Q.test(s);
  }
  /* ★fixA(COMMIT 3) CLAIM_EVIDENCE_COMPLETENESS
     live canary 欠陥 A: 空白を含む表記（例 佐野 千景 / 真鍋 ひかり）を name と認めなかった。
     Chronicle の【whoに使う名前】は「登録どおりの表記のまま（空白も含めて）」と定めており、
     判定器がアプリの正規表記を弾いていた。
     ★これは 佐野 と 佐野 千景 を同一人物とみなす変更では「ない」。
       WHITESPACE_NORMALIZATION = NOT IDENTITY AUTHORITY（空白除去による同一視はしない）。
     許すのは U+0020 のみ・内部・ちょうど 1 個・前後空白なし・連続不可。
     U+3000 / タブ / zero-width は従来どおり常に不可。 */
  var ASCII_SPACE_OK=/^[^\s　]+ [^\s　]+$/;
  function looksLikeName(s){ s=String(s||'');
    if(s!==s.trim()) return false;                 /* 前後の空白は不可（trim で救わない） */
    if(s.length<2||s.length>10) return false;
    if(/[。、！？?!,.…「」『』（）()]/.test(s)) return false;
    if(/[\t\n\r　\u200b\u200c\u200d\ufeff]/.test(s)) return false;  /* 全角空白・制御・zero-width */
    /* ★fixO(COMMIT 14): live canary 3 の修正中に発見。「私——」が name として通っていた。
       ダッシュ類（—/―/–/-）と長音以外の約物は名前に含まれない。
       ★これは語彙 stoplist ではなく**字種の規則**（zero-width / 全角空白と同じクラス）。
       ー（長音符 U+30FC）は「リョーコ」等で正当なので除外しない。 */
    if(/[—―–\u2010-\u2015\uFF0D]/.test(s)) return false;
    if(/ /.test(s) && !ASCII_SPACE_OK.test(s)) return false;              /* 半角空白は内部 1 個だけ */
    if(/[はがをにへとでもやのから、]$/.test(s)) return false;
    if(/(だ|です|ます|ない|いる|する|とけ|なさい|くれ|ろ|よう|たい|けど|から|ので|でも)$/.test(s)) return false;
    if(/^(そう|うん|ええ|はい|いいえ|まだ|もう|べつ|別|知ら|言い)/.test(s)) return false;
    /* ★fixJ(COMMIT 7) EXACT_RESPONSE_TOKEN_REJECTION（②C1 裁定 CY Q98）
       live canary 2 で「……いえ」が name として通り誤検出になった。
       ★substring blacklist にはしない。解析用に記号を外したあとの**完全一致**だけを弾く。
       観測した穴だけを閉じる。 */
    if(EXACT_REJECT.indexOf(s)>=0) return false;
    return true; }
  /* ★fixM(COMMIT 13)（②C1 裁定 DB Q110）: live で誤検出を起こした exact token だけを足す。
     挨拶 stoplist を先回りで育てない。新しい挨拶誤検出が出たら short-answer の
     evidence class 自体を再設計する（②C1 の将来案）。 */
  var EXACT_REJECT=['いえ','いや','ええ','はあ','はぁ','ふむ','うむ','さあ','さぁ','どうも','よろしく'];
  /* ★fixK(COMMIT 9) GRADED_EVIDENCE_MODEL（②C1 裁定 CZ）
     live canary 2 で判明したこと:
       「橘、です。橘香澄（たちばな かすみ）。」 と
       「学生、です。学生会長（がくせいかいちょう）。」 は **構造上ほぼ同型**であり、
       語彙を見ない限り分離できない。
     したがって「もっと賢い regex で勝つ」のをやめ、
       CLAIM_COMPLETENESS → EVIDENCE_PRESERVATION
     へ設計を戻す。分からないものは分からないまま保存する。
       ONE_CHAR_SURFACE            != IDENTITY CLAIM
       DESU CLAIM                  = WEAK EVIDENCE（昇格しない）
       READING ANNOTATION          != NAME AUTHORITY（昇格しない）
       M2 PREFIX/SUFFIX AS PROMOTION = REJECT（telemetry の関係観測にのみ使う） */
  /* 1 文字の表層。かなは相槌と紛れるので漢字だけ拾う（語彙リストではなく字種の規則） */
  var ONE_CHAR_KANJI=/^[\u4E00-\u9FFF\u3005]$/;
  function oneCharSurface(x){ return ONE_CHAR_KANJI.test(String(x||'')); }
  var GRADE_RANK={ 'WEAK_SINGLE_CHAR_SURFACE':1, 'WEAK_DESU_SURFACE':2,
                   'READING_ANNOTATED_SURFACE':3, 'STRONG_NAME_CLAIM':4 };
  var EXPLICIT=[/^(?:わたし|私|僕|ぼく|俺|おれ|あたし)は[\s　]*(.+?)(?:です|だ|といいます|と言います|っていう|という)$/,
   /^名前は[\s　]*(.+?)(?:です|だ)?$/,
   /^(.+?)(?:って(?:いう|言う)ん?(?:だ|です)?|という(?:ん?です)?|と言う|と呼んで)$/,
   /^(.+?)だよ$/];
  /* ★fixD(COMMIT 5) SENTENCE_SCOPED_DESU_SELF_NAME（②C1 裁定 CV Q90 = CONDITIONAL GO）
     「佐野です」型。regex 自体は「学生です」「秘密です」「そうです」まで形だけなら拾い得るため、
     単独 authority にしない。適用条件は ②C1 指定どおり:
       D_SCOPE = ACTIVE NAME EVENT + SAME RESPONDER + SENTENCE SCOPED（+ E 適用後）
       X は A の name-form を通ること / raw の X をそのまま claimedNames へ残すこと
       D_ALONE != CANONICAL AUTHORITY
     → via を 'desu' として **explicit より弱い**扱いにする。D だけの event は CONFIRMED に上げない。 */
  var EXPLICIT_DESU=/^(.+?)です$/;
  function exC(c){ var s=String(c||'').replace(/^[…\.\s　―ー-]+/,'').replace(/[\s　]+$/,'');
    for(var i=0;i<EXPLICIT.length;i++){ var m=s.match(EXPLICIT[i]); if(m&&m[1]){ var n=m[1].trim(); return looksLikeName(n)?n:null; } } return null; }
  /* ★fixF(COMMIT 8) BOUNDED_PRE_COPULA_COMMA（②C1 裁定 CY Q99）
     live canary 2 欠陥 F: 実 LLM は「間」を読点で書く（「……橘、です」）。
     読点一般を除去するのではなく、**コピュラ直前の読点 1 個だけ**を解析 view で外す。
     名前そのものに読点が含まれる場合は従来どおり棄却されるので、権限は増えない。 */
  function desuC(c){ var s=String(c||'').replace(/^[…\.\s　―ー-]+/,'').replace(/[\s　]+$/,'');
    var m=s.match(EXPLICIT_DESU); if(!m||!m[1]) return null;
    var n=m[1].trim();
    if(/、$/.test(n)) n=n.slice(0,-1).trim();      /* ★コピュラ直前の読点 1 個だけ */
    if(looksLikeName(n)) return n;
    if(oneCharSurface(n)) return n;                /* ★1 文字漢字は surface として拾う（昇格はしない） */
    return null; }
  /* ★fixG(COMMIT 8) TERMINAL_KANA_READING_ANNOTATION（②C1 裁定 CY Q99）
     live canary 2 欠陥 G: 「橘香澄（たちばな かすみ）」が （） で棄却された。
     ★「括弧より前なら何でも名前」にはしない（ARBITRARY_PARENTHETICAL_STRIPPING = REJECT）。
     clause 末尾が BASE（READING）で、READING が**かな＋空白等だけ**の読み仮名として妥当な
     文字集合の場合に限り、BASE を name 候補として解析する。
       橘香澄（たちばな かすみ）→ BASE = 橘香澄 を claim / 読みは annotation（claim にしない）
       橘香澄（店長） / 学生（アルバイト）→ 対象外（剥がさない）
     括弧内の「たちばな かすみ」を**第二の name claim にはしない**。 */
  var KANA_READING=/^[\u3041-\u309F\u30A0-\u30FF ー・\u3000]{2,20}$/;
  function readingC(c){
    var s=String(c||'').replace(/^[…\.\s　―ー-]+/,'').replace(/[\s　]+$/,'');
    var m=s.match(/^(.+?)（([^（）]{1,20})）$/);
    if(!m) return null;
    if(!KANA_READING.test(m[2])) return null;        /* かな読みでなければ剥がさない */
    var base=m[1].trim();
    return looksLikeName(base)? {name:base, reading:m[2]} : null;
  }
  function shC(c){ var s=String(c||'').replace(/^[…\.\s　―ー-]+/,'').replace(/[\s　]+$/,''); return looksLikeName(s)?s:null; }
  /* ★fixE(COMMIT 4) BOUNDED_OUTER_QUOTE_UNWRAP（②C1 裁定 CV Q89）
     実 LLM は台詞を 「」 で括る。判定器がその 「 を名前候補の一部として見て落としていた。
     ただし **引用符を全部消さない**。対応の取れた**外側 1 pair だけ**を解析 view で外す。
       ・trim 後、全体が 「…」 または 『…』 で**対応して**包まれている場合だけ
       ・外す pair は 1 つだけ（内部の引用符は残す）
       ・対応が取れない引用符には触らない
     RAW = PRESERVED / ANALYSIS_VIEW = OUTER_QUOTE_UNWRAPPED
     raw 側は一切書き換えず、claimedNames には unwrap 後の文字列から得た名前を入れる
     （名前そのものに引用符は含まれない）。 */
  var QPAIR={'「':'」','『':'』'};
  function unwrapOuterQuote(t){
    var s=String(t||'').trim();
    for(var n=0;n<2;n++){                       /* 念のため 1 pair だけ。ループは 1 回で抜ける */
      if(s.length<2) return s;
      var open=s.charAt(0), close=QPAIR[open];
      if(!close || s.charAt(s.length-1)!==close) return s;
      /* 対応が取れているか: 途中で深さが 0 に戻らないこと */
      var d=0, okPair=true;
      for(var i=0;i<s.length;i++){
        var ch=s.charAt(i);
        if(ch===open) d++;
        else if(ch===close){ d--; if(d===0 && i!==s.length-1){ okPair=false; break; } }
      }
      if(!okPair || d!==0) return s;
      return s.slice(1,-1).trim();              /* ★外側 1 pair だけ外す */
    }
    return s;
  }
  function claims(t){ var out=[],seen={};
    /* ★外す pair は合計 1 つだけ。発話全体で外れたなら clause 側では外さない
       （②C1: 外側 1 pair only。入れ子を二重に剥がして平坦化しない）。 */
    var t0=String(t||'').trim(), t1=unwrapOuterQuote(t0), unwrapped=(t1!==t0);
    t=t1;
    String(t||'').split(/[。！!?？\n]+/).map(function(s){ s=s.trim(); return unwrapped? s : unwrapOuterQuote(s); }).filter(Boolean).forEach(function(c){
      var e=exC(c); if(e){ if(!seen[e]){seen[e]=1;out.push({name:e,via:'explicit',grade:'STRONG_NAME_CLAIM'});} return; }
      var dn=desuC(c); if(dn){ if(!seen[dn]){seen[dn]=1;
        out.push({name:dn, via:'desu',
                  grade: oneCharSurface(dn)?'WEAK_SINGLE_CHAR_SURFACE':'WEAK_DESU_SURFACE'});} return; }
      var rd=readingC(c); if(rd){ if(!seen[rd.name]){seen[rd.name]=1;
        out.push({name:rd.name, via:'reading', reading:rd.reading, grade:'READING_ANNOTATED_SURFACE'});} return; }
      var s=shC(c); if(s&&!seen[s]){ seen[s]=1;
        out.push({name:s, via:'short-answer', grade:'STRONG_NAME_CLAIM'}); } });
    return out; }
  /* ★fixL(COMMIT 12) RESPONDER_SEGMENT_STARTS_AT_FIRST_NON_PLAYER_SPEAKER（②C1 裁定 DB Q109）
     live canary 3 で says[0] が**質問者（主人公）自身の発話**であり、
     しかも hero.name が空だったため cast guard も効かず、
     主人公の「よろしく」を自己名乗りとして昇格させた。
     cross-turn opener では says[0] を answer と仮定しない。
     **最初の「player speaker ではない」say** から responder segment を始める。
     PLAYER_SPEAKER_SET は exact 一致のみ（fuzzy / 部分一致は使わない）:
       現 hero の登録名（あれば）／ reserved literal 主人公 ／ reserved literal hero
     ★最初が player なら event 終了、にはしない。skip して次を探す（②C1 の指定）。 */
  var PLAYER_LITERALS=['主人公','hero'];
  /* PLAYER_SPEAKER_SET は exact 一致のみ（②C1: fuzzy / partial は使わない）:
       現 hero の登録名（あれば）／ reserved literal 主人公 ／ reserved literal hero */
  function isPlayerSpeaker(who, heroName){
    var w=String(who||'').trim();
    if(!w) return false;
    if(PLAYER_LITERALS.indexOf(w)>=0) return true;
    if(heroName && w===String(heroName).trim()) return true;
    return false;
  }
  function firstNonPlayerIdx(says, from, heroName){
    for(var i=from;i<says.length;i++){ if(!isPlayerSpeaker(says[i].who, heroName)) return i; }
    return -1;
  }
  function detect(raw, cast, prevInput, heroName){
    var says=sayTags(raw), openers=[];
    /* ★fixI: cross-turn opener は player input 由来なので厳しい grammar を使う */
    if(prevInput&&isAskFromPlayerInput(prevInput)&&!THIRD.test(prevInput)&&says.length){
      var a0=firstNonPlayerIdx(says,0,heroName);
      if(a0>=0) openers.push({ansIdx:a0,crossed:true});
    }
    for(var i=0;i<says.length-1;i++){ if(!isAsk(says[i].text)||THIRD.test(says[i].text)) continue;
      var ai=firstNonPlayerIdx(says,i+1,heroName);
      if(ai>=0) openers.push({ansIdx:ai,crossed:false, askIdx:i}); }
    /* ★fixP-B(COMMIT16) SEGMENT_SCOPED_EVENT_DEDUP（②C1 裁定 DE）
       MULTIPLE_OPENERS != MULTIPLE_EVENTS
       live canary 4 欠陥 P: 「player input の質問」と「その質問が <say who="主人公"> にも描かれたもの」で
       opener が 2 本立ち、両方が同じ responder segment を指したため ABSTAIN_MULTI へ落ちて
       strong / weak / relation を全部捨てた。
       opener は **由来（provenance）** であって event ではない。
       segmentKey = responderWho + startSayIdx + endSayIdx（1 raw = 1 turn なので turn は暗黙）
       が完全一致する opener は 1 event に統合し、由来だけ openerSources へ union する。
       ★ansIdx だけで畳まず、segment そのものを key にする（②C1 指定）。 */
    var _segs=[], _segMap={};
    openers.forEach(function(op){ var a=says[op.ansIdx]; if(!a) return;
      if(!op.crossed && op.askIdx!=null && says[op.askIdx] && a.who===says[op.askIdx].who) return;
      if(cast.indexOf(a.who)>=0) return;
      var si=[op.ansIdx];
      for(var k2=op.ansIdx+1;k2<says.length;k2++){ if(says[k2].who!==a.who) break; si.push(k2); }
      var key=a.who+'\u0000'+si[0]+'\u0000'+si[si.length-1];
      var rec=_segMap[key];
      if(!rec){ rec={ key:key, who:a.who, segIdx:si, sources:{}, crossed:false }; _segMap[key]=rec; _segs.push(rec); }
      rec.sources[op.crossed?'CROSS_TURN':'IN_RAW']=1;
      if(op.crossed) rec.crossed=true;
    });
    var ev=[], weakObs=[];
    _segs.forEach(function(seg){ var a=says[seg.segIdx[0]];
      /* ★fixB(COMMIT 2) CONTIGUOUS_SAME_SPEAKER_SEGMENT
         live canary 欠陥 B: opener 直後の 1 say しか見ていなかった。
         実データでは話者が先に問いを反芻し（「……名前、ですか」）、
         名乗りは**同一話者の次の say** に来る。
         同一 speaker が連続する範囲だけを 1 answer segment として見る。
         他 speaker が入った時点で window を終了する（②C1 指定）。 */
      var segIdx=seg.segIdx;      /* ★fixP-B: segment は opener ではなく segment 単位で確定済み */
      /* ★同名が segment 内で短答と明示構文の両方で現れたら「自己補強」。
         name 単位で via の集合を持ち、dedup で explicit を落とさない
         （B 以前は「次の say の explicit が同名なら corr」だったので、
           window を広げた結果その補強を失わないようにする）。 */
      var cl=[], byName={};
      segIdx.forEach(function(j){
        claims(says[j].text).forEach(function(c){
          if(!byName[c.name]){ byName[c.name]={name:c.name,via:c.via,vias:{},grade:c.grade}; cl.push(byName[c.name]); }
          byName[c.name].vias[c.via]=1;
          if(c.reading && !byName[c.name].reading) byName[c.name].reading=c.reading;
          if(c.via==='explicit') byName[c.name].via='explicit';
          /* 同じ名前が複数の形で現れたら **強い方の grade** を採る */
          if(GRADE_RANK[c.grade] > GRADE_RANK[byName[c.name].grade]) byName[c.name].grade=c.grade;
        });
      });
      cl=cl.filter(function(c){ return cast.indexOf(c.name)<0; });
      /* ★COMMIT 9: M2 の prefix/suffix 昇格を退役させる（②C1 裁定 CZ）
         M2_PREFIX/SUFFIX_AS_PROMOTION = REJECT
         PREFIX/SUFFIX MAY BE TELEMETRY RELATION ONLY
         「橘 → 橘香澄」も「学 → 学生会長」も構造だけなら同じ関係が成立する。
         prefix であることは「同じ人物の短名」という authority にはならない。
         よって関係は **telemetry の観測としてだけ**残し、昇格には一切使わない。 */
      /* ★fixR(COMMIT18) LENGTH_ORDERED_RELATION（②C1 裁定 DH / Q123）
         live canary 5 欠陥 R: 須藤 と 須藤 巧 の間に relation が 2 本出て、
         うち 1 本は {shorter:'須藤 巧', longer:'須藤'} と **向きが逆**だった。
         原因は suffix 判定 `b1.lastIndexOf(a1)===b1.length-a1.length` が、
         a1 の方が長いとき **-1 === -1** で偶然成立すること。
         ★-1 ガードを足すだけにはしない（②C1 指定）。正規化後の長さで先に向きを確定させる:
           len(A) < len(B) → A=shorter / B=longer で prefix/suffix を検査
           len(B) < len(A) → 逆向きで検査
           len(A) === len(B) → shorter/longer relation を **作らない**
         「須藤 巧」と「須藤巧」のように空白除去後に同長・同形になるものを
         shorter/longer として記録するのは意味が違う。必要なら将来 NORMALIZED_SURFACE_MATCH
         という別 telemetry にする（今は新機能を足さず relation 無しでよい）。
         RELATION = TELEMETRY ONLY / NO IDENTITY AUTHORITY は不変。 */
      var _cmp=function(x){ return String(x).replace(/ /g,''); };
      var rel=[];
      for(var xi=0; xi<cl.length; xi++){
        for(var yi=xi+1; yi<cl.length; yi++){
          var A=cl[xi], B=cl[yi];
          var na=_cmp(A.name), nb=_cmp(B.name);
          if(na.length===nb.length) continue;      /* EQUAL NORMALIZED LENGTH = NO SHORTER/LONGER RELATION */
          var sObj, lObj, sN, lN;
          if(na.length<nb.length){ sObj=A; lObj=B; sN=na; lN=nb; }
          else                   { sObj=B; lObj=A; sN=nb; lN=na; }
          if(lN.indexOf(sN)===0 || lN.lastIndexOf(sN)===lN.length-sN.length)
            rel.push({shorter:sObj.name, longer:lObj.name, kind:'SURFACE_PREFIX_OR_SUFFIX',
                      NOTE:'TELEMETRY RELATION ONLY / NOT IDENTITY AUTHORITY'});
        }
      }
      /* 昇格するのは STRONG_NAME_CLAIM だけ。desu / 読み註記 / 1 文字は surface に留める */
      var strong=cl.filter(function(c){ return c.grade==='STRONG_NAME_CLAIM'; });
      var weakSurf=cl.filter(function(c){ return c.grade==='WEAK_DESU_SURFACE'||c.grade==='WEAK_SINGLE_CHAR_SURFACE'; })
                     .map(function(c){ return {name:c.name, kind:c.grade}; });
      var readSurf=cl.filter(function(c){ return c.grade==='READING_ANNOTATED_SURFACE'; })
                     .map(function(c){ return {base:c.name, reading:c.reading}; });
      if(!cl.length) return;
      var corr=strong.some(function(c){ return Object.keys(c.vias).length>1; });
      if(!corr && strong.length){
        for(var j=segIdx[segIdx.length-1]+1;j<says.length;j++){ if(isAsk(says[j].text)) break; if(says[j].who!==a.who) continue;
          var c2=claims(says[j].text).filter(function(c){ return c.via==='explicit'; });
          if(c2.some(function(c){ return strong.some(function(n){ return n.name===c.name; }); })){ corr=true; break; } }
      }
      ev.push({from:a.who, claims:cl, strong:strong, weakSurfaces:weakSurf,
               readingSurfaces:readSurf, relations:rel,
               crossed:seg.crossed, corr:corr, segLen:segIdx.length,
               /* ★fixP-B: 由来は event を増やさず union して残す */
               openerSources:Object.keys(seg.sources).sort(),
               segStart:segIdx[0], segEnd:segIdx[segIdx.length-1] }); });
    if(!ev.length) return {verdict:'NONE'};
    /* ★fixP-A(COMMIT17) EVIDENCE_PRESERVING_MULTI（②C1 裁定 DE）
       ABSTENTION_MUST_NOT_DELETE_EVIDENCE
       B（segment dedup）を通してもなお別 segment が 2 つ以上残るなら、それは本当に multi。
       identity 判断としては「複数候補なので ABSTAIN」が正しいので **verdict 名は ABSTAIN_MULTI のまま**にし、
       互換性と既存意味論を壊さない。ただし {verdict,n} だけ返して証拠を捨てるのはやめ、
       event-scoped な events[] を足す。
       ★multi のとき各 event の strong/weak を **トップレベルで union しない**。
         1 人物の証拠のように見せないため、event 境界を保つ。 */
    if(ev.length>1) return {
      verdict:'ABSTAIN_MULTI', n:ev.length,
      identityDecision:'ABSTAIN',
      canonical:'UNRESOLVED',
      MODEL:'GRADED_EVIDENCE / CLAIM_COMPLETENESS -> EVIDENCE_PRESERVATION',
      events: ev.map(function(e){
        return { from:e.from,
          openerSources:e.openerSources,
          segment:{ who:e.from, start:e.segStart, end:e.segEnd },
          strongClaims:e.strong.map(function(c){ return c.name; }),
          weakSurfaces:e.weakSurfaces,
          readingAnnotatedSurfaces:e.readingSurfaces,
          relations:(e.relations.length?e.relations:undefined),
          crossed:e.crossed, corroborated:e.corr, segLen:e.segLen };
      }),
      NOTE:'MULTIPLE_RESPONSE_EVENTS = PRESERVE EVIDENCE PER EVENT / NO CROSS-EVENT UNION'
           +' / CANONICAL_SELECTION = ABSTAIN / EVENT BOUNDARIES PRESERVED' };
    var e=ev[0];
    if(e.strong.length===1 && e.strong[0].name===e.from && !e.weakSurfaces.length && !e.readingSurfaces.length)
      return {verdict:'ALREADY_SAME'};
    var base={ from:e.from,
      strongClaims:e.strong.map(function(c){ return c.name; }),
      weakSurfaces:e.weakSurfaces,
      readingAnnotatedSurfaces:e.readingSurfaces,
      relations:(e.relations.length?e.relations:undefined),
      /* ★fixP-B(COMMIT16): opener の由来は event を増やさず union で保持する */
      openerSources:e.openerSources,
      segment:{ who:e.from, start:e.segStart, end:e.segEnd },
      crossed:e.crossed, corroborated:e.corr,
      canonical:'UNRESOLVED',
      MODEL:'GRADED_EVIDENCE / CLAIM_COMPLETENESS -> EVIDENCE_PRESERVATION' };
    /* ★昇格できる強い claim が無い event も **捨てずに記録する**。
       名前質問への応答 event そのものが証拠であり、identity は決めない。 */
    if(!e.strong.length){
      return Object.assign(base,{ verdict:'EVIDENCE_ONLY',
        claimedNames:[], identityDecision:'ABSTAIN',
        NOTE:'NAME_ANSWER_EVENT CAPTURED / NO PROMOTABLE CLAIM / EVIDENCE PRESERVED'
             +' / ONE_CHAR_SURFACE != IDENTITY CLAIM / DESU = WEAK / READING ANNOTATION != NAME AUTHORITY' });
    }
    var strongVia=e.strong.some(function(c){ return c.via==='explicit'; })?'explicit':'short-answer';
    return Object.assign(base,{
      verdict:(strongVia==='explicit'||e.corr)?'CONFIRMED':'CANDIDATE',
      claimedNames:e.strong.map(function(c){ return c.name; }),
      via:strongVia,
      identityDecision:(e.strong.length>1?'ABSTAIN':'UNRESOLVED'),
      NOTE:'MULTIPLE_SELF_NAME_CLAIMS = PRESERVE EVIDENCE / CANONICAL_SELECTION = ABSTAIN'
           +' / WHITESPACE_NORMALIZATION = NOT IDENTITY AUTHORITY' });
  }

  /* ---- fix537 の結果を **読むだけ**（動作は変更しない） ---- */
  function fix537Edges(){
    try{ var lg=JSON.parse(ls('v292Dfix537_log')||'[]')||[];
      return lg.map(function(x){ return { from:x.alias, to:x.canonical, turn:x.turn }; }); }catch(e){ return []; }
  }
  /* ★②C1 裁定 CQ: これは arbitration ではなく CROSS_PRODUCER_RELATION_OBSERVER である。
     判定するだけで、identity の決定は一切しない。
     ★CROSSCHECK_MUST_BE_EVENT_SCOPED:
       **異なる event の edge 同士を chain 扱いしてはいけない。**
       fix537 の log は他ターンの分も溜まるので、必ず turn で絞る。 */
  function crossCheck(r, eventTurn){
    if(!r || !r.from || !r.claimedNames) return null;
    var all=fix537Edges();
    /* ★同一 event（同じ turn）のものだけを比較対象にする */
    var es=all.filter(function(e){ return e.turn===eventTurn; });
    var skipped=all.length-es.length;
    var base={ scope:'EVENT_SCOPED', eventTurn:eventTurn, otherProducerEdgesInEvent:es.length,
               edgesIgnoredFromOtherEvents:skipped };
    if(!es.length) return Object.assign(base,{ relation:'NO_OTHER_PRODUCER' });
    var same=es.filter(function(e){ return e.from===r.from && r.claimedNames.indexOf(e.to)>=0; });
    if(same.length) return Object.assign(base,{ relation:'SAME_EDGE', with:'fix537', edge:same[0] });
    var conflicting=es.filter(function(e){ return e.from===r.from && r.claimedNames.indexOf(e.to)<0; });
    if(conflicting.length) return Object.assign(base,{ relation:'CONFLICTING_EDGE', with:'fix537',
      theirs:conflicting.map(function(e){ return e.to; }) });
    /* CHAIN_FORWARD: fix537 の到達先が、こちらの出発点と一致する（A→B by fix537, B→C by fix845） */
    var fwd=es.filter(function(e){ return e.to===r.from; });
    if(fwd.length) return Object.assign(base,{ relation:'CHAIN_FORWARD', with:'fix537',
      chain:{ from:fwd[0].from, mid:r.from, to:r.claimedNames.slice(),
              edges:[ fwd[0].from+'->'+fwd[0].to+' by fix537', r.from+'->'+r.claimedNames.join('|')+' by fix845' ] },
      verdict:'CHAIN_UNRESOLVED',
      /* ★②C1 CQ Q74: edge は両方とも証拠として保存する。破壊的な identity 決定だけを採用しない */
      identityDecision:'ABSTAIN',
      NOTE:'CHAIN = PRESERVE BOTH EDGES AS EVIDENCE / NO CANONICALIZATION / NO COLLAPSE / NO MERGE' });
    /* CHAIN_REVERSE: こちらの到達先が、fix537 の出発点と一致する（将来の逆向き） */
    var rev=es.filter(function(e){ return r.claimedNames.indexOf(e.from)>=0; });
    if(rev.length) return Object.assign(base,{ relation:'CHAIN_REVERSE', with:'fix537',
      chain:{ from:r.from, mid:rev[0].from, to:[rev[0].to],
              edges:[ r.from+'->'+rev[0].from+' by fix845', rev[0].from+'->'+rev[0].to+' by fix537' ] },
      verdict:'CHAIN_UNRESOLVED', identityDecision:'ABSTAIN',
      NOTE:'CHAIN = PRESERVE BOTH EDGES AS EVIDENCE / NO CANONICALIZATION / NO COLLAPSE / NO MERGE' });
    return Object.assign(base,{ relation:'UNRELATED', with:'fix537',
      theirs:es.map(function(e){ return e.from+'->'+e.to; }) });
  }

  /* ---- 観測: parsePlan を **戻り値を変えずに** 見るだけ ---- */
  function install(force){
    /* ★COMMIT15: 二重装着の防止は page singleton だけで判定する。
       最外殻 marker は production の包み直しで消えるので判定に使わない。 */
    var R=rt();
    if(R.installedOnce){ _installed=true; return true; }
    if(_installed) return true;
    if(offOverride()) return false;
    if(!force && !enabled()) return false;
    var P=null; try{ P=window.Planner; }catch(e){}
    if(!P || typeof P.parsePlan!=='function') return false;
    if(P.parsePlan.__f845Wrapped){ R.installedOnce=true; R.wrapperRef=P.parsePlan; _installed=true; return true; }
    _origParse=P.parsePlan;
    var w=function(rawText, inputType){
      var out;
      try{ rt().hits++; }catch(e){}                /* ★lifecycle counter。telemetry ではない */
      try{ out=_origParse.apply(this, arguments); }
      catch(e){ _stats.errors++; throw e; }        /* 例外は透過 */
      try{
        if(enabled()){
          _stats.turns++;
          /* ★raw diagnostic（非意味論）: 単引用の say 風トークンが何回現れたかを数えるだけ */
          try{ var _sq=String(rawText||'').match(/<say\s+who='[^']{1,24}'/g);
               if(_sq) _stats.SINGLE_QUOTED_SAY_LIKE_TOKEN_COUNT+=_sq.length; }catch(e){}
          var r=detect(String(rawText||''), castNow(), currentPlayerInput(), heroNow());
          /* ★DESU_ONLY = WEAK OBSERVATION（②C1 裁定 CW）。
             identity candidate には上げないが、観測としては捨てずに別枠へ残す。
             メモリ内 telemetry のみ。store/alias/quasi/cast/roster/LS には一切触れない。 */
          if(r.weakDesu && r.weakDesu.length){
            if(_weakEvents.length>=MAX_EVENTS) _weakEvents.shift();
            _weakEvents.push({ ts:Date.now(), slot:slot(),
              turn:(function(){ try{ var S=getS(); return (S&&S.turns)?S.turns.length:null; }catch(e){ return null; } })(),
              observations:r.weakDesu, verdict:r.verdict });
          }
          if(r.verdict!=='NONE'){
            _stats.detections++;
            if(_events.length>=MAX_EVENTS) _events.shift();
            _events.push({ ts:Date.now(), slot:slot(),
              turn:(function(){ try{ var S=getS(); return (S&&S.turns)?S.turns.length:null; }catch(e){ return null; } })(),
              result:r, crossProducer:crossCheck(r, (function(){ try{ var S=getS(); return (S&&S.turns)?S.turns.length:null; }catch(e){ return null; } })()),
              castAtEvent:castNow() });
          }
        }
      }catch(e){ _stats.errors++; }                /* 観測の失敗は本体に影響させない */
      return out;                                   /* ★戻り値は一切変更しない */
    };
    w.__f845Wrapped=true;                        /* ★DIAGNOSTIC ONLY。装着判定には使わない */
    try{ Object.keys(_origParse).forEach(function(k){ if(k.indexOf('__')===0&&k!=='__f845Wrapped') w[k]=_origParse[k]; }); }catch(e){}
    P.parsePlan=w; _installed=true;
    R.wrapperRef=w; R.installedOnce=true;        /* ★INSTALL_ONCE_PER_PAGE */
    installSubmitObserver();
    return true;
  }
  /* ★fixC(COMMIT 1): G.submit を **戻り値も引数も変えずに** 見るだけ。
     入力欄の値を控えるのみで、store/alias/quasi/cast/roster/localStorage には一切触れない。 */
  function installSubmitObserver(){
    try{
      /* ★production では G が window に無いことがある（fix643 と同じ eval fallback を使う） */
      var g=null;
      try{ g=window.G; }catch(e){}
      if(!g){ try{ g=(0,eval)('typeof G!=="undefined"?G:null'); }catch(e){} }
      if(!g||typeof g.submit!=='function') return false;
      if(g.submit.__f845Submit){ _submitWrapped=true; return true; }
      _origSubmit=g.submit;
      var sw=function(){
        /* ★COMMIT15: disable 中は何も控えない（DISABLED_BEHAVIORALLY_INERT） */
        try{ if(enabled()){ var t=inputElValue(); if(t){ _pendingInput=t; _pendingAt=Date.now(); } } }catch(e){ _stats.errors++; }
        return _origSubmit.apply(this, arguments);
      };
      sw.__f845Submit=true;
      try{ Object.keys(_origSubmit).forEach(function(k){ if(k!=='__f845Submit') sw[k]=_origSubmit[k]; }); }catch(e){}
      g.submit=sw; _submitWrapped=true; return true;
    }catch(e){ _stats.errors++; return false; }
  }
  function uninstallSubmitObserver(){
    /* ★install と同じ経路で G を取り直す。window.G だけ見ると production で復元できない */
    try{ var g=null;
      try{ g=window.G; }catch(e){}
      if(!g){ try{ g=(0,eval)('typeof G!=="undefined"?G:null'); }catch(e){} }
      if(g && g.submit && g.submit.__f845Submit && _origSubmit){ g.submit=_origSubmit; } }catch(e){}
    _submitWrapped=false; _origSubmit=null; _pendingInput=''; _pendingAt=0; return true;
  }
  /* ★COMMIT15 (②C1 裁定 DF): 物理 detach は **設計として非サポート**。
     外れていないのに成功を返す API は廃止する。uninstall() は deprecated で、
     detached=true を意味する値を絶対に返さない。実際に行うのは disable() だけ。 */
  function disable(){ var R=rt(); R.disabled=true; _pendingInput=''; _pendingAt=0; return status(); }
  function enable(){
    var R=rt(); R.disabled=false;
    if(!R.installedOnce){ try{ install(); }catch(e){} }
    return status();
  }
  function status(){
    var R=rt(), P=null; try{ P=window.Planner; }catch(e){}
    return {
      version:VERSION,
      LIFECYCLE:'INSTALL_ONCE_PER_PAGE / PHYSICAL_UNINSTALL=UNSUPPORTED / DISABLE=SUPPORTED',
      installedOnce:!!R.installedOnce,
      disabled:!!R.disabled,
      enabled:enabled(),
      offOverride:offOverride(),
      slot:slot(),
      wrapperResident:!!(R.wrapperRef),
      /* ★DIAGNOSTIC ONLY: production の包み直しで false になり得る。装着判定に使わない */
      outerMarkerPresent:!!(P && P.parsePlan && P.parsePlan.__f845Wrapped),
      submitWrapped:_submitWrapped,
      parseWrapperHits:R.hits|0
    };
  }
  function uninstall(){
    disable();
    return { ok:false, detached:false,
      reason:'PHYSICAL_UNINSTALL_UNSUPPORTED_BY_DESIGN',
      didDisable:true,
      NOTE:'②C1 裁定 DF。wrapper は chain に残る。安全操作は disable() のみ。',
      status:status() };
  }

  window.__v292Dfix845={ __armed:true,
    version:VERSION,
    /* ---- ★COMMIT15 (②C1 裁定 DF / Q118) 公開面 ---- */
    enable:enable, disable:disable, status:status,
    install:install,
    /* deprecated: 物理 detach は非サポート。detached=false を返すだけで、成功を偽装しない */
    uninstall:uninstall,
    installed:function(){ return !!rt().installedOnce; },
    enabled:enabled, offOverride:offOverride,
    gate:function(){ return { OFF_OVERRIDE:offOverride(), slot:slot(),
      QA_SLOT_ON: !!(slot() && ls('v292Dfix845On_slot_'+slot())==='1'),
      GLOBAL_ON_EXISTS:false, enabled:enabled(),
      installedOnce:!!rt().installedOnce, disabled:!!rt().disabled }; },
    detect:detect,                       /* 純関数。テストから直接叩ける */
    currentPlayerInput:currentPlayerInput,   /* ★fixC: opener の実測用 */
    submitWrapped:function(){ return _submitWrapped; },
    pendingInput:function(){ return _pendingInput; },
    __setPendingInputForTest:function(v){ _pendingInput=String(v||''); },
    crossCheck:crossCheck,               /* CROSS_PRODUCER_RELATION_OBSERVER（判定のみ） */
    events:function(){ return _events.slice(); },
    weakEvents:function(){ return _weakEvents.slice(); },   /* WEAK_DESU_UNCORROBORATED */
    stats:function(){ var o={}; for(var k in _stats) o[k]=_stats[k]; o.held=_events.length; o.weakHeld=_weakEvents.length; return o; },
    clear:function(){ _events.length=0; _weakEvents.length=0; },
    /* ★lifecycle counter（telemetry ではない）。FIX845_EXECUTIONS_PER_PARSE = EXACTLY 1 の測定用 */
    parseWrapperHits:function(){ return rt().hits|0; },
    __resetHitsForTest:function(){ rt().hits=0; return 0; },
    LIFECYCLE:'INSTALL_ONCE_PER_PAGE / PHYSICAL_UNINSTALL=UNSUPPORTED / DISABLE=SUPPORTED SAFETY OPERATION'
      +' / OUTER MARKER=DIAGNOSTIC ONLY / PAGE SINGLETON=DUPLICATE-INSTALL GUARD',
    WRITES:'NONE — alias/store/cast/roster/localStorage いずれにも書かない' };
  try{ if(enabled()) install(); }catch(e){}
})();
