import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/clock.js';
import '../public/js/storage.js';
const G=globalThis.NightCourier;
const legacy=JSON.parse(readFileSync(new URL('./fixtures/legacy-city-v5.json',import.meta.url),'utf8'));
const fresh=()=>G.newGame('远行','classic',123456);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function runClock(s,speed=1){
  const c=new G.GameClock(dt=>{s=G.advance(s,dt);if(s.pending||s.ending||s.gameOver)c.pause('event');});
  c.setSpeed(speed);c.release('manual');c.frame(0);
  return {c,get state(){return s;}};
}

test('扩城至 11×10 路网、110 地点，面积超过旧城 2.5 倍',()=>{
  assert.equal(G.GRID_X.length,11);assert.equal(G.GRID_Y.length,10);
  assert.equal(G.PLACES.length,110);assert.equal(G.PLACES.filter(p=>!p.permanent).length,101);
  assert.ok(G.WORLD.width*G.WORLD.height/(1700*1140)>2.5);
  assert.equal(new Set(G.PLACES.map(p=>p.name)).size,110);
  for(const p of G.PLACES){assert.ok(p.name);assert.ok(p.x>0&&p.x<G.WORLD.width&&p.y>0&&p.y<G.WORLD.height);assert.equal(G.roadAnchors(p).length,1);}
});
test('旧城 42 个 ID、名称和坐标不变，旧路径保持一致',()=>{
  for(const p of legacy.places){const current=G.place(p.id);assert.deepEqual({id:current.id,name:current.name,x:current.x,y:current.y},p);}
  for(const route of legacy.routes)assert.deepEqual(G.route(route.from,route.to),route);
});
test('扩图前 v5 途中存档可恢复，不移动位置或重新扣费',()=>{
  const before=legacy.save,s=G.sanitizeSave(G.clone(before));
  assert.equal(s.minutes,before.minutes);assert.deepEqual(G.playerPoint(s),G.playerPoint(before));
  assert.deepEqual(s.activity.route,before.activity.route);near(s.activity.travelled,before.activity.travelled);
  assert.deepEqual(s.player,before.player);assert.deepEqual(s.vehicle,before.vehicle);
});
test('所有新旧地点从旧城与新城均可达，只走道路和已发布的四桥',()=>{
  for(const from of ['home','southbank-10'])for(const place of G.PLACES){
    const r=G.route(from,place.id);assert.ok(Number.isFinite(r.meters));
    assert.deepEqual(r.points.at(-1),{x:place.x,y:place.y});
    for(let i=1;i<r.points.length;i++){
      const a=r.points[i-1],b=r.points[i];assert.ok(a.x===b.x||a.y===b.y);
      const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};assert.ok(G.roadAnchors(middle).length);
      if(Math.min(a.x,b.x)===850&&Math.max(a.x,b.x)===1090)assert.ok([300,660,1020,1380].includes(a.y));
    }
  }
  assert.throws(()=>G.route({x:970,y:1740},'home'));
});
test('扩展区域进入订单池，仍保留附近订单，不把所有地点常驻',()=>{
  let hasOuter=false;
  for(let seed=1;seed<=8;seed++){
    const s=G.newGame('骑手','classic',seed);assert.equal(s.orders.length,6);
    hasOuter ||= s.orders.some(o=>!!G.place(o.target).district);
    assert.ok(s.orders.some(o=>G.travelPlan(s,o.target).km<3));
    for(const o of s.orders)assert.ok(G.place(o.target));
  }
  assert.ok(hasOuter);assert.ok(G.PLACES.filter(p=>!!p.district).every(p=>!p.permanent));
});
test('新城路途中存档往返保持位置、剩余路径和小数消耗',()=>{
  let s=G.perform(fresh(),'travel',{target:'southbank-10'}).state;
  s=G.advance(s,10);const copy=G.sanitizeSave(G.clone(s));
  assert.deepEqual(copy.location,s.location);assert.deepEqual(copy.activity,s.activity);
  assert.deepEqual(copy.vehicle,s.vehicle);assert.deepEqual(copy.player,s.player);
});
test('前台和后台时间戳交错只推进一次，旧回调不会回退基准',()=>{
  let total=0;const c=new G.GameClock(t=>total+=t);c.release('manual');
  for(const t of [0,250,250,240,1000,1000,1250])c.frame(t);
  near(total,1.25);assert.equal(c.paused,false);
});
test('长后台间隔分批处理并保留余量，不超过引擎增量上限',()=>{
  const chunks=[];const c=new G.GameClock(t=>chunks.push(t));c.release('manual');c.setSpeed(10);c.frame(0);c.frame(600000);
  assert.equal(chunks.length,4);assert.ok(c.pendingMinutes>0);assert.equal(c.paused,false);
  for(let i=0;i<25&&c.pendingMinutes;i++)c.frame(600000);
  near(chunks.reduce((a,b)=>a+b,0),6000);near(c.pendingMinutes,0);assert.ok(chunks.every(x=>x<=60));
});
test('非有限时间戳不破坏时钟，下一次有效回调仍正确计时',()=>{
  let total=0;const c=new G.GameClock(t=>total+=t);c.release('manual');c.frame(0);
  for(const t of [NaN,Infinity,-Infinity])c.frame(t);
  c.frame(2000);near(total,2);assert.equal(c.paused,false);
});
test('手动暂停会丢弃待推进余量，恢复后不计暂停期间时间',()=>{
  let total=0;const c=new G.GameClock(t=>total+=t);c.release('manual');c.frame(0);c.frame(600000);
  near(total,240);c.pause();assert.equal(c.pendingMinutes,0);c.frame(900000);c.release('manual');c.frame(1000000);c.frame(1001000);near(total,241);
});
test('后台移动与相同游戏时间的前台移动获得相同位置和消耗',()=>{
  const initial=G.perform(fresh(),'travel',{target:'southbank-10'}).state;
  const bg=runClock(G.clone(initial));bg.c.frame(6000);
  let fg=G.clone(initial);for(let i=0;i<60;i++)fg=G.advance(fg,.1);
  near(bg.state.minutes,fg.minutes);near(bg.state.stats.distance,fg.stats.distance);
  near(bg.state.vehicle.battery,fg.vehicle.battery);near(bg.state.player.stamina,fg.player.stamina);
  near(G.playerPoint(bg.state).x,G.playerPoint(fg).x);near(G.playerPoint(bg.state).y,G.playerPoint(fg).y);
});
test('后台抵达待选配送剧情就停，不越过事件或提前发放奖励',()=>{
  let s=fresh();s=G.perform(s,'deliver',{id:s.orders[0].id}).state;
  const t=runClock(s,10);t.c.frame(600000);
  assert.ok(t.state.pending?.delivery);assert.equal(t.state.stats.delivered,0);assert.equal(t.c.paused,true);assert.equal(t.c.pendingMinutes,0);
  const at=t.state.minutes;t.c.frame(900000);near(t.state.minutes,at);
});
test('后台跨房租日仍先扣租，现金不足准确停在午夜',()=>{
  const s=fresh();s.minutes=6*1440-1;s.player.money=0;s.orderRefreshAt=6*1440;
  const t=runClock(s);t.c.frame(600000);
  assert.equal(t.state.gameOver.reason,'rent');near(t.state.minutes,6*1440);assert.equal(t.c.pendingMinutes,0);
});

// Golden values from the 99-place release b71b00d; protect all newly published IDs too.
test('保留已发布的 99 个地点及其全部 9801 对路线，不回退并行扩城更新',()=>{
  const places=G.PLACES.filter(p=>p.district!=='southbank');
  const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
  assert.equal(places.length,99);
  assert.equal(hash(places.map(p=>[p.id,p.name,p.x,p.y,p.permanent])),'6b81dbb7ce7ede3a93ba0851b9cbe6d32bc764c16f9c40fb9ab87340e052abd1');
  assert.equal(hash(places.flatMap(a=>places.map(b=>G.route(a.id,b.id)))),'5aff391053838ddbcda3d3442f11269f77d3dd8e7b5a3211dc9fef968d2b9aba');
});
