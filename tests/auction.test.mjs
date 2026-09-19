import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const act=(s,action,p={})=>{const r=G.perform(s,action,p);assert.ok(r.ok,r.error);return r.state;};
const read=s=>G.sanitizeSave(G.clone(s));
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<2000;i++)s=G.advance(s,1);return s;};
const choose=(s,index)=>act(s,'choose',{eventId:s.pending.id,index});
const atomic=(s,action,p={})=>{const before=JSON.stringify(s),r=G.perform(s,action,p);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),before);return r.error;};
// Auction-isolated fixtures suppress unrelated story prompts but do not grant goods or auction wins.
function eligible(seed=123,realm=0){
  const s=G.newGame('万宝客','classic',seed);s.unlockedPlaces=G.PLACES.map(p=>p.id);s.unlockedFeatures=G.FEATURE_UNLOCKS.map(f=>f.id);
  s.position='market';s.minutes=1080;s.player.money=10000;s.player.realm=realm;
  s.flags.firstOrder=true;for(const e of G.EVENTS.filter(e=>e.kind==='story'))s.flags[e.flag]=true;
  G.syncFormulaRewards(s);return s;
}
const catalog=(seed=123,realm=0)=>act(eligible(seed,realm),'auctionCatalog');
function budgets(s,index=0,steps=8,spec={}){
  const l=s.auction.lots[index];Object.assign(l,spec);const info=G.auctionLotInfo(l);
  l.rivals=G.AUCTION_BIDDERS.map(b=>({id:b.id,ceiling:info.opening+info.step*steps}));return s;
}
const bid=(s,index=0,raise=1)=>act(s,'auctionBid',{id:s.auction.lots[index].id,raise});
function win(s,index=0){s=bid(s,index);for(let i=0;i<12;i++){s=finish(s);if(!s.pending)return s;s=choose(s,0);}throw new Error('竞拍未在预算内结束');}

