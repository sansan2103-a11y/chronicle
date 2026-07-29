/* 回帰テスト: v292Dfix602 — home.html の取り込み(pull)と送信(collectLS)に墓標バリアを配線する
 *
 * ■なぜ必要か（2026-07-27 の実測で確定した真因）
 *   物語を削除すると `chr6_slots_meta` に墓標(tombstone)が立ち、本体とサイドストアは
 *   検証済みスナップショットを作ってから物理削除される。
 *   ところが **home.html の取り込みと送信にだけ墓標バリアが無かった**。
 *   fix587.filterIncoming / fix588 の除外は index.html 側（fix399 / fix402）にしか
 *   配線されておらず、実機では **墓標が立った後に本体へ2ターン書き足されていた**
 *   （12785B/4ターン → 18132B/6ターン）＝ home が削除済みの物語を復活させていた。
 *
 * 固定する契約（★すべて「実装の文字列」ではなく**振る舞い**で見る）
 *   P1 墓標スロットの本体を pull しても書き戻さない
 *   P2 墓標スロットの引用符付きサイドストアも書き戻さない
 *   P3 墓標 `sm1` は、生きている `sm12` を巻き添えにしない（部分一致禁止）
 *   P4 生存スロットは従来どおり取り込む
 *   P5 meta は mergeMeta を通り、墓標が維持される
 *   P6 バリアの正本が使えない＋墓標あり → slotスコープのデータ適用を止め、理由コードを残す
 *   S1 forceput の荷物に墓標スロットの本体が入らない
 *   S2 forceput の荷物に墓標スロットのサイドストアが入らない
 *   S3 meta の墓標そのものは送る（削除を伝えるため）
 *   S4 バリアが使えない＋墓標あり → forceput しない（無言で return せず理由を出す）
 *   O1 v292Dfix602Off='1' で除外だけが止まる
 *   O2 OFF でも墓標そのものは壊れない
 *   N1 反映待ちを人が読める言葉で出す（表示できない理由も黙らない）
 *
 * ■動かし方
 *   home.html の中の実際の `<script>` を取り出し、モック window の上で走らせる。
 *   fix579 / fix562 / fix587 は**本物**を同じコンテキストへ載せる。
 *   pull / push は画面のボタンに登録された実際のハンドラを呼んで起動する。
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? ('  >> ' + JSON.stringify(x)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const HOME = read('home.html');
const SRC579 = read('v292Dfix579-tombstone-schema.js');
const SRC562 = read('v292Dfix562-backup-inventory.js');
const SRC587 = read('v292Dfix587-story-lifecycle.js');

/* home.html の本体スクリプト（最後のインライン script）を取り出す */
function homeScript(){
  const parts = HOME.match(/<script>[\s\S]*?<\/script>/g) || [];
  const bodies = parts.map(p => p.replace(/^<script>/, '').replace(/<\/script>$/, ''));
  return bodies[bodies.length - 1];
}
const HOME_JS = homeScript();

const story = n => JSON.stringify({ turns: new Array(n).fill(0).map(() => ({})) });

