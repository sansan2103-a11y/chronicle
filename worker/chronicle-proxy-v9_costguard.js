// ============================================================
// Chronicle APIプロキシ (Cloudflare Worker) — v8
// v7からの追加(2026-07-02):
//   ★ 管理API action:'balances' … 残高ダッシュボード用。
//     ・OpenRouter: GET /api/v1/key で使用量/上限/残りを取得(+/creditsも試行)
//     ・Together: 残高APIが無いため、KV記帳(imgstats)から 今月枚数×単価 を推計
//     ・台帳(code:+allow:)の今月合計($/回数/トークン/稼働人数)
//   ★ /image 成功時にプロバイダ別の枚数をKV(imgstats)へ記帳(月替わりで自動リセット)
//   ★ action:'tg-test' … Togetherキーの無料自己診断(モデル一覧GET)
//   ・環境変数 TOGETHER_IMG_USD … 1枚あたりの推計単価$(既定 0.0007 ≒ 0.1円)
// v6からの追加(2026-07-02):
//   ★ Together AI対応(画像)。Fireworksがserverless画像提供を実質終了(kontextも404)したため、
//     第一候補をTogether(FLUX schnell・b64_json互換・無料モデルあり)に。
//   ・シークレット TOGETHER_KEY を設定すると有効(未設定なら従来どおりFireworks→pollinations)。
//   ・モデルは TOGETHER_IMAGE_MODEL (既定 black-forest-labs/FLUX.1-schnell-Free)。
//     有料高速版は black-forest-labs/FLUX.1-schnell を設定。
// v5からの追加(2026-07-02):
//   ★ FireworksのFLUXサーバーレス刷新に対応。旧 flux-1-schnell(-fp8) は serverless 提供終了
//     (fp8=401 / schnell=404 "not deployed" を実測)。現行の serverless 画像モデルは
//     flux-kontext-pro ($0.04/枚)のみ → 非同期API(submit→get_resultポーリング)に対応。
//   ・FIREWORKS_IMAGE_MODEL に 'kontext' を含むモデルは非同期経路、それ以外は従来のtext_to_image。
//   ・sizeはaspect_ratioへ変換(384x384→1:1 / 768x512→3:2)。
// v4からの追加(2026-07-02):
//   ① /image のFireworks失敗時、エラー内容(status+本文)を握りつぶさず返す
//   ② FIREWORKS_KEYを自動trim
//   ③ 管理API action:'fw-test' … キーが有効かを無料で自己診断
// v3からの追加: Googleログイン(IDトークン=JWT検証) + メール許可台帳(allow:<email>)
//
// ルート:
//   GET  /        … 生存確認 {"ok":true,"v":8}
//   POST /        … 本文生成 → OpenRouter (使用量を台帳に記帳)
//   POST /image   … アイコン生成 → Together→Fireworks→pollinations (枚数を記帳)
//   POST /admin   … 管理API (x-admin-tokenヘッダ必須)
//
// 認証ヘッダ(POST /, /image):
//   x-google-id      … Google Identity ServicesのIDトークン(JWT)。優先。
//   x-chronicle-pass … 従来の合言葉(Googleヘッダが無いときのフォールバック)
//
// シークレット(設定→変数とシークレット):
//   OPENROUTER_KEY / ACCESS_CODE / POLLINATIONS_KEY / ADMIN_TOKEN / GOOGLE_CLIENT_ID
//   TOGETHER_KEY / TOGETHER_IMAGE_MODEL / (任意)TOGETHER_IMG_USD
//   FIREWORKS_KEY / FIREWORKS_IMAGE_MODEL (現状未使用・残置)
//
// バインディング(設定→バインディング):
//   LEDGER … KVネームスペース「CHRONICLE_LEDGER」
//
// KVの中身:
//   code:<合言葉>  … {name,active,limitUsd,usedUsd,reqs,tokens,month,created,lastUsed}
//   allow:<email>  … 同上
//   config         … {allowedModels:[], killSwitch:false}
//   imgstats       … {month,total,byProvider:{together:n,...},lastAt}  ★v8
// ============================================================

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const POLLINATIONS_URL = 'https://gen.pollinations.ai/v1/images/generations';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'GET') {
      return json({ ok: true, service: 'chronicle-proxy', v: 9, ledger: !!env.LEDGER, google: !!env.GOOGLE_CLIENT_ID }, 200, request);
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, request);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400, request);
    }

    const path = new URL(request.url).pathname;

    // ---------- /admin : 管理API ----------
    if (path === '/admin') {
      const tok = request.headers.get('x-admin-token') || '';
      if (!env.ADMIN_TOKEN || tok !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, 401, request);
      }
      if (!env.LEDGER) {
        return json({ error: 'LEDGER(KV)が未バインドです。設定→バインディングでCHRONICLE_LEDGERをLEDGERとして追加してください' }, 503, request);
      }
      return admin(body, env, request);
    }

    // ---------- 認証(Google優先・合言葉フォールバック) ----------
    const gate = await checkAuth(request, env);
    if (!gate.ok) return json({ error: gate.error }, gate.status, request);

    // 緊急停止スイッチ
    if (gate.config && gate.config.killSwitch) {
      return json({ error: 'メンテナンス中です(管理者が一時停止しています)' }, 503, request);
    }

    // ---------- /image : アイコン生成 ----------
    if (path === '/image') {
      // ★v9: 画像コストガード（グローバル月次上限＋per-userレート制限）
      {
        const cap9 = +env.IMG_MONTHLY_CAP || 0;
        if (cap9 > 0) { const st9 = await getJSON(env, 'imgstats', {}); const n9 = (st9.month === month()) ? (+st9.total || 0) : 0; if (n9 >= cap9) return json({ error: '今月の画像生成が上限に達しました(管理者に連絡してください)' }, 402, request); }
        const rpm9 = +env.IMG_RATE_PER_MIN || 0;
        if (rpm9 > 0 && gate.codeKey) { const rk9 = 'rl:img:' + gate.codeKey + ':' + Math.floor(Date.now()/60000); const cur9 = +(await env.LEDGER.get(rk9)) || 0; if (cur9 >= rpm9) return json({ error: '画像生成が混み合っています。少し待って再試行してください' }, 429, request); ctx.waitUntil(env.LEDGER.put(rk9, String(cur9+1), { expirationTtl: 120 })); }
      }
      let fwErr = null; // ★v5: Fireworks失敗の詳細を保持(原因の見える化)
      let tgErr = null; // ★v7: Together失敗の詳細
      // ---- ★v7: Together AI (第一候補・FLUX schnell・b64_json互換) ----
      const tgKey = String(env.TOGETHER_KEY || '').trim();
      if (tgKey) {
        try {
          const tgModel = String(env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell-Free').trim();
          let tw = 384, th = 384;
          const tm = /^(\d+)x(\d+)$/.exec(String(body.size || ''));
          if (tm) { tw = +tm[1]; th = +tm[2]; }
          const tgBody = { model: tgModel, prompt: String(body.prompt || 'portrait'), width: tw, height: th, steps: 4, n: 1, response_format: 'b64_json' };
          if (body.seed != null) tgBody.seed = body.seed;
          const tgResp = await fetch('https://api.together.xyz/v1/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tgKey },
            body: JSON.stringify(tgBody),
          });
          if (tgResp.ok) {
            const tgJ = await tgResp.json();
            const tb64 = tgJ && tgJ.data && tgJ.data[0] && (tgJ.data[0].b64_json || tgJ.data[0].base64);
            if (tb64) {
              ctx.waitUntil(recordImg(env, 'together')); ctx.waitUntil(recordImgUser(env, gate.codeKey, (+env.TOGETHER_IMG_USD||0.0007))); // ★v8: 枚数記帳
              return json({ data: [ { b64_json: tb64 } ], provider: 'together' }, 200, request);
            }
            tgErr = { status: 200, detail: 'no b64 in response: ' + JSON.stringify(tgJ).slice(0, 200) };
          } else {
            let td = ''; try { td = (await tgResp.text()).slice(0, 300); } catch (te) {}
            tgErr = { status: tgResp.status, detail: td };
          }
        } catch (e) { tgErr = { status: 0, detail: String(e && e.message || e).slice(0, 300) }; }
      }
      const fwKey = String(env.FIREWORKS_KEY || '').trim(); // ★v5: 貼り付け事故(空白/改行)を自動無害化
      if (fwKey) {
        try {
          const model = String(env.FIREWORKS_IMAGE_MODEL || 'flux-kontext-pro').trim();
          let w = 384, h = 384;
          const mm = /^(\d+)x(\d+)$/.exec(String(body.size || ''));
          if (mm) { w = +mm[1]; h = +mm[2]; }
          if (model.indexOf('kontext') >= 0) {
            // ---- ★v6: 非同期API (submit → get_result ポーリング) ----
            const ar = (w === h) ? '1:1' : (w > h ? '3:2' : '2:3');
            const subBody = { prompt: String(body.prompt || 'portrait'), aspect_ratio: ar, output_format: 'jpeg' };
            if (body.seed != null) subBody.seed = body.seed;
            const base = 'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/' + model;
            const sub = await fetch(base, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + fwKey },
              body: JSON.stringify(subBody),
            });
            if (!sub.ok) {
              let d0 = ''; try { d0 = (await sub.text()).slice(0, 300); } catch (e0) {}
              fwErr = { status: sub.status, detail: d0 };
            } else {
              const subJ = await sub.json();
              const rid = subJ && (subJ.request_id || subJ.id);
              if (!rid) {
                fwErr = { status: 0, detail: 'no request_id: ' + JSON.stringify(subJ).slice(0, 200) };
              } else {
                let done = null, lastStatus = '';
                for (let t = 0; t < 28; t++) {
                  await new Promise(r => setTimeout(r, t < 4 ? 700 : 1200));
                  const pr = await fetch(base + '/get_result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + fwKey },
                    body: JSON.stringify({ id: rid }),
                  });
                  if (!pr.ok) { let dp = ''; try { dp = (await pr.text()).slice(0, 200); } catch (e1) {} fwErr = { status: pr.status, detail: dp }; break; }
                  const pj = await pr.json();
                  lastStatus = String(pj && pj.status || '');
                  if (lastStatus === 'Ready') { done = pj; break; }
                  if (lastStatus && lastStatus !== 'Pending') { fwErr = { status: 200, detail: 'kontext status: ' + lastStatus }; break; }
                }
                if (done) {
                  const res = done.result || {};
                  let b64out = '';
                  if (typeof res.sample === 'string' && res.sample.indexOf('http') === 0) {
                    const imgResp = await fetch(res.sample);
                    if (imgResp.ok) {
                      const buf2 = await imgResp.arrayBuffer();
                      const bytes2 = new Uint8Array(buf2);
                      let bin2 = ''; const CH2 = 0x8000;
                      for (let i2 = 0; i2 < bytes2.length; i2 += CH2) { bin2 += String.fromCharCode.apply(null, bytes2.subarray(i2, i2 + CH2)); }
                      b64out = btoa(bin2);
                    }
                  } else if (typeof res.sample === 'string' && res.sample.length > 100) {
                    b64out = res.sample.replace(/^data:image\/[a-z]+;base64,/, '');
                  } else if (typeof res.base64 === 'string') {
                    b64out = res.base64.replace(/^data:image\/[a-z]+;base64,/, '');
                  }
                  if (b64out) {
                    ctx.waitUntil(recordImg(env, 'fireworks')); ctx.waitUntil(recordImgUser(env, gate.codeKey, (+env.TOGETHER_IMG_USD||0.0007))); // ★v8
                    return json({ data: [ { b64_json: b64out } ], provider: 'fireworks-kontext' }, 200, request);
                  }
                  fwErr = { status: 0, detail: 'kontext ready but no image: ' + JSON.stringify(res).slice(0, 200) };
                } else if (!fwErr) {
                  fwErr = { status: 0, detail: 'kontext timeout (lastStatus=' + lastStatus + ')' };
                }
              }
            }
          } else {
          const fwBody = { prompt: String(body.prompt || 'portrait'), width: w, height: h };
          if (body.seed != null) fwBody.seed = body.seed;
          const fwUrl = 'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/' + model + '/text_to_image';
          const up = await fetch(fwUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'image/jpeg', 'Authorization': 'Bearer ' + fwKey },
            body: JSON.stringify(fwBody),
          });
          if (up.ok) {
            const buf = await up.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = ''; const CH = 0x8000;
            for (let i = 0; i < bytes.length; i += CH) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); }
            const b64 = btoa(bin);
            ctx.waitUntil(recordImg(env, 'fireworks')); ctx.waitUntil(recordImgUser(env, gate.codeKey, (+env.TOGETHER_IMG_USD||0.0007))); // ★v8
            return json({ data: [ { b64_json: b64 } ], provider: 'fireworks' }, 200, request);
          }
          // Fireworks 失敗 → 詳細を保持して下の Pollinations フォールバックへ
          let detail = '';
          try { detail = (await up.text()).slice(0, 300); } catch (e2) {}
          fwErr = { status: up.status, detail };
          }
        } catch (e) { fwErr = { status: 0, detail: String(e && e.message || e).slice(0, 300) }; }
      }
      // Pollinations フォールバック(従来経路)
      if (!env.POLLINATIONS_KEY) {
        return json({ error: 'image provider failed', together: tgErr || 'TOGETHER_KEY未設定', fireworks: fwErr || 'FIREWORKS_KEY未設定' }, 502, request);
      }
      const upstream = await fetch(POLLINATIONS_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.POLLINATIONS_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      // ★v5: フォールバックも失敗したら、Fireworks側の本当の失敗理由をJSONで返す
      if (!upstream.ok) {
        let pDetail = '';
        try { pDetail = (await upstream.text()).slice(0, 200); } catch (e3) {}
        return json({
          error: 'image providers failed',
          together: tgErr || '未試行(TOGETHER_KEY未設定)',
          fireworks: fwErr || '未試行(FIREWORKS_KEY未設定)',
          pollinations: { status: upstream.status, detail: pDetail },
        }, 502, request);
      }
      ctx.waitUntil(recordImg(env, 'pollinations')); ctx.waitUntil(recordImgUser(env, gate.codeKey, (+env.TOGETHER_IMG_USD||0.0007))); // ★v8
      const headers = new Headers(cors(request));
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // ---------- / : 本文生成 ----------
    const allowed = (gate.config && Array.isArray(gate.config.allowedModels) && gate.config.allowedModels.length > 0)
      ? gate.config.allowedModels
      : (env.ALLOWED_MODELS ? env.ALLOWED_MODELS.split(',').map(s => s.trim()) : null);
    if (allowed && !allowed.includes(body.model)) {
      return json({ error: 'model not allowed: ' + body.model }, 403, request);
    }

    const wantStream = !!body.stream;
    if (!wantStream) body.usage = { include: true };

    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.OPENROUTER_KEY,
        'Content-Type': 'application/json',
        'X-Title': 'Chronicle',
      },
      body: JSON.stringify(body),
    });

    if (wantStream || !env.LEDGER || !gate.codeKey) {
      const headers = new Headers(cors(request));
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    const text = await upstream.text();
    if (upstream.ok) ctx.waitUntil(record(env, gate.codeKey, text));
    const headers = new Headers(cors(request));
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(text, { status: upstream.status, headers });
  },
};

