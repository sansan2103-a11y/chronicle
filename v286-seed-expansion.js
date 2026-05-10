/* v286: seed-expansion + gender consistency — wraps v285 with two fixes.
 *
 * 【Bug 1】 v285a で発見された seed 非展開バグ (HANDOFF_v285_followup.md §1):
 *   listAskFields が blank フィールドのみ ask に含めたため、
 *   種があるフィールド (例: hero.desc に「呪われた少女」) は LLM の出力対象から
 *   外れ、v108 prefix が乗っただけで終わってしまう。
 *   おしんさんの「種を広げて豊かにしていく」哲学と真逆の挙動。
 *
 * 【Bug 2】 性別ラジオと desc 性別の不整合 (おしんさん 2026-05-10 報告):
 *   v108 のラジオが「女性」なのに LLM が desc を「20代半ばの男性教師」のように
 *   別の性別で生成してしまう。プロンプトで radio 選択を LLM に伝えていないのが原因。
 *
 * v286 の対応:
 *   [Bug 1]
 *   1. desc 系の **短い種** (1〜49 字) を ask に含め、専用の expand リストで明示
 *   2. プロンプトで「種のキーワード・含意を必ず保ったまま 50〜120 字 / 50〜100 字
 *      に膨らませる」と指示 + 具体例
 *   3. applyResult を拡張: 種ありフィールドにも上書き
 *   4. findThinDescs を拡張: 種ありフィールドの薄さも検出 → retry 対象
 *
 *   [Bug 2]
 *   5. ラジオ状態 (`v108g_hero` / `v108g_npc<i>`) を読み取って gender constraint 決定
 *      (種に明確な性別語があれば seed 由来、なければ radio 由来)
 *   6. プロンプトに「指定性別の人物として必ず書く」hard constraint を追加
 *   7. findThinDescs で性別不整合も検出 → retry 対象 (より強い性別指示で)
 *   8. retry 後もまだ不一致なら radio を desc 推定値に sync (consistency 確保、log)
 *
 * 対象は desc のみ (今回スコープ):
 *   - 名前は短くても完成済み token なので展開しない (種として通知のみ)
 *   - scene 系は別途検討 (v287 以降)
 *   - **長い** desc (50 字以上) は完成済みと見なし v285 同様 lock
 *
 * 戦略:
 *   v285 の wrap 上にさらに wrap。Api.call を 1300ms stub して
 *   v284 (t=400) と v285 (t=700) の inner LLM 呼び出しを両方空応答に。
 *   t=1500 で v286 が事前捕獲した real Api.call で本番 LLM を呼ぶ。
 *
 * 依存: window.__v284 (helpers), window.__v285 (helpers), Api.call, S.cfg, UI.randomFill
 * Idempotent: __v286Active / UI.__v286Hooked
 */
