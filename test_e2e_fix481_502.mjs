// 合成E2E(GPT指定③): 実ファイルをindex.html順(475→478→476→481)で読込み、
// 全候補不合格の合成502が最外殻fix481経由でも成功Responseへ変換されないことを検証。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let pass=0, fail=0; const F=[];
const ok=(c,n,d)=>{ c?(pass++,console.log('  ok  -',n)):(fail++,F.push(n),console.log('  FAIL-',n,d||'')); };

const store=new Map([['v292Dfix476OnV1','1'],['v292Dfix481OnV1','1'],['v292ProxyUrl','https://novel-proxy.example.workers.dev']]);
const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i]??null,get length(){return store.size;}};
const genBodies=[]; let inspN=0;
const inner=function(url,init){
  const u=String(url);
  if(u.includes('/inspect')){ inspN++; return Promise.resolve({ok:true,json:()=>Promise.resolve({results:[{pass:false,score:0,hard:{anime_style:false},hardFails:1}]})}); }
  const body=JSON.parse(String(init.body)); genBodies.push(body);
  return Promise.resolve({ok:true,clone(){return{json:()=>Promise.resolve({data:[{b64_json:'B64_'+body.seed}]})};},body:{cancel(){}}});
};
const sb={console:{log:()=>{},warn:()=>{},error:()=>{}},localStorage,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},
  document:{readyState:'complete',addEventListener:()=>{},getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{},setAttribute:()=>{}}),body:{appendChild:()=>{}},head:{appendChild:()=>{}}},
  MutationObserver:class{observe(){}disconnect(){}}, S:{cfg:{artStyle:6}}};
sb.window=sb; sb.globalThis=sb; sb.fetch=inner;
vm.createContext(sb);
for(const f of ['v292Dfix475-recipe-v3.js','v292Dfix478-imggen-retry.js','v292Dfix476-pipeline.js','v292Dfix481-provider-switch.js'])
  vm.runInContext(readFileSync(f,'utf8'),sb,{filename:f});

const TAIL=sb.__v292Dfix475 && sb.__v292Dfix475.STYLE6_TAIL;
ok(!!TAIL,'fix475実ファイルがarm(STYLE6_TAIL取得)');
ok(sb.fetch.__v292Dfix481===true,'最外殻=fix481');
const prompt='anime portrait of a test woman, long black hair, '+TAIL;
const resp=await sb.fetch('https://gen.pollinations.ai/v1/images/generations',{method:'POST',body:JSON.stringify({prompt,seed:900})});
const lr=sb.__v292Dfix476.lastRun;
ok(resp && resp.ok!==true && resp.status===502,'全滅502が最外殻経由でも成功Responseへ変換されない (status='+(resp&&resp.status)+')');
ok(lr && lr.fallback==='all-fail-no-adopt' && lr.picked===null,'fix476: no-adopt確定 (fallback='+(lr&&lr.fallback)+')');
ok(genBodies.length===6 && genBodies.every(b=>b.imgProvider==='pollinations'),'fix481のimgProvider付与が全候補(6)へ伝播');
ok(inspN===6,'検品6回(1枚ずつ)');
ok(Array.isArray(lr.failedCandidates)&&lr.failedCandidates.length===6,'候補6件保持');
console.log('==== E2E: pass='+pass+' fail='+fail+' ===='); if(fail){console.log(F.join('\n'));process.exit(1);}
