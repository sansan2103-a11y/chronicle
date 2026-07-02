// ============================================================
// Chronicle APIプロキシ (Cloudflare Worker) — v5
// v4からの追加(2026-07-02):
//   ① /image のFireworks失敗時、エラー内容(status+本文)を握りつぶさず返す
//      → 旧pollinationsの412に埋もれて原因不明になる問題を根治
//   ② FIREWORKS_KEYを自動trim(貼り付け時の空白/改行/全角空白事故を無害化)
//   ③ 管理API action:'fw-test' … キーが有効かを無料で自己診断(モデル一覧GET)
// v3からの追加: Googleログイン(IDトークン=JWT検証) + メール許可台帳(allow:<email>)
//   → 合言葉の配布が不要に。許可リストにメールを足すだけでアクセス可。
//   合言葉(x-chronicle-pass)も後方互換で従来どおり動く。
//
// ルート:
//   GET  /        … 生存確認 {"ok":true,"v":4}
//   POST /        … 本文生成 → OpenRouter (使用量を台帳に記帳)
//   POST /image   … アイコン生成 → pollinations
//   POST /admin   … 管理API (x-admin-tokenヘッダ必須)
//
// 認証ヘッダ(POST /, /image):
//   x-google-id      … Google Identity ServicesのIDトークン(JWT)。優先。
//   x-chronicle-pass … 従来の合言葉(Googleヘッダが無いときのフォールバック)
//
// シークレット(設定→変数とシークレット):
//   OPENROUTER_KEY   … OpenRouterのAPIキー(sk-or-...)
//   ACCESS_CODE      … マスター合言葉(任意・従来互換)
//   POLLINATIONS_KEY … pollinationsのキー ※/image用
//   ADMIN_TOKEN      … 管理API用トークン
//   GOOGLE_CLIENT_ID … ★v4で新規。GCPで発行したWebクライアントID(...apps.googleusercontent.com)
//
// バインディング(設定→バインディング):
//   LEDGER … KVネームスペース「CHRONICLE_LEDGER」
//
// KVの中身:
//   code:<合言葉>  … {name,active,limitUsd,usedUsd,reqs,tokens,month,created,lastUsed}
//   allow:<email>  … {name,active,limitUsd,usedUsd,reqs,tokens,month,created,lastUsed}  ★v4
//   config         … {allowedModels:[], killSwitch:false}
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
      return json({ ok: true, service: 'chronicle-proxy', v: 5, ledger: !!env.LEDGER, google: !!env.GOOGLE_CLIENT_ID }, 200, request);
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
    // v337c: FIREWORKS_KEY があれば Fireworks 直叩き(Pollinationsの共有アカウント停止に依存しない)。
    //   Fireworks は返却がバイナリ画像なので b64_json 形式に正規化して返す(クライアントfix197は無変更)。
    //   FIREWORKS_KEY 未設定 or Fireworks 失敗時は従来の Pollinations へ自動フォールバック=無停止移行。
    if (path === '/image') {
      let fwErr = null; // ★v5: Fireworks失敗の詳細を保持(原因の見える化)
      const fwKey = String(env.FIREWORKS_KEY || '').trim(); // ★v5: 貼り付け事故(空白/改行)を自動無害化
      if (fwKey) {
        try {
          const model = String(env.FIREWORKS_IMAGE_MODEL || 'flux-1-schnell-fp8').trim();
          let w = 384, h = 384;
          const mm = /^(\d+)x(\d+)$/.exec(String(body.size || ''));
          if (mm) { w = +mm[1]; h = +mm[2]; }
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
            return json({ data: [ { b64_json: b64 } ], provider: 'fireworks' }, 200, request);
          }
          // Fireworks 失敗 → 詳細を保持して下の Pollinations フォールバックへ
          let detail = '';
          try { detail = (await up.text()).slice(0, 300); } catch (e2) {}
          fwErr = { status: up.status, detail };
        } catch (e) { fwErr = { status: 0, detail: String(e && e.message || e).slice(0, 300) }; }
      }
      // Pollinations フォールバック(従来経路)
      if (!env.POLLINATIONS_KEY) {
        return json({ error: 'image provider failed', fireworks: fwErr || 'FIREWORKS_KEY未設定' }, 502, request);
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
          fireworks: fwErr || '未試行(FIREWORKS_KEY未設定)',
          pollinations: { status: upstream.status, detail: pDetail },
        }, 502, request);
      }
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

// 管理API本体
async function admin(body, env, request) {
  const act = body.action || '';

  if (act === 'list') {
    const codes = await listPrefix(env, 'code:');
    const allows = await listPrefix(env, 'allow:');
    const config = await getJSON(env, 'config', {});
    return json({ codes, allows, config }, 200, request);
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
