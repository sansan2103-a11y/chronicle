// =====================================================================
// Chronicle TRPG - v292Dfix438: 「展開の描写」に台詞を【生成順】で混在表示する
// ---------------------------------------------------------------------
// 【背景】PCは2カラム。左=「会話ログ」(<say>の中身を話者アイコン付きで一覧)、
//   右=「展開の描写」(#story)。モデル(fix192の見本)は地の文と <say> を交互に書いて
//   いるのに、読者が読む右ペインには台詞が出ず、地の文だけの壁になる。
//   GPT-5.6監査の結論(採用済)=「まずUI修正。右ペインに地の文と台詞を生成順で混在表示し、
//   左は発言索引として残す」。
//
// 【なぜ右に台詞が出ないのか(実コードで確定・node再現済み)】
//   index.html:1926-1945 (fix175) が、保存前に narrative の <say> を「」へ変換している。
//   ただし fix213 の二重化ガードが入っている:
//     var _nrm213 = c.replace(/[記号]/g,'');
//     if (_nrm213 && (narr.match(/「[^」]*」/g)||[]).some(q => norm(q) === _nrm213)) return '';
//   この "narr" は【変換前の生テキスト(=<say>タグを含む)】。よってモデルが
//     <say who="ヒナ">「……こわい」</say>
//   のように【タグの中に「」を入れて書く】と、自分自身の「……こわい」が
//   「本文に既にある裸の「」」として検出され → return '' → 【台詞が本文から丸ごと消える】。
//   実測(node再現):
//     入力 : 雨が屋根を叩いていた。/ <say who="ヒナ">「……こわい」</say> / 彼女は袖を握った。
//     結果 : "雨が屋根を叩いていた。\n\n彼女は袖を握った。"   ← 台詞が消滅
//   タグの中に「」が無い場合(fix192の見本どおり)は 「……こわい」 として残る。
//   → 「モデルが <say> を使わず裸の「」で書いたターンでは narrative に「」が残っていた」
//      という既存の実測とも完全に整合する。
//
// 【順序の復元(結論: 完全に可能)】
//   turn.plan (index.html:1951 で turn に保存され、S.save() で永続化される) の
//   plan.narrative は【parsePlan直後の行配列】で、<say who="X">…</say> タグを
//   そのまま保持している(fix175 が書き換えるのはローカル変数 narr だけで plan は不触)。
//   → plan.narrative を先頭行から走査すれば、地の文と台詞の【生成順・話者つき】が
//     ロスなく復元できる。t.narrative(表示用・欠落あり)には依存しない。
//   plan が無い旧ターン / <say> が1つも無いターンは【従来表示のまま】(安全側)。
//
// 【実装方針】
//   ・表示のみ。S.turns は1バイトも書き換えない(fix415「幕開けの表示マスク」と同じ思想)。
//   ・既存の <p> には一切触らない。台詞は <div class="v292Dfix438-say"> を【挿入するだけ】。
//     → OFF は「挿入した要素を消す」だけで完全に元へ戻る(リロード不要=live評価)。
//   ・既に本文に台詞が出ているターン(タグ内に「」が無かったターン)は二重表示しない。
//   ・左の会話ログ(#dialogue-stream)は不触=発言索引として残す(GPT推奨どおり)。
//
// 既定ON。OFF: localStorage v292Dfix438Off='1'(live)
// 冪等ガード: window.__v292Dfix438
// 検証口: window.__v292Dfix438 = { parseLine, buildItems, apply, report, ... }(pureはnode可)
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined') ? globalThis : this;
  if (G.__v292Dfix438 && G.__v292Dfix438.__installed) return;   // 冪等
  var TAG = '[v292Dfix438:inline-dialogue]';

  function off(){ try { return localStorage.getItem('v292Dfix438Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return G.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // ===================================================================
  // A. pure: 1行を [{t:'p'|'say', ...}] へ分解(生成順を保持)
  // ===================================================================
  function stripTags(s){
    return String(s == null ? '' : s)
      .replace(/<[^>]*>/g, ' ')      // 残タグ片(state/react断片など)
      .replace(/\s+/g, ' ')
      .trim();
  }
  function norm(s){
    return String(s == null ? '' : s).replace(/[\s　。、．，！？!?…‥・「」『』（）()]/g, '');
  }
  // index.html fix214 と同じ「」閉じの壊れタグ修復 → 完全な <say> ペアを順に取り出す
  function parseLine(line){
    var s = String(line == null ? '' : line);
    s = s.replace(/<say(\s+who="[^"]*"\s*)>([^<\n]*)[」』](?=\s*$)/g, '<say$1>$2</say>');
    var out = [], re = /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/gi, m, last = 0;
    while ((m = re.exec(s)) !== null){
      if (m.index > last){
        var pre = stripTags(s.slice(last, m.index));
        if (pre) out.push({ t: 'p', text: pre });
      }
      var who = String(m[1] || '').trim().slice(0, 24);
      var tx  = String(m[2] || '').replace(/<[^>]*>/g, '').trim();
      if (tx) out.push({ t: 'say', who: who, text: tx });
      last = m.index + m[0].length;
    }
    if (last < s.length){
      var rest = stripTags(s.slice(last));
      if (rest) out.push({ t: 'p', text: rest });
    }
    return out;
  }

  // ターン → 行ごとのアイテム列。<say> が1つも無ければ null(=対象外・従来表示)。
  function buildItems(turn){
    var lines = (turn && turn.plan && Array.isArray(turn.plan.narrative)) ? turn.plan.narrative : null;
    if (!lines || !lines.length) return null;
    var res = [], anySay = false;
    for (var i = 0; i < lines.length; i++){
      var raw = lines[i];
      if (typeof raw !== 'string') raw = String(raw == null ? '' : raw);
      var segs = parseLine(raw);
      var prose = '', says = [], pre = true, preSays = [];
      for (var j = 0; j < segs.length; j++){
        if (segs[j].t === 'p'){ prose += (prose ? ' ' : '') + segs[j].text; pre = false; }
        else {
          anySay = true;
          if (pre) preSays.push(segs[j]); else says.push(segs[j]);
        }
      }
      res.push({ line: i, prose: prose, preSays: preSays, says: says });
    }
    return anySay ? res : null;
  }

  // ===================================================================
  // B. 表示(DOMへ挿入するだけ。既存 <p> は不触)
  // ===================================================================
  var CSS_ID = 'v292Dfix438-css';
  function injectCss(){
    try {
      if (document.getElementById(CSS_ID)) return;
      var st = document.createElement('style');
      st.id = CSS_ID;
      st.textContent =
        '.v292Dfix438-say{margin:.35em 0 .35em 1.3em;line-height:1.75;'
      + 'color:var(--fg,#e8e3f0);opacity:.94;}'
      + '.v292Dfix438-who{display:inline-block;margin-right:.45em;font-size:.76em;'
      + 'color:var(--dim,#9a90b8);opacity:.8;letter-spacing:.02em;}'
      + '.v292Dfix438-body{color:var(--acc,#c9b8ee);}'
      + 'body.v292-mobile .v292Dfix438-say{margin-left:.9em;}';
      (document.head || document.documentElement).appendChild(st);
    } catch(e){}
  }
  function makeSayEl(who, text){
    var d = document.createElement('div');
    d.classList.add('v292Dfix438-say');                 // ★className丸ごと上書き禁止(fix329の教訓)
    if (who){
      var w = document.createElement('span');
      w.classList.add('v292Dfix438-who');
      w.textContent = who;
      d.appendChild(w);
    }
    var b = document.createElement('span');
    b.classList.add('v292Dfix438-body');
    b.textContent = /^[「『]/.test(text) ? text : ('「' + text + '」');
    d.appendChild(b);
    return d;
  }

  function sigOf(idx, turn, items){
    var n = 0;
    for (var i = 0; i < items.length; i++) n += items[i].preSays.length + items[i].says.length;
    var nl = String((turn && turn.narrative) || '').length;
    return idx + ':' + items.length + ':' + n + ':' + nl;
  }

  // 1ターン分の .narr-block へ、欠落している台詞を正しい位置に挿入する。
  //   戻り値: 'inserted:N' / 'already' / 'noplan' / 'noblock' / 'cached'
  function applyTurn(turnDiv){
    var S = getS();
    if (!S || !Array.isArray(S.turns)) return 'nostate';
    var idx = parseInt(turnDiv.getAttribute('data-idx'), 10);
    if (isNaN(idx) || !S.turns[idx]) return 'noturn';
    var turn = S.turns[idx];
    var block = turnDiv.querySelector('.narr-block');
    if (!block) return 'noblock';

    var items = buildItems(turn);
    if (!items) return 'noplan';                          // 順序復元不能 → 従来表示のまま

    var sig = sigOf(idx, turn, items);
    if (block.getAttribute('data-v292f438') === sig) return 'cached';

    // 既存の挿入分を撤去(再描画で消えているのが普通。二重挿入の保険)
    var olds = block.querySelectorAll('.v292Dfix438-say');
    for (var o = 0; o < olds.length; o++){ if (olds[o].parentNode) olds[o].parentNode.removeChild(olds[o]); }

    // 描画済みの <p>(本文段落)を順に集める
    var ps = [], kids = block.children;
    for (var k = 0; k < kids.length; k++){ if (kids[k].tagName === 'P') ps.push(kids[k]); }
    var blockNorm = norm(block.textContent || '');

    var pi = 0, lastAnchor = null, inserted = 0;

    function alreadyShown(text){
      var n = norm(text);
      return !!(n && blockNorm.indexOf(n) >= 0);
    }
    function insertAfter(node, el){
      if (node && node.parentNode) node.parentNode.insertBefore(el, node.nextSibling);
      else if (ps.length && ps[0].parentNode) ps[0].parentNode.insertBefore(el, ps[0]);
      else block.insertBefore(el, block.firstChild);
    }
    function insertBefore(node, el){
      if (node && node.parentNode) node.parentNode.insertBefore(el, node);
      else block.insertBefore(el, block.firstChild);
    }

    for (var li = 0; li < items.length; li++){
      var it = items[li];
      var anchor = null;

      if (it.prose){
        var key = norm(it.prose).slice(0, 10);
        if (key.length >= 2){
          for (var j = pi; j < ps.length; j++){
            if (norm(ps[j].textContent || '').indexOf(key) >= 0){ anchor = ps[j]; pi = j + 1; break; }
          }
        }
      } else {
        // 台詞だけの行: 本文に「」として残っている(=タグ内に「」が無かった)なら、その <p> が対応
        var head = (it.preSays[0] || it.says[0]);
        if (head && ps[pi] && norm(ps[pi].textContent || '').indexOf(norm(head.text)) >= 0){
          anchor = ps[pi]; pi++;
        }
      }
      if (anchor) lastAnchor = anchor;

      // 行頭側の台詞(地の文より前) → 段落の【前】へ
      var cursorBefore = anchor || null;
      for (var a = 0; a < it.preSays.length; a++){
        var s1 = it.preSays[a];
        if (alreadyShown(s1.text)) continue;              // 既に本文に出ている → 二重表示しない
        var el1 = makeSayEl(s1.who, s1.text);
        if (cursorBefore) insertBefore(cursorBefore, el1);
        else if (lastAnchor) { insertAfter(lastAnchor, el1); lastAnchor = el1; }
        else insertAfter(null, el1);
        inserted++;
      }
      // 地の文の後ろに続く台詞 → 段落の【後】へ(行内の順序を維持)
      var cursorAfter = anchor || lastAnchor;
      for (var b = 0; b < it.says.length; b++){
        var s2 = it.says[b];
        if (alreadyShown(s2.text)) continue;
        var el2 = makeSayEl(s2.who, s2.text);
        insertAfter(cursorAfter, el2);
        cursorAfter = el2;
        lastAnchor = el2;
        inserted++;
      }
    }

    block.setAttribute('data-v292f438', sig);
    return inserted ? ('inserted:' + inserted) : 'already';
  }

  function removeAll(){
    try {
      var els = document.querySelectorAll('.v292Dfix438-say');
      for (var i = 0; i < els.length; i++){ if (els[i].parentNode) els[i].parentNode.removeChild(els[i]); }
      var bs = document.querySelectorAll('[data-v292f438]');
      for (var j = 0; j < bs.length; j++) bs[j].removeAttribute('data-v292f438');
      var css = document.getElementById(CSS_ID);
      if (css && css.parentNode) css.parentNode.removeChild(css);
    } catch(e){}
  }

  var lastOff = null;
  function apply(){
    try {
      var isOff = off();
      if (isOff){ if (lastOff !== true){ removeAll(); lastOff = true; } return; }   // live OFF → 従来表示へ即復帰
      lastOff = false;
      injectCss();
      var story = document.getElementById('story');
      if (!story) return;
      var turns = story.querySelectorAll('.turn');
      for (var i = 0; i < turns.length; i++){ try { applyTurn(turns[i]); } catch(e){} }
    } catch(e){}
  }

  function report(){
    var out = [];
    try {
      var S = getS();
      if (!S || !Array.isArray(S.turns)) return out;
      for (var i = 0; i < S.turns.length; i++){
        var it = buildItems(S.turns[i]);
        var says = 0;
        if (it) for (var j = 0; j < it.length; j++) says += it[j].preSays.length + it[j].says.length;
        var nb = norm(String((S.turns[i] && S.turns[i].narrative) || ''));
        var missing = 0;
        if (it) for (var k = 0; k < it.length; k++){
          var all = it[k].preSays.concat(it[k].says);
          for (var m = 0; m < all.length; m++){ if (nb.indexOf(norm(all[m].text)) < 0) missing++; }
        }
        out.push({ turn: i, restorable: !!it, says: says, missingFromNarrative: missing });
      }
    } catch(e){}
    return out;
  }

  // ---------- 監視(再描画にも追随) ----------
  function start(){
    apply();
    try { setInterval(apply, 1200); } catch(e){}
    try {
      var story = document.getElementById('story');
      if (story){
        var obs = new MutationObserver(function(muts){
          for (var i = 0; i < muts.length; i++){
            if (muts[i].addedNodes && muts[i].addedNodes.length){ apply(); return; }
          }
        });
        obs.observe(story, { childList: true, subtree: true });
        G.__v292Dfix438Observer = obs;
      }
    } catch(e){}
    // UI._renderHooks(features公認の描画通知)にも相乗り
    try {
      var UI = G.UI || (0,eval)('typeof UI!=="undefined" ? UI : null');
      if (UI && Array.isArray(UI._renderHooks)){
        var hook = function v292Dfix438Hook(){ try { apply(); } catch(e){} };
        hook.__v292Dfix438 = true;
        var dup = false;
        for (var i = 0; i < UI._renderHooks.length; i++){ if (UI._renderHooks[i] && UI._renderHooks[i].__v292Dfix438) dup = true; }
        if (!dup) UI._renderHooks.push(hook);
      }
    } catch(e){}
  }
  if (typeof document !== 'undefined'){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(start, 300); });
    else setTimeout(start, 300);
  }

  G.__v292Dfix438 = {
    __installed: true,
    parseLine: parseLine,     // pure
    buildItems: buildItems,   // pure
    norm: norm,               // pure
    apply: apply,
    applyTurn: applyTurn,
    removeAll: removeAll,
    report: report            // 実データ診断口: 各ターンの復元可否・台詞数・本文欠落数
  };
  try { console.log(TAG, 'loaded', off() ? '(OFF)' : '(ON)'); } catch(e){}
})();
