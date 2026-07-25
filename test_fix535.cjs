/* 回帰テスト: v292Dfix535 — 引用直後の「反応している人」を話者にしない
 * 実行: node test_fix535.cjs
 * 由来: 2026-07-25 の実機プレイで捕獲した誤帰属(テスト物語 sms063dyz8l ターン2)。
 *       ケースは GPT監査が指定した必須テストに対応。 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+(x!==undefined?('  >> '+JSON.stringify(x)):''));} };

function env(off){
  const store={}; if(off) store['v292Dfix535Off']='1';
  const ls={getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},
    key:i=>Object.keys(store)[i],get length(){return Object.keys(store).length;}};
  const el={querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},appendChild(){},
    removeChild(){},setAttribute(){},insertBefore(){},style:{},classList:{add(){},remove(){},contains:()=>false}};
  const doc={hidden:false,documentElement:el,body:el,head:el,querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener(){},getElementById:()=>null,
    createElement:()=>({style:{},setAttribute(){},addEventListener(){},appendChild(){},classList:{add(){},remove(){}},querySelectorAll:()=>[],querySelector:()=>null})};
  const w={localStorage:ls,document:doc,console:{log(){},warn(){}},setTimeout:()=>0,setInterval:()=>0,
    clearTimeout(){},clearInterval(){},MutationObserver:function(){return{observe(){},disconnect(){}};},
    navigator:{userAgent:'node'}};
  w.window=w; return w;
}
function run(narr, cards, off){
  const w=env(off);
  w.S={cast:{hero:{name:'アリア・リュミエール',desc:''},
       npcs:[{name:'カエデ',desc:''},{name:'ノア',desc:''},{name:'ヒナ',desc:''}]},
       turns:[{narrative:'導入',playerText:'',_convSays:[]},
              {narrative:narr,playerText:'',inputType:'STORY',_convSays:cards.map(c=>({who:c[0],say:c[1]}))}],
       save(){}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'v292Dfix469-speaker-score.js'),'utf8'),vm.createContext(w),{filename:'fix469'});
  w.__v292Dfix469.repair();
  return w.S.turns[1]._convSays.map(c=>c.who);
}

// --- 1) 実機で捕獲した本番ケース ---------------------------------------
const REAL = [
'カエデは門のプレートから指を離さないまま、口を開いた。',
'「……この場所については、記録がほとんど残っていない」',
'彼女の声は平坦だ。だが指先が文字の溝をなぞる動きは、一度だけ止まった。',
'「強いて言えば、十年前に忽然と閉園した遊園地、という程度。公式の理由は経営難だったはず」',
'「はず」という言葉に、アリアは引っかかりを覚える。カエデにしては曖昧な言い回しだ。'
].join('\n');
const RC = [['カエデ','……この場所については、記録がほとんど残っていない'],
            ['カエデ','強いて言えば、十年前に忽然と閉園した遊園地、という程度。公式の理由は経営難だったはず']];
console.log('\n== fix535: 実機で捕獲した誤帰属 ==');
{
  const r=run(REAL,RC);
  ok('★カエデの2台詞が両方カエデのまま', r[0]==='カエデ'&&r[1]==='カエデ', r);
  const o=run(REAL,RC,true);
  ok('OFF時は従来どおり反転する(退行できる)', o[1]==='アリア・リュミエール', o);
}

console.log('\n== fix535: 本物の後置話者は従来どおり効く ==');
{
  const n='「行こう」\nアリアは言った。';
  const r=run(n,[['カエデ','行こう']]);
  ok('「行こう」アリアは言った → アリアへ正しく振替', r[0]==='アリア・リュミエール', r);
}
{
  const n='「違う」\nカエデが答えた。';
  const r=run(n,[['ノア','違う']]);
  ok('「違う」カエデが答えた → カエデへ正しく振替', r[0]==='カエデ', r);
}

console.log('\n== fix535: 反応文では振り替えない ==');
{
  const n='「まだ早い」\nその言葉に、アリアは驚いた。';
  const r=run(n,[['カエデ','まだ早い']]);
  ok('その言葉に、アリアは驚いた → アリアへflipしない', r[0]==='カエデ', r);
}
{
  const n='「行こう」\n自分の言葉に、アリアは驚いた。';
  const r=run(n,[['カエデ','行こう']]);
  ok('自分の言葉に、アリアは驚いた → 反応文だけではflipしない', r[0]==='カエデ', r);
}
{
  const n='「本当にそう思うの」\nその問いに、ノアは考え込んだ。';
  const r=run(n,[['ヒナ','本当にそう思うの']]);
  ok('その問いに、ノアは考え込んだ → ノアへflipしない', r[0]==='ヒナ', r);
}
{
  const n='「聞こえた？」\nカエデの声に、アリアは振り返った。';
  const r=run(n,[['カエデ','聞こえた？']]);
  ok('Xの声に、Yは振り返った → Yへflipしない', r[0]==='カエデ', r);
}

console.log('\n== fix535: 弱い後置主語でタグ付きカードを覆さない ==');
{
  const n='「そこにいるのは誰」\nアリアは一歩下がった。';
  const r=run(n,[['ヒナ','そこにいるのは誰']]);
  ok('裸の「名前＋は」だけではflipしない(subj=40 < HARD)', r[0]==='ヒナ', r);
}

console.log('\n---------------------------------------------');
console.log('PASS '+pass+' / FAIL '+fail);
process.exit(fail?1:0);
