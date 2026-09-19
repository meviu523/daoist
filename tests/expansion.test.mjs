import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
// 路网与计时专项夹具明确开放地点；真实新档另测。
const fresh=(seed=12345)=>Object.assign(G.newGame('扩城测试','classic',seed),{unlockedPlaces:G.PLACES.map(p=>p.id)});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const start=(s,kind,params={})=>{const r=G.perform(s,kind,params);assert.ok(r.ok,r.error);return r.state;};
const restore=s=>G.sanitizeSave(JSON.parse(JSON.stringify(s)));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const legacyIds=['home','garage','clinic','bookshop','temple','park','market',...Array.from({length:35},(_,i)=>`stop-${i}`)];

test('充电从 30 缩至 10 游戏分钟，¥8 不变，期间不瞬间补满',()=>{
  let s=fresh();s.vehicle.battery=0;const now=s.minutes;s=start(s,'charge');
  assert.equal(G.CHARGE.minutes,10);assert.equal(G.CHARGE.cost,8);assert.equal(s.activity.duration,10);
  assert.equal(s.player.money,112);assert.equal(s.minutes,now);assert.equal(s.vehicle.battery,0);
  s=G.advance(s,5);near(s.vehicle.battery,40);assert.ok(s.activity);
  s=G.advance(s,4.9);near(s.vehicle.battery,79.2);assert.ok(s.activity);
  s=G.advance(s,.1);near(s.vehicle.battery,80);assert.equal(s.activity,null);near(s.minutes,now+10);
  assert.equal(s.player.money,112);assert.equal(s.logs.filter(l=>l.text.includes('充电完成')).length,1);
});
test('半电及升级电池均按开始时缺口逐步充满',()=>{
  for(const level of [0,3,5]){
    let s=fresh();s.vehicle.levels.battery=level;const cap=G.limits(s).battery;s.vehicle.battery=cap/2;
    s=start(s,'charge');s=G.advance(s,2.5);near(s.vehicle.battery,cap*.625);
    s=G.advance(s,7.5);near(s.vehicle.battery,cap);assert.equal(s.player.money,112);
  }
});
test('满电、现金不足或忙碌时充电失败不部分扣费',()=>{
  for(let i=0;i<3;i++){
    let s=fresh();if(i!==0)s.vehicle.battery=0;if(i===1)s.player.money=7;if(i===2)s=start(s,'rest');
    const text=JSON.stringify(s),r=G.perform(s,'charge');assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),text);
  }
});
test('道路中途可原地充电，停止只保留已充电量且不退款',()=>{
  let s=start(fresh(),'travel',{target:'temple'});s=G.advance(s,.5);s=start(s,'stop');
  assert.equal(s.position,null);const point=G.playerPoint(s),distance=s.stats.distance;s.vehicle.battery=0;
  s=start(s,'charge');s=G.advance(s,3);near(s.vehicle.battery,24);s=start(s,'stop');
  s=G.advance(s,10);near(s.vehicle.battery,24);assert.equal(s.player.money,112);assert.deepEqual(G.playerPoint(s),point);assert.equal(s.stats.distance,distance);
});
test('新充电行动多次读档保留精度、费用及进度，剩余时间不被再次压缩',()=>{
  let s=fresh();s.vehicle.battery=0;s=start(s,'charge');s=G.advance(s,2.375);
  for(let i=0;i<4;i++)s=restore(s);
  near(s.vehicle.battery,19);near(s.activity.elapsed,2.375);near(G.activityRemaining(s),7.625);
  s=G.advance(s,7.625);near(s.vehicle.battery,80);assert.equal(s.activity,null);assert.equal(s.player.money,112);
});
test('v5 旧 30 分钟充电按完成比例迁移，不改时间或电量、不重扣费用',()=>{
  for(const elapsed of [0,7.5,15,29.7,30]){
    const raw=fresh();raw.vehicle.battery=0;let s=start(raw,'charge');
    // Synthetic v5 snapshot of the old 30-minute rule, not a user save.
    s.activity.duration=30;s.activity.elapsed=elapsed;s.minutes+=elapsed;s.vehicle.battery=80*elapsed/30;
    const money=s.player.money,minutes=s.minutes,battery=s.vehicle.battery;s=restore(s);
    assert.equal(s.minutes,minutes);near(s.vehicle.battery,battery);assert.equal(s.player.money,money);
    assert.equal(s.activity.duration,10);near(s.activity.elapsed,elapsed/3);
    s=restore(s);near(s.activity.elapsed,elapsed/3);
    s=G.advance(s,Math.max(1e-7,10-elapsed/3));assert.equal(s.activity,null);near(s.vehicle.battery,80);assert.equal(s.player.money,money);
  }
});
test('充电跨越房租到期仍先扣租，破产不执行完成回调',()=>{
  let s=fresh();s.minutes=6*1440-5;s.player.money=8;s.vehicle.battery=0;s=start(s,'charge');
  s=G.advance(s,10);assert.equal(s.minutes,6*1440);assert.equal(s.gameOver.reason,'rent');
  near(s.vehicle.battery,40);assert.equal(s.logs.filter(l=>l.text.includes('充电完成')).length,0);
});
test('10 分钟充电不随时间切片改变收益、随机数或订单',()=>{
  let s=fresh();s.vehicle.battery=0;s=start(s,'charge');const a=G.advance(s,10);let b=G.clone(s);
  for(let i=0;i<1000;i++)b=G.advance(b,.01);
  near(a.minutes,b.minutes);near(a.vehicle.battery,b.vehicle.battery);assert.equal(a.seed,b.seed);
  assert.deepEqual(a.orders,b.orders);assert.equal(b.activity,null);
});
test('110 个路网节点与地点一一对应，新增 68 个动态地址分布于五个片区',()=>{
  assert.equal(G.GRID_X.length,11);assert.equal(G.GRID_Y.length,10);assert.equal(G.PLACES.length,110);
  assert.equal(G.WORLD.width,2660);assert.equal(G.WORLD.height,1860);assert.equal(G.WORLD.metersPerUnit,3.5);
  assert.equal(new Set(G.PLACES.map(p=>`${p.x}:${p.y}`)).size,110);
  assert.equal(new Set(G.PLACES.map(p=>p.name)).size,110);
  const added=G.PLACES.filter(p=>!legacyIds.includes(p.id));assert.equal(added.length,68);
  assert.ok(added.every(p=>!p.permanent&&p.kind==='delivery'&&p.desc));
  for(const p of G.PLACES){assert.equal(G.roadAnchors(p).length,1);assert.ok(p.x>0&&p.x<G.WORLD.width&&p.y>0&&p.y<G.WORLD.height);}
  assert.deepEqual(G.DISTRICTS.map(d=>added.filter(p=>p.district===d.id).length),[12,12,12,21,11]);
});
// Golden digests computed from main a4e26ad before editing, using exact id/name/
// coordinates and the complete Dijkstra routes. Protect real v5 in-flight saves.
test('全部旧地点的 ID、名称、坐标与常驻标志保持逐项兼容',()=>{
  const places=legacyIds.map(id=>{const p=G.place(id);return [p.id,p.name,p.x,p.y,p.permanent];});
  assert.equal(hash(places),'f94c076796cba6249c5025094cedd8588c15a97040ae801c7e6daab229d680ab');
});
test('旧城区 1764 条起终点路线和距离保持不变',()=>{
  const routes=legacyIds.flatMap(a=>legacyIds.map(b=>G.route(a,b)));
  assert.equal(hash(routes),'d9905dbffd1f5bbb00ef24e05bb72761d71f7afa85736cdcde5590d85fa6372f');
});
test('旧城区 68 条路段中点到旧地点的 2856 条路线保持不变',()=>{
  const origins=[];
  for(const p of legacyIds.map(G.place))for(const q of legacyIds.map(G.place)){
    if(!((p.x===q.x&&Math.abs(p.y-q.y)===180)||(p.y===q.y&&Math.abs(p.x-q.x)===240)))continue;
    const mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
    if(G.roadAnchors(mid).length&&!origins.some(a=>a.x===mid.x&&a.y===mid.y))origins.push(mid);
  }
  assert.equal(origins.length,68);
  assert.equal(hash(origins.flatMap(a=>legacyIds.map(b=>G.route(a,b)))),'2898b1d608599818d68d51133d9f000d0ef2118f0da5bb70acbbb3f3eb321439');
});
test('第四座南桥可通行，所有非桥江面位置拒绝寻路',()=>{
  assert.deepEqual(G.ROAD_LAYOUT.bridgeRows,[1,3,5,7]);
  for(const [r,y] of G.GRID_Y.entries()){
    const p={x:970,y};if([1,3,5,7].includes(r))assert.equal(G.roadAnchors(p).length,2);
    else{assert.deepEqual(G.roadAnchors(p),[]);assert.throws(()=>G.route(p,'home'));}
  }
  const r=G.route('south-7','lingxi-7');assert.equal(r.meters,840);
  assert.deepEqual(r.points,[{x:850,y:1380},{x:1090,y:1380}]);
});
test('返回路线不能修改寻路缓存，任意目的地均只沿共享道路边移动',()=>{
  const a=G.route('home','lingxi-20'),expected=G.clone(a);a.points[0].x=-1;a.meters=0;
  assert.deepEqual(G.route('home','lingxi-20'),expected);
  const edges=new Set(G.ROAD_EDGES.flatMap(({from,to})=>[`${from}:${to}`,`${to}:${from}`]));
  for(const p of G.PLACES)for(const q of G.PLACES){
    const r=G.route(p.id,q.id);
    for(let i=1;i<r.points.length;i++)assert.ok(edges.has(`${G.roadAnchors(r.points[i-1])[0]}:${G.roadAnchors(r.points[i])[0]}`));
  }
});
for(const district of G.DISTRICTS)test(`${district.name}配送实际移动，途中读档、抵达和奖励只结算一次`,()=>{
  let s=fresh(),target=G.PLACES.filter(p=>p.district===district.id).at(-1).id;
  const plan=G.travelPlan(s,target);s.orders=[{id:`expansion-${district.id}`,title:'新区热饭',desc:'交到门口。',condition:'ordinary',target,expiresAt:s.minutes+plan.minutes+20,reward:50,coins:4,npc:null}];
  s=start(s,'deliver',{id:s.orders[0].id});assert.equal(s.stats.delivered,0);assert.equal(s.player.money,120);
  s=G.advance(s,plan.minutes/2);assert.equal(s.position,null);assert.ok(s.activity.travelled>0);
  const midpoint=G.playerPoint(s);s=restore(s);assert.deepEqual(G.playerPoint(s),midpoint);
  s=G.advance(s,G.activityRemaining(s));assert.equal(s.position,target);assert.equal(s.pending.delivery.target,target);assert.equal(s.player.money,120);
  const eventId=s.pending.id;s=start(s,'choose',{eventId,index:0});assert.equal(s.stats.delivered,1);assert.equal(s.player.money,170);
  assert.equal(G.perform(s,'choose',{eventId,index:0}).ok,false);assert.equal(s.player.money,170);
  near(s.stats.distance,plan.meters);near(s.vehicle.battery,80-plan.battery);
});
test('新区订单自然生成，保留近单且不暴露整张地图的所有任务点',()=>{
  const seen=new Set();
  for(let i=1;i<=150;i++){
    const s=fresh(i*7919);assert.equal(s.orders.length,6);
    const pool=G.PLACES.filter(p=>p.id!==s.position).map(p=>G.routeFrom(s,p.id).meters).sort((a,b)=>a-b);
    for(const order of s.orders.slice(0,2))assert.ok(G.routeFrom(s,order.target).meters<=pool[8]);
    for(const order of s.orders)if(G.place(order.target).district)seen.add(G.place(order.target).district);
  }
  assert.deepEqual([...seen].sort(),G.DISTRICTS.map(d=>d.id).sort());
});
test('新区远距离移动仍依据距离消耗资源，切片后与一次推进一致',()=>{
  let s=start(fresh(),'travel',{target:'lingxi-20'});const total=G.activityRemaining(s),a=G.advance(s,total);let b=G.clone(s);
  for(let i=0;i<500;i++)b=G.advance(b,total/500);
  near(a.minutes,b.minutes);near(a.stats.distance,b.stats.distance);near(a.vehicle.battery,b.vehicle.battery);
  assert.deepEqual(G.playerPoint(a),G.playerPoint(b));assert.equal(b.position,'lingxi-20');assert.equal(a.seed,b.seed);
});
