import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const fresh=()=>Object.assign(G.newGame('问道','classic',123456),{
  unlockedFeatures:G.FEATURE_UNLOCKS.map(f=>f.id),unlockedPlaces:G.PLACES.map(p=>p.id)
});
const read=s=>G.sanitizeSave(G.clone(s));
const act=(s,action,p={})=>{const r=G.perform(s,action,p);assert.ok(r.ok,r.error);return r.state;};
// The seed is controlled only in this test fixture, immediately before the real completion boundary.
const outcome=(s,success=true)=>{
  s=G.advance(s,G.activityRemaining(s)-.25);
  assert.equal(s.activity.kind,'breakthrough');s.orderRefreshAt=s.minutes+15;
  for(let seed=1;seed<200000;seed++){
    const copy={seed},roll=G.rand(copy)*100;
    if(success?roll<35:roll>=95){s.seed=seed;break;}
  }
  return G.advance(s,.25);
};
const oldMortal=(level,version=12)=>{
  const s=fresh();s.schemaVersion=version;s.player.realmLevel=level;delete s.player.mortalProgress;
  return s;
};
const oldBreak=(level,version=12)=>{
  const s=oldMortal(level,version),need=version<7?80:Math.round(80*(5+level)/90);
  s.player.qi=23;s.player.stamina=70;
  s.activity={kind:'breakthrough',params:{realm:0,realmLevel:level,need,chance:63,pillTier:1},target:null,
    phase:'work',duration:60,elapsed:17.5,startedAt:s.minutes-17.5,route:null,travelled:0,recovery:{},gainedQi:0};
  return s;
};

