// v289-auto-cast-bootstrap.js
//
// 目的: 「設定パネルを使わずに STORY 入力でいきなりプレイ開始した場合」、
//       S.cast.hero / S.cast.npcs / S.scene が永続的に空のままになる問題を修正。
//
// 観察 (Claude 2026-05-11 実機テスト):
//   - リセット後 STORY モードで「夜の港町。元衛兵の女剣士サヤカは…」と入力
//   - 6 ターン進行した時点でも S.cast.hero.name="" / S.cast.npcs=[] / S.scene.loc=""
//   - LLM は narrative から毎ターン登場人物を再推論する状態になり、結果:
//     * 突然「鎖」「銀髪女性」など未設定要素を「既知」として挿入
//     * 同型の絶叫パターンが反復 (アンカー不在で物語が前進しない)
//     * プレイヤー指示「剣抜き距離取る」を「膝つき動けない」に上書き
//
// 原因:
//   - v286/v285/v286b 系の seed expansion は UI 設定パネル (cfgHName/cfgLoc 等) の値が
//     入力ソース。プレイヤーが設定パネルをスキップして STORY からスタートすると
//     永久に空のまま。
//   - Planner.build (index.html line 943-) は user payload に
//     S.cast.hero / S.cast.npcs / S.scene を入れて LLM に送信するが、空のまま送信。
//   - 結果として LLM は固定アイデンティティを持たない。
//
// 哲学:
//   - 「制約より刺激」: 抽出した結果は「初期アンカー」として保存するだけ。
//     v286 系の seed expansion や LLM の自由生成を阻害しない。
//   - シンプルなヒューリスティックのみ (追加 LLM 呼び出しなし)。
//
// 動作:
//   1. Planner.build を wrap (最後発で wrap される側)。
//   2. orig 呼び出し直前に、 S.cast.hero.name が空なら:
//      a. 当該 inputText と直近の S.turns[0].playerText から「最初のカタカナ名」を hero に
//      b. 残りのカタカナ名 + dialogue speakers を S.cast.npcs に
//      c. 「夜の港町」「廃墟となった遊園地」など location 系を S.scene.loc に
//      d. 「妹のリンを探す」「謎を解く」など objective 系を S.scene.obj に
//   3. populate 後 orig(inputType, inputText) を呼ぶ → 下流の v286 系も安定動作
//
// idempotent: 既に S.cast.hero.name が入っていたら何もしない。
//
// ガード: window.__v289Active

