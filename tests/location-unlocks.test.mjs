import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
// Genuine factory state: no blanket unlocks in these tests. Targeted tickets isolate settlement from RNG.
const fresh=(mode='classic',seed=12345)=>G.newGame('识路',mode,seed);
const act=(s,name,p={})=>{if(s.eventResult&&name!=='ackResult'){const ack=G.perform(s,'ackResult',{id:s.eventResult.id});assert.ok(ack.ok,ack.error);s=ack.state;}const r=G.perform(s,name,p);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<2000;i++)s=G.advance(s,Math.min(1,Math.max(1e-7,G.activityRemaining(s))));assert.ok(!s.activity||s.gameOver);return s;};
const choose=(s,index=0)=>act(s,'choose',{eventId:s.pending.id,index});
// Existing gameplay flows include the new zero-cost read/confirm step.
const settle=s=>{for(let i=0;(s.pending||s.eventResult)&&i<40;i++){if(s.eventResult){s=act(s,'ackResult',{id:s.eventResult.id});continue;}s=finish(choose(s,s.pending.choices.findIndex(c=>!G.choiceBlock(s,c))));}assert.equal(s.pending,null);assert.equal(s.eventResult,null);return s;};
const read=s=>G.sanitizeSave(G.clone(s));
const ticket=(s,target='market')=>{
  const o={id:`location-${s.turn}-${target}`,target,title:'认识一条新街',desc:'送到这里。',condition:'ordinary',expiresAt:s.minutes+36,reward:30,coins:2,npc:G.NPCS.find(n=>n.place===target)?.id||null};
  s.orders=[o];return o;
};
const arrive=(s,target='market')=>{const o=ticket(s,target);return finish(act(s,'deliver',{id:o.id}));};
const timedDelivery=s=>{const event=G.EVENTS.find(e=>e.id==='last-bus');s.pending={...G.clone(event),id:s.pending.id,templateId:event.id,source:'classic',aiStatus:'skip',delivery:s.pending.delivery};return s;};
const discoveryLogs=s=>s.logs.filter(l=>l.tag==='地点');
const reject=(s,action,p={})=>{const before=JSON.stringify(s),r=G.perform(s,action,p);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),before);return r.error;};

test('真实新档只拥有出租屋和修车点；地点和住宅查询不修改状态',()=>{
  const s=fresh(),before=JSON.stringify(s);assert.deepEqual(s.unlockedPlaces,['home','garage']);
  assert.deepEqual(G.visibleServicePlaces(s).map(p=>p.id),['home','garage']);assert.deepEqual(G.visibleResidences(s).map(h=>h.id),['qingteng']);
  for(const id of ['market','park','__proto__',null,123])assert.equal(G.placeUnlocked(s,id),false);
  assert.equal(JSON.stringify(s),before);assert.equal(discoveryLogs(s).length,0);
});

test('有订单也不能未经接单自由前往未知地点，失败不花钱、不改种子与时钟',()=>{
  const s=fresh();ticket(s);assert.match(reject(s,'travel',{target:'market'}),/先完成.*外卖/);
  reject(s,'moveHome',{id:'qiyun'});s.bonds.shen.met=true;reject(s,'visit',{id:'shen'});
});

test('接单、途中保存、停止和取消都不授予地点',()=>{
  let s=fresh();const o=ticket(s);s=act(s,'deliver',{id:o.id});assert.deepEqual(s.unlockedPlaces,['home','garage']);
  s=G.advance(s,.3);s=read(s);assert.deepEqual(s.unlockedPlaces,['home','garage']);
  s=act(s,'stop');s=act(s,'cancelDelivery');assert.deepEqual(s.unlockedPlaces,['home','garage']);
  assert.equal(s.stats.delivered,0);assert.equal(discoveryLogs(s).length,0);reject(s,'travel',{target:'market'});
});