// ---------- 認証: Google(x-google-id) を優先、無ければ合言葉(x-chronicle-pass) ----------
async function checkAuth(request, env) {
  const gid = request.headers.get('x-google-id') || '';
  if (gid) {
    let payload;
    try {
      payload = await verifyGoogleIdToken(gid, env.GOOGLE_CLIENT_ID);
    } catch (e) {
      return { ok: false, status: 401, error: 'Googleログインの検証に失敗しました(' + (e && e.message || e) + ')。ログインし直してください' };
    }
    if (!env.LEDGER) return { ok: false, status: 503, error: 'LEDGER(KV)が未バインドです' };
    const email = String(payload.email || '').toLowerCase();
    if (!email) return { ok: false, status: 401, error: 'メールが取得できませんでした' };
    const config = await getJSON(env, 'config', {});
    const rec = await getJSON(env, 'allow:' + email, null);
    if (!rec || !rec.active) {
      return { ok: false, status: 403, error: 'このGoogleアカウント(' + email + ')はまだ許可されていません。管理者に連絡してください' };
    }
    const m = month();
    const used = (rec.month === m) ? (+rec.usedUsd || 0) : 0;
    if (+rec.limitUsd > 0 && used >= +rec.limitUsd) {
      return { ok: false, status: 402, error: '今月の利用上限に達しました(管理者に連絡してください)' };
    }
    return { ok: true, codeKey: 'allow:' + email, config, email };
  }
  const pass = request.headers.get('x-chronicle-pass') || '';
  return checkPass(pass, env);
}

