/* ============================================================================
 * v292Dfix244: 心理プロファイル入力欄の統合(入力しやすさ改善)
 *
 * おしん要望: キャラ編集の「性格特性/核心的欲求/核心的恐怖/傷・過去」の4欄は
 *   分かれていて入力が手間。1つの自由記述欄にまとめたい。ただしエンジンは
 *   核心的欲求/恐怖を①プロンプト②話し方推定③地の文注入の3箇所で参照する
 *   (load-bearing)ので、裏のデータ構造(personality/coreDesire/coreFear/wound)は
 *   保ったまま、入力UIだけ1欄に統合する。
 *
 * 仕組み: キャラ編集カード内に data-f="coreDesire" がある=心理欄ありと判定。
 *   元の4つの .fld(性格特性/欲求/恐怖/傷)を隠し、上に1つの自由記述textareaを挿入。
 *   - 既存値から初期テキストを組み立て(本文 + 「欲求: …」「恐怖: …」「過去: …」行)。
 *   - 入力のたびにパースし、隠した4つの input/textarea(data-f)へ書き戻す
 *     (input/changeイベントも発火=既存の保存ロジック1573行がそのまま読む)。
 *   パース: 行頭「欲求:/望み:/desire:」→coreDesire、「恐怖:/恐れ:/fear:」→coreFear、
 *     「過去:/傷:/トラウマ:/背景:/wound:」→wound、それ以外の行→personality。
 *     キーワード行が無ければ全文→personality(=従来の欲求/恐怖空欄と同じ挙動。
 *     プロンプト側はfix244で「明示無ければ人物像から推し量れ」を指示済み)。
 * OFF: localStorage v292PsychMergeOff='1'
 * ========================================================================== */
