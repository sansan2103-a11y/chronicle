// =====================================================================
// Chronicle TRPG - v292Dfix500: 最終sysの重複指示の整理(A5・候補・既定OFF)
// ---------------------------------------------------------------------
// 背景(2026-07-20・A5監査):
//   最終sysは fix459(送信境界でblock再構築) の後に、さらに fix483(演出・opt-in) と
//   fix440(fix441経由・進行エンジン/場にいる者/読みやすさ/描写の芯/出力の鉄則/★最終判断★)
//   が【後から】追記される。fix459はfix440の追記を見られないため、
//   「①破綻させない②連続性③前進④文体」の優先順位スキームが
//   fix459 blockC【展開】と fix440【★最終判断の優先順位★】の【二重】で載る。
//   fix440側は詳細かつ末尾(recency)で、しかも「他のブロックが最優先と書いていても
//   衝突時はこの①〜④を上位とする」と自らを権威版と宣言している。
//   → 先に載る terse な blockC の①②③④行は冗長。これだけを安全に1本化する。
//
// ★スコープ(保守的・A5監査の"別役割は統合しない"に厳密準拠):
//   本fixが触るのは【Cluster1=展開の優先順位①②③④の重複】のみ。
//   除去するのは fix459 blockC 冒頭の①②③④行(terse版)【1行だけ】。
//   fix440【★最終判断★】(権威・末尾)は保持。blockCの他の行(毎ターン一つ動かす/
//   繰り返し禁止/説明を長く続けない)は保持。
//   Cluster2(出力形式/メタ漏れ=blockB/fix440出力の鉄則/fix192守ること)と
//   Cluster3(NPC自律=fix192 item4/fix440場にいる者)は【文言非同一=判断を伴うマージ】の
//   ためGPTレビュー/おしん実プレイ比較まで保留(本fixでは触らない)。
//
// ★安全装置(fail-open・不変条件の事後検証):
//   除去後に「fix440★最終判断★」「【表記】【読ませ方】【制約】(fix496・在った分)」「【文体】」
//   のいずれかが失われていたら【元のsysをそのまま返す】(no-op)。
//   除去対象行が無い/権威版が無い場合も no-op。冪等(2回適用で不変)。
//
// 配置(デプロイ時): index.html で v292Dfix441 の【直前】に読み込む(=最内→送信直前の最終形を掴む)。
//   ★fix459→fix483→fix441→fix500→native の順になり、fix500は fix459の再構築にも
//     fix440の追記にも【一切フィードバックしない】(fix459のmarker不変条件を侵さない)。
// 有効化(opt-in・既定OFF): localStorage.v292Dfix500OnV1==='1' かつ v292Dfix500Off!=='1'
// 検証口: window.__v292Dfix500 = { dedupSys, wouldChange, active, status, last }
// ※document非依存(Nodeテスト可)。
// =====================================================================
(function(){
  'use strict';
  var W = (typeof window !== 'undefined') ? window : this;
  if (W.__v292Dfix500 && W.__v292Dfix500.__armed) return;
  var TAG = '[v292Dfix500:sys-dedup]';

  // ---- Cluster1 の署名(fix459 blockC / fix440 ★最終判断★ の実文字列) ----
  // fix459 blockC 冒頭の terse な①②③④行(除去対象=これ1行のみ)
  var C_LINE = '・指示が衝突したら ①破綻させない（直前の再演・物理矛盾・メタ混入の禁止）②連続性（場所・負傷・拘束・感情の引き継ぎ）③前進 ④文体 の順で判断する。';
  // fix440 権威版の存在確認(これが在る時だけ terse版を落とす)
  var AUTH_HDR = '【★最終判断の優先順位（指示が衝突したら必ずこの順で決める）★】';
  var AUTH_TAIL = '他のブロックが「最優先」と書いていても、衝突時はこの①〜④の順位を上位とする。';
  // 保全すべき fix496 品質マーカー + 文体
  var KEEP_MARKERS = ['【表記】','【読ませ方】','【制約】','【文体】'];

  function off(){ try { return localStorage.getItem('v292Dfix500Off') === '1'; } catch(e){ return false; } }
  function on(){ try { if (off()) return false; return localStorage.getItem('v292Dfix500OnV1') === '1'; } catch(e){ return false; } }
  function active(){ return on(); }

  function countStr(hay, needle){ if(!needle) return 0; var n=0,i=0; while((i=hay.indexOf(needle,i))>=0){ n++; i+=needle.length; } return n; }

  var last = null;

  // ---- 純粋関数: 最終sysのCluster1重複を1本化 ----
  function dedupSys(sys){
    var s = String(sys == null ? '' : sys);
    if (!s) return sys;
    // 権威版(fix440★最終判断★)が在る時だけ terse版を落とす
    if (s.indexOf(AUTH_HDR) < 0 || s.indexOf(AUTH_TAIL) < 0) return sys;
    if (s.indexOf(C_LINE) < 0) return sys;                    // 除去対象が無い=no-op(冪等)
    // 在った保全マーカーを記録(事後に消えていないか検証するため)
    var present = {}; for (var i=0;i<KEEP_MARKERS.length;i++){ if (s.indexOf(KEEP_MARKERS[i])>=0) present[KEEP_MARKERS[i]]=true; }
    // terse①②③④行を1行だけ除去(直後の改行も1つ畳む)
    var out = s.replace(C_LINE + '\n', '').replace(C_LINE, '');
    // ---- 不変条件の事後検証(いずれか失敗なら元を返す=fail-open) ----
    if (out.indexOf(AUTH_HDR) < 0 || out.indexOf(AUTH_TAIL) < 0) return sys;   // 権威版が消えた
    for (var k in present){ if (present.hasOwnProperty(k) && out.indexOf(k) < 0) return sys; }  // 品質/文体マーカー喪失
    if (countStr(out, C_LINE) !== 0) return sys;              // 想定外に残存
    last = { before: s.length, after: out.length, saved: s.length - out.length };
    try { console.log(TAG, 'Cluster1 dedup: -' + last.saved + '字'); } catch(e){}
    return out;
  }

  function wouldChange(sys){ return dedupSys(sys) !== sys; }

  // ---- fetch境界(fix459と同じ検出。fix441より内=最終形を掴む) ----
  var of = W.fetch;
  var wrapped = function(u, o){
    try {
      if (on() && o && o.method === 'POST' && o.body && /workers\.dev|openrouter/.test(String(u))){
        var b = JSON.parse(String(o.body));
        if (b && b.messages && b.messages.length){
          for (var i = 0; i < b.messages.length; i++){
            var m = b.messages[i];
            if (m && m.role === 'system' && typeof m.content === 'string' && m.content.length > 1500){
              var nv = dedupSys(m.content);
              if (nv !== m.content){ m.content = nv; o = Object.assign({}, o, { body: JSON.stringify(b) }); }
              break;
            }
          }
        }
      }
    } catch(e){ try { console.warn(TAG, 'dedup skipped:', e && e.message); } catch(_){} }
    return of.apply(this, [u, o]);
  };
  // own props 全継承(fix419cの教訓)
  try {
    Object.getOwnPropertyNames(of).forEach(function(k){
      if (k==='length'||k==='name'||k==='arguments'||k==='caller'||k==='prototype') return;
      try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(of, k)); } catch(e){}
    });
    try { Object.defineProperty(wrapped,'name',{value:(of&&of.name)||'fetch',configurable:true}); } catch(e){}
    if (of && of.prototype){ try { wrapped.prototype = of.prototype; } catch(e){} }
  } catch(e){}
  wrapped.__v292Dfix500 = true;
  W.fetch = wrapped;

  W.__v292Dfix500 = {
    __armed: true,
    dedupSys: dedupSys,
    wouldChange: wouldChange,
    active: active,
    on: on,
    last: function(){ return last; },
    status: function(){ return { armed:true, on:on(), active:active() }; }
  };
  try { console.log(TAG, 'armed; on:', on() ? 'on' : 'off(candidate)'); } catch(e){}
})();
