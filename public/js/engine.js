/* 确定性规则引擎：不访问 DOM / 网络 / localStorage，便于测试与迁移。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  const clone = x => JSON.parse(JSON.stringify(x));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  class RuleError extends Error {}
  class GameOverSignal extends Error {}
  const must = (ok, message) => { if (!ok) throw new RuleError(message); };
  G.clone = clone;
  G.clamp = clamp;
  G.day = s => Math.floor(s.minutes / 1440) + 1;
  G.isNight = s => s.minutes % 1440 >= 1080 || s.minutes % 1440 < 360;
  G.clock = s => `${String(Math.floor(s.minutes % 1440 / 60)).padStart(2, '0')}:${String(s.minutes % 60).padStart(2, '0')}`;
  G.timestamp = m => `第${Math.floor(m / 1440) + 1}日 ${String(Math.floor(m % 1440 / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  G.rand = s => { let x = s.seed >>> 0 || 1; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.seed = x >>> 0; return s.seed / 4294967296; };
  const int = (s, min, max) => Math.floor(G.rand(s) * (max - min + 1)) + min;
  G.limits = s => ({ health: 100 + s.player.realm * 12 + (s.equipment.includes('robe') ? 25 : 0), stamina: 100 + s.player.realm * 8, mana: 60 + s.player.realm * 16 + (s.equipment.includes('jade') ? 30 : 0), battery: 80 + s.vehicle.levels.battery * 35, durability: 100 + s.vehicle.levels.durability * 30 });
  G.log = (s, text, tag = '日常') => { s.logs.push({ id: `${s.turn}-${s.logs.length}-${s.seed}`, at: s.minutes, tag, text: String(text).slice(0, 600) }); s.logs = s.logs.slice(-180); };
  G.newGame = (name, mode = 'classic', seed = Date.now()) => {
    name = String(name).trim();
    if (!name || [...name].length > 16) throw new RuleError('名字需要 1–16 个字符。');
    if (!['classic','ai'].includes(mode)) throw new RuleError('请选择有效的剧情模式。');
    const id = root.crypto?.randomUUID?.() || `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const s = {
      schemaVersion: G.VERSION, id, name, mode, createdAt: Date.now(), updatedAt: Date.now(), seed: (Number(seed) >>> 0) || 1,
      turn: 0, minutes: 480, position: 'home', residenceId: 'qingteng', gameOver: null, transport: 'bike', weather: 'clear',
      player: { money: 120, coins: 0, health: 100, stamina: 100, mana: 60, qi: 0, realm: 0, insight: 5, constitution: 5, agility: 5, luck: 5, karma: 0, rep: 0 },
      vehicle: { battery: 80, durability: 100, levels: {speed:0,battery:0,durability:0} },
      inventory: {qi:1,heal:1,stamina:1,mana:0,herb:0,fragment:0,charm:0,foundation:0}, learned: [], equipment: [],
      stats: {delivered:0,earned:0,distance:0,trained:0,explored:0},
      bonds: Object.fromEntries(G.NPCS.map(n => [n.id, {met:false,affinity:0,trust:0,stage:0,path:'none',lastTalkDay:0}])),
      daily: { day:1, delivered:0, claimed:false, signedDay:0, streak:0 }, claimed: [], unlockedEndings: [], ending: null,
      flags: {firstOrder:false}, recentEvents: [], pending: null, orders: [], logs: [], lastRoute: null
    };
    G.log(s, `你在青藤小屋醒来。白天送达一份热饭，入夜寻一条自己的仙途。${mode === 'ai' ? '本存档使用 AI 剧情；接口不可用时采用经典事件。' : '本存档使用经典剧情。'}`, '启程');
    G.refreshOrders(s);
    return s;
  };
  // 城市道路采用正交路网。跨江只能通过三座桥，行程不是直线穿河。
  const nodes = G.GRID_Y.flatMap((y,r) => G.GRID_X.map((x,c) => ({x,y,c,r})));
  const nodeIndex = p => nodes.findIndex(n => n.x === p.x && n.y === p.y);
  G.route = (fromId, toId) => {
    const from = G.place(fromId), to = G.place(toId);
    if (!from || !to) throw new RuleError('找不到这个地图地点。');
    const start = nodeIndex(from), end = nodeIndex(to), dist = Array(nodes.length).fill(Infinity), prev = Array(nodes.length).fill(-1), visited = new Set();
    dist[start] = 0;
    while (visited.size < nodes.length) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !Number.isFinite(dist[u]) || u === end) break;
      visited.add(u);
      const a = nodes[u];
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const c = a.c + dc, r = a.r + dr;
        if (c < 0 || c > 6 || r < 0 || r > 5) continue;
        if (dc && Math.min(c,a.c) === 3 && ![1,3,5].includes(r)) continue;
        const v = r * 7 + c, b = nodes[v], nd = dist[u] + Math.abs(a.x-b.x) + Math.abs(a.y-b.y);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    const path = []; for (let cur = end; cur >= 0; cur = prev[cur]) { path.unshift({x:nodes[cur].x,y:nodes[cur].y}); if (cur === start) break; }
    return { from:fromId, to:toId, points:path, meters:Math.round(dist[end] * G.WORLD.metersPerUnit) };
  };
  G.travelPlan = (s, target, transport = s.transport) => {
    const r = G.route(s.position, target), km = r.meters / 1000;
    const weather = G.WEATHER.find(w => w.id === s.weather) || G.WEATHER[0];
    let speed = transport === 'bike' ? 22 + 4 * s.vehicle.levels.speed : (4.5 + s.player.agility * .08) * (s.learned.includes('lightstep') ? 1.3 : 1);
    if (transport === 'bike' && s.vehicle.durability < 20) speed *= .7;
    speed *= weather.speed;
    return {...r, transport, speed, km, minutes:Math.ceil(km / speed * 60), battery:transport === 'bike' ? Math.round(km * 500) / 100 : 0,
      stamina:Math.ceil(km * (transport === 'bike' ? 2.5 : 8) * Math.max(.55,1-s.player.constitution*.01)),
      wear:transport === 'bike' ? km * .6 / (1 + s.vehicle.levels.durability * .3) : 0};
  };
  G.travelBlock = (s, plan) => {
    if (plan.meters && plan.transport === 'bike' && s.vehicle.battery <= 0) return '电动车没电了，请先切换步行，或在当前位置充电。';
    if (plan.meters && plan.transport === 'bike' && s.vehicle.durability <= 0) return '车况为零，无法骑行。请切换步行，到修车铺维修。';
    if (s.vehicle.battery + 1e-8 < plan.battery) return `电量不足：本次需要 ${plan.battery.toFixed(1)}，当前只有 ${s.vehicle.battery.toFixed(1)}。可切换步行。`;
    if (s.player.stamina < plan.stamina) return `体力不足：本次需要 ${plan.stamina}，请先休息或服用清心散。`;
    return '';
  };
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
  function passTime(s, minutes) {
    must(Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440, '行动时长无效。');
    const oldDay = G.day(s), target = s.minutes + minutes, endDay = Math.floor(target / 1440) + 1;
    for (let day = oldDay + 1; day <= endDay; day++) {
      s.minutes = (day - 1) * 1440;
      s.daily.day = day; s.daily.delivered = 0; s.daily.claimed = false;
      s.weather = G.WEATHER[int(s,0,G.WEATHER.length-1)].id;
      if (day % 7 === 0) {
        const home = homeOf(s);
        if (s.player.money < home.rent) {
          s.gameOver = { reason:'rent', day, residenceId:home.id, rent:home.rent, money:s.player.money };
          G.log(s, `${home.name}房租到期，需要 ¥${home.rent}，但你只有 ¥${s.player.money}。你无法继续维持住处，这段旅程在这里结束。`, '结局');
          throw new GameOverSignal();
        }
        s.player.money -= home.rent;
        G.log(s, `本周${home.name}房租扣除 ¥${home.rent}。下一次房租将在第 ${day+7} 日结算。`, '生活');
      }
      G.log(s, `新的一天。天气：${G.WEATHER.find(w=>w.id===s.weather).name}。每日委托与签到已更新。`, '晨光');
    }
    s.minutes = target;
  }
  function move(s, target) {
    const p = G.travelPlan(s,target), error = G.travelBlock(s,p); must(!error,error);
    s.player.stamina -= p.stamina;
    s.vehicle.battery = Math.max(0,s.vehicle.battery-p.battery);
    s.vehicle.durability = Math.max(0,s.vehicle.durability-p.wear);
    passTime(s,p.minutes); s.position = target; s.lastRoute = p; s.stats.distance += p.meters;
    return p;
  }
  G.effectNames = {money:'现金',coins:'外卖币',health:'气血',stamina:'体力',mana:'灵力',qi:'修为',insight:'悟性',constitution:'根骨',agility:'身法',luck:'机缘',karma:'善缘',rep:'口碑',fragments:'碎玉',herb:'灵草',affinity:'好感',trust:'信任'};
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
    for (const key of ['health','stamina','mana']) s.player[key] = clamp(Math.round(s.player[key]),0,caps[key]);
    for (const key of ['insight','constitution','agility','luck']) s.player[key] = clamp(s.player[key],1,99);
    s.player.money = clamp(Math.round(s.player.money),0,9999999); s.player.coins = clamp(Math.round(s.player.coins),0,999999);
    s.player.qi = clamp(Math.round(s.player.qi),0,999999); s.player.rep = clamp(s.player.rep,-50,100); s.player.karma = clamp(s.player.karma,-50,100);
    s.vehicle.battery = clamp(s.vehicle.battery,0,caps.battery); s.vehicle.durability = clamp(s.vehicle.durability,0,caps.durability);
    for (const bond of Object.values(s.bonds)) {bond.affinity=clamp(bond.affinity,0,100);bond.trust=clamp(bond.trust,0,100);}
  }
  G.refreshOrders = s => {
    const pool = G.PLACES.filter(p => p.id !== s.position);
    const chosen = [];
    // 保留若干近单，避免低电量或低体力时所有任务都在远处。
    pool.sort((a,b)=>G.route(s.position,a.id).meters-G.route(s.position,b.id).meters);
    const count = G.isNight(s) ? 4 : 6;
    for (let i=0;i<count;i++) {
      const idx = int(s,0,i<2 ? Math.min(7,pool.length-1) : pool.length-1), place = pool.splice(idx,1)[0];
      const available = G.ORDER_TYPES.filter(t => (t.condition !== 'night' || G.isNight(s)) && (t.condition !== 'mystic' || s.player.realm >= 1));
      const type = available[int(s,0,available.length-1)], plan = G.travelPlan(s,place.id);
      chosen.push({ id:`o-${s.turn}-${i}-${s.seed}`, target:place.id, title:type.title, desc:type.desc, condition:type.condition,
        expiresAt:s.minutes+plan.minutes+int(s,type.condition==='urgent'?3:7,type.condition==='urgent'?8:20),
        reward:Math.round(12+plan.km*6+type.tip+Math.max(0,s.player.rep)*.08), coins:Math.min(6,2+Math.floor(plan.km/1.5)),
        npc:G.NPCS.find(n=>n.place===place.id)?.id || null });
    }
    s.orders = chosen;
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
    const late=s.minutes>ticket.expiresAt, reward=Math.floor(ticket.reward*(late?.7:1)), coins=late?Math.max(1,Math.floor(ticket.coins*.5)):ticket.coins;
    s.player.money+=reward;s.player.coins+=coins;s.stats.earned+=reward;s.stats.delivered++;s.daily.delivered++;
    s.player.rep=clamp(s.player.rep+(late?-1:1),-50,100);
    if(ticket.npc){const bond=s.bonds[ticket.npc];const npc=G.NPCS.find(n=>n.id===ticket.npc);if(!bond.met){bond.met=true;if(npc)G.log(s,`这一单让你第一次正式结识${npc.name}。对方已出现在「羁绊」中。`,'相逢');}bond.affinity=clamp(bond.affinity+3,0,100);}
    G.log(s, `送达「${ticket.title}」至${G.place(ticket.target).name}。现金 +¥${reward}，外卖币 +${coins}${late?'；已超时，报酬下调。':'。'}`, '配送');
  }
  G.breakChance = (s, usePill=false) => clamp(53+s.player.insight*2+Math.max(0,s.player.karma)*.12+(G.isNight(s)?10:0)+(usePill?15:0)-s.player.realm*3,35,95);
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
  G.perform = (original, action, payload = {}) => {
    const s=clone(original);
    try {
      must(!s.gameOver, '这段旅程已经结束，请返回开始页创建新存档。');
      must(!s.pending || action==='choose', '请先完成当前事件的选择。');
      must(!s.ending || action==='continue', '请先选择继续游历，或返回开始页。');
      switch(action){
        case 'transport':
          must(['bike','walk'].includes(payload.mode),'出行方式无效。');
          s.transport=payload.mode; G.log(s, `出行方式改为${payload.mode==='bike'?'骑电动车':'步行推车'}。`, '出行'); break;
        case 'travel': {
          must(G.place(payload.target),'目的地不存在。'); must(payload.target!==s.position,'你已经在这里。');
          const plan=move(s,payload.target);G.log(s,`前往${G.place(payload.target).name}，沿路 ${plan.km.toFixed(2)} 公里，用时 ${plan.minutes} 分钟。`,'出行');break;
        }
        case 'deliver': {
          const ticket=s.orders.find(o=>o.id===payload.id);must(ticket,'这张订单已刷新，请重新查看地图。');
          const plan=G.travelPlan(s,ticket.target);const block=G.travelBlock(s,plan);must(!block,block);
          must(s.minutes+plan.minutes<=ticket.expiresAt,'按当前出行方式无法在时限内抵达。');
          if(ticket.condition==='mystic')must(s.player.mana>=8,'灵异订单需要至少 8 点灵力。');
          if(ticket.condition==='careful')must(s.player.stamina-plan.stamina>=10,'易损餐品需要抵达时仍有至少 10 点体力。');
          move(s,ticket.target);if(ticket.condition==='mystic')s.player.mana-=8;
          G.log(s,`接下「${ticket.title}」，抵达${G.place(ticket.target).name}。行程 ${plan.km.toFixed(2)} 公里 / ${plan.minutes} 分钟。`,'接单');
          if(!s.flags.firstOrder||G.rand(s)<Math.min(.8,.5+s.player.luck*.01))event(s,'delivery',{delivery:clone(ticket)});else settleDelivery(s,ticket);
          break;
        }
        case 'choose': {
          must(s.pending,'当前没有待处理事件。');must(payload.eventId===s.pending.id,'这次事件已经处理，请勿重复结算。');
          const c=s.pending.choices[payload.index];must(c,'选项不存在。');const block=G.choiceBlock(s,c);must(!block,block);
          const p=s.pending;effects(s,c.effects,p.npcId,c.itemCost);passTime(s,c.duration||0);
          if(p.npcId){if(p.npcAdvance)s.bonds[p.npcId].stage++;if(c.path)s.bonds[p.npcId].path=c.path;}
          G.log(s,`${c.result}（${G.effectText(c.effects)}）`,p.npcId?'羁绊':p.source==='ai'?'AI 奇遇':'奇遇');
          s.pending=null;if(p.delivery)settleDelivery(s,p.delivery);break;
        }
        case 'moveHome': {
          const home=G.residence(payload.id);must(home,'住处不存在。');must(home.id!==s.residenceId,'你已经住在这里。');
          const plan=move(s,home.place);s.residenceId=home.id;
          G.log(s,`搬入${home.name}。每七天房租 ¥${home.rent}；睡眠恢复：${G.residenceRecoveryText(home)}。${plan.minutes?`搬家路程用时 ${plan.minutes} 分钟。`:''}`,'生活');break;
        }
        case 'rest':
          passTime(s,60);effects(s,{stamina:38,health:8,mana:10});G.log(s,'在原地歇息一小时。体力 +38，气血 +8，灵力 +10。','休息');break;
        case 'sleep': {
          const home=homeOf(s),plan=move(s,home.place);passTime(s,480);const cap=G.limits(s);
          for(const key of ['health','stamina','mana']){
            if(home.full.includes(key))s.player[key]=cap[key];
            else s.player[key]=Math.min(cap[key],s.player[key]+(home.recovery[key]||0));
          }
          if(home.full.includes('battery'))s.vehicle.battery=cap.battery;
          else s.vehicle.battery=Math.min(cap.battery,s.vehicle.battery+(home.recovery.battery||0));
          G.log(s,`在${home.name}睡了八小时${plan.minutes?`（另有路程 ${plan.minutes} 分钟）`:''}。${G.residenceRecoveryText(home)}。`,'休息');break;
        }
        case 'cultivate': {
          const kind=payload.kind||'breath';must(['breath','meditate','body'].includes(kind),'修炼方式无效。');
          const cost=kind==='meditate'?24:kind==='body'?20:12,duration=kind==='meditate'?90:kind==='body'?30:45;
          must(s.player.stamina>=cost,'体力不足，请先休息。');const night=G.isNight(s),place=s.position==='temple'?1.25:1;
          let qi=Math.round((kind==='meditate'?32:kind==='body'?9:17)*(night?1.45:1)*place*(s.learned.includes('breathing')?1.3:1)*(1+s.player.insight*.015));
          s.player.stamina-=cost;passTime(s,duration);effects(s,{qi,mana:kind==='body'?0:12});s.stats.trained++;
          if(kind==='body'&&s.stats.trained%3===0)effects(s,{constitution:1,agility:1});
          if(kind!=='body'&&s.stats.trained%4===0)effects(s,{insight:1});
          G.log(s,`${kind==='meditate'?'静坐入定':kind==='body'?'淬体练步':'吐纳修炼'} ${duration} 分钟，修为 +${qi}${night?'，夜间灵气加成已生效':''}${place>1?'，听雨观灵地加成已生效':''}。`,'修炼');
          if(G.rand(s)<Math.min(.7,.18+s.player.luck*.012))event(s,'cultivation');break;
        }
        case 'breakthrough': {
          const realm=G.REALMS[s.player.realm];must(realm.need>0,'你已达化神，可选择自己的归途。');must(s.player.qi>=realm.need,`还需要 ${realm.need-s.player.qi} 修为。`);must(s.player.stamina>=20,'突破需要至少 20 点体力。');
          if(payload.usePill)must((s.inventory.foundation||0)>0,'背包里没有破境丹。');
          const chance=G.breakChance(s,!!payload.usePill);if(payload.usePill)s.inventory.foundation--;s.player.stamina-=20;passTime(s,60);
          if(G.rand(s)*100<chance){s.player.qi-=realm.need;s.player.realm++;effects(s,{health:12,stamina:8,mana:16,insight:1,constitution:1,agility:1});G.log(s,`突破成功，踏入${G.REALMS[s.player.realm].name}。你的外卖箱还是那个外卖箱，而天地已不同。`,'破境');}
          else {s.player.qi-=Math.floor(realm.need*.25);let protectedByCharm=(s.inventory.charm||0)>0;if(protectedByCharm)s.inventory.charm--;else s.player.health-=18;G.log(s,`突破未成，损失本阶需求的 25% 修为。${protectedByCharm?'护身符消散，护住了经脉。':'气血 -18。修行不止这一次机会。'}`,'破境');}break;
        }
        case 'alchemy': {
          const recipe=payload.recipe==='heal'?{id:'heal',herb:1,mana:8,time:20}:{id:'qi',herb:2,mana:10,time:25};
          must(['heal','qi'].includes(payload.recipe),'丹方不存在。');effects(s,{mana:-recipe.mana},null,{herb:recipe.herb});passTime(s,recipe.time);
          const success=G.rand(s)<Math.min(.98,.85+s.player.insight*.01);if(success)s.inventory[recipe.id]=(s.inventory[recipe.id]||0)+1;
          G.log(s,success?`炼成${G.ITEMS.find(i=>i.id===recipe.id).name} ×1。`:'炉火忽然一跳，药力散去。这一炉失败了，材料已消耗。','炼丹');break;
        }
        case 'explore': {
          must(['park','temple'].includes(s.position),'请先前往月渡公园或听雨观探索。');must(s.player.stamina>=12,'探索需要 12 点体力。');s.player.stamina-=12;passTime(s,30);s.stats.explored++;if(G.rand(s)<Math.min(.45,.05+s.player.luck*.01)){s.inventory.herb=(s.inventory.herb||0)+1;G.log(s,'机缘眷顾：探索时额外发现青灵草 ×1。','机缘');}event(s,'explore');G.log(s,`在${G.place(s.position).name}探索了半小时，遇见一段未曾听说的故事。`,'探索');break;
        }
        case 'visit': {
          const npc=G.NPCS.find(n=>n.id===payload.id);must(npc,'人物不存在。');const bond=s.bonds[npc.id];must(bond.met,'你还没有在旅途中结识这个人。');must(bond.lastTalkDay!==G.day(s),'今天已经深入交谈过了，明天再来吧。');move(s,npc.place);passTime(s,20);bond.lastTalkDay=G.day(s);
          const stage=bond.stage,threshold=[0,10,24,40][stage],advanced=stage<4&&bond.affinity>=threshold;
          if(advanced){const [title,text,...choices]=npc.arc[stage];s.pending={id:`npc-${s.turn}-${s.seed}`,kind:'social',title,text,choices:clone(choices),npcId:npc.id,npcAdvance:true,source:'classic',aiStatus:'skip'};}
          else{s.pending={id:`npc-talk-${s.turn}-${s.seed}`,kind:'social',title:`与${npc.name}的片刻`,text:stage>=4?'你们说起最近的生活。有些关系走到后来，最珍贵的恰是这些不必特别发生的日常。':`${npc.name}问你今天过得怎么样。再多一点陪伴，也许你们就能谈起更深的往事。`,choices:[{label:'分享今天见到的小事',result:'你们聊得很开心。',effects:{affinity:5,trust:2}},{label:'认真听对方说话',result:'被倾听的感觉，让你们更亲近了一些。',effects:{affinity:4,trust:3}},{label:'带一份热饭一起吃',result:'两个人分一份热饭，也分担了一些疲惫。',effects:{money:-12,affinity:7,stamina:8}}],npcId:npc.id,npcAdvance:false,source:'classic',aiStatus:s.mode==='ai'?'unrequested':'skip'};}
          G.log(s,`拜访${npc.name}，交谈 20 分钟。`,'拜访');break;
        }
        case 'buy': {
          const item=G.ITEMS.find(i=>i.id===payload.id);must(item,'兑换物不存在。');must(!item.unique||(!s.learned.includes(item.id)&&!s.equipment.includes(item.id)),'已经拥有，不能重复兑换。');must(s.player.coins>=item.cost,'外卖币不足，请先完成配送。');s.player.coins-=item.cost;
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
        case 'charge': {
          const cap=G.limits(s);must(s.vehicle.battery<cap.battery-.01,'电量已满。');effects(s,{money:-8});passTime(s,30);s.vehicle.battery=cap.battery;G.log(s,'充电 30 分钟，现金 -¥8，电量补满。','电动车');break;
        }
        case 'repair': {
          must(s.position==='garage','请先前往修车铺维修。');const cap=G.limits(s);must(s.vehicle.durability<cap.durability-.01,'车况完好，无需维修。');const cost=Math.ceil((cap.durability-s.vehicle.durability)*.6)+12;effects(s,{money:-cost});passTime(s,30);s.vehicle.durability=cap.durability;G.log(s,`维修 30 分钟，现金 -¥${cost}，车况恢复。`,'电动车');break;
        }
        case 'upgrade': {
          const kind=payload.kind;must(['speed','battery','durability'].includes(kind),'升级项目无效。');must(s.position==='garage','升级需要在修车铺进行。');must(s.vehicle.levels[kind]<5,'此项已经升至满级。');const cost=G.upgradeCost(s,kind);effects(s,{money:-cost});passTime(s,45);s.vehicle.levels[kind]++;
          if(kind==='battery')s.vehicle.battery=G.limits(s).battery;if(kind==='durability')s.vehicle.durability=G.limits(s).durability;G.log(s,`升级${{speed:'速度',battery:'电池容量',durability:'耐用性'}[kind]}至 Lv.${s.vehicle.levels[kind]}，现金 -¥${cost}。`,'电动车');break;
        }
        case 'heal': {
          must(s.position==='clinic','请先前往回春医馆。');must(s.player.health<G.limits(s).health,'气血已满。');effects(s,{money:-25});passTime(s,30);s.player.health=G.limits(s).health;G.log(s,'医馆治疗 30 分钟，现金 -¥25，气血补满。','生活');break;
        }
        case 'meal': {
          must(s.position==='market','请先前往长乐集。');effects(s,{money:-12,stamina:45,health:10});passTime(s,20);G.log(s,'吃了一碗热面，现金 -¥12，体力 +45，气血 +10。','生活');break;
        }
        case 'herb': {
          must(s.position==='market','请先前往长乐集。');effects(s,{money:-15,herb:1});G.log(s,'在长乐集买到青灵草 ×1，现金 -¥15。','生活');break;
        }
        case 'finale': {
          const option=G.endingOptions(s).find(e=>e.id===payload.id);must(option?.ready,'尚未达成这个结局的条件。');s.ending=option.id;if(!s.unlockedEndings.includes(option.id))s.unlockedEndings.push(option.id);G.log(s,`你选择了「${G.ENDINGS[option.id].title}」。这不是最后一段路。`,'归途');break;
        }
        case 'continue': s.ending=null;G.log(s,'故事写下了一章，你继续游历人间。','归途');break;
        default: throw new RuleError('无法识别这个行动。');
      }
      normalize(s);
      if(s.player.health<=0){s.position='clinic';s.lastRoute=null;passTime(s,180);const fee=Math.min(60,s.player.money);s.player.money-=fee;s.player.health=45;s.player.stamina=Math.max(35,s.player.stamina);G.log(s,`你在医馆醒来。有人把你送到了这里，治疗扣除 ¥${fee}。别再把自己逼得太紧。`,'救助');}
      s.turn++;s.updatedAt=Date.now();
      if(!['transport','continue'].includes(action))G.refreshOrders(s);
      return {ok:true,state:s};
    }catch(error){
      if(error instanceof GameOverSignal){normalize(s);s.turn++;s.updatedAt=Date.now();return {ok:true,state:s};}
      if(error instanceof RuleError)return {ok:false,state:original,error:error.message};throw error;
    }
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
