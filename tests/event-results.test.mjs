import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const deliveries=G.EVENTS.filter(e=>e.kind==='delivery');
const act=(s,name,p={})=>{const r=G.perform(s,name,p);assert.ok(r.ok,r.error);return r.state;};
const ack=s=>act(s,'ackResult',{id:s.eventResult.id});
const read=s=>G.sanitizeSave(G.clone(s));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(id='first-order',delivery=true){
  const s=G.newGame('回执','classic',34119),e=G.EVENTS.find(e=>e.id===id);
  s.flags.firstOrder=true;s.player.money=500;s.player.stamina=70;s.player.mana=40;s.player.health=70;
  s.position='clinic';s.orders=[];
  s.pending={...G.clone(e),id:'receipt-fixture',templateId:e.id,source:'classic',aiStatus:'skip'};
  if(delivery)s.pending.delivery={id:'receipt-ticket',title:'结果校验餐',target:'clinic',desc:'当面交付',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc:'lin'};
  return s;
}
function choose(s,index=0){return act(s,'choose',{eventId:s.pending.id,index});}
function finish(s){return s.activity?G.advance(s,G.activityRemaining(s)+20):s;}
function gameplay(s){const copy=G.clone(s);delete copy.eventResult;delete copy.revision;delete copy.updatedAt;return copy;}
const change=(result,key,delivery=false)=>(delivery?result.delivery.changes:result.changes).find(x=>x.key===key)?.delta||0;

test('60 个配送事件共 180 个独立选项；ID、标题唯一；每个都有结果与无资源成本出路',()=>{
  assert.equal(deliveries.length,60);assert.equal(deliveries.reduce((n,e)=>n+e.choices.length,0),180);
  assert.equal(new Set(G.EVENTS.map(e=>e.id)).size,G.EVENTS.length);
  assert.equal(new Set(deliveries.map(e=>e.title)).size,60);
  for(const e of deliveries){
    assert.equal(e.choices.length,3);assert.equal(new Set(e.choices.map(c=>c.result)).size,3);
    for(const c of e.choices){assert.ok(c.label.trim()&&c.result.trim());assert.notEqual(c.label,c.result);assert.ok(c.result.length<=600);for(const k of Object.keys(c.effects))assert.ok(Object.hasOwn(G.effectNames,k));}
    const s=fixture(e.id);s.player.money=s.player.coins=s.player.stamina=s.player.mana=0;
    assert.ok(e.choices.some(c=>!G.choiceBlock(s,c)),e.id);
  }
});
for(const e of deliveries)for(let index=0;index<3;index++)test(`${e.id} / 选项 ${index+1}：结果、耗时存续、配送与一次性确认`,()=>{
  const original=fixture(e.id),frozen=G.clone(original),c=original.pending.choices[index];
  let s=choose(original,index);assert.deepEqual(original,frozen);
  if(c.duration){
    assert.equal(s.eventResult,null);assert.equal(s.stats.delivered,0);assert.equal(s.unlockedPlaces.includes('clinic'),false);
    s=G.advance(s,c.duration/2);s=read(s);assert.equal(s.eventResult,null);assert.equal(s.stats.delivered,0);
    s=G.advance(s,c.duration/2+50);near(s.minutes,original.minutes+c.duration);
  }else near(s.minutes,original.minutes);
  assert.equal(s.eventResult.title,e.title);assert.equal(s.eventResult.choice,c.label);assert.equal(s.eventResult.text,c.result);
  assert.equal(s.stats.delivered,1);assert.equal(s.eventResult.delivery.target,'clinic');
  assert.equal(change(s.eventResult,'player.money',true),30);assert.equal(change(s.eventResult,'player.coins',true),2);
  assert.equal(s.eventResult.changes.some(x=>!G.eventResultLabel(x.key)),false);
  assert.equal(s.unlockedPlaces.includes('clinic'),true);
  const settled=read(s);assert.deepEqual(settled.eventResult,s.eventResult);assert.deepEqual(G.advance(settled,100),settled);
  for(const name of ['choose','deliver','rest','buy','sign','stop']){const bad=G.perform(settled,name,{eventId:original.pending.id,index});assert.equal(bad.ok,false);assert.equal(bad.state,settled);}
  const id=settled.eventResult.id,before=gameplay(settled),done=ack(settled);
  assert.deepEqual(gameplay(done),before);assert.equal(done.eventResult,null);
  assert.equal(G.perform(done,'ackResult',{id}).ok,false);assert.equal(G.perform(done,'choose',{eventId:original.pending.id,index}).ok,false);
});

