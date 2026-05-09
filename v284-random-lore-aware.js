/* v284: random-fill lore awareness via LLM (full delegation)
 *
 * 概要:
 *   設定パネルの「🎲 未入力をランダム生成」ボタン (UI.randomFill) を wrap し、
 *   未入力だったフィールド (hero.name / hero.desc / 各 NPC の name / desc) を、
 *   世界観 (cfgLore) に馴染むキャラに LLM が全権で生成し直す。
 *
 * 哲学 (CLAUDE_RULES.md §3 + おしんさん 2026-05-09 指示):
 *   - 「制約より刺激」 — LLM の自由度を最大化
 *   - 固定リストを廃止せず、「lore 無し」「API キー無し」「LLM 失敗」時は
 *     既存挙動 (固定リスト) にフォールバック
 *   - 名前を固定プールに縛らない (世界観に響く造語名 OK)
 *   - 性別・年齢・種族・職能・立場すべて世界観に合わせて自由
 *
 * 動作:
 *   1) wrap前にフォームの blank フラグを snapshot
 *   2) orig (v111→v108→base) を呼ぶ … base が cfgLore も埋める (空なら固定リスト)
 *   3) lore + APIキーがあれば、blank だった項目だけ LLM で生成
 *   4) DOM に書き込み + localStorage cast にも sync (v111 上書き防止)
 *
 * 依存: index.html の UI.randomFill / S.api.call(sys, user, maxTok) / cfgLore #/cfgHName/cfgHDesc / .npc-card[data-f]
 * Chain: v111 (form sync) ← v108 (gender) ← v284 (lore-aware)  ※v284 が最外
 * Idempotent: __v284Active / UI.__v284Hooked
 */
