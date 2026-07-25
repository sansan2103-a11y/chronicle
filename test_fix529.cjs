/* 回帰テスト: v292Dfix529 — 別物語のキャラをキャラ一覧に出さない
 * 実行: node test_fix529.cjs
 * 実データ形状: 離島16ターン(smr8p8wfr8b)へ廃墟遊園地の人物が混入していた実例を再現。
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
let pass=0,fail=0;
function ok(n,c,x){ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+(x!==undefined?('  >> '+JSON.stringify(x)):''));} }

function makeEnv(seed){
  const store=Object.assign({},seed||{});
  const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},
    key:i=>Object.keys(store)[i],get length(){return Object.keys(store).length;}};
  const el={querySelectorAll:()=>[],querySelector:()=>null,addEventListener:()=>{},appendChild:()=>{},
    removeChild:()=>{},setAttribute:()=>{},insertBefore:()=>{},style:{},classList:{add(){},remove(){},contains(){return false;}}};
  const document={hidden:false,documentElement:el,body:el,head:el,
    querySelectorAll:()=>[],querySelector:()=>null,addEventListener:()=>{},
    getElementById:()=>null,
    createElement:()=>({style:{},setAttribute:()=>{},addEventListener:()=>{},appendChild:()=>{},
      classList:{add(){},remove(){}},querySelectorAll:()=>[],querySelector:()=>null})};
  const w={localStorage,document,console:{log(){},warn(){}},
    setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},
    MutationObserver:function(){return{observe(){},disconnect(){}};},navigator:{userAgent:'node'}};
  w.window=w; return w;
}
function load(w,file){ vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),vm.createContext(w),{filename:file}); return w; }

// 離島の物語(16ターン)。本文に出るのは登録キャストだけ。
const turns=[];
for(let i=0;i<16;i++) turns.push({narrative:'涼太は桟橋を歩いた。大浦 源蔵が網を繕っている。',playerText:'',
  _convSays:[{who:'霧 涼太',say:'船は出るのか'},{who:'大浦 源蔵',say:'今日は無理だ'}]});
// 途中で本物の未登録キャラが1人だけ登場する
turns[14].narrative='民宿の女将が茶を出した。';
turns[14]._convSays=[{who:'民宿の女将',say:'ゆっくりしていき'}];

function run(off){
  const w=makeEnv(off?{'v292Dfix529Off':'1'}:{});
  // 長期記憶(worldinfo)に「この物語の人物」と「別物語の人物」を混ぜて置く
  w.__longmem={raw:{loadWorldInfo:()=>[
    {name:'民宿の女将',type:'character',desc:'白髪の女将'},
    {name:'ノア',type:'character',desc:'廃墟遊園地の少年'},
    {name:'ヒナ',type:'character',desc:'廃墟遊園地の少女'},
    {name:'観覧車の少女',type:'character',desc:'色白の少女'},
    {name:'長身の怪異',type:'character',desc:'孤児院の管理番号の焼印'}
  ]}};
  load(w,'v292Dfix145-charlist.js');
  w.S={cast:{hero:{name:'霧 涼太',desc:''},npcs:[{name:'大浦 源蔵',desc:''},{name:'真鍋 ひかり',desc:''}]},turns:turns,save(){}};
  return w.__v292Dfix145x.collectChars();
}

console.log('\n== fix529: 別物語のキャラを一覧に出さない ==');
const on=run(false);
const names=on.story.map(s=>s.name);
ok('別物語の4人が一覧から消える', ['ノア','ヒナ','観覧車の少女','長身の怪異'].every(n=>names.indexOf(n)<0), names);
ok('この物語に実在する未登録キャラは残る', names.indexOf('民宿の女将')>=0, names);
ok('主人公は必ず表示される', on.hero && on.hero.name==='霧 涼太', on.hero);
ok('登録NPCは未登場でも必ず表示される(真鍋 ひかり)', on.npcs.map(n=>n.name).indexOf('真鍋 ひかり')>=0, on.npcs.map(n=>n.name));
ok('残った物語キャラは全員 lastTurn>=0', on.story.every(s=>s.lastTurn>=0), on.story.map(s=>s.name+':'+s.lastTurn));

const off=run(true);
const offNames=off.story.map(s=>s.name);
ok('OFF時は従来どおり別物語のキャラも出る(退行できる)', offNames.indexOf('ノア')>=0 && offNames.indexOf('観覧車の少女')>=0, offNames);

console.log('\n== fix529b: 表示用の存在証拠を別名・区切り構成要素まで広げる ==');
{
  function run2(){
    const w=makeEnv();
    w.__longmem={raw:{loadWorldInfo:()=>[
      {name:'氷川 杏子',type:'character',desc:'民俗学者'},      // 本文は「杏子」だけ
      {name:'観覧車の少女',type:'character',desc:'色白の少女'},  // 区切り無し=対象外(既知の制約)
      {name:'ノア',type:'character',desc:'別物語の少年'}          // 完全な別物語
    ]}};
    load(w,'v292Dfix145-charlist.js');
    w.S={cast:{hero:{name:'霧 涼太',desc:''},npcs:[]},
      turns:[{narrative:'杏子は古い記録を繰った。少女が柵の上にいる。',playerText:'',_convSays:[]}],save(){}};
    return w.__v292Dfix145x.collectChars();
  }
  const r=run2(); const names=r.story.map(s=>s.name);
  ok('★空白区切りの名だけで書かれた人物は一覧に残る(氷川 杏子)', names.indexOf('氷川 杏子')>=0, names);
  ok('別物語のキャラは消えたまま(ノア)', names.indexOf('ノア')<0, names);
  ok('区切りの無い名詞句は既知の制約どおり非表示(観覧車の少女)', names.indexOf('観覧車の少女')<0, names);
  const a=r.story.filter(s=>s.name==='氷川 杏子')[0];
  ok('別名で見つかった最終登場ターンが採用される', a && a.lastTurn===0, a && a.lastTurn);
}

console.log('\n== fix533: 短縮名の部分文字列誤爆を止める(GPT監査) ==');
{
  function run3(narr, extraCS){
    const w=makeEnv();
    w.__longmem={raw:{loadWorldInfo:()=>[
      {name:'氷川 杏子',type:'character',desc:'民俗学者'},
      {name:'アン・マリー',type:'character',desc:'旅人'},
      {name:'白鷺 少女',type:'character',desc:'謎の人物'}
    ]}};
    load(w,'v292Dfix145-charlist.js');
    w.S={cast:{hero:{name:'霧 涼太',desc:''},npcs:[]},
      turns:[{narrative:narr,playerText:'',_convSays:extraCS||[]}],save(){}};
    return w.__v292Dfix145x.collectChars().story.map(s=>s.name);
  }
  ok('★「杏子色の空」では氷川 杏子を存在扱いしない', run3('杏子色の空が広がる。').indexOf('氷川 杏子')<0, run3('杏子色の空が広がる。'));
  ok('★「アンテナ」ではアン・マリーを存在扱いしない', run3('錆びたアンテナが立っている。').indexOf('アン・マリー')<0, run3('錆びたアンテナが立っている。'));
  ok('★「少女像」では白鷺 少女を存在扱いしない', run3('苔むした少女像がある。').indexOf('白鷺 少女')<0, run3('苔むした少女像がある。'));
  ok('「杏子は…」なら存在扱いする', run3('杏子は記録を繰った。').indexOf('氷川 杏子')>=0, run3('杏子は記録を繰った。'));
  ok('「アンが…」なら存在扱いする', run3('アンが振り返る。').indexOf('アン・マリー')>=0, run3('アンが振り返る。'));
  ok('会話ログの話者と完全一致なら無条件で存在扱いする',
     run3('誰かが囁いた。',[{who:'杏子',say:'ここにいる'}]).indexOf('氷川 杏子')>=0,
     run3('誰かが囁いた。',[{who:'杏子',say:'ここにいる'}]));
  ok('行末の出現も存在扱いする', run3('振り返るとそこにいたのは杏子').indexOf('氷川 杏子')>=0, run3('振り返るとそこにいたのは杏子'));
}

console.log('\n---------------------------------------------');
console.log('PASS '+pass+' / FAIL '+fail);
process.exit(fail?1:0);