// ---------- Google IDトークン(JWT/RS256)の検証 ----------
async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(b64urlToStr(parts[0]));
  const payload = JSON.parse(b64urlToStr(parts[1]));
  if (header.alg !== 'RS256') throw new Error('alg!=RS256');
  const certsResp = await fetch(GOOGLE_CERTS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  const jwks = await certsResp.json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const sig = b64urlToBytes(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!valid) throw new Error('bad signature');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) throw new Error('expired');
  if (payload.nbf && now < payload.nbf) throw new Error('not yet valid');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') throw new Error('bad iss');
  if (clientId && payload.aud !== clientId) throw new Error('bad aud');
  if (!payload.email) throw new Error('no email');
  if (payload.email_verified === false) throw new Error('email not verified');
  return payload;
}

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function b64urlToStr(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}

// 合言葉の照合: マスター(ACCESS_CODE) or KV台帳のコード
async function checkPass(pass, env) {
  if (!pass) return { ok: false, status: 401, error: 'unauthorized' };
  const config = env.LEDGER ? await getJSON(env, 'config', {}) : {};
  if (env.ACCESS_CODE && pass === env.ACCESS_CODE) {
    return { ok: true, codeKey: env.LEDGER ? 'code:master' : null, config };
  }
  if (!env.LEDGER) return { ok: false, status: 401, error: 'unauthorized' };
  const rec = await getJSON(env, 'code:' + pass, null);
  if (!rec) return { ok: false, status: 401, error: 'unauthorized' };
  if (!rec.active) return { ok: false, status: 403, error: 'この合言葉は停止中です' };
  const m = month();
  const used = (rec.month === m) ? (+rec.usedUsd || 0) : 0;
  if (+rec.limitUsd > 0 && used >= +rec.limitUsd) {
    return { ok: false, status: 402, error: '今月の利用上限に達しました(管理者に連絡してください)' };
  }
  return { ok: true, codeKey: 'code:' + pass, config };
}

