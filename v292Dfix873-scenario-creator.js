// =====================================================================
// Chronicle TRPG - v292Dfix873: SCENARIO_CREATOR_DEPTH_V1（home 専用・lane 13 / GPT 裁定 #L13entry）
// ---------------------------------------------------------------------
// ■ これは何か
//   「＋ シナリオを作る」を押したときに、いきなり全項目のエディタを出すのをやめ、
//   **深さを 3 つだけ**選ばせる。3 つとも行き着く先は **同じ fix820.create()**（schema 変更 0）。
//     [1] おまかせで作る      … OMAKASE_CREATE → 下書きを見せる → 始める / 少し直す
//     [2] 物語の種から作る    … 世界・主人公を一言ずつ → EXPAND_EXISTING → 同じ確認カード
//     [3] しっかり作る        … 今までの SC_EDIT（1 バイトも変えない）
//
// ■ 壊さない約束（1 つでも破ったら実装ミス）
//   NO_FIX825_REWRITE  … fix825 の node / handler / view / overlay を書き換えない。
//                        入口は #scView への **capture phase** listener 1 つだけで、
//                        [data-sc-act="new"] を拾って stopPropagation する（fix825 は bubble phase）。
//                        kill 中はこの listener が何もしないので、click は素通りで従来の openNew() に届く。
//   OWN_CONTAINER      … 描画は自前の #sc873View（#scView の兄弟）だけ。class 'mid' を **付けない**
//                        （fix825 wire() が section.mid から listSec を拾うため）。
//                        .card / [data-open] / [data-v] / #newCard / #playBtn も使わない。
//   OVERLAY_NOT_MINE   … #scOverlay に触らない（confirm / review / offer / fix872 衝突ダイアログは fix825 の持ち物）。
//                        closeOverlay() 相当を 1 度も呼ばない。
//   ADOPT_BEFORE_SAVE  … 確認カードが **採用の瞬間**。候補は fix825 の S.candidate に居るだけで、
//                        「▶」を押すまで store には 1 バイトも書かない（AI EXPAND != SAVE / fix825 契約）。
//   NO_STORY_BEFORE_ADOPTION … fix819.instantiate は api.start() 経由だけ。確認カードを見る前には呼ばれない。
//   LS_WRITE_0         … localStorage へ 1 バイトも書かない（読むのは自分の kill key だけ）。
//                        auth 系 key（v292ProxyUrl / v292ProxyPass / v292GoogleToken 等）は **読まない**。
//   NO_CODES_NO_AUTH   … 画面に内部 code を出さない。「Google ログイン」「アクセスコード」「合言葉」
//                        「プロキシ」を creator の文面に **1 度も**出さない（公開導線の目標）。
//   TRANSPORT_AUTHORITY … AI 可否は fix823 が呼び出し時に自分で見る。fix873 は再計算しない。
//                        3 枚のカードは **auth 状態で出し分けない**（隠さない・無効化しない）。
//   ONE_CLICK_ONE_GENERATION … 「🎲 別の案を作る」は 1 click = 1 生成。生成中は disabled。自動再試行 0。
//   FIX872_UNTOUCHED   … 同期（cloudRev 0 / dirty）は fix820.create() がやる。fix873 は meta を触らない。
//
// 検証口: window.__v292Dfix873 = { version, state, api }
// kill: localStorage['v292Dfix873Off'] = '1' → 深さ選択を出さず、従来どおり SC_EDIT へ直行。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix873) return;
  var TAG = '[v292Dfix873:scenario-creator]';
  var VERSION = 'v292Dfix873-20261020-creator-v1.0a';   /* v1.0a: uifix-a #sc873View のスクロール箱化（フッター重なり・スクロール不可の修正） */

  var DEFAULT_TITLE = '新しい物語';

  /* ---------- 文面（GPT 裁定 #L13entry でそのまま確定した文字列） ---------- */
  var COPY = {
    head: 'どうやって作りますか？',
    cards: [
      { key: 'OMAKASE', t: 'おまかせで作る',     d: '何も決めなくて大丈夫。Chronicleがシナリオ案を作ります。' },
      { key: 'SEED',    t: '物語の種から作る',   d: '世界と主人公をひとことずつ。残りをChronicleが広げます。' },
      { key: 'FULL',    t: 'しっかり作る',       d: '世界やキャラを細かく決めます。必要なところはAIにも任せられます。' }
    ],
    foot: 'どれを選んでも、できあがるのは同じ「シナリオ」です。',
    back: '← もどる',
    seedHead: '物語の種',
    seedLore: 'どんな世界ですか？',
    seedHero: 'どんな主人公ですか？',
    seedNpc: 'いっしょに出る人（任意）',
    seedGo: 'つづける',
    genOmakase: 'シナリオを組み立てています…',
    genSeed: '物語を広げています…',
    revHead: 'できました',
    revTitle: 'タイトル',
    start: '▶ このシナリオで始める',
    tweak: '✎ 少し直す',
    again: '🎲 別の案を作る',
    revNote: '「▶」を押すと、このシナリオが保存されて物語が始まります。',
    randomNote: '自動生成を使えなかったため、ランダムに作りました。',
    seedKept: '自動補完を今は使えません。入力した内容はそのまま残しています。',
    seedKeptGo: '✎ 自分で書きつづける',
    failHead: 'うまく作れませんでした',
    failBody: 'もう一度ためすか、自分で作ることもできます。',
    retry: 'もう一度ためす',
    manual: '✎ 自分で作る'
  };
  /* 画面に出してはいけない語（自己検査。harness も同じ表を使う） */
  var FORBIDDEN = ['Google', 'ログインし', 'アクセスコード', '合言葉', 'プロキシ', 'proxy', 'token', 'API'];

  /* ---------- deps（呼ぶだけ・無ければ黙って従来動作） ---------- */
  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix873Off') === '1'; }
  function M825(){ var m = window.__v292Dfix873TestHook825 || window.__v292Dfix825; return (m && m.api) ? m : null; }
  function A(){ var m = M825(); return m ? m.api : null; }
  function str(v){ return (v == null) ? '' : String(v); }
  function trim(v){ return str(v).replace(/^\s+|\s+$/g, ''); }
  function isObj(o){ return !!o && typeof o === 'object' && Object.prototype.toString.call(o) !== '[object Array]'; }
  function isArr(o){ return Object.prototype.toString.call(o) === '[object Array]'; }
  function esc(t){ return str(t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  /* ---------- state（memory only。LS / sessionStorage / 新 key 0） ---------- */
  var S = {
    installed: false, view: null,           /* null | 'PICK' | 'SEED' | 'GEN' | 'REVIEW' | 'FAIL' | 'SEEDKEPT' */
    mode: null,                             /* 'OMAKASE' | 'SEED' */
    busy: false, gens: 0, picks: 0,
    candidate: null, report: null, title: '',
    seed: { lore: '', hero: '', npc: '', title: '' },
    lastFail: null                          /* code は **画面に出さない**。console / state 用 */
  };

  var host = null;                          /* #sc873View */

  /* ---------- style（新しい <style> 1 枚。#scStyle は 1 バイトも触らない） ---------- */
  function injectStyle(){
    if (el('sc873Style')) return;
    var s = document.createElement('style'); s.id = 'sc873Style';
    s.textContent =
      '#sc873View{flex:1;min-width:0}' +
      /* ★uifix-a(2026-10-20・iPhone 実機で発覚): #sc873View は class 'mid' を付けない約束なので、
         section.mid の overflow:auto を**受け継いでいなかった**。HOME は body{height:100%;overflow:hidden} の
         画面固定レイアウトで、スクロールできるのは section.mid / aside だけ。そのため長い「できました」が
         main の外へはみ出して下のフッター（#v888footer）の上に重なって描かれ、ページもスクロールできなかった。
         → section.mid と同じく「自分の中でスクロールする箱」にする（min-height:0 は縦並びの flex で縮めるため）。
         中身が箱に収まる時は見た目 1px も変わらない。 */
      '#sc873View{min-height:0;overflow:auto}' +
      /* ★uifix-a: 携帯幅では section.mid と同じ 14px の余白（無いとカードの右端が画面の縁に貼りつき、切れて見える）。
         PC / iPad 幅（641px 以上）は 1px も変えない。 */
      '@media(max-width:640px){#sc873View{padding:14px}}' +
      '.sc873-cards{display:flex;flex-direction:column;gap:8px;margin:4px 0 12px}' +
      '.sc873-card{display:block;width:100%;text-align:left;padding:14px;border:1px solid var(--line);' +
        'border-radius:10px;background:var(--panel);color:var(--tx);cursor:pointer;font:inherit}' +
      '.sc873-card:hover{border-color:var(--acc2)}' +
      '.sc873-card:disabled{opacity:.45;cursor:default}' +
      '.sc873-ct{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.sc873-cd{font-size:12.5px;color:var(--dim);line-height:1.55;margin-top:4px}' +
      '.sc873-foot{font-size:12px;color:var(--dim);line-height:1.6;padding:2px 0 8px}' +
      '.sc873-gen{padding:34px 0;text-align:center;color:var(--dim);font-size:13.5px}' +
      '.sc873-rev{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:14px;margin:4px 0 12px}' +
      '.sc873-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13px;line-height:1.6;margin-top:10px}' +
      '@media(max-width:420px){.sc873-grid{grid-template-columns:1fr;gap:2px 0}}' +
      '.sc873-k{color:var(--dim);font-size:11.5px;white-space:nowrap}' +
      '.sc873-v{overflow-wrap:anywhere;word-break:break-word}' +
      '.sc873-cta{padding:11px 16px;font-size:14px}' +
      '.sc873-note{font-size:12px;color:var(--dim);line-height:1.6;margin-top:8px}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- container ---------- */
  function scView(){ return el('scView'); }
  function ensureHost(){
    if (host && host.parentNode) return host;
    var sc = scView(); if (!sc || !sc.parentNode) return null;
    host = el('sc873View');
    if (!host){
      host = document.createElement('div');
      host.id = 'sc873View';                 /* ★class 'mid' を付けない（fix825 wire() の listSec 誤認防止） */
      sc.parentNode.insertBefore(host, sc.nextSibling);
    }
    return host;
  }
  /* 自分を出す = #scView を隠す（これで fix825 の expand() が review overlay を出さない） */
  function showSelf(){
    injectStyle();
    var h = ensureHost(), sc = scView();
    if (!h || !sc) return false;
    sc.hidden = true; h.hidden = false;
    return true;
  }
  /* 自分を畳んで fix825 へ返す */
  function handBack(){
    var sc = scView();
    if (host) { host.hidden = true; host.innerHTML = ''; }
    if (sc) sc.hidden = false;
    S.view = null;
  }

  /* ---------- render ---------- */
  function headHtml(title){
    return '<div class="sc-head"><div class="sc-h1">' + esc(title) + '</div>' +
           '<button class="sc-btn" data-c873="back">' + esc(COPY.back) + '</button></div>';
  }
  function renderPick(){
    if (!showSelf()) return;
    S.view = 'PICK';
    var h = headHtml('シナリオを作る');
    h += '<div class="sc873-foot">' + esc(COPY.head) + '</div><div class="sc873-cards">';
    for (var i = 0; i < COPY.cards.length; i++){
      var c = COPY.cards[i];
      h += '<button class="sc873-card" data-c873="pick" data-c873-k="' + esc(c.key) + '">' +
           '<span class="sc873-ct">' + esc(c.t) + '</span>' +
           '<span class="sc873-cd">' + esc(c.d) + '</span></button>';
    }
    h += '</div><div class="sc873-foot">' + esc(COPY.foot) + '</div>';
    host.innerHTML = h;
  }
  function fieldHtml(k, label, v){
    return '<div class="sc-f sc-wide"><label for="sc873_' + esc(k) + '">' + esc(label) + '</label>' +
           '<input id="sc873_' + esc(k) + '" type="text" data-c873-f="' + esc(k) + '" value="' + esc(v) + '"></div>';
  }
  function renderSeed(){
    if (!showSelf()) return;
    S.view = 'SEED';
    var h = headHtml(COPY.seedHead);
    h += '<div class="sc-form">' +
      fieldHtml('lore', COPY.seedLore, S.seed.lore) +
      fieldHtml('hero', COPY.seedHero, S.seed.hero) +
      fieldHtml('npc', COPY.seedNpc, S.seed.npc) +
      '</div>' +
      '<div class="sc-acts"><button class="sc-btn sc-primary sc873-cta" data-c873="seedGo">' + esc(COPY.seedGo) + '</button></div>';
    host.innerHTML = h;
  }
  function renderGen(){
    if (!showSelf()) return;
    S.view = 'GEN';
    host.innerHTML = headHtml('シナリオを作る') +
      '<div class="sc873-gen">' + esc(S.mode === 'SEED' ? COPY.genSeed : COPY.genOmakase) + '</div>';
  }
  function row(label, v){
    if (!trim(v)) return '';
    return '<div class="sc873-k">' + esc(label) + '</div><div class="sc873-v">' + esc(v) + '</div>';
  }
  function renderReview(){
    if (!showSelf()) return;
    S.view = 'REVIEW';
    var c = S.candidate || {}, sc = isObj(c.scene) ? c.scene : {};
    var cast = isObj(c.cast) ? c.cast : {}, hero = isObj(cast.hero) ? cast.hero : {};
    var npcs = isArr(cast.npcs) ? cast.npcs : [];
    var g = '';
    g += row('世界', sc.lore);
    g += row('舞台', sc.loc);
    g += row('雰囲気', sc.tone);
    g += row('目的', sc.obj);
    g += row('主人公', trim(hero.name) + (trim(hero.desc) ? '／' + hero.desc : ''));
    for (var i = 0; i < npcs.length; i++){
      var n = isObj(npcs[i]) ? npcs[i] : {};
      g += row('登場人物 ' + (i + 1), trim(n.name) + (trim(n.desc) ? '／' + n.desc : ''));
    }
    g += row('はじまり', c.startCondition);
    var isRandom = !!(S.report && S.report.generationMode === 'RANDOM_FALLBACK');
    var h = headHtml(COPY.revHead);
    h += '<div class="sc873-rev">' +
      '<div class="sc-f sc-wide"><label for="sc873_title">' + esc(COPY.revTitle) + '</label>' +
      '<input id="sc873_title" type="text" data-c873-f="title" value="' + esc(S.title) + '"></div>' +
      '<div class="sc873-grid">' + g + '</div>' +
      (isRandom ? '<div class="sc873-note">' + esc(COPY.randomNote) + '</div>' : '') +
      '</div>';
    h += '<div class="sc-acts">' +
      '<button class="sc-btn sc-start sc873-cta" data-c873="start">' + esc(COPY.start) + '</button>' +
      '<button class="sc-btn sc873-cta" data-c873="tweak">' + esc(COPY.tweak) + '</button>' +
      '<button class="sc-btn" data-c873="again"' + (S.busy ? ' disabled' : '') + '>' + esc(COPY.again) + '</button>' +
      '</div>';
    h += '<div class="sc873-note">' + esc(COPY.revNote) + '</div>';
    h += '<div data-c873-msg></div>';
    host.innerHTML = h;
  }
  /* 種を入れたのに AI が使えなかった → **入力を 1 文字も捨てない**で SC_EDIT へ渡す */
  function renderSeedKept(){
    if (!showSelf()) return;
    S.view = 'SEEDKEPT';
    host.innerHTML = headHtml(COPY.seedHead) +
      '<div class="sc873-rev"><div class="sc873-v">' + esc(COPY.seedKept) + '</div></div>' +
      '<div class="sc-acts"><button class="sc-btn sc-primary sc873-cta" data-c873="toEdit">' + esc(COPY.seedKeptGo) + '</button></div>';
  }
  function renderFail(){
    if (!showSelf()) return;
    S.view = 'FAIL';
    host.innerHTML = headHtml(COPY.failHead) +
      '<div class="sc873-rev"><div class="sc873-v">' + esc(COPY.failBody) + '</div></div>' +
      '<div class="sc-acts">' +
      '<button class="sc-btn sc-primary sc873-cta" data-c873="retry"' + (S.busy ? ' disabled' : '') + '>' + esc(COPY.retry) + '</button>' +
      '<button class="sc-btn sc873-cta" data-c873="toEdit">' + esc(COPY.manual) + '</button>' +
      '</div>';
  }
  function setCardMsg(text){
    if (!host) return;
    var box = host.querySelector('[data-c873-msg]');
    if (box) box.innerHTML = text ? '<div class="sc-msg sc-err">' + esc(text) + '</div>' : '';
  }

  /* ---------- title 自動補完（AI call 0。候補の中身から作るだけ） ---------- */
  function deriveTitle(cand){
    var c = isObj(cand) ? cand : {};
    var cast = isObj(c.cast) ? c.cast : {}, hero = isObj(cast.hero) ? cast.hero : {};
    var sc = isObj(c.scene) ? c.scene : {};
    if (trim(hero.name)) return trim(hero.name) + 'の物語';
    if (trim(sc.loc)) return trim(sc.loc) + 'の物語';
    return DEFAULT_TITLE;
  }

  /* ---------- ★SEEDNPC1（2026-11-09・Local 候補）: 「いっしょに出る人」の 1 行を人ごとに分ける ----------
     不具合（本番 93-i で実測）: 「パン屋の娘 汐里（しおり）：18歳、…／老灯台守 源三：70歳、…」が
       **名前 61 文字の NPC 1 人**になった。真因 = 下の seededDraft が欄の全文をそのまま npcs[0].name に入れていた。
       fix823 の EXPAND_EXISTING は「埋まっている欄 = 確定（LOCKED）」「NPC の人数は増やさない」契約なので、
       AI は名前を直せず人数も増やせない → 合体した 1 人のまま保存・物語の登録 NPC になる。
     直し方（ここだけ・fix823 / fix436 / fix820 / 保存の形は 1 バイトも変えない）:
       ① 強い区切り（改行 ／ / ； ; ｜ |）で切り、「名前：説明」で始まるかたまりが **2 つ以上**（最大 6）
          あり、しかも先頭のかたまりも「名前：説明」のときだけ、人ごとに分ける。
          「名前：説明」で始まらないかたまり（説明の中の ／・「性格：明るい」のような項目名）は直前の人の説明へ戻す。
       ② 分けないとき（1 人）: 「名前：説明」なら名前と説明に分ける。名前の後ろのかな読み「（しおり）」は
          説明の先頭へ「（読み：しおり）」として移す。
       ③ それでも名前が 20 文字を超えるなら、名前は空にして全文を説明に入れる（名前は AI が説明から決める。
          AI が使えないときは「自分で書きつづける」で名前の欄が空のまま見える）。
       ・「、」「・」「。」「空白」では切らない（説明の中・「ユア・ミスト」型の名前・「パン屋の娘 汐里」型の肩書きを守る）。
       ・項目名（性格・年齢・口癖 など）は名前として扱わない。「18:00」のような時刻の : も区切りにしない。
       ・20 文字以下で「：」も読みも無い入力は従来と 1 バイトも同じ（名前 = 入力全文）。
     kill: localStorage v292DfixSEEDNPC1Off='1' → 従来どおり（全文を 1 人の名前に）。
     診断: window.__v292DfixSEEDNPC1 = { version, on(), parse(text), status() }（localStorage へ書かない・名前は残さない） */
  var SN1 = { version: 'seednpc1-a-20261109', last: null };
  var SN1_NAME_MAX = 20;                 /* code point */
  var SN1_MAX_PEOPLE = 6;
  var SN1_SEP_RE = /([\n／\/；;｜|])/;
  var SN1_HEAD_BAD = /[、。，,．.!?！？「」『』（）()\[\]【】<>＜＞\n／\/；;｜|：:]/;
  var SN1_LABELS = (function(){
    var a = ['名前','氏名','名','よみ','読み','ふりがな','フリガナ','年齢','歳','年','性別','性格','外見','容姿','見た目','顔',
             '髪','髪型','髪色','目','瞳','服','服装','身長','体型','体格','職業','仕事','立場','役割','役職','身分','所属',
             '出身','種族','関係','関係性','間柄','口調','口癖','一人称','二人称','呼び方','好き','嫌い','好物','苦手',
             '得意','趣味','特技','能力','武器','特徴','過去','経歴','背景','秘密','目的','目標','願い','欲求','動機',
             '恐怖','傷','弱点','癖','信条','夢','悩み','家族','声','備考','補足','説明','設定','メモ','注意','例','NG'];
    var o = {}; for (var i = 0; i < a.length; i++) o[a[i]] = 1; return o;
  })();
  function sn1Off(){ return lsg('v292DfixSEEDNPC1Off') === '1'; }
  function sn1Len(s){ return str(s).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '_').length; }
  /* 名前の後ろのかな読み「（しおり）」「(シオリ)」だけを外す（漢字・英字の括弧は外さない） */
  function sn1Reading(head){
    var m = /^([\s\S]*?)[ 　]*[（(][ 　]*([ぁ-ゖァ-ヺー・ 　]+?)[ 　]*[）)]$/.exec(trim(head));
    if (m && trim(m[1])) return { name: trim(m[1]), reading: trim(m[2]) };
    return { name: trim(head), reading: '' };
  }
  /* かたまりが「名前：説明」で始まるか。始まるなら { name, reading, body } */
  function sn1Head(seg){
    var s = trim(seg), i = s.search(/[：:]/);
    if (i <= 0) return null;
    var head = trim(s.slice(0, i)), body = trim(s.slice(i + 1));
    if (!head || !body) return null;
    if (s.charAt(i) === ':' && /\d$/.test(head) && /^\d/.test(body)) return null;   /* 18:00 */
    var rd = sn1Reading(head);
    if (!rd.name || sn1Len(rd.name) > SN1_NAME_MAX || SN1_HEAD_BAD.test(rd.name)) return null;
    if (/^[0-9０-９]/.test(rd.name)) return null;                                     /* 「20年前：…」は名前ではない */
    if (SN1_LABELS[rd.name.replace(/[ 　]+/g, '')]) return null;
    return { name: rd.name, reading: rd.reading, body: body, head: head, colon: s.charAt(i) };
  }

  /* ---------- ★SEEDNPC1b（2026-11-09・Local 候補）: 名前の無い「説明だけの人」 ----------
     不具合（本番 93-j・Owner 実プレイ）: 「生徒会委員長のまじめな女子高生」と説明だけ書くと、その文がそのまま
       NPC の **名前** になった（20 文字以下なので SEEDNPC1a の「長すぎる名前は空に」に当たらない）。
     直し方（ここだけ）: 「人を表す語で終わり、その前に修飾（の・な・い・を・が など）がある」ものだけを
       **説明** と判定し、name を空・desc に全文を入れる（SEEDNPC1a の TOO_LONG と同じ形 → fix823 が AI で名前を埋める）。
       迷うものは今までどおり名前のまま（本物の名前を説明へ回す方が害が大きい）。
       ・ひらがなの「の」で終わる名前（ひなの・あやの）や「姓＋ひらがなの名」（日向のぞみ・田中なな）を
         説明と見ないため、「の」「な」は **漢字・カタカナの直後** のときだけ修飾として数え、
         その後ろに続くひらがなが決まった語尾（まじめな・優しい 等）でなければ数えない。
       ・先輩・先生・姫・隊長などの **敬称になる語** は、さらに厳しく（「剣道部の先輩」「優しい先生」だけ）。
         「あやの先輩」「ひなの先生」「春な先輩」は名前のまま。
       ・複数人: 区切り（改行 ／ / ； ; ｜ |、または 、 ，）で 2〜6 個に分かれ、**全部が** 説明のときだけ人ごとに分ける。
         「名前：説明」の並び（SEEDNPC1a）では、名前の側が説明なら（「港町の老漁師：70歳」）その人の name を空にする。
         名前だけの項目が混ざる列（「汐里／港町の老漁師」）は今までどおり（分けない）。
     kill: localStorage v292DfixSEEDNPC1bOff='1' → SEEDNPC1a と同じ（説明だけの人も名前になる）。
           v292DfixSEEDNPC1Off='1' は今までどおり全部止める（93-i と同じ）。 */
  var SN1B = { version: 'seednpc1-b-20261109' };
  function sn1bOff(){ return lsg('v292DfixSEEDNPC1bOff') === '1'; }
  var SN1B_ROLE = ('女子高生 男子高生 女子高校生 男子高校生 高校生 中学生 小学生 大学生 女子大生 学生 生徒 転校生 新入生 同級生 上級生 下級生 '+
    '少年 少女 青年 若者 老人 老婆 老女 老爺 老紳士 紳士 淑女 男 女 男性 女性 男の子 女の子 子ども 子供 赤ん坊 幼女 幼児 娘 息子 '+
    '漁師 猟師 農夫 農家 商人 店主 店員 職人 鍛冶屋 鍛冶師 医者 医師 看護師 薬師 教師 騎士 兵士 剣士 戦士 魔法使い 魔女 魔術師 魔導士 錬金術師 '+
    '僧侶 神父 牧師 巫女 神官 修道女 シスター 執事 メイド 侍女 召使い 使用人 盗賊 海賊 山賊 傭兵 冒険者 旅人 吟遊詩人 詩人 探偵 警官 警察官 '+
    '記者 作家 画家 歌手 歌姫 踊り子 アイドル 女王 王女 令嬢 お嬢様 貴族 村人 町人 住人 隣人 友人 友達 親友 幼なじみ 幼馴染 同僚 上司 部下 '+
    '相棒 仲間 恋人 婚約者 夫 妻 兄 姉 弟 妹 母 父 祖母 祖父 叔父 叔母 伯父 伯母 母親 父親 兄貴 姉貴 おばあさん おじいさん おばあちゃん '+
    'おじいちゃん おばさん おじさん お姉さん お兄さん 研究者 科学者 学者 技術者 技師 案内人 管理人 番人 守り人 灯台守 墓守 門番 船乗り 水夫 '+
    '運転手 料理人 料理長 板前 パン屋 花屋 看板娘 女将 主人 女主人 大家 少年兵 勇者 魔王 人物 キャラ キャラクター 人 者 '+
    '猫 黒猫 犬 狐 狼 幽霊 亡霊 妖精 精霊 竜 ドラゴン ロボット アンドロイド 人形').split(' ');
  /* 敬称・肩書きになる語（「あやの先輩」のように名前の直後に付く）= 厳しい判定 */
  var SN1B_TITLE = ('先輩 後輩 先生 師匠 姫 姫様 王子 王 王様 殿下 陛下 委員長 会長 副会長 部長 隊長 団長 社長 船長 艦長 署長 院長 '+
    '校長 教頭 店長 局長 博士 教授 刑事 警部 少尉 中尉 大尉 少佐 中佐 大佐 将軍 司令 兄さん 姉さん 兄ちゃん 姉ちゃん 兄様 姉様 お姉様 お兄様').split(' ');
  var SN1B_NOUNS = (function(){
    var a = [], i, t = {};
    for (i = 0; i < SN1B_ROLE.length; i++) a.push({ w: SN1B_ROLE[i], title: false });
    for (i = 0; i < SN1B_TITLE.length; i++){ a.push({ w: SN1B_TITLE[i], title: true }); t[SN1B_TITLE[i]] = 1; }
    a.sort(function(x, y){ return y.w.length - x.w.length; });   /* 長い語を先に（「老漁師」より「漁師」… 「お姉さん」より「姉さん」は後） */
    return a;
  })();
  /* 漢字の直後に続くひらがなが、これと **ちょうど同じ** ときだけ修飾（「田中なな」「鈴木いずみ」は当たらない） */
  var SN1B_ADJ = (function(){
    var a = ('な い しい た だ る う く す つ む ぬ ぐ ぶ ない らない わない かない さない たない まない がない した った いた んだ れた けた えた '+
      'きた ちた めた せた てた ねた える ける げる せる てる ねる める れる いる きる そうな げな しげな っぽい らしい がちな がる っている ている '+
      'ていた ってる かな やかな らかな ような みたいな').split(' ');
    var o = {}; for (var i = 0; i < a.length; i++) o[a[i]] = 1; return o;
  })();
  var SN1B_KAN = '一-龯々〆ヵヶ';
  var SN1B_BAD = /[：:「」『』（）()\[\]【】<>＜＞"“”'‘’\n／\/；;｜|，,。．.!?！？…]/;
  /* 修飾の手がかり。strict = 敬称の語の前（「剣道部の先輩」「優しい先生」だけ） */
  function sn1bEvid(P, strict){
    var re, m;
    /* ① 漢字・カタカナ・数字の直後の の/を/が */
    re = new RegExp('[' + SN1B_KAN + 'ァ-ヺー0-9０-９]([のをが])([ぁ-ゖ]*)', 'g');
    while ((m = re.exec(P))){
      var run = m[2];
      if (strict){ if (run === '') return true; continue; }               /* 敬称の前: 助詞の直後が漢字・カタカナ・語の終わり */
      if (m[1] !== 'の') return true;                                     /* を・が: 名前には入らない */
      /* の: 直後が漢字・カタカナ・語の終わり、または「まじめな」「やさしい」のような 3〜6 字の語尾つきひらがな（「日向のぞみ」は当たらない） */
      if (run === '' || SN1B_ADJ[run] || (run.length >= 3 && run.length <= 6 && /(な|い|た)$/.test(run))) return true;
    }
    /* ② 漢字の直後の決まった語尾（無口な・優しい・喋る・眼鏡をかけた の「た」は ① で済む） */
    re = new RegExp('([' + SN1B_KAN + ']+)([ぁ-ゖ]+)', 'g');
    while ((m = re.exec(P))){
      var r2 = m[2];
      if (strict){ if (r2 === 'しい' || r2 === 'い' || (r2 === 'な' && m[1].length >= 2)) return true; continue; }   /* 敬称の前: 優しい・元気な（漢字 2 字以上 + な）。「春な先輩」は数えない */
      if (SN1B_ADJ[r2] || (r2.length >= 2 && r2.length <= 5 && /[いな]$/.test(r2))) return true;   /* 人懐っこい・賑やかな */
    }
    /* ③ カタカナの直後の「な」（ドジな・クールな） */
    if (new RegExp('[ァ-ヺー]な(?![ぁ-ゖ])').test(P)) return true;
    /* ④ ひらがなだけの修飾（まじめな・かわいい）。敬称の前では数えない（「あやな先輩」を守る） */
    if (!strict && /^[ぁ-ゖー]{3,}(な|い)$/.test(P) && sn1Len(P) >= 4) return true;
    return false;
  }
  /* 説明だけの人か。true のときだけ name を空にする（迷えば false = 今までどおり名前） */
  function sn1bIsDesc(raw){
    if (sn1bOff()) return false;
    var t = trim(str(raw)).replace(/[。．.！!]+$/, '');
    var n = sn1Len(t);
    if (n < 2 || n > 60) return false;
    if (SN1B_BAD.test(t)) return false;
    /* 「、」の前のかたまりが言いさし（無口で、・18歳、）でなければ説明と見ない（「汐里、港町の老漁師」は名前の並びかもしれない＝今までどおり） */
    var segs = t.split('、');
    for (var si = 0; si < segs.length - 1; si++){ var sg = trim(segs[si]); if (!sg || !(/[でてくしりいなたがもやら歳代]$/.test(sg))) return false; }
    var tc = t.replace(/[ 　]+$/, '');
    for (var i = 0; i < SN1B_NOUNS.length; i++){
      var w = SN1B_NOUNS[i].w;
      if (tc.length < w.length || tc.slice(tc.length - w.length) !== w) continue;
      var P = trim(tc.slice(0, tc.length - w.length).replace(/[、 　]+$/, ''));
      if (!P){
        /* 語だけ（「女子高生」「幼なじみ」）: 2 文字以上・敬称でない語だけ説明とみなす */
        return !SN1B_NOUNS[i].title && sn1Len(w) >= 2;
      }
      return sn1bEvid(P, SN1B_NOUNS[i].title);
    }
    return false;
  }
  /* 区切られた項目が全部「説明だけの人」なら、その項目の列（2〜6）。それ以外は null */
  function sn1bList(text, sepRe){
    var items = text.split(sepRe), out = [];
    for (var i = 0; i < items.length; i++){
      var it = trim(items[i]);
      if (!it) continue;
      if (!sn1bIsDesc(it)) return null;
      out.push(it);
    }
    return (out.length >= 2 && out.length <= SN1_MAX_PEOPLE) ? out : null;
  }
  function sn1Desc(reading, body){
    var b = trim(body);
    return reading ? ('（読み：' + reading + '）' + b) : b;
  }
  function sn1Parse(raw){
    var text = trim(str(raw).replace(/\r\n?/g, '\n'));
    if (!text) return { mode: 'EMPTY', people: [] };
    var parts = text.split(SN1_SEP_RE);   /* 偶数 = かたまり / 奇数 = 区切り文字 */
    if (parts.length >= 3){
      var people = [], cur = null, okFirst = true;
      for (var i = 0; i < parts.length; i += 2){
        var h = sn1Head(parts[i]);
        if (h){ cur = { name: h.name, reading: h.reading, body: h.body, head: h.head, colon: h.colon }; people.push(cur); continue; }
        if (!cur){ okFirst = false; break; }
        cur.body = cur.body + parts[i - 1] + parts[i];      /* 説明の中の ／ 等は区切り文字ごと元へ戻す */
      }
      if (okFirst && people.length >= 2 && people.length <= SN1_MAX_PEOPLE){
        var out = [];
        for (var j = 0; j < people.length; j++){
          /* ★SEEDNPC1b: 名前の側が説明（「港町の老漁師：70歳」）なら name を空・そのかたまりを丸ごと説明へ */
          if (sn1bIsDesc(people[j].head)) out.push({ name: '', desc: people[j].head + people[j].colon + people[j].body });
          else out.push({ name: people[j].name, desc: sn1Desc(people[j].reading, people[j].body) });
        }
        return { mode: 'SPLIT', people: out };
      }
      /* ★SEEDNPC1b: 区切られた項目が全部「説明だけの人」→ 人ごとに name 空 */
      var dl = sn1bList(text, /[\n／\/；;｜|]/);
      if (dl) return { mode: 'DESC_LIST', people: dl.map(function(x){ return { name: '', desc: x }; }) };
    }
    if (!/[\n／\/；;｜|]/.test(text) && /[、，,]/.test(text)){
      var dl2 = sn1bList(text, /[、，,]/);
      if (dl2) return { mode: 'DESC_LIST', people: dl2.map(function(x){ return { name: '', desc: x }; }) };
    }
    var one = sn1Head(text);
    if (one){
      if (sn1bIsDesc(one.head)) return { mode: 'DESC_HEAD', people: [{ name: '', desc: text }] };
      return { mode: 'NAME_DESC', people: [{ name: one.name, desc: sn1Desc(one.reading, one.body) }] };
    }
    var rd = sn1Reading(text);
    if (sn1Len(rd.name) <= SN1_NAME_MAX){
      if (sn1bIsDesc(text)) return { mode: 'DESC_ONLY', people: [{ name: '', desc: text }] };
      if (rd.reading) return { mode: 'READING', people: [{ name: rd.name, desc: sn1Desc(rd.reading, '') }] };
      return { mode: 'AS_IS', people: [{ name: text, desc: '' }] };
    }
    return { mode: 'TOO_LONG', people: [{ name: '', desc: text }] };
  }
  window.__v292DfixSEEDNPC1 = {
    version: SN1.version,
    on: function(){ return !sn1Off(); },
    parse: function(t){ return sn1Parse(t); },
    status: function(){ return { on: !sn1Off(), version: SN1.version, last: SN1.last ? { mode: SN1.last.mode, count: SN1.last.count } : null,
                                 b: { on: !sn1Off() && !sn1bOff(), version: SN1B.version } }; },
    isDesc: function(t){ return sn1bIsDesc(t); }
  };

  /* ---------- 生成 ---------- */
  function seededDraft(){
    var a = A(); if (!a) return null;
    var d = a.draft(); if (!d) return null;
    d.scene.lore = S.seed.lore;
    d.cast.hero.desc = S.seed.hero;
    /* ★NPC slot は「名前か説明が入っているときだけ」作る（空の slot は作らない）。
       名前の無い slot は fix820.validate が NPC_WITHOUT_NAME で落とすし、
       EXPAND_EXISTING は slot を消せない（裁定 26）。SEEDNPC1a/1b の「name 空・desc あり」は
       fix823 が AI で名前を埋める（AI が使えないときは編集画面で名前の欄が空のまま見える）。 */
    d.cast.npcs = [];
    if (sn1Off()){
      if (trim(S.seed.npc)) d.cast.npcs.push({ name: trim(S.seed.npc), desc: '', personality: '', coreDesire: '', coreFear: '', wound: '', gender: '' });
    } else {
      /* ★SEEDNPC1: 「いっしょに出る人」の 1 行を人ごとに分ける（名前と説明も分ける）。入力の文字は 1 文字も捨てない */
      var pr = sn1Parse(S.seed.npc);
      SN1.last = { mode: pr.mode, count: pr.people.length };
      for (var pi = 0; pi < pr.people.length; pi++){
        d.cast.npcs.push({ name: pr.people[pi].name, desc: pr.people[pi].desc, personality: '', coreDesire: '', coreFear: '', wound: '', gender: '' });
      }
    }
    if (trim(S.seed.title)) d.title = trim(S.seed.title);
    return d;
  }
  function generate(){
    var a = A();
    if (!a || S.busy) return;
    S.busy = true; S.candidate = null; S.report = null;
    renderGen();
    var mode = (S.mode === 'SEED') ? 'EXPAND_EXISTING' : 'OMAKASE_CREATE';
    var done = false;
    a.expand(mode, function(res){
      if (done) return; done = true;
      S.busy = false; S.gens++;
      if (!res || !res.ok){
        S.lastFail = (res && res.code) || 'EXPAND_FAILED';
        try { console.warn(TAG, 'GENERATION_FAILED', S.lastFail); } catch(e){}
        /* ★裁定 #L13entry: 種を入れているときは RANDOM_FALLBACK が **構造的に起きない**
           （fix823: explicitSeedCount > 0 → omakaseZero = false → finishRandom が即 fail）。
           だから「ランダムで作り直す」ことはせず、**入力を保ったまま** SC_EDIT へ渡す。 */
        if (S.mode === 'SEED') return renderSeedKept();
        return renderFail();
      }
      if (res.noBlanks || !res.candidate){
        /* 埋める空欄が無い = 種がそのまま完成形。SC_EDIT へ渡す（write 0） */
        if (S.mode === 'SEED') return toEdit();
        S.lastFail = 'NO_BLANKS';
        return renderFail();
      }
      S.candidate = res.candidate; S.report = res.report || {};
      S.title = deriveTitle(res.candidate);
      renderReview();
    });
  }

  /* ---------- 採用 → 保存 → 開始 ---------- */
  function applyTitle(){
    var a = A(); if (!a) return;
    var d = a.draft(); if (!d) return;
    d.title = trim(S.title) || DEFAULT_TITLE;
    a.setDraft(d);                       /* draft だけ。store write 0・SC_EDIT を再描画 */
  }
  function doStart(){
    var a = A(); if (!a || S.busy) return;
    /* ★採用（suppressEnrichOffer）: 「始める」の途中に ✒ offer overlay を割り込ませない */
    var ac = a.acceptCandidate({ suppressEnrichOffer: true });
    if (!ac || !ac.ok){ S.lastFail = (ac && ac.code) || 'ACCEPT_FAILED'; return renderFail(); }
    applyTitle();
    var sv = a.save();
    if (!sv || !sv.ok){
      /* 保存できない理由は fix825 の利用者向け文面をそのまま見せる（code は出さない）。
         直す場所はエディタなので「✎ 少し直す」へ誘導する。 */
      S.lastFail = (sv && sv.code) || 'SAVE_FAILED';
      try { console.warn(TAG, 'SAVE_FAILED', S.lastFail); } catch(e){}
      S.candidate = null;
      renderReview();
      setCardMsg(saveFailText());
      return;
    }
    var st = a.start();
    if (!st || !st.ok){
      S.lastFail = (st && st.code) || 'START_FAILED';
      try { console.warn(TAG, 'START_FAILED', S.lastFail); } catch(e){}
      /* gate 等は fix825 が自分の文面 / 自分の overlay で面倒を見る。ここは SC_EDIT へ返すだけ。 */
      return handBack();
    }
    handBack();
  }
  /* fix825 の state().lastErrorCode ではなく、利用者向けの短い一文だけを出す（code 0） */
  function saveFailText(){
    return 'このままでは保存できませんでした。「' + COPY.tweak + '」で直してください。';
  }
  function doTweak(){
    var a = A(); if (!a || S.busy) return;
    var ac = a.acceptCandidate();        /* ここは従来どおり（✒ offer を出してよい） */
    if (!ac || !ac.ok){ S.lastFail = (ac && ac.code) || 'ACCEPT_FAILED'; return renderFail(); }
    applyTitle();
    handBack();                          /* 未保存のまま SC_EDIT を見せる */
  }
  function toEdit(){ handBack(); }

  /* ---------- 入口 ---------- */
  function openPick(){
    if (off()) return { ok: false, code: 'OFF' };
    var a = A(); if (!a) return { ok: false, code: 'FIX825_UNAVAILABLE' };
    var r = a.openNew();                 /* draft を空に（store write 0・view = SC_EDIT） */
    if (r && r.ok === false) return r;
    S.picks++; S.mode = null; S.busy = false;
    S.candidate = null; S.report = null; S.title = '';
    S.seed = { lore: '', hero: '', npc: '', title: '' };
    renderPick();
    return { ok: true };
  }
  function pick(key){
    if (S.busy) return;
    if (key === 'FULL'){ S.mode = 'FULL'; return handBack(); }   /* 今までの SC_EDIT に 1 バイトも触らない */
    if (key === 'SEED'){ S.mode = 'SEED'; return renderSeed(); }
    S.mode = 'OMAKASE'; return generate();
  }
  function seedGo(){
    if (S.busy) return;
    var a = A(); if (!a) return;
    var d = seededDraft(); if (!d) return;
    a.setDraft(d);                        /* 種を draft へ（store write 0） */
    generate();
  }

  /* ---------- wiring ---------- */
  function onHostClick(e){
    var t = e.target;
    var b = t && t.closest && t.closest('[data-c873]');
    if (!b) return;
    e.preventDefault();
    var act = b.getAttribute('data-c873');
    switch (act){
      case 'back':
        if (S.view === 'SEED' || S.view === 'REVIEW' || S.view === 'FAIL' || S.view === 'SEEDKEPT'){
          if (S.busy) return;
          S.candidate = null; S.report = null;
          return renderPick();
        }
        return backToList();
      case 'pick':   return pick(b.getAttribute('data-c873-k'));
      case 'seedGo': return seedGo();
      case 'start':  return doStart();
      case 'tweak':  return doTweak();
      case 'again':  if (!S.busy) generate(); return;
      case 'retry':  if (!S.busy) generate(); return;
      case 'toEdit': return toEdit();
    }
  }
  function onHostInput(e){
    var t = e.target, k = t && t.getAttribute && t.getAttribute('data-c873-f');
    if (!k) return;
    if (k === 'title') S.title = t.value;
    else if (S.seed.hasOwnProperty(k)) S.seed[k] = t.value;
  }
  function backToList(){
    var a = A();
    handBack();
    if (a) a.openList();
  }
  /* ★capture phase。fix825 の root listener（bubble）より先に走り、stopPropagation で止める。
     kill 中 / 依存不在のときは **何もしない**ので、click は素通りで従来の openNew() に届く。 */
  function onScViewCaptureClick(e){
    if (off()) return;
    var t = e.target;
    var b = t && t.closest && t.closest('[data-sc-act="new"]');
    if (!b) return;
    if (!A()) return;
    e.preventDefault(); e.stopPropagation();
    openPick();
  }
  function install(){
    if (S.installed) return;
    var sc = scView();
    if (!sc){ try { console.log(TAG, 'loaded (host DOM not present; inactive)'); } catch(e){} return; }
    sc.addEventListener('click', onScViewCaptureClick, true);   /* ★capture */
    var h = ensureHost();
    if (h){
      h.hidden = true;
      h.addEventListener('click', onHostClick, false);
      h.addEventListener('input', onHostInput, false);
    }
    S.installed = true;
    try { console.log(TAG, 'loaded (' + (off() ? 'OFF: depth chooser hidden' : 'depth chooser active') + ')'); } catch(e){}
  }

  window.__v292Dfix873 = {
    version: VERSION,
    state: function(){
      return { off: off(), installed: S.installed, view: S.view, mode: S.mode, busy: S.busy,
               gens: S.gens, picks: S.picks, hasCandidate: !!S.candidate, title: S.title,
               seed: { lore: S.seed.lore, hero: S.seed.hero, npc: S.seed.npc },
               lastFail: S.lastFail,
               deps: { fix825: !!A(), hostEl: !!el('sc873View') } };
    },
    /* fixture / 診断用: DOM を通さず同じ core を呼ぶ */
    api: { openPick: openPick, pick: pick, seedGo: seedGo, generate: generate,
           start: doStart, tweak: doTweak, toEdit: toEdit, back: backToList,
           setTitle: function(t){ S.title = str(t); return { ok: true }; },
           setSeed: function(o){ if (isObj(o)) { for (var k in o){ if (S.seed.hasOwnProperty(k)) S.seed[k] = str(o[k]); } } return { ok: true }; },
           candidate: function(){ return S.candidate ? JSON.parse(JSON.stringify(S.candidate)) : null; },
           deriveTitle: deriveTitle, forbiddenWords: function(){ return FORBIDDEN.slice(); },
           install: install }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, false); else install();
})();
