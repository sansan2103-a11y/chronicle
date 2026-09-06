// =====================================================================
// Chronicle TRPG - v292Dfix825: SCENARIO_ORIGINAL_UI_V1 + 「この物語を始める」bridge（home 専用）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06 (31)(32):
//   SCENARIO_ORIGINAL_UI_V1 = GO_STAGE_WITH_REVISIONS / HOST = HOME_HTML / SAME_DOCUMENT = YES /
//   SEPARATE_PAGE = REJECTED_V1 / INLINE GIANT UI = REJECTED / SCENARIO_UI_OWNER = v292Dfix825-scenario-ui.js /
//   SCENARIO_ENTRY = ASIDE_ALWAYS_VISIBLE_AREA（#scBtn・モバイルでも到達可能）
//
// ■ これは何か
//   Scenario Original（fix820 store）を「作る・編集する・AI で広げる・保存する・そこから独立 Story を始める」画面。
//   home.html 内のビュー切替（LIST ⇄ SC_LIST ⇄ SC_EDIT ⇄ SC_REVIEW overlay）。既存 Story 一覧（render()/global
//   delegation）には 1 行も混ぜない。index.html には載せない（INDEX_LOAD = 0）。
//
// ■ authority（裁定 31/32・1 つでも破ったら実装ミス）
//   AI EXPAND != SAVE      … 🌱/🎲 は fix823.expand()（store 不読不書）→ 候補は SC_REVIEW で Owner が
//                            「全採用 / 全破棄」→ 採用しても **draft だけ**が変わる。expandAndSave() は使わない。
//   SAVE != START STORY    … 「保存」= fix820 create/edit（whole-value）。navigation 0。
//   SAVEABLE != STARTABLE  … 保存可否 = fix820.validate のみ（UI 独自の完成条件 0・部分入力は保存可）。
//                            開始可否 = startability()（保存済み ∧ !dirty ∧ 下流契約 = fix819 の title 必須 ∧ 依存あり）。
//   START STORY PATH       … saved read → startability → **既存 f667 auth gate（home bridge 経由）** →
//                            __chronicleHome.newStoryRuntime() → fix820.toInstantiationInput → fix819.instantiate →
//                            fresh ID → __chronicleHome.openInstantiatedStory(id)（&new=1 は home bridge が付ける。
//                            fix825 は URL 式を持たない = SCENARIO_START_NAVIGATION = MATCH_EXISTING_NEW_STORY_PATH）。
//   STORY_GATE_AUTHORITY = EXISTING_F667 … fix825 は googleAvailable/passAvailable/proxyOff 等から gate を再計算しない。
//                            Login / pass 認証 / credential validation を再実装しない。
//   STALE_AI_CANDIDATE     … draftRevision（単純 counter）。AI 開始時の revision と到着時が違えば候補を捨てる（write 0）。
//   SINGLE_FLIGHT          … expand / save / delete / start は busy 中に再入しない。start の二重発火 → instantiate exactly 1。
//   DRAFT = MEMORY ONLY V1 … LS / sessionStorage / 新 key 0。dirty indicator 必須。
//                            UNSAVED_DRAFT_BROWSER_RELOAD_LOSS = KNOWN_V1（beforeunload は付けない）。
//   REPEATED START         … 何度でも fresh Story。Story title = Scenario title（SCENARIO_TITLE != STORY_IDENTITY）。
//   禁止: fix41/applyTemplate 0・Scenario を active Story 化 0・Scenario body を Story として保存 0・Story ID 再利用 0・
//         既存 delegation selector（.card / [data-open] / [data-v] / #newCard / #playBtn 等）を #scView 配下で使わない。
//   fix819 / fix820 / fix823 / fix436 / fix335 / fix247 は変更 0（呼ぶだけ）。
//
// 検証口: window.__v292Dfix825 = { version, state, startability, api }（api は fixture 用・DOM を通さず同じ関数を呼ぶ）
// 既定: dormant（#scBtn は home 側で hidden。Owner reachable 解放 = hidden を外す 1 行）。kill: v292Dfix825Off='1'。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix825) return;
  var TAG = '[v292Dfix825:scenario-ui]';
  var VERSION = 'v292Dfix825-20260906-ui-v1.0';
  var SCENE_FIELDS = ['lore', 'loc', 'obj', 'tone'];
  var HERO_FIELDS  = ['name', 'desc'];
  var NPC_FIELDS   = ['name', 'desc', 'personality', 'coreDesire', 'coreFear', 'wound'];
  var LABEL = {
    title: 'タイトル', lore: '世界観メモ', loc: '現在の場所', obj: '物語の前提・目的', tone: '文体・雰囲気',
    heroName: '主人公の名前', heroDesc: '主人公の説明（性格・外見・立場）',
    startCondition: '開始時の状況（物語の最初の場面・配置・直前の出来事。1〜3文）',
    startRules: '開始ルール（作者が定めた約束。物語全体で持続する）'
  };
  var NPC_LABEL = { name: '名前', desc: '外見・立場', personality: '性格特性', coreDesire: '核心的欲求', coreFear: '核心的恐怖', wound: '傷・過去' };
  var DEFAULT_TITLE = '新しい物語';

  /* ---------- deps（呼ぶだけ・無ければ機能単位で disabled） ---------- */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix825Off') === '1'; }
  function ST(){ return window.__v292Dfix820 || null; }
  function INST(){ return window.__v292Dfix819 || null; }
  function SEED(){ return window.__v292Dfix823 || null; }
  function HOME(){ var h = window.__chronicleHome; return (h && typeof h === 'object') ? h : null; }
  function homeReady(){
    var h = HOME();
    return !!(h && typeof h.openInstantiatedStory === 'function' && typeof h.newStoryRuntime === 'function' && typeof h.needsStoryGate === 'function');
  }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function esc(t){ return str(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fail(code, detail){ var r = { ok: false, code: code }; if (detail !== undefined) r.detail = detail; return r; }

  /* ---------- state（メモリのみ） ---------- */
  var S = {
    wired: false, view: 'LIST',
    draft: null, scenarioId: null, dirty: false, draftRevision: 0, savedSnapshot: null,
    busy: null, hardStop: false, candidate: null, candidateReport: null, lastError: null, lastNote: null,
    starts: 0, navigated: false
  };

  /* ---------- draft model（文字列は常に存在。'' = 空欄） ---------- */
  function emptyNpc(){ var o = {}; for (var i = 0; i < NPC_FIELDS.length; i++) o[NPC_FIELDS[i]] = ''; return o; }
  function emptyDraft(){
    var d = { title: DEFAULT_TITLE, scene: {}, cast: { hero: {}, npcs: [] }, startCondition: '', startRules: '' };
    for (var i = 0; i < SCENE_FIELDS.length; i++) d.scene[SCENE_FIELDS[i]] = '';
    for (var h = 0; h < HERO_FIELDS.length; h++) d.cast.hero[HERO_FIELDS[h]] = '';
    return d;
  }
  /* store の read 結果 / fix823 candidate（空 key が落ちている）→ draft 形へ正規化。title は省略時 keepTitle */
  function toDraft(src, keepTitle){
    var s = isObj(src) ? src : {};
    var d = emptyDraft();
    d.title = (typeof s.title === 'string' && trim(s.title)) ? s.title : (keepTitle != null ? keepTitle : DEFAULT_TITLE);
    var sc = isObj(s.scene) ? s.scene : {};
    for (var i = 0; i < SCENE_FIELDS.length; i++) d.scene[SCENE_FIELDS[i]] = str(sc[SCENE_FIELDS[i]]);
    var cast = isObj(s.cast) ? s.cast : {};
    var hero = isObj(cast.hero) ? cast.hero : {};
    for (var h = 0; h < HERO_FIELDS.length; h++) d.cast.hero[HERO_FIELDS[h]] = str(hero[HERO_FIELDS[h]]);
    var npcs = isArr(cast.npcs) ? cast.npcs : [];
    for (var n = 0; n < npcs.length; n++){
      var src = isObj(npcs[n]) ? npcs[n] : {}, o = emptyNpc();
      for (var k = 0; k < NPC_FIELDS.length; k++) o[NPC_FIELDS[k]] = str(src[NPC_FIELDS[k]]);
      d.cast.npcs.push(o);
    }
    d.startCondition = str(s.startCondition);
    d.startRules = str(s.startRules);
    return d;
  }
  /* draft → fix820 入力（同形・whitelist と 1:1。空文字は fix820 が落とす） */
  function toStoreInput(d){ return clone(d); }
  function bump(){ S.draftRevision++; S.dirty = (S.savedSnapshot == null) ? true : (JSON.stringify(S.draft) !== S.savedSnapshot); }

  /* ---------- startability（下流契約からの導出のみ。UI 独自条件 0） ---------- */
  function startability(){
    if (off()) return fail('OFF');
    if (S.hardStop) return fail('HARD_STOP');
    if (!S.scenarioId) return fail('NOT_SAVED');                 /* 保存済み原本のみ */
    if (S.dirty) return fail('DIRTY');                            /* 未保存の変更あり */
    var st = ST(), ins = INST();
    if (!st) return fail('FIX820_UNAVAILABLE');
    if (!ins || typeof ins.instantiate !== 'function') return fail('FIX819_UNAVAILABLE');
    try { if (ins.state && ins.state().off) return fail('FIX819_OFF'); } catch(e){}
    if (!homeReady()) return fail('HOME_BRIDGE_UNAVAILABLE');
    var r = st.read(S.scenarioId); if (!r.ok) return r;
    var ti = st.toInstantiationInput(r.scenario);
    if (!trim(ti.initialTitle)) return fail('NO_TITLE');         /* fix819 契約: initialTitle 必須 */
    var warnings = [];
    /* fix819.project は name の無い NPC を落とす（下流契約）。保存済み原本には fix820 validate 上存在しないが導出は残す */
    var npcs = (r.scenario && r.scenario.cast && isArr(r.scenario.cast.npcs)) ? r.scenario.cast.npcs : [];
    for (var i = 0; i < npcs.length; i++){ if (!trim(npcs[i] && npcs[i].name)) warnings.push({ code: 'NPC_WITHOUT_NAME_NOT_PROJECTED', index: i }); }
    return { ok: true, scenario: r.scenario, input: ti.input, initialTitle: ti.initialTitle, warnings: warnings };
  }

  /* ---------- 文言 ---------- */
  function msg(code, detail){
    switch (code){
      case 'NO_TITLE': return 'タイトルを入力してください';
      case 'NPC_WITHOUT_NAME': return 'NPC ' + (detail + 1) + ' の名前が空です。名前の無い NPC は原本に保存できません（🌱 で埋めるか、行を削除してください）';
      case 'START_RULES_TOO_LONG': return '開始ルールが長すぎます（' + (detail && detail.codePoints) + ' / ' + (detail && detail.max) + ' 文字）';
      case 'STORY_ID_FORMAT_ASSUMPTION_VIOLATED': return 'この端末の物語 ID が想定外の形式のため、原本を作成できません';
      case 'ID_ALLOCATION_EXHAUSTED': case 'ID_COLLISION_EXHAUSTED': return 'ID の採番に失敗しました。もう一度お試しください';
      case 'ROLLBACK_FAILED': return '失敗し、元に戻せませんでした。ページを再読み込みしてください';
      case 'NOT_FOUND': case 'ORPHAN_META': case 'SCHEMA_VERSION_MISMATCH': case 'SCENARIO_ID_MISMATCH':
      case 'BODY_PARSE_FAILED': case 'BODY_NOT_OBJECT': return 'この原本は読めません（' + code + '）';
      case 'AI_UNAVAILABLE': return 'AI が使えません（Google ログインを確認してください）';
      case 'AI_FAILED': case 'BAD_JSON': case 'AI_VALUE_OVERSIZED': case 'NOTHING_APPLIED': case 'APPLY_ERROR':
        return 'AI 補完に失敗しました（' + code + '）。もう一度お試しください';
      case 'GENERATION_INCOMPLETE': case 'RANDOM_INCOMPLETE': return 'NPC を揃えられませんでした。名前を入れるか、もう一度お試しください';
      case 'NPC_COUNT_INVARIANT_VIOLATED': case 'BASE_MUTATED': return '内部整合性エラー（' + code + '）';
      case 'STALE_AI_CANDIDATE': return 'AI の生成中に入力が変わったため、候補を破棄しました。もう一度お試しください';
      case 'NO_BLANKS': return '埋める空欄がありません';
      case 'NOT_SAVED': return '先に保存してください';
      case 'DIRTY': return '未保存の変更があります。先に保存してください';
      case 'HOME_BRIDGE_UNAVAILABLE': return 'ホームとの接続が見つかりません（ページを再読み込みしてください）';
      case 'FIX819_UNAVAILABLE': case 'FIX819_OFF': case 'FIX820_UNAVAILABLE': case 'FIX823_UNAVAILABLE': case 'FIX436_UNAVAILABLE':
        return 'この機能に必要な部品が読み込まれていません（' + code + '）';
      case 'GATE_REQUIRED': return 'Google ログインの有効期限が切れています。ホームのログインボタンからログインしてください';
      case 'HARD_STOP': return '前の操作で復旧できない失敗が起きています。ページを再読み込みしてください';
      case 'OFF': return 'この機能は無効化されています';
      default:
        if (/_WRITE_FAILED$/.test(str(code)) || /_SERIALIZE_FAILED$/.test(str(code))) return '保存できませんでした（保存容量が不足している可能性があります）';
        return '失敗しました（' + code + '）';
    }
  }

  /* ---------- DOM ---------- */
  var root = null, btn = null, listSec = null, detailEl = null;
  function el(id){ return document.getElementById(id); }
  function q(sel, base){ return (base || root).querySelector(sel); }
  function qa(sel, base){ return Array.prototype.slice.call((base || root).querySelectorAll(sel)); }
  function injectStyle(){
    if (el('scStyle')) return;
    var s = document.createElement('style'); s.id = 'scStyle';
    s.textContent =
      '#scView{flex:1;min-width:0}' +
      '.sc-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
      '.sc-head .sc-h1{font-size:18px;font-weight:700;flex:1}' +
      '.sc-btn{padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--tx);font-size:13px;cursor:pointer}' +
      '.sc-btn:disabled{opacity:.45;cursor:default}' +
      '.sc-btn.sc-primary{border-color:var(--acc);color:var(--acc)}' +
      '.sc-btn.sc-start{background:var(--acc);color:#111;font-weight:700;border-color:var(--acc)}' +
      '.sc-btn.sc-danger:hover{color:#e08a8a;border-color:#a05a5a}' +
      '.sc-rows{display:flex;flex-direction:column;gap:8px}' +
      '.sc-row{display:flex;justify-content:space-between;gap:10px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel);cursor:pointer}' +
      '.sc-row:hover{border-color:var(--acc2)}' +
      '.sc-row .sc-t{font-weight:600}.sc-row .sc-m{font-size:11px;color:var(--dim);white-space:nowrap}' +
      '.sc-empty{color:var(--dim);font-size:13px;padding:30px 0;text-align:center}' +
      '.sc-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '@media(max-width:760px){.sc-form{grid-template-columns:1fr}}' +
      '.sc-f{display:flex;flex-direction:column;gap:4px}.sc-f.sc-wide{grid-column:1/-1}' +
      '.sc-f label{font-size:11px;color:var(--dim);letter-spacing:.04em}' +
      '.sc-f input,.sc-f textarea{background:var(--bg2);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;resize:vertical}' +
      '.sc-f textarea{min-height:64px}' +
      '.sc-sec{grid-column:1/-1;margin-top:8px;font-size:11px;letter-spacing:.1em;color:var(--dim);border-top:1px solid var(--line);padding-top:10px;display:flex;justify-content:space-between;align-items:center}' +
      '.sc-npc{grid-column:1/-1;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--panel)}' +
      '.sc-npc summary{cursor:pointer;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center}' +
      '.sc-npc .sc-form{margin-top:10px}' +
      '.sc-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}' +
      '.sc-badge{font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim)}' +
      '.sc-badge.sc-dirty{color:#ffd9a0;border-color:#a08a5a}.sc-badge.sc-saved{color:#9fd9a0;border-color:#5a8a5a}' +
      '.sc-msg{margin-top:10px;padding:10px 12px;border-radius:8px;font-size:12.5px;line-height:1.6}' +
      '.sc-msg.sc-err{background:rgba(224,138,138,.10);border:1px solid rgba(224,138,138,.3);color:#e6b4b4}' +
      '.sc-msg.sc-note{background:rgba(74,122,208,.10);border:1px solid rgba(74,122,208,.3);color:#c6d6f2}' +
      '.sc-cnt{font-size:11px;color:var(--dim);text-align:right}' +
      '.sc-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147482000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.sc-panel{max-width:720px;width:100%;max-height:90vh;overflow:auto;background:#1b1b22;color:#eee;border-radius:12px;padding:16px;line-height:1.6;font-size:13px;box-shadow:0 8px 28px rgba(0,0,0,.5)}' +
      '.sc-panel h3{margin:0 0 8px;font-size:15px}' +
      '.sc-diff{display:grid;grid-template-columns:150px 1fr;gap:6px 10px;font-size:12.5px;margin:10px 0}' +
      '.sc-diff .sc-k{color:#aab;}.sc-diff .sc-lock{color:#9fd9a0}.sc-diff .sc-new{color:#ffd9a0}' +
      '.sc-panel .sc-acts{justify-content:flex-end}';
    (document.head || document.documentElement).appendChild(s);
  }

  function showView(v){
    S.view = v;
    var sc = (v !== 'LIST');
    if (listSec) listSec.hidden = sc;
    if (detailEl) detailEl.hidden = sc;
    if (root) root.hidden = !sc;
  }

  /* ---- SC_LIST ---- */
  function renderList(){
    if (!root) return;
    var st = ST();
    var html = '<div class="sc-head"><div class="sc-h1">物語の原本</div>' +
      '<button class="sc-btn" data-sc-act="toStories">← 物語一覧へ</button>' +
      '<button class="sc-btn sc-primary" data-sc-act="new">＋ 原本を作る</button></div>';
    if (!st){ html += '<div class="sc-msg sc-err">' + esc(msg('FIX820_UNAVAILABLE')) + '</div>'; root.innerHTML = html; return; }
    var r = st.list();
    if (!r.ok){ html += '<div class="sc-msg sc-err">' + esc(msg(r.code, r.detail)) + '</div>'; root.innerHTML = html; return; }
    var rows = r.scenarios.slice().sort(function(a, b){ return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')); });
    if (!rows.length){
      html += '<div class="sc-empty">原本がありません。「＋ 原本を作る」から作成してください。<br>' +
              '<span style="font-size:12px">少しだけ書いて 🌱 AI に広げてもらう、🎲 全部おまかせ、どちらでも。気に入った原本から何度でも物語を始められます。</span></div>';
    } else {
      html += '<div class="sc-rows">' + rows.map(function(m){
        return '<div class="sc-row" data-sc-open="' + esc(m.scenarioId) + '"><div class="sc-t">' + esc(m.title || '(無題)') + '</div>' +
               '<div class="sc-m">作成 ' + esc(fmt(m.createdAt)) + (m.updatedAt ? ' ／ 更新 ' + esc(fmt(m.updatedAt)) : '') + '</div></div>';
      }).join('') + '</div>';
    }
    html += '<div class="sc-msg sc-note" style="margin-top:16px">原本は遊んでも変わりません。「▶ この物語を始める」を押すたびに、原本から新しい独立した物語が 1 本できます。</div>';
    root.innerHTML = html;
  }
  function fmt(iso){ try { var d = new Date(iso); if (isNaN(+d)) return '—'; return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch(e){ return '—'; } }

  /* ---- SC_EDIT ---- */
  function field(path, label, wide, multi){
    var v = getPath(path);
    var id = 'scf_' + path.replace(/[^a-zA-Z0-9]/g, '_');
    return '<div class="sc-f' + (wide ? ' sc-wide' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' +
      (multi ? '<textarea id="' + id + '" data-sc-field="' + esc(path) + '" rows="3">' + esc(v) + '</textarea>'
             : '<input id="' + id + '" type="text" data-sc-field="' + esc(path) + '" value="' + esc(v) + '">') +
      (path === 'startRules' ? '<div class="sc-cnt" data-sc-cnt="startRules"></div>' : '') + '</div>';
  }
  function getPath(path){
    var p = path.split('.'), o = S.draft;
    for (var i = 0; i < p.length; i++){ if (o == null) return ''; o = o[p[i]]; }
    return str(o);
  }
  function setPath(path, v){
    var p = path.split('.'), o = S.draft;
    for (var i = 0; i < p.length - 1; i++){ o = o[p[i]]; if (o == null) return; }
    o[p[p.length - 1]] = str(v);
  }
  function renderEdit(){
    if (!root || !S.draft) return;
    var d = S.draft;
    var html = '<div class="sc-head"><div class="sc-h1">' + (S.scenarioId ? '原本を編集' : '原本を作る') + '</div>' +
      '<span class="sc-badge" data-sc-badge></span>' +
      '<button class="sc-btn" data-sc-act="back">← 原本一覧へ</button></div>';
    html += '<div class="sc-form">' +
      field('title', LABEL.title, true, false) +
      field('scene.lore', LABEL.lore, true, true) +
      field('scene.loc', LABEL.loc, false, false) +
      field('scene.tone', LABEL.tone, false, false) +
      field('scene.obj', LABEL.obj, true, true) +
      '<div class="sc-sec"><span>主人公</span></div>' +
      field('cast.hero.name', LABEL.heroName, false, false) +
      field('cast.hero.desc', LABEL.heroDesc, true, true) +
      '<div class="sc-sec"><span>NPC（' + d.cast.npcs.length + ' 人' + (d.cast.npcs.length ? '' : '・🎲 全部おまかせ なら 2 人生成') + '）</span>' +
      '<button class="sc-btn" data-sc-act="npcAdd">＋ NPC を追加</button></div>';
    for (var n = 0; n < d.cast.npcs.length; n++){
      html += '<details class="sc-npc" open><summary><span>NPC ' + (n + 1) + (trim(d.cast.npcs[n].name) ? '：' + esc(d.cast.npcs[n].name) : '（名前なし）') + '</span>' +
        '<button class="sc-btn sc-danger" data-sc-npcdel="' + n + '">この NPC を削除</button></summary><div class="sc-form">';
      for (var k = 0; k < NPC_FIELDS.length; k++){
        var f = NPC_FIELDS[k];
        html += field('cast.npcs.' + n + '.' + f, NPC_LABEL[f], f !== 'name', f !== 'name');
      }
      html += '</div></details>';
    }
    html += '<div class="sc-sec"><span>開始</span></div>' +
      field('startCondition', LABEL.startCondition, true, true) +
      field('startRules', LABEL.startRules, true, true) +
      '</div>';
    html += '<div class="sc-acts">' +
      '<button class="sc-btn" data-sc-act="expand" title="空欄だけを AI が埋めます。書いた内容は変えません">🌱 AIで残りを広げる</button>' +
      '<button class="sc-btn" data-sc-act="omakase" title="全部おまかせ。NPC が 0 人なら 2 人作ります">🎲 全部おまかせ</button>' +
      '<button class="sc-btn sc-primary" data-sc-act="save">💾 保存</button>' +
      '<button class="sc-btn sc-start" data-sc-act="start">▶ この物語を始める</button>' +
      (S.scenarioId ? '<button class="sc-btn sc-danger" data-sc-act="delete">削除</button>' : '') +
      '</div><div data-sc-msg></div>';
    root.innerHTML = html;
    refreshEdit();
  }
  function refreshEdit(){
    if (S.view !== 'SC_EDIT' || !root) return;
    var badge = q('[data-sc-badge]');
    if (badge){
      badge.className = 'sc-badge ' + (S.dirty ? 'sc-dirty' : (S.scenarioId ? 'sc-saved' : ''));
      badge.textContent = S.dirty ? '未保存の変更あり' : (S.scenarioId ? '保存済み' : '未保存');
    }
    var cnt = q('[data-sc-cnt="startRules"]'), st = ST();
    if (cnt){
      var n = (st && st.codePoints && st.normRules) ? st.codePoints(st.normRules(S.draft.startRules)) : S.draft.startRules.length;
      var max = (st && st.state) ? st.state().startRulesMaxCodePoints : 300;
      cnt.textContent = n + ' / ' + max + ' 文字'; cnt.style.color = n > max ? '#e08a8a' : '';
    }
    var busy = !!S.busy, hard = S.hardStop;
    var seed = SEED(), transport = !!(seed && seed.transportAvailable && seed.transportAvailable());
    setDisabled('expand', busy || hard || !seed || !transport, !seed ? msg('FIX823_UNAVAILABLE') : (!transport ? msg('AI_UNAVAILABLE') : ''));
    setDisabled('omakase', busy || hard || !seed, !seed ? msg('FIX823_UNAVAILABLE') : '');
    setDisabled('save', busy || hard || (!S.dirty && !!S.scenarioId), '');
    var sa = startability();
    setDisabled('start', busy || hard || !sa.ok, sa.ok ? '' : msg(sa.code, sa.detail));
    setDisabled('delete', busy || hard, '');
    setDisabled('npcAdd', busy || hard, '');
    qa('[data-sc-npcdel]').forEach(function(b){ b.disabled = busy || hard; });
    var box = q('[data-sc-msg]');
    if (box){
      box.innerHTML = (S.lastError ? '<div class="sc-msg sc-err">' + esc(S.lastError) + '</div>' : '') +
                      (S.lastNote ? '<div class="sc-msg sc-note">' + esc(S.lastNote) + '</div>' : '');
    }
  }
  function setDisabled(act, dis, why){
    var b = q('[data-sc-act="' + act + '"]'); if (!b) return;
    b.disabled = !!dis; if (why != null) b.title = why || b.getAttribute('data-sc-title') || '';
  }
  function setError(code, detail){ S.lastError = code ? msg(code, detail) : null; S.lastNote = null; refreshEdit(); }
  function setNote(text){ S.lastNote = text || null; S.lastError = null; refreshEdit(); }

  /* ---- overlays（自前 confirm / review。window.confirm は使わない） ---- */
  function closeOverlay(){ var o = el('scOverlay'); if (o && o.parentNode) o.parentNode.removeChild(o); }
  function overlay(innerHtml, wire){
    closeOverlay();
    var w = document.createElement('div'); w.id = 'scOverlay'; w.className = 'sc-overlay';
    var p = document.createElement('div'); p.className = 'sc-panel'; p.innerHTML = innerHtml;
    w.appendChild(p); (document.body || document.documentElement).appendChild(w);
    if (wire) wire(p);
  }
  function confirmBox(text, onYes){
    overlay('<h3>確認</h3><div>' + esc(text) + '</div><div class="sc-acts"><button class="sc-btn" data-sc-c="no">いいえ</button><button class="sc-btn sc-primary" data-sc-c="yes">はい</button></div>',
      function(p){
        p.querySelector('[data-sc-c="no"]').addEventListener('click', closeOverlay, false);
        p.querySelector('[data-sc-c="yes"]').addEventListener('click', function(){ closeOverlay(); onYes(); }, false);
      });
  }
  function fieldLabel(key){
    var m = /^npc(\d+)_(\w+)$/.exec(key);
    if (m) return 'NPC ' + m[1] + ' の' + (NPC_LABEL[m[2]] || m[2]);
    return LABEL[key] || key;
  }
  function renderReview(){
    var cand = S.candidate, rep = S.candidateReport || {};
    var applied = {}; (rep.applied || []).forEach(function(k){ applied[k] = true; });
    var cd = toDraft(cand, S.draft.title);
    var rows = [], i, k;
    function row(key, label, oldV, newV){
      var isNew = !!applied[key] || (trim(oldV) === '' && trim(newV) !== '');
      rows.push('<div class="sc-k">' + esc(label) + '</div><div class="' + (isNew ? 'sc-new' : 'sc-lock') + '">' +
        (isNew ? '🌱 ' + esc(newV) : (trim(oldV) ? '🔒 ' + esc(oldV) : '（空欄のまま）')) + '</div>');
    }
    row('heroName', LABEL.heroName, S.draft.cast.hero.name, cd.cast.hero.name);
    row('heroDesc', LABEL.heroDesc, S.draft.cast.hero.desc, cd.cast.hero.desc);
    for (i = 0; i < SCENE_FIELDS.length; i++) row(SCENE_FIELDS[i], LABEL[SCENE_FIELDS[i]], S.draft.scene[SCENE_FIELDS[i]], cd.scene[SCENE_FIELDS[i]]);
    for (i = 0; i < cd.cast.npcs.length; i++){
      var oldN = S.draft.cast.npcs[i] || emptyNpc();
      for (k = 0; k < NPC_FIELDS.length; k++) row('npc' + (i + 1) + '_' + NPC_FIELDS[k], 'NPC ' + (i + 1) + ' の' + NPC_LABEL[NPC_FIELDS[k]], oldN[NPC_FIELDS[k]], cd.cast.npcs[i][NPC_FIELDS[k]]);
    }
    row('startCondition', LABEL.startCondition, S.draft.startCondition, cd.startCondition);
    rows.push('<div class="sc-k">' + esc(LABEL.startRules) + '</div><div class="sc-lock">' + (trim(S.draft.startRules) ? '🔒 ' + esc(S.draft.startRules) : '（空欄・AI は書きません）') + '</div>');
    var mode = rep.generationMode === 'RANDOM_FALLBACK' ? '🎲 ランダム（AI が使えなかったため）' : '🌱 AI 補完';
    overlay('<h3>AI の提案（' + esc(mode) + '）</h3>' +
      '<div style="font-size:12px;color:#aab">🔒 = あなたが書いた内容（変えません）／🌱 = 提案。反映しても<b>まだ保存はされません</b>。</div>' +
      '<div class="sc-diff">' + rows.join('') + '</div>' +
      '<div class="sc-acts"><button class="sc-btn" data-sc-c="discard">破棄</button><button class="sc-btn sc-primary" data-sc-c="accept">この内容を draft に反映</button></div>',
      function(p){
        p.querySelector('[data-sc-c="discard"]').addEventListener('click', function(){ closeOverlay(); S.candidate = null; S.candidateReport = null; setNote('提案を破棄しました（入力は変わっていません）'); }, false);
        p.querySelector('[data-sc-c="accept"]').addEventListener('click', function(){ closeOverlay(); acceptCandidate(); }, false);
      });
  }

  /* ---------- 操作（DOM 非依存の core。fixture は api 経由で同じ関数を呼ぶ） ---------- */
  function ensureRoot(){ if (!root && !S.wired) wire(); return !!root; }
  function openList(){ if (off()) return fail('OFF'); if (!ensureRoot()) return fail('HOST_DOM_MISSING'); closeOverlay(); S.view = 'SC_LIST'; showView('SC_LIST'); renderList(); return { ok: true }; }
  function toStories(){ closeOverlay(); showView('LIST'); }
  function openNew(){
    if (off()) return fail('OFF'); if (!ensureRoot()) return fail('HOST_DOM_MISSING');
    S.draft = emptyDraft(); S.scenarioId = null; S.dirty = false; S.savedSnapshot = null; S.draftRevision++;
    S.candidate = null; S.candidateReport = null; S.lastError = null; S.lastNote = null;
    S.view = 'SC_EDIT'; showView('SC_EDIT'); renderEdit();
    return { ok: true };
  }
  function openExisting(id){
    if (off()) return fail('OFF'); if (!ensureRoot()) return fail('HOST_DOM_MISSING');
    var st = ST(); if (!st) return fail('FIX820_UNAVAILABLE');
    var r = st.read(id); if (!r.ok){ S.lastError = msg(r.code, r.detail); renderList(); return r; }
    S.draft = toDraft(r.scenario); S.scenarioId = r.scenario.scenarioId; S.savedSnapshot = JSON.stringify(S.draft); S.dirty = false; S.draftRevision++;
    S.candidate = null; S.candidateReport = null; S.lastError = null; S.lastNote = null;
    S.view = 'SC_EDIT'; showView('SC_EDIT'); renderEdit();
    return { ok: true, scenarioId: S.scenarioId };
  }
  function edit(path, value){ if (!S.draft) return; setPath(path, value); bump(); refreshEdit(); }
  function npcAdd(){ if (!S.draft || S.busy) return; S.draft.cast.npcs.push(emptyNpc()); bump(); renderEdit(); }
  function npcDel(i){ if (!S.draft || S.busy) return; S.draft.cast.npcs.splice(i, 1); bump(); renderEdit(); }
  function leaveEdit(){
    if (S.dirty) confirmBox('未保存の変更があります。破棄して原本一覧へ戻りますか？', function(){ S.dirty = false; openList(); });
    else openList();
  }

  function save(){
    if (off() || S.busy || S.hardStop || !S.draft) return fail(off() ? 'OFF' : (S.busy ? 'BUSY' : (S.hardStop ? 'HARD_STOP' : 'NO_DRAFT')));
    if (!S.dirty && S.scenarioId) return { ok: true, saved: false, noChange: true };
    var st = ST(); if (!st) return fail('FIX820_UNAVAILABLE');
    S.busy = 'save'; refreshEdit();
    var input = toStoreInput(S.draft);
    var v = st.validate(input);                          /* 保存可否 = fix820 validate のみ（UI 独自条件 0） */
    if (!v.ok){ S.busy = null; setError(v.code, v.detail); return v; }
    var r = S.scenarioId ? st.edit(S.scenarioId, input) : st.create(input);
    S.busy = null;
    if (!r.ok){ if (r.hard) S.hardStop = true; setError(r.code, r.detail); return r; }
    if (!S.scenarioId) S.scenarioId = r.scenarioId;
    S.savedSnapshot = JSON.stringify(S.draft); S.dirty = false;
    if (S.view === 'SC_EDIT') renderEdit();
    setNote('保存しました。「▶ この物語を始める」で、この原本から新しい物語を始められます。');
    return { ok: true, saved: true, scenarioId: S.scenarioId };
  }

  function expand(mode, cb){
    cb = cb || function(){};
    if (off() || S.busy || S.hardStop || !S.draft) return cb(fail(off() ? 'OFF' : (S.busy ? 'BUSY' : (S.hardStop ? 'HARD_STOP' : 'NO_DRAFT'))));
    var seed = SEED(); if (!seed || typeof seed.expand !== 'function') return cb(fail('FIX823_UNAVAILABLE'));
    var M = seed.MODES || {};
    var m = (mode === 'OMAKASE_CREATE') ? M.OMAKASE_CREATE : M.EXPAND_EXISTING;
    if (!m) return cb(fail('MODE_REQUIRED'));
    var rev = S.draftRevision;                            /* STALE_AI_CANDIDATE guard */
    var snapshot = clone(S.draft);
    S.busy = 'expand'; S.candidate = null; S.candidateReport = null; setNote('AI が考えています…');
    var done = false;
    seed.expand(snapshot, { mode: m }, function(res){
      if (done) return; done = true;
      S.busy = null;
      if (S.draftRevision !== rev){ setError('STALE_AI_CANDIDATE'); return cb(fail('STALE_AI_CANDIDATE', { startedAt: rev, now: S.draftRevision })); }
      if (!res || !res.ok){ setError(res && res.code, res && res.detail); return cb(res || fail('EXPAND_FAILED')); }
      if (res.noBlanks || !res.candidate){ setNote(msg('NO_BLANKS')); return cb({ ok: true, noBlanks: true }); }
      S.candidate = res.candidate; S.candidateReport = res.report || {};
      S.lastNote = null; S.lastError = null; refreshEdit();
      if (S.view === 'SC_EDIT' && root && !root.hidden) renderReview();
      return cb({ ok: true, candidate: res.candidate, report: res.report });
    });
  }
  function acceptCandidate(){
    if (!S.candidate || !S.draft) return fail('NO_CANDIDATE');
    closeOverlay();
    S.draft = toDraft(S.candidate, S.draft.title);        /* draft だけが変わる。store write 0 */
    S.candidate = null; S.candidateReport = null;
    bump(); renderEdit(); setNote('提案を draft に反映しました。内容を確認して「保存」してください。');
    return { ok: true };
  }
  function discardCandidate(){ S.candidate = null; S.candidateReport = null; closeOverlay(); refreshEdit(); return { ok: true }; }

  function remove(){
    if (off() || S.busy || S.hardStop || !S.scenarioId) return fail(off() ? 'OFF' : (S.busy ? 'BUSY' : (S.hardStop ? 'HARD_STOP' : 'NOT_SAVED')));
    var st = ST(); if (!st) return fail('FIX820_UNAVAILABLE');
    S.busy = 'delete'; refreshEdit();
    var r = st.remove(S.scenarioId);
    S.busy = null;
    if (!r.ok){ if (r.hard) S.hardStop = true; setError(r.code, r.detail); return r; }
    S.scenarioId = null; S.draft = null; S.dirty = false; S.savedSnapshot = null;
    openList();
    return { ok: true };
  }
  function askRemove(){
    confirmBox('この原本を削除しますか？（この原本から始めた物語は残ります）', function(){ remove(); });
  }

  /* START STORY PATH（裁定 32 §9）: read → startability → f667 gate（home bridge）→ runtime → toInstantiationInput → instantiate → open */
  function start(opts){
    opts = opts || {};
    if (off()) return fail('OFF');
    if (S.busy) return fail('BUSY');                      /* START_STORY_SINGLE_FLIGHT */
    var sa = startability();
    if (!sa.ok){ setError(sa.code, sa.detail); return sa; }
    var home = HOME();
    S.busy = 'start'; refreshEdit();
    if (!opts.force){
      var needs = false;
      try { needs = home.needsStoryGate() === true; } catch(e){ needs = true; }
      if (needs){
        S.busy = null; refreshEdit();
        if (typeof home.showStoryGate === 'function'){
          home.showStoryGate({ retryHint: '▶ この物語を始める', onForce: function(){ start({ force: true }); } });
        } else setError('GATE_REQUIRED');
        return fail('GATE_REQUIRED');
      }
    }
    var runtime = null;
    try { runtime = home.newStoryRuntime(); } catch(e){ runtime = null; }
    var res = INST().instantiate({ scenario: sa.input, runtime: runtime, initialTitle: sa.initialTitle });
    if (!res || !res.ok){
      S.busy = null;
      if (res && res.hard) S.hardStop = true;
      setError(res && res.code, res && res.detail);
      return res || fail('INSTANTIATE_FAILED');
    }
    S.starts++; S.navigated = true;                        /* busy は解除しない（ページを離れる。戻ってきたら reload） */
    try { console.log(TAG, 'STORY_STARTED_FROM_SCENARIO', res.id); } catch(e){}
    try { home.openInstantiatedStory(res.id); } catch(e){ try { console.error(TAG, 'navigation failed (Story は作成済み)', res.id, e && e.message); } catch(_){} }
    return { ok: true, id: res.id, title: res.title };
  }

  /* ---------- wiring ---------- */
  function onRootClick(e){
    var t = e.target;
    var act = t.closest && t.closest('[data-sc-act]'); if (act){ dispatch(act.getAttribute('data-sc-act')); return; }
    var del = t.closest && t.closest('[data-sc-npcdel]'); if (del){ e.preventDefault(); npcDel(+del.getAttribute('data-sc-npcdel')); return; }
    var open = t.closest && t.closest('[data-sc-open]'); if (open){ openExisting(open.getAttribute('data-sc-open')); return; }
  }
  function dispatch(act){
    switch (act){
      case 'toStories': if (S.view === 'SC_EDIT' && S.dirty){ confirmBox('未保存の変更があります。破棄して物語一覧へ戻りますか？', function(){ S.dirty = false; toStories(); }); } else toStories(); return;
      case 'new': openNew(); return;
      case 'back': leaveEdit(); return;
      case 'npcAdd': npcAdd(); return;
      case 'expand': expand('EXPAND_EXISTING'); return;
      case 'omakase': expand('OMAKASE_CREATE'); return;
      case 'save': save(); return;
      case 'start': start(); return;
      case 'delete': askRemove(); return;
    }
  }
  function onRootInput(e){
    var t = e.target; var path = t && t.getAttribute && t.getAttribute('data-sc-field');
    if (!path) return;
    setPath(path, t.value); bump();
    if (/^cast\.npcs\.\d+\.name$/.test(path)){ var sum = t.closest('details.sc-npc'); if (sum){ var sp = sum.querySelector('summary span'); var i = +path.split('.')[2]; if (sp) sp.textContent = 'NPC ' + (i + 1) + (trim(t.value) ? '：' + t.value : '（名前なし）'); } }
    refreshEdit();
  }
  function wire(){
    if (S.wired) return;
    if (!document.body) return;
    root = el('scView'); btn = el('scBtn'); detailEl = el('detail');
    var mids = Array.prototype.slice.call(document.querySelectorAll('section.mid')).filter(function(s){ return s.id !== 'scView'; });
    listSec = mids[0] || null;
    if (!root || !btn){ try { console.log(TAG, 'loaded (host DOM not present; inactive)'); } catch(e){} return; }
    injectStyle();
    root.addEventListener('click', onRootClick, false);
    root.addEventListener('input', onRootInput, false);
    btn.addEventListener('click', function(){ if (S.view === 'LIST') openList(); else toStories(); }, false);
    S.wired = true;
    try { console.log(TAG, 'loaded (wired to #scBtn/#scView; entry ' + (btn.hidden ? 'hidden=dormant' : 'visible') + ')'); } catch(e){}
  }

  window.__v292Dfix825 = {
    version: VERSION,
    state: function(){
      return { off: off(), wired: S.wired, view: S.view, scenarioId: S.scenarioId, dirty: S.dirty, draftRevision: S.draftRevision,
               busy: S.busy, hardStop: S.hardStop, hasCandidate: !!S.candidate, starts: S.starts, navigated: S.navigated,
               deps: { fix819: !!INST(), fix820: !!ST(), fix823: !!SEED(), fix247: !!(window.__v292Dfix247 && typeof window.__v292Dfix247 === 'object'), homeBridge: homeReady() },
               entryHidden: btn ? !!btn.hidden : null, uiWired: true };
    },
    startability: startability,
    /* fixture / 診断用: DOM を通さず同じ core を呼ぶ（Owner UI と同一経路） */
    api: { openList: openList, openNew: openNew, openExisting: openExisting, edit: edit, npcAdd: npcAdd, npcDel: npcDel,
           save: save, expand: expand, acceptCandidate: acceptCandidate, discardCandidate: discardCandidate,
           remove: remove, start: start, toStories: toStories, draft: function(){ return S.draft ? clone(S.draft) : null; } }
  };

  if (off()){ try { console.log(TAG, 'OFF (v292Dfix825Off=1)'); } catch(e){} return; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, false); else wire();
})();