test('拍卖场需要已开放炼药与十单，未开启指令原子失败',()=>{
  const s=G.newGame('新客','classic',1);s.position='market';s.minutes=1080;s.player.money=99999;
  assert.equal(G.panelUnlocked(s,'auction'),false);assert.match(atomic(s,'auctionCatalog'),/尚未开启/);atomic(s,'auctionBid',{id:'auction-1-0'});
  s.stats.delivered=10;assert.equal(G.featureUnlocked(s,'auction'),false);
  s.unlockedFeatures=['alchemy'];s.stats.delivered=9;assert.equal(G.featureUnlocked(s,'auction'),false);
  s.stats.delivered=10;assert.ok(G.featureUnlocked(s,'auction'));
});
test('第十单须到达和选择结算才解锁拍卖，不能从已接单提前开启',()=>{
  let s=G.newGame('十单客','classic',17);s.unlockedFeatures=['alchemy'];s.stats.delivered=9;
  s=act(s,'deliver',{id:s.orders[0].id});assert.equal(G.featureUnlocked(s,'auction'),false);
  s=finish(s);assert.equal(s.pending.templateId,'first-order');assert.equal(G.featureUnlocked(read(s),'auction'),false);
  s=choose(s,0);assert.equal(s.stats.delivered,10);assert.ok(s.unlockedFeatures.includes('auction'));
});
test('图录需真实到场；远程路线是纯查询，不会瞬移或扣费',()=>{
  const s=eligible();s.position='home';const before=JSON.stringify(s);
  assert.ok(G.travelPlan(s,'market').meters>0);assert.equal(JSON.stringify(s),before);atomic(s,'auctionCatalog');
  const a=act(s,'travel',{target:'market'});assert.equal(a.position,'home');assert.equal(a.auction.day,0);
  const arrived=finish(a);assert.equal(arrived.position,'market');assert.ok(act(arrived,'auctionCatalog').auction.lots.length);
});
test('每日三件拍品，六个境界均不泄露或拍卖丹方，不自动结识竞价者',()=>{
  for(let realm=0;realm<6;realm++)for(let seed=1;seed<=12;seed++){
    const s=eligible(seed,realm),before=G.clone(s),a=act(s,'auctionCatalog');
    assert.equal(a.auction.lots.length,3);assert.equal(new Set(a.auction.lots.map(l=>l.id)).size,3);
    assert.deepEqual(a.alchemy.formulas,before.alchemy.formulas);assert.deepEqual(a.bonds,before.bonds);
    assert.deepEqual(a.inventory,before.inventory);assert.equal(a.player.money,before.player.money);assert.equal(a.minutes,before.minutes);
    for(const l of a.auction.lots){assert.ok(['material','pill','cauldron'].includes(l.kind));assert.ok(G.auctionLotInfo(l).realm<=realm);assert.equal(l.rivals.length,3);}
  }
});
test('没有第一口药鼎时第三件改为药材，已有药鼎只拍卖未拥有型号',()=>{
  let s=eligible();s=act(s,'auctionCatalog');assert.deepEqual(s.auction.lots.map(l=>l.kind),['material','pill','material']);
  assert.notEqual(s.auction.lots[0].item,s.auction.lots[2].item);
  s=eligible();s=act(s,'cauldron',{id:1});s=act(s,'auctionCatalog');
  assert.equal(s.auction.lots[2].kind,'cauldron');assert.notEqual(s.auction.lots[2].item,'1');
  s=eligible();s.alchemy.cauldrons=G.CAULDRONS.filter(c=>c.level&&c.realm===0).map(c=>c.level);s.alchemy.cauldron=1;
  s=act(s,'auctionCatalog');assert.equal(s.auction.lots[2].kind,'material');
});
test('当天图录、报价和预算不会因重开或读档重抽，渲染查询无副作用',()=>{
  const s=catalog(),again=act(s,'auctionCatalog'),restored=read(s);
  assert.deepEqual(again.auction,s.auction);assert.equal(again.seed,s.seed);assert.equal(again.logs.length,s.logs.length);
  assert.deepEqual(restored.auction,s.auction);assert.equal(restored.seed,s.seed);
  const before=JSON.stringify(s);for(let i=0;i<20;i++)for(const l of s.auction.lots){G.auctionLotInfo(l);G.auctionNextBid(l,3);G.auctionBidBlock(s,l,1);G.auctionHeld(s);}
  assert.equal(JSON.stringify(s),before);
});
test('未开场可提前看图录，但18点前或余时不足一轮不能出价',()=>{
  let s=eligible();s.minutes=1079;s=act(s,'auctionCatalog');assert.match(atomic(s,'auctionBid',{id:s.auction.lots[0].id}),/尚未开拍/);
  s=G.advance(s,1);assert.ok(bid(s).activity);
  s.minutes=1435;assert.ok(bid(s).activity);s.minutes=1435.1;assert.match(atomic(s,'auctionBid',{id:s.auction.lots[0].id}),/不足一轮/);
});
test('首口按起拍价，加三口为起拍价加两口；非法加价和缺钱不影响状态',()=>{
  const s=catalog(),lot=s.auction.lots[0],info=G.auctionLotInfo(lot);
  assert.equal(G.auctionNextBid(lot,1),info.opening);assert.equal(G.auctionNextBid(lot,3),info.opening+2*info.step);
  for(const raise of [0,-1,2,4,Infinity,NaN,'3'])atomic(s,'auctionBid',{id:lot.id,raise});
  atomic(s,'auctionBid',{id:'auction-0-0'});s.player.money=info.opening-1;atomic(s,'auctionBid',{id:lot.id});
});
test('竞价开始只冻结资金，不跳时、不发货，不能重入、停止或开始别的主行动',()=>{
  const s=catalog(),lot=s.auction.lots[0],amount=G.auctionNextBid(lot),a=bid(s);
  assert.equal(a.minutes,s.minutes);assert.equal(a.player.money,s.player.money-amount);assert.equal(G.auctionHeld(a),amount);
  assert.deepEqual(a.inventory,s.inventory);assert.equal(a.auction.wins,0);assert.equal(a.activity.duration,5);assert.equal(a.activity.elapsed,0);
  assert.equal(G.canStop(a),false);for(const action of ['auctionBid','auctionCatalog','stop','rest','travel','cauldron'])atomic(a,action,{id:lot.id,target:'home'});
  assert.equal(s.auction.lots[0].status,'ready');
});
test('竞拍进度随游戏分钟推进，途中读档不重扣冻结款，完成才成交',()=>{
  const s=budgets(catalog(),0,0),lot=s.auction.lots[0],info=G.auctionLotInfo(lot),start=bid(s);
  const half=G.advance(start,2.5),loaded=read(half);assert.equal(half.activity.elapsed,2.5);assert.equal(half.auction.wins,0);
  assert.deepEqual(loaded.auction,half.auction);assert.equal(loaded.player.money,half.player.money);assert.equal(loaded.activity.elapsed,2.5);
  const done=G.advance(loaded,2.5);assert.equal(done.auction.lots[0].status,'won');assert.equal(done.player.money,s.player.money-info.opening);
  assert.equal(done.inventory[lot.item],(s.inventory[lot.item]||0)+lot.count);assert.equal(done.auction.wins,1);assert.equal(done.auction.spent,info.opening);
  assert.deepEqual(read(done).inventory,done.inventory);assert.equal(read(done).player.money,done.player.money);
});
test('被超价后全额退款并暂停待选，三选项中始终可免费放弃',()=>{
  const s=budgets(catalog()),before=s.player.money,done=finish(bid(s)),lot=done.auction.lots[0];
  assert.equal(done.player.money,before);assert.equal(lot.held,0);assert.equal(lot.status,'decision');
  assert.equal(done.pending.kind,'auction');assert.equal(done.pending.choices.length,3);assert.equal(done.pending.aiStatus,'skip');
  assert.equal(G.advance(done,100),done);assert.equal(G.choiceBlock(done,done.pending.choices[2]),'');
  done.player.money=0;assert.ok(G.choiceBlock(done,done.pending.choices[0]));assert.equal(G.choiceBlock(done,done.pending.choices[2]),'');
  const exit=choose(done,2);assert.equal(exit.auction.lots[0].status,'lost');assert.equal(exit.player.money,0);assert.equal(exit.auction.activeId,null);
});
test('反复加价只扣最终成交价，不累加此前已退还的报价',()=>{
  const s=budgets(catalog()),before=s.player.money,lot=s.auction.lots[0],done=win(s);
  assert.equal(done.auction.lots[0].status,'won');assert.ok(done.auction.lots[0].round>1);
  assert.equal(before-done.player.money,done.auction.lots[0].price);assert.equal(done.auction.spent,done.auction.lots[0].price);
  assert.equal(done.inventory[lot.item],(s.inventory[lot.item]||0)+lot.count);assert.equal(done.auction.wins,1);
});
test('加三口可超过对手预算，获胜不额外消耗外卖币、灵力或炼药熟练度',()=>{
  const s=budgets(catalog(),0,1),done=finish(bid(s,0,3));
  assert.equal(done.auction.lots[0].status,'won');assert.equal(done.auction.lots[0].round,1);
  for(const k of ['coins','mana','qi'])assert.equal(done.player[k],s.player[k]);assert.deepEqual(done.alchemy,s.alchemy);
});
test('待选事件 ID 和轮次必须匹配，重复旧选择、非法索引不能重扣或退款',()=>{
  const s=finish(bid(budgets(catalog()))),old=s.pending.id;
  for(const index of [-1,3,1.5,'0',NaN])atomic(s,'choose',{eventId:old,index});
  atomic(s,'choose',{eventId:'another-event',index:0});
  const next=choose(s,0);atomic(next,'choose',{eventId:old,index:0});assert.equal(next.auction.lots[0].round,2);
});
test('放弃后重开图录不复活拍品，也不能重复获取已成交拍品',()=>{
  let s=finish(bid(budgets(catalog())));s=choose(s,2);s=act(s,'auctionCatalog');atomic(s,'auctionBid',{id:s.auction.lots[0].id});
  budgets(s,1,0);s=win(s,1);const before=G.clone(s);s=act(s,'auctionCatalog');atomic(s,'auctionBid',{id:s.auction.lots[1].id});
  assert.deepEqual(s.inventory,before.inventory);assert.equal(s.auction.wins,1);
});
test('三件拍品可独立竞得，次日换新但保留已成交物品和累计记录',()=>{
  let s=catalog();for(let i=0;i<3;i++){budgets(s,i,0);s=win(s,i);}
  assert.equal(s.auction.wins,3);assert.equal(s.auction.lots.filter(l=>l.status==='won').length,3);
  const old=G.clone(s);s=G.advance(s,1440);s=act(s,'auctionCatalog');assert.equal(s.auction.day,2);assert.equal(s.auction.wins,3);
  assert.equal(s.auction.spent,old.auction.spent);assert.deepEqual(s.inventory,old.inventory);assert.ok(s.auction.lots.every(l=>l.status==='ready'));
  atomic(s,'auctionBid',{id:old.auction.lots[0].id});
});
test('竞得药鼎收入收藏，不自动更换当前药鼎；先购后拍防重复',()=>{
  let s=act(eligible(),'cauldron',{id:1});s=act(s,'auctionCatalog');const id=Number(s.auction.lots[2].item);budgets(s,2,0);
  const bought=act(s,'cauldron',{id});atomic(bought,'auctionBid',{id:bought.auction.lots[2].id});
  s=win(s,2);assert.ok(s.alchemy.cauldrons.includes(id));assert.equal(s.alchemy.cauldron,1);
  s=read(s);s=act(s,'cauldron',{id});assert.equal(s.alchemy.cauldron,id);
});
test('已确定图录不会随境界或现金变化而免费替换',()=>{
  let s=catalog();const original=G.clone(s.auction);s.player.realm=5;s.player.money=900000;
  s=act(s,'auctionCatalog');assert.deepEqual(s.auction,original);
});
test('等量游戏时间的不同推进分块不影响报价、结果或随机源',()=>{
  for(const steps of [0,8]){
    const start=bid(budgets(catalog(),0,steps)),whole=G.advance(start,5);let parts=start;
    for(let i=0;i<50;i++)parts=G.advance(parts,.1);
    assert.deepEqual(parts.auction,whole.auction);assert.equal(parts.player.money,whole.player.money);assert.equal(parts.seed,whole.seed);
  }
});
test('跨午夜先扣租；冻结款不能用来救济欠租，也不提前发货或退款',()=>{
  let s=eligible();s.minutes=6*1440-5;s=act(s,'auctionCatalog');budgets(s,0,0);
  const lot=s.auction.lots[0],amount=G.auctionNextBid(lot);s.player.money=amount+119;const original=G.clone(s);
  s=G.advance(bid(s),5);assert.ok(s.gameOver);assert.equal(s.player.money,119);assert.equal(s.auction.wins,0);
  assert.equal(G.auctionHeld(s),amount);assert.deepEqual(s.inventory,original.inventory);assert.equal(read(s).auction.wins,0);
  assert.equal(G.advance(s,30),s);atomic(s,'auctionBid',{id:lot.id});
});
test('恰好保留足额房租时，午夜扣租后按同一轮次正常成交',()=>{
  let s=eligible();s.minutes=6*1440-5;s=act(s,'auctionCatalog');budgets(s,0,0);
  const amount=G.auctionNextBid(s.auction.lots[0]);s.player.money=amount+120;s=G.advance(bid(s),5);
  assert.equal(s.gameOver,null);assert.equal(s.player.money,0);assert.equal(s.auction.wins,1);assert.equal(s.auction.spent,amount);
  assert.equal(read(s).auction.wins,1);
});
test('最后一轮被超价时退款后散场，不生成过期待选事件',()=>{
  let s=eligible();s.minutes=1435;s=act(s,'auctionCatalog');budgets(s,0,8);const money=s.player.money;s=G.advance(bid(s),5);
  assert.equal(s.auction.lots[0].status,'lost');assert.equal(s.pending,null);assert.equal(s.player.money,money);assert.equal(s.auction.activeId,null);
  assert.deepEqual(read(s).auction,s.auction);
});
test('11版缺失拍卖数据与冻结款、标识、物品、预算损坏均拒绝而非吞钱重置',()=>{
  const s=catalog();
  for(const corrupt of [
    x=>delete x.auction,x=>x.auction.day=999,x=>x.auction.lots.pop(),x=>x.auction.lots[0].item='not-a-material',
    x=>x.auction.lots[0].kind='formula',x=>x.auction.lots[0].held=1,x=>x.auction.lots[0].count=9999,
    x=>x.auction.lots[0].rivals[0].ceiling=-1,x=>x.auction.lots[0].id='auction-stale',x=>x.auction.activeId='auction-stale'
  ]){const raw=G.clone(s);corrupt(raw);assert.throws(()=>read(raw));}
});
test('进行中的拍卖拒绝孤立资金、错误地点、进度、轮次与外加恢复效果',()=>{
  const s=G.advance(bid(catalog()),2);
  for(const corrupt of [
    x=>x.activity=null,x=>x.position='home',x=>x.activity.elapsed=-1,x=>x.activity.elapsed=4,
    x=>x.activity.params.round++,x=>x.activity.recovery={qi:99},x=>x.auction.lots[0].held--,
    x=>x.activity.duration=0,x=>x.activity.startedAt=400,x=>x.activity.gainedQi=7
  ]){const raw=G.clone(s);corrupt(raw);assert.throws(()=>read(raw));}
});
test('待选拍卖从白名单重建操作，外来 AI 文本和奖励不能覆盖报价',()=>{
  const s=finish(bid(budgets(catalog()))),raw=G.clone(s);raw.pending.source='ai';raw.pending.aiStatus='unrequested';raw.pending.text='<script>bad()</script>';
  raw.pending.choices=[{effects:{money:99999}},{effects:{qi:99999}},{effects:{coins:99999}}];
  const a=read(raw);assert.equal(a.pending.source,'classic');assert.equal(a.pending.aiStatus,'skip');assert.equal(a.pending.choices[0].auctionRaise,1);
  assert.equal(G.applyAIEvent(a,a.pending.id,{}),a);assert.equal(G.fallbackAI(a,a.pending.id,'bad'),a);
  const exit=choose(a,2);assert.equal(exit.player.money,a.player.money);assert.equal(exit.player.coins,a.player.coins);
});
test('待选轮次或当前指针丢失不允许继续读取',()=>{
  const s=finish(bid(budgets(catalog())));
  for(const corrupt of [x=>x.pending=null,x=>x.pending.auction.round++,x=>x.auction.activeId=null,x=>x.pending.id='old',x=>x.minutes=1438]){
    const raw=G.clone(s);corrupt(raw);assert.throws(()=>read(raw));
  }
});
test('v10迁移初始化拍卖但不赠送拍品或预扣费用，原解锁和在途行动保留',()=>{
  let s=eligible();s=act(s,'rest');s=G.advance(s,5);s.schemaVersion=10;delete s.auction;
  const before=G.clone(s),a=read(s);assert.equal(a.schemaVersion,G.VERSION);assert.deepEqual(a.auction,G.emptyAuction());
  assert.deepEqual(a.inventory,before.inventory);assert.equal(a.player.money,before.player.money);assert.equal(a.activity.elapsed,before.activity.elapsed);
  assert.ok(a.unlockedFeatures.includes('alchemy'));
});
test('新存储键显式兼容v10；损坏拍卖档保留原文且不覆盖，档间拍品独立',()=>{
  const mem={data:new Map(),getItem(k){return this.data.get(k)??null;},setItem(k,v){this.data.set(k,v);}};
  const s=catalog(),old=eligible();old.schemaVersion=10;delete old.auction;
  mem.setItem('night-courier:saves:v10',JSON.stringify({schemaVersion:10,saves:[old]}));const store=G.createStore(mem);store.load();
  assert.equal(store.saves.length,1);assert.ok(mem.getItem(G.STORAGE_KEY));assert.deepEqual(store.saves[0].auction,G.emptyAuction());
  const second=read(G.newGame('旁观客'));assert.deepEqual(second.auction,G.emptyAuction());const got=win(budgets(s,0,0));assert.equal(second.auction.wins,0);assert.equal(got.auction.wins,1);
  const damaged=G.clone(got);delete damaged.auction;const text=JSON.stringify({schemaVersion:11,saves:[damaged]});mem.setItem(G.STORAGE_KEY,text);mem.data.delete(G.BACKUP_KEY);
  const broken=G.createStore(mem);assert.deepEqual(broken.load(),[]);assert.match(broken.warning,/没有覆盖/);assert.equal(mem.getItem(G.STORAGE_KEY),text);
});
test('冻结款在现金上限内预留退款空间，退款后仍守恒',()=>{
  let s=budgets(catalog());s.daily.delivered=3;s.player.money=9999999;s=bid(s);const held=G.auctionHeld(s);s=act(s,'claim',{id:'daily'});
  assert.equal(s.player.money+held,9999999);s=finish(s);assert.equal(s.player.money,9999999);assert.equal(G.auctionHeld(s),0);
});
test('行囊容量为正在竞拍的同种物品预留，不能挤占后导致读档丢物',()=>{
  let s=budgets(catalog(),1,0,{kind:'pill',item:'heal',count:2});s.inventory.heal=9998;atomic(s,'auctionBid',{id:s.auction.lots[1].id});
  s.inventory.heal=9997;s.player.coins=100;s=bid(s,1);atomic(s,'buy',{id:'heal'});s=finish(s);assert.equal(s.inventory.heal,9999);assert.equal(read(s).inventory.heal,9999);
});

test('竞价完成时的时钟显示容忍浮点尾差，不改变真实分钟',()=>{
  const s=eligible();s.minutes=1085-4e-12;const before=JSON.stringify(s);
  assert.equal(G.clock(s),'18:05');assert.equal(G.timestamp(s.minutes),'第1日 18:05');assert.equal(JSON.stringify(s),before);
  s.minutes=1084.99;assert.equal(G.clock(s),'18:04');
  assert.equal(G.timestamp(1440-4e-12),'第2日 00:00');
});
