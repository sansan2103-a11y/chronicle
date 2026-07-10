// ============================================================
// Chronicle APIプロキシ (Cloudflare Worker) — v17
// v17: forceput原子化+forkキー衝突根治+idempotency
// v16からの変更(2026-07-11): ★GPT-5.6再監査の採用キューを反映(後方互換=旧クライアントmidなしでも不変)。
//   1) forceput真の原子化: 退避を batch内の INSERT...SELECT FROM saves WHERE kind='main' で行い(事前SELECT値を
//      JSに持ち出さない)、main更新は UPDATE ... SET rev=rev+1 ... RETURNING rev。UPDATE 0件=mainなし→
//      INSERT OR IGNORE rev=1→それも0件なら全体を1回だけ再実行→なお失敗なら incoming を fork 保存。
//      応答revは UPDATE の RETURNING(batch結果[1])。「通信中に別pushがrevを進めても最新mainが必ずfork退避」。
//   2) saveIncomingAsFork: fork kind に requestId先頭8字を含めキー衝突を根治。UNIQUE衝突時は乱数4字で1回再試行。
//      fork保存後にmainを再SELECTして応答 server{rev,updatedAt,device} を最新化(A-5)。
//   3) d1Changed: results空配列でも meta.changes を確認。success フォールバック廃止。
//   4) baseRev>curRev も fork扱い(後方互換優先。invalid-base-rev拒否は不採用=データを消さずクライアント無変更)。
//   5) idempotency: idem(u,mid,res,ts) テーブル。put/forceput/putimg で body.mid(≤128字)があれば処理前にSELECT→
//      ヒットなら保存済み応答を replayed:true 付きで返す。ok:true応答のみ ctx.waitUntil で INSERT OR IGNORE 保存
//      (+確率1/50で24h超行をDELETE)。mid無しの旧クライアントは完全に従来動作。
//   既存機能(名寄せ/ns/認証/画像配信/管理API/D1未バインド後方互換/KVフォールバック)は完全温存。
// ------------------------------------------------------------
// Chronicle APIプロキシ (Cloudflare Worker) — v16
// v16からの追加(2026-07-11): ★GPT-5.6監査で残存した重大穴の根治(main保存の原子化ほか)。
//   B-1 main保存の原子化: SELECT rev→INSERT OR REPLACE の2文レースを排除。op:put は
//      条件付き UPDATE ... WHERE rev=<読んだcurRev> RETURNING rev(新規行は INSERT OR IGNORE)。
//      更新0件=同時pushの競合 → 最新mainを再取得し incoming を fork として保存(fork:true)。
//      op:forceput は退避INSERT+本体UPSERTを env.DB.batch([...]) で1トランザクション化。
//   B-2 d1PutImg 原子化: INSERT ... ON CONFLICT(ns,k) DO UPDATE SET rev=rev+1 ... RETURNING rev。
//   B-3 /save 外側契約統一: bad-json/no-binding/auth/maintenance も {ok:false,errorCode,retryable,
//      requestId}+CORS で返す(/save 全体を handleSave の単一 try/catch に集約)。他パスは不変。
//   B-4 op:getfork は D1不可時 501 {errorCode:'unsupported'}(旧KV mainフォールスルーは誤りのため撤去)。
//      op:get(main) のKVフォールバックは維持。
//   既存機能(名寄せ/ns/認証/画像配信/管理API/D1未バインド後方互換)は完全温存。
// ------------------------------------------------------------
// Chronicle APIプロキシ (Cloudflare Worker) — v15
// v15からの追加(2026-07-11): ★セーブ堅牢化(KV書込予算根絶)+画像のD1移行+エラー契約統一。
//   ① /save 全体を try/catch で保護。例外時も必ずCORS付きJSONを返す
//      {ok:false,error:'save-exception:…',errorCode:'exception',retryable:true,requestId}(500)。
//   ② /save系の全応答に requestId、全エラーに errorCode/retryable を付与(クライアントの再送判定用)。
//   ③ 画像をD1テーブル images(ns,k,rev,hash,updatedAt,data) へ移行。op:putimg と op:put の分割保存とも
//      D1優先(KVには書かない=KV日次書込予算1000/日の枯渇を根絶)。D1不可時のみ従来KV(後方互換)。
//   ④ op:putimg 応答に hash(=len:djb2b36・fix411と共有する契約)/imageRev/updatedAt を追加。
//   ⑤ GET /img の読み順を D1 images → KV img: → save:blob遅延展開 に(補填書込もD1優先)。
//   ⑥ op:put の4MB判定を str.length 即断 → 1.3MB超のみ TextEncoder で byte 精査 の二段に。
//   必要バインディング: LEDGER(KV) + DB(D1「chronicle-saves」)。images テーブルは d1Ready() で自動作成。
// ------------------------------------------------------------
// Chronicle APIプロキシ (Cloudflare Worker) — v14
// v14からの追加(2026-07-10): ★セーブ同期をKV→D1(SQLite)へ移行+認証の名寄せ。
//   ① /save (op:get/put/meta) の保存先を D1 テーブル saves(u,kind,rev,baseRev,updatedAt,device,size,blob) に。
//      無料枠: 書込10万行/日(KVの100倍)・強整合(read-after-write)。D1未バインド時は従来KVで動く(デプロイ安全)。
//   ② op:put に rev/baseRev 楽観ロック(fix402): baseRev<現rev なら fork として両方保持(絶対に上書きしない)。
//      op:forceput(現mainをforkに退避して上書き) / op:forks / op:getfork を追加。fork保持は新しい順3つ。
//   ③ ★認証の名寄せ: Googleと合言葉が同時に載ったリクエストで link:code:XX→allow:email を自動登録。
//      以後 合言葉のみの認証でも同じ金庫/ns(画像名前空間)に解決(トークン失効で保存先が割れる事故の根治)。
//      admin: action link-set/link-get/link-del {pass,email}。
//   ④ 画像は従来どおり KV(img:<ns>:<k> + GET /img)。putimg は正準ユーザーのnsへ。
//   必要バインディング: LEDGER(KV・従来) + DB(D1・新規「chronicle-saves」)。
// ------------------------------------------------------------
// Chronicle APIプロキシ (Cloudflare Worker) — v13
// v13からの追加(2026-07-08): ★op:putimg … 画像1枚だけを split key(img:<ns>:<k>) に直書きする軽量更新口。
//   フル送信(pkg全体=数MB)が"Failed to fetch"で失敗する環境向け。個別アイコン差し替えに使う。
// ------------------------------------------------------------
// Chronicle APIプロキシ (Cloudflare Worker) — v12
// v12からの追加(2026-07-07): ★op:put(light=pkg.idb無し)でも既存blobのidb(画像)を温存。
//   v11で自動同期がlight化→次のlight pushでblobから画像が消え/img 404になる退行を根治。
// ------------------------------------------------------------
// Chronicle APIプロキシ (Cloudflare Worker) — v11
// v11からの追加(2026-07-07): ★アイコン画像のURL配信(iOSのIndexedDB地雷回避=根本対策)
//   GET /img?ns=<名前空間>&k=<画像キー> … KVの保存から画像1枚をbytesで返す(<img src>用)。
//     ・ns = SHA256(secret salt | codeKey)先頭32hex の推測不能トークン。imgns:<ns>→codeKey をKVに保存。
//     ・個別キー img:<ns>:<k> を優先。無ければ本体blob(save:<codeKey>)から遅延展開して全キー補填。
//     ・Cache-Control:public,max-age=300 + ETag(再検証)。data:URLをbytesにデコードして配信。
//   op:meta / op:put のJSON応答に ns を追加。put時に pkg.idb を個別キーへ分割保存(best-effort)。
//   目的: iOS SafariのIDB書き込みに頼らず、全端末が同じURL=同じ絵をHTTPキャッシュで表示する。
// ------------------------------------------------------------
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
      const gp = new URL(request.url).pathname;
      if (gp === '/img') return handleImg(request, env, ctx);   // ★v11: 画像URL配信(<img src>用・認証不要のcapability URL)
      return json({ ok: true, service: 'chronicle-proxy', v: 17, d1: !!env.DB, ledger: !!env.LEDGER, google: !!env.GOOGLE_CLIENT_ID, img: true }, 200, request);
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, request);
    }

    const path = new URL(request.url).pathname;

    // ★v16(B-3): /save は外側の失敗(bad-json/no-binding/auth/killSwitch)も統一契約(CORS付きJSON)で返す
    if (path === '/save') return handleSave(request, env, ctx);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400, request);
    }

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

    // ★v14: 認証の名寄せ(auto-link)。Google検証成功時に合言葉も載っていれば同一人物 → 保存先を統一
    try { if (gate.email && env.LEDGER) { const pw14 = request.headers.get('x-chronicle-pass') || ''; if (pw14) ctx.waitUntil(autoLink(env, pw14, gate.codeKey)); } } catch (e) {}

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


  // ---- ★v14: 名寄せリンクの管理(合言葉の保存先をGoogleアカウントへ統一) ----
  if (act === 'link-set') {
    const pass = String(body.pass || '');
    const email = normEmail(body.email);
    if (!pass || !email) return json({ error: 'pass,email required' }, 400, request);
    const g = await checkPass(pass, env);
    if (!g.ok || !g.codeKey) return json({ error: 'passが不正です(' + (g.error || '') + ')' }, 400, request);
    if (!(await env.LEDGER.get('allow:' + email))) return json({ error: 'そのメールは許可台帳(allow:)にありません' }, 404, request);
    await env.LEDGER.put('link:' + g.codeKey, 'allow:' + email);
    return json({ ok: true, from: g.codeKey, to: 'allow:' + email }, 200, request);
  }
  if (act === 'link-get') {
    const pass = String(body.pass || '');
    const g = await checkPass(pass, env);
    if (!g.ok || !g.codeKey) return json({ error: 'passが不正です' }, 400, request);
    const l = await env.LEDGER.get('link:' + g.codeKey);
    return json({ ok: true, from: g.codeKey, to: l || null }, 200, request);
  }
  if (act === 'link-del') {
    const pass = String(body.pass || '');
    const g = await checkPass(pass, env);
    if (!g.ok || !g.codeKey) return json({ error: 'passが不正です' }, 400, request);
    await env.LEDGER.delete('link:' + g.codeKey);
    return json({ ok: true, from: g.codeKey }, 200, request);
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


// ★v14: D1・名寄せヘルパー -----------------------------------------------------
let __d1init = false;
async function d1Ready(env) {
  if (__d1init) return true;
  try {
    await env.DB.exec("CREATE TABLE IF NOT EXISTS saves (u TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'main', rev INTEGER NOT NULL DEFAULT 0, baseRev INTEGER DEFAULT 0, updatedAt INTEGER, device TEXT, size INTEGER, blob TEXT, PRIMARY KEY (u, kind))");
    await env.DB.exec("CREATE TABLE IF NOT EXISTS images (ns TEXT NOT NULL, k TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, hash TEXT, updatedAt INTEGER, data TEXT, PRIMARY KEY (ns,k))");   // ★v15: 画像のD1移行
    await env.DB.exec("CREATE TABLE IF NOT EXISTS idem (u TEXT NOT NULL, mid TEXT NOT NULL, res TEXT, ts INTEGER, PRIMARY KEY (u, mid))");   // ★v17(5): 冪等キー(mid)台帳
    __d1init = true;
    return true;
  } catch (e) { return false; }
}
// 名寄せ: link:<codeKey> → 正準ユーザー(例 link:code:xxx → allow:foo@gmail.com)。
//   Googleと合言葉で保存先が割れる問題(トークン失効時に金庫が静かにズレる)の根治。
async function resolveUser(env, codeKey) {
  let u = String(codeKey || '');
  try { const l = await env.LEDGER.get('link:' + u); if (l) u = l; } catch (e) {}
  return u;
}
// auto-link: 同一リクエストにGoogle(検証済)と合言葉(台帳一致)が両方載っている=同一人物の端末
//   → 合言葉側の保存先をGoogle側へ1回だけリンク(以後どちらの認証でも同じ金庫/ns)。
async function autoLink(env, pass, allowKey) {
  try {
    if (!pass || !allowKey || allowKey.indexOf('allow:') !== 0) return;
    const g = await checkPass(pass, env);
    if (!g.ok || !g.codeKey || g.codeKey === allowKey) return;
    const lk = 'link:' + g.codeKey;
    const cur = await env.LEDGER.get(lk);
    if (cur !== allowKey) await env.LEDGER.put(lk, allowKey);
  } catch (e) {}
}
// fork行は新しい順に3つまで保持(それ以前は削除)
// ★v15: 画像1枚を D1 images(ns,k) へ書く(rev=既存+1・hash=fix411契約)。KV書込予算を消費しない。
async function d1PutImg(env, ns, k, data) {
  const str = String(data);
  const hash = String(str.length) + ':' + smallHash(str);   // ★fix411と共有する契約(式を変えない)
  const now = Date.now();
  // ★v16(B-2): 原子的アップサート。SELECT rev→REPLACE の2文レース(並行putimgでrev巻き戻り)を排除。
  const r = await env.DB.prepare('INSERT INTO images (ns, k, rev, hash, updatedAt, data) VALUES (?1,?2,1,?3,?4,?5) ON CONFLICT(ns,k) DO UPDATE SET rev=rev+1, hash=excluded.hash, updatedAt=excluded.updatedAt, data=excluded.data RETURNING rev').bind(ns, k, hash, now, str).run();
  let rev = 1;
  try { if (r && r.results && r.results.length && r.results[0] && r.results[0].rev != null) rev = +r.results[0].rev; } catch (e) {}
  return { rev, hash, updatedAt: now };
}
async function trimForks(env, user) {
  try {
    const rs = await env.DB.prepare('SELECT kind FROM saves WHERE u=?1 AND kind<>?2 ORDER BY updatedAt DESC').bind(user, 'main').all();
    const rows = (rs && rs.results) || [];
    for (let i = 3; i < rows.length; i++) {
      await env.DB.prepare('DELETE FROM saves WHERE u=?1 AND kind=?2').bind(user, rows[i].kind).run();
    }
  } catch (e) {}
}

// ★v11: 画像URL配信 -----------------------------------------------------------
async function nsFor(env, codeKey) {
  const salt = String(env.IMG_SALT || env.ACCESS_CODE || env.GOOGLE_CLIENT_ID || 'chronicle-img');
  const data = new TextEncoder().encode(salt + '|' + String(codeKey));
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 32);   // 推測不能(128bit)。saltは秘密なのでHMAC相当
}
async function ensureNs(env, codeKey) {
  const ns = await nsFor(env, codeKey);
  try { if (!(await env.LEDGER.get('imgns:' + ns))) await env.LEDGER.put('imgns:' + ns, String(codeKey)); } catch (e) {}
  return ns;
}
function imgHeaders(request, extra) {
  const h = new Headers(cors(request));
  if (extra) { for (const k in extra) h.set(k, extra[k]); }
  return h;
}
function smallHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
async function handleImg(request, env, ctx) {
  if (!env.LEDGER) return new Response('no kv', { status: 503, headers: imgHeaders(request) });
  const u = new URL(request.url);
  const ns = (u.searchParams.get('ns') || '').replace(/[^a-f0-9]/g, '').slice(0, 64);
  const k = (u.searchParams.get('k') || '').slice(0, 128);
  if (!ns || !k) return new Response('ns,k required', { status: 400, headers: imgHeaders(request) });
  const codeKey = await env.LEDGER.get('imgns:' + ns);
  if (!codeKey) return new Response('unknown ns', { status: 404, headers: imgHeaders(request) });
  const d1 = env.DB ? await d1Ready(env) : false;   // ★v15: 画像本体はD1優先で読む
  let dataUrl = null;
  if (d1) { try { const row = await env.DB.prepare('SELECT data FROM images WHERE ns=?1 AND k=?2').bind(ns, k).first(); if (row && row.data) dataUrl = String(row.data); } catch (e) {} }
  if (!dataUrl) dataUrl = await env.LEDGER.get('img:' + ns + ':' + k);   // KV個別キー(v11-14の資産・後方互換)
  if (!dataUrl) {                                              // 無ければ本体blobから遅延展開して全キー補填
    const raw = await env.LEDGER.get('save:' + codeKey);
    if (raw) {
      let pkg = null; try { pkg = JSON.parse(raw); } catch (e) {}
      const idb = pkg && pkg.idb;
      if (idb && typeof idb === 'object') {
        dataUrl = idb[k] || null;
        ctx.waitUntil((async () => { for (const kk of Object.keys(idb)) { try { if (d1) { await d1PutImg(env, ns, kk, String(idb[kk])); } else { await env.LEDGER.put('img:' + ns + ':' + kk, String(idb[kk])); } } catch (e) {} } })());
      }
    }
  }
  if (!dataUrl) return new Response('image not found', { status: 404, headers: imgHeaders(request) });
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(dataUrl));
  if (!m) {
    if (/^https?:\/\//.test(dataUrl)) return Response.redirect(dataUrl, 302);
    return new Response('unsupported image', { status: 415, headers: imgHeaders(request) });
  }
  const contentType = m[1] || 'image/png';
  const b64 = m[2] || '';
  const etag = '"' + b64.length.toString(36) + '-' + smallHash(b64) + '"';
  if ((request.headers.get('If-None-Match') || '') === etag) {
    return new Response(null, { status: 304, headers: imgHeaders(request, { 'ETag': etag, 'Cache-Control': 'public, max-age=60' }) });
  }
  let bin; try { bin = atob(b64); } catch (e) { return new Response('bad base64', { status: 415, headers: imgHeaders(request) }); }
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Response(arr, { status: 200, headers: imgHeaders(request, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=60',   // 5分保持+ETag再検証。regenは最大5分で反映(手動同期で即時)
    'ETag': etag,
  }) });
}


