import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
// 不使用全开启夹具：以下每条新档流程都从实际出厂状态开始。
const fresh=(mode='classic')=>G.newGame('渐行',mode,67891);
const act=(s,name,p={})=>{if(s.eventResult&&name!=='ackResult'){const ack=G.perform(s,'ackResult',{id:s.eventResult.id});assert.ok(ack.ok,ack.error);s=ack.state;}const r=G.perform(s,name,p);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<2000;i++)s=G.advance(s,1);assert.ok(!s.activity||s.gameOver);return s;};
const choose=s=>act(s,'choose',{eventId:s.pending.id,index:s.pending.choices.findIndex(c=>!G.choiceBlock(s,c))});
// Existing gameplay flows include the new zero-cost read/confirm step.
const settle=s=>{for(let i=0;(s.pending||s.eventResult)&&i<40;i++){if(s.eventResult){s=act(s,'ackResult',{id:s.eventResult.id});continue;}s=finish(choose(s,s.pending.choices.findIndex(c=>!G.choiceBlock(s,c))));}assert.equal(s.pending,null);assert.equal(s.eventResult,null);return s;};
const deliver=s=>{
  const orders=[...s.orders].sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters);
  const order=orders.find(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));
  assert.ok(order,'应存在可达订单');return settle(finish(act(s,'deliver',{id:order.id})));
};
const reread=s=>G.sanitizeSave(G.clone(s));
const unlockLogs=s=>s.logs.filter(l=>l.tag==='解锁');
const afterClaim=()=>act(deliver(fresh()),'claim',{id:'q1'});
function street(s,duration=0){
  const e=G.EVENTS.find(e=>e.id==='story-street-vein');
  s.flags.firstOrder=true;s.flags.storyStreetVein=true;s.stats.delivered=3;s.claimed=['q1'];
  s.pending={...G.clone(e),id:'progressive-story',templateId:e.id,source:'classic',aiStatus:'skip'};
  if(duration)s.pending.choices[0].duration=duration;
  return s;
}