// 使用量の記帳(月が変わったら自動リセット) — code: / allow: 両対応
async function record(env, codeKey, text) {
  try {
    let cost = 0, pt = 0, ct = 0;
    try {
      const j = JSON.parse(text);
      if (j.usage) {
        cost = +j.usage.cost || 0;
        pt = +j.usage.prompt_tokens || 0;
        ct = +j.usage.completion_tokens || 0;
      }
    } catch (e) {}
    const rec = await getJSON(env, codeKey, { name: codeKey === 'code:master' ? 'マスター(管理者)' : '', active: true, limitUsd: 0 });
    const m = month();
    if (rec.month !== m) { rec.month = m; rec.usedUsd = 0; rec.reqs = 0; rec.tokens = 0; }
    rec.usedUsd = +(((+rec.usedUsd || 0) + cost).toFixed(6));
    rec.reqs = (+rec.reqs || 0) + 1;
    rec.tokens = (+rec.tokens || 0) + pt + ct;
    rec.lastUsed = new Date().toISOString();
    await env.LEDGER.put(codeKey, JSON.stringify(rec));
  } catch (e) {}
}

// ★v9: 画像コストを認証ユーザーの台帳(usedUsd)へ計上→既存のlimitUsdが画像にも効く
async function recordImgUser(env, codeKey, unit) {
  try {
    if (!env.LEDGER || !codeKey) return;
    const rec = await getJSON(env, codeKey, { name: codeKey === 'code:master' ? 'マスター(管理者)' : '', active: true, limitUsd: 0 });
    const m = month();
    if (rec.month !== m) { rec.month = m; rec.usedUsd = 0; rec.reqs = 0; rec.tokens = 0; }
    rec.usedUsd = +(((+rec.usedUsd || 0) + (+unit || 0)).toFixed(6));
    rec.lastUsed = new Date().toISOString();
    await env.LEDGER.put(codeKey, JSON.stringify(rec));
  } catch (e) {}
}

