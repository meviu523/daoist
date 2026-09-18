/* 只做本地持久化与格式校验，不宣称能防止单机玩家改档。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  G.STORAGE_KEY = 'night-courier:saves:v3';
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
      expiresAt:num(raw.expiresAt,s.minutes+20,0,1e8),reward:num(raw.reward,20,0,1000),coins:num(raw.coins,2,0,20),
      npc:G.NPCS.some(n=>n.id===raw.npc)?raw.npc:null};
  }
  G.sanitizeSave = raw => {
    if(!obj(raw)||!obj(raw.player))throw new Error('不是可识别的游戏存档。');
    const version=raw.schemaVersion??raw.version;
    if(![1,2,3].includes(version))throw new Error('存档版本未知或高于本程序。原仓库未知格式不能保证兼容。');
    const name=str(raw.name??raw.player.name,'无名行者',64).trim();
    const mode=['classic','ai'].includes(raw.mode)?raw.mode:'classic';
    const s=G.newGame([...name].slice(0,16).join('')||'无名行者',mode,raw.seed||1);
    s.id=cleanId(raw.id);s.createdAt=num(raw.createdAt,Date.now(),0,1e15);s.updatedAt=num(raw.updatedAt,Date.now(),0,1e15);
    s.minutes=num(raw.minutes,480,0,1e8);s.turn=num(raw.turn,0,0,1e8);s.seed=num(raw.seed,1,1,4294967295);
    s.position=G.place(raw.position)?raw.position:'home';s.transport=raw.transport==='walk'?'walk':'bike';
    s.weather=G.WEATHER.some(w=>w.id===raw.weather)?raw.weather:'clear';
    s.learned=Array.isArray(raw.learned)?[...new Set(raw.learned.filter(id=>G.ITEMS.some(i=>i.id===id&&i.type==='technique')))]:[];
    s.equipment=Array.isArray(raw.equipment)?[...new Set(raw.equipment.filter(id=>G.ITEMS.some(i=>i.id===id&&i.type==='equipment')))]:[];
    s.player.realm=num(raw.player.realm,0,0,G.REALMS.length-1);
    for(const k of ['money','coins','qi'])s.player[k]=num(raw.player[k],s.player[k],0,k==='money'?9999999:999999);
    for(const k of ['insight','constitution','agility','luck'])s.player[k]=num(raw.player[k],5,1,99);
    for(const k of ['rep','karma'])s.player[k]=num(raw.player[k],0,-50,100);
    const v=obj(raw.vehicle)?raw.vehicle:{},levels=obj(v.levels)?v.levels:{};
    for(const k of ['speed','battery','durability'])s.vehicle.levels[k]=num(levels[k],0,0,5);
    const cap=G.limits(s);
    for(const k of ['health','stamina','mana'])s.player[k]=num(raw.player[k],cap[k],0,cap[k]);
    s.vehicle.battery=num(v.battery,cap.battery,0,cap.battery,false);s.vehicle.durability=num(v.durability,cap.durability,0,cap.durability,false);
    for(const item of G.ITEMS.filter(i=>!i.unique))s.inventory[item.id]=num(raw.inventory?.[item.id],0,0,9999);
    for(const k of Object.keys(s.stats))s.stats[k]=num(raw.stats?.[k],0,0,k==='distance'?1e10:1e7);
    for(const npc of G.NPCS){const b=raw.bonds?.[npc.id];if(obj(b))s.bonds[npc.id]={affinity:num(b.affinity,0,0,100),trust:num(b.trust,0,0,100),stage:num(b.stage,0,0,4),path:['friend','romance'].includes(b.path)&& (b.path!=='romance'||npc.romantic)?b.path:'none',lastTalkDay:num(b.lastTalkDay,0,0,G.day(s))};}
    const d=obj(raw.daily)?raw.daily:{},day=G.day(s);
    s.daily={day,delivered:d.day===day?num(d.delivered,0):0,claimed:d.day===day&&d.claimed===true,signedDay:num(d.signedDay,0,0,day),streak:num(d.streak,0,0,day)};
    s.claimed=Array.isArray(raw.claimed)?[...new Set(raw.claimed.filter(id=>G.QUESTS.some(q=>q.id===id)))]:[];
    s.flags={firstOrder:raw.flags?.firstOrder===true};s.recentEvents=Array.isArray(raw.recentEvents)?raw.recentEvents.filter(id=>G.EVENTS.some(e=>e.id===id)).slice(-4):[];
    s.unlockedEndings=Array.isArray(raw.unlockedEndings)?[...new Set(raw.unlockedEndings.filter(id=>Object.hasOwn(G.ENDINGS,id)))]:[];
    s.ending=typeof raw.ending==='string'&&Object.hasOwn(G.ENDINGS,raw.ending)?raw.ending:null;
    s.logs=Array.isArray(raw.logs)?raw.logs.filter(obj).slice(-180).map((l,i)=>({id:`restored-${s.turn}-${i}`,at:num(l.at,s.minutes,0,s.minutes),tag:str(l.tag,'日常',12),text:str(l.text,'',600)})):s.logs;
    s.orders=[];
    if(Array.isArray(raw.orders))for(const t of raw.orders.slice(0,6)){try {const clean=cleanTicket(t,s);if(!s.orders.some(o=>o.id===clean.id||o.target===clean.target))s.orders.push(clean);}catch{}}
    if(!s.orders.length)G.refreshOrders(s);
    s.lastRoute=null;
    if(obj(raw.lastRoute)&&G.place(raw.lastRoute.from)&&G.place(raw.lastRoute.to))s.lastRoute=G.route(raw.lastRoute.from,raw.lastRoute.to);
    s.pending=null;
    if(raw.pending){
      const p=raw.pending;if(!obj(p))throw new Error('待处理事件已损坏。');
      let base;
      const npc=G.NPCS.find(n=>n.id===p.npcId);
      if(npc&&p.npcAdvance===true){const arc=npc.arc[s.bonds[npc.id].stage];if(!arc)throw new Error('人物故事进度与事件不一致。');const [title,text,...choices]=arc;base={title,text,choices:G.clone(choices),kind:'social'};}
      else if(npc){base={title:`与${npc.name}的片刻`,text:'你们继续谈起各自的近况。',choices:[{label:'分享近况',result:'你们的距离又近了一些。',effects:{affinity:5,trust:2}},{label:'认真倾听',result:'你记住了对方在意的小事。',effects:{affinity:4,trust:3}},{label:'请对方吃饭',result:'一顿热饭，让夜晚柔软了许多。',effects:{money:-12,affinity:7,stamina:8}}],kind:'social'};}
      else {base=G.EVENTS.find(e=>e.id===p.templateId);if(!base)throw new Error('无法识别待处理事件，请使用备份恢复。');base=G.clone(base);}
      s.pending={...base,id:cleanId(p.id),templateId:base.id||p.templateId,source:'classic',aiStatus:['unrequested','fallback','skip'].includes(p.aiStatus)?p.aiStatus:'skip',npcId:npc?.id||null,npcAdvance:!!npc&&p.npcAdvance===true};
      if(p.source==='ai'){const clean=G.validateAIEvent(p);Object.assign(s.pending,clean,{source:'ai',aiStatus:'success'});}
      if(p.delivery)s.pending.delivery=cleanTicket(p.delivery,s);
      if(s.mode==='classic')s.pending.aiStatus='skip';
    }
    s.schemaVersion=G.VERSION;
    if(version<G.VERSION)G.log(s,`存档已从重建版 v${version} 结构升级至 v${G.VERSION}，角色与电动车升级已保留。`,'存档');
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
      try{cache=readKey(G.STORAGE_KEY);}
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
      upsert(s){const old=cache.find(x=>x.id===s.id);if(old&&old.updatedAt>s.updatedAt&&old.turn>s.turn)return {ok:false,error:'这个存档已有较新的进度，请重新载入。'};if(!old&&cache.length>=G.MAX_SAVES)return {ok:false,error:`最多保留 ${G.MAX_SAVES} 个存档，请先导出并删除不需要的存档。`};return persist([s,...cache.filter(x=>x.id!==s.id)].sort((a,b)=>b.updatedAt-a.updatedAt));},
      remove(id){return persist(cache.filter(s=>s.id!==id));},
      import(text){const incoming=G.parseImport(text);if(cache.length+incoming.length>G.MAX_SAVES)throw new Error(`导入后超过 ${G.MAX_SAVES} 个存档，请先整理存档。`);for(const s of incoming){s.id=uid();s.updatedAt=Date.now();}return {...persist([...incoming,...cache]),count:incoming.length};},
      restoreBackup(){if(!storage)throw new Error('本地存储不可用。');const raw=storage.getItem(G.BACKUP_KEY);if(!raw)throw new Error('还没有自动备份。');const recovered=readKey(G.BACKUP_KEY);if(!recovered.length)throw new Error('备份为空。');return persist(recovered);},
      rawBackup(){if(!storage)throw new Error('本地存储不可用。');return storage.getItem(G.STORAGE_KEY)||G.exportSaves(cache);}
    };
  };
})(globalThis);