test('首次抵达和待选读档仍未解锁，实际结算后才解锁且保留原奖励',()=>{
  const initial=fresh();let s=arrive(initial);assert.equal(s.position,'market');assert.ok(s.pending?.delivery);
  assert.equal(s.stats.delivered,0);assert.equal(G.placeUnlocked(s,'market'),false);
  s=read(s);assert.equal(G.placeUnlocked(s,'market'),false);const cash=s.player.money,oldEvent=s.pending.id;
  s=choose(s);assert.equal(s.stats.delivered,1);assert.equal(s.player.money,cash+30);assert.equal(G.placeUnlocked(s,'market'),true);
  assert.equal(discoveryLogs(s).length,1);assert.equal(read(s).unlockedPlaces.filter(x=>x==='market').length,1);
  reject(s,'choose',{eventId:oldEvent,index:0});assert.deepEqual(initial.unlockedPlaces,['home','garage']);
});

test('耗时配送选项必须实际完成；中段读档不提前授予或重复支付',()=>{
  let s=timedDelivery(arrive(fresh()));s=choose(s);assert.ok(s.activity);s=G.advance(s,2);
  const money=s.player.money;s=read(s);assert.equal(G.placeUnlocked(s,'market'),false);assert.equal(s.player.money,money);
  s=finish(s);assert.equal(G.placeUnlocked(s,'market'),true);assert.equal(s.stats.delivered,1);assert.equal(s.player.money,money+30);
  const restored=read(s);assert.equal(restored.stats.delivered,1);assert.equal(discoveryLogs(restored).length,1);
});

test('送达无事件分支同样解锁；同地点重复配送只记录一次发现',()=>{
  let s=fresh();s.flags.firstOrder=true;
  // Pin the next random outcome only to exercise the non-event branch; restore the original function immediately.
  const random=G.rand;
  try{G.rand=()=>.99;s=arrive(s);}finally{G.rand=random;}
  assert.equal(s.pending,null);assert.equal(G.placeUnlocked(s,'market'),true);assert.equal(s.stats.delivered,1);
  s=settle(arrive(s));assert.equal(s.stats.delivered,2);assert.equal(discoveryLogs(s).length,1);
});

test('已接单中断后可以沿路继续到未知目的地，不会被地点门槛卡死',()=>{
  let s=fresh();const o=ticket(s);s=act(s,'deliver',{id:o.id});s=act(G.advance(s,.2),'stop');
  s=act(s,'travel',{target:'market'});assert.equal(G.placeUnlocked(s,'market'),false);
  s=read(s);s=finish(s);assert.ok(s.pending.delivery);assert.equal(G.placeUnlocked(s,'market'),false);
  s=choose(s);assert.equal(G.placeUnlocked(s,'market'),true);
});

test('地图待接单消失不会变成地点解锁',()=>{
  let s=fresh();const o=ticket(s);s=G.advance(s,40);assert.ok(!s.orders.some(x=>x.id===o.id));
  assert.deepEqual(s.unlockedPlaces,['home','garage']);assert.equal(discoveryLogs(s).length,0);
});

for(const p of G.PLACES.filter(p=>p.permanent&&!G.STARTING_PLACES.includes(p.id)))test(`送达${p.name}后开放常驻入口，路网与坐标不变`,()=>{
  const xy={x:p.x,y:p.y};let s=settle(arrive(fresh(),p.id));assert.ok(G.visibleServicePlaces(s).some(x=>x.id===p.id));
  assert.deepEqual({x:G.place(p.id).x,y:G.place(p.id).y},xy);assert.equal(G.perform(s,'travel',{target:'home'}).ok,true);
  if(G.RESIDENCES.some(h=>h.place===p.id))assert.ok(G.visibleResidences(s).some(h=>h.place===p.id));
});

test('普通住宅送达后保留所有权，但不会变成常驻地图点',()=>{
  let s=settle(arrive(fresh(),'stop-0'));assert.ok(G.placeUnlocked(s,'stop-0'));assert.ok(!G.visibleServicePlaces(s).some(p=>p.id==='stop-0'));
  assert.ok(G.PLACES.find(p=>p.id==='stop-0').permanent===false);
});

