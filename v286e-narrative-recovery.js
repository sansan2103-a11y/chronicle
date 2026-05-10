// v286e-narrative-recovery.js
// 目的: Hermes 4 が JSON ではなく markdown ナラティブで返した場合に、
//       応答テキストから固有名詞・desc を抽出して
//       v286 の applyResult が食える {scene, hero, npcs} 形に変換する。
//
// 背景 (HANDOFF_v286e_narrative_recovery.md §0):
//   v286c (gender-prefix-only blank 検出) が動いたことで NPC[1] も
//   ask 配列に乗るようになったが、Hermes 4 (Nous Research の創作向けモデル)
//   は JSON 厳守を時々破る → safeParseJson が null → applyResult 走らず。
//   実応答 (Test A2 観測):
//     世界は江戸時代、古びた大屋敷に囲まれた妖怪が横行する一村で、
//     スピカの**アリア**は その祓いを生業とする少女であった。彼女の目的は…
//     語りのトーンは重苦しく、不気味な雰囲気を漂わせている。
//
//     スピカの名は**アリア**。彼女は若くもないが、まだ十代半ばといった年頃で…
//
//     第一の NPC、**セレス**。彼女はこの屋敷の元住人であり、今では呪われた少女として…
//   → 中身としては種を保ち、世界を膨らませており success と言える内容。
//   構造を後処理で組み直すだけで applyResult パイプラインに乗せられる。
//
// 哲学 (おしんさん 2026-05-10):
//   - Hermes 4 を「自由に書かせる」モデルとして使う
//   - 後処理で構造化を担保する (LLM には強要しない)
//   - 「制約より刺激」: プロンプトの締め付けは緩める方向に整える
//
// 実装方針:
//   1. window.__v284.safeParseJson を wrap (v286c と同じ idiom)
//   2. orig が成功 (= JSON 戻り値) ならそのまま返す → 完全な後方互換
//   3. orig が null (parse 失敗) のとき、recoverFromNarrative を試みる
//   4. recovery が何か掴めたら {scene?, hero?, npcs?} を返す。
//      何も掴めなければ null (= v286 の "parse failed" 経路に戻る)
//
// recovery アルゴリズム:
//   - 段落分割 (\n\s*\n+)
//   - markdown 強調 \*\*xxx\*\* を固有名詞候補に
//   - 文単位スキャン (。 で split):
//       「世界は」「舞台は」「ロアは」 → scene.lore
//       「場所は」「具体的な場所」      → scene.loc
//       「目的は」「主人公の目的」      → scene.obj
//       「トーンは」「語りのトーン」    → scene.tone
//   - 段落単位でキャラ判定:
//       「主人公」「ヒーロー」マーカー → hero
//       「[hName seed]の名は」          → hero
//       「第◯ の NPC」マーカー          → npc[idx]
//       強調名が hName seed と一致      → hero
//       それ以外で残った段落            → 順番に未割り当て NPC スロットへ
//   - 各 desc から markdown 強調記号 ** を除去
//   - すべて空なら null
//
// チェーン (起動後):
//   v286.runEnhance → callFn().then() → parser(r.text)
//     where parser = window.__v284.safeParseJson (= v286e wrapper)
//                  → orig safeParseJson (JSON 経路)
//                  → recoverFromNarrative (ナラティブ経路、orig が null のとき)
//
// ガード: window.__v286eActive
// 既存ファイル (v286 / v286b / v286c / v286d / v274e / v284) は触らない