(function(){
  var TAG = '[v292Dfix244]';
  try { if (localStorage.getItem('v292PsychMergeOff') === '1') return; } catch(e){}
  if (window.__v292Dfix244) return; window.__v292Dfix244 = 1;

  var DESIRE_RE = /^\s*(?:核心的欲求|欲求|望み|desire)\s*[:：]\s*/i;
  var FEAR_RE   = /^\s*(?:核心的恐怖|恐怖|恐れ|fear)\s*[:：]\s*/i;
  var WOUND_RE  = /^\s*(?:傷・過去|過去|傷|トラウマ|背景|wound)\s*[:：]\s*/i;

  function getF(card, f){ return card.querySelector('[data-f="' + f + '"]'); }

  function buildInitial(card){
    var pers = (getF(card,'personality')||{}).value || '';
    var des  = (getF(card,'coreDesire')||{}).value || '';
    var fear = (getF(card,'coreFear')||{}).value || '';
    var wnd  = (getF(card,'wound')||{}).value || '';
    var lines = [];
    if (pers.trim()) lines.push(pers.trim());
    if (des.trim())  lines.push('欲求: ' + des.trim());
    if (fear.trim()) lines.push('恐怖: ' + fear.trim());
    if (wnd.trim())  lines.push('過去: ' + wnd.trim());
    return lines.join('\n');
  }

  function setVal(el, v){
    if (!el) return;
    try {
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    } catch(e){ el.value = v; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function parseAndSync(card, text){
    var des = '', fear = '', wnd = '', pers = [];
    String(text || '').split(/\r?\n/).forEach(function(ln){
      if (DESIRE_RE.test(ln))      des  = (des  ? des  + ' ' : '') + ln.replace(DESIRE_RE, '').trim();
      else if (FEAR_RE.test(ln))   fear = (fear ? fear + ' ' : '') + ln.replace(FEAR_RE, '').trim();
      else if (WOUND_RE.test(ln))  wnd  = (wnd  ? wnd  + ' ' : '') + ln.replace(WOUND_RE, '').trim();
      else if (ln.trim())          pers.push(ln.trim());
    });
    setVal(getF(card,'personality'), pers.join(' '));
    setVal(getF(card,'coreDesire'),  des);
    setVal(getF(card,'coreFear'),    fear);
    setVal(getF(card,'wound'),       wnd);
    card.__f244sig = fieldsSig(card); /* v292Dfix244b: 自分で書いた直後の署名を記録(逆同期の誤発火防止) */
  }

  /* v292Dfix244b: 隠した4フィールドの内容署名。AI生成(applyScenario)は el.value= で
     直接書く(イベント無し)ので、ポーリングで差分検知し統合欄へ反映する。 */
  function fieldsSig(card){
    return ['personality','coreDesire','coreFear','wound'].map(function(f){ return (getF(card,f)||{}).value || ''; }).join('');
  }
  /* 裏フィールドが外部(AIランダム生成等)で変わったら統合textareaを作り直して見せる。
     ユーザーが統合欄を編集中(focus)なら触らない。 */
  function resyncCard(card){
    var ta = card.__f244ta;
    if (!ta) return;
    if (document.activeElement === ta) return;
    var sig = fieldsSig(card);
    if (sig === card.__f244sig) return;
    ta.value = buildInitial(card);
    card.__f244sig = sig;
  }

  function mergeCard(card){
    if (card.__fix244) return;
    var anchor = getF(card, 'coreDesire');
    if (!anchor) return;                 // 心理欄が無いカードは対象外
    card.__fix244 = 1;

    // 元の4 .fld(性格特性/欲求/恐怖/傷)を隠す
    ['personality','coreDesire','coreFear','wound'].forEach(function(f){
      var el = getF(card, f);
      var fld = el && el.closest ? el.closest('.fld') : (el && el.parentNode);
      if (fld) fld.style.display = 'none';
    });

    // 統合textareaを挿入(心理プロファイル見出しの直後、もしくは最初の隠し欄の前)
    var wrap = document.createElement('div');
    wrap.className = 'fld v244-merged';
    var lbl = document.createElement('label');
    lbl.textContent = '性格・背景（自由記述。「欲求:」「恐怖:」「過去:」と行頭に書くと役割に反映）';
    var ta = document.createElement('textarea');
    ta.setAttribute('data-f244', '1');
    ta.style.minHeight = '110px';
    ta.placeholder = '例:\n寡黙で忠誠心が強い武人気質。\n欲求: 故郷を取り戻す\n恐怖: 過去が暴かれること\n過去: 孤児院で厳しく管理された幼少期';
    ta.value = buildInitial(card);
    ta.addEventListener('input', function(){ parseAndSync(card, ta.value); });
    card.__f244ta = ta; /* v292Dfix244b: 逆同期用にtextarea参照を保持 */
    wrap.appendChild(lbl); wrap.appendChild(ta);

    var divider = card.querySelector('.psych-divider');
    var firstHidden = (getF(card,'personality') && getF(card,'personality').closest) ? getF(card,'personality').closest('.fld') : null;
    if (divider && divider.nextSibling) divider.parentNode.insertBefore(wrap, divider.nextSibling);
    else if (firstHidden) firstHidden.parentNode.insertBefore(wrap, firstHidden);
    else card.appendChild(wrap);

    // 初期同期(既存値の整形済み再書き込み=無害)
    parseAndSync(card, ta.value);
  }

  function scan(){
    var cards = document.querySelectorAll('.npc-card, [data-f="coreDesire"]');
    // coreDesireを含む最近接カードを集合化
    var seen = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-f="coreDesire"]'), function(inp){
      var card = inp.closest ? (inp.closest('.npc-card') || inp.closest('.fld') ? inp.closest('.npc-card') || inp.parentNode.parentNode : inp.parentNode) : inp.parentNode;
      // カード= coreDesire を含む最寄りの、personality/coreFear も含むコンテナ
      var c = inp;
      for (var i=0;i<6 && c;i++){ c = c.parentNode; if (c && c.querySelector && c.querySelector('[data-f="coreFear"]') && c.querySelector('[data-f="personality"]')) break; }
      if (c && seen.indexOf(c) < 0){ seen.push(c); if (c.__fix244) resyncCard(c); else mergeCard(c); }
    });
  }

  function boot(){
    try { setInterval(scan, 1200); } catch(e){}
    try {
      var mo = new MutationObserver(function(){ scan(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch(e){}
    scan();
    try { console.log(TAG, 'psych-merge armed'); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
