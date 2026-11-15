/* v292Dfix990 — 旧画像同期の空回り止め（GPT #127-EN D）
 * 症状：Vault のあるアカウント・beta アカウントでは、Worker が旧画像の op（imgmanifest・putimg など）を
 *   409 ASSET_V2_REQUIRED（retryable:false）で断る。旧アイコン同期（fix523・fix633・fix634）はそれを無視して
 *   数秒ごとに送り続け、/api/save の 409 が大量に並ぶ（費用 0・害は無いが通信の無駄）。
 * 対処：Worker が「その op は ASSET_V2_REQUIRED」と答えたら、このタブではその op を 10 分間サーバーへ送らず、
 *   同じ形の 409 をその場で返す。Worker の判定は変えない（拒否は Worker のまま）。答えが 409 以外なら何もしない。
 *   ・対象は POST /save（/api/save）で、本文の op が下の旧画像 op のものだけ。物語の保存・本文生成・Asset v2 の op は素通し。
 *   ・旧形式の物語でも、Worker が通している（200）アカウントでは一度も働かない＝Owner の既存の挙動は変わらない。
 *   ・期限 10 分・タブを閉じる／再読込で消える（sessionStorage）。
 * kill: localStorage v292Dfix990Off='1'
 * 読み込み位置：fix523 / fix633 / fix634 より前（それらは読み込み時に fetch を掴むため）。 */
(function(){
  'use strict';
  if (typeof window === 'undefined' || window.__v292Dfix990) return;
  var W = window;
  var OPS = { getimg: 1, imgmanifest: 1, imgnsinfo: 1, putimg: 1, imgconfirm: 1, imgmigrate: 1 };   // Worker V2_CLASS の ASSET_READ / ASSET_WRITE と同じ 6 つ
  var TTL_MS = 10 * 60 * 1000;
  var KEY = 'v292Dfix990Trip';
  var stats = { tripped: {}, shortCircuit: 0, passed: 0, observed409: 0 };
  function off(){ try { return localStorage.getItem('v292Dfix990Off') === '1'; } catch(e){ return false; } }
  function load(){ try { var o = JSON.parse(sessionStorage.getItem(KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch(e){ return {}; } }
  function save(o){ try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch(e){} }
  function acct(){ try { var F = W.__v292Dfix893; var m = F && ((F.serverMe && F.serverMe()) || (F.me && F.me())); return (m && m.accountId) ? String(m.accountId) : '?'; } catch(e){ return '?'; } }   // ★アカウントごと（切り替えたら別扱い）
  function k(op){ return acct() + ':' + op; }
  function tripped(op){ var o = load(); var t = +o[k(op)] || 0; if (!t) return false; if (Date.now() - t > TTL_MS){ delete o[k(op)]; save(o); return false; } return true; }
  function trip(op){ var o = load(); o[k(op)] = Date.now(); save(o); stats.tripped[op] = (stats.tripped[op] || 0) + 1; }
  function urlOf(input){ try { return (typeof input === 'string') ? input : (input && input.url) || ''; } catch(e){ return ''; } }
  function isSave(u){ return /\/save(?:\?|$)/.test(String(u || '').split('#')[0]); }
  /* ★IMGSTOP1 (2026-11-15・GPT #127-UF ③): putimg は絵の data を積むため本文が 4096 字を超え、上の字数の制限で op を読めず素通しになっていた（SMOKE7: Worker の 409 ASSET_V2_REQUIRED が続いた）。
     長い本文は「先頭の JSON の op フィールドの値」が下の旧画像 op のどれかと完全に一致するときだけ対象（{ "op" : "putimg" などの空白の差は許す）。
     判定できない本文（先頭が { でない・最初の鍵が op でない・値に \ などの記号がある・先頭 256 字に収まらない）は従来どおり送る。本文の途中の "putimg" の文字には当たらない。
     kill: localStorage v292DfixIMGSTOP1Off='1'（長い本文は従来どおり素通し＝土台と同じ） */
  var IMGSTOP1_HEAD = /^\s*\{\s*"op"\s*:\s*"([A-Za-z0-9_.]+)"\s*[,}]/;
  function imgstopOff(){ try { return localStorage.getItem('v292DfixIMGSTOP1Off') === '1'; } catch(e){ return false; } }
  function opOf(init){
    try { var b = init && init.body; if (typeof b !== 'string') return null;
      if (b.length > 4096){ if (imgstopOff()) return null; var mb = IMGSTOP1_HEAD.exec(b.slice(0, 256)); return (mb && OPS.hasOwnProperty(mb[1]) && OPS[mb[1]] === 1) ? mb[1] : null; }
      var m = /"op"\s*:\s*"([A-Za-z0-9_.]+)"/.exec(b); return m && OPS[m[1]] === 1 ? m[1] : null; } catch(e){ return null; }
  }
  function synth(){
    return new Response(JSON.stringify({ ok: false, error: 'この画像操作はまだ利用できません', errorCode: 'ASSET_V2_REQUIRED', retryable: false, fix990: 'local' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } });
  }
  var orig = W.fetch;
  if (typeof orig !== 'function') return;
  W.fetch = function(input, init){
    if (off()) return orig.apply(this, arguments);
    var op = null;
    try { var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(); if (method === 'POST' && isSave(urlOf(input))) op = opOf(init); } catch(e){ op = null; }
    if (!op) return orig.apply(this, arguments);
    if (tripped(op)) { stats.shortCircuit++; return Promise.resolve(synth()); }
    stats.passed++;
    return orig.apply(this, arguments).then(function(res){
      try {
        if (res && res.status === 409) {
          stats.observed409++;
          res.clone().json().then(function(j){ if (j && j.errorCode === 'ASSET_V2_REQUIRED') trip(op); }).catch(function(){});
        }
      } catch(e){}
      return res;
    });
  };
  W.__v292Dfix990 = { status: function(){ return { off: off(), trips: load(), stats: JSON.parse(JSON.stringify(stats)) }; }, reset: function(){ save({}); } };
})();
