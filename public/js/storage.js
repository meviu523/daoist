/* 只做本地持久化与格式校验，不宣称能防止单机玩家改档。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  G.STORAGE_KEY = 'night-courier:saves:v12';
  G.LEGACY_STORAGE_KEY = 'night-courier:saves:v11';
  G.LEGACY_STORAGE_KEYS = [G.LEGACY_STORAGE_KEY,'night-courier:saves:v10','night-courier:saves:v9','night-courier:saves:v8','night-courier:saves:v7','night-courier:saves:v6','night-courier:saves:v5','night-courier:saves:v4','night-courier:saves:v3'];
  G.BACKUP_KEY = 'night-courier:saves:backup';
  G.MAX_SAVES = 12;
  const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v, fallback, min=0, max=999999, integer=true) => Number.isFinite(v) ? G.clamp(integer?Math.floor(v):v,min,max) : fallback;
  const str = (v, fallback, max=100) => typeof v === 'string' ? v.slice(0,max) : fallback;
  const uid = () => root.crypto?.randomUUID?.() || `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cleanId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{4,100}$/.test(id) ? id : uid();
  function cleanTicket(raw, s) {
    if(!obj(raw)||!G.place(raw.target))throw new Error('订单地点无效。');
    return {id:cleanId(raw.id),target:raw.target,title:str(raw.title,'热饭配送',60),desc:str(raw.desc,'请及时送达。',300),
      condition:['ordinary','careful','urgent','night','mystic'].includes(raw.condition)?raw.condition:'ordinary',
      expiresAt:num(raw.expiresAt,s.minutes+20,0,1e8,false),reward:num(raw.reward,20,0,1000),coins:num(raw.coins,2,0,20),
      npc:G.NPCS.some(n=>n.id===raw.npc)?raw.npc:null};
  }
  function cleanPending(p,s){
    if(!obj(p))throw new Error('待处理事件已损坏。');
    if(p.kind==='auction'||p.templateId==='auction-bid'){
      const lot=G.auctionLot(s,p.auction?.lotId);
      if(!lot||lot.status!=='decision'||p.auction.day!==s.auction.day||p.auction.round!==lot.round)throw new Error('拍卖待选轮次无效。');
      const clean=G.auctionDecision(s,lot);
      if(p.id!==clean.id)throw new Error('拍卖事件标识与轮次不一致。');
      return clean; // 丢弃任何外来 effects / AI 文本；从当前拍品重建三个固定操作。
    }
      let base;
      const npc=G.NPCS.find(n=>n.id===p.npcId);
      if(npc)s.bonds[npc.id].met=true;
      if(npc&&p.npcAdvance===true){const arc=npc.arc[s.bonds[npc.id].stage];if(!arc)throw new Error('人物故事进度与事件不一致。');const [title,text,...choices]=arc;base={title,text,choices:G.clone(choices),kind:'social'};}
      else if(npc){base={title:`与${npc.name}的片刻`,text:'你们继续谈起各自的近况。',choices:[{label:'分享近况',result:'你们的距离又近了一些。',effects:{affinity:5,trust:2}},{label:'认真倾听',result:'你记住了对方在意的小事。',effects:{affinity:4,trust:3}},{label:'请对方吃饭',result:'一顿热饭，让夜晚柔软了许多。',effects:{money:-12,affinity:7,stamina:8}}],kind:'social'};}
      else {base=G.EVENTS.find(e=>e.id===p.templateId);if(!base)throw new Error('无法识别待处理事件，请使用备份恢复。');base=G.clone(base);}
      let clean={...base,id:cleanId(p.id),templateId:base.id||p.templateId,source:'classic',aiStatus:['unrequested','fallback','skip'].includes(p.aiStatus)?p.aiStatus:'skip',npcId:npc?.id||null,npcAdvance:!!npc&&p.npcAdvance===true};
      if(p.source==='ai'){const ai=G.validateAIEvent(p);Object.assign(clean,ai,{source:'ai',aiStatus:'success'});}
      if(p.delivery)clean.delivery=cleanTicket(p.delivery,s);
      if(s.mode==='classic')clean.aiStatus='skip';
    return clean;
  }

  function cleanActivity(raw,s,version=G.VERSION){
    const kinds=['travel','deliver','moveHome','sleep','visit','rest','cultivate','breakthrough','alchemy','explore','charge','repair','upgrade','heal','meal','choice','rescue','auction'];
    if(!obj(raw)||!kinds.includes(raw.kind)||!['travel','work'].includes(raw.phase))throw new Error('进行中的行动格式无效。');
    const kind=raw.kind,p=obj(raw.params)?raw.params:{},params={};
    let duration=({rest:60,sleep:480,visit:20,breakthrough:60,explore:30,charge:G.CHARGE.minutes,repair:30,upgrade:45,heal:30,meal:20,rescue:180})[kind]||0;
    if(['moveHome','sleep'].includes(kind)){
      if(!G.residence(p.id))throw new Error('行动中的住处无效。');params.id=p.id;
    }
    if(kind==='visit'){
      if(!G.NPCS.some(n=>n.id===p.id)||!s.bonds[p.id]?.met)throw new Error('拜访对象未结识或无效。');params.id=p.id;
    }
    if(kind==='cultivate'){
      if(!['breath','meditate','body'].includes(p.kind))throw new Error('修炼方式无效。');params.kind=p.kind;duration=p.kind==='meditate'?90:p.kind==='body'?30:45;
    }
    if(kind==='alchemy'){
      const recipe=G.alchemyRecipe(p.recipe);if(!recipe)throw new Error('丹方无效。');params.recipe=recipe.id;duration=recipe.duration;
      if((s.alchemy?.cauldron||0)<=0)throw new Error('炼药行动缺少有效药鼎。');
      if(!G.alchemyHasFormula(s,recipe))throw new Error('进行中的炼药缺少已获得丹方。');
    }
    if(kind==='upgrade'){
      if(!['speed','battery','durability'].includes(p.kind)||s.vehicle.levels[p.kind]>=5)throw new Error('升级行动无效。');params.kind=p.kind;
    }
    if(kind==='breakthrough'){
      const level=num(p.realmLevel,s.player.realmLevel,1,G.REALM_LEVELS.length);
      if(p.realm!==s.player.realm||level!==s.player.realmLevel||G.realmAtMax(s))throw new Error('突破境界与存档不一致。');
      const expected=version<7?G.REALMS[p.realm]?.need:G.realmNeed(s);
      params.realm=p.realm;params.realmLevel=level;params.need=num(p.need,expected,1,999999,false);params.chance=num(p.chance,53,35,95,false);
      if(version>=7&&Math.abs(params.need-G.realmNeed(s))>1e-8)throw new Error('突破投入与当前小境界不一致。');
    }
    if(kind==='auction'){
      const lot=G.auctionLot(s,p.lotId);
      if(!lot||lot.status!=='bidding'||p.day!==s.auction.day||p.round!==lot.round||raw.phase!=='work'||raw.target||raw.route)throw new Error('拍卖行动与冻结款不一致。');
      if(raw.duration!==G.AUCTION.roundMinutes||!Number.isFinite(raw.elapsed)||raw.elapsed<0||raw.elapsed>raw.duration||!Number.isFinite(raw.startedAt))throw new Error('拍卖行动进度无效。');
      if(Object.keys(raw.recovery||{}).length||raw.gainedQi)throw new Error('竞拍行动不能携带额外恢复或修为。');
      params.day=p.day;params.lotId=p.lotId;params.round=p.round;duration=G.AUCTION.roundMinutes;
    }
    if(kind==='choice'){
      if(p.event?.kind==='auction')throw new Error('拍卖必须使用独立竞价行动。');
      params.event=cleanPending(p.event,s);
      if(!Number.isInteger(p.index)||!params.event.choices[p.index])throw new Error('正在执行的事件选项无效。');
      params.index=p.index;duration=params.event.choices[p.index].duration||0;params.duration=duration;
      if(!duration)throw new Error('即时选项不应保存为持续行动。');
      if(params.event.delivery&&s.activeOrder)throw new Error('存档包含重复待结算订单。');
    }
    let target=null;
    if(['travel','deliver','moveHome','sleep','visit','rescue'].includes(kind)){
      target=kind==='deliver'?s.activeOrder?.target:kind==='rescue'?'clinic':['sleep','moveHome'].includes(kind)?G.residence(params.id).place:kind==='visit'?G.NPCS.find(n=>n.id===params.id).place:raw.target;
      if(!G.place(target)||target!==raw.target)throw new Error('行动目的地与存档不一致。');
    }
    const a={kind,params,target,phase:raw.phase,duration,elapsed:num(raw.elapsed,0,0,duration,false),startedAt:num(raw.startedAt,s.minutes,0,s.minutes,false),route:null,travelled:0,recovery:{},gainedQi:num(raw.gainedQi,0,0,999999,false)};
    // v5 旧版充电为 30 分钟：按完成比例缩短余程，保留现有电量与已付费用。
    // 写回后 duration=10，重复读档不会再次缩短或重复补电。
    if(kind==='charge'&&raw.duration===30)a.elapsed=num(raw.elapsed,0,0,30,false)/30*duration;
    if(raw.route){
      if(!target||!Array.isArray(raw.route.points)||!G.roadAnchors(raw.route.points[0]).length)throw new Error('进行中的道路路线无效。');
      a.route=G.route(raw.route.points[0],target);a.travelled=num(raw.travelled,0,0,a.route.meters,false);
    }
    if(a.phase==='travel'){
      if(!a.route||a.route.meters<=0)throw new Error('移动行动缺少有效路线。');
      const expected=G.pointOnRoute(a.route,a.travelled),actual=G.playerPoint(s);
      if(Math.hypot(expected.x-actual.x,expected.y-actual.y)>1e-5)throw new Error('角色位置与道路行程不一致。');
    }else if(target&&s.position!==target)throw new Error('尚未到达地点，不能执行当地行动。');
    if(a.phase==='work'){
      if(['repair','upgrade'].includes(kind)&&s.position!=='garage')throw new Error('维修升级必须位于修车铺。');
      if(kind==='heal'&&s.position!=='clinic')throw new Error('治疗必须位于医馆。');
      if(kind==='meal'&&s.position!=='market')throw new Error('用餐必须位于长乐集。');
      if(kind==='explore'&&!['park','temple'].includes(s.position))throw new Error('探索地点无效。');
    }
    const cap=G.limits(s);
    // Recovery is a bounded snapshot from the start of the work phase, not an
    // arbitrary effects object. In particular it cannot award money/items/realm.
    for(const key of ['health','stamina','mana','battery','durability']){
      if(obj(raw.recovery)&&Object.hasOwn(raw.recovery,key))a.recovery[key]=num(raw.recovery[key],0,0,cap[key],false);
    }
    return a;
  }

  G.sanitizeSave = raw => {
    if(!obj(raw)||!obj(raw.player))throw new Error('不是可识别的游戏存档。');
    const version=raw.schemaVersion??raw.version;
    if(![1,2,3,4,5,6,7,8,9,10,11,12].includes(version))throw new Error('存档版本未知或高于本程序。原仓库未知格式不能保证兼容。');
    const name=str(raw.name??raw.player.name,'无名行者',64).trim();
    const mode=['classic','ai'].includes(raw.mode)?raw.mode:'classic';
    const s=G.newGame([...name].slice(0,16).join('')||'无名行者',mode,raw.seed||1);
    s.id=cleanId(raw.id);s.createdAt=num(raw.createdAt,Date.now(),0,1e15);s.updatedAt=num(raw.updatedAt,Date.now(),0,1e15);
    s.minutes=num(raw.minutes,480,0,1e8,false);s.turn=num(raw.turn,0,0,1e8);s.seed=num(raw.seed,1,1,4294967295);
    s.position=G.place(raw.position)?raw.position:'home';
    if(version>=5 && raw.position===null){
      if(!G.roadAnchors(raw.location).length)throw new Error('途中位置不在有效道路上。');
      s.position=null;s.location={x:raw.location.x,y:raw.location.y};
    }
    s.revision=num(raw.revision,0,0,1e12);
    s.orderRefreshAt=num(raw.orderRefreshAt,(Math.floor(s.minutes/15)+1)*15,s.minutes,s.minutes+15,false);
    s.transport=raw.transport==='walk'?'walk':'bike';
    s.residenceId=G.residence(raw.residenceId)?.id||'qingteng';
    if(obj(raw.gameOver)&&raw.gameOver.reason==='rent'){
      const home=G.residence(raw.gameOver.residenceId)||G.residence(s.residenceId);
      s.gameOver={reason:'rent',day:num(raw.gameOver.day,G.day(s),1,999999),residenceId:home.id,rent:home.rent,money:num(raw.gameOver.money,s.player.money,0,9999999)};
    }else s.gameOver=null;
    s.weather=G.WEATHER.some(w=>w.id===raw.weather)?raw.weather:'clear';
    s.learned=Array.isArray(raw.learned)?[...new Set(raw.learned.filter(id=>G.ITEMS.some(i=>i.id===id&&i.type==='technique')))]:[];
    s.equipment=Array.isArray(raw.equipment)?[...new Set(raw.equipment.filter(id=>G.ITEMS.some(i=>i.id===id&&i.type==='equipment')))]:[];
    s.player.realm=num(raw.player.realm,0,0,G.REALMS.length-1);
    s.player.realmLevel=num(raw.player.realmLevel,version<7&&raw.activity?.kind==='breakthrough'?G.REALM_LEVELS.length:1,1,G.REALM_LEVELS.length);
    for(const k of ['money','coins','qi'])s.player[k]=num(raw.player[k],s.player[k],0,k==='money'?9999999:999999,k!=='qi');
    for(const k of ['insight','constitution','agility','luck'])s.player[k]=num(raw.player[k],5,1,99);
    for(const k of ['rep','karma'])s.player[k]=num(raw.player[k],0,-50,100);
    const v=obj(raw.vehicle)?raw.vehicle:{},levels=obj(v.levels)?v.levels:{};
    for(const k of ['speed','battery','durability'])s.vehicle.levels[k]=num(levels[k],0,0,5);
    const cap=G.limits(s);
    for(const k of ['health','stamina','mana'])s.player[k]=num(raw.player[k],cap[k],0,cap[k],false);
    s.vehicle.battery=num(v.battery,cap.battery,0,cap.battery,false);s.vehicle.durability=num(v.durability,cap.durability,0,cap.durability,false);
    const ar=obj(raw.alchemy)?raw.alchemy:{};
    const oldCauldron=num(ar.cauldron,version<=5&&raw.activity?.kind==='alchemy'?1:0,0,version<8?3:G.CAULDRONS.length-1),cauldron=version<8?(G.LEGACY_CAULDRON_MAP[oldCauldron]??0):oldCauldron;
    const ownedCauldrons=version<8?(cauldron?[cauldron]:[]):Array.isArray(ar.cauldrons)?[...new Set(ar.cauldrons.map(x=>num(x,0,0,G.CAULDRONS.length-1)).filter(Boolean))].sort((a,b)=>a-b):[];
    if(cauldron&&!ownedCauldrons.includes(cauldron))ownedCauldrons.push(cauldron);
    const xp=num(ar.xp,0,0,999999);
    const formulas=version<9
      ? G.ALCHEMY_RECIPES.filter(r=>s.player.realm>=r.realm&&xp>=r.need).map(r=>r.id)
      : Array.isArray(ar.formulas)?[...new Set(ar.formulas.filter(id=>G.alchemyRecipe(id)))]:[];
    const activeFormula=raw.activity?.kind==='alchemy'&&G.alchemyRecipe(raw.activity?.params?.recipe)?.id;
    if(activeFormula&&!formulas.includes(activeFormula))formulas.push(activeFormula);
    s.alchemy={cauldron,cauldrons:ownedCauldrons.sort((a,b)=>a-b),formulas,xp,brews:num(ar.brews,0,0,999999),successes:num(ar.successes,0,0,999999)};
    if(s.alchemy.successes>s.alchemy.brews)s.alchemy.successes=s.alchemy.brews;
    for(const item of G.ITEMS.filter(i=>!i.unique))s.inventory[item.id]=num(raw.inventory?.[item.id],0,0,9999);
    for(const k of Object.keys(s.stats))s.stats[k]=num(raw.stats?.[k],0,0,k==='distance'?1e10:1e7,k!=='distance');
    for(const npc of G.NPCS){const b=raw.bonds?.[npc.id];if(obj(b)){const affinity=num(b.affinity,0,0,100),trust=num(b.trust,0,0,100),stage=num(b.stage,0,0,4),path=['friend','romance'].includes(b.path)&& (b.path!=='romance'||npc.romantic)?b.path:'none';s.bonds[npc.id]={met:b.met===true||affinity>0||trust>0||stage>0||path!=='none',affinity,trust,stage,path,lastTalkDay:num(b.lastTalkDay,0,0,G.day(s))};}}
    const d=obj(raw.daily)?raw.daily:{},day=G.day(s);
    s.daily={day,delivered:d.day===day?num(d.delivered,0):0,claimed:d.day===day&&d.claimed===true,signedDay:num(d.signedDay,0,0,day),streak:num(d.streak,0,0,day)};
    s.claimed=Array.isArray(raw.claimed)?[...new Set(raw.claimed.filter(id=>G.QUESTS.some(q=>q.id===id)))]:[];
    s.flags={firstOrder:raw.flags?.firstOrder===true};s.recentEvents=Array.isArray(raw.recentEvents)?raw.recentEvents.filter(id=>G.EVENTS.some(e=>e.id===id)).slice(-4):[];
    s.unlockedEndings=Array.isArray(raw.unlockedEndings)?[...new Set(raw.unlockedEndings.filter(id=>Object.hasOwn(G.ENDINGS,id)))]:[];
    s.ending=typeof raw.ending==='string'&&Object.hasOwn(G.ENDINGS,raw.ending)?raw.ending:null;
    s.logs=Array.isArray(raw.logs)?raw.logs.filter(obj).slice(-180).map((l,i)=>({id:`restored-${s.turn}-${i}`,at:num(l.at,s.minutes,0,s.minutes,false),tag:str(l.tag,'日常',12),text:str(l.text,'',600)})):s.logs;
    s.orders=[];
    if(Array.isArray(raw.orders))for(const t of raw.orders.slice(0,6)){try {const clean=cleanTicket(t,s);if(!s.orders.some(o=>o.id===clean.id||o.target===clean.target))s.orders.push(clean);}catch{}}
    if(!s.orders.length&&version<5)G.refreshOrders(s);
    s.lastRoute=null;
    if(obj(raw.lastRoute)&&G.place(raw.lastRoute.from)&&G.place(raw.lastRoute.to))s.lastRoute=G.route(raw.lastRoute.from,raw.lastRoute.to);
    s.auction=version>=11?G.cleanAuction(raw.auction,s):G.emptyAuction();
    s.pending=raw.pending?cleanPending(raw.pending,s):null;
    s.activeOrder=version>=5&&raw.activeOrder?cleanTicket(raw.activeOrder,s):null;
    if(s.activeOrder){
      if(s.pending?.delivery)throw new Error('存档包含重复待结算订单。');
      s.orders=s.orders.filter(o=>o.id!==s.activeOrder.id&&o.target!==s.activeOrder.target);
    }
    if(version<12){
      // 旧版固定地点原本已经开放，迁移不回收；保留旧非配送行程，不把未结算订单当发现。
      const unsettled=s.activeOrder?.target||s.pending?.delivery?.target||raw.activity?.params?.event?.delivery?.target;
      const oldTarget=raw.activity&&!['deliver','choice'].includes(raw.activity.kind)?raw.activity.target:null;
      s.unlockedPlaces=[...new Set([...G.PLACES.filter(p=>p.permanent).map(p=>p.id),
        ...(s.position&&s.position!==unsettled?[s.position]:[]),...(G.place(oldTarget)&&oldTarget!==unsettled?[oldTarget]:[])])];
    }else{
      if(!Array.isArray(raw.unlockedPlaces)||raw.unlockedPlaces.length>G.PLACES.length||raw.unlockedPlaces.some(id=>typeof id!=='string'||!G.place(id)))throw new Error('地点解锁记录损坏。');
      s.unlockedPlaces=[...new Set(raw.unlockedPlaces)];
      if(!s.unlockedPlaces.includes('home')||!G.placeUnlocked(s,G.currentResidence(s).place))throw new Error('当前住处缺少地点解锁记录。');
    }
    s.activity=version>=5&&raw.activity?cleanActivity(raw.activity,s,version):null;
    if(s.activity){
      const a=s.activity,params=a.kind==='travel'?{target:a.target}:a.params;
      const blocked=G.locationBlock(s,a.kind,params);
      if(blocked)throw new Error(`进行中的行动缺少地点权限：${blocked}`);
    }
    if((s.auction.activeId||s.auction.lots.length)&&!G.placeUnlocked(s,'market'))throw new Error('拍卖记录缺少长乐集地点权限。');
    if(s.pending&&s.activity)throw new Error('待选事件与进行中行动不能同时存在。');
    G.validateAuctionLinks(s);
    G.restoreFeatureUnlocks(s,raw,version);
    s.schemaVersion=G.VERSION;
    if(version<G.VERSION)G.log(s,`存档已从重建版 v${version} 结构升级至 v${G.VERSION}：既有地图、连续时间、九重境界与丹方所有权继续保留；玩法入口按已完成经历、已有物品与在途行动恢复，不重复扣费或结算；拍卖冻结款与轮次成对恢复；旧版已开放的固定地点继续保留，新地点通过外卖送达解锁。`,'存档');
    return s;
  };
  G.parseImport = text => {
    if(typeof text!=='string'||text.length>2*1024*1024)throw new Error('存档文件过大（上限 2 MB）。');
    let raw;try{raw=JSON.parse(text);}catch{throw new Error('JSON 格式损坏，未导入任何内容。');}
    const list=Array.isArray(raw?.saves)?raw.saves:[raw];
    if(!list.length||list.length>G.MAX_SAVES)throw new Error(`一次最多导入 ${G.MAX_SAVES} 个存档。`);
    return list.map(G.sanitizeSave);
  };
  G.exportSaves = saves => JSON.stringify({format:'night-courier-reborn',schemaVersion:G.VERSION,exportedAt:new Date().toISOString(),saves},null,2);
  G.createStore = storage => {
    let cache=[],warning='',unavailable=!storage,dirty=false;
    function readKey(key){const text=storage.getItem(key);if(!text)return [];const raw=JSON.parse(text);if(!obj(raw)||!Array.isArray(raw.saves))throw new Error('本地存档索引损坏。');if(raw.saves.length>G.MAX_SAVES)throw new Error('存档数量异常。');return raw.saves.map(G.sanitizeSave);}
    function load(){
      if(dirty)return cache;
      if(!storage){warning='浏览器不允许本地存储。当前进度只保留在本页，请及时导出存档。';return cache;}
      try{
        cache=readKey(G.STORAGE_KEY);
        const legacy=G.LEGACY_STORAGE_KEYS.find(k=>storage.getItem(k));
        if(storage.getItem(G.STORAGE_KEY)===null&&legacy){
          cache=readKey(legacy);
          const migrated=persist(cache);
          if(migrated.ok)warning=`已将旧存档升级到 v${G.VERSION}，角色、住处、药鼎与既有进度保留。`;
        }
      }
      catch(e){try{const backup=storage.getItem(G.BACKUP_KEY);if(!backup)throw new Error('没有备份');cache=readKey(G.BACKUP_KEY);warning='主存档损坏，已读取上一次自动备份。请先导出保存。';}catch{warning='本地存档无法读取；没有覆盖原始数据。可以导入外部备份。';}}
      return cache;
    }
    function persist(next){
      if(!storage){cache=next;dirty=true;unavailable=true;return {ok:false,error:'本地存储不可用，请导出存档。'};}
      try{
        const current=storage.getItem(G.STORAGE_KEY);
        if(current){try{readKey(G.STORAGE_KEY);storage.setItem(G.BACKUP_KEY,current);}catch(error){if(error.name==='QuotaExceededError')throw error;}}
        storage.setItem(G.STORAGE_KEY,JSON.stringify({schemaVersion:G.VERSION,saves:next}));cache=next;dirty=false;warning='';unavailable=false;return {ok:true};
      }catch(e){cache=next;dirty=true;unavailable=true;warning='自动保存失败：存储空间不足或浏览器限制。请立即导出存档。';return {ok:false,error:warning};}
    }
    return {
      load, get saves(){return cache;},get warning(){return warning;},get unavailable(){return unavailable;},
      upsert(s){const old=cache.find(x=>x.id===s.id);if(old&&old.updatedAt>s.updatedAt&&(old.turn>s.turn||old.minutes>s.minutes))return {ok:false,error:'这个存档已有较新的进度，请重新载入。'};if(!old&&cache.length>=G.MAX_SAVES)return {ok:false,error:`最多保留 ${G.MAX_SAVES} 个存档，请先导出并删除不需要的存档。`};return persist([s,...cache.filter(x=>x.id!==s.id)].sort((a,b)=>b.updatedAt-a.updatedAt));},
      remove(id){return persist(cache.filter(s=>s.id!==id));},
      import(text){const incoming=G.parseImport(text);if(cache.length+incoming.length>G.MAX_SAVES)throw new Error(`导入后超过 ${G.MAX_SAVES} 个存档，请先整理存档。`);for(const s of incoming){s.id=uid();s.updatedAt=Date.now();}return {...persist([...incoming,...cache]),count:incoming.length};},
      restoreBackup(){if(!storage)throw new Error('本地存储不可用。');const raw=storage.getItem(G.BACKUP_KEY);if(!raw)throw new Error('还没有自动备份。');const recovered=readKey(G.BACKUP_KEY);if(!recovered.length)throw new Error('备份为空。');return persist(recovered);},
      rawBackup(){if(!storage)throw new Error('本地存储不可用。');return storage.getItem(G.STORAGE_KEY)||G.exportSaves(cache);}
    };
  };
})(globalThis);