// ============================================================
// ★v16: /save ハンドラ(外側の失敗も統一契約 + main保存の原子化) ==============
// ============================================================
async function handleSave(request, env, ctx) {
  const requestId = (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36));
  try {
    // ★B-3: request.json() 失敗も /save 契約で返す
    let body;
    try { body = await request.json(); }
    catch (e) { return json({ ok: false, error: 'bad json', errorCode: 'bad-json', retryable: false, requestId }, 400, request); }

    // ★B-3: バインディング欠落も統一契約
    if (!env.LEDGER) return json({ ok: false, error: 'LEDGER(KV)が未バインドです', errorCode: 'no-binding', retryable: false, requestId }, 503, request);

    // ★B-3: 認証失敗も統一契約(errorCode:'auth')
    const gate = await checkAuth(request, env);
    if (!gate.ok) return json({ ok: false, error: gate.error, errorCode: 'auth', retryable: false, requestId }, gate.status, request);

    // ★v14: 認証の名寄せ(auto-link)
    try { if (gate.email && env.LEDGER) { const pw14 = request.headers.get('x-chronicle-pass') || ''; if (pw14) ctx.waitUntil(autoLink(env, pw14, gate.codeKey)); } } catch (e) {}

    // ★B-3: killSwitch も統一契約(errorCode:'maintenance')
    if (gate.config && gate.config.killSwitch) return json({ ok: false, error: 'メンテナンス中です(管理者が一時停止しています)', errorCode: 'maintenance', retryable: true, requestId }, 503, request);

    const user = await resolveUser(env, gate.codeKey);   // ★v14: 名寄せ(link:)適用後の正準ユーザー
    const skey = 'save:' + user;
    const op = body && body.op;
    const d1 = env.DB ? await d1Ready(env) : false;
    // ★v17(5): 冪等キー。put/forceput/putimg でのみ使用。mid無し=旧クライアント=従来動作。
    const mid = (body && body.mid != null && body.mid !== '') ? String(body.mid).slice(0, 128) : null;
    const okJson = (obj) => { if (mid && d1 && obj && obj.ok) recordIdem(env, ctx, user, mid, obj); return json(obj, 200, request); };

    if (op === 'meta') {
      let meta = null;
      if (d1) {
        const row = await env.DB.prepare('SELECT rev, updatedAt, device, size FROM saves WHERE u=?1 AND kind=?2').bind(user, 'main').first();
        if (row) meta = { updatedAt: +row.updatedAt || 0, device: String(row.device || ''), size: +row.size || 0, rev: +row.rev || 0 };
      }
      if (!meta) { const m = await env.LEDGER.get(skey + ':meta'); if (m) { try { meta = JSON.parse(m); meta.rev = 0; } catch (e) {} } }
      const ns = await ensureNs(env, user);
      return json({ ok: true, meta, rev: meta ? (+meta.rev || 0) : 0, ns, v: 17, d1: !!d1, requestId }, 200, request);
    }

    if (op === 'get' || op === 'getfork') {
      if (d1) {
        const kind = (op === 'getfork') ? String((body && body.kind) || '').slice(0, 80) : 'main';
        const row = await env.DB.prepare('SELECT rev, blob FROM saves WHERE u=?1 AND kind=?2').bind(user, kind).first();
        if (row && row.blob) { let data = null; try { data = JSON.parse(row.blob); } catch (e) {} return json({ ok: true, data, rev: +row.rev || 0, requestId }, 200, request); }
        if (op === 'getfork') return json({ ok: false, error: 'fork not found', errorCode: 'not-found', retryable: false, requestId }, 404, request);
      } else if (op === 'getfork') {
        // ★B-4: forkはD1専用機能。D1不可時にKV mainへフォールスルーしない(誤配信の根治)。
        return json({ ok: false, error: 'forks require D1', errorCode: 'unsupported', retryable: false, requestId }, 501, request);
      }
      // op:get(main) のKVフォールバックは維持(後方互換)
      const raw = await env.LEDGER.get(skey);
      return json({ ok: true, data: raw ? JSON.parse(raw) : null, rev: 0, requestId }, 200, request);
    }

    if (op === 'put' || op === 'forceput') {
      if (mid && d1) { const hit = await lookupIdem(env, user, mid); if (hit) return json(hit, 200, request); }   // ★v17(5): 再送は保存済み応答を返す
      const pkg = body.pkg;
      if (!pkg || typeof pkg !== 'object') return json({ ok: false, error: 'no pkg', errorCode: 'bad-request', retryable: false, requestId }, 400, request);
      const ns = await ensureNs(env, user);
      // ★v15: 画像は D1 images(d1時)/KV split key(非d1) へ。saves 行には入れない。
      const idb = (pkg.idb && typeof pkg.idb === 'object' && Object.keys(pkg.idb).length) ? pkg.idb : null;
      if (idb) { ctx.waitUntil((async () => { for (const kk of Object.keys(idb)) { try { if (d1) { await d1PutImg(env, ns, kk, String(idb[kk])); } else { await env.LEDGER.put('img:' + ns + ':' + kk, String(idb[kk])); } } catch (e) {} } })()); }

      if (d1) {
        const light = {}; for (const k in pkg) { if (k !== 'idb') light[k] = pkg[k]; }
        const str = JSON.stringify(light);
        if (str.length > 4 * 1024 * 1024) return json({ ok: false, error: 'セーブが大きすぎます(4MB超)', errorCode: 'too-large', retryable: false, requestId }, 413, request);
        else if (str.length > 1.3 * 1024 * 1024) { if (new TextEncoder().encode(str).length > 4 * 1024 * 1024) return json({ ok: false, error: 'セーブが大きすぎます(4MB超)', errorCode: 'too-large', retryable: false, requestId }, 413, request); }
        const now = +pkg.updatedAt || Date.now();
        const dev = String(pkg.device || '');
        const hasBase = !!(body && body.baseRev !== undefined && body.baseRev !== null);
        const baseRev = hasBase ? (+body.baseRev || 0) : null;

        const cur = await env.DB.prepare('SELECT rev, baseRev, updatedAt, device, size, blob FROM saves WHERE u=?1 AND kind=?2').bind(user, 'main').first();
        const curRev = cur ? (+cur.rev || 0) : 0;

        // ★楽観分岐(fork): baseRevが現行と一致しない=別デバイスが先行(< )or サーバrev巻き戻り後の先行主張(> )。
        //   ★v17(4): baseRev>curRev も fork扱い。GPTのinvalid-base-rev(拒否)案は後方互換優先で不採用
        //   (データを絶対に消さず・クライアント無変更)。baseRev===curRev のときだけ通常コミットへ進む。
        if (op === 'put' && hasBase && cur && baseRev !== curRev) {
          return await saveIncomingAsFork(request, env, ctx, { user, pkg, str, baseRev, curRev, curUpdatedAt: (+cur.updatedAt || 0), curDevice: String(cur.device || ''), ns, requestId, mid });
        }

        if (op === 'forceput') {
          // ★v17(1): forceput真の原子化。退避は batch内の INSERT...SELECT FROM saves WHERE kind='main' で行い、
          //   退避内容(rev/baseRev/updatedAt/device/size/blob)は"batch実行時点の最新main"をSQLが直接コピーする
          //   (事前SELECTした cur の値をJSに持ち出さない=通信中に別pushがrevを進めても最新mainを必ず退避)。
          //   本体更新は UPDATE ... SET rev=rev+1 ... RETURNING rev。0件=mainなし→INSERT OR IGNORE rev=1。
          //   それも0件=直後に別pushが新規作成→全体を1回だけ再実行→なお失敗なら incoming を fork 保存。
          const newBase = hasBase ? baseRev : curRev;
          const attempt = async (n) => {
            const bkind = 'fork:' + String((cur && cur.device) || dev || 'dev').replace(/[^\w\-\.\(\)]/g, '').slice(0, 24) + ':' + Date.now() + ':' + requestId.slice(0, 8) + (n > 1 ? ':' + n : '');
            const res = await env.DB.batch([
              // (a) 退避: 最新mainをSQL内でコピー(main無しなら0行=何もしない)。
              env.DB.prepare('INSERT INTO saves (u, kind, rev, baseRev, updatedAt, device, size, blob) SELECT u, ?2, rev, baseRev, updatedAt, device, size, blob FROM saves WHERE u=?1 AND kind=?3')
                .bind(user, bkind, 'main'),
              // (b) 本体上書き: 既存mainのみ更新。RETURNING rev(=応答rev)。
              env.DB.prepare('UPDATE saves SET rev=rev+1, baseRev=?3, updatedAt=?4, device=?5, size=?6, blob=?7 WHERE u=?1 AND kind=?2 RETURNING rev')
                .bind(user, 'main', newBase, now, dev, str.length, str)
            ]);
            const upd = res && res[1];
            if (d1Changed(upd)) return d1FirstRev(upd, null);
            // main無し→新規作成(INSERT OR IGNORE)。他が先に作っていれば0行。
            const ins = await env.DB.prepare('INSERT OR IGNORE INTO saves (u, kind, rev, baseRev, updatedAt, device, size, blob) VALUES (?1,?2,1,?3,?4,?5,?6,?7) RETURNING rev')
              .bind(user, 'main', newBase, now, dev, str.length, str).run();
            if (d1Changed(ins)) return d1FirstRev(ins, 1);
            return null;   // 直後に別pushが新規main作成=強い競合
          };
          let frev = await attempt(1);
          if (frev == null) frev = await attempt(2);   // ★全体を1回だけ再実行
          if (frev == null) {
            // なお失敗=強い競合。incoming を fork として退避(データを消さない)。
            const latest = await env.DB.prepare('SELECT rev, updatedAt, device FROM saves WHERE u=?1 AND kind=?2').bind(user, 'main').first();
            return await saveIncomingAsFork(request, env, ctx, { user, pkg, str, baseRev: newBase, curRev: latest ? (+latest.rev || 0) : curRev, curUpdatedAt: latest ? (+latest.updatedAt || 0) : 0, curDevice: latest ? String(latest.device || '') : '', ns, requestId, mid });
          }
          ctx.waitUntil(trimForks(env, user));
          return okJson({ ok: true, rev: frev, size: str.length, ns, requestId });
        }

        // ★B-1: op:put の原子的コミット。条件付きUPDATE(cur有)/INSERT OR IGNORE(新規)。
        const newBase = hasBase ? baseRev : curRev;
        if (cur) {
          const upd = await env.DB.prepare('UPDATE saves SET rev=rev+1, baseRev=?3, updatedAt=?4, device=?5, size=?6, blob=?7 WHERE u=?1 AND kind=?2 AND rev=?8 RETURNING rev')
            .bind(user, 'main', newBase, now, dev, str.length, str, curRev).run();
          if (!d1Changed(upd)) {
            // ★競合: 我々のSELECT後に別pushがrevを進めた。最新mainを再取得し incoming を fork へ。
            const latest = await env.DB.prepare('SELECT rev, updatedAt, device FROM saves WHERE u=?1 AND kind=?2').bind(user, 'main').first();
            return await saveIncomingAsFork(request, env, ctx, { user, pkg, str, baseRev: newBase, curRev: latest ? (+latest.rev || 0) : curRev, curUpdatedAt: latest ? (+latest.updatedAt || 0) : 0, curDevice: latest ? String(latest.device || '') : '', ns, requestId, mid });
          }
          return okJson({ ok: true, rev: d1FirstRev(upd, curRev + 1), size: str.length, ns, requestId });
        } else {
          const ins = await env.DB.prepare('INSERT OR IGNORE INTO saves (u, kind, rev, baseRev, updatedAt, device, size, blob) VALUES (?1,?2,1,?3,?4,?5,?6,?7) RETURNING rev')
            .bind(user, 'main', newBase, now, dev, str.length, str).run();
          if (!d1Changed(ins)) {
            // ★競合: 別リクエストが先に新規mainを作成 → incoming を fork へ。
            const latest = await env.DB.prepare('SELECT rev, updatedAt, device FROM saves WHERE u=?1 AND kind=?2').bind(user, 'main').first();
            return await saveIncomingAsFork(request, env, ctx, { user, pkg, str, baseRev: newBase, curRev: latest ? (+latest.rev || 0) : 0, curUpdatedAt: latest ? (+latest.updatedAt || 0) : 0, curDevice: latest ? String(latest.device || '') : '', ns, requestId, mid });
          }
          return okJson({ ok: true, rev: 1, size: str.length, ns, requestId });
        }
      }
      // ---- D1無し: v12-13互換(KV保存・light putでも既存blobのidbを温存) ----
      if (!idb) {
        try { const prev = await env.LEDGER.get(skey); if (prev) { const pj = JSON.parse(prev); if (pj && pj.idb && typeof pj.idb === 'object' && Object.keys(pj.idb).length) pkg.idb = pj.idb; } } catch (e) {}
      }
      const fullStr = JSON.stringify(pkg);
      if (fullStr.length > 24 * 1024 * 1024) return json({ ok: false, error: 'セーブが大きすぎます(24MB超)', errorCode: 'too-large', retryable: false, requestId }, 413, request);
      await env.LEDGER.put(skey, fullStr);
      await env.LEDGER.put(skey + ':meta', JSON.stringify({ updatedAt: +pkg.updatedAt || Date.now(), device: String(pkg.device || ''), size: fullStr.length }));
      return json({ ok: true, size: fullStr.length, ns, requestId }, 200, request);
    }

    if (op === 'forks') {
      if (!d1) return json({ ok: true, forks: [], requestId }, 200, request);
      const rs = await env.DB.prepare('SELECT kind, rev, updatedAt, device, size FROM saves WHERE u=?1 AND kind<>?2 ORDER BY updatedAt DESC').bind(user, 'main').all();
      return json({ ok: true, forks: (rs && rs.results) || [], requestId }, 200, request);
    }

    // ★v13: 画像1枚だけ更新(split key直書き)。v15: D1 images へ(書込予算根絶)。
    if (op === 'putimg') {
      if (mid && d1) { const hit = await lookupIdem(env, user, mid); if (hit) return json(hit, 200, request); }   // ★v17(5): 再送は保存済み応答を返す
      const k = String((body && body.k) || '').slice(0, 128);
      const data = String((body && body.data) || '');
      if (!k || !data) return json({ ok: false, error: 'k,data required', errorCode: 'bad-request', retryable: false, requestId }, 400, request);
      if (data.length > 2 * 1024 * 1024) return json({ ok: false, error: 'image too large', errorCode: 'too-large', retryable: false, requestId }, 413, request);
      const ns = await ensureNs(env, user);
      const hash = String(data.length) + ':' + smallHash(data);   // ★fix411と共有する契約(式を変えない)
      let imageRev = 0, updatedAt = Date.now();
      if (d1) {
        const r = await d1PutImg(env, ns, k, data);   // ★v16(B-2): 原子的アップサート
        imageRev = r.rev; updatedAt = r.updatedAt;
      } else {
        await env.LEDGER.put('img:' + ns + ':' + k, data);   // D1不可時のみ従来KV(後方互換)
      }
      return okJson({ ok: true, ns: ns, k: k, size: data.length, hash: hash, imageRev: imageRev, updatedAt: updatedAt, requestId });
    }

    return json({ ok: false, error: 'unknown save op (get|put|forceput|meta|putimg|forks|getfork)', errorCode: 'bad-op', retryable: false, requestId }, 400, request);
  } catch (e) {
    return json({ ok: false, error: 'save-exception: ' + String(e && e.message || e), errorCode: 'exception', retryable: true, requestId }, 500, request);
  }
}

