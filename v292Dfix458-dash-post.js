// =====================================================================
// Chronicle TRPG - v292Dfix458: ダッシュ「——」の後処理（生成後に整える最後の砦）
// ---------------------------------------------------------------------
// ★経緯（実測ベース）:
//   ・fix454 で sys に独立ブロック【ダッシュ】を足した → 8.5 → 4.5回/千字（不十分）
//   ・fix457c で **sysの見本(few-shot)からダッシュを一掃** → 新スロットの序盤で 2.5回/千字
//     ところが **ターンが進むと 4.1回/千字 に戻る**。
//     真因: モデルは「自分が直前に書いた本文」も見て真似る（自己強化）。
//           一度ダッシュを書くと、以後それが手本になり増えていく。
//   → **生成された本文そのものを整える**（＝手本を汚さない）のが最後の砦。
//
// 変換ルール（意味を壊さない範囲）:
//   ・1ターンに **1回目のダッシュは残す**（表現として有効なので全滅させない）
//   ・2回目以降を置換:
//       - 行末 / 「」の閉じ直前（＝言いよどみ・中断） → 「……」
//       - それ以外（文中の切断）                     → 「、」
//   ・処理は **新しく生成されたターンだけ**。過去の物語は書き換えない。
//   ・_convSays[].say（会話ログのセリフ）にも同じ処理をする。
//
// 安全策: 初回書き換え前にアクティブslotを chr6_bk_fix458_* へ退避。
//         ターンごとに t.__f458=1 を立てて冪等。
// 冪等: window.__v292Dfix458   /   OFF: localStorage.v292Dfix458Off='1'
// ★fix762(2026-08-31): 閉じダッシュ直後が「1文字助詞＋非句読点」ならも `、` を足さず直結する。 OFF: v292Dfix762Off='1'
// 検証口: window.__v292Dfix458.clean('文——文') / .stats()
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix458 && window.__v292Dfix458.__armed) return;
  var TAG = '[v292Dfix458:dash-post]';
  var stats = { turns: 0, replaced: 0, collided: 0 };
  var backedUp = false;

  function off(){ try { return localStorage.getItem('v292Dfix458Off') === '1'; } catch(e){ return false; } }
  /* ★fix625: 句読点の重なりを避ける処理だけを個別に止められる逃げ道。
     （fix458 全体を止めるとダッシュが野放しになるので、切り分けを分けている） */
  function f625off(){ try { return localStorage.getItem('v292Dfix625Off') === '1'; } catch(e){ return false; } }
  /* ★fix760: 「名詞——助詞＋句読点」だけを落とす分岐の個別逃げ道（f625off と同じ作法） */
  function f760off(){ try { return localStorage.getItem('v292Dfix760Off') === '1'; } catch(e){ return false; } }
  /* ★fix762: 「名詞——助詞＋非句読点」を直結する分岐の個別逃げ道（f760off と同じ作法） */
  function f762off(){ try { return localStorage.getItem('v292Dfix762Off') === '1'; } catch(e){ return false; } }
  /* 前後がこれらなら `、` を足さない。★閉じ括弧は含めない（`」` は別分岐で `……` にする） */
  var PUNCT_RE = /[、。，．！？!?…‥]/;
  /* ★fix760: 1文字助詞。ダッシュの直後がこれ1文字で、その次が句読点なら
     「名詞＋助詞」の途中を切っているので `、` を足してはいけない。 */
  var PARTICLE1_RE = /[はがをにへとでもの]/;
  /* ★fix762b(Fable5裁定): 直結を許すのは「閉じダッシュの直前が漢字」のときだけ。
     名詞の終端は漢字になりやすく、接続詞や活用語尾はかなになる——この差で
     「だが——はい」（直前=が）のような過剰発火を切る。CJK統合漢字＋拡張A＋々。 */
  var KANJI_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\u3005]/;
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix458') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }

  // 1つの文字列を整える（keep = 残してよいダッシュの数）
  function cleanStr(s, state){
    if (typeof s !== 'string' || s.indexOf('——') < 0) return s;
    var out = '';
    var i = 0;
    while (i < s.length){
      if (s.charAt(i) === '—' && s.charAt(i + 1) === '—'){
        // 連続する — をすべて食う（———— のような重ねにも対応）
        var j = i;
        while (j < s.length && s.charAt(j) === '—') j++;
        state.seen++;
        if (state.seen <= state.keep){
          out += '——';                                  // 1回目は残す
        } else {
          var nx = s.charAt(j);
          if (nx === '' || nx === '\n' || nx === '」' || nx === '』' || nx === '"'){
            out += '……';                                // 中断・言いよどみ
          } else if (f625off()){
            out += '、';                                 // 従来どおり（逃げ道）
          } else if (PUNCT_RE.test(out.charAt(out.length - 1)) && PUNCT_RE.test(nx)){
            /* ★fix625b: 両側が句読点。ダッシュを落とすだけだと
               `。——、` が `。、` になって**新しい重なりを作ってしまう**
               （総当たり検査で5通り見つけた。落としただけでは足りない）。
               → 前の記号を活かし、**後ろの記号を1つだけ吸収する**。
               例: 「。——、終わり」→「。終わり」 */
            j++;
            state.collided++;
          } else if (PUNCT_RE.test(out.charAt(out.length - 1)) || PUNCT_RE.test(nx)){
            /* ★★fix625（実機の画面で見つけた）
               ここは元々「文中の切断なら必ず `、` を足す」だった。
               ところが**ダッシュの前後をまったく見ていない**ので、
               すでに句読点がある場所に `、` を重ねて**画面に見える壊れ方**をしていた。
               実測した2例（どちらも実データ）:
                 「言ってたな。——独り身でな」 → 「言ってたな。、独り身でな」  ← 直前が `。`
                 「書類か、それとも——。」     → 「書類か、それとも、。」      ← 直後が `。`
               → 前後どちらかが既に句読点なら、**何も足さずにダッシュを落とす**。
               ★`……` へ倒す案も考えたが、`。……` という別の重なりを作るのでやめた。 */
            state.collided++;
          } else if (!f760off() && PARTICLE1_RE.test(nx) && PUNCT_RE.test(s.charAt(j + 1))){
            /* ★★fix760（2026-08-31 実機の画面で見つけた・本番 story smtg00ynsv1 turn101）
               fix625/625b と同系統の取り残し。対句挿入「X——Y——助詞」の**閉じダッシュ**で、
               ダッシュの直後が「1文字助詞＋句読点」だと、名詞と助詞の間に `、` が割り込む。
               実測（どちらも実データ）:
                 モデル出力: 「彼の右手が、自分の左肩——上着の肩口——に、無意識に触れた。」
                 画面表示:   「彼の右手が、自分の左肩、上着の肩口、に、無意識に触れた。」
                                                              ~~~~~~ ← 「肩口、に、」
               ここは前後どちらも句読点ではないので fix625/625b のどちらにも掛からず、
               最後の else に落ちて `、` を足していた。
               → 直後が [はがをにへとでもの] 1文字で、**さらにその次が句読点**のときだけ、
                 何も足さずにダッシュを落とす（fix625 の「足さず落とす」と同じ扱い）。
                 例: 「肩口——に、」→「肩口に、」
               ★過剰発火の防止が肝: 「だが——はい、」は nx='は' でも次が 'い' で句読点ではないため
                 発火せず、従来どおり「だが、はい、」になる（助詞ではなく語頭の『は』を守る）。
               OFF: localStorage['v292Dfix760Off']='1' → この分岐だけ従来（`、`）へ戻る。 */
            state.collided++;
          } else if (!f762off() && PARTICLE1_RE.test(nx) && !PUNCT_RE.test(s.charAt(j + 1)) && KANJI_RE.test(out.charAt(out.length - 1))){
            /* ★★fix762（2026-08-31 実プレイの画面で見つけた：QG-1b の残件）
               fix760 は「助詞の**次が句読点**」だけを拾っていたため、
               助詞の次が普通の文字だと取り残しになっていた。
               実測（実データ）:
                 モデル出力: 「戸の外の闇——消え尽くした村の灯りの方——へ一瞬、目をやった。」
                 画面表示:   「…灯りの方、へ一瞬、…」  ← 「方、へ」
               → 直後が [はがをにへとでもの] 1文字で、その次が句読点**以外**のときも、
                 何も足さずにダッシュを落とす（助詞は残る）。例: 「方——へ一瞬」→「方へ一瞬」
               ★fix760 と同じ助詞集合(PARTICLE1_RE)を再利用。別集合を作らない。
               ★精度ガード fix762b（Fable5裁定 2026-08-31）:
                 初版は語頭が偶然 [はがをにへとでもの] の語でも発火し、実測で壊れた:
                   「彼は迷った——だが——はい、と答えた。」 → 「だがはい、」
                 → **閉じダッシュの直前1文字が漢字(KANJI_RE)のときだけ**発火に限定。
                 直前がかな/その他なら従来どおり `、` を挿入（fix760 時代の挙動）。
                 実観測のバグ3種「方——へ/肩口——に/闇——が」は全て直前漢字なので治る。
                 △代償(裁定で許容): 「拳を——にぎった」「ゆらり——と」は発火せず
                 旧出力「拳を、にぎった」「ゆらり、と」のまま（読めるので許容）。
               OFF: localStorage['v292Dfix762Off']='1' → この分岐だけ従来（`、`）へ戻る。 */
            state.collided++;
          } else {
            out += '、';                                 // 文中の切断
          }
          state.replaced++;
        }
        i = j;
      } else {
        out += s.charAt(i); i++;
      }
    }
    return out;
  }

  function clean(text){
    var st = { seen: 0, keep: 1, replaced: 0, collided: 0 };
    return cleanStr(String(text || ''), st);
  }

  function backupOnce(){
    if (backedUp) return true;   // fix495(C2): 成功時のみtrue/backedUp化(fail-closed用)
    try {
      // fix495(C2): activeが未設定/defaultの実体は'chr6'キー(従来はchr6_slot_defaultを読んで
      // 空振り=defaultスロットでは控えゼロのまま本文書換していた)。控えは新しい順2件にtrim。
      var slot = JSON.parse(localStorage.getItem('chr6_active_slot') || '""');
      var key = (slot && slot !== 'default') ? ('chr6_slot_' + slot) : 'chr6';
      var tag = (slot && slot !== 'default') ? slot : 'default';
      var blob = localStorage.getItem(key);
      if (blob) localStorage.setItem('chr6_bk_fix458_' + tag + '_' + Date.now(), blob);
      backedUp = true;
      try {
        var bks = [];
        for (var bi = 0; bi < localStorage.length; bi++){
          var bk = localStorage.key(bi);
          if (bk && bk.indexOf('chr6_bk_fix458_' + tag + '_') === 0 && /_\d+$/.test(bk)) bks.push(bk);
        }
        bks.sort(function(a,b){ return (+a.split('_').pop()||0) - (+b.split('_').pop()||0); });
        while (bks.length > 2) { var oldk = bks.shift(); try { localStorage.removeItem(oldk); } catch(e){} }
      } catch(e){}
    } catch(e){ return false; }
    return backedUp;
  }

  function narrText(t){
    var n = t && t.narrative;
    if (typeof n === 'string') return n;
    return null;
  }

  function processTurn(t){
    if (!t || t.__f458) return 0;
    var st = { seen: 0, keep: 1, replaced: 0, collided: 0 };
    var changed = 0;

    var n = t.narrative;
    if (typeof n === 'string'){
      var v = cleanStr(n, st);
      if (v !== n){ if (!backupOnce()){ return 0; } t.narrative = v; changed = 1; }   // fix495(C2): 控え不能なら書換中止(fail-closed)
    } else if (n && typeof n === 'object'){
      ['text', 'body', 'content'].forEach(function(k){
        if (typeof n[k] === 'string'){
          var v2 = cleanStr(n[k], st);
          if (v2 !== n[k]){ if (!backupOnce()) return; n[k] = v2; changed = 1; }   // fix495(C2)
        }
      });
    }
    if (Array.isArray(t._convSays)){
      for (var i = 0; i < t._convSays.length; i++){
        var c = t._convSays[i];
        if (c && typeof c.say === 'string'){
          var v3 = cleanStr(c.say, st);
          if (v3 !== c.say){ if (!backupOnce()) break; c.say = v3; changed = 1; }   // fix495(C2)
        }
      }
    }
    try { Object.defineProperty(t, '__f458', { value: 1, enumerable: false, configurable: true }); } catch(e){ t.__f458 = 1; }
    if (changed){ stats.replaced += st.replaced; stats.collided += st.collided; }   // fix495(C2): 控えは書換前に取得済み
    stats.turns++;
    return st.replaced;
  }

  // 起動時に存在したターンは「過去の物語」として触らない（印だけ付ける）
  var sealed = false;
  function seal(){
    if (sealed) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns)) return;
    for (var i = 0; i < S.turns.length; i++){
      var t = S.turns[i];
      if (!t) continue;
      try { Object.defineProperty(t, '__f458', { value: 1, enumerable: false, configurable: true }); } catch(e){ t.__f458 = 1; }
    }
    sealed = true;
  }

  function run(){
    if (off()) return;
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return;
    if (!sealed){ seal(); return; }              // 初回＝既存ターンを封印して終わり
    var last = S.turns[S.turns.length - 1];
    var n = processTurn(last);
    if (n) { try { console.log(TAG, 'replaced', n, 'dash(es) in the new turn'); } catch(e){} }
  }

  function install(){
    try {
      var UI = (0,eval)('typeof UI!=="undefined"?UI:null');
      if (UI && Array.isArray(UI._renderHooks)) UI._renderHooks.push(function v292Dfix458Hook(){ try { run(); } catch(e){} });
    } catch(e){}
    try { setInterval(function(){ try { run(); } catch(e){} }, 4000); } catch(e){}
    setTimeout(function(){ try { seal(); } catch(e){} }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  window.__v292Dfix458 = { __armed: true, clean: clean, run: run, stats: function(){ return stats; }, isOff: off };
  try { console.log(TAG, 'armed'); } catch(e){}
})();
