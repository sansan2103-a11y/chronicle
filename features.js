// =====================================================================
// Chronicle v292 features (Phase 4-B) — 10 features + v292Dfix17 patches
// =====================================================================
// v292Dfix17 patches (2026-05-14):
//   - fix16 fixPronouns: quote-aware + mixed-gender-line bypass + v292Dfix19 local-antecedent guard
//   - fix15 extractDialoguesEnhanced: 〝〟『』 quote class + Pattern E/F/G/H (post-quote attribution: NAMEの/から, 代名詞のbody-part; v292Dfix20: remove に particle)
//   - fix14 extractFromRaw Stage 2: branchCandidates label exclusion filter
// 設計思想: モデル(Hermes 4 405B)の表現自由度を尊重し、機械的書換は高信頼な場合のみ。
// =====================================================================
// Each feature is an IIFE that registers itself into the hook system.
// No Planner.build wrapping, no setInterval watchdogs, no __state aliases.
//
// v292 が用意している hook 一覧:
//   Planner._extensions       : ({sys, state}) => string
//   Planner._userExtensions   : ({user, state}) => string
//   Planner._parseExtensions  : (rawResponse) => parsed
//   UI._renderHooks           : (turn) => void
//   Api._preCallHooks         : (reqBody) => reqBody
//   PromptRegistry.add({ key, priority, text })
//   UserMessageRegistry.set(key, text)
//
// priority 目安: 100=core role / 80=cast/setting / 60=rules / 40=style / 20=fallback
// =====================================================================

(function bootstrap(){
  'use strict';

  // ---- 共通: 1 回だけ init を走らせるヘルパ ----------------------------
  function whenReady(fn){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      // 既に読み込み完了 → 即時 1 回だけ実行
      try { fn(); } catch(e){ console.warn('[v292] feature init err:', e && e.message); }
    }
  }

  // ====================================================================
  // 1. cast_lock
  // 目的: writer/story/say/do turn で cast 外のキャラ名 hallucination を防ぐ
  //       (例: cast=「ミコト」なのに narrative に「ミソト」「美琴」が湧く)
  // 旧パッチ: v274 / v274e / v276 / v276e の本質統合
  // hook 使用: PromptRegistry.add (priority=80 cast/setting)
  //            → Planner._extensions 経由で sys 末尾に 1 度だけ挿入される。
  // ====================================================================
  (function castLock(){
    function getCastRoster(){
      try {
        var st = (typeof S !== 'undefined' && S) ? S
               : (typeof window !== 'undefined' && window.S) ? window.S
               : null;
        if (!st || !st.cast) return [];
        var names = [];
        if (st.cast.hero && st.cast.hero.name){
          names.push(String(st.cast.hero.name).trim());
        }
        if (Array.isArray(st.cast.npcs)){
          st.cast.npcs.forEach(function(n){
            if (n && n.name) names.push(String(n.name).trim());
          });
        }
        return names.filter(function(n){ return !!n; });
      } catch(e){
        return [];
      }
    }

    function buildCastLockBlock(roster){
      if (!roster || !roster.length) return '';
      var listed = roster.map(function(n, i){
        return '  ' + (i + 1) + '. 「' + n + '」';
      }).join('\n');
      return [
        '【キャストロック (作家ターン用) — 厳守】',
        '物語に登場できる固有名詞のキャラクターは以下のみ。これ以外の名前を発明してはならない。',
        '',
        listed,
        '',
        '【絶対禁止】',
        '・上記の名前を 1 文字でも変えた似た名前を作る',
        '   (例: 「ミコト」を「ミソト」「ミコ」「ミコトン」「美琴」などに変えるのは禁止)',
        '・上記の名前を漢字化・カタカナ化・かな書き化・ローマ字化する',
        '・上記以外の新キャラ名 (店員、通行人、敵対者など) を発明し、',
        '   固有名詞・愛称として呼ぶ',
        '・例示用プレースホルダ (キャラA / 太郎 / 花子 / リナ / カエデ 等) を物語に出す',
        '',
        '【書き方】',
        '・台詞の話者名は上記キャストの 1 名そのままを使う (表記ブレ厳禁)',
        '・地の文での名前参照も上記の表記そのまま',
        '・既知キャラを「彼」「彼女」「兄」「姉」「お兄さん」など代名詞で呼ぶのは OK',
        '・どうしても新キャラに言及する必要があれば、固有名詞ではなく',
        '   一般名詞で「店員」「通行人の男」「年配の婦人」のように書く',
        '・地の文中で表記が安定するか必ず確認してから出力する'
      ].join('\n');
    }

    function register(){
      if (!window.PromptRegistry || typeof PromptRegistry.add !== 'function'){
        console.warn('[v292:cast_lock] PromptRegistry missing — feature disabled');
        return;
      }
      // priority 80 = cast/setting。roster が空のときは空文字を返し、
      // base 側で 0-len エントリは無視される想定 (PromptRegistry.build の責務)。
      PromptRegistry.add({
        key: 'cast_lock',
        priority: 80,
        get text(){
          // ターンごとに roster を読み直すため getter で遅延評価。
          // PromptRegistry.add が getter を扱えない実装の場合に備え、
          // Planner._extensions にも 1 本だけ登録する (key で dedup される前提)。
          return buildCastLockBlock(getCastRoster());
        }
      });

      // フォールバック: PromptRegistry が getter を解釈しない場合の保険として
      // 軽量な _extensions も併用 (sys を直接書き換えるのでなく、roster が変動
      // したケースでも最新名を反映できる)。
      if (Array.isArray(Planner && Planner._extensions)){
        Planner._extensions.push(function castLockExt(ctx){
          try {
            var block = buildCastLockBlock(getCastRoster());
            if (!block) return ctx.sys;
            // PromptRegistry 側で既に同 key を入れてあるなら sys に既出。
            // 二重挿入回避のため、sys 内に「【キャストロック」が無い場合のみ追記。
            if (ctx.sys && ctx.sys.indexOf('【キャストロック') >= 0) return ctx.sys;
            return (ctx.sys || '') + '\n' + block;
          } catch(e){ return ctx.sys; }
        });
      }
      console.log('[v292:cast_lock] registered');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 2. verbatim (v290)
  // 目的: プレイヤーの SAY / DO / STORY 入力を narrative に逐語反映させる。
  //       ただし wrap cascade で 35 回反復した v290 の轍は踏まない。
  //       user message 末尾に **1 回だけ** 指示を追加する (UserMessageRegistry.set)。
  // 旧パッチ: v290 (HANDOFF 無し。rebuild plan §真の原因 / Phase1 architecture §6 参照)
  // hook 使用: UserMessageRegistry.set (key で dedup される)
  // ====================================================================
  (function verbatim(){
    var VERBATIM_TEXT = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【プレイヤー入力の逐語反映 — 厳守】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      'プレイヤーが SAY (発話) / DO (行動) / STORY (展開) で書いた本文は、',
      '**そのままの言い回し・固有名詞・順序** で narrative に反映すること。',
      '',
      '・SAY 入力 → 該当キャラの台詞として、引用形式で逐語的に登場させる',
      '  (要約・言い換え・敬体↔常体の自動変換は禁止)',
      '・DO 入力 → 該当キャラの行動として、地の文に逐語的に書き込む',
      '・STORY 入力 → 場面/出来事として、地の文に逐語的に組み込む',
      '・プレイヤーが指定した固有名詞・状態・場所・小道具は省略不可',
      '',
      'narrative の冒頭で「前ターンの続き」を書くのではなく、',
      '**プレイヤー入力の中身そのもの** を今ターンの起点として書き始めること。',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');

    function register(){
      if (!window.UserMessageRegistry || typeof UserMessageRegistry.set !== 'function'){
        console.warn('[v292:verbatim] UserMessageRegistry missing — feature disabled');
        return;
      }
      // set は dedup される → 何度呼ばれても 1 回だけ末尾に挿入される。
      UserMessageRegistry.set('verbatim', VERBATIM_TEXT);
      console.log('[v292:verbatim] registered (user message tail, single instance)');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 3. input_priority (v282)
  // 目的: プレイヤー入力を LLM に拾わせる + 書き出し反復を防ぐ。
  //       前ターン narrative の冒頭 60 字を「…」で省略し、
  //       「【プレイヤーの展開】」ラベルを「【★今ターンの中身★】」へ強調。
  // 旧パッチ: v282
  // hook 使用: Planner._userExtensions (user 文字列を変換する純関数)
  // ====================================================================
  (function inputPriority(){
    // 注: User prompt には「直近の流れと整合性を保ちつつ、退屈なループから
    //     脱出する方向で。」が **2 回** 出現する (Chronicle prompt 設計上の重複)。
    //     書き出し反復の元凶は 2 回目側なので lastIndexOf で target する。
    var MARKER = '直近の流れと整合性を保ちつつ、退屈なループから脱出する方向で。\n';
    var END_MARKER = '\n\n【プレイヤーの展開】\n';
    var SUFFIX_MARKER = '\n\n↓ 続きを書け（地の文と台詞のみ。JSONや見出し禁止）。';

    function transformUser(u){
      if (!u || typeof u !== 'string') return u;

      // 1. 最後の "直近の流れと..." 直後の narrative を冒頭省略
      var lastMarkerIdx = u.lastIndexOf(MARKER);
      if (lastMarkerIdx > -1){
        var narrStart = lastMarkerIdx + MARKER.length;
        var narrEnd = u.indexOf(END_MARKER, narrStart);
        if (narrEnd > -1 && narrEnd > narrStart){
          var prevNarr = u.substring(narrStart, narrEnd);
          // idempotent: 既に処理済みならスキップ
          if (prevNarr.indexOf('(参考・直前ターンの様子') < 0){
            var trimmed = prevNarr.length > 60 ? '…' + prevNarr.slice(60) : prevNarr;
            u = u.substring(0, narrStart) +
                '\n(参考・直前ターンの様子 / 冒頭は省略してあります)\n' +
                trimmed +
                u.substring(narrEnd);
          }
        }
      }

      // 2. プレイヤー入力ラベルを強調 + 後置きの指示文を修正
      var playerLabelIdx = u.indexOf('【プレイヤーの展開】\n');
      var suffixIdx = u.indexOf(SUFFIX_MARKER, playerLabelIdx > -1 ? playerLabelIdx : 0);
      if (playerLabelIdx > -1 && suffixIdx > -1){
        var plrStart = playerLabelIdx + '【プレイヤーの展開】\n'.length;
        var plrEnd = suffixIdx;
        var plr = u.substring(plrStart, plrEnd);
        u = u.substring(0, playerLabelIdx) +
            '【★今ターンの中身★ プレイヤーの新しい指示】\n' +
            plr +
            '\n\n↓ 上記のプレイヤーの新しい指示を中身として、続きを書け（地の文と台詞のみ。JSONや見出し禁止）。' +
            u.substring(suffixIdx + SUFFIX_MARKER.length);
      }

      return u;
    }

    function register(){
      if (!Planner || !Array.isArray(Planner._userExtensions)){
        console.warn('[v292:input_priority] Planner._userExtensions missing — feature disabled');
        return;
      }
      Planner._userExtensions.push(function inputPriorityExt(ctx){
        try {
          return transformUser(ctx.user);
        } catch(e){
          console.warn('[v292:input_priority] transform err:', e && e.message);
          return ctx.user;
        }
      });
      console.log('[v292:input_priority] registered');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 4. mind_repair (v288)
  // 目的: Hermes 4 が JSON object のキー値ペア間で `,` を落としたときに自動修復。
  //       `{ "ミコト": "..." "アリア": "..." }` → `{ "ミコト": "...", "アリア": "..." }`
  // 旧パッチ: v288 (元実装は fetch wrap だったが、v292 では Planner._parseExtensions に乗せる)
  // hook 使用: Planner._parseExtensions ((rawResponse) => parsed)
  //            v288 の repairMissingCommas / repairContent ロジックをそのまま使用。
  // ====================================================================
  (function mindRepair(){
    // キー値ペア間の missing comma を補修。
    // "value"<ws>"key": → "value",<ws>"key":
    function repairMissingCommas(text){
      if (!text || typeof text !== 'string'){
        return { text: text, fixCount: 0 };
      }
      var fixCount = 0;
      var repaired = text.replace(
        /("(?:[^"\\]|\\.)*")(\s+)("[^"\n]{1,40}")(\s*):/g,
        function(m, val, ws, key, ws2){
          fixCount++;
          return val + ',' + ws + key + ws2 + ':';
        }
      );
      return { text: repaired, fixCount: fixCount };
    }

    // mind/seed shape 検出: object 内に `"key": "value"` 形式が 1 個以上
    function looksLikeKvObject(content){
      if (!content) return false;
      var s = String(content).trim();
      // コードフェンス除去
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
      if (!/^\s*\{/.test(s)) return false;
      return /"[^"\n]{1,40}"\s*:\s*"/.test(s);
    }

    // content の JSON 風部分のみ修復し、残り (前後説明文等) は保持。
    // 修復不要なら null を返す (idempotent)。
    function repairContent(content){
      if (!content) return null;
      if (!looksLikeKvObject(content)) return null;
      var firstBrace = content.indexOf('{');
      var lastBrace = content.lastIndexOf('}');
      if (firstBrace < 0 || lastBrace <= firstBrace) return null;
      var head = content.slice(0, firstBrace);
      var jsonPart = content.slice(firstBrace, lastBrace + 1);
      var tail = content.slice(lastBrace + 1);
      var r = repairMissingCommas(jsonPart);
      if (r.fixCount === 0) return null;
      return { newContent: head + r.text + tail, fixCount: r.fixCount };
    }

    function register(){
      if (!Planner || !Array.isArray(Planner._parseExtensions)){
        console.warn('[v292:mind_repair] Planner._parseExtensions missing — feature disabled');
        return;
      }
      // raw が string (LLM content そのもの) のとき repair。
      // 既に parse 済みオブジェクトが来る場合は内部の content 文字列を探す。
      Planner._parseExtensions.unshift(function mindRepairExt(rawResponse){
        try {
          if (typeof rawResponse === 'string'){
            var rep = repairContent(rawResponse);
            if (rep){
              window.__v292MindRepairCount = (window.__v292MindRepairCount || 0) + 1;
              if (window.__v292MindRepairCount <= 5){
                console.log('[v292:mind_repair] repaired +' + rep.fixCount +
                            ' commas (total=' + window.__v292MindRepairCount + ')');
              }
              return rep.newContent;
            }
            return rawResponse;
          }
          // OpenRouter style envelope
          if (rawResponse && rawResponse.choices &&
              rawResponse.choices[0] && rawResponse.choices[0].message){
            var c = rawResponse.choices[0].message.content;
            if (typeof c === 'string'){
              var rep2 = repairContent(c);
              if (rep2){
                rawResponse.choices[0].message.content = rep2.newContent;
                window.__v292MindRepairCount = (window.__v292MindRepairCount || 0) + 1;
                if (window.__v292MindRepairCount <= 5){
                  console.log('[v292:mind_repair] repaired +' + rep2.fixCount +
                              ' commas (envelope, total=' + window.__v292MindRepairCount + ')');
                }
              }
            }
          }
          return rawResponse;
        } catch(e){
          console.warn('[v292:mind_repair] err:', e && e.message);
          return rawResponse;
        }
      });

      // Public API (デバッグ用)
      window.__v292 = window.__v292 || {};
      window.__v292.mindRepair = {
        repairMissingCommas: repairMissingCommas,
        repairContent: repairContent,
        looksLikeKvObject: looksLikeKvObject,
        getRepairCount: function(){ return window.__v292MindRepairCount || 0; }
      };

      console.log('[v292:mind_repair] registered');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 5. onomatopoeia (悲鳴・絶叫の引用展開)
  // 目的: 「悲鳴が響いた」だけの抽象描写で終わらせず、必ず引用形式で
  //       「キャラ名「ひぃぃぃっ！…」」と展開させる soft prompt。
  // 旧パッチ: v220 (EXTREME_PAIN_RULE / retry) + v279 (toggle) + v280 (引用展開 prompt) + v281 (抽象検出 retry)
  // hook 使用: PromptRegistry.add (priority=40 style hint)
  //            v292 アーキテクチャ方針 (architecture §retry 撤廃) に従い、retry は廃止。
  //            v279 toggle (localStorage 'chr_v279_screamEnabled') は維持する。
  // ====================================================================
  (function onomatopoeia(){
    var LS_KEY = 'chr_v279_screamEnabled';

    function isEnabled(){
      try {
        var v = localStorage.getItem(LS_KEY);
        return v === null ? true : v === 'true';  // default ON
      } catch(e){ return true; }
    }

    function buildScreamQuoteBlock(){
      return [
        '【悲鳴・絶叫の引用展開ルール (会話ログに流すために重要)】',
        'narrative で悲鳴・絶叫・うめき・呻吟・金切り声・叫び声・嗚咽などを書く場合、',
        '**必ず該当キャラのセリフを引用形式で展開** してください。',
        '抽象的な「○○の悲鳴が響いた」だけで終わるのは禁止。',
        '',
        '好ましい (引用展開あり — 会話ログに流れる):',
        '  > 彼女の喉から金切り声が迸った。彼女「ひぃぃぃっ！や、やめて、やめてぇぇ！」',
        '  > 悲鳴が教室に響いた。彼女「いやぁああ！痛い、痛いよぉっ！」',
        '  > 彼は絶叫した。彼「ぎゃああああ！」',
        '  > 彼女は呻き声を漏らした。彼女「んぐぅ……っ、痛、痛い……」',
        '',
        '避けたい (抽象だけ — 会話ログに何も流れない):',
        '  > 「金切り声が迸った」だけで中身なし',
        '  > 「悲鳴が響いた」だけで中身なし',
        '  > 「絶叫した」だけで中身なし',
        '  > 「呻き声を漏らした」だけで中身なし',
        '',
        '## 書き方のルール',
        '- 長音は **3 文字以上** 重ねる (「あぁぁ」「いやぁああ」「ひぃぃぃ」)',
        '- 引用形式: narrative 内なら **キャラ名「セリフ」** または **キャラ名『セリフ』**',
        '- JSON dialogues 配列に入れる場合は speaker + text に分けて',
        '- 同じ悲鳴を繰り返さず、毎ターン違う表現で (痛い系/恐怖系/絶望系/呻吟系/絶叫系を混ぜる)',
        '',
        '## 補足',
        '- 抽象表現を使うこと自体は OK。ただし **必ず引用展開とセット** で。'
      ].join('\n');
    }

    function register(){
      if (!window.PromptRegistry || typeof PromptRegistry.add !== 'function'){
        console.warn('[v292:onomatopoeia] PromptRegistry missing — feature disabled');
        return;
      }
      // priority 40 = style hint。v279 トグルが OFF のときは空文字を返して
      // PromptRegistry 側で skip させる。トグル切替後はターン単位で評価される。
      PromptRegistry.add({
        key: 'onomatopoeia',
        priority: 40,
        get text(){
          return isEnabled() ? buildScreamQuoteBlock() : '';
        }
      });

      // PromptRegistry が getter を見ない場合の保険 (cast_lock と同じ idiom)。
      if (Array.isArray(Planner && Planner._extensions)){
        Planner._extensions.push(function onomatopoeiaExt(ctx){
          try {
            if (!isEnabled()) return ctx.sys;
            if (ctx.sys && ctx.sys.indexOf('【悲鳴・絶叫の引用展開ルール') >= 0) return ctx.sys;
            return (ctx.sys || '') + '\n' + buildScreamQuoteBlock();
          } catch(e){ return ctx.sys; }
        });
      }

      // Public API (toggle 制御用)
      window.__v292 = window.__v292 || {};
      window.__v292.onomatopoeia = {
        isEnabled: isEnabled,
        setEnabled: function(b){
          try { localStorage.setItem(LS_KEY, b ? 'true' : 'false'); } catch(e){}
        },
        buildScreamQuoteBlock: buildScreamQuoteBlock
      };

      console.log('[v292:onomatopoeia] registered (retry-less, toggle=' +
                  (isEnabled() ? 'ON' : 'OFF') + ')');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 6. npc_freedom (v283)
  // 目的: 「全 NPC を毎ターン強制登場」プレッシャーを外す。ラベルを肯定文化し、
  //       「自由に選んでよい」を明示する。禁止文言・強制ロジック追加なし。
  // 旧パッチ: v283 (Planner.build wrap + 4-tier setTimeout watchdog) を refactor
  // hook 使用: PromptRegistry.add (priority=60 behavioral rules)
  //            元実装は orig.sys を文字列置換していたが、v292 では PromptRegistry に
  //            「自由度ヒント」を独立ブロックとして登録する (置換ターゲット文字列が
  //            base sys に存在しなくても効果が出るよう肯定文だけ追加する形)。
  // ====================================================================
  (function npcFreedom(){
    function buildFreedomBlock(){
      return [
        '【NPC 登場の自由度 — 設計思想】',
        '・登録されている NPC の心理プロファイルは「演じ得る引き出し」として参照する',
        '・全員を毎ターン登場させる必要はない。場面の流れに必要な者だけ自然に登場させてよい',
        '・場面に不要な NPC を無理やり出すより、必要な NPC を厚く描く方を優先する',
        '・「制約より刺激」: 強制ではなく、世界に居る人々として自由に選ぶ'
      ].join('\n');
    }

    function register(){
      if (!window.PromptRegistry || typeof PromptRegistry.add !== 'function'){
        console.warn('[v292:npc_freedom] PromptRegistry missing — feature disabled');
        return;
      }
      PromptRegistry.add({
        key: 'npc_freedom',
        priority: 60,
        text: buildFreedomBlock()
      });
      if (Array.isArray(Planner && Planner._extensions)){
        Planner._extensions.push(function npcFreedomExt(ctx){
          try {
            if (ctx.sys && ctx.sys.indexOf('【NPC 登場の自由度') >= 0) return ctx.sys;
            return (ctx.sys || '') + '\n' + buildFreedomBlock();
          } catch(e){ return ctx.sys; }
        });
      }
      window.__v292 = window.__v292 || {};
      window.__v292.npcFreedom = { buildFreedomBlock: buildFreedomBlock };
      console.log('[v292:npc_freedom] registered');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 7. seed_aware (v284 / v285 / v286 / v286c 統合)
  // 目的: 🎲 ボタンで未入力フィールドを LLM に充実させる。
  //       「種 (seed)」を保ったまま豊かに膨らませる + 性別整合性 + blank-prefix 検出。
  // 旧パッチ: v284 (LLM ask) + v285 (seed POV + retry) + v286 (seed expand + gender)
  //          + v286c (blank-prefix 検出)。元実装は 3-way UI.randomFill wrap +
  //          500-1300ms Api.call stub の「timing war」だった。v292 はこれを drop し、
  //          UI.randomFill を **1 度だけ** clean wrap して 1 本のパイプラインで完結。
  // hook 使用: UI.randomFill を一度だけ clean wrap (timing war 廃止)。
  //            実 LLM 呼び出しは Api.call を直接使う (wrap せず)。
  // ====================================================================
  (function seedAware(){
    var TAG = '[v292:seed_aware]';
    var SEED_EXPAND_THRESHOLD = 50;

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

    var GENDER_RE = /^性別\s*[:：]\s*[^。\n]*。?\s*$/;
    function stripGenderPrefix(s){
      return String(s || '').replace(/^性別\s*[:：]\s*[^。\n]*。\s*/, '').trim();
    }
    function isEffectivelyBlank(s){
      if (!s) return true;
      var t = String(s).trim();
      if (!t) return true;
      if (GENDER_RE.test(t)) return true;
      if (!stripGenderPrefix(t)) return true;
      return false;
    }

    function snapshotBlanks(){
      var blank = {
        sceneLore: !val('cfgLore'),
        sceneLoc:  !val('cfgLoc'),
        sceneObj:  !val('cfgObj'),
        sceneTone: !val('cfgTone'),
        hName: !val('cfgHName'),
        hDesc: !val('cfgHDesc'),
        oldNpcCount: 0,
        npcs: []
      };
      var cards = document.querySelectorAll('#npcList .npc-card');
      blank.oldNpcCount = cards.length;
      cards.forEach(function(card){
        var n = card.querySelector('[data-f="name"]');
        var d = card.querySelector('[data-f="desc"]');
        blank.npcs.push({
          name: n ? !n.value.trim() : false,
          desc: d ? !d.value.trim() : false
        });
      });
      if (!blank.hDesc && isEffectivelyBlank(val('cfgHDesc'))) blank.hDesc = true;
      cards.forEach(function(card, i){
        if (!blank.npcs[i] || blank.npcs[i].desc) return;
        var dc = card.querySelector('[data-f="desc"]');
        if (dc && isEffectivelyBlank(dc.value)) blank.npcs[i].desc = true;
      });
      return blank;
    }

    function extendBlanksForNewNpcs(blank){
      var cards = document.querySelectorAll('#npcList .npc-card');
      for (var i = blank.oldNpcCount; i < cards.length; i++){
        blank.npcs[i] = { name: true, desc: true };
      }
    }

    function clearGenderPlaceholders(blank){
      if (blank.hDesc){
        var hDesc = document.getElementById('cfgHDesc');
        if (hDesc && GENDER_RE.test(hDesc.value.trim())){
          hDesc.value = '';
          try { hDesc.dispatchEvent(new Event('input', {bubbles:true})); } catch(e){}
        }
      }
      document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
        if (blank.npcs[i] && blank.npcs[i].desc){
          var dc = card.querySelector('[data-f="desc"]');
          if (dc && GENDER_RE.test(dc.value.trim())){
            dc.value = '';
            try { dc.dispatchEvent(new Event('input', {bubbles:true})); } catch(e){}
          }
        }
      });
    }

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
    function shouldExpandHDesc(blank){
      var s = getHeroDescSeed(blank);
      return !!s && s.length < SEED_EXPAND_THRESHOLD;
    }
    function shouldExpandNpcDesc(blank, i){
      var s = getNpcDescSeed(blank, i);
      return !!s && s.length < SEED_EXPAND_THRESHOLD;
    }
    function shouldWriteHDesc(blank){
      return blank.hDesc || shouldExpandHDesc(blank);
    }
    function shouldWriteNpcDesc(blank, i){
      return (blank.npcs[i] && blank.npcs[i].desc) || shouldExpandNpcDesc(blank, i);
    }

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
    function writeGenderRadio(name, g){
      if (g !== '女性' && g !== '男性') return false;
      var radios = document.querySelectorAll('input[name="' + name + '"]');
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
    function inferGenderFromDesc(desc){
      if (!desc) return '';
      var s = String(desc);
      if (/^\s*性別\s*[:：]\s*女/.test(s)) return '女性';
      if (/^\s*性別\s*[:：]\s*男/.test(s)) return '男性';
      var fHits = (s.match(/(少女|令嬢|乙女|女王|王女|魔女|尼僧|シスター|聖女|淑女|姉(?!弟)|妹|母|妻|娘|女性|女子|お嬢|彼女)/g) || []).length;
      var mHits = (s.match(/(少年|青年|男性|男子|男(?!装|爵)|父(?!権)|兄(?!妹)|弟|息子|王子|武士|武人|彼は|彼が|彼を)/g) || []).length;
      if (fHits > mHits) return '女性';
      if (mHits > fHits) return '男性';
      return '';
    }
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
    function listExpandFields(blank){
      var exp = [];
      if (shouldExpandHDesc(blank)) exp.push('hero.desc');
      blank.npcs.forEach(function(n, i){
        if (shouldExpandNpcDesc(blank, i)) exp.push('npcs[' + i + '].desc');
      });
      return exp;
    }

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
          seeds.push('主人公像の種: 「' + hSeed + '」 → これを 50〜120 字に膨らませる');
        } else {
          seeds.push('主人公像 (確定): 「' + hSeed + '」 (LLM は触らない)');
        }
      }
      var hGc = getHeroGenderConstraint(blank);
      if (hGc.gender){
        seeds.push('主人公の性別: 「' + hGc.gender + '」 → 必ずその性別の人物として書く');
      }
      document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
        var nm = card.querySelector('[data-f="name"]');
        if (nm && nm.value.trim() && blank.npcs[i] && !blank.npcs[i].name){
          seeds.push('NPC[' + i + ']名の種: 「' + nm.value.trim() + '」');
        }
        var nSeed = getNpcDescSeed(blank, i);
        if (nSeed){
          if (nSeed.length < SEED_EXPAND_THRESHOLD){
            seeds.push('NPC[' + i + ']像の種: 「' + nSeed + '」 → これを 50〜100 字に膨らませる');
          } else {
            seeds.push('NPC[' + i + ']像 (確定): 「' + nSeed + '」 (LLM は触らない)');
          }
        }
        var nGc = getNpcGenderConstraint(blank, i);
        if (nGc.gender){
          seeds.push('NPC[' + i + ']の性別: 「' + nGc.gender + '」 → 必ずその性別の人物として書く');
        }
      });
      return seeds;
    }

    function buildSeedPrompt(blank){
      var ask = listAskFields(blank);
      if (ask.length === 0) return null;
      var expand = listExpandFields(blank);
      var seeds = collectSeeds(blank);
      var sys = [
        'TRPG セッションの世界観とキャラクター一式を作ってください。',
        '',
        '【最重要 — 設計思想】',
        '・プレイヤーの「種(seed)」は、その意図を絶対に保つ。キーワード・含意を消したり言い換えたりしない',
        '・短い種は、その方向に世界を豊かに広げる。空欄は種に馴染むよう自由に発明してよい',
        '・「制約より刺激」: 種を否定する形ではなく、種を肯定し膨らませる方向で書く',
        '',
        '【種を膨らませるフィールド — 厳守】',
        '・「種を膨らませるフィールド」リストにあるフィールドは、既存の値を「種」として、',
        '  キーワード・含意を必ず保ったまま指定の文字数まで具体性を加えて膨らませる',
        '・例: 種「呪われた少女」→「16歳、左目に呪印を持つ寡黙な少女。母方に伝わる呪いを断ち切るため旅に出た」',
        '・新しい desc は種を完全に置き換える形で書き直す',
        '',
        '【性別の整合性 — 厳守】',
        '・seeds で性別が明示されたキャラの desc は、必ずその性別の人物として書く',
        '・指定と矛盾する性別語 (男性指定なのに「少女」「彼女」、女性指定なのに「青年」「彼は」) は不可',
        '',
        '【視点 (POV)】',
        '・hero.desc は「主人公本人の像」(年齢/性別/職能/特徴/小さな秘密)。他者視点 NG',
        '・npc[].desc は「外から見た第一印象」(役割/関係/癖/雰囲気)',
        '・scene.lore は「世界の根本ルール」として客観的に',
        '',
        '【desc の量】',
        '・hero.desc は 50〜120 文字、npc[].desc は 50〜100 文字',
        '・「性別: ◯」だけで終わるのは絶対に不可',
        '',
        '・出力は厳密に JSON のみ。前後に説明文・コードフェンス・コメントは付けない',
        '・JSON 値内の引用符は「」や『』を使う (素の " は JSON が壊れる)'
      ].join('\n');
      var user = [
        '【プレイヤーの種 (seed) — 意図を保ってください】',
        seeds.length ? seeds.join('\n') : '(なし — 完全に自由に発明してよい)',
        '',
        '【生成してほしいフィールド】',
        JSON.stringify(ask),
        '',
        '【種を膨らませるフィールド】',
        expand.length ? JSON.stringify(expand) : '(なし)',
        '',
        '【NPC 数】 ' + blank.npcs.length,
        '',
        '【出力 JSON 形式】',
        '{"scene":{"lore":"...","loc":"...","obj":"...","tone":"..."},"hero":{"name":"...","desc":"..."},"npcs":[{"name":"...","desc":"..."}]}',
        '',
        '※ ask に含まれるフィールドだけ含めればよい。',
        '※ 文字列値の中に " を使わない。代わりに「」を使う。'
      ].join('\n');
      return { sys: sys, user: user };
    }

    function escapeJpInlineQuotes(s){
      var out = '';
      for (var i = 0; i < s.length; i++){
        var c = s[i];
        if (c === '"'){
          var prev = i > 0 ? s.charCodeAt(i - 1) : 0;
          var next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
          var isJp = function(cc){
            return (cc >= 0x3040 && cc <= 0x309F) ||
                   (cc >= 0x30A0 && cc <= 0x30FF) ||
                   (cc >= 0x4E00 && cc <= 0x9FFF) ||
                   (cc >= 0xFF01 && cc <= 0xFF60) ||
                   (cc >= 0x3000 && cc <= 0x303F);
          };
          if (isJp(prev) && isJp(next)){
            out += '\\"';
            continue;
          }
        }
        out += c;
      }
      return out;
    }
    function safeParseJson(text){
      if (!text) return null;
      var s = String(text).trim();
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
      try { return JSON.parse(s); } catch (e) {}
      var lo = s.indexOf('{'), hi = s.lastIndexOf('}');
      var trimmed = (lo >= 0 && hi > lo) ? s.slice(lo, hi + 1) : s;
      try { return JSON.parse(trimmed); } catch (e) {}
      var repaired = escapeJpInlineQuotes(trimmed);
      try { return JSON.parse(repaired); } catch (e) {}
      return null;
    }

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

    function syncGenderRadiosToDesc(blank){
      var synced = 0;
      if (shouldWriteHDesc(blank)){
        var hd = val('cfgHDesc');
        var inferred = inferGenderFromDesc(hd);
        if (inferred){
          var current = readHeroGender();
          if (current !== inferred && writeGenderRadio('v108g_hero', inferred)) synced++;
        }
      }
      blank.npcs.forEach(function(b, i){
        if (!shouldWriteNpcDesc(blank, i)) return;
        var card = document.querySelectorAll('#npcList .npc-card')[i];
        if (!card) return;
        var dc = card.querySelector('[data-f="desc"]');
        if (!dc) return;
        var nd = dc.value.trim();
        var inf = inferGenderFromDesc(nd);
        if (!inf) return;
        var cur = readNpcGender(i);
        if (cur !== inf && writeGenderRadio('v108g_npc' + i, inf)) synced++;
      });
      return synced;
    }

    function syncStateFromForm(){
      try {
        if (!window.S) return;
        if (S.cast && S.cast.hero){
          S.cast.hero.name = val('cfgHName');
          S.cast.hero.desc = val('cfgHDesc');
        }
        if (S.scene){
          S.scene.lore = val('cfgLore');
          S.scene.loc  = val('cfgLoc');
          S.scene.obj  = val('cfgObj');
          S.scene.tone = val('cfgTone');
        }
        if (S.cast){
          S.cast.npcs = S.cast.npcs || [];
          document.querySelectorAll('#npcList .npc-card').forEach(function(card, i){
            S.cast.npcs[i] = S.cast.npcs[i] || {};
            var nameEl = card.querySelector('[data-f="name"]');
            var descEl = card.querySelector('[data-f="desc"]');
            if (nameEl) S.cast.npcs[i].name = nameEl.value.trim();
            if (descEl) S.cast.npcs[i].desc = descEl.value.trim();
          });
        }
        if (S.save) S.save();
      } catch(e){
        console.warn(TAG, 'state sync failed:', e && e.message);
      }
    }

    function hasApiKey(){
      try {
        if (!window.S || !S.cfg) return false;
        var prov = S.cfg.provider || '';
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

    function runEnhance(blank){
      extendBlanksForNewNpcs(blank);
      if (!hasApiKey()){
        console.log(TAG, 'no API key — keep base random fill');
        return;
      }
      clearGenderPlaceholders(blank);
      var pr = buildSeedPrompt(blank);
      if (!pr){
        console.log(TAG, 'no blank/expand fields — skip LLM');
        return;
      }
      if (typeof Api !== 'object' || !Api || typeof Api.call !== 'function'){
        console.warn(TAG, 'Api.call not available');
        return;
      }
      var ask = listAskFields(blank);
      var expand = listExpandFields(blank);
      showStatus(expand.length ? '🌱 種を膨らませて世界を編む…' : '🌱 世界とキャラを生成中…');
      console.log(TAG, 'LLM ask=', ask.length, 'expand=', expand.length, 'seeds=', collectSeeds(blank).length);

      Api.call(pr.sys, pr.user, 2400).then(function(r){
        if (!r || !r.text){
          console.warn(TAG, 'empty LLM response');
          showStatus('🎲 ランダム生成 (LLM 応答なし)');
          return;
        }
        var parsed = safeParseJson(r.text);
        if (!parsed){
          console.warn(TAG, 'parse failed:', String(r.text).slice(0, 200));
          showStatus('🎲 ランダム生成 (解析失敗)');
          return;
        }
        var n = applyResult(blank, parsed);
        syncGenderRadiosToDesc(blank);
        syncStateFromForm();
        showStatus('🌱 ' + n + ' 件の種を世界に咲かせました');
        console.log(TAG, 'applied', n, 'fields');
      }).catch(function(e){
        console.warn(TAG, 'LLM error:', e && e.message);
        showStatus('🎲 ランダム生成 (LLM スキップ)');
      });
    }

    function bindRandomFill(){
      if (typeof UI !== 'object' || !UI) return false;
      if (typeof UI.randomFill !== 'function') return false;
      if (UI.__v292SeedAwareBound) return true;
      var orig = UI.randomFill.bind(UI);
      UI.randomFill = function(){
        var blank = snapshotBlanks();
        console.log(TAG, 'snapshot', blank);
        var r = orig.apply(this, arguments);
        setTimeout(function(){ runEnhance(blank); }, 100);
        return r;
      };
      UI.__v292SeedAwareBound = true;
      console.log(TAG, 'UI.randomFill clean-bound (single wrap, no timing war)');
      return true;
    }

    function register(){
      if (!bindRandomFill()){
        setTimeout(bindRandomFill, 0);
      }
      window.__v292 = window.__v292 || {};
      window.__v292.seedAware = {
        snapshotBlanks: snapshotBlanks,
        buildSeedPrompt: buildSeedPrompt,
        safeParseJson: safeParseJson,
        runEnhance: runEnhance,
        SEED_EXPAND_THRESHOLD: SEED_EXPAND_THRESHOLD
      };
      console.log(TAG, 'registered');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 8. auto_bootstrap (v289)
  // 目的: 設定パネルを使わず STORY モードでいきなり開始した場合、narrative から
  //       カタカナ名・場所・目的をヒューリスティック抽出し S.cast / S.scene に
  //       初期アンカーを埋める。
  // 旧パッチ: v289 (Planner.build wrap + 4-tier setTimeout watchdog)
  // hook 使用: UI._renderHooks (各ターン render 後に bootstrap チェック 1 回)
  //            S.cast.hero.name が既に入っていれば即 return (idempotent)。
  // ====================================================================
  (function autoBootstrap(){
    var TAG = '[v292:auto_bootstrap]';

    var KATAKANA_BLACKLIST = {
      'ランプ':1,'カウンター':1,'グラス':1,'ガラス':1,'ドア':1,'テーブル':1,'ベッド':1,
      'テスト':1,'ベル':1,'ポーチ':1,'シャツ':1,'スカート':1,'ハンカチ':1,'チケット':1,
      'チラシ':1,'ケース':1,'スーツ':1,'ノート':1,'ペン':1,'ボタン':1,'ボール':1,
      'スマホ':1,'タオル':1,'ナイフ':1,'フォーク':1,'スプーン':1,'コーヒー':1,'ティー':1,
      'ワイン':1,'ビール':1,'メニュー':1,'レジ':1,'チェア':1,'ソファ':1,'カーテン':1,
      'ベランダ':1,'バルコニー':1,'マンション':1,'アパート':1,'ホテル':1,'ホール':1,
      'ロビー':1,'コリドー':1,'カフェ':1,'バー':1,'クラブ':1,'パブ':1,'プラザ':1,
      'パーク':1,'プール':1,'シャワー':1,'バスルーム':1,'トイレ':1,'パソコン':1,
      'ケータイ':1,'モニター':1,'カメラ':1,'レンズ':1,'マスク':1,'コート':1,'ブーツ':1,
      'スニーカー':1,'ベルト':1,'バッグ':1,'リュック':1,'ハット':1,'キャップ':1,
      'マフラー':1,'ガード':1,'シールド':1,'アーマー':1,'ヘルム':1,'ロッド':1,
      'ポーション':1,'マナ':1,'ヒール':1,'バフ':1,'デバフ':1
    };

    function extractKatakanaNames(text){
      if (!text) return [];
      var rx = /([ァ-ヺ][ァ-ヺー]{1,5})(?=[はがのとをにと、。\s」｜・]|$)/g;
      var out = [], seen = {}, m;
      while ((m = rx.exec(text)) !== null){
        var n = m[1];
        if (!n || n.length < 2) continue;
        if (KATAKANA_BLACKLIST[n]) continue;
        if (seen[n]) continue;
        seen[n] = true;
        out.push(n);
      }
      return out;
    }

    function extractDescBefore(text, name){
      if (!text || !name) return '';
      var idx = text.indexOf(name);
      if (idx < 0) return '';
      var head = text.slice(0, idx);
      var cut = Math.max(
        head.lastIndexOf('、'),
        head.lastIndexOf('。'),
        head.lastIndexOf('\n'),
        head.lastIndexOf('「')
      );
      var fragment = head.slice(cut + 1).trim();
      if (fragment.length < 2 || fragment.length > 60) return '';
      return fragment;
    }

    function collectDialogueSpeakers(turns){
      var counts = {};
      (turns || []).forEach(function(t){
        var dlg = (t && t.dialogues) || (t && t.plan && t.plan.dialogues) || [];
        dlg.forEach(function(d){
          var w = (d && (d.who || d.speaker || d.name)) || '';
          if (w) counts[w] = (counts[w] || 0) + 1;
        });
      });
      return counts;
    }

    function extractSceneLoc(text){
      if (!text) return '';
      var locRx = /((?:深夜|夜|早朝|朝|昼|夕|真昼|真夜中)?の?[぀-ゟ゠-ヿ一-鿿]{2,18}(?:町|村|市|国|城|館|学校|学園|寮|宿|邸|港|森|林|湖|山|海岸|海辺|平原|地下|塔|塞|路地|広場|室|店|喫茶店|酒場|宿屋|遊園地|庭|公園|寺|神社|教会|礼拝堂|工場|研究所|病院|駅|空港|空き地|廃墟|霊廟|地下室|食堂|厨房|寝室|書斎|書店|図書館|雑貨屋|ジム|ジャングル|砂漠|渓谷|洞窟))/;
      var m = text.match(locRx);
      return m ? m[0].trim() : '';
    }

    function extractSceneObj(text){
      if (!text) return '';
      var objRx = /([^、。\n「」]{2,32})(?:を探|を捜|を求|を討|を倒|を解|に向か|に至|を持ち帰|から救|を取り戻|を奪い返|を見つけ)/;
      var m = text.match(objRx);
      return m ? m[0].trim() : '';
    }

    function isEmpty(s){ return !s || (typeof s === 'string' && s.trim().length === 0); }

    function extractFromState(){
      if (!window.S) return null;
      var prevTurns = Array.isArray(S.turns) ? S.turns : [];
      if (!prevTurns.length) return null;
      var sources = [];
      prevTurns.forEach(function(t){
        if (t && t.playerText) sources.push(t.playerText);
        if (t && t.narrative)  sources.push(t.narrative);
      });
      var combined = sources.join('\n');
      var primary = sources[0] || '';
      var names = extractKatakanaNames(combined);
      var dlgSpk = collectDialogueSpeakers(prevTurns);

      var heroName = '';
      for (var i = 0; i < names.length; i++){
        if (primary.indexOf(names[i]) >= 0){ heroName = names[i]; break; }
      }
      if (!heroName) heroName = names[0] || '';

      var hero = heroName ? {
        name: heroName,
        desc: extractDescBefore(primary, heroName) || extractDescBefore(combined, heroName) || ''
      } : null;

      var npcSet = {}, npcs = [];
      names.forEach(function(n){
        if (n === heroName) return;
        if (npcSet[n]) return;
        npcSet[n] = true;
        npcs.push({ name: n, desc: extractDescBefore(combined, n) || '' });
      });
      Object.keys(dlgSpk).forEach(function(sp){
        if (sp === heroName || npcSet[sp]) return;
        npcSet[sp] = true;
        npcs.push({ name: sp, desc: '' });
      });

      return {
        hero: hero,
        npcs: npcs,
        scene: {
          loc: extractSceneLoc(primary) || extractSceneLoc(combined),
          obj: extractSceneObj(primary) || extractSceneObj(combined)
        }
      };
    }

    function applyBootstrap(extracted){
      if (!extracted || !window.S || !S.cast) return false;
      var changed = false;
      if (extracted.hero){
        S.cast.hero = S.cast.hero || {};
        if (isEmpty(S.cast.hero.name)){ S.cast.hero.name = extracted.hero.name; changed = true; }
        if (isEmpty(S.cast.hero.desc) && extracted.hero.desc){ S.cast.hero.desc = extracted.hero.desc; changed = true; }
      }
      if (extracted.npcs && extracted.npcs.length){
        S.cast.npcs = S.cast.npcs || [];
        var existing = {};
        S.cast.npcs.forEach(function(n){ if (n && n.name) existing[n.name] = true; });
        extracted.npcs.forEach(function(np){
          if (existing[np.name]) return;
          S.cast.npcs.push({ name: np.name, desc: np.desc || '' });
          existing[np.name] = true;
          changed = true;
        });
      }
      if (extracted.scene){
        S.scene = S.scene || {};
        if (isEmpty(S.scene.loc) && extracted.scene.loc){ S.scene.loc = extracted.scene.loc; changed = true; }
        if (isEmpty(S.scene.obj) && extracted.scene.obj){ S.scene.obj = extracted.scene.obj; changed = true; }
      }
      return changed;
    }

    function maybeBootstrap(){
      try {
        if (!window.S || !S.cast) return;
        if (S.cast.hero && S.cast.hero.name && String(S.cast.hero.name).trim()) return;
        var ex = extractFromState();
        if (!ex) return;
        if (!ex.hero && (!ex.npcs || !ex.npcs.length) && !ex.scene.loc && !ex.scene.obj) return;
        var changed = applyBootstrap(ex);
        if (changed){
          try { if (S.save) S.save(); } catch(e){}
          console.log(TAG, 'bootstrapped:',
            'hero=', ex.hero ? ex.hero.name : '(none)',
            'npcs=', (ex.npcs || []).map(function(n){ return n.name; }).join(','),
            'loc=', ex.scene.loc,
            'obj=', ex.scene.obj);
        }
      } catch(e){
        console.warn(TAG, 'bootstrap fail:', e && e.message);
      }
    }

    function register(){
      if (!Array.isArray(UI && UI._renderHooks)){
        console.warn(TAG, 'UI._renderHooks missing — feature disabled');
        return;
      }
      UI._renderHooks.push(function autoBootstrapHook(){
        maybeBootstrap();
      });
      setTimeout(maybeBootstrap, 0);

      window.__v292 = window.__v292 || {};
      window.__v292.autoBootstrap = {
        extractKatakanaNames: extractKatakanaNames,
        extractSceneLoc: extractSceneLoc,
        extractSceneObj: extractSceneObj,
        extractFromState: extractFromState,
        maybeBootstrap: maybeBootstrap
      };
      console.log(TAG, 'registered (render hook + initial sweep)');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 9. memory (v219)
  // 目的: 各キャラの長期 state (場所/服装/拘束/怪我/心理プロファイル/トラウマ) を
  //       narrative から正規表現で抽出し、毎ターン累積する。sys prompt に
  //       「キャラクター継続状態」ブロックとして注入することで、LLM に状態を
  //       忘れさせない。
  // 旧パッチ: v219 (元実装は fetch wrap も setInterval も使わない素直な構造)
  // hook 使用: UI._renderHooks (毎ターン updateAllStates)
  //            Planner._extensions (sys に動的 buildStateBlock を inject)
  //            PromptRegistry は静的 text のみ → _extensions の方が毎ターン最新を読める。
  // ====================================================================
  (function memory(){
    var TAG = '[v292:memory]';

    var LOC = {
      '図書館': /図書館|書架|書庫|本棚/,
      '森':     /森|樹海|木立/,
      '洞窟':   /洞窟|岩穴|地底/,
      '城':     /城|王宮/,
      '酒場':   /酒場|宿屋|宿/,
      '神殿':   /神殿|聖堂|教会/,
      '部屋':   /部屋|寝室|ベッドルーム/,
      '廊下':   /廊下|通路/,
      '地下室': /地下室|地下牢|牢獄/
    };
    var CLO = {
      '服が破れている': /服が[^\n]{0,10}(破れ|裂け|引き裂か)/,
      '半裸':           /(半裸|肌着|下着姿)/,
      '全裸':           /(全裸|裸|何も身に[^\n]{0,5}着け)/,
      '服が乱れている': /(服|衣服)が[^\n]{0,10}乱れ/,
      '濡れている':     /(濡れ[てた]|びしょ濡れ|ずぶ濡れ)/
    };
    var REST = {
      '両手を縛られている': /(両?手[をが])[^\n]{0,10}(縛|拘束|繋|結ば)/,
      '足を縛られている':   /(両?足[をが])[^\n]{0,10}(縛|拘束|繋)/,
      '猿轡':                /(猿轡|口を塞|口を封)/,
      '吊るされている':       /(吊られ|吊るさ|宙吊り)/,
      '押さえつけられている': /(押さえつけ|床に倒|地面に倒)/
    };
    var INJ = {
      '出血':   /(血が[^\n]{0,5}(流|滴|溢|噴)|血まみれ|流血)/,
      '打撲':   /(打撲|殴られ|蹴られ|顔[をが][^\n]{0,5}腫れ)/,
      '擦り傷': /(擦り傷|引っ掛[きか]れ|擦りむ)/,
      '切り傷': /(切り傷|刺し傷|切られ|刺され)/,
      '気絶':   /(気絶|意識を[^\n]{0,5}失|気を失)/
    };
    var EVT = {
      '怪異に襲われた': /(怪異|化け物|魔物)[^\n]{0,15}(襲|掴|押し倒|捕)/,
      '弄ばれた':       /(弄[ばれればはん]|玩具にさ|嬲)/,
      '助けに来た':     /(助けに来|救出|駆けつけ)/,
      '逃げ出した':     /(逃げ[出だ]|脱出|逃走)/,
      '泣き出した':     /(泣[いきく][だてた]|嗚咽|涙[があ])/
    };

    function ensureState(c){
      if (!c.state){
        c.state = {
          location: '',
          clothing: '',
          restraints: [],
          injuries: [],
          mentalProfile: {
            fear: c.stress || 0,
            trust: c.trust || 50,
            tension: 0,
            despair: 0
          },
          trauma: [],
          recentEvents: [],
          lastUpdate: 0
        };
      }
      if (!c.state.restraints)    c.state.restraints = [];
      if (!c.state.injuries)      c.state.injuries = [];
      if (!c.state.trauma)        c.state.trauma = [];
      if (!c.state.recentEvents)  c.state.recentEvents = [];
      if (!c.state.mentalProfile) c.state.mentalProfile = { fear: 0, trust: 50, tension: 0, despair: 0 };
      return c.state;
    }

    function updateChar(c, narr){
      if (!c || !c.name || !narr) return false;
      var st = ensureState(c);
      var changed = false;
      var idx = narr.indexOf(c.name);
      if (idx < 0) return false;
      var passage = narr.substring(Math.max(0, idx - 100), Math.min(narr.length, idx + 300));
      Object.keys(LOC).forEach(function(k){
        if (LOC[k].test(passage) && st.location !== k){ st.location = k; changed = true; }
      });
      Object.keys(CLO).forEach(function(k){
        if (CLO[k].test(passage) && st.clothing !== k){ st.clothing = k; changed = true; }
      });
      Object.keys(REST).forEach(function(k){
        if (REST[k].test(passage) && st.restraints.indexOf(k) < 0){ st.restraints.push(k); changed = true; }
      });
      Object.keys(INJ).forEach(function(k){
        if (INJ[k].test(passage) && st.injuries.indexOf(k) < 0){ st.injuries.push(k); changed = true; }
      });
      Object.keys(EVT).forEach(function(k){
        if (EVT[k].test(passage)){
          if (st.recentEvents[st.recentEvents.length - 1] !== k){
            st.recentEvents.push(k);
            if (st.recentEvents.length > 5) st.recentEvents.shift();
            changed = true;
          }
          if (['弄ばれた','怪異に襲われた','気絶'].indexOf(k) >= 0 && st.trauma.indexOf(k) < 0){
            st.trauma.push(k);
            changed = true;
          }
        }
      });
      var fearM = (passage.match(/恐怖|怯え|震え|戦慄|怖[いく]/g) || []).length;
      var despM = (passage.match(/絶望|諦め|もう駄目|もう無理/g) || []).length;
      if (fearM > 0){
        st.mentalProfile.fear = Math.min(100, st.mentalProfile.fear + fearM * 5);
        changed = true;
      }
      if (despM > 0){
        st.mentalProfile.despair = Math.min(100, st.mentalProfile.despair + despM * 8);
        changed = true;
      }
      if (typeof c.stress === 'number') st.mentalProfile.fear = Math.max(st.mentalProfile.fear, c.stress);
      if (typeof c.trust  === 'number') st.mentalProfile.trust = c.trust;
      if (changed) st.lastUpdate = Date.now();
      return changed;
    }

    function updateAllStates(){
      try {
        if (!window.S || !S.cast || !Array.isArray(S.turns)) return;
        var turns = S.turns;
        if (!turns.length) return;
        var last = turns[turns.length - 1];
        if (!last || !last.narrative) return;
        var all = [];
        if (S.cast.hero) all.push(S.cast.hero);
        if (S.cast.npcs) all = all.concat(S.cast.npcs);
        var anyChanged = false;
        all.forEach(function(c){
          if (updateChar(c, last.narrative)) anyChanged = true;
        });
        if (anyChanged){
          try { if (S.save) S.save(); } catch(e){}
          console.log(TAG, 'states updated');
        }
      } catch(e){
        console.warn(TAG, 'updateAllStates err:', e && e.message);
      }
    }

    function buildStateBlock(){
      try {
        if (!window.S || !S.cast) return '';
        var lines = ['# 🧠 キャラクター継続状態 (絶対遵守)', ''];
        var any = false;
        function describe(c, role){
          if (!c || !c.name || !c.state) return;
          any = true;
          var st = c.state;
          lines.push('**' + c.name + '** (' + role + (c.gender ? '・' + c.gender : '') + ')：');
          if (st.location) lines.push('- 場所：' + st.location);
          if (st.clothing) lines.push('- 服装：' + st.clothing);
          if (st.restraints && st.restraints.length) lines.push('- 拘束：' + st.restraints.join('、'));
          if (st.injuries   && st.injuries.length)   lines.push('- 怪我：' + st.injuries.join('、'));
          var mp = st.mentalProfile || {};
          var psy = [];
          if (mp.fear)    psy.push('恐怖' + mp.fear);
          if (mp.tension) psy.push('緊張' + mp.tension);
          if (mp.despair) psy.push('絶望' + mp.despair);
          if (typeof mp.trust === 'number') psy.push('信頼' + mp.trust);
          if (psy.length) lines.push('- 心理：' + psy.join('、'));
          if (st.trauma && st.trauma.length) lines.push('- 累積トラウマ：' + st.trauma.join('、'));
          if (st.recentEvents && st.recentEvents.length){
            lines.push('- 直近：' + st.recentEvents.slice(-3).join(' → '));
          }
          lines.push('');
        }
        if (S.cast.hero) describe(S.cast.hero, '主人公');
        (S.cast.npcs || []).forEach(function(n){ describe(n, 'NPC'); });
        if (!any) return '';
        lines.push('## 状態の継続性ルール');
        lines.push('- 上記の状態は **継続している現実**');
        lines.push('- 服が破れている・裸のキャラを **勝手に着直させない**');
        lines.push('- 拘束されているキャラを **勝手に解放しない**');
        lines.push('- 怪我は時間が経っても治らない');
        lines.push('- 心理状態は急変させず、徐々に変動');
        lines.push('- 累積トラウマは完全に忘れさせない');
        return lines.join('\n');
      } catch(e){
        return '';
      }
    }

    function register(){
      if (Array.isArray(UI && UI._renderHooks)){
        UI._renderHooks.push(function memoryHook(){
          updateAllStates();
        });
      } else {
        console.warn(TAG, 'UI._renderHooks missing');
      }
      if (Array.isArray(Planner && Planner._extensions)){
        Planner._extensions.push(function memoryExt(ctx){
          try {
            var block = buildStateBlock();
            if (!block) return ctx.sys;
            if (ctx.sys && ctx.sys.indexOf('# 🧠 キャラクター継続状態') >= 0) return ctx.sys;
            return (ctx.sys || '') + '\n\n' + block;
          } catch(e){ return ctx.sys; }
        });
      } else {
        console.warn(TAG, 'Planner._extensions missing');
      }

      window.__v292 = window.__v292 || {};
      window.__v292.memory = {
        updateChar: updateChar,
        updateAllStates: updateAllStates,
        buildStateBlock: buildStateBlock,
        ensureState: ensureState
      };
      console.log(TAG, 'registered (render hook + sys extension)');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 10. state_inference (v259)
  // 目的: 各ターン narrative 受信後、追加 LLM 呼び出しでキャラ状態 (alive /
  //       conscious / canSpeak / canAct / hpEstimate / condition) を JSON 推論。
  //       結果を S.cast.*.state に永続化し、sys prompt に注入することで、
  //       死亡キャラが台詞を発するなどの矛盾を防ぐ。
  // 旧パッチ: v259 (Planner.build wrap + localStorage setItem hook +
  //          setInterval(decorateCards, 2500) + hook-retry setInterval × 30)
  // hook 使用: UI._renderHooks (新 turn 検出 + 推論トリガー + card 装飾)
  //            Planner._extensions (sys に動的 state block 注入)
  //            すべての setInterval を廃止。decorate は render 内で 1 回。
  // 注意: 追加 API call を発生させるためデフォルト OFF。
  //       window.__v292.stateInference.setEnabled(true) で ON。
  // ====================================================================
  (function stateInference(){
    var TAG = '[v292:state_inference]';
    var LS_KEY = 'chr_v259_enabled';

    function isEnabled(){
      try {
        var v = localStorage.getItem(LS_KEY);
        return v === 'true';
      } catch(e){ return false; }
    }
    function setEnabled(b){
      try { localStorage.setItem(LS_KEY, b ? 'true' : 'false'); } catch(e){}
    }

    var DEATH_RX  = /死んだ|死亡|息絶え|絶命|事切れ|骨と皮|皮と骨|食われた|肉片|首が[^。\n]{0,5}飛|心臓を[^。\n]{0,5}貫/;
    var DYING_RX  = /瀕死|虫の息|血の海|致命傷|意識が薄れ|呼吸が浅く|もう保たない/;
    var KO_RX     = /気絶|失神|意識を失|昏倒|崩れ落ち|意識が遠の/;
    var SILENT_RX = /口を縫われ|声が出せ|声を奪わ|猿轡|呪縛|喉を潰さ|口を塞がれ/;

    function inferStateByKeyword(name, narrative){
      if (!narrative) return null;
      var idx = narrative.indexOf(name);
      if (idx < 0) return null;
      var passage = narrative.substring(Math.max(0, idx - 60), Math.min(narrative.length, idx + 200));
      var st = { alive: true, conscious: true, canSpeak: true, canAct: true, hpEstimate: 80, condition: '', reason: 'keyword' };
      if (DEATH_RX.test(passage)){
        st.alive = false; st.conscious = false; st.canSpeak = false; st.canAct = false;
        st.hpEstimate = 0; st.condition = '死亡';
      } else if (DYING_RX.test(passage)){
        st.hpEstimate = 5; st.condition = '瀕死'; st.canAct = false;
      } else if (KO_RX.test(passage)){
        st.conscious = false; st.canSpeak = false; st.canAct = false;
        st.hpEstimate = 20; st.condition = '気絶';
      }
      if (SILENT_RX.test(passage)){
        st.canSpeak = false;
        if (!st.condition) st.condition = '発声不可';
      }
      return st;
    }

    function buildInferPrompt(narrative, names){
      var sys = [
        'あなたは TRPG ゲームマスターです。直前の narrative を読み、各キャラクターの現在の状態を JSON 配列で推論してください。',
        '',
        '【出力フォーマット — 厳守】',
        '[{"name":"キャラ名","alive":true,"conscious":true,"canSpeak":true,"canAct":true,"hpEstimate":80,"condition":"無傷","reason":"narrative の根拠1行"}]',
        '',
        '・alive=false の場合、conscious/canSpeak/canAct もすべて false に。hpEstimate=0',
        '・気絶しているなら conscious=false, canSpeak=false, canAct=false',
        '・声を奪われている (猿轡/呪縛/喉を潰される) なら canSpeak=false',
        '・narrative に登場していないキャラは前回状態を維持する想定で「変化なし」相当の値を返す',
        '・出力は JSON 配列のみ。前後に説明文・コードフェンス禁止。'
      ].join('\n');
      var user = [
        '【narrative】',
        narrative,
        '',
        '【推論対象キャラクター】',
        JSON.stringify(names)
      ].join('\n');
      return { sys: sys, user: user };
    }

    function safeParseJsonArray(text){
      if (!text) return null;
      var s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
      try { return JSON.parse(s); } catch(e){}
      var lo = s.indexOf('['), hi = s.lastIndexOf(']');
      if (lo >= 0 && hi > lo){
        var t = s.slice(lo, hi + 1);
        try { return JSON.parse(t); } catch(e){}
      }
      return null;
    }

    // v292-D fix9: state transition の severity rank.
    //   旧 v264-266 相当 — 死亡/負傷の永続化のため、
    //   condition は severity を下げる方向の遷移を block する。
    var SEV_RANK = {
      '': 0, '無傷': 0,
      '軽傷': 1, '発声不可': 1,
      '重傷': 2,
      '気絶': 3,
      '瀕死': 4,
      '死亡': 5
    };
    function sevOf(cond){
      if (cond == null) return 0;
      var v = SEV_RANK[cond];
      return (typeof v === 'number') ? v : 0;
    }

    function applyInferred(arr){
      if (!arr || !Array.isArray(arr) || !window.S || !S.cast) return 0;
      var n = 0;
      function findChar(name){
        if (!name) return null;
        if (S.cast.hero && S.cast.hero.name === name) return S.cast.hero;
        var npcs = S.cast.npcs || [];
        for (var i = 0; i < npcs.length; i++){
          if (npcs[i] && npcs[i].name === name) return npcs[i];
        }
        return null;
      }
      arr.forEach(function(it){
        if (!it || !it.name) return;
        var c = findChar(it.name);
        if (!c) return;
        c.state = c.state || {};
        var prev = c.state;

        // v292-D fix9 (旧 v264-266 相当): 死亡/負傷の永続化
        //   LLM は narrative に登場していないキャラに対しても default
        //   ("alive":true,"hpEstimate":80,"condition":"無傷") を返すことが多く、
        //   前ターンで死亡/瀕死だったキャラが「復活」してしまう。
        //   state 遷移を monotonic に固定する:
        //     - alive: false → true への遷移を禁止 (永続死亡)
        //     - canSpeak: false → true への遷移を禁止 (失声/呪縛/猿轡の永続)
        //     - condition: severity を下げる方向の遷移を禁止
        //     - hpEstimate: 急回復 (+5/turn 超) を抑制

        // (1) 既に alive=false なら、以降の上書きは原則ブロック
        if (prev.alive === false){
          prev.alive      = false;
          prev.conscious  = false;
          prev.canSpeak   = false;
          prev.canAct     = false;
          prev.hpEstimate = 0;
          if (sevOf(prev.condition) < SEV_RANK['死亡']) prev.condition = '死亡';
          if (typeof it.reason === 'string') prev.reasonV259 = it.reason;
          prev.lastInferTurn = (S.turns || []).length;
          n++;
          return;
        }

        // (2) alive=false への新規遷移は無条件で許可。他フラグも強制 false に統一。
        if (it.alive === false){
          prev.alive      = false;
          prev.conscious  = false;
          prev.canSpeak   = false;
          prev.canAct     = false;
          prev.hpEstimate = 0;
          prev.condition  = '死亡';
          if (typeof it.reason === 'string') prev.reasonV259 = it.reason;
          prev.lastInferTurn = (S.turns || []).length;
          n++;
          return;
        }

        // (3) 生存中の更新: severity は下げない、急回復は抑制
        if (typeof it.alive === 'boolean') prev.alive = it.alive;

        if (typeof it.conscious === 'boolean') prev.conscious = it.conscious;

        if (typeof it.canSpeak === 'boolean'){
          // 失声系は永続。回復は revive() 経由のみ。
          if (prev.canSpeak === false){
            // keep false
          } else {
            prev.canSpeak = it.canSpeak;
          }
        }

        if (typeof it.canAct === 'boolean') prev.canAct = it.canAct;

        if (typeof it.hpEstimate === 'number'){
          var pHp = (typeof prev.hpEstimate === 'number') ? prev.hpEstimate : 80;
          // 回復は最大 +5/turn まで。減少は無制限。
          if (it.hpEstimate > pHp + 5) prev.hpEstimate = pHp + 5;
          else                          prev.hpEstimate = it.hpEstimate;
        }

        if (typeof it.condition === 'string'){
          // severity が下がる方向 (例: 瀕死 → 無傷) は無視。同等以上なら更新。
          if (sevOf(it.condition) >= sevOf(prev.condition)){
            prev.condition = it.condition;
          }
        }

        if (typeof it.reason === 'string') prev.reasonV259 = it.reason;
        prev.lastInferTurn = (S.turns || []).length;
        n++;
      });
      if (n > 0){
        try { if (S.save) S.save(); } catch(e){}
      }
      return n;
    }

    // v292-D fix9: 死亡/負傷を明示的に解除するデバッグヘルパー。
    //   ゲームリセット時や手動修正用。
    //   window.__v292.stateInference.revive(name) で呼ぶ。
    //   name を省略すると全キャラを revive。
    function revive(name){
      if (!window.S || !S.cast) return 0;
      var targets = [];
      if (S.cast.hero && (!name || S.cast.hero.name === name)) targets.push(S.cast.hero);
      (S.cast.npcs || []).forEach(function(c){
        if (c && (!name || c.name === name)) targets.push(c);
      });
      var n = 0;
      targets.forEach(function(c){
        if (!c.state) return;
        c.state.alive      = true;
        c.state.conscious  = true;
        c.state.canSpeak   = true;
        c.state.canAct     = true;
        c.state.hpEstimate = 80;
        c.state.condition  = '';
        c.state.reasonV259 = 'manual revive';
        n++;
      });
      if (n > 0){
        try { if (S.save) S.save(); } catch(e){}
        try {
          if (typeof UI !== 'undefined' && UI && typeof UI.renderAll === 'function') UI.renderAll();
        } catch(e){}
      }
      console.log(TAG, 'revived', n, 'char(s)' + (name ? ' (' + name + ')' : ''));
      return n;
    }

    function buildInferStateBlock(){
      try {
        if (!window.S || !S.cast) return '';
        var lines = ['# 🩻 現在のキャラクター状態 (v259 GM 推論)', ''];
        var any = false;
        function describe(c, role){
          if (!c || !c.name || !c.state) return;
          var st = c.state;
          if (st.alive === undefined && st.condition === undefined) return;
          any = true;
          var tag = '';
          if (st.alive === false) tag = ' [死亡]';
          else if (st.condition === '瀕死') tag = ' [瀕死]';
          else if (st.conscious === false) tag = ' [気絶]';
          else if (st.canSpeak === false) tag = ' [発声不可]';
          lines.push('- **' + c.name + '** (' + role + ')' + tag);
          var info = [];
          if (typeof st.hpEstimate === 'number') info.push('HP≈' + st.hpEstimate);
          if (st.condition) info.push(st.condition);
          if (st.canSpeak === false) info.push('話せない');
          if (st.canAct === false)   info.push('行動不能');
          if (info.length) lines.push('  状態: ' + info.join(' / '));
        }
        if (S.cast.hero) describe(S.cast.hero, '主人公');
        (S.cast.npcs || []).forEach(function(n){ describe(n, 'NPC'); });
        if (!any) return '';
        lines.push('');
        lines.push('## 状態厳守ルール');
        lines.push('- 死亡したキャラに台詞を発言させない (canSpeak=false → dialogue から除外)');
        lines.push('- 気絶/瀕死/発声不可のキャラは「……」「(声にならない呻き)」程度に留める');
        lines.push('- 行動不能 (canAct=false) のキャラに能動的な動作を取らせない');
        return lines.join('\n');
      } catch(e){ return ''; }
    }

    function decorateCards(){
      try {
        if (!window.S || !S.cast) return;
        var cards = document.querySelectorAll('#npcList .npc-card, .hero-card, [data-char-card]');
        if (!cards || !cards.length) return;
        function findStateByName(name){
          if (!name) return null;
          if (S.cast.hero && S.cast.hero.name === name) return S.cast.hero.state || null;
          var npcs = S.cast.npcs || [];
          for (var i = 0; i < npcs.length; i++){
            if (npcs[i] && npcs[i].name === name) return npcs[i].state || null;
          }
          return null;
        }
        cards.forEach(function(card){
          var nameEl = card.querySelector('[data-f="name"], .char-name');
          var name = '';
          if (nameEl){
            name = (nameEl.value || nameEl.textContent || '').trim();
          }
          if (!name) return;
          var st = findStateByName(name);
          if (!st) return;
          if (st.alive === false){
            card.style.opacity = '0.4';
            card.style.filter = 'grayscale(1)';
          } else if (st.condition === '瀕死'){
            card.style.opacity = '0.7';
            card.style.filter = '';
          } else if (st.conscious === false){
            card.style.opacity = '0.6';
            card.style.filter = '';
          } else {
            card.style.opacity = '';
            card.style.filter = '';
          }
        });
      } catch(e){
        console.warn(TAG, 'decorateCards err:', e && e.message);
      }
    }

    var lastInferredTurn = -1;
    function maybeInfer(){
      try {
        if (!isEnabled()) return;
        if (!window.S || !S.cast || !Array.isArray(S.turns)) return;
        var turns = S.turns;
        if (!turns.length) return;
        var curTurnIdx = turns.length - 1;
        if (curTurnIdx === lastInferredTurn) return;
        var last = turns[curTurnIdx];
        if (!last || !last.narrative) return;
        lastInferredTurn = curTurnIdx;

        var names = [];
        if (S.cast.hero && S.cast.hero.name) names.push(S.cast.hero.name);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) names.push(n.name); });
        if (!names.length) return;

        var narrative = last.narrative;

        var fallbackApplied = 0;
        names.forEach(function(name){
          var st = inferStateByKeyword(name, narrative);
          if (st){
            applyInferred([Object.assign({ name: name }, st)]);
            fallbackApplied++;
          }
        });

        if (typeof Api !== 'object' || !Api || typeof Api.call !== 'function') return;

        var pr = buildInferPrompt(narrative, names);
        Api.call(pr.sys, pr.user, 1000).then(function(r){
          if (!r || !r.text) return;
          var arr = safeParseJsonArray(r.text);
          if (!arr){
            console.log(TAG, 'LLM parse failed; fallback already applied (' + fallbackApplied + ')');
            return;
          }
          var n = applyInferred(arr);
          console.log(TAG, 'inferred', n, 'chars (LLM)');
          decorateCards();
          try {
            if (typeof UI !== 'undefined' && UI && typeof UI.renderAll === 'function'){
              UI.renderAll();
            }
          } catch(e){}
        }).catch(function(e){
          console.warn(TAG, 'LLM error:', e && e.message);
        });
      } catch(e){
        console.warn(TAG, 'maybeInfer err:', e && e.message);
      }
    }

    function register(){
      if (Array.isArray(UI && UI._renderHooks)){
        UI._renderHooks.push(function stateInferenceHook(){
          decorateCards();
          maybeInfer();
        });
      } else {
        console.warn(TAG, 'UI._renderHooks missing — feature disabled');
        return;
      }
      if (Array.isArray(Planner && Planner._extensions)){
        Planner._extensions.push(function stateInferExt(ctx){
          try {
            if (!isEnabled()) return ctx.sys;
            var block = buildInferStateBlock();
            if (!block) return ctx.sys;
            if (ctx.sys && ctx.sys.indexOf('# 🩻 現在のキャラクター状態') >= 0) return ctx.sys;
            return (ctx.sys || '') + '\n\n' + block;
          } catch(e){ return ctx.sys; }
        });
      }

      window.__v292 = window.__v292 || {};
      window.__v292.stateInference = {
        isEnabled: isEnabled,
        setEnabled: setEnabled,
        inferStateByKeyword: inferStateByKeyword,
        buildInferStateBlock: buildInferStateBlock,
        decorateCards: decorateCards,
        maybeInfer: maybeInfer,
        // v292-D fix9: 死亡/負傷の永続化を解除するヘルパー
        revive: revive,
        sevOf: sevOf
      };
      console.log(TAG, 'registered (toggle=' + (isEnabled() ? 'ON' : 'OFF') +
                  '; default OFF — enable via window.__v292.stateInference.setEnabled(true))');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 11. dialogue_layout (Phase 4-C — restored from v101)
  // 目的: PC 横並び 2 列 (会話ログ + 展開の描写) / スマホ縦 50/50。
  //       narrative から「name「dialogue」と言/答/叫…」を抽出して
  //       左カラムに speaker + avatar カードで表示。
  // 旧パッチ: v101 (UI.renderAll / UI.appendTurn wrap) → v292 _renderHooks に変換
  // hook 使用: UI._renderHooks (毎 turn render 後にカラム再生成)
  // 設計憲法準拠:
  //   - wrap なし (UI._renderHooks.push のみ)
  //   - setInterval watchdog なし (whenReady の 1 回 init)
  //   - state は S.turns 直参照 (window.S は base が alias 済み)
  //   - DOM 再構築は #content-cols が無いときだけ 1 度
  // ====================================================================
  (function dialogueLayout(){
    var TAG = '[v292:dialogue_layout]';
    var INITIALIZED = false;

    /* --- CSS 注入 (v101 css string をほぼそのまま) --- */
    function injectCss(){
      if (document.getElementById('dialogueLayoutCss')) return;
      var css = ''
        // PC 横並び (>= 761px)
        + '@media (min-width: 761px){'
        +   'body{max-width:1200px !important}'
        +   '#content-cols{display:flex;flex:1;gap:12px;padding:12px;min-height:0;overflow:hidden}'
        +   '#dialogue-col{flex:1 1 50%;display:flex;flex-direction:column;'
        +     'background:rgba(160,138,240,.04);border:1px solid var(--border);'
        +     'border-radius:12px;overflow:hidden}'
        +   '#narrative-col{flex:1 1 50%;display:flex;flex-direction:column;'
        +     'background:var(--s1);border:1px solid var(--border);'
        +     'border-radius:12px;overflow:hidden}'
        +   '#dialogue-col .col-hdr,#narrative-col .col-hdr{'
        +     'padding:8px 14px;font-size:12px;font-weight:600;color:var(--dim);'
        +     'border-bottom:1px solid var(--border);flex:0 0 auto;'
        +     'display:flex;justify-content:space-between;align-items:center}'
        +   '.col-hdr-sub{font-weight:400;opacity:0.7;font-size:11px}'
        +   '#dialogue-stream{flex:1;overflow-y:auto;padding:10px;'
        +     'display:flex;flex-direction:column;gap:8px}'
        +   '#narrative-col #story{flex:1;overflow-y:auto;padding:16px}'
        +   'body{display:flex;flex-direction:column;height:100dvh;max-height:100dvh}'
        + '}'
        // モバイル縦 50/50 (<= 760px) — body.v292-mobile クラスで適用
        + '@media (max-width:760px){'
        +   'body.v292-mobile{height:100dvh;max-height:100dvh;overflow:hidden;'
        +     'display:flex;flex-direction:column}'
        +   'body.v292-mobile #content-cols{flex:1 1 auto;min-height:0;'
        +     'display:flex;flex-direction:column;gap:4px;padding:4px}'
        +   'body.v292-mobile #narrative-col{flex:1 1 50%;min-height:0;max-height:50%;'
        +     'display:flex;flex-direction:column;border:1px solid var(--border);'
        +     'border-radius:8px;overflow:hidden;order:1}'
        +   'body.v292-mobile #dialogue-col{flex:1 1 50%;min-height:0;max-height:50%;'
        +     'display:flex;flex-direction:column;background:rgba(160,138,240,.04);'
        +     'border:1px solid var(--border);border-radius:8px;overflow:hidden;order:2}'
        +   'body.v292-mobile #narrative-col #story,'
        +     'body.v292-mobile #dialogue-stream{flex:1;overflow-y:auto;padding:8px}'
        +   'body.v292-mobile #dialogue-stream{display:flex;flex-direction:column;gap:6px}'
        + '}'
        // dialogue card 共通スタイル
        + '.v292-dlg-card{display:flex;gap:8px;align-items:flex-start;padding:8px;'
        +   'background:var(--s2);border-radius:10px;border-left:3px solid var(--say)}'
        + '.v292-dlg-card.hero-card{border-left-color:var(--acc)}'
        + '.v292-dlg-card .dlg-av{width:40px;height:40px;flex:0 0 40px;border-radius:50%;'
        +   'background:#333;display:flex;align-items:center;justify-content:center;'
        +   'overflow:hidden;font-size:18px;color:var(--dim)}'
        + '.v292-dlg-card .dlg-av img{width:100%;height:100%;object-fit:cover}'
        + '.v292-dlg-card .dlg-body{flex:1;min-width:0}'
        + '.v292-dlg-card .dlg-name{font-size:11px;color:var(--say);'
        +   'font-weight:600;margin-bottom:2px}'
        + '.v292-dlg-card.hero-card .dlg-name{color:var(--acc)}'
        + '.v292-dlg-card .dlg-text{font-size:14px;color:var(--tx);'
        +   'line-height:1.5;word-break:break-word}';
      var st = document.createElement('style');
      st.id = 'dialogueLayoutCss';
      st.textContent = css;
      document.head.appendChild(st);
    }

    /* --- DOM 再構築: #story を #narrative-col で囲み、隣に #dialogue-col を作る --- */
    function restructure(){
      if (document.getElementById('content-cols')) return; // 既に構築済み
      var story = document.getElementById('story');
      if (!story || !story.parentNode) return;

      var wrap = document.createElement('div');
      wrap.id = 'content-cols';

      var dCol = document.createElement('div');
      dCol.id = 'dialogue-col';
      dCol.innerHTML =
        '<div class="col-hdr">会話ログ <span class="col-hdr-sub">キャラクターの発言</span></div>'
        + '<div id="dialogue-stream"></div>';

      var nCol = document.createElement('div');
      nCol.id = 'narrative-col';
      nCol.innerHTML =
        '<div class="col-hdr">展開の描写 <span class="col-hdr-sub">物語の進行・記録</span></div>';

      story.parentNode.insertBefore(wrap, story);
      wrap.appendChild(dCol);
      wrap.appendChild(nCol);
      nCol.appendChild(story); // story を narrative-col の中に移動

      // モバイルクラスのトグル (resize は 1 回だけ listener 登録)
      function updateMobileClass(){
        if (window.innerWidth <= 760) document.body.classList.add('v292-mobile');
        else document.body.classList.remove('v292-mobile');
      }
      updateMobileClass();
      window.addEventListener('resize', updateMobileClass);
    }

    /* --- 補助関数 --- */
    function getState(){
      try {
        if (typeof S !== 'undefined' && S) return S;
        return JSON.parse(localStorage.getItem('chr6') || '{}');
      } catch(e){ return {}; }
    }

    function isHero(name){
      if (!name) return false;
      var st = getState();
      var h = ((st.cast || {}).hero || {}).name;
      return !!(h && (h === name || name.indexOf(h) !== -1));
    }

    function avatarUrlLocal(name, desc, gender){
      if (!name) return '';
      var prompt = 'anime portrait of ';
      prompt += (gender === '男性') ? 'a young man, ' : 'a young woman, ';
      prompt += name + ', ';
      if (desc){
        var d = String(desc).replace(/^性別:\s*[男女][性]?[。、]?/, '').slice(0, 60);
        prompt += d + ', ';
      }
      prompt += 'detailed face, dark fantasy, dramatic lighting, high quality';
      var seed = 0;
      for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
      return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
             '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
    }

    function getAvatar(name){
      if (!name) return '';
      var st = getState();
      var cast = st.cast || {};
      // v292-D fix7: avatarUrl は index.html の IIFE 内 local function で
      //   window に露出してないので、ローカル実装 avatarUrlLocal を使う。
      //   Pollinations URL は name+desc+gender から決定的なので、⟳ 未クリックでも
      //   ⟳ 済みと同じ URL が出る後方互換。
      function genUrl(c){
        try { return avatarUrlLocal(c.name || '', c.desc || '', c.gender || ''); }
        catch(e){ return ''; }
      }
      if (cast.hero && cast.hero.name === name){
        return cast.hero.avatar || genUrl(cast.hero);
      }
      var npcs = cast.npcs || [];
      if (Array.isArray(npcs)){
        for (var i = 0; i < npcs.length; i++){
          var n = npcs[i];
          if (n && n.name && (n.name === name || name.indexOf(n.name) !== -1)){
            return n.avatar || genUrl(n);
          }
        }
      }
      return '';
    }

    function escHtml(s){
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    /* --- narrative から (speaker, dialogue) を抽出 --- */
    function extractDialogues(narrSrc, turn){
      if (!narrSrc) return [];
      var src = Array.isArray(narrSrc) ? narrSrc.join('\n') : String(narrSrc);
      // v292-D fix4 (bug #2): Markdown bold (**) を strip して Pattern A/B/C 全部で
      // 「**「セリフ」**」のような装飾付き dialogue を拾えるようにする。
      // src はマッチ用のローカル変数なので display 側に影響しない。
      src = src.replace(/\*\*/g, '');
      var out = [];
      var seen = Object.create(null);
      function hasText(text){
        for (var k in seen){ if (k.indexOf('|' + text) === k.length - text.length - 1) return true; }
        return false;
      }
      function pushUnique(speaker, text, isHero){
        var k = (speaker||'') + '|' + text;
        if (seen[k]) return;
        // 同 text が既に他 speaker で取れていれば、speaker 空のものは破棄
        if (!speaker && hasText(text)) return;
        seen[k] = true;
        var item = { speaker: speaker, text: text };
        if (isHero) item.isHero = true;
        out.push(item);
      }
      // 既知キャラ名リストを構築
      // v292-D fix3: const S は window にバインドされないため、bare S を最初に試す
      // (castLock 等他 feature と同じ安全パターン)
      var cast = {};
      var names = [];
      try {
        var st = (typeof S !== 'undefined' && S) ? S
               : (typeof window !== 'undefined' && window.S) ? window.S
               : null;
        if (st && st.cast) cast = st.cast;
        if (cast.hero && cast.hero.name) names.push(cast.hero.name);
        if (Array.isArray(cast.npcs)) {
          cast.npcs.forEach(function(n){ if (n && n.name) names.push(n.name); });
        }
      } catch(e) {}
      var namePat = names
        .filter(function(n){ return n && n.length > 0; })
        .map(function(n){ return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
        .join('|');
      // v292-D fix4 (bug #1): SAY モードで playerText のエコーを抑止。
      // renderStream 側が addCard('主人公', t.playerText) で先に hero カードを描画するため、
      // narrative 内の同一 dialogue を pattern A/B/C/fallback で拾い直すと重複表示になる。
      // seen に pre-seed して pushUnique/hasText が skip するよう仕込む。
      if (turn && turn.inputType === 'SAY' && turn.playerText) {
        var pt = String(turn.playerText).trim();
        if (pt) {
          seen['|' + pt] = true;
          seen['主人公|' + pt] = true;
          var heroName = cast.hero && cast.hero.name;
          if (heroName && heroName !== '主人公') seen[heroName + '|' + pt] = true;
        }
      }
      // パターン A: name「dialogue」と言/答/叫/問/呼/応/笑/囁/吐/怒鳴/命...
      var rxA = /([一-鿿ぁ-ゖァ-ヺ々ー・]+?)(?:は|が|の)?「([^「」]+?)」(?:と[^」]*?(?:言|答|命|叫|問|呼|尋|応|返|笑|囁|吐|怒鳴))/g;
      var m;
      while ((m = rxA.exec(src))){
        pushUnique((m[1] || '').trim(), (m[2] || '').trim());
      }
      // パターン B (v292-D): 既知名直後の「dialogue」(suffix 不要)
      if (namePat){
        var rxB = new RegExp('(?:^|\\n|。|、|」|\\s)(' + namePat + ')(?:は|が|の)?「([^「」]+?)」', 'g');
        while ((m = rxB.exec(src))){
          pushUnique(m[1].trim(), m[2].trim());
        }
      }
      // パターン C (v292-D): speaker 名なし bare dialogue
      // aidungeon_style の極端な省略で「「ここは……どこ？」言葉は～」のような
      // 完全に bare な発話が出る。直前 150 chars 内で最後に言及された
      // 既知名 (or 彼/彼女) から speaker を推測する。
      var rxC = /(?:^|[\n。、！？])「([^「」]{2,80})」/g;
      while ((m = rxC.exec(src))){
        var dlg = m[1].trim();
        if (hasText(dlg)) continue;
        var pos = m.index;
        var preStart = Math.max(0, pos - 150);
        var preContext = src.substring(preStart, pos);
        var speaker = '';
        if (namePat){
          var nameRx = new RegExp('(' + namePat + ')', 'g');
          var lastMatch = null, nm;
          while ((nm = nameRx.exec(preContext))) lastMatch = nm[1];
          if (lastMatch) speaker = lastMatch;
        }
        // 名前が見つからなければ「彼女/彼」を hero/npc[0] で簡易解決
        if (!speaker){
          if (/彼女/.test(preContext) && cast.hero && cast.hero.name) speaker = cast.hero.name;
          else if (/彼[^女]/.test(preContext)){
            if (cast.npcs && cast.npcs[0] && cast.npcs[0].name) speaker = cast.npcs[0].name;
            else if (cast.hero && cast.hero.name) speaker = cast.hero.name;
          }
        }
        pushUnique(speaker, dlg);
      }
      // フォールバック: SAY 入力時、最初の鉤括弧を主人公の台詞として拾う
      if (out.length === 0 && turn && turn.inputType === 'SAY' && turn.playerText){
        var q = src.match(/「([^「」]+?)」/);
        var __heroName2 = (cast.hero && cast.hero.name) ? cast.hero.name : '主人公';
        if (q) pushUnique(__heroName2, q[1], true);
      }
      return out;
    }

    /* --- 1 ターン分の dialogue cards を stream に描画 --- */
    function addCard(speaker, text, isHeroFlag){
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      var av = getAvatar(speaker);
      var avHtml = av
        ? '<img src="' + escHtml(av) + '" alt="' + escHtml(speaker) + '" loading="lazy"'
          + ' onerror="this.parentNode.textContent=String.fromCharCode(63)">'
        : '?';
      var card = document.createElement('div');
      card.className = 'v292-dlg-card' + (isHeroFlag ? ' hero-card' : '');
      card.innerHTML =
        '<div class="dlg-av">' + avHtml + '</div>'
        + '<div class="dlg-body">'
        +   '<div class="dlg-name">' + escHtml(speaker || '???') + '</div>'
        +   '<div class="dlg-text">' + escHtml(text) + '</div>'
        + '</div>';
      stream.appendChild(card);
    }

    /* --- 全 turns を回して dialogue-stream を再構築 --- */
    function renderStream(){
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      stream.innerHTML = '';
      var st = getState();
      var turns = st.turns || [];
      for (var i = 0; i < turns.length; i++){
        var t = turns[i];
        if (!t) continue;
        // SAY モードでプレイヤーの直接発言があれば主人公カードを先に
        if (t.playerText && t.inputType === 'SAY'){
          var __heroName1 = (st && st.cast && st.cast.hero && st.cast.hero.name) ? st.cast.hero.name : '主人公';
          addCard(__heroName1, t.playerText, true);
        }
        var ds = extractDialogues(t.narrative, t);
        for (var j = 0; j < ds.length; j++){
          var d = ds[j];
          addCard(d.speaker, d.text, d.isHero || isHero(d.speaker));
        }
      }
      stream.scrollTop = stream.scrollHeight;
    }

    function register(){
      try {
        injectCss();
        restructure();
        renderStream(); // 初回描画
        INITIALIZED = true;
      } catch(e){
        console.warn(TAG, 'init err:', e && e.message);
        return;
      }

      // 毎ターン render 後に dialogue-stream を更新
      if (Array.isArray(UI && UI._renderHooks)){
        UI._renderHooks.push(function dialogueLayoutHook(/* turn */){
          if (!INITIALIZED) return;
          try { renderStream(); }
          catch(e){ console.warn(TAG, 'render err:', e && e.message); }
        });
      } else {
        console.warn(TAG, 'UI._renderHooks missing — dialogue stream will not update');
      }

      window.__v292 = window.__v292 || {};
      window.__v292.dialogueLayout = {
        renderStream: renderStream,
        restructure: restructure,
        extractDialogues: extractDialogues
      };
      console.log(TAG, 'registered (PC 2-col + mobile vsplit; hooked into UI._renderHooks)');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 12. aidungeon_style (Phase 4-C — port of v228)
  // 目的: AI Dungeon 級の没入描写ルール (五感・身体感覚・断片セリフ・POV 切替) を
  //       sys prompt に注入。v228 は fetch wrap で同等のことをしていたので、
  //       v292 では PromptRegistry に静的テキストとして登録する。
  // 旧パッチ: v228 (fetch wrap on every API call) → PromptRegistry に統合
  // hook 使用: PromptRegistry.add (priority=40 style/voice hint)
  //            + _extensions fallback (PromptRegistry が読まれないケース保険)
  // toggle: localStorage 'v292_aidungeon_style' で ON/OFF (デフォルト ON)
  // ====================================================================
  (function aidungeonStyle(){
    var TAG = '[v292:aidungeon_style]';
    var LS_KEY = 'v292_aidungeon_style';

    function isEnabled(){
      try { return localStorage.getItem(LS_KEY) !== 'false'; }
      catch(e){ return true; }
    }

    function buildBlock(){
      return [
        '',
        '# 🎭 AI Dungeon 級の生々しい没入描写ルール',
        '',
        '## 1. 五感・身体感覚を物理的に描写',
        '- 拘束・接触: 「鎖が肉に食い込む」「縄が皮膚を擦る」「冷気が肌を刺す」のように、接触面の物理感を必ず書く',
        '- 内側の生体感覚: 「内側の肉壁が痙攣する」「血の気が引いていく」「胃の奥がせり上がる」など、観察者視点で冷静に',
        '- 呼吸・反応: 「呼吸が荒くなる」「喉から細い音が漏れる」「歯がカチカチ鳴る」',
        '',
        '## 2. 意識の朦朧と限界反応',
        '- 「意識が遠のく」「視界が霞む」「思考が断片化していく」',
        '- 限界の生理反応: 嘔吐 / 白目 / 気絶寸前 / 涙と唾液で潰れる声',
        '',
        '## 3. 弱々しい・断片的なセリフ',
        '- 点リーダー「……」で息切れと弱さを表現',
        '- 例: 「……やめて」「あ……っ」「ひっ……」「もう……許して……」',
        '- 声の物理化: 「声は嗚咽に変わり、もはや言葉になっていない」',
        '',
        '## 4. 心理状態の物理化 (感情 → 生理現象)',
        '- 「声がかすれ、涙が頬を伝う」「視線が定まらず瞳が震える」',
        '- 「指先が小刻みに痙攣する」「見るのも耐えられず目を背けた」',
        '',
        '## 5. 強制・被害者視点の状況描写',
        '- 「頭を掴まれ、無理やり顔を向けさせられる」「拒否できず見せつけられる」',
        '- 「視界を塞がれ、何が起きるか分からない恐怖に身を竦める」',
        '',
        '## 6. POV (視点) 切替で没入感を増す',
        '- 主人公以外の登場人物の視点も適宜挿入',
        '- 観察される側 ＋ 観察する側の双方向描写',
        '- 同じ瞬間を異なる人物の知覚から描く',
        '',
        '## 7. 環境・余波の描写',
        '- 「血まみれの床」「響く嗚咽」など空間に残る余波',
        '- 静けさと音、光と影のコントラスト',
        '',
        '## 必須ルール',
        '- 触覚 (接触面の物理) ＋ 生理反応 ＋ 断片セリフ ＋ 意識描写 の 4 層を毎ターン最低 1 回',
        '- 「縛られていた」「怖がっていた」のような状態説明だけで終えない',
        '- 必ず能動的・運動的描写 (「○○が○○に食い込む」「○○が○○を伝う」)',
        '- セリフは「……」を多用、息切れと弱さを表現',
        '- 1 場面 3〜5 文で情景・身体・感情・意識を多層化'
      ].join('\n');
    }

    function register(){
      if (!window.PromptRegistry || typeof PromptRegistry.add !== 'function'){
        console.warn(TAG, 'PromptRegistry missing — feature disabled');
        return;
      }
      // priority 40 = style hint。下げ目にして cast_lock (80) や npc_freedom (60)
      // よりは後に挿入させる。OFF 時は空文字で skip。
      PromptRegistry.add({
        key: 'aidungeon_style',
        priority: 40,
        get text(){ return isEnabled() ? buildBlock() : ''; }
      });

      // _extensions fallback (PromptRegistry が getter を解釈しない実装に保険)
      if (Array.isArray(Planner && Planner._extensions)){
        Planner._extensions.push(function aidungeonExt(ctx){
          try {
            if (!isEnabled()) return ctx.sys;
            if (ctx.sys && ctx.sys.indexOf('# 🎭 AI Dungeon 級の生々しい没入描写ルール') >= 0) {
              return ctx.sys; // 二重挿入回避
            }
            return (ctx.sys || '') + '\n' + buildBlock();
          } catch(e){ return ctx.sys; }
        });
      }

      window.__v292 = window.__v292 || {};
      window.__v292.aidungeonStyle = {
        isEnabled: isEnabled,
        setEnabled: function(b){
          try { localStorage.setItem(LS_KEY, b ? 'true' : 'false'); }
          catch(e){}
        },
        buildBlock: buildBlock
      };
      console.log(TAG, 'registered (toggle=' + (isEnabled() ? 'ON' : 'OFF') + ')');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 13. gender_radio (v292-D fix6: 旧 v108 相当)
  // 目的: 設定 overlay に「女性 / 男性 / 未設定」ラジオを挿入。
  //       UI.randomFill を wrap して性別固定 random (名前/desc 女性用/男性用プール) を実現。
  // features.js 既存の readHeroGender / readNpcGender / writeGenderRadio はこの UI を探す reader。
  // ====================================================================
  (function genderRadio(){
    var TAG = '[v292:gender_radio]';
    var FNAMES_F = ['アリア','スピカ','エチカ','セシリア','ノエル','オリヴィア','ケイト','ローズ','クララ','ミコト'];
    var FNAMES_M = ['ノクス','シャドウ','ジャード','カイラス','イザク','ソーラ','ケンジ','タオラ','ジン','チオ'];
    var DESCS_F = ['18歳。意志が強い記録官見習い。','16歳。他人の感情に敏感。','20歳。踊り手。','17歳。天才的だが壊れやすい魔法使い。','少女のような外見の珍財ハンター。'];
    var DESCS_M = ['老齢の元兵士。皮肉屋。','15歳の魔法使い見習い。','真面目な役人。','無口だが仲間思いの元傭兵。'];
    function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
    function getCast(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; } }
    function setCast(s){ try { localStorage.setItem('chr6', JSON.stringify(s)); } catch(e){} }

    var __busy = false;
    function injectOnce(){
      if (__busy) return;
      __busy = true;
      try {
        var ov = document.getElementById('settingsOv');
        if (!ov || getComputedStyle(ov).display === 'none'){ __busy = false; return; }
        ov.querySelectorAll('.v292-grow').forEach(function(n){ n.remove(); });
        var heroDesc = ov.querySelector('#cfgHDesc');
        var heroName = ov.querySelector('#cfgHName');
        if (heroName){
          var heroRow = buildRow('主人公', 'hero', function(){ return ((getCast().cast || {}).hero || {}).gender || ''; });
          var anchor = heroDesc || heroName;
          if (anchor.parentNode) anchor.parentNode.insertBefore(heroRow, anchor.nextSibling);
        }
        ov.querySelectorAll('.npc-card').forEach(function(card, idx){
          var anchor = card.querySelector('textarea') || card.querySelector('input');
          if (!anchor) return;
          var npcRow = buildRow('NPC', 'npc' + idx, function(){
            var n = ((getCast().cast || {}).npcs || [])[idx] || {};
            return n.gender || '';
          });
          if (anchor.parentNode) anchor.parentNode.insertBefore(npcRow, anchor.nextSibling);
        });
      } catch(e){ console.warn(TAG, e); }
      setTimeout(function(){ __busy = false; }, 100);
    }

    function buildRow(label, target, getter){
      var row = document.createElement('div');
      row.className = 'v292-grow';
      row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap';
      row.innerHTML =
        '<span style="font-size:11px;color:var(--dim);min-width:60px">' + label + '性別:</span>'
        + '<label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer">'
        +   '<input type="radio" name="v108g_' + target + '" value="女性">女性</label>'
        + '<label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer">'
        +   '<input type="radio" name="v108g_' + target + '" value="男性">男性</label>'
        + '<label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer;opacity:.7">'
        +   '<input type="radio" name="v108g_' + target + '" value="">未設定</label>';
      var cur = getter() || '';
      row.querySelectorAll('input').forEach(function(r){
        if (r.value === cur) r.checked = true;
        r.addEventListener('change', function(){
          var s = getCast();
          s.cast = s.cast || {};
          if (target === 'hero'){
            s.cast.hero = s.cast.hero || {};
            s.cast.hero.gender = r.value;
          } else {
            var i = parseInt(target.replace('npc', ''), 10);
            s.cast.npcs = s.cast.npcs || [];
            if (!s.cast.npcs[i]) s.cast.npcs[i] = {};
            s.cast.npcs[i].gender = r.value;
          }
          setCast(s);
        });
      });
      return row;
    }

    function hookUI(){
      if (typeof UI !== 'object' || !UI || UI.__v292GR) return false;
      if (typeof UI.openSettings === 'function'){
        var orig = UI.openSettings.bind(UI);
        UI.openSettings = function(){
          var r = orig.apply(this, arguments);
          setTimeout(injectOnce, 150);
          setTimeout(injectOnce, 500);
          return r;
        };
      }
      if (typeof UI._renderNpcList === 'function'){
        var orig2 = UI._renderNpcList.bind(UI);
        UI._renderNpcList = function(){
          var r = orig2.apply(this, arguments);
          setTimeout(injectOnce, 100);
          return r;
        };
      }
      if (typeof UI.addNpc === 'function'){
        var orig3 = UI.addNpc.bind(UI);
        UI.addNpc = function(){
          var r = orig3.apply(this, arguments);
          setTimeout(injectOnce, 200);
          return r;
        };
      }
      if (typeof UI.saveSettings === 'function' && !UI.__v292GR_SS){
        var origSS = UI.saveSettings.bind(UI);
        UI.saveSettings = function(){
          // v292-D fix8: form の性別ラジオから gender を読んで S.cast に入れる。
          //   原本 saveSettings は cast.hero.name/desc と NPC name/desc/psych のみ書き込み、
          //   gender を touch しないので、ラジオ checked が失われていた。
          try {
            var hg = document.querySelector('input[name="v108g_hero"]:checked');
            if (typeof S !== 'undefined' && S.cast && S.cast.hero){
              S.cast.hero.gender = hg ? hg.value : '';
            }
          } catch(e){}
          var r = origSS.apply(this, arguments);
          // origSS が S.cast.npcs を rebuild した後、NPC ごとの gender を入れる
          try {
            document.querySelectorAll('#npcList .npc-card').forEach(function(card, idx){
              if (typeof S !== 'undefined' && S.cast && S.cast.npcs && S.cast.npcs[idx]){
                var ng = card.querySelector('input[name="v108g_npc' + idx + '"]:checked');
                S.cast.npcs[idx].gender = ng ? ng.value : '';
              }
            });
            if (typeof S !== 'undefined' && typeof S.save === 'function') S.save();
          } catch(e){}
          return r;
        };
        UI.__v292GR_SS = true;
      }
      if (typeof UI.randomFill === 'function' && !UI.__v292GR_RF){
        var origRF = UI.randomFill.bind(UI);

        // v292-D fix7: 種を広げた gender 別プール (旧 v108 + α、姓名コンビ含む)
        var HERO_NAMES_F = [
          'アリア・フェイン','ソフィア・クレア','エリナ・ルーン','ユア・ミスト',
          'スピカ・ヴァレン','エチカ・モルガナ','セシリア・ノクト','ノエル・ヴェント',
          'オリヴィア・グレイ','ローズ・アルブ','クララ・ヴォルフ','ミコト・ハル',
          'リリス・ストーン','イリア・カノン','メリル・ダスク','カレン・ロウ',
          'ナノ・シュリ','フィオラ・ベル','エルザ・リム','ヴィオラ・ノヴァ',
          'シエル・ガラン','ティアナ・ペル','レイア・モルト','カミラ・セレナ'
        ];
        var HERO_NAMES_M = [
          'レン・ヴォルク','カイル・ドレイク','ファウスト・グリム','ゼイン・コルト',
          'ルカ・セルト','ノクス・ヴァイン','シャドウ・グレイ','ジャード・ロウ',
          'カイラス・ベル','イザク・ノクト','ソーラ・リム','ケンジ・アスタ',
          'タオラ・カノン','ジン・ヴォルフ','チオ・グリム','ヴォルガ・ハル',
          'アシュ・モル','ラギ・ダスク','レオ・ストーン','クロウ・ノヴァ',
          'カデル・フォン','エドガー・ヴェル','イグナス・ベル','ザイル・ペル'
        ];
        var HERO_DESCS_F = [
          '18歳の見習い記録官。慎重だが好奇心旺盛。秘密を抱えている。',
          '没落貴族の末裔。誇り高く、しかし孤独。居場所を求めている。',
          '行商人の娘。人懐っこいが目が鋭い。生き残るためなら何でもする。',
          '記憶を失った旅人。素性不明。断片的な過去が夢に現れる。',
          '魔法使いの助手。才能はあるが自信がない。師匠を探している。',
          '神殿の見習い司祭。真面目だが脆さを隠している。',
          '少女のような外見の珍財ハンター。鋭い直感を持つ。',
          '踊り手として旅をする旅芸人。本当の名前を隠している。',
          '貴族の影として育てられた暗殺者見習い。命令以外を知らない。',
          '記憶を売り買いする街で生きる17歳。自分の過去を取り戻したい。',
          '森の辺境に住む薬師の娘。動物と話せると噂される。'
        ];
        var HERO_DESCS_M = [
          '元傭兵の青年。無口だが仲間想い。過去に後悔がある。',
          '老齢の元兵士。皮肉屋。失った仲間を引きずる。',
          '15歳の魔法使い見習い。真面目で堅物。',
          '無口だが仲間思いの元傭兵。剣を捨てたばかり。',
          '若き隊商の主。算術に長け、危険を嗅ぎ分ける。',
          '失踪した王子の影武者。本物を知る者を探している。',
          '街を流れる旅楽士。歌と引き換えに情報を集める。',
          '禁忌の研究を続ける学者。代償として記憶を失いつつある。',
          '酒場の用心棒だった青年。理由あって街を出てきた。',
          '没落した家の三男坊。出世を諦め旅に出た。',
          '魔導書を盗んだ罪で追われる元神官。償いの旅の途中。'
        ];
        var NPC_NAMES_F = [
          'イルム','セイラ','ミア','フィーネ','エナ','ルカ','クレア','ノア',
          'ティナ','リア','カナ','エミ','レイ','サラ','ユキ','ハル',
          'ジア','ナナ','イヴ','メイ','ロザ','ヴェラ','エルナ','シズク','アシュ'
        ];
        var NPC_NAMES_M = [
          'カデル','ヴォルグ','ロイ','ガイア','ライ','カイ','テオ','ラフ',
          'ジン','クラウ','ダレン','レオン','ヴェル','ザイ','コル','ゲン',
          'ハイク','マル','レナ','ノル','オーレン','ベルゴ','カラム','ディオン','エヴァン'
        ];
        var NPC_DESCS_F = [
          '銀髪の少女。感情が読みにくく、言葉が少ない。',
          '神殿の見習い司祭。真面目だが脆さを隠している。',
          '少年のような外見の少女。素早く動き、嘘をつく。',
          '酒場の歌い手。客の秘密を集めている。',
          '路地裏に住む占い師。本当の力は別にある。',
          '宿屋の娘。明るいが家族の問題を抱えている。',
          '魔法学院の同期。優秀だが嫉妬深い。',
          '辺境の薬師。村人に慕われているが過去を隠す。',
          '元修道女。今は流浪の癒し手として旅をしている。',
          '盗賊団の紅一点。気まぐれだが情に脆い。'
        ];
        var NPC_DESCS_M = [
          '壮年の行商人。愛想がよいが目が笑っていない。',
          '老齢の元兵士。片足が不自由。皮肉屋。',
          '王宮警備隊の若い隊長。誠実だが融通が利かない。',
          '盗賊団の頭目。残忍だが部下には情がある。',
          '隠居した賢者。多くを語らないが知識は深い。',
          '酒場の主人。元冒険者。客の身の上話を聞き続ける。',
          '隠遁中の元宮廷魔術師。失策で追われている。',
          '裏稼業を仕切る老人。表向きは小さな店主。',
          '若い書記官。出世のためなら手段を選ばない。',
          '街の鍛冶屋。寡黙だが鍛えた剣には魂が宿ると言う。'
        ];
        // 心理プロファイルの種 (NPC 用、性別問わず使える形に)
        var NPC_PERSONALITY = [
          '無口・内向・観察眼が鋭い','社交的・計算高い・表裏がある','誠実・完璧主義・自罰的',
          'シニカル・経験豊富・情に厚い','活発・ずる賢い・本当は臆病','楽天的・直感型・衝動的',
          '冷静・分析的・他人を信じない','理想主義・正義感が強い・脆い','寡黙・忠誠心・武人気質',
          '好奇心旺盛・浮き沈み激しい・天真爛漫'
        ];
        var NPC_DESIRE = [
          '誰かに本当の自分を認めてもらいたい','安全と財を手に入れ、誰にも頭を下げない生活',
          '善い人間であり続けること、誰かを救うこと','かつて失った仲間の死に意味を見つけたい',
          '自由に、誰にも縛られず生きること','故郷を取り戻す','真実を知る',
          '自分の才能を世に証明する','誰かに必要とされ続けたい','静かに余生を過ごす'
        ];
        var NPC_FEAR = [
          'また見捨てられること','貧困と無力感','自分が悪であると知られること',
          '無駄死にだったと気づくこと','檻に入れられること・管理されること','信じていた者の裏切り',
          '老いと衰え','自分が空虚であると気付くこと','他人に依存してしまうこと','過去が暴かれること'
        ];
        var NPC_WOUND = [
          '幼い頃、親に棄てられた経験がある。以来、人を信じることが怖い。',
          '若い頃の失敗で大切な人を失い、それ以来感情を切り離して生きている。',
          '信じていた師が腐敗していた。信仰と現実の間で今も揺れている。',
          '唯一の親友を自分の命令ミスで死なせた。今もその責任を引きずっている。',
          '孤児院で厳しく管理された幼少期。自由を奪われることへの恐怖が根深い。',
          '故郷を戦火で失った。誰にも語れない罪悪感を抱える。',
          '愛した人に裏切られ、それ以来心を閉ざしている。'
        ];

        UI.randomFill = function(){
          // v292-D fix7: form 直接操作 (cast 経由でなく) して未入力ガードを尊重。
          //   openSettings 再呼び出しは廃止 (それが「上書き」バグの原因だった)。
          try {
            // 主人公 (性別ラジオ checked 時のみ、ここで埋める)
            var hgEl = document.querySelector('input[name="v108g_hero"]:checked');
            var hg = hgEl ? hgEl.value : '';
            var hNameEl = document.getElementById('cfgHName');
            var hDescEl = document.getElementById('cfgHDesc');
            if (hg && hNameEl && !hNameEl.value.trim()){
              hNameEl.value = pick(hg === '男性' ? HERO_NAMES_M : HERO_NAMES_F);
            }
            if (hg && hDescEl && !hDescEl.value.trim()){
              hDescEl.value = '性別: ' + hg + '。' + pick(hg === '男性' ? HERO_DESCS_M : HERO_DESCS_F);
            }

            // NPC: DOM 上の全 .npc-card を iterate (cast.npcs[] ではなく)
            var npcCards = document.querySelectorAll('#npcList .npc-card');
            npcCards.forEach(function(card, idx){
              var ngEl = card.querySelector('input[name="v108g_npc' + idx + '"]:checked');
              var ng = ngEl ? ngEl.value : '';
              if (!ng) return;  // 性別未設定の NPC は origRF に任せる
              function fillField(f, pool){
                var el = card.querySelector('[data-f="' + f + '"]');
                if (el && !el.value.trim()) el.value = pick(pool);
              }
              fillField('name', ng === '男性' ? NPC_NAMES_M : NPC_NAMES_F);
              var descEl = card.querySelector('[data-f="desc"]');
              if (descEl && !descEl.value.trim()){
                descEl.value = '性別: ' + ng + '。' + pick(ng === '男性' ? NPC_DESCS_M : NPC_DESCS_F);
              }
              fillField('personality', NPC_PERSONALITY);
              fillField('coreDesire', NPC_DESIRE);
              fillField('coreFear', NPC_FEAR);
              fillField('wound', NPC_WOUND);
            });
          } catch(e){ console.warn(TAG, 'pre-fill', e); }

          // 残り (lore/loc/obj/tone/性別未設定 hero/NPC の name/desc) を origRF で埋める
          try { origRF(); } catch(e){}

          // 性別ラジオ UI のみ refresh (openSettings は呼ばない！上書きバグの原因)
          try { setTimeout(injectOnce, 100); } catch(e){}

          console.log(TAG, 'random fill done (gender-aware, form-based)');
        };
        UI.__v292GR_RF = true;
      }
      UI.__v292GR = true;
      return true;
    }

    function register(){
      // UI がまだ未イニシの場合はリトライ
      var hooked = hookUI();
      if (!hooked){
        setTimeout(register, 500);
        return;
      }
      console.log(TAG, 'registered (gender radio + gender-aware randomFill)');
    }

    whenReady(register);
  })();


  // ====================================================================
  // 14. narrative_recovery (v292-D fix10)
  // 目的: LLM 応答が truncate されて JSON parse 失敗 → narrative が「...」のみ
  //       になるバグを修正。Planner._parseExtensions で raw text から narrative
  //       配列を救済抽出し、最低限の plan オブジェクトを合成する。
  // ====================================================================
  (function narrativeRecovery(){
    var TAG = '[v292-D fix10]';

    function extractPartialNarrative(rawText){
      if (!rawText || typeof rawText !== 'string') return null;
      var m = rawText.match(/"narrative"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
      if (!m) return null;
      var arrText = m[1];
      var strs = [];
      var rx = /"((?:[^"\\]|\\.)*?)"/g;
      var match;
      while ((match = rx.exec(arrText)) !== null) {
        try {
          var parsed = JSON.parse('"' + match[1] + '"');
          if (parsed && parsed.length > 0) strs.push(parsed);
        } catch(e){}
      }
      return strs.length > 0 ? strs : null;
    }

    function extractFromAnyJapanese(rawText){
      if (!rawText) return null;
      var out = [];
      var rx = /"((?:[^"\\]|\\.)*?)"/g;
      var match;
      while ((match = rx.exec(rawText)) !== null && out.length < 10){
        try {
          var s = JSON.parse('"' + match[1] + '"');
          if (typeof s !== 'string') continue;
          if (s.length < 4) continue;
          if (!/[ぁ-んァ-ヶー一-龥]/.test(s)) continue;
          if (/^(playerIntent|branchCandidates|narrative|kind|tone|label|type|id|main)$/.test(s)) continue;
          out.push(s);
        } catch(e){}
      }
      return out.length > 0 ? out : null;
    }

    function tryParse(s){
      try { JSON.parse(s); return true; } catch(e){ return false; }
    }

    function register(){
      if (typeof Planner !== 'object' || !Planner || !Array.isArray(Planner._parseExtensions)){
        console.warn(TAG, 'Planner._parseExtensions missing — feature disabled');
        return;
      }
      Planner._parseExtensions.push(function recoveryExt(rawResponse){
        try {
          var content = null;
          var isEnvelope = false;
          if (typeof rawResponse === 'string'){
            content = rawResponse;
          } else if (rawResponse && rawResponse.choices && rawResponse.choices[0] && rawResponse.choices[0].message){
            content = rawResponse.choices[0].message.content;
            isEnvelope = true;
          }
          if (!content || typeof content !== 'string') return rawResponse;
          if (tryParse(content)) return rawResponse;
          var nar = extractPartialNarrative(content);
          if (!nar) nar = extractFromAnyJapanese(content);
          if (!nar || nar.length === 0) return rawResponse;
          var rescued = {
            playerIntent: { kind: 'other', tone: 'neutral' },
            branchCandidates: [],
            narrative: nar
          };
          var newContent = JSON.stringify(rescued);
          console.log(TAG, 'rescued narrative from broken JSON,', nar.length, 'lines');
          if (isEnvelope){
            rawResponse.choices[0].message.content = newContent;
            return rawResponse;
          }
          return newContent;
        } catch(e){
          console.warn(TAG, 'err:', e && e.message);
          return rawResponse;
        }
      });
      window.__v292 = window.__v292 || {};
      window.__v292.narrativeRecovery = {
        extractPartialNarrative: extractPartialNarrative,
        extractFromAnyJapanese: extractFromAnyJapanese
      };
      console.log(TAG, 'narrative recovery registered');
    }

    whenReady(register);
  })();

  // ====================================================================
  // 15. avatar_autofill (v292-D fix11)
  // 目的: ランダム生成 / saveSettings / addNpc 後、c.avatar が未設定なら
  //       Pollinations URL を自動生成して S.cast.*.avatar に格納する。
  //       これで設定 UI のアイコン枠の「?」が消える。
  // ====================================================================
  (function avatarAutofill(){
    var TAG = '[v292-D fix11]';

    function genUrl(name, desc, gender){
      if (!name) return '';
      var prompt = 'anime portrait of ';
      prompt += (gender === '男性') ? 'a young man, ' : 'a young woman, ';
      prompt += name + ', ';
      if (desc){
        var d = String(desc).replace(/^性別:\s*[男女][性]?[。、]?/, '').slice(0, 60);
        prompt += d + ', ';
      }
      prompt += 'detailed face, dark fantasy, dramatic lighting, high quality';
      var seed = 0;
      for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
      return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
             '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
    }

    function autofill(){
      try {
        if (typeof S === 'undefined' || !S || !S.cast) return 0;
        var n = 0;
        function fillFor(c){
          if (!c || !c.name) return;
          if (!c.avatar){
            var u = genUrl(c.name, c.desc || '', c.gender || '');
            if (u){ c.avatar = u; n++; }
          }
        }
        if (S.cast.hero) fillFor(S.cast.hero);
        if (Array.isArray(S.cast.npcs)) S.cast.npcs.forEach(fillFor);
        if (n > 0){
          try { if (S.save) S.save(); } catch(e){}
          try { if (typeof UI !== 'undefined' && UI && typeof UI.renderAll === 'function') UI.renderAll(); } catch(e){}
        }
        return n;
      } catch(e){
        console.warn(TAG, 'autofill err:', e && e.message);
        return 0;
      }
    }

    function register(){
      if (typeof UI !== 'object' || !UI || UI.__v292Fix11) return;

      if (typeof UI.saveSettings === 'function' && !UI.__v292Fix11SS){
        var origSS = UI.saveSettings.bind(UI);
        UI.saveSettings = function(){
          var r = origSS.apply(this, arguments);
          setTimeout(autofill, 50);
          return r;
        };
        UI.__v292Fix11SS = true;
      }

      if (typeof UI.randomFill === 'function' && !UI.__v292Fix11RF){
        var origRF = UI.randomFill.bind(UI);
        UI.randomFill = function(){
          var r = origRF.apply(this, arguments);
          setTimeout(autofill, 600);
          return r;
        };
        UI.__v292Fix11RF = true;
      }

      if (Array.isArray(UI._renderHooks)){
        UI._renderHooks.push(function avatarFillHook(){
          autofill();
        });
      }

      window.__v292 = window.__v292 || {};
      window.__v292.avatarAutofill = {
        genUrl: genUrl,
        autofill: autofill
      };
      UI.__v292Fix11 = true;
      console.log(TAG, 'avatar autofill registered');
    }

    whenReady(register);
  })();

  console.log('[v292] 15 features loaded (Phase 4-C: +dialogue_layout +aidungeon_style +gender_radio +narrative_recovery +avatar_autofill[v292-D fix8/9/10/11])');
})();

// === v292Dfix12 ===
(function(){
  if (window.__v292Dfix12Active) return;
  window.__v292Dfix12Active = true;
  
  // ----- Bug 1: narrative recovery V2 with (plan, ctx) signature -----
  function isNarrativeEmpty(narr) {
    if (!Array.isArray(narr) || narr.length === 0) return true;
    const joined = narr.join('').trim();
    if (joined.length < 4) return true;
    if (narr.every(n => /^[…\.\s物語が続]+$/.test(n))) return true;
    return false;
  }
  
  function isJapaneseValid(text) {
    if (!text || typeof text !== 'string') return false;
    if (!/[ぁ-ん]/.test(text)) return false;
    if (/[a-zA-Z]{3,}/.test(text)) return false;
    if (/[一-鿿]/.test(text) && !/[ぁ-んァ-ヶー]/.test(text)) return false;
    return true;
  }
  
  function recoveryExtV2(plan, ctx) {
    if (!plan || !ctx || !ctx.raw) return plan;
    if (!isNarrativeEmpty(plan.narrative)) return plan;
    
    const raw = ctx.raw;
    const match = raw.match(/"narrative"\s*:\s*\[([^\]]+)\]/);
    if (!match) return plan;
    
    try {
      const arrStr = '[' + match[1] + ']';
      const extracted = JSON.parse(arrStr.replace(/,\s*$/, ''));
      const cleaned = extracted
        .filter(s => typeof s === 'string' && isJapaneseValid(s))
        .slice(0, 8);
      if (cleaned.length > 0) {
        plan.narrative = cleaned;
        console.log('[v292Dfix12] narrative recovered from raw, lines:', cleaned.length);
      }
    } catch(e) {
      console.warn('[v292Dfix12] recovery JSON parse failed:', e);
    }
    return plan;
  }
  
  // Hook into Planner._parseExtensions
  function installRecovery() {
    if (!window.Planner || !window.Planner._parseExtensions) {
      setTimeout(installRecovery, 200);
      return;
    }
    if (!window.Planner._parseExtensions.__v292Dfix12) {
      window.Planner._parseExtensions.push(recoveryExtV2);
      window.Planner._parseExtensions.__v292Dfix12 = true;
      console.log('[v292Dfix12] narrative recovery V2 installed');
    }
  }
  installRecovery();
  
  // ----- Bug 2: gender radio CSS fix -----
  function injectCSS() {
    if (document.getElementById('v292Dfix12-style')) return;
    const style = document.createElement('style');
    style.id = 'v292Dfix12-style';
    style.textContent = `
      .v292-grow, .v292-grow label, #settingsOv label.v292-grow,
      .v292-grow > label {
        white-space: nowrap !important;
        flex: 0 0 auto !important;
        word-break: keep-all !important;
        min-width: max-content !important;
      }
      .v292-grow input[type="radio"] {
        flex: 0 0 auto !important;
        min-width: 16px !important;
      }
      @media (max-width: 480px) {
        .v292-grow label, #settingsOv label {
          font-size: 16px !important;
          min-height: 36px !important;
        }
      }
      @media (max-width: 360px) {
        .v292-grow label, #settingsOv label {
          font-size: 14px !important;
        }
      }
    `;
    document.head.appendChild(style);
    console.log('[v292Dfix12] gender radio CSS injected');
  }
  
  // Re-inject at multiple times to handle late-rendered overlays
  injectCSS();
  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  }
  setTimeout(injectCSS, 500);
  setTimeout(injectCSS, 1500);
})();


// ====================================================================
// v292Dfix13 — gender radio overlap fix (radio circle covering label text)
// ====================================================================
// Session 9 報告: v292Dfix12 (white-space:nowrap + min-width:max-content)
//   を当てた後でも、設定 overlay の Hero/NPC 性別ラジオで
//   「女性」「男性」の 2 文字目 (性) が input[type=radio] の描画円に
//   visually 重なって読めない症状が残る。
// 原因: label の display:flex (gap:3px) では gap が radio の円と text
//   baseline の真上重ねを防げていない。Mobile WebKit 上で <input
//   type=radio> の rendered glyph が左方向にはみ出して描画される時、
//   gap だけでは間隔が確保されない。
// 修正: head に <style> sheet を !important 付きで注入し、
//   .v292-grow > label を display:inline-flex / gap:6px /
//   white-space:nowrap / min-width:max-content / position:relative にし、
//   input[type=radio] を flex:0 0 auto / position:static / float:none /
//   margin:0 / 固定 14x14 サイズで強制。これで radio 円と文字が分離。
// __v292Dfix13Active フラグで二重 inject 防止。fix12 と競合しない設計。
(function v292Dfix13(){
  if (window.__v292Dfix13Active) return;
  window.__v292Dfix13Active = true;
  var TAG = "[v292:Dfix13]";
  var STYLE_ID = "v292Dfix13-style";
  function buildCss(){
    return [
      "/* v292Dfix13: gender radio overlap fix */",
      ".v292-grow{",
      "  display:flex !important;",
      "  flex-wrap:wrap !important;",
      "  align-items:center !important;",
      "  column-gap:14px !important;",
      "  row-gap:6px !important;",
      "  margin:6px 0 !important;",
      "  width:100% !important;",
      "  box-sizing:border-box !important;",
      "}",
      ".v292-grow > span{",
      "  flex:0 0 auto !important;",
      "  min-width:60px !important;",
      "  font-size:11px !important;",
      "  color:var(--dim,#888) !important;",
      "  white-space:nowrap !important;",
      "  line-height:1.4 !important;",
      "}",
      ".v292-grow label{",
      "  display:inline-flex !important;",
      "  align-items:center !important;",
      "  gap:6px !important;",
      "  flex:0 0 auto !important;",
      "  min-width:-webkit-max-content !important;",
      "  min-width:max-content !important;",
      "  white-space:nowrap !important;",
      "  font-size:12px !important;",
      "  line-height:1.4 !important;",
      "  cursor:pointer !important;",
      "  padding:2px 4px 2px 2px !important;",
      "  margin:0 !important;",
      "  position:relative !important;",
      "  background:transparent !important;",
      "  color:var(--tx,#eee) !important;",
      "}",
      ".v292-grow label input[type=\"radio\"]{",
      "  -webkit-appearance:radio !important;",
      "  -moz-appearance:radio !important;",
      "  appearance:auto !important;",
      "  flex:0 0 auto !important;",
      "  width:14px !important;",
      "  height:14px !important;",
      "  min-width:14px !important;",
      "  min-height:14px !important;",
      "  max-width:14px !important;",
      "  max-height:14px !important;",
      "  margin:0 !important;",
      "  padding:0 !important;",
      "  position:static !important;",
      "  float:none !important;",
      "  vertical-align:middle !important;",
      "  transform:none !important;",
      "  top:auto !important;",
      "  left:auto !important;",
      "  right:auto !important;",
      "  bottom:auto !important;",
      "  inset:auto !important;",
      "  display:inline-block !important;",
      "  box-sizing:border-box !important;",
      "  opacity:1 !important;",
      "  visibility:visible !important;",
      "  pointer-events:auto !important;",
      "  cursor:pointer !important;",
      "  accent-color:var(--acc,#a08af0) !important;",
      "}",
      "@media (max-width: 420px){",
      "  .v292-grow{ column-gap:10px !important; }",
      "  .v292-grow label{ padding:3px 6px 3px 2px !important; }",
      "}"
    ].join("\n");
  }
  function inject(){
    try {
      var head = document.head || document.documentElement;
      if (!head) return false;
      var existing = document.getElementById(STYLE_ID);
      var css = buildCss();
      if (existing){ if (existing.textContent !== css) existing.textContent = css; return true; }
      var s = document.createElement("style");
      s.id = STYLE_ID; s.textContent = css; head.appendChild(s);
      console.log(TAG, "CSS injected (" + css.length + " chars)");
      return true;
    } catch(e){ console.warn(TAG, "inject error", e); return false; }
  }
  function whenDOM(fn){ if (document.readyState !== "loading") { fn(); return; } document.addEventListener("DOMContentLoaded", fn, { once: true }); }
  whenDOM(function(){ inject(); var n = 0; var iv = setInterval(function(){ if (!document.getElementById(STYLE_ID)) inject(); if (++n >= 20) clearInterval(iv); }, 500); });
  inject();
  console.log(TAG, "loaded (radio/label overlap fix active)");
})();

// =====================================================================
// === v292Dfix14 ===
// Goal: SAY/DO/STORY 後の narrative が「...」「…」 等の placeholder だけに
//       なる problem を確実に rescue する safety net。
//
// 背景 (fix12/13 で解消されなかった原因):
//   - fix12 の installRecovery は `window.Planner` を check していたが、
//     Planner は top-level `let`/`const` (グローバル lexical binding) で
//     window には属さない。よって polling が **永続的に空振り** し、
//     recoveryExtV2 が Planner._parseExtensions に push されていなかった。
//   - parsePlan が実際に extension を call するのは
//        Planner._parseExtensions[i](plan, { inputType, state: S, raw: rawText })
//     つまり **(plan, ctx)** signature。fix10 の `recoveryExt(rawResponse)`
//     は (rawResponse) 単一引数を想定していたため silently no-op。
//
// fix14 の対策:
//   A. `window.Planner = Planner` を set し、fix12 の polling 永続 retry を
//      retroactively 成功させる (V2 も入る)。
//   B. fix14 自体は (plan, ctx) signature の **recoveryExtV4** を末尾に push。
//      V2 でも救えない (raw 自体が空 or プレースホルダーのみ) ケースで
//      `synthFallback` で playerText/inputType ベースの最低限 narrative
//      を合成する。
//   C. detection を緩める: 「.」「…」「。」「..」 のみ / 6 文字未満 /
//      「物語が続く」「物語の続き」「（続く）」「(続く)」「to be continued」
//      「続く」を empty 扱い。
//   D. playerText 取得用に `#inp` textarea を watch して
//      `window.__v292Dfix14LastInput` に lock-in。
//   E. Setter trap で **後から Planner._parseExtensions が replace** された
//      ケースでも自動 reinstall (defense in depth)。
// =====================================================================
(function v292Dfix14(){
  if (window.__v292Dfix14Active) return;
  window.__v292Dfix14Active = true;

  var TAG = '[v292Dfix14]';

  // ----- Detection -----
  function isNarrativeEmpty(narr){
    if (!Array.isArray(narr)) return true;
    if (narr.length === 0) return true;
    var joined = narr.map(function(s){ return String(s||'').trim(); }).join('').trim();
    if (joined.length < 6) return true;
    // 記号・空白のみ
    if (/^[\.…。、・\s\n\r]+$/.test(joined)) return true;
    // 既知 placeholder 文字列
    if (/^(\.\.\.|\.\.|…+|。+|（続く）|\(続く\)|物語が続く|物語の続き|物語は続く|to\s*be\s*continued|続く|つづく)$/i.test(joined)) return true;
    return false;
  }

  function isJapaneseValid(text){
    if (!text || typeof text !== 'string') return false;
    var t = text.trim();
    if (t.length < 4) return false;
    if (!/[ぁ-ん]/.test(t)) return false;
    if (/[a-zA-Z]{4,}/.test(t)) return false;
    // 漢字のみ (ひらがな・カタカナ無し) は schema key の可能性が高い
    if (/[一-鿿]/.test(t) && !/[ぁ-んァ-ヶー]/.test(t)) return false;
    return true;
  }

  // ----- Recovery (Stage 1+2): ctx.raw から narrative を抽出 -----
  function extractFromRaw(raw){
    if (!raw || typeof raw !== 'string') return null;
    // Stage 1: "narrative":[...] regex
    var m1 = raw.match(/"narrative"\s*:\s*\[([\s\S]*?)\]/);
    if (m1){
      try {
        var arr = JSON.parse('[' + m1[1] + ']');
        var cleaned = arr
          .filter(function(s){ return typeof s === 'string' && isJapaneseValid(s); })
          .map(function(s){ return s.trim(); })
          .slice(0, 8);
        if (cleaned.length > 0) return cleaned;
      } catch(e){}
    }
    // Stage 2: 任意の quoted Japanese string を gather
    try {
      var rx = /"((?:[^"\\]|\\.){4,300})"/g;
      var match;
      var out = [];
      var seen = {};
      while ((match = rx.exec(raw)) !== null){
        try {
          var parsed = JSON.parse('"' + match[1] + '"');
          if (typeof parsed !== 'string') continue;
          var t = parsed.trim();
          if (t.length < 6) continue;
          if (!isJapaneseValid(t)) continue;
          if (/^(playerIntent|branchCandidates|narrative|kind|tone|label|type|id|main|side|talk|other|explore|aggressive|neutral|act|do|say|story)$/i.test(t)) continue;
          // v292Dfix17: branchCandidates の label が narrative に紛れ込むのを除外
          // ex: "リアの反応をじっと見つめる（DO）" / "(SAY)" 末尾 など
          if (/[（(]\s*(DO|SAY|STORY)\s*[）)]\s*$/i.test(t)) continue;
          if (/^[:：]\s/.test(t)) continue;
          if (seen[t]) continue;
          seen[t] = true;
          out.push(t);
          if (out.length >= 6) break;
        } catch(e){}
      }
      if (out.length > 0) return out;
    } catch(e){}
    return null;
  }

  // ----- Recovery (Stage 3): synth fallback -----
  function safeStr(s, max){
    if (s == null) return '';
    var t = String(s).trim();
    if (max && t.length > max) t = t.slice(0, max);
    return t;
  }

  function pickHeroName(S){
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) return safeStr(S.cast.hero.name, 30);
        if (S.cast.pc && S.cast.pc.name) return safeStr(S.cast.pc.name, 30);
        var keys = Object.keys(S.cast);
        for (var i = 0; i < keys.length; i++){
          var c = S.cast[keys[i]];
          if (c && (c.role === 'hero' || c.role === 'pc' || c.isHero) && c.name) return safeStr(c.name, 30);
        }
      }
    } catch(e){}
    return 'キャラクター';
  }

  function pickPlayerText(ctx){
    // 1. fix14 input watcher が捕まえた直近 input
    try {
      var x = window.__v292Dfix14LastInput;
      if (x && typeof x === 'string' && x.trim().length > 0) return safeStr(x, 200);
    } catch(e){}
    // 2. ctx に明示されたもの (将来拡張)
    if (ctx){
      if (ctx.playerText && typeof ctx.playerText === 'string') return safeStr(ctx.playerText, 200);
      if (ctx.userText && typeof ctx.userText === 'string') return safeStr(ctx.userText, 200);
    }
    // 3. 現在の input field の値 (まだ clear されていない場合)
    try {
      var el = document.getElementById('inp');
      if (el && el.value) return safeStr(el.value, 200);
    } catch(e){}
    return '';
  }

  function synthFallback(plan, ctx){
    try {
      var S = (ctx && ctx.state) || (typeof window !== 'undefined' && window.__v292Dfix14_S) || null;
      if (!S){ try { S = (0,eval)('typeof S !== "undefined" ? S : null'); } catch(e){} }
      var hero = pickHeroName(S);
      var inputType = (ctx && ctx.inputType) || 'STORY';
      var playerText = pickPlayerText(ctx);

      if (inputType === 'SAY'){
        if (playerText){
          return [
            '「' + playerText + '」と' + hero + 'は静かに口にした。',
            '声は場の空気にわずかに溶け、短い余韻だけが残る。',
            '相手の反応を待つあいだ、時間がゆるやかに引き伸ばされた。'
          ];
        }
        return [
          hero + 'は言葉を選びながら口を開いた。',
          '声は短く、しかし場の空気をかすかに揺らした。',
          '相手の反応を窺いながら、視線をそらさずにいる。'
        ];
      }
      if (inputType === 'DO'){
        if (playerText){
          return [
            hero + 'は「' + playerText + '」を試みた。',
            'その動作は短く、しかし場に小さな変化を残す。',
            '次に何が起きるかは、まだ定かではない。'
          ];
        }
        return [
          hero + 'は身を動かし、状況に小さな変化を加えた。',
          '次に起きることを見定めるように、視線を巡らせる。'
        ];
      }
      if (inputType === 'STORY'){
        if (playerText){
          return [
            playerText,
            '物語は静かに次の場面へと続いていく。'
          ];
        }
        return [
          '物語は息をひそめ、次の展開を待っている。',
          ' ' + hero + 'は、まだ動かない景色のなかに身を置いていた。'
        ];
      }
      return [
        hero + 'はその場で次の動きを伺っている。',
        '物語は静かに進み、わずかな気配だけが流れていく。'
      ];
    } catch(e){
      console.warn(TAG, 'synthFallback error', e);
      return ['物語は静かに進む。'];
    }
  }

  // ----- The actual extension -----
  function recoveryExtV4(plan, ctx){
    try {
      if (!plan) return plan;
      // narrative を array に強制
      if (!Array.isArray(plan.narrative)){
        plan.narrative = plan.narrative ? [String(plan.narrative)] : [];
      }
      if (!isNarrativeEmpty(plan.narrative)) return plan;

      // Stage 1+2: ctx.raw から救済
      if (ctx && ctx.raw){
        try {
          var rescued = extractFromRaw(ctx.raw);
          if (rescued && rescued.length > 0){
            plan.narrative = rescued;
            console.log(TAG, 'V4 stage12: rescued from raw, lines=' + rescued.length);
            if (!isNarrativeEmpty(plan.narrative)) return plan;
          }
        } catch(e){ console.warn(TAG, 'V4 stage12 err', e); }
      }

      // Stage 3: synth fallback
      try {
        var synth = synthFallback(plan, ctx);
        if (synth && synth.length > 0){
          plan.narrative = synth;
          console.log(TAG, 'V4 stage3: synthesized fallback, lines=' + synth.length);
        }
      } catch(e){ console.warn(TAG, 'V4 stage3 err', e); }
    } catch(e){
      console.warn(TAG, 'recoveryExtV4 error', e);
    }
    return plan;
  }
  recoveryExtV4.__v292Dfix14 = true;

  // ----- Planner ref (handles top-level let/const not on window) -----
  function getPlannerRef(){
    try {
      var P = (0, eval)('typeof Planner !== "undefined" ? Planner : null');
      return P;
    } catch(e){ return null; }
  }

  // ----- Install V4 (idempotent + reinstallable) -----
  function ensureInstalled(){
    var P = getPlannerRef();
    if (!P || !Array.isArray(P._parseExtensions)) return false;

    // Expose to window so fix12's broken installRecovery (which polls
    // window.Planner) can finally succeed and push recoveryExtV2 too.
    // We use Object.defineProperty so we don't clobber later assignments.
    try {
      if (!window.Planner){
        try {
          Object.defineProperty(window, 'Planner', {
            value: P, writable: true, configurable: true, enumerable: false
          });
        } catch(e){ try { window.Planner = P; } catch(e2){} }
      }
    } catch(e){}

    if (P._parseExtensions.__v292Dfix14) return true;

    // Mark + push
    P._parseExtensions.push(recoveryExtV4);
    P._parseExtensions.__v292Dfix14 = true;
    console.log(TAG, 'V4 installed at position', P._parseExtensions.length - 1, 'of', P._parseExtensions.length);
    return true;
  }

  if (!ensureInstalled()){
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (ensureInstalled()){
        console.log(TAG, 'V4 installed after', tries, 'polls');
        clearInterval(iv);
      } else if (tries > 600){ // 120s
        console.warn(TAG, 'V4 install timeout after', tries, 'polls');
        clearInterval(iv);
      }
    }, 200);
  }

  // Defense-in-depth: periodic re-check (in case _parseExtensions gets replaced)
  setInterval(function(){
    var P = getPlannerRef();
    if (!P || !Array.isArray(P._parseExtensions)) return;
    if (!P._parseExtensions.__v292Dfix14){
      P._parseExtensions.push(recoveryExtV4);
      P._parseExtensions.__v292Dfix14 = true;
      console.log(TAG, 'V4 re-installed (array was replaced)');
    }
  }, 3000);

  // ----- Input watcher to capture playerText for synth fallback -----
  function startInputWatcher(){
    var lastVal = '';
    function tick(){
      try {
        var el = document.getElementById('inp');
        if (!el) return;
        var v = el.value || '';
        if (v.trim().length > 0 && v !== lastVal){
          window.__v292Dfix14LastInput = v;
        }
        if ((!v || v.trim().length === 0) && lastVal && lastVal.trim().length > 0){
          // 直前まで text があって今 空 = submit 直後
          window.__v292Dfix14LastInput = lastVal;
        }
        lastVal = v;
      } catch(e){}
    }
    setInterval(tick, 100);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', startInputWatcher, { once: true });
  } else {
    startInputWatcher();
  }

  // Expose for diag
  window.__v292Dfix14 = {
    isNarrativeEmpty: isNarrativeEmpty,
    isJapaneseValid: isJapaneseValid,
    extractFromRaw: extractFromRaw,
    synthFallback: synthFallback,
    recoveryExtV4: recoveryExtV4,
    ensureInstalled: ensureInstalled,
    pickPlayerText: pickPlayerText
  };

  console.log(TAG, 'IIFE loaded — narrative recovery V4 active');
})();


// ====================================================================
// v292Dfix15 — dialogue pronoun resolver
// ====================================================================
// Session report: narrative 内の「彼女「あっ……！？」」「彼「ぐっ」」
//   のような代名詞付きセリフが会話ログに抽出されない。
// 原因:
//   - dialogue_layout の Pattern A は と言/答/叫 等の suffix 必須
//     → 「彼女「あっ」」(suffix なし) はマッチしない
//   - Pattern B は cast 登録名のみ → 「彼女」は cast にない
//   - Pattern C は ^/。/、/！/？/\n 直後の bare 「」 のみ
//     → 「彼女「」」前に文字があるので不発
//   結果: 代名詞付きセリフが完全にスルーされる。
// 修正:
//   - 既存 dialogue_layout の renderStream hook を取り外し
//   - enhanced renderStream を新 hook として install
//   - Pattern A verb list 拡張 (呟/漏/喚/喘/呻/吼/吠/喝/促)
//   - Pattern A の name 末尾が代名詞なら resolve
//   - Pattern D 新設: pronoun + 「」 (suffix 不要) → resolve
//   - resolvePronoun: 直前 pre-context の同性別 named speaker
//     → cast 内最初の同性別 NPC → 最近言及名、の 3 段階 fallback
//   - 性別は cast.gender (gender_radio 由来) と desc heuristic 両用
//   - Markdown ** strip は既存 fix4 のまま継承
//   - SAY playerText echo 抑止も既存通り
// __v292Dfix15Active フラグで二重 install 防止。fix12/13/14 と非競合。
// ====================================================================
(function v292Dfix15(){
  if (window.__v292Dfix15Active) return;
  window.__v292Dfix15Active = true;
  var TAG = '[v292:Dfix15]';

  var FEMALE_PRONOUNS = ['彼女','あの女','あの少女','少女'];
  var MALE_PRONOUNS   = ['彼','あの男','あの少年','少年'];
  var ALL_PRONOUNS    = FEMALE_PRONOUNS.concat(MALE_PRONOUNS);

  function isFemalePronoun(p){ return FEMALE_PRONOUNS.indexOf(p) >= 0; }
  function isMalePronoun(p){ return MALE_PRONOUNS.indexOf(p) >= 0; }

  function whenDom(fn){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      try { fn(); } catch(e){ console.warn(TAG, 'init err:', e && e.message); }
    }
  }

  function getState(){
    try {
      if (typeof S !== 'undefined' && S) return S;
      if (typeof window !== 'undefined' && window.S) return window.S;
      return JSON.parse(localStorage.getItem('chr6') || '{}');
    } catch(e){ return {}; }
  }

  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isHero(name){
    if (!name) return false;
    var st = getState();
    var h = ((st.cast || {}).hero || {}).name;
    return !!(h && (h === name || name.indexOf(h) !== -1));
  }

  function avatarUrlLocal(name, desc, gender){
    if (!name) return '';
    var prompt = 'anime portrait of ';
    prompt += (gender === '男性') ? 'a young man, ' : 'a young woman, ';
    prompt += name + ', ';
    if (desc){
      var d = String(desc).replace(/^性別:\s*[男女][性]?[。、]?/, '').slice(0, 60);
      prompt += d + ', ';
    }
    prompt += 'detailed face, dark fantasy, dramatic lighting, high quality';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
           '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function getAvatar(name){
    if (!name) return '';
    var st = getState();
    var cast = st.cast || {};
    function genUrl(c){
      try { return avatarUrlLocal(c.name || '', c.desc || '', c.gender || ''); }
      catch(e){ return ''; }
    }
    if (cast.hero && cast.hero.name === name){
      return cast.hero.avatar || genUrl(cast.hero);
    }
    var npcs = cast.npcs || [];
    if (Array.isArray(npcs)){
      for (var i = 0; i < npcs.length; i++){
        var n = npcs[i];
        if (n && n.name && (n.name === name || name.indexOf(n.name) !== -1)){
          return n.avatar || genUrl(n);
        }
      }
    }
    return '';
  }

  function castInfo(){
    var st = getState();
    var cast = st.cast || {};
    var names = [];
    var byName = {};
    if (cast.hero && cast.hero.name){
      names.push(cast.hero.name);
      byName[cast.hero.name] = cast.hero;
    }
    if (Array.isArray(cast.npcs)){
      cast.npcs.forEach(function(n){
        if (n && n.name){
          names.push(n.name);
          byName[n.name] = n;
        }
      });
    }
    return { cast: cast, names: names, byName: byName };
  }

  function inferGenderFromDesc(c){
    if (!c) return '';
    if (c.gender === '女性' || c.gender === '男性') return c.gender;
    var s = (c.desc || '') + ' ' + (c.name || '') + ' ' + (c.personality || '');
    var fHits = (s.match(/(少女|令嬢|乙女|女王|王女|魔女|尼僧|シスター|聖女|淑女|姉|妹|母|妻|娘|女性|女子|お嬢|彼女)/g) || []).length;
    var mHits = (s.match(/(少年|青年|男性|男子|彼[^女]|王子|騎士|戦士|兄|弟|父|夫|息子|青年|若者)/g) || []).length;
    if (fHits > mHits) return '女性';
    if (mHits > fHits) return '男性';
    return '';
  }

  function resolvePronoun(pronoun, preContext, info){
    if (!info || !info.names || !info.names.length) return null;
    var female = isFemalePronoun(pronoun);
    var male   = isMalePronoun(pronoun);

    var pat = info.names.map(function(n){
      return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|');
    if (!pat) return null;
    var rx = new RegExp('(' + pat + ')', 'g');

    var matches = [];
    var m;
    while ((m = rx.exec(preContext))) matches.push(m[1]);

    // 1) Most recent same-gender name in pre-context
    for (var i = matches.length - 1; i >= 0; i--){
      var nm = matches[i];
      var c = info.byName[nm];
      var g = c ? (c.gender || inferGenderFromDesc(c)) : '';
      if (female && g === '女性') return nm;
      if (male && g === '男性') return nm;
    }
    // 2) Pronoun has definite gender — fall back to first same-gender cast member
    if (female || male){
      for (var k = 0; k < info.names.length; k++){
        var name2 = info.names[k];
        var c2 = info.byName[name2];
        var g2 = c2 ? (c2.gender || inferGenderFromDesc(c2)) : '';
        if (female && g2 === '女性') return name2;
        if (male && g2 === '男性') return name2;
      }
    }
    // 3) Last resort: most recent name regardless of gender
    if (matches.length) return matches[matches.length - 1];
    return null;
  }

  function extractDialoguesEnhanced(narrSrc, turn){
    if (!narrSrc) return [];
    var src = Array.isArray(narrSrc) ? narrSrc.join('\n') : String(narrSrc);
    src = src.replace(/\*\*/g, '');
    var out = [];
    var seen = Object.create(null);
    var info = castInfo();
    var cast = info.cast;
    var names = info.names;

    function hasText(text){
      for (var k in seen){
        if (k.indexOf('|' + text) === k.length - text.length - 1) return true;
      }
      return false;
    }
    function pushUnique(speaker, text, isHeroFlag){
      text = (text == null ? '' : String(text)).trim();
      if (!text) return;
      speaker = (speaker == null ? '' : String(speaker)).trim();
      if (ALL_PRONOUNS.indexOf(speaker) >= 0){
        speaker = '';
      }
      var k = (speaker || '') + '|' + text;
      if (seen[k]) return;
      if (!speaker && hasText(text)) return;
      seen[k] = true;
      var item = { speaker: speaker, text: text };
      if (isHeroFlag) item.isHero = true;
      out.push(item);
    }

    var namePat = names.filter(function(n){ return n; }).map(function(n){
      return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|');

    // SAY echo suppression
    if (turn && turn.inputType === 'SAY' && turn.playerText){
      var pt = String(turn.playerText).trim();
      if (pt){
        seen['|' + pt] = true;
        seen['主人公|' + pt] = true;
        var heroName = cast.hero && cast.hero.name;
        if (heroName && heroName !== '主人公') seen[heroName + '|' + pt] = true;
      }
    }

    // v292Dfix17: quote class unified to 「」『』〝〟 (Hermes 4 uses 〝〟 heavily).
    // 各パターンの open/close を character class に拡張し、Pattern E/F (post-quote attribution) を追加。

    // Pattern A: name + [「『〝]QUOTE[」』〟] + と...verb
    var rxA = /([一-鿿ぁ-ゖァ-ヺ々ー・]+?)(?:は|が|の)?[「『〝]([^」』〟]+?)[」』〟](?:と[^」』〟]*?(?:言|答|命|叫|問|呼|尋|応|返|笑|囁|吐|怒鳴|呟|漏|喚|喘|呻|吼|吠|喝|促))/g;
    var m;
    while ((m = rxA.exec(src))){
      var spA = (m[1] || '').trim();
      var dlgA = (m[2] || '').trim();
      var pronounSuffix = null;
      for (var pi = 0; pi < ALL_PRONOUNS.length; pi++){
        var pr = ALL_PRONOUNS[pi];
        if (spA === pr || (spA.length > pr.length && spA.slice(-pr.length) === pr)){
          pronounSuffix = pr;
          break;
        }
      }
      if (pronounSuffix){
        var resolvedA = resolvePronoun(pronounSuffix, src.substring(0, m.index), info);
        if (resolvedA) spA = resolvedA;
        else spA = '';
      }
      pushUnique(spA, dlgA);
    }

    // Pattern B: cast name + [「『〝]QUOTE[」』〟] (no verb suffix)
    if (namePat){
      var rxB = new RegExp('(?:^|\\n|。|、|」|』|〟|\\s)(' + namePat + ')(?:は|が|の)?[「『〝]([^」』〟]+?)[」』〟]', 'g');
      while ((m = rxB.exec(src))){
        pushUnique(m[1].trim(), m[2].trim());
      }
    }

    // Pattern D: pronoun + [「『〝]QUOTE[」』〟] → resolve to recent named speaker
    var rxD = /(彼女|あの女|あの少女|少女|彼|あの男|あの少年|少年)(?:は|が|の)?[「『〝]([^」』〟]+?)[」』〟]/g;
    while ((m = rxD.exec(src))){
      var pronoun = m[1];
      var dlgD = (m[2] || '').trim();
      if (!dlgD) continue;
      var pre = src.substring(0, m.index);
      var resolvedD = resolvePronoun(pronoun, pre, info);
      if (resolvedD){
        pushUnique(resolvedD, dlgD);
      } else if (cast.hero && cast.hero.name){
        var hero = cast.hero;
        var hg = hero.gender || inferGenderFromDesc(hero);
        if (isFemalePronoun(pronoun) && hg === '女性'){
          pushUnique(hero.name, dlgD);
        } else if (isMalePronoun(pronoun) && hg === '男性'){
          pushUnique(hero.name, dlgD);
        } else if (cast.npcs && cast.npcs[0] && cast.npcs[0].name){
          pushUnique(cast.npcs[0].name, dlgD);
        } else {
          pushUnique(hero.name, dlgD);
        }
      } else {
        pushUnique(pronoun, dlgD);
      }
    }

    // Pattern E (NEW v292Dfix17): [「『〝]QUOTE[」』〟] + NAME + は/が + ...verb (post-quote attribution)
    // 例: 「……感じるよ」リアはそう答えた / 〝なんだろう〟イヴが呟いた
    if (namePat){
      var rxE = new RegExp('[「『〝]([^」』〟]+?)[」』〟]\\s*(' + namePat + ')(?:は|が)(?:[^。]{0,40})?(?:言|答|応|呟|尋|叫|呼|笑|囁|返|促|命|問|怒鳴|喚)', 'g');
      while ((m = rxE.exec(src))){
        var dlgE = (m[1] || '').trim();
        var spE = (m[2] || '').trim();
        if (dlgE && spE) pushUnique(spE, dlgE);
      }
    }

    // Pattern F (NEW v292Dfix17): [「『〝]QUOTE[」』〟] + 代名詞は/が (post-quote pronoun)
    var rxF = /[「『〝]([^」』〟]+?)[」』〟]\s*(彼女|あの女|あの少女|少女|彼|あの男|あの少年|少年)(?:は|が)/g;
    while ((m = rxF.exec(src))){
      var dlgF = (m[1] || '').trim();
      var prnF = m[2];
      if (!dlgF) continue;
      var preF = src.substring(0, m.index);
      var resolvedF = resolvePronoun(prnF, preF, info);
      if (resolvedF) pushUnique(resolvedF, dlgF);
    }

    // Pattern G (NEW v292Dfix18+20): [「Q」](と)?(、)?NAME(の|から)…(声|言葉|呟き|呼びかけ|応答|問い|返事|叫び|囁き|嘆息|溜息|怒鳴り|喘ぎ|呻き|笑み|笑い)
    // 例: 「気づかなかった？」と、セルジオの低い声が静寂を破った
    //     「やめて」と、リアの呟きが漏れた
    //     「ここよ」リアの声が答えた
    // Pattern E が NAME(は|が) しか拾わなかった漏れを補完。属格 / 起点 助詞 + 発話関連名詞 で attribute。
    var ATTR_NOUNS_BASE = '声|言葉|呟き|つぶやき|呼びかけ|応答|問い|返事|叫び|囁き|嘆息|溜息|怒鳴り|喘ぎ|呻き|笑み|笑い';
    if (namePat){
      var rxG = new RegExp('[「『〝]([^」』〟]+?)[」』〟]\\s*と?\\s*[、,。]?\\s*(' + namePat + ')(?:の|から)(?:[^。]{0,40})?(?:' + ATTR_NOUNS_BASE + ')', 'g');
      while ((m = rxG.exec(src))){
        var dlgG = (m[1] || '').trim();
        var spG = (m[2] || '').trim();
        if (dlgG && spG) pushUnique(spG, dlgG);
      }
    }

    // Pattern H (NEW v292Dfix21): [「Q」](と)?(、)?PRONOUN(の)…(body-part|attribute-noun)
    //   ex: 「う…」と、彼の喉が小さく震えた / 「あぁ」と、彼女の唇が動いた
    //   代名詞 + の + 発話源 (喉/口/唇/息/呼吸/etc.) または ATTR_NOUNS。
    //   代名詞 → 直前の同性別 named char に解決して attribute。
    var ATTR_NOUNS_H = ATTR_NOUNS_BASE + '|喉|口|唇|息|呼吸|表情|顔|声音|口元';
    var rxH = new RegExp('[「『〝]([^」』〟]+?)[」』〟]\\s*と?\\s*[、,。]?\\s*(彼女|彼)(?:の)(?:[^。]{0,40})?(?:' + ATTR_NOUNS_H + ')', 'g');
    while ((m = rxH.exec(src))){
      var dlgH = (m[1] || '').trim();
      var prnH = m[2];
      if (!dlgH) continue;
      var preH = src.substring(0, m.index);
      var resolvedH = resolvePronoun(prnH, preH, info);
      if (resolvedH) pushUnique(resolvedH, dlgH);
    }

    // Pattern C: bare [「『〝]QUOTE[」』〟] after sentence boundary, with post-quote NAME peek
    var rxC = /(?:^|[\n。、！？])[「『〝]([^」』〟]{2,80})[」』〟]/g;
    while ((m = rxC.exec(src))){
      var dlgC = m[1].trim();
      if (hasText(dlgC)) continue;
      var pos = m.index;
      var preContext = src.substring(Math.max(0, pos - 200), pos);
      var speaker = '';
      // v292Dfix17: post-quote NAME peek (handles "「Q」NAMEは...verb" patterns Pattern E may have missed)
      var quoteEndMatch = src.slice(pos).match(/[「『〝][^」』〟]+[」』〟]/);
      if (quoteEndMatch){
        var quoteEndIdx = pos + quoteEndMatch.index + quoteEndMatch[0].length;
        var afterCtx = src.substring(quoteEndIdx, Math.min(src.length, quoteEndIdx + 40));
        if (namePat){
          var postNameRx = new RegExp('^\\s*(' + namePat + ')(?:は|が)');
          var postM = afterCtx.match(postNameRx);
          if (postM) speaker = postM[1];
        }
      }
      if (!speaker && namePat){
        var nameRx = new RegExp('(' + namePat + ')', 'g');
        var lastMatch = null, nm2;
        while ((nm2 = nameRx.exec(preContext))) lastMatch = nm2[1];
        if (lastMatch) speaker = lastMatch;
      }
      if (!speaker){
        var lastPronoun = null, lastPronounIdx = -1;
        for (var ppi = 0; ppi < ALL_PRONOUNS.length; ppi++){
          var pp = ALL_PRONOUNS[ppi];
          var idx = preContext.lastIndexOf(pp);
          if (idx > lastPronounIdx){ lastPronoun = pp; lastPronounIdx = idx; }
        }
        if (lastPronoun){
          var resolvedC = resolvePronoun(lastPronoun, preContext, info);
          if (resolvedC) speaker = resolvedC;
        }
      }
      pushUnique(speaker, dlgC);
    }

    // SAY fallback
    if (out.length === 0 && turn && turn.inputType === 'SAY' && turn.playerText){
      var q = src.match(/「([^「」]+?)」/);
      var __heroName2 = (cast.hero && cast.hero.name) ? cast.hero.name : '主人公';
      if (q) pushUnique(__heroName2, q[1], true);
    }

    return out;
  }

  function addCard(speaker, text, isHeroFlag){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    var av = getAvatar(speaker);
    var avHtml = av
      ? '<img src="' + escHtml(av) + '" alt="' + escHtml(speaker) + '" loading="lazy"'
        + ' onerror="this.parentNode.textContent=String.fromCharCode(63)">'
      : '?';
    var card = document.createElement('div');
    card.className = 'v292-dlg-card' + (isHeroFlag ? ' hero-card' : '');
    card.innerHTML =
      '<div class="dlg-av">' + avHtml + '</div>'
      + '<div class="dlg-body">'
      +   '<div class="dlg-name">' + escHtml(speaker || '???') + '</div>'
      +   '<div class="dlg-text">' + escHtml(text) + '</div>'
      + '</div>';
    stream.appendChild(card);
  }

  function renderStreamV15(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return;
    stream.innerHTML = '';
    var st = getState();
    var turns = st.turns || [];
    for (var i = 0; i < turns.length; i++){
      var t = turns[i];
      if (!t) continue;
      if (t.playerText && t.inputType === 'SAY'){
        var __heroName1 = (st && st.cast && st.cast.hero && st.cast.hero.name) ? st.cast.hero.name : '主人公';
        addCard(__heroName1, t.playerText, true);
      }
      var ds = extractDialoguesEnhanced(t.narrative, t);
      for (var j = 0; j < ds.length; j++){
        var d = ds[j];
        addCard(d.speaker, d.text, d.isHero || isHero(d.speaker));
      }
    }
    stream.scrollTop = stream.scrollHeight;
  }

  function removeOldHook(UI){
    if (!UI || !Array.isArray(UI._renderHooks)) return 0;
    var removed = 0;
    for (var i = UI._renderHooks.length - 1; i >= 0; i--){
      var h = UI._renderHooks[i];
      if (h && h.name === 'dialogueLayoutHook'){
        UI._renderHooks.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  function getUIRef(){
    try {
      var U = (0, eval)('typeof UI !== "undefined" ? UI : null');
      return U;
    } catch(e){ return null; }
  }

  function tryInstall(){
    var UI = getUIRef();
    if (!UI || !Array.isArray(UI._renderHooks)) return false;
    if (!window.__v292 || !window.__v292.dialogueLayout) return false;
    if (UI._renderHooks.__v292Dfix15) return true;

    var removed = removeOldHook(UI);

    window.__v292.dialogueLayout.renderStream = renderStreamV15;
    window.__v292.dialogueLayout.extractDialogues = extractDialoguesEnhanced;

    UI._renderHooks.push(function dialogueLayoutHookV15(/* turn */){
      try { renderStreamV15(); }
      catch(e){ console.warn(TAG, 'render err:', e && e.message); }
    });
    UI._renderHooks.__v292Dfix15 = true;

    try { renderStreamV15(); }
    catch(e){ console.warn(TAG, 'initial render err:', e && e.message); }

    window.__v292 = window.__v292 || {};
    window.__v292.dfix15 = {
      renderStream: renderStreamV15,
      extractDialogues: extractDialoguesEnhanced,
      resolvePronoun: resolvePronoun,
      castInfo: castInfo
    };

    console.log(TAG, 'pronoun resolver active (removed=' + removed +
                ' old dialogueLayoutHook(s), installed dialogueLayoutHookV15)');
    return true;
  }

  function init(){
    if (tryInstall()) return;
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (tryInstall()){
        console.log(TAG, 'installed after', tries, 'polls');
        clearInterval(iv);
      } else if (tries > 600){ // 120s
        console.warn(TAG, 'install timeout after', tries, 'polls');
        clearInterval(iv);
      }
    }, 200);
  }

  whenDom(init);
})();

// ====================================================================
// v292Dfix16 — character gender enforcement (キャラ性別違反バグ修正)
// ====================================================================
// Bug report 2026-05-14 (BUG_REPORT_2026-05-14_char_setting_drift.md):
//   ユーザーが gender_radio で設定したキャラ性別と LLM 描写が食い違う。
//   例: 「ガイア（男性）」NPC が narrative で「彼女」と書かれる、
//       「イヴ（女性）」設定なのに男性的描写、など。
//
// Hypothesis A 確定 (実機検証 2026-05-14):
//   1. Planner.build の user payload は { name, desc, personality, coreDesire,
//      coreFear, wound } のみで **gender フィールド自体が含まれない**
//   2. sys プロンプトに「キャラの声」内で「ガイア（男性、...）」と書かれては
//      いるが、attention が低い「口調指示」の文脈に埋もれる
//   3. 直前 narrative に LLM の誤用が含まれると、次ターンの recentHistory で
//      再強化されて誤用が継続する (Hypothesis C も寄与)
//
// 修正アプローチ:
//   A. sys プロンプト先頭に【キャラ性別（絶対遵守 — 最優先ルール）】ブロックを挿入
//      → Planner._extensions に登録 (sys を mutate)
//   B. user payload の cast.protagonist と cast.npcs[] に gender フィールドを注入
//      → Planner._userExtensions に登録 (user JSON を rebuild)
//   C. user payload の recentHistory 内の誤用代名詞を、cast 設定に基づき正解に
//      置換 (例: 男性ガイアの直後の「彼女」→「彼」)
//      → 同じく _userExtensions 内で処理
//   D. parsePlan 結果 plan.narrative に対しても同じ pronoun fix を実行
//      → Planner._parseExtensions に登録、S.turns に保存される前に修正
//
// 既存機能との非競合:
//   - fix15 dialogue_pronoun_resolver は display 時 (renderStream) の代名詞→
//     名前置換。本 fix16 は prompt と保存 narrative を対象とする preventive 層。
//     互いに介入レイヤが異なり競合しない。
//   - fix14 narrative recovery V4 は plan.narrative が空のときの synth fallback。
//     本 fix16 の parse ext は plan.narrative が非空のときに pronoun を正規化する。
//     fix14 が V4 で push されるのに対し fix16 は最後に push されるため、
//     fix14 の rescue 結果に対しても fix16 の pronoun fix が掛かる。
//
// __v292Dfix16Active flag で IIFE 二重実行防止。
// _extensions / _userExtensions / _parseExtensions それぞれに __v292Dfix16* flag。
// 3 秒 polling で配列 replace されても自動 reinstall。
// ====================================================================
(function v292Dfix16(){
  if (window.__v292Dfix16Active) return;
  window.__v292Dfix16Active = true;
  var TAG = '[v292:Dfix16]';

  function getState(){
    try {
      if (typeof S !== 'undefined' && S) return S;
      if (typeof window !== 'undefined' && window.S) return window.S;
    } catch(e){}
    return null;
  }

  function getCast(){
    var st = getState();
    if (!st || !st.cast) return null;
    var hero = st.cast.hero || {};
    var npcs = Array.isArray(st.cast.npcs) ? st.cast.npcs : [];
    return { hero: hero, npcs: npcs };
  }

  // ヒューリスティック: gender 未設定キャラに対し desc/name から推測
  function inferGender(c){
    if (!c) return '';
    if (c.gender === '男性' || c.gender === '女性') return c.gender;
    var s = (c.desc || '') + ' ' + (c.name || '') + ' ' + (c.personality || '');
    var fHits = (s.match(/(少女|令嬢|乙女|女王|王女|魔女|尼僧|シスター|聖女|淑女|姉(?!弟)|妹|母|妻|娘|女性|女子|お嬢)/g) || []).length;
    var mHits = (s.match(/(少年|青年|男性|男子|王子|騎士|兄(?!弟)|弟|父|夫|息子|若者|郎)/g) || []).length;
    if (fHits > mHits) return '女性';
    if (mHits > fHits) return '男性';
    return '';
  }

  function buildGenderBlock(cast){
    var entries = [];
    if (cast.hero && cast.hero.name){
      var hg = cast.hero.gender || inferGender(cast.hero);
      if (hg) entries.push('・**' + cast.hero.name + '**:**' + hg + '** (主人公)');
    }
    cast.npcs.forEach(function(n){
      if (n && n.name){
        var ng = n.gender || inferGender(n);
        if (ng) entries.push('・**' + n.name + '**:**' + ng + '**');
      }
    });
    if (!entries.length) return '';
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【キャラ性別（絶対遵守 — 最優先ルール）】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      entries.join('\n'),
      '',
      '★以下のルールを厳格に守ること。違反した行は無効として破棄される:',
      '・男性キャラを「彼女」「あの女」「少女」「女の子」「彼女の◯」等の女性的代名詞・呼称で呼ばない',
      '・女性キャラを「彼」「あの男」「少年」「男の子」「彼の◯」等の男性的代名詞・呼称で呼ばない',
      '・身体的描写（体格・声色・服装・所作）も指定された性別と整合させる',
      '・「兄/姉」「弟/妹」「お兄さん/お姉さん」も上記性別に合わせる',
      '・直前 narrative に過去の誤用が残っていても、上記の性別設定を最優先する',
      '・指定された性別と矛盾する代名詞・呼称・身体描写は creative writing の自由度を超える事実誤認である',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      ''
    ].join('\n');
  }

  // v292Dfix17+19: quote-aware + mixed-gender bypass + local-antecedent guard
  // 修正方針:
  //   (a) 「」『』〝〟 内の人物名では lastG を更新しない / クオート内の代名詞は触らない
  //   (b) 1 行内に 男性/女性 両キャラが登場する行は曖昧なのでモデル尊重で書換しない
  //   (c) v292Dfix19: 名前と代名詞の間に句読点 (、。!?) がある or 名前が 20 文字以上前なら
  //       オフ行の別キャラを指している可能性が高いので書換しない (model freedom 重視)
  //   (d) (a)(b)(c) を満たした上で残ったケース(明白な隣接ミス)だけ元のアルゴリズム適用
  function fixPronouns(text, allChars){
    if (!text || typeof text !== 'string') return text;
    if (!allChars.length) return text;
    var lines = text.split('\n');
    for (var li = 0; li < lines.length; li++){
      var line = lines[li];

      // (b) mixed-gender-line bypass
      var seenGenders = {};
      for (var sgi = 0; sgi < allChars.length; sgi++){
        var snm = allChars[sgi].name, sg = allChars[sgi].gender;
        if (snm && sg && line.indexOf(snm) >= 0) seenGenders[sg] = true;
      }
      if (seenGenders['男性'] && seenGenders['女性']){
        continue;
      }

      var lastG = '';
      var lastNameIdx = -999;
      var out = '';
      var i = 0;
      var qDepth = 0;
      while (i < line.length){
        var ch = line[i];
        if (ch === '「' || ch === '『' || ch === '〝'){ qDepth++; out += ch; i += 1; continue; }
        if (ch === '」' || ch === '』' || ch === '〟'){ if (qDepth > 0) qDepth--; out += ch; i += 1; continue; }
        if (qDepth > 0){ out += ch; i += 1; continue; }

        var matched = false;
        for (var ci = 0; ci < allChars.length; ci++){
          var nm = allChars[ci].name;
          if (nm && line.substr(i, nm.length) === nm){
            lastG = allChars[ci].gender || '';
            lastNameIdx = i;
            out += nm;
            i += nm.length;
            matched = true;
            break;
          }
        }
        if (matched) continue;

        // (c) v292Dfix19 local-antecedent guard
        var localOk = (i - lastNameIdx) < 20;
        if (localOk){
          var between = line.substring(lastNameIdx, i);
          if (/[、。！？!?]/.test(between)) localOk = false;
        }

        if (line.substr(i, 2) === '彼女'){
          if (localOk && lastG === '男性'){ out += '彼'; i += 2; continue; }
          out += '彼女'; i += 2; continue;
        }
        if (line[i] === '彼' && line[i+1] !== '女'){
          if (localOk && lastG === '女性'){ out += '彼女'; i += 1; continue; }
          out += '彼'; i += 1; continue;
        }
        if (line.substr(i, 2) === '少女' && localOk && lastG === '男性'){ out += '少年'; i += 2; continue; }
        if (line.substr(i, 2) === '少年' && localOk && lastG === '女性'){ out += '少女'; i += 2; continue; }
        out += line[i];
        i += 1;
      }
      lines[li] = out;
    }
    return lines.join('\n');
  }

  function buildAllCharsWithGender(cast){
    var list = [];
    if (cast.hero && cast.hero.name){
      list.push({ name: String(cast.hero.name).trim(), gender: cast.hero.gender || inferGender(cast.hero) });
    }
    cast.npcs.forEach(function(n){
      if (n && n.name){
        list.push({ name: String(n.name).trim(), gender: n.gender || inferGender(n) });
      }
    });
    return list;
  }

  function genderEnforceSysExt(ctx){
    try {
      var cast = getCast();
      if (!cast) return ctx.sys;
      var block = buildGenderBlock(cast);
      if (!block) return ctx.sys;
      var s = ctx.sys || '';
      if (s.indexOf('【キャラ性別（絶対遵守 — 最優先ルール）】') >= 0) return s;
      // 先頭の見出し直前に挿入: 最初の「【」または冒頭に配置
      var idx = s.indexOf('\n\n【');
      if (idx === -1){
        idx = s.indexOf('【');
        return s.slice(0, idx >= 0 ? idx : 0) + block + s.slice(idx >= 0 ? idx : 0);
      }
      return s.slice(0, idx + 2) + block + s.slice(idx + 2);
    } catch(e){
      console.warn(TAG, 'sys ext err:', e && e.message);
      return ctx.sys;
    }
  }

  function genderEnforceUserExt(ctx){
    try {
      var cast = getCast();
      if (!cast) return ctx.user;
      var user = ctx.user;
      var allChars = buildAllCharsWithGender(cast);

      // Try parse as JSON (index.html Planner.build emits JSON)
      var parsed = null;
      try { parsed = JSON.parse(user); } catch(e){}

      if (parsed && typeof parsed === 'object'){
        if (parsed.cast){
          if (parsed.cast.protagonist && cast.hero){
            var hg = cast.hero.gender || inferGender(cast.hero);
            if (hg) parsed.cast.protagonist.gender = hg;
          }
          if (Array.isArray(parsed.cast.npcs)){
            parsed.cast.npcs.forEach(function(n, i){
              var src = cast.npcs[i];
              if (src){
                var g = src.gender || inferGender(src);
                if (g) n.gender = g;
              }
            });
          }
        }
        if (parsed.recentHistory && typeof parsed.recentHistory === 'string'){
          parsed.recentHistory = fixPronouns(parsed.recentHistory, allChars);
        }
        return JSON.stringify(parsed, null, 2);
      }

      // Non-JSON user (prose-mode): only fix recentHistory-like content embedded
      return user;
    } catch(e){
      console.warn(TAG, 'user ext err:', e && e.message);
      return ctx.user;
    }
  }

  function genderFixParseExt(plan, ctx){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return;
      var cast = getCast();
      if (!cast) return;
      var allChars = buildAllCharsWithGender(cast);
      var hasGendered = allChars.some(function(c){ return c.gender === '男性' || c.gender === '女性'; });
      if (!hasGendered) return;
      var fixedCount = 0;
      plan.narrative = plan.narrative.map(function(line){
        var fx = fixPronouns(line, allChars);
        if (fx !== line) fixedCount++;
        return fx;
      });
      if (fixedCount) console.log(TAG, 'narrative pronoun fixes applied:', fixedCount);
    } catch(e){
      console.warn(TAG, 'parse ext err:', e && e.message);
    }
  }

  function getPlanner(){
    try { return (0, eval)('typeof Planner !== "undefined" ? Planner : null'); }
    catch(e){ return null; }
  }

  function install(){
    var P = getPlanner();
    if (!P){ setTimeout(install, 200); return; }

    // sys extension — unshift to apply early (before other extensions may modify sys)
    if (Array.isArray(P._extensions) && !P._extensions.__v292Dfix16Sys){
      P._extensions.unshift(genderEnforceSysExt);
      P._extensions.__v292Dfix16Sys = true;
    }
    // user extension — push at end so we mutate after others
    if (Array.isArray(P._userExtensions) && !P._userExtensions.__v292Dfix16User){
      P._userExtensions.push(genderEnforceUserExt);
      P._userExtensions.__v292Dfix16User = true;
    }
    // parse extension — push at end so it runs after fix14 recovery
    if (Array.isArray(P._parseExtensions) && !P._parseExtensions.__v292Dfix16Parse){
      P._parseExtensions.push(genderFixParseExt);
      P._parseExtensions.__v292Dfix16Parse = true;
    }

    console.log(TAG, 'gender enforcement installed',
      '(sys=' + ((P._extensions||[]).length) + ', user=' + ((P._userExtensions||[]).length) + ', parse=' + ((P._parseExtensions||[]).length) + ')');
  }

  install();

  // Periodic re-check (defends against array-replace by other patches)
  setInterval(function(){
    try {
      var P = getPlanner();
      if (!P) return;
      var needs = false;
      if (Array.isArray(P._extensions) && !P._extensions.__v292Dfix16Sys) needs = true;
      if (Array.isArray(P._userExtensions) && !P._userExtensions.__v292Dfix16User) needs = true;
      if (Array.isArray(P._parseExtensions) && !P._parseExtensions.__v292Dfix16Parse) needs = true;
      if (needs) install();
    } catch(e){}
  }, 3000);

  console.log(TAG, 'IIFE loaded — gender drift enforcement active');
})();


// =====================================================================
// v292Dfix17 marker — set window flag and emit boot log to confirm patches active
// =====================================================================
(function v292Dfix17Marker(){
  if (window.__v292Dfix17Active) return;
  window.__v292Dfix17Active = true;
  try {
    console.log('[v292:Dfix17+18+19+20+21] patches active (fix16 quote-aware + local-antecedent guard, fix15 〝〟 + Pattern E/F/G/H [pronoun possessive], fix14 branch filter)');
  } catch(e){}
})();


// =====================================================================
// v292Dfix22 — avatar gender enforcement
// 問題: avatar 生成プロンプトで gender が反映されず、男性キャラに女性アイコンが付く。
// 原因:
//   1) avatarUrlLocal/genUrl が「gender === '男性' ? man : woman」で
//      gender 空時に女性 fallback
//   2) desc 本文に「謎多き女性」など gender 矛盾語が含まれると prompt に混入
//   3) 既存 c.avatar がセットされてると autofill は再生成しないため、
//      過去に作られた誤性別アイコンがそのまま残る
// 対策:
//   A. desc から性別矛盾語を全削除 (先頭の「性別:」prefix だけでなく body 内も)
//   B. gender token を "young man, male, masculine features" 等の3連で強化
//   C. window.__v292.avatarAutofill.genUrl / autofill を上書き
//   D. window.regenerateAvatars() で c.avatar を強制再生成する手段を提供
//   E. window.__v292.previewAvatarPrompt() で生成プロンプトを目視確認可
// =====================================================================
(function v292Dfix22(){
  if (window.__v292Dfix22Active) return;
  var TAG = '[v292Dfix22]';

  function genUrlV22(name, desc, gender){
    if (!name) return '';
    var isM = (gender === '男性');
    var isF = (gender === '女性');
    var prompt = 'anime portrait of ';
    if (isM)      prompt += 'a young man, male, masculine features, ';
    else if (isF) prompt += 'a young woman, female, feminine features, ';
    else          prompt += 'a young person, ';
    prompt += name + ', ';
    if (desc){
      var d = String(desc);
      // 「性別: 男性。」「性別:女」等を全位置で削除
      d = d.replace(/性別\s*[:：]\s*[男女][性]?[。、.]?/g, '');
      // gender と矛盾する語を削除
      if (isM){
        d = d.replace(/女性|女の子|女の人|お姉さん|お嬢様|お嬢|乙女/g, '');
      } else if (isF){
        d = d.replace(/男性|男の子|男の人|お兄さん|青年|少年|男児/g, '');
      }
      d = d.trim().slice(0, 80);
      if (d) prompt += d + ', ';
    }
    prompt += 'detailed face, dark fantasy, dramatic lighting, high quality';
    var seed = 0;
    for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
           '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
  }

  function autofillV22(opts){
    opts = opts || {};
    try {
      if (typeof S === 'undefined' || !S || !S.cast) return 0;
      var n = 0;
      function fillFor(c){
        if (!c || !c.name) return;
        if (opts.force || !c.avatar){
          var u = genUrlV22(c.name, c.desc || '', c.gender || '');
          if (u && u !== c.avatar){ c.avatar = u; n++; }
        }
      }
      if (S.cast.hero) fillFor(S.cast.hero);
      if (Array.isArray(S.cast.npcs)) S.cast.npcs.forEach(fillFor);
      if (n > 0){
        try { if (S.save) S.save(); } catch(e){}
        try { if (typeof UI !== 'undefined' && UI && typeof UI.renderAll === 'function') UI.renderAll(); } catch(e){}
      }
      return n;
    } catch(e){
      console.warn(TAG, 'autofill err:', e && e.message);
      return 0;
    }
  }

  // window.__v292.avatarAutofill が登録されたら上書き
  function install(){
    window.__v292 = window.__v292 || {};
    if (window.__v292.avatarAutofill){
      window.__v292.avatarAutofill.genUrl   = genUrlV22;
      window.__v292.avatarAutofill.autofill = autofillV22;
    } else {
      // fix11 がまだ初期化されてない場合 — 後で再試行
      setTimeout(install, 500);
      return;
    }
    // 強制再生成ヘルパー (Console から呼ぶ用)
    window.regenerateAvatars = function(){
      var changed = autofillV22({force: true});
      console.log(TAG, 'regenerated avatars:', changed);
      return changed;
    };
    // プロンプト確認用
    window.__v292.previewAvatarPrompt = function(name, desc, gender){
      return decodeURIComponent(genUrlV22(name, desc, gender).split('?')[0])
        .replace('https://image.pollinations.ai/prompt/', '');
    };
    window.__v292Dfix22Active = true;
    console.log(TAG, 'avatar gender enforcement installed.',
      'Call window.regenerateAvatars() to force-refresh existing avatars.');
  }
  install();
})();

/* v292Dfix23: Hermes JSON-mode sampling conservatization
 * response_format=json_object は既存実装だが、temperature 0.85 +
 * frequency/presence_penalty 0.4 では Hermes 4 が JSON 構文を時折破壊する。
 * Hermes 系 + json_object モード時のみ temperature=0.5, penalty=0 に下げる。
 */
(function(){
  if (window.__v292Dfix23Active) return;
  const origFetch = window.fetch;
  window.fetch = function(url, opts){
    try {
      if (typeof url === 'string' && url.indexOf('openrouter.ai') !== -1
          && opts && opts.body && typeof opts.body === 'string') {
        const b = JSON.parse(opts.body);
        if (b && b.model && /hermes/i.test(b.model)
            && b.response_format && b.response_format.type === 'json_object') {
          b.temperature = 0.5;
          b.frequency_penalty = 0;
          b.presence_penalty = 0;
          opts.body = JSON.stringify(b);
        }
      }
    } catch(e){}
    return origFetch.apply(this, arguments);
  };
  window.__v292Dfix23Active = true;
  console.log('[v292Dfix23] installed — Hermes JSON-mode sampling conservatized');
})();

/* v292Dfix24: Phase 1 — input atomization + psych profile injection
 * fix22/23 後の課題に対応 — narrative の没入感とキャラ固有性を高める。
 * Planner._userExtensions に push して user message に inputSeed と psychAnchors を追加、
 * Planner._extensions に push して system に「入力を種に展開する」枠組みを追記する。
 * 既存 Planner.build をラップせず、hook 配列のみ使う(wrap-detector 警告を出さない)。
 */
(function(){
  if (window.__v292Dfix24Active) return;
  window.Planner = window.Planner || {};
  Planner._userExtensions = Planner._userExtensions || [];
  Planner._extensions = Planner._extensions || [];

  // user side: enrich with input atomization + psych anchors
  Planner._userExtensions.push(function(ctx){
    try {
      const user = ctx.user;
      const state = ctx.state;
      if (typeof user !== 'string' || !user.trim().startsWith('{')) return user;
      const obj = JSON.parse(user);
      const input = obj.currentInput && obj.currentInput.text || '';
      const inputType = obj.currentInput && obj.currentInput.type || '';
      if (!input) return user;

      obj.inputSeed = {
        text: input,
        type: inputType,
        instruction: 'プレイヤー入力は物語の次の3秒の起点である。なぞり書き(同じ内容を別の表現で繰り返す/言い換え反復)は禁止。入力に含まれる動詞・身体動作・感情ヒントを「種」として、その直後のミクロな展開(0.5〜3秒の範囲)を超解像で描く。'
      };

      const hero = state && state.cast && state.cast.hero;
      const npcs = (state && state.cast && state.cast.npcs) || [];
      const anchors = [];
      if (hero && (hero.coreFear || hero.coreDesire || hero.wound)) {
        anchors.push({
          who: (hero.name || '主人公') + '(主人公)',
          coreFear: hero.coreFear || null,
          coreDesire: hero.coreDesire || null,
          wound: hero.wound || null
        });
      }
      npcs.forEach(function(n){
        if (n.coreFear || n.coreDesire || n.wound) {
          anchors.push({
            who: (n.name || 'NPC') + '(NPC)',
            coreFear: n.coreFear || null,
            coreDesire: n.coreDesire || null,
            wound: n.wound || null
          });
        }
      });
      if (anchors.length) {
        obj.psychAnchors = {
          note: '各キャラの恐怖・欲望・傷は narrative の地の文に間接的に滲ませる。クリシェ反応(鼓動が速まる/息を呑む/身体が冷える 等)ではなく、そのキャラ固有の身体記憶・連想・過去の傷との結びつきで表現する。',
          chars: anchors
        };
      }

      return JSON.stringify(obj, null, 2);
    } catch(e){
      console.warn('[v292Dfix24] user-ext err:', e && e.message);
      return ctx.user;
    }
  });

  // system side: input-as-seed framing (additive, short)
  Planner._extensions.push(function(ctx){
    try {
      const sys = ctx.sys;
      const addendum = '\n\n【入力を種に展開する(fix24)】\n' +
        '- プレイヤー入力(DO/SAY/STORY)は物語の次の3秒の起点である\n' +
        '- 入力テキストをなぞり書き(同じ内容の言い換え反復)せず、その直後のミクロな展開(0.5〜3秒範囲)を描く\n' +
        '- 入力中の動詞・身体動作・感情ヒントを素材として、その先の枝を広げる\n' +
        '【キャラ固有性(fix24)】\n' +
        '- user message の psychAnchors(各キャラの coreFear / coreDesire / wound)を毎ターン参照する\n' +
        '- 同じ恐怖/痛みの反応でも、キャラごとに表出は固有である(過去の傷や記憶想起と結びつけて描き分ける)';
      return sys + addendum;
    } catch(e){
      return ctx.sys;
    }
  });

  window.__v292Dfix24Active = true;
  console.log('[v292Dfix24] installed — input-as-seed + psych anchors active');
})();

/* v292Dfix25: Phase 2 — remove negative example section + positive framing
 * fix24 で入力素材分解と心理 anchor は注入できたが、system prompt 内の
 * 「お手本となる正しいnarrative出力例」セクションが文体テンプレートとして
 * Hermes に強く影響し、クリシェ(鼓動が速まる/モナリザの微笑/無機質な動作 等)
 * を再生産していた。このセクションを削除して positive framing に置換する。
 * 削除対象は例示セクションのみ。narrative 注意・言語制約・主人公ロック等は維持。
 */
(function(){
  if (window.__v292Dfix25Active) return;
  window.Planner = window.Planner || {};
  Planner._extensions = Planner._extensions || [];

  Planner._extensions.push(function(ctx){
    try {
      let sys = ctx.sys || '';
      const before = sys.length;
      sys = sys.replace(
        /【お手本となる正しいnarrative出力例】[\s\S]*?これと同じ品質でnarrativeを生成すること。/,
        ''
      );
      const removed = before - sys.length;

      const positive = '\n\n【表現の自由度(fix25)】\n' +
        '- narrative の文体・語彙・比喩・身体描写はモデルの判断に委ねる\n' +
        '- 慣用化された反応表現(鼓動が速まる/息を呑む/身体が冷える/モナリザの微笑/無機質な動作 等)に依存せず、別角度の感覚で表現する\n' +
        '- 五感の微細な変化、キャラ固有の過去/記憶/連想、環境との物理的接触の質感を、文ごとに別の組み合わせで選ぶ\n' +
        '- 1ターン内で同じ慣用句・同じ身体反応を繰り返さない(別の局面では別の表現を選ぶ)\n' +
        '- narrative の各文は完結し、自然な文末で終わること(これは引き続き守る)';

      if (removed > 0) {
        console.log('[v292Dfix25] removed example section, ' + removed + ' bytes');
      } else {
        console.warn('[v292Dfix25] example section not found, only adding positive framing');
      }
      return sys + positive;
    } catch(e){
      console.warn('[v292Dfix25] err:', e && e.message);
      return ctx.sys;
    }
  });

  window.__v292Dfix25Active = true;
  console.log('[v292Dfix25] installed — example section removed, positive framing added');
})();

/* v292Dfix26: Phase 3 — dialogue schema extension + dedup guard
 * fix24/25 で narrative の品質と没入感は大幅改善。残る問題:
 *   1. 会話ログの speaker が ? になることがある(pronoun resolver の限界)
 *   2. 同一台詞が複数回出ることがある
 * 根本対策として narrative element に object 形式 {type, speaker, text} を許容、
 * Hermes が speaker を明示すれば原理的に解決する。
 * 既存の文字列形式も完全サポート(後方互換)。
 * parse 側で object → '<speaker>「<text>」' 文字列化 + 完全一致重複を dedup。
 * _structuredNarrative に構造化版を保存(将来 UI が直接読める)。
 */
(function(){
  if (window.__v292Dfix26Active) return;
  window.Planner = window.Planner || {};
  Planner._extensions = Planner._extensions || [];
  Planner._parseExtensions = Planner._parseExtensions || [];

  // 1. system side: schema 拡張の指示
  Planner._extensions.push(function(ctx){
    try {
      const addendum = '\n\n【dialogue 構造化スキーマ(fix26)】\n' +
        '- narrative 配列の各要素は次のどちらかでよい:\n' +
        '  - 文字列(従来形式の地の文)\n' +
        '  - オブジェクト: {"type":"dialogue", "speaker":"<キャラ名(主人公名 または NPC 名)>", "text":"<台詞のみ。鉤括弧不要>"}\n' +
        '- 「誰が話したか曖昧」になる台詞は必ず dialogue オブジェクトで返し、speaker を明示する\n' +
        '- 地の文に含めるセリフ(動作と一体化した台詞)は従来通り文字列内に「…」で記述してよい\n' +
        '- 1ターン内で同じ台詞(text 完全一致)を繰り返さない';
      return ctx.sys + addendum;
    } catch(e) { return ctx.sys; }
  });

  // 2. parse side: object 要素を文字列化 + 重複ガード
  Planner._parseExtensions.push(function(plan, meta){
    try {
      if (!plan || !Array.isArray(plan.narrative)) return plan;
      const seenText = new Set();
      const out = [];
      const structured = [];
      plan.narrative.forEach(function(el){
        if (el == null) return;
        if (typeof el === 'string') {
          const norm = el.trim();
          if (!norm) return;
          if (seenText.has(norm)) {
            console.log('[v292Dfix26] dedup string:', norm.slice(0,30));
            return;
          }
          seenText.add(norm);
          out.push(el);
          structured.push({type:'prose', text: el});
        } else if (typeof el === 'object') {
          const type = el.type || '';
          const speaker = (el.speaker || '').trim();
          const text = (el.text || '').trim();
          if (!text) return;
          if (seenText.has(text)) {
            console.log('[v292Dfix26] dedup dialogue:', text.slice(0,30));
            return;
          }
          seenText.add(text);
          if (type === 'dialogue' && speaker) {
            out.push(speaker + '「' + text + '」');
            structured.push({type:'dialogue', speaker: speaker, text: text});
          } else if (type === 'dialogue') {
            out.push('「' + text + '」');
            structured.push({type:'dialogue', speaker: null, text: text});
          } else {
            out.push(text);
            structured.push({type:'prose', text: text});
          }
        }
      });
      plan.narrative = out;
      plan._structuredNarrative = structured;
      return plan;
    } catch(e) {
      console.warn('[v292Dfix26] parse ext err:', e && e.message);
      return plan;
    }
  });

  window.__v292Dfix26Active = true;
  console.log('[v292Dfix26] installed — dialogue schema extension + dedup active');
})();

/* v292Dfix27: Phase 4 — vocative/dedup/STORY-quote correction + cross-turn cliche/verbatim guard
 * fix26 後の実機テストで残る課題:
 *   C-1 自名 vocative の speaker 入れ替え (例: セイラ「セイラ！」)
 *   C-2 正規化不足で素通りする重複登録 (text 揺れで素通り)
 *   C-3 STORY 入力に含まれる「」が新規 speaker として昇格してしまう
 *   M-1 pronoun antecedent が同性最寄り選択で誤マッチ
 *   M-2 動的挿入された dialogue card で avatar autofill が発火しない
 *   M-3 fix25 で除いたクリシェがまだ出る
 *   M-4 同一文 verbatim の複数ターン再出力
 *   M-5 やり直す経路でも同種バグが再発
 * Planner._extensions / _userExtensions / _parseExtensions + 単独 MutationObserver で処理。
 * Planner.build はラップしない(既存原則維持)。後方互換 OK。
 */
(function(){
  if (window.__v292Dfix27Active) return;
  var TAG = '[v292Dfix27]';
  window.Planner = window.Planner || {};
  Planner._extensions = Planner._extensions || [];
  Planner._userExtensions = Planner._userExtensions || [];
  Planner._parseExtensions = Planner._parseExtensions || [];

  if (!window.__v292Dfix27History) {
    window.__v292Dfix27History = { lines: [], cap: 60 };
  }

  // 1. SYSTEM-SIDE: C-1 / C-3 / M-1 / M-3 / M-4 を予防
  Planner._extensions.push(function(ctx){
    try {
      var addendum =
        '\n\n【vocative 区別 (fix27 C-1)】\n' +
        '- speaker の text は「呼びかけ」と「発話」を厳格に区別する\n' +
        '- speaker 自身の名前で text が始まる場合(例: セイラ「セイラ！」)は\n' +
        '  vocative の誤帰属である。その台詞は「呼ばれる側」ではなく「呼びかける側」を speaker にする\n' +
        '- 自分で自分の名前を呼ぶ dialogue オブジェクトは作らない\n' +
        '【STORY 入力内の「」(fix27 C-3)】\n' +
        '- user message 内 currentInput.type === "STORY" の場合、その text に含まれる\n' +
        '  「…」はナレーションの一部であり、新規 dialogue として抽出しない\n' +
        '- STORY 内の「」内テキストや任意フレーズを speaker name に昇格させてはならない\n' +
        '- speaker が cast.hero/npcs.name のいずれにも一致しない値になる場合は dialogue を作らず prose に流す\n' +
        '【pronoun 禁止 (fix27 M-1)】\n' +
        '- dialogue.speaker フィールドには代名詞(彼/彼女/少女/少年/あの男/あの女 等)を入れない\n' +
        '- 必ず cast に登録された固有名詞を入れる\n' +
        '- 地の文で代名詞を使った直後の dialogue は、直前文の動作主体(主語)と一致させる\n' +
        '【cliche 強化 (fix27 M-3)】\n' +
        '- 次の慣用表現は使用禁止: 鼓動が速[くまっ]/息を呑[んみ]/身体が冷え/体が冷え/\n' +
        '  モナリザの(微笑|笑み)/無機質な(動作|表情|声)/何かが弾けた/目を見開いた/\n' +
        '  ぞくりとした/背筋が凍/声にならない悲鳴/空気が凍/時が止ま\n' +
        '- 同等の心理描写は別語彙・別アングル(具体的身体部位/環境物質との接触/過去想起 等)で書く\n' +
        '【verbatim 反復禁止 (fix27 M-4)】\n' +
        '- 直前 2 ターンと同一の文(完全一致 or 句読点・空白を除いて一致)を再出力しない\n' +
        '- 象徴的フレーズ(モナリザ/触手/海/夕暮れ 等)を 2 ターンに 1 回より高頻度で使わない';
      return ctx.sys + addendum;
    } catch(e) { return ctx.sys; }
  });

  // 2. USER-SIDE: STORY 入力にメタを付与 (C-3)
  Planner._userExtensions.push(function(ctx){
    try {
      var user = ctx.user;
      if (typeof user !== 'string' || !user.trim().startsWith('{')) return user;
      var obj = JSON.parse(user);
      var ci = obj.currentInput || {};
      var text = ci.text || '';
      var type = (ci.type || '').toUpperCase();
      if (type === 'STORY' && /「[^」]*」/.test(text)) {
        obj.storyQuoteNote = {
          warning: 'currentInput.text は STORY 種別。内部の「…」はナレーションの一部であり、新規 dialogue speaker として抽出してはならない。speaker は必ず cast 既存名と一致させること。'
        };
      }
      return JSON.stringify(obj);
    } catch(e){
      console.warn(TAG, 'user-ext err:', e && e.message);
      return ctx.user;
    }
  });

  // 3. PARSE-SIDE: 後段補正
  function castNamesFromState(){
    try {
      var st = (typeof S !== 'undefined' && S) ? S
            : (typeof window !== 'undefined' && window.S) ? window.S : null;
      if (!st || !st.cast) return [];
      var out = [];
      if (st.cast.hero && st.cast.hero.name) out.push(st.cast.hero.name);
      if (Array.isArray(st.cast.npcs)) st.cast.npcs.forEach(function(n){
        if (n && n.name) out.push(n.name);
      });
      return out;
    } catch(_){ return []; }
  }
  var PRONOUNS = ['彼','彼女','少女','少年','あの男','あの女','あの少女','あの少年'];
  function isPronoun(s){
    if (!s) return false;
    var t = String(s).trim();
    return PRONOUNS.indexOf(t) >= 0;
  }
  function extractSubject(proseText, knownNames){
    if (!proseText || !knownNames || !knownNames.length) return '';
    for (var i = knownNames.length - 1; i >= 0; i--){
      var nm = knownNames[i];
      var re = new RegExp(nm + '(は|が|の|を|に|へ|と)');
      if (re.test(proseText)) return nm;
    }
    return '';
  }
  function isSelfVocative(speaker, text){
    if (!speaker || !text) return false;
    var s = String(speaker).trim();
    var t = String(text).trim();
    if (t.indexOf(s) !== 0) return false;
    var rest = t.slice(s.length);
    return /^[！!?？…・、\s　]/.test(rest) || rest === '';
  }
  function normText(t){
    return String(t || '')
      .replace(/[\s　]+/g, '')
      .replace(/[！!?？.,、。…・「」『』]+/g, '')
      .toLowerCase();
  }
  var CLICHES = [
    /鼓動が速[くまっ]/,
    /息を呑[んみ]/,
    /身体が冷え/,
    /体が冷え/,
    /モナリザの(微笑|笑み)/,
    /無機質な(動作|表情|声)/,
    /何かが弾けた/,
    /背筋が凍/,
    /声にならない悲鳴/,
    /空気が凍/,
    /時が止ま/,
    /ぞくりとした/,
    /目を見開いた/
  ];
  function isCliche(text){
    if (!text) return false;
    var s = String(text);
    for (var i=0;i<CLICHES.length;i++){
      if (CLICHES[i].test(s)) return true;
    }
    return false;
  }

  Planner._parseExtensions.push(function(plan, meta){
    try {
      if (!plan) return plan;
      var structured = Array.isArray(plan._structuredNarrative) ? plan._structuredNarrative : null;
      if (!structured && Array.isArray(plan.narrative)){
        structured = plan.narrative.map(function(el){
          if (typeof el === 'string') return { type: 'prose', text: el };
          if (el && typeof el === 'object') return el;
          return null;
        }).filter(Boolean);
      }
      if (!structured) return plan;

      var names = castNamesFromState();
      var history = (window.__v292Dfix27History && window.__v292Dfix27History.lines) || [];

      var seenNorm = {};
      var prevProse = '';
      var fixed = [];
      var counts = { vocFix:0, dedup:0, cliche:0, verbatim:0, pronounFix:0, storyDrop:0 };

      structured.forEach(function(el){
        if (!el || typeof el !== 'object') return;
        var type = el.type || '';
        var speaker = (el.speaker || '').trim();
        var text = (el.text || '').trim();

        if (type === 'dialogue'){
          if (!text) return;

          // C-3 残処理: speaker が cast にも代名詞にも一致しない場合は prose に格下げ
          if (speaker && names.length && names.indexOf(speaker) < 0 && !isPronoun(speaker)){
            counts.storyDrop++;
            type = 'prose';
            text = speaker + '「' + text + '」';
            speaker = '';
          }

          // M-1: pronoun in speaker
          if (type === 'dialogue' && isPronoun(speaker)){
            var resolved = extractSubject(prevProse, names);
            if (resolved){
              counts.pronounFix++;
              speaker = resolved;
            }
          }

          // C-1: self-vocative
          if (type === 'dialogue' && speaker && names.indexOf(speaker) >= 0 && isSelfVocative(speaker, text)){
            var altNames = names.filter(function(n){ return n !== speaker; });
            var alt = extractSubject(prevProse, altNames);
            if (!alt){
              for (var i=fixed.length-1;i>=0;i--){
                if (fixed[i].type === 'dialogue' && fixed[i].speaker && fixed[i].speaker !== speaker){
                  alt = fixed[i].speaker; break;
                }
              }
            }
            counts.vocFix++;
            speaker = alt || '';
          }

          if (type === 'dialogue'){
            if (isCliche(text)){ counts.cliche++; return; }
            var nk = normText(text);
            var k1 = (speaker||'')+'|'+nk;
            var k2 = 'd|'+nk;
            if (seenNorm[k1] || seenNorm[k2]){ counts.dedup++; return; }
            seenNorm[k1] = 1; seenNorm[k2] = 1;
            if (history.indexOf(nk) >= 0){ counts.verbatim++; return; }
            fixed.push({ type:'dialogue', speaker: speaker, text: text });
            return;
          }
        }

        // prose (元 prose または C-3 格下げ)
        if (!text) return;
        if (isCliche(text)){ counts.cliche++; return; }
        var pk = normText(text);
        if (seenNorm['p|'+pk]){ counts.dedup++; return; }
        seenNorm['p|'+pk] = 1;
        if (history.indexOf(pk) >= 0){ counts.verbatim++; return; }
        fixed.push({ type:'prose', text: text });
        prevProse = text;
      });

      plan.narrative = fixed.map(function(el){
        if (el.type === 'dialogue'){
          return el.speaker ? (el.speaker + '「' + el.text + '」') : ('「' + el.text + '」');
        }
        return el.text;
      });
      plan._structuredNarrative = fixed;

      try {
        var hist = window.__v292Dfix27History.lines;
        fixed.forEach(function(el){ hist.push(normText(el.text)); });
        var cap = window.__v292Dfix27History.cap || 60;
        if (hist.length > cap) hist.splice(0, hist.length - cap);
      } catch(_){}

      if (counts.vocFix||counts.dedup||counts.cliche||counts.verbatim||counts.pronounFix||counts.storyDrop){
        console.log(TAG, 'corrections:', counts);
      }
    } catch(e){
      console.warn(TAG, 'parse-ext err:', e && e.message);
    }
    return plan;
  });

  // 4. AVATAR MUTATION OBSERVER (M-2)
  function installAvatarObserver(){
    try {
      function runFill(){
        try {
          var aaf = window.__v292 && window.__v292.avatarAutofill;
          if (aaf && typeof aaf.autofill === 'function') aaf.autofill();
        } catch(_){}
      }
      var target = document.body;
      if (!target || !window.MutationObserver) return false;
      if (window.__v292Dfix27Observer) return true;
      var pending = null;
      var obs = new MutationObserver(function(muts){
        var any = false;
        for (var i=0;i<muts.length && !any;i++){
          var m = muts[i];
          if (m.addedNodes && m.addedNodes.length){
            for (var j=0;j<m.addedNodes.length;j++){
              var n = m.addedNodes[j];
              if (n && n.nodeType === 1){
                var cls = (n.className && typeof n.className==='string')?n.className:'';
                if (/(dialogue|speaker|chat|log|message|card|avatar)/i.test(cls) ||
                    (n.querySelector && n.querySelector('[class*="speaker"],[class*="avatar"],[class*="dialogue"]'))){
                  any = true; break;
                }
              }
            }
          }
        }
        if (any){
          if (pending) return;
          pending = setTimeout(function(){ pending = null; runFill(); }, 80);
        }
      });
      obs.observe(target, { childList:true, subtree:true });
      window.__v292Dfix27Observer = obs;
      console.log(TAG, 'avatar MutationObserver installed');
      return true;
    } catch(e){
      console.warn(TAG, 'observer err:', e && e.message);
      return false;
    }
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', installAvatarObserver, { once:true });
  } else {
    installAvatarObserver();
  }

  // 5. M-5: retry path stability — hooks are idempotent and on Planner.build path
  window.__v292Dfix27Active = true;
  console.log(TAG, 'installed — C-1/C-2/C-3/M-1..M-5 corrections active');
})();
/* v292Dfix28: Bug 1 (target-indicator-aware speaker resolver) + Bug 2 (読点 dedup hint)
 * 観察された症状:
 *   B-1 narrative の「Aは...Bに向けて...動詞」構文の後の dialogue が
 *       B(target=受け手) を speaker として登録される (本来は A=主体)
 *       例: 「レナは、かすかな笑みを、カエデに向けて、浮かべた」
 *            → 「やっと、会えたね」の speaker が カエデ(誤) → レナ(正) であるべき
 *   B-2 narrative の文体が読点(、) 過多で不自然
 *       例: 「彼女の目は、カエデのものと、廊下の先で、ふと、合った」(読点 4 個)
 *
 * 対策:
 *   1. Planner._extensions に system prompt addendum を追加
 *      - subject/target 区別ガイド + NG/OK 例示
 *      - 読点制御 NG/OK 例示
 *   2. Planner._parseExtensions に後段補正 IIFE を push (fix27 の後に実行)
 *      - prevProse から target indicator(「に向けて」「を見て」等) を検出
 *      - speaker がそのフレーズの target に該当する場合、prevProse から
 *        真の subject 候補(は/が マーカー優先) を探して speaker を補正
 *      - 読点 ratio が高い narrative line を console.warn (post-process 監視)
 *
 * 設計原則:
 *   - __v292Dfix28Active フラグで二重 install 防止
 *   - fix27 と非競合: fix28 は fix27 が処理した後の _structuredNarrative を読む
 *   - prose 文体は変更しない (Bug 2 は監視 + prompt hint のみ)
 *   - speaker 補正は cast名→cast名 の置換のみ。pronoun resolver(fix15/27) と非競合
 */
(function v292Dfix28(){
  if (window.__v292Dfix28Active) return;
  var TAG = '[v292Dfix28]';
  window.Planner = window.Planner || {};
  Planner._extensions = Planner._extensions || [];
  Planner._userExtensions = Planner._userExtensions || [];
  Planner._parseExtensions = Planner._parseExtensions || [];

  // ---- target indicator パターン (particle + verb stem) ----
  // prose 中に <name>+<particle>+(任意読点)+<verb stem> の形で現れたら、name は target(受け手)
  // 例: "カエデに向けて" / "カエデに、向けて" / "カエデを見つめた" / "カエデの肩を叩いた"
  var TARGET_PATTERNS = [
    ['に', ['向けて','向かって','向き','対して','対し','呼びかけ','声をかけ','話しかけ','問いかけ','語りかけ','囁','微笑']],
    ['を', ['見て','見つめ','見据え','見上げ','見下ろし','覗き込','抱き','抱え','引き寄せ']],
    ['の', ['目を見','顔を見','方を見','方を向','方向を','手を取','肩を','腕を','頬に','額に','名を呼']]
  ];

  function castNames(){
    try {
      var st = (typeof S !== 'undefined' && S) ? S
            : (typeof window !== 'undefined' && window.S) ? window.S : null;
      if (!st || !st.cast) return [];
      var out = [];
      if (st.cast.hero && st.cast.hero.name) out.push(String(st.cast.hero.name).trim());
      if (Array.isArray(st.cast.npcs)) st.cast.npcs.forEach(function(n){
        if (n && n.name) out.push(String(n.name).trim());
      });
      return out.filter(function(n){ return !!n; });
    } catch(_){ return []; }
  }

  function escRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function isTargetOfPhrase(prose, name){
    if (!prose || !name) return false;
    var nm = escRe(name);
    for (var i = 0; i < TARGET_PATTERNS.length; i++){
      var particle = TARGET_PATTERNS[i][0];
      var verbs = TARGET_PATTERNS[i][1];
      for (var j = 0; j < verbs.length; j++){
        var pat = new RegExp(nm + escRe(particle) + '[、,\\s　]{0,3}' + escRe(verbs[j]));
        if (pat.test(prose)) return true;
      }
    }
    return false;
  }

  function findSubjectCandidate(prose, names){
    if (!prose || !names || !names.length) return '';
    // Priority 1: name+は (topic marker)
    for (var i = 0; i < names.length; i++){
      var n = names[i];
      if (new RegExp(escRe(n) + 'は').test(prose) && !isTargetOfPhrase(prose, n)) return n;
    }
    // Priority 2: name+が (subject marker)
    for (var j = 0; j < names.length; j++){
      var n2 = names[j];
      if (new RegExp(escRe(n2) + 'が').test(prose) && !isTargetOfPhrase(prose, n2)) return n2;
    }
    // Priority 3: any name not in target position
    for (var k = 0; k < names.length; k++){
      var n3 = names[k];
      if (prose.indexOf(n3) >= 0 && !isTargetOfPhrase(prose, n3)) return n3;
    }
    return '';
  }

  // ---- 1. SYSTEM-SIDE: prompt addendum ----
  function sysExt(ctx){
    try {
      var add =
        '\n\n【subject/target 区別 (fix28 Bug-1)】\n' +
        '- 地の文(prose)で動作を描く時、subject(動作主) と target(対象/受け手) を厳格に区別する\n' +
        '- 構文「Aは…Bに向けて/に対して/を見て/を見つめて/に呼びかけて…動詞」では\n' +
        '  A が動作主体である。B は受け手・対象であって動作主ではない\n' +
        '- 直後の dialogue の speaker は A(主体) を選ぶこと。B(対象) を speaker にしない\n' +
        '- 例: 「レナは、笑みをカエデに向けて浮かべた。」→ 直後の台詞 speaker は レナ\n' +
        '       「カエデは、レナの目を見つめた。」→ 直後の台詞 speaker は カエデ\n' +
        '【日本語の読点制御 (fix28 Bug-2)】\n' +
        '- 読点(、) の多用を避け、自然な日本語の文章で書く\n' +
        '- 1 文に読点を 3 個以上連続で使わない\n' +
        '- 短いフレーズや修飾語を区切るために読点を入れない\n' +
        '- NG例: 「彼女の目は、カエデのものと、廊下の先で、ふと、合った。」(読点 4 個 = 過剰)\n' +
        '- OK例: 「彼女の目がカエデのそれと、廊下の先で重なった。」(読点 1 個 = 自然)\n' +
        '- NG例: 「レナは、かすかな笑みを、カエデに向けて、浮かべた。」(読点 3 個 = 装飾過剰)\n' +
        '- OK例: 「レナはかすかな笑みをカエデに向けて浮かべた。」(読点 0 個 = 簡潔)\n' +
        '- 文学的効果を狙う場合でも、意味の区切りでのみ読点を使う';
      return ctx.sys + add;
    } catch(e){ return ctx.sys; }
  }
  if (!Planner._extensions.__v292Dfix28){
    Planner._extensions.push(sysExt);
    Planner._extensions.__v292Dfix28 = true;
  }

  // ---- 2. PARSE-SIDE: 後段補正 (fix27 の後で動く) ----
  function parseExt(plan, ctx){
    try {
      if (!plan) return plan;
      var structured = plan._structuredNarrative;
      if (!Array.isArray(structured)) return plan;
      var names = castNames();
      if (!names.length) return plan;

      var prevProse = '';
      var corrections = 0;
      var rebuilt = structured.map(function(el){
        if (!el || typeof el !== 'object') return el;
        if (el.type === 'prose'){
          prevProse = (el.text || '').trim();
          return el;
        }
        if (el.type !== 'dialogue') return el;
        if (!prevProse) return el;
        var speaker = (el.speaker || '').trim();
        if (!speaker || names.indexOf(speaker) < 0) return el;
        // speaker が prevProse の target 位置にあるか
        if (!isTargetOfPhrase(prevProse, speaker)) return el;
        // 真の subject を探す
        var candidate = findSubjectCandidate(prevProse, names);
        if (!candidate || candidate === speaker) return el;
        console.log(TAG, 'target->subject correction: "' + speaker + '" -> "' + candidate +
                    '" (prose: ' + prevProse.slice(0, 60) + '...)');
        corrections++;
        return { type: 'dialogue', speaker: candidate, text: el.text };
      });

      if (corrections > 0){
        plan._structuredNarrative = rebuilt;
        plan.narrative = rebuilt.map(function(el){
          if (el && el.type === 'dialogue'){
            return el.speaker ? (el.speaker + '「' + el.text + '」') : ('「' + el.text + '」');
          }
          return el && el.text;
        }).filter(function(x){ return x != null; });
        console.log(TAG, 'speaker corrections applied:', corrections);
      }

      // Bug-2 monitor: warn lines with too many 読点 (no rewrite)
      if (Array.isArray(plan.narrative)){
        var heavy = 0;
        plan.narrative.forEach(function(line, idx){
          if (typeof line !== 'string') return;
          var commas = (line.match(/、/g) || []).length;
          var chars = line.length;
          if (chars > 20 && commas >= 3 && (commas / chars) > 0.05){
            heavy++;
            if (heavy <= 3){
              console.warn(TAG, '読点過多 line ' + idx + ' (commas=' + commas + ', chars=' + chars + '):',
                line.slice(0, 80));
            }
          }
        });
        if (heavy > 0){
          console.log(TAG, '読点過多 lines total:', heavy, '(prompt addendum will improve next turns)');
        }
      }
    } catch(e){
      console.warn(TAG, 'parse-ext err:', e && e.message);
    }
    return plan;
  }
  if (!Planner._parseExtensions.__v292Dfix28){
    Planner._parseExtensions.push(parseExt);
    Planner._parseExtensions.__v292Dfix28 = true;
  }

  // 定期再 install (fix14 系と同様、Planner._parseExtensions が replace された時の保険)
  setInterval(function(){
    try {
      if (Array.isArray(Planner._extensions) && !Planner._extensions.__v292Dfix28){
        Planner._extensions.push(sysExt);
        Planner._extensions.__v292Dfix28 = true;
        console.log(TAG, 'sysExt reinstalled');
      }
      if (Array.isArray(Planner._parseExtensions) && !Planner._parseExtensions.__v292Dfix28){
        Planner._parseExtensions.push(parseExt);
        Planner._parseExtensions.__v292Dfix28 = true;
        console.log(TAG, 'parseExt reinstalled');
      }
    } catch(_){}
  }, 3000);

  window.__v292Dfix28Active = true;
  console.log(TAG, 'installed - target-indicator speaker resolver + 読点 dedup hint active');
})();

/* v292Dfix29: post-quote「Q」と<NAME>(は|が)<verb> attribution fixer
 *
 * 観察された症状:
 *   narrative: 「ど、どこから……？」とサクラが呟く。
 *   会話ログ: フィオナ「ど、どこから……？」 (誤)
 *   期待:    サクラ「ど、どこから……？」
 *
 * 真の原因 (features.js 構造解析):
 *   extractDialoguesEnhanced 内の Pattern E (line 3661) は
 *     [「『〝]QUOTE[」』〟]\s*NAME(は|が)...verb
 *   で が-particle を catch するが、quote と NAME の間に "と" が入る場合
 *   \s* が許容してないため match しない。
 *   Pattern G (line 3687) は \s*と?\s* を許容するが (の|から) 限定で、
 *   (は|が) は対象外。
 *   結果、Pattern C fallback で preContext の最後の cast 名(別キャラ)を
 *   speaker として拾ってしまう。
 *
 * 対策:
 *   UI._renderHooks に fix29 hook を push (fix15 dialogueLayoutHookV15 の後ろ)。
 *   fix15 が dialogue cards を生成した後、DOM を sweep し、
 *   narrative を再 parse して "「Q」と<NAME>(は|が)<verb>" を catch、
 *   dialogue cards の speaker/avatar/hero-card class を訂正する。
 *
 * 設計原則:
 *   - __v292Dfix29Active フラグで二重 install 防止
 *   - fix15/fix17 の hook を破壊しない (push のみ、削除なし)
 *   - DOM 更新のみ (extractDialoguesEnhanced は touch しない)
 *   - 3 秒ごとの periodic re-install で UI._renderHooks が replace された時の保険
 *   - fix28 と非競合: fix28 は target-indicator (異なるパターン)
 */
(function v292Dfix29(){
  if (window.__v292Dfix29Active) return;
  var TAG = '[v292Dfix29]';

  function escRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function castInfo(){
    try {
      var st = (typeof S !== 'undefined' && S) ? S
            : (typeof window !== 'undefined' && window.S) ? window.S : null;
      if (!st || !st.cast) return { names: [], hero: null, members: [] };
      var members = [];
      if (st.cast.hero && st.cast.hero.name) members.push(st.cast.hero);
      if (Array.isArray(st.cast.npcs)) {
        st.cast.npcs.forEach(function(n){ if (n && n.name) members.push(n); });
      }
      return {
        names: members.map(function(m){ return String(m.name).trim(); }).filter(function(n){ return !!n; }),
        hero: st.cast.hero || null,
        members: members
      };
    } catch(_){ return { names: [], hero: null, members: [] }; }
  }

  // 「Q」と<NAME>(は|が)<verb> パターンを catch
  function extractToParticleAttributions(src, names){
    if (!src || !names || !names.length) return [];
    var namePat = names.map(escRe).join('|');
    var SPEAK_VERBS = '言|答|応|呟|尋|叫|呼|笑|囁|返|促|命|問|怒鳴|喚|発|告|漏|諭|頷|拒|嘆|溜|呻|喘';
    var rxE2 = new RegExp(
      '[「『〝]([^」』〟]+?)[」』〟]\\s*と\\s*[、,。]?\\s*(' + namePat + ')(?:は|が)(?:[^。]{0,40})?(?:' + SPEAK_VERBS + ')',
      'g'
    );
    var out = [];
    var m;
    while ((m = rxE2.exec(src))){
      out.push({ text: (m[1] || '').trim(), speaker: (m[2] || '').trim() });
    }
    return out;
  }

  // narrative (string | array) を全部走査して { text: speaker } map を返す
  function buildCorrectionMap(narrative, names){
    var srcs = [];
    if (typeof narrative === 'string') srcs.push(narrative);
    else if (Array.isArray(narrative)) {
      for (var i = 0; i < narrative.length; i++){
        var n = narrative[i];
        if (typeof n === 'string') srcs.push(n);
        else if (n && typeof n === 'object' && typeof n.text === 'string') srcs.push(n.text);
      }
    }
    var map = {};
    for (var k = 0; k < srcs.length; k++){
      var matches = extractToParticleAttributions(srcs[k], names);
      for (var j = 0; j < matches.length; j++){
        if (matches[j].text && matches[j].speaker){
          map[matches[j].text] = matches[j].speaker;
        }
      }
    }
    return map;
  }

  // DOM の dialogue cards を sweep して訂正
  function fixDomCards(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return 0;
    var ci = castInfo();
    if (!ci.names.length) return 0;
    var st = (typeof S !== 'undefined' && S) ? S
          : (typeof window !== 'undefined' && window.S) ? window.S : null;
    if (!st || !st.turns) return 0;

    // 全 turn の narrative から global correction map を構築
    var globalMap = {};
    for (var ti = 0; ti < st.turns.length; ti++){
      var t = st.turns[ti];
      if (!t || !t.narrative) continue;
      var tm = buildCorrectionMap(t.narrative, ci.names);
      for (var key in tm){
        if (Object.prototype.hasOwnProperty.call(tm, key)){
          globalMap[key] = tm[key];
        }
      }
    }

    var corrections = 0;
    var cards = stream.querySelectorAll('.v292-dlg-card');
    for (var i = 0; i < cards.length; i++){
      var card = cards[i];
      var textEl = card.querySelector('.dlg-text');
      var nameEl = card.querySelector('.dlg-name');
      if (!textEl || !nameEl) continue;
      var text = (textEl.textContent || '').trim();
      var currentSpeaker = (nameEl.textContent || '').trim();
      var correctSpeaker = globalMap[text];
      if (!correctSpeaker || currentSpeaker === correctSpeaker) continue;

      // 訂正: name 表示
      nameEl.textContent = correctSpeaker;

      // 訂正: avatar
      var img = card.querySelector('.dlg-av img');
      var avatarDiv = card.querySelector('.dlg-av');
      var newAvatarUrl = null;
      for (var mi = 0; mi < ci.members.length; mi++){
        if (ci.members[mi].name === correctSpeaker && ci.members[mi].avatar){
          newAvatarUrl = ci.members[mi].avatar;
          break;
        }
      }
      if (img && newAvatarUrl){
        img.src = newAvatarUrl;
        img.alt = correctSpeaker;
      } else if (avatarDiv && newAvatarUrl){
        avatarDiv.innerHTML = '<img src="' + newAvatarUrl + '" alt="' + correctSpeaker +
          '" loading="lazy" onerror="this.parentNode.textContent=String.fromCharCode(63)">';
      } else if (img){
        img.alt = correctSpeaker;
      }

      // 訂正: hero-card class
      var isHero = !!(ci.hero && ci.hero.name === correctSpeaker);
      if (isHero) card.classList.add('hero-card');
      else card.classList.remove('hero-card');

      console.log(TAG, 'と+(は|が) correction: "' + currentSpeaker + '" -> "' +
        correctSpeaker + '" for text "' + text.slice(0, 30) + '"');
      corrections++;
    }

    if (corrections > 0){
      console.log(TAG, 'corrections applied:', corrections);
    }
    return corrections;
  }

  function getUIRef(){
    try {
      var U = (0, eval)('typeof UI !== "undefined" ? UI : null');
      return U;
    } catch(_){ return null; }
  }

  function installHook(){
    var UI = getUIRef();
    if (!UI || !Array.isArray(UI._renderHooks)) return false;
    if (UI._renderHooks.__v292Dfix29) return true;
    UI._renderHooks.push(function dialogueLayoutHookV29(){
      try { fixDomCards(); }
      catch(e){ console.warn(TAG, 'hook err:', e && e.message); }
    });
    UI._renderHooks.__v292Dfix29 = true;
    return true;
  }

  function init(){
    var ok = installHook();
    if (!ok){
      var tries = 0;
      var iv = setInterval(function(){
        tries++;
        if (installHook()){
          clearInterval(iv);
          // initial sweep (in case render already happened)
          try { fixDomCards(); } catch(_){}
          window.__v292Dfix29Active = true;
          console.log(TAG, 'installed (deferred ' + tries + ' tries) - post-quote と+(は|が) attribution active');
        } else if (tries > 50){
          clearInterval(iv);
          console.warn(TAG, 'install gave up after 50 tries (UI._renderHooks not found)');
        }
      }, 200);
      return;
    }
    // initial sweep
    try { fixDomCards(); } catch(_){}
    window.__v292Dfix29Active = true;
    console.log(TAG, 'installed - post-quote と+(は|が) attribution active');
  }

  // 定期再 install (UI._renderHooks が replace された時の保険)
  setInterval(function(){
    try {
      var UI = getUIRef();
      if (UI && Array.isArray(UI._renderHooks) && !UI._renderHooks.__v292Dfix29){
        UI._renderHooks.push(function dialogueLayoutHookV29(){
          try { fixDomCards(); }
          catch(e){ console.warn(TAG, 'hook err:', e && e.message); }
        });
        UI._renderHooks.__v292Dfix29 = true;
        console.log(TAG, 'hook reinstalled');
      }
    } catch(_){}
  }, 3000);

  // 検証用 API
  window.__v292Dfix29 = {
    fixDomCards: fixDomCards,
    buildCorrectionMap: buildCorrectionMap,
    extractToParticleAttributions: extractToParticleAttributions
  };

  init();
})();

/* v292Dfix29b: ensure fix29 catches initial render via MutationObserver
 *
 * 観察された問題 (fix29 deploy 後):
 *   ページ初回ロード時、fix15 の renderStreamV15 が fix29 の hook install より
 *   早く dialogue cards を render するケースで、fix29 の auto-sweep が空打ちになり、
 *   ユーザーが UI action (turn 進行等) するまで誤帰属が画面に残る。
 *
 * 対策:
 *   #dialogue-stream に MutationObserver を install し、cards 追加 (childList) を
 *   catch したら window.__v292Dfix29.fixDomCards() を実行。
 *   fix29 の DOM 訂正 (textContent 変更, classList toggle, img.src/alt 変更, 内部
 *   innerHTML on .dlg-av) は #dialogue-stream 自体の childList に影響しないので
 *   feedback loop は発生しない。
 *   加えて、install 後に setTimeout (+200/+800/+2000ms) で delayed sweep を実行
 *   (observer install 自体が遅延するケースの保険)。
 *
 * 設計原則:
 *   - __v292Dfix29bActive フラグで二重 install 防止
 *   - window.__v292Dfix29 (fix29 の API) が ready になるまで wait
 *   - 5 秒ごとの periodic re-install で observer が disconnect された時の保険
 *   - fix29 とは別 IIFE として共存 (fix29 本体は touch しない)
 */
(function v292Dfix29b(){
  if (window.__v292Dfix29bActive) return;
  var TAG = '[v292Dfix29b]';
  var observer = null;

  function trySweep(){
    try {
      if (window.__v292Dfix29 && typeof window.__v292Dfix29.fixDomCards === 'function'){
        window.__v292Dfix29.fixDomCards();
      }
    } catch(_){}
  }

  function installObserver(){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return false;
    if (!window.__v292Dfix29 || typeof window.__v292Dfix29.fixDomCards !== 'function') return false;
    if (stream.__v292Dfix29bObserved) return true;

    observer = new MutationObserver(function(mutations){
      // Trigger sweep on any childList mutation (cards added/removed by renderStreamV15)
      var hasChange = false;
      for (var i = 0; i < mutations.length; i++){
        if (mutations[i].type === 'childList' &&
            (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0)){
          hasChange = true;
          break;
        }
      }
      if (hasChange){
        // Defer slightly so all batched mutations complete first
        setTimeout(trySweep, 0);
      }
    });
    observer.observe(stream, { childList: true });
    stream.__v292Dfix29bObserved = true;

    // Initial sweeps (in case cards are already present at install time)
    trySweep();
    setTimeout(trySweep, 200);
    setTimeout(trySweep, 800);
    setTimeout(trySweep, 2000);
    return true;
  }

  function init(){
    if (installObserver()){
      window.__v292Dfix29bActive = true;
      console.log(TAG, 'installed - MutationObserver on #dialogue-stream + delayed sweeps');
      return;
    }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installObserver()){
        clearInterval(iv);
        window.__v292Dfix29bActive = true;
        console.log(TAG, 'installed (deferred ' + tries + ' tries)');
      } else if (tries > 100){
        clearInterval(iv);
        console.warn(TAG, 'install gave up after 100 tries');
      }
    }, 100);
  }

  // 定期再 install (observer disconnect / stream replace 保険)
  setInterval(function(){
    try {
      var stream = document.getElementById('dialogue-stream');
      if (stream && !stream.__v292Dfix29bObserved &&
          window.__v292Dfix29 && typeof window.__v292Dfix29.fixDomCards === 'function'){
        installObserver();
        console.log(TAG, 'observer reinstalled');
      }
    } catch(_){}
  }, 5000);

  init();
})();

/* v292Dfix30: multi-slot save + JSON export/import
 *
 * 目的:
 *   既存の単一 localStorage 'chr6' 保存に上書きしない形で、複数 save スロット
 *   (default + 3 named slots) と JSON エクスポート / インポートを追加。
 *   ユーザーが「別シナリオ試したいけど今の進行は残したい」を可能にする。
 *
 * 設計:
 *   - 'chr6' は default slot として温存 (後方互換、既存ユーザーに影響なし)
 *   - 'chr6_slot_<id>' に named slots を保存 (id: 'a', 'b', 'c')
 *   - 'chr6_slots_meta' に slot メタデータ array [{id, name, key, updatedAt}]
 *   - 'chr6_active_slot' に現在アクティブな slot id (default / a / b / c)
 *   - S.save をラップして active slot key に書き込む
 *   - slot 切替時: その slot の data を localStorage から読んで S に Object.assign
 *
 * UI:
 *   - topbar 右側 (設定 ボタンの左) に「📁」ボタンを inject
 *   - クリックで overlay modal: 現在の slot + slot 一覧 + Export/Import
 *
 * 安全:
 *   - すべての破壊的操作は confirm() で確認
 *   - import 前に JSON schema を validate
 *   - export ファイル名に timestamp 含めて履歴復元しやすく
 *
 * 設計原則:
 *   - __v292Dfix30Active フラグで二重 install 防止
 *   - 既存 S.save / S.load は touch せず、ラップで slot 対応
 *   - fix28/29/29b と非競合 (UI レイヤ追加のみ)
 */
(function v292Dfix30(){
  if (window.__v292Dfix30Active) return;
  var TAG = '[v292Dfix30]';

  var SLOT_IDS = ['a', 'b', 'c'];
  var META_KEY = 'chr6_slots_meta';
  var ACTIVE_KEY = 'chr6_active_slot';
  var DEFAULT_SLOT_KEY = 'chr6';
  var SCHEMA_VERSION = 'v292Dfix30';

  // ---- Storage helpers ----
  function lsGet(k, def){
    try { var v = localStorage.getItem(k); return v != null ? JSON.parse(v) : def; }
    catch(_){ return def; }
  }
  function lsSet(k, v){
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(_){ return false; }
  }
  function lsRemove(k){
    try { localStorage.removeItem(k); } catch(_){}
  }

  // ---- Slot meta management ----
  function getMeta(){
    var meta = lsGet(META_KEY, null);
    if (!Array.isArray(meta) || !meta.length){
      meta = [
        { id: 'default', name: 'デフォルト', key: DEFAULT_SLOT_KEY, updatedAt: null }
      ];
      SLOT_IDS.forEach(function(id){
        meta.push({ id: id, name: 'スロット ' + id.toUpperCase(), key: 'chr6_slot_' + id, updatedAt: null });
      });
      lsSet(META_KEY, meta);
    }
    return meta;
  }
  function setMeta(meta){ lsSet(META_KEY, meta); }
  function getActive(){ return lsGet(ACTIVE_KEY, 'default') || 'default'; }
  function setActive(id){ lsSet(ACTIVE_KEY, id); }
  function findSlot(id){ return getMeta().find(function(s){ return s.id === id; }) || null; }
  function activeSlot(){ return findSlot(getActive()) || getMeta()[0]; }

  function touchSlot(id){
    var meta = getMeta();
    var s = meta.find(function(x){ return x.id === id; });
    if (s){ s.updatedAt = new Date().toISOString(); setMeta(meta); }
  }
  function renameSlot(id, newName){
    var meta = getMeta();
    var s = meta.find(function(x){ return x.id === id; });
    if (s && newName){ s.name = String(newName).slice(0, 40); setMeta(meta); }
  }
  function clearSlot(id){
    var s = findSlot(id);
    if (!s) return;
    lsRemove(s.key);
    var meta = getMeta();
    var t = meta.find(function(x){ return x.id === id; });
    if (t){ t.updatedAt = null; setMeta(meta); }
  }
  function slotHasData(id){
    var s = findSlot(id);
    if (!s) return false;
    var raw = null;
    try { raw = localStorage.getItem(s.key); } catch(_){}
    return !!raw;
  }

  // ---- S.save wrapping ----
  function wrapSave(){
    if (typeof S === 'undefined' || !S || typeof S.save !== 'function') return false;
    if (S.__v292Dfix30Wrapped) return true;
    var origSave = S.save.bind(S);
    S.save = function(){
      var slot = activeSlot();
      if (!slot || slot.id === 'default'){
        // default slot: use original behavior (writes to 'chr6')
        var r = origSave.apply(this, arguments);
        touchSlot('default');
        return r;
      }
      // named slot: write to slot.key
      try {
        var payload = { cfg: this.cfg, cast: this.cast, scene: this.scene, turns: this.turns, mode: this.mode };
        lsSet(slot.key, payload);
        touchSlot(slot.id);
      } catch(e){
        console.warn(TAG, 'save error:', e && e.message);
      }
    };
    S.__v292Dfix30Wrapped = true;
    console.log(TAG, 'S.save wrapped for multi-slot support');
    return true;
  }

  function loadSlot(id){
    var s = findSlot(id);
    if (!s) return false;
    var data = lsGet(s.key, null);
    if (!data || typeof data !== 'object') return false;
    // Apply to S
    try {
      if (data.cfg) Object.assign(S.cfg, data.cfg);
      if (data.cast){
        Object.assign(S.cast, data.cast);
        // ensure npcs is array
        if (!Array.isArray(S.cast.npcs)) S.cast.npcs = [];
      }
      if (data.scene) Object.assign(S.scene, data.scene);
      S.turns = Array.isArray(data.turns) ? data.turns : [];
      S.mode = data.mode || 'DO';
      setActive(id);
      triggerReRender();
      return true;
    } catch(e){
      console.warn(TAG, 'loadSlot err:', e && e.message);
      return false;
    }
  }

  function triggerReRender(){
    try {
      if (typeof UI !== 'undefined' && Array.isArray(UI._renderHooks)){
        UI._renderHooks.forEach(function(h){ try { h({}); } catch(_){} });
      }
      // Also try to render via known UI functions
      if (typeof UI !== 'undefined' && typeof UI.render === 'function'){
        try { UI.render(); } catch(_){}
      }
    } catch(_){}
  }

  // ---- JSON export / import ----
  function exportCurrent(){
    var slot = activeSlot();
    var payload = {
      _meta: {
        version: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        slotId: slot.id,
        slotName: slot.name,
        scenarioHint: (S.scene && (S.scene.loc || S.scene.lore)) || ''
      },
      cfg: S.cfg,
      cast: S.cast,
      scene: S.scene,
      turns: S.turns,
      mode: S.mode
    };
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    var safeName = (slot.name || 'chronicle').replace(/[^\w぀-ゟ゠-ヿ一-龯a-zA-Z0-9_-]/g, '_');
    a.download = 'chronicle-' + safeName + '-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    console.log(TAG, 'exported slot "' + slot.name + '" to ' + a.download);
  }

  function validateImportData(d){
    if (!d || typeof d !== 'object') return { ok: false, err: 'invalid JSON' };
    if (!d.cfg || typeof d.cfg !== 'object') return { ok: false, err: 'cfg 欠落' };
    if (!d.cast || typeof d.cast !== 'object') return { ok: false, err: 'cast 欠落' };
    if (!d.scene || typeof d.scene !== 'object') return { ok: false, err: 'scene 欠落' };
    if (!Array.isArray(d.turns)) return { ok: false, err: 'turns が array じゃない' };
    if (typeof d.mode !== 'string') return { ok: false, err: 'mode が string じゃない' };
    return { ok: true };
  }

  function importToSlot(targetSlotId, data){
    var s = findSlot(targetSlotId);
    if (!s) return { ok: false, err: 'slot 未定義: ' + targetSlotId };
    var v = validateImportData(data);
    if (!v.ok) return v;
    var payload = { cfg: data.cfg, cast: data.cast, scene: data.scene, turns: data.turns, mode: data.mode };
    if (s.id === 'default'){
      lsSet(DEFAULT_SLOT_KEY, payload);
    } else {
      lsSet(s.key, payload);
    }
    touchSlot(targetSlotId);
    return { ok: true };
  }

  function handleImportFile(file, targetSlotId, onDone){
    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var data = JSON.parse(ev.target.result);
        var r = importToSlot(targetSlotId, data);
        onDone(r, data);
      } catch(e){
        onDone({ ok: false, err: 'JSON parse error: ' + e.message }, null);
      }
    };
    reader.onerror = function(){ onDone({ ok: false, err: 'file read error' }, null); };
    reader.readAsText(file, 'UTF-8');
  }

  // ---- UI: floating manager modal ----
  function fmtTs(iso){
    if (!iso) return '未保存';
    try {
      var d = new Date(iso);
      var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '/' + pad(d.getMonth()+1) + '/' + pad(d.getDate()) + ' ' +
             pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch(_){ return iso; }
  }

  function buildScenarioPreview(slot){
    var key = slot.id === 'default' ? DEFAULT_SLOT_KEY : slot.key;
    var data = lsGet(key, null);
    if (!data) return '';
    var hero = (data.cast && data.cast.hero && data.cast.hero.name) || '';
    var loc = (data.scene && data.scene.loc) || '';
    var turns = (Array.isArray(data.turns) ? data.turns.length : 0);
    var bits = [];
    if (hero) bits.push('主: ' + hero);
    if (loc) bits.push('場: ' + loc);
    bits.push(turns + ' turn');
    return bits.join(' / ');
  }

  function ensureStyles(){
    if (document.getElementById('v292Dfix30-style')) return;
    var style = document.createElement('style');
    style.id = 'v292Dfix30-style';
    style.textContent = [
      '.v30-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}',
      '.v30-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;padding:20px;width:520px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.6)}',
      '.v30-modal h2{margin:0 0 12px;font-size:16px;color:var(--acc,#8b76f0);font-weight:600;display:flex;align-items:center;gap:8px}',
      '.v30-modal h3{margin:18px 0 8px;font-size:13px;color:var(--dim,#8888a0);font-weight:600;text-transform:uppercase;letter-spacing:.5px}',
      '.v30-close{margin-left:auto;background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}',
      '.v30-close:hover{background:var(--s2,#17172a);color:var(--tx,#e0dcf0)}',
      '.v30-slot{border:1px solid var(--border,rgba(139,118,240,.2));border-radius:6px;padding:10px 12px;margin-bottom:8px;background:var(--bg,#09090f);transition:border-color .2s}',
      '.v30-slot.active{border-color:var(--acc,#8b76f0);background:var(--s2,#17172a)}',
      '.v30-slot-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}',
      '.v30-slot-name{flex:1;font-weight:600;font-size:14px}',
      '.v30-slot-name input{background:var(--bg,#09090f);color:var(--tx);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:14px;font-family:inherit;width:100%;box-sizing:border-box}',
      '.v30-slot-active-badge{font-size:10px;background:var(--acc,#8b76f0);color:#fff;padding:2px 6px;border-radius:3px;font-weight:600}',
      '.v30-slot-meta{font-size:11px;color:var(--dim,#888);margin-bottom:8px}',
      '.v30-slot-preview{font-size:11px;color:var(--tx,#e0dcf0);opacity:.7;margin-bottom:8px;font-style:italic}',
      '.v30-slot-actions{display:flex;gap:6px;flex-wrap:wrap}',
      '.v30-btn{background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .15s}',
      '.v30-btn:hover:not(:disabled){background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc,#8b76f0)}',
      '.v30-btn:disabled{opacity:.4;cursor:not-allowed}',
      '.v30-btn-primary{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc,#8b76f0)}',
      '.v30-btn-danger{color:var(--err,#e06060);border-color:rgba(224,96,96,.3)}',
      '.v30-btn-danger:hover:not(:disabled){background:var(--err,#e06060);color:#fff;border-color:var(--err,#e06060)}',
      '.v30-toolbar{display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border,rgba(139,118,240,.2))}',
      '.v30-toolbar button{flex:1;padding:8px}',
      '.v30-hint{font-size:11px;color:var(--dim,#888);margin-top:8px;line-height:1.5}',
      '.v30-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--acc,#8b76f0);color:#fff;padding:10px 18px;border-radius:6px;font-size:13px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.4);font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}',
      '.v30-toast.err{background:var(--err,#e06060)}',
      '.v30-topbar-btn{background:var(--s2,#17172a);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit}',
      '.v30-topbar-btn:hover{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc)}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function showToast(msg, isErr){
    var t = document.createElement('div');
    t.className = 'v30-toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2400);
  }

  function renderManager(){
    closeManager();
    ensureStyles();
    var overlay = document.createElement('div');
    overlay.className = 'v30-overlay';
    overlay.id = 'v30-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeManager(); });

    var modal = document.createElement('div');
    modal.className = 'v30-modal';

    var meta = getMeta();
    var activeId = getActive();

    var html = [];
    html.push('<h2>📁 セーブ管理 <button class="v30-close" id="v30-close-x">×</button></h2>');
    html.push('<h3>セーブスロット</h3>');

    meta.forEach(function(slot){
      var isActive = slot.id === activeId;
      var hasData = slotHasData(slot.id);
      var preview = hasData ? buildScenarioPreview(slot) : '';
      html.push('<div class="v30-slot ' + (isActive ? 'active' : '') + '" data-id="' + slot.id + '">');
      html.push('<div class="v30-slot-head">');
      html.push('<div class="v30-slot-name"><input data-act="rename" data-id="' + slot.id + '" value="' + escAttr(slot.name) + '"' + (slot.id === 'default' ? ' disabled' : '') + '></div>');
      if (isActive) html.push('<span class="v30-slot-active-badge">ACTIVE</span>');
      html.push('</div>');
      html.push('<div class="v30-slot-meta">更新: ' + fmtTs(slot.updatedAt) + (hasData ? '' : ' (空)') + '</div>');
      if (preview) html.push('<div class="v30-slot-preview">' + escHtml(preview) + '</div>');
      html.push('<div class="v30-slot-actions">');
      html.push('<button class="v30-btn ' + (isActive ? '' : 'v30-btn-primary') + '" data-act="load" data-id="' + slot.id + '"' + (!hasData || isActive ? ' disabled' : '') + '>読込</button>');
      html.push('<button class="v30-btn" data-act="saveto" data-id="' + slot.id + '">現在の状態を保存</button>');
      html.push('<button class="v30-btn" data-act="import" data-id="' + slot.id + '">JSON 取込</button>');
      if (slot.id !== 'default'){
        html.push('<button class="v30-btn v30-btn-danger" data-act="clear" data-id="' + slot.id + '"' + (hasData ? '' : ' disabled') + '>削除</button>');
      }
      html.push('</div>');
      html.push('</div>');
    });

    html.push('<div class="v30-toolbar">');
    html.push('<button class="v30-btn v30-btn-primary" data-act="export-current">📤 現在を JSON エクスポート</button>');
    html.push('<button class="v30-btn" data-act="close">閉じる</button>');
    html.push('</div>');
    html.push('<div class="v30-hint">');
    html.push('• 「現在の状態を保存」で active slot のデータをそのスロットへ書き込み<br>');
    html.push('• 「読込」で他スロットの内容を画面に呼び出し (active が切り替わる)<br>');
    html.push('• 「JSON 取込」でファイルからインポート (現在のスロットの内容を上書き)<br>');
    html.push('• エクスポートはダウンロード形式 — クラウド同期や別環境への移行用<br>');
    html.push('• デフォルトスロット (chr6) は既存ユーザーとの互換のため固定');
    html.push('</div>');

    modal.innerHTML = html.join('');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    bindManagerEvents(modal);
  }

  function closeManager(){
    var overlay = document.getElementById('v30-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function bindManagerEvents(modal){
    var closeX = modal.querySelector('#v30-close-x');
    if (closeX) closeX.addEventListener('click', closeManager);

    modal.addEventListener('click', function(e){
      var t = e.target;
      if (!t || !t.dataset || !t.dataset.act) return;
      var act = t.dataset.act;
      var id = t.dataset.id || '';

      if (act === 'close'){ closeManager(); return; }
      if (act === 'export-current'){ exportCurrent(); showToast('JSON ダウンロードしたよ'); return; }

      if (act === 'load'){
        var s = findSlot(id);
        if (!s) return;
        if (!confirm('「' + s.name + '」を読み込む？\n現在の状態は active slot に自動 save される前の状態に戻る (注: 現セッションでまだ save してない変更は失われる)')){
          return;
        }
        // Auto-save current to active slot first
        try { if (typeof S !== 'undefined' && typeof S.save === 'function') S.save(); } catch(_){}
        var ok = loadSlot(id);
        if (ok){
          showToast('「' + s.name + '」を読み込んだ');
          closeManager();
          setTimeout(function(){ try { triggerReRender(); } catch(_){} }, 50);
        } else {
          showToast('読み込み失敗 (スロットが空かも)', true);
        }
        return;
      }

      if (act === 'saveto'){
        var s2 = findSlot(id);
        if (!s2) return;
        var hasExisting = slotHasData(id);
        if (hasExisting && id !== getActive()){
          if (!confirm('「' + s2.name + '」を現在の状態で上書き保存する？')) return;
        }
        // Temporarily switch active, save, restore
        var prevActive = getActive();
        setActive(id);
        try { if (typeof S !== 'undefined' && typeof S.save === 'function') S.save(); } catch(_){}
        setActive(prevActive);
        showToast('「' + s2.name + '」に保存した');
        renderManager(); // refresh
        return;
      }

      if (act === 'rename'){
        // input - handled via blur event below
        return;
      }

      if (act === 'clear'){
        var s3 = findSlot(id);
        if (!s3) return;
        if (!confirm('「' + s3.name + '」を完全削除する？ この操作は取り消せない。')) return;
        clearSlot(id);
        showToast('「' + s3.name + '」を削除');
        renderManager();
        return;
      }

      if (act === 'import'){
        promptImport(id);
        return;
      }
    });

    // Rename via blur
    Array.from(modal.querySelectorAll('input[data-act="rename"]')).forEach(function(inp){
      inp.addEventListener('blur', function(){
        var newName = inp.value.trim();
        if (newName){
          renameSlot(inp.dataset.id, newName);
        } else {
          inp.value = findSlot(inp.dataset.id).name;
        }
      });
      inp.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){ inp.blur(); }
      });
    });
  }

  function promptImport(targetSlotId){
    var slot = findSlot(targetSlotId);
    if (!slot) return;
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', function(){
      var file = fileInput.files && fileInput.files[0];
      if (!file){ document.body.removeChild(fileInput); return; }
      handleImportFile(file, targetSlotId, function(r, data){
        document.body.removeChild(fileInput);
        if (!r.ok){
          showToast('取込失敗: ' + r.err, true);
          return;
        }
        var hint = '';
        if (data && data._meta){
          hint = ' (元: ' + (data._meta.slotName || '?') + ' / ' + (data._meta.exportedAt || '') + ')';
        }
        showToast('「' + slot.name + '」に取込完了' + hint);
        renderManager();
      });
    });
    fileInput.click();
  }

  // ---- Topbar button injection ----
  function injectTopbarButton(){
    if (document.getElementById('v30-topbar-btn')) return true;
    // Find the 設定 button or topbar
    var settingsBtn = null;
    var allBtns = document.querySelectorAll('button');
    for (var i = 0; i < allBtns.length; i++){
      var b = allBtns[i];
      var txt = (b.textContent || '').trim();
      if (txt === '⚙ 設定' || txt === '設定' || txt.indexOf('設定') >= 0){
        settingsBtn = b;
        break;
      }
    }
    if (!settingsBtn) return false;
    ensureStyles();
    var saveBtn = document.createElement('button');
    saveBtn.id = 'v30-topbar-btn';
    saveBtn.className = 'v30-topbar-btn';
    saveBtn.textContent = '📁 セーブ';
    saveBtn.title = 'セーブ管理 (複数スロット + JSON エクスポート/インポート)';
    saveBtn.addEventListener('click', renderManager);
    settingsBtn.parentNode.insertBefore(saveBtn, settingsBtn);
    return true;
  }

  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function init(){
    var wrapped = wrapSave();
    var injected = injectTopbarButton();
    if (wrapped && injected){
      window.__v292Dfix30Active = true;
      console.log(TAG, 'installed - multi-slot save + JSON export/import active');
      return;
    }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (wrapSave() && injectTopbarButton()){
        clearInterval(iv);
        window.__v292Dfix30Active = true;
        console.log(TAG, 'installed (deferred ' + tries + ' tries)');
      } else if (tries > 80){
        clearInterval(iv);
        console.warn(TAG, 'install gave up after 80 tries');
      }
    }, 200);
  }

  // 定期再 install (UI 再構築で button が消えたケース等)
  setInterval(function(){
    try {
      if (window.__v292Dfix30Active && !document.getElementById('v30-topbar-btn')){
        if (injectTopbarButton()){
          console.log(TAG, 'topbar button reinjected');
        }
      }
    } catch(_){}
  }, 5000);

  // 検証用 API
  window.__v292Dfix30 = {
    openManager: renderManager,
    closeManager: closeManager,
    getMeta: getMeta,
    getActive: getActive,
    loadSlot: loadSlot,
    exportCurrent: exportCurrent,
    importToSlot: importToSlot
  };

  init();
})();

/* v292Dfix31: keyboard shortcuts
 *
 * 目的: パワーユーザー向けにキーボード操作を追加。Phase 1 UI/UX 強化の一環。
 *
 * Shortcuts:
 *   Ctrl/Cmd + S        現在の状態を active slot に保存
 *   Ctrl/Cmd + Shift+S  セーブ管理 modal を開く
 *   Ctrl/Cmd + E        現在の状態を JSON エクスポート
 *   Esc                 開いている modal/overlay を閉じる
 *   ? (Shift+/) / F1    ショートカット help を表示
 *
 * 設計原則:
 *   - __v292Dfix31Active フラグで二重 install 防止
 *   - input/textarea/contenteditable focus 時は Esc 以外は通過 (typing 邪魔しない)
 *   - Ctrl+S はブラウザの「ページ保存」を上書き → preventDefault
 *   - Ctrl+E はブラウザの「アドレスバー検索」(Firefox 等) を上書き → preventDefault
 *   - 全アクションで discrete toast 表示 (アクション確認)
 *   - fix30 の API (window.__v292Dfix30.openManager/exportCurrent) に依存
 *   - fix30 未 install でも crash しない (機能制限のみ)
 */
(function v292Dfix31(){
  if (window.__v292Dfix31Active) return;
  var TAG = '[v292Dfix31]';

  function isMac(){ return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || ''); }
  function modKey(e){ return isMac() ? e.metaKey : e.ctrlKey; }
  function isTypingTarget(t){
    if (!t) return false;
    if (t.isContentEditable) return true;
    var tag = (t.tagName || '').toUpperCase();
    if (tag === 'INPUT'){
      var type = (t.type || '').toLowerCase();
      if (['text','textarea','search','url','email','password','tel','number',''].indexOf(type) >= 0) return true;
    }
    if (tag === 'TEXTAREA') return true;
    return false;
  }

  function showToast(msg, isErr){
    var t = document.createElement('div');
    t.className = 'v30-toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    if (!document.getElementById('v292Dfix30-style')){
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
        'background:' + (isErr ? '#e06060' : '#8b76f0') + ';color:#fff;padding:10px 18px;' +
        'border-radius:6px;font-size:13px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.4);' +
        'font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif';
    }
    document.body.appendChild(t);
    setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 2400);
  }

  function actSave(){
    try {
      if (typeof S !== 'undefined' && typeof S.save === 'function'){
        S.save();
        showToast('💾 保存しました');
      } else {
        showToast('S.save 未定義 (state 未初期化?)', true);
      }
    } catch(e){ showToast('save 失敗: ' + e.message, true); }
  }
  function actOpenManager(){
    try {
      if (window.__v292Dfix30 && typeof window.__v292Dfix30.openManager === 'function'){
        window.__v292Dfix30.openManager();
      } else {
        showToast('fix30 (セーブ管理) が未 install', true);
      }
    } catch(e){ showToast('open manager err: ' + e.message, true); }
  }
  function actExport(){
    try {
      if (window.__v292Dfix30 && typeof window.__v292Dfix30.exportCurrent === 'function'){
        window.__v292Dfix30.exportCurrent();
        showToast('📤 JSON ダウンロード開始');
      } else {
        showToast('fix30 (エクスポート) が未 install', true);
      }
    } catch(e){ showToast('export err: ' + e.message, true); }
  }
  function actCloseModal(){
    var v30 = document.getElementById('v30-overlay');
    if (v30 && v30.parentNode){ v30.parentNode.removeChild(v30); return true; }
    var v31help = document.getElementById('v31-help-overlay');
    if (v31help && v31help.parentNode){ v31help.parentNode.removeChild(v31help); return true; }
    var allBtns = document.querySelectorAll('button');
    for (var i = 0; i < allBtns.length; i++){
      var b = allBtns[i];
      if ((b.textContent || '').trim() === '閉じる' && b.offsetParent !== null){
        try { b.click(); return true; } catch(_){}
      }
    }
    return false;
  }
  function actShowHelp(){
    var existing = document.getElementById('v31-help-overlay');
    if (existing){ existing.parentNode.removeChild(existing); return; }
    var mod = isMac() ? '⌘' : 'Ctrl';
    var overlay = document.createElement('div');
    overlay.id = 'v31-help-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif';
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) overlay.parentNode.removeChild(overlay);
    });
    var box = document.createElement('div');
    box.style.cssText = 'background:#111119;color:#e0dcf0;border:1px solid rgba(139,118,240,.3);' +
      'border-radius:8px;padding:20px 24px;width:440px;max-width:92vw;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.6)';
    var rows = [
      [mod + ' + S',         '現在の状態を保存'],
      [mod + ' + Shift + S', 'セーブ管理を開く'],
      [mod + ' + E',         'JSON エクスポート'],
      ['Esc',                '開いている modal を閉じる'],
      ['? / F1',             'このヘルプを表示']
    ];
    var html = ['<h2 style="margin:0 0 14px;font-size:16px;color:#8b76f0;font-weight:600;">⌨️ キーボードショートカット <span style="float:right;cursor:pointer;color:#888;font-size:18px;font-weight:normal;" id="v31-help-close">×</span></h2>'];
    html.push('<table style="width:100%;border-collapse:collapse;font-size:13px;">');
    rows.forEach(function(r){
      html.push('<tr>');
      html.push('<td style="padding:8px 10px;border-bottom:1px solid rgba(139,118,240,.15);width:42%;"><kbd style="background:#17172a;border:1px solid rgba(139,118,240,.3);border-radius:4px;padding:3px 8px;font-family:monospace;font-size:12px;color:#e0dcf0;">' + r[0] + '</kbd></td>');
      html.push('<td style="padding:8px 10px;border-bottom:1px solid rgba(139,118,240,.15);color:#e0dcf0;">' + r[1] + '</td>');
      html.push('</tr>');
    });
    html.push('</table>');
    html.push('<div style="margin-top:14px;font-size:11px;color:#888;line-height:1.5;">入力欄に focus 中は ' + mod + ' + 系のみ動作 (Esc/?/F1 は無効化)</div>');
    box.innerHTML = html.join('');
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var closeBtn = document.getElementById('v31-help-close');
    if (closeBtn) closeBtn.addEventListener('click', function(){ overlay.parentNode.removeChild(overlay); });
  }

  function onKeyDown(e){
    var typing = isTypingTarget(e.target);
    if (e.key === 'Escape'){
      if (actCloseModal()){ e.preventDefault(); return; }
      return;
    }
    if (!typing && (e.key === 'F1' || (e.key === '?' && e.shiftKey))){
      e.preventDefault();
      actShowHelp();
      return;
    }
    if (modKey(e)){
      if (e.shiftKey && (e.key === 'S' || e.key === 's')){
        e.preventDefault();
        actOpenManager();
        return;
      }
      if (!e.shiftKey && (e.key === 'S' || e.key === 's')){
        e.preventDefault();
        actSave();
        return;
      }
      if (!e.shiftKey && (e.key === 'E' || e.key === 'e')){
        e.preventDefault();
        actExport();
        return;
      }
    }
  }

  function install(){
    if (window.__v292Dfix31Installed) return;
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.__v292Dfix31Installed = true;
    window.__v292Dfix31Active = true;
    console.log(TAG, 'installed - keyboard shortcuts active (' + (isMac() ? 'Cmd' : 'Ctrl') + ' + S/E, Shift+? for help)');
  }

  window.__v292Dfix31 = {
    showHelp: actShowHelp,
    save: actSave,
    export: actExport,
    openManager: actOpenManager
  };

  install();
})();

/* v292Dfix32: mobile UI optimization
 *
 * 目的: 狭画面 (≤ 768px) での体験を改善。
 *   - #content-cols (会話ログ + 展開の描写) を 2-col → 1-col 縦並びに
 *   - topbar / composer / 設定 modal のレイアウト調整
 *   - タップ領域を 44px 以上確保 (アクセシビリティ準拠)
 *   - 設定 overlay を全幅化
 *
 * 設計原則:
 *   - __v292Dfix32Active フラグで二重 install 防止
 *   - CSS injection のみ (DOM / JS state は touch しない)
 *   - !important で既存スタイルを優先上書き
 *   - desktop (> 768px) では効果なし
 */
(function v292Dfix32(){
  if (window.__v292Dfix32Active) return;
  var TAG = '[v292Dfix32]';
  var STYLE_ID = 'v292Dfix32-style';

  function inject(){
    if (document.getElementById(STYLE_ID)) return true;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* === v292Dfix32: mobile UI (≤ 768px) === */',
      '@media (max-width: 768px) {',
      '  body { max-width: 100% !important; padding: 0 !important; }',
      '  #topbar { padding: 8px 12px !important; gap: 6px !important; flex-wrap: wrap !important; }',
      '  #topbar > * { font-size: 13px !important; }',
      '  #content-cols { flex-direction: column !important; gap: 8px !important; padding: 0 8px !important; }',
      '  #content-cols > * { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }',
      '  #dialogue-col { max-height: 35vh !important; overflow-y: auto !important; }',
      '  #branches { flex-wrap: wrap !important; padding: 4px 8px !important; gap: 6px !important; }',
      '  #branches button { font-size: 12px !important; padding: 6px 10px !important; }',
      '  #composer { padding: 8px !important; gap: 6px !important; }',
      '  #composer button { min-height: 44px !important; font-size: 14px !important; }',
      '  #composer input, #composer textarea { font-size: 16px !important; min-height: 44px !important; }',
      '  #settingsOv > div, #editOv > div { width: 96vw !important; max-width: 96vw !important; max-height: 92vh !important; margin: 2vh auto !important; padding: 14px !important; box-sizing: border-box !important; }',
      '  #settingsOv input, #settingsOv textarea, #editOv input, #editOv textarea { font-size: 16px !important; }',
      '  #settingsOv button, #editOv button { min-height: 40px !important; }',
      '  .v30-modal { width: 96vw !important; max-width: 96vw !important; padding: 14px !important; }',
      '  .v30-btn { min-height: 36px !important; padding: 7px 12px !important; font-size: 13px !important; }',
      '  .v30-slot-actions { gap: 4px !important; }',
      '  #v31-help-overlay > div { width: 96vw !important; padding: 16px !important; }',
      '  .badge, [class*="badge"] { font-size: 10px !important; }',
      '}',
      '@media (max-width: 480px) {',
      '  #topbar { padding: 6px 8px !important; }',
      '  #v30-topbar-btn { padding: 6px 8px !important; }',
      '  .v292-dlg-card { padding: 6px !important; gap: 6px !important; }',
      '  .dlg-name { font-size: 12px !important; }',
      '  .dlg-text { font-size: 13px !important; }',
      '  .dlg-av img { width: 32px !important; height: 32px !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
    return true;
  }
  function init(){
    if (inject()){ window.__v292Dfix32Active = true; console.log(TAG, 'installed - mobile UI CSS injected (≤ 768px responsive)'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (inject()){ clearInterval(iv); window.__v292Dfix32Active = true; console.log(TAG, 'installed (deferred ' + tries + ' tries)'); }
      else if (tries > 30){ clearInterval(iv); console.warn(TAG, 'install gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix32Active && !document.getElementById(STYLE_ID)){ if (inject()) console.log(TAG, 'style reinjected'); }
  }, 5000);
  window.__v292Dfix32 = { reinject: function(){ var s = document.getElementById(STYLE_ID); if (s) s.parentNode.removeChild(s); return inject(); } };
  init();
})();

/* v292Dfix33: undo 履歴強化 + redo
 *
 * 目的:
 *   既存の G.undo() は単発 pop で、popped turn が失われると戻せない。
 *   fix33 は popped turn を undoStack に capture し、redo (やり戻す) を可能にする。
 *
 * 設計:
 *   - G.undo を wrap: pop 前の turn を deep clone で snapshot、pop 成功後 undoStack に push
 *   - undoStack 上限 N=10 (FIFO)
 *   - redo: undoStack.pop() を S.turns に push、UI 再描画 + S.save
 *   - 新 turn 追加検知 (S.turns.length 増加) で redo stack を clear
 *
 * 設計原則:
 *   - __v292Dfix33Active フラグで二重 install 防止
 *   - G.undo wrap は二重防止 (G.__v292Dfix33Wrapped)
 *   - fix30 が S.save をすでに wrap してるが競合なし
 *   - 5 秒ごとの button re-install + 1 秒ごとの new-turn poll
 */
(function v292Dfix33(){
  if (window.__v292Dfix33Active) return;
  var TAG = '[v292Dfix33]';
  var MAX_UNDO = 10;
  var undoStack = [];
  var lastTurnsLen = -1;
  function deepClone(o){ try { return JSON.parse(JSON.stringify(o)); } catch(_){ return o; } }
  function wrapUndo(){
    if (typeof G === 'undefined' || !G || typeof G.undo !== 'function') return false;
    if (G.__v292Dfix33Wrapped) return true;
    var origUndo = G.undo.bind(G);
    G.undo = function(){
      if (typeof S === 'undefined' || !S || !Array.isArray(S.turns) || S.turns.length === 0) return origUndo();
      var lenBefore = S.turns.length;
      var snapshot = deepClone(S.turns[lenBefore - 1]);
      origUndo();
      if (S.turns.length < lenBefore){
        undoStack.push(snapshot);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        lastTurnsLen = S.turns.length;
        updateRedoButton();
        console.log(TAG, 'captured to undoStack, size=', undoStack.length);
      }
    };
    G.__v292Dfix33Wrapped = true;
    return true;
  }
  function actRedo(){
    if (!undoStack.length){ showToast('戻すターンがありません', true); return; }
    if (typeof S === 'undefined' || !S || !Array.isArray(S.turns)){ showToast('S 未初期化', true); return; }
    var turn = undoStack.pop();
    S.turns.push(turn);
    try { if (S.scene){ S.scene.branches = (turn.plan && turn.plan.branchCandidates) || []; } } catch(_){}
    try { if (typeof S.save === 'function') S.save(); } catch(_){}
    try {
      if (typeof UI !== 'undefined'){
        if (typeof UI.renderAll === 'function') UI.renderAll();
        if (typeof UI.renderBranches === 'function') UI.renderBranches(S.scene.branches);
        if (typeof UI.setStatus === 'function') UI.setStatus('戻しました');
      }
    } catch(_){}
    lastTurnsLen = S.turns.length;
    updateRedoButton();
    showToast('↪ 1 ターン戻した');
  }
  function showToast(msg, isErr){
    var t = document.createElement('div');
    t.className = 'v30-toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    if (!document.getElementById('v292Dfix30-style')){
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#e06060' : '#8b76f0') + ';color:#fff;padding:10px 18px;border-radius:6px;font-size:13px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.4);font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif';
    }
    document.body.appendChild(t);
    setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 2400);
  }
  function injectRedoButton(){
    if (document.getElementById('v33-redo-btn')) return true;
    var undoBtn = null;
    var btns = document.querySelectorAll('button.tbtn');
    for (var i = 0; i < btns.length; i++){
      var t = (btns[i].textContent || '').trim();
      if (t === '↩ 取消' || t.indexOf('取消') >= 0){ undoBtn = btns[i]; break; }
    }
    if (!undoBtn) return false;
    var redoBtn = document.createElement('button');
    redoBtn.id = 'v33-redo-btn';
    redoBtn.className = 'tbtn';
    redoBtn.textContent = '↪ 戻す';
    redoBtn.title = 'やり直した内容を戻す (redo)';
    redoBtn.disabled = undoStack.length === 0;
    redoBtn.style.cssText = 'opacity:' + (undoStack.length ? '1' : '.5');
    redoBtn.addEventListener('click', actRedo);
    undoBtn.parentNode.insertBefore(redoBtn, undoBtn.nextSibling);
    return true;
  }
  function updateRedoButton(){
    var btn = document.getElementById('v33-redo-btn');
    if (!btn) return;
    var hasStack = undoStack.length > 0;
    btn.disabled = !hasStack;
    btn.style.opacity = hasStack ? '1' : '.5';
    btn.title = hasStack ? 'やり直した内容を戻す (' + undoStack.length + ' ターン分 保持)' : '戻すターンがありません';
  }
  function pollNewTurn(){
    if (typeof S === 'undefined' || !S || !Array.isArray(S.turns)) return;
    var len = S.turns.length;
    if (lastTurnsLen < 0){ lastTurnsLen = len; return; }
    if (len > lastTurnsLen && undoStack.length > 0){
      undoStack.length = 0; updateRedoButton();
      console.log(TAG, 'new turn — cleared redo');
    }
    lastTurnsLen = len;
  }
  function init(){
    var ok = wrapUndo() && injectRedoButton();
    if (ok){ window.__v292Dfix33Active = true; lastTurnsLen = (S && S.turns) ? S.turns.length : 0; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (wrapUndo() && injectRedoButton()){ clearInterval(iv); window.__v292Dfix33Active = true; lastTurnsLen = (S && S.turns) ? S.turns.length : 0; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(pollNewTurn, 1000);
  setInterval(function(){
    if (window.__v292Dfix33Active){
      if (!document.getElementById('v33-redo-btn')){ if (injectRedoButton()){ updateRedoButton(); console.log(TAG, 'reinjected'); } }
      if (typeof G !== 'undefined' && G && typeof G.undo === 'function' && !G.__v292Dfix33Wrapped){ if (wrapUndo()) console.log(TAG, 'G.undo re-wrapped'); }
    }
  }, 5000);
  window.__v292Dfix33 = { redo: actRedo, getStack: function(){ return undoStack.slice(); }, clear: function(){ undoStack.length = 0; updateRedoButton(); }, getStackSize: function(){ return undoStack.length; } };
  init();
})();

/* v292Dfix34: チャプター/シーンナビゲーション
 *
 * 目的:
 *   長くなった narrative の見通しを良くする。各 turn にユーザーが章タイトルを付け、
 *   一覧から任意の turn へ瞬時にジャンプできる。
 *
 * 設計:
 *   - 「📑 章」ボタンを topbar に inject (📁 セーブ ボタンの左)
 *   - クリックで右側スライドイン panel: 全 turn を chronological list
 *     各エントリ: 「第N章 [title]」(editable, blur で保存) + inputType badge + preview
 *     クリック → 該当 .turn 要素を scrollIntoView + flash highlight
 *   - 章タイトル保存: localStorage.chr6_chapter_titles_<slotId> = {turnIdx: title}
 *     active slot に紐付け (slot 切替で章タイトルも切替)
 *   - 自動推測: title 未設定なら narrative 先頭から「。」までの短い文を default
 *
 * 設計原則:
 *   - __v292Dfix34Active フラグで二重 install 防止
 *   - fix30 の active slot 概念を活用 (window.__v292Dfix30 が無くても default 動作)
 *   - .turn DOM 要素は既存構造を読むだけで触らない
 *   - 5 秒ごとの button re-install + slot 切替時の panel 再描画
 */
(function v292Dfix34(){
  if (window.__v292Dfix34Active) return;
  var TAG = '[v292Dfix34]';

  function getActiveSlotId(){
    try {
      if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function'){
        return window.__v292Dfix30.getActive();
      }
    } catch(_){}
    return 'default';
  }

  function titlesKey(){ return 'chr6_chapter_titles_' + getActiveSlotId(); }

  function loadTitles(){
    try { var v = localStorage.getItem(titlesKey()); return v ? JSON.parse(v) : {}; }
    catch(_){ return {}; }
  }
  function saveTitles(t){
    try { localStorage.setItem(titlesKey(), JSON.stringify(t)); } catch(_){}
  }
  function setTitle(idx, title){
    var t = loadTitles();
    if (title && title.trim()){ t[idx] = String(title).slice(0, 60); }
    else { delete t[idx]; }
    saveTitles(t);
  }

  function autoTitle(turn){
    if (!turn) return '';
    var src = '';
    if (typeof turn.narrative === 'string') src = turn.narrative;
    else if (Array.isArray(turn.narrative)){
      for (var i = 0; i < turn.narrative.length; i++){
        var n = turn.narrative[i];
        if (typeof n === 'string'){ src = n; break; }
        if (n && typeof n === 'object' && typeof n.text === 'string'){ src = n.text; break; }
      }
    }
    if (!src) src = turn.playerText || '';
    var m = src.match(/^([^。！？\n]{0,30}[。！？]?)/);
    return m ? m[1].trim() : src.slice(0, 30);
  }

  function getTurnElems(){
    var story = document.getElementById('story');
    if (!story) return [];
    return Array.from(story.querySelectorAll(':scope > .turn'));
  }

  function ensureStyles(){
    if (document.getElementById('v292Dfix34-style')) return;
    var style = document.createElement('style');
    style.id = 'v292Dfix34-style';
    style.textContent = [
      '.v34-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:none;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}',
      '.v34-overlay.open{display:block}',
      '.v34-panel{position:fixed;top:0;right:0;height:100vh;width:380px;max-width:92vw;background:var(--s1,#111119);color:var(--tx,#e0dcf0);border-left:1px solid var(--border,rgba(139,118,240,.3));box-shadow:-4px 0 16px rgba(0,0,0,.4);overflow-y:auto;z-index:9999;transform:translateX(100%);transition:transform .25s ease-out;display:flex;flex-direction:column}',
      '.v34-overlay.open .v34-panel{transform:translateX(0)}',
      '.v34-head{padding:14px 16px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}',
      '.v34-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}',
      '.v34-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}',
      '.v34-close:hover{background:var(--s2,#17172a);color:var(--tx)}',
      '.v34-list{flex:1;overflow-y:auto;padding:8px}',
      '.v34-item{border:1px solid var(--border,rgba(139,118,240,.15));border-radius:6px;padding:10px;margin-bottom:6px;background:var(--bg,#09090f);cursor:pointer;transition:all .15s}',
      '.v34-item:hover{border-color:var(--acc,#8b76f0);background:var(--s2,#17172a)}',
      '.v34-item-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;color:var(--dim,#888)}',
      '.v34-item-num{font-weight:600;color:var(--acc,#8b76f0)}',
      '.v34-item-type{background:var(--s2,#17172a);padding:1px 6px;border-radius:3px;font-size:10px}',
      '.v34-item-type.STORY{color:#c49040}',
      '.v34-item-type.SAY{color:#5a8ef0}',
      '.v34-item-type.DO{color:#6aaf78}',
      '.v34-item-title{font-size:14px;font-weight:600;color:var(--tx,#e0dcf0);margin-bottom:4px;word-break:break-word}',
      '.v34-item-title input{background:transparent;border:none;color:inherit;font:inherit;font-weight:inherit;width:100%;padding:2px 4px;border-radius:3px;border:1px solid transparent}',
      '.v34-item-title input:focus{outline:none;background:var(--s2,#17172a);border-color:var(--acc,#8b76f0)}',
      '.v34-item-preview{font-size:11px;color:var(--dim,#888);line-height:1.4;opacity:.8}',
      '.v34-hint{padding:10px 16px;font-size:11px;color:var(--dim,#888);border-top:1px solid var(--border,rgba(139,118,240,.15));background:var(--bg,#09090f)}',
      '@keyframes v34-flash{0%,100%{background:transparent}50%{background:rgba(139,118,240,.18)}}',
      '.v34-flash{animation:v34-flash 1.2s ease-out 1}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderPanel(){
    closePanel();
    ensureStyles();
    var overlay = document.createElement('div');
    overlay.className = 'v34-overlay';
    overlay.id = 'v34-overlay';
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) closePanel();
    });

    var panel = document.createElement('div');
    panel.className = 'v34-panel';
    panel.innerHTML = '<div class="v34-head"><h2>📑 シーン</h2>' +
      '<button class="v34-close" id="v34-close-x">×</button></div>' +
      '<div class="v34-list" id="v34-list"></div>' +
      '<div class="v34-hint">クリックで該当シーンへジャンプ。タイトルは自由編集可能</div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var st = (typeof S !== 'undefined' && S) ? S : (window.S || null);
    if (!st || !Array.isArray(st.turns)){
      document.getElementById('v34-list').innerHTML = '<div style="padding:12px;color:#888;font-size:12px;">turn データ無し</div>';
    } else {
      var titles = loadTitles();
      var list = document.getElementById('v34-list');
      var html = [];
      st.turns.forEach(function(turn, idx){
        var customTitle = titles[idx] || '';
        var displayTitle = customTitle || autoTitle(turn);
        var inputType = turn.inputType || '?';
        var preview = '';
        if (typeof turn.narrative === 'string') preview = turn.narrative;
        else if (Array.isArray(turn.narrative)){
          for (var i = 0; i < turn.narrative.length; i++){
            var n = turn.narrative[i];
            if (typeof n === 'string'){ preview += n + ' '; }
            else if (n && typeof n === 'object' && typeof n.text === 'string'){ preview += n.text + ' '; }
            if (preview.length > 120) break;
          }
        }
        preview = preview.slice(0, 100) + (preview.length > 100 ? '…' : '');
        html.push('<div class="v34-item" data-idx="' + idx + '">');
        html.push('<div class="v34-item-head">');
        html.push('<span class="v34-item-num">第' + (idx+1) + '章</span>');
        html.push('<span class="v34-item-type ' + escAttr(inputType) + '">' + escHtml(inputType) + '</span>');
        html.push('</div>');
        html.push('<div class="v34-item-title"><input data-idx="' + idx + '" value="' + escAttr(displayTitle) + '" placeholder="タイトル"></div>');
        html.push('<div class="v34-item-preview">' + escHtml(preview) + '</div>');
        html.push('</div>');
      });
      list.innerHTML = html.join('');
      list.addEventListener('click', function(e){
        var item = e.target.closest('.v34-item');
        if (!item) return;
        if (e.target.tagName === 'INPUT') return;
        var idx = parseInt(item.dataset.idx, 10);
        jumpToTurn(idx);
      });
      Array.from(list.querySelectorAll('input[data-idx]')).forEach(function(inp){
        inp.addEventListener('blur', function(){
          var idx = parseInt(inp.dataset.idx, 10);
          var newVal = inp.value.trim();
          if (newVal && newVal === autoTitle(st.turns[idx])){
            setTitle(idx, '');
          } else {
            setTitle(idx, newVal);
          }
        });
        inp.addEventListener('keydown', function(e){
          if (e.key === 'Enter') inp.blur();
        });
        inp.addEventListener('click', function(e){ e.stopPropagation(); });
      });
    }

    var closeBtn = document.getElementById('v34-close-x');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    requestAnimationFrame(function(){ overlay.classList.add('open'); });
  }

  function closePanel(){
    var ov = document.getElementById('v34-overlay');
    if (ov && ov.parentNode){ ov.parentNode.removeChild(ov); }
  }

  function jumpToTurn(idx){
    var elems = getTurnElems();
    if (idx < 0 || idx >= elems.length){ console.warn(TAG, 'jump idx out of range:', idx); return; }
    var el = elems[idx];
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('v34-flash');
    setTimeout(function(){ el.classList.remove('v34-flash'); }, 1300);
    closePanel();
  }

  function injectTopbarButton(){
    if (document.getElementById('v34-topbar-btn')) return true;
    var saveBtn = document.getElementById('v30-topbar-btn');
    var settingsBtn = null;
    if (!saveBtn){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ settingsBtn = allBtns[i]; break; }
      }
    }
    var anchor = saveBtn || settingsBtn;
    if (!anchor) return false;
    ensureStyles();
    var btn = document.createElement('button');
    btn.id = 'v34-topbar-btn';
    btn.className = 'v30-topbar-btn';
    btn.textContent = '📑 シーン';
    btn.title = 'シーン/章ナビゲーション (全 turn へジャンプ)';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);' +
      'border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;' +
      'padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderPanel);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }

  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function init(){
    if (injectTopbarButton()){
      window.__v292Dfix34Active = true;
      console.log(TAG, 'installed - scene/chapter navigation active');
      return;
    }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (injectTopbarButton()){
        clearInterval(iv);
        window.__v292Dfix34Active = true;
        console.log(TAG, 'installed (deferred ' + tries + ' tries)');
      } else if (tries > 80){
        clearInterval(iv);
        console.warn(TAG, 'install gave up');
      }
    }, 200);
  }

  setInterval(function(){
    if (window.__v292Dfix34Active && !document.getElementById('v34-topbar-btn')){
      if (injectTopbarButton()) console.log(TAG, 'topbar button reinjected');
    }
  }, 5000);

  window.__v292Dfix34 = {
    openPanel: renderPanel,
    closePanel: closePanel,
    jumpToTurn: jumpToTurn,
    loadTitles: loadTitles,
    setTitle: setTitle,
    autoTitle: autoTitle
  };

  init();
})();

/* v292Dfix35: 長期記憶 — turn 要約 + prompt 注入
 *
 * 目的 (Phase 2 narrative 深化の核):
 *   長セッションで context window を超えた古い turn を LLM が忘れる問題に対処。
 *   各 turn の narrative を 1 文程度に自動要約し、直近 N turn 分を
 *   prompt の system 末尾に「これまでの経緯」として注入する。
 *   ユーザーは UI で各要約を手動上書き可能 (より正確/簡潔にする等)。
 *
 * 設計:
 *   - 自動要約: narrative の先頭から「。」「！」「？」 まで or 80 char (lightweight, deterministic)
 *     → S.turns[i] には書かない (schema 不侵入)、別 localStorage に override のみ保存
 *   - 直近 N=8 turn を「【これまでの経緯】」block として system prompt 末尾に注入
 *   - Planner._extensions に push (fix24/25/26/28 と同じパターン)
 *   - UI: topbar 「🧠 メモリ」ボタン → panel で全 turn 要約一覧 + 編集可
 *   - 上書き保存: localStorage.chr6_turn_summaries_<slotId> = {turnIdx: customSummary}
 *
 * 設計原則:
 *   - __v292Dfix35Active フラグで二重 install 防止
 *   - Planner._extensions の二重 push 防止 (__v292Dfix35 marker)
 *   - 5 秒ごとの periodic re-install (extensions が replace されたケース)
 *   - schema 改変なし (S.turns は触らない)、localStorage に override 別管理
 *   - fix30 active slot 連動 (slot 切替で要約上書きも切替)
 */
(function v292Dfix35(){
  if (window.__v292Dfix35Active) return;
  var TAG = '[v292Dfix35]';
  var MEMORY_WINDOW = 8;
  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function overridesKey(){ return 'chr6_turn_summaries_' + getActiveSlotId(); }
  function loadOverrides(){ try { var v = localStorage.getItem(overridesKey()); return v ? JSON.parse(v) : {}; } catch(_){ return {}; } }
  function saveOverrides(o){ try { localStorage.setItem(overridesKey(), JSON.stringify(o)); } catch(_){} }
  function setOverride(idx, summary){ var o = loadOverrides(); if (summary && summary.trim()) o[idx] = String(summary).trim().slice(0, 200); else delete o[idx]; saveOverrides(o); }
  function autoSummary(turn){
    if (!turn) return '';
    var src = '';
    if (typeof turn.narrative === 'string') src = turn.narrative;
    else if (Array.isArray(turn.narrative)){
      for (var i = 0; i < turn.narrative.length; i++){
        var n = turn.narrative[i];
        if (typeof n === 'string') src += n + ' ';
        else if (n && typeof n === 'object' && typeof n.text === 'string') src += n.text + ' ';
        if (src.length > 200) break;
      }
    }
    src = String(src || '').trim();
    if (!src) return (turn.playerText || '').slice(0, 80);
    var m = src.match(/^([^。！？\n]{1,80}[。！？])/);
    if (m) return m[1].trim();
    return src.slice(0, 80) + '…';
  }
  function getSummary(turn, idx){ var ov = loadOverrides(); if (ov[idx]) return ov[idx]; return autoSummary(turn); }
  function buildMemoryContext(turns){
    if (!Array.isArray(turns) || !turns.length) return '';
    var start = Math.max(0, turns.length - MEMORY_WINDOW);
    var lines = ['【これまでの経緯 (直近 ' + (turns.length - start) + ' turn)】'];
    for (var i = start; i < turns.length; i++){
      var t = turns[i];
      var typeBadge = t.inputType || '?';
      var summary = getSummary(t, i);
      lines.push((i+1) + '. [' + typeBadge + '] ' + summary);
    }
    if (start > 0) lines.push('(さらに古い ' + start + ' turn は省略)');
    lines.push('');
    lines.push('上記の経緯を踏まえ、矛盾なく自然に続きを書くこと。キャラクターの関係性・心理・場所の連続性を保つ。');
    return lines.join('\n');
  }
  function sysExt(ctx){
    try {
      var st = (typeof S !== 'undefined' && S) ? S : (typeof window !== 'undefined' && window.S) ? window.S : null;
      if (!st || !Array.isArray(st.turns) || !st.turns.length) return ctx.sys;
      var memBlock = buildMemoryContext(st.turns);
      if (!memBlock) return ctx.sys;
      return ctx.sys + '\n\n' + memBlock;
    } catch(e){ console.warn(TAG, 'sysExt err:', e && e.message); return ctx.sys; }
  }
  function installPlannerExt(){
    if (typeof window.Planner === 'undefined' || !window.Planner) return false;
    window.Planner._extensions = window.Planner._extensions || [];
    if (window.Planner._extensions.__v292Dfix35) return true;
    window.Planner._extensions.push(sysExt);
    window.Planner._extensions.__v292Dfix35 = true;
    return true;
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix35-style')) return;
    var style = document.createElement('style');
    style.id = 'v292Dfix35-style';
    style.textContent = ['.v35-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v35-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:600px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v35-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v35-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v35-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v35-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v35-body{flex:1;overflow-y:auto;padding:12px 18px}','.v35-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:12px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v35-item{border-bottom:1px solid var(--border,rgba(139,118,240,.1));padding:10px 0}','.v35-item:last-child{border-bottom:none}','.v35-item-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;color:var(--dim,#888)}','.v35-item-num{font-weight:600;color:var(--acc,#8b76f0);min-width:40px}','.v35-item-type{background:var(--s2,#17172a);padding:1px 6px;border-radius:3px;font-size:10px}','.v35-item-type.STORY{color:#c49040}','.v35-item-type.SAY{color:#5a8ef0}','.v35-item-type.DO{color:#6aaf78}','.v35-item-window{margin-left:auto;font-size:10px;color:var(--acc,#8b76f0);background:rgba(139,118,240,.15);padding:1px 6px;border-radius:3px}','.v35-summary{display:flex;gap:6px;align-items:center}','.v35-summary textarea{flex:1;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;line-height:1.4;resize:vertical;min-height:36px}','.v35-summary textarea:focus{outline:none;border-color:var(--acc,#8b76f0)}','.v35-summary textarea.custom{border-color:var(--acc,#8b76f0);box-shadow:0 0 0 1px rgba(139,118,240,.3)}','.v35-reset{background:none;border:1px solid var(--border,rgba(139,118,240,.2));color:var(--dim,#888);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap}','.v35-reset:hover{color:var(--tx);border-color:var(--acc,#8b76f0)}','.v35-foot{padding:12px 18px;border-top:1px solid var(--border,rgba(139,118,240,.2));font-size:11px;color:var(--dim,#888)}'].join('\n');
    document.head.appendChild(style);
  }
  function renderPanel(){
    closePanel(); ensureStyles();
    var overlay = document.createElement('div'); overlay.className = 'v35-overlay'; overlay.id = 'v35-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closePanel(); });
    var modal = document.createElement('div'); modal.className = 'v35-modal';
    var st = (typeof S !== 'undefined' && S) ? S : null;
    var turns = (st && Array.isArray(st.turns)) ? st.turns : [];
    var overrides = loadOverrides();
    var windowStart = Math.max(0, turns.length - MEMORY_WINDOW);
    var html = ['<div class="v35-head"><h2>🧠 長期記憶 (要約)</h2><button class="v35-close" id="v35-close-x">×</button></div>'];
    html.push('<div class="v35-body">');
    html.push('<div class="v35-intro">');
    html.push('各 turn の自動要約を「これまでの経緯」として AI に毎回注入します。直近 <b>' + MEMORY_WINDOW + ' turn</b> 分が文脈として使われます。');
    html.push('要約は自由編集可能。空にすれば自動推測に戻ります。');
    html.push('</div>');
    if (!turns.length){ html.push('<div style="padding:20px;text-align:center;color:#888;">turn がまだありません</div>'); }
    else {
      turns.forEach(function(turn, idx){
        var inWindow = idx >= windowStart;
        var inputType = turn.inputType || '?';
        var hasCustom = !!overrides[idx];
        var displaySummary = hasCustom ? overrides[idx] : autoSummary(turn);
        html.push('<div class="v35-item"><div class="v35-item-head"><span class="v35-item-num">第' + (idx+1) + '章</span><span class="v35-item-type ' + escAttr(inputType) + '">' + escHtml(inputType) + '</span>');
        if (inWindow) html.push('<span class="v35-item-window">プロンプト注入中</span>');
        html.push('</div><div class="v35-summary"><textarea data-idx="' + idx + '" class="' + (hasCustom ? 'custom' : '') + '" placeholder="要約 (自動推測)" rows="2">' + escHtml(displaySummary) + '</textarea>');
        if (hasCustom) html.push('<button class="v35-reset" data-act="reset" data-idx="' + idx + '">自動に戻す</button>');
        html.push('</div></div>');
      });
    }
    html.push('</div><div class="v35-foot">💡 編集した内容はテキストエリアからフォーカスが外れたタイミングで自動保存されます</div>');
    modal.innerHTML = html.join('');
    overlay.appendChild(modal); document.body.appendChild(overlay);
    var closeBtn = document.getElementById('v35-close-x');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    modal.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.act === 'reset'){ setOverride(parseInt(t.dataset.idx, 10), ''); renderPanel(); }
    });
    Array.from(modal.querySelectorAll('textarea[data-idx]')).forEach(function(ta){
      ta.addEventListener('blur', function(){
        var idx = parseInt(ta.dataset.idx, 10);
        var val = ta.value.trim();
        var auto = autoSummary(turns[idx]);
        if (val && val !== auto) setOverride(idx, val);
        else setOverride(idx, '');
      });
    });
  }
  function closePanel(){ var ov = document.getElementById('v35-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function injectTopbarButton(){
    if (document.getElementById('v35-topbar-btn')) return true;
    var anchor = document.getElementById('v34-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; }
      }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v35-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '🧠 メモリ';
    btn.title = '長期記憶 (turn 要約) を確認・編集';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderPanel);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function init(){
    var pe = installPlannerExt(); var bi = injectTopbarButton();
    if (pe && bi){ window.__v292Dfix35Active = true; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installPlannerExt() && injectTopbarButton()){ clearInterval(iv); window.__v292Dfix35Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix35Active){
      if (!document.getElementById('v35-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
      if (window.Planner && window.Planner._extensions && !window.Planner._extensions.__v292Dfix35){ if (installPlannerExt()) console.log(TAG, 'sysExt reinstalled'); }
    }
  }, 5000);
  window.__v292Dfix35 = { openPanel: renderPanel, closePanel: closePanel, autoSummary: autoSummary, getSummary: getSummary, buildMemoryContext: buildMemoryContext, loadOverrides: loadOverrides, setOverride: setOverride, MEMORY_WINDOW: MEMORY_WINDOW };
  init();
})();

/* v292Dfix36: 関係性マトリクス
 *
 * 目的 (Phase 2-B):
 *   キャラ間の関係性を構造化して持ち、prompt に注入することで
 *   narrative が「Fiona ⇄ Sakura は守る/守られる関係」「Miria は無口だが信頼厚い」等の
 *   relational continuity を維持できるようにする。fix35 の経緯記憶と相補。
 *
 * 設計:
 *   - schema: localStorage.chr6_relations_<slotId> = { "from||to": { trust, intimacy, label, notes } }
 *     方向性あり (asymmetric)、trust/intimacy は 0-10 整数、label 短い形容、notes 補足
 *   - UI: topbar 「💞 関係」ボタン → matrix grid modal、セルクリックで個別編集
 *   - prompt 注入: Planner._extensions push、ctx.sys 末尾に「【キャラクター関係性】」block
 *
 * 設計原則:
 *   - __v292Dfix36Active フラグで二重 install 防止
 *   - S.cast schema 不侵入 (localStorage 外部保存)
 *   - fix30 active slot 連動
 */
(function v292Dfix36(){
  if (window.__v292Dfix36Active) return;
  var TAG = '[v292Dfix36]';
  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function relKey(){ return 'chr6_relations_' + getActiveSlotId(); }
  function loadRelations(){ try { var v = localStorage.getItem(relKey()); return v ? JSON.parse(v) : {}; } catch(_){ return {}; } }
  function saveRelations(r){ try { localStorage.setItem(relKey(), JSON.stringify(r)); } catch(_){} }
  function pairKey(from, to){ return from + '||' + to; }
  function getRelation(from, to){ var r = loadRelations(); return r[pairKey(from, to)] || null; }
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function setRelation(from, to, data){
    var r = loadRelations(); var k = pairKey(from, to);
    if (data && (data.label || data.trust != null || data.intimacy != null || data.notes)){
      r[k] = { trust: clamp(parseInt(data.trust, 10) || 0, 0, 10), intimacy: clamp(parseInt(data.intimacy, 10) || 0, 0, 10), label: (data.label || '').slice(0, 40), notes: (data.notes || '').slice(0, 200) };
    } else { delete r[k]; }
    saveRelations(r);
  }
  function castNames(){
    try { var st = (typeof S !== 'undefined' && S) ? S : null; if (!st || !st.cast) return [];
      var out = []; if (st.cast.hero && st.cast.hero.name) out.push(String(st.cast.hero.name).trim());
      if (Array.isArray(st.cast.npcs)){ st.cast.npcs.forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); }); }
      return out.filter(function(n){ return !!n; });
    } catch(_){ return []; }
  }
  function buildRelationsContext(){
    var rels = loadRelations(); var names = castNames(); if (!names.length) return '';
    var entries = [];
    for (var i = 0; i < names.length; i++){
      for (var j = 0; j < names.length; j++){
        if (i === j) continue;
        var r = rels[pairKey(names[i], names[j])];
        if (r && (r.label || r.trust || r.intimacy || r.notes)){
          var parts = []; if (r.label) parts.push(r.label);
          var meta = []; if (r.trust) meta.push('信頼 ' + r.trust + '/10'); if (r.intimacy) meta.push('親密 ' + r.intimacy + '/10');
          if (meta.length) parts.push('(' + meta.join(', ') + ')');
          if (r.notes) parts.push('— ' + r.notes);
          entries.push('- ' + names[i] + ' → ' + names[j] + ': ' + parts.join(' '));
        }
      }
    }
    if (!entries.length) return '';
    var lines = ['【キャラクター関係性 (現在)】'].concat(entries);
    lines.push(''); lines.push('上記の関係性を踏まえて、各キャラの言動・心理がそれぞれの相手に対して一貫するように描くこと。');
    return lines.join('\n');
  }
  function sysExt(ctx){ try { var block = buildRelationsContext(); if (!block) return ctx.sys; return ctx.sys + '\n\n' + block; } catch(e){ return ctx.sys; } }
  function installPlannerExt(){
    if (typeof window.Planner === 'undefined' || !window.Planner) return false;
    window.Planner._extensions = window.Planner._extensions || [];
    if (window.Planner._extensions.__v292Dfix36) return true;
    window.Planner._extensions.push(sysExt); window.Planner._extensions.__v292Dfix36 = true;
    return true;
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix36-style')) return;
    var style = document.createElement('style'); style.id = 'v292Dfix36-style';
    style.textContent = ['.v36-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v36-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:720px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v36-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v36-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v36-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v36-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v36-body{flex:1;overflow:auto;padding:14px 18px}','.v36-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:14px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v36-matrix{width:100%;border-collapse:collapse;font-size:12px}','.v36-matrix th{padding:6px 8px;border:1px solid var(--border,rgba(139,118,240,.2));background:var(--bg,#09090f);color:var(--dim,#888);font-weight:600;text-align:left;white-space:nowrap}','.v36-matrix th.corner{background:transparent;border:none}','.v36-matrix th.rowhead{font-weight:600;color:var(--tx);background:var(--bg,#09090f);min-width:90px}','.v36-matrix td{padding:0;border:1px solid var(--border,rgba(139,118,240,.15));vertical-align:top;width:140px}','.v36-cell{display:block;padding:8px;cursor:pointer;height:100%;min-height:60px;background:var(--bg,#09090f);transition:background .15s;color:var(--tx,#e0dcf0)}','.v36-cell:hover{background:var(--s2,#17172a)}','.v36-cell.empty{color:var(--dim,#888);font-style:italic;font-size:11px}','.v36-cell.diag{background:#0a0a13;color:#555;cursor:default;text-align:center;font-size:18px}','.v36-cell-label{font-weight:600;font-size:12px;line-height:1.3;margin-bottom:4px;word-break:break-word}','.v36-cell-bar{display:flex;gap:4px;font-size:10px;color:var(--dim,#888)}','.v36-cell-bar span{padding:1px 5px;background:var(--s2,#17172a);border-radius:3px;white-space:nowrap}','.v36-cell-bar span.t{color:#c49040}','.v36-cell-bar span.i{color:#5a8ef0}','.v36-edit-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:inherit}','.v36-edit-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--acc,#8b76f0);border-radius:8px;padding:18px;width:420px;max-width:92vw;box-shadow:0 8px 32px rgba(0,0,0,.7)}','.v36-edit-modal h3{margin:0 0 12px;font-size:14px;color:var(--acc,#8b76f0);font-weight:600}','.v36-edit-row{margin-bottom:10px;font-size:12px}','.v36-edit-row label{display:block;color:var(--dim,#888);font-size:11px;margin-bottom:4px}','.v36-edit-row input[type="text"], .v36-edit-row textarea{width:100%;background:var(--bg,#09090f);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;box-sizing:border-box}','.v36-edit-row input[type="text"]:focus, .v36-edit-row textarea:focus{outline:none;border-color:var(--acc,#8b76f0)}','.v36-edit-row textarea{resize:vertical;min-height:60px}','.v36-edit-row .num-row{display:flex;gap:14px;align-items:center}','.v36-edit-row input[type="range"]{width:100%;accent-color:var(--acc,#8b76f0)}','.v36-edit-row .num-val{color:var(--acc,#8b76f0);font-weight:600;text-align:right;font-size:13px}','.v36-edit-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}','.v36-btn{background:var(--s2,#17172a);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:inherit}','.v36-btn:hover{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc)}','.v36-btn-primary{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc)}','.v36-btn-danger{color:#e06060;border-color:rgba(224,96,96,.3)}','.v36-btn-danger:hover{background:#e06060;color:#fff;border-color:#e06060}'].join('\n');
    document.head.appendChild(style);
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderMatrix(){
    closeMatrix(); ensureStyles();
    var names = castNames(); var rels = loadRelations();
    var overlay = document.createElement('div'); overlay.className = 'v36-overlay'; overlay.id = 'v36-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeMatrix(); });
    var modal = document.createElement('div'); modal.className = 'v36-modal';
    var html = ['<div class="v36-head"><h2>💞 関係性マトリクス</h2><button class="v36-close" id="v36-close-x">×</button></div>'];
    html.push('<div class="v36-body"><div class="v36-intro">行のキャラ <b>→</b> 列のキャラ への関係性。セルクリックで編集。label・信頼 0-10・親密 0-10・notes が AI に毎ターン注入されます。</div>');
    if (!names.length){ html.push('<div style="padding:20px;text-align:center;color:#888;">キャラ未設定</div>'); }
    else {
      html.push('<table class="v36-matrix"><tr><th class="corner"></th>');
      names.forEach(function(c){ html.push('<th>' + escHtml(c) + '</th>'); });
      html.push('</tr>');
      names.forEach(function(from){
        html.push('<tr><th class="rowhead">' + escHtml(from) + '</th>');
        names.forEach(function(to){
          if (from === to){ html.push('<td><div class="v36-cell diag">—</div></td>'); return; }
          var r = rels[pairKey(from, to)];
          if (r && (r.label || r.trust || r.intimacy || r.notes)){
            html.push('<td><div class="v36-cell" data-from="' + escAttr(from) + '" data-to="' + escAttr(to) + '">');
            if (r.label) html.push('<div class="v36-cell-label">' + escHtml(r.label) + '</div>');
            html.push('<div class="v36-cell-bar">');
            if (r.trust) html.push('<span class="t">信 ' + r.trust + '</span>');
            if (r.intimacy) html.push('<span class="i">親 ' + r.intimacy + '</span>');
            html.push('</div></div></td>');
          } else {
            html.push('<td><div class="v36-cell empty" data-from="' + escAttr(from) + '" data-to="' + escAttr(to) + '">+ 編集</div></td>');
          }
        });
        html.push('</tr>');
      });
      html.push('</table>');
    }
    html.push('</div>');
    modal.innerHTML = html.join(''); overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('v36-close-x').addEventListener('click', closeMatrix);
    modal.addEventListener('click', function(e){
      var cell = e.target.closest('.v36-cell:not(.diag)');
      if (cell){ renderEdit(cell.dataset.from, cell.dataset.to); }
    });
  }
  function closeMatrix(){ var ov = document.getElementById('v36-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function renderEdit(from, to){
    closeEdit(); ensureStyles();
    var r = getRelation(from, to) || { trust: 0, intimacy: 0, label: '', notes: '' };
    var overlay = document.createElement('div'); overlay.className = 'v36-edit-overlay'; overlay.id = 'v36-edit-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeEdit(); });
    var modal = document.createElement('div'); modal.className = 'v36-edit-modal';
    modal.innerHTML = '<h3>' + escHtml(from) + ' → ' + escHtml(to) + ' の関係性</h3>' +
      '<div class="v36-edit-row"><label>label (短い形容、40字まで)</label><input type="text" id="v36-label" maxlength="40" value="' + escAttr(r.label) + '" placeholder="例: 守りたい妹分 / 警戒する敵 / 旧知の友"></div>' +
      '<div class="v36-edit-row"><label>信頼 <span class="num-val" id="v36-trust-val">' + r.trust + '</span> / 10</label><input type="range" id="v36-trust" min="0" max="10" value="' + r.trust + '"></div>' +
      '<div class="v36-edit-row"><label>親密 <span class="num-val" id="v36-intimacy-val">' + r.intimacy + '</span> / 10</label><input type="range" id="v36-intimacy" min="0" max="10" value="' + r.intimacy + '"></div>' +
      '<div class="v36-edit-row"><label>notes (補足、200字まで)</label><textarea id="v36-notes" maxlength="200" placeholder="共有した過去 / 秘密 / きっかけ等">' + escHtml(r.notes) + '</textarea></div>' +
      '<div class="v36-edit-actions"><button class="v36-btn v36-btn-danger" id="v36-edit-clear">クリア</button><button class="v36-btn" id="v36-edit-cancel">キャンセル</button><button class="v36-btn v36-btn-primary" id="v36-edit-save">保存</button></div>';
    overlay.appendChild(modal); document.body.appendChild(overlay);
    var trustEl = document.getElementById('v36-trust'), trustVal = document.getElementById('v36-trust-val');
    var intimacyEl = document.getElementById('v36-intimacy'), intimacyVal = document.getElementById('v36-intimacy-val');
    trustEl.addEventListener('input', function(){ trustVal.textContent = trustEl.value; });
    intimacyEl.addEventListener('input', function(){ intimacyVal.textContent = intimacyEl.value; });
    document.getElementById('v36-edit-cancel').addEventListener('click', closeEdit);
    document.getElementById('v36-edit-clear').addEventListener('click', function(){
      if (!confirm(from + ' → ' + to + ' の関係性をクリア?')) return;
      setRelation(from, to, null); closeEdit(); renderMatrix();
    });
    document.getElementById('v36-edit-save').addEventListener('click', function(){
      setRelation(from, to, { label: document.getElementById('v36-label').value, trust: trustEl.value, intimacy: intimacyEl.value, notes: document.getElementById('v36-notes').value });
      closeEdit(); renderMatrix();
    });
  }
  function closeEdit(){ var ov = document.getElementById('v36-edit-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function injectTopbarButton(){
    if (document.getElementById('v36-topbar-btn')) return true;
    var anchor = document.getElementById('v35-topbar-btn') || document.getElementById('v34-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; }
      }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v36-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '💞 関係'; btn.title = 'キャラクター関係性マトリクス';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderMatrix);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function init(){
    if (installPlannerExt() && injectTopbarButton()){ window.__v292Dfix36Active = true; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installPlannerExt() && injectTopbarButton()){ clearInterval(iv); window.__v292Dfix36Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix36Active){
      if (!document.getElementById('v36-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
      if (window.Planner && window.Planner._extensions && !window.Planner._extensions.__v292Dfix36){ if (installPlannerExt()) console.log(TAG, 'sysExt reinstalled'); }
    }
  }, 5000);
  window.__v292Dfix36 = { openMatrix: renderMatrix, closeMatrix: closeMatrix, openEdit: renderEdit, loadRelations: loadRelations, getRelation: getRelation, setRelation: setRelation, buildRelationsContext: buildRelationsContext };
  init();
})();

/* v292Dfix37: シーン境界 + 過去シーン圧縮
 *
 * 目的 (Phase 2-C):
 *   長セッションで turn 数が増えると、fix35 の「直近 N turn」だけでは古い文脈が失われる。
 *   fix37 では turn を「シーン」単位にグループ化し、過去シーンを 1-2 行要約として
 *   prompt に注入することで、長期 continuity を維持する。
 *
 * 設計:
 *   - シーン境界: localStorage.chr6_scene_breaks_<slotId> = [turnIdx, ...] (新シーン開始 turn)
 *   - シーン要約: localStorage.chr6_scene_summaries_<slotId> = {sceneIdx: "..."}
 *   - buildScenes(turns): 境界をもとに scenes = [{idx, startTurn, endTurn, summary}] を構築
 *   - prompt 注入: 「【過去シーン要約】」block を ctx.sys 末尾に追加 (現在シーンは除く)
 *     fix35 の「これまでの経緯 (直近 N turn)」と coexist — fix35 = 詳細 / fix37 = 高レベル
 *   - UI: topbar 「🎬 シーン管理」ボタン → modal (シーン list + 境界 toggle)
 *
 * 設計原則:
 *   - __v292Dfix37Active フラグで二重 install 防止
 *   - S.turns schema 不侵入 (境界 + 要約 とも localStorage 外部保存)
 *   - fix30 active slot 連動 / fix34 fix35 と非競合
 */
(function v292Dfix37(){
  if (window.__v292Dfix37Active) return;
  var TAG = '[v292Dfix37]';
  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function breaksKey(){ return 'chr6_scene_breaks_' + getActiveSlotId(); }
  function summariesKey(){ return 'chr6_scene_summaries_' + getActiveSlotId(); }
  function loadBreaks(){ try { var v = localStorage.getItem(breaksKey()); var arr = v ? JSON.parse(v) : []; return Array.isArray(arr) ? arr.sort(function(a,b){ return a-b; }) : []; } catch(_){ return []; } }
  function saveBreaks(arr){ try { localStorage.setItem(breaksKey(), JSON.stringify((arr || []).sort(function(a,b){ return a-b; }))); } catch(_){} }
  function toggleBreak(turnIdx){ var arr = loadBreaks(); var pos = arr.indexOf(turnIdx); if (pos >= 0) arr.splice(pos, 1); else arr.push(turnIdx); saveBreaks(arr); }
  function loadSummaries(){ try { var v = localStorage.getItem(summariesKey()); return v ? JSON.parse(v) : {}; } catch(_){ return {}; } }
  function saveSummaries(o){ try { localStorage.setItem(summariesKey(), JSON.stringify(o)); } catch(_){} }
  function setSummary(sceneIdx, summary){ var o = loadSummaries(); if (summary && summary.trim()) o[sceneIdx] = String(summary).trim().slice(0, 200); else delete o[sceneIdx]; saveSummaries(o); }
  function autoSceneSummary(scene, turns){
    if (window.__v292Dfix35 && typeof window.__v292Dfix35.autoSummary === 'function'){
      var firstTurn = turns[scene.startTurn]; if (firstTurn) return window.__v292Dfix35.autoSummary(firstTurn);
    }
    var t = turns[scene.startTurn]; if (!t) return '';
    var src = (typeof t.narrative === 'string') ? t.narrative : (t.playerText || '');
    return String(src).slice(0, 60) + '…';
  }
  function buildScenes(turns){
    if (!Array.isArray(turns) || !turns.length) return [];
    var rawBreaks = loadBreaks();
    var breaks = [0].concat(rawBreaks.filter(function(i){ return i > 0 && i < turns.length; }));
    breaks = Array.from(new Set(breaks)).sort(function(a,b){ return a-b; });
    var summaries = loadSummaries();
    var scenes = [];
    for (var i = 0; i < breaks.length; i++){
      var startTurn = breaks[i];
      var endTurn = (i + 1 < breaks.length) ? (breaks[i+1] - 1) : (turns.length - 1);
      var scene = { idx: i, startTurn: startTurn, endTurn: endTurn, customSummary: summaries[i] || '' };
      scene.summary = scene.customSummary || autoSceneSummary(scene, turns);
      scenes.push(scene);
    }
    return scenes;
  }
  function buildPastScenesContext(){
    var st = (typeof S !== 'undefined' && S) ? S : null;
    if (!st || !Array.isArray(st.turns) || !st.turns.length) return '';
    var scenes = buildScenes(st.turns);
    if (scenes.length <= 1) return '';
    var pastScenes = scenes.slice(0, -1);
    var lines = ['【過去シーン要約 (高レベル)】'];
    pastScenes.forEach(function(s){
      var rangeNote = '(turn ' + (s.startTurn+1) + (s.endTurn !== s.startTurn ? '-' + (s.endTurn+1) : '') + ')';
      lines.push('- 第' + (s.idx+1) + 'シーン ' + rangeNote + ': ' + s.summary);
    });
    var current = scenes[scenes.length - 1];
    lines.push(''); lines.push('現在のシーン: 第' + (current.idx+1) + 'シーン (turn ' + (current.startTurn+1) + ' から) — 詳細は別途「これまでの経緯」を参照。');
    lines.push('過去シーンとの一貫性を保ち、過去の出来事を踏まえて現在を描くこと。');
    return lines.join('\n');
  }
  function sysExt(ctx){ try { var block = buildPastScenesContext(); if (!block) return ctx.sys; return ctx.sys + '\n\n' + block; } catch(e){ return ctx.sys; } }
  function installPlannerExt(){
    if (typeof window.Planner === 'undefined' || !window.Planner) return false;
    window.Planner._extensions = window.Planner._extensions || [];
    if (window.Planner._extensions.__v292Dfix37) return true;
    window.Planner._extensions.push(sysExt); window.Planner._extensions.__v292Dfix37 = true;
    return true;
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix37-style')) return;
    var style = document.createElement('style'); style.id = 'v292Dfix37-style';
    style.textContent = ['.v37-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v37-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:660px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v37-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v37-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v37-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v37-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v37-body{flex:1;overflow:auto;padding:14px 18px}','.v37-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:14px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v37-section-title{font-size:11px;color:var(--dim,#888);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border,rgba(139,118,240,.15))}','.v37-scene{border:1px solid var(--border,rgba(139,118,240,.15));border-radius:6px;padding:10px 12px;margin-bottom:8px;background:var(--bg,#09090f)}','.v37-scene.current{border-color:var(--acc,#8b76f0);background:var(--s2,#17172a)}','.v37-scene-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}','.v37-scene-num{font-weight:600;color:var(--acc,#8b76f0);font-size:13px}','.v37-scene-range{font-size:11px;color:var(--dim,#888)}','.v37-scene-badge{margin-left:auto;font-size:10px;background:var(--acc,#8b76f0);color:#fff;padding:1px 6px;border-radius:3px;font-weight:600}','.v37-scene-summary{margin-top:6px}','.v37-scene-summary textarea{width:100%;background:var(--bg,#09090f);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:6px 8px;font-size:12px;font-family:inherit;line-height:1.4;resize:vertical;min-height:34px;box-sizing:border-box}','.v37-scene-summary textarea:focus{outline:none;border-color:var(--acc,#8b76f0)}','.v37-scene-summary textarea.custom{border-color:var(--acc,#8b76f0)}','.v37-breaks{margin-top:10px}','.v37-turn-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;font-size:12px;border-bottom:1px solid var(--border,rgba(139,118,240,.1))}','.v37-turn-row:hover{background:var(--s2,#17172a)}','.v37-turn-num{font-weight:600;color:var(--dim,#888);min-width:50px}','.v37-turn-preview{flex:1;color:var(--tx,#e0dcf0);opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}','.v37-toggle-btn{background:var(--s2,#17172a);color:var(--dim,#888);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap}','.v37-toggle-btn.on{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc,#8b76f0)}','.v37-toggle-btn:hover{border-color:var(--acc,#8b76f0)}'].join('\n');
    document.head.appendChild(style);
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderManager(){
    closeManager(); ensureStyles();
    var st = (typeof S !== 'undefined' && S) ? S : null;
    var turns = (st && Array.isArray(st.turns)) ? st.turns : [];
    var scenes = buildScenes(turns); var breaks = loadBreaks();
    var overlay = document.createElement('div'); overlay.className = 'v37-overlay'; overlay.id = 'v37-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeManager(); });
    var modal = document.createElement('div'); modal.className = 'v37-modal';
    var html = ['<div class="v37-head"><h2>🎬 シーン管理</h2><button class="v37-close" id="v37-close-x">×</button></div>'];
    html.push('<div class="v37-body"><div class="v37-intro">長い物語を <b>シーン</b> 単位で区切ります。<b>過去シーン</b>は要約として AI に注入され、<b>現在シーン</b>は fix35 の詳細経緯として注入されます。要約は手動編集可能 (空にすれば自動推測)。</div>');
    html.push('<div class="v37-section-title">シーン一覧 (' + scenes.length + ' 個)</div>');
    if (!scenes.length){ html.push('<div style="padding:14px;color:#888;text-align:center;font-size:12px;">turn なし</div>'); }
    else {
      scenes.forEach(function(s, sceneIdx){
        var isCurrent = (sceneIdx === scenes.length - 1);
        var hasCustom = !!s.customSummary;
        var displaySummary = hasCustom ? s.customSummary : s.summary;
        var rangeNote = 'turn ' + (s.startTurn+1) + (s.endTurn !== s.startTurn ? '〜' + (s.endTurn+1) : '');
        html.push('<div class="v37-scene' + (isCurrent ? ' current' : '') + '" data-scene="' + sceneIdx + '"><div class="v37-scene-head"><span class="v37-scene-num">第' + (sceneIdx+1) + 'シーン</span><span class="v37-scene-range">' + rangeNote + '</span>');
        if (isCurrent) html.push('<span class="v37-scene-badge">現在</span>');
        html.push('</div><div class="v37-scene-summary"><textarea data-scene="' + sceneIdx + '" class="' + (hasCustom ? 'custom' : '') + '" rows="2" placeholder="要約 (自動推測)">' + escHtml(displaySummary) + '</textarea></div></div>');
      });
    }
    if (turns.length > 1){
      html.push('<div class="v37-section-title">シーン境界の設定</div><div class="v37-breaks">');
      turns.forEach(function(t, idx){
        if (idx === 0) return;
        var isBreak = breaks.indexOf(idx) >= 0;
        var preview = '';
        if (typeof t.narrative === 'string') preview = t.narrative.slice(0, 60);
        else if (Array.isArray(t.narrative)){
          for (var i = 0; i < t.narrative.length; i++){
            var n = t.narrative[i];
            if (typeof n === 'string'){ preview = n.slice(0, 60); break; }
            if (n && typeof n === 'object' && typeof n.text === 'string'){ preview = n.text.slice(0, 60); break; }
          }
        }
        if (!preview) preview = (t.playerText || '').slice(0, 60);
        html.push('<div class="v37-turn-row"><span class="v37-turn-num">turn ' + (idx+1) + '</span><span class="v37-turn-preview">' + escHtml(preview) + '</span><button class="v37-toggle-btn ' + (isBreak ? 'on' : '') + '" data-act="toggle-break" data-idx="' + idx + '">' + (isBreak ? '✓ 区切り中' : 'シーン区切り') + '</button></div>');
      });
      html.push('</div>');
    }
    html.push('</div>');
    modal.innerHTML = html.join(''); overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('v37-close-x').addEventListener('click', closeManager);
    modal.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.act === 'toggle-break'){ toggleBreak(parseInt(t.dataset.idx, 10)); renderManager(); }
    });
    Array.from(modal.querySelectorAll('textarea[data-scene]')).forEach(function(ta){
      ta.addEventListener('blur', function(){
        var sceneIdx = parseInt(ta.dataset.scene, 10);
        var val = ta.value.trim();
        var auto = autoSceneSummary({ startTurn: scenes[sceneIdx].startTurn }, turns);
        if (val && val !== auto) setSummary(sceneIdx, val);
        else setSummary(sceneIdx, '');
      });
    });
  }
  function closeManager(){ var ov = document.getElementById('v37-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function injectTopbarButton(){
    if (document.getElementById('v37-topbar-btn')) return true;
    var anchor = document.getElementById('v36-topbar-btn') || document.getElementById('v35-topbar-btn') || document.getElementById('v34-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; }
      }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v37-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '🎬 シーン管理'; btn.title = 'シーン境界 + 過去シーン要約';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderManager);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function init(){
    if (installPlannerExt() && injectTopbarButton()){ window.__v292Dfix37Active = true; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installPlannerExt() && injectTopbarButton()){ clearInterval(iv); window.__v292Dfix37Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix37Active){
      if (!document.getElementById('v37-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
      if (window.Planner && window.Planner._extensions && !window.Planner._extensions.__v292Dfix37){ if (installPlannerExt()) console.log(TAG, 'sysExt reinstalled'); }
    }
  }, 5000);
  window.__v292Dfix37 = { openManager: renderManager, closeManager: closeManager, buildScenes: buildScenes, buildPastScenesContext: buildPastScenesContext, loadBreaks: loadBreaks, saveBreaks: saveBreaks, toggleBreak: toggleBreak, loadSummaries: loadSummaries, setSummary: setSummary };
  init();
})();

/* v292Dfix38: キャラクター状態 (emotional/physical soft stat) + prompt 注入
 *
 * 目的 (Phase 3-A):
 *   各キャラに soft な状態軸を持たせ、narrative に滲ませる。
 *   D&D 的な HP/MP ではなく narrative-friendly な軸:
 *     体力 (stamina), 怪我 (injury), 集中 (focus), 動揺 (agitation), 気力 (resolve), 気分 (mood)
 *   行動を gate せず、AI が「状態に応じた表現の選択」をするためのヒントとして prompt 注入。
 *
 * 設計:
 *   - schema: localStorage.chr6_char_states_<slotId> = { name: { stamina, injury, focus, agitation, resolve, mood, notes } }
 *   - prompt 注入: Planner._extensions で「【現在のキャラクター状態】」block を ctx.sys 末尾に push
 *   - UI: topbar 「💪 状態」ボタン → modal で全キャラ状態 (slider + notes) 編集
 *   - fix30 active slot 連動 / fix35-37 と coexist
 *
 * 設計原則:
 *   - __v292Dfix38Active フラグで二重 install 防止
 *   - S.cast schema 不侵入 (localStorage 外部保存)
 */
(function v292Dfix38(){
  if (window.__v292Dfix38Active) return;
  var TAG = '[v292Dfix38]';
  var STAT_AXES = [
    { key: 'stamina', label: '体力', lo: '疲労困憊', hi: '元気', defaultV: 7, color: '#6aaf78' },
    { key: 'injury', label: '怪我', lo: '無傷', hi: '重傷', defaultV: 0, color: '#e06060' },
    { key: 'focus', label: '集中', lo: '散漫', hi: '研ぎ澄ま', defaultV: 6, color: '#5a8ef0' },
    { key: 'agitation', label: '動揺', lo: '冷静', hi: 'パニック', defaultV: 3, color: '#c49040' },
    { key: 'resolve', label: '気力', lo: '絶望', hi: '決意', defaultV: 6, color: '#8b76f0' },
    { key: 'mood', label: '気分', lo: '憂鬱', hi: '高揚', defaultV: 5, color: '#a060a0' }
  ];
  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function statesKey(){ return 'chr6_char_states_' + getActiveSlotId(); }
  function loadStates(){ try { var v = localStorage.getItem(statesKey()); return v ? JSON.parse(v) : {}; } catch(_){ return {}; } }
  function saveStates(s){ try { localStorage.setItem(statesKey(), JSON.stringify(s)); } catch(_){} }
  function defaultState(){ var o = { notes: '' }; STAT_AXES.forEach(function(ax){ o[ax.key] = ax.defaultV; }); return o; }
  function getCharState(name){ var all = loadStates(); return all[name] || defaultState(); }
  function setCharStat(name, key, value){ var all = loadStates(); all[name] = all[name] || defaultState(); all[name][key] = Math.max(0, Math.min(10, parseInt(value, 10) || 0)); saveStates(all); }
  function setCharNotes(name, notes){ var all = loadStates(); all[name] = all[name] || defaultState(); all[name].notes = (notes || '').slice(0, 60); saveStates(all); }
  function resetChar(name){ var all = loadStates(); delete all[name]; saveStates(all); }
  function castNames(){
    try { var st = (typeof S !== 'undefined' && S) ? S : null; if (!st || !st.cast) return [];
      var out = []; if (st.cast.hero && st.cast.hero.name) out.push(String(st.cast.hero.name).trim());
      if (Array.isArray(st.cast.npcs)){ st.cast.npcs.forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); }); }
      return out.filter(function(n){ return !!n; });
    } catch(_){ return []; }
  }
  function describeState(state){
    if (!state) return '';
    var parts = [];
    if (state.stamina <= 3) parts.push('体力低下'); else if (state.stamina >= 8) parts.push('元気');
    if (state.injury >= 7) parts.push('重傷'); else if (state.injury >= 4) parts.push('負傷');
    if (state.focus >= 8) parts.push('集中状態'); else if (state.focus <= 3) parts.push('注意散漫');
    if (state.agitation >= 7) parts.push('動揺/パニック'); else if (state.agitation >= 5) parts.push('やや動揺');
    if (state.resolve >= 8) parts.push('決意'); else if (state.resolve <= 3) parts.push('意気消沈');
    if (state.mood >= 8) parts.push('高揚'); else if (state.mood <= 3) parts.push('憂鬱');
    return parts.join(' / ');
  }
  function buildStateContext(){
    var names = castNames(); if (!names.length) return '';
    var states = loadStates(); var entries = [];
    names.forEach(function(name){
      var s = states[name]; if (!s) return;
      var desc = describeState(s);
      var line = '- ' + name + ':'; if (desc) line += ' ' + desc;
      var nums = STAT_AXES.map(function(ax){ return ax.label + ' ' + (s[ax.key] != null ? s[ax.key] : ax.defaultV); }).join(' / ');
      line += ' [' + nums + ']';
      if (s.notes) line += '\n  メモ: ' + s.notes;
      entries.push(line);
    });
    if (!entries.length) return '';
    var lines = ['【現在のキャラクター状態】'].concat(entries);
    lines.push(''); lines.push('上記の状態を narrative に反映すること: 動揺中なら震える/声がうわずる、疲労中なら息切れする、決意中なら毅然と振る舞う、負傷中ならかばう動作、等。');
    lines.push('状態を数字で書かず、表現として自然に滲ませる。');
    return lines.join('\n');
  }
  function sysExt(ctx){ try { var block = buildStateContext(); if (!block) return ctx.sys; return ctx.sys + '\n\n' + block; } catch(e){ return ctx.sys; } }
  function installPlannerExt(){
    if (typeof window.Planner === 'undefined' || !window.Planner) return false;
    window.Planner._extensions = window.Planner._extensions || [];
    if (window.Planner._extensions.__v292Dfix38) return true;
    window.Planner._extensions.push(sysExt); window.Planner._extensions.__v292Dfix38 = true;
    return true;
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix38-style')) return;
    var style = document.createElement('style'); style.id = 'v292Dfix38-style';
    style.textContent = ['.v38-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v38-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:660px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v38-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v38-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v38-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v38-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v38-body{flex:1;overflow:auto;padding:14px 18px}','.v38-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:14px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v38-char{border:1px solid var(--border,rgba(139,118,240,.15));border-radius:6px;padding:12px;margin-bottom:10px;background:var(--bg,#09090f)}','.v38-char-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border,rgba(139,118,240,.1))}','.v38-char-name{font-weight:600;font-size:14px;color:var(--tx,#e0dcf0);flex:1}','.v38-char-summary{font-size:11px;color:var(--acc,#8b76f0);font-style:italic}','.v38-reset{background:none;border:1px solid var(--border,rgba(139,118,240,.2));color:var(--dim,#888);padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit}','.v38-reset:hover{color:#e06060;border-color:rgba(224,96,96,.4)}','.v38-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}','.v38-stat{display:flex;flex-direction:column;gap:3px}','.v38-stat-head{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dim,#888)}','.v38-stat-label{font-weight:600;color:var(--tx,#e0dcf0);min-width:34px}','.v38-stat-val{margin-left:auto;font-weight:600;font-size:12px}','.v38-stat-band{font-size:10px;color:var(--dim,#888)}','.v38-stat input[type="range"]{width:100%;accent-color:var(--acc,#8b76f0);height:14px}','.v38-notes{margin-top:8px}','.v38-notes label{display:block;font-size:11px;color:var(--dim,#888);margin-bottom:3px}','.v38-notes input{width:100%;background:var(--bg,#09090f);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:5px 8px;font-size:12px;font-family:inherit;box-sizing:border-box}','.v38-notes input:focus{outline:none;border-color:var(--acc,#8b76f0)}'].join('\n');
    document.head.appendChild(style);
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderPanel(){
    closePanel(); ensureStyles();
    var names = castNames(); var states = loadStates();
    var overlay = document.createElement('div'); overlay.className = 'v38-overlay'; overlay.id = 'v38-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closePanel(); });
    var modal = document.createElement('div'); modal.className = 'v38-modal';
    var html = ['<div class="v38-head"><h2>💪 キャラクター状態</h2><button class="v38-close" id="v38-close-x">×</button></div>'];
    html.push('<div class="v38-body"><div class="v38-intro">各キャラの <b>体力 / 怪我 / 集中 / 動揺 / 気力 / 気分</b> を 0-10 で設定。AI は状態を数字ではなく <b>表現</b> として narrative に滲ませます (動揺中なら声が震える、決意中なら毅然と、等)。状態未設定のキャラは prompt に含まれません。</div>');
    if (!names.length){ html.push('<div style="padding:20px;text-align:center;color:#888;font-size:12px;">キャラ未設定</div>'); }
    else {
      names.forEach(function(name){
        var s = states[name] || defaultState();
        var summary = describeState(s) || '平静';
        html.push('<div class="v38-char" data-char="' + escAttr(name) + '"><div class="v38-char-head"><span class="v38-char-name">' + escHtml(name) + '</span><span class="v38-char-summary">' + escHtml(summary) + '</span>');
        if (states[name]) html.push('<button class="v38-reset" data-act="reset" data-char="' + escAttr(name) + '">リセット</button>');
        html.push('</div><div class="v38-stats">');
        STAT_AXES.forEach(function(ax){
          var v = (s[ax.key] != null) ? s[ax.key] : ax.defaultV;
          html.push('<div class="v38-stat" data-key="' + ax.key + '"><div class="v38-stat-head"><span class="v38-stat-label" style="color:' + ax.color + '">' + ax.label + '</span><span class="v38-stat-band">' + ax.lo + ' ↔ ' + ax.hi + '</span><span class="v38-stat-val" style="color:' + ax.color + '">' + v + '/10</span></div><input type="range" min="0" max="10" value="' + v + '" data-char="' + escAttr(name) + '" data-key="' + ax.key + '"></div>');
        });
        html.push('</div><div class="v38-notes"><label>現在の様子 (短いメモ、60字まで)</label><input type="text" maxlength="60" data-char="' + escAttr(name) + '" data-key="notes" value="' + escAttr(s.notes || '') + '" placeholder="例: 怪異への恐怖でフィオナにしがみつく"></div></div>');
      });
    }
    html.push('</div>');
    modal.innerHTML = html.join(''); overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('v38-close-x').addEventListener('click', closePanel);
    modal.addEventListener('input', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.char && t.dataset.key){
        if (t.type === 'range'){ setCharStat(t.dataset.char, t.dataset.key, t.value); var valEl = t.parentElement.querySelector('.v38-stat-val'); if (valEl) valEl.textContent = t.value + '/10'; }
      }
    });
    modal.addEventListener('change', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.char && t.dataset.key === 'notes'){ setCharNotes(t.dataset.char, t.value); }
    });
    modal.addEventListener('blur', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.char && t.dataset.key === 'notes'){ setCharNotes(t.dataset.char, t.value); }
    }, true);
    modal.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.act === 'reset'){
        if (!confirm(t.dataset.char + ' の状態を完全リセットしますか?')) return;
        resetChar(t.dataset.char); renderPanel();
      }
    });
  }
  function closePanel(){ var ov = document.getElementById('v38-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function injectTopbarButton(){
    if (document.getElementById('v38-topbar-btn')) return true;
    var anchor = document.getElementById('v37-topbar-btn') || document.getElementById('v36-topbar-btn') || document.getElementById('v35-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; }
      }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v38-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '💪 状態'; btn.title = 'キャラクター状態 (体力/集中/動揺/気力 等)';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderPanel);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function init(){
    if (installPlannerExt() && injectTopbarButton()){ window.__v292Dfix38Active = true; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installPlannerExt() && injectTopbarButton()){ clearInterval(iv); window.__v292Dfix38Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix38Active){
      if (!document.getElementById('v38-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
      if (window.Planner && window.Planner._extensions && !window.Planner._extensions.__v292Dfix38){ if (installPlannerExt()) console.log(TAG, 'sysExt reinstalled'); }
    }
  }, 5000);
  window.__v292Dfix38 = { openPanel: renderPanel, closePanel: closePanel, loadStates: loadStates, getCharState: getCharState, setCharStat: setCharStat, setCharNotes: setCharNotes, resetChar: resetChar, describeState: describeState, buildStateContext: buildStateContext, STAT_AXES: STAT_AXES };
  init();
})();

/* v292Dfix39: ステータスフラグ (status flags / narrative tags)
 *
 * 目的 (Phase 3-B): fix38 数値 stat より具体的な「物語タグ」を char ごとに付与。
 *   例: 「怪我 (左肩)」「魅了されてる」「決意した」「呪われている」「酔っている」
 *   AI は narrative の前提として参照する。
 *
 * 設計:
 *   - schema: localStorage.chr6_char_flags_<slotId> = { name: [tag1, tag2, ...] }
 *   - prompt 注入: Planner._extensions で「【現在の状態フラグ】」block を ctx.sys 末尾に push
 *   - UI: topbar 「🏷 タグ」 → modal で char ごとの list 編集 (Enter で追加、× で削除)
 *   - fix30 active slot 連動 / fix38 と coexist
 *
 * 設計原則: __v292Dfix39Active フラグ、S.cast schema 不侵入、各 12 タグまで
 */
(function v292Dfix39(){
  if (window.__v292Dfix39Active) return;
  var TAG = '[v292Dfix39]';
  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function flagsKey(){ return 'chr6_char_flags_' + getActiveSlotId(); }
  function loadFlags(){ try { var v = localStorage.getItem(flagsKey()); return v ? JSON.parse(v) : {}; } catch(_){ return {}; } }
  function saveFlags(f){ try { localStorage.setItem(flagsKey(), JSON.stringify(f)); } catch(_){} }
  function getCharFlags(name){ var all = loadFlags(); return Array.isArray(all[name]) ? all[name] : []; }
  function addFlag(name, tag){
    var all = loadFlags(); var arr = Array.isArray(all[name]) ? all[name] : [];
    tag = (tag || '').trim().slice(0, 40); if (!tag) return;
    if (arr.indexOf(tag) >= 0) return;
    arr.push(tag); if (arr.length > 12) arr.shift();
    all[name] = arr; saveFlags(all);
  }
  function removeFlag(name, tag){
    var all = loadFlags(); if (!Array.isArray(all[name])) return;
    all[name] = all[name].filter(function(t){ return t !== tag; });
    if (!all[name].length) delete all[name];
    saveFlags(all);
  }
  function castNames(){
    try { var st = (typeof S !== 'undefined' && S) ? S : null; if (!st || !st.cast) return [];
      var out = []; if (st.cast.hero && st.cast.hero.name) out.push(String(st.cast.hero.name).trim());
      if (Array.isArray(st.cast.npcs)){ st.cast.npcs.forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); }); }
      return out.filter(function(n){ return !!n; });
    } catch(_){ return []; }
  }
  function buildFlagsContext(){
    var names = castNames(); if (!names.length) return '';
    var all = loadFlags(); var entries = [];
    names.forEach(function(name){
      var flags = Array.isArray(all[name]) ? all[name] : [];
      if (!flags.length) return;
      entries.push('- ' + name + ': ' + flags.map(function(t){ return '[' + t + ']'; }).join(' '));
    });
    if (!entries.length) return '';
    var lines = ['【現在の状態フラグ (narrative の前提)】'].concat(entries);
    lines.push(''); lines.push('上記のフラグは各キャラの現在進行中の状態。narrative で動作・台詞・反応に反映すること (怪我フラグなら該当部位をかばう、魅了フラグなら相手の言動への抵抗が弱まる、等)。');
    return lines.join('\n');
  }
  function sysExt(ctx){ try { var block = buildFlagsContext(); if (!block) return ctx.sys; return ctx.sys + '\n\n' + block; } catch(e){ return ctx.sys; } }
  function installPlannerExt(){
    if (typeof window.Planner === 'undefined' || !window.Planner) return false;
    window.Planner._extensions = window.Planner._extensions || [];
    if (window.Planner._extensions.__v292Dfix39) return true;
    window.Planner._extensions.push(sysExt); window.Planner._extensions.__v292Dfix39 = true;
    return true;
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix39-style')) return;
    var style = document.createElement('style'); style.id = 'v292Dfix39-style';
    style.textContent = ['.v39-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v39-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:560px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v39-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v39-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v39-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v39-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v39-body{flex:1;overflow:auto;padding:14px 18px}','.v39-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:12px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v39-char{border:1px solid var(--border,rgba(139,118,240,.15));border-radius:6px;padding:10px 12px;margin-bottom:8px;background:var(--bg,#09090f)}','.v39-char-name{font-weight:600;font-size:13px;color:var(--tx,#e0dcf0);margin-bottom:8px;display:flex;align-items:center;gap:8px}','.v39-char-count{font-size:10px;color:var(--dim,#888);font-weight:normal}','.v39-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;min-height:28px;align-items:center}','.v39-tag{background:rgba(139,118,240,.15);border:1px solid rgba(139,118,240,.3);color:var(--tx,#e0dcf0);padding:3px 8px 3px 10px;border-radius:12px;font-size:12px;display:inline-flex;align-items:center;gap:6px}','.v39-tag-remove{background:none;border:none;color:var(--dim,#888);cursor:pointer;font-size:14px;padding:0;line-height:1;font-family:inherit}','.v39-tag-remove:hover{color:#e06060}','.v39-empty{font-size:11px;color:var(--dim,#888);font-style:italic}','.v39-add{display:flex;gap:6px}','.v39-add input{flex:1;background:var(--bg,#09090f);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:5px 8px;font-size:12px;font-family:inherit;box-sizing:border-box}','.v39-add input:focus{outline:none;border-color:var(--acc,#8b76f0)}','.v39-add button{background:var(--acc,#8b76f0);color:#fff;border:1px solid var(--acc,#8b76f0);border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}','.v39-add button:hover{filter:brightness(1.15)}'].join('\n');
    document.head.appendChild(style);
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderPanel(){
    closePanel(); ensureStyles();
    var names = castNames(); var all = loadFlags();
    var overlay = document.createElement('div'); overlay.className = 'v39-overlay'; overlay.id = 'v39-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closePanel(); });
    var modal = document.createElement('div'); modal.className = 'v39-modal';
    var html = ['<div class="v39-head"><h2>🏷 状態フラグ</h2><button class="v39-close" id="v39-close-x">×</button></div>'];
    html.push('<div class="v39-body"><div class="v39-intro">各キャラに <b>具体的な状態タグ</b> を付与 (例: 「怪我 (左肩)」「魅了されてる」「決意した」「呪い」)。fix38 の数値 stat と組み合わせると AI がより具体的な narrative を書きます。各 12 個まで保持、Enter で追加。</div>');
    if (!names.length){ html.push('<div style="padding:20px;text-align:center;color:#888;font-size:12px;">キャラ未設定</div>'); }
    else {
      names.forEach(function(name){
        var flags = all[name] || [];
        html.push('<div class="v39-char"><div class="v39-char-name">' + escHtml(name) + '<span class="v39-char-count">' + flags.length + ' タグ</span></div><div class="v39-tags">');
        if (!flags.length){ html.push('<span class="v39-empty">タグなし</span>'); }
        else {
          flags.forEach(function(tag){
            html.push('<span class="v39-tag">' + escHtml(tag) + ' <button class="v39-tag-remove" data-act="remove" data-name="' + escAttr(name) + '" data-tag="' + escAttr(tag) + '">×</button></span>');
          });
        }
        html.push('</div><div class="v39-add"><input type="text" data-char="' + escAttr(name) + '" maxlength="40" placeholder="新しいタグ (Enter で追加)"><button data-act="add" data-name="' + escAttr(name) + '">追加</button></div></div>');
      });
    }
    html.push('</div>');
    modal.innerHTML = html.join(''); overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('v39-close-x').addEventListener('click', closePanel);
    modal.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.dataset && t.dataset.act === 'remove'){ removeFlag(t.dataset.name, t.dataset.tag); renderPanel(); return; }
      if (t && t.dataset && t.dataset.act === 'add'){
        var inp = t.parentElement.querySelector('input[data-char="' + (t.dataset.name).replace(/"/g, '\\"') + '"]');
        if (inp && inp.value.trim()){ addFlag(t.dataset.name, inp.value); renderPanel(); }
      }
    });
    modal.addEventListener('keydown', function(e){
      var t = e.target;
      if (e.key === 'Enter' && t && t.dataset && t.dataset.char){
        if (t.value.trim()){ addFlag(t.dataset.char, t.value); renderPanel(); }
      }
    });
  }
  function closePanel(){ var ov = document.getElementById('v39-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function injectTopbarButton(){
    if (document.getElementById('v39-topbar-btn')) return true;
    var anchor = document.getElementById('v38-topbar-btn') || document.getElementById('v37-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; }
      }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v39-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '🏷 タグ'; btn.title = '状態フラグ';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderPanel);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function init(){
    if (installPlannerExt() && injectTopbarButton()){ window.__v292Dfix39Active = true; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installPlannerExt() && injectTopbarButton()){ clearInterval(iv); window.__v292Dfix39Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix39Active){
      if (!document.getElementById('v39-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
      if (window.Planner && window.Planner._extensions && !window.Planner._extensions.__v292Dfix39){ if (installPlannerExt()) console.log(TAG, 'sysExt reinstalled'); }
    }
  }, 5000);
  window.__v292Dfix39 = { openPanel: renderPanel, closePanel: closePanel, loadFlags: loadFlags, getCharFlags: getCharFlags, addFlag: addFlag, removeFlag: removeFlag, buildFlagsContext: buildFlagsContext };
  init();
})();

/* v292Dfix40: 軽量ダイス判定 (soft skill check)
 *
 * 目的 (Phase 3-C): 決定的瞬間に「成功/失敗」を ロール で決め、結果を narrative に反映。
 *   行動を gate しない (失敗しても物語が止まらず別方向に進む)。
 *
 * 設計:
 *   - 4 段階難易度: 易 (60%), 普 (40%), 難 (20%), 極難 (10%)
 *   - localStorage.chr6_pending_dice_<slotId> = { difficulty, roll, success, threshold, timestamp }
 *   - Planner._userExtensions で user message 末尾に「【ダイス判定結果】...」を 1 turn 限定注入
 *   - 注入後自動 clear
 *   - UI: topbar 「🎲 判定」 → 難易度選択 → ロール結果表示
 *
 * 設計原則: __v292Dfix40Active フラグ、fix30 active slot 連動、soft (gate なし)
 */
(function v292Dfix40(){
  if (window.__v292Dfix40Active) return;
  var TAG = '[v292Dfix40]';
  var DIFFICULTIES = [
    { key: 'easy', label: '易', threshold: 60, color: '#6aaf78', desc: '日常的、得意分野' },
    { key: 'normal', label: '普', threshold: 40, color: '#5a8ef0', desc: '通常の挑戦' },
    { key: 'hard', label: '難', threshold: 20, color: '#c49040', desc: '困難、訓練が必要' },
    { key: 'epic', label: '極難', threshold: 10, color: '#e06060', desc: '奇跡的、運頼み' }
  ];
  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function pendingKey(){ return 'chr6_pending_dice_' + getActiveSlotId(); }
  function loadPending(){ try { var v = localStorage.getItem(pendingKey()); return v ? JSON.parse(v) : null; } catch(_){ return null; } }
  function savePending(p){ if (!p) try { localStorage.removeItem(pendingKey()); } catch(_){} else try { localStorage.setItem(pendingKey(), JSON.stringify(p)); } catch(_){} }
  function clearPending(){ savePending(null); }
  function roll(difficultyKey){
    var d = DIFFICULTIES.find(function(x){ return x.key === difficultyKey; });
    if (!d) return null;
    var rollVal = Math.floor(Math.random() * 100) + 1;
    var success = rollVal <= d.threshold;
    var result = { difficulty: difficultyKey, difficultyLabel: d.label, threshold: d.threshold, roll: rollVal, success: success, timestamp: Date.now() };
    savePending(result);
    return result;
  }
  function userExt(ctx){
    try {
      var p = loadPending(); if (!p) return ctx.user;
      clearPending();
      var hint = '\n\n【ダイス判定結果】\n直前にプレイヤーが「' + p.difficultyLabel + '判定」を行い、結果は ' + (p.success ? '成功' : '失敗') + ' (ロール値 ' + p.roll + '/100、必要 ' + p.threshold + ' 以下)。\n次の narrative でこの ' + (p.success ? '成功' : '失敗') + ' を自然に物語に組み込むこと:\n- 成功なら: 行動が首尾よく運んだ結末を描く\n- 失敗なら: 別方向の展開、予想外の反応、副次的な結果に turn 物語が止まらないように\n結果を直接「ダイスは X だった」と書かず、narrative の出来事として滲ませる。';
      return ctx.user + hint;
    } catch(e){ return ctx.user; }
  }
  function installPlannerExt(){
    if (typeof window.Planner === 'undefined' || !window.Planner) return false;
    window.Planner._userExtensions = window.Planner._userExtensions || [];
    if (window.Planner._userExtensions.__v292Dfix40) return true;
    window.Planner._userExtensions.push(userExt); window.Planner._userExtensions.__v292Dfix40 = true;
    return true;
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix40-style')) return;
    var style = document.createElement('style'); style.id = 'v292Dfix40-style';
    style.textContent = ['.v40-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v40-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:480px;max-width:96vw;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v40-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v40-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v40-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v40-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v40-body{padding:18px}','.v40-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:14px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v40-diff-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}','.v40-diff-btn{background:var(--bg,#09090f);border:2px solid;border-radius:6px;padding:14px 10px;text-align:center;cursor:pointer;transition:all .15s;font-family:inherit}','.v40-diff-btn:hover{filter:brightness(1.2);transform:translateY(-1px)}','.v40-diff-label{font-size:18px;font-weight:600;margin-bottom:4px}','.v40-diff-pct{font-size:11px;color:var(--dim,#888);margin-bottom:2px}','.v40-diff-desc{font-size:10px;color:var(--dim,#888);font-style:italic}','.v40-result{padding:18px 14px;border-radius:6px;text-align:center;margin-bottom:14px;background:var(--bg,#09090f);border:2px solid var(--border,rgba(139,118,240,.3))}','.v40-result.success{border-color:#6aaf78;background:rgba(106,175,120,.08)}','.v40-result.fail{border-color:#e06060;background:rgba(224,96,96,.08)}','.v40-result-status{font-size:22px;font-weight:600;margin-bottom:6px}','.v40-result-status.success{color:#6aaf78}','.v40-result-status.fail{color:#e06060}','.v40-result-detail{font-size:12px;color:var(--dim,#888);line-height:1.5}','.v40-result-roll{font-size:32px;font-weight:600;color:var(--acc,#8b76f0);margin:4px 0}','.v40-hint{font-size:11px;color:var(--dim,#888);line-height:1.5;padding:10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v40-actions{display:flex;gap:8px;margin-top:12px}','.v40-actions button{flex:1;background:var(--s2,#17172a);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:8px;font-size:12px;cursor:pointer;font-family:inherit}','.v40-actions button:hover{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc)}'].join('\n');
    document.head.appendChild(style);
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderDicePanel(result){
    closeDicePanel(); ensureStyles();
    var overlay = document.createElement('div'); overlay.className = 'v40-overlay'; overlay.id = 'v40-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeDicePanel(); });
    var modal = document.createElement('div'); modal.className = 'v40-modal';
    var html = ['<div class="v40-head"><h2>🎲 判定 (Skill Check)</h2><button class="v40-close" id="v40-close-x">×</button></div><div class="v40-body">'];
    if (!result){
      var pending = loadPending();
      if (pending){
        html.push('<div class="v40-intro">⚠️ 前回のロール (' + escHtml(pending.difficultyLabel) + ' / ' + (pending.success ? '成功' : '失敗') + ' / ロール ' + pending.roll + ') は次の送信で AI に反映されます。新しくロールするとそれが上書きされます。</div>');
      } else {
        html.push('<div class="v40-intro">行動の難易度を選んでロール。結果は <b>次の送信</b> で AI に伝わり、narrative に反映されます。<b>失敗しても物語は止まりません</b> (別方向に展開)。</div>');
      }
      html.push('<div class="v40-diff-grid">');
      DIFFICULTIES.forEach(function(d){
        html.push('<button class="v40-diff-btn" data-act="roll" data-diff="' + d.key + '" style="border-color:' + d.color + '"><div class="v40-diff-label" style="color:' + d.color + '">' + d.label + '</div><div class="v40-diff-pct">成功率 ' + d.threshold + '%</div><div class="v40-diff-desc">' + d.desc + '</div></button>');
      });
      html.push('</div>');
    } else {
      var resClass = result.success ? 'success' : 'fail';
      var statusText = result.success ? '✓ 成功' : '✗ 失敗';
      html.push('<div class="v40-result ' + resClass + '"><div class="v40-result-status ' + resClass + '">' + statusText + '</div><div class="v40-result-detail">' + escHtml(result.difficultyLabel) + '判定 (' + result.threshold + '/100 以下で成功)</div><div class="v40-result-roll">' + result.roll + '</div><div class="v40-result-detail">/ 100</div></div>');
      html.push('<div class="v40-hint">この結果は <b>次の送信</b> で AI に伝わります。「DO 行動」「STORY 描写」のいずれかで次のアクションを送信してください。AI が結果を踏まえた展開を描きます。</div>');
      html.push('<div class="v40-actions"><button data-act="reroll">もう一度</button><button data-act="cancel">キャンセル (ロール無効化)</button><button data-act="close">閉じる</button></div>');
    }
    html.push('</div>');
    modal.innerHTML = html.join(''); overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('v40-close-x').addEventListener('click', closeDicePanel);
    modal.addEventListener('click', function(e){
      var t = e.target.closest('button'); if (!t || !t.dataset || !t.dataset.act) return;
      if (t.dataset.act === 'roll'){ var r = roll(t.dataset.diff); renderDicePanel(r); return; }
      if (t.dataset.act === 'reroll'){ renderDicePanel(null); return; }
      if (t.dataset.act === 'cancel'){ clearPending(); closeDicePanel(); return; }
      if (t.dataset.act === 'close'){ closeDicePanel(); return; }
    });
  }
  function closeDicePanel(){ var ov = document.getElementById('v40-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function injectTopbarButton(){
    if (document.getElementById('v40-topbar-btn')) return true;
    var anchor = document.getElementById('v39-topbar-btn') || document.getElementById('v38-topbar-btn') || document.getElementById('v37-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){
        if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; }
      }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v40-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '🎲 判定'; btn.title = '軽量ダイス判定 — 次のターンに反映';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', function(){ renderDicePanel(null); });
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function init(){
    if (installPlannerExt() && injectTopbarButton()){ window.__v292Dfix40Active = true; console.log(TAG, 'installed'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (installPlannerExt() && injectTopbarButton()){ clearInterval(iv); window.__v292Dfix40Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix40Active){
      if (!document.getElementById('v40-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
      if (window.Planner && window.Planner._userExtensions && !window.Planner._userExtensions.__v292Dfix40){ if (installPlannerExt()) console.log(TAG, 'userExt reinstalled'); }
    }
  }, 5000);
  window.__v292Dfix40 = { openPanel: function(){ renderDicePanel(null); }, closePanel: closeDicePanel, roll: roll, loadPending: loadPending, clearPending: clearPending, DIFFICULTIES: DIFFICULTIES };
  init();
})();

/* v292Dfix41: シナリオテンプレートライブラリ
 * 目的 (Phase 4-A): 6 種のプリセット (廃墟探索/古城ミステリ/異世界転生/学園ホラー/SF/江戸怪奇譚) でユーザーが空状態から即ゲーム開始可能に
 * 設計: templates IIFE 内 hardcode、UI: topbar 「📚 シナリオ」 → modal、適用 (上書き) / 新規 slot 作成、fix30 連携
 */
(function v292Dfix41(){
  if (window.__v292Dfix41Active) return;
  var TAG = '[v292Dfix41]';
  var TEMPLATES = [
    { id: 'ruins', title: '🏚 廃墟と化した遊園地', summary: 'ホラー / サバイバル — かつて賑わった遊園地の廃墟で目覚めた仲間たち', tags: ['ホラー', '探索', '仲間'],
      scene: { loc: '廃墟と化した遊園地', obj: '怪異から逃れ、出口を見つける', tone: '不気味で緊張感のある', lore: '夜の廃墟。観覧車は錆び、メリーゴーラウンドは雨に濡れている。', branches: [] },
      cast: { hero: { name: 'フィオナ', desc: '金髪碧眼の踊り手。芯は強靭。仲間を守ることを最優先。', personality: '誠実で勇敢', coreDesire: '誰一人欠けることなく全員で出口を見つけ出す', coreFear: 'また見捨てられる', wound: '幼少期に家族を失った' },
        npcs: [{ id: 'a', name: 'ミリア', desc: '銀髪の無口な少女。観察力鋭く冷静。', personality: '寡黙だが芯がある', coreDesire: '大切な人を守る', coreFear: '自分の力が及ばない', wound: '言葉で人を救えなかった' },
          { id: 'b', name: 'サクラ', desc: '小柄で怯えがちな少女。優しいが恐怖に弱い。', personality: '怖がりだが内に優しさ', coreDesire: '誰かに守られたい', coreFear: '一人ぼっち', wound: '親に見放された' }] } },
    { id: 'castle', title: '🏰 古城ミステリ', summary: '中世風 / 謎解き — 嵐の夜に避難した古城で発生した不可解な事件', tags: ['ミステリ', '中世', '謎解き'],
      scene: { loc: '雨に閉ざされた中世の古城', obj: '事件の真相を解明し、生き残る', tone: '陰鬱で疑心暗鬼', lore: '13世紀ヨーロッパ風の城。城主は数年前に行方不明、今は使用人と客のみ。', branches: [] },
      cast: { hero: { name: 'セルジオ', desc: '黒髪の旅人、優れた観察眼。元騎士で剣の心得あり。', personality: '寡黙で観察的', coreDesire: '真実を明らかにする', coreFear: '自分の判断ミス', wound: '過去の裁定で人を死なせた' },
        npcs: [{ id: 'a', name: 'リア', desc: '修道女然とした女性、城に長く仕える。秘密を抱える。', personality: '優しいが何かを隠す', coreDesire: '城の秘密を守る', coreFear: '過去が暴かれる', wound: '若い頃の罪' },
          { id: 'b', name: 'カエデ', desc: '若い貴族の客。鋭い舌鋒、誰もを疑う。', personality: '皮肉屋で頭が切れる', coreDesire: '誰よりも先に真実に辿り着く', coreFear: '騙されること', wound: '信じた人に裏切られた' }] } },
    { id: 'isekai', title: '🌌 異世界転生', summary: 'ファンタジー — 突然見知らぬ世界に放り込まれた現代日本人', tags: ['ファンタジー', '冒険', '魔法'],
      scene: { loc: '見知らぬ森の入り口、遠くに塔', obj: '元の世界に戻る方法を探す', tone: '驚きと不安、徐々に高揚', lore: '魔法と剣の世界。3 つの月、青い太陽。「異邦人」は神話的存在。', branches: [] },
      cast: { hero: { name: 'カナデ', desc: '20代の現代日本人。理系の知識を持つ。冷静沈着だが内心パニック。', personality: '理性的だが好奇心旺盛', coreDesire: '世界の橋渡しを理解する', coreFear: '永遠に帰れない', wound: '大切な人を一人残してきた' },
        npcs: [{ id: 'a', name: 'エルナ', desc: 'エルフの若き魔術師、好奇心からカナデに近づく。', personality: '研究熱心で明るい', coreDesire: '異邦人の謎を解明', coreFear: '長命ゆえに友を失う', wound: '前世代の異邦人を看取った' },
          { id: 'b', name: 'グレン', desc: '元傭兵の中年男性。カナデを警戒しつつ守る。', personality: '皮肉屋で慎重', coreDesire: '家族を再び見つけたい', coreFear: '無力さ', wound: '内戦で家族を失った' }] } }
  ];
  TEMPLATES.push({ id: 'school', title: '🏫 学園ホラー', summary: '青春+怪奇 — 放課後の学校に閉じ込められた生徒たち', tags: ['学園', 'ホラー', '青春'],
    scene: { loc: '深夜の私立高校', obj: '校舎から朝までに脱出', tone: '日常が崩れていく恐怖', lore: '創立 80 年の私立高校、7 不思議が囁かれる。', branches: [] },
    cast: { hero: { name: '春香', desc: '高校 2 年、生徒会副会長。責任感強く仲間思い。', personality: '優等生風だが熱い', coreDesire: '全員で朝を迎える', coreFear: '判断ミスで仲間を危険に', wound: '小学生時代に妹を迷子にした' },
      npcs: [{ id: 'a', name: '凛太郎', desc: '同級生、飄々としているが芯は強い。春香を密かに想う。', personality: 'クールだが優しい', coreDesire: '春香を守る', coreFear: '本心を伝えられない', wound: '幼少期の母との別れ' },
        { id: 'b', name: '美波', desc: '春香の親友、明るく行動的、霊感やや強い。', personality: '陽気で勘が鋭い', coreDesire: '皆で笑い合える日常', coreFear: '見えないものに引きずられる', wound: '霊感ゆえに孤立した時期' }] } });
  TEMPLATES.push({ id: 'spaceship', title: '🚀 宇宙船 SF', summary: 'SF — 深宇宙を航行する研究船で発生した謎', tags: ['SF', '宇宙', 'サスペンス'],
    scene: { loc: '深宇宙航行中の研究船 ARGO 号', obj: '船を制御し、地球に生還', tone: '密閉空間の閉塞感', lore: '2087 年、太陽系外探査 20 年。ARGO は 6 名で半年任務中、3 日前に未知信号受信。', branches: [] },
    cast: { hero: { name: 'ルカ', desc: '機関主任、35 歳、技術者として一流。家族残して任務参加。', personality: '実直で技術的', coreDesire: '無事に娘の元へ帰る', coreFear: '判断ミスで仲間死亡', wound: '前任務で同僚を失った' },
      npcs: [{ id: 'a', name: 'アイラ', desc: '生物学者、28 歳、未知生命体研究。好奇心と慎重さ。', personality: '探求心旺盛だが慎重', coreDesire: '人類の知識を拓く発見', coreFear: '取り返しのつかない侵食', wound: '実験で同僚を危険に晒した' },
        { id: 'b', name: 'コーエン', desc: '船長代理、軍出身。規律を重んじる。', personality: '厳格だが正義感強い', coreDesire: '全員を生かして帰還', coreFear: '指揮の責任で失う', wound: '若い頃の作戦で部下を失った' }] } });
  TEMPLATES.push({ id: 'edo', title: '🏯 江戸怪奇譚', summary: '時代劇+怪奇 — 江戸の長屋で起こる怪異', tags: ['時代劇', '怪奇', '江戸'],
    scene: { loc: '江戸の下町、ある長屋の界隈', obj: '怪異の正体を突き止め、鎮める', tone: '夜の灯篭、生と死の薄い境', lore: '寛政年間 (1789-1801)。江戸の下町、夜中の泣き声・消える子供。', branches: [] },
    cast: { hero: { name: '紫苑', desc: '20代の女岡っ引、男装で町を駆ける。義理人情に厚い。', personality: '気風がよく芯が強い', coreDesire: '弱き者を守りたい、義を貫く', coreFear: '自分の正義が間違いだったら', wound: '幼少期に家族を辻斬りに失った' },
      npcs: [{ id: 'a', name: '宗右衛門', desc: '40代の浪人、剣の腕は確か。気だるげだが誠実。', personality: '皮肉屋だが芯は熱い', coreDesire: '失った家名を取り戻す', coreFear: '無意味に生き続ける', wound: '主家を失った過去' },
        { id: 'b', name: 'お春', desc: '近所の若い娘、明るく好奇心旺盛、紫苑を慕う。', personality: '元気で素直', coreDesire: '広い世界を見たい', coreFear: '長屋の閉じた日常', wound: '病弱で外出制限された幼少期' }] } });

  function getActiveSlotId(){ try { if (window.__v292Dfix30 && typeof window.__v292Dfix30.getActive === 'function') return window.__v292Dfix30.getActive(); } catch(_){} return 'default'; }
  function applyTemplate(tpl, options){
    options = options || {};
    if (typeof S === 'undefined' || !S){ alert('S 未初期化'); return false; }
    try {
      var t = JSON.parse(JSON.stringify(tpl));
      if (S.scene){ S.scene.loc = t.scene.loc; S.scene.obj = t.scene.obj; S.scene.tone = t.scene.tone; S.scene.lore = t.scene.lore; S.scene.branches = []; }
      if (S.cast){ S.cast.hero = t.cast.hero; S.cast.npcs = t.cast.npcs; }
      if (options.resetTurns !== false) S.turns = [];
      if (typeof S.save === 'function') S.save();
      try { if (typeof UI !== 'undefined' && typeof UI.renderAll === 'function') UI.renderAll(); } catch(_){}
      try { if (typeof UI !== 'undefined' && Array.isArray(UI._renderHooks)){ UI._renderHooks.forEach(function(h){ try { h({}); } catch(_){} }); } } catch(_){}
      return true;
    } catch(e){ console.warn(TAG, 'apply err:', e && e.message); return false; }
  }
  function ensureStyles(){
    if (document.getElementById('v292Dfix41-style')) return;
    var style = document.createElement('style'); style.id = 'v292Dfix41-style';
    style.textContent = ['.v41-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI",sans-serif}','.v41-modal{background:var(--s1,#111119);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:8px;width:760px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.6)}','.v41-head{padding:14px 18px;border-bottom:1px solid var(--border,rgba(139,118,240,.2));display:flex;align-items:center;gap:10px}','.v41-head h2{margin:0;font-size:15px;color:var(--acc,#8b76f0);font-weight:600;flex:1}','.v41-close{background:none;border:none;color:var(--dim,#888);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}','.v41-close:hover{background:var(--s2,#17172a);color:var(--tx)}','.v41-body{flex:1;overflow:auto;padding:14px 18px}','.v41-intro{font-size:11px;color:var(--dim,#888);line-height:1.6;margin-bottom:14px;padding:8px 10px;background:var(--bg,#09090f);border-radius:4px;border-left:3px solid var(--acc,#8b76f0)}','.v41-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}','.v41-card{background:var(--bg,#09090f);border:1px solid var(--border,rgba(139,118,240,.15));border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:8px}','.v41-card:hover{border-color:var(--acc,#8b76f0);background:var(--s2,#17172a)}','.v41-card-title{font-size:14px;font-weight:600;color:var(--tx,#e0dcf0)}','.v41-card-summary{font-size:11px;color:var(--dim,#888);line-height:1.5;flex:1}','.v41-card-tags{display:flex;flex-wrap:wrap;gap:4px}','.v41-card-tag{font-size:10px;background:rgba(139,118,240,.15);color:var(--tx);padding:2px 6px;border-radius:3px;border:1px solid rgba(139,118,240,.2)}','.v41-card-meta{font-size:10px;color:var(--dim,#888);font-style:italic}','.v41-card-actions{display:flex;gap:6px;margin-top:6px}','.v41-btn{flex:1;background:var(--s2,#17172a);color:var(--tx);border:1px solid var(--border,rgba(139,118,240,.2));border-radius:4px;padding:6px 8px;font-size:11px;cursor:pointer;font-family:inherit}','.v41-btn:hover{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc)}','.v41-btn-primary{background:var(--acc,#8b76f0);color:#fff;border-color:var(--acc)}'].join('\n');
    document.head.appendChild(style);
  }
  function escAttr(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderLibrary(){
    closeLibrary(); ensureStyles();
    var overlay = document.createElement('div'); overlay.className = 'v41-overlay'; overlay.id = 'v41-overlay';
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeLibrary(); });
    var modal = document.createElement('div'); modal.className = 'v41-modal';
    var html = ['<div class="v41-head"><h2>📚 シナリオテンプレート</h2><button class="v41-close" id="v41-close-x">×</button></div>'];
    html.push('<div class="v41-body"><div class="v41-intro">テンプレ選択でシナリオ一括設定。「適用」は現在 slot に上書き、「新規 slot に作成」は空 slot に書き込み。turns はリセット。</div><div class="v41-grid">');
    TEMPLATES.forEach(function(tpl){
      html.push('<div class="v41-card" data-id="' + escAttr(tpl.id) + '"><div class="v41-card-title">' + escHtml(tpl.title) + '</div><div class="v41-card-summary">' + escHtml(tpl.summary) + '</div><div class="v41-card-tags">');
      tpl.tags.forEach(function(t){ html.push('<span class="v41-card-tag">' + escHtml(t) + '</span>'); });
      html.push('</div><div class="v41-card-meta">主: ' + escHtml(tpl.cast.hero.name) + ' / NPC: ' + tpl.cast.npcs.map(function(n){ return n.name; }).join(', ') + '</div><div class="v41-card-actions"><button class="v41-btn v41-btn-primary" data-act="apply" data-id="' + escAttr(tpl.id) + '">適用 (上書き)</button><button class="v41-btn" data-act="apply-to-slot" data-id="' + escAttr(tpl.id) + '">新規 slot へ</button></div></div>');
    });
    html.push('</div></div>');
    modal.innerHTML = html.join(''); overlay.appendChild(modal); document.body.appendChild(overlay);
    document.getElementById('v41-close-x').addEventListener('click', closeLibrary);
    modal.addEventListener('click', function(e){
      var t = e.target.closest('button'); if (!t || !t.dataset || !t.dataset.act) return;
      var tpl = TEMPLATES.find(function(x){ return x.id === t.dataset.id; }); if (!tpl) return;
      if (t.dataset.act === 'apply'){
        if (!confirm('「' + tpl.title + '」を現在の slot に適用しますか？\n現在の scene/cast/turns は完全上書きされます。')) return;
        if (applyTemplate(tpl, { resetTurns: true })){ showToast('「' + tpl.title + '」を適用しました'); closeLibrary(); }
        else { showToast('適用失敗', true); }
      }
      if (t.dataset.act === 'apply-to-slot'){
        if (!window.__v292Dfix30){ showToast('fix30 未 install', true); return; }
        var meta = window.__v292Dfix30.getMeta();
        var emptySlots = meta.filter(function(s){ if (s.id === 'default') return false; var raw = null; try { raw = localStorage.getItem(s.key); } catch(_){} return !raw; });
        if (!emptySlots.length){ showToast('空 slot がありません', true); return; }
        var choice = prompt('適用する slot を選択:\n' + emptySlots.map(function(s, i){ return (i+1) + ': ' + s.name; }).join('\n') + '\n\n番号 (1-' + emptySlots.length + '):');
        var idx = parseInt(choice, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= emptySlots.length) return;
        var target = emptySlots[idx]; var prevActive = window.__v292Dfix30.getActive();
        try {
          localStorage.setItem('chr6_active_slot', JSON.stringify(target.id));
          if (applyTemplate(tpl, { resetTurns: true })){ showToast('slot 「' + target.name + '」に適用 (active 切替)'); closeLibrary(); }
          else { localStorage.setItem('chr6_active_slot', JSON.stringify(prevActive)); showToast('適用失敗', true); }
        } catch(e){ localStorage.setItem('chr6_active_slot', JSON.stringify(prevActive)); showToast('err: ' + e.message, true); }
      }
    });
  }
  function closeLibrary(){ var ov = document.getElementById('v41-overlay'); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
  function showToast(msg, isErr){
    var t = document.createElement('div'); t.className = 'v30-toast' + (isErr ? ' err' : ''); t.textContent = msg;
    if (!document.getElementById('v292Dfix30-style')){ t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#e06060' : '#8b76f0') + ';color:#fff;padding:10px 18px;border-radius:6px;font-size:13px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.4);font-family:inherit'; }
    document.body.appendChild(t); setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 2800);
  }
  function injectTopbarButton(){
    if (document.getElementById('v41-topbar-btn')) return true;
    var anchor = document.getElementById('v40-topbar-btn') || document.getElementById('v39-topbar-btn') || document.getElementById('v38-topbar-btn') || document.getElementById('v30-topbar-btn');
    if (!anchor){
      var allBtns = document.querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++){ if ((allBtns[i].textContent || '').indexOf('設定') >= 0){ anchor = allBtns[i]; break; } }
    }
    if (!anchor) return false;
    var btn = document.createElement('button');
    btn.id = 'v41-topbar-btn'; btn.className = 'v30-topbar-btn';
    btn.textContent = '📚 シナリオ'; btn.title = 'シナリオテンプレートライブラリ';
    btn.style.cssText = 'background:var(--s2,#17172a);color:var(--tx,#e0dcf0);border:1px solid var(--border,rgba(139,118,240,.3));border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer;margin-right:8px;font-family:inherit';
    btn.addEventListener('click', renderLibrary);
    anchor.parentNode.insertBefore(btn, anchor);
    return true;
  }
  function init(){
    if (injectTopbarButton()){ window.__v292Dfix41Active = true; console.log(TAG, 'installed - ' + TEMPLATES.length + ' templates'); return; }
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (injectTopbarButton()){ clearInterval(iv); window.__v292Dfix41Active = true; console.log(TAG, 'installed (deferred ' + tries + ')'); }
      else if (tries > 80){ clearInterval(iv); console.warn(TAG, 'gave up'); }
    }, 200);
  }
  setInterval(function(){
    if (window.__v292Dfix41Active && !document.getElementById('v41-topbar-btn')){ if (injectTopbarButton()) console.log(TAG, 'btn reinjected'); }
  }, 5000);
  window.__v292Dfix41 = { openLibrary: renderLibrary, closeLibrary: closeLibrary, applyTemplate: applyTemplate, TEMPLATES: TEMPLATES };
  init();
})();

