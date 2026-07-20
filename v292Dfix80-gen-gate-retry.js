/* v292Dfix80 — generation gate + auto-retry (関所＋再生成)
 * window.fetch をラップし、OpenRouter chat/completions 呼び出しを監視:
 *   - HTTPエラー(429/5xx)・ネットワーク例外 → バックオフして再試行
 *   - 空応答/極端に短い/退行的反復(ループ崩壊) → 同一リクエストで再生成
 *   最大 MAX 回。すべて失敗なら最後の応答を返す(無限ループ防止)。
 * 前提: 非ストリーミング。応答は[空白padding]+JSON(choices[0].message.content)。
 * 注: 「冗長/思案で停滞」のような品質ゲートは別パッチ(<beat>方式)。本パッチは信頼性担当。
 */
(function(){
'use strict';
var MAX = 3;
var ENDPOINT = "openrouter.ai/api/v1/chat/completions";
// ★fix494(2026-07-19): fix482(品質再生成)との共通リトライ予算。物理API送信を最大 MAX 回に固定
//   (従来はfix80×fix482で最大MAX×2=6回になり得た)。予算は init 上の非送信プロパティ
//   __chronicleAttemptBudget={remaining,sent,limit} に持たせ、物理送信の実境界で消費。
//   ★fix504注: この予算は「同一budgetコンテキスト(同一fetch init/同一ラッパ連鎖)」単位での上限。
//   1ユーザーターン全体の上限は _callOpenRouter の再ループ/ G.submit の5xx再呼びで別initが作られる
//   ため構造的に別問題(turn単位予算は上位で生成・引き回す別fixの射程。GPT指摘)。JSON bodyには入れない。
var BUDGET_KEY = '__chronicleAttemptBudget';

// ★fix504(2026-07-20 GPT条件付きGO): 予算アンカー=fix80ロード時のfetch参照を"不変クロージャ"で固定。
//   fix80が見得る最もnativeに近い層。この参照を inner に持つ唯一のfix80層だけが予算を消費(owner)。
//   window上のグローバルではなくクロージャ束縛=外部から改竄・削除不能(GPT必須条件1)。
var BUDGET_ANCHOR = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : null;

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/* ★fix502(2026-07-20): ネット不安定/共通予算(fix494)切れで内側ラッパが空(null)を返した時に
 *   外側が resp.ok を読んで「Cannot read properties of null」で落ちるのを防ぐ。null応答を
 *   合成失敗レスポンス(503)に変換し、通常の「生成に失敗しました(再試行可)」経路へ流す。
 *   ★再送回数・予算・ゲート判定の挙動は一切変更しない(fix494のGPT監査結果を保持)。"落ちない"のみ追加。 */
function failResp(){
  try {
    return new Response(JSON.stringify({ error: '生成に失敗しました(通信が不安定でした)', errorCode: 'fix502-null' }),
      { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch(e){
    return { ok:false, status:503, clone:function(){ return this; }, text:function(){ return Promise.resolve('{}'); }, json:function(){ return Promise.resolve('{}'); } };
  }
}

function extractContent(text){
  try{
    var i = text.indexOf("{");
    if(i < 0) return null;
    var json = JSON.parse(text.slice(i));
    if(json && json.choices && json.choices[0]){
      var ch = json.choices[0];
      if(ch.message && typeof ch.message.content === "string") return ch.message.content;
      if(typeof ch.text === "string") return ch.text;
    }
  }catch(e){}
  return null;
}

function isDegenerate(content){
  var parts = content.split(/[。．！？]/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length >= 4; });
  if(parts.length < 4) return false;
  var seen = {}; var uniq = 0;
  for(var i=0;i<parts.length;i++){ if(!seen[parts[i]]){ seen[parts[i]] = 1; uniq++; } }
  return (uniq / parts.length) < 0.5;
}

function gatePass(content){
  if(content == null) return false;
  if(content.trim().length < 20) return false;
  if(isDegenerate(content)) return false;
  return true;
}

function makeWrapper(orig){
  // ★fix494(GPT再監査): 自分の inner が native(=最内層)の時だけ予算を減算する。
  // ★fix504(2026-07-20 GPT条件付きGO): 最内判定をマーカー依存(orig.__fix80/_f482)から
  //   「予算アンカー同一性」へ。無印ラッパ(fix84/fix499型=props非継承)が2つのfix80層に挟まると
  //   外側fix80が inner=無印 を native誤認して二重減算 → native到達前に共通予算が枯れ 0物理送信
  //   (fix502-null 503)になる断続失敗の真因(GPT監査85-90%・node4層/6層で再現)。
  //   アンカー方式: BUDGET_ANCHOR(=fix80ロード時fetch)を inner に持つ"唯一の"fix80層だけが計上 →
  //   無印ラッパが何枚挟まっても計上1回/物理送信に収束。判定は不変クロージャ参照で行う(GPT必須条件1)。
  //   owner-miss検知(GPT必須条件2): window.fetchがアンカーより内側へ差し戻される等で owner が
  //   チェーンから消えると予算が減らず多層fix80が暴走再送する。非owner層が inner 呼出前後の sent
  //   差分を見て「予算ありなのに誰も送っていない」を検知し、暴走前に失敗確定/実応答fail-open。
  //   OFF=v292Dfix504Off で従来マーカー方式へ。fix502/503のnullガード・sent計上・破損検知は不変。
  var ownsBudget = !!(BUDGET_ANCHOR && orig === BUDGET_ANCHOR);   // 不変(構築時に確定): この層が予算所有者か
  var markerNative = !(orig && (orig.__fix80 || orig._f482));      // OFF時の従来判定
  var wrapped = async function(){
    var args = arguments;
    var url = (args[0] && args[0].url) || args[0];
    var isCompletion = (typeof url === "string") && url.indexOf(ENDPOINT) !== -1;
    if(!isCompletion) return orig.apply(this, args);

    // ★fix504: 計上層判定(呼出時にOFFを読む=killスイッチ即応。所有判定自体は不変クロージャ由来)。
    var off504 = false; try{ off504 = (localStorage.getItem('v292Dfix504Off') === '1'); }catch(e){}
    var innerIsNative = off504 ? markerNative : ownsBudget;

    // ★fix494: 共通リトライ予算を init に用意(無ければ生成=順序非依存)。init欠如時はスキップ。
    var init = args[1];
    var budget = (init && typeof init === "object") ? init[BUDGET_KEY] : null;
    if(init && typeof init === "object" && !budget){ budget = init[BUDGET_KEY] = { remaining: MAX, sent: 0, limit: MAX }; }

    var last = null;
    for(var attempt = 0; attempt < MAX; attempt++){
      if(budget){
        if(innerIsNative){
          // ★fix503(GPT監査): 二重減算の残骸検知。sent===0で残量0=誰かが送信せず予算を減らした=予算破損。
          //   補充で救済せず失敗にする(4回目送信を防ぐ=最大3送信を厳守)。
          if((budget.sent||0) === 0 && budget.remaining <= 0){ try{ console.error("[v292Dfix503] budget invariant violation", { limit: budget.limit, sent: budget.sent, remaining: budget.remaining }); }catch(e){} return failResp(); }
          // 予算所有者=物理送信の実境界。予算切れなら送らない/送るなら1消費。
          if(budget.remaining <= 0){ try{ console.log("[v292Dfix80] budget exhausted (native), stop at #" + attempt); }catch(e){} break; }
          budget.remaining--; budget.sent = (budget.sent||0) + 1;   // ★fix503: 物理送信を1計上(sent)。予算所有はこの経路のみ。
        } else if(attempt > 0 && budget.remaining <= 0){
          // 下流(所有者fix80)が消費済み=自分は確認のみ。初回送信後に予算切れなら追加しない。
          try{ console.log("[v292Dfix80] downstream budget exhausted, stop at #" + attempt); }catch(e){}
          break;
        }
      }
      // ★fix504: owner-miss検知の基準(この inner 呼出前の消費量)。
      var sentBefore = budget ? (budget.sent||0) : 0;
      var resp;
      try{
        resp = await orig.apply(this, args);
      }catch(e){
        // ★fix504: 非owner層で予算がありながら誰も送信しなかった=ownerがチェーンから消失。暴走再送を防ぎ失敗確定。
        if(!off504 && !innerIsNative && budget && budget.remaining > 0 && (budget.sent||0) === sentBefore){
          try{ budget.ownerMissing = true; console.error("[v292Dfix504] budget owner missing (throw)"); }catch(_e){}
          return failResp();
        }
        if(attempt < MAX - 1){ await sleep(1500 * (attempt + 1)); continue; }
        throw e;
      }
      // ★fix504: 正常戻りでも owner-miss を検知(予算あり・消費ゼロ)。良い実応答ならfail-open採用、無ければ合成失敗。
      if(!off504 && !innerIsNative && budget && budget.remaining > 0 && (budget.sent||0) === sentBefore){
        try{ budget.ownerMissing = true; console.error("[v292Dfix504] budget owner missing"); }catch(_e){}
        if(resp && resp.ok) return resp;
        return resp || failResp();
      }
      if(!resp || !resp.ok){                          /* ★fix502: null(予算切れ等)でも落ちない */
        last = resp || last;
        if(attempt < MAX - 1){ await sleep((resp && resp.status === 429) ? 2500 * (attempt + 1) : 1200); continue; }
        return resp || failResp();
      }
      var text = "";
      try{ text = await resp.clone().text(); }catch(e){ return resp; }
      var content = extractContent(text);
      if(gatePass(content)){
        if(attempt > 0){ try{ console.log("[v292Dfix80] passed after retry #" + attempt); }catch(e){} }
        return resp;
      }
      last = resp;
      if(attempt < MAX - 1){ try{ console.log("[v292Dfix80] gate fail, regenerating (" + (attempt + 1) + ")"); }catch(e){} await sleep(600); continue; }
    }
    return last || failResp();                        /* ★fix502: 予算切れ等でlastがnullでも合成失敗を返す(nullを外へ出さない) */
  };
  wrapped.__fix80 = true;
  return wrapped;
}

function install(){
  try{
    if(typeof window.fetch === "function" && !window.fetch.__fix80){
      window.fetch = makeWrapper(window.fetch);
    }
    window.__v292Dfix80Active = true;
  }catch(e){}
}
install();
setInterval(install, 2000);
// ★fix504: 検証口(読取専用・プレイ非破壊)。アンカー方式の稼働とアンカー捕捉を確認できる。
try{
  window.__v292Dfix504 = {
    off: function(){ try{ return localStorage.getItem('v292Dfix504Off') === '1'; }catch(e){ return false; } },
    anchorSet: function(){ return !!BUDGET_ANCHOR; },
    status: function(){ return { armed: true, mode: (this.off() ? 'marker(legacy)' : 'anchor-identity'), anchorSet: !!BUDGET_ANCHOR }; }
  };
}catch(e){}
try{ if(window.console && console.log) console.log("[v292Dfix80] generation gate + auto-retry installed (fix504: anchor-budget)"); }catch(e){}
})();
