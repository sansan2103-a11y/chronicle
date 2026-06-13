// ============================================================
// Chronicle APIプロキシ (Cloudflare Worker) — v3
// v2からの追加: KV台帳(合言葉の個別発行/使用量記帳/上限) + 管理API(/admin)
//
// ルート:
//   GET  /        … 生存確認 {"ok":true,"v":3}
//   POST /        … 本文生成 → OpenRouter (使用量を台帳に記帳)
//   POST /image   … アイコン生成 → pollinations
//   POST /admin   … 管理API (x-admin-tokenヘッダ必須)
//
// シークレット(設定→変数とシークレット):
//   OPENROUTER_KEY   … OpenRouterのAPIキー(sk-or-...)
//   ACCESS_CODE      … マスター合言葉(従来のもの。台帳に'master'として記帳)
//   POLLINATIONS_KEY … pollinationsのキー ※/image用
//   ADMIN_TOKEN      … 管理API用トークン(★v3で新規)
//
// バインディング(設定→バインディング):
//   LEDGER … KVネームスペース「CHRONICLE_LEDGER」(★v3で新規)
//
// KVの中身:
//   code:<合言葉> … {name,active,limitUsd,usedUsd,reqs,tokens,month,created,lastUsed}
//   config        … {allowedModels:[], killSwitch:false}
// ============================================================

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const POLLINATIONS_URL = 'https://gen.pollinations.ai/v1/images/generations';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }
    if (request.method === 'GET') {
      return json({ ok: true, service: 'chronicle-proxy', v: 3, ledger: !!env.LEDGER }, 200, request);
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

    // ---------- /admin : 管理API (トークン必須・合言葉とは別系統) ----------
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

    // ---------- 合言葉ガード(台帳照合) ----------
    const pass = request.headers.get('x-chronicle-pass') || '';
    const gate = await checkPass(pass, env);
    if (!gate.ok) return json({ error: gate.error }, gate.status, request);

    // 緊急停止スイッチ
    if (gate.config && gate.config.killSwitch) {
      return json({ error: 'メンテナンス中です(管理者が一時停止しています)' }, 503, request);
    }

    // ---------- /image : アイコン生成 ----------
    if (path === '/image') {
      if (!env.POLLINATIONS_KEY) {
        return json({ error: 'POLLINATIONS_KEY not set' }, 503, request);
      }
      const upstream = await fetch(POLLINATIONS_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.POLLINATIONS_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const headers = new Headers(cors(request));
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // ---------- / : 本文生成 ----------
    // モデル許可リスト: KVのconfigが優先、無ければ環境変数ALLOWED_MODELS
    const allowed = (gate.config && Array.isArray(gate.config.allowedModels) && gate.config.allowedModels.length > 0)
      ? gate.config.allowedModels
      : (env.ALLOWED_MODELS ? env.ALLOWED_MODELS.split(',').map(s => s.trim()) : null);
    if (allowed && !allowed.includes(body.model)) {
      return json({ error: 'model not allowed: ' + body.model }, 403, request);
    }

    // 使用量計測: 非ストリーム時のみOpenRouterにコスト返却を要求してバッファ記帳
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

    // ストリーム時/台帳なし時は素通し(v2と同じ)
    if (wantStream || !env.LEDGER || !gate.codeKey) {
      const headers = new Headers(cors(request));
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // 非ストリーム: 全文バッファ→使用量を台帳へ(応答はそのまま返す)
    const text = await upstream.text();
    if (upstream.ok) ctx.waitUntil(record(env, gate.codeKey, text));
    const headers = new Headers(cors(request));
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(text, { status: upstream.status, headers });
  },
};

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

// 使用量の記帳(月が変わったら自動リセット)
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
    const out = [];
    let cursor;
    do {
      const r = await env.LEDGER.list({ prefix: 'code:', cursor });
      for (const k of r.keys) {
        const rec = await getJSON(env, k.name, {});
        out.push({ code: k.name.slice(5), ...rec });
      }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    const config = await getJSON(env, 'config', {});
    return json({ codes: out, config }, 200, request);
  }

  if (act === 'create') {
    let code = String(body.code || '').trim();
    if (!code) code = genCode();
    const key = 'code:' + code;
    if (await env.LEDGER.get(key)) return json({ error: 'その合言葉は既に存在します' }, 409, request);
    const rec = {
      name: String(body.name || '').slice(0, 40),
      active: true,
      limitUsd: +body.limitUsd || 0,
      usedUsd: 0, reqs: 0, tokens: 0,
      month: month(),
      created: new Date().toISOString(),
    };
    await env.LEDGER.put(key, JSON.stringify(rec));
    return json({ ok: true, code, rec }, 200, request);
  }

  if (act === 'update') {
    const key = 'code:' + String(body.code || '');
    const rec = await getJSON(env, key, null);
    if (!rec) return json({ error: 'not found' }, 404, request);
    if (typeof body.active === 'boolean') rec.active = body.active;
    if (body.limitUsd != null) rec.limitUsd = +body.limitUsd || 0;
    if (body.name != null) rec.name = String(body.name).slice(0, 40);
    await env.LEDGER.put(key, JSON.stringify(rec));
    return json({ ok: true, rec }, 200, request);
  }

  if (act === 'delete') {
    await env.LEDGER.delete('code:' + String(body.code || ''));
    return json({ ok: true }, 200, request);
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
    'Access-Control-Allow-Headers': 'Content-Type, x-chronicle-pass, x-admin-token',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(request) },
  });
}
