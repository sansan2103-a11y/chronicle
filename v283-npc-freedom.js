// v283-npc-freedom.js
//
// 目的: 「全 NPC を毎ターン強制的に登場させなきゃ」という LLM へのプレッシャーを外す
//       — おしんさん 2026-05-09 要望「強制じゃなく自由度を持たせたい」
//
// 背景:
//   index.html の Planner.build (line 944-) が組み立てる system prompt には、
//   登録されている NPC の心理プロファイルと名前リストが **毎ターン全員分**
//   投入されている。さらに見出しが「【NPC心理プロファイル（これを基にNPCを演じる）】」
//   になっており、LLM 側が「この全員を演じなきゃ」と感じる傾向がある。
//
//   結果、場面に必要のないキャラまで毎ターン無理やり登場させられる挙動になっていた。
//
// 哲学:
//   「制約より刺激」を維持。新しい禁止文言・強制ロジック・キャラフィルタは追加しない。
//   **ラベルを肯定文化** + 「自由に選んでよい」を明示する。
//   情報量 (心理プロファイル本体) は一切削らない。
//
// 動作:
//   Planner.build を wrap し、orig が返した r.sys に対して以下を置換:
//
//   1. 「【NPC心理プロファイル（これを基にNPCを演じる）】」
//      → 「【登場できるNPCたち（場面に必要な者だけ自然に登場させてよい）】」
//
//   2. 「【名前・役割固定】」 セクションの NPC 名行の直後に補足を挿入:
//      → 「（全員を毎ターン登場させる必要はない。場面の流れに必要な者だけ自然に。）」
//
//   3. Simple Mode の「【NPC】\n」見出し
//      → 「【登場できるNPC（必要な者だけ自然に登場させてよい）】\n」
//
//   いずれも禁止・強制ゼロ追加。肯定文だけ。
//
// ガード: window.__v283Active

(function v283() {
  'use strict';
  if (window.__v283Active) return;
  window.__v283Active = true;
  console.log('[v283] npc-freedom init');

  // ============================================================
  // sys プロンプト変換
  // ============================================================
  var OLD_PROFILE_LABEL = '【NPC心理プロファイル（これを基にNPCを演じる）】';
  var NEW_PROFILE_LABEL = '【登場できるNPCたち（場面に必要な者だけ自然に登場させてよい）】';

  // 「NPC名: A / B / C」 の直後 (改行をはさんで「名前の入れ替え・役割混線は禁止」の手前) に
  // 補足を挿入する。idempotent にするため既に補足が入っていればスキップ。
  var ROLE_TAIL_LINE = '名前の入れ替え・役割混線は禁止';
  var FREEDOM_HINT = '（全員を毎ターン登場させる必要はない。場面の流れに必要な者だけ自然に。）';

  // Simple Mode の「【NPC】\n」 見出し
  var OLD_SIMPLE_LABEL = '【NPC】\n';
  var NEW_SIMPLE_LABEL = '【登場できるNPC（必要な者だけ自然に登場させてよい）】\n';

  function transformSys(s) {
    if (!s || typeof s !== 'string') return s;
    var modified = false;

    // 1. プロファイル見出しの肯定文化
    if (s.indexOf(OLD_PROFILE_LABEL) > -1 && s.indexOf(NEW_PROFILE_LABEL) < 0) {
      s = s.split(OLD_PROFILE_LABEL).join(NEW_PROFILE_LABEL);
      modified = true;
    }

    // 2. 役割固定セクションに自由度ヒントを挿入
    //    パターン: "...NPC名: ... \n名前の入れ替え・役割混線は禁止"
    //    → ヒントを ROLE_TAIL_LINE の直前に 1 行挟む
    if (s.indexOf(ROLE_TAIL_LINE) > -1 && s.indexOf(FREEDOM_HINT) < 0) {
      s = s.replace(ROLE_TAIL_LINE, FREEDOM_HINT + '\n' + ROLE_TAIL_LINE);
      modified = true;
    }

    // 3. Simple Mode の NPC ラベル
    if (s.indexOf(OLD_SIMPLE_LABEL) > -1 && s.indexOf(NEW_SIMPLE_LABEL) < 0) {
      s = s.split(OLD_SIMPLE_LABEL).join(NEW_SIMPLE_LABEL);
      modified = true;
    }

    if (modified && !window.__v283LoggedOnce) {
      console.log('[v283] sys prompt relabeled (first turn logged)');
      window.__v283LoggedOnce = true;
    }
    return s;
  }

  // ============================================================
  // Planner.build wrap
  // ============================================================
  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v283Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (r && r.sys) r.sys = transformSys(r.sys);
      } catch (e) {
        console.warn('[v283] err:', e && e.message);
      }
      return r;
    };
    Planner.build.__v283Wrapped = true;
    console.log('[v283] Planner.build wrapped');
    return true;
  }
  setTimeout(wrapPlanner, 0);
  setTimeout(wrapPlanner, 500);
  setTimeout(wrapPlanner, 2000);
  setTimeout(wrapPlanner, 5000);
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  // ============================================================
  // API (デバッグ用)
  // ============================================================
  window.__v283 = {
    transformSys: transformSys
  };

  console.log('[v283] init complete');
})();