test('仅功能已开放不能绕过地点检查；所有本地服务都原子拒绝',()=>{
  const s=fresh();s.unlockedFeatures=G.FEATURE_UNLOCKS.map(f=>f.id);s.player.money=10000;s.player.health=20;s.vehicle.durability=20;
  for(const [place,action,p] of [['clinic','heal',{}],['park','explore',{}],['market','meal',{}],['market','cauldron',{id:1}],['market','formula',{}],['market','herb',{}],['market','material',{id:'herb'}],['market','auctionCatalog',{}],['market','auctionBid',{id:'invalid'}]]){
    s.position=place;assert.match(reject(s,action,p),/尚未解锁/);
  }
});

test('发现长乐集不会跳过炼药或拍卖的独立玩法门槛',()=>{
  const s=settle(arrive(fresh()));assert.ok(G.placeUnlocked(s,'market'));assert.ok(G.featureUnlocked(s,'system'));
  assert.equal(G.featureUnlocked(s,'alchemy'),false);assert.equal(G.featureUnlocked(s,'auction'),false);
  assert.match(reject(s,'cauldron',{id:1}),/尚未开启/);assert.match(reject(s,'auctionCatalog'),/尚未开启/);
});

test('相逢人物、提升关系、领取功能奖励不会间接授予其地点',()=>{
  let s=fresh();s.bonds.shen.met=true;s.bonds.shen.affinity=80;s.stats.delivered=10;s.claimed=['q1'];
  s=act(s,'transport',{mode:'walk'});assert.ok(G.panelUnlocked(s,'bonds'));assert.equal(G.placeUnlocked(s,'bookshop'),false);
  assert.match(reject(s,'visit',{id:'shen'}),/尚未解锁/);assert.deepEqual(s.unlockedPlaces,['home','garage']);
});

test('开局休息、充电、步行和回当前住处睡眠不被探索门槛锁死',()=>{
  const s=fresh();s.vehicle.battery=0;s.player.stamina=0;s.player.health=30;
  for(const action of ['rest','charge','sleep'])assert.ok(G.perform(s,action).ok,action);
  assert.ok(G.perform(s,'transport',{mode:'walk'}).ok);assert.ok(G.perform(s,'use',{id:'heal'}).ok);
});

test('受伤救助仍可到医馆，但救助不算完成外卖、不开放当地服务',()=>{
  let s=fresh();s.player.health=0;s=act(s,'transport',{mode:'walk'});s=finish(s);assert.equal(s.position,'clinic');
  assert.equal(s.stats.delivered,0);assert.equal(G.placeUnlocked(s,'clinic'),false);assert.equal(discoveryLogs(s).length,0);
  s=read(s);assert.equal(G.placeUnlocked(s,'clinic'),false);assert.ok(G.perform(s,'travel',{target:'home'}).ok);
});

test('午夜房租先于耗时交付选项；破产不解锁、不支付配送奖励',()=>{
  let s=timedDelivery(arrive(fresh()));s.minutes=6*1440-5;s.player.money=0;
  s=choose(s);s=G.advance(s,5);assert.equal(s.gameOver?.reason,'rent');assert.equal(s.stats.delivered,0);
  assert.equal(s.player.money,0);assert.equal(G.placeUnlocked(s,'market'),false);assert.equal(discoveryLogs(s).length,0);
  assert.equal(G.placeUnlocked(read(s),'market'),false);
});

test('AI文本不能授予地点；只有保留下来的配送结算可授予真实目标',()=>{
  let s=arrive(fresh('ai'));s.pending.aiStatus='unrequested';const id=s.pending.id;
  s=G.applyAIEvent(s,id,{title:'新街',text:'这是一条新街。',unlockedPlaces:['temple'],choices:Array.from({length:3},()=>({label:'送到门口',result:'收餐人道谢。',effects:{qi:1}}))});
  assert.deepEqual(s.unlockedPlaces,['home','garage']);s=choose(s);assert.ok(G.placeUnlocked(s,'market'));assert.equal(G.placeUnlocked(s,'temple'),false);
});

