/* 确定性规则引擎：不访问 DOM / 网络 / localStorage，便于测试与迁移。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  const clone = x => JSON.parse(JSON.stringify(x));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  class RuleError extends Error {}
  const must = (ok, message) => { if (!ok) throw new RuleError(message); };
  G.clone = clone;
  G.clamp = clamp;
  G.day = s => Math.floor(s.minutes / 1440) + 1;
  G.isNight = s => s.minutes % 1440 >= 1080 || s.minutes % 1440 < 360;
  G.clock = s => `${String(Math.floor(s.minutes % 1440 / 60)).padStart(2, '0')}:${String(Math.floor(s.minutes % 60)).padStart(2, '0')}`;
  G.timestamp = m => `第${Math.floor(m / 1440) + 1}日 ${String(Math.floor(m % 1440 / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  G.rand = s => { let x = s.seed >>> 0 || 1; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.seed = x >>> 0; return s.seed / 4294967296; };
  const int = (s, min, max) => Math.floor(G.rand(s) * (max - min + 1)) + min;
  G.realmLevel = s => clamp(Number(s.player.realmLevel)||1,1,G.REALM_LEVELS.length);
  G.realmRank = s => s.player.realm*G.REALM_LEVELS.length+(G.realmLevel(s)-1);
  G.realmLabel = s => `${G.REALMS[s.player.realm]?.name||'凡人'}${G.REALM_LEVELS[G.realmLevel(s)-1]}`;
  G.realmAtMax = s => s.player.realm===G.REALMS.length-1&&G.realmLevel(s)===G.REALM_LEVELS.length;
  G.realmNeed = s => {
    if(G.realmAtMax(s))return 0;
    const total=G.REALMS[s.player.realm]?.need||0,level=G.realmLevel(s);
    return Math.max(1,Math.round(total*(5+level)/90));
  };
  G.nextRealmLabel = s => {
    if(G.realmAtMax(s))return null;
    const level=G.realmLevel(s);
    return level<G.REALM_LEVELS.length?`${G.REALMS[s.player.realm].name}${G.REALM_LEVELS[level]}`:`${G.REALMS[s.player.realm+1].name}${G.REALM_LEVELS[0]}`;
  };
  G.limits = s => {const rank=G.realmRank(s);return {health:100+Math.floor(rank*12/9)+(s.equipment.includes('robe')?25:0),stamina:100+Math.floor(rank*8/9),mana:60+Math.floor(rank*16/9)+(s.equipment.includes('jade')?30:0),battery:80+s.vehicle.levels.battery*35,durability:100+s.vehicle.levels.durability*30};};
  G.log = (s, text, tag = '日常') => { s.logs.push({ id: `${s.turn}-${s.logs.length}-${s.seed}`, at: s.minutes, tag, text: String(text).slice(0, 600) }); s.logs = s.logs.slice(-180); };
  G.newGame = (name, mode = 'classic', seed = Date.now()) => {
    name = String(name).trim();
    if (!name || [...name].length > 16) throw new RuleError('名字需要 1–16 个字符。');
    if (!['classic','ai'].includes(mode)) throw new RuleError('请选择有效的剧情模式。');
    const id = root.crypto?.randomUUID?.() || `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const s = {
      schemaVersion: G.VERSION, id, name, mode, createdAt: Date.now(), updatedAt: Date.now(), seed: (Number(seed) >>> 0) || 1,
      turn: 0, minutes: 480, position: 'home', residenceId: 'qingteng', gameOver: null, transport: 'bike', weather: 'clear',
      player: { money: 120, coins: 0, health: 100, stamina: 100, mana: 60, qi: 0, realm: 0, realmLevel: 1, insight: 5, constitution: 5, agility: 5, luck: 5, karma: 0, rep: 0 },
      vehicle: { battery: 80, durability: 100, levels: {speed:0,battery:0,durability:0} },
      alchemy: {cauldron:0,cauldrons:[],xp:0,brews:0,successes:0},
      inventory: {...Object.fromEntries(G.ITEMS.filter(i=>!i.unique).map(i=>[i.id,0])),qi:1,heal:1,stamina:1}, learned: [], equipment: [],
      stats: {delivered:0,earned:0,distance:0,trained:0,explored:0},
      bonds: Object.fromEntries(G.NPCS.map(n => [n.id, {met:false,affinity:0,trust:0,stage:0,path:'none',lastTalkDay:0}])),
      daily: { day:1, delivered:0, claimed:false, signedDay:0, streak:0 }, claimed: [], unlockedEndings: [], ending: null,
      flags: {firstOrder:false}, recentEvents: [], pending: null, orders: [], logs: [], lastRoute: null,
      location: null, activity: null, activeOrder: null, orderRefreshAt: 495, revision: 0
    };
    G.log(s, `你在青藤小屋醒来。白天送达一份热饭，入夜寻一条自己的仙途。${mode === 'ai' ? '本存档使用 AI 剧情；接口不可用时采用经典事件。' : '本存档使用经典剧情。'}`, '启程');
    G.refreshOrders(s);
    return s;
  };
  const EPS = 1e-8;
  const point = p => ({x:p.x,y:p.y});
  const distance = (a,b) => (Math.abs(a.x-b.x)+Math.abs(a.y-b.y))*G.WORLD.metersPerUnit;
  const nodes = G.ROAD_NODES;
  const links = nodes.map(()=>[]);
  for (const {from,to} of G.ROAD_EDGES) { links[from].push(to); links[to].push(from); }
  // 节点缓存上限就是地图节点数；途中仅缓存一个起点，避免按帧积累坐标。
  const nodeSearches=new Map();let roadSearch=null;
  function searchRoads(from,anchors){
    const exact=anchors.length===1&&from.x===nodes[anchors[0]].x&&from.y===nodes[anchors[0]].y;
    const key=`${from.x}:${from.y}`,cached=exact?nodeSearches.get(anchors[0]):roadSearch?.key===key?roadSearch.value:null;
    if(cached)return cached;
    const dist=Array(nodes.length).fill(Infinity),prev=Array(nodes.length).fill(-1),visited=new Set();
    for(const i of anchors)dist[i]=distance(from,nodes[i]);
    while(visited.size<nodes.length){
      let u=-1;
      for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(u<0||dist[i]<dist[u]))u=i;
      if(u<0||!Number.isFinite(dist[u]))break;visited.add(u);
      for(const v of links[u]){const d=dist[u]+distance(nodes[u],nodes[v]);if(d<dist[v]){dist[v]=d;prev[v]=u;}}
    }
    const value={dist,prev};
    if(exact)nodeSearches.set(anchors[0],value);else roadSearch={key,value};
    return value;
  }
  // 途中坐标必须位于真实路段；虚拟起点连接该路段两端，不能吸附或穿江。
  G.roadAnchors = p => {
    if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y))return [];
    const exact=nodes.findIndex(n=>Math.abs(n.x-p.x)<EPS&&Math.abs(n.y-p.y)<EPS);
    if(exact>=0)return [exact];
    for(let i=0;i<nodes.length;i++)for(const j of links[i]){
      if(j<i)continue;const a=nodes[i],b=nodes[j];
      if(Math.abs(distance(a,p)+distance(p,b)-distance(a,b))<EPS &&
         ((a.x===b.x&&Math.abs(p.x-a.x)<EPS)||(a.y===b.y&&Math.abs(p.y-a.y)<EPS)))return [i,j];
    }
    return [];
  };
  G.playerPoint = s => point(G.place(s.position)||s.location||G.place('home'));
  G.locationName = s => G.place(s.position)?.name || '道路途中';
  G.route = (fromId, toId) => {
    const from=typeof fromId==='string'?G.place(fromId):fromId,to=G.place(toId);
    const anchors=G.roadAnchors(from);must(anchors.length&&to,'找不到合法的道路位置。');
    const end=nodes.findIndex(n=>n.x===to.x&&n.y===to.y);
    const {dist,prev}=searchRoads(from,anchors);
    must(end>=0&&Number.isFinite(dist[end]),'目的地没有连通道路。');
    const points=[];for(let cur=end;cur>=0;cur=prev[cur])points.unshift(point(nodes[cur]));
    if(distance(from,points[0])>EPS)points.unshift(point(from));
    return {from:typeof fromId==='string'?fromId:null,to:toId,points,meters:dist[end]};
  };
  G.routeFrom = (s,target) => G.route(G.playerPoint(s),target);
  G.movementRates = (s,transport=s.transport) => {
    const bike=transport==='bike';
    let speed=bike?22+4*s.vehicle.levels.speed:(4.5+s.player.agility*.08)*(s.learned.includes('lightstep')?1.3:1);
    if(bike&&s.vehicle.durability<=20+EPS)speed*=.7;
    speed*=(G.WEATHER.find(w=>w.id===s.weather)||G.WEATHER[0]).speed;
    return {speed,metersPerMinute:speed*1000/60,battery:bike?.005:0,
      stamina:(bike?2.5:8)*Math.max(.55,1-s.player.constitution*.01)/1000,
      wear:bike?.0006/(1+s.vehicle.levels.durability*.3):0};
  };
  G.travelPlan = (s,target,transport=s.transport) => {
    const r=G.routeFrom(s,target),rates=G.movementRates(s,transport),km=r.meters/1000;
    return {...r,transport,speed:rates.speed,km,minutes:r.meters/rates.metersPerMinute,
      battery:r.meters*rates.battery,stamina:r.meters*rates.stamina,wear:r.meters*rates.wear};
  };
  G.travelBlock = (s,p) => {
    if(p.meters>EPS&&p.transport==='bike'&&s.vehicle.battery<=EPS)return '电动车没电了，请切换步行，或在当前位置充电。';
    if(p.meters>EPS&&p.transport==='bike'&&s.vehicle.durability<=EPS)return '车况为零，无法骑行。请步行到修车铺维修。';
    if(s.vehicle.battery+EPS<p.battery)return `电量不足：需要 ${p.battery.toFixed(1)}，当前 ${s.vehicle.battery.toFixed(1)}。可切换步行。`;
    if(s.player.stamina+EPS<p.stamina)return `体力不足：需要 ${p.stamina.toFixed(1)}，请先休息或服药。`;
    return '';
  };
  G.durationText = minutes => `${Math.max(0,Math.ceil(minutes-EPS))} 分钟`;
  const homeOf = s => G.residence(s.residenceId) || G.residence('qingteng') || G.RESIDENCES[0];
  G.currentResidence = homeOf;
  G.residenceRecoveryText = home => {
    const names={health:'气血',stamina:'体力',mana:'灵力',battery:'电量'},parts=[];
    for(const key of ['health','stamina','mana','battery']){
      if(home.full.includes(key))parts.push(`${names[key]}补满`);
      else if(home.recovery[key]>0)parts.push(`${names[key]} +${home.recovery[key]}`);
    }
    return parts.join(' · ') || '仅提供住宿';
  };
  G.cauldron = s => G.CAULDRONS[s.alchemy?.cauldron || 0] || G.CAULDRONS[0];
  G.alchemyRank = s => {
    const xp=s.alchemy?.xp||0;let rank=0;
    for(let i=1;i<G.ALCHEMY_RANKS.length;i++)if(xp>=G.ALCHEMY_RANKS[i].need)rank=i;
    return rank;
  };
  G.alchemistTier = s => G.ALCHEMY_RANKS[G.alchemyRank(s)]?.tier || 1;
  G.alchemyRecipe = id => G.ALCHEMY_RECIPES.find(r=>r.id===id);
  G.alchemyMaterial = id => G.ALCHEMY_MATERIALS.find(m=>m.id===id);
  G.alchemyMaterials = recipe => recipe?.materials || (recipe?.herbs ? {herb:recipe.herbs} : {});
  G.alchemyMaterialText = recipe => Object.entries(G.alchemyMaterials(recipe)).map(([id,count])=>`${G.alchemyMaterial(id)?.name || G.ITEMS.find(i=>i.id===id)?.name || id} ×${count}`).join(' · ');
  G.alchemyUnlocked = (s,recipe) => !!recipe && s.player.realm>=recipe.realm && (s.alchemy?.xp||0)>=recipe.need;
  G.alchemyCauldronReady = (s,recipe) => !!recipe && (G.cauldron(s).tier||0)>=recipe.minCauldronTier;
  G.alchemyChance = (s,recipe) => clamp(recipe.base+s.player.insight*.007+G.cauldron(s).success+(G.alchemistTier(s)-1)*.015,.20,.98);
  G.alchemyExtraChance = s => clamp(G.cauldron(s).extra+(G.alchemistTier(s)-1)*.02,0,.65);
  G.alchemyPillTier = (s,roll=0) => {
    const cap=Math.max(1,Math.min(G.cauldron(s).tier||1,G.alchemistTier(s))),quality=roll+s.player.insight*.004+(G.cauldron(s).quality||0);
    return quality>=.78?cap:quality>=.40?Math.max(1,cap-1):Math.max(1,cap-2);
  };
  G.pillItemId = (typeId,tier) => G.PILL_ITEM_ID(typeId,clamp(Math.floor(tier)||1,1,9));
  G.pillType = id => G.PILL_TYPES.find(p=>p.id===id);
  G.pillCount = (s,typeId) => Array.from({length:9},(_,i)=>s.inventory[G.pillItemId(typeId,i+1)]||0).reduce((a,b)=>a+b,0);
  G.highestPillTier = (s,typeId) => {for(let tier=9;tier>=1;tier--)if((s.inventory[G.pillItemId(typeId,tier)]||0)>0)return tier;return 0;};
  G.consumeHighestPill = (s,typeId) => {const tier=G.highestPillTier(s,typeId);if(!tier)return 0;s.inventory[G.pillItemId(typeId,tier)]--;return tier;};
  G.breakthroughPillBonus = tier => tier?G.pillType('foundation').breakBonus(clamp(Number(tier)||1,1,9)):0;
  G.effectNames = {money:'现金',coins:'外卖币',health:'气血',stamina:'体力',mana:'灵力',qi:'修为',insight:'悟性',constitution:'根骨',agility:'身法',luck:'机缘',karma:'善缘',rep:'口碑',fragments:'碎玉',herb:'青灵草',affinity:'好感',trust:'信任'};
  G.effectText = effects => Object.entries(effects || {}).filter(([,v])=>v).map(([k,v])=>`${G.effectNames[k]||k} ${v > 0 ? '+' : ''}${v}`).join(' · ') || '不改变属性';
  G.effectBlock = (s, effects, itemCost = {}) => {
    for (const [key,value] of Object.entries(effects || {})) if (value < 0 && ['money','coins','stamina','mana'].includes(key) && s.player[key] < -value) return `需要${G.effectNames[key]} ${-value}，当前 ${Math.floor(s.player[key])}。`;
    for (const [id,count] of Object.entries(itemCost || {})) if ((s.inventory[id]||0) < count) return `需要 ${G.ITEMS.find(i=>i.id===id)?.name || id} ×${count}。`;
    return '';
  };
  function effects(s, e = {}, npcId, itemCost = {}) {
    const error = G.effectBlock(s,e,itemCost); must(!error,error);
    for (const [id,count] of Object.entries(itemCost)) s.inventory[id] -= count;
    for (const [k,v] of Object.entries(e)) {
      if (Object.hasOwn(s.player,k)) s.player[k] += v;
      else if (k === 'fragments') s.inventory.fragment = (s.inventory.fragment||0)+v;
      else if (k === 'herb') s.inventory.herb = (s.inventory.herb||0)+v;
      else if (['affinity','trust'].includes(k) && npcId) s.bonds[npcId][k] += v;
    }
    normalize(s);
  }
  function normalize(s) {
    const caps = G.limits(s);
    for (const key of ['health','stamina','mana']) s.player[key] = clamp(s.player[key],0,caps[key]);
    for (const key of ['insight','constitution','agility','luck']) s.player[key] = clamp(s.player[key],1,99);
    s.player.money = clamp(Math.round(s.player.money),0,9999999); s.player.coins = clamp(Math.round(s.player.coins),0,999999);
    s.player.qi = clamp(s.player.qi,0,999999); s.player.rep = clamp(s.player.rep,-50,100); s.player.karma = clamp(s.player.karma,-50,100);
    s.vehicle.battery = clamp(s.vehicle.battery,0,caps.battery); s.vehicle.durability = clamp(s.vehicle.durability,0,caps.durability);
    for (const bond of Object.values(s.bonds)) {bond.affinity=clamp(bond.affinity,0,100);bond.trust=clamp(bond.trust,0,100);}
  }
  G.ORDER_OFFER_MINUTES = Object.freeze({urgent:18,ordinary:36,careful:42,night:30,mystic:32});
  G.orderOfferLifetime = order => G.ORDER_OFFER_MINUTES[order?.condition] || G.ORDER_OFFER_MINUTES.ordinary;
  G.orderOfferRemaining = (s,order) => Math.max(0,(order?.expiresAt ?? s.minutes)-s.minutes);
  G.refreshOrders = s => {
    // expiresAt 为未接订单从地图消失的时间；接单后不再作为送达时限。
    s.orders=s.orders.filter(o=>o.expiresAt>s.minutes+EPS&&o.id!==s.activeOrder?.id);
    const used=new Set([...s.orders.map(o=>o.target),s.activeOrder?.target]);
    const pool=G.PLACES.filter(p=>p.id!==s.position&&!used.has(p.id));
    const distances=new Map(pool.map(p=>[p.id,G.routeFrom(s,p.id).meters]));
    pool.sort((a,b)=>distances.get(a.id)-distances.get(b.id));
    const count=G.isNight(s)?4:6;
    while(s.orders.length<count&&pool.length){
      const i=s.orders.length,idx=int(s,0,i<2?Math.min(7,pool.length-1):pool.length-1),place=pool.splice(idx,1)[0];
      const available=G.ORDER_TYPES.filter(t=>(t.condition!=='night'||G.isNight(s))&&(t.condition!=='mystic'||s.player.realm>=1));
      const type=available[int(s,0,available.length-1)],plan=G.travelPlan(s,place.id);
      s.orders.push({id:`o-${s.turn}-${i}-${s.seed}`,target:place.id,title:type.title,desc:type.desc,condition:type.condition,
        expiresAt:s.minutes+G.orderOfferLifetime(type),
        reward:Math.round(12+plan.km*6+type.tip+Math.max(0,s.player.rep)*.08),coins:Math.min(6,2+Math.floor(plan.km/1.5)),
        npc:G.NPCS.find(n=>n.place===place.id)?.id||null});
    }
  };
  function event(s, kind, overrides = {}) {
    let base;
    if (kind === 'delivery' && !s.flags.firstOrder) { base=G.EVENTS.find(e=>e.id==='first-order'); s.flags.firstOrder=true; }
    else {
      let pool=G.EVENTS.filter(e=>e.kind===kind && e.id!=='first-order' && !s.recentEvents.includes(e.id) && (!e.encounterNpc || !s.bonds[e.encounterNpc]?.met));
      if (!pool.length) pool=G.EVENTS.filter(e=>e.kind===kind && e.id!=='first-order' && (!e.encounterNpc || !s.bonds[e.encounterNpc]?.met));
      if (!pool.length) pool=G.EVENTS.filter(e=>e.kind===kind && e.id!=='first-order' && !e.encounterNpc);
      base=pool[int(s,0,pool.length-1)];
    }
    if(base.encounterNpc&&s.bonds[base.encounterNpc]&&!s.bonds[base.encounterNpc].met){s.bonds[base.encounterNpc].met=true;const npc=G.NPCS.find(n=>n.id===base.encounterNpc);if(npc)G.log(s,`你在一段意外的相逢中结识了${npc.name}。从现在起，可以在「羁绊」中找到对方。`,'相逢');}
    s.recentEvents=[...s.recentEvents,base.id].slice(-4);
    s.pending={...clone(base),id:`event-${s.turn}-${s.seed}`,templateId:base.id,source:'classic',aiStatus:s.mode==='ai' && base.id!=='first-order'?'unrequested':'skip',...overrides};
  }
  function settleDelivery(s, ticket) {
    const reward=ticket.reward,coins=ticket.coins;
    s.player.money+=reward;s.player.coins+=coins;s.stats.earned+=reward;s.stats.delivered++;s.daily.delivered++;
    s.player.rep=clamp(s.player.rep+1,-50,100);
    if(ticket.npc){const bond=s.bonds[ticket.npc];const npc=G.NPCS.find(n=>n.id===ticket.npc);if(!bond.met){bond.met=true;if(npc)G.log(s,`这一单让你第一次正式结识${npc.name}。对方已出现在「羁绊」中。`,'相逢');}bond.affinity=clamp(bond.affinity+3,0,100);}
    G.log(s, `送达「${ticket.title}」至${G.place(ticket.target).name}。现金 +¥${reward}，外卖币 +${coins}。`, '配送');
  }
  G.breakChance = (s, pillTier=0) => clamp(53+s.player.insight*2+Math.max(0,s.player.karma)*.12+(G.isNight(s)?10:0)+G.breakthroughPillBonus(pillTier===true?1:pillTier)-s.player.realm*3-(G.realmLevel(s)-1)*1.25,35,95);
  G.upgradeCost = (s, kind) => 90 + (s.vehicle.levels[kind]||0)*85;
  G.questReady = (s,q) => s.stats.delivered>=q.delivery && s.player.realm>=q.realm;
  G.choiceBlock = (s,c) => {
    if (c.minTrust && s.pending?.npcId && s.bonds[s.pending.npcId].trust<c.minTrust) return `需要信任 ${c.minTrust}。`;
    return G.effectBlock(s,c.effects,c.itemCost);
  };
  G.endingOptions = s => [
    {id:'guardian',ready:s.stats.delivered>=25&&s.player.realm>=2&&(s.inventory.fragment||0)>=3&&s.player.karma>=5,requirement:'25 单 · 筑基 · 3 枚碎玉 · 善缘 5'},
    {id:'ascend',ready:s.player.realm>=5&&s.stats.delivered>=40,requirement:'化神 · 40 单'},
    {id:'ordinary',ready:s.stats.delivered>=20&&s.player.money>=500,requirement:'20 单 · 现金 ¥500'},
    {id:'bond',ready:s.stats.delivered>=20&&Object.values(s.bonds).some(b=>b.path==='romance'&&b.stage>=4&&b.affinity>=60),requirement:'20 单 · 完成一条情感线 · 好感 60'},
    {id:'friendship',ready:s.stats.delivered>=25&&Object.values(s.bonds).filter(b=>b.stage>=4).length>=3,requirement:'25 单 · 完成至少三位朋友的故事'}
  ];
  const instantWhileBusy = new Set(['buy','sign','claim','stop']);
  G.canStop = s => !!s.activity && !['choice','rescue'].includes(s.activity.kind);
  function locate(s,p){
    s.location=point(p);
    s.position=G.PLACES.find(n=>distance(n,p)<EPS)?.id||null;
  }
  G.pointOnRoute = (route,meters) => {
    let remaining=clamp(meters,0,route.meters);
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i],length=distance(a,b);
      if(remaining<=length+EPS){const t=length?clamp(remaining/length,0,1):1;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
      remaining-=length;
    }
    return point(route.points.at(-1));
  };
  const workDuration = (kind,p={}) => ({rest:60,sleep:480,visit:20,breakthrough:60,explore:30,charge:G.CHARGE.minutes,repair:30,upgrade:45,heal:30,meal:20,rescue:180,
    cultivate:p.kind==='meditate'?90:p.kind==='body'?30:45,alchemy:G.alchemyRecipe(p.recipe)?.duration||0,choice:p.duration||0})[kind]||0;
  function startWork(s,a){
    a.phase='work';a.elapsed=0;a.recovery={};
    const cap=G.limits(s);
    const full=(key)=>Math.max(0,cap[key]-(key==='battery'||key==='durability'?s.vehicle[key]:s.player[key]));
    switch(a.kind){
      case 'rest':a.recovery={health:8,stamina:38,mana:10};break;
      case 'sleep':{
        const home=G.residence(a.params.id);a.recovery={...home.recovery};
        for(const key of home.full)a.recovery[key]=full(key);break;
      }
      case 'charge':a.recovery={battery:full('battery')};break;
      case 'repair':a.recovery={durability:full('durability')};break;
      case 'heal':a.recovery={health:full('health')};break;
      case 'meal':a.recovery={health:10,stamina:45};break;
    }
  }
  function begin(s,kind,params={},target=null){
    const route=target?G.routeFrom(s,target):null;
    if(route&&kind!=='rescue'){const error=G.travelBlock(s,G.travelPlan(s,target));must(!error,error);}
    const a={kind,params:clone(params),target,phase:route?.meters>EPS?'travel':'work',duration:workDuration(kind,params),elapsed:0,startedAt:s.minutes,
      route,travelled:0,recovery:{},gainedQi:0};
    s.activity=a;
    if(a.phase==='work')startWork(s,a);
    return a;
  }
  function markComplete(s,kind){
    s.activity=null;s.turn++;s.revision++;normalize(s);
    if(s.player.health<=EPS){beginRescue(s);return;}
    G.refreshOrders(s);
    G.afterWorldAction?.(s,kind);
  }
  function finishChoice(s,p,index){
    const c=p.choices[index];
    // Spendable negative costs were paid once when the choice was committed.
    const result=Object.fromEntries(Object.entries(c.effects||{}).filter(([k,v])=>!(v<0&&['money','coins','stamina','mana'].includes(k))));
    effects(s,result,p.npcId);
    if(p.npcId){if(p.npcAdvance)s.bonds[p.npcId].stage++;if(c.path)s.bonds[p.npcId].path=c.path;}
    G.log(s,`${c.result}（${G.effectText(c.effects)}）`,p.npcId?'羁绊':p.source==='ai'?'AI 奇遇':'奇遇');
    if(p.delivery)settleDelivery(s,p.delivery);
  }
  function finishVisit(s,id){
    const npc=G.NPCS.find(n=>n.id===id),bond=s.bonds[id];bond.lastTalkDay=G.day(s);
    const stage=bond.stage,advanced=stage<4&&bond.affinity>=[0,10,24,40][stage];
    if(advanced){const [title,text,...choices]=npc.arc[stage];s.pending={id:`npc-${s.turn}-${s.seed}`,kind:'social',title,text,choices:clone(choices),npcId:id,npcAdvance:true,source:'classic',aiStatus:'skip'};}
    else s.pending={id:`npc-talk-${s.turn}-${s.seed}`,kind:'social',title:`与${npc.name}的片刻`,text:stage>=4?'你们说起最近的生活。有些关系走到后来，最珍贵的恰是这些不必特别发生的日常。':`${npc.name}问你今天过得怎么样。再多一点陪伴，也许你们就能谈起更深的往事。`,choices:[{label:'分享今天见到的小事',result:'你们聊得很开心。',effects:{affinity:5,trust:2}},{label:'认真听对方说话',result:'被倾听的感觉，让你们更亲近了一些。',effects:{affinity:4,trust:3}},{label:'带一份热饭一起吃',result:'两个人分一份热饭，也分担了一些疲惫。',effects:{money:-12,affinity:7,stamina:8}}],npcId:id,npcAdvance:false,source:'classic',aiStatus:s.mode==='ai'?'unrequested':'skip'};
    G.log(s,`拜访${npc.name}，交谈 20 分钟。`,'拜访');
  }
  function deliverAtDestination(s){
    const ticket=s.activeOrder;if(!ticket)return;
    s.activeOrder=null;
    if(!s.flags.firstOrder||G.rand(s)<Math.min(.8,.5+s.player.luck*.01))event(s,'delivery',{delivery:clone(ticket)});
    else settleDelivery(s,ticket);
  }
  function finish(s,a){
    switch(a.kind){
      case 'travel':
        G.log(s,`抵达${G.place(a.target).name}，沿道路行进 ${(a.route.meters/1000).toFixed(2)} 公里。`,'出行');
        if(s.activeOrder?.target===a.target)deliverAtDestination(s);break;
      case 'deliver':deliverAtDestination(s);break;
      case 'moveHome':{
        const home=G.residence(a.params.id);s.residenceId=home.id;
        G.log(s,`搬入${home.name}。周租 ¥${home.rent}；睡眠恢复：${G.residenceRecoveryText(home)}。`,'生活');break;
      }
      case 'rest':G.log(s,'原地休息完成。已按实际休息时长恢复体力、气血与灵力。','休息');break;
      case 'sleep':G.log(s,`在${G.residence(a.params.id).name}睡了八小时，住宿恢复已逐步生效。`,'休息');break;
      case 'cultivate':
        s.stats.trained++;
        if(a.params.kind==='body'&&s.stats.trained%3===0)effects(s,{constitution:1,agility:1});
        if(a.params.kind!=='body'&&s.stats.trained%4===0)effects(s,{insight:1});
        G.log(s,`修炼 ${a.duration} 分钟完成，修为 +${a.gainedQi.toFixed(1)}。昼夜与灵地加成按实际修炼时段计算。`,'修炼');
        if(G.rand(s)<Math.min(.7,.18+s.player.luck*.012))event(s,'cultivation');break;
      case 'breakthrough':{
        const need=a.params.need;
        if(G.rand(s)*100<a.params.chance){
          const major=G.realmLevel(s)===G.REALM_LEVELS.length;
          if(major){s.player.realm++;s.player.realmLevel=1;effects(s,{health:12,stamina:8,mana:16,insight:1,constitution:1,agility:1});G.log(s,`大境突破成功，踏入${G.realmLabel(s)}。`,'破境');}
          else{s.player.realmLevel++;effects(s,{health:2,stamina:1,mana:2});G.log(s,`突破成功，修为稳固至${G.realmLabel(s)}。`,'破境');}
        }else{s.player.qi+=need-Math.floor(need*.25);const protectedByCharm=(s.inventory.charm||0)>0;if(protectedByCharm)s.inventory.charm--;else s.player.health-=18;G.log(s,`突破未成，退回 75% 左右修为。${protectedByCharm?'护身符消散，护住经脉。':'气血 -18。'}`,'破境');}break;
      }
      case 'alchemy':{
        const recipe=G.alchemyRecipe(a.params.recipe),success=G.rand(s)<G.alchemyChance(s,recipe);
        let count=0,tier=0;
        if(success){
          tier=G.alchemyPillTier(s,G.rand(s));count=1;if(G.rand(s)<G.alchemyExtraChance(s))count++;
          const itemId=G.pillItemId(recipe.product,tier);s.inventory[itemId]=(s.inventory[itemId]||0)+count;s.alchemy.successes++;
        }
        s.alchemy.brews++;s.alchemy.xp+=success?1+Math.ceil(recipe.complexity/3):1;
        const rank=G.ALCHEMY_RANKS[G.alchemyRank(s)].name,pill=G.pillType(recipe.product);
        G.log(s,success?`按${recipe.name}，以${G.cauldron(s).name}炼成${tier}阶${pill.name} ×${count}。炼药熟练度 ${s.alchemy.xp}，当前 ${rank}。`:`按${recipe.name}开炉失败，药力散去。药材已消耗；炼药熟练度 +1。`,'炼药');break;
      }
      case 'explore':{
        s.stats.explored++;
        const maxTier=Math.min(9,1+s.player.realm*2+(s.position==='temple'?1:0)),pool=G.ALCHEMY_MATERIALS.filter(m=>m.realm<=s.player.realm&&m.tier<=maxTier);
        const chance=Math.min(.45,.05+s.player.luck*.01),roll=G.rand(s);
        if(pool.length&&roll<chance){const bias=G.isNight(s)?3:0,material=pool[(Math.floor(roll/Math.max(chance,EPS)*pool.length)+bias)%pool.length];s.inventory[material.id]=(s.inventory[material.id]||0)+1;G.log(s,`探索时额外发现${material.name} ×1。`,'机缘');}
        event(s,'explore');G.log(s,`在${G.locationName(s)}探索半小时，遇见一段新的故事。`,'探索');break;
      }
      case 'visit':finishVisit(s,a.params.id);break;
      case 'charge':G.log(s,'充电完成，电量已补满。','电动车');break;
      case 'repair':G.log(s,'维修完成，车况已恢复。','电动车');break;
      case 'upgrade':{
        const kind=a.params.kind;s.vehicle.levels[kind]++;
        if(kind==='battery')s.vehicle.battery=G.limits(s).battery;if(kind==='durability')s.vehicle.durability=G.limits(s).durability;
        G.log(s,`升级${{speed:'速度',battery:'电池容量',durability:'耐用性'}[kind]}至 ${s.vehicle.levels[kind]} 级。`,'电动车');break;
      }
      case 'heal':G.log(s,'医馆治疗完成，气血已恢复。','生活');break;
      case 'meal':G.log(s,'吃完一碗热面，体力与气血已逐步恢复。','生活');break;
      case 'choice':finishChoice(s,a.params.event,a.params.index);break;
      case 'rescue':{
        const fee=Math.min(60,s.player.money);s.player.money-=fee;s.player.health=45;s.player.stamina=Math.max(35,s.player.stamina);
        G.log(s,`你在医馆醒来，治疗扣除 ¥${fee}。别再把自己逼得太紧。`,'救助');break;
      }
    }
    markComplete(s,a.kind==='choice'?'choose':a.kind);
  }
  function arrive(s,a){
    locate(s,G.place(a.target));s.lastRoute=clone(a.route);s.revision++;
    if(a.duration>0){startWork(s,a);G.log(s,`抵达${G.place(a.target).name}，开始${G.activityLabel(a)}。`,'出行');}
    else finish(s,a);
  }
  function beginRescue(s){
    begin(s,'rescue',{},'clinic');G.log(s,'你倒在路边。路人正沿道路将你送往医馆，随后需要治疗三小时。','救助');
  }
  G.activityLabel = a => ({travel:'赶路',deliver:'配送',moveHome:'搬家',sleep:'睡眠',visit:'交谈',rest:'休息',cultivate:'修炼',breakthrough:'突破',alchemy:'炼药',explore:'探索',charge:'充电',repair:'维修',upgrade:'升级座驾',heal:'治疗',meal:'用餐',choice:'处理事件',rescue:'救助'})[a?.kind]||'原地停留';
  G.activityRemaining = s => {
    const a=s.activity;if(!a)return 0;
    return a.phase==='travel'?(a.route.meters-a.travelled)/(a.kind==='rescue'?500:G.movementRates(s).metersPerMinute)+a.duration:Math.max(0,a.duration-a.elapsed);
  };
  function calendar(s){
    const day=G.day(s);s.daily.day=day;s.daily.delivered=0;s.daily.claimed=false;
    if(day%7===0){
      const home=homeOf(s);
      if(s.player.money<home.rent){s.gameOver={reason:'rent',day,residenceId:home.id,rent:home.rent,money:s.player.money};G.log(s,`${home.name}房租到期，需要 ¥${home.rent}，但你只有 ¥${s.player.money}。这段旅程到此结束。`,'结局');s.revision++;return;}
      s.player.money-=home.rent;G.log(s,`本周${home.name}房租扣除 ¥${home.rent}。`,'生活');
    }
    s.weather=G.WEATHER[int(s,0,G.WEATHER.length-1)].id;
    G.log(s,`新的一天。天气：${G.WEATHER.find(w=>w.id===s.weather).name}。每日委托与签到已更新。`,'晨光');s.revision++;
  }
  function resourceRate(s,a){
    if(a.kind==='explore')return 12/30;
    if(a.kind==='cultivate')return (a.params.kind==='meditate'?24:a.params.kind==='body'?20:12)/a.duration;
    return 0;
  }
  function progressWork(s,a,dt){
    const cap=G.limits(s),fraction=dt/a.duration;
    for(const [key,total] of Object.entries(a.recovery)){
      const owner=['battery','durability'].includes(key)?s.vehicle:s.player;
      owner[key]=Math.min(cap[key],owner[key]+total*fraction);
      if(cap[key]-owner[key]<EPS)owner[key]=cap[key];
    }
    s.player.stamina=Math.max(0,s.player.stamina-resourceRate(s,a)*dt);
    if(a.kind==='cultivate'){
      const kind=a.params.kind,base=kind==='meditate'?32:kind==='body'?9:17;
      const gain=base*(G.isNight(s)?1.45:1)*(s.position==='temple'?1.25:1)*(s.learned.includes('breathing')?1.3:1)*(1+s.player.insight*.015)*fraction;
      s.player.qi+=gain;a.gainedQi+=gain;if(kind!=='body')s.player.mana=Math.min(cap.mana,s.player.mana+12*fraction);
    }
    a.elapsed+=dt;
  }
  // Pure simulation: one game clock, exact event boundaries, no DOM/Date timers.
  // A caller supplies elapsed GAME minutes. A pending event discards the unused
  // interval, so time spent reading (or waiting for AI) can never be caught up.
  G.advance = (original,minutes) => {
    must(Number.isFinite(minutes)&&minutes>=0&&minutes<=1440,'时间增量无效。');
    if(!minutes||original.gameOver||original.pending||original.ending)return original;
    const s=clone(original);let remaining=minutes;
    if(!Number.isFinite(s.orderRefreshAt)||s.orderRefreshAt<=s.minutes+EPS)s.orderRefreshAt=(Math.floor(s.minutes/15)+1)*15;
    while(remaining>EPS&&!s.gameOver&&!s.pending&&!s.ending){
      const a=s.activity,oldDay=G.day(s),now=s.minutes;
      if(a?.phase==='travel'&&a.route.meters-a.travelled<=EPS){arrive(s,a);continue;}
      if(a?.phase==='work'&&a.duration-a.elapsed<=EPS){finish(s,a);continue;}
      const midnight=G.day(s)*1440;
      const phaseBoundary=Math.floor(now/1440)*1440+([360,1080,1440].find(m=>m>now%1440)||1440);
      const expiry=Math.min(Infinity,...s.orders.map(o=>o.expiresAt).filter(t=>t>now+EPS));
      let dt=Math.min(remaining,1,midnight-now,phaseBoundary-now,s.orderRefreshAt-now,expiry-now);
      let rates=null;
      if(a?.phase==='travel'){
        rates=a.kind==='rescue'?{metersPerMinute:500,stamina:0,battery:0,wear:0}:G.movementRates(s);
        let available=a.route.meters-a.travelled;
        if(rates.stamina)available=Math.min(available,s.player.stamina/rates.stamina);
        if(rates.battery)available=Math.min(available,s.vehicle.battery/rates.battery);
        if(rates.wear)available=Math.min(available,s.vehicle.durability/rates.wear);
        if(available<=EPS){s.activity=null;G.log(s,'资源不足，已停在当前道路位置。请休息、充电或切换步行后继续。','出行');s.revision++;continue;}
        if(rates.wear&&s.vehicle.durability>20+EPS)available=Math.min(available,(s.vehicle.durability-20)/rates.wear);
        dt=Math.min(dt,available/rates.metersPerMinute);
      }else if(a){
        dt=Math.min(dt,a.duration-a.elapsed);
        const rate=resourceRate(s,a);if(rate)dt=Math.min(dt,s.player.stamina/rate);
        if(rate&&s.player.stamina<=EPS&&a.duration-a.elapsed>EPS){s.activity=null;G.log(s,'体力不足，当前行动已停止。已获得的恢复和修为保留。','行动');s.revision++;continue;}
      }
      if(dt<=0)throw new RuleError('时间边界无效，已停止推进。');
      if(a?.phase==='travel'){
        const meters=Math.min(a.route.meters-a.travelled,rates.metersPerMinute*dt);
        s.player.stamina=Math.max(0,s.player.stamina-meters*rates.stamina);
        s.vehicle.battery=Math.max(0,s.vehicle.battery-meters*rates.battery);
        s.vehicle.durability=Math.max(0,s.vehicle.durability-meters*rates.wear);
        a.travelled+=meters;s.stats.distance+=meters;locate(s,G.pointOnRoute(a.route,a.travelled));
      }else if(a)progressWork(s,a,dt);
      s.minutes=now+dt;remaining=Math.max(0,remaining-dt);
      if(Math.abs(s.minutes-midnight)<EPS)s.minutes=midnight;
      if(G.day(s)!==oldDay)calendar(s);
      // Rent has priority over a delivery or move-home completing at midnight.
      if(s.gameOver)break;
      const count=s.orders.length;s.orders=s.orders.filter(o=>o.expiresAt>s.minutes+EPS);
      if(count!==s.orders.length)s.revision++;
      if(s.minutes+EPS>=s.orderRefreshAt){G.refreshOrders(s);s.orderRefreshAt+=15;s.revision++;}
      if(a===s.activity){
        if(a?.phase==='travel'&&a.route.meters-a.travelled<EPS)arrive(s,a);
        else if(a?.phase==='work'&&a.duration-a.elapsed<EPS)finish(s,a);
      }
    }
    normalize(s);s.updatedAt=Date.now();return s;
  };
  G.perform = (original,action,payload={}) => {
    const s=clone(original);
    try{
      must(!s.gameOver,'这段旅程已经结束，请返回开始页创建新存档。');
      must(!s.pending||action==='choose','请先完成当前事件的选择。');
      must(!s.ending||action==='continue','请先选择继续游历，或返回开始页。');
      must(!s.activity||instantWhileBusy.has(action),'当前行动仍在进行，请先停止。');
      switch(action){
        case 'stop':
          must(G.canStop(s),'当前行动不能中断。');
          G.log(s,`停止${G.activityLabel(s.activity)}。已发生的消耗不会返还，已获得的恢复与修为保留。${s.activeOrder?'配送订单仍在计时。':''}`,'行动');s.activity=null;break;
        case 'transport':
          must(['bike','walk'].includes(payload.mode),'出行方式无效。');s.transport=payload.mode;
          G.log(s,`出行方式改为${payload.mode==='bike'?'骑电动车':'步行推车'}。`,'出行');break;
        case 'travel':
          must(G.place(payload.target),'目的地不存在。');must(payload.target!==s.position,'你已经在这里。');
          begin(s,'travel',{},payload.target);G.log(s,`出发前往${G.place(payload.target).name}。`,'出行');break;
        case 'deliver':{
          must(!s.activeOrder,'已有未完成订单，请继续配送或明确取消。');
          const ticket=s.orders.find(o=>o.id===payload.id);must(ticket,'这张订单已经从地图消失，请重新查看。');
          must(ticket.expiresAt>s.minutes+EPS,'这张订单已经从地图消失，请重新查看。');
          const plan=G.travelPlan(s,ticket.target),block=G.travelBlock(s,plan);must(!block,block);
          if(ticket.condition==='mystic')must(s.player.mana>=8,'灵异订单需要至少 8 点灵力。');
          if(ticket.condition==='careful')must(s.player.stamina-plan.stamina>=10,'易损餐品需要抵达时仍有至少 10 点体力。');
          begin(s,'deliver',{},ticket.target);s.activeOrder=clone(ticket);s.orders=s.orders.filter(o=>o.id!==ticket.id);
          if(ticket.condition==='mystic')s.player.mana-=8;
          G.log(s,`接下「${ticket.title}」，正前往${G.place(ticket.target).name}。订单已锁定，不再受地图消失时间影响；送达并处理事件后才结算报酬。`,'接单');break;
        }
        case 'resumeDelivery':
          must(s.activeOrder,'没有待配送的订单。');begin(s,'deliver',{},s.activeOrder.target);G.log(s,'继续配送当前订单。','接单');break;
        case 'cancelDelivery':
          must(s.activeOrder,'没有待配送的订单。');G.log(s,`取消「${s.activeOrder.title}」，不发放报酬。`,'配送');s.activeOrder=null;break;
        case 'choose':{
          must(s.pending&&payload.eventId===s.pending.id,'这次事件已经处理，请勿重复结算。');
          const c=s.pending.choices[payload.index];must(c,'选项不存在。');const block=G.choiceBlock(s,c);must(!block,block);
          const p=s.pending,cost=Object.fromEntries(Object.entries(c.effects||{}).filter(([k,v])=>v<0&&['money','coins','stamina','mana'].includes(k)));
          effects(s,cost,p.npcId,c.itemCost);s.pending=null;
          if(c.duration){begin(s,'choice',{event:p,index:payload.index,duration:c.duration});G.log(s,`开始处理：${c.label}，需要 ${c.duration} 分钟。`,'奇遇');}
          else{finishChoice(s,p,payload.index);markComplete(s,'choose');}break;
        }
        case 'moveHome':{
          const home=G.residence(payload.id);must(home,'住处不存在。');must(home.id!==s.residenceId,'你已经住在这里。');
          begin(s,'moveHome',{id:home.id},home.place);G.log(s,`出发搬往${home.name}。到达后新住处才生效。`,'生活');break;
        }
        case 'sleep':{const home=homeOf(s);begin(s,'sleep',{id:home.id},home.place);G.log(s,`准备在${home.name}睡八小时。`,'休息');break;}
        case 'rest':begin(s,'rest');G.log(s,'开始原地休息，恢复随时间逐步生效。','休息');break;
        case 'cultivate':{
          const kind=payload.kind||'breath';must(['breath','meditate','body'].includes(kind),'修炼方式无效。');
          must(s.player.stamina>=(kind==='meditate'?24:kind==='body'?20:12),'体力不足，请先休息。');begin(s,'cultivate',{kind});G.log(s,'开始修炼，体力消耗与修为增长随时间进行。','修炼');break;
        }
        case 'breakthrough':{
          const realm=s.player.realm,realmLevel=G.realmLevel(s),need=G.realmNeed(s);must(need>0,'已达化神九重。');must(s.player.qi>=need,`需要 ${need} 修为。`);must(s.player.stamina>=20,'突破需要至少 20 点体力。');
          const pillTier=payload.usePill?G.highestPillTier(s,'foundation'):0;if(payload.usePill)must(pillTier>0,'背包里没有破境丹。');
          begin(s,'breakthrough',{realm,realmLevel,need,chance:G.breakChance(s,pillTier),pillTier});if(payload.usePill)G.consumeHighestPill(s,'foundation');s.player.stamina-=20;s.player.qi-=need;
          G.log(s,`开始从${G.realmLabel(s)}突破至${G.nextRealmLabel(s)}，投入 ${need} 修为与 20 体力。${pillTier?`服用${pillTier}阶破境丹，成功率 +${G.breakthroughPillBonus(pillTier)}%。`:''}中断不退还投入；失败将退回约 75% 修为。`,'破境');break;
        }
        case 'alchemy':{
          const recipe=G.alchemyRecipe(payload.recipe);must(recipe,'丹方不存在。');must((s.alchemy?.cauldron||0)>0,'还没有药鼎。请先到长乐集购买药鼎。');must(G.alchemyUnlocked(s,recipe),`炼药熟练度或境界不足，暂未掌握${recipe.name}。`);must(G.alchemyCauldronReady(s,recipe),`这张丹方至少需要${recipe.minCauldronTier}阶药鼎。`);
          const materials=G.alchemyMaterials(recipe);effects(s,{mana:-recipe.mana},null,materials);begin(s,'alchemy',{recipe:recipe.id});G.log(s,`按${recipe.name}开炉。${G.alchemyMaterialText(recipe)} · 灵力 -${recipe.mana} 已投入；最终丹药阶数由药鼎与炼药师水平共同决定，中断不返还。`,'炼药');break;
        }
        case 'explore':must(['park','temple'].includes(s.position),'请先前往月渡公园或听雨观探索。');must(s.player.stamina>=12,'探索需要 12 点体力。');begin(s,'explore');G.log(s,'开始探索周围的街巷与灵息。','探索');break;
        case 'visit':{
          const npc=G.NPCS.find(n=>n.id===payload.id);must(npc,'人物不存在。');must(s.bonds[npc.id].met,'你还没有在旅途中结识这个人。');must(s.bonds[npc.id].lastTalkDay!==G.day(s),'今天已经深入交谈过了，明天再来吧。');begin(s,'visit',{id:npc.id},npc.place);G.log(s,`出发拜访${npc.name}。`,'拜访');break;
        }
        case 'charge':must(s.vehicle.battery<G.limits(s).battery-.01,'电量已满。');effects(s,{money:-G.CHARGE.cost});begin(s,'charge');G.log(s,`开始原地充电，现金 -¥${G.CHARGE.cost}，需要 ${G.CHARGE.minutes} 分钟。`,'电动车');break;
        case 'repair':{
          must(s.position==='garage','请先前往修车铺维修。');const missing=G.limits(s).durability-s.vehicle.durability;must(missing>.01,'车况完好，无需维修。');const cost=Math.ceil(missing*.6)+12;effects(s,{money:-cost});begin(s,'repair');G.log(s,`开始维修，现金 -¥${cost}。`,'电动车');break;
        }
        case 'upgrade':{
          const kind=payload.kind;must(['speed','battery','durability'].includes(kind),'升级项目无效。');must(s.position==='garage','升级需要在修车铺进行。');must(s.vehicle.levels[kind]<5,'此项已经升至满级。');const cost=G.upgradeCost(s,kind);effects(s,{money:-cost});begin(s,'upgrade',{kind});G.log(s,`开始升级座驾，现金 -¥${cost}，需要 45 分钟。`,'电动车');break;
        }
        case 'heal':must(s.position==='clinic','请先前往回春医馆。');must(s.player.health<G.limits(s).health,'气血已满。');effects(s,{money:-25});begin(s,'heal');G.log(s,'开始治疗，现金 -¥25。','生活');break;
        case 'meal':must(s.position==='market','请先前往长乐集。');effects(s,{money:-12});begin(s,'meal');G.log(s,'开始用餐，现金 -¥12。','生活');break;
        case 'buy': {
          const item=G.ITEMS.find(i=>i.id===payload.id);must(item&&item.shop!==false,'这件物品不能通过系统直接兑换。');must(!item.unique||(!s.learned.includes(item.id)&&!s.equipment.includes(item.id)),'已经拥有，不能重复兑换。');must(s.player.coins>=item.cost,'外卖币不足，请先完成配送。');s.player.coins-=item.cost;
          if(item.type==='technique')s.learned.push(item.id);else if(item.type==='equipment')s.equipment.push(item.id);else s.inventory[item.id]=(s.inventory[item.id]||0)+1;
          G.log(s,`系统兑换：${item.name}，外卖币 -${item.cost}。即时到账，不消耗游戏时间。`,'系统');break;
        }
        case 'use': {
          const item=G.ITEMS.find(i=>i.id===payload.id);must(item?.effect,'该物品不能直接使用。');must((s.inventory[item.id]||0)>0,'没有这件物品。');const caps=G.limits(s);
          must(Object.entries(item.effect).some(([k,v])=>!caps[k]||s.player[k]<caps[k]),'对应属性已经补满，不必浪费物品。');s.inventory[item.id]--;effects(s,item.effect);G.log(s,`使用${item.name}。${G.effectText(item.effect)}。`,'物品');break;
        }
        case 'sign': {
          const day=G.day(s);must(s.daily.signedDay!==day,'今天已经签到。');s.daily.streak=s.daily.signedDay===day-1?s.daily.streak+1:1;s.daily.signedDay=day;const coins=5+Math.min(5,s.daily.streak-1);effects(s,{coins});G.log(s,`每日签到：外卖币 +${coins}。已连续签到 ${s.daily.streak} 天。`,'系统');break;
        }
        case 'claim': {
          if(payload.id==='daily'){must(!s.daily.claimed,'每日奖励已经领取。');must(s.daily.delivered>=3,'今天需要完成 3 单。');s.daily.claimed=true;effects(s,{coins:5,money:30,qi:10});G.log(s,'每日委托完成。外卖币 +5，现金 +¥30，修为 +10。','系统');}
          else{const q=G.QUESTS.find(q=>q.id===payload.id);must(q,'委托不存在。');must(!s.claimed.includes(q.id),'奖励已经领取。');must(G.questReady(s,q),'委托条件尚未达成。');s.claimed.push(q.id);effects(s,q.reward);G.log(s,`「${q.title}」：${q.story} 奖励：${G.effectText(q.reward)}。`,'主线');}break;
        }
        case 'cauldron': {
          must(s.position==='market','请先前往长乐集购买或更换药鼎。');
          const owned=Array.isArray(s.alchemy.cauldrons)?s.alchemy.cauldrons:(s.alchemy.cauldron?[s.alchemy.cauldron]:[]);
          const requested=Number(payload.id)||G.CAULDRONS.find(x=>x.level>0&&!owned.includes(x.level))?.level,item=G.CAULDRONS[requested];must(item?.level,'药鼎不存在。');
          if(owned.includes(item.level)){s.alchemy.cauldron=item.level;G.log(s,`在长乐集换用${item.name}（${item.tier}阶）。`,'炼药');break;}
          must(s.player.realm>=item.realm,`需要进入${G.REALMS[item.realm].name}后才能驾驭${item.name}。`);must(s.player.money>=item.cost,`购买${item.name}需要 ¥${item.cost}。`);
          s.player.money-=item.cost;owned.push(item.level);owned.sort((a,b)=>a-b);s.alchemy.cauldrons=owned;s.alchemy.cauldron=item.level;G.log(s,`在长乐集购入${item.name}（${item.tier}阶），现金 -¥${item.cost}。已设为当前药鼎。`,'炼药');break;
        }
        case 'herb':
        case 'material': {
          const id=action==='herb'?'herb':payload.id,material=G.alchemyMaterial(id);must(material,'药材不存在。');must(s.position==='market','请先前往长乐集购买药材。');must(s.player.realm>=material.realm,`需要进入${G.REALMS[material.realm].name}后才能处理${material.name}。`);must(s.player.money>=material.price,`购买${material.name}需要 ¥${material.price}。`);
          s.player.money-=material.price;s.inventory[material.id]=(s.inventory[material.id]||0)+1;G.log(s,`在长乐集买到${material.name} ×1，现金 -¥${material.price}。`,'炼药');break;
        }
        case 'finale': {
          const option=G.endingOptions(s).find(e=>e.id===payload.id);must(option?.ready,'尚未达成这个结局的条件。');s.ending=option.id;if(!s.unlockedEndings.includes(option.id))s.unlockedEndings.push(option.id);G.log(s,`你选择了「${G.ENDINGS[option.id].title}」。这不是最后一段路。`,'归途');break;
        }
        case 'continue': s.ending=null;G.log(s,'故事写下了一章，你继续游历人间。','归途');break;

        default:throw new RuleError('无法识别这个行动。');
      }
      // Zero-distance follow-ups still obey the same completion path.
      if(s.activity?.phase==='work'&&!s.activity.duration)finish(s,s.activity);
      normalize(s);if(s.player.health<=EPS&&!s.activity&&!s.pending)beginRescue(s);
      s.turn++;s.revision++;s.updatedAt=Date.now();return {ok:true,state:s};
    }catch(error){if(error instanceof RuleError)return {ok:false,state:original,error:error.message};throw error;}
  };

  // AI 输出采用严格白名单：不会执行指令、任意代码或提供自定义结局。
  G.validateAIEvent = raw => {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new RuleError('AI 事件格式无效。');
    const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new RuleError('AI 文本长度或类型无效。');return v.trim();};
    if(!Array.isArray(raw.choices)||raw.choices.length!==3)throw new RuleError('AI 事件必须提供三个选项。');
    const bounds={money:[-15,20],coins:[0,2],health:[-10,8],stamina:[-10,8],mana:[-10,8],qi:[0,20],karma:[-2,3],rep:[-2,2],affinity:[0,6],trust:[0,3]};
    const choices=raw.choices.map(c=>{
      if(!c||typeof c!=='object'||Array.isArray(c)||!c.effects||typeof c.effects!=='object'||Array.isArray(c.effects))throw new RuleError('AI 选项无效。');
      const fx={};must(Object.keys(c.effects).length<=4,'AI 效果过多。');
      for(const [k,v] of Object.entries(c.effects)){if(!Object.hasOwn(bounds,k)||!Number.isInteger(v)||v<bounds[k][0]||v>bounds[k][1])throw new RuleError('AI 效果超出安全范围。');fx[k]=v;}
      return {label:text(c.label,60),result:text(c.result,220),effects:fx};
    });
    // 无资源存档也必须有至少一个可选项，不能把玩家锁在 AI 事件中。
    must(choices.some(c=>Object.values(c.effects).every(v=>v>=0)),'AI 事件缺少无成本选项。');
    return {title:text(raw.title,40),text:text(raw.text,500),choices};
  };
  G.applyAIEvent = (original, eventId, raw) => {
    if(!original.pending||original.pending.id!==eventId||original.pending.aiStatus!=='unrequested')return original;
    const s=clone(original),clean=G.validateAIEvent(raw);
    if(!s.pending.npcId)for(const c of clean.choices){delete c.effects.affinity;delete c.effects.trust;}
    Object.assign(s.pending,clean,{source:'ai',aiStatus:'success'});s.updatedAt=Date.now();return s;
  };
  G.fallbackAI = (original,eventId,message) => {
    if(!original.pending||original.pending.id!==eventId||original.pending.aiStatus!=='unrequested')return original;
    const s=clone(original);s.pending.aiStatus='fallback';G.log(s,`AI 剧情未采用：${String(message).slice(0,120)}。本次使用经典事件，存档模式不变。`,'系统');return s;
  };
})(globalThis);
