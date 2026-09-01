// =====================================================================
// Chronicle TRPG - v292Dfix489 (489b): 会話ログの入場審査（非発話引用の拒否）
// ---------------------------------------------------------------------
// 症状(おしん実プレイ 2026-07-18・slot smrnk1iqwek T6):
//   ・「認識した」who=リカ … 本文『「認識した」という小さな呼吸音だった』=発話でなくメンション
//   ・「伝言」who=リカ … 本文『「伝言」と言うために来たはずなのに』=来訪目的への言及
//   ・T7「、はは。なんだ…」… モデルが先頭読点付きで生成→カードにそのまま
//
// 設計(GPT-5.6レビュー 2026-07-18・採用):
//   ・fix469=誰が話したか / fix489=そもそも発話カードか・どう表示するか(責務分離)
//   ・★「」という を一律除去するのは禁止。実発話ホワイトリストを【先に】判定:
//       「助けて」という声 / 「帰る」と言った / 「やめろ」と言って は本物の発話 → 残す
//     その後で高確度の非発話(目的・メタ言語・呼称)だけ落とす。曖昧は残す(安全側)。
//   ・対象は読み込み後の新ターンのみ(過去ターンの表示変化=破損に見える)。
//   ・先頭の約物(、。)は表示層でのみ除去。保存データは不触。
//
// 既定ON。OFF: localStorage v292Dfix489Off='1'
// 検証口: window.__v292Dfix489 = { stats, isMention, planTurn, repair }
// バックアップ: 最初の変更前に chr6 → chr6_bk_fix489
// =====================================================================
(function(){
  'use strict';
  if (window.__f489done) return; window.__f489done = 1;
  var TAG = '[v292Dfix489:convlog-gate]';

  function off(){ try { return localStorage.getItem('v292Dfix489Off') === '1'; } catch(e){ return false; } }
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix489') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }
  function norm(s){ return String(s || '').replace(/[\s　。、，．！？!?…‥・「」『』]/g, ''); }

  // --- 1) 実発話ホワイトリスト(先に判定・GPT指定) ---
  var SPEECH_TAILS = [
    /^[\s　]*と(?:言っ|答え|尋ね|叫ん|呟い|囁い|告げ|吐き捨て|続け|返し|漏らし|繰り返し)/,
    /^[\s　]*と(?:言う|言い)(?:と|ながら|かけ)/,
    /^[\s　]*という(?:声|叫び|悲鳴|囁き|呟き|怒鳴り声)/,
    /^[\s　]*と[^。！？!?\n]{0,20}[がは](?:言っ|答え|叫ん|尋ね|呟い|囁い|告げ)/
  ];
  // --- 2) 高確度の非発話(後に判定) ---
  var MENTION_TAILS = [
    /^[\s　]*と(?:言う|いう|伝える)(?:ため|つもり|予定|必要|はず)/,                                  // 目的・予定
    /^[\s　]*と(?:いう|呼ばれる|称される|名付けられ)[^。、」\n]{0,8}(?:言葉|単語|語|表現|名称|名前|呼び名|意味|概念|文言|符丁|呼吸音|音|響き|文字|名)/,  // メタ言語
    /^[\s　]*と(?:呼ば|称さ|名付け|書か|書い|記さ)/                                                  // 呼称・記載
  ];

  // narrative の中で say が「非発話の言及」としてのみ現れるか
  function isMention(narr, say){
    var s = String(say || ''); if (!s || s.length > 40) return false;
    var n = String(narr || '');
    var q = '「' + s + '」';
    var p = n.indexOf(q);
    if (p < 0) return false;
    var mentionHit = false, speechHit = false;
    while (p >= 0){
      var tail = n.slice(p + q.length, p + q.length + 30);
      var atLineStart = (p === 0) || /\n[\s　]*$/.test(n.slice(0, p));
      // fix495(B8): 行頭でもメンション構文(「…」という呼吸音 等)が続くなら自動speech扱いしない。
      // 明示のSPEECH_TAILS(発話ホワイトリスト)は従来どおり最優先。
      var _ment = MENTION_TAILS.some(function(re){ return re.test(tail); });
      var isSpeech = SPEECH_TAILS.some(function(re){ return re.test(tail); }) || (atLineStart && !_ment);
      if (isSpeech) speechHit = true;
      else if (_ment) mentionHit = true;
      else speechHit = true;    // 曖昧は発話扱い(安全側)
      p = n.indexOf(q, p + 1);
    }
    return mentionHit && !speechHit;
  }

  function planTurn(t){
    var cs = t && t._convSays;
    if (!Array.isArray(cs) || !cs.length) return { changed: false, drops: [], arr: cs };
    var narr = String((t && (t.narrative || t.text || t.body)) || '');
    var pText = norm((t && t.playerText) || '');
    var out = [], drops = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var c = cs[i];
      if (!c) continue;
      if (!c.say){ out.push(c); continue; }   // fix495(F12): say欠落は不触で素通し
      if (c._rv === 1 || (pText && norm(c.say) === pText)){ out.push(c); continue; }   // react声/SAY入力は不触
      if (isMention(narr, c.say)){
        drops.push({ who: String(c.who || ''), say: String(c.say).slice(0, 14) });
        changed = true; continue;
      }
      out.push(c);
    }
    return { changed: changed, drops: drops, arr: out };
  }

  var baseTurns = -1;
  var backedUp = false;
  var doneReg = {};        // turnIndex -> sig (処理済みは再処理しない)
  function _dropOn(){ try { return localStorage.getItem('v292Dfix489DropOn') === '1'; } catch(e){ return false; } }  // fix495(B5)
  var _stats = { wouldDrop: 0, backupFail: 0 };
  // fix495(B2): スロット切替検知(469と同型)。持ち越すと新スロットの過去ターンを新ターン扱いで審査してしまう。
  function _activeStoreKey(){
    try { var a = JSON.parse(localStorage.getItem('chr6_active_slot') || 'null');
          if (a && a !== 'default') return 'chr6_slot_' + a; } catch(e){}
    return 'chr6';
  }
  /* ■fix784(2026-09-01) MULTI_TAB Tier3: backup provenance(控えの出所)専用のキー解決。
     真因: 控えの元キーが共有ポインタ chr6_active_slot 由来なので、別タブが物語を開いた
       瞬間に **chr6_bk_fix489_<key> の控えとして別 story の本体が保存される**(出所誤り)。
     対処: 控えの元キーだけを fix694 document authority で解決する。authority 無し = null =
       控えない → 既存の fail-closed(控え不能なら破壊的変更を中止)にそのまま合流する。
       _activeStoreKey()/_slotGate() は**意図的に不触**。あれは「物語が切り替わったか」の
       検知器(3 重検知の 1 つ)であって控えの出所ではなく、別タブで発火しても安全側
       (state reset)に倒れる——Tier3 の範囲外として DEFER 記録。
     kill: localStorage v292Dfix783Off='1' → 旧挙動(_activeStoreKey() そのもの)へ戻る。 */
  function _bk784Key(){
    try { if (localStorage.getItem('v292Dfix783Off') === '1') return _activeStoreKey(); } catch(e){}
    try { var dk = window.__chronicleDocumentStoryKey; if (typeof dk === 'string' && dk) return dk; } catch(e){}
    return null;
  }
  var _lastSlotKey = null, _lastTurnsRef = null, _lastT0 = null;
  function _t0fp(S){ try { var t0 = S.turns[0]; return String((t0 && (t0.narrative || t0.text || '')) || '').slice(0, 80); } catch(e){ return ''; } }
  function _slotGate(S){
    var k = _activeStoreKey(), fp = _t0fp(S);
    var changed = (_lastSlotKey !== null && k !== _lastSlotKey) ||
                  (_lastTurnsRef !== null && S.turns !== _lastTurnsRef) ||
                  (_lastT0 !== null && fp !== _lastT0);       // fix495(B2): 3重検知(GPT裁定)
    if (changed){ baseTurns = -1; doneReg = {}; backedUp = false;
      try { console.log(TAG, 'slot/story switch detected -> state reset'); } catch(e){} }
    _lastSlotKey = k; _lastTurnsRef = S.turns; _lastT0 = fp;
    return changed;
  }
  function sigOf(t){
    var cs = (t && t._convSays) || [];
    var s = cs.length + '';
    for (var i = 0; i < cs.length; i++){ s += '|' + String(cs[i] && cs[i].say || '').length; }
    return s;
  }

  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    _slotGate(S);   // fix495(B2)
    if (baseTurns < 0) baseTurns = S.turns.length;
    var any = false, log = [];
    for (var ti = baseTurns; ti < S.turns.length; ti++){       // ★新ターンのみ
      var sig = sigOf(S.turns[ti]);
      if (doneReg[ti] === sig) continue;
      var p = planTurn(S.turns[ti]);
      if (p.changed && !_dropOn()){
        // fix495(B5): 物理drop(データ削除)は既定OFF(GPT裁定)。診断ログのみ残し、データ・保存は不触。
        _stats.wouldDrop += p.drops.length;
        try { console.log(TAG, '[wouldDrop]', JSON.stringify(p.drops)); } catch(e){}
      } else if (p.changed){
        // fix495(B3): 控えはアクティブスロットの実キーから・スロット別キーへ。書けなければ中止(fail-closed)。
        var _bkOk = backedUp;
        if (!_bkOk){
          /* ■fix784: 控えの元キーは document authority。authority 無し = 控えない → _bkOk=false のまま fail-closed(drop中止)。 */
          try { var _ak = _bk784Key(); if (_ak){ localStorage.setItem('chr6_bk_fix489_' + _ak, localStorage.getItem(_ak) || ''); _bkOk = true; backedUp = true; } } catch(e){ _stats.backupFail++; }
        }
        if (_bkOk){
          S.turns[ti]._convSays = p.arr;
          any = true; log.push({ turn: ti + 1, drops: p.drops });
        } else { try { console.warn(TAG, 'backup failed -> drop中止(fail-closed)'); } catch(e){} }
      }
      doneReg[ti] = sigOf(S.turns[ti]);
    }
    if (any){
      try { if (S.save && !document.hidden) (typeof S.saveC==='function'?S.saveC('fix489.repair'):S.save()); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, JSON.stringify(log)); } catch(e){}
    }
    return { changed: any, log: log };
  }

  // --- 3) [489bで撤去] 表示層の先頭約物除去は廃止 ---
  // 理由: .dlg-text の書き換えで fix66 の「データ⇔DOM」照合が外れ、2.5秒毎に同一カードが
  //   再追加される無限ループを実機で誘発した(fix458→fix466 と同じ地雷。表示文字列=同一性キー)。
  //   先頭の読点はモデルの書き癖でありコスメ問題のみ → 触らない。直すなら将来、カード生成前の
  //   データ整形(norm系キーに影響しない形)で行う。
  function tidyCards(){ /* no-op (489b) */ }

  function tick(){
    try {
      if (off()) return;
      repair();
    } catch(e){}
  }
  try { setTimeout(tick, 4500); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix489 = { __armed: true, stats: _stats, isMention: isMention, planTurn: planTurn, repair: repair, tidyCards: tidyCards };
  try { console.log(TAG, 'loaded 489b'); } catch(e){}
})();