test('结果展示实际封顶值，选择与配送各自计数，不把模板奖励当到账金额',()=>{
  const s=fixture('coin');s.player.money=9999998;s.player.coins=999999;s.player.rep=100;s.player.qi=999999;
  const out=choose(s,0),r=out.eventResult;
  assert.equal(change(r,'player.coins'),0);assert.equal(change(r,'player.qi'),0);
  assert.equal(change(r,'player.money',true),1);assert.equal(change(r,'player.coins',true),0);assert.equal(change(r,'player.rep',true),0);
});
test('耗时选择扣费与跨午夜房租分离，读档后不重复扣钱',()=>{
  let s=fixture('letter',false);s.minutes=8640-2;s.player.money=150;
  const e=G.EVENTS.find(e=>e.id==='delivery-spare-chopsticks');s.pending={...G.clone(e),id:'receipt-rent',templateId:e.id,source:'classic',aiStatus:'skip'};
  s=choose(s,1);assert.equal(s.player.money,144);s=G.advance(s,2);assert.equal(s.player.money,24);s=read(s);s=finish(s);
  assert.equal(change(s.eventResult,'player.money'),-6);assert.equal(s.player.money,24);assert.equal(s.eventResult.delivery,null);
  const done=ack(s);assert.equal(done.player.money,24);
});
test('现金不足交租时不生成成功结果、不交付、不解锁',()=>{
  let s=fixture('last-bus');s.minutes=8640-5;s.player.money=119;s=choose(s,0);s=G.advance(s,100);
  assert.equal(s.gameOver.reason,'rent');assert.equal(s.stats.delivered,0);assert.equal(s.eventResult,null);assert.equal(s.unlockedPlaces.includes('clinic'),false);
});
test('第三单结果不会被主线覆盖；确认只显露已排队主线，不重复注入或发奖励',()=>{
  let s=fixture();s.stats.delivered=2;s.claimed=['q1'];s=choose(s);
  assert.equal(s.eventResult.title,'第一声「叮」');assert.equal(s.pending.templateId,'story-street-vein');
  const copy=read(s);assert.equal(copy.eventResult.text,s.eventResult.text);assert.equal(copy.pending.templateId,'story-street-vein');
  const seed=copy.seed,turn=copy.turn,done=ack(copy);assert.equal(done.seed,seed);assert.equal(done.turn,turn);assert.equal(done.pending.id,copy.pending.id);
  const next=choose(done);assert.equal(next.eventResult.title,'地图上多出来的一条线');assert.equal(next.pending,null);
  assert.ok(G.featureUnlocked(next,'alchemy'));
});
test('物品付出和人物好感/信任按实际变化显示，章节不在确认时再次推进',()=>{
  let s=fixture('first-order',false);s.position='clinic';s.bonds.lin={met:true,affinity:99,trust:99,stage:2,path:'none',lastTalkDay:0};
  const [title,text,...choices]=G.NPCS.find(n=>n.id==='lin').arc[2];s.inventory.heal=1;
  s.pending={id:'receipt-npc',kind:'social',title,text,choices:G.clone(choices),npcId:'lin',npcAdvance:true,source:'classic',aiStatus:'skip'};
  s=choose(s,1);assert.equal(s.inventory.heal,0);assert.equal(change(s.eventResult,'item.heal'),-1);
  assert.equal(change(s.eventResult,'bond.lin.affinity'),1);assert.equal(change(s.eventResult,'bond.lin.trust'),1);assert.equal(s.bonds.lin.stage,3);
  s=ack(read(s));assert.equal(s.bonds.lin.stage,3);assert.equal(s.inventory.heal,0);
});
test('探索和修炼选择同样提供结果，不伪造配送回执',()=>{
  for(const e of G.EVENTS.filter(e=>['cultivation','explore'].includes(e.kind))){const s=finish(choose(fixture(e.id,false)));assert.equal(s.eventResult.text,e.choices[0].result);assert.equal(s.eventResult.delivery,null);assert.equal(read(s).eventResult.title,e.title);}
});
test('AI 结果沿用已校验文本；迟到回复无法覆盖已结算结果',()=>{
  let s=fixture('rain');s.mode='ai';s.pending.aiStatus='unrequested';
  const ai={title:'另一个雨夜',text:'门口有人等候。',choices:[{label:'递饭',result:'饭送到了，雨仍在下。',effects:{qi:5}},{label:'赠水',result:'客人接过水。',effects:{money:-3,karma:2}},{label:'道别',result:'门里的灯亮着。',effects:{rep:1}}]};
  s=G.applyAIEvent(s,s.pending.id,ai);const id=s.pending.id;s=choose(s);
  assert.equal(s.eventResult.source,'ai');assert.equal(s.eventResult.text,ai.choices[0].result);assert.equal(G.applyAIEvent(s,id,ai),s);assert.equal(G.fallbackAI(s,id,'late'),s);
  assert.deepEqual(read(s).eventResult,s.eventResult);
});
test('旧 v12 的待选事件与耗时选项迁移，不伪造旧事件回执或补发奖励',()=>{
  let s=fixture('last-bus');s.schemaVersion=12;delete s.eventResult;const original=read(s);assert.equal(original.eventResult,null);assert.equal(original.pending.id,s.pending.id);
  s=choose(original,0);s=G.advance(s,2);s.schemaVersion=12;delete s.eventResult;const midway=read(s);assert.equal(midway.eventResult,null);assert.equal(midway.activity.elapsed,2);
  const out=finish(midway);assert.equal(out.stats.delivered,1);assert.equal(out.eventResult.text,G.EVENTS.find(e=>e.id==='last-bus').choices[0].result);
});
test('损坏回执拒绝整档，显示字段白名单丢弃注入效果；多档各自保存',()=>{
  const s=choose(fixture());
  for(const mutate of [r=>delete r.eventResult,r=>r.eventResult.text='',r=>r.eventResult.at++,r=>r.eventResult.changes=[{key:'realm',delta:5}],r=>r.eventResult.changes=[{key:'player.money',delta:Infinity}],r=>r.eventResult.delivery.target='temple']){const x=G.clone(s);mutate(x);assert.throws(()=>read(x));}
  const injected=G.clone(s);injected.eventResult.effects={money:900};injected.eventResult.delivery.reward=900;
  const clean=read(injected);assert.equal(clean.eventResult.effects,undefined);assert.equal(clean.eventResult.delivery.reward,undefined);assert.equal(clean.player.money,s.player.money);
  const other=G.newGame('另一份旅程');assert.equal(other.eventResult,null);ack(s);assert.notEqual(s.eventResult,null);
});
test('v12 存储键迁入 v13，保留原文；损坏结果不静默覆盖',()=>{
  class Memory{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
  const memory=new Memory(),legacy=fixture();legacy.pending=null;legacy.schemaVersion=12;delete legacy.eventResult;
  const raw=JSON.stringify({version:12,saves:[legacy]});memory.setItem('night-courier:saves:v12',raw);
  const store=G.createStore(memory);store.load();assert.equal(store.saves.length,1);assert.equal(store.saves[0].schemaVersion,13);assert.equal(store.saves[0].eventResult,null);assert.equal(memory.getItem('night-courier:saves:v12'),raw);
  const broken=choose(fixture());broken.eventResult.changes=[{key:'illegal',delta:1}];const bad=JSON.stringify({version:13,saves:[broken]});memory.setItem(G.STORAGE_KEY,bad);
  const fail=G.createStore(memory);fail.load();assert.ok(fail.warning);assert.equal(memory.getItem(G.STORAGE_KEY),bad);
});
test('选择造成气血耗尽仍先阅读结果，之后才沿路救助',()=>{
  let s=fixture('first-order',false);s.mode='ai';s.player.health=1;s.pending.aiStatus='unrequested';
  s=G.applyAIEvent(s,s.pending.id,{title:'试探灵息',text:'气息忽然紊乱。',choices:[{label:'试探',result:'你感到一阵眩晕，路人开始呼救。',effects:{health:-10}},{label:'停下',result:'气息平复了。',effects:{}},{label:'退开',result:'你避开了紊流。',effects:{}}]});
  s=choose(s);assert.equal(s.activity.kind,'rescue');assert.ok(s.eventResult);assert.equal(G.advance(s,100),s);s=read(s);s=ack(s);const moved=G.advance(s,1);assert.ok(moved.minutes>s.minutes);
});