test('补单保留两个近单并保证未知服务地点可获得，渲染查询不推进随机源',()=>{
  for(let seed=1;seed<=100;seed++){
    const s=fresh('classic',seed),pool=G.PLACES.filter(p=>p.id!=='home').map(p=>G.routeFrom(s,p.id).meters).sort((a,b)=>a-b);
    assert.equal(s.orders.length,6);for(const o of s.orders.slice(0,2))assert.ok(G.routeFrom(s,o.target).meters<=pool[8]);
    assert.ok(s.orders.some(o=>G.place(o.target).permanent&&!G.placeUnlocked(s,o.target)));
    const before=JSON.stringify(s);G.visibleServicePlaces(s);G.visibleResidences(s);assert.equal(JSON.stringify(s),before);
  }
});

test('持续完成发现单可以解锁全部服务地点，不需要反复赌随机刷单',()=>{
  let s=fresh();
  for(let i=0;i<12&&G.visibleServicePlaces(s).length<G.PLACES.filter(p=>p.permanent).length;i++){
    s.player.stamina=G.limits(s).stamina;s.vehicle.battery=G.limits(s).battery;s.vehicle.durability=G.limits(s).durability;
    G.refreshOrders(s);const o=s.orders.find(o=>G.place(o.target).permanent&&!G.placeUnlocked(s,o.target));assert.ok(o);
    s=settle(finish(act(s,'deliver',{id:o.id})));
  }
  assert.equal(G.visibleServicePlaces(s).length,G.PLACES.filter(p=>p.permanent).length);
});

test('地图全部地点已发现后仍正常补单，不重置发现记录或额外奖励',()=>{
  const s=fresh();s.unlockedPlaces=G.PLACES.map(p=>p.id);s.orders=[];const money=s.player.money;G.refreshOrders(s);
  assert.equal(s.orders.length,6);assert.equal(s.unlockedPlaces.length,G.PLACES.length);assert.equal(s.player.money,money);
});

test('v12持久化严格校验地点列表，去重但不猜测授予未知地点',()=>{
  for(const invalid of [undefined,null,{},'market',['unknown'],['home',{}],[],Array(111).fill('home')]){
    const s=fresh();s.unlockedPlaces=invalid;assert.throws(()=>read(s),/地点|住处/);
  }
  const s=fresh();s.unlockedPlaces=['home','home','market'];assert.deepEqual(read(s).unlockedPlaces,['home','market','garage']);
  s.residenceId='qiyun';assert.throws(()=>read(s),/住处/);
});

test('新格式读档不能通过在途拜访、搬家、赶路或当地工作跳过地点权限',()=>{
  for(const [place,kind,params] of [['market','travel',{target:'market'}],['stop-3','moveHome',{id:'qiyun'}],['bookshop','visit',{id:'shen'}]]){
    let s=fresh();s.unlockedPlaces.push(place);s.bonds.shen.met=true;s=act(s,kind,params);s.unlockedPlaces=['home','garage'];assert.throws(()=>read(s),/地点权限/);
  }
  let s=fresh();s.position='clinic';s.unlockedPlaces.push('clinic');s.player.health=10;s=act(s,'heal');s.unlockedPlaces=['home','garage'];assert.throws(()=>read(s),/地点权限/);
});

test('v1–v11迁移保留旧版已开放固定地点，不重置住处或发放发现奖励',()=>{
  for(let version=1;version<=11;version++){
    const s=fresh();s.schemaVersion=version;delete s.unlockedPlaces;s.residenceId='qiyun';s.position='stop-3';
    const a=read(s);assert.equal(a.schemaVersion,G.VERSION);assert.equal(a.residenceId,'qiyun');assert.equal(a.player.money,s.player.money);
    assert.equal(G.visibleServicePlaces(a).length,G.PLACES.filter(p=>p.permanent).length);assert.equal(discoveryLogs(a).length,0);
    assert.deepEqual(read(a).unlockedPlaces,a.unlockedPlaces);
  }
});