test('真实新档仅基础导航可用，无功能所有权或免费解锁奖励',()=>{
  const s=fresh();assert.equal(s.schemaVersion,G.VERSION);assert.deepEqual(s.unlockedFeatures,[]);
  for(const p of ['inventory','vehicle','rest','help','character','place'])assert.ok(G.panelUnlocked(s,p));
  for(const p of ['system','cultivation','alchemy','bonds'])assert.equal(G.panelUnlocked(s,p),false);
  assert.equal(G.nextFeatureUnlock(s).id,'system');assert.equal(unlockLogs(s).length,0);
  assert.equal(s.player.money,120);assert.equal(s.alchemy.cauldrons.length,0);
});
test('门槛配置无重名、无缺失前置或循环，入口与规则使用相同标识',()=>{
  const ids=G.FEATURE_UNLOCKS.map(f=>f.id);assert.equal(new Set(ids).size,ids.length);
  const visit=(id,path=[])=>{assert.ok(ids.includes(id));assert.ok(!path.includes(id));for(const p of G.FEATURE_UNLOCKS.find(f=>f.id===id).requires||[])visit(p,[...path,id]);};
  ids.forEach(id=>visit(id));Object.values(G.FEATURE_PANELS).forEach(id=>assert.ok(ids.includes(id)));
  assert.equal(G.featureUnlocked(fresh(),'__proto__'),false);
});
test('未开启时直接调用所有受限指令均失败且原对象、资金、时间和 RNG 不变',()=>{
  for(const [name,p] of [['buy',{id:'qi'}],['sign',{}],['claim',{id:'q1'}],['cultivate',{kind:'breath'}],['cultivate',{kind:'meditate'}],['cultivate',{kind:'body'}],['breakthrough',{}],['explore',{}],['alchemy',{recipe:'heal'}],['cauldron',{}],['formula',{}],['material',{id:'herb'}],['herb',{}],['upgrade',{kind:'speed'}],['visit',{id:'lin'}],['finale',{id:'ordinary'}]]){
    const s=fresh();s.position='market';s.player.money=10000;s.player.coins=10000;s.player.qi=10000;
    const before=JSON.stringify(s),r=G.perform(s,name,p);assert.equal(r.ok,false,name);assert.equal(r.state,s);assert.match(r.error,/尚未开启/);assert.equal(JSON.stringify(s),before);
  }
});
test('首单开始、到达待选、待选读档都不开放系统；实际交付结算后才开放',()=>{
  let s=fresh();const before=JSON.stringify(s);s=act(s,'deliver',{id:s.orders[0].id});
  assert.equal(G.featureUnlocked(s,'system'),false);assert.ok(!JSON.parse(before).activity);
  s=finish(s);assert.equal(s.pending.templateId,'first-order');assert.equal(s.flags.firstOrder,true);
  assert.equal(G.featureUnlocked(reread(s),'system'),false);assert.equal(s.stats.delivered,0);
  s=settle(s);assert.equal(s.stats.delivered,1);assert.ok(s.unlockedFeatures.includes('system'));
  assert.equal(G.featureUnlocked(s,'cultivation'),false);assert.ok(G.panelUnlocked(s,'system'));
});
test('领取首单奖励才开放吐纳，领取本身不开放进阶修行或炼药',()=>{
  const first=deliver(fresh());const at=first.minutes;const s=act(first,'claim',{id:'q1'});
  assert.equal(s.minutes,at);assert.ok(G.featureUnlocked(s,'cultivation'));
  assert.equal(G.nextFeatureUnlock(s).id,'practice');assert.equal(G.featureUnlocked(s,'practice'),false);
  assert.equal(G.featureUnlocked(s,'alchemy'),false);assert.equal(s.alchemy.formulas.length,6);
  assert.equal(G.perform(s,'claim',{id:'q1'}).ok,false);
});
test('首次吐纳途中、中断和途中读档不开放进阶；完成才开放',()=>{
  let s=afterClaim();s=act(s,'cultivate',{kind:'breath'});s=G.advance(s,5);
  assert.equal(G.featureUnlocked(reread(s),'practice'),false);assert.equal(s.stats.trained,0);
  s=act(s,'stop');assert.equal(G.featureUnlocked(s,'practice'),false);
  s=settle(finish(act(s,'cultivate',{kind:'breath'})));
  assert.equal(s.stats.trained,1);assert.ok(s.unlockedFeatures.includes('practice'));
  assert.ok(G.perform(s,'cultivate',{kind:'meditate'}).ok);assert.equal(G.featureBlock(s,'breakthrough'),'');
  s.player.qi=G.realmNeed(s);assert.ok(G.perform(s,'breakthrough').ok);
  s.position='park';assert.equal(G.perform(s,'explore').ok,false);s.unlockedPlaces.push('park');assert.ok(G.perform(s,'explore').ok);
});
test('三单主线待选时不开放炼药，真实新档可连续解锁到炼药',()=>{
  let s=afterClaim();s=deliver(s);
  const order=[...s.orders].sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters)[0];
  s=finish(act(s,'deliver',{id:order.id}));
  for(let i=0;s.pending?.templateId!=='story-street-vein'&&i<4;i++)s=finish(choose(s));
  assert.equal(s.pending.templateId,'story-street-vein');assert.equal(s.stats.delivered,3);
  assert.equal(G.featureUnlocked(s,'alchemy'),false);assert.equal(G.featureUnlocked(reread(s),'alchemy'),false);
  s=settle(s);assert.ok(s.unlockedFeatures.includes('alchemy'));assert.ok(G.panelUnlocked(s,'alchemy'));
  assert.equal(s.alchemy.cauldron,0);assert.equal(s.alchemy.formulas.length,12);
});
test('尚未领取首单奖励时，即使完成三单主线也不能跳过修行前置',()=>{
  let s=street(fresh());s.claimed=[];s=settle(s);
  assert.equal(G.featureUnlocked(s,'alchemy'),false);s=act(s,'claim',{id:'q1'});
  assert.ok(G.featureUnlocked(s,'alchemy'));
});
test('耗时主线到结算才开放炼药，途中存档不提前开放',()=>{
  const e=G.EVENTS.find(e=>e.id==='story-street-vein'),duration=e.choices[0].duration;e.choices[0].duration=10;
  try{
    let s=street(fresh());s=act(s,'choose',{eventId:s.pending.id,index:0});s=G.advance(s,5);
    assert.equal(s.activity.kind,'choice');assert.equal(G.featureUnlocked(s,'alchemy'),false);
    s=reread(s);assert.equal(G.featureUnlocked(s,'alchemy'),false);s=finish(s);assert.ok(G.featureUnlocked(s,'alchemy'));
  }finally{if(duration===undefined)delete e.choices[0].duration;else e.choices[0].duration=duration;}
});
test('同刻房租破产先于剧情完成，不发炼药解锁或完成奖励',()=>{
  const e=G.EVENTS.find(e=>e.id==='story-street-vein'),duration=e.choices[0].duration;e.choices[0].duration=10;
  try{
    let s=street(fresh());s.minutes=6*1440-10;s.player.money=0;
    s=act(s,'choose',{eventId:s.pending.id,index:0});s=G.advance(s,10);
    assert.ok(s.gameOver);assert.ok(!s.unlockedFeatures.includes('alchemy'));
    assert.ok(!reread(s).unlockedFeatures.includes('alchemy'));
  }finally{if(duration===undefined)delete e.choices[0].duration;else e.choices[0].duration=duration;}
});
for(const mode of ['classic','ai'])test(`${mode}模式采用同一玩法进度，不需要 AI 回包才能开启`,()=>{
  const s=act(deliver(fresh(mode)),'claim',{id:'q1'});assert.ok(G.featureUnlocked(s,'cultivation'));assert.equal(s.mode,mode);
});
test('首次遇见任何 NPC 才开放羁绊，不提前暴露其余角色',()=>{
  const s=fresh();assert.equal(G.panelUnlocked(s,'bonds'),false);
  s.bonds.chen.met=true;const before=JSON.stringify(s);assert.ok(G.panelUnlocked(s,'bonds'));assert.equal(JSON.stringify(s),before);
  const a=act(s,'transport',{mode:'walk'});assert.ok(a.unlockedFeatures.includes('bonds'));
  assert.deepEqual(G.visibleNPCs(a).map(n=>n.id),['chen']);assert.equal(G.perform(a,'visit',{id:'lin'}).ok,false);
});
for(const [id,n,action,p] of [['upgrades',5,'upgrade',{kind:'speed'}],['endings',20,'finale',{id:'ordinary'}]])test(`${id}在第 ${n} 单结算边界开放，既有费用/结局条件继续校验`,()=>{
  let s=fresh();s.stats.delivered=n-1;s.unlockedPlaces.push('garage');s.position='garage';s.player.money=1000;
  assert.equal(G.featureUnlocked(s,id),false);assert.equal(G.perform(s,action,p).ok,false);
  s.stats.delivered=n;assert.ok(G.featureUnlocked(s,id));assert.ok(G.perform(s,action,p).ok);
  if(id==='upgrades'){s.position='home';assert.equal(G.perform(s,action,p).ok,false);}
  else{s.player.money=0;assert.equal(G.perform(s,action,p).ok,false);}
});
test('完整配送 5 单可解锁升级，不依赖随机结识修车 NPC',()=>{
  let s=afterClaim();for(let i=1;i<5;i++)s=deliver(s);
  assert.equal(s.stats.delivered,5);assert.ok(s.unlockedFeatures.includes('upgrades'));
});
test('主线仅显示已领取与下一篇，直接构造后续领取不能绕过',()=>{
  let s=fresh();s.stats.delivered=100;s.player.realm=5;
  assert.deepEqual(G.visibleQuests(s).map(q=>q.id),['q1']);const before=JSON.stringify(s);
  assert.equal(G.perform(s,'claim',{id:'q2'}).ok,false);assert.equal(JSON.stringify(s),before);
  s=act(s,'claim',{id:'q1'});assert.deepEqual(G.visibleQuests(s).map(q=>q.id),['q1','q2']);
  s=act(s,'claim',{id:'q2'});assert.deepEqual(G.visibleQuests(s).map(q=>q.id),['q1','q2','q3']);
});
test('开局低资源可基础自救；维修默认开放，搬家还需地点解锁',()=>{
  let s=fresh();s.player.stamina=10;s.player.health=30;s.vehicle.battery=0;
  assert.ok(G.perform(s,'rest').ok);assert.ok(G.perform(s,'use',{id:'heal'}).ok);
  assert.ok(G.perform(s,'transport',{mode:'walk'}).ok);assert.ok(G.perform(s,'charge').ok);
  s.position='garage';s.vehicle.durability=50;assert.ok(G.perform(s,'repair').ok);
  s.position='home';s.player.stamina=100;s.transport='walk';assert.ok(G.perform(s,'sleep').ok);
  assert.equal(G.perform(s,'moveHome',{id:'qiyun'}).ok,false);s.unlockedPlaces.push('stop-3');assert.ok(G.perform(s,'moveHome',{id:'qiyun'}).ok);
  s.player.money=0;assert.ok(G.perform(s,'rest').ok);assert.ok(G.perform(s,'transport',{mode:'walk'}).ok);
});
test('属性、物品与大境界本身不能替代新档里程碑',()=>{
  const s=fresh();s.player.realm=5;s.player.qi=999;s.player.coins=999;s.alchemy.cauldron=24;s.alchemy.xp=999;
  G.syncFeatureUnlocks(s);assert.deepEqual(s.unlockedFeatures,[]);
});
test('读取解锁提示/渲染查询不改变原状态、随机数或日志',()=>{
  const s=afterClaim(),before=JSON.stringify(s);
  for(let i=0;i<25;i++){for(const f of G.FEATURE_UNLOCKS)G.featureUnlocked(s,f.id);G.nextFeatureUnlock(s);G.visibleQuests(s);G.panelUnlocked(s,'alchemy');}
  assert.equal(JSON.stringify(s),before);
});
test('解锁只写一次日志，不改变金钱、分钟、随机数或物品，不自动买鼎',()=>{
  const s=fresh();s.stats.delivered=1;const before=G.clone(s);G.syncFeatureUnlocks(s);
  assert.equal(unlockLogs(s).length,1);for(const key of ['player','inventory','alchemy'])assert.deepEqual(s[key],before[key]);
  assert.equal(s.minutes,before.minutes);assert.equal(s.seed,before.seed);
  G.syncFeatureUnlocks(s);assert.equal(unlockLogs(s).length,1);
  const restored=reread(s);assert.equal(unlockLogs(restored).length,1);
});
test('已开启功能永久保存；花光钱、用完物品和信任下降不重新锁定',()=>{
  let s=afterClaim();s.bonds.lin.met=true;s=act(s,'transport',{mode:'walk'});const known=[...s.unlockedFeatures];
  s.player.coins=0;s.player.money=0;s.inventory={};s.bonds.lin.trust=0;
  s=reread(s);for(const id of known)assert.ok(G.featureUnlocked(s,id));
});
test('v9无经历新档不全开；旧修行、药鼎丹方与改装按证据恢复',()=>{
  let s=fresh();s.schemaVersion=9;delete s.unlockedFeatures;assert.deepEqual(reread(s).unlockedFeatures,[]);
  s.alchemy.formulas=['heal'];s.alchemy.cauldron=1;s.alchemy.cauldrons=[1];s.vehicle.levels.speed=2;s.stats.trained=1;
  const before=JSON.stringify(s),a=reread(s);assert.equal(JSON.stringify(s),before);
  for(const id of ['system','cultivation','practice','alchemy','upgrades'])assert.ok(a.unlockedFeatures.includes(id),id);
  assert.equal(a.minutes,s.minutes);assert.deepEqual(a.alchemy.formulas,['heal']);assert.equal(a.vehicle.levels.speed,2);
  assert.ok(!a.unlockedFeatures.includes('endings'));assert.ok(!a.unlockedFeatures.includes('bonds'));
});
test('v9炼药途中迁移保持已付材料与进度，恢复相关入口不重复结算',()=>{
  let s=fresh();s.unlockedFeatures=['alchemy'];G.syncFeatureUnlocks(s,true);s.unlockedPlaces.push('market');s.position='market';s.player.money=1000;
  s=act(s,'cauldron',{id:1});s.alchemy.formulas=['heal'];const recipe=G.alchemyRecipe('heal');
  for(const [id,n] of Object.entries(recipe.materials))s.inventory[id]=n;
  s=G.advance(act(s,'alchemy',{recipe:'heal'}),5);s.schemaVersion=9;delete s.unlockedFeatures;
  const a=reread(s);assert.ok(a.unlockedFeatures.includes('alchemy'));assert.equal(a.activity.elapsed,s.activity.elapsed);
  assert.deepEqual(a.inventory,s.inventory);assert.equal(a.player.money,s.player.money);assert.equal(a.alchemy.brews,s.alchemy.brews);
});
test('新格式所有权严格白名单去重，前置入口补齐，不因未知键崩溃',()=>{
  const s=fresh();s.unlockedFeatures=['alchemy','alchemy','__proto__',123,null];const a=reread(s);
  assert.deepEqual(new Set(a.unlockedFeatures),new Set(['alchemy','cultivation','system']));
  for(const raw of [null,{},'system']){s.unlockedFeatures=raw;assert.deepEqual(reread(s).unlockedFeatures,[]);}
});
test('v9存储键显式迁移；新键空列表不会复活旧档；多存档所有权隔离',()=>{
  const mem={data:new Map(),getItem(k){return this.data.get(k)??null;},setItem(k,v){this.data.set(k,v);}};
  const a=afterClaim(),b=fresh();a.schemaVersion=9;delete a.unlockedFeatures;
  mem.setItem('night-courier:saves:v9',JSON.stringify({schemaVersion:9,saves:[a,b]}));const store=G.createStore(mem);store.load();
  assert.equal(store.saves.length,2);assert.ok(store.saves[0].unlockedFeatures.includes('cultivation'));
  assert.deepEqual(store.saves[1].unlockedFeatures,[]);assert.ok(mem.getItem(G.STORAGE_KEY));
  mem.setItem(G.STORAGE_KEY,JSON.stringify({schemaVersion:10,saves:[]}));assert.deepEqual(G.createStore(mem).load(),[]);
});
test('三种丹方渠道和获得条件不受入口解锁影响，隐藏方仍不能直接开炉',()=>{
  const s=afterClaim();s.unlockedFeatures.push('alchemy');s.unlockedPlaces.push('market');s.position='market';
  const candidates=G.formulaMarketCandidates(s);assert.ok(candidates.every(r=>r.acquisition.type==='shop'));
  const recipe=G.ALCHEMY_RECIPES.find(r=>!s.alchemy.formulas.includes(r.id));const r=G.perform(s,'alchemy',{recipe:recipe.id});
  assert.equal(r.ok,false);assert.match(r.error,/尚未获得丹方/);assert.ok(!r.error.includes(recipe.name));
});
