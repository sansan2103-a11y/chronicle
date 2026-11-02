/* =====================================================================
 * v292DfixICONUX2-twotap.js — キャラの絵を 2 タップで作る（bundle82-iconux-a・GPT #127-PC ICONUX）
 *   元: laneICONUX2 の試作 v292DfixICONUX2-proto.js（f5a6c61b）。
 *   r2（bundle82-iconux-b・独立レビュー反映）:
 *     HIGH-1 近道は「年代の語だけ」（AGE_RE の一致部分）を足す。下書きと説明文を LC1 と同じ検査（性的な語・若く見える人物の体の語・性格/経歴の語）に
 *            通し、どれかに当たれば近道を使わず LC1 の案（文章 AI 1 回）に任せる。下書きの句はすべて説明文にそのままある語（「そのまま入れました」が本当になる）。
 *     LOW-a  結果が分からない失敗（「結果を確かめる」）の間は、主ボタンを押せなくする（確かめたら戻す）。費用の一行は主ボタンの下に常に出す。
 *     LOW-c  「AIに足りない所を足してもらう」（案を作り直す）からの呼び出しでは近道を使わない（空の欄でも AI を呼ぶ）。
 *     LOW-d  LC1 の行が無いキャラ（退場など）では「最初の絵を作る」を隠さない。
 *   r3（bundle82-imgsafe-a・GPT #127-PE）: 年代の語は「10〜90代」だけ（「第12代」「十二代目」は年代にしない）。若く見える人物の判定に「16才」「十七の娘」「JK」などを足した
 *     （YOUTH_X と minorAge。LC1 から写した 4 つの表はそのまま＝LC1 自身の表にはこの語は無い）。
 *   働くのは LC1 が ON のときだけ（LC1 は Worker の公開許可の範囲 CANARY＝owner かつ active のアカウントだけ ON になれる）。
 * ---------------------------------------------------------------------
 * 目的: キャラのアイコン（絵）を「2 回のタップ」で作れるようにする。
 *   1 回目「🎨 絵を作る」→ そのカードの中に外見の下書きが出る（費用の一行つき）。
 *   2 回目「この外見で作る」→ 外見を保存（本人の確定・#31/#31-b）→ 絵を 1 枚。下書きを直すのは任意。
 *   絵があるとき: 1 回目「🎨 絵を変える」→ 新しい候補を 1 枚 → 2 回目 候補を選ぶ（この絵にする）。
 *   途中にブラウザの確認ダイアログ（confirm）は出さない。ボタンの文言と費用の一行が確認の代わり。
 *
 * 前提: LC1（v292DfixLC1-workbench / -appearance-proposal）が ON の物語。LC1 が無い・OFF のときは何もしない
 *   （LC1 の ON/OFF の判定＝v292DfixLC1On・ADMF1 の gate には一切触らない。毎回 window.__v292DfixLC1.on() を読むだけ）。
 *
 * 何をするか
 *   (A)【表示だけではない・要 GPT 確認】外見の案の近道:
 *      LC1 の外見の案（window.__v292DfixLC1prop.propose）を包む。設定の説明文（desc）の「見た目の句」に
 *      髪・瞳・服・顔の特徴のうち 2 種類以上があるときは、AI を呼ばずにその句（＋年代の句）をそのまま下書きにする。
 *      それ以外（例: 種だけ「ヴァンパイア女子高生」）は LC1 のとおり AI を 1 回呼ぶ。
 *      「案を作り直す」（本人の文を土台にした呼び出し＝input.confirmed あり）は従来どおり。
 *      → 文章 AI の回数は LC1 と同じか少ない。生成・保存・通信の経路は増やさない（呼ばないことがあるだけ）。
 *   (B)【表示】カードの中に、LC1 の行と同じ操作を出す（主ボタン・下書き・この外見で作る・作り直す・やめる・もう一度 等）。
 *      どのボタンも LC1 の（隠した）行の同じボタンを click() するだけ。入力欄は LC1 の欄へ値を写すだけ。
 *      上の「🎨 登場人物の絵」は見出しと「まとめて絵を作る」だけにする（まとめて作る最中は行を全部出す）。
 *   (C)【表示】カードのボタンを減らす:「詳細 ▾」→「その他の操作 ▾」。その中の「最初の絵を作る」は隠す（主ボタンが代わり）。
 *      「🚪 退場」はカードの表から隠し、「その他の操作」の中に同じボタン（元のボタンを click() するだけ）を置く。
 *      主人公カードの古い案内文（fg3）は隠す（費用の一行が代わり）。
 *   (D)【表示】設定の 🎲 の注意書き・主人公欄の案内を今の入口（👥 キャラ の「🎨 絵を作る」）に合わせる。
 * kill: localStorage v292DfixICONUXOff='1'（読み込み時に判定。(A) の包みも付けない）
 * 観測口: window.__v292DfixICONUX2.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixICONUX2) return;
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  if (lsg('v292DfixICONUXOff') === '1') { window.__v292DfixICONUX2 = { on: false, status: function () { return { on: false }; } }; return; }
  var VERSION = 'ICONUX2-r3d-lc1ox';
  var st = { passes: 0, taps: {}, direct: 0, aiPass: 0, wrapped: false, log: [] };
  function tap(k) { st.taps[k] = (st.taps[k] || 0) + 1; }
  function note(o) { try { o.t = Date.now(); st.log.push(o); if (st.log.length > 80) st.log.shift(); } catch (e) {} }
  function lc1() { var x = window.__v292DfixLC1; try { return (x && typeof x.on === 'function' && x.on()) ? x : null; } catch (e) { return null; } }
  function PR() { return window.__v292DfixLC1prop || null; }
  function A() { return window.__chronicleAssetV2 || null; }
  function genderOf(v) { return (v === '女性' || v === '男性') ? v : ''; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- (A) 説明文の見た目をそのまま下書きにする判定（AI を呼ばない）---------- */
  var VIS_KINDS = ['hair', 'eyes', 'clothes', 'feature'];
  var AGE_RE = /[0-9０-９]+\s*(?:代|歳)|[十二三四五六七八九]{1,3}(?:代|歳)|中年|初老|老人|老婆|老爺|青年|少女|少年|若い(?:男|女)/;
  /* r3: 「代」は 10〜90 代だけ。直前が「第」・数字、直後が「目」なら年代ではない（例「第12代当主」「十二代目」）。歳・才はそのまま */
  function ageWord(c) {
    c = String(c || ''); var re = new RegExp(AGE_RE.source, 'g'), m;
    while ((m = re.exec(c))) {
      var w = m[0];
      if (/代$/.test(w)) {
        var pre = c.charAt(m.index - 1), post = c.charAt(m.index + w.length);
        if (pre === '第' || /[0-9０-９一二三四五六七八九十百]/.test(pre) || post === '目') continue;
        if (!/^(?:[1-9１-９][0０]\s*代|[二三四五六七八九]?十代)$/.test(w)) continue;
      }
      return w;
    }
    return null;
  }
  /* r3: LC1 の YOUTH に無い若年の言い方（ICONUX2 だけの表。近道を使わない側へ倒すだけ） */
  var YOUTH_X = /(?:^|[^A-Za-zＡ-Ｚａ-ｚ])(?:JK|JC|JS|ＪＫ|ＪＣ|ＪＳ|jk|ｊｋ)(?![A-Za-zＡ-Ｚａ-ｚ])|女児|男児|未成年|ロリ|ショタ|ティーン|あどけな|女の子|男の子|セーラー服|ランドセル|生徒|児童/;
  /* LC1（v292DfixLC1-appearance-proposal.js）の検査と同じ語の表（あちらは公開していないので写し。変えるときは両方そろえる） */
  var BAD_SEX = /裸|露出|下着|ランジェリー|セクシー|エロ|胸の大|巨乳|爆乳|谷間|スタイル抜群|グラマー|ナイスバディ|扇情|煽情|官能|透け|(?:胸|尻|お尻|太もも|太腿|脚|腰|くびれ|ボディライン|体の線)を?強調/;   /* ★LC1OX: 水着・太ももは普通の服・体の語（未成年×性的は Worker の imgsafe が判定） */
  var YOUTH = /女子高生|高校生|中学生|小学生|女子学生|男子学生|少女|少年|幼|子供|こども|十代|10代|１０代/;
  var BAD_BODY_YOUTH = /胸(?!元[のに](?:大きな|赤い|白い|青い|黒い|小さな)?(?:リボン|ブローチ|ネクタイ|ボタン|バッジ|ポケット))|腰つき|くびれ|脚線|美脚|スタイル|ボディ|豊満/;   /* ★LC1OX: 細身・華奢・体型・腰・脚（腰の剣など）・胸元のリボンは普通の外見 */
  var PERS_RE = /性格|明るく|明るい|おとなし|優しい|優しく|穏やか|勇敢|臆病|無口|冷静|活発|元気|頑固|真面目|不器用|社交的|内気|短気|好奇心|思い|過去|両親|幼い頃|生まれ|育ち|得意|苦手|好き|嫌い|夢|目標|秘密|嘘|事件|出身|恐れ|願い|傷つ|裏切|復讐|守る|助け/;
  var KD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function minorAge(t) {                                       /* 20 歳未満の明示の年齢（数字・漢数字）があるか（LC1 の YOUTH に無い分を足す・近道を使わない側へ倒すだけ）。r3: 才・さい・「十七の娘」も */
    t = String(t || ''); var m, re = /([0-9０-９]+)\s*(?:歳|才|さい)/g;
    while ((m = re.exec(t))) { var v = parseInt(m[1].replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); }), 10); if (v < 20) return true; }
    var re2 = /(十)?([一二三四五六七八九])?(?:歳|才|さい)/g;
    while ((m = re2.exec(t))) { if (!m[1] && !m[2]) continue; var v2 = (m[1] ? 10 : 0) + (m[2] ? KD[m[2]] : 0); var pre = t.charAt(m.index - 1); if (/[十二三四五六七八九百]/.test(pre)) continue; if (v2 < 20) return true; }
    var re3 = /(?:([0-9０-９]+)|(十)?([一二三四五六七八九])?)\s*の\s*(?:娘|少女|子|女の子|男の子|少年|小娘)/g;   /* r3: 「十七の娘」「16の娘」 */
    while ((m = re3.exec(t))) { var v3 = m[1] ? parseInt(m[1].replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); }), 10) : ((m[2] || m[3]) ? (m[2] ? 10 : 0) + (m[3] ? KD[m[3]] : 0) : NaN);
      if (m[1] && /[0-9０-９]/.test(t.charAt(m.index - 1))) continue; if (!m[1] && /[十二三四五六七八九百]/.test(t.charAt(m.index - 1))) continue; if (v3 < 20) return true; }
    return false;
  }
  function normT(s) { return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim(); }
  function directCheck(desc, gender) {
    var P = PR(); if (!P || typeof P.visualPart !== 'function' || typeof P.slotsOf !== 'function') return { ok: false, why: 'NO_LC1PROP' };
    var d = normT(desc);
    if (BAD_SEX.test(d)) return { ok: false, why: 'SENSITIVE_DESC' };                  /* 説明文に性的な語 → 近道を使わない（LC1 の案に任せる） */
    var youth = YOUTH.test(d) || YOUTH_X.test(d) || minorAge(d);   /* r3: + YOUTH_X */
    if (youth && BAD_BODY_YOUTH.test(d)) return { ok: false, why: 'YOUTH_BODY_DESC' };   /* 若く見える人物の体の語 → 近道を使わない */
    var vp = P.visualPart(d); var text = String(vp.text || '');
    if (!text) return { ok: false, why: 'NO_VISUAL' };
    var sl = P.slotsOf(text), n = 0;
    for (var i = 0; i < VIS_KINDS.length; i++) if (sl[VIS_KINDS[i]]) n++;
    if (n < 2) return { ok: false, why: 'FEW_KINDS' };            /* 見た目の種類が 2 つ未満 → LC1 のとおり AI の案（ER1x の「2 種類以上」に合わせる） */
    var age = null, ageFrom = null;
    (vp.dropped || []).some(function (c) { var w = ageWord(c); if (w) { age = w; ageFrom = c; return true; } return false; });   /* r3: 10〜90 代だけ（第12代は年代にしない） */
    if (age && !sl.age) text = age + '、' + text;                /* 年代の語だけ（例「30代」）。その句の残り（経歴・体の語など）は入れない */
    if (text.length > 400) return { ok: false, why: 'TOO_LONG' };
    if (PERS_RE.test(text)) return { ok: false, why: 'PERSONALITY_OR_BIO' };
    if (BAD_SEX.test(text) || (youth && BAD_BODY_YOUTH.test(text))) return { ok: false, why: 'SENSITIVE_DRAFT' };
    if (!text.split('、').every(function (x) { return !x || d.indexOf(x) >= 0; })) return { ok: false, why: 'NOT_VERBATIM' };   /* 下書きの句はすべて説明文にそのままある語 */
    var g = genderOf(gender) || (typeof P.genderGuess === 'function' ? P.genderGuess(d) : '');
    var dropped = (vp.dropped || []).slice();
    return { ok: true, draft: { text: text, gender: g, dropped: dropped, droppedVisual: (vp.droppedVisual || []).slice(), kinds: n, age: age } };
  }
  function directDraft(desc, gender) { var r = directCheck(desc, gender); return r.ok ? r.draft : null; }
  /* LOW-c: 「案を作り直す／AIに足りない所を足してもらう」の押下中は近道を使わない（LC1 は同じ関数を同期で呼ぶので、capture で印を付けて同じ押下の間だけ有効） */
  var regenTap = false;
  document.addEventListener('click', function (ev) { try { if (ev.target && ev.target.closest && ev.target.closest('[data-lc1="regen"]')) { regenTap = true; setTimeout(function () { regenTap = false; }, 0); } } catch (e) {} }, true);
  function wrapPropose() {
    var P = PR(); if (!P || P.__iconux2 || typeof P.propose !== 'function') return;
    var orig = P.propose;
    P.propose = function (input, cb) {
      try {
        if (lsg('v292DfixICONUXOff') !== '1' && input && !input.confirmed && typeof cb === 'function') {
          if (regenTap) { st.regenAi = (st.regenAi || 0) + 1; note({ kind: 'REGEN_NO_SHORTCUT', name: input.name }); throw 'regen'; }
          var dc = directCheck(input.desc, input.gender), dd = dc.ok ? dc.draft : null;
          if (!dd) { st.refused = st.refused || {}; st.refused[dc.why] = (st.refused[dc.why] || 0) + 1; note({ kind: 'NO_SHORTCUT', name: input.name, why: dc.why }); }
          if (dd) {
            st.direct++; note({ kind: 'DIRECT', name: input.name, kinds: dd.kinds });
            setTimeout(function () { cb({ ok: true, code: null, appearance: dd.text, base: dd.text, gender: dd.gender, genderFixed: !!genderOf(input.gender),
              added: [], rejected: [], dropped: dd.dropped, droppedVisual: dd.droppedVisual || [], missing: [], aiCalled: false, direct: true, version: VERSION }); }, 0);
            return;
          }
        }
      } catch (e) { if (e !== 'regen') note({ kind: 'DIRECT_THREW', e: String(e).slice(0, 80) }); }
      st.aiPass++;
      return orig.apply(this, arguments);
    };
    P.__iconux2 = { orig: orig }; st.wrapped = true;
  }

  /* ---------- 文言 ---------- */
  var GUIDE2 = '絵は 👥 キャラ の「🎨 絵を作る」で作ります';
  var DICE_NOTE = '🎲 は空いている欄だけを埋めます。キャラのアイコンは 👥 キャラ の「🎨 絵を作る」で作れます（説明文の見た目から外見の下書きを出し、「この外見で作る」で絵にします）。';
  function costBefore(rs, direct) {
    if (rs.cand && !rs.has) return '作った候補から選びます（画像は使いません）';
    if (rs.conf) return rs.has ? '押すと、確定済みの外見で新しい候補を 1 枚作ります（画像 1 回）。選ぶまで今の絵は変わりません'
                               : '押すと、確定済みの外見で絵を 1 枚作ります（画像 1 回）';
    return direct ? '押すと、説明文にある見た目を外見の下書きにします（AI・画像は使いません）'
                  : '押すと、説明文からAIが外見の下書きを作ります（文章AI 1 回。絵はまだ作りません）';
  }
  function costGo(rs) {
    return rs.has ? 'この外見を保存して、新しい候補を 1 枚作ります（画像 1 回）。選ぶまで今の絵は変わりません'
                  : 'この外見を保存して、絵を 1 枚作ります（画像 1 回）';
  }

  /* ---------- 見た目 ---------- */
  function css() {
    if (document.getElementById('v292DfixICONUX2-style')) return;
    var s = document.createElement('style'); s.id = 'v292DfixICONUX2-style';
    s.textContent =
      '#v292DfixLC1-wa[data-iconux2-quiet="1"] [data-lc1-rows]{display:none!important}' +
      '#v292DfixLC1-wa .iconux2-wnote{font-size:11.5px;color:#9a9aae;margin:2px 0 0}' +
      '[data-iconux2="slot"]{margin-top:6px}' +
      '.iconux2-main{background:#2f5d4f;border:1px solid #6fb39a;color:#fff;font-weight:bold;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer;min-height:44px}' +
      '.iconux2-main:disabled{opacity:.5}.iconux2-main.iconux2-wait{background:#2a2f2d;border-color:#555;font-weight:normal;font-size:13px;min-height:40px}' +
      '.iconux2-cost{font-size:11.5px;color:#a8b8b0;margin:4px 0 0;line-height:1.5}' +
      '.iconux2-msg{font-size:12px;margin:4px 0 0;line-height:1.5;color:#c8c8d0}.iconux2-msg.ok{color:#9fd49f}.iconux2-msg.ng{color:#f0a0a0}.iconux2-msg.info{color:#e0c080}' +
      '.iconux2-panel{margin-top:6px;padding:8px;border:1px solid #6fb39a;border-radius:8px;background:#16201c}' +
      '.iconux2-panel .iconux2-lab{font-size:12px;color:#cfe6dc;font-weight:bold}' +
      '.iconux2-panel textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;background:#1a1a22;border:1px solid #555;color:#eee;padding:6px;border-radius:6px;font-size:14px;line-height:1.5}' +
      '.iconux2-panel select{background:#1a1a22;color:#eee;border:1px solid #555;border-radius:4px;font-size:13px;margin-left:6px;min-height:32px}' +
      '.iconux2-panel .iconux2-sub{font-size:11px;color:#9aa;margin-top:3px;line-height:1.5}' +
      '.iconux2-go{background:#2f6d4f;border:1px solid #7fc3a0;color:#fff;font-weight:bold;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer;min-height:44px;margin-top:8px}' +
      '.iconux2-go:disabled{opacity:.5}' +
      '.iconux2-links{margin-top:6px}.iconux2-links button{background:none;border:none;color:#9ab4d8;text-decoration:underline;font-size:12px;padding:6px 8px 6px 0;cursor:pointer;min-height:32px}' +
      '.iconux2-fix button{background:#3a4a5a;border:1px solid #666;color:#fff;border-radius:6px;padding:6px 12px;font-size:13px;margin:6px 6px 0 0;min-height:40px}' +
      '[data-iconux2="exit"]{background:#4a3434;border:1px solid #6a4a4a;color:#ddd;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin:4px 4px 0 0}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- LC1 の（隠した）行を読む・押す ---------- */
  function wa() { return document.getElementById('v292DfixLC1-wa'); }
  function rowEl(cid) { var w = wa(); return w ? w.querySelector('[data-lc1-row="' + cid + '"]') : null; }
  function lc1Btn(cid, act) { var w = wa(); return w ? w.querySelector('[data-lc1="' + act + '"][data-cid="' + cid + '"]') : null; }
  function press(cid, act) { var b = lc1Btn(cid, act); if (!b || b.disabled) return false; tap(act); note({ kind: 'PRESS', act: act, cid: cid }); b.click(); return true; }
  function rowsById(x) { var o = {}; try { (x.status().rows || []).forEach(function (r) { o[r.cid] = r; }); } catch (e) {} return o; }
  function syncToLc1(cid, card) {
    var a = card.querySelector('[data-iconux2-a]'), g = card.querySelector('[data-iconux2-g]');
    var la = rowEl(cid) && rowEl(cid).querySelector('[data-lc1-a="' + cid + '"]'), lg = rowEl(cid) && rowEl(cid).querySelector('[data-lc1-g="' + cid + '"]');
    if (a && la && la.value !== a.value) { la.value = a.value; la.dispatchEvent(new Event('input', { bubbles: true })); }
    if (g && lg && lg.value !== g.value) { lg.value = g.value; lg.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  /* ---------- 候補を選んだ後の文言（表示だけ）: LC1 の行は「候補を1枚作りました（まだ採用していません）」のまま残るので、
     av2 のピッカーで「この絵にする」が成功したら、そのキャラのカードでは「この絵にしました」と出す ---------- */
  var adopted = {}, pendingAdopt = null, checked = {};
  document.addEventListener('click', function (ev) {
    try { var b = ev.target && ev.target.closest && ev.target.closest('#v292Dav2-picker [data-av2-pick="adopt"]'); if (!b) return;
      var pk = document.getElementById('v292Dav2-picker'); var m = pk && /「(.+)」の候補/.exec(pk.textContent || ''); if (m) pendingAdopt = { name: m[1], t: Date.now() }; } catch (e) {}
  }, true);
  function checkAdopt() {
    if (!pendingAdopt) return; var pk = document.getElementById('v292Dav2-picker'); var msg = pk ? ((pk.querySelector('[data-av2-pick="msg"]') || {}).textContent || '') : '';
    if (/この絵にしました|既にこの絵です/.test(msg)) { adopted[pendingAdopt.name] = Date.now(); pendingAdopt = null; return; }
    if (!pk || Date.now() - pendingAdopt.t > 30000) pendingAdopt = null;   /* 閉じた・失敗 → 何も言い換えない */
  }

  /* ---------- カード 1 枚の操作欄 ---------- */
  function renderSlot(card, cid, rs, bulk) {
    var slot = card.querySelector('[data-iconux2="slot"]');
    if (!slot) {
      slot = document.createElement('div'); slot.setAttribute('data-iconux2', 'slot');
      var anchor = card.querySelector('.lc1-detail-tg'); var col = card.children[1] || card;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor); else col.appendChild(slot);
    }
    var tg0 = card.querySelector('.lc1-detail-tg');                 /* 主ボタンは「その他の操作」の上に置く（後から付いた「その他」の位置に合わせ直す） */
    if (tg0 && tg0.parentNode && slot.nextElementSibling !== tg0) { try { tg0.parentNode.insertBefore(slot, tg0); } catch (e) {} }
    var re = rowEl(cid);
    var mainB = lc1Btn(cid, 'main');
    var mainLab = mainB ? mainB.textContent.trim() : '';
    var msgEl = re && re.querySelector('[data-lc1-msg="' + cid + '"]');
    var msg = msgEl ? msgEl.textContent : '', tone = msgEl ? (msgEl.className.replace('lc1-msg', '').trim()) : '';
    var nm0 = card.getAttribute('data-name') || '';
    if (adopted[nm0] && /候補を1枚作りました/.test(msg)) { msg = 'この絵にしました'; tone = 'ok'; }
    var stTxt = re ? ((re.querySelector('.lc1-st') || {}).textContent || '') : '';
    var fixActs = ['retry', 'check', 'fix'].filter(function (k) { return !!lc1Btn(cid, k); });
    var proposed = !!(re && re.querySelector('[data-lc1-prop]')) && !bulk;
    var sug = null; try { sug = A() && A().suggestAppearance ? A().suggestAppearance(cid) : null; } catch (e) {}
    var direct = !!(sug && sug.ok && !rs.conf && directDraft(sug.desc, sug.gender));
    var unknown = fixActs.indexOf('check') >= 0 && !checked[cid];   /* LOW-a: 結果が分からない間は主ボタンを止める（「結果を確かめる」を押したら戻す） */
    var sig = [rs.phase, rs.has, rs.conf, rs.cand, mainLab, msg, tone, fixActs.join(','), proposed ? 1 : 0, bulk ? 1 : 0, direct ? 1 : 0, unknown ? 1 : 0, rs.phase === 'proposed' ? '' : stTxt].join('|');
    var ae = document.activeElement, editing = !!(ae && slot.contains(ae) && /^(TEXTAREA|SELECT)$/.test(ae.tagName));
    if (slot.__sig === sig) return;
    if (editing && proposed && slot.__proposed) { /* 入力中は差し替えない（文言の行だけ直す） */ var m0 = slot.querySelector('[data-iconux2-msg]'); if (m0) { m0.textContent = msg; m0.className = 'iconux2-msg ' + tone; } return; }
    slot.__sig = sig; slot.__proposed = proposed;
    var h = '';
    if (bulk) {
      h += '<div class="iconux2-msg info">絵: ' + esc(stTxt || '…') + '（上の「まとめて」で操作中）</div>';
    } else if (proposed) {
      var la = re.querySelector('[data-lc1-a="' + cid + '"]'), lg = re.querySelector('[data-lc1-g="' + cid + '"]'), sub = re.querySelector('[data-lc1-sub="' + cid + '"]');
      var val = la ? la.value : (rs.pa || ''), gv = lg ? lg.value : (rs.pg || '');
      var P = PR(), canRegen = !!(P && P.missingOf && P.missingOf(val).length);
      h += '<div class="iconux2-panel" data-iconux2="panel">' +
        '<div class="iconux2-lab">外見の下書き（直さなくても大丈夫です）</div>' +
        '<label style="font-size:12px;color:#ccc">性別<select data-iconux2-g="' + esc(cid) + '"><option value=""' + (!gv ? ' selected' : '') + '>未設定</option><option value="女性"' + (gv === '女性' ? ' selected' : '') + '>女性</option><option value="男性"' + (gv === '男性' ? ' selected' : '') + '>男性</option></select></label>' +
        '<textarea rows="3" maxlength="400" data-iconux2-a="' + esc(cid) + '">' + esc(val) + '</textarea>' +
        (sub ? '<div class="iconux2-sub">' + esc(sub.textContent) + '</div>' : '') +
        '<button type="button" class="iconux2-go" data-iconux2-act="go">この外見で作る</button>' +
        '<div class="iconux2-cost" data-iconux2-cost="go">' + esc(costGo(rs)) + '</div>' +
        '<div class="iconux2-msg ' + esc(tone) + '" data-iconux2-msg="1">' + esc(msg) + '</div>' +
        '<div class="iconux2-links">' + (canRegen ? '<button type="button" data-iconux2-act="regen">AIに足りない所を足してもらう（文章AI 1 回）</button>' : '') +
        '<button type="button" data-iconux2-act="cancel">やめる</button></div></div>';
    } else {
      var okFirst = !!(msg && tone === 'ok');                 /* 「絵を作りました」などの結果は、次のボタンより先に出す */
      if (okFirst) { h += '<div class="iconux2-msg ok" data-iconux2-msg="1">✓ ' + esc(msg) + '</div>'; msg = ''; }
      var lab = { retry: 'もう一度', check: '結果を確かめる', fix: '外見を直す' };
      var fixH = fixActs.length ? '<div class="iconux2-fix">' + fixActs.map(function (k) { return '<button type="button" data-iconux2-act="' + k + '">' + lab[k] + '</button>'; }).join('') + '</div>' : '';
      if (unknown) {                                          /* 理由 → 「結果を確かめる」 → 止めた主ボタン の順 */
        if (msg) h += '<div class="iconux2-msg ' + esc(tone) + '" data-iconux2-msg="1">' + esc(msg) + '</div>';
        h += fixH;
        if (mainB) h += '<button type="button" class="iconux2-main iconux2-wait" data-iconux2-act="main" data-iconux2-wait="1" disabled>🎨 ' + esc(mainLab) + '</button>' +
          '<div class="iconux2-cost" data-iconux2-cost="wait">先に「結果を確かめる」を押してください（同じ絵を二重に作らないため）</div>';
      } else {
        if (mainB) {
          h += '<button type="button" class="iconux2-main" data-iconux2-act="main">🎨 ' + esc(mainLab) + '</button>';
          h += '<div class="iconux2-cost" data-iconux2-cost="main">' + esc(costBefore(rs, direct)) + '</div>';
        } else {
          h += '<div class="iconux2-msg info">' + esc(stTxt || '…') + '</div>';
        }
        if (msg) h += '<div class="iconux2-msg ' + esc(tone) + '" data-iconux2-msg="1">' + esc(msg) + '</div>';
        h += fixH;
      }
    }
    slot.innerHTML = h;
    if (!slot.__wired) {
      slot.__wired = true;
      slot.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest && ev.target.closest('[data-iconux2-act]'); if (!b) return;
        ev.stopPropagation(); var act = b.getAttribute('data-iconux2-act'); var c = slot.closest('.v292Dfix145-card'); var id = c && c.getAttribute('data-av2-cid'); if (!id) return;
        if (b.disabled) return;
        if (act === 'go' || act === 'regen') syncToLc1(id, c);
        if (act === 'check') checked[id] = Date.now(); else if (act === 'main' || act === 'retry' || act === 'go') delete checked[id];
        press(id, act); slot.__sig = null; setTimeout(pass, 30);
      });
      slot.addEventListener('input', function () { var c = slot.closest('.v292Dfix145-card'); var id = c && c.getAttribute('data-av2-cid'); if (id) syncToLc1(id, c); });
      slot.addEventListener('change', function () { var c = slot.closest('.v292Dfix145-card'); var id = c && c.getAttribute('data-av2-cid'); if (id) syncToLc1(id, c); });
    }
  }

  /* ---------- (C) カードのボタンを減らす ---------- */
  function declutter(card, hasRow) {
    var tg = card.querySelector('.lc1-detail-tg');
    if (tg && /^詳細/.test(tg.textContent)) tg.textContent = tg.textContent.replace(/^詳細/, 'その他の操作');
    var box = card.querySelector('[data-av2-ui="card"]');
    if (box) {
      var ef = box.querySelector('[data-av2-ef]');
      if (ef && hasRow) { if (ef.style.display !== 'none') { ef.style.display = 'none'; ef.setAttribute('data-iconux2-hidden', '1'); } }
      else if (ef && ef.getAttribute('data-iconux2-hidden') === '1') { ef.style.display = ''; ef.removeAttribute('data-iconux2-hidden'); }   /* LOW-d: LC1 の行が無い（退場など）→ 古い入口を残す */
    }
    /* 退場 / 復活（fix298）: 表から隠して「その他の操作」の中へ（元のボタンを押すだけ） */
    var exits = Array.prototype.filter.call(card.querySelectorAll('button'), function (b) { return !b.closest('[data-av2-ui="card"]') && !b.hasAttribute('data-iconux2') && /^(🚪 退場|↩ 復活)/.test((b.textContent || '').trim()); });
    exits.forEach(function (orig) {
      if (orig.style.display !== 'none') { orig.style.display = 'none'; orig.setAttribute('data-iconux2-hidden', '1'); }
      if (!box) return;
      var px = box.querySelector('[data-iconux2="exit"]');
      if (!px) { px = document.createElement('button'); px.type = 'button'; px.setAttribute('data-iconux2', 'exit'); box.insertBefore(px, box.firstChild);
        px.onclick = function (ev) { ev.stopPropagation(); tap('exit'); var c = px.closest('.v292Dfix145-card'); var o = c && Array.prototype.filter.call(c.querySelectorAll('button[data-iconux2-hidden]'), function (b) { return /^(🚪|↩)/.test((b.textContent || '').trim()); })[0]; if (o && !o.disabled) o.click(); }; }
      var t = (orig.textContent || '').trim(); if (px.textContent !== t) px.textContent = t; px.disabled = !!orig.disabled;
    });
    var gd = card.querySelector('[data-fg3-hero-guide]'); if (gd && gd.style.display !== 'none') gd.style.display = 'none';
  }

  /* ---------- 1 回の見直し ---------- */
  function pass() {
    st.passes++;
    wrapPropose();
    var x = lc1();
    try { checkAdopt(); } catch (e) {}
    try { var dn = document.getElementById('b37-dice-note'); if (x && dn && dn.textContent !== DICE_NOTE) dn.textContent = DICE_NOTE; } catch (e) {}
    try { if (x) Array.prototype.forEach.call(document.querySelectorAll('[data-fg3-hero-guide]'), function (g) { if (!g.closest('.v292Dfix145-card') && g.textContent !== GUIDE2) g.textContent = GUIDE2; }); } catch (e) {}
    if (!x) return;
    var w = wa(); if (!w) return;
    css();
    var stt = null; try { stt = x.status(); } catch (e) {}
    var bulk = !!(stt && stt.bulk);
    if (bulk) w.removeAttribute('data-iconux2-quiet'); else if (w.getAttribute('data-iconux2-quiet') !== '1') w.setAttribute('data-iconux2-quiet', '1');
    var wn = w.querySelector('.iconux2-wnote'), host = w.querySelector('[data-lc1-rows]');
    if (!bulk && host) { if (!wn) { wn = document.createElement('div'); wn.className = 'iconux2-wnote'; host.parentNode.insertBefore(wn, host); }
      var t0 = '1 人ずつ作るときは、下の各キャラの「🎨 絵を作る」を押してください。'; if (wn.textContent !== t0) wn.textContent = t0; }
    else if (wn && wn.parentNode) wn.parentNode.removeChild(wn);
    var rows = rowsById(x);
    var cards = document.querySelectorAll('.v292Dfix145-card[data-av2-cid]');
    for (var j = 0; j < cards.length; j++) {
      var c = cards[j], cid = c.getAttribute('data-av2-cid'), rs = rows[cid];
      try { declutter(c, !!rs); } catch (e) {}
      if (!rs) { var old = c.querySelector('[data-iconux2="slot"]'); if (old && old.parentNode) old.parentNode.removeChild(old); continue; }   /* LOW-d: 行が無くなったキャラ → 2 タップの欄も外す */
      try { renderSlot(c, cid, rs, bulk); } catch (e) { note({ kind: 'SLOT_THREW', e: String(e).slice(0, 80) }); }
    }
  }
  var timer = null;
  function soon() { if (timer) return; timer = setTimeout(function () { timer = null; pass(); }, 80); }
  function start() {
    try { new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    setInterval(pass, 1500); pass();
  }
  window.__v292DfixICONUX2 = { on: true, version: VERSION, directDraft: directDraft, directCheck: directCheck,
    status: function () { return JSON.parse(JSON.stringify({ version: VERSION, passes: st.passes, taps: st.taps, direct: st.direct, aiPass: st.aiPass, regenAi: st.regenAi || 0, refused: st.refused || {}, wrapped: st.wrapped, log: st.log.slice(-30) })); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
