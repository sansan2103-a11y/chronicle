#!/usr/bin/env node
/* test_fix665.cjs — pull側の選択的取り込み（容量の構造的解決 Phase1）
 *
 * ■調査（リポジトリ全走査で確定した判定表。これがこの実装の根拠）
 *
 *  ┌ 族 ─────────────────────┬ 読み手(file:line) ─────────────────────────┬ いつ読むか ──┬ 端末内で作れるか ┬ 取り込まない場合の劣化 ─┐
 *  │ v292Dfix640Evid_slot_*  │ v292Dfix641-cast-auto-register.js:170     │ 物語を開いた  │ ○ 作れる         │ 開くまで自動登録が働  │
 *  │ (証拠台帳 135,714字)     │   f.harvestPending() 経由でのみ読む         │ 時/描画/保存  │ (S.turns から機械   │ かない。開けば1.5秒後 │
 *  │                         │ 他に読み手なし(GC分類を除く)                │              │  的に再生成)      │ に自動で埋まる         │
 *  ├─────────────────────────┼───────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────┤
 *  │ chr6_snap_* /           │ v292Dfix564-snapshot.js verify/restore/list│ 利用者が明示  │ ○ 作れる         │ 生きている物語の分は  │
 *  │ chr6_snapd_*            │ (コンソール操作のみ・UIから呼ぶ経路なし)     │ に呼んだ時    │ (create() で本体+ │ 本体+サイドストアを同 │
 *  │ (スナップショット        │ v292Dfix562/569/660/642 は**分類・GCのみ**  │ 起動時には読  │  サイドストアから) │ じpullで取り込むので  │
 *  │  182,975字)             │ ★fix587:526 が墓標に recoverySnapshotId    │ まない        │                  │ 二重持ちなだけ        │
 *  │                         │   を書く＝**削除済み物語の最後の復元手段**   │              │                  │ ★墓標分は除外しない  │
 *  ├─────────────────────────┼───────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────┤
 *  │ chr6_v292Dfix104_dlg_*  │ v292Dfix66-renderhook-repair.js:814,1011  │ 会話ログ描画  │ △ 作れるが LLM   │ 再抽出にLLM往復の費用 │
 *  │ (会話ログ 138,798字)     │ (B_CACHE_KEY のターン別キャッシュ)          │ のたび        │  往復の費用が要る │ と時間がかかる        │
 *  │ → **Phase1では除外しない**（費用が発生する＝「判断がつかない」側。Phase2で遅延取得として扱う）        │
 *  └─────────────────────────┴───────────────────────────────────────────┴──────────────┴──────────────────┴───────────────────────┘
 *
 * ■このテストが固定する契約
 *   (1) 判定表（何を除外し、何を除外しないか）
 *   (2) 除外キーは書かれない／それ以外は従来どおり完全に書かれる
 *   (3) 除外件数・字数が画面最上部に出る（無言でやらない）
 *   (4) OFF で完全復帰
 *   (5) 収束証明を壊さない（除外だけの回でも baseRev 採用）
 *   (6) 実データ相当での削減量と、チェーン無しで白鷺荘96Tが入ること
 *   (7) 既に端末にある除外対象キーは消さない
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c){ pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const HOME = read('home.html');
const SRC641 = read('v292Dfix641-cast-auto-register.js');
const SRC640 = read('v292Dfix640-cast-evidence-ledger.js');
const SRC564 = read('v292Dfix564-snapshot.js');
const SRC587 = read('v292Dfix587-story-lifecycle.js');
const MODULES = ['v292Dfix579-tombstone-schema.js', 'v292Dfix562-backup-inventory.js', 'v292Dfix564-snapshot.js',
                 'v292Dfix660-delete-gateway.js', 'v292Dfix660-backup-gc.js', 'v292Dfix658-lineage-shadow.js',
                 'v292Dfix587-story-lifecycle.js', 'v292Dfix590-commit-ledger.js'];

const IOS_CAP = 2621440, EFFECTIVE = IOS_CAP - 65536;
const LIVE = 'sms4np33eyg', DEAD = 'smd1dead001', OTHER = 'sms5xyl4jjy';
const settle = async (n = 400) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const ts = '1784900000000';

function jsonOfChars(chars){ const o = { d: '' }; o.d = 'x'.repeat(Math.max(0, chars - JSON.stringify(o).length)); return JSON.stringify(o).slice(0, chars); }
function storyOfChars(turns, chars){
  const b = { turns: new Array(turns).fill(0).map((_, i) => ({ i, r: '' })) };
  let s = JSON.stringify(b);
  if (chars <= s.length) return s.slice(0, chars);
  b.turns[0].r = 'x'.repeat(chars - s.length);
  return JSON.stringify(b).slice(0, chars);
}
function mkLS(seed, cap){
  const store = Object.assign(Object.create(null), seed || {});
  const removed = [];
  const total = () => { let u = 0; for (const k in store) u += k.length + store[k].length; return u; };
  const api = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v){ v = String(v); let u = total();
      if (Object.prototype.hasOwnProperty.call(store, k)) u -= (k.length + store[k].length);
      if (cap && (u + k.length + v.length) > cap){ const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = v; },
    removeItem(k){ removed.push(k); delete store[k]; },
    key(i){ return Object.keys(store)[i] || null; },
    get length(){ return Object.keys(store).length; },
    __store: store, __removed: removed, __total: total
  };
  const RES = { getItem:1,setItem:1,removeItem:1,key:1,length:1,clear:1,__store:1,__removed:1,__total:1 };
  return new Proxy(api, {
    get(t,p){ if (typeof p==='symbol'||RES[p]||(p in t)) return t[p]; return Object.prototype.hasOwnProperty.call(store,p)?store[p]:undefined; },
    has(t,p){ return RES[p]||(p in t)||Object.prototype.hasOwnProperty.call(store,p); },
    ownKeys(){ return Object.keys(store); },
    getOwnPropertyDescriptor(t,p){ if (Object.prototype.hasOwnProperty.call(store,p)) return { value:store[p], enumerable:true, configurable:true, writable:true }; return undefined; }
  });
}
function homeScript(){ const p = HOME.match(/<script>[\s\S]*?<\/script>/g) || []; const b = p.map(x=>x.replace(/^<script>/,'').replace(/<\/script>$/,'')); return b[b.length-1]; }
const HOME_JS = homeScript();
function boot(opts){
  const ls = opts.ls;
  const nodes = {}, listeners = {};
  function mkEl(id){
    const e = { id, src:'', onload:null, onerror:null, value:'', textContent:'', innerHTML:'', className:'',
      style:{cssText:'',display:''}, checked:false, children:[],
      addEventListener(t,f){ (listeners[id]=listeners[id]||{})[t]=f; },
      appendChild(c){ e.children.push(c); return c; }, removeChild(){}, remove(){},
      querySelectorAll:()=>[], setAttribute(){}, getAttribute:()=>null, removeAttribute(){},
      click(){}, closest:()=>null, classList:{add(){},remove(){},contains:()=>false} };
    nodes[id]=e; return e; }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note','upBtn','downBtn','expBtn','impBtn','impFile',
   'gcBtn','capMeter','gLoginBtn','loginState','noteMore','noteRest'].forEach(mkEl);
  const body = mkEl('__body'), headEl = mkEl('__head');
  const document = { body, head: headEl, getElementById: id => nodes[id]||null,
    createElement: ()=>mkEl('__e'+Math.random()), createTextNode: t=>({nodeValue:String(t)}),
    querySelectorAll: ()=>[], addEventListener(){} };
  const sent = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem:()=>null, setItem(){}, removeItem(){} },
    document, navigator: { userAgent: 'iPhone' },
    location: { href:'', search:'', pathname:'/home.html', hash:'', replace(){} },
    history: { replaceState(){} }, alert(){}, confirm(){ return true; },
    setTimeout: ()=>0, clearTimeout(){}, setInterval: ()=>0, clearInterval(){},
    console: { log(){}, warn(){}, error(){} },
    URL: { createObjectURL: ()=>'blob:', revokeObjectURL(){} }, AbortController: undefined,
    atob: (x)=>Buffer.from(String(x),'base64').toString('binary'), escape:(x)=>String(x),
    fetch(url, o){
      if (String(url).indexOf('version.txt') >= 0) return Promise.resolve({ ok:true, text: ()=>Promise.resolve(read('version.txt').trim()) });
      let b = null; try { b = JSON.parse((o&&o.body)||'{}'); } catch(e){ b = {}; }
      sent.push(b.op);
      return Promise.resolve({ ok:true, status:200, json: ()=>Promise.resolve(opts.server(b)) });
    }
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  MODULES.forEach(f => vm.runInContext(read(f), ctx, { filename: f }));
  vm.runInContext(HOME_JS, ctx, { filename: 'home' });
  return { w, ls, nodes, sent, fire:(id,t,ev)=>{ const f = listeners[id]&&listeners[id][t]; return f?f(ev||{}):undefined; } };
}

/* 生きている物語 + 墓標 が入った meta */
const META = JSON.stringify([
  { id: LIVE,  name: '白鷺荘', key: 'chr6_slot_' + LIVE,  updatedAt: 5 },
  { id: OTHER, name: 'ほか',   key: 'chr6_slot_' + OTHER, updatedAt: 4 },
  { id: DEAD,  name: '削除済', deleted: true, deletedAt: 1, deleteOpId: 'del_1',
    recoverySnapshotId: 'chr6_snap_' + DEAD + '_' + ts, lifecycleVersion: 1, updatedAt: 3 }
]);
/* クラウド正本（実測の族比率を反映） */
function cloudLs(whiteChars){
  const ls = {};
  ls['chr6_slots_meta'] = META;
  ls['chr6_slot_' + LIVE]  = storyOfChars(96, whiteChars);
  ls['chr6_slot_' + OTHER] = storyOfChars(26, 83390);
  /* ①証拠台帳（除外対象） */
  ls['v292Dfix640Evid_slot_' + LIVE]  = jsonOfChars(100000);
  ls['v292Dfix640Evid_slot_' + OTHER] = jsonOfChars(35714);      /* 計 135,714字＝実測 */
  /* ②生きている物語のスナップショット（除外対象） */
  ls['chr6_snap_' + LIVE + '_' + ts]        = JSON.stringify({ slotId: LIVE, complete: true, parts: {} });
  ls['chr6_snapd_' + LIVE + '_' + ts + '_0'] = jsonOfChars(140000);
  ls['chr6_snapd_' + LIVE + '_' + ts + '_1'] = jsonOfChars(42873);   /* manifest込みで計 182,975字＝実測 */
  /* ★墓標スロットのスナップショット（**除外しない**＝消した物語を戻す最後の手段） */
  ls['chr6_snap_' + DEAD + '_' + ts]         = JSON.stringify({ slotId: DEAD, complete: true, parts: {} });
  ls['chr6_snapd_' + DEAD + '_' + ts + '_0'] = jsonOfChars(41000);
  /* ③会話ログ（Phase1では除外しない） */
  ls['chr6_v292Dfix104_dlg_slot_' + LIVE] = jsonOfChars(20238);
  /* サイドストア・登録簿（除外しない） */
  ls['chr6_v292Dfix307Roster_' + LIVE] = jsonOfChars(9000);
  ls['v292avrec_kaede'] = jsonOfChars(5000);
  return ls;
}
const server = (whiteChars) => (b) => {
  const c = cloudLs(whiteChars);
  if (b.op === 'meta') return { ok:true, rev:511, ns:'ns1', meta:{ updatedAt:1, device:'Win' } };
  if (b.op === 'get')  return { ok:true, rev:511, ns:'ns1', data:{ ls:c, updatedAt:1, full:true } };
  if (b.op === 'put')  return { ok:true, fork:true, rev:512, requestId:'r1' };
  if (b.op === 'commitstate') return { ok:true, rev:511, packageHash:'PH', ns:'ns1' };
  return { ok:false };
};
function localSeed(extra){
  return Object.assign({ v292ProxyPass:'pw', 'chr6_slots_meta': META,
    'chr6_active_slot': JSON.stringify(LIVE),
    ['chr6_slot_' + LIVE]: storyOfChars(10, 25654),
    ['chr6_slot_' + OTHER]: storyOfChars(26, 83390),
    'v292Dfix402_baseRev': '480' }, extra || {});
}
const EXCLUDED = ['v292Dfix640Evid_slot_' + LIVE, 'v292Dfix640Evid_slot_' + OTHER,
                  'chr6_snap_' + LIVE + '_' + ts, 'chr6_snapd_' + LIVE + '_' + ts + '_0',
                  'chr6_snapd_' + LIVE + '_' + ts + '_1'];