/* ---------------- モック環境 ---------------- */
function mkHome(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.seed || {});
  const ls = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key: i => { const a = Object.keys(store); return i < a.length ? a[i] : null; },
    get length(){ return Object.keys(store).length; }
  };

  /* --- 最小 DOM --- */
  const listeners = {};          /* id -> { type: fn } */
  const nodes = {};
  function mkEl(id){
    const e = {
      id: id, value: '', textContent: '', innerHTML: '', className: '',
      style: { cssText: '' }, firstChild: null, children: [],
      addEventListener: (t, fn) => { (listeners[id] = listeners[id] || {})[t] = fn; },
      appendChild: c => { if (!e.firstChild) e.firstChild = c; e.children.push(c); return c; },
      removeChild: () => {}, remove: () => { delete nodes[e.id]; },
      querySelectorAll: () => [], setAttribute: () => {}, getAttribute: () => null,
      removeAttribute: () => {}, click: () => {}, closest: () => null,
      classList: { add(){}, remove(){}, contains(){ return false; } }
    };
    nodes[id] = e;
    return e;
  }
  ['q','sort','listTitle','navs','recent','grid','detail','sync','note',
   'upBtn','downBtn','expBtn','impBtn','impFile'].forEach(mkEl);
  const body = mkEl('__body');
  const document = {
    body: body,
    getElementById: id => nodes[id] || null,
    createElement: () => mkEl('__el' + Math.random()),
    createTextNode: t => ({ nodeValue: String(t) }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  /* appendChild(document.body) されたノードは id で引けるようにする（通知バーの確認用） */
  body.appendChild = c => { if (c && c.id) nodes[c.id] = c; body.children.push(c); return c; };

  /* --- 通信 --- */
  const calls = [];
  const fetchImpl = (url, o) => {
    if (String(url).indexOf('version.txt') >= 0){
      return Promise.resolve({ ok: true, text: () => Promise.resolve('20260727-fix602') });
    }
    let body = null;
    try { body = JSON.parse((o && o.body) || '{}'); } catch(e){ body = {}; }
    calls.push(body);
    const r = (opts.server || (() => ({ ok: false })))(body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(r) });
  };

  const alerts = [], confirms = [], logs = [];
  const w = {
    localStorage: ls, sessionStorage: { getItem: () => null, removeItem(){}, setItem(){} },
    document: document, fetch: fetchImpl,
    navigator: { userAgent: 'test' },
    location: { href: '', search: '', pathname: '/home.html', replace(){} },
    alert: m => { alerts.push(String(m)); },
    confirm: m => { confirms.push(String(m)); return opts.confirm !== false; },
    setTimeout: (fn) => { return 0; },
    clearTimeout: () => {},
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    URL: { createObjectURL: () => 'blob:', revokeObjectURL(){} },
    AbortController: undefined
  };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  /* 本物の依存を載せる（テスト専用の作り直しはしない） */
  if (opts.tomb !== false) vm.runInContext(SRC579, ctx, { filename: 'v292Dfix579-tombstone-schema.js' });
  if (opts.classifier !== false) vm.runInContext(SRC562, ctx, { filename: 'v292Dfix562-backup-inventory.js' });
  if (opts.lifecycle !== false) vm.runInContext(SRC587, ctx, { filename: 'v292Dfix587-story-lifecycle.js' });
  vm.runInContext(HOME_JS, ctx, { filename: 'home.html<script>' });

  return { w, store, ls, calls, alerts, confirms, logs, nodes, listeners,
           api: () => w.__v292Dfix602home,
           fire: (id, type, ev) => { const f = listeners[id] && listeners[id][type]; if (f) return f(ev || {}); } };
}
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); };

/* 墓標エントリ（fix579 の形） */
const tomb = (id, opId) => ({ id: id, name: '', deleted: true, deletedAt: 1700000000000,
                              deleteOpId: opId || ('del_' + id + '_1'), recoverySnapshotId: 'chr6_snap_' + id,
                              lifecycleVersion: 1 });

