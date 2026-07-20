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
// ★fix494(2026-07-19): fix482(品質再生成)との共通リトライ予算。1論理ターンの物理API送信を
//   最大 MAX 回に固定(従来はfix80×fix482で最大MAX×2=6回になり得た)。予算は init 上の
//   非送信プロパティ __chronicleAttemptBudget={remaining} に持たせ、物理送信の実境界(fix482の
//   inner.call)で消費。fix80は各リトライ前に残量を確認し0なら追加送信しない。両者とも
//   予算が無ければ生成する(ラップ順序に非依存)。JSON bodyには一切入れない=ネットワーク非送出。
var BUDGET_KEY = '__chronicleAttemptBudget';

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
  //   fix80/fix482 は実行時に多重ラップされ順序が変わる(fix80(外)→fix482→fix80(内)→native 等)。
  //   最内層(inner が別ラッパでない)だけが物理送信を計上すれば、順序に依らず1ターン最大3回に収束。
  var innerIsNative = !(orig && (orig.__fix80 || orig._f482));
  var wrapped = async function(){
    var args = arguments;
    var url = (args[0] && args[0].url) || args[0];
    var isCompletion = (typeof url === "string") && url.indexOf(ENDPOINT) !== -1;
    if(!isCompletion) return orig.apply(this, args);

    // ★fix494: 共通リトライ予算を init に用意(無ければ生成=順序非依存)。init欠如時はスキップ。
    var init = args[1];
    var budget = (init && typeof init === "object") ? init[BUDGET_KEY] : null;
    if(init && typeof init === "object" && !budget){ budget = init[BUDGET_KEY] = { remaining: MAX, sent: 0, limit: MAX }; }

    var last = null;
    for(var attempt = 0; attempt < MAX; attempt++){
      if(budget){
        if(innerIsNative){
          // ★fix503(GPT監査 条件付きGO): 二重減算の残骸検知。sent===0で残量0=誰かが送信せず予算を減らした=予算破損。
          //   補充で救済せず失敗にする(4回目送信を防ぐ=fix494不変条件「最大3送信」を厳守)。
          if((budget.sent||0) === 0 && budget.remaining <= 0){ try{ console.error("[v292Dfix503] budget invariant violation", { limit: budget.limit, sent: budget.sent, remaining: budget.remaining }); }catch(e){} return failResp(); }
          // 最内層=物理送信の実境界。予算切れなら送らない/送るなら1消費。
          if(budget.remaining <= 0){ try{ console.log("[v292Dfix80] budget exhausted (native), stop at #" + attempt); }catch(e){} break; }
          budget.remaining--; budget.sent = (budget.sent||0) + 1;   // ★fix503: 物理送信を1計上(sent)。予算所有はfix80のこの経路のみ。
        } else if(attempt > 0 && budget.remaining <= 0){
          // 下流(fix482/内側fix80)が消費済み=自分は確認のみ。初回送信後に予算切れなら追加しない。
          try{ console.log("[v292Dfix80] downstream budget exhausted, stop at #" + attempt); }catch(e){}
          break;
        }
      }
      var resp;
      try{
        resp = await orig.apply(this, args);
      }catch(e){
        if(attempt < MAX - 1){ await sleep(1500 * (attempt + 1)); continue; }
        throw e;
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
try{ if(window.console && console.log) console.log("[v292Dfix80] generation gate + auto-retry installed"); }catch(e){}
})();