// ★v16: 楽観ロック失敗/分岐時に incoming を fork として保存し fork:true 応答(契約はv14と同一)。
async function saveIncomingAsFork(request, env, ctx, o) {
  // ★v17(2): fork kind に requestId先頭8字を含めキー衝突を根治(同一ms・同一deviceでも別リクエストなら別kind)。
  const base = 'fork:' + String(o.pkg.device || 'dev').replace(/[^\w\-\.\(\)]/g, '').slice(0, 24) + ':' + Date.now() + ':' + String(o.requestId || '').slice(0, 8);
  const put = async (fk) => {
    // INSERT OR REPLACE をやめ通常INSERT(既存forkを黙って潰さない)。UNIQUE衝突時のみ乱数4字で1回再試行。
    await env.DB.prepare('INSERT INTO saves (u, kind, rev, baseRev, updatedAt, device, size, blob) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
      .bind(o.user, fk, o.curRev, (o.baseRev == null ? 0 : o.baseRev), +o.pkg.updatedAt || Date.now(), String(o.pkg.device || ''), o.str.length, o.str).run();
  };
  try { await put(base); }
  catch (e) { try { await put(base + ':' + Math.random().toString(36).slice(2, 6)); } catch (e2) {} }
  ctx.waitUntil(trimForks(env, o.user));
  // ★v17(A-5): fork保存後にmainを再SELECTして応答 server{} を最新化(退避直後に進んだ最新値を返す)。
  let srev = o.curRev, sup = o.curUpdatedAt || 0, sdev = o.curDevice || '';
  try {
    const m = await env.DB.prepare('SELECT rev, updatedAt, device FROM saves WHERE u=?1 AND kind=?2').bind(o.user, 'main').first();
    if (m) { srev = +m.rev || 0; sup = +m.updatedAt || 0; sdev = String(m.device || ''); }
  } catch (e) {}
  const resp = { ok: true, fork: true, rev: srev, server: { rev: srev, updatedAt: sup, device: sdev }, ns: o.ns, requestId: o.requestId };
  if (o.mid && env.DB) recordIdem(env, ctx, o.user, o.mid, resp);   // ★v17(5): fork応答も冪等記録(再送でself-fork増殖を防ぐ)
  return json(resp, 200, request);
}

// ★v17(5): 冪等(idempotency)ヘルパー。mid はクライアントが送るリクエスト一意キー(≤128字)。
async function lookupIdem(env, user, mid) {
  if (!mid || !env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT res FROM idem WHERE u=?1 AND mid=?2').bind(user, mid).first();
    if (row && row.res) { const o = JSON.parse(row.res); o.replayed = true; return o; }
  } catch (e) {}
  return null;
}
function recordIdem(env, ctx, user, mid, respObj) {
  if (!mid || !env.DB || !respObj || !respObj.ok) return;   // ok:true応答のみ記録(エラーは再送で再評価)
  let res; try { res = JSON.stringify(respObj); } catch (e) { return; }
  ctx.waitUntil((async () => {
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO idem (u, mid, res, ts) VALUES (?1,?2,?3,?4)').bind(user, mid, res, Date.now()).run();
      if (Math.random() < 0.02) { await env.DB.prepare('DELETE FROM idem WHERE ts < ?1').bind(Date.now() - 86400000).run(); }   // 確率1/50で24h超をGC
    } catch (e) {}
  })());
}

// ★v16: D1 .run() 結果から「行が変わったか」を判定(RETURNING行 or meta.changes)。
function d1Changed(r) {
  if (!r) return false;
  // ★v17(3): RETURNING行があれば変更あり。無くても meta.changes を確認(results:[]+changes:1でtrue)。
  //   success フォールバックは廃止(D1の success は0行更新でもtrueになりうる誤判定源)。
  if (Array.isArray(r.results) && r.results.length > 0) return true;
  if (r.meta && typeof r.meta.changes === 'number') return r.meta.changes > 0;
  return false;
}
// ★v16: RETURNING rev の値を取り出す(無ければfallback)。
function d1FirstRev(r, fallback) {
  try { if (r && r.results && r.results.length && r.results[0] && r.results[0].rev != null) return +r.results[0].rev; } catch (e) {}
  return fallback;
}

// テスト用エクスポート(Workers実行時は未使用)
export { verifyGoogleIdToken, b64urlToBytes, b64urlToStr, handleSave, d1PutImg, d1Changed, d1FirstRev, saveIncomingAsFork, lookupIdem, recordIdem };
