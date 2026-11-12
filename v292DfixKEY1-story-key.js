/* v292DfixKEY1-story-key.js (2026-11-12 / GPT #127-SG Q10) — localStorage のキーが「どの物語のものか」を完全一致で決める共通の判定
 *
 * ■なぜ必要か
 *   fix562 sideStoreKeys / slotFromKey / classifyKey、fix564 partKeys、fix579 isBlockedByTombstone、
 *   fix587 validateDurableRecovery、fixE64 keyOf は、キー名に物語 id が「含まれるか」（indexOf）で持ち主を決めていた。
 *   旧 id a/b/c/default のような短い id や、別 id の接頭辞になる id（sabcdefgh と sabcdefgh1）では
 *   他の物語のキーやシナリオ（chr6_scenario_*）まで自分のものとして拾う（fixture で 'a' が 121 キー）。
 *
 * ■規則
 *   ・既知の family（下の表。各 family の書き手のファイルは KEY1 の README に表で記録）だけを見る。
 *   ・id は family の区切り（接頭辞の直後〜キーの終わり、引用符、snapshot の _<時刻>）で囲まれた
 *     「丸ごと 1 語」（[A-Za-z0-9]+）でなければならない。部分一致はしない。
 *   ・どの family にも当たらない形のキーは「どの物語のものでもない」＝ null（消してよい根拠にならない）。
 *   ・chr6_scenario_* は物語のキーではない（常に null）。
 *   ・接尾辞の無い旧既定物語のキー（chr6 / v292Dfix77States など）はここでは物語に割り当てない（呼び出し側の既存の扱いのまま）。
 *
 * ■書かない・送らない
 *   localStorage へ 1 バイトも書かない。読むのは kill キー 1 本だけ。通信 0。
 *
 * kill: localStorage v292DfixKEY1Off='1' → enabled() が false を返し、各呼び出し側は今日の部分一致の式をそのまま使う。
 * API : window.__v292DfixKEY1 = { enabled(), storyOf(k), belongs(k,id), mentions(k,id), keysOf(id,keys,opt), backupSlotOf(k,live), rekey(k,from,to), FAMILIES }
 */
