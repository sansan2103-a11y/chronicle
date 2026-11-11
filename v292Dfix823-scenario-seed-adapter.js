// =====================================================================
// Chronicle TRPG - v292Dfix823: SEED_EXPANSION_V1 — Scenario Seed Adapter（home 専用・dormant）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06 (25) SEED_EXPANSION_V1 = GO_STAGE_WITH_REVISIONS:
//   ARCHITECTURE = fix823 Scenario Seed Adapter = existing fix436 + fix335 reuse = NEW ENGINE 0
//   FIX823_STAGE_IMPLEMENTATION = GO / SEED_EXPANSION_PRODUCTION_DEPLOY = HOLD
//
// ■ これは何か
//   Scenario Original（fix820 の入力オブジェクト）の **空欄だけ**を、fix436 の公開 pure 関数
//   （buildFillPrompt / parseFillJson / normVal / applyFill / request）で埋める薄いアダプタ。
//   生成 engine は作らない。random は fix335 の pure API（__v292Dfix335api.draw）だけ。
//
// ■ 契約（1 つでも破ったら実装ミス）
//   AUTHORITY: non-empty input = LOCKED（USER/SCENARIO explicit の merge は UI lane。ここでは非空 = 不可侵）
//   MODES（caller が必ず明示。fix823 は意図を推測しない）:
//     EXPAND_EXISTING … 空欄補完のみ。NPC 人数の増減 0（0 人は 0 のまま）
//     OMAKASE_CREATE  … Owner が「全部おまかせ」を明示。NPC 0 人なら既定 2 人を新規生成してよい
//   RANDOM_SEED_HINT … OMAKASE_CREATE かつ explicit seed 0 のときだけ。確定情報 block とは別節で
//                      「参考にしてもしなくてもよい多様性の種」として渡す。field authority ではない（AI_INFERRED）
//   RANDOM direct fallback（fix335 → field）… OMAKASE_CREATE かつ seed 0 かつ AI 失敗/利用不可 のときだけ。
//                      report.generationMode = 'RANDOM_FALLBACK'。部分入力ありの AI 失敗は WRITE 0
//   startRules   … AI write 0 / random write 0。確定 context として渡すだけ（paraphrase・転記 0）
//   startCondition … 空欄なら AI fill 可・非空なら LOCK。random では作らない
//   SILENT TRUNCATION = FORBIDDEN … raw JSON を parseFillJson/normVal の **前**に preflight。
//                      normVal が長さで切る値が 1 つでもあれば candidate 全体 reject（write 0）
//   TRANSPORT = fix247 proxy only（BYOK / S.cfg 移植 0）。
//     FIX823_TRANSPORT_AVAILABILITY = ACTUAL_PROXY_RUNTIME_ONLY（裁定 27）:
//       「実際の fix247 runtime が loaded かつ active」と runtime authority（fix247 が公開する on()/state）で
//       確認できるときだけ true。fix823 自身が Google token / expiry / proxy pass から判定を再計算しない。
//       現行 fix247 は `window.__v292Dfix247 = true`（boolean）しか公開しないので、home（fix247 不在）でも
//       index（fix247 在るが API 無し）でも **false** = fail-closed。home transport bridge（別 lane）が
//       on() を公開したとき初めて true になる。
//     proxy 不可: EXPAND_EXISTING → AI_UNAVAILABLE/write 0、OMAKASE_CREATE ∧ seed 0 → RANDOM_FALLBACK 可
//   NPC SLOT（裁定 26）… EXISTING_NPC_SLOT_DELETION_BY_EXPANSION = FORBIDDEN。EXPAND_EXISTING は base の NPC slot 数と
//                      identity を完全維持（name が最後まで空でも slot も explicit field も消さない。無効 name は name だけ不採用）。
//                      OMAKASE_CREATE の synthetic 2 slot は name が揃わなければ GENERATION_INCOMPLETE（partial save 0）→
//                      seed 0 なら RANDOM_FALLBACK、それでも揃わなければ write 0。
//   ATOMICITY … candidate は detached（入力オブジェクト mutation 0）→ fix820.validate → fix820.edit（whole-value）。
//                      field-by-field write 0。失敗時 meta/body byte 不変
//   Story / active slot / cloud / canonical への書込 0。DOM 0。
//
// ★SEEDWORLD2（物語の種 段 2・GPT #127-RQ ③）: 呼ぶ側が明示したときだけ（opts.loreAppend===true、または armLoreAppend() の 1 回限りの合図）、
//   世界観メモ（scene.lore）の **後ろに** AI の「つづき」を足す。ユーザーの文は先頭に 1 文字も変えずに残し（indexOf===0 を自己検査）、
//   区切りは「\n（AI が補った設定）\n」。つづきは仮の欄 loreAdd（採用されなければ lore は元のまま）。AI 呼び出しは増えない（同じ 1 回）。
//   長すぎる（切らない）・同じ文/先頭一致/包含（fix829 dupReject）・空 は、**つづきだけ**不採用（他の欄は生かす・report.loreAppend.reason）。
//   禁止の文（〜てはいけない 型）は検出して report に残す（startRules には絶対に入らない: startRules は従来どおり原文のまま）。
//   kill: localStorage v292DfixSEEDWORLD2Off='1' → 合図も opts も無視（従来とバイト一致）。
// ★SEEDHERO1（物語の種・主人公）: 呼ぶ側（fix873）が armSeedExtras({hero:true}) で 1 回だけ合図したときだけ、種の主人公の説明（利用者が書いた文）の **後ろに**
//   AI の性格・外見・立場（heroAdd）と口調 1 行（heroVoice・説明に口調の手がかりが無いときだけ）を足す。利用者の文は先頭に 1 文字も変えず残す（indexOf===0 を自己検査）。
//   AI 呼び出しは増えない（同じ 1 回の JSON に 2 キー足すだけ）。出力予算が足りなければ短く／足さない（他の欄を欠けさせない）。
//   意思・決意・目的・これからの行動の文は採用しない（AGENCY: 主人公の意思はプレイヤーのもの）。
//   ★SEEDNPC1e: 同じ合図で npcAlias（{n: 呼び名}）を渡すと、その NPC の名前欄を「空欄（呼び名つき）」にして AI に日本人らしい名前を付けさせる（呼び名は fix873 が説明へ残す）。
//   kill: localStorage v292DfixSEEDHERO1Off='1'（主人公）／ v292DfixSEEDNPC1eOff='1'（NPC の名付け）→ 合図は無視・従来とバイト一致。
// 検証口: window.__v292Dfix823 = { MODES, toFields, explicitSeedCount, buildPrompt, preflightRaw,
//                                   toScenarioInput, randomCandidate, transportAvailable, expand, expandAndSave, state }
// 既定: 誰も呼ばない（UI caller 0）。kill: localStorage v292Dfix823Off='1' → expand/expandAndSave が即 {ok:false, code:'OFF'}。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix823) return;
  var TAG = '[v292Dfix823:scenario-seed-adapter]';
  var VERSION = 'v292Dfix823-20261111-adapter-v1.5-sh1';   /* v1.1: 裁定 26 slot 維持 / v1.2: 裁定 27 FIX823_TRANSPORT_AVAILABILITY = ACTUAL_PROXY_RUNTIME_ONLY */
  var MODES = { EXPAND_EXISTING: 'EXPAND_EXISTING', OMAKASE_CREATE: 'OMAKASE_CREATE' };
  var OMAKASE_DEFAULT_NPC = 2;          /* fix436 NEW_NPC_COUNT と同じ既定（OMAKASE_CREATE 専用） */
  var SCENE_FIELDS = ['lore', 'loc', 'obj', 'tone'];
  var HERO_FIELDS  = ['name', 'desc'];
  var NPC_FIELDS   = ['name', 'desc', 'personality', 'coreDesire', 'coreFear', 'wound'];
  var SCALAR_MAP = [ /* fix436 SCALAR_DEFS と同じ key / label */
    { key: 'heroName', label: '主人公の名前',                  get: function(s){ return s.cast.hero.name; } },
    { key: 'heroDesc', label: '主人公の説明（性格・外見・立場）', get: function(s){ return s.cast.hero.desc; } },
    { key: 'lore',     label: '世界観メモ',                    get: function(s){ return s.scene.lore; } },
    { key: 'loc',      label: '現在の場所',                    get: function(s){ return s.scene.loc; } },
    { key: 'obj',      label: '物語の前提・目的',              get: function(s){ return s.scene.obj; } },
    { key: 'tone',     label: '文体・雰囲気',                  get: function(s){ return s.scene.tone; } }
  ];
  var NPC_LABEL = { name: '名前', desc: '外見・立場', personality: '性格特性', coreDesire: '核心的欲求', coreFear: '核心的恐怖', wound: '傷・過去' };
  /* ★v1.3 FIX823_GENDER_AI_WRITE = 0（GPT 裁定 56）
     gender は **AI に書かせない**（自由文字列で INVALID_ENUM を作らせない）。
     ただし Owner が設定済みなら fix436 の buildFillPrompt へ **確定情報（LOCKED context）** として渡し、
     他の欄の補完が性別と矛盾しないようにする。fix436 の DOM 版 collectFields と key / label / writable を揃える
     （heroGender / npcN_gender・writable:false → applyFill は構造的に書かない）。
     ★これが無いと 🌱「全採用」で Owner の選んだ性別が消える（fix825 の adopt は draft を候補で置き換えるため）。 */
  /* ★SEEDWORLD2 */
  var LORE_ADD_KEY = 'loreAdd';
  var LORE_ADD_MARK = '（AI が補った設定）';
  var LORE_ADD_SEP = '\n' + LORE_ADD_MARK + '\n';   /* 原文 + SEP + つづき */
  var LORE_DELIVER_CAP = 400;     /* LORE1 が毎ターン届ける上限（code point）。これを超えるつづきは作らせない */
  var LORE_ADD_MAX = 300;         /* つづきの上限（目安は 150〜250 字。超えたら切らずにつづきだけ不採用） */
  var LORE_ADD_MIN = 20;          /* これより短いつづきは意味が無いので不採用 */
  var LORE_ADD_ROOM_MIN = 80;     /* 上限 400 の残りがこれ未満なら、つづきを頼まない（原文が長い） */
  /* 出力の長さの見積もり（fix436.request の max_tokens 1800 に収める。★本物のトークナイザでの実測ではない・目安）。
     つづきを足したせいで JSON が途中で切れる（BAD_JSON で全体が失敗）／後ろの人物の欄が欠けるのを避けるため、
     「いま空欄の欄」の典型の長さから出力量を見積もり、余裕が足りないときはつづきの長さを縮め、縮めても足りないなら頼まない（reason BUDGET）。 */
  var MAX_TOKENS = 1800, TOK_PER_CHAR = 1.3, TOK_RESERVE = 0.85;
  var TYP_LEN = { heroName: 6, heroDesc: 45, loc: 25, obj: 50, tone: 25, startCondition: 70, name: 6, desc: 45, personality: 25, coreDesire: 25, coreFear: 25, wound: 45, gender: 2 };
  var GENDER_FIELD = 'gender';
  var HERO_GENDER_KEY = 'heroGender';
  var HERO_GENDER_LABEL = '主人公の性別';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix823Off') === '1'; }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  /* ---- ★SEEDWORLD2: つづき ---- */
  function skw2Off(){ return lsg('v292DfixSEEDWORLD2Off') === '1'; }
  function cpLen(t){ t = str(t); var n = 0, i = 0, c; while (i < t.length){ c = t.charCodeAt(i); i += (c >= 0xD800 && c <= 0xDBFF && i + 1 < t.length) ? 2 : 1; n++; } return n; }
  var ARMED = false;   /* fix825 の expand は opts を渡す口が無い（NO_FIX825_REWRITE）ので、呼ぶ側が直前に 1 回だけ合図する。expand が入口で必ず消費する */
  function armLoreAppend(){ if (skw2Off()) return false; ARMED = true; return true; }
  function disarmLoreAppend(){ ARMED = false; }
  /* ---- ★SEEDHERO1 / ★SEEDNPC1e ---- */
  var HERO_ADD_KEY = 'heroAdd', HERO_VOICE_KEY = 'heroVoice';
  var HERO_SEP = '\n', HERO_VOICE_PREFIX = '口調：';
  var HERO_TOTAL = 120;          /* 説明の全体（利用者の文＋足した分）の目安 */
  var HERO_ADD_CAP_MAX = 100, HERO_ADD_ROOM_MIN = 30, HERO_ADD_MIN = 12, HERO_VOICE_EST = 30, HERO_VOICE_MAX = 40, HERO_VOICE_MIN = 4;
  var HERO_HARD_TOTAL = 170;     /* 切らずに不採用にする全体の上限 */
  var VOICE_USER_RE = /口調|一人称|語尾|話し方|話しかた|喋り方|しゃべり方|言葉遣い|言葉づかい|口癖|方言|タメ口|ため口|敬語|関西弁|博多弁|広島弁|京都弁|津軽弁|東北弁|ですます|ござる/;
  /* 主人公の意思・決意・これからの行動の文（足さない） */
  var AGENCY_RE = /(決意|決心|決断|覚悟(を|し|だ|で)|誓っ|誓い|つもり|[うよ]とし(て|た)|うとする|たいと(思|考|願)|ことにし(た|て)|と決め|決めて|心に決|目指し|を狙っ|企んで|計画|復讐を|するべき|しなければ|なければならない|ねばならない|させたい|ようと思)/;
  function sh1Off(){ return lsg('v292DfixSEEDHERO1Off') === '1'; }
  function sn1eOffK(){ return lsg('v292DfixSEEDNPC1eOff') === '1'; }
  var ARM2 = null;   /* { hero: bool, npcAlias: {n: 呼び名} }。expand が入口で必ず消費する */
  function armSeedExtras(o){
    ARM2 = null; if (!o || typeof o !== 'object') return false;
    var x = { hero: o.hero === true && !sh1Off(), npcAlias: null };
    if (o.npcAlias && typeof o.npcAlias === 'object' && !sn1eOffK()){ var any = false, m = {}; for (var k in o.npcAlias){ if (Object.prototype.hasOwnProperty.call(o.npcAlias, k) && typeof o.npcAlias[k] === 'string' && o.npcAlias[k]){ m[k] = o.npcAlias[k]; any = true; } } if (any) x.npcAlias = m; }
    if (!x.hero && !x.npcAlias) return false;
    ARM2 = x; return true;
  }
  function disarmSeedExtras(){ ARM2 = null; }
  function tokFor(chars, key){ return Math.round(chars * TOK_PER_CHAR + key.length * 0.45 + 6); }
  function unwrapQuote(t){
    if (t.length > 2 && ((t.charAt(0) === '"' && t.charAt(t.length - 1) === '"' && t.indexOf('"', 1) === t.length - 1) ||
                         (t.charAt(0) === '「' && t.charAt(t.length - 1) === '」' && t.indexOf('」') === t.length - 1))) t = trim(t.slice(1, -1));
    return t;
  }
  function aliasLabel(n, phrase){
    return 'NPC' + n + 'の名前（いまは説明の呼び名「' + phrase + '」。日本人らしい姓＋名を付ける。世界観に合うもの。呼び名・役職・説明の再掲は不可）';
  }
  /* AI の heroAdd を検査して { ok, text, dropped } / { ok:false, reason }。切らない。意思の文は文ごとに外す */
  function checkHeroAdd(raw, userDesc, cap){
    var v = raw; if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') return { ok: false, reason: 'MISSING' };
    var t = v.replace(/\r\n?/g, '\n').replace(/```[a-zA-Z]*/g, ' ').replace(/```/g, ' ');
    t = unwrapQuote(trim(t)); t = trim(t.replace(/\s*\n+\s*/g, ''));
    if (!t || /^(なし|未定|不明|空|null|undefined|n\/a|-{1,3})$/i.test(t)) return { ok: false, reason: 'EMPTY' };
    var ss = splitSentences(t), keep = [], dropped = 0;
    for (var i = 0; i < ss.length; i++){ var x = trim(ss[i]); if (!x) continue; if (AGENCY_RE.test(x)) dropped++; else keep.push(x); }
    t = trim(keep.join(''));
    if (!t) return { ok: false, reason: 'AGENCY', dropped: dropped };
    var n = cpLen(t), hard = Math.round(cap * 1.25);
    if (n > hard) return { ok: false, reason: 'TOO_LONG', n: n };
    if (n < HERO_ADD_MIN) return { ok: false, reason: 'TOO_SHORT', n: n };
    if (cpLen(userDesc) + 1 + n > HERO_HARD_TOTAL) return { ok: false, reason: 'TOO_LONG', n: n };
    var d = dupLocal(userDesc, t); if (!d){ try { var D = f829(); d = (D && typeof D.dupReject === 'function') ? D.dupReject(userDesc, t) : null; } catch(e){ d = null; } }
    if (d) return { ok: false, reason: 'DUP', detail: d };
    return { ok: true, text: t, n: n, dropped: dropped };
  }
  function checkHeroVoice(raw){
    var v = raw; if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') return { ok: false, reason: 'MISSING' };
    var t = v.replace(/\r\n?/g, '\n').replace(/```[a-zA-Z]*/g, ' ').replace(/```/g, ' ');
    var lines = t.split('\n'), first = ''; for (var i = 0; i < lines.length; i++){ if (trim(lines[i])){ first = trim(lines[i]); break; } }
    first = unwrapQuote(first).replace(/^(口調|話し方)[：:]\s*/, ''); first = trim(first.replace(/[。．.]+$/, ''));
    if (!first || /^(なし|未定|不明|空|null|undefined|n\/a|-{1,3})$/i.test(first)) return { ok: false, reason: 'EMPTY' };
    if (/[{}]/.test(first)) return { ok: false, reason: 'BAD' };
    var n = cpLen(first);
    if (n > HERO_VOICE_MAX) return { ok: false, reason: 'TOO_LONG', n: n };
    if (n < HERO_VOICE_MIN) return { ok: false, reason: 'TOO_SHORT', n: n };
    return { ok: true, text: first, n: n };
  }
  function loreRoom(userLore){ return LORE_DELIVER_CAP - cpLen(userLore) - cpLen(LORE_ADD_SEP); }
  /* 禁止・決まりの文（〜てはいけない 型）。文ごとに見る。fix444 が掟として拾う型と同じ見方（fix444 があればその抽出も併用） */
  var PROHIB_RE = /(てはいけ|てはなりま|てはなら|べからず|べからざ|禁止|禁じ|禁忌|タブー|厳禁|禁足|してはならぬ|許されな|許されぬ|破って(は|も)|破ると|破れば|破った(者|もの|場合|とき|時)|(決して|絶対に|けっして|ぜったいに)[^。！？\n]{0,24}(ない|ぬ|ず|ません|な[。！？\n]|$))/;
  function splitSentences(t){ var m = str(t).match(/[^。！？!?\n]+[。！？!?」』）)]*\n*|\n+/g); return m || []; }
  function loreProhibitions(text){
    var out = [], ss = splitSentences(text);
    for (var i = 0; i < ss.length; i++){ var x = trim(ss[i]); if (x && PROHIB_RE.test(x)) out.push(x); }
    return out;
  }
  function laws444(text){ try { var L = window.__v292Dfix444; if (L && typeof L.extractLaws === 'function'){ var r = L.extractLaws(str(text), []); return (r && r.length) || 0; } } catch(e){} return 0; }
  function stripProhibitions(text){
    var ss = splitSentences(text), keep = [], removed = [];
    for (var i = 0; i < ss.length; i++){ if (PROHIB_RE.test(trim(ss[i]))) removed.push(trim(ss[i])); else keep.push(ss[i]); }
    return { text: trim(keep.join('')), removed: removed };
  }
  function f829(){ return window.__v292Dfix829 || null; }
  function dupLocal(seed, add){
    var s = trim(str(seed).replace(/\s+/g, ' ')), a = trim(str(add).replace(/\s+/g, ' '));
    if (!s || !a) return null;
    if (a === s) return 'DUP_EQUAL';
    if (a.indexOf(s) === 0) return 'DUP_PREFIX';
    if (cpLen(s) >= 12 && a.indexOf(s) >= 0) return 'DUP_CONTAINED';
    return null;
  }
  /* AI の loreAdd を検査して { ok, text } または { ok:false, reason }。切らない */
  function checkLoreAdd(raw, userLore, addMax){
    var v = raw;
    if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') return { ok: false, reason: 'MISSING' };
    var t = v.replace(/\r\n?/g, '\n').replace(/```[a-zA-Z]*/g, ' ').replace(/```/g, ' ');
    t = trim(t);
    if (t.length > 2 && ((t.charAt(0) === '"' && t.charAt(t.length - 1) === '"' && t.indexOf('"', 1) === t.length - 1) ||
                         (t.charAt(0) === '「' && t.charAt(t.length - 1) === '」' && t.indexOf('」') === t.length - 1))) t = trim(t.slice(1, -1));   /* 全体を 1 組の引用符が括るときだけ外す（途中の台詞は触らない） */
    if (t.indexOf(LORE_ADD_MARK) === 0) t = trim(t.slice(LORE_ADD_MARK.length));
    t = t.replace(/\n{3,}/g, '\n\n');
    if (!t || /^(なし|未定|不明|空|null|undefined|n\/a|-{1,3})$/i.test(t)) return { ok: false, reason: 'EMPTY' };
    var n = cpLen(t);
    if (n > addMax) return { ok: false, reason: 'TOO_LONG', n: n };
    if (n < LORE_ADD_MIN) return { ok: false, reason: 'TOO_SHORT', n: n };
    var d = null; try { var D = f829(); d = (D && typeof D.dupReject === 'function') ? D.dupReject(userLore, t) : dupLocal(userLore, t); } catch(e){ d = dupLocal(userLore, t); }
    if (d) return { ok: false, reason: 'DUP', detail: d };
    return { ok: true, text: t, n: n };
  }
  function f436(){ return window.__v292Dfix436 || null; }
  function f335(){ return window.__v292Dfix335api || null; }
  function f820(){ return window.__v292Dfix820 || null; }
  /* ★GENDER1（おしん 2026-11-07・GPT 裁定 56 の「AI に gender を自由文字列で書かせない」は維持）:
     空の gender は「女性/男性 の 2 択だけを答える空欄」として同じ 1 回の呼び出しに載せる（追加通信 0）。
     返事は norm() で女性/男性 以外を捨て（= INVALID_ENUM を作らない）、本文に明確な語があれば本文を優先する。
     入力に既にある gender は従来どおり LOCKED（writable:false・上書き 0）。kill: v292DfixGENDER1Off='1'。 */
  function G1(){ try { var g = window.__v292DfixGENDER1; return (g && g.on()) ? g : null; } catch(e){ return null; } }
  var GENDER_KEY_RE = /(^heroGender$|_gender$)/;
  function fail(code, detail){ var r = { ok: false, code: code }; if (detail !== undefined) r.detail = detail; return r; }

  /* ---- 入力の正規化（読むだけ・新オブジェクト） ---- */
  function normalizeInput(input){
    var s = isObj(input) ? input : {};
    var scene = isObj(s.scene) ? s.scene : {};
    var cast = isObj(s.cast) ? s.cast : {};
    var hero = isObj(cast.hero) ? cast.hero : {};
    var npcs = isArr(cast.npcs) ? cast.npcs : [];
    var out = { title: trim(s.title), scene: {}, cast: { hero: {}, npcs: [] },
                startCondition: trim(s.startCondition), startRules: str(s.startRules).replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '') };
    var i, j;
    for (i = 0; i < SCENE_FIELDS.length; i++) out.scene[SCENE_FIELDS[i]] = trim(scene[SCENE_FIELDS[i]]);
    for (i = 0; i < HERO_FIELDS.length; i++) out.cast.hero[HERO_FIELDS[i]] = trim(hero[HERO_FIELDS[i]]);
    out.cast.hero[GENDER_FIELD] = trim(hero[GENDER_FIELD]);          /* ★LOCKED（AI は書かない） */
    for (i = 0; i < npcs.length; i++){
      var src = isObj(npcs[i]) ? npcs[i] : {}, o = {};
      for (j = 0; j < NPC_FIELDS.length; j++) o[NPC_FIELDS[j]] = trim(src[NPC_FIELDS[j]]);
      o[GENDER_FIELD] = trim(src[GENDER_FIELD]);                     /* ★LOCKED */
      out.cast.npcs.push(o);
    }
    return out;
  }

  /* ---- ① toFields: Scenario → fix436 の fields[]（el:null・pure） ---- */
  function estOutTokens(fields){
    var tok = 12, i, f, k, m;
    for (i = 0; i < fields.length; i++){
      f = fields[i]; if (!f || f.filled || !f.writable || f.loreAdd || f.heroAdd || f.heroVoice) continue;
      k = f.key; m = /^npc\d+_(\w+)$/.exec(k); if (m) k = m[1]; else if (k === 'heroGender') k = 'gender';
      tok += Math.round((TYP_LEN[k] || 30) * TOK_PER_CHAR + f.key.length * 0.45 + 6);
    }
    return tok;
  }
  function loreAddLabel(room){
    var hi = Math.min(250, room), lo = hi >= 250 ? 150 : Math.max(40, hi - 100);
    return '世界観のつづき（上の世界観メモの続きに書き足す文章。' + lo + '〜' + hi + '字・2〜4文。世界観メモの言い換えや繰り返しはしない。場所の様子・歴史・住人・空気感を具体的に書く。「〜してはいけない」などの禁止や決まりの文は書かない）';
  }
  function toFields(input, mode, o){
    var s = normalizeInput(input);
    var fields = [], i, j;
    for (i = 0; i < SCALAR_MAP.length; i++){
      var d = SCALAR_MAP[i], v = d.get(s);
      fields.push({ key: d.key, label: d.label, value: v, filled: v.length > 0, writable: true, el: null });
    }
    var loreIdx = 3;   /* SCALAR_MAP の 'lore' の次（= 4 番目）に差し込む位置（★SEEDHERO1: 主人公の欄が先に入るので、下で 'lore' の位置から求め直す） */
    /* ★主人公の性別 = 読み取り専用の確定情報（writable:false・fix436 と同じ扱い） */
    var hg = trim(s.cast.hero[GENDER_FIELD]);
    var g1 = G1(), hgAsk = !!(g1 && !hg);   /* ★GENDER1 */
    fields.push({ key: HERO_GENDER_KEY, label: hgAsk ? g1.LABEL_HERO : HERO_GENDER_LABEL, value: hg, filled: hg.length > 0, writable: hgAsk, el: null, g1blank: hgAsk });
    var npcCount = s.cast.npcs.length;
    if (mode === MODES.OMAKASE_CREATE && npcCount === 0) npcCount = OMAKASE_DEFAULT_NPC;   /* ★ OMAKASE_CREATE だけ */
    for (i = 0; i < npcCount; i++){
      var src = s.cast.npcs[i] || {};
      for (j = 0; j < NPC_FIELDS.length; j++){
        var f = NPC_FIELDS[j], nv = trim(src[f]);
        /* ★SEEDNPC1e: 呼ぶ側が「この名前は説明の呼び名」と合図した NPC は、名前欄を空欄（呼び名つきの指示）にして AI に名前を付けさせる */
        if (f === 'name' && o && o.npcAlias && !sn1eOffK() && o.npcAlias[i + 1] && nv === o.npcAlias[i + 1]){
          fields.push({ key: 'npc' + (i + 1) + '_name', label: aliasLabel(i + 1, nv), value: '', filled: false, writable: true, el: null, alias: true });
          continue;
        }
        fields.push({ key: 'npc' + (i + 1) + '_' + f, label: 'NPC' + (i + 1) + 'の' + NPC_LABEL[f], value: nv, filled: nv.length > 0, writable: true, el: null });
      }
      /* ★NPC の性別も読み取り専用の確定情報（writable:false） */
      var ngv = trim(src[GENDER_FIELD]);
      var ngAsk = !!(g1 && !ngv);   /* ★GENDER1 */
      fields.push({ key: 'npc' + (i + 1) + '_' + GENDER_FIELD, label: 'NPC' + (i + 1) + 'の' + (ngAsk ? g1.LABEL_NPC : '性別'),
                    value: ngv, filled: ngv.length > 0, writable: ngAsk, el: null, g1blank: ngAsk });
    }
    /* startCondition: 空欄なら AI fill 可 */
    fields.push({ key: 'startCondition', label: '開始時の状況（物語の最初の場面・配置・直前の出来事。1〜3文）', value: s.startCondition, filled: s.startCondition.length > 0, writable: true, el: null });
    /* startRules: 確定 context のみ（writable:false = fix436 applyFill が構造的に書かない） */
    fields.push({ key: 'startRules', label: '開始ルール（作者が定めた約束。矛盾しない補完をする。書き換え・転記はしない）', value: s.startRules, filled: s.startRules.length > 0, writable: false, el: null });
    /* ★SEEDHERO1: 呼ぶ側が合図したときだけ。利用者が主人公の説明を書いているときだけ、説明のつづき（heroAdd）と口調 1 行（heroVoice）の仮の欄を足す。
       出力予算（MAX_TOKENS×RESERVE）に収まる分だけ。収まらなければ短く／足さない（理由は o.info.heroReason）。後ろの世界観のつづきの余裕はこの分を引いて見積もる */
    var heroTok = 0;
    if (o && o.heroAdd === true && !sh1Off() && mode === MODES.EXPAND_EXISTING && s.cast.hero.desc.length > 0){
      var hd = s.cast.hero.desc, ul = cpLen(hd), wantVoice = !VOICE_USER_RE.test(hd);
      var budget = MAX_TOKENS * TOK_RESERVE - estOutTokens(fields);
      var vTok = wantVoice ? tokFor(HERO_VOICE_EST, HERO_VOICE_KEY) : 0;
      var askVoice = wantVoice && budget >= vTok;
      var capText = HERO_TOTAL - ul - HERO_SEP.length - (askVoice ? (HERO_VOICE_EST + 4) : 0);
      var capTok = Math.floor((budget - (askVoice ? vTok : 0) - 6 - HERO_ADD_KEY.length * 0.45) / TOK_PER_CHAR);
      var hcap = Math.min(HERO_ADD_CAP_MAX, capText, capTok), askAdd = hcap >= HERO_ADD_ROOM_MIN;
      if (o.info) o.info.hero = { askAdd: askAdd, askVoice: askVoice, cap: askAdd ? hcap : 0, wantVoice: wantVoice };
      if (!askAdd && !askVoice){ if (o.info) o.info.heroReason = (capText < HERO_ADD_ROOM_MIN) ? 'HERO_FULL' : (wantVoice || capTok < HERO_ADD_ROOM_MIN ? 'BUDGET' : 'HERO_FULL'); }
      var hpos = 0; for (var hi = 0; hi < fields.length; hi++){ if (fields[hi].key === 'heroDesc') hpos = hi + 1; }
      var ins = [];
      if (askAdd){
        var lo = Math.max(20, hcap - 40);
        ins.push({ key: HERO_ADD_KEY, label: '主人公の説明のつづき（上の主人公の説明に書き足す文。' + lo + '〜' + hcap + '字・1〜2文。性格・外見・立場を具体的に。説明の言い換えや繰り返しはしない。決意・目的・これからの行動・台詞は書かない）', value: '', filled: false, writable: true, el: null, heroAdd: true, cap: hcap });
        heroTok += tokFor(hcap, HERO_ADD_KEY);
      }
      if (askVoice){
        ins.push({ key: HERO_VOICE_KEY, label: '主人公の口調（一人称と語尾を1行で。30字以内。例：一人称は「あたし」、語尾は「〜じゃん」「〜かも」。性別・年齢・性格に合わせる。台詞は書かない）', value: '', filled: false, writable: true, el: null, heroVoice: true });
        heroTok += vTok;
      }
      if (ins.length){ Array.prototype.splice.apply(fields, [hpos, 0].concat(ins)); }
    }
    /* ★SEEDWORLD2: 呼ぶ側が明示したときだけ。ユーザーの世界観が非空で、400 の残りと出力の余裕が足りるときだけ「つづき」の仮の欄を足す。
       足せなかった理由は o.skip.reason に返す（報告用）。足さないときは fields は従来とまったく同じ */
    if (o && o.loreAppend === true && !skw2Off() && mode === MODES.EXPAND_EXISTING && s.scene.lore.length > 0){
      var room = loreRoom(s.scene.lore);
      if (room < LORE_ADD_ROOM_MIN){ if (o.info) o.info.reason = 'LORE_FULL'; }
      else {
        var allow = Math.floor((MAX_TOKENS * TOK_RESERVE - estOutTokens(fields) - heroTok) / TOK_PER_CHAR);   /* 余裕の文字数 */
        var cap = Math.min(250, room, allow);
        if (o.info){ o.info.estTok = estOutTokens(fields) + heroTok; o.info.allow = allow; }
        if (cap < LORE_ADD_ROOM_MIN){ if (o.info) o.info.reason = 'BUDGET'; }
        else { for (var lj = 0; lj < fields.length; lj++){ if (fields[lj].key === 'lore') loreIdx = lj + 1; } fields.splice(loreIdx, 0, { key: LORE_ADD_KEY, label: loreAddLabel(cap), value: '', filled: false, writable: true, el: null, loreAdd: true, cap: cap }); }
      }
    }
    return fields;
  }
  function explicitSeedCount(fields){
    var n = 0;
    for (var i = 0; i < fields.length; i++){ if (fields[i] && fields[i].filled && trim(fields[i].value)) n++; }
    return n;
  }

  /* ---- ② prompt: fix436.buildFillPrompt ＋（条件付き）seed hint を別節で ---- */
  function seedHintText(pack){
    if (!pack || !isObj(pack)) return '';
    var lines = [], keys = ['setting', 'era_tech', 'stance', 'lack_desire', 'relationship', 'opening_pressure', 'secret', 'world_rule', 'mood_tone'];
    for (var i = 0; i < keys.length; i++){ var a = pack[keys[i]]; if (a && a.text) lines.push('- ' + trim(a.text)); }
    if (!lines.length) return '';
    return '\n\n## 参考の種（多様性のためのヒント。確定情報ではない。従っても従わなくてもよい。矛盾すれば無視する）\n' + lines.join('\n');
  }
  function buildPrompt(fields, mode, pack){
    var F = f436(); if (!F || typeof F.buildFillPrompt !== 'function') return fail('FIX436_UNAVAILABLE');
    var p = F.buildFillPrompt(fields);
    if (!p) return { ok: true, prompt: null, blanks: 0 };
    var seeds = explicitSeedCount(fields);
    var hinted = false;
    if (mode === MODES.OMAKASE_CREATE && seeds === 0 && pack){
      var h = seedHintText(pack);
      if (h){ p = { sys: p.sys, user: p.user + h, blankKeys: p.blankKeys, knownKeys: p.knownKeys }; hinted = true; }
    }
    return { ok: true, prompt: p, blanks: p.blankKeys.length, seeds: seeds, hinted: hinted };
  }

  /* ---- ③ preflight: parseFillJson / normVal より前に raw を検査（SILENT TRUNCATION = FORBIDDEN） ---- */
  function extractRawObject(text){
    if (typeof text !== 'string' || !text) return null;
    var s = text.replace(/```[a-zA-Z]*/g, ' ').replace(/```/g, ' ');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { var o = JSON.parse(s.slice(a, b + 1)); return isObj(o) ? o : null; } catch(e){ return null; }
  }
  function strippedLen(v){
    /* fix436.normVal と同じ前処理（trim → 端の引用符除去 → trim）の後の JS .length */
    var s = trim(str(v)).replace(/^["'「『]+|["'」』]+$/g, ''); s = trim(s); return s.length;
  }
  function preflightRaw(text, skipKeys){
    var F = f436(); if (!F || typeof F.normVal !== 'function') return fail('FIX436_UNAVAILABLE');
    var o = extractRawObject(text);
    if (!o) return fail('BAD_JSON');
    var oversized = [], walk = function(obj, prefix){
      for (var k in obj){
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        if (skipKeys && prefix === '' && skipKeys.indexOf(k) >= 0) continue;   /* ★SEEDWORLD2: loreAdd の長さは expand が自分で見る（つづきだけ不採用にするため） */
        var v = obj[k];
        if (isObj(v)){ walk(v, prefix + k + '_'); continue; }
        if (typeof v !== 'string' && typeof v !== 'number') continue;
        var n = F.normVal(v);                       /* 実物の normVal に通す */
        if (n && n.length < strippedLen(v)) oversized.push(prefix + k);   /* 長さ理由で短くなった = silent truncation */
      }
    };
    walk(o, '');
    if (oversized.length) return fail('AI_VALUE_OVERSIZED', oversized);
    return { ok: true };
  }

  /* ---- ④ fields → Scenario input（新オブジェクト。base は不変） ---- */
  function toScenarioInput(fields, base){
    var s = normalizeInput(base);
    var byKey = {}, i;
    for (i = 0; i < fields.length; i++){ if (fields[i] && fields[i].key) byKey[fields[i].key] = fields[i]; }
    var val = function(k){ var f = byKey[k]; return f ? trim(f.value) : ''; };
    var out = { title: s.title, scene: {}, cast: { hero: {}, npcs: [] }, startCondition: '', startRules: s.startRules /* 原文そのまま */ };
    var sc = { lore: val('lore'), loc: val('loc'), obj: val('obj'), tone: val('tone') };
    /* ★SEEDWORLD2: 採用されたつづきがあるときだけ「原文 + 区切り + つづき」。原文は val('lore')（= 入力の trim）をそのまま先頭に */
    var la = byKey[LORE_ADD_KEY]; if (la && sc.lore && trim(la.value)) sc.lore = sc.lore + LORE_ADD_SEP + trim(la.value);
    for (var k in sc){ if (sc[k]) out.scene[k] = sc[k]; }
    var hn = val('heroName'), hd = val('heroDesc');
    /* ★SEEDHERO1: 採用された足しがあるときだけ「利用者の説明 + 改行 + 性格・外見・立場 + 改行 + 口調：…」。利用者の文は先頭にそのまま */
    var hadd = byKey[HERO_ADD_KEY], hvo = byKey[HERO_VOICE_KEY], hparts = [];
    if (hadd && trim(hadd.value)) hparts.push(trim(hadd.value));
    if (hvo && trim(hvo.value)) hparts.push(HERO_VOICE_PREFIX + trim(hvo.value));
    if (hd && hparts.length) hd = hd + HERO_SEP + hparts.join('\n');
    if (hn) out.cast.hero.name = hn; if (hd) out.cast.hero.desc = hd;
    var hgv = val(HERO_GENDER_KEY); if (hgv) out.cast.hero[GENDER_FIELD] = hgv;   /* ★LOCKED をそのまま戻す */
    /* NPC（裁定 26）: fields の npcN_* を N 順に **slot をそのまま**再構成する。name が無くても slot は消さない
       （EXISTING_NPC_SLOT_DELETION_BY_EXPANSION = FORBIDDEN）。name の無い slot は namelessSlots として報告するだけ。
       slot 数は toFields が決めた数（EXPAND_EXISTING = base の npcs 数 / OMAKASE_CREATE = base 0 なら 2） */
    var slots = {}, nameless = [];
    for (i = 0; i < fields.length; i++){
      var m = /^npc(\d+)_(\w+)$/.exec(fields[i] && fields[i].key || '');
      if (!m) continue;
      var n = +m[1]; slots[n] = slots[n] || {}; var v = trim(fields[i].value); if (v) slots[n][m[2]] = v;
    }
    var ns = Object.keys(slots).map(Number).sort(function(a, b){ return a - b; });
    for (i = 0; i < ns.length; i++){
      var o = slots[ns[i]];
      if (!o.name) nameless.push(ns[i]);
      out.cast.npcs.push(o);
    }
    var scd = val('startCondition'); if (scd) out.startCondition = scd;
    return { input: out, namelessSlots: nameless };
  }

  /* ---- transport / random ---- */
  function transportAvailable(){
    /* ACTUAL_PROXY_RUNTIME_ONLY: 実 fix247 runtime の authority だけを見る。LS（v292ProxyUrl/Pass/GoogleToken）や
       __chronicleGoogleId を fix823 が読んで「fix247 なら ON だろう」と再計算することは **しない**。
       fix247 が on()（or state().on）を公開していなければ fail-closed で false。 */
    try {
      var p = window.__v292Dfix247;
      if (!p || typeof p !== 'object') return false;              /* 不在 or 現行の boolean marker → false */
      if (typeof p.on === 'function') return p.on() === true;
      if (typeof p.state === 'function'){ var st = p.state(); return !!(st && st.on === true); }
      return false;
    } catch(e){ return false; }
  }
  function randomCandidate(base, cb){
    /* OMAKASE_CREATE + seed 0 専用。fix335 の pack を field へ（startCondition / startRules は作らない） */
    var A = f335(); if (!A || typeof A.draw !== 'function') return cb(fail('FIX335_UNAVAILABLE'));
    var s = normalizeInput(base);
    A.draw(function(p1, f1){
      if (!f1 || !f1.npc || !f1.npc.name || !f1.hero || !f1.hero.name) return cb(fail('FIX335_DRAW_FAILED'));
      var npcs = [f1.npc], taken = {}; taken[f1.npc.name] = 1; taken[f1.hero.name] = 1;
      var tries = 0;
      (function more(){
        if (npcs.length >= OMAKASE_DEFAULT_NPC){
          var out = { title: s.title, scene: { lore: f1.lore, loc: f1.loc, obj: f1.obj, tone: f1.tone },
                      cast: { hero: (function(){ var h = { name: f1.hero.name, desc: f1.hero.desc }; var hg = G1() && f1.hero.gender; if (hg === '女性' || hg === '男性') h.gender = hg; return h; })() /* ★GENDER1 */, npcs: npcs },
                      startCondition: '', startRules: s.startRules };
          return cb({ ok: true, input: out, generationMode: 'RANDOM_FALLBACK' });
        }
        if (tries++ >= 4) return cb(fail('RANDOM_INCOMPLETE'));      /* 2 人揃わなければ write 0（黙って 1 人にしない） */
        A.draw(function(p2, f2){
          if (f2 && f2.npc && f2.npc.name && !taken[f2.npc.name]){ taken[f2.npc.name] = 1; npcs.push(f2.npc); }
          more();
        });
      })();
    });
  }

  /* ★GENDER1: 空だった gender 欄を「本文の明確な語 > AI の答え」で決める（決められなければ空のまま = 未設定）。
     LOCKED（入力にあった gender）は g1blank が false なので触らない。 */
  function finalizeGenders(fields){
    var g1 = G1(); if (!g1) return;
    var byKey = {}, i, f;
    for (i = 0; i < fields.length; i++){ if (fields[i] && fields[i].key) byKey[fields[i].key] = fields[i]; }
    for (i = 0; i < fields.length; i++){
      f = fields[i]; if (!f || !f.g1blank) continue;
      var dk = (f.key === HERO_GENDER_KEY) ? 'heroDesc' : f.key.replace(/_gender$/, '_desc');
      var d = byKey[dk], g = g1.resolve(f.filled ? f.value : '', d ? d.value : '');
      f.value = g; f.filled = !!g;
    }
  }

  /* ---- ⑤ expand（保存しない。candidate を返す） ---- */
  function expand(input, opts, cb){
    if (typeof opts === 'function'){ cb = opts; opts = {}; }
    opts = opts || {}; cb = cb || function(){};
    if (off()) return cb(fail('OFF'));
    var mode = opts.mode;
    if (mode !== MODES.EXPAND_EXISTING && mode !== MODES.OMAKASE_CREATE) return cb(fail('MODE_REQUIRED'));
    var F = f436(); if (!F || typeof F.request !== 'function') return cb(fail('FIX436_UNAVAILABLE'));
    var base = clone(isObj(input) ? input : {});
    var baseStr = JSON.stringify(input);
    /* ★SEEDWORLD2: 合図は入口で必ず消費する（次の呼び出しへ持ち越さない）。kill 中は無視 */
    var laReq = (opts.loreAppend === true || ARMED) && !skw2Off(); ARMED = false;
    var laInfo = {};
    var X = ARM2; ARM2 = null;   /* ★SEEDHERO1 / SEEDNPC1e: 合図は入口で必ず消費する（kill は toFields・armSeedExtras 側でも見る） */
    var heroReq = !!(X && X.hero) && !sh1Off(), aliasMap = (X && X.npcAlias && !sn1eOffK()) ? X.npcAlias : null;
    var tOpts = laReq ? { loreAppend: true, info: laInfo } : ((heroReq || aliasMap) ? { info: laInfo } : undefined);
    if (heroReq) tOpts.heroAdd = true;
    if (aliasMap) tOpts.npcAlias = aliasMap;
    var fields = toFields(base, mode, tOpts);
    var hAddField = null, hVoiceField = null; for (var hj = 0; hj < fields.length; hj++){ if (fields[hj].heroAdd) hAddField = fields[hj]; if (fields[hj].heroVoice) hVoiceField = fields[hj]; }
    var laField = null; for (var li = 0; li < fields.length; li++){ if (fields[li].loreAdd) laField = fields[li]; }
    var seeds = explicitSeedCount(fields);
    var baseNpcCount = normalizeInput(base).cast.npcs.length;
    var report = { mode: mode, explicitSeeds: seeds, calls: 0, generationMode: null, hinted: false, applied: [], protected_: [], unknown: [], rejected: [], namelessSlots: [] };
    if (laReq) report.loreAppend = { requested: true, asked: !!laField, applied: false, reason: laField ? null : (normalizeInput(base).scene.lore ? (mode === MODES.EXPAND_EXISTING ? (laInfo.reason || 'LORE_FULL') : 'MODE') : 'NO_LORE'), addLen: 0, addMax: 0, prohibitions: [], laws444: 0 };
    if (heroReq){
      var hh = laInfo.hero || {};
      report.heroAppend = { requested: true, askedAdd: !!hAddField, askedVoice: !!hVoiceField, appliedAdd: false, appliedVoice: false, reason: (hAddField || hVoiceField) ? null : (laInfo.heroReason || (normalizeInput(base).cast.hero.desc ? (mode === MODES.EXPAND_EXISTING ? 'BUDGET' : 'MODE') : 'NO_DESC')), cap: hh.cap || 0, addLen: 0, voiceLen: 0, droppedAgency: 0, voiceReason: null, addReason: null };
    }
    if (aliasMap){ report.npcAlias = { requested: Object.keys(aliasMap).length, asked: 0 }; for (var aj = 0; aj < fields.length; aj++){ if (fields[aj].alias) report.npcAlias.asked++; } }
    if (laReq && laInfo.estTok) { report.loreAppend.estTok = laInfo.estTok; report.loreAppend.allow = laInfo.allow; }
    var omakaseZero = (mode === MODES.OMAKASE_CREATE && seeds === 0);

    function finishRandom(code){
      if (!omakaseZero) return cb(fail(code, report));               /* 部分入力あり → WRITE 0 */
      randomCandidate(base, function(r){
        if (!r.ok){ report.randomFailure = r.code; return cb(fail(code, report)); }   /* random も揃わなければ write 0（理由を report に残す） */
        report.generationMode = 'RANDOM_FALLBACK'; report.fallbackReason = code;
        return cb({ ok: true, candidate: r.input, report: report });
      });
    }
    function proceed(pack){
      var bp = buildPrompt(fields, mode, pack);
      if (!bp.ok) return cb(bp);
      if (!bp.prompt){ report.generationMode = 'NONE'; return cb({ ok: true, candidate: null, report: report, noBlanks: true }); }
      report.hinted = bp.hinted;
      if (!transportAvailable()) return finishRandom('AI_UNAVAILABLE');
      report.calls = 1;
      F.request(bp.prompt, function(err, txt){
        if (err) return finishRandom('AI_FAILED');
        var skipK = []; if (laField) skipK.push(LORE_ADD_KEY, 'lore_add'); if (hAddField || hVoiceField) skipK.push(HERO_ADD_KEY, 'hero_add', HERO_VOICE_KEY, 'hero_voice');
        var pf = preflightRaw(txt, skipK.length ? skipK : undefined);
        if (!pf.ok) return cb(fail(pf.code, pf.detail));          /* oversized / bad json → write 0（random にも落とさない） */
        var json = F.parseFillJson(txt);
        if (!json) return cb(fail('BAD_JSON'));
        /* ★SEEDWORLD2: loreAdd は applyFill（normVal が 400 で黙って切る）に通さず、ここで検査して自分で入れる */
        var laRaw, laHas = false;
        if (laField){
          var userLore = normalizeInput(base).scene.lore, addMax = Math.min(LORE_ADD_MAX, loreRoom(userLore));   /* 検査の上限は 300（目安は label の 150〜250。16%の余裕は切らずに受ける） */
          report.loreAppend.addMax = addMax;
          if (Object.prototype.hasOwnProperty.call(json, LORE_ADD_KEY)){ laRaw = json[LORE_ADD_KEY]; laHas = true; }
          else if (Object.prototype.hasOwnProperty.call(json, 'lore_add')){ laRaw = json.lore_add; laHas = true; }
          delete json[LORE_ADD_KEY]; delete json.lore_add;
        }
        var haRaw, haHas = false, hvRaw, hvHas = false;   /* ★SEEDHERO1: applyFill（normVal が 400 で黙って切る）に通さず自分で検査する */
        if (hAddField || hVoiceField){
          if (Object.prototype.hasOwnProperty.call(json, HERO_ADD_KEY)){ haRaw = json[HERO_ADD_KEY]; haHas = true; } else if (Object.prototype.hasOwnProperty.call(json, 'hero_add')){ haRaw = json.hero_add; haHas = true; }
          if (Object.prototype.hasOwnProperty.call(json, HERO_VOICE_KEY)){ hvRaw = json[HERO_VOICE_KEY]; hvHas = true; } else if (Object.prototype.hasOwnProperty.call(json, 'hero_voice')){ hvRaw = json.hero_voice; hvHas = true; }
          delete json[HERO_ADD_KEY]; delete json.hero_add; delete json[HERO_VOICE_KEY]; delete json.hero_voice;
        }
        var rep; try { rep = F.applyFill(fields, json); } catch(e){ return cb(fail('APPLY_ERROR')); }
        report.applied = rep.applied; report.protected_ = rep.protected_; report.unknown = rep.unknown; report.rejected = rep.rejected;
        if (laField){
          var chk = laHas ? checkLoreAdd(laRaw, userLore, report.loreAppend.addMax) : { ok: false, reason: 'MISSING' };
          if (chk.ok){
            laField.value = chk.text; laField.filled = true; rep.applied.push(LORE_ADD_KEY);
            report.loreAppend.applied = true; report.loreAppend.addLen = chk.n;
            report.loreAppend.prohibitions = loreProhibitions(chk.text); report.loreAppend.laws444 = laws444(chk.text);
          } else { report.loreAppend.reason = chk.reason; if (chk.n) report.loreAppend.addLen = chk.n; if (chk.detail) report.loreAppend.detail = chk.detail; }
          report.applied = rep.applied;
        }
        if (hAddField || hVoiceField){
          var uh = normalizeInput(base).cast.hero.desc, hr = report.heroAppend;
          if (hAddField){
            var ca = haHas ? checkHeroAdd(haRaw, uh, hAddField.cap) : { ok: false, reason: 'MISSING' };
            if (ca.ok){ hAddField.value = ca.text; hAddField.filled = true; rep.applied.push(HERO_ADD_KEY); hr.appliedAdd = true; hr.addLen = ca.n; hr.droppedAgency = ca.dropped || 0; }
            else { hr.addReason = ca.reason; if (ca.dropped) hr.droppedAgency = ca.dropped; }
          }
          if (hVoiceField){
            var cv = hvHas ? checkHeroVoice(hvRaw) : { ok: false, reason: 'MISSING' };
            if (cv.ok){ hVoiceField.value = cv.text; hVoiceField.filled = true; rep.applied.push(HERO_VOICE_KEY); hr.appliedVoice = true; hr.voiceLen = cv.n; }
            else hr.voiceReason = cv.reason;
          }
          report.applied = rep.applied;
        }
        var nonGender = 0; for (var q = 0; q < rep.applied.length; q++){ if (!GENDER_KEY_RE.test(rep.applied[q])) nonGender++; }   /* ★GENDER1: 性別だけでは「補完できた」と数えない */
        if (!nonGender) return cb(fail('NOTHING_APPLIED', report));
        finalizeGenders(fields);
        var t = toScenarioInput(fields, base);
        report.namelessSlots = t.namelessSlots; report.generationMode = 'AI_INFERRED';
        if (report.heroAppend && (report.heroAppend.appliedAdd || report.heroAppend.appliedVoice)){   /* ★SEEDHERO1: 利用者の説明が先頭にそのまま残っていることの自己検査（崩れたら足しだけ落とす） */
          var uhd = normalizeInput(base).cast.hero.desc, nhd = t.input.cast && t.input.cast.hero && t.input.cast.hero.desc;
          if (typeof nhd !== 'string' || nhd.indexOf(uhd) !== 0 || nhd.length <= uhd.length){
            if (hAddField){ hAddField.value = ''; hAddField.filled = false; } if (hVoiceField){ hVoiceField.value = ''; hVoiceField.filled = false; }
            t = toScenarioInput(fields, base); report.heroAppend.appliedAdd = false; report.heroAppend.appliedVoice = false; report.heroAppend.reason = 'PREFIX_BROKEN'; report.heroAppend.addLen = 0; report.heroAppend.voiceLen = 0;
          }
        }
        if (laField && report.loreAppend.applied){   /* ★SEEDWORLD2: 原文が先頭にそのまま残っていることの自己検査（崩れたらつづきだけ落とす） */
          var ul = normalizeInput(base).scene.lore, nl = t.input.scene && t.input.scene.lore;
          if (typeof nl !== 'string' || nl.indexOf(ul) !== 0 || nl.length <= ul.length){ laField.value = ''; laField.filled = false; t = toScenarioInput(fields, base); report.loreAppend.applied = false; report.loreAppend.reason = 'PREFIX_BROKEN'; report.loreAppend.addLen = 0; report.loreAppend.prohibitions = []; report.loreAppend.laws444 = 0; }
        }
        if (JSON.stringify(input) !== baseStr) return cb(fail('BASE_MUTATED'));   /* 入力を汚していないことの自己検査 */
        /* 裁定 26: EXPAND_EXISTING は base の NPC 数を厳密に維持（hard invariant・崩れたら fail-closed） */
        if (mode === MODES.EXPAND_EXISTING && t.input.cast.npcs.length !== baseNpcCount) return cb(fail('NPC_COUNT_INVARIANT_VIOLATED', { base: baseNpcCount, got: t.input.cast.npcs.length }));
        /* 裁定 26: OMAKASE_CREATE の synthetic slot（base 0 → 2）は name が揃わなければ incomplete（partial save 0）
           → seed 0 なら RANDOM_FALLBACK、それ以外は write 0 */
        if (mode === MODES.OMAKASE_CREATE && baseNpcCount === 0 && t.namelessSlots.length) return finishRandom('GENERATION_INCOMPLETE');
        return cb({ ok: true, candidate: t.input, report: report });
      });
    }
    if (omakaseZero && f335() && typeof f335().draw === 'function'){
      try { f335().draw(function(pack){ proceed(pack || null); }); } catch(e){ proceed(null); }
    } else proceed(null);
  }

  /* ---- ⑥ expandAndSave: fix820 read → expand → validate → edit（whole-value） ---- */
  function expandAndSave(scenarioId, opts, cb){
    if (typeof opts === 'function'){ cb = opts; opts = {}; }
    opts = opts || {}; cb = cb || function(){};
    if (off()) return cb(fail('OFF'));
    var ST = f820(); if (!ST || typeof ST.read !== 'function') return cb(fail('FIX820_UNAVAILABLE'));
    var r = ST.read(scenarioId); if (!r.ok) return cb(r);
    var sc = r.scenario;
    var input = { title: sc.title, scene: sc.scene, cast: sc.cast, startCondition: sc.startCondition, startRules: sc.startRules };
    expand(input, opts, function(res){
      if (!res.ok) return cb(res);
      if (res.noBlanks) return cb({ ok: true, saved: false, noBlanks: true, report: res.report });
      var v = ST.validate(res.candidate);
      if (!v.ok) return cb(fail('VALIDATE_FAILED', v));
      var e = ST.edit(scenarioId, res.candidate);
      if (!e.ok) return cb(e);
      return cb({ ok: true, saved: true, scenarioId: scenarioId, report: res.report });
    });
  }

  window.__v292Dfix823 = {
    version: VERSION, MODES: MODES, OMAKASE_DEFAULT_NPC: OMAKASE_DEFAULT_NPC,
    toFields: toFields, explicitSeedCount: explicitSeedCount, buildPrompt: buildPrompt, seedHintText: seedHintText,
    preflightRaw: preflightRaw, toScenarioInput: toScenarioInput, randomCandidate: randomCandidate,
    transportAvailable: transportAvailable, expand: expand, expandAndSave: expandAndSave,
    /* ★SEEDWORLD2 */
    armLoreAppend: armLoreAppend, disarmLoreAppend: disarmLoreAppend, armSeedExtras: armSeedExtras, disarmSeedExtras: disarmSeedExtras, checkHeroAdd: checkHeroAdd, checkHeroVoice: checkHeroVoice, HERO_SEP: HERO_SEP, HERO_VOICE_PREFIX: HERO_VOICE_PREFIX, HERO_TOTAL: HERO_TOTAL, loreProhibitions: loreProhibitions, stripProhibitions: stripProhibitions,
    LORE_ADD_SEP: LORE_ADD_SEP, LORE_ADD_MARK: LORE_ADD_MARK, LORE_ADD_MAX: LORE_ADD_MAX, LORE_DELIVER_CAP: LORE_DELIVER_CAP,
    state: function(){ return { off: off(), fix436: !!f436(), fix436Request: !!(f436() && f436().request), fix335: !!f335(), fix820: !!f820(), transport: transportAvailable(), uiWired: false }; }
  };
  try { console.log(TAG, 'loaded (adapter only; not wired to any UI)'); } catch(e){}
})();