// ★v8: 画像生成の枚数記帳(プロバイダ別・月替わりで自動リセット)
async function recordImg(env, provider) {
  try {
    if (!env.LEDGER) return;
    const m = month();
    const st = await getJSON(env, 'imgstats', {});
    if (st.month !== m) { st.month = m; st.total = 0; st.byProvider = {}; }
    st.byProvider = st.byProvider || {};
    st.byProvider[provider] = (+st.byProvider[provider] || 0) + 1;
    st.total = (+st.total || 0) + 1;
    st.lastAt = new Date().toISOString();
    await env.LEDGER.put('imgstats', JSON.stringify(st));
  } catch (e) {}
}

// 管理API本体
async function admin(body, env, request) {
  const act = body.action || '';

  if (act === 'list') {
    const codes = await listPrefix(env, 'code:');
    const allows = await listPrefix(env, 'allow:');
    const config = await getJSON(env, 'config', {});
    return json({ codes, allows, config }, 200, request);
  }

  // ---- ★v8: 残高ダッシュボード ----
  if (act === 'balances') {
    const out = { ok: true, month: month() };
    // OpenRouter: キーの使用量/上限/残り
    const orKey = String(env.OPENROUTER_KEY || '').trim();
    if (!orKey) {
      out.openrouter = { keySet: false };
    } else {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { 'Authorization': 'Bearer ' + orKey } });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.data) {
          out.openrouter = {
            keySet: true, ok: true,
            label: j.data.label || '',
            usage: +j.data.usage || 0,
            limit: (j.data.limit == null) ? null : +j.data.limit,
            limitRemaining: (j.data.limit_remaining == null) ? null : +j.data.limit_remaining,
            isFreeTier: !!j.data.is_free_tier,
          };
        } else {
          out.openrouter = { keySet: true, ok: false, status: r.status, detail: JSON.stringify(j).slice(0, 200) };
        }
      } catch (e) {
        out.openrouter = { keySet: true, ok: false, status: 0, detail: String(e && e.message || e).slice(0, 200) };
      }
      // 口座全体のクレジット(管理キーでないと拒否される場合あり→失敗は静かに無視)
      try {
        const r2 = await fetch('https://openrouter.ai/api/v1/credits', { headers: { 'Authorization': 'Bearer ' + orKey } });
        if (r2.ok) {
          const j2 = await r2.json().catch(() => null);
          if (j2 && j2.data) out.openrouterCredits = { totalCredits: +j2.data.total_credits || 0, totalUsage: +j2.data.total_usage || 0 };
        }
      } catch (e) {}
    }
    // Together: 残高API非公開 → KV記帳から推計
    const st = await getJSON(env, 'imgstats', {});
    const unit = +env.TOGETHER_IMG_USD || 0.0007;
    const m = month();
    const bp = (st.month === m && st.byProvider) ? st.byProvider : {};
    const tgN = +bp.together || 0;
    out.together = {
      keySet: !!String(env.TOGETHER_KEY || '').trim(),
      model: String(env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell-Free').trim(),
      images: tgN,
      estUsd: +(tgN * unit).toFixed(4),
      unitUsd: unit,
      imagesAll: bp,
      lastAt: st.lastAt || null,
      note: 'Togetherは残高APIを公開していないため今月枚数×単価の推計です',
    };
    out.fireworks = { keySet: !!String(env.FIREWORKS_KEY || '').trim() };
    out.pollinations = { keySet: !!env.POLLINATIONS_KEY };
    // 台帳の今月合計
    try {
      const codes = await listPrefix(env, 'code:');
      const allows = await listPrefix(env, 'allow:');
      let usd = 0, reqs = 0, tokens = 0, active = 0;
      for (const r of codes.concat(allows)) {
        if (r.active) active++;
        if (r.month === m) { usd += +r.usedUsd || 0; reqs += +r.reqs || 0; tokens += +r.tokens || 0; }
      }
      out.ledger = { usd: +usd.toFixed(4), reqs, tokens, activeUsers: active, entries: codes.length + allows.length };
    } catch (e) {}
    const config = await getJSON(env, 'config', {});
    out.killSwitch = !!config.killSwitch;
    return json(out, 200, request);
  }

  if (act === 'create') {
    let code = String(body.code || '').trim();
    if (!code) code = genCode();
    const key = 'code:' + code;
    if (await env.LEDGER.get(key)) return json({ error: 'その合言葉は既に存在します' }, 409, request);
    const rec = newRec(body);
    await env.LEDGER.put(key, JSON.stringify(rec));
    return json({ ok: true, code, rec }, 200, request);
  }

  if (act === 'update') {
    const key = 'code:' + String(body.code || '');
    const rec = await getJSON(env, key, null);
    if (!rec) return json({ error: 'not found' }, 404, request);
    applyUpdate(rec, body);
    await env.LEDGER.put(key, JSON.stringify(rec));
    return json({ ok: true, rec }, 200, request);
  }

  if (act === 'delete') {
    await env.LEDGER.delete('code:' + String(body.code || ''));
    return json({ ok: true }, 200, request);
  }

  // ---- ★v4: メール許可台帳(allow:<email>) ----
  if (act === 'allow-list') {
    return json({ allows: await listPrefix(env, 'allow:') }, 200, request);
  }

  if (act === 'allow-create') {
    const email = normEmail(body.email);
    if (!email) return json({ error: 'emailが不正です' }, 400, request);
    const key = 'allow:' + email;
    if (await env.LEDGER.get(key)) return json({ error: 'そのメールは既に許可済みです' }, 409, request);
    const rec = newRec(body);
    await env.LEDGER.put(key, JSON.stringify(rec));
    return json({ ok: true, email, rec }, 200, request);
  }

  if (act === 'allow-update') {
    const email = normEmail(body.email);
    const key = 'allow:' + email;
    const rec = await getJSON(env, key, null);
    if (!rec) return json({ error: 'not found' }, 404, request);
    applyUpdate(rec, body);
    await env.LEDGER.put(key, JSON.stringify(rec));
    return json({ ok: true, rec }, 200, request);
  }

  if (act === 'allow-delete') {
    await env.LEDGER.delete('allow:' + normEmail(body.email));
    return json({ ok: true }, 200, request);
  }

  // ---- ★v5: Fireworksキー自己診断(無料・モデル一覧GETで認証だけ確認) ----
  if (act === 'fw-test') {
    const raw = String(env.FIREWORKS_KEY || '');
    if (!raw) return json({ ok: false, reason: 'FIREWORKS_KEYが未設定です' }, 200, request);
    const key = raw.trim();
    const hygiene = {
      length: raw.length,
      trimmedLength: key.length,
      hadWhitespace: raw !== key,
      head: key.slice(0, 5),
      looksLikeFwKey: /^fw_[A-Za-z0-9]+$/.test(key),
    };
    let r, detail = '';
    try {
      r = await fetch('https://api.fireworks.ai/inference/v1/models', {
        headers: { 'Authorization': 'Bearer ' + key },
      });
      try { detail = (await r.text()).slice(0, 200); } catch (e2) {}
    } catch (e) {
      return json({ ok: false, reason: 'fetch失敗: ' + String(e && e.message || e), hygiene }, 200, request);
    }
    return json({
      ok: r.ok,
      status: r.status,
      hint: r.ok ? 'キーは有効です' : (r.status === 401 ? 'キーが無効です(Fireworksで新しいキーを作って登録し直してください)' : '認証以外の問題の可能性(status参照)'),
      hygiene,
      detail: r.ok ? '(省略)' : detail,
    }, 200, request);
  }

  // ---- ★v8: Togetherキー自己診断(無料・モデル一覧GETで認証だけ確認) ----
  if (act === 'tg-test') {
    const raw = String(env.TOGETHER_KEY || '');
    if (!raw) return json({ ok: false, reason: 'TOGETHER_KEYが未設定です' }, 200, request);
    const key = raw.trim();
    let r, detail = '';
    try {
      r = await fetch('https://api.together.xyz/v1/models', {
        headers: { 'Authorization': 'Bearer ' + key },
      });
      if (!r.ok) { try { detail = (await r.text()).slice(0, 200); } catch (e2) {} }
    } catch (e) {
      return json({ ok: false, reason: 'fetch失敗: ' + String(e && e.message || e) }, 200, request);
    }
    return json({
      ok: r.ok,
      status: r.status,
      hint: r.ok ? 'キーは有効です' : (r.status === 401 ? 'キーが無効です(Togetherで新しいキーを作って登録し直してください)' : '認証以外の問題の可能性(status参照)'),
      detail,
    }, 200, request);
  }

  if (act === 'config-set') {
    const config = await getJSON(env, 'config', {});
    if (body.allowedModels != null) {
      config.allowedModels = Array.isArray(body.allowedModels)
        ? body.allowedModels.filter(Boolean)
        : String(body.allowedModels).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof body.killSwitch === 'boolean') config.killSwitch = body.killSwitch;
    await env.LEDGER.put('config', JSON.stringify(config));
    return json({ ok: true, config }, 200, request);
  }

  return json({ error: 'unknown action: ' + act }, 400, request);
}