(function v292DfixKEY1(){
  if (window.__v292DfixKEY1) return;
  var ID_RE = /^[A-Za-z0-9]+$/;
  /* family = 接頭辞 + id（id でキーが終わる形）。kind は呼び出し側が使い分けるための目安。 */
  var FAMILIES = [
    ['chr6_slot_', 'body'],
    ['chr6_relations_', 'side'], ['chr6_char_states_', 'side'], ['chr6_char_flags_', 'side'], ['chr6_pending_dice_', 'side'],
    ['chr6_turn_summaries_', 'side'], ['chr6_chapter_titles_', 'side'], ['chr6_scene_breaks_', 'side'], ['chr6_scene_summaries_', 'side'],
    ['v292Dfix77States_slot_', 'side'], ['chr6_v292Dfix104_dlg_slot_', 'side'], ['chr6_v292Dfix135_sum_slot_', 'side'],
    ['chr6_v292Dfix135_last_slot_', 'side'], ['chr6_v292Dfix136_wi_slot_', 'side'], ['chr6_v292Dfix137_ev_slot_', 'side'],
    ['v292Dfix277Quasi_slot_', 'side'], ['v292Dfix298_slot_', 'side'], ['v292Dfix307Last_slot_', 'side'], ['v292Dfix307Roster_slot_', 'side'],
    ['v292Dfix640Evid_slot_', 'side'], ['v292Dfix640PgOn_slot_', 'flag'], ['v292Dfix924LinRev_slot_', 'side'],
    ['v292Dfix844On_slot_', 'flag'], ['v292Dfix845On_slot_', 'flag'], ['v292DfixCmfOn_slot_', 'flag'], ['v292Dfix382Touched_slot_', 'flag'],
    ['v292Dfix374Chosen_chr6_slot_', 'flag'],
    ['v292Dmem1_slot_', 'side'], ['v292capp_slot_', 'side'], ['v292aiInstr_slot_', 'side'], ['v292cover_seed_', 'side'],
    ['v292Dav2_mig_', 'side'], ['v292Dav2_reg_', 'side'], ['v292Dav2_blk_', 'side'], ['v292Dav2_cfl_', 'side'],
    ['v292DfixB37onb_', 'flag'],
    ['v292Dfix402_f781g_', 'sync'], ['v292Dfix402_f911_', 'sync'], ['v292Dfix402_f697p_', 'sync'],
    ['v292Dfix945_rescue_', 'rescue'],
    ['chr6_storysess_', 'vault'],
    ['__gen_chr6_slot_', 'gen']
  ];
  /* 長い接頭辞から先に見る（v292Dfix374Chosen_chr6_slot_ と chr6_slot_ のような包含を取り違えない） */
  FAMILIES.sort(function(a, b){ return b[0].length - a[0].length; });
  var GENDER_RE = /^chr6_v292Dfix54_genderMap_("?)([A-Za-z0-9]+)\1$/;
  var SNAP_RE = /^chr6_snap_([A-Za-z0-9]+)_(\d+)$/;
  var SNAPD_RE = /^chr6_snapd_([A-Za-z0-9]+)_(\d+)_(\d+)$/;
  var F970_PRE = 'v292Dfix970Log_';

  function enabled(){ try { return localStorage.getItem('v292DfixKEY1Off') !== '1'; } catch(e){ return true; } }

  function storyOf(key){
    var k = String(key == null ? '' : key);
    if (!k || k.indexOf('chr6_scenario_') === 0) return null;
    var m = GENDER_RE.exec(k);
    if (m) return { id: m[2], family: 'chr6_v292Dfix54_genderMap_', kind: 'side' };
    m = SNAP_RE.exec(k);  if (m) return { id: m[1], family: 'chr6_snap_', kind: 'snapshot' };
    m = SNAPD_RE.exec(k); if (m) return { id: m[1], family: 'chr6_snapd_', kind: 'snapshot' };
    if (k.indexOf(F970_PRE) === 0){
      var p = k.lastIndexOf('_slot_');
      if (p > F970_PRE.length){ var id9 = k.slice(p + 6); if (ID_RE.test(id9)) return { id: id9, family: F970_PRE, kind: 'log' }; }
      return null;
    }
    for (var i = 0; i < FAMILIES.length; i++){
      var pre = FAMILIES[i][0];
      if (k.length > pre.length && k.slice(0, pre.length) === pre){
        var id = k.slice(pre.length);
        return ID_RE.test(id) ? { id: id, family: pre, kind: FAMILIES[i][1] } : null;
      }
    }
    return null;
  }
  function belongs(key, id){
    var want = String(id == null ? '' : id);
    if (!want || !ID_RE.test(want)) return false;
    var s = storyOf(key);
    return !!(s && s.id === want);
  }
  /* 遮断側（墓標の取り込みバリア・E64 の送信停止）向け: 形が既知でなくても、id が英数字の境界で区切られた
     「丸ごと 1 語」として現れれば当たり（fix821 f821KeyBelongs と同じ境界）。接頭辞の衝突だけを取り除き、
     遮断の範囲は部分一致より狭めすぎない。シナリオは対象外。 */
  function mentions(key, id){
    var k = String(key == null ? '' : key), want = String(id == null ? '' : id);
    if (!k || !want || k.indexOf('chr6_scenario_') === 0) return false;
    var at = 0;
    for (;;){
      var p = k.indexOf(want, at); if (p < 0) return false;
      var a = (p === 0) ? '' : k.charAt(p - 1), b = k.charAt(p + want.length);
      if (!/[A-Za-z0-9]/.test(a) && !/[A-Za-z0-9]/.test(b)) return true;
      at = p + 1;
    }
  }
  /* id の既知 family のキー（opt.body / opt.snapshots で本体・snapshot を含めるか）。keys は列挙済みのキー配列。 */
  function keysOf(id, keys, opt){
    opt = opt || {};
    var out = [], want = String(id == null ? '' : id);
    if (!want || !ID_RE.test(want)) return out;
    for (var i = 0; i < (keys || []).length; i++){
      var s = storyOf(keys[i]);
      if (!s || s.id !== want) continue;
      if (s.kind === 'body' && !opt.body) continue;
      if (s.kind === 'snapshot' && !opt.snapshots) continue;
      out.push(keys[i]);
    }
    return out;
  }
  /* 控え（chr6_bk_*）の持ち主: 中に chr6_slot_<id> があればそれ（英数字が続かない所まで＝もともと完全一致）、
     無ければ生きている id のうち「丸ごと 1 語」で現れるもの。2 つ以上当たるなら決めない（null）。 */
  function backupSlotOf(key, live){
    var k = String(key == null ? '' : key);
    var m = k.match(/chr6_slot_([A-Za-z0-9]+)/);
    if (m) return m[1];
    var hit = null;
    for (var i = 0; i < (live || []).length; i++){
      if (mentions(k, live[i])){ if (hit !== null && hit !== live[i]) return null; hit = live[i]; }
    }
    return hit;
  }

  /* fromId のキーを toId の同じ family のキーへ写す（fix564 の別スロット復元用）。fromId のキーでなければ null。 */
  function rekey(key, fromId, toId){
    var k = String(key == null ? '' : key), to = String(toId == null ? '' : toId);
    if (!ID_RE.test(to) || !belongs(k, fromId)) return null;
    var s = storyOf(k), f = String(fromId);
    if (s.family === 'chr6_v292Dfix54_genderMap_'){ var q = (k.charAt(k.length - 1) === '"') ? '"' : ''; return s.family + q + to + q; }
    if (s.family === 'chr6_snap_' || s.family === 'chr6_snapd_') return s.family + to + k.slice(s.family.length + f.length);
    if (s.family === F970_PRE) return k.slice(0, k.length - f.length) + to;
    return s.family + to;
  }

  window.__v292DfixKEY1 = {
    ver: 'key1-20261112',
    enabled: enabled, storyOf: storyOf, belongs: belongs, mentions: mentions,
    keysOf: keysOf, backupSlotOf: backupSlotOf, rekey: rekey,
    FAMILIES: FAMILIES.map(function(f){ return f[0]; }).concat(['chr6_v292Dfix54_genderMap_"<id>"', 'chr6_snap_<id>_<ts>', 'chr6_snapd_<id>_<ts>_<n>', 'v292Dfix970Log_<owner>_slot_<id>'])
  };
})();
