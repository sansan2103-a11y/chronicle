// =====================================================================
// Chronicle v292 features (Phase 4-B) — 10 features integrated
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

    // Pattern A: name + 「」 + と...verb (extended verb list)
    var rxA = /([一-鿿ぁ-ゖァ-ヺ々ー・]+?)(?:は|が|の)?「([^「」]+?)」(?:と[^」]*?(?:言|答|命|叫|問|呼|尋|応|返|笑|囁|吐|怒鳴|呟|漏|喚|喘|呻|吼|吠|喝|促))/g;
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

    // Pattern B: cast name + 「」 (no suffix)
    if (namePat){
      var rxB = new RegExp('(?:^|\\n|。|、|」|\\s)(' + namePat + ')(?:は|が|の)?「([^「」]+?)」', 'g');
      while ((m = rxB.exec(src))){
        pushUnique(m[1].trim(), m[2].trim());
      }
    }

    // Pattern D (NEW): pronoun + 「」 → resolve to recent named speaker
    var rxD = /(彼女|あの女|あの少女|少女|彼|あの男|あの少年|少年)(?:は|が|の)?「([^「」]+?)」/g;
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

    // Pattern C: bare 「」 after sentence boundary
    var rxC = /(?:^|[\n。、！？])「([^「」]{2,80})」/g;
    while ((m = rxC.exec(src))){
      var dlgC = m[1].trim();
      if (hasText(dlgC)) continue;
      var pos = m.index;
      var preStart = Math.max(0, pos - 200);
      var preContext = src.substring(preStart, pos);
      var speaker = '';
      if (namePat){
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

  // recentHistory 文字列内の代名詞を、直前に言及されたキャラの設定性別に基づき正規化
  function fixPronouns(text, allChars){
    if (!text || typeof text !== 'string') return text;
    if (!allChars.length) return text;
    var lines = text.split('\n');
    for (var li = 0; li < lines.length; li++){
      var line = lines[li];
      var lastG = '';
      var out = '';
      var i = 0;
      while (i < line.length){
        var matched = false;
        for (var ci = 0; ci < allChars.length; ci++){
          var nm = allChars[ci].name;
          if (nm && line.substr(i, nm.length) === nm){
            lastG = allChars[ci].gender || '';
            out += nm;
            i += nm.length;
            matched = true;
            break;
          }
        }
        if (matched) continue;
        // 彼女 (2文字) check first
        if (line.substr(i, 2) === '彼女'){
          if (lastG === '男性'){ out += '彼'; i += 2; continue; }
          out += '彼女'; i += 2; continue;
        }
        // 彼 (1文字、女が続かない)
        if (line[i] === '彼' && line[i+1] !== '女'){
          if (lastG === '女性'){ out += '彼女'; i += 1; continue; }
          out += '彼'; i += 1; continue;
        }
        // 少女 / 少年 mapping
        if (line.substr(i, 2) === '少女' && lastG === '男性'){ out += '少年'; i += 2; continue; }
        if (line.substr(i, 2) === '少年' && lastG === '女性'){ out += '少女'; i += 2; continue; }
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