/* ============================================================ */
async function main(){

console.log('\n== (1) ★★取り込み(pull): 墓標スロットのデータを書き戻さない ==');
{
  const seed = {
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([ tomb('smDead'), { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smAlive': story(2)
  };
  const remoteLs = {
    'chr6_slots_meta': JSON.stringify([ { id:'smDead', name:'消したはずの物語' }, { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smDead': story(6),
    'chr6_v292Dfix54_genderMap_"smDead"': '{"レン":"m"}',
    'v292Dfix77States_slot_smDead': '{"s":1}',
    'chr6_slot_smAlive': story(5),
    'v292avrec_alice': '{"a":1}'
  };
  const h = mkHome({ seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 9, ns:'ns1' }
      : { ok:true, data:{ ls: remoteLs, updatedAt: 1700000000001 } } });
  await flush();
  h.fire('downBtn', 'click');           /* ☁ いま取り込む（force=true） */
  await flush();

  ok('P1 ★★墓標スロットの本体を書き戻さない',
     h.store['chr6_slot_smDead'] === undefined, h.store['chr6_slot_smDead']);
  ok('P2 ★★引用符付きサイドストアも書き戻さない',
     h.store['chr6_v292Dfix54_genderMap_"smDead"'] === undefined);
  ok('P2b ★墓標スロットの他のサイドストアも書き戻さない',
     h.store['v292Dfix77States_slot_smDead'] === undefined);
  ok('P4 ★★生存スロットは従来どおり取り込む（6ターン→5ターンのremoteで置換）',
     h.store['chr6_slot_smAlive'] === story(5), h.store['chr6_slot_smAlive']);
  ok('P4b ★global キー(v292avrec_)は従来どおり取り込む',
     h.store['v292avrec_alice'] === '{"a":1}');
  const meta = JSON.parse(h.store['chr6_slots_meta']);
  const dead = meta.filter(e => e.id === 'smDead')[0];
  ok('P5 ★★meta は mergeMeta を通り墓標が残る（削除した物語が live に戻らない）',
     !!dead && dead.deleted === true, dead);
  ok('P5b ★deleteOpId も保たれる', !!dead && dead.deleteOpId === 'del_smDead_1', dead);
  ok('★除外件数を画面に出している（黙って減らさない）',
     /削除した物語のデータ 3 件/.test(h.nodes['note'].innerHTML), h.nodes['note'].innerHTML);
  ok('★console にも出している',
     h.logs.some(l => l.indexOf('v292Dfix602') >= 0 && l.indexOf('tombBlocked') >= 0), h.logs.slice(-3));
}

console.log('\n== (2) ★★★部分一致禁止: 墓標 sm1 が生きている sm12 を止めない ==');
{
  const seed = {
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([ tomb('sm1'), { id:'sm12', name:'生きている物語' } ]),
    'chr6_slot_sm12': story(1)
  };
  const remoteLs = {
    'chr6_slots_meta': JSON.stringify([ { id:'sm1', name:'消した物語' }, { id:'sm12', name:'生きている物語' } ]),
    'chr6_slot_sm1': story(4),
    'chr6_v292Dfix54_genderMap_"sm1"': '{"A":"m"}',
    'chr6_slot_sm12': story(7),
    'chr6_v292Dfix54_genderMap_"sm12"': '{"B":"f"}',
    'v292Dfix77States_slot_sm12': '{"s":12}'
  };
  const h = mkHome({ seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 3 } : { ok:true, data:{ ls: remoteLs } } });
  await flush();
  h.fire('downBtn', 'click');
  await flush();

  ok('P1 ★墓標 sm1 の本体は止める', h.store['chr6_slot_sm1'] === undefined);
  ok('P2 ★墓標 sm1 の引用符付きサイドストアも止める',
     h.store['chr6_v292Dfix54_genderMap_"sm1"'] === undefined);
  ok('P3 ★★生きている sm12 の本体は取り込む（7ターン）',
     h.store['chr6_slot_sm12'] === story(7), h.store['chr6_slot_sm12']);
  ok('P3 ★★生きている sm12 の引用符付きサイドストアも取り込む',
     h.store['chr6_v292Dfix54_genderMap_"sm12"'] === '{"B":"f"}',
     h.store['chr6_v292Dfix54_genderMap_"sm12"']);
  ok('P3 ★★生きている sm12 の他のサイドストアも取り込む',
     h.store['v292Dfix77States_slot_sm12'] === '{"s":12}');
  /* 判定器そのものも直接確かめる（両辺 null の偽合格を避けるため具体値で） */
  const api = h.api();
  ok('★slotId の正規化: 引用符付きキーから sm12 を取り出せる',
     api.slotIdOfKey('chr6_v292Dfix54_genderMap_"sm12"') === 'sm12',
     api.slotIdOfKey('chr6_v292Dfix54_genderMap_"sm12"'));
  ok('★slotId の正規化: 本体キーから sm1 を取り出せる',
     api.slotIdOfKey('chr6_slot_sm1') === 'sm1', api.slotIdOfKey('chr6_slot_sm1'));
  ok('★墓標判定は完全一致（sm12 は墓標ではない）',
     api.isTombstonedSlotKey('chr6_slot_sm12', api.tombstonedIds()) === false);
  ok('★墓標判定は完全一致（sm1 は墓標）',
     api.isTombstonedSlotKey('chr6_slot_sm1', api.tombstonedIds()) === true);
}

console.log('\n== (3) ★★バリアの正本が使えない＋墓標あり → slotスコープの適用を止める ==');
{
  const seed = {
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([ tomb('smDead'), { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smAlive': story(2)
  };
  const remoteLs = {
    'chr6_slots_meta': JSON.stringify([ { id:'smDead', name:'消した物語' }, { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smDead': story(6),
    'chr6_slot_smAlive': story(5),
    'v292avrec_alice': '{"a":1}',
    'chr6_epoch': '7'
  };
  /* ★分類器(fix562)が居ない＝slotIdを正規化できない環境 */
  const h = mkHome({ classifier: false, seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 5 } : { ok:true, data:{ ls: remoteLs } } });
  await flush();
  h.fire('downBtn', 'click');
  await flush();

  const api = h.api();
  const bar = api.incomingBarrier(remoteLs);
  ok('P6 ★★理由コードが残る', bar.why === 'pull-blocked-tombstone-barrier-unavailable', bar.why);
  ok('P6 ★★モードは halt', bar.mode === 'halt', bar.mode);
  ok('P6 ★★墓標スロットの本体を適用しない', h.store['chr6_slot_smDead'] === undefined);
  ok('P6 ★★生存スロットも適用しない（曖昧な自前判定で続行しない）',
     h.store['chr6_slot_smAlive'] === story(2), h.store['chr6_slot_smAlive']);
  ok('P6 ★global キーは従来どおり通す', h.store['v292avrec_alice'] === '{"a":1}');
  ok('P6 ★chr6_epoch も通す', h.store['chr6_epoch'] === '7');
  const meta = JSON.parse(h.store['chr6_slots_meta']);
  ok('P6 ★meta の mergeMeta は通す（墓標が残る）',
     meta.filter(e => e.id === 'smDead')[0].deleted === true, meta);
  ok('P6 ★理由を画面にも出す（黙らない）',
     h.nodes['note'].innerHTML.indexOf('見送りました') > 0, h.nodes['note'].innerHTML);
  ok('P6 ★console にも理由コードを出す',
     h.logs.some(l => l.indexOf('pull-blocked-tombstone-barrier-unavailable') >= 0), h.logs.slice(-3));
}

console.log('\n== (4) ★★送信(forceput): 墓標スロットの実体を送らない ==');
{
  const seed = {
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([ tomb('smDead'), { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smDead': story(4),                       /* 物理削除が保留中で残っている状態 */
    'chr6_v292Dfix54_genderMap_"smDead"': '{"A":"m"}',
    'v292Dfix77States_slot_smDead': '{"s":1}',
    'chr6_slot_smAlive': story(2),
    'chr6_v292Dfix54_genderMap_"smAlive"': '{"B":"f"}',
    'v292avrec_alice': '{"a":1}'
  };
  const h = mkHome({ seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 2, ns:'ns1' } : { ok:true, rev: 3 } });
  await flush();
  h.fire('upBtn', 'click');            /* ☁ いま上げる */
  await flush();

  const put = h.calls.filter(c => c.op === 'forceput')[0];
  ok('★forceput が送られた', !!put, h.calls.map(c => c.op));
  const sent = (put && put.pkg && put.pkg.ls) || {};
  ok('S1 ★★墓標スロットの本体を送らない', sent['chr6_slot_smDead'] === undefined, Object.keys(sent));
  ok('S2 ★★墓標スロットの引用符付きサイドストアを送らない',
     sent['chr6_v292Dfix54_genderMap_"smDead"'] === undefined);
  ok('S2b ★墓標スロットの他のサイドストアも送らない',
     sent['v292Dfix77States_slot_smDead'] === undefined);
  ok('★生存スロットの本体は送る（偽の合格を避ける具体値）',
     sent['chr6_slot_smAlive'] === story(2), sent['chr6_slot_smAlive']);
  ok('★生存スロットのサイドストアも送る',
     sent['chr6_v292Dfix54_genderMap_"smAlive"'] === '{"B":"f"}');
  ok('★global キーも送る', sent['v292avrec_alice'] === '{"a":1}');
  const sentMeta = JSON.parse(sent['chr6_slots_meta'] || '[]');
  ok('S3 ★★meta の墓標そのものは送る（削除を伝えるため）',
     sentMeta.filter(e => e.id === 'smDead' && e.deleted === true).length === 1, sentMeta);
  ok('S3b ★墓標の deleteOpId も送る',
     sentMeta.filter(e => e.id === 'smDead')[0].deleteOpId === 'del_smDead_1');
  ok('★除外件数を画面に出す', /クラウドへ送っていません/.test(h.nodes['note'].innerHTML), h.nodes['note'].innerHTML);
  ok('★除外件数は3件（本体＋サイドストア2本）', h.api().lastPayloadDropped() === 3, h.api().lastPayloadDropped());
  ok('★墓標スロットは送信対象の一覧から外れている',
     h.api().allSlotIds().indexOf('smDead') < 0, h.api().allSlotIds());
  ok('★生存スロットは送信対象の一覧に残る',
     h.api().allSlotIds().indexOf('smAlive') >= 0, h.api().allSlotIds());
}

console.log('\n== (5) ★★★分類器不在＋墓標あり → forceput しない（fail-open を持ち込まない） ==');
{
  const seed = {
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([ tomb('smDead'), { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smDead': story(4),
    'chr6_slot_smAlive': story(2)
  };
  const h = mkHome({ classifier: false, seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 2 } : { ok:true, rev: 3 } });
  await flush();
  const before5 = h.calls.length;       /* 起動時の自動pullの分を除いて数える */
  h.fire('upBtn', 'click');
  await flush();
  const after5 = h.calls.slice(before5);

  ok('S4 ★★forceput を1件も送っていない',
     after5.filter(c => c.op === 'forceput').length === 0, after5.map(c => c.op));
  ok('S4 ★★op:meta すら叩いていない（中止は confirm より前）',
     after5.length === 0, after5.map(c => c.op));
  ok('S4 ★★無言で return しない（理由を出す）',
     h.alerts.length === 1 && h.alerts[0].indexOf('中止しました') > 0, h.alerts);
  ok('S4 ★画面の状態表示にも理由が出る',
     h.nodes['sync'].textContent.indexOf('上げませんでした') > 0, h.nodes['sync'].textContent);
  ok('S4 ★console に理由コードを出す',
     h.logs.some(l => l.indexOf('forceput-blocked-tombstone-barrier-unavailable') >= 0), h.logs.slice(-3));
  ok('S4 ★確認ダイアログを出す前に止める（上書きの意思を取らない）', h.confirms.length === 0, h.confirms);
  ok('S4 ★データは1バイトも変わっていない', h.store['chr6_slot_smAlive'] === story(2));
}

console.log('\n== (5b) ★墓標が無ければ、分類器が居なくても従来どおり送れる（過剰に止めない） ==');
{
  const seed = {
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([{ id:'smAlive', name:'生きている物語' }]),
    'chr6_slot_smAlive': story(2)
  };
  const h = mkHome({ classifier: false, seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 2 } : { ok:true, rev: 3 } });
  await flush();
  h.fire('upBtn', 'click');
  await flush();
  const put = h.calls.filter(c => c.op === 'forceput')[0];
  ok('★forceput は送られる', !!put, h.calls.map(c => c.op));
  ok('★中身も従来どおり', !!put && put.pkg.ls['chr6_slot_smAlive'] === story(2));
}

console.log('\n== (6) ★★OFFスイッチ v292Dfix602Off=1 は「除外だけ」を止める ==');
{
  const seed = {
    'v292Dfix602Off': '1',
    'v292ProxyPass': 'pw',
    'chr6_slots_meta': JSON.stringify([ tomb('smDead'), { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smDead': story(4),
    'chr6_slot_smAlive': story(2)
  };
  const remoteLs = {
    'chr6_slots_meta': JSON.stringify([ { id:'smDead', name:'消した物語' }, { id:'smAlive', name:'生きている物語' } ]),
    'chr6_slot_smDead': story(6),
    'chr6_slot_smAlive': story(5)
  };
  const h = mkHome({ seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 4 } : { ok:true, data:{ ls: remoteLs } } });
  await flush();
  h.fire('downBtn', 'click');
  await flush();

  ok('O1 ★★OFF なら墓標スロットも従来どおり取り込む（緊急脱出口が効く）',
     h.store['chr6_slot_smDead'] === story(6), h.store['chr6_slot_smDead']);
  const meta = JSON.parse(h.store['chr6_slots_meta']);
  const dead = meta.filter(e => e.id === 'smDead')[0];
  ok('O2 ★★OFF でも墓標そのものは壊れない（mergeMeta は止めない）',
     !!dead && dead.deleted === true && dead.deleteOpId === 'del_smDead_1', dead);
  ok('O2 ★OFF でも「墓標があるか」の判定は正しく答える', h.api().hasTombstone() === true);

  /* 送信側も OFF で従来どおり */
  const h2 = mkHome({ seed: seed, server: b => b.op === 'meta'
      ? { ok:true, rev: 2 } : { ok:true, rev: 3 } });
  await flush();
  h2.fire('upBtn', 'click');
  await flush();
  const put = h2.calls.filter(c => c.op === 'forceput')[0];
  ok('O1 ★★OFF なら墓標スロットの本体も送る', !!put && put.pkg.ls['chr6_slot_smDead'] === story(4),
     put && Object.keys(put.pkg.ls));
  ok('O1 ★OFF でも meta の墓標は送る（削除の記録を壊さない）',
     !!put && JSON.parse(put.pkg.ls['chr6_slots_meta']).filter(e => e.id === 'smDead')[0].deleted === true);
}

console.log('\n== (7) ★★反映待ちの表示（人が読める言葉で・黙らない） ==');
{
  const seed = {
    'chr6_slots_meta': JSON.stringify([ tomb('smDead') ]),
    'v292Dfix587_pending': JSON.stringify([{ planId:'plan_1', slotId:'smDead', deleteOpId:'del_smDead_1' }])
  };
  const h = mkHome({ seed: seed, server: () => ({ ok:false }) });
  await flush();
  const t = h.api().pendingDeleteText();
  ok('N1 ★★保留件数を人の言葉で出す', t.indexOf('削除した物語が 1件') === 0, t);
  ok('N1 ★次にすることを書いてある', t.indexOf('ゲーム画面を一度開くと同期されます') > 0, t);
  ok('N1 ★★技術用語や生のhashを出さない',
     !/tombstone|deleteOpId|plan_|hash|rev\b/i.test(t), t);
  ok('N1 ★画面にも常設で出る',
     !!h.nodes['v595-pending'] && h.nodes['v595-pending'].firstChild.nodeValue === t,
     h.nodes['v595-pending'] && h.nodes['v595-pending'].firstChild);

  /* 削除サービスが積まれていない環境 → 黙らずに理由を出す */
  const h2 = mkHome({ lifecycle: false, seed: seed, server: () => ({ ok:false }) });
  await flush();
  const t2 = h2.api().pendingDeleteText();
  ok('N1 ★★表示できない理由も黙らせない（サービス未搭載）',
     t2.indexOf('削除の状況を確認できません') > 0, t2);
  ok('N1 ★それでも保留件数は保険で出す', t2.indexOf('削除した物語が 1件') === 0, t2);

  /* 保留も墓標も無ければ何も出さない（余計な不安を出さない） */
  const h3 = mkHome({ seed: { 'chr6_slots_meta': '[]' }, server: () => ({ ok:false }) });
  await flush();
  ok('N1 ★保留が無ければ何も出さない', h3.api().pendingDeleteText() === '', h3.api().pendingDeleteText());
  ok('N1 ★通知バーも作らない', !h3.nodes['v595-pending']);
}

console.log('\n== (8) 出荷の体裁（配線・キャッシュバスター） ==');
{
  ok('★home.html に fix602 のスクリプト参照がある',
     HOME.indexOf('v292Dfix602-tombstone-write-shadow.js') > 0);
  /* ★★2026-07-29(fix642): 旧判定は「fix587 の後ろに 602 以外の script が1つでもあれば不合格」
     だったので、fix587 より後ろへ**新しいモジュールを1本足すだけで必ず落ちた**。
     固定したい契約は「fix587 の**直後**が fix602 である（間に何も挟まらない）」であって
     「fix587 より後ろに他のモジュールを置いてはいけない」ではない。間だけを見る。 */
  {
    const i587 = HOME.indexOf('v292Dfix587-story-lifecycle.js');
    const i602 = HOME.indexOf('v292Dfix602-tombstone-write-shadow.js');
    const between = (i587 >= 0 && i602 > i587) ? HOME.slice(i587, i602) : '';
    ok('★★位置は fix587 の直後（間に別のモジュールが挟まらない）',
       i602 > i587 && i587 >= 0 && !/<script src="v292Dfix/.test(between), { i587, i602, between });
  }
  /* ★★出荷のたびに壊れないように、**リテラルではなく BUILT と突き合わせる**。
     固定したいのは「fix602 という文字列」ではなく
     「配信物を変えたら cb も一緒に上がっている（上げ忘れていない）」という契約。
     ★fix596 の同種テストと同じ考え方。実測: cb の上げ忘れで
       「新版を出したのにブラウザは古いJSを使い続ける」が実際に起きた。 */
  const HOME_BUILT_TOKEN = (HOME.match(/HOME_BUILT\s*=\s*'\d{8}-fix(\d+)'/) || [])[1];
  ok('★★home.html から HOME_BUILT を読めている（読めないと以下が偽の合格になる）',
     /^\d+$/.test(String(HOME_BUILT_TOKEN)), HOME_BUILT_TOKEN);
  for (const f of ['v292Dfix579-tombstone-schema.js', 'v292Dfix587-story-lifecycle.js',
                   'v292Dfix562-backup-inventory.js', 'v292Dfix602-tombstone-write-shadow.js',
                   /* ★fix642 もここへ入れる。出荷で HOME_BUILT を上げるとき、
                      このファイルの cb を上げ忘れたら**テストが落ちる**ようにしておく。 */
                   'v292Dfix642-delete-readback.js']){
    const cb = (HOME.match(new RegExp(f.replace(/\./g, '\\.') + '\\?cb=v292Dfix(\\d+)')) || [])[1];
    ok('★home.html の ' + f + ' の cb が HOME_BUILT と一致（上げ忘れていない）',
       /^\d+$/.test(String(cb)) && cb === HOME_BUILT_TOKEN, { cb: cb, built: HOME_BUILT_TOKEN });
  }
  ok('★HOME_BUILT と version.txt が同値',
     (HOME.match(/HOME_BUILT = '([^']+)'/) || [])[1] === read('version.txt').trim(),
     (HOME.match(/HOME_BUILT = '([^']+)'/) || [])[1]);
  ok('★index.html の BUILT も同値',
     (fs.readFileSync(path.join(__dirname, 'index.html'), 'latin1').match(/var BUILT = '([^']+)'/) || [])[1]
       === read('version.txt').trim());
}

console.log('\n---------------------------------------------');
console.log('test_fix602_home: 合格 ' + pass + ' / 失敗 ' + fail);
console.log('pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
}

main().catch(e => {
  fail++;
  console.log('  FAIL  例外: ' + (e && e.stack || e));
  console.log('pass=' + pass + ' fail=' + fail);
  process.exitCode = 1;
});
