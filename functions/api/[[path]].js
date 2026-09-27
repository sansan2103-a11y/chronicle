/* Cloudflare Pages Function: same-origin /api/* → novel-proxy Worker（Service Binding NOVEL_PROXY）。
   ACCOUNT_IDENTITY_P2 S-A。/api を外して Worker へそのまま渡す（method / headers / body / cookie は無加工）。
   Worker 側は exact path（/save, /img, /auth/*）で振り分けるので、/api を外さないと誤った応答になる。 */
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.NOVEL_PROXY || typeof env.NOVEL_PROXY.fetch !== 'function') {
    return new Response(JSON.stringify({ ok: false, errorCode: 'NO_BINDING' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const target = new URL(path + url.search, 'https://novel-proxy.internal');
  return env.NOVEL_PROXY.fetch(new Request(target.toString(), request));
}
