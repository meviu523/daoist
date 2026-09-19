import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const fresh=(mode='classic')=>G.newGame('传方',mode,789);
const act=(s,action,payload={})=>{const r=G.perform(s,action,payload);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&i<200;i++)s=G.advance(s,1);assert.equal(s.activity,null);return s;};
const copy=s=>G.sanitizeSave(G.clone(s));
const ofType=type=>G.ALCHEMY_RECIPES.filter(r=>r.acquisition.type===type);
const ofStory=source=>ofType('story').filter(r=>source.quest?r.acquisition.quest===source.quest:r.acquisition.event===source.event);
function storyPending(s,source){
  const e=G.EVENTS.find(e=>e.id===source.event);
  s.flags[source.flag]=true;
  s.pending={...G.clone(e),id:'story-formula-test',templateId:e.id,source:'classic',aiStatus:'skip'};
  return s;
}
const learned=s=>new Set(s.alchemy.formulas);
const bondRecipes=id=>ofType('bond').filter(r=>r.acquisition.npc===id);

test('108 张丹方唯一归属剧情/羁绊/商店，各 36 张；每类丹药各三张',()=>{
  assert.equal(G.ALCHEMY_RECIPES.length,108);
  assert.equal(new Set(G.ALCHEMY_RECIPES.map(r=>r.id)).size,108);
  for(const type of ['story','bond','shop']){
    assert.equal(ofType(type).length,36);
    for(const p of G.PILL_TYPES)assert.equal(ofType(type).filter(r=>r.product===p.id).length,3);
  }
  for(const source of G.FORMULA_STORY_SOURCES){
    assert.equal(ofStory(source).length,6);
    assert.ok(source.quest?G.QUESTS.some(q=>q.id===source.quest):G.EVENTS.some(e=>e.id===source.event&&e.flag===source.flag));
  }
});
test('新档没有丹方，不因等级、药鼎、熟练度自动学会',()=>{
  let s=fresh();s.player.realm=5;s.alchemy.xp=999;s.alchemy.cauldron=24;
  s=act(s,'sign');assert.deepEqual(s.alchemy.formulas,[]);
});
test('商店买齐 36 张也不会取得专属丹方，再买不扣钱、不推进时间或 RNG',()=>{
  let s=fresh();s.position='market';s.player.realm=5;s.player.money=100000;
  const at=s.minutes,initial=s.player.money,cost=G.formulaScrollCost(s);
  while(G.formulaMarketCandidates(s).length)s=act(s,'formula');
  assert.equal(s.alchemy.formulas.length,36);assert.ok(s.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.type==='shop'));
  assert.equal(s.player.money,initial-36*cost);assert.equal(s.minutes,at);
  const before=JSON.stringify(s),r=G.perform(s,'formula');assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),before);
});
test('商店保留境界门槛；现金不足、未到场、指定专属 ID 均原子失败',()=>{
  let s=fresh();s.position='market';s.player.money=10000;
  assert.ok(G.formulaMarketCandidates(s).every(r=>r.realm===0&&r.acquisition.type==='shop'));
  for(const payload of [{id:ofType('story')[0].id},{recipe:ofType('bond')[0].id}]){
    const before=JSON.stringify(s),r=G.perform(s,'formula',payload);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),before);
  }
  s.player.money=0;assert.equal(G.perform(s,'formula').ok,false);
  s.player.money=10000;s.position='home';assert.equal(G.perform(s,'formula').ok,false);
});
test('首单委托必须领取，领取时送六张剧情方；重复领取不重复发',()=>{
  let s=fresh();s.stats.delivered=1;
  assert.equal(act(s,'sign').alchemy.formulas.length,0);
  const before=JSON.stringify(s);const a=act(s,'claim',{id:'q1'});assert.equal(JSON.stringify(s),before);
  assert.equal(a.alchemy.formulas.length,6);assert.equal(a.minutes,s.minutes);
  assert.ok(a.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.quest==='q1'));
  assert.equal(G.perform(a,'claim',{id:'q1'}).ok,false);assert.deepEqual(copy(a).alchemy.formulas,a.alchemy.formulas);
});
for(const source of G.FORMULA_STORY_SOURCES.filter(x=>x.event))test(`剧情完成后发方，待选/读档不提前发：${source.label}`,()=>{
  const s=storyPending(fresh('ai'),source),ids=ofStory(source).map(r=>r.id);
  assert.ok(ids.every(id=>!learned(copy(s)).has(id)));
  const blocked=G.perform(s,'choose',{eventId:s.pending.id,index:9});assert.equal(blocked.ok,false);assert.equal(blocked.state,s);
  const done=act(copy(s),'choose',{eventId:s.pending.id,index:0});
  assert.ok(ids.every(id=>learned(done).has(id)));assert.equal(done.alchemy.formulas.length,6);
  assert.equal(done.minutes,s.minutes);assert.equal(done.alchemy.xp,s.alchemy.xp);
  assert.equal(G.perform(done,'choose',{eventId:s.pending.id,index:0}).ok,false);
  const reread=copy(done);assert.deepEqual(reread.alchemy.formulas,done.alchemy.formulas);
  assert.equal(reread.logs.filter(l=>l.tag==='炼药').length,done.logs.filter(l=>l.tag==='炼药').length);
});
test('自然触发主线时只弹剧情，实际选择后才发丹方',()=>{
  let s=fresh();s.flags.firstOrder=true;s.stats.delivered=3;
  s=finish(act(s,'rest'));assert.equal(s.pending.templateId,'story-street-vein');assert.deepEqual(s.alchemy.formulas,[]);
  s=act(s,'choose',{eventId:s.pending.id,index:0});assert.equal(s.alchemy.formulas.length,6);
});
test('耗时剧情选择只在结束时发方，中途读档不提前领取',()=>{
  const source=G.FORMULA_STORY_SOURCES[1],event=G.EVENTS.find(e=>e.id===source.event);
  const old=event.choices[0].duration;event.choices[0].duration=10;
  try{
    let s=storyPending(fresh(),source);s=act(s,'choose',{eventId:s.pending.id,index:0});
    assert.equal(s.activity.kind,'choice');assert.deepEqual(s.alchemy.formulas,[]);
    s=copy(G.advance(s,5));assert.deepEqual(s.alchemy.formulas,[]);
    s=finish(s);assert.equal(s.alchemy.formulas.length,6);
  }finally{if(old===undefined)delete event.choices[0].duration;else event.choices[0].duration=old;}
});
test('房租破产先于同刻剧情完成，不能拿到该段丹方',()=>{
  const source=G.FORMULA_STORY_SOURCES[1],event=G.EVENTS.find(e=>e.id===source.event);
  const old=event.choices[0].duration;event.choices[0].duration=10;
  try{
    let s=storyPending(fresh(),source);s.minutes=6*1440-10;s.player.money=0;
    s=act(s,'choose',{eventId:s.pending.id,index:0});s=G.advance(s,10);
    assert.ok(s.gameOver);assert.deepEqual(s.alchemy.formulas,[]);assert.deepEqual(copy(s).alchemy.formulas,[]);
  }finally{if(old===undefined)delete event.choices[0].duration;else event.choices[0].duration=old;}
});
for(const npc of G.NPCS)test(`${npc.name}分三次传方，每次两张；不绑定情感路线`,()=>{
  let s=fresh();const bond=s.bonds[npc.id];bond.met=true;
  for(const [i,m] of G.FORMULA_BOND_MILESTONES.entries()){
    bond.stage=m.stage;bond.trust=m.trust-1;
    assert.equal(copy(s).alchemy.formulas.length,i*2);
    bond.trust=m.trust;s=copy(s);
    assert.equal(s.alchemy.formulas.length,(i+1)*2);
    assert.ok(s.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.npc===npc.id));
    // sanitizeSave creates a new state; update the current bond for the next milestone.
    Object.assign(bond,s.bonds[npc.id]);s.bonds[npc.id]=bond;
  }
  assert.equal(s.bonds[npc.id].path,'none');assert.equal(G.formulaBondProgress(s,npc.id).next,null);
  assert.deepEqual(copy(s).alchemy.formulas,s.alchemy.formulas);
});
test('高好感不能替代信任和人物章节；未结识人物没有传方进度',()=>{
  const s=fresh();assert.equal(G.formulaBondProgress(s,'lin'),null);
  s.bonds.lin.affinity=100;s.bonds.lin.trust=100;
  assert.equal(act(s,'sign').alchemy.formulas.length,0);
  s.bonds.lin.met=true;assert.equal(act(s,'sign').alchemy.formulas.length,0);
  s.bonds.lin.stage=4;s.bonds.lin.trust=0;assert.equal(act(s,'sign').alchemy.formulas.length,0);
});
test('实际拜访只弹人物章节，选择结算后才得到传方',()=>{
  let s=fresh();s.position='clinic';s.bonds.lin.met=true;
  s=finish(act(s,'visit',{id:'lin'}));assert.ok(s.pending.npcAdvance);assert.deepEqual(s.alchemy.formulas,[]);
  s=act(s,'choose',{eventId:s.pending.id,index:s.pending.choices.findIndex(c=>c.effects.trust>=3)});assert.equal(s.bonds.lin.stage,1);
  assert.equal(s.alchemy.formulas.length,2);assert.ok(s.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.npc==='lin'));
});
test('信任下降不会收回已学丹方，再达标不会重复发',()=>{
  let s=fresh();Object.assign(s.bonds.lin,{met:true,stage:4,trust:100});s=copy(s);
  assert.equal(s.alchemy.formulas.length,6);s.bonds.lin.trust=0;const low=copy(s);assert.deepEqual(low.alchemy.formulas,s.alchemy.formulas);
  low.bonds.lin.trust=100;assert.deepEqual(copy(low).alchemy.formulas,s.alchemy.formulas);
});
test('已获得不等于可炼制，羁绊传方仍校验炼药能力',()=>{
  let s=fresh();Object.assign(s.bonds.lin,{met:true,stage:4,trust:100});s=copy(s);
  const recipe=bondRecipes('lin').at(-1);assert.ok(G.alchemyHasFormula(s,recipe));assert.equal(G.alchemyQualified(s,recipe),false);
  const before=JSON.stringify(s);assert.equal(G.perform(s,'alchemy',{recipe:recipe.id}).ok,false);assert.equal(JSON.stringify(s),before);
});
test('隐藏丹方的错误提示不泄露名称',()=>{
  const s=fresh();for(const recipe of G.ALCHEMY_RECIPES){const r=G.perform(s,'alchemy',{recipe:recipe.id});assert.equal(r.ok,false);assert.ok(!r.error.includes(recipe.name));}
});
test('旧档已购的专属方保留，过去已完成剧情/羁绊的奖励只补一次',()=>{
  let s=fresh();const id=ofType('bond')[0].id;s.alchemy.formulas=[id];s.flags.storyStreetVein=true;
  Object.assign(s.bonds.chen,{met:true,stage:2,trust:9});const raw=JSON.stringify(s);const a=copy(s);
  assert.equal(JSON.stringify(s),raw);assert.ok(a.alchemy.formulas.includes(id));assert.equal(a.alchemy.formulas.length,11);
  assert.deepEqual(copy(a).alchemy.formulas,a.alchemy.formulas);assert.equal(copy(a).logs.length,a.logs.length);
});
test('所有专属奖励均可确定取得；多存档之间不共享所有权',()=>{
  const a=fresh(),b=fresh();a.claimed=['q1'];for(const source of G.FORMULA_STORY_SOURCES)if(source.flag)a.flags[source.flag]=true;
  for(const bond of Object.values(a.bonds))Object.assign(bond,{met:true,stage:4,trust:100});
  const got=copy(a);assert.equal(got.alchemy.formulas.length,72);assert.ok(got.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.type!=='shop'));
  assert.deepEqual(b.alchemy.formulas,[]);
});