(function v286(){
  var TAG = '[v286]';
  if (window.__v286Active) return;

  // ---------- DOM helpers ----------
  function val(id){
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function setVal(el, v){
    if (!el || v === undefined || v === null) return false;
    var s = String(v).trim();
    if (!s) return false;
    el.value = s;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
    return true;
  }
  function setById(id, v){ return setVal(document.getElementById(id), v); }

  function getApi(){
    try { if (typeof Api === 'object' && Api && typeof Api.call === 'function') return Api; } catch(e){}
    return null;
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

  // ---------- v285 helper bridge (with fallbacks) ----------
  function v285H(){ return window.__v285 || {}; }
  function stripGenderPrefix(s){
    var f = v285H().stripGenderPrefix;
    if (typeof f === 'function') return f(s);
    return String(s || '').replace(/^性別\s*[:：]\s*[^。\n]*。\s*/, '').trim();
  }
  var GENDER_RE_FALLBACK = /^性別\s*[:：]\s*[^。\n]*。?\s*$/;
  function isThinDesc(s){
    var f = v285H().isThinDesc;
    if (typeof f === 'function') return f(s);
    if (!s) return true;
    var t = String(s).trim();
    if (t.length < 30) return true;
    return GENDER_RE_FALLBACK.test(t);
  }
  function clearGenderPlaceholders(blank){
    var f = v285H().clearGenderPlaceholders;
    if (typeof f === 'function') return f(blank);
  }

  // ---------- Seed extraction ----------
  // v286 の核: blank=false (元から書かれている) かつ stripGenderPrefix 後に空でない seed
  function getHeroDescSeed(blank){
    if (blank.hDesc) return '';
    return stripGenderPrefix(val('cfgHDesc'));
  }
  function getNpcDescSeed(blank, i){
    if (!blank.npcs[i] || blank.npcs[i].desc) return '';
    var card = document.querySelectorAll('#npcList .npc-card')[i];
    if (!card) return '';
    var dc = card.querySelector('[data-f="desc"]');
    return dc ? stripGenderPrefix(dc.value.trim()) : '';
  }

  // ---------- Gender helpers (v108 radio sync) ----------
  // v108 が `<input type="radio" name="v108g_hero|v108g_npc<i>" value="女性|男性|未設定">`
  // を生成。意味のある値は「女性」「男性」のみ。「未設定」やその他は空とみなす。
  function readHeroGender(){
    try {
      var ch = document.querySelector('input[name="v108g_hero"]:checked');
      var v = ch ? String(ch.value).trim() : '';
      return (v === '女性' || v === '男性') ? v : '';
    } catch(e){ return ''; }
  }
  function readNpcGender(i){
    try {
      var ch = document.querySelector('input[name="v108g_npc' + i + '"]:checked');
      var v = ch ? String(ch.value).trim() : '';
      return (v === '女性' || v === '男性') ? v : '';
    } catch(e){ return ''; }
  }
  function writeHeroGender(g){
    if (g !== '女性' && g !== '男性') return false;
    var radios = document.querySelectorAll('input[name="v108g_hero"]');
    if (!radios || !radios.length) return false;
    var changed = false;
    radios.forEach(function(r){
      var should = (r.value === g);
      if (r.checked !== should){
        r.checked = should;
        try { r.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
        if (should) changed = true;
      }
    });
    return changed;
  }
  function writeNpcGender(i, g){
    if (g !== '女性' && g !== '男性') return false;
    var radios = document.querySelectorAll('input[name="v108g_npc' + i + '"]');
    if (!radios || !radios.length) return false;
    var changed = false;
    radios.forEach(function(r){
      var should = (r.value === g);
      if (r.checked !== should){
        r.checked = should;
        try { r.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
        if (should) changed = true;
      }
    });
    return changed;
  }

  // desc から性別を推定 (簡易ヒューリスティック; 確信が無ければ '')
  // 強マーカー (heading) → 即決定
  // 語マーカー → 多数決 (差 1 以上で確信)
  function inferGenderFromDesc(desc){
    if (!desc) return '';
    var s = String(desc);
    if (/^\s*性別\s*[:：]\s*女/.test(s)) return '女性';
    if (/^\s*性別\s*[:：]\s*男/.test(s)) return '男性';
    var fHits = (s.match(/(少女|令嬢|乙女|女王|王女|魔女|尼僧|シスター|聖女|淑女|姉(?!弟)|妹|母|妻|娘|女性|女子|お嬢|彼女)/g) || []).length;
    var mHits = (s.match(/(少年|青年|男性|男子|男(?!装|爵)|父(?!権)|兄(?!妹)|弟|息子|王子|武士|武人|司祭(?!.*女)|彼は|彼が|彼を|彼の(?!女))/g) || []).length;
    if (fHits > mHits) return '女性';
    if (mHits > fHits) return '男性';
    return '';
  }

  // gender constraint 決定: seed に明確な性別語があれば seed 優先、なければ radio
  function getHeroGenderConstraint(blank){
    var seed = getHeroDescSeed(blank);
    if (seed){
      var inferred = inferGenderFromDesc(seed);
      if (inferred) return { gender: inferred, source: 'seed' };
    }
    var rg = readHeroGender();
    if (rg) return { gender: rg, source: 'radio' };
    return { gender: '', source: '' };
  }
  function getNpcGenderConstraint(blank, i){
    var seed = getNpcDescSeed(blank, i);
    if (seed){
      var inferred = inferGenderFromDesc(seed);
      if (inferred) return { gender: inferred, source: 'seed' };
    }
    var rg = readNpcGender(i);
    if (rg) return { gender: rg, source: 'radio' };
    return { gender: '', source: '' };
  }

  // 短い種のみ展開対象 (50 字以上は「完成済み」と見なし v285 同様 lock)
  var SEED_EXPAND_THRESHOLD = 50;
  function shouldExpandHDesc(blank){
    var s = getHeroDescSeed(blank);
    return !!s && s.length < SEED_EXPAND_THRESHOLD;
  }
  function shouldExpandNpcDesc(blank, i){
    var s = getNpcDescSeed(blank, i);
    return !!s && s.length < SEED_EXPAND_THRESHOLD;
  }

  // 書き込み判定: blank なら書く、種ありで膨らませ対象なら書く
  function shouldWriteHDesc(blank){
    return blank.hDesc || shouldExpandHDesc(blank);
  }
  function shouldWriteNpcDesc(blank, i){
    return (blank.npcs[i] && blank.npcs[i].desc) || shouldExpandNpcDesc(blank, i);
  }

  // ---------- Field listings ----------
  function listAskFields(blank){
    var ask = [];
    if (blank.sceneLore) ask.push('scene.lore');
    if (blank.sceneLoc)  ask.push('scene.loc');
    if (blank.sceneObj)  ask.push('scene.obj');
    if (blank.sceneTone) ask.push('scene.tone');
    if (blank.hName) ask.push('hero.name');
    if (shouldWriteHDesc(blank)) ask.push('hero.desc');
    blank.npcs.forEach(function(n, i){
      if (n.name) ask.push('npcs[' + i + '].name');
      if (shouldWriteNpcDesc(blank, i)) ask.push('npcs[' + i + '].desc');
    });
    return ask;
  }

  // 種展開対象だけのリスト (ask に含まれる中で「既存の seed を保って膨らませる」もの)
  function listExpandFields(blank){
    var exp = [];
    if (shouldExpandHDesc(blank)) exp.push('hero.desc');
    blank.npcs.forEach(function(n, i){
      if (shouldExpandNpcDesc(blank, i)) exp.push('npcs[' + i + '].desc');
    });
    return exp;
  }

  function extendBlanksForNewNpcs(blank){
    var cards = document.querySelectorAll('#npcList .npc-card');
    for (var i = blank.oldNpcCount; i < cards.length; i++){
      blank.npcs[i] = { name: true, desc: true };
    }
  }

  // ---------- Seeds shown to LLM (with expansion notes) ----------
  function collectSeeds(blank){
    var seeds = [];
    if (!blank.sceneLore && val('cfgLore')) seeds.push('世界観の種: 「' + val('cfgLore') + '」');
    if (!blank.sceneLoc  && val('cfgLoc'))  seeds.push('場所の種: 「'  + val('cfgLoc') + '」');
    if (!blank.sceneObj  && val('cfgObj'))  seeds.push('目的の種: 「'  + val('cfgObj') + '」');
    if (!blank.sceneTone && val('cfgTone')) seeds.push('トーンの種: 「' + val('cfgTone') + '」');
    if (!blank.hName && val('cfgHName')) seeds.push('主人公名の種: 「' + val('cfgHName') + '」');

    var hSeed = getHeroDescSeed(blank);
    if (hSeed){
      if (hSeed.length < SEED_EXPAND_THRESHOLD){
        seeds.push('主人公像の種: 「' + hSeed + '」 → これを 50〜120 字に膨らませる (キーワード・含意を保持)');
      } else {
        seeds.push('主人公像 (確定): 「' + hSeed + '」 (LLM は触らない)');
      }
    }

    // 主人公の性別 constraint
    var hGc = getHeroGenderConstraint(blank);
    if (hGc.gender){
      seeds.push('主人公の性別 (' + (hGc.source === 'seed' ? '種から推定' : 'ラジオ選択') + '): 「' + hGc.gender + '」 → desc は必ず「' + hGc.gender + '」の人物として書く');
    }

    document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
      var nm = card.querySelector('[data-f="name"]');
      if (nm && nm.value.trim() && blank.npcs[i] && !blank.npcs[i].name){
        seeds.push('NPC[' + i + ']名の種: 「' + nm.value.trim() + '」');
      }
      var nSeed = getNpcDescSeed(blank, i);
      if (nSeed){
        if (nSeed.length < SEED_EXPAND_THRESHOLD){
          seeds.push('NPC[' + i + ']像の種: 「' + nSeed + '」 → これを 50〜100 字に膨らませる (キーワード・含意を保持)');
        } else {
          seeds.push('NPC[' + i + ']像 (確定): 「' + nSeed + '」 (LLM は触らない)');
        }
      }
      // NPC の性別 constraint
      var nGc = getNpcGenderConstraint(blank, i);
      if (nGc.gender){
        seeds.push('NPC[' + i + ']の性別 (' + (nGc.source === 'seed' ? '種から推定' : 'ラジオ選択') + '): 「' + nGc.gender + '」 → desc は必ず「' + nGc.gender + '」の人物として書く');
      }
    });
    return seeds;
  }

  // ---------- Seed-aware prompt with explicit expansion guidance ----------
  function buildSeedPrompt(blank){
    var ask = listAskFields(blank);
    if (ask.length === 0) return null;
    var expand = listExpandFields(blank);
    var seeds = collectSeeds(blank);

    var sys = [
      'TRPG セッションの世界観とキャラクター一式を作ってください。',
      '',
      '【最重要 — 設計思想】',
      '・プレイヤーが書き留めた「種(seed)」は、その意図を絶対に保つ。種にある固有名詞・キーワード・含意を消したり言い換えたりしない',
      '・短い種は、その方向に世界を豊かに広げる。種を出発点として周辺要素 (NPC, 場所, 目的, トーン) が自然に響き合うよう余白を埋めていく',
      '・空欄の要素は、種に馴染むよう自由に発明してよい',
      '・「制約より刺激」: 種を否定する形ではなく、種を肯定し膨らませる方向で書く',
      '',
      '【種を膨らませるフィールド — 厳守 (v286 追加)】',
      '・後述「種を膨らませるフィールド」リストにあるフィールドは、',
      '  既存の値を「種」として、その意図・キーワード・含意を必ず保ったまま、',
      '  指定の文字数まで具体性を加えて膨らませる',
      '・例: 種「呪われた少女」→「16歳、左目に呪印を持つ寡黙な少女。',
      '  母方に伝わる呪いを断ち切るため旅に出た」(「呪い」「少女」のキーワードを保持して具体化)',
      '・種にあるキーワード (例: 「呪い」「少女」) は新しい desc にも必ず含める',
      '・新しい desc は元の種を完全に置き換える形で書き直す (種の文字列はそのまま残さず再構成)',
      '・JSON 出力の key は通常通り "desc" / "name" などを使う (「(種を膨らませる)」のような注釈は key に含めない)',
      '',
      '【性別の整合性 — 厳守 (v286 追加)】',
      '・seeds の中で「性別」が明示されたキャラの desc は、必ずその性別の人物として書く',
      '・男性なら「青年」「男」「父」「兄」「弟」「彼」など、',
      '  女性なら「少女」「女」「母」「姉」「妹」「彼女」など、',
      '  読み手に明白に伝わる性別語を desc 内に最低 1 つ含める',
      '・desc 内で指定と矛盾する性別語 (例: 男性指定なのに「少女」「彼女」、女性指定なのに「青年」「彼は」) は絶対不可',
      '・特に職業・身分名: 「教師」「司祭」など中立語ではなく、必要に応じて「女教師」「女司祭」「老父」のように性別が伝わる形で書く',
      '',
      '【視点 (POV) の規定 — 厳守】',
      '・hero.desc は「主人公本人の像」として書く — 年齢・性別・職能・特徴・小さな秘密を簡潔に。語り手目線・「〜の友人」「〜の同級生」のような他者視点は禁止',
      '・npc[].desc は「外から見たそのキャラの第一印象」 — 役割・主人公との関係性・癖や雰囲気',
      '・scene.lore は「世界の根本ルール」として客観的に',
      '',
      '【desc の量 — 厳守】',
      '・hero.desc は 50〜120 文字。生身の人物像が立ち上がる程度の具体性',
      '・npc[].desc は 50〜100 文字。第一印象として情景が浮かぶ程度',
      '・「性別: ◯」だけで終わるのは絶対に不可。具体的な特徴を必ず書く',
      '',
      '【その他】',
      '・名前は世界観の語彙・響きに合わせて自由に造語してよい',
      '・性別・年齢・種族・職能・立場は自由',
      '・出力は厳密に JSON のみ。前後に説明文・コードフェンス・コメントは付けない',
      '・JSON 値の中で引用符を使う時は「」や『』を使う (素の " は JSON が壊れる)'
    ].join('\n');

    var user = [
      '【プレイヤーの種 (seed) — 意図を保ってください】',
      seeds.length ? seeds.join('\n') : '(なし — 完全に自由に発明してよい)',
      '',
      '【生成してほしいフィールド】',
      JSON.stringify(ask),
      '',
      '【種を膨らませるフィールド】 (上の ask に含まれる中で、既存値を「種」として保ったまま展開する対象)',
      expand.length ? JSON.stringify(expand) : '(なし — ask の各フィールドは自由に発明)',
      '',
      '【NPC 数】 ' + blank.npcs.length,
      '',
      '【出力 JSON 形式の例】',
      '{"scene":{"lore":"...","loc":"...","obj":"...","tone":"..."},"hero":{"name":"...","desc":"..."},"npcs":[{"name":"...","desc":"..."}]}',
      '',
      '※ ask に含まれるフィールドだけ含めればよい。',
      '※ 「種を膨らませるフィールド」に含まれるものは、既存の seed を完全に置き換える新しい本文を出力する (キーワード・含意は保持)。',
      '※ scene.lore は世界の根本設定 (1〜2文)、loc は具体的な場所、obj は主人公の現在の目的、tone は語りのトーン。',
      '※ 文字列値の中に " を使わない。代わりに「」を使う。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  // ---------- Apply (writes to blank fields and seed-expand fields) ----------
  function applyResult(blank, parsed){
    if (!parsed || typeof parsed !== 'object') return 0;
    var changed = 0;

    if (parsed.scene && typeof parsed.scene === 'object'){
      if (blank.sceneLore && setById('cfgLore', parsed.scene.lore)) changed++;
      if (blank.sceneLoc  && setById('cfgLoc',  parsed.scene.loc))  changed++;
      if (blank.sceneObj  && setById('cfgObj',  parsed.scene.obj))  changed++;
      if (blank.sceneTone && setById('cfgTone', parsed.scene.tone)) changed++;
    }
    if (parsed.hero){
      if (blank.hName && setById('cfgHName', parsed.hero.name)) changed++;
      if (shouldWriteHDesc(blank) && parsed.hero.desc && setById('cfgHDesc', parsed.hero.desc)) changed++;
    }
    var cards = document.querySelectorAll('#npcList .npc-card');
    var pNpcs = (parsed.npcs && Array.isArray(parsed.npcs)) ? parsed.npcs : [];
    blank.npcs.forEach(function(b, i){
      var card = cards[i]; if (!card) return;
      var p = pNpcs[i] || {};
      if (b.name && setVal(card.querySelector('[data-f="name"]'), p.name)) changed++;
      if (shouldWriteNpcDesc(blank, i) && p.desc && setVal(card.querySelector('[data-f="desc"]'), p.desc)) changed++;
    });
    return changed;
  }

  // ---------- Thin desc detection (extended for seed fields + gender mismatch) ----------
  function findThinDescs(blank, parsed){
    var thin = [];
    if (shouldWriteHDesc(blank)){
      var d = (parsed && parsed.hero && parsed.hero.desc) || '';
      if (!d){
        // LLM が hero.desc を出力しなかった場合、現在の field 値 (種そのまま) で再判定
        d = val('cfgHDesc');
      }
      if (isThinDesc(d)) thin.push('hero.desc');
      else {
        // gender mismatch check
        var hGc = getHeroGenderConstraint(blank);
        if (hGc.gender){
          var inferred = inferGenderFromDesc(d);
          if (inferred && inferred !== hGc.gender){
            console.log(TAG, 'gender mismatch hero: constraint=' + hGc.gender + ' (' + hGc.source + ') desc=' + inferred);
            thin.push('hero.desc');
          }
        }
      }
    }
    var pNpcs = (parsed && parsed.npcs && Array.isArray(parsed.npcs)) ? parsed.npcs : [];
    blank.npcs.forEach(function(b, i){
      if (shouldWriteNpcDesc(blank, i)){
        var nd = (pNpcs[i] && pNpcs[i].desc) || '';
        if (!nd){
          var card = document.querySelectorAll('#npcList .npc-card')[i];
          if (card){
            var dc = card.querySelector('[data-f="desc"]');
            nd = dc ? dc.value.trim() : '';
          }
        }
        if (isThinDesc(nd)) thin.push('npcs[' + i + '].desc');
        else {
          var nGc = getNpcGenderConstraint(blank, i);
          if (nGc.gender){
            var nInferred = inferGenderFromDesc(nd);
            if (nInferred && nInferred !== nGc.gender){
              console.log(TAG, 'gender mismatch npc[' + i + ']: constraint=' + nGc.gender + ' (' + nGc.source + ') desc=' + nInferred);
              thin.push('npcs[' + i + '].desc');
            }
          }
        }
      }
    });
    returnF��㰢Р�������������&WG'�&��B���������ТgV�7F���'V��E&WG'�&��B�&���&We'6VB�F���f�V�G2�����vV�FW"6��7G&��B8)"F���f�V�BXَK��8~Xh�h�"�8(�8(�[�~8�f"vV�FW$���G2��Ӱ�F���f�V�G2�f�$V6��gV�7F���b����b�b���v�W&��FW62r���f"�v2�vWD�W&�vV�FW$6��7G&��B�&�沓���b��v2�vV�FW"���vV�FW$���G2�W6��v�W&��FW628�[�^8�8�r��v2�vV�FW"'」の人物として書く (前回は性別が指定と異なっていた可能性)');
        }
      } else {
        var m = f.match(/^npcs\[(\d+)\]\.desc$/);
        if (m){
          var i = parseInt(m[1], 10);
          var nGc = getNpcGenderConstraint(blank, i);
          if (nGc.gender){
            genderHints.push('npcs[' + i + '].desc は必ず「' + nGc.gender + '」の人物として書く (前回は性別が指定と異なっていた可能性)');
          }
        }
      }
    });

    var sys = [
      '前回の生成で desc が薄すぎた / 空だった / 「性別: ◯」だけだった / 指定と異なる性別で書かれた フィールドを補完してください。',
      '',
      '【ルール — 厳守】',
      '・必ず 50 文字以上の具体的な desc を書く',
      '・hero.desc は主人公本人の像 (年齢/性別/職能/特徴/小さな秘密)。他者視点 NG',
      '・npc[].desc は外から見た第一印象 (役割/関係/癖/雰囲気)',
      '・「性別: ◯」だけで終わるのは絶対不可',
      '・**性別指定がある場合は必ず守る** (男性指定で「少女」「彼女」NG、女性指定で「青年」「彼は」NG)',
      '・職業・身分は性別が明白に伝わる形で書く (「教師」だけでは曖昧。男性なら「男性教師」「彼は教師」など)',
      '・前回の他フィールドの内容と矛盾しないよう、世界観に沿わせる',
      '・種があるフィールドは、種のキーワード・含意を必ず保ったまま膨らませる',
      '・出力は JSON のみ。引用符は「」を使う'
    ].join('\n');

    var ctx = [];
    if (prevParsed && prevParsed.scene){
      var sc = prevParsed.scene;
      ctx.push('世界観: ' + (sc.lore || '') + ' / 場所: ' + (sc.loc || '') + ' / 目的: ' + (sc.obj || '') + ' / トーン: ' + (sc.tone || ''));
    }
    if (prevParsed && prevParsed.hero){
      ctx.push('主人公: ' + (prevParsed.hero.name || '') + ' — ' + (prevParsed.hero.desc || ''));
    }
    if (prevParsed && prevParsed.npcs){
      prevParsed.npcs.forEach(function(n, i){
        ctx.push('NPC[' + i + ']: ' + ((n && n.name) || '') + ' — ' + ((n && n.desc) || ''));
      });
    }
    var seeds = collectSeeds(blank);
    if (seeds.length){
      ctx.push('--- 種 ---');
      seeds.forEach(function(s){ ctx.push(s); });
    }

    var user = [
      '【既に決まっている文脈】',
      ctx.length ? ctx.join('\n') : '(なし)',
      '',
      '【補完してほしいフィールド】',
      JSON.stringify(thinFields),
      genderHints.length ? '\n【性別の念押し】\n' + genderHints.join('\n') : '',
      '',
      '【出力例】',
      '{"hero":{"desc":"..."},"npcs":[{"desc":"..."}]}',
      '',
      '※ 補完対象フィールドのみ含めれば良い。',
      '※ 配列インデックスを保つ。',
      '※ 文字列値に素の " を使わない。'
    ].join('\n');

    return { sys: sys, user: user };
  }

  // 最終 fallback: 現状 desc の性別 (推定) と radio の不一致を解消する。
  // retry を経ても LLM が radio に従わなかった場合の整合性確保。
  // radio が指す性別が「desc にとって正しい」とは限らないので、desc 推定優先で radio を更新。
  // (desc に性別語が無ければ radio はそのまま)
  function syncGenderRadiosToDesc(blank){
    var synced = 0;
    // hero
    if (shouldWriteHDesc(blank)){
      var hd = val('cfgHDesc');
      var inferred = inferGenderFromDesc(hd);
      if (inferred){
        var current = readHeroGender();
        if (current && current !== inferred){
          if (writeHeroGender(inferred)){
            console.log(TAG, 'synced hero radio: ' + current + ' → ' + inferred);
            synced++;
          }
        } else if (!current){
          if (writeHeroGender(inferred)){
            console.log(TAG, 'set hero radio (was empty): → ' + inferred);
            synced++;
          }
        }
      }
    }
    // NPCs
    blank.npcs.forEach(function(b, i){
      if (!shouldWriteNpcDesc(blank, i)) return;
      var card = document.querySelectorAll('#npcList .npc-card')[i];
      if (!card) return;
      var dc = card.querySelector('[data-f="desc"]');
      if (!dc) return;
      var nd = dc.value.trim();
      var inferred = inferGenderFromDesc(nd);
      if (!inferred) return;
      var current = readNpcGender(i);
      if (current && current !== inferred){
        if (writeNpcGender(i, inferred)){
          console.log(TAG, 'synced npc[' + i + '] radio: ' + current + ' → ' + inferred);
          synced++;
        }
      } else if (!current){
        if (writeNpcGender(i, inferred)){
          console.log(TAG, 'set npc[' + i + '] radio (was empty): → ' + inferred);
          synced++;
        }
      }
    });
    return synced;
  }

  function applyRetryResult(parsed2, thinFields){
    if (!parsed2) return 0;
    var changed = 0;
    thinFields.forEach(function(f){
      if (f === 'hero.desc'){
        if (parsed2.hero && parsed2.hero.desc && !isThinDesc(parsed2.hero.desc)){
          if (setById('cfgHDesc', parsed2.hero.desc)) changed++;
        }
      } else {
        var m = f.match(/^npcs\[(\d+)\]\.desc$/);
        if (m){
          var i = parseInt(m[1], 10);
          var pNpc = (parsed2.npcs && parsed2.npcs[i]) || null;
          if (pNpc && pNpc.desc && !isThinDesc(pNpc.desc)){
            var card = document.querySelectorAll('#npcList .npc-card')[i];
            if (card){
              var dc = card.querySelector('[data-f="desc"]');
              if (dc && setVal(dc, pNpc.desc)) changed++;
            }
          }
        }
      }
    });
    return changed;
  }

  // ---------- localStorage / S sync (mirrors v285) ----------
  function syncStateFromForm(){
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      s.cast = s.cast || {};
      s.cast.hero = s.cast.hero || {};
      s.cast.hero.name = val('cfgHName');
      s.cast.hero.desc = val('cfgHDesc');
      s.cast.npcs = s.cast.npcs || [];
      document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
        s.cast.npcs[i] = s.cast.npcs[i] || {};
        var nameEl = card.querySelector('[data-f="name"]');
        var descEl = card.querySelector('[data-f="desc"]');
        if (nameEl) s.cast.npcs[i].name = nameEl.value.trim();
        if (descEl) s.cast.npcs[i].desc = descEl.value.trim();
      });
      s.scene = s.scene || {};
      s.scene.lore = val('cfgLore');
      s.scene.loc  = val('cfgLoc');
      s.scene.obj  = val('cfgObj');
      s.scene.tone = val('cfgTone');
      localStorage.setItem('chr6', JSON.stringify(s));
      if (window.S){
        if (S.cast && S.cast.hero){ S.cast.hero.name = s.cast.hero.name; S.cast.hero.desc = s.cast.hero.desc; }
        if (S.scene){ S.scene.lore = s.scene.lore; S.scene.loc = s.scene.loc; S.scene.obj = s.scene.obj; S.scene.tone = s.scene.tone; }
      }
    } catch(e){
      console.warn(TAG, 'state sync failed', e && e.message);
    }
  }

  // ---------- Main pipeline ----------
  function runEnhance(blank, realApiCall){
    extendBlanksForNewNpcs(blank);
    if (!hasApiKey()){
      console.log(TAG, 'no API key — skip');
      return;
    }
    clearGenderPlaceholders(blank);

    var pr = buildSeedPrompt(blank);
    if (!pr){
      console.log(TAG, 'no fields to ask — skip');
      return;
    }

    var api = getApi();
    var callFn = realApiCall;
    if (!callFn && api) callFn = api.call.bind(api);
    if (!callFn){ console.warn(TAG, 'Api.call not ready'); return; }

    var ask = listAskFields(blank);
    var expand = listExpandFields(blank);
    showStatus(expand.length ? '🌱 種を膨らませて世界を編む…' : '🌱 種を世界に咲かせています…');
    console.log(TAG, 'LLM ask', ask, 'expand', expand, 'seeds', collectSeeds(blank).length);

    var parser = (window.__v284 && window.__v284.safeParseJson) ? window.__v284.safeParseJson : null;
    if (!parser){ console.warn(TAG, 'v284 parser missing'); return; }

    callFn(pr.sys, pr.user, 2400).then(function(r){
      if (!r || !r.text){
        console.warn(TAG, 'empty LLM response');
        showStatus('🎲 ランダム生成（LLM 応答なし）');
        return;
      }
      var parsed = parser(r.text);
      if (!parsed){
        console.warn(TAG, 'parse failed:', String(r.text).slice(0, 300));
        showStatus('🎲 ランダム生成（解析失敗）');
        return;
      }
      console.log(TAG, 'parsed', parsed);
      var n = applyResult(blank, parsed);
      var thin = findThinDescs(blank, parsed);
      console.log(TAG, 'applied', n, 'thin', thin);

      if (thin.length === 0){
        var s0 = syncGenderRadiosToDesc(blank);
        syncStateFromForm();
        showStatus('🌱 ' + n + ' 件の種を世界に咲かせました' + (s0 ? ' (性別 ' + s0 + ' 件 sync)' : ''));
        return;
      }

      showStatus('🌱 さらに膨らませています…');
      var pr2 = buildRetryPrompt(blank, parsed, thin);
      callFn(pr2.sys, pr2.user, 1500).then(function(r2){
        var parsed2 = parser(r2 && r2.text);
        var added = applyRetryResult(parsed2, thin);
        // retry 後でもまだ性別不整合が残る可能性 → radio を desc に合わせる (consistency 確保)
        var sCount = syncGenderRadiosToDesc(blank);
        syncStateFromForm();
        var tail = sCount ? ' (性別 ' + sCount + ' 件 sync)' : '';
        if (added > 0){
          showStatus('🌱 ' + (n + added) + ' 件の種を咲かせ、' + added + ' 件を補完しました' + tail);
          console.log(TAG, 'retry applied', added);
        } else {
          showStatus('🌱 ' + n + ' 件の種を咲かせました（一部簡素）' + tail);
        }
      }).catch(function(e){
        console.warn(TAG, 'retry error', e && e.message);
        var sCount2 = syncGenderRadiosToDesc(blank);
        syncStateFromForm();
        showStatus('🌱 ' + n + ' 件の種を咲かせました（補完スキップ）' + (sCount2 ? ' (性別 ' + sCount2 + ' 件 sync)' : ''));
      });
    }).catch(function(e){
      console.warn(TAG, 'LLM error', e && e.message);
      showStatus('🎲 ランダム生成（LLM スキップ）');
    });
  }

  // ---------- Hook on top of v285 ----------
  // v286 wrap → v285 wrap → v284 wrap → base/v108/v111
  // Api.call は 1300ms stub することで v284 (t=400) と v285 (t=700) の inner LLM
  // 呼び出しを両方空応答に。t=1500 で v286 が事前捕獲した real Api.call で本番呼び出し。
  function hookOnTopOfV285(){
    if (typeof UI !== 'object' || !UI) return false;
    if (typeof UI.randomFill !== 'function') return false;
    if (!UI.__v285Hooked) return false;
    if (UI.__v286Hooked) return true;
    if (!window.__v284 || typeof window.__v284.snapshotBlanks !== 'function') return false;

    var v285wrap = UI.randomFill.bind(UI);

    UI.randomFill = function(){
      var blank = window.__v284.snapshotBlanks();
      console.log(TAG, 'snapshot', blank);

      // Capture real Api.call BEFORE stubbing, so v286 can use it after restore
      var Api_ref = (typeof Api === 'object' && Api) ? Api : null;
      var realApiCall = null;
      if (Api_ref && typeof Api_ref.call === 'function' && !Api_ref.__v286Stubbed){
        realApiCall = Api_ref.call.bind(Api_ref);
        Api_ref.__v286Stubbed = true;
        // v285 が二重に stub しないようフラグを事前セット (v285 wrap 内の if 分岐をスキップ)
        Api_ref.__v285Stubbed = true;
        Api_ref.call = function(){
          console.log(TAG, 'stubbed inner Api.call (v284/v285 suppress)');
          return Promise.resolve({ text: '' });
        };
        // v284 (t=400) と v285 (t=700) の両方が bail し終わってから restore
        setTimeout(function(){
          if (Api_ref.__v286Stubbed){
            Api_ref.call = realApiCall;
            delete Api_ref.__v286Stubbed;
            delete Api_ref.__v285Stubbed;
            console.log(TAG, 'Api.call restored');
          }
        }, 1300);
      }

      var r = v285wrap.apply(this, arguments);

      // v284/v285 の inner call が両方 bail し、Api.call が restore された後に
      // v286 の seed-expansion パイプラインを走らせる
      setTimeout(function(){ runEnhance(blank, realApiCall); }, 1500);
      return r;
    };
    UI.__v286Hooked = true;
    window.__v286Active = true;
    console.log(TAG, 'UI.randomFill re-wrapped (v286 seed-expansion)');
    return true;
  }

  function init(){
    if (hookOnTopOfV285()) return;
    setTimeout(function(){ if (!UI || !UI.__v286Hooked) hookOnTopOfV285(); }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 700);
  setTimeout(init, 1500);
  setTimeout(init, 3000);
  setTimeout(init, 6000);

  // ---------- Public surface ----------
  window.__v286 = {
    runEnhance: runEnhance,
    buildSeedPrompt: buildSeedPrompt,
    listAskFields: listAskFields,
    listExpandFields: listExpandFields,
    collectSeeds: collectSeeds,
    findThinDescs: findThinDescs,
    applyResult: applyResult,
    getHeroDescSeed: getHeroDescSeed,
    getNpcDescSeed: getNpcDescSeed,
    shouldExpandHDesc: shouldExpandHDesc,
    shouldExpandNpcDesc: shouldExpandNpcDesc,
    readHeroGender: readHeroGender,
    readNpcGender: readNpcGender,
    writeHeroGender: writeHeroGender,
    writeNpcGender: writeNpcGender,
    inferGenderFromDesc: inferGenderFromDesc,
    getHeroGenderConstraint: getHeroGenderConstraint,
    getNpcGenderConstraint: getNpcGenderConstraint,
    syncGenderRadiosToDesc: syncGenderRadiosToDesc,
    SEED_EXPAND_THRESHOLD: SEED_EXPAND_THRESHOLD
  };
  console.log(TAG, 'v286 active: seed-expansion + gender consistency (desc 種 < ' + SEED_EXPAND_THRESHOLD + ' chars を膨らませる)');
})();