(function v286e(){
  'use strict';
  if (window.__v286eActive) return;
  window.__v286eActive = true;
  console.log('[v286e] narrative-recovery init');

  var TAG = '[v286e]';

  // ---------- Helpers ----------
  function val(id){
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function readNpcCardValues(field){
    var out = [];
    document.querySelectorAll('#npcList .npc-card').forEach(function(card){
      var el = card.querySelector('[data-f="' + field + '"]');
      out.push(el ? String(el.value || '').trim() : '');
    });
    return out;
  }

  // 「一」「二」… → 1, 2, …; "1" / "01" → 1
  var KANJI_DIGIT = {
    '一':1, '二':2, '三':3, '四':4, '五':5,
    '六':6, '七':7, '八':8, '九':9, '十':10
  };
  function kanjiOrDigitToInt(s){
    if (!s) return -1;
    var t = String(s).trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (KANJI_DIGIT[t] != null) return KANJI_DIGIT[t];
    // 十一 → 11, 二十 → 20 (簡易)
    if (/^十(\d|[一二三四五六七八九])$/.test(t)){
      var d = t.charAt(1);
      return 10 + (KANJI_DIGIT[d] || parseInt(d, 10) || 0);
    }
    if (/^([一二三四五六七八九])十$/.test(t)){
      return (KANJI_DIGIT[t.charAt(0)] || 0) * 10;
    }
    return -1;
  }

  // markdown 強調記号 ** と先頭末尾の記号系を除去
  function cleanText(s){
    if (!s) return '';
    return String(s)
      .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold** → bold
      .replace(/^[\s。、,.\-—:：]+/, '')
      .replace(/[\s]+$/, '')
      .trim();
  }

  function cleanName(s){
    if (!s) return '';
    return String(s)
      .replace(/[\*「」『』"'\s]/g, '')
      .trim();
  }

  // 段落本文から「第N の NPC、**名前**。」「**名前**は…」「[seed]の名は**xxx**。」
  // のようなヘッダ部分を取り除いて、純粋な desc 本文を返す
  function paraBody(p){
    var t = String(p);
    // 「第N の NPC、**名前**[、。:]?」
    t = t.replace(/^第\s*[一二三四五六七八九十0-9]+\s*の?\s*NPC[、,\s]*\*\*[^*\n]+\*\*[、。:：\s]*/, '');
    // 「[xxx]の名は**名前**[。、:]?」
    t = t.replace(/^[^。\n]{1,30}の名は\s*\*\*[^*\n]+\*\*[、。:：\s]*/, '');
    // 「**名前**[、。:]?」 (paragraph の冒頭が単独の bold name)
    t = t.replace(/^\*\*[^*\n]+\*\*[、。:：\s]*/, '');
    return cleanText(t);
  }

  function paraFirstBoldName(p){
    var m = String(p).match(/\*\*([^*\n]{1,20})\*\*/);
    return m ? cleanName(m[1]) : '';
  }

  function paraNpcIndex(p){
    // 「第N の NPC」 / 「NPC[N]」 / 「NPC N」
    var m = String(p).match(/第\s*([一二三四五六七八九十0-9]+)\s*の?\s*NPC/);
    if (m){
      var n = kanjiOrDigitToInt(m[1]);
      return n > 0 ? n - 1 : -1;
    }
    var m2 = String(p).match(/NPC\s*\[?\s*(\d+)\s*\]?/i);
    if (m2) return parseInt(m2[1], 10);
    return -1;
  }

  function isSceneParagraph(p){
    return /^(?:世界(?:は|観[:：]|の根本)|舞台(?:は|として)|ロアは)/.test(String(p).trim());
  }

  function isHeroParagraph(p, heroNameSeed){
    var t = String(p);
    if (/(?:^|\s)主人公(?:は|の|が|を|の名)/.test(t)) return true;
    if (/(?:^|\s)ヒーロー(?:は|の|が|を)/.test(t)) return true;
    if (/プロタゴニスト/.test(t)) return true;
    if (heroNameSeed){
      // 「[seed]の名は」
      if (new RegExp('^' + escapeReg(heroNameSeed) + 'の名は').test(t.trim())) return true;
      // bold name === seed
      var bn = paraFirstBoldName(t);
      if (bn && bn === heroNameSeed) return true;
    }
    return false;
  }

  function escapeReg(s){
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------- Scene extraction (sentence-level scan) ----------
  function extractScene(text){
    var scene = {};
    // 改行を空白化して 。 で split (。 を末尾に残す)
    var flat = String(text).replace(/\n+/g, ' ');
    var pieces = flat.split('。');
    var sentences = [];
    for (var i = 0; i < pieces.length; i++){
      var seg = pieces[i].trim();
      if (seg) sentences.push(seg + (i < pieces.length - 1 ? '。' : ''));
    }

    function pickFirst(re, transform){
      for (var i = 0; i < sentences.length; i++){
        if (re.test(sentences[i])){
          return transform(sentences[i]);
        }
      }
      return '';
    }

    // lore: 「世界は」「舞台は」「ロアは」「世界観:」 — 文中でもどこでも
    scene.lore = pickFirst(
      /(世界は|舞台は|ロアは|世界観\s*[:：])/,
      function(s){
        return cleanText(
          s.replace(/^.*?(?:世界は|舞台は|ロアは|世界観\s*[:：])\s*/, '')
        );
      }
    );

    // loc: 「具体的な場所」「場所は」「場所:」「舞台地は」 — 文中でもどこでも
    //  ただし「場所」単独だと「場所」を含む別の語 (居場所/職場など) を
    //  誤マッチする可能性があるので、明確に「は」「:」のいずれかを要求
    scene.loc = pickFirst(
      /(具体的な場所|場所\s*[:：]|場所は(?!ある)|舞台地は|舞台地\s*[:：])/,
      function(s){
        return cleanText(
          s.replace(/^.*?(?:具体的な場所|場所|舞台地)\s*[:：]?\s*(?:は)?\s*/, '')
        );
      }
    );

    // obj: 「目的は」「目的:」「目的を」 — 文中でもどこでも (前置「彼女の」「主人公の」等を許容)
    scene.obj = pickFirst(
      /目的(?:は|を\s|\s*[:：])/,
      function(s){
        return cleanText(
          s.replace(/^.*?目的\s*[:：]?\s*(?:は|を)?\s*/, '')
        );
      }
    );

    // tone: 「語りのトーン」「トーンは」「雰囲気は」「語り口は」 — 文中でもどこでも
    scene.tone = pickFirst(
      /(語りのトーン|語り口は|語り口\s*[:：]|トーン(?:は|\s*[:：])|雰囲気(?:は|\s*[:：]))/,
      function(s){
        return cleanText(
          s.replace(/^.*?(?:語りのトーン|語り口|トーン|雰囲気)\s*[:：]?\s*(?:は)?\s*/, '')
        );
      }
    );

    // 200 字以内に丸める
    Object.keys(scene).forEach(function(k){
      if (scene[k] && scene[k].length > 200) scene[k] = scene[k].slice(0, 200);
      if (!scene[k]) delete scene[k];
    });

    return scene;
  }

  // ---------- Recovery main ----------
  function recoverFromNarrative(text){
    if (!text || typeof text !== 'string') return null;
    var s = String(text).trim();
    // コードフェンスを念のため剥がす (orig safeParseJson がやっているはずだが念押し)
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    if (s.length < 30) return null;

    // 段落分割
    var paragraphs = s.split(/\n\s*\n+/).map(function(p){ return p.trim(); }).filter(Boolean);
    if (paragraphs.length === 0) return null;

    // ヒント: 既入力の名前 (LLM に「種」として渡されているはずのもの)
    var heroNameSeed = val('cfgHName');
    var npcNameSeeds = readNpcCardValues('name');
    var npcCount = document.querySelectorAll('#npcList .npc-card').length;

    // Scene (全文を sentence スキャン)
    var scene = extractScene(s);

    // Hero / NPC を段落単位で割り当て
    var hero = null;
    var npcsRecovered = new Array(npcCount).fill(null);
    var fallbackHeroSet = false;
    var fallbackNpcQueue = []; // 順番待ちの段落

    paragraphs.forEach(function(p){
      // scene 段落 (世界は… で始まる) はキャラ抽出から除外
      if (isSceneParagraph(p)) return;

      var pName = paraFirstBoldName(p);
      var nIdx  = paraNpcIndex(p);
      var body  = paraBody(p);
      // body が短すぎる (50 字未満) なら原文側を使う (header 除去で削りすぎた可能性)
      if (body && body.length < 30){
        var fullBody = cleanText(p);
        if (fullBody.length > body.length) body = fullBody;
      }

      // 1) 明示的に NPC[N] と分かる
      if (nIdx >= 0){
        if (nIdx < npcsRecovered.length){
          if (!npcsRecovered[nIdx]){
            npcsRecovered[nIdx] = {
              name: pName || npcNameSeeds[nIdx] || '',
              desc: body
            };
          }
        }
        return;
      }

      // 2) hero 候補
      if (!hero && isHeroParagraph(p, heroNameSeed)){
        hero = {
          name: pName || heroNameSeed || '',
          desc: body
        };
        return;
      }

      // 3) bold name が NPC seed と一致
      if (pName){
        for (var i = 0; i < npcNameSeeds.length; i++){
          if (npcNameSeeds[i] && pName === npcNameSeeds[i] && !npcsRecovered[i]){
            npcsRecovered[i] = { name: pName, desc: body };
            return;
          }
        }
      }

      // 4) フォールバックキューに溜める
      fallbackNpcQueue.push({ name: pName, body: body });
    });

    // 5) フォールバックキューを残った NPC スロットに順次流し込む
    //    (hero がまだ未確定でかつ最初の段落に bold name もある場合は hero に)
    var fallbackIdx = 0;
    if (!hero && fallbackNpcQueue.length){
      // 最初のフォールバック段落を hero として扱う
      // ただし bold name が無い純背景段落の可能性もあるので、descが十分長いことを確認
      var head = fallbackNpcQueue[0];
      if (head.body && head.body.length >= 30){
        hero = {
          name: head.name || heroNameSeed || '',
          desc: head.body
        };
        fallbackIdx = 1;
      }
    }
    for (; fallbackIdx < fallbackNpcQueue.length; fallbackIdx++){
      var item = fallbackNpcQueue[fallbackIdx];
      // 空きスロットを探す
      var slot = -1;
      for (var k = 0; k < npcsRecovered.length; k++){
        if (!npcsRecovered[k]){ slot = k; break; }
      }
      if (slot < 0){
        // npcCount=0 だったら配列を伸ばす
        if (npcsRecovered.length === 0){
          npcsRecovered.push(null);
          slot = 0;
        } else {
          break;
        }
      }
      npcsRecovered[slot] = {
        name: item.name || npcNameSeeds[slot] || '',
        desc: item.body
      };
    }

    // null を空オブジェクトに、末尾の空を切り詰め
    var npcs = npcsRecovered.map(function(n){ return n || {}; });
    while (npcs.length && !npcs[npcs.length-1].name && !npcs[npcs.length-1].desc){
      npcs.pop();
    }

    // 結果組み立て
    var result = {};
    if (Object.keys(scene).length) result.scene = scene;
    if (hero && (hero.name || hero.desc)) result.hero = hero;
    if (npcs.length) result.npcs = npcs;

    if (!result.scene && !result.hero && !result.npcs) return null;

    return result;
  }

  // ---------- Wrap window.__v284.safeParseJson ----------
  function patchSafeParseJson(){
    if (!window.__v284 || typeof window.__v284.safeParseJson !== 'function') return false;
    if (window.__v284.safeParseJson.__v286eWrapped) return true;

    var orig = window.__v284.safeParseJson;
    var wrapped = function(text){
      var parsed;
      try { parsed = orig(text); } catch(e){
        console.warn(TAG, 'orig safeParseJson threw', e && e.message);
        parsed = null;
      }
      if (parsed) return parsed;  // JSON 経路成功 → そのまま (後方互換)

      // ナラティブ recovery 試行
      var recovered;
      try { recovered = recoverFromNarrative(text); } catch(e){
        console.warn(TAG, 'recoverFromNarrative threw', e && e.message);
        recovered = null;
      }
      if (recovered){
        var keys = Object.keys(recovered);
        var npcLen = (recovered.npcs && recovered.npcs.length) || 0;
        console.log(TAG, 'narrative recovery succeeded:',
          'keys=', keys, 'npcs=', npcLen,
          'heroName=', (recovered.hero && recovered.hero.name) || '(none)',
          'heroDesc.len=', (recovered.hero && recovered.hero.desc && recovered.hero.desc.length) || 0
        );
      } else {
        console.log(TAG, 'narrative recovery failed (returned null) — text head:',
          String(text || '').slice(0, 120));
      }
      return recovered;
    };
    wrapped.__v286eWrapped = true;
    window.__v284.safeParseJson = wrapped;
    console.log(TAG, '__v284.safeParseJson wrapped');
    return true;
  }

  if (!patchSafeParseJson()){
    var tries = 0;
    var iv = setInterval(function(){
      if (patchSafeParseJson() || ++tries > 60) clearInterval(iv);
    }, 500);
  }

  // ---------- Public API (デバッグ用) ----------
  window.__v286e = {
    recoverFromNarrative: recoverFromNarrative,
    extractScene: extractScene,
    paraBody: paraBody,
    paraFirstBoldName: paraFirstBoldName,
    paraNpcIndex: paraNpcIndex,
    isSceneParagraph: isSceneParagraph,
    isHeroParagraph: isHeroParagraph
  };

  console.log(TAG, 'init complete');
})();
