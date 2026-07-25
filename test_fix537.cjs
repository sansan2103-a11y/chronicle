/* 回帰テスト: v292Dfix537 — 名乗りで同一性が確定した時だけ別名を記録する
 * 由来: 2026-07-25 の実機30ターン試験。同一人物が「少女」と「シオン」に分裂して残っていた。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+(x!==undefined?('  >> '+JSON.stringify(x)):''));} };

function mk(ledger, turns, off, cast){
  const store={}; if(off) store['v292Dfix537Off']='1';
  if(ledger) store['v292Dfix277Quasi']=JSON.stringify(ledger);
  const ls={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},
    key:i=>Object.keys(store)[i],get length(){return Object.keys(store).length;}};
  const el={querySelectorAll:()=>[],addEventListener(){},appendChild(){},setAttribute(){},style:{}};
  const doc={hidden:false,documentElement:el,body:el,querySelectorAll:()=>[],addEventListener(){},
    createElement:()=>({style:{},setAttribute(){},addEventListener(){}})};
  const w={localStorage:ls,document:doc,console:{log(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,
    clearTimeout(){},clearInterval(){},MutationObserver:function(){return{observe(){},disconnect(){}};},
    navigator:{userAgent:'node'}};
  w.window=w;
  w.S={cast:cast||{hero:{name:'アリア・リュミエール'},npcs:[{name:'カエデ'},{name:'ノア'},{name:'ヒナ'}]},
       turns:new Array(turns||9).fill(0).map(()=>({narrative:'',_convSays:[]})), save(){}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'v292Dfix277-quasi-pack.js'),'utf8'),vm.createContext(w),{filename:'fix277'});
  return w;
}
const L1 = () => ({ '少女': { seen:[5,7,8], last:8, ali:[] } });
const NAMING = '<say who="シオン">シオンっていうんだ……たぶん</say>';

console.log('\n== fix537: 名乗りで同一性が確定したときだけ紐づける ==');
{
  const w=mk(L1(),9); const q=w.__v292QuasiPack;
  q.detectSelfNaming(NAMING, 9);
  const st=q.store();
  ok('★「少女」が「シオン」の別名として記録される', (st['シオン']&&st['シオン'].ali||[]).indexOf('少女')>=0, st['シオン']);
  ok('別名解決が効く(少女→シオン)', q.aliasFix('少女')==='シオン', q.aliasFix('少女'));
  ok('登場実績が引き継がれる', (st['シオン'].seen||[]).indexOf(5)>=0 && (st['シオン'].seen||[]).indexOf(8)>=0, st['シオン'].seen);
}
{
  const w=mk(L1(),9,true); const q=w.__v292QuasiPack;
  q.detectSelfNaming(NAMING, 9);
  ok('OFF時は何もしない(退行できる)', !q.store()['シオン'], Object.keys(q.store()));
}

console.log('\n== fix537: 統合してはいけないケース ==');
{
  // 記述的な仮呼称が2つ = 曖昧
  const w=mk({'少女':{seen:[5],last:8,ali:[]}, '白い少女':{seen:[6],last:8,ali:[]}},9);
  const q=w.__v292QuasiPack; q.detectSelfNaming(NAMING,9);
  ok('記述呼称が2つあるときは統合しない(曖昧)', !q.store()['シオン'], Object.keys(q.store()));
}
{
  // 記述的でない固有名は対象外
  const w=mk({'ミナ':{seen:[5,7,8],last:8,ali:[]}},9);
  const q=w.__v292QuasiPack; q.detectSelfNaming(NAMING,9);
  ok('固有名(ミナ)は記述呼称ではないので統合しない', !(q.store()['シオン']&&(q.store()['シオン'].ali||[]).length), q.store()['シオン']);
}
{
  // 登録キャストは絶対に統合しない
  const w=mk({'少女':{seen:[5,7,8],last:8,ali:[]}},9,false,
    {hero:{name:'アリア・リュミエール'},npcs:[{name:'シオン'},{name:'カエデ'}]});
  const q=w.__v292QuasiPack; q.detectSelfNaming(NAMING,9);
  ok('登録キャスト宛には別名を作らない', !q.store()['シオン'], Object.keys(q.store()));
}
{
  // 既に何ターンも出ている名前(初出でない)は対象外
  const w=mk({'少女':{seen:[5,7,8],last:8,ali:[]}, 'シオン':{seen:[2,3,4],last:4,ali:[]}},9);
  const q=w.__v292QuasiPack; q.detectSelfNaming(NAMING,9);
  ok('初出でない名前では統合しない', (q.store()['シオン'].ali||[]).indexOf('少女')<0, q.store()['シオン']);
}
{
  // 名乗りでない台詞では統合しない
  const w=mk(L1(),9); const q=w.__v292QuasiPack;
  q.detectSelfNaming('<say who="シオン">シオンを探してるの</say>', 9);
  ok('名乗りでない台詞(「シオンを探してるの」)では統合しない', !(q.store()['シオン']&&(q.store()['シオン'].ali||[]).length), q.store()['シオン']);
}
{
  // 記述呼称が古い(3ターン超前)なら見送り
  const w=mk({'少女':{seen:[1,2],last:2,ali:[]}},9);
  const q=w.__v292QuasiPack; q.detectSelfNaming(NAMING,9);
  ok('記述呼称が3ターン超前なら統合しない', !(q.store()['シオン']&&(q.store()['シオン'].ali||[]).length), q.store()['シオン']);
}
{
  // 別の名乗り表現も拾う
  const w=mk(L1(),9); const q=w.__v292QuasiPack;
  q.detectSelfNaming('<say who="シオン">私はシオン。ここの子だった</say>', 9);
  ok('「私はシオン」型も拾う', (q.store()['シオン'].ali||[]).indexOf('少女')>=0, q.store()['シオン']);
}

console.log('\n---------------------------------------------');
console.log('PASS '+pass+' / FAIL '+fail);
process.exit(fail?1:0);