test('旧档普通地址待交付及耗时选择不被迁移误判为成功送达',()=>{
  for(const delayed of [false,true]){
    let s=arrive(fresh(),'stop-0');if(delayed){s=choose(timedDelivery(s));s=G.advance(s,1);}
    s.schemaVersion=11;delete s.unlockedPlaces;s=read(s);assert.equal(G.placeUnlocked(s,'stop-0'),false);assert.equal(s.stats.delivered,0);
    s=delayed?finish(s):choose(s);assert.ok(G.placeUnlocked(s,'stop-0'));assert.equal(s.stats.delivered,1);
  }
});

test('旧档普通非配送行程保留权限、坐标和进度，不重复授予奖励',()=>{
  let s=fresh();s.unlockedPlaces.push('stop-0');s=act(s,'travel',{target:'stop-0'});s=G.advance(s,.2);
  const point=G.playerPoint(s),progress=s.activity.travelled;s.schemaVersion=11;delete s.unlockedPlaces;s=read(s);
  assert.ok(G.placeUnlocked(s,'stop-0'));assert.deepEqual(G.playerPoint(s),point);assert.equal(s.activity.travelled,progress);assert.equal(s.stats.delivered,0);
});

test('旧本地键迁移到v12且不跨存档串通地点，新档仍只开放小屋',()=>{
  const legacy=fresh(),other=fresh();legacy.schemaVersion=11;delete legacy.unlockedPlaces;
  const values=new Map([[G.LEGACY_STORAGE_KEY,JSON.stringify({saves:[legacy,other]})]]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const store=G.createStore(storage),[a,b]=store.load();assert.ok(G.placeUnlocked(a,'market'));assert.deepEqual(b.unlockedPlaces,['home','garage']);
  assert.ok(values.has(G.STORAGE_KEY));assert.ok(values.has(G.LEGACY_STORAGE_KEY));assert.equal(G.placeUnlocked(fresh(),'market'),false);
});

for(const mode of ['classic','ai'])test(`${mode}初始地点独立保存，不自动结识修车铺人物`,()=>{
  const a=fresh(mode),b=fresh(mode);assert.deepEqual(a.unlockedPlaces,['home','garage']);
  assert.equal(a.bonds.chen.met,false);assert.equal(G.panelUnlocked(a,'bonds'),false);
  a.unlockedPlaces.push('market');assert.deepEqual(b.unlockedPlaces,['home','garage']);
});

test('零单即可沿真实道路前往修车点维修，升级仍需五单',()=>{
  let s=fresh();s.vehicle.durability=20;s=act(s,'travel',{target:'garage'});
  assert.ok(s.activity);assert.equal(s.position,'home');s=finish(s);assert.equal(s.position,'garage');
  s=finish(act(s,'repair'));assert.equal(s.vehicle.durability,G.limits(s).durability);
  assert.equal(s.stats.delivered,0);assert.equal(discoveryLogs(s).length,0);
  assert.match(reject(s,'upgrade',{kind:'speed'}),/尚未开启/);
});

test('旧v12补齐修车点但不改资产、时间、其他地点或日志，反复读档不重复',()=>{
  const s=fresh();s.unlockedPlaces=['home'];const a=read(s);
  assert.deepEqual(a.unlockedPlaces,['home','garage']);assert.deepEqual(a.player,s.player);
  assert.equal(a.minutes,s.minutes);assert.deepEqual(a.orders,s.orders);assert.deepEqual(a.logs.map(({id,...l})=>l),s.logs.map(({id,...l})=>l));
  assert.deepEqual(read(a).unlockedPlaces,a.unlockedPlaces);
});

test('旧v12在修车点待交付读档不提前结算、不送发现奖励',()=>{
  let s=arrive(fresh(),'garage');assert.ok(s.pending?.delivery);s.unlockedPlaces=['home'];
  const cash=s.player.money;s=read(s);assert.deepEqual(s.unlockedPlaces,['home','garage']);
  assert.equal(s.stats.delivered,0);assert.equal(s.player.money,cash);assert.ok(s.pending?.delivery);
  s=choose(s);assert.equal(s.stats.delivered,1);assert.equal(discoveryLogs(s).length,0);
});
