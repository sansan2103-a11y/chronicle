/* =====================================================================
 * Chronicle v292DfixMIDICON r3: 途中から登場したキャラの自動アイコン（画像専用の控え・ch_mx）— 端末側（laneMIDICON3・2026-11-01・Local 候補・本番 HOLD）
 * ---------------------------------------------------------------------
 * GPT #127-PC: MIDICON2 Local 実装 GO（端末側含む）・本番 HOLD。#127-PA: 固有名なし（記述名）の条件。#127-PE: 画像の安全確認は Worker（mx_ensure にも掛かる）。
 * Owner の希望（2026-11-01）: 途中から出てきた人物（名前の無い怪異「長い黒髪の女」も）が、3 ターン以上くり返し出て見た目の手がかりが足りるとき、自動で絵を付ける。足りなければ作らない。
 *
 * ■やること
 *   1) 読む: 物語を開いたときに portrait.mx_list を 1 回 → 控え（呼び名・言い換え・絵の asset_id・引き継ぎ先）を「メモリの中だけ」に持つ。
 *      絵の表示は v292Dav2-portrait.js（applyImg / sweep）だけが img の src を書く。この部品は extraFor() でデータを渡すだけ（src の奪い合い・点滅を作らない）。
 *   2) 作る: ターンが落ち着いたあと（生成中でない・registrar が空き・fix697 の送信待ちが無い・3 秒静か）に、mx_list を 1 回読み、
 *      Worker のターン数＝端末のターン数のときだけ、候補を 1 人選んで portrait.mx_ensure を 1 回（character_id なし）。違えばこのターンは見送る。
 *      1 ターンの要求は最大 2（読む 1・作る 1）。時間切れ・通信切れは送り直さず mx_list を 1 回読むだけ。
 *   3) 引き継ぐ: 控えの呼び名（か言い換え）が正式な登録の呼び名（S.cast.av2.bindings）になったら portrait.mx_claim を 1 回（ページの読み込みごとに控え 1 つにつき 1 回）。
 * ■候補の条件（r2 の Worker と同じ規則を端末でも先に確かめる。最終判断は Worker）
 *   ・fix307 の名簿で重要度「高」、種類が人物系。主人公・登録キャラ・別名（fix537/277 の __v292AliasFix）・字形の揺れ（fix764）・fix641 が今昇格させる人物は除く。
 *   ・汎用名・役割の語だけ（巫女・女・影…）・「〜たち」・??? は除く。呼び名は名簿のいちばん長い形。言い換えは名簿の短い形（後ろの部分・見た目の語つき）を 3 つまで。
 *   ・固有名: 本文（narrative と plan の <say>。会話ログの who とプレイヤーの入力は数えない）の別々のターン 2 つ以上・最後が直近 3 ターン以内・見た目の語が 1 つ以上。
 *   ・記述名（固有名なし）: 別々のターン 3 つ以上・最後が直近 3 ターン以内・回想や要約の文は数えない・見た目の枠 2 つ以上（髪は 1 枠、髪以外 1 つ以上）・
 *     登録キャラ全員と比べて A 同一 / B 独立 / C 不明（文章 AI は呼ばない。C は作らない）・1 物語 2 人まで。
 *   ・上限: 1 ターン 1・1 物語 1 日 2・1 物語累計 6・1 アカウント 1 日 5（端末は無駄な要求を出さないための補助。数えるのは Worker）。
 *   ・止まる: 402・429・503 LEDGER_UNHEALTHY・422（APPEARANCE_UNSAFE_MINOR を含む）→ このページではもう作らない。422 / 409（同一性）の呼び名は物語ごとに覚えて二度と送らない。
 * ■書かないもの: S・長期記憶・fix307 名簿・sidecar・sys には何も書かない（ch_mx の番号は putcanonical を壊すので絶対に入れない）。再読み込みもしない。
 *   端末に残すのは localStorage 'v292DfixMIDICON_v1' の小さな記録だけ（日付・アカウントの日の数・物語 ID ごとの止まった理由と、呼び名のハッシュ→理由コード）。名前の文字は残さない。
 * ■止める: localStorage v292DfixMIDICONOff='1'（表示も作成も止める）／アカウントの鍵 midicon1（ADMF1・Worker が HOLD/CANARY を決める）／v292Dav2Off='1'／Worker env CHR_MX_OFF。
 *   Vault の物語（fix889 で非表示）では動かない（Worker も strict で 404）。
 * ■mx3-c（2026-11-03・GPT #127-QM: Owner だけの CANARY・土台 = 本番 90-b ＋ Worker v46.30）
 *   ・新しいプレイだけ: 開いた・読み込んだ・取り込んだ・戻した（undo/redo）ターンでは作らない。ページを開いたときのターンは全部「見た」ことにし、
 *     ターンが 1 つだけ増え、その中身（本文＋入力）がこのページでまだ見ていないものだったときだけ「遊んだターン」とする（redo や履歴の写しは見た中身）。
 *     候補はその一番新しいターンに出ている人だけ（Worker も一番新しいターンを確かめる＝MX_NOT_YET）。
 *   ・同じ人は 1 枚: 番号は Worker が呼び名から決める（extra_id）。名前・肩書きが変わった人（「〜と名乗った」「正体は」・同格・包含・同じ見た目）は
 *     Worker が 409 で既存の extra_id を返す → この端末はその呼び名のハッシュ → extra_id を覚え、同じ絵を出す（新しく作らない）。
 *   ・失敗の種類を分ける（imgsafe の拒否 / 上限 / provider の失敗 / まだ対象でない / 同一性 / 停止中）。画面には何も出さない（イニシャルの丸のまま）。
 *     記録 = この部品の 'v292DfixMIDICON_v1' の数（種類ごとの回数だけ）＋ ICF（v292DfixICF の mx の行）。名前・本文・番号は残さない。自動の再試行はしない。
 *   ・上限は Worker の設定値（mx_list の caps）に合わせる。数えて予約するのは Worker（1 ターン 1・1 物語・1 日）。
 * ■mx3-e（本番 QA 2026-11-03 の指摘）: ① 別名の行き先が登録キャラのときだけ A_ALIAS。登録されていない話者名（fix277 の準登録の別名: 郵便屋のトマス → トマス）なら
 *   その名前を Worker へ送る呼び名にし（本文の「郵便屋のトマス」と <say who="トマス"> の両方が数えられる）、名簿の呼び名は表示の別名として覚える。
 *   ② ターン数が Worker と合わない（Worker が遅れている）ときは、同じターンを 1 回だけ間を置いて見直す（1 ターン 1 枚は変わらない）。
 * ■OLDMX1（2026-11-08・Owner「古い物語でも、続きを遊んでいるときは NPC のアイコン自動生成が正常に働くようにして」・Local 候補）:
 *   候補は fix307 の名簿（登場人物台帳）からしか出ない。名簿の抽出（文章 AI・3 ターンごと・数秒〜十数秒）は、ターンが落ち着いて 3 秒後のこの判定より遅れて届くことが多い。
 *   古い物語を続きから遊ぶと、名簿に居なかった（または名簿がこの端末で作り直された）人が再登場したターンで、名簿が届く前に「候補なし」と決まり、
 *   その人が次に名簿の更新と同じターンに出るまで絵が付かなかった。→ 遊んだターンの判定が「候補なし」だった後、同じターンのうちに名簿が変わったら、
 *   そのターンをもう 1 回だけ判定し直す（1 ターン 1 回・ターンが落ち着いてから 90 秒以内・規則・上限・Worker の確認は同じ。開いただけでは作らないのも同じ）。
 *   kill: localStorage v292DfixMIDICONrosOff='1'（この見直しだけ止める）
 * ■診断: window.__v292DfixMIDICON.status()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || root.__v292DfixMIDICON) return;
  var VER = 'mx3e-20261103+oldmx1+wmxreg1+iconx1';
  var KILL = 'v292DfixMIDICONOff', LSK = 'v292DfixMIDICON_v1';
  var CAP = { turn: 1, storyDay: 2, storyTotal: 6, storyDesc: 2, acctDay: 5 };
  var SETTLE_MS = 3000, POLL_MS = 1500, ROS_LATE_MS = 90000;   /* ★OLDMX1 */
  var MX_ID_RE = /^ch_mx[A-Za-z0-9_-]{22}$/;
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  var LOG = []; function note(o) { try { o.t = Date.now(); LOG.push(o); if (LOG.length > 120) LOG.shift(); } catch (e) {} }
  var stats = { regList: 0, regEnsure: 0, regDone: 0, /* ★W-MXREG */ rosRetry: 0, aliasSpeaker: 0, aliasRegistered: 0, mmRetry: 0, list: 0, listFail: 0, ensure: 0, claim: 0, created: 0, exists: 0, inflight: 0, skipped: 0, mismatch: 0, timeouts: 0, settles: 0, notPlayed: 0, notYet: 0, alias: 0, refused: 0, provider: 0 };   /* ★mx3-c: + notPlayed / notYet / alias / refused / provider */

  /* ---------- environment ---------- */
  function state() { try { return (typeof root.__chronicleGetState === 'function') ? root.__chronicleGetState('midicon') : null; } catch (e) { return null; } }
  function F697() { return root.__v292Dfix697 || null; }
  function A() { return root.__chronicleAssetV2 || null; }
  function M() { return root.__v292Dav2Map || null; }
  function sid() { try { var f = F697(); var s = f && f.status ? f.status().storyId : null; return s ? String(s) : null; } catch (e) { return null; } }
  function doc2() { try { var m = M(); return !!(m && typeof m.docSchema2 === 'function' && m.docSchema2() === true); } catch (e) { return false; } }
  function loggedIn() { try { var f = F697(); return !!(f && f.status && f.status().loggedIn); } catch (e) { return false; } }
  function admfOn() { try { var X = root.__v292DfixADMF1; return !!(X && typeof X.gate === 'function' && X.gate('midicon1', false) === true); } catch (e) { return false; } }
  /* ★W-MXREG: the account key mxreg1 (any account; the admin page decides) + this device's kill v292DfixMIDICONregOff='1' */
  function regOn() { if (lsGet('v292DfixMIDICONregOff') === '1') return false; try { var X = root.__v292DfixADMF1; return !!(X && typeof X.gate === 'function' && X.gate('mxreg1', false) === true); } catch (e) { return false; } }
  /* ★iconx1 A (GPT #127-RY): the account key mxgen1 (READY・行なし = OFF) + this device's kill v292DfixMIDICONgenOff='1'. Used only with midicon1 (select). */
  function genOn() { if (lsGet('v292DfixMIDICONgenOff') === '1') return false; try { var X = root.__v292DfixADMF1; return !!(X && typeof X.gate === 'function' && X.gate('mxgen1', false) === true); } catch (e) { return false; } }
  /* ★iconx1 B: the nh1 module (its own key nh1 + kill v292DfixNH1Off) */
  function NH() { try { var N = root.__v292DfixNH1; return (N && typeof N.on === 'function' && N.on()) ? N : null; } catch (e) { return null; } }
  function vaultHidden(id) {   /* fail-closed: no fix889 → treat as hidden (do nothing). Worker is strict as well. */
    try { var V = root.__v292Dfix889; if (!V || typeof V.isHidden !== 'function') return true; return !!V.isHidden(id); } catch (e) { return true; }
  }
  function killed() { return lsGet(KILL) === '1' || lsGet('v292Dav2Off') === '1'; }
  function gateWhy() {
    if (killed()) return 'kill';
    if (!admfOn() && !regOn()) return 'flag-off';   /* ★W-MXREG: either key runs the loop; unregistered figures still need midicon1 (select below) */
    if (!loggedIn()) return 'not-logged-in';
    if (!doc2()) return 'not-schema2';
    var id = sid(); if (!id) return 'no-story';
    if (vaultHidden(id)) return 'vault';
    var f = F697(); if (!f || typeof f.assetV2Mx !== 'function') return 'no-port';
    return '';
  }

  /* ---------- names (same rules as the r2 Worker: mxNorm / mxKey / generic / descriptor / look words) ---------- */
  var HAN = '㐀-䶿一-鿿豈-﫿々〆', KATA = 'ァ-ヺーㇰ-ㇿ';
  var RE_HK = new RegExp('[' + HAN + KATA + ']'), RE_HIRA = /[ぁ-ゟ]/;
  var HONOR_SRC = 'さん|くん|君|ちゃん|様|さま|殿|どの|たん|はん', RE_HONOR = new RegExp('(?:' + HONOR_SRC + ')$');
  var RE_STRIP = /[\s・·\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\u2028\u2029]+/g;
  function nfkc(s) { s = (typeof s === 'string') ? s : ''; try { return s.normalize('NFKC'); } catch (e) { return s; } }
  function norm(s) { var k = nfkc(s).replace(RE_STRIP, ''); for (var i = 0; i < 2; i++) { var k2 = k.replace(RE_HONOR, ''); if (k2 && k2 !== k) k = k2; else break; } return k; }
  function dispKey(h) { if (typeof h !== 'string') return ''; var k = nfkc(h).replace(RE_STRIP, ''); if (k.length < 2 || k.length > 40 || k === '__proto__' || k === 'constructor' || k === 'prototype') return ''; return k; }
  var ROLE = ['巫女', '神主', '宮司', '禰宜', '住職', '和尚', '僧', '僧侶', '尼', '尼僧', '神父', '牧師', 'シスター', '刑事', '警官', '警察官', '巡査', '探偵', '医者', '医師',
    '看護師', '看護婦', '先生', '教師', '教授', '生徒', '学生', '店主', '店長', '女将', '主人', '管理人', '大家', '運転手', '駅員', '車掌', '記者', '侍', '武士', '忍者', '騎士', '兵', '兵隊',
    '王', '王子', '王女', '姫', '魔女', '魔法使い', '商人', '旅人', '猟師', '漁師', '農夫', '番人', '門番', '案内人', '執事', 'メイド', '女中', '侍女', '使用人', '看守', '囚人',
    '老婆', '老人', '老爺', '婆さん', '爺さん', 'お婆さん', 'お爺さん', 'おばあさん', 'おじいさん', '母', '父', '姉', '兄', '妹', '弟', '祖母', '祖父', '母親', '父親', '娘', '息子', '妻', '夫', '嫁',
    '赤ん坊', '赤子', '幼子'];
  var GENERIC = {};
  ['女', '男', '少女', '少年', '子供', 'こども', '子ども', '女性', '男性', '女の子', '男の子', '誰か', '何者か', '子', '人', '声', '影', '人影', '人物', '者', '存在', '何か', 'それ', 'あれ', 'あなた', '私', '俺', '僕', '彼', '彼女',
    '店員', '兵士', '村人', '客', '怪異', '幽霊', '亡霊', '悪霊', '怨霊', '霊', '化け物', '化物', '怪物', '妖怪', '鬼', '影法師', '???', '？？？'].concat(ROLE).forEach(function (w) { GENERIC[w] = 1; });
  var RE_GEN1 = /^(?:謎の|不明の|ある|その|例の|一人の|知らない|見知らぬ|別の|他の)|(?:たち|達|一同|衆|ども|共|の声|の影)$|[?？]/;
  var RE_GEN_RA = new RegExp('[' + HAN + KATA + ']ら$');   /* = the Worker's rule 'ら after a Han / Katakana letter', written without a lookbehind */
  function generic(nk) { return !!GENERIC[nk] || RE_GEN1.test(nk) || RE_GEN_RA.test(nk); }
  /* ★iconx1 A: a generic handle (「女」「影」…) may be drawn only when ONE figure is proven (the Worker checks the same text again; GPT #127-RY 条件付き GO):
     roster: exactly one entry of this word · importance 高 (or 中 with a supernatural 種別) · ≥2 look anchors in its roster appearance, one of them not hair.
     text: ≥3 turns where a sentence names the word WITH an anchor (or it speaks), a hit in the newest turn, never with a count / "another" word or a different hair. */
  var GA_OK = {}; ['女', '男', '少女', '少年', '老婆', '老人', '子供', '子ども', 'こども', '女の子', '男の子', '影', '人影', '幽霊', '亡霊', '怨霊', '霊', '化け物', '化物', '怪物', '妖怪', '鬼', '怪異', '影法師'].forEach(function (w) { GA_OK[w] = 1; });
  var GA_MULTI = /(?:二人|ふたり|2人|２人|三人|3人|数人|何人|もう一人|もうひとり|別の|他の|ほかの|それぞれの|一人目|二人目|もう片方)[^。、]{0,4}$/;
  var GA_NH_KIND = /怪異|妖怪|幽霊|亡霊|化け物|怪物|魔物|霊/;
  var gaWhyLast = null;
  function gaKey1(h) { var k = nfkc(String(h || '')).replace(RE_STRIP, ''); return (k.length === 1 && GA_OK[k] && genOn()) ? k : ''; }
  function rosterCount(nk) { var fk = fold(nk), n = 0; rosterOf().forEach(function (e) { if (e && typeof e.handle === 'string' && fold(e.handle) === fk) n++; }); return n; }
  function gaAnchors(app) {
    var all = [], hair = [];
    vis(app, true).list.forEach(function (x) { if (all.indexOf(x.w) < 0) { all.push(x.w); if (x.s === 'hair') hair.push(x.w); } });
    var N = root.__v292DfixNH1; if (N && typeof N.anchorsS === 'function') N.anchorsS(app).forEach(function (x) { if (all.indexOf(x.w) < 0) { all.push(x.w); if (x.s === 'hair') hair.push(x.w); } });
    return { all: all, nonHair: all.some(function (w) { return hair.indexOf(w) < 0; }) };
  }
  function gaOk(c) {
    gaWhyLast = 'GENERIC';
    if (!genOn() || !GA_OK[c.nk]) return false;
    if (rosterCount(c.nk) !== 1) { gaWhyLast = 'GA_ROSTER_N'; return false; }
    var imp = String(c.e.importance || ''), rk = String(c.e.kind || '');
    if (!(imp === '高' || (imp === '中' && GA_NH_KIND.test(rk)))) { gaWhyLast = 'GA_IMPORTANCE'; return false; }
    var an = gaAnchors(String(c.e.appr || '')); if (an.all.length < 2 || !an.nonHair) { gaWhyLast = 'GA_ANCHORS'; return false; }
    c.gaA = an; return true;
  }
  function gaEvidence(T, nk, anchors, app) {   /* = the Worker's mxGaEvidence (plan <say who> only, no conversation-log who) */
    var n = T.length, turns = 0, last = -1, multi = false, conflict = false, win = [], near = [], hitS = [], ax = axes(app);
    T.forEach(function (t, i) {
      var say = t.says.map(norm).indexOf(nk) >= 0, hit = say, ss = sents(t.text);
      ss.forEach(function (s, si) {
        if (RECALL.test(s)) return;
        var ps = hitsIn(s, nk, false); if (!ps.length) return;   /* boundary only, not the descriptor rule */
        ps.forEach(function (p) { if (GA_MULTI.test(s.slice(Math.max(0, p - 10), p))) multi = true; });
        var sx = axes(s); if ((ax.hc && sx.hc && ax.hc !== sx.hc) || (ax.hl && sx.hl && ax.hl !== sx.hl)) conflict = true;
        if (!anchors.some(function (a) { return s.indexOf(a) >= 0; })) return;
        hit = true; ps.forEach(function (p) { win.push(s.slice(Math.max(0, p - 30), p + nk.length + 30)); }); near.push(s.slice(0, 80)); near.push((ss[si + 1] || '').slice(0, 40)); hitS.push(s.slice(0, 120));
      });
      if (hit) { turns++; last = i; }
    });
    var recent = last >= 0 && last >= n - 3;
    return { ok: recent && turns >= 3, t: turns, recent: recent, need: 3, win: win, near: near, hitS: hitS, latest: n > 0 && last === n - 1, multi: multi, conflict: conflict };
  }
  /* ★iconx1 B: look slots + the nh1 dictionary's part slots (only while nh1 is ON); the labeled non-human appearance */
  function slotsU(text) { var s = vis(text).slots, o = {}; for (var k in s) o[k] = 1; var N = NH(); if (N) { var x = N.slotsJa(text); for (var k2 in x) o[k2] = 1; } return o; }
  function nhApp(texts, rosterKind) {
    var N = NH(); if (!N) return null;
    var d = N.draft(texts.join('。'), { rosterKind: rosterKind, isVisual: function (x) { return vis(x, true).nTokens > 0; } });
    if (!d || d.form === 'human') return null;
    var lab = N.labeled(d, GA_NH_KIND.test(String(rosterKind || '')) ? '怪異' : ''); return lab ? { app: lab, kind: d.kind || 'spirit' } : null;
  }
  var COLORS = ['灰色', '灰', '鼠色', 'グレー', '琥珀色', '琥珀', '金色', '黄金', '金', '銀色', '銀', '濃紺', '紺色', '紺', '漆黒', '黒色', '黒', '純白', '白色', '白', '真紅', '赤色', '赤', '紅', '朱',
    '青色', '青', '蒼', '碧', '緑色', '緑', '焦茶', '茶色', '鳶色', '茶', '紫色', '紫', '桃色', 'ピンク', '黄色', '黄'];
  var COLOR_EN = { '灰色': 'grey', '灰': 'grey', '鼠色': 'grey', 'グレー': 'grey', '琥珀色': 'amber', '琥珀': 'amber', '金色': 'golden', '黄金': 'golden', '金': 'golden', '銀色': 'silver', '銀': 'silver',
    '濃紺': 'navy', '紺色': 'navy', '紺': 'navy', '漆黒': 'black', '黒色': 'black', '黒': 'black', '純白': 'white', '白色': 'white', '白': 'white', '真紅': 'red', '赤色': 'red', '赤': 'red', '紅': 'red', '朱': 'red',
    '青色': 'blue', '青': 'blue', '蒼': 'blue', '碧': 'blue', '緑色': 'green', '緑': 'green', '焦茶': 'brown', '茶色': 'brown', '鳶色': 'brown', '茶': 'brown', '紫色': 'purple', '紫': 'purple', '桃色': 'pink', 'ピンク': 'pink', '黄色': 'yellow', '黄': 'yellow' };
  var COLOR_ALT = COLORS.slice().sort(function (a, b) { return b.length - a.length; }).join('|');
  var GARMENTS = 'セーラー服|ロングコート|制服|着物|和服|着流し|袴|作務衣|コート|外套|マント|ローブ|ドレス|スーツ|前掛け|エプロン|綿入れ|羽織|ワンピース|浴衣|喪服|白装束|装束|小袖|学生服|学ラン|ブレザー|パジャマ|寝間着|ジャージ|白衣|法衣|袈裟|割烹着|ブラウス|シャツ|スカート|ズボン|ジャケット|マフラー|軍服|甲冑|鎧';
  var CC = '(?:' + COLOR_ALT + ')(?:色の|色い|色|い|の)?';
  var VIS_SRC = [
    ['hair', CC + '髪|黒髪|白髪|銀髪|金髪|茶髪|赤髪|赤毛|ブロンド|栗色の髪', 1],
    ['hair', '長髪|短髪|ロングヘア|ショートヘア|セミロング|髪が長|髪の長|髪が短|髪の短|長い[^、。]{0,4}髪|短い[^、。]{0,4}髪|肩まで[^、。]{0,4}髪', 1],
    ['hair', 'ポニーテール|ツインテール|おさげ|お下げ|三つ編み|おかっぱ|坊主頭|丸坊主|スキンヘッド|禿頭|巻き毛|癖毛|くせ毛|濡れた髪|乱れた髪|ぼさぼさの髪|ボサボサの髪', 1],
    ['eyes', CC + '(?:目|瞳|眼)(?!鏡)|(?:うつろ|虚ろ|鋭い|切れ長|垂れ|吊り|つり|細い|大きな|大きい)(?:な|の)?(?:目|瞳|眼)(?!鏡)|目つき|眼差し|まなざし|オッドアイ', 1],
    ['face', '丸顔|面長|彫りの深い|青白い|蒼白|色白|白い肌|褐色の肌|日焼け|そばかす|傷跡|傷痕|痣|泣きぼくろ|ほくろ|無精髭|無精ひげ|顎髭|あごひげ|口髭|白塗り|厚化粧|赤い唇', 1],
    ['clothes', '(?:' + CC + ')?(?:' + GARMENTS + ')|緋袴', 1],
    ['build', '長身|背が高|大柄|小柄|背が低|痩せ|細身|ほっそり|筋肉質|逞しい|たくましい|がっしり|ずんぐり|太った|恰幅|華奢|やつれ|猫背|背筋の伸び', 1],
    ['age', '老婆|お婆さん|おばあさん|老爺|老人|年老い|お爺さん|おじいさん|初老|中年|幼い|幼児|小学生|中学生|高校生', 1],
    ['accessory', '眼鏡|メガネ|麦わら帽子|帽子|日傘|番傘|簪|かんざし|髪飾り|リボン|鈴|首飾り|ネックレス|指輪|数珠|杖|手袋|仮面|お面|能面|狐面|人形|提灯', 1],
    ['feature', '狐耳|猫耳|獣の耳|二本の角|角が生え|尻尾|鱗|牙|鋭い爪|長い爪|翼|触手|三つ目|一つ目', 1],
    ['hair', '\\bhair\\b|ponytail|twintails?|\\bbraids?\\b|braided|\\bbald\\b', 0], ['eyes', '\\beyes?\\b|\\bgaze\\b', 0],
    ['face', '\\bskin\\b|freckles|\\bscars?\\b|beard|stubble|beauty mark|\\bmole\\b|makeup|\\blips\\b', 0],
    ['clothes', 'kimono|hakama|yukata|\\bdress\\b|\\bcoat\\b|uniform|\\brobes?\\b|cloak|\\bsuit\\b|shirt|blouse|skirt|jacket|apron|attire|\\bgarb\\b|clothes|clothing|collar|sleeves?|armou?r|haori|overcoat', 0],
    ['build', '\\btall\\b|slender|muscular|stocky|heavyset|frail|petite|\\bbuild\\b', 0], ['age', 'elderly|\\bold (?:woman|man)\\b|\\bchild\\b|middle-aged', 0],
    ['accessory', 'glasses|\\bhat\\b|umbrella|parasol|hairpin|kanzashi|ribbon|\\bbell\\b|necklace|\\bstaff\\b|\\bcane\\b|gloves|\\bmask\\b|\\bdoll\\b|lantern', 0],
    ['feature', '\\bhorns?\\b|\\btail\\b|fox ears|cat ears|\\bwings?\\b|scales|fangs|claws', 0]];
  var VIS = VIS_SRC.map(function (x) { return [x[0], new RegExp(x[1], 'gi'), x[2] === 1]; });
  function vis(text, jaOnly) {   /* → { tokens: {slot:token → 1}, slots: {slot → 1}, list: [Japanese tokens in order] } */
    var t = (typeof text === 'string') ? text : '', tokens = {}, slots = {}, list = [], nt = 0, ns = 0;
    for (var i = 0; i < VIS.length; i++) { var re = VIS[i][1]; if (jaOnly && !VIS[i][2]) continue; re.lastIndex = 0; var m;
      while ((m = re.exec(t))) { if (!m[0]) { re.lastIndex++; continue; } var tk = VIS[i][0] + ':' + m[0].toLowerCase(); if (!tokens[tk]) { tokens[tk] = 1; nt++; if (VIS[i][2]) list.push({ s: VIS[i][0], w: m[0], at: m.index }); } if (!slots[VIS[i][0]]) { slots[VIS[i][0]] = 1; ns++; } } }
    return { tokens: tokens, slots: slots, nTokens: nt, nSlots: ns, list: list };
  }
  var DESC_TAIL = ['少女', '少年', '女性', '男性', '女の子', '男の子', 'の子', 'の人', 'の者', '子供', '子ども', '幽霊', '亡霊', '怨霊', '人影', '影法師', '化け物', '怪物', '妖怪'].concat(ROLE);
  var DESC_TAIL1 = ['女', '男', '娘', '霊', '影', '婆', '爺', '鬼'];
  function endsWith(s, t) { return s.length >= t.length && s.slice(s.length - t.length) === t; }
  /* ★mx3-b (review 中-2): occupation / role handles outside ROLE are descriptor-named (same list and suffix rule as the Worker's mxIsRoleish) */
  var ROLE2 = ['郵便配達員', '配達員', '担任', '隊長', '社長', '警備員', '司書', '船長', '村長', '町長', '市長', '少佐', '中佐', '大佐', '少尉', '中尉', '大尉', '軍曹', '用務員', 'クラスメイト', '同級生', '上級生', '下級生', '転校生', '黒服', '女子高生', '男子高生', '選手', '部長', '課長', '係長', '店員さん', 'ウェイトレス', 'ウェイター', 'バーテンダー', 'コック', 'シェフ', 'ガイド', 'パイロット', '運転士', '消防士', '弁護士', '博士', '助手', '秘書', '記者さん'];
  var RE_ROLE_SUF2 = new RegExp('[' + HAN + KATA + '][員係官師士者]$'), RE_ROLE_SUF3 = new RegExp('[' + HAN + KATA + '][長生手]$');
  function isRoleish(nk) { for (var i = 0; i < ROLE2.length; i++) if (nk.length >= ROLE2[i].length && endsWith(nk, ROLE2[i])) return true; return (nk.length >= 2 && RE_ROLE_SUF2.test(nk)) || (nk.length >= 3 && RE_ROLE_SUF3.test(nk)); }
  function isDesc(nk) {
    if (isRoleish(nk)) return true;
    for (var i = 0; i < DESC_TAIL.length; i++) if (nk.length > DESC_TAIL[i].length && endsWith(nk, DESC_TAIL[i])) return true;
    for (var j = 0; j < DESC_TAIL1.length; j++) if (nk.length > 1 && endsWith(nk, DESC_TAIL1[j]) && !RE_HK.test(nk.charAt(nk.length - 2))) return true;
    return vis(nk).nTokens > 0;
  }
  var RE_FEM = /(?:女子高生|女医|婦警|女|女性|女の子|娘|婆|婆さん|老婆|巫女|尼|尼僧|シスター|女将|魔女|姫|王女|女中|侍女|メイド|母|母親|姉|妹|祖母|妻|嫁|看護婦)$/;
  var RE_MASC = /(?:男|少年|男性|男の子|爺|爺さん|老爺|神主|宮司|禰宜|住職|和尚|僧|神父|牧師|王子|執事|父|父親|兄|弟|祖父|息子|夫)$/;
  function tailGender(nk) { return RE_FEM.test(nk) ? '女性' : RE_MASC.test(nk) ? '男性' : ''; }
  var COL_FOLD = { navy: 'black', white: 'light', silver: 'light', grey: 'light', gray: 'light', golden: 'blonde', blond: 'blonde', blonde: 'blonde', yellow: 'blonde', chestnut: 'brown', auburn: 'red' };
  function colF(c) { var x = String(c || '').toLowerCase(); return COL_FOLD[x] || x; }
  var RE_HC_JP = new RegExp('(' + COLOR_ALT + ')(?:色の|色い|色|い|の)?髪(?!交じり|混じり)', 'g');
  var HC_JP2 = [[/白髪/, 'light'], [/銀髪/, 'light'], [/金髪|ブロンド/, 'blonde'], [/茶髪|栗色の髪/, 'brown'], [/赤髪|赤毛/, 'red']];
  var RE_HC_EN = /\b(black|navy|white|silver|grey|gray|golden|blonde?|yellow|brown|chestnut|auburn|red|blue|pink|purple|green)\b[^,.;]{0,16}?\bhair\b/gi;
  var HL = [[/長髪|ロングヘア|髪が長|髪の長|長い[^、。]{0,4}髪|\blong\b[^,.;]{0,16}\bhair\b/i, 'long'], [/セミロング|肩まで[^、。]{0,4}髪|shoulder[- ]length/i, 'mid'],
    [/短髪|ショートヘア|髪が短|髪の短|短い[^、。]{0,4}髪|おかっぱ|\bshort\b[^,.;]{0,16}\bhair\b|\bbob\b/i, 'short'], [/丸坊主|スキンヘッド|禿頭|坊主頭|\bbald\b/i, 'bald']];
  function axes(text) {
    var t = (typeof text === 'string') ? text : '', hc = {}, hl = {}, g = {}, m;
    RE_HC_JP.lastIndex = 0; while ((m = RE_HC_JP.exec(t))) { var en = COLOR_EN[m[1]]; if (en) hc[colF(en)] = 1; }
    for (var i = 0; i < HC_JP2.length; i++) if (HC_JP2[i][0].test(t)) hc[HC_JP2[i][1]] = 1;
    RE_HC_EN.lastIndex = 0; while ((m = RE_HC_EN.exec(t))) hc[colF(m[1])] = 1;
    for (var j = 0; j < HL.length; j++) if (HL[j][0].test(t)) hl[HL[j][1]] = 1;
    if (/\b(?:woman|girl|lady|female)\b/i.test(t)) g['女性'] = 1; if (/\b(?:man|boy|male|gentleman)\b/i.test(t)) g['男性'] = 1;
    var one = function (o) { var k = Object.keys(o); return k.length === 1 ? k[0] : null; };
    return { g: one(g), hc: one(hc), hl: one(hl) };
  }
  var NEXT_HIRA_OK = /[がはをにのとへもやでさちくよねかっ]/, PREV_HIRA_OK = /[はがをにのとへもやで]/, HONOR1 = /[様君殿]/;
  function boundaryOk(s, i, f) {
    var nx = s.charAt(i + f.length), pv = i > 0 ? s.charAt(i - 1) : '', fl = f.charAt(f.length - 1), ff = f.charAt(0);
    if (nx) { if (RE_HK.test(nx) && !HONOR1.test(nx) && (RE_HK.test(fl) || RE_HIRA.test(fl))) return false; if (RE_HIRA.test(fl) && RE_HIRA.test(nx) && !NEXT_HIRA_OK.test(nx)) return false; }
    if (pv) { if (RE_HK.test(ff) && RE_HK.test(pv)) return false; if (RE_HIRA.test(ff) && RE_HIRA.test(pv) && !PREV_HIRA_OK.test(pv)) return false; }
    return true;
  }
  var SEG_STOP = /[、。，．,.！？!?「」『』（）()…―—はがをにへもでとや]/;
  function insideLonger(s, i, f) {
    var pv = i > 0 ? s.charAt(i - 1) : ''; if (!pv || !(/[のいなた]/.test(pv) || RE_HK.test(pv))) return false;
    var j = i; while (j > 0 && i - j < 12 && !SEG_STOP.test(s.charAt(j - 1))) j--;
    var seg = s.slice(j, i); if (!seg) return false;
    return vis(seg + f).nTokens > vis(f).nTokens;
  }
  function hitsIn(s, f, desc) { var out = []; if (!f) return out; var i = s.indexOf(f); while (i >= 0) { if (boundaryOk(s, i, f) && !(desc && insideLonger(s, i, f))) out.push(i); i = s.indexOf(f, i + 1); } return out; }
  function sents(text) { return ((typeof text === 'string') ? text : '').split(/[。！？!?「」『』\n]+/).filter(Boolean); }
  var RECALL = /思い出|回想|あの時|あのとき|あの日|かつて|夢の中|夢で|噂|話に聞|記憶の中|あらすじ|これまでの|要約/;
  /* same text as the Worker loader (chrAv2LoadStoryMx): narrative + plan.narrative (tags removed), plan <say who>. No conversation-log who, no player input. */
  function flat(s) { return nfkc(String(s)).replace(/\r?\n+/g, '。').replace(/[\s・·\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]+/g, ''); }
  function turnsOf(S) {
    return (Array.isArray(S.turns) ? S.turns : []).map(function (t) {
      if (!t || typeof t !== 'object') return { text: '', says: [], conv: [] };
      var pn = (t.plan && Array.isArray(t.plan.narrative)) ? t.plan.narrative.filter(function (x) { return typeof x === 'string'; }).join('\n') : '';
      var says = [], re = /<say\s+who="([^"]{1,80})"/g, m; while ((m = re.exec(pn))) { var w = flat(m[1]); if (w && says.indexOf(w) < 0) says.push(w); }
      var conv = []; if (Array.isArray(t._convSays)) t._convSays.forEach(function (c) { var w = c && typeof c.who === 'string' ? flat(c.who) : ''; if (w && conv.indexOf(w) < 0) conv.push(w); });   /* ★mx3-g: conversation-log speakers (importance 中 only) */
      return { text: flat([typeof t.narrative === 'string' ? t.narrative : '', pn.replace(/<[^>]{0,200}>/g, '')].join('\n')), says: says, conv: conv };
    });
  }
  function evidence(T, forms, desc) {
    var n = T.length, turns = 0, sayTurns = 0, last = -1, win = [], near = [], hitS = [];
    T.forEach(function (t, i) {
      var says = t.says.map(norm), say = forms.some(function (f) { return says.indexOf(f) >= 0; }), hit = say, ss = sents(t.text);
      ss.forEach(function (s, si) {
        if (desc && RECALL.test(s)) return; var here = false;
        forms.forEach(function (f) { hitsIn(s, f, desc).forEach(function (p) { hit = here = true; win.push(s.slice(Math.max(0, p - 30), p + f.length + 30)); }); });
        if (here) { near.push(s.slice(0, 80)); near.push((ss[si + 1] || '').slice(0, 40)); hitS.push(s.slice(0, 120)); }
      });
      if (hit) { turns++; last = i; } if (say) sayTurns++;
    });
    var recent = last >= 0 && last >= n - 3, need = desc ? 3 : 2;
    return { ok: recent && turns >= need, t: turns, s: sayTurns, recent: recent, need: need, win: win, near: near, hitS: hitS };
  }
  /* ---------- the story's registered characters (canonical-derived local state) ---------- */
  function castOf(S) {
    var c = S.cast || {}, out = [];
    var take = function (e, hero) { if (!e || typeof e !== 'object' || typeof e.character_id !== 'string') return; var p = (e.profile && typeof e.profile === 'object') ? e.profile : {};
      out.push({ character_id: e.character_id, status: e.status === 'DELETED' ? 'DELETED' : 'ACTIVE', name: typeof e.name === 'string' ? e.name : '', hero: !!hero, profile: p, sap: e.source_appearance_present === true, rg: (e.gender === '女性' || e.gender === '男性') ? e.gender : ((p.gender === '女性' || p.gender === '男性') ? p.gender : '') }); };   /* ★W-MXREG: + sap ★MXREGFIX1: + rg = 登録の性別 */
    take(c.hero, true); (Array.isArray(c.npcs) ? c.npcs : []).forEach(function (n) { take(n, false); });
    return out;
  }
  function bindingsOf(S) { var a = S.cast && S.cast.av2; var b = (a && a.bindings && typeof a.bindings === 'object') ? a.bindings : {}; var o = {}; for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k) && typeof b[k] === 'string') o[k] = b[k]; return o; }
  function identityA(cast, bindings, forms) {   /* A: same name / contains / contained (1-char names: 名前＋敬称 / 名前＋の) */
    var names = []; cast.forEach(function (c) { if (c.name) names.push([c.name, c.character_id]); }); Object.keys(bindings).forEach(function (b) { names.push([b, bindings[b]]); });
    var honor1 = new RegExp('^(?:' + HONOR_SRC + '|の)');
    for (var i = 0; i < names.length; i++) { var n = norm(names[i][0]); if (!n) continue;
      for (var j = 0; j < forms.length; j++) { var f = forms[j];
        if (n === f) return { why: 'SAME_NAME', character_id: names[i][1] };
        if (n.length === 1) { if (f.indexOf(n) === 0 && honor1.test(f.slice(1))) return { why: 'CONTAINS_NAME', character_id: names[i][1] }; continue; }
        if (f.indexOf(n) >= 0 || n.indexOf(f) >= 0) return { why: 'CONTAINS_NAME', character_id: names[i][1] }; } }
    return null;
  }
  /* ★mx3-b: apposition = the handle IS a registered character (「郵便配達員の佐伯透」「佐伯透は郵便配達員だ」) → A. Same rule as the Worker's mxApposition. */
  var APPO_PRE = ['', 'の', 'である', '、', '・', '＝', 'こと'], APPO_MID = ['は', 'が', 'という', 'って', '、', 'も'], APPO_END = /^(?:だ|です|である|で|、|$)/;
  function apposition(cast, bindings, T, forms, others) {   /* others: optional [[normalised name, id]] (extras / other roster names) */
    var ns = [];
    if (others) ns = others.slice();
    else { cast.forEach(function (c) { if (c.status !== 'DELETED' && c.name) ns.push([norm(c.name), c.character_id]); });
      Object.keys(bindings).forEach(function (b) { ns.push([norm(b), bindings[b]]); }); }
    ns = ns.filter(function (x) { return x[0] && x[0].length >= 2; });
    for (var t = 0; t < T.length; t++) { var ss = sents(T[t].text);
      for (var si = 0; si < ss.length; si++) { var s = ss[si];
        for (var fi = 0; fi < forms.length; fi++) { var f = forms[fi]; if (!f || s.indexOf(f) < 0) continue;
          for (var ni = 0; ni < ns.length; ni++) { var n = ns[ni][0]; if (n === f || s.indexOf(n) < 0) continue;
            for (var pi = 0; pi < APPO_PRE.length; pi++) { var sep = APPO_PRE[pi], i0 = s.indexOf(f + sep + n); if (i0 >= 0 && boundaryOk(s, i0, f) && boundaryOk(s, i0 + f.length + sep.length, n)) return ns[ni][1]; }
            var i = s.indexOf(n); while (i >= 0) { var r = s.slice(i + n.length); for (var mi = 0; mi < APPO_MID.length; mi++) { var mid = APPO_MID[mi]; if (r.indexOf(mid + f) === 0 && APPO_END.test(r.slice(mid.length + f.length))) return ns[ni][1]; } i = s.indexOf(n, i + 1); } } } } }
    return null;
  }
  var REVEAL = /正体|だった|こそ|という名|と名乗|名は|本人|同一|同じ人/;
  function descIdentity(cast, bindings, T, forms, da, ua) {
    for (var i = 0; i < cast.length; i++) { var c = cast[i]; if (c.status === 'DELETED') continue;
      var p = c.profile || {}, ra = axes(typeof p.appearance === 'string' ? nfkc(p.appearance) : ''), rg = (p.gender === '女性' || p.gender === '男性') ? p.gender : ra.g;
      if (ua.g && rg && ua.g === rg && ua.hc && ra.hc && ua.hc === ra.hc && ua.hl && ra.hl && ua.hl === ra.hl) return { cls: 'C', why: 'APPEARANCE_MATCH', character_id: c.character_id };
      if ((da.g && rg && da.g !== rg) || (da.hc && ra.hc && da.hc !== ra.hc) || (da.hl && ra.hl && da.hl !== ra.hl)) continue;
      var nm = [c.name].concat(Object.keys(bindings).filter(function (k) { return bindings[k] === c.character_id; })).map(norm).filter(function (x) { return x && x.length >= 2; });
      var co = false;
      for (var t = 0; t < T.length && !co; t++) { var says = T[t].says.map(norm);
        if (forms.some(function (f) { return says.indexOf(f) >= 0; }) && nm.some(function (x) { return says.indexOf(x) >= 0; })) { co = true; break; }
        var ss = sents(T[t].text);
        for (var s = 0; s < ss.length; s++) { if (REVEAL.test(ss[s])) continue; if (forms.some(function (f) { return hitsIn(ss[s], f, true).length; }) && nm.some(function (x) { return hitsIn(ss[s], x, false).length; })) { co = true; break; } } }
      if (!co) return { cls: 'C', why: 'UNRESOLVED', character_id: c.character_id };
    }
    return { cls: 'B' };
  }
  var TRAIT_CUE = { pale: /青白|蒼白|血の気の(?:ない|無い|失せた)|土気色/, hollow_eyes: /(?:うつろ|虚ろ)な(?:目|瞳)|空洞の(?:目|瞳)|目の(?:ない|無い)|穴のような目/,
    translucent: /透け|透き通|半透明|向こうが見え/, wet_hair: /濡れた髪|髪が濡れ|ずぶ濡れ|水が滴|雫が/, hair_over_face: /髪で顔|顔を髪|髪に隠れ|前髪で顔|顔が見えな/,
    lifeless: /生気の(?:ない|無い)|生気が|無表情|表情の(?:ない|無い)/, eye_glow: /目が(?:赤く|妖しく|ぼうっと)?光|光る目|眼光|目だけが光/, dark_haze: /黒い(?:靄|もや|霧|煙)|闇をまと|靄をまと|もやをまと/ };
  var NONHUMAN_CUE = /角|尻尾|鱗|牙|爪|獣|狐|狸|鬼|妖|化け|触手|翼|蛇|蜘蛛|人ならざる|人ではな|異形|けもの/;
  function kindOf(cue) {
    if (NONHUMAN_CUE.test(cue) && /妖怪|妖狐|狐|狸|鬼|天狗|河童|獣の耳|狐耳|尻尾/.test(cue)) return 'yokai';
    if (NONHUMAN_CUE.test(cue) && /化け物|怪物|異形|触手|蜘蛛|蛇/.test(cue)) return 'creature';
    if (/幽霊|亡霊|怨霊|霊|透け|透き通|半透明|この世のもの/.test(cue)) return 'spirit';
    if (/影法師|人影|黒い影/.test(cue)) return 'shadow';
    return 'human';
  }
  /* image-only appearance: look words found in the text near the handle (+ the roster's appearance words), above-the-chest wording (DESIGN §4). No free sentence. */
  var BELOW = /裸足|素足|スカート|ズボン|靴|ブーツ|草履|下駄|足袋|サンダル/;
  var CHEST = [[/緋袴/g, '白い小袖に赤い襟元の巫女装束']];
  function appearanceFrom(texts) {
    var seen = {}, out = [];
    texts.forEach(function (tx) {
      vis(tx, true).list.sort(function (a, b) { return a.at - b.at; }).forEach(function (x) {
        var w = x.w; if (BELOW.test(w)) return;
        for (var i = 0; i < CHEST.length; i++) w = w.replace(CHEST[i][0], CHEST[i][1]);
        if (seen[w]) return; seen[w] = 1; out.push(w);
      });
    });
    out = out.filter(function (w) { return !out.some(function (o) { return o !== w && o.indexOf(w) >= 0; }); });   /* 黒髪 inside 長い黒髪 */
    return out.join('、').slice(0, 400);
  }

  /* ---------- small device record (no names: a handle is kept only as a hash) ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }   /* UTC day = the Worker's write_quota day */
  function hk(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return 'h' + h.toString(36); }
  function rec() { var r = null; try { r = JSON.parse(lsGet(LSK) || 'null'); } catch (e) { r = null; } if (!r || r.v !== 1) r = { v: 1, day: today(), acct: 0, st: {} }; if (r.day !== today()) { r.day = today(); r.acct = 0; r.tr = {}; /* ★mx3-c: day trace */ for (var k in r.st) if (r.st[k]) { r.st[k].d = 0; if (r.st[k].stopDay) delete r.st[k].stop, delete r.st[k].stopDay; } } return r; }
  function recSave(r) { var ks = Object.keys(r.st); if (ks.length > 40) ks.slice(0, ks.length - 40).forEach(function (k) { delete r.st[k]; }); lsSet(LSK, JSON.stringify(r)); }
  function stOf(r, id) { if (!r.st[id]) r.st[id] = { d: 0, h: {} }; if (!r.st[id].h) r.st[id].h = {}; return r.st[id]; }

  /* ---------- extras (memory only) ---------- */
  var X = { story: null, extras: [], turnCount: null, at: 0, listed: false, stopped: null, claimTried: {}, lastTurnSeen: -1, lastChange: 0, doneTurn: -1, busy: false, started: false, lastRegOk: null, pageStop: null, last: null, initListAsked: false,
    played: {}, seen: {}, seenN: 0, alias: {}, caps: null, mmRetry: {}, mmWait: 0, noCand: null, rosRetry: {} };   /* ★mx3-e: mmRetry[n] = the one re-run of turn n was used; mmWait = not before */   /* ★mx3-c: played[n] = turn n was played on this page (+1 turn with content never seen on this page); seen = content hashes; alias = hash(handle) → extra_id; caps = the Worker's settings */
  function setExtras(id, j) {
    if (!j || !Array.isArray(j.extras)) return;
    X.story = id; X.at = Date.now(); X.listed = true; X.turnCount = (typeof j.turn_count === 'number') ? j.turn_count : null;
    if (j.caps && typeof j.caps === 'object') { var cp = {}; Object.keys(CAP).forEach(function (k) { var v = j.caps[k]; if (typeof v === 'number' && v >= 0 && v === Math.floor(v)) cp[k] = v; }); X.caps = cp; }   /* ★mx3-c: follow the Worker's cap settings */
    X.extras = j.extras.filter(function (e) { return e && typeof e.extra_id === 'string' && MX_ID_RE.test(e.extra_id) && typeof e.asset_id === 'string' && typeof e.handle === 'string'; })
      .map(function (e) { return { extra_id: e.extra_id, handle: e.handle, vars: Array.isArray(e.vars) ? e.vars.filter(function (v) { return typeof v === 'string'; }).slice(0, 3) : [], cls: e.cls === 'desc' ? 'desc' : 'named',
        kind: e.kind || null, ga: e.ga === 1, asset_id: e.asset_id, claimed_by: (typeof e.claimed_by === 'string' && !MX_ID_RE.test(e.claimed_by)) ? e.claimed_by : null, claim_state: e.claim_state || null,
        forms: [norm(e.handle)].concat((Array.isArray(e.vars) ? e.vars : []).map(norm)).filter(Boolean) }; });
    notifyPortrait();
  }
  function capOf(k) { var v = X.caps && X.caps[k]; return (typeof v === 'number') ? v : CAP[k]; }   /* ★mx3-c */
  function notifyPortrait() { try { var P = root.__chronicleAv2Portrait; if (P && typeof P.extrasChanged === 'function') P.extrasChanged(); } catch (e) {} }
  function extraFor(storyId, label) {   /* read only — portrait.js asks; the src is set there */
    if (killed() || !X.listed || X.story !== String(storyId || '')) return null;
    var n = norm(String(label == null ? '' : label)); if (!n) return null;
    for (var i = 0; i < X.extras.length; i++) if (X.extras[i].forms.indexOf(n) >= 0) { var e = X.extras[i]; if (e.ga && rosterCount(e.handle) > 1) return null; /* ★iconx1 A: a generic-word picture is shown only while the roster has one figure of that word */ return { extra_id: e.extra_id, asset_id: e.asset_id, handle: e.handle, claimed_by: e.claimed_by, claim_state: e.claim_state, cls: e.cls }; }
    try { var at = (typeof root.__v292AliasFix === 'function') ? root.__v292AliasFix(String(label)) : null; if (typeof at === 'string' && at && at !== label) { var an = norm(at);   /* ★mx3-e: the label is an alias of a speaker name that has an extra (any device) */
        if (an && an.length >= 2 && endsWith(n, an)) for (var k2 = 0; k2 < X.extras.length; k2++) if (X.extras[k2].forms.indexOf(an) >= 0) { var e3 = X.extras[k2]; return { extra_id: e3.extra_id, asset_id: e3.asset_id, handle: e3.handle, claimed_by: e3.claimed_by, claim_state: e3.claim_state, cls: e3.cls, alias: true }; } } } catch (e) {}
    var al = X.alias[hk(n)];   /* ★mx3-c: a renamed figure the Worker mapped to an existing extra (409 EXTRA_*) shows that extra's picture */
    if (al) for (var j = 0; j < X.extras.length; j++) if (X.extras[j].extra_id === al) { var e2 = X.extras[j]; return { extra_id: e2.extra_id, asset_id: e2.asset_id, handle: e2.handle, claimed_by: e2.claimed_by, claim_state: e2.claim_state, cls: e2.cls, alias: true }; }
    return null;
  }

  /* ---------- transport (fix697 dedicated port only) ---------- */
  function call(op, args, cb) { var f = F697(); if (!f || typeof f.assetV2Mx !== 'function') { cb(null, 'NO_PORT'); return; } try { f.assetV2Mx(op, args, cb); } catch (e) { cb(null, 'PORT_THREW'); } }
  function listOnce(id, cb) {
    stats.list++;
    call('portrait.mx_list', { story_id: id }, function (r, err) {
      var j = r && r.j;
      if (err || !r || r.status !== 200 || !j || !Array.isArray(j.extras)) { stats.listFail++; var code = err || (j && (j.errorCode || j.error)) || ('HTTP_' + (r && r.status)); note({ kind: 'LIST_FAIL', code: code, http: r && r.status });
        if (r && (r.status === 403 || r.status === 404 || r.status === 501)) X.stopped = 'LIST_' + r.status + ':' + String(code).slice(0, 24);   /* not enabled / Vault / not schema 2 / kill → stop for this page */
        cb(null, code); return; }
      setExtras(id, j); note({ kind: 'LIST_OK', n: X.extras.length, tc: X.turnCount }); cb(j, null);
    });
  }

  /* ---------- candidate selection (the r2 Worker rules, checked first on the device) ---------- */
  function rosterSig() { try { return hk(rosterOf().map(function (e) { return e ? String(e.handle) + ':' + String(e.importance || '') + ':' + String(e.lastTurn) : ''; }).join('|')); } catch (e) { return 'x'; } }   /* ★OLDMX1: hash only, memory only */
  function rosterOf() { try { var R = root.__v292Dfix307api; var a = (R && typeof R.loadRoster === 'function') ? R.loadRoster() : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  /* ★mx3-b (review 中-1): fix641 dryRun().promoted is an array of NAME STRINGS. Exclude those names ONLY when fix641 really registers (live mode:
     not killed, v292Dfix641Live='1' — its own live() rule, read only). In the default dryRun mode nobody will register them, so they stay candidates. */
  function f641Live() { try { var P = root.__v292Dfix641; if (!P || !P.__armed || (typeof P.isOff === 'function' && P.isOff())) return false; return lsGet('v292Dfix641Live') === '1'; } catch (e) { return false; } }
  function promotedSoon() { var o = {}; if (!f641Live()) return o; try { var P = root.__v292Dfix641; if (P && typeof P.dryRun === 'function') { var r = P.dryRun(); (r && Array.isArray(r.promoted) ? r.promoted : []).forEach(function (x) { var nm = (typeof x === 'string') ? x : (x && (x.name || x.n)); if (nm) o[norm(nm)] = 1; }); } } catch (e) {} return o; }
  /* ★mx3-b: fix640 resolved this role word to a registered name → A (read only) */
  function roleResolvedTo(handle) { try { var L = root.__v292Dfix640; var w = L && typeof L.why === 'function' ? L.why(handle) : null; return (w && typeof w.resolvedTo === 'string' && w.resolvedTo) ? w.resolvedTo : null; } catch (e) { return null; } }
  /* ★mx3-e: where does __v292AliasFix send this handle? registered = the target is a registered character (name / binding / contains) → A.
     usable = an unregistered name that is the TAIL of the handle (郵便屋のトマス → トマス), ≥2 letters, not generic / role / descriptor → send it as the handle. */
  function aliasInfo(key, nk, cast, bindings) { var t = null; try { t = (typeof root.__v292AliasFix === 'function') ? root.__v292AliasFix(key) : null; } catch (e) { t = null; }
    if (typeof t !== 'string' || !t || t === key) return null; var tnk = norm(t); if (!tnk || tnk === nk) return null;
    var reg = !!identityA(cast, bindings, [tnk]) || Object.prototype.hasOwnProperty.call(bindings, t);
    var usable = !reg && tnk.length >= 2 && endsWith(nk, tnk) && !generic(tnk) && !isDesc(tnk) && !isRoleish(tnk);
    return { target: dispKey(t) || t, tnk: tnk, registered: reg, usable: usable }; }
  function aliasOfRegistered(h) { try { return typeof root.__v292AliasFix === 'function' && root.__v292AliasFix(h) !== h; } catch (e) { return false; } }
  function fold(s) { try { var R = root.__v292Dfix307api; if (R && typeof R.fkey764 === 'function') return String(R.fkey764(s)); } catch (e) {} return norm(s); }
  var PERSONISH = /人物|怪異|霊|幽霊|亡霊|妖怪|人|女|男|少女|少年|化け物|怪物|影/, NOT_PERSON = /現象|物体|場所|風景|景色|液体|物音|背景|動物|^物$|^物品/;
  function select(S, r, id, rosterOverride) {
    var T = turnsOf(S), cast = castOf(S), bindings = bindingsOf(S), hero = cast.filter(function (c) { return c.hero; })[0];
    var ros = Array.isArray(rosterOverride) ? rosterOverride : rosterOf(), soon = promotedSoon(), so = stOf(r, id), out = { picked: null, considered: [] };
    var descN = X.extras.filter(function (e) { return e.cls === 'desc'; }).length;
    var castFold = {}; cast.forEach(function (c) { if (c.name) castFold[fold(c.name)] = 1; }); Object.keys(bindings).forEach(function (b) { castFold[fold(b)] = 1; });
    var hs = ros.filter(function (e) { return e && typeof e.handle === 'string' && (String(e.importance || '') === '高' || String(e.importance || '') === '中') && !NOT_PERSON.test(String(e.kind || '人物')) && PERSONISH.test(String(e.kind || '人物')); });
    var forms = hs.map(function (e) { return { e: e, key: dispKey(e.handle) || gaKey1(e.handle), nk: norm(e.handle) }; }).filter(function (x) { return x.key && (x.nk.length >= 2 || GA_OK[x.nk] === 1); });   /* ★iconx1 A: a 1-letter figure word (女・男・影・鬼・霊) only with mxgen1 */
    /* longest roster form: a form that is a suffix of a longer one becomes its variant (≤3, must carry a look word, not generic) */
    var cands = [];
    forms.forEach(function (x) {
      if (forms.some(function (o) { return o !== x && o.nk.length > x.nk.length && endsWith(o.nk, x.nk); })) return;
      var vars = forms.filter(function (o) { return o !== x && o.nk.length < x.nk.length && endsWith(x.nk, o.nk) && !generic(o.nk) && vis(o.nk).nTokens > 0; }).map(function (o) { return o.nk; }).slice(0, 3);
      cands.push({ e: x.e, key: x.key, nk: x.nk, vars: vars });
    });
    var C = [];
    cands.forEach(function (c) {
      var al = aliasInfo(c.key, c.nk, cast, bindings), disp = null;   /* ★mx3-e */
      if (al && al.usable && !isDesc(c.nk)) { disp = c.key; c = { e: c.e, key: al.target, nk: al.tnk, vars: [] }; stats.aliasSpeaker++; }
      var why = null, desc = isDesc(c.nk), f = [c.nk].concat(c.vars), ev = null, mid = String(c.e.importance || '') === '中';   /* ★mx3-g (GPT #127-QW): 中 needs speaks-in-latest-turn + look word + ≥2 turns */
      var TT = mid ? T.map(function (t) { return { text: t.text, says: t.says.concat(t.conv || []), conv: t.conv }; }) : T;
      var ga = generic(c.nk) ? gaOk(c) : false; if (ga) desc = true;   /* ★iconx1 A */
      if (generic(c.nk) && !ga) why = gaWhyLast || 'GENERIC';
      else if (so.h[hk(c.nk)]) why = 'NO_RETRY:' + so.h[hk(c.nk)];
      else if (so.ak && so.ak[hk(c.nk)]) why = 'ALIAS_OF_EXTRA';   /* ★mx3-c: the Worker said this handle is an existing extra (renamed / revealed) */
      else if (hero && norm(hero.name) === c.nk) why = 'HERO';
      else if (identityA(cast, bindings, f)) why = 'A_REGISTERED';
      else if (apposition(cast, bindings, T, f)) why = 'A_APPOSITION';
      else if (roleResolvedTo(c.key) && identityA(cast, bindings, [norm(roleResolvedTo(c.key))])) why = 'A_ROLE_RESOLVED';
      else if (al && al.registered) { why = 'A_ALIAS'; stats.aliasRegistered++; }   /* ★mx3-e: only a REGISTERED target is the same person (was: any alias) */
      else if (castFold[fold(c.key)]) why = 'A_FOLD';
      else if (soon[c.nk]) why = 'FIX641_SOON';
      else if (X.extras.some(function (x) { return x.forms.some(function (a) { return f.some(function (b) { return a.length >= 2 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); }); }); })) why = 'EXTRA_EXISTS_OR_OVERLAP';
      else if (apposition(cast, bindings, T, f, [].concat.apply([], X.extras.map(function (x) { return x.forms.map(function (n) { return [n, x.extra_id]; }); })))) why = 'EXTRA_APPOSITION';
      else if (desc && apposition(cast, bindings, T, f, cands.filter(function (o) { return o !== c && !isDesc(o.nk); }).map(function (o) { return [o.nk, o.nk]; }))) why = 'APPOSED_TO_NAMED';   /* the proper-named form wins; the role form is the same person */
      else if (desc && (descN >= capOf('storyDesc') || so.descStop)) why = 'CAP_DESC';
      else { ev = ga ? gaEvidence(T, c.nk, c.gaA.all, String(c.e.appr || '')) : evidence(TT, f, desc); if (!ev.ok) why = 'EVIDENCE:' + ev.t + '/' + ev.need + (ev.recent ? '' : ':old');
        else if (ga ? !ev.latest : lastHitOf(TT, f, desc) !== T.length - 1) why = 'NOT_IN_LATEST';
        else if (ga && ev.multi) why = 'GA_MULTI';   /* ★iconx1 A: maybe two people under one word */
        else if (ga && ev.conflict) why = 'GA_CONFLICT';
        else if (mid && !ga && !speaksLatest(T, f, c.key, disp)) why = 'MID_NOT_SPEAKING';   /* ★mx3-g */   /* ★mx3-c (GPT #127-QM): only a figure of the turn just played */
        else if (so.ny && typeof so.ny[hk(c.nk)] === 'number' && ev.t <= so.ny[hk(c.nk)]) why = 'NOT_YET_WAIT';   /* ★mx3-c: the Worker said not yet; ask again only when it appeared in more turns */ }
      var row = { nk: c.nk, desc: desc, why: why, t: ev ? ev.t : null }; if (disp) row.alias = 1;
      if (!why) {
        var cue = [c.nk].concat(c.vars, ev.near).join('。');
        var app = appearanceFrom(ev.hitS.concat([String(c.e.appr || '')]));   /* only the sentences that name the figure (not the next sentence) + the roster's appearance */
        var nha = nhApp([String(c.e.appr || '')].concat(ev.hitS), c.e.kind); if (nha) app = nha.app;   /* ★iconx1 B: non-human / mixed → the labeled appearance */
        var ts = slotsU(cue), as = slotsU(app), both = Object.keys(as).filter(function (s) { return ts[s]; });
        if (!app) row.why = 'NO_LOOK';
        else if (!desc && !both.length) row.why = 'FEW_FEATURES_NAMED';   /* ★mx3-c: = the Worker (a look clue in the text AND in the image-only appearance) */
        else if (desc && (both.length < 2 || !both.some(function (s) { return s !== 'hair'; }))) row.why = 'FEW_FEATURES:' + both.sort().join('+');
        else {
          var kind = nha ? nha.kind : kindOf(cue), gender = tailGender(c.nk) || (/女性|少女|女の子|彼女|の女|老婆|娘/.test(String(c.e.appr || '')) ? '女性' : /男性|少年|男の子|の男|老人/.test(String(c.e.appr || '')) ? '男性' : '');
          if (desc) {
            var hx = axes(f.join('。')), wx = axes(ev.win.join('。')), da = { g: tailGender(c.nk) || hx.g, hc: hx.hc || wx.hc, hl: hx.hl || wx.hl };
            var ax = axes(app), ag = gender || ax.g;
            if ((da.g && ag && da.g !== ag) || (da.hc && ax.hc && da.hc !== ax.hc) || (da.hl && ax.hl && da.hl !== ax.hl)) row.why = 'APPEARANCE_CONFLICT';
            else { var di = descIdentity(cast, bindings, T, f, da, { g: da.g || ag, hc: da.hc || ax.hc, hl: da.hl || ax.hl }); if (di.cls !== 'B') row.why = 'IDENTITY_' + di.cls + ':' + di.why; }
          }
          if (!row.why) {
            var traits = []; if (kind !== 'human') Object.keys(TRAIT_CUE).forEach(function (k) { if (traits.length < 4 && TRAIT_CUE[k].test(cue)) traits.push(k); });
            C.push({ disp: disp, key: c.key, nk: c.nk, vars: ga ? [] : c.vars, desc: desc, last: ev ? T.length : 0, t: ev.t, lastHit: ga ? T.length - 1 : lastHitOf(T, f, desc), appearance: app, gender: gender, kind: kind, traits: traits }); if (ga) C[C.length - 1].ga = 1;
          }
        }
      }
      out.considered.push(row);
    });
    C.sort(function (a, b) { return (b.lastHit - a.lastHit) || (b.t - a.t) || (a.nk < b.nk ? -1 : 1); });
    out.picked = C[0] || null;
    return out;
  }
  /* ★mx3-g: does a form speak in the latest turn? speaker = plan <say who> or conversation-log who, matched by the form, or through __v292AliasFix (either direction) */
  function speaksLatest(T, f, key, disp) {
    var t = T[T.length - 1]; if (!t) return false; var sp = (t.says || []).concat(t.conv || []); if (!sp.length) return false;
    var tg = []; [key, disp].forEach(function (h) { if (!h) return; try { var a = (typeof root.__v292AliasFix === 'function') ? root.__v292AliasFix(h) : null; if (typeof a === 'string' && a) tg.push(norm(a)); } catch (e) {} });
    return sp.some(function (w) { var n = norm(w); if (f.indexOf(n) >= 0 || tg.indexOf(n) >= 0) return true;
      var a2 = null; try { a2 = (typeof root.__v292AliasFix === 'function') ? root.__v292AliasFix(w) : null; } catch (e) {}
      var an = (typeof a2 === 'string' && a2) ? norm(a2) : ''; return !!an && f.indexOf(an) >= 0; });
  }
  function lastHitOf(T, f, desc) { for (var i = T.length - 1; i >= 0; i--) { var says = T[i].says.map(norm); if (f.some(function (x) { return says.indexOf(x) >= 0; })) return i; var ss = sents(T[i].text); for (var s = 0; s < ss.length; s++) { if (desc && RECALL.test(ss[s])) continue; if (f.some(function (x) { return hitsIn(ss[s], x, desc).length; })) return i; } } return -1; }

  /* ---------- ★W-MXREG (laneWMXREG 2026-11-08 · GPT #127-RI ② · Owner: every account, switched by the admin key mxreg1) ----------
     A REGISTERED NPC (opening speaker / 「NPCに昇格」/ fix641) that has no picture and no confirmed profile, seen in the turn just played under the MIDICON rules
     (2 turns, 3 for a descriptor name; the newest turn; a look word in the text AND in the image-only appearance) → portrait.mx_ensure WITH its character_id.
     The Worker re-checks everything (the id belongs to this account + story, no pointer / candidate / confirmed profile, evidence, caps, imgsafe, extras)
     and writes only the picture + that character's pointer (never the profile). Only when there is no unregistered candidate this turn (1 picture per turn).
     The device keeps per-story hashes of 'r:' + character_id → reason (no names, no ids in clear). kill: localStorage v292DfixMIDICONregOff='1'. */
  function explicitN(p) {   /* = the Worker's explicitCount: a confirmed profile goes to ensure_first (explicit), never here */
    p = (p && typeof p === 'object') ? p : {}; var n = 0, t = function (v) { return typeof v === 'string' && v.replace(/\s+/g, '') !== ''; };
    if (p.gender === '女性' || p.gender === '男性') n++; if (t(p.ageBand)) n++; if (t(p.species) && String(p.species).trim() !== 'HUMAN') n++;
    if (p.traits && typeof p.traits === 'object' && !Array.isArray(p.traits)) { for (var k in p.traits) if (Object.prototype.hasOwnProperty.call(p.traits, k) && t(k) && t(p.traits[k])) { n++; break; } }
    if (t(p.appearance)) n++; return n;
  }
  var REG_F = /女性|少女|女の子|彼女|の女|老婆|娘/, REG_M = /男性|少年|男の子|の男|老人|彼は|彼が/;
  /* ★MXREGFIX1（laneICONFIX2・2026-11-14・本番 I6: 登録の性別が男性の「源蔵」に若い女性の絵）:
     原因 ① 登録の性別を読まず、名前の出た文の語（の女・彼女…）だけで性別を決めていた ② 名前の出た文にある見た目の語を、だれの物かを見ずに全部その人物の外見にしていた。
     直し ① 登録の性別があればそれを使う（本文の語で変えない） ② 見た目の語は、その文の中で「その人物の名前」に掛かるものだけ拾う（直後の別の人物・反対の性別の語に掛かる句は拾わない）
          ③ 名前に掛かる年配の語（老人・老漁師・年老いた）があれば「老人」を外見に足す。kill: localStorage v292DfixMXREGFIX1Off='1' → 今までとバイト一致。 */
  function mxrOn() { return lsGet('v292DfixMXREGFIX1Off') !== '1'; }
  var MXR_PF = /少女|女性|女の子|老婆|彼女|娘|女/g, MXR_PM = /少年|男性|男の子|老人|老爺|青年|彼(?!女)|男/g, MXR_OLD = /老人|老漁師|老爺|老婆|老いた|年老い|老齢|ご老体/g;
  /* refs of one sentence: own name forms (own: 1), other characters' names and — when the registered gender is known — person words of the opposite gender (own: 0) */
  function mxrRefs(s, forms, desc, others, rg) {
    var out = [], add = function (at, len, own) { if (!out.some(function (r) { return at < r.end && at + len > r.at; })) out.push({ at: at, end: at + len, own: own }); };
    forms.forEach(function (f) { hitsIn(s, f, desc).forEach(function (p) { add(p, f.length, 1); }); });
    others.forEach(function (o) { if (!o || o.length < 2) return; var i = s.indexOf(o); while (i >= 0) { add(i, o.length, 0); i = s.indexOf(o, i + 1); } });
    if (rg) { var re = rg === '男性' ? MXR_PF : MXR_PM, m; re.lastIndex = 0; while ((m = re.exec(s))) add(m.index, m[0].length, 0); }
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  /* the owner of a phrase at [at, end): a ref that follows it in the same clause within 8 chars (長い黒髪の女 / 白い上着を着た女) — otherwise the last ref before it — otherwise the hit name itself */
  function mxrOwn(s, refs, at, end) {
    for (var i = 0; i < refs.length; i++) { var r = refs[i]; if (r.at >= end) { var gap = s.slice(end, r.at); if (gap.length <= 8 && !/[、，,]/.test(gap)) return r.own === 1; break; } }
    var prev = null; refs.forEach(function (r) { if (r.at < at) prev = r; });
    return prev ? prev.own === 1 : true;
  }
  function appearanceFromOwn(texts, forms, desc, others, rg) {
    var seen = {}, out = [], old = false;
    texts.forEach(function (tx) {
      var refs = mxrRefs(tx, forms, desc, others, rg), m; MXR_OLD.lastIndex = 0;
      while ((m = MXR_OLD.exec(tx))) if (mxrOwn(tx, refs.filter(function (r) { return !(r.at < m.index + m[0].length && r.end > m.index); }), m.index, m.index + m[0].length)) old = true;
      vis(tx, true).list.sort(function (a, b) { return a.at - b.at; }).forEach(function (x) {
        var w = x.w; if (BELOW.test(w)) return;
        if (!mxrOwn(tx, refs, x.at, x.at + x.w.length)) return;
        for (var i = 0; i < CHEST.length; i++) w = w.replace(CHEST[i][0], CHEST[i][1]);
        if (seen[w]) return; seen[w] = 1; out.push(w);
      });
    });
    out = out.filter(function (w) { return !out.some(function (o) { return o !== w && o.indexOf(w) >= 0; }); });
    if (old && out.length && !out.some(function (w) { return /老/.test(w); })) out.unshift('老人');
    return out.join('、').slice(0, 400);
  }
  function regSelect(S, r, id, by) {
    var T = turnsOf(S), cast = castOf(S), bindings = bindingsOf(S), so = stOf(r, id), out = { picked: null, considered: [] }, C = [];
    var namesOf = function (cid) { var o = []; cast.forEach(function (c) { if (c.character_id === cid && c.name) o.push(norm(c.name)); }); Object.keys(bindings).forEach(function (b) { if (bindings[b] === cid) o.push(norm(b)); });
      return o.filter(function (x, i, a) { return x && x.length >= 2 && !generic(x) && a.indexOf(x) === i; }); };
    cast.forEach(function (c) {
      if (c.hero || c.status === 'DELETED' || MX_ID_RE.test(c.character_id)) return;
      var own = namesOf(c.character_id), named = own.filter(function (x) { return !isDesc(x); }), desc = !named.length, f = desc ? own : named, hid = hk('r:' + c.character_id), ev = null, why = null;
      if (!own.length) why = 'REG_NO_NAME';
      else if (by[c.character_id]) why = 'REG_HAS_PICTURE';
      else if (explicitN(c.profile) > 0) why = 'REG_CONFIRMED';
      else if (c.sap) why = 'REG_REVIEW';
      else if (so.h[hid]) why = 'NO_RETRY:' + so.h[hid];
      else if (X.extras.some(function (x) { return x.forms.some(function (a) { return own.some(function (b) { return a.length >= 2 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0); }); }); })) why = 'REG_EXTRA_OVERLAP';   /* mx_claim is the way (claimPass) */
      else if (cast.some(function (o) { return o.character_id !== c.character_id && o.status !== 'DELETED' && namesOf(o.character_id).some(function (x) { return own.indexOf(x) >= 0; }); })) why = 'REG_SAME_NAME';
      else { ev = evidence(T, f, desc); if (!ev.ok) why = 'EVIDENCE:' + ev.t + '/' + ev.need + (ev.recent ? '' : ':old');
        else if (lastHitOf(T, f, desc) !== T.length - 1) why = 'NOT_IN_LATEST';
        else if (so.ny && typeof so.ny[hid] === 'number' && ev.t <= so.ny[hid]) why = 'NOT_YET_WAIT'; }
      var row = { reg: 1, why: why, t: ev ? ev.t : null };
      if (!why) {
        var mxr = mxrOn(), oth = []; if (mxr) cast.forEach(function (o) { if (o.character_id !== c.character_id && o.status !== 'DELETED' && o.name) oth.push(flat(o.name)); });
        var cue = f.concat(ev.near).join('。'), app = mxr ? appearanceFromOwn(ev.hitS, f, desc, oth, c.rg) : appearanceFrom(ev.hitS);   /* ★MXREGFIX1 ② */
        var nhr = nhApp(ev.hitS, ''); if (nhr && !(mxr && c.rg && !app)) app = nhr.app;   /* ★iconx1 B */
        var ts = slotsU(cue), as = slotsU(app), both = Object.keys(as).filter(function (s) { return ts[s]; });
        if (!app) row.why = 'NO_LOOK';
        else if (!desc && !both.length) row.why = 'FEW_FEATURES_NAMED';
        else if (desc && (both.length < 2 || !both.some(function (s) { return s !== 'hair'; }))) row.why = 'FEW_FEATURES:' + both.sort().join('+');
        else {
          var kind = nhr ? nhr.kind : kindOf(cue), hs = ev.hitS.join('。'), fem = REG_F.test(hs), mal = REG_M.test(hs);
          var gender = (desc && tailGender(f[0])) || (fem && !mal ? '女性' : mal && !fem ? '男性' : '');
          if (mxr && c.rg) gender = c.rg;   /* ★MXREGFIX1 ①: 登録の性別は本文の語で変えない */
          var traits = []; if (kind !== 'human') Object.keys(TRAIT_CUE).forEach(function (k) { if (traits.length < 4 && TRAIT_CUE[k].test(cue)) traits.push(k); });
          var key = (c.name && own.indexOf(norm(c.name)) >= 0) ? (dispKey(c.name) || c.name) : (Object.keys(bindings).filter(function (b) { return bindings[b] === c.character_id && own.indexOf(norm(b)) >= 0; }).map(dispKey).filter(Boolean)[0] || '');
          if (!key) row.why = 'REG_NO_HANDLE';
          else C.push({ reg: 1, character_id: c.character_id, key: key, nk: 'r:' + c.character_id, vars: [], desc: desc, t: ev.t, lastHit: lastHitOf(T, f, desc), appearance: app, gender: gender, kind: kind, traits: traits });
        }
      }
      out.considered.push(row);
    });
    C.sort(function (a, b) { return (b.lastHit - a.lastHit) || (b.t - a.t) || (a.character_id < b.character_id ? -1 : 1); });
    out.picked = C[0] || null;
    return out;
  }
  function regTurn(S2, r, id, n, sel0) {
    var f = F697(); if (!f || typeof f.assetV2Read !== 'function') { stats.skipped++; return finish('NO_CANDIDATE', 'no-read-port'); }
    stats.regList++;
    f.assetV2Read('portrait.list', { story_id: id }, function (res, err) {   /* read only: which registered characters already have a picture */
      var j = res && res.j;
      if (err || !res || res.status !== 200 || !j || !Array.isArray(j.portraits)) return finish('LIST_FAIL', err || ('HTTP_' + (res && res.status)));
      if (gateWhy() || X.stopped) return finish('GATE', gateWhy() || X.stopped);
      var S3 = state(); if (!S3 || S3.turns.length !== n) return finish('TURN_MISMATCH', { local: S3 && S3.turns.length, server: n });
      var by = {}; j.portraits.forEach(function (p) { if (p && typeof p.character_id === 'string') by[p.character_id] = 1; });
      var rs = regSelect(S3, rec(), id, by); X.lastSel = { picked: sel0.picked, considered: sel0.considered.concat(rs.considered).slice(0, 16), reg: rs.picked ? 1 : 0 };
      if (!rs.picked) { stats.skipped++; X.noCand = { n: n, sig: rosterSig() }; return finish('NO_CANDIDATE', X.lastSel.considered.slice(0, 8)); }
      stats.regEnsure++; ensureSend(id, n, rs.picked);
    });
    return 'started';
  }
  /* ---------- the per-turn run ---------- */
  var STOP_PAGE = { BUDGET: 1, LEDGER_UNHEALTHY: 1, MX_CAP: 1, RATE_LIMITED: 1, IMG_RATE: 1, IMG_MONTHLY_CAP: 1, IMG_ACCT_MONTHLY_CAP: 1, MX_OFF: 1, MX_NOT_ENABLED: 1, APPEARANCE_UNSAFE_MINOR: 1, NOT_FOUND: 1,
    APPEARANCE_UNSAFE_POLICY: 1, PUBLIC_MODE_OFF: 1, TRIAL_MODEL_UNCONFIGURED: 1, GENERATION_FAILED: 1 };   /* ★mx3-c: + POLICY (real_person / explicit), public mode OFF, provider failure */
  /* ★mx3-c (GPT #127-QM): reason class. The Worker sends mxk for answers of the module; the outer gates (public mode / budget / rate / ledger) are classed here. */
  var NOT_YET = { MX_NO_EVIDENCE: 1, MX_NOT_YET: 1, MX_THIN: 1, MX_FEW_FEATURES: 1, MX_KIND_NO_EVIDENCE: 1, MX_APPEARANCE_CONFLICT: 1 };
  function reasonKind(st, code, rj) {
    if (rj && typeof rj.mxk === 'string' && /^[a-z_]{2,12}$/.test(rj.mxk)) return rj.mxk;
    if (st === 200) return 'ok'; if (code === 'APPEARANCE_UNSAFE_MINOR' || code === 'APPEARANCE_UNSAFE_POLICY' || code === 'PROFILE_NOT_ENGLISH') return 'imgsafe';
    if (code === 'MX_CAP' || st === 402 || st === 429) return 'cap'; if (st === 502 || code === 'GENERATION_FAILED') return 'provider';
    if (st === 403 || st === 404 || st === 501 || st === 503) return 'gate'; return 'other';
  }
  var RUN_KIND = { TURN_MISMATCH_RETRY: 'race', CREATED: 'ok', EXISTS: 'ok', IN_FLIGHT: 'race', OUTCOME_UNKNOWN: 'race', TURN_MISMATCH: 'race', TURN_MISMATCH_W: 'race', NOT_PLAYED: 'not_played', NO_CANDIDATE: 'not_yet', NOT_YET: 'not_yet',
    CAP_STORY_TOTAL: 'cap', CAP_STORY_DAY: 'cap', CAP_ACCT_DAY: 'cap', CAP_TURN: 'cap', CAP_STORY_DESC: 'cap', CAP_ATTEMPTS_THIS_FIGURE: 'cap', IMGSAFE: 'imgsafe', PROVIDER: 'provider', IDENTITY: 'identity', LIST_FAIL: 'gate', GATE: 'gate' };
  var LOCAL_ONLY = { TURN_MISMATCH_RETRY: 1, NOT_PLAYED: 1, NO_CANDIDATE: 1, CAP_STORY_TOTAL: 1, CAP_STORY_DAY: 1, CAP_ACCT_DAY: 1, TURN_MISMATCH: 1 };   /* outcomes decided without an mx_ensure (ICF sees mx_ensure answers itself) */
  /* ★mx3-c + ICF80 (laneEDICF __icfRecord, if loaded): device-side outcomes only (ICF records the Worker-answered mx_ensure itself) → one category + a code; never a name / text / id.
     Without ICF80 (or when it is OFF / refuses), the counts-only ICF mxNote. Never both. */
  var LOCAL_CAT = { TURN_MISMATCH_RETRY: 'NOT_YET_ELIGIBLE', NOT_PLAYED: 'NOT_YET_ELIGIBLE', NO_CANDIDATE: 'NOT_YET_ELIGIBLE', TURN_MISMATCH: 'NOT_YET_ELIGIBLE', CAP_STORY_TOTAL: 'CAP_REACHED', CAP_STORY_DAY: 'CAP_REACHED', CAP_ACCT_DAY: 'CAP_REACHED' };
  var LOCAL_CAP = { CAP_STORY_TOTAL: 'storyTotal', CAP_STORY_DAY: 'storyDay', CAP_ACCT_DAY: 'acctDay' };
  function icfLocal(k, why) { try { var F80 = root.__icfRecord; if (typeof F80 === 'function') { var m = { code: why, src: 'mx' }; if (LOCAL_CAP[why]) m.cap = LOCAL_CAP[why]; var r80 = F80(LOCAL_CAT[why] || 'OTHER', m); if (r80 && r80.ok === true) return 'icf80'; }   /* ICF80 OFF / refused → the mxNote count instead (never both) */
      var I = root.__chrIconFail; if (I && typeof I.mxNote === 'function') { I.mxNote(k, why); return 'mxnote'; } } catch (e) {} return null; }
  function traceRun(why, code) {   /* counts only (per story and per day); no name, no text, no id */
    var k = RUN_KIND[why] || (/^HTTP_/.test(why) ? reasonKind(+why.slice(5), code, null) : 'other');
    try { var r = rec(), id = X.story || sid(); r.tr = r.tr || {}; r.tr[k] = (r.tr[k] || 0) + 1; if (id) { var so = stOf(r, id); so.tr = so.tr || {}; so.tr[k] = (so.tr[k] || 0) + 1; } recSave(r); } catch (e) {}
    if (LOCAL_ONLY[why]) icfLocal(k, why);
    return k;
  }

  function quiet() {
    var S = state(); if (!S || S.inFlight) return 'inflight';
    try { var g945 = root.__v292Dfix945; if (g945 && typeof g945.isStale === 'function' && g945.isStale()) return 'xtab-stale'; } catch (e) { return 'xtab?'; }   /* ★mx3-e2 (GPT #127-QS): a save conflict (fix945 STALE) means this tab's turns may not be saved; never create */
    try { var a = A(); if (a && ((a.pending && a.pending()) || (a.blocked && a.blocked()) || (a.conflict && a.conflict()) || (a.status && a.status().reg && a.status().reg.busy))) return 'registrar'; } catch (e) { return 'registrar?'; }
    try { var f = F697(); var p = f && f.f909 ? f.f909() : null; if (p && (p.pushTimer || p.inFlight)) return 'push-pending'; } catch (e) { return 'f697?'; }
    return '';   /* note (measured 2026-11-01): fix697 authorityReloadRequired is TRUE in every schema-2 page after its first putcanonical (fix733 TYPE A at attempt time), so it is not a usable "busy" signal; the turn-count equality with the Worker is the guard */
  }
  var MM_WAIT_MS = 15000;   /* ★mx3-e: > fix697's push debounce (12 s) */
  function mmRetry(n) { if (X.mmRetry[n]) return false; X.mmRetry[n] = Date.now(); X.doneTurn = n - 1; X.mmWait = Date.now() + MM_WAIT_MS; stats.mmRetry++; return true; }   /* once per turn */
  function finish(why, extra) { X.busy = false; var k = traceRun(why, typeof extra === 'string' ? extra : null); X.last = { why: why, k: k, at: Date.now(), extra: extra || null }; note({ kind: 'RUN_' + why, k: k, extra: extra || null }); }   /* ★mx3-c: + reason class */
  function runTurn(force) {
    if (X.busy) return 'busy';
    var g = gateWhy(); if (g) return g;
    if (X.stopped) return 'stopped:' + X.stopped;
    if (X.pageStop) return 'page-stop:' + X.pageStop;
    var S = state(); if (!S || !Array.isArray(S.turns)) return 'no-state';
    var n = S.turns.length; if (!force && n === X.doneTurn) return 'done';
    var q = quiet(); if (q) return q;
    if (!force && !X.played[n]) { X.doneTurn = n; stats.notPlayed++; finish('NOT_PLAYED'); return 'not-played'; }   /* ★mx3-c: opened / imported / redo / synced turns never create */
    var id = sid(), r = rec(), so = stOf(r, id);
    if (so.stop) return 'story-stop:' + so.stop;
    X.busy = true; X.doneTurn = n; stats.settles++;
    listOnce(id, function (j, err) {                                    /* request 1 of 2 (read) */
      if (err) return finish('LIST_FAIL', err);
      if (gateWhy() || X.stopped) return finish('GATE', gateWhy() || X.stopped);
      var S2 = state(); if (!S2 || S2.turns.length !== n || j.turn_count !== n) { stats.mismatch++;
        if (S2 && S2.turns.length === n && typeof j.turn_count === 'number' && j.turn_count < n && mmRetry(n)) return finish('TURN_MISMATCH_RETRY', { local: n, server: j.turn_count });   /* ★mx3-e */
        return finish('TURN_MISMATCH', { local: S2 && S2.turns.length, server: j.turn_count }); }
      var mine = X.extras.length, sd = so.d || 0;
      if (mine >= capOf('storyTotal')) return finish('CAP_STORY_TOTAL');
      if (sd >= capOf('storyDay')) return finish('CAP_STORY_DAY');
      if ((r.acct || 0) >= capOf('acctDay')) return finish('CAP_ACCT_DAY');
      var sel = admfOn() ? select(S2, r, id) : { picked: null, considered: [] }; X.lastSel = sel;   /* ★W-MXREG: unregistered figures only with midicon1 (unchanged when it is on) */
      if (!sel.picked) {
        if (regOn()) return regTurn(S2, r, id, n, sel);   /* ★W-MXREG: nobody unregistered → a registered NPC without a picture (one more read: portrait.list) */
        stats.skipped++; X.noCand = { n: n, sig: rosterSig() }; return finish('NO_CANDIDATE', sel.considered.slice(0, 8)); }   /* ★OLDMX1: remember the roster this decision saw */
      ensureSend(id, n, sel.picked);
    });
    return 'started';
  }
  function ensureSend(id, n, p) {   /* ★W-MXREG: the request 2 of the turn, split out so the registered path uses the same answer handling */
      var args = { story_id: id, handle: p.key, expected_turn_count: n, appearance: p.appearance, kind: p.kind };
      if (p.reg) args.character_id = p.character_id;
      if (p.vars.length) args.variants = p.vars; if (p.traits.length) args.traits = p.traits; if (p.gender) args.gender = p.gender;
      stats.ensure++; note({ kind: 'ENSURE', desc: p.desc, kind2: p.kind, nv: p.vars.length, nt: p.traits.length });
      call('portrait.mx_ensure', args, function (res, err2) {                  /* request 2 of 2 (write) — never resent */
        var rj = res && res.j, st = res && res.status, code = (rj && (rj.errorCode || rj.error)) || null, r2 = rec(), so2 = stOf(r2, id);
        if (err2) {
          if (err2 === 'TIMEOUT') stats.timeouts++;
          note({ kind: 'ENSURE_NO_ANSWER', err: err2 });
          listOnce(id, function () { finish('OUTCOME_UNKNOWN', err2); });     /* no resend: read once (the Worker may have made it) */
          return;
        }
        if (st === 200 && rj && (rj.status === 'CREATED' || rj.status === 'EXISTS')) {
          if (rj.status === 'CREATED') { stats.created++; so2.d = (so2.d || 0) + 1; r2.acct = (r2.acct || 0) + 1; recSave(r2); } else stats.exists++;
          if (p.disp && typeof rj.extra_id === 'string' && MX_ID_RE.test(rj.extra_id)) { so2.ak = so2.ak || {}; so2.ak[hk(norm(p.disp))] = rj.extra_id; recSave(r2); X.alias = JSON.parse(JSON.stringify(so2.ak)); }   /* ★mx3-e: the roster handle shows the same picture */
          if (p.reg) { stats.regDone++; try { var P0 = root.__chronicleAv2Portrait; if (P0 && typeof P0.refresh === 'function') P0.refresh(); } catch (e) {} }   /* ★W-MXREG: the pointer is on the registered id → re-read portrait.list */
          var pa = rj.pointer && rj.pointer.asset_id;
          if (typeof rj.extra_id === 'string' && MX_ID_RE.test(rj.extra_id) && typeof pa === 'string' && !X.extras.some(function (e) { return e.extra_id === rj.extra_id; })) {
            X.extras.push({ extra_id: rj.extra_id, handle: p.key, vars: p.vars.slice(), cls: p.desc ? 'desc' : 'named', kind: p.kind, asset_id: pa, claimed_by: null, claim_state: null, forms: [p.nk].concat(p.vars) });
            notifyPortrait();
          }
          return finish(rj.status, { desc: p.desc });
        }
        if (st === 200 && rj && rj.status === 'IN_FLIGHT') { stats.inflight++; return finish('IN_FLIGHT'); }
        if (st === 200 && rj) return finish('OTHER_' + String(rj.status || '').slice(0, 20));
        if (st === 409 && code === 'MX_TURN_MISMATCH') { stats.mismatch++; var S3 = state(); if (S3 && S3.turns.length === n && rj && typeof rj.turn_count === 'number' && rj.turn_count < n && mmRetry(n)) return finish('TURN_MISMATCH_RETRY', { local: n, server: rj.turn_count, w: 1 }); return finish('TURN_MISMATCH_W'); }
        var rk = reasonKind(st, code, rj);   /* ★mx3-c: never shown on the screen (the initial stays); never retried automatically */
        if (rk === 'not_yet' && NOT_YET[code]) { so2.ny = so2.ny || {}; so2.ny[hk(p.nk)] = p.t || 0; var nyk = Object.keys(so2.ny); if (nyk.length > 30) delete so2.ny[nyk[0]]; recSave(r2); stats.notYet++; return finish('NOT_YET', code); }
        if (rk === 'identity') { so2.h[hk(p.nk)] = String(code || st).slice(0, 32);
          if (rj && typeof rj.extra_id === 'string' && MX_ID_RE.test(rj.extra_id)) { so2.ak = so2.ak || {}; [p.nk].concat(p.vars).forEach(function (f) { so2.ak[hk(f)] = rj.extra_id; }); var akk = Object.keys(so2.ak); if (akk.length > 40) delete so2.ak[akk[0]];
            X.alias = JSON.parse(JSON.stringify(so2.ak)); stats.alias++; notifyPortrait(); }
          recSave(r2); return finish('IDENTITY', code); }
        if (rk === 'imgsafe' || rk === 'provider') { so2.h[hk(p.nk)] = String(code || st).slice(0, 32); X.pageStop = String(code || st); recSave(r2); if (rk === 'imgsafe') stats.refused++; else stats.provider++; return finish(rk === 'imgsafe' ? 'IMGSAFE' : 'PROVIDER', code); }
        if (st === 429 && code === 'MX_CAP' && rj && rj.cap === 'turn') return finish('CAP_TURN');   /* ★mx3-b (低-1): one picture per turn → just skip this turn */
        if (st === 429 && code === 'MX_CAP' && rj && rj.cap === 'storyDesc') { so2.descStop = 1; recSave(r2); return finish('CAP_STORY_DESC'); }   /* ★mx3-b: only descriptor-named creation stops (proper names go on) */
        if (st === 429 && code === 'MX_CAP' && rj && rj.cap === 'attPerExtra') { so2.h[hk(p.nk)] = 'MX_CAP:attPerExtra'; recSave(r2); return finish('CAP_ATTEMPTS_THIS_FIGURE'); }
        if (st === 409 || st === 422 || st === 400) { so2.h[hk(p.nk)] = String(code || st).slice(0, 32); recSave(r2); }
        if (st === 422 || st === 402 || st === 429 || (st === 503 && code === 'LEDGER_UNHEALTHY') || STOP_PAGE[code]) {
          X.pageStop = String(code || st);
          if (code === 'MX_CAP' && rj && /^(storyDay|storyTotal|attStoryDay)$/.test(String(rj.cap || ''))) { so2.stop = 'MX_CAP:' + rj.cap; so2.stopDay = /Day/.test(rj.cap) ? 1 : 0; recSave(r2); }
          if (code === 'MX_CAP' && rj && /^(acctDay|attAcctDay)$/.test(String(rj.cap || ''))) { r2.acct = Math.max(capOf('acctDay'), r2.acct || 0); recSave(r2); }
        }
        return finish('HTTP_' + st, code);
      });
  }
  /* ---------- claim after a normal registration (「NPCに昇格」/ fix641) ---------- */
  function claimPass() {
    if (gateWhy() || X.stopped || !X.listed || X.busy) return;
    var S = state(); if (!S) return; var id = sid(); if (X.story !== id) return;
    var b = bindingsOf(S), cast = castOf(S), todo = [];
    X.extras.forEach(function (e) {
      if (e.claimed_by || X.claimTried[e.extra_id]) return;
      for (var k in b) { if (!Object.prototype.hasOwnProperty.call(b, k)) continue; var cid = b[k];
        if (MX_ID_RE.test(cid) || e.forms.indexOf(norm(k)) < 0) continue;
        var c = cast.filter(function (x) { return x.character_id === cid; })[0]; if (!c || c.hero || c.status === 'DELETED') continue;
        todo.push({ extra_id: e.extra_id, character_id: cid }); break; }
    });
    if (!todo.length) return;
    X.busy = true; var left = todo.length, any = false;
    todo.forEach(function (t) {
      X.claimTried[t.extra_id] = 1; stats.claim++;
      call('portrait.mx_claim', { story_id: id, extra_id: t.extra_id, character_id: t.character_id }, function (res, err) {
        var rj = res && res.j; note({ kind: 'CLAIM', status: res && res.status, res: rj && (rj.status || rj.errorCode) || err });
        if (res && res.status === 200 && rj && /CLAIMED|CANDIDATE_PLACED|EXISTS/.test(String(rj.status || ''))) any = true;
        if (--left === 0) { if (any) { listOnce(id, function () { X.busy = false; try { root.__chronicleAv2Portrait.refresh(); } catch (e) {} }); } else X.busy = false; }
      });
    });
  }

  /* ---------- loop: watch S.turns (no wrapper on any other module) ---------- */
  function tick() {
    try {
      if (killed()) return;
      var g = gateWhy(); if (g) return;
      var id = sid();
      if (X.story !== id) { X.story = id; X.extras = []; X.listed = false; X.claimTried = {}; X.doneTurn = -1; X.lastTurnSeen = -1; X.stopped = null; X.pageStop = null; X.initListAsked = false;
        X.played = {}; X.seen = {}; X.seenN = 0; X.caps = null; X.mmRetry = {}; X.mmWait = 0; X.noCand = null; X.rosRetry = {}; try { var sa = stOf(rec(), id); X.alias = sa.ak ? JSON.parse(JSON.stringify(sa.ak)) : {}; } catch (e) { X.alias = {}; } }   /* ★mx3-c */
      if (!X.listed && !X.busy && !X.stopped && !X.initListAsked) { X.initListAsked = true; X.busy = true; var S0 = state(); X.doneTurn = (S0 && Array.isArray(S0.turns)) ? S0.turns.length : -1; seeAll(S0); X.lastTurnSeen = X.doneTurn; X.lastChange = Date.now();   /* ★mx3-c: every turn present at open = seen (baseline) */   /* opening / reloading a story never creates by itself: only a NEW turn that settles */
        listOnce(id, function () { X.busy = false; claimPass(); }); return; }
      var S = state(); if (!S || !Array.isArray(S.turns)) return;
      var n = S.turns.length;
      if (n !== X.lastTurnSeen) {   /* ★mx3-c: played = exactly +1 turn whose content was never seen on this page. Open / reload / import = baseline (all seen); undo / redo / a copied turn = seen content. */
        var tk = turnKey(S.turns[n - 1]), fresh = n > 0 && !X.seen[tk];
        if (X.listed && X.lastTurnSeen >= 0 && n === X.lastTurnSeen + 1 && fresh) X.played[n] = 1; else if (X.lastTurnSeen >= 0) note({ kind: 'REBASE', from: X.lastTurnSeen, to: n, fresh: fresh ? 1 : 0 });
        if (X.lastTurnSeen >= 0 && n < X.lastTurnSeen) { X.doneTurn = Math.min(X.doneTurn, n); for (var pk in X.played) if (+pk > n) delete X.played[pk]; }   /* undo: a NEW turn after it may be considered again */
        seeAll(S); X.lastTurnSeen = n; X.lastChange = Date.now(); return; }
      try { var a = A(); var ro = a && a.status ? a.status().reg.ok : null; if (ro !== X.lastRegOk) { X.lastRegOk = ro; if (X.listed) setTimeout(claimPass, 1500); } } catch (e) {}
      /* ★OLDMX1: the roster arrived after the decision of this played turn ("no candidate") → decide this same turn once more */
      if (X.noCand && X.noCand.n === n && X.doneTurn === n && !X.busy && X.played[n] && !X.rosRetry[n] && lsGet('v292DfixMIDICONrosOff') !== '1' && Date.now() - X.lastChange < ROS_LATE_MS && rosterSig() !== X.noCand.sig) {
        X.rosRetry[n] = 1; X.doneTurn = n - 1; stats.rosRetry++; note({ kind: 'ROSTER_LATE', n: n }); }
      if (n > X.doneTurn && Date.now() - X.lastChange >= SETTLE_MS && Date.now() >= (X.mmWait || 0)) { var why = runTurn(false); if (why !== X.lastTry) { X.lastTry = why; note({ kind: 'TRY', why: String(why).slice(0, 40) }); } }
    } catch (e) { note({ kind: 'TICK_THREW', e: String(e).slice(0, 80) }); }
  }
  function turnKey(t) { try { return hk(String((t && t.narrative) || '') + '|' + String((t && t.playerText) || '') + '|' + String((t && t.inputType) || '')); } catch (e) { return 'x'; } }   /* ★mx3-c: content of one turn (hash only, memory only) */
  function seeAll(S) { try { var T0 = S && Array.isArray(S.turns) ? S.turns : []; for (var i = X.seenN > T0.length ? 0 : Math.max(0, X.seenN - 2); i < T0.length; i++) X.seen[turnKey(T0[i])] = 1; X.seenN = T0.length; } catch (e) {} }
  function start() { if (X.started) return; X.started = true; setInterval(tick, POLL_MS); tick(); }
  function boot() {   /* the loop runs while the page is open; every tick re-checks the gate (kill / account key via ADMF1 / login / schema 2 / Vault), so a late /auth/me answer is picked up without a reload */
    if (killed()) return;
    start();
  }

  root.__v292DfixMIDICON = {
    ver: VER, extraFor: extraFor,
    status: function () { var r = rec(), id = sid(); return { ver: VER, killed: killed(), gate: gateWhy() || 'on', gen: genOn(), nh: !!NH(), started: X.started, story: X.story, listed: X.listed, turnCount: X.turnCount, doneTurn: X.doneTurn, busy: X.busy,
      stopped: X.stopped, pageStop: X.pageStop, lastTry: X.lastTry || null, quiet: quiet() || 'quiet', extras: X.extras.map(function (e) { return { extra_id: e.extra_id, handle: e.handle, vars: e.vars, cls: e.cls, kind: e.kind, asset_id: e.asset_id, claimed_by: e.claimed_by, claim_state: e.claim_state }; }),
      last: X.last, lastSel: X.lastSel || null, stats: JSON.parse(JSON.stringify(stats)), rec: { day: r.day, acct: r.acct, story: id && r.st[id] ? JSON.parse(JSON.stringify(r.st[id])) : null }, log: LOG.slice(-30),
      played: Object.keys(X.played).map(Number), caps: X.caps, alias: Object.keys(X.alias).length, trace: { day: r.tr || {}, story: id && r.st[id] && r.st[id].tr ? JSON.parse(JSON.stringify(r.st[id].tr)) : {} } }; },   /* ★mx3-c */
    /* test / diagnosis: evaluate the candidates now (reads only, no request) */
    dryRun: function (o) { var S = state(), id = sid(); if (!S || !id) return null; return select(S, rec(), id, o && Array.isArray(o.roster) ? o.roster : null); },   /* o.roster: diagnosis only (evaluate a given roster instead of fix307's) */
    kick: function () { return runTurn(true); },
    dryRunReg: function (by) { var S = state(), id = sid(); if (!S || !id) return null; return regSelect(S, rec(), id, by || {}); },   /* ★MXREGFIX1: test / diagnosis (reads only, no request) */
    regDryRun: function (by) { var S = state(), id = sid(); if (!S || !id) return null; return regSelect(S, rec(), id, (by && typeof by === 'object') ? by : {}); },   /* ★W-MXREG diagnosis: by = { character_id: 1 } of characters that have a picture */   /* diagnosis / test only (an explicit action): skips the played-turn check; the Worker still requires the figure in its newest turn */
    __t: { gaOk: gaOk, gaEvidence: gaEvidence, gaAnchors: gaAnchors, rosterCount: rosterCount, slotsU: slotsU, nhApp: nhApp, select: select, aliasInfo: aliasInfo, lastHitOf: lastHitOf, traceRun: traceRun, icfLocal: icfLocal, isRoleish: isRoleish, apposition: apposition, f641Live: f641Live, promotedSoon: promotedSoon, norm: norm, dispKey: dispKey, generic: generic, isDesc: isDesc, vis: vis, axes: axes, evidence: evidence, turnsOf: turnsOf, identityA: identityA, descIdentity: descIdentity, appearanceFrom: appearanceFrom, kindOf: kindOf, hitsIn: hitsIn, tailGender: tailGender }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