(function v284(){
  var TAG = '[v284]';
  if (window.__v284Active) return;
  window.__v284Active = true;
  console.log(TAG, 'init');

  // ── snapshot which form fields are blank, BEFORE orig fills them ──
  function snapshotBlanks(){
    var hN = document.getElementById('cfgHName');
    var hD = document.getElementById('cfgHDesc');
    var blank = {
      hName: hN ? !hN.value.trim() : false,
      hDesc: hD ? !hD.value.trim() : false,
      oldNpcCount: 0,
      npcs: [] // [{name:bool, desc:bool}, ...] — true = was blank (or newly added)
    };
    var cards = document.querySelectorAll('#npcList .npc-card');
    blank.oldNpcCount = cards.length;
    cards.forEach(function(card){
      var n = card.querySelector('[data-f="name"]');
      var d = card.querySelector('[data-f="desc"]');
      blank.npcs.push({
        name: n ? !n.value.trim() : false,
        desc: d ? !d.value.trim() : false
      });
    });
    return blank;
  }

  // base randomFill が NPC 0 件時に 1 件追加するので、追加分も blank として扱う
  function extendBlanksForNewNpcs(blank){
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = blank.oldNpcCount; i < cards.length; i++){
      blank.npcs[i] = { name: true, desc: true };
    }
  }

  function getLore(){
    var l = document.getElementById('cfgLore');
    return l ? l.value.trim() : '';
  }

  function listAskFields(blank){
    var ask = [];
    if (blank.hName) ask.push('hero.name');
    if (blank.hDesc) ask.push('hero.desc');
    blank.npcs.forEach(function(n, i){
      if (n.name) ask.push('npcs[' + i + '].name');
      if (n.desc) ask.push('npcs[' + i + '].desc');
    });
    return ask;
  }

  function buildPrompt(lore, blank){
    var ask = listAskFields(blank);
    if (ask.length === 0) return null;
    var npcCount = blank.npcs.length;

    // 肯定文の刺激のみ。禁止語を増やさない。
    var sys = [
      '与えられた世界観に自然に馴染むキャラクターを作ってください。',
      '・名前は世界観の語彙・響きに合わせて自由に造語してよい (既存リストに縛られない)',
      '・性別・年齢・種族・職能・立場・体質・癖は世界観に合わせて自由に決めてよい',
      '・desc は1〜3文の自然な日本語紹介。性別/年齢/特徴/小さな秘密や癖などを織り込めると良い',
      '・複数キャラがいれば互いの対比や関係性が滲むと魅力的 (強制ではない)',
      '・出力は厳密に JSON のみ。前後に説明文・コードフェンス・コメントは付けない'
    ].join('\n');

    var user = [
      '【世界観】',
      lore,
      '',
      '【生成してほしいフィールド】',
      JSON.stringify(ask),
      '',
      '【NPC 数】 ' + npcCount,
      '',
      '【出力 JSON 形式の例】',
      '{"hero":{"name":"...","desc":"..."},"npcs":[{"name":"...","desc":"..."},{"name":"...","desc":"..."}]}',
      '',
      '※ 必要なフィールドだけ含めればよい。npcs 配列は対応する index に入れる。',
      '※ name は短く呼び名として機能する形 (フルネームでも、二つ名でも、種族名でも自由)。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  // ── tolerant JSON parse (markdown fence / 前後ノイズ除去) ──
  function safeParseJson(text){
    if (!text) return null;
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    try { return JSON.parse(s); } catch (e) {}
    var lo = s.indexOf('{'), hi = s.lastIndexOf('}');
    if (lo >= 0 && hi > lo){
      try { return JSON.parse(s.slice(lo, hi + 1)); } catch (e) {}
    }
    return null;
  }

  function setVal(el, v){
    if (!el || v === undefined || v === null) return false;
    var s = String(v).trim();
    if (!s) return false;
    el.value = s;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
    return true;
  }

  function applyResult(blank, parsed){
    if (!parsed || typeof parsed !== 'object') return 0;
    var changed = 0;
    var hN = document.getElementById('cfgHName');
    var hD = document.getElementById('cfgHDesc');
    if (blank.hName && parsed.hero && setVal(hN, parsed.hero.name)) changed++;
    if (blank.hDesc && parsed.hero && setVal(hD, parsed.hero.desc)) changed++;

    var cards = document.querySelectorAll('#npcList .npc-card');
    var pNpcs = (parsed.npcs && Array.isArray(parsed.npcs)) ? parsed.npcs : [];
    blank.npcs.forEach(function(b, i){
      var card = cards[i]; if (!card) return;
      var p = pNpcs[i] || {};
      if (b.name && setVal(card.querySelector('[data-f="name"]'), p.name)) changed++;
      if (b.desc && setVal(card.querySelector('[data-f="desc"]'), p.desc)) changed++;
    });
    return changed;
  }

  // localStorage cast を form と同期 (v111 が後で sync しても上書きされないように)
  function syncCastFromForm(){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cast = s.cast || {};
      s.cast.hero = s.cast.hero || {};
      var hN = document.getElementById('cfgHName');
      var hD = document.getElementById('cfgHDesc');
      if (hN) s.cast.hero.name = hN.value.trim();
      if (hD) s.cast.hero.desc = hD.value.trim();
      s.cast.npcs = s.cast.npcs || [];
      document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
        s.cast.npcs[i] = s.cast.npcs[i] || {};
        var nameEl = card.querySelector('[data-f="name"]');
        var descEl = card.querySelector('[data-f="desc"]');
        if (nameEl) s.cast.npcs[i].name = nameEl.value.trim();
        if (descEl) s.cast.npcs[i].desc = descEl.value.trim();
      });
      localStorage.setItem('chr6', JSON.stringify(s));
    } catch(e){
      console.warn(TAG, 'cast sync failed', e && e.message);
    }
  }

  function hasApiKey(){
    try {
      var prov = (window.S && S.cfg && S.cfg.provider) || '';
      if (prov === 'openrouter') return !!(S.cfg.orKey && S.cfg.orKey.trim());
      if (prov === 'novelai')    return !!(S.cfg.naiKey && S.cfg.naiKey.trim());
      return !!(S.cfg.key && S.cfg.key.trim());
    } catch(e){ return false; }
  }

  function showStatus(msg){
    try {
      if (typeof UI !== 'undefined' && UI && typeof UI.setStatus === 'function') UI.setStatus(msg);
    } catch(e){}
  }

  function loreEnhance(blank){
    extendBlanksForNewNpcs(blank);
    var lore = getLore();
    if (!lore){
      console.log(TAG, 'no lore — skip LLM');
      return;
    }
    if (!hasApiKey()){
      console.log(TAG, 'no API key — skip LLM');
      return;
    }
    var pr = buildPrompt(lore, blank);
    if (!pr){
      console.log(TAG, 'no blank fields — skip LLM');
      return;
    }
    if (!(window.S && S.api && typeof S.api.call === 'function')){
      console.warn(TAG, 'S.api.call not ready');
      return;
    }
    showStatus('🌌 世界観に馴染むキャラを生成中…');
    console.log(TAG, 'LLM ask fields', listAskFields(blank));
    S.api.call(pr.sys, pr.user, 1200).then(function(r){
      if (!r || !r.text){
        console.warn(TAG, 'LLM returned empty');
        return;
      }
      var parsed = safeParseJson(r.text);
      if (!parsed){
        console.warn(TAG, 'JSON parse failed:', String(r.text).slice(0, 200));
        return;
      }
      console.log(TAG, 'parsed', parsed);
      var n = applyResult(blank, parsed);
      if (n > 0){
        syncCastFromForm();
        showStatus('🌌 ' + n + ' 件を世界観に馴染ませました');
        console.log(TAG, 'applied', n, 'fields');
      } else {
        console.log(TAG, 'no fields applied');
      }
    }).catch(function(e){
      console.warn(TAG, 'LLM error', e && e.message);
      showStatus('🎲 ランダム生成しました（世界観連動はスキップ）');
    });
  }

  function hookRandomFill(){
    if (typeof UI !== 'object' || !UI) return;
    if (UI.__v284Hooked) return;
    if (typeof UI.randomFill !== 'function') return;
    var orig = UI.randomFill.bind(UI);
    UI.randomFill = function(){
      var blank = snapshotBlanks();
      var r = orig.apply(this, arguments);
      // base が _fillNpcRandom を 50ms setTimeout で呼ぶ + v111 が 50/300ms で form sync する
      // → 全部終わってから LLM 起動 (LLM 自体は数秒かかる)
      setTimeout(function(){ loreEnhance(blank); }, 400);
      return r;
    };
    UI.__v284Hooked = true;
    console.log(TAG, 'UI.randomFill wrapped');
  }

  function init(){ hookRandomFill(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 500);
  setTimeout(init, 2000);
  setTimeout(init, 4000);

  // Console から触れる
  window.__v284 = {
    snapshotBlanks: snapshotBlanks,
    buildPrompt: buildPrompt,
    safeParseJson: safeParseJson,
    loreEnhance: loreEnhance,
    listAskFields: listAskFields
  };
  console.log(TAG, 'v284 active: random-lore-aware (LLM full delegation)');
})();
