// v274e-writer-cast-lock.js
// 目的: writer turn (v274 「自由に展開」ボタン) と通常の story turn で出力される
//       ナラティブに、cast 外のキャラ名 (例: 「ミソト」「美琴」など typo / 別表記) が
//       現れる hallucination を防ぐ。
//
// 観測 (2026-05-10 実機検証):
//   cast = ミコト / ユキ / エチカ / イザク
//   writer 出力に「ミソト「なぜ……どうしてここに？」」が登場
//   → 「ミコト」を意図したが Hermes 4 が typo した可能性大。あるいは別キャラ感覚で創作。
//
// 設計:
//   v275/v276 が既に Planner.build を wrap して sys に arc / mind ブロックを追記
//   している → 同じ手口で v274e も Planner.build を wrap し、sys 末尾に
//   「キャストロック (作家ターン用)」ブロックを追加する。
//
//   注意: v276e は **mind module 専用** (X-Title: v276 character-mind の fetch 限定)
//         なので writer turn はカバーしない。v274e はそこの穴を埋める。
//
// チェーン (install 後):
//   Planner.build = v274e wrapper
//     → v276 wrapper (sys に mind ブロック追記)
//       → v275 wrapper (sys に arc ブロック追記)
//         → orig Planner.build
//
//   v274e は最後に install されるため最外側になり、最終 sys 末尾に
//   cast lock が追加される (recency bias を活かす位置)。
//
// アプローチ: prompt-only (出力後の narrative 文字列置換は副作用が大きいため避ける)
//   - 強い constraint: 「以下キャスト以外は名前として使うな」
//   - typo / 別表記 / 漢字化 / カタカナ化も明示的に NG 例として列挙
//   - 脇役は「店員」「通行人」など一般名詞で表現させる
//
// 適用範囲: Planner.build を経由する全 turn (writer, story, do, say, continue)
//   → 通常の小説モードでも cast 名のブレが収まる
//
// ガード: window.__v274eActive

(function v274e(){
  'use strict';
  if (window.__v274eActive) return;
  window.__v274eActive = true;
  console.log('[v274e] writer-cast-lock init');

  // === Cast roster 取得 (v276e と同じ実装、fallback もあり) ===
  function getCastRoster(){
    // v276e 由来の実装が既にあれば再利用 (重複ロジック回避)
    try {
      if (window.__v276e && typeof window.__v276e.getCastRoster === 'function'){
        var r = window.__v276e.getCastRoster();
        if (Array.isArray(r) && r.length) return r;
      }
    } catch(e){}
    // fallback: 自前で localStorage を読む
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      var names = [];
      if (s.cast){
        if (s.cast.hero && s.cast.hero.name){
          names.push(String(s.cast.hero.name).trim());
        }
        if (Array.isArray(s.cast.npcs)){
          s.cast.npcs.forEach(function(n){
            if (n && n.name) names.push(String(n.name).trim());
          });
        }
      }
      return names.filter(function(n){ return !!n; });
    } catch(e){
      return [];
    }
  }

  // === Cast lock ブロック構築 ===
  function buildCastLockBlock(roster){
    if (!roster || !roster.length) return '';
    var listed = roster.map(function(n, i){ return '  ' + (i + 1) + '. 「' + n + '」'; }).join('\n');
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【キャストロック (作家ターン用) — 厳守 (v274e)】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
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
      '・地の文中で表記が安定するか必ず確認してから出力する',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  // === Planner.build を wrap ===
  function wrapPlanner(){
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v274eWrapped) return true;
    var orig = Planner.build.bind(Planner);
    var wrapped = function(inputType, inputText){
      var r = orig(inputType, inputText);
      try {
        if (r && r.sys){
          var roster = getCastRoster();
          var block = buildCastLockBlock(roster);
          if (block){
            r.sys += '\n' + block;
          }
        }
      } catch(e){
        console.warn('[v274e] block injection failed', e);
      }
      return r;
    };
    wrapped.__v274eWrapped = true;
    Planner.build = wrapped;
    console.log('[v274e] Planner.build wrapped (cast-lock for writer/story turns)');
    return true;
  }

  // 起動直後の wrap (60 回 retry)
  if (!wrapPlanner()){
    var tries = 0;
    var iv = setInterval(function(){
      if (wrapPlanner() || ++tries > 60) clearInterval(iv);
    }, 500);
  }
  // 継続監視: v275/v276 が後から Planner.build を上書きして v274e の wrap が
  // 剥がれることがあるため、毎秒チェックして必要なら再 wrap する。
  // wrapPlanner 自体が冪等 (Planner.build.__v274eWrapped を見る) なので二重
  // wrap にはならない。
  setInterval(function(){
    try {
      if (typeof Planner === 'object' && Planner && typeof Planner.build === 'function'
          && !Planner.build.__v274eWrapped){
        wrapPlanner();
      }
    } catch(e){}
  }, 1000);

  // === Public API 