function newRec(body) {
  return {
    name: String(body.name || '').slice(0, 40),
    active: true,
    limitUsd: +body.limitUsd || 0,
    usedUsd: 0, reqs: 0, tokens: 0,
    month: month(),
    created: new Date().toISOString(),
  };
}
function applyUpdate(rec, body) {
  if (typeof body.active === 'boolean') rec.active = body.active;
  if (body.limitUsd != null) rec.limitUsd = +body.limitUsd || 0;
  if (body.name != null) rec.name = String(body.name).slice(0, 40);
}
async function listPrefix(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.LEDGER.list({ prefix, cursor });
    for (const k of r.keys) {
      const rec = await getJSON(env, k.name, {});
      out.push({ key: k.name.slice(prefix.length), ...rec });
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}
function normEmail(e) { return String(e || '').trim().toLowerCase(); }

function month() { return new Date().toISOString().slice(0, 7); }

function genCode() {
  const words = ['kaede', 'tsuki', 'hoshi', 'kage', 'yume', 'sora', 'mizu', 'hana', 'yuki', 'kaze'];
  const w = words[Math.floor(Math.random() * words.length)];
  return w + '-' + Math.random().toString(36).slice(2, 8);
}

async function getJSON(env, key, fallback) {
  try {
    const v = await env.LEDGER.get(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}

function cors(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-chronicle-pass, x-admin-token, x-google-id',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(request) },
  });
}

// テスト用エクスポート(Workers実行時は未使用)
export { verifyGoogleIdToken, b64urlToBytes, b64urlToStr };
