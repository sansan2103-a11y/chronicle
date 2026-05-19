// =====================================================================
// Chronicle TRPG — v292Dfix62: dialogue-card avatar repair
// ---------------------------------------------------------------------
// 症状（実機 sansan2103-a11y.github.io, iPhone Safari/Brave）:
//   - 会話ログのキャラカード（例: カエデ）左の .dlg-av が「?」のまま
//   - STORY 展�z�カード／SAY 「」カード両方とも「?」
//   - narrative panel と dialogue 抽出機能は正常動作
//
// 確定したルート原因（live debug, ?cb=v292Dfix61, S.cast.hero=フィオナ）:
//
//   [R1] v292Dfix56-conversation-log-fix.js の getAvatarFromHelpers() が
//        二つの fallback path 両方で null を返す:
//          (a) window.__v292.dfix15.getAvatar  — 未公開（dfix15 は
//              castInfo / extractDialogues / renderStream / resolvePronoun
//              のみ expose、getAvatar は IIFE-local のまま）
//          (b) window.S.cast                    — S 自体が IIFE-local で
//              window に出ていない（typeof S = object, typeof window.S = undefined）
//        → 結局 DO/STORY 入力カードの .dlg-av には常に '?' が入る。
//
//   [R2] features.js 1998 / 3459 の getAvatar(name) の NPC 部分一致が単方向:
//          if (n.name === name || name.indexOf(n.name) !== -1) ...
//        speaker が NPC 名より短い場合（例: speaker="カエデ", n.name="カエデ・遠野"）
//        外れる。Pollinations URL があっても拾えない。
//
// 確認済の非問題:
//   - Pollinations URL 自体は健全（直接 <img src=...> で 3ms ロード, 384x384）
//   - autofill で c.avatar は埋まっている（hero 343 chars, npc 378 chars）
//   - Brave Shields は今回の症状の主因ではない（同じ URL が cast list 側では
//     表示されているはず）。本パッチは Brave 対策は組み込まず、後段で必要なら
//     追加する。
//
// 修正方針（独立 IIFE, setInterval なし）:
//
//   (1) window.__v292Dfix62.lookupAvatar(speaker) を新設。
//       castInfo() → LS chr6.cast の順で探し、双方向部分一致と (心)/(独白)/
//       括弧サフィックス除去で名前正規化する。
//
//   (2) window.__v292.dfix15.getAvatar に同関数を install。
//       → v292Dfix56.getAvatarFromHelpers() の path (a) が機能するようになる。
//
//   (3) #dialogue-stream に MutationObserver を仕掛け、新しく追加された
//       .dlg-av でテキストが '?' のみ／<img> 無しなら lookup → 差し替える。
//       既存カードも install 時に 1 度走査して修復。
//
//   (4) window.regenerateAvatarsInDom() を公開（手動再走査用）。
//
//   (5) window.__v292Dfix62Active = true でフラグ。
//
// 互換性:
//   - dfix56, dfix57, dfix59, dfix60, dfix61 を一切上書きしない
//   - dfix15 namespace に getAvatar を追加するだけ（既存メソッドは触らない）
//   - render パスは奪わない（既存 renderStream の結果を DOM で後修復する）
// =====================================================================
(function v292Dfix62(){
  'use strict';
  if (window.__v292Dfix62Active) return;
  window.__v292Dfix62Active = true;

  var TAG = '[v292Dfix62:avatar-fix]';

  // ---------- helpers ----------
  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 名前の正規化: (心) (独白) (内心) や全角括弧サフィックスを除去
  function normalize(name){
    if (!name) return '';
    return String(name)
      .replace(/\s+/g, '')
      .replace(/[（(][^）)]{0,10}[）)]\s*$/, '')   // 末尾の (心) など
      .trim();
  }

  // ラベルから speaker 名を取り出す:
  //   "フィオナ 📖 展�z�"  → "フィオナ"
  //   "カエデ ⚔ 行動"     → "カエデ"
  //   "カエデ"            → "カエデ"
  // v292Dfix56-input-card は <span> でバッジを持つので、子要素テキストを除く
  function speakerFromCard(card){
    var nameEl = card.querySelector('.dlg-name');
    if (!nameEl) return '';
    // firstChild が text node ならそれを優先（バッジ span を含まない素の名前）
    var firstChild = nameEl.firstChild;
    if (firstChild && firstChild.nodeType === 3){
      var t = (firstChild.textContent || '').trim();
      if (t) return t;
    }
    // フォールバック: textContent 全体から絵文字＋ラベル尻尾を削る
    var raw = (nameEl.textContent || '').trim();
    raw = raw
      .replace(/\s*[📖⚔💭🎭✨].*$/u, '')
      .replace(/\s*(展開|行動|セリフ|発言)\s*$/u, '')
      .trim();
    return raw;
  }

  // 状態取得: live S → LS chr6 の順
  function getStateSafe(){
    try {
      if (window.__v292 && window.__v292.dialogueLayout &&
          typeof window.__v292.dialogueLayout.castInfo === 'function'){
        // castInfo() は cast 経由で names/byName を返す
        var ci = window.__v292.dialogueLayout.castInfo();
        if (ci && ci.byName) return { cast: castFromCastInfo(ci) };
      }
    } catch(e){}
    try { return JSON.parse(localStorage.getItem('chr6') || '{}'); }
    catch(e){ return {}; }
  }

  // castInfo の {names, byName} を {hero, npcs} 形式に変換（hero/npcs 判別が
  // 元 castInfo に無い可能性があるので LS 側 cast と突き合わせる）
  function castFromCastInfo(ci){
    var hero = null, npcs = [];
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){}
    var rawHero = raw && raw.cast && raw.cast.hero;
    var rawNpcs = (raw && raw.cast && raw.cast.npcs) || [];
    if (rawHero && rawHero.name){
      hero = Object.assign({}, rawHero, ci.byName[rawHero.name] || {});
    }
    for (var i = 0; i < rawNpcs.length; i++){
      var rn = rawNpcs[i];
      if (rn && rn.name){
        npcs.push(Object.assign({}, rn, ci.byName[rn.name] || {}));
      }
    }
    return { hero: hero, npcs: npcs };
  }

  function getCast(){
    var st = getStateSafe();
    return (st && st.cast) ? st.cast : {};
  }

  // ---------- (1) lookupAvatar ----------
  function lookupAvatar(speaker){
    if (!speaker) return '';
    var cast = getCast();
    var nName = normalize(speaker);

    function tryMatch(c){
      if (!c || !c.name || !c.avatar) return null;
      var cn = normalize(c.name);
      if (cn === nName) return c.avatar;
      // 双方向部分一致（speaker が NPC 名より短い／長い両方の case を救う）
      if (cn && nName && (cn.indexOf(nName) !== -1 || nName.indexOf(cn) !== -1)){
        return c.avatar;
      }
      return null;
    }

    var hit = tryMatch(cast.hero);
    if (hit) return hit;

    var npcs = cast.npcs || [];
    for (var i = 0; i < npcs.length; i++){
      hit = tryMatch(npcs[i]);
      if (hit) return hit;
    }
    return '';
  }

  // ---------- (2) install on __v292.dfix15.getAvatar ----------
  function installDfix15Avatar(){
    if (!window.__v292) window.__v292 = {};
    if (!window.__v292.dfix15) window.__v292.dfix15 = {};
    // 上書きはせず未定義のときのみ追加
    if (typeof window.__v292.dfix15.getAvatar !== 'function'){
      window.__v292.dfix15.getAvatar = function(name){ return lookupAvatar(name); };
      console.log(TAG, '__v292.dfix15.getAvatar installed');
    } else {
      console.log(TAG, '__v292.dfix15.getAvatar already present, not overriding');
    }
  }

  // ---------- (3) DOM 修復 ----------
  function repairCard(card){
    var av = card.querySelector('.dlg-av');
    if (!av) return false;
    // 既に img があるならスキップ
    if (av.querySelector('img')) return false;
    var text = (av.textContent || '').trim();
    // '?' またはまったく空のときだけ介入
    if (text !== '?' && text !== '') return false;
    var speaker = speakerFromCard(card);
    if (!speaker) return false;
    var url = lookupAvatar(speaker);
    if (!url) return false;
    av.innerHTML =
      '<img src="' + escHtml(url) + '"' +
      ' alt="' + escHtml(speaker) + '"' +
      ' loading="lazy"' +
      ' onerror="this.parentNode.textContent=String.fromCharCode(63)">';
    return true;
  }

  function repairAll(reason){
    var cards = document.querySelectorAll('.v292-dlg-card');
    var fixed = 0;
    for (var i = 0; i < cards.length; i++){
      try { if (repairCard(cards[i])) fixed++; } catch(e){}
    }
    if (fixed > 0){
      console.log(TAG, 'repaired', fixed, '/', cards.length, 'cards (' + reason + ')');
    }
    return fixed;
  }

  // ---------- (4) public helper ----------
  window.regenerateAvatarsInDom = function(){
    return repairAll('manual');
  };

  // ---------- (5) MutationObserver ----------
  function attachObserver(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream){
      // 後から DOM に追加される可能性があるので body 全体を観測しておき、
      // dialogue-stream が出現したら再 attach
      var bodyMo = new MutationObserver(function(){
        if (document.getElementById('dialogue-stream')){
          bodyMo.disconnect();
          attachObserver();
        }
      });
      bodyMo.observe(document.body, { childList: true, subtree: true });
      return;
    }

    var mo = new MutationObserver(function(mutations){
      var needCheck = false;
      for (var i = 0; i < mutations.length; i++){
        var m = mutations[i];
        if (m.addedNodes && m.addedNodes.length){ needCheck = true; break; }
        if (m.type === 'characterData'){ needCheck = true; break; }
      }
      if (needCheck){
        // 同一 tick 内で多数 dispatch されるので少し遅延
        clearTimeout(window.__v292Dfix62RepairTimer);
        window.__v292Dfix62RepairTimer = setTimeout(function(){
          repairAll('mutation');
        }, 50);
      }
    });
    mo.observe(stream, {
      childList: true,
      subtree: true,
      characterData: true
    });
    console.log(TAG, 'MutationObserver attached to #dialogue-stream');
  }

  // ---------- init ----------
  function init(){
    installDfix15Avatar();
    // 既に描画済みのカードを修復
    var initFixed = repairAll('init');
    attachObserver();
    console.log(TAG, 'ready (initial repair:', initFixed, 'cards)');

    // 念のため renderStream を 1 回回して dfix56 の DO/STORY カードを再生成
    // させてから再走査（dfix56 の getAvatarFromHelpers が今度は dfix15.getAvatar
    // を通じて URL を返すようになる）
    try {
      var dl = window.__v292 && window.__v292.dialogueLayout;
      if (dl && typeof dl.renderStream === 'function'){
        dl.renderStream();
        setTimeout(function(){ repairAll('post-rerender'); }, 80);
      }
    } catch(e){
      console.warn(TAG, 'rerender err:', e && e.message);
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