test('十个境界、82个阶段，凡人单境界且仅渡劫封顶',()=>{
  assert.deepEqual(G.REALMS.map(r=>r.name),['凡人','炼气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫']);
  assert.equal(G.REALMS.reduce((n,r)=>n+r.levels,0),82);
  assert.equal(G.realmLevelCount(0),1);assert.ok(G.REALMS.slice(1).every(r=>r.levels===9));
  assert.deepEqual(G.REALMS.filter(r=>r.terminal).map(r=>r.name),['渡劫']);
  const s=fresh();assert.equal(G.realmLabel(s),'凡人');assert.equal(G.nextRealmLabel(s),'炼气一重');assert.equal(G.realmNeed(s),80);
  s.player.realmLevel=9;assert.equal(G.realmLabel(s),'凡人');assert.equal(G.realmLevel(s),1);
});
test('凡人突破60分钟后直接进入炼气一重，保留原大境奖励',()=>{
  let s=fresh();s.player.qi=100;const before=G.clone(s);s=act(s,'breakthrough');
  assert.deepEqual(before.player.qi,100);assert.equal(s.minutes,before.minutes);assert.equal(s.player.realm,0);
  assert.equal(s.player.qi,20);assert.equal(s.player.stamina,80);assert.equal(s.activity.duration,60);
  s=outcome(s);assert.equal(G.realmLabel(s),'炼气一重');assert.equal(s.player.qi,20);
  assert.equal(s.player.insight,6);assert.equal(s.player.constitution,6);assert.equal(s.player.agility,6);
  assert.equal(s.player.mortalProgress,0);assert.equal(s.minutes,before.minutes+60);
});
test('凡人修为或体力不足、满级突破均原子拒绝，不消耗丹药或随机源',()=>{
  for(const [realm,level,qi,stamina] of [[0,1,79.99,100],[0,1,80,19.99],[9,9,9999,200]]){
    const s=fresh();Object.assign(s.player,{realm,realmLevel:level,qi,stamina});s.inventory.foundation=1;
    const before=G.clone(s),r=G.perform(s,'breakthrough',{usePill:true});
    assert.equal(r.ok,false);assert.equal(r.state,s);assert.deepEqual(s,before);
    if(realm===9)assert.match(r.error,/渡劫九重/);
  }
});
test('凡人失败退回约75%修为，仍为凡人；中断不返还本次投入',()=>{
  const s=fresh();s.player.qi=80;const pending=act(s,'breakthrough');
  const failed=outcome(pending,false);assert.equal(G.realmLabel(failed),'凡人');assert.equal(failed.player.qi,60);
  assert.equal(failed.player.health,82);assert.equal(failed.player.mortalProgress,0);
  const stopped=act(G.advance(pending,25),'stop');assert.equal(stopped.player.qi,0);assert.equal(stopped.player.mortalProgress,0);
});
test('全部82阶段可沿真实突破行动逐阶到达，门槛、标签与封顶一致',()=>{
  let s=fresh(),count=1,lastRank=G.realmRank(s);s.player.money=999999;
  while(!G.realmAtMax(s)){
    const label=G.nextRealmLabel(s),need=G.realmNeed(s),before={realm:s.player.realm,level:G.realmLevel(s)};
    assert.ok(need>0&&Number.isFinite(need));Object.assign(s.player,{qi:need,stamina:G.limits(s).stamina});
    s=outcome(act(s,'breakthrough'));assert.equal(G.realmLabel(s),label);assert.equal(s.player.qi,0);
    assert.ok(G.realmRank(s)>lastRank);lastRank=G.realmRank(s);
    assert.equal(s.player.realm,before.level===G.realmLevelCount(before.realm)?before.realm+1:before.realm);
    s=read(s);assert.equal(G.realmLabel(s),label);count++;assert.ok(count<=82);
  }
  assert.equal(count,82);assert.equal(G.realmLabel(s),'渡劫九重');assert.equal(G.realmNeed(s),0);assert.equal(G.nextRealmLabel(s),null);
});
test('化神九重不再封顶，新境界门槛逐境递增且概率有界',()=>{
  const s=fresh();s.player.realm=5;s.player.realmLevel=9;
  assert.equal(G.nextRealmLabel(s),'炼虚一重');assert.equal(G.realmAtMax(s),false);assert.equal(G.realmNeed(s),249);
  for(let realm=1;realm<G.REALMS.length;realm++)for(let level=1;level<=9;level++){
    Object.assign(s.player,{realm,realmLevel:level});assert.ok(G.breakChance(s)>=35&&G.breakChance(s)<=95);
    if(realm>1&&level<9){const previous=G.clone(s);previous.player.realm--;assert.ok(G.realmNeed(s)>G.realmNeed(previous));}
  }
});
test('炼气及以上保留原属性上限，不受凡人重数删除影响',()=>{
  const s=fresh();
  for(let realm=1;realm<=9;realm++)for(let level=1;level<=9;level++){
    Object.assign(s.player,{realm,realmLevel:level});const rank=realm*9+level-1,cap=G.limits(s);
    assert.equal(cap.health,100+Math.floor(rank*12/9));assert.equal(cap.stamina,100+Math.floor(rank*8/9));assert.equal(cap.mana,60+Math.floor(rank*16/9));
  }
});
test('v7–v12凡人各重合并，已成功投入抵扣且余额、时间和物品不重复改变',()=>{
  for(let version=7;version<=12;version++)for(let level=1;level<=9;level++){
    const old=oldMortal(level,version);old.player.qi=123.5;old.player.money=456;
    const raw=G.clone(old),a=read(old),b=read(a);
    assert.deepEqual(old,raw);assert.equal(a.player.realmLevel,1);assert.equal(G.realmLabel(a),'凡人');
    assert.equal(a.player.mortalProgress,G.LEGACY_MORTAL_PROGRESS[level-1]);assert.equal(G.realmNeed(a),80-a.player.mortalProgress);
    assert.equal(a.player.qi,123.5);assert.equal(a.minutes,old.minutes);assert.equal(a.player.money,456);assert.deepEqual(a.inventory,old.inventory);
    assert.deepEqual(b.player,a.player);assert.equal(b.logs.filter(l=>l.tag==='存档').length,1);
  }
});
test('旧凡人九重仅需原剩余12修为进入炼气，不重复赠送修为',()=>{
  let s=oldMortal(9);s.player.qi=12;s=read(s);assert.equal(G.realmNeed(s),12);
  s=outcome(act(s,'breakthrough'));assert.equal(G.realmLabel(s),'炼气一重');assert.equal(s.player.qi,0);assert.equal(s.player.mortalProgress,0);
  assert.equal(G.realmNeed(s),12);assert.deepEqual(read(s).player,s.player);
});
test('v1–v6凡人没有虚构旧小重抵扣，仍完整投入80修为',()=>{
  for(let version=1;version<=6;version++){
    const old=oldMortal(1,version);delete old.player.realmLevel;const a=read(old);
    assert.equal(G.realmLabel(a),'凡人');assert.equal(a.player.mortalProgress,0);assert.equal(G.realmNeed(a),80);
  }
});
test('v7–v12炼气至化神的九重均原样保留，化神九重可继续修炼',()=>{
  for(let version=7;version<=12;version++)for(let realm=1;realm<=5;realm++)for(let level=1;level<=9;level++){
    const s=fresh();s.schemaVersion=version;s.player.realm=realm;s.player.realmLevel=level;delete s.player.mortalProgress;
    const a=read(s);assert.equal(a.player.realm,realm);assert.equal(a.player.realmLevel,level);assert.equal(a.player.mortalProgress,0);
    assert.equal(G.realmAtMax(a),false);assert.deepEqual(read(a).player,a.player);
  }
});
test('旧凡人途中小重突破保持进度、投入与概率，成功后只抵扣原投入',()=>{
  for(let level=1;level<=8;level++){
    const old=oldBreak(level),first=read(old),again=read(first);
    assert.deepEqual(again.activity,first.activity);assert.equal(first.activity.elapsed,17.5);assert.equal(first.activity.params.chance,63);
    assert.equal(first.activity.params.need,old.activity.params.need);assert.equal(first.activity.params.pillTier,1);
    assert.equal(first.player.qi,23);assert.equal(first.player.stamina,70);assert.deepEqual(first.inventory,old.inventory);
    const s=outcome(again);assert.equal(G.realmLabel(s),'凡人');assert.equal(s.player.mortalProgress,G.LEGACY_MORTAL_PROGRESS[level]);
    assert.equal(s.player.qi,23);assert.equal(s.minutes,old.minutes+42.5);assert.equal(s.activity,null);assert.deepEqual(read(s).player,s.player);
  }
});
test('旧凡人途中小重失败、中断不增加抵扣，失败仅返还原投入约75%',()=>{
  for(const level of [1,5,8]){
    const old=oldBreak(level),s=read(old),need=old.activity.params.need,progress=s.player.mortalProgress;
    const failed=outcome(s,false);assert.equal(failed.player.mortalProgress,progress);assert.equal(failed.player.qi,23+need-Math.floor(need*.25));
    assert.equal(failed.player.health,82);assert.equal(G.realmLabel(failed),'凡人');
    const stopped=act(s,'stop');assert.equal(stopped.player.mortalProgress,progress);assert.equal(stopped.player.qi,23);
    assert.equal(G.realmNeed(stopped),80-progress);assert.deepEqual(read(stopped).player,stopped.player);
  }
});
test('旧凡人九重途中突破与v5大境突破均可重复读档并直接进入炼气',()=>{
  for(const [level,version] of [[9,12],[1,5]]){
    const old=oldBreak(level,version);if(version===5){delete old.player.realmLevel;delete old.activity.params.realmLevel;delete old.activity.params.need;}
    const first=read(old),again=read(first);assert.deepEqual(first.activity,again.activity);
    const done=outcome(again);assert.equal(G.realmLabel(done),'炼气一重');assert.equal(done.player.qi,23);assert.equal(done.player.mortalProgress,0);
  }
});
test('旧v5炼气大境突破预算保留，迁移后多次保存仍可完成',()=>{
  let s=fresh();s.schemaVersion=5;s.player.realm=1;delete s.player.realmLevel;delete s.player.mortalProgress;
  s.activity={...oldBreak(1,5).activity,params:{realm:1,chance:63}};
  s=read(s);assert.equal(s.player.realmLevel,9);assert.equal(s.activity.params.need,180);assert.equal(s.activity.params.legacyMajorBudget,true);
  assert.deepEqual(read(s).activity,s.activity);s=outcome(read(s));assert.equal(G.realmLabel(s),'筑基一重');
});
test('新境界及使用九阶破境丹的途中存档保持原投入、时间与概率',()=>{
  let s=fresh();s.player.realm=6;s.player.realmLevel=9;s.player.qi=1000;s.inventory[G.pillItemId('foundation',9)]=1;
  s=act(s,'breakthrough',{usePill:true});s=G.advance(s,20.25);const a=read(s);
  assert.deepEqual(a.activity,s.activity);assert.deepEqual(a.inventory,s.inventory);assert.deepEqual(a.player,s.player);assert.equal(a.minutes,s.minutes);
  assert.equal(G.realmLabel(outcome(a)),'合体一重');
});
test('非法新重数、越界境界、抵扣及不匹配的旧途中状态均拒绝',()=>{
  for(const edits of [{realm:0,realmLevel:2},{realm:10},{realm:6.5},{realm:1,realmLevel:10},{realm:1,realmLevel:1.5},{mortalProgress:80},{mortalProgress:NaN},{realm:1,mortalProgress:5}]){
    const s=fresh();Object.assign(s.player,edits);assert.throws(()=>read(s),/境界|重数|抵扣/);
  }
  const old=oldBreak(4);old.activity.params.realmLevel=3;assert.throws(()=>read(old),/突破境界/);
  const wrong=read(oldBreak(4));wrong.activity.params.need++;assert.throws(()=>read(wrong),/突破投入/);
  wrong.activity.params.need--;wrong.activity.params.legacyMortalLevel=2;assert.throws(()=>read(wrong),/衔接/);
  const forged=act(Object.assign(fresh(),{player:{...fresh().player,qi:80}}),'breakthrough');forged.activity.params.legacyMajorBudget=true;
  assert.throws(()=>read(forged),/衔接/);
});
test('房租终局仍先于新境界突破或旧凡人衔接，不能提前晋升或抵扣',()=>{
  for(const legacy of [false,true]){
    let s=legacy?read(oldBreak(4)):fresh();if(!legacy){s.player.realm=6;s.player.realmLevel=9;s.player.qi=999;s=act(s,'breakthrough');}
    s.minutes=6*1440-1;s.orderRefreshAt=6*1440+14;s.player.money=0;s.activity.elapsed=59;s.activity.startedAt=s.minutes-59;
    const before=G.clone(s.player);s=G.advance(s,1);assert.equal(s.gameOver.reason,'rent');assert.deepEqual(s.player,before);
  }
});
test('旧凡人小重抵扣保留旧版修行入口，但不提前开放现代新档功能',()=>{
  const old=oldMortal(3,9);old.unlockedFeatures=[];old.stats.trained=0;const a=read(old);
  assert.ok(G.featureUnlocked(a,'cultivation'));assert.ok(G.featureUnlocked(a,'practice'));
  assert.equal(G.featureUnlocked(G.newGame('新旅程'),'practice'),false);
});
test('v12本地键迁至v14保留原文，多档独立，新键为空不复活旧记录',()=>{
  const a=oldMortal(9),b=oldMortal(2);const original=JSON.stringify({schemaVersion:12,saves:[a,b]});
  const values=new Map([['night-courier:saves:v12',original]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
  const store=G.createStore(storage),saves=store.load();assert.equal(G.STORAGE_KEY,'night-courier:saves:v14');
  assert.equal(values.get('night-courier:saves:v12'),original);assert.deepEqual(saves.map(s=>s.player.mortalProgress),[68,5]);
  assert.deepEqual(G.createStore(storage).load().map(s=>s.player.mortalProgress),[68,5]);
  values.set(G.STORAGE_KEY,JSON.stringify({schemaVersion:13,saves:[]}));assert.deepEqual(G.createStore(storage).load(),[]);
});
