/* v292DfixS1 — 旧入口（github.io）に「正式な入口」の案内を出す（GPT #127-CA／#127-CB：S-1 第 1 段・案内方式）
 *
 * 目的：Chronicle の正式な入口は chronicle-app.pages.dev。旧入口の github.io は本番と同じ build を配信しているが、
 *   ・cookie session（fix893）が無く、旧方式の認証で保存される。
 *   ・端末内の保存（localStorage／IndexedDB）は入口ごとに別。
 *   そのため、利用者が気づかずに旧入口で遊び続けると、PC と iPhone の共有・物語を隠す機能の前提が崩れる。
 *
 * この段でやること（だけ）：
 *   ・github.io で開いたときだけ、画面下に案内を出す。「新しい入口で開く」は利用者が押したときだけ移動する（自動転送はしない＝HOLD）。
 *   ・旧入口の端末内データは、読める状態のまま。消さない・移さない・書き換えない。
 *   ・保存の制限（第 2 段）・自動転送（第 3 段）はしない。
 * 書込み：sessionStorage（このタブで「今は閉じる」を押した印）だけ。localStorage・IndexedDB・サーバには書かない。
 * kill：localStorage v292DfixS1Off='1'（案内を出さない）。pages.dev では何もしない。
 */
(function(){
  'use strict';
  if (window.__v292DfixS1) return;
  var OFFICIAL = 'https://chronicle-app.pages.dev';
  var DISMISS = 'v292DfixS1Dismissed';
  var stats = { shown: 0, moved: 0, dismissed: 0, skipped: '' };
  function isLegacyHost(h){ return /(^|\.)github\.io$/i.test(String(h || '')); }
  function off(){ try { return localStorage.getItem('v292DfixS1Off') === '1'; } catch(e){ return false; } }
  function dismissed(){ try { return sessionStorage.getItem(DISMISS) === '1'; } catch(e){ return false; } }
  /* 旧入口の URL を、正式な入口の同じ画面へ対応させる（/chronicle/ の下にある前提。無ければそのままの path） */
  function officialUrl(loc){
    var p = String(loc.pathname || '/');
    p = p.replace(/^\/chronicle(?=\/|$)/, '');
    if (!p) p = '/';
    return OFFICIAL + p + String(loc.search || '') + String(loc.hash || '');
  }
  function el(tag, css, text){ var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  function show(){
    if (document.querySelector('[data-fixs1]')) return;
    var box = el('div', 'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom, 0px));z-index:2147483000;' +
      'background:#1d1b2e;color:#eee;border:1px solid #8a7cf0;border-radius:12px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.45);' +
      'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;max-width:640px;margin:0 auto');
    box.setAttribute('data-fixs1', '1'); box.setAttribute('role', 'region'); box.setAttribute('aria-label', '入口の案内');
    box.appendChild(el('div', 'font-weight:700;margin-bottom:4px', 'Chronicle の入口が新しくなりました'));
    box.appendChild(el('div', '', '今後は新しい入口（chronicle-app.pages.dev）をご利用ください。'));
    box.appendChild(el('div', 'color:#b9b4d9;font-size:12px;margin-top:4px', 'この入口に保存された端末内データは、新しい入口へ自動では引き継がれません。この案内によって削除されることはなく、この入口（github.io）でも引き続き確認できます。'));
    box.appendChild(el('div', 'color:#f0d68a;font-size:12px;margin-top:4px', '旧入口に保存された物語やシナリオは、新しい入口には自動で表示されません。現在、移行方法を準備していますので、旧入口のデータは削除せずにお待ちください。'));
    var row = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap');
    var go = el('a', 'background:#6d5df0;color:#fff;border-radius:8px;padding:8px 14px;text-decoration:none;font-weight:700', '新しい入口で開く');
    go.href = officialUrl(location); go.rel = 'noopener';
    go.addEventListener('click', function(){ stats.moved++; });
    var later = el('button', 'background:transparent;color:#ddd;border:1px solid #555;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer', '今は閉じる');
    later.type = 'button';
    later.addEventListener('click', function(){ try { sessionStorage.setItem(DISMISS, '1'); } catch(e){} stats.dismissed++; try { box.remove(); } catch(e){ box.parentNode && box.parentNode.removeChild(box); } });
    row.appendChild(later); row.appendChild(go); box.appendChild(row);
    (document.body || document.documentElement).appendChild(box);
    stats.shown++;
  }
  function boot(){
    if (!isLegacyHost(location.hostname)){ stats.skipped = 'official'; return; }
    if (off()){ stats.skipped = 'off'; return; }
    if (dismissed()){ stats.skipped = 'dismissed'; return; }
    show();
  }
  window.__v292DfixS1 = { __armed: true, version: 'fixS1-r3', officialUrl: officialUrl, isLegacyHost: isLegacyHost, stats: function(){ return JSON.parse(JSON.stringify(stats)); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