const KEPT = ['chr6_slot_' + LIVE, 'chr6_slot_' + OTHER, 'chr6_slots_meta',
              'chr6_v292Dfix104_dlg_slot_' + LIVE, 'chr6_v292Dfix307Roster_' + LIVE, 'v292avrec_kaede'];
/* ★墓標スロットのキーは fix665 ではなく **fix602 の墓標バリア**が先に止める（削除済みを復活させない）。
   fix665 は「墓標分のスナップショットは自分では除外しない」＝判定を重ねないことだけを保証する。 */
const TOMB_BLOCKED = ['chr6_snap_' + DEAD + '_' + ts, 'chr6_snapd_' + DEAD + '_' + ts + '_0'];
const turnsOf = (ls, k) => { try { return JSON.parse(ls.getItem(k)).turns.length; } catch(e){ return -1; } };

(async () => {

/* =====================================================================
   (0) 調査の裏取り（判定表の根拠がコードに実在するか）
   ===================================================================== */
console.log('== (0) 調査の裏取り（判定表の根拠） ==');
{
  ok('★証拠台帳の読み手は fix641 の harvestPending 経由だけ',
     /f\.harvestPending\(/.test(SRC641), (SRC641.match(/.{0,40}harvestPending.{0,30}/) || [])[0]);
  ok('★★証拠台帳は S.turns から機械的に再生成される',
     /function harvestPending/.test(SRC640) && /var turns = Array\.isArray\(st\.turns\) \? st\.turns : \[\];/.test(SRC640));
  ok('★★再生成は自動で回る（読込1.5秒後・保存/描画時）',
     (SRC640.match(/harvestPending\(\{\}\)/g) || []).length >= 3 && /setTimeout\(function\(\)\{ try \{ harvestPending\(\{\}\); \}/.test(SRC640));
  ok('★スナップショットの復元はコンソール操作のみ（UIから呼ぶ経路が無い）',
     /restore\(id, opts\)/.test(SRC564) && !/__v292Dfix564\.restore\(/.test(HOME));
  ok('★★墓標に recoverySnapshotId が書かれる（＝墓標分だけは運ぶ意味がある）',
     /recoverySnapshotId: snap\.id/.test(SRC587));
  ok('★スナップショットはローカルの live キーから作られる（他端末の複製を持つ理由が無い）',
     /function partKeys\(slot\)/.test(SRC564) && /if \(k\.indexOf\(slot\) < 0\) return;/.test(SRC564));
}

/* =====================================================================
   (1) 判定表（実装の f665Skip をそのまま評価する）
   ===================================================================== */
console.log('\n== (1) 判定表 ==');
{
  const h = boot({ ls: mkLS(localSeed(), 0), server: server(312088) });
  await settle();
  /* home の内部関数を評価するために、同じスクリプトを式として取り出して使う */
  const live = { [LIVE]: 1, [OTHER]: 1 };
  const skipSrc = HOME.slice(HOME.indexOf('function f665on()'), HOME.indexOf('/* ★fix662(A): 通知は最上部'));
  const ctx = vm.createContext({ normSlotId: (x) => (String(x) === 'default' ? 'chr6' : String(x)),
                                 g: () => null, console: { log(){} } });
  vm.runInContext(skipSrc + '\n; this.__skip = f665Skip;', ctx);
  const skip = ctx.__skip;
  const T = [
    ['v292Dfix640Evid_slot_' + LIVE, true,  '証拠台帳（再生成できる）'],
    ['v292Dfix640Evid_slot_' + DEAD, true,  '証拠台帳（墓標分も不要）'],
    ['chr6_snap_' + LIVE + '_' + ts, true,  '生きている物語のスナップショット manifest'],
    ['chr6_snapd_' + LIVE + '_' + ts + '_0', true, '同 実体'],
    ['chr6_snap_' + DEAD + '_' + ts, false, '★墓標スロットの復元点は運ぶ'],
    ['chr6_snapd_' + DEAD + '_' + ts + '_0', false, '★同 実体'],
    ['chr6_snapd_weirdshape', false, '形が読めないものは取り込む(fail-open)'],
    ['chr6_slot_' + LIVE, false, '物語本体'],
    ['chr6_slots_meta', false, '物語一覧'],
    ['chr6_v292Dfix104_dlg_slot_' + LIVE, false, 'Phase1では会話ログを除外しない'],
    ['chr6_v292Dfix307Roster_' + LIVE, false, 'サイドストア'],
    ['v292avrec_kaede', false, '共有資産']
  ];
  T.forEach(([k, want, why]) => ok((want ? '除外する  ' : '取り込む  ') + why + ' (' + k + ')', skip(k, live) === want, skip(k, live)));
  ok('★★meta が読めないときは1件も除外しない(fail-open)', T.every(([k]) => skip(k, null) === (k.indexOf('v292Dfix640Evid_') === 0)));
}

/* =====================================================================
   (2)(3) 実走: 除外キーは書かれない / それ以外は従来どおり / 掲示
   ===================================================================== */
console.log('\n== (2)(3) 実走：除外されるもの・されないもの・掲示 ==');
let onRun = null;
{
  const ls = mkLS(localSeed(), IOS_CAP);
  const before = ls.__total();
  const h = boot({ ls, server: server(312088) });
  await settle();
  onRun = { total: ls.__total(), before };
  EXCLUDED.forEach(k => ok('★除外: ' + k + ' を書いていない', ls.getItem(k) == null, ls.getItem(k) && ls.getItem(k).length));
  KEPT.forEach(k => ok('★従来どおり: ' + k + ' は書かれている', ls.getItem(k) != null));
  TOMB_BLOCKED.forEach(k => ok('★墓標分は fix602 が止める（fix665 の除外ではない）', ls.getItem(k) == null));
  ok('★★白鷺荘 96T が入った', turnsOf(ls, 'chr6_slot_' + LIVE) === 96, turnsOf(ls, 'chr6_slot_' + LIVE));
  ok('★★除外の件数と字数が画面最上部に出る',
     /この端末に不要な控え等 5件\/\d+KB は取り込みませんでした（クラウドには残っています）/.test(h.nodes.note.innerHTML),
     h.nodes.note.innerHTML.replace(/<[^>]+>/g, ' ').slice(0, 300));
  ok('★★収束証明を壊していない（baseRev が採用される）', ls.getItem('v292Dfix402_baseRev') === '511', ls.getItem('v292Dfix402_baseRev'));
  ok('★★チェーン（自動put）は不要だった', h.sent.indexOf('put') < 0, h.sent);
  ok('★⚠は出ていない', !/保存できませんでした/.test(h.nodes.note.innerHTML));
}

/* =====================================================================
   (4) OFF で完全復帰
   ===================================================================== */
console.log('\n== (4) OFF（v292Dfix665Off）で従来どおり全部取り込む ==');
let offRun = null;
{
  const ls = mkLS(localSeed({ v292Dfix665Off: '1' }), IOS_CAP);
  const h = boot({ ls, server: server(312088) });
  await settle();
  offRun = { total: ls.__total() };
  EXCLUDED.forEach(k => ok('★OFF: ' + k + ' が従来どおり書かれる', ls.getItem(k) != null));
  TOMB_BLOCKED.forEach(k => ok('★OFF でも墓標分は止まる（fix602 は別の防壁）', ls.getItem(k) == null));
  ok('★OFF では除外の掲示が出ない', !/取り込みませんでした/.test(h.nodes.note.innerHTML));
  ok('★★OFF でも白鷺荘 96T は入る', turnsOf(ls, 'chr6_slot_' + LIVE) === 96);
}

/* =====================================================================
   (5) 収束証明：除外だけの回でも「完全採用」を妨げない
   ===================================================================== */
console.log('\n== (5) 収束証明（intentionalSkip は unknownSkips でも retainedLocalDelta でもない） ==');
{
  ok('★★proof へ unknownSkips として渡していない', (() => {
    const i = HOME.indexOf('unknownSkips: unknownSkips + haltBlocked');
    const seg = HOME.slice(i, i + 700);
    return /intentionalSkipCount: intentionalSkips\.length/.test(seg) &&
           !/unknownSkips: unknownSkips \+ haltBlocked \+ intentional/.test(HOME);
  })());
  ok('★★proof へ retainedLocalDeltaCount として渡していない',
     !/retainedLocalDeltaCount: [^\n]*intentional/.test(HOME),
     (HOME.match(/retainedLocalDeltaCount: [^\n]*/) || [])[0]);
  ok('★★baseRev 採用条件にも数えない（diffCount を増やさない）', (() => {
    const i = HOME.indexOf('if(f665Skip(k, f665Live)){');
    const seg = HOME.slice(i, i + 260);
    return /intentionalSkips\.push\(k\);/.test(seg) && /continue;/.test(seg) && !/diffCount\+\+/.test(seg);
  })());
}
{
  /* 差分が「除外対象だけ」の回：wrote=0 / diff=0 でも基点を採用してよい */
  const seed = localSeed();
  seed['chr6_slot_' + LIVE] = storyOfChars(96, 312088);          /* 本体はもう最新 */
  seed['chr6_v292Dfix104_dlg_slot_' + LIVE] = jsonOfChars(20238);
  seed['chr6_v292Dfix307Roster_' + LIVE] = jsonOfChars(9000);
  seed['v292avrec_kaede'] = jsonOfChars(5000);
  seed['chr6_snap_' + DEAD + '_' + ts] = JSON.stringify({ slotId: DEAD, complete: true, parts: {} });
  seed['chr6_snapd_' + DEAD + '_' + ts + '_0'] = jsonOfChars(41000);
  const ls = mkLS(seed, IOS_CAP);
  const h = boot({ ls, server: server(312088) });
  await settle();
  ok('★★差分が除外対象だけなら「取り込みました（0件）」でも基点は採用される',
     ls.getItem('v292Dfix402_baseRev') === '511', { base: ls.getItem('v292Dfix402_baseRev'), sync: h.nodes.sync.textContent });
  ok('★その回も除外の掲示は出る（0件で終わらせない）', /取り込みませんでした/.test(h.nodes.note.innerHTML));
}

/* =====================================================================
   (6) 既に端末にある除外対象は消さない
   ===================================================================== */
console.log('\n== (6) 取り込まない ≠ 消す ==');
{
  const seed = localSeed();
  seed['v292Dfix640Evid_slot_' + LIVE] = jsonOfChars(1234);       /* 端末に既にある */
  seed['chr6_snapd_' + LIVE + '_' + ts + '_0'] = jsonOfChars(2345);
  const ls = mkLS(seed, IOS_CAP);
  boot({ ls, server: server(312088) });
  await settle();
  ok('★★既にある証拠台帳を消していない（内容も変えない）', ls.getItem('v292Dfix640Evid_slot_' + LIVE) === jsonOfChars(1234));
  ok('★★既にあるスナップショット実体を消していない', ls.getItem('chr6_snapd_' + LIVE + '_' + ts + '_0') === jsonOfChars(2345));
  ok('★削除は1件も起きていない', ls.__removed.filter(k => /^(chr6_snapd_|v292Dfix640Evid_)/.test(k)).length === 0, ls.__removed);
}

/* =====================================================================
   (7) 実データ相当の削減量と、チェーン無しで白鷺荘が入るか
   ===================================================================== */
console.log('\n== (7) 実データ相当：削減量と CAP 余裕 ==');
{
  /* 実測比率（クラウド 1,649,759字）を縮尺1で再現し、iPhone を CAP 近傍に置く */
  const REAL = { snapshot: 182975, evidence: 135714, white96: 312088 };
  const saved = REAL.snapshot + REAL.evidence;
  console.log('   実測: snapshot ' + REAL.snapshot.toLocaleString() + '字 + evidence ' + REAL.evidence.toLocaleString() +
              '字 = ' + saved.toLocaleString() + '字 を端末に置かない');
  console.log('   実効CAP ' + EFFECTIVE.toLocaleString() + '字 に対して ' + Math.round(saved / EFFECTIVE * 1000) / 10 + '% の余裕を生む');
  ok('★★削減量が統括の見積り(-318,689字)と一致', saved === 318689, saved);

  /* fix665 ON / OFF の同一配置で総字数を比べる */
  console.log('   sandbox 実測: OFF ' + offRun.total.toLocaleString() + '字 → ON ' + onRun.total.toLocaleString() +
              '字（-' + (offRun.total - onRun.total).toLocaleString() + '字）');
  ok('★★ON の方が端末の使用量が小さい', onRun.total < offRun.total, { on: onRun.total, off: offRun.total });
  const want = EXCLUDED.reduce((a, k) => a + k.length + cloudLs(312088)[k].length, 0);
  ok('★★削減量は除外した族の合計と一致（余計なものを落としていない）',
     Math.abs((offRun.total - onRun.total) - want) < 200, { diff: offRun.total - onRun.total, want });
}
{
  /* ★本番の詰まり配置。
     ★ここが要点: fix665 の効き目は「今回1回の取り込み」ではなく、
       **その端末がこれまで何を置いてきたか**に出る。
       OFF の端末は過去の pull で証拠台帳とスナップショットを溜め込んでいる(実測 iPhone=2,479,000字)。
       ON の端末はそもそも置いていない(=318,689字ぶん軽い)。その状態から 96T を書けるかを比べる。 */
  const REAL_TOTAL = 2479000;
  function bigSeed(withExcluded){
    const s2 = localSeed(withExcluded ? { v292Dfix665Off: '1' } : {});
    /* 唯一の丸ごと控え(地元キー・同期対象外) */
    const dump = 'chr6_bk_cloudsync_1784942016123';
    s2[dump] = JSON.stringify({ activeSlot: LIVE, savedAt: 1784942016123,
      ls: { ['chr6_slot_' + LIVE]: storyOfChars(96, 300000), ['chr6_v292Dfix307Roster_' + LIVE]: jsonOfChars(280000) } });
    const c = cloudLs(312088);
    /* OFF の端末は過去の pull でこれらを取り込んで**持っている** */
    if (withExcluded) EXCLUDED.forEach(k => { s2[k] = c[k]; });
    const cur = () => Object.keys(s2).reduce((a, k) => a + k.length + s2[k].length, 0);
    const fill = 'v292Dfix640Evid_local_pad';
    /* 地元キーの量は両者で同じにする（差は「過去に取り込んだ族」だけ） */
    const excludedChars = EXCLUDED.reduce((a, k) => a + k.length + c[k].length, 0);
    const target = withExcluded ? REAL_TOTAL : (REAL_TOTAL - excludedChars);
    s2[fill] = jsonOfChars(Math.max(20, target - cur() - fill.length));
    return s2;
  }
  const lsOff = mkLS(bigSeed(true), IOS_CAP);
  const hOff = boot({ ls: lsOff, server: server(312088) });
  await settle();
  console.log('   [OFF] 開始 ' + REAL_TOTAL.toLocaleString() + '字 → 通信=' + hOff.sent.join(',') +
              ' / 白鷺荘=' + turnsOf(lsOff, 'chr6_slot_' + LIVE) + 'T / LS=' + lsOff.__total().toLocaleString() + '字');
  ok('★★[OFF] 詰まるのでチェーン（自動put＋唯一の控えの降格）が必要になる',
     hOff.sent.indexOf('put') >= 0 && lsOff.getItem('chr6_bk_cloudsync_1784942016123') == null, hOff.sent);

  const onSeed = bigSeed(false);
  const onStart = Object.keys(onSeed).reduce((a, k) => a + k.length + onSeed[k].length, 0);
  const lsOn = mkLS(onSeed, IOS_CAP);
  const hOn = boot({ ls: lsOn, server: server(312088) });
  await settle();
  console.log('   [ON ] 開始 ' + onStart.toLocaleString() + '字 → 通信=' + hOn.sent.join(',') +
              ' / 白鷺荘=' + turnsOf(lsOn, 'chr6_slot_' + LIVE) + 'T / LS=' + lsOn.__total().toLocaleString() +
              '字（実効CAP ' + EFFECTIVE.toLocaleString() + '・余裕 ' + (EFFECTIVE - lsOn.__total()).toLocaleString() + '字）');
  ok('★★★[ON] チェーン無し（自動put無し）で白鷺荘 96T が入る',
     hOn.sent.indexOf('put') < 0 && turnsOf(lsOn, 'chr6_slot_' + LIVE) === 96, { sent: hOn.sent, t: turnsOf(lsOn, 'chr6_slot_' + LIVE) });
  ok('★★★[ON] 唯一の丸ごと控えを降格せずに済んだ（復元の最後の手段を失わない）',
     lsOn.getItem('chr6_bk_cloudsync_1784942016123') != null);
  ok('★★[ON] LS は実効CAP以下', lsOn.__total() <= EFFECTIVE, lsOn.__total());
  ok('★[ON] 1バイトも削除していない', lsOn.__removed.length === 0, lsOn.__removed);
}

/* =====================================================================
   (8) 出荷の体裁
   ===================================================================== */
console.log('\n== (8) 出荷の体裁 ==');
{
  const ver = read('version.txt').trim();
  const HTMLU = Buffer.from(fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1'), 'latin1').toString('utf8');
  ok('★★BUILT / HOME_BUILT / fix654 BUILD が version.txt と同値',
     (HTMLU.match(/var BUILT = '([^']+)'/) || [])[1] === ver &&
     (HOME.match(/var HOME_BUILT = '([^']+)'/) || [])[1] === ver &&
     (read('v292Dfix654-storage-trap.js').match(/BUILD\s*=\s*'([^']+)'/) || [])[1] === ver, ver);
  ok('★★送信側(collectLS)は1バイトも変えていない＝クラウドには全部残る',
     /if\(hit \|\| isGlobalKey\(k\)\) out\[k\]=g\(k\);/.test(HOME) && !/f665Skip/.test(HOME.slice(HOME.indexOf('function collectLS(){'), HOME.indexOf('function push()'))));
  ok('★OFF スイッチがある', HOME.indexOf("'v292Dfix665Off'") > 0);
  ok('★home.html の直接削除は既存3か所のまま', (() => {
    const code = HOME.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    return (code.match(/\.removeItem\s*\(/g) || []).length === 3;
  })());
}

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('FATAL', e && e.stack || e); console.log('PASS ' + pass + ' / FAIL ' + (fail + 1)); process.exit(1); });