(function v289() {
  'use strict';
  if (window.__v289Active) return;
  window.__v289Active = true;
  var TAG = '[v289]';
  console.log(TAG, 'auto-cast-bootstrap init');

  // ============================================================
  // ヒューリスティック抽出
  // ============================================================

  // 一般カタカナ名詞 (人名でない) を除外するブラックリスト
  var KATAKANA_BLACKLIST = {
    'ランプ': 1, 'カウンター': 1, 'グラス': 1, 'ガラス': 1, 'ドア': 1,
    'テーブル': 1, 'ベッド': 1, 'テスト': 1, 'ベル': 1, 'ポーチ': 1,
    'シャツ': 1, 'スカート': 1, 'ハンカチ': 1, 'チケット': 1, 'チラシ': 1,
    'ケース': 1, 'スーツ': 1, 'ノート': 1, 'ペン': 1, 'ボタン': 1,
    'ボール': 1, 'スマホ': 1, 'タオル': 1, 'ナイフ': 1, 'フォーク': 1,
    'スプーン': 1, 'コーヒー': 1, 'ティー': 1, 'ワイン': 1, 'ビール': 1,
    'メニュー': 1, 'レジ': 1, 'チェア': 1, 'ソファ': 1, 'カーテン': 1,
    'ベランダ': 1, 'バルコニー': 1, 'マンション': 1, 'アパート': 1,
    'ホテル': 1, 'ホール': 1, 'ロビー': 1, 'コリドー': 1, 'カフェ': 1,
    'バー': 1, 'クラブ': 1, 'パブ': 1, 'プラザ': 1, 'パーク': 1,
    'プール': 1, 'シャワー': 1, 'バスルーム': 1, 'トイレ': 1,
    'パソコン': 1, 'ケータイ': 1, 'モニター': 1, 'カメラ': 1, 'レンズ': 1,
    'マスク': 1, 'コート': 1, 'ブーツ': 1, 'スニーカー': 1, 'ベルト': 1,
    'バッグ': 1, 'リュック': 1, 'ハット': 1, 'キャップ': 1, 'マフラー': 1,
    'ガード': 1, 'シールド': 1, 'アーマー': 1, 'ヘルム': 1, 'ロッド': 1,
    'ポーション': 1, 'マナ': 1, 'ヒール': 1, 'バフ': 1, 'デバフ': 1,
    'ハイ': 1, 'バイ': 1, 'モロ': 1, 'ダメ': 1, 'メモ': 1, 'デモ': 1
  };

  // 名前らしいカタカナトークン (2-6 文字) を拾う
  // - 後ろに「は/が/、/の/と/を/に/」/。/\s/EOS」が来るもの
  function extractKatakanaNames(text) {
    if (!text) return [];
    var rx = /([ァ-ヺ][ァ-ヺー]{1,5})(?=[はがのとをにと、。\s」｜・]|$)/g;
    var out = [];
    var seen = {};
    var m;
    while ((m = rx.exec(text)) !== null) {
      var n = m[1];
      if (!n || n.length < 2) continue;
      if (KATAKANA_BLACKLIST[n]) continue;
      if (seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }
    return out;
  }

  // 名前の直前にある「修飾句」を desc 候補として取り出す
  // 例: "元衛兵の女剣士サヤカは" の "サヤカ" 直前 → "元衛兵の女剣士"
  function extractDescBefore(text, name) {
    if (!text || !name) return '';
    var idx = text.indexOf(name);
    if (idx < 0) return '';
    // 前方をスキャンして「、。\n」までを切り出す
    var head = text.slice(0, idx);
    var cut = Math.max(
      head.lastIndexOf('、'),
      head.lastIndexOf('。'),
      head.lastIndexOf('\n'),
      head.lastIndexOf('「')
    );
    var fragment = head.slice(cut + 1).trim();
    // 過剰に長い/短いケースを除く
    if (fragment.length < 2 || fragment.length > 60) return '';
    return fragment;
  }

  // dialogue speakers を全ターンから集める
  function collectDialogueSpeakers(turns) {
    var counts = {};
    (turns || []).forEach(function (t) {
      var dlg = (t && t.dialogues) || (t && t.plan && t.plan.dialogues) || [];
      dlg.forEach(function (d) {
        var w = (d && (d.who || d.speaker || d.name)) || '';
        if (w) counts[w] = (counts[w] || 0) + 1;
      });
    });
    return counts;
  }

  // scene.loc 抽出 — 「夜の港町」「深夜の廃墟となった遊園地」 etc
  function extractSceneLoc(text) {
    if (!text) return '';
    // 場所末尾の語彙
    var locRx = /((?:深夜|夜|早朝|朝|昼|夕|真昼|真夜中)?の?[぀-ゟ゠-ヿ一-鿿]{2,18}(?:町|村|市|国|城|館|学校|学園|寮|宿|邸|港|森|林|湖|山|海岸|海辺|平原|地下|塔|塞|路地|広場|室|店|喫茶店|酒場|宿屋|遊園地|庭|公園|寺|神社|教会|礼拝堂|工場|研究所|病院|駅|空港|空き地|廃墟|霊廟|地下室|食堂|厨房|寝室|書斎|書店|図書館|雑貨屋|ジム|ジャングル|砂漠|渓谷|洞窟))/;
    var m = text.match(locRx);
    return m ? m[0].trim() : '';
  }

  // scene.obj 抽出 — 「妹のリンを探す」「謎を解く」 etc
  function extractSceneObj(text) {
    if (!text) return '';
    var objRx = /([^、。\n「」]{2,32})(?:を探|を捜|を求|を討|を倒|を解|に向か|に至|を持ち帰|から救|を取り戻|を奪い返|を見つけ)/;
    var m = text.match(objRx);
    if (m) return m[0].trim();
    return '';
  }

  // ============================================================
  // メインのブートストラップ
  // ============================================================

  function isEmpty(s) {
    return !s || (typeof s === 'string' && s.trim().length === 0);
  }

  // 抽出結果を S.cast / S.scene に書き込む
  function applyBootstrap(extracted) {
    if (!window.S || !S.cast) return false;
    var changed = false;

    if (extracted.hero) {
      S.cast.hero = S.cast.hero || {};
      if (isEmpty(S.cast.hero.name)) {
        S.cast.hero.name = extracted.hero.name;
        changed = true;
      }
      if (isEmpty(S.cast.hero.desc) && extracted.hero.desc) {
        S.cast.hero.desc = extracted.hero.desc;
        changed = true;
      }
    }

    if (extracted.npcs && extracted.npcs.length) {
      S.cast.npcs = S.cast.npcs || [];
      var existingNames = {};
      S.cast.npcs.forEach(function (n) { if (n && n.name) existingNames[n.name] = true; });
      extracted.npcs.forEach(function (np) {
        if (existingNames[np.name]) return;
        S.cast.npcs.push({ name: np.name, desc: np.desc || '' });
        existingNames[np.name] = true;
        changed = true;
      });
    }

    if (extracted.scene) {
      S.scene = S.scene || {};
      if (isEmpty(S.scene.loc) && extracted.scene.loc) {
        S.scene.loc = extracted.scene.loc;
        changed = true;
      }
      if (isEmpty(S.scene.obj) && extracted.scene.obj) {
        S.scene.obj = extracted.scene.obj;
        changed = true;
      }
    }

    return changed;
  }

  // 抽出ロジック
  function extractFromTexts(currentInput, prevTurns) {
    // 検査対象 = 現在の input + 過去の playerText (古い順)
    var sources = [];
    if (currentInput && typeof currentInput === 'string') sources.push(currentInput);
    (prevTurns || []).forEach(function (t) {
      if (t && t.playerText) sources.push(t.playerText);
    });
    // 主に使うのは「最初」の入力 (= 一番情報量がある STORY)
    var primary = sources[sources.length - 1] || sources[0] || '';
    if (sources.length >= 2) {
      // 過去の playerText がある場合はそれを優先
      primary = sources[1];
    } else {
      primary = sources[0] || '';
    }

    var combined = sources.join('\n');
    var names = extractKatakanaNames(combined);
    var dialogueSpeakers = collectDialogueSpeakers(prevTurns);

    // hero 候補 = primary 内で **最初** に登場するカタカナ名
    var heroName = '';
    if (names.length) {
      // primary の中で最初に出てくるカタカナ名を hero に
      for (var i = 0; i < names.length; i++) {
        if (primary.indexOf(names[i]) >= 0) {
          heroName = names[i];
          break;
        }
      }
      if (!heroName) heroName = names[0];
    }

    var hero = null;
    if (heroName) {
      hero = {
        name: heroName,
        desc: extractDescBefore(primary, heroName) || extractDescBefore(combined, heroName) || ''
      };
    }

    // NPC 候補 = (カタカナ名のうち hero 以外) ∪ (dialogue speakers のうち hero 以外)
    var npcSet = {};
    var npcs = [];
    names.forEach(function (n) {
      if (n === heroName) return;
      if (npcSet[n]) return;
      npcSet[n] = true;
      var d = extractDescBefore(combined, n);
      npcs.push({ name: n, desc: d || '' });
    });
    Object.keys(dialogueSpeakers).forEach(function (sp) {
      if (sp === heroName) return;
      if (npcSet[sp]) return;
      npcSet[sp] = true;
      npcs.push({ name: sp, desc: '' });
    });

    var scene = {
      loc: extractSceneLoc(primary) || extractSceneLoc(combined),
      obj: extractSceneObj(primary) || extractSceneObj(combined)
    };

    return { hero: hero, npcs: npcs, scene: scene, _names: names, _primary: primary };
  }

  // ============================================================
  // Planner.build wrap
  // ============================================================

  function maybeBootstrap(inputType, inputText) {
    try {
      if (!window.S || !S.cast) return null;
      // 既にハイドレートされてたらスキップ (idempotent)
      if (S.cast.hero && S.cast.hero.name && S.cast.hero.name.trim()) return null;

      var prevTurns = Array.isArray(S.turns) ? S.turns : [];
      var extracted = extractFromTexts(inputText || '', prevTurns);

      if (!extracted.hero && (!extracted.npcs || !extracted.npcs.length) &&
          !extracted.scene.loc && !extracted.scene.obj) {
        // 何も抽出できなかった
        return null;
      }

      var changed = applyBootstrap(extracted);
      if (changed) {
        try { if (S.save) S.save(); } catch (e) { /* ignore */ }
        console.log(TAG, 'bootstrapped:',
          'hero=', extracted.hero ? extracted.hero.name : '(none)',
          'npcs=', (extracted.npcs || []).map(function (n) { return n.name; }).join(','),
          'loc=', extracted.scene.loc,
          'obj=', extracted.scene.obj);
      }
      return extracted;
    } catch (e) {
      console.warn(TAG, 'bootstrap fail:', e && e.message);
      return null;
    }
  }

  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v289Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      maybeBootstrap(inputType, inputText);
      return orig(inputType, inputText);
    };
    Planner.build.__v289Wrapped = true;
    console.log(TAG, 'Planner.build wrapped');
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
  // Public API (デバッグ用)
  // ============================================================
  window.__v289 = {
    extractKatakanaNames: extractKatakanaNames,
    extractDescBefore: extractDescBefore,
    extractSceneLoc: extractSceneLoc,
    extractSceneObj: extractSceneObj,
    extractFromTexts: extractFromTexts,
    applyBootstrap: applyBootstrap,
    maybeBootstrap: maybeBootstrap,
    version: 'v289-1'
  };
})();
