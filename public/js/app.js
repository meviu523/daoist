(function(root){
  'use strict';
  const G=root.NightCourier,$=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons={
    box:'M4 8h16v13H4zM4 8l4-5h8l4 5M12 8v6',home:'M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7',
    moon:'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',sun:'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 1.5 1.5M5 19l1.5-1.5M17.5 6.5 1.5-1.5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    coin:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 8h6v8H9z',cash:'M3 6h18v13H3zM3 10h18M15 15h3',
    lotus:'M12 21C5 20 2 15 3 10c4 0 7 2 9 6 2-4 5-6 9-6 1 5-2 10-9 11ZM12 16C7 10 9 5 12 2c3 3 5 8 0 14Z',
    bag:'M5 7h14l2 14H3ZM8 7V5a4 4 0 0 1 8 0v2M8 12h8',people:'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 21v-2a7 7 0 0 1 14 0v2M19 4a3 3 0 0 1 0 6M22 20v-3a5 5 0 0 0-3-4',
    bike:'M8 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0M23 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 17l5-9 5 9H4M9 8h8l2 9M15 4h3l1 4M7 5h4',
    tea:'M4 7h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M7 3v1M11 2v2M15 3v1',
    help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17v.1',
    log:'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5',close:'M6 6l12 12M6 18 18 6',arrow:'M5 12h14M13 6l6 6-6 6',
    download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    pin:'M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 0 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    sword:'M4 20 18 4l3-1-1 4L6 21M4 14l6 6M3 21l2-2',spark:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
    shield:'M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6ZM8 12l3 3 5-6',walk:'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M8 22l4-9 4 9M5 14l4-6 4 1 3 5h4M12 9v4',
    book:'M12 5Q7 1 2 4v16q5-3 10 1 5-4 10-1V4q-5-3-10 1v16',check:'M5 12l4 4L20 5',chevron:'M7 10l5 5 5-5'
  };
  const icon=name=>`<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[name]||icons.spark}"/></svg>`;
  const btn=(label,attrs='',classes='')=>`<button class="btn ${classes}" ${attrs}>${label}</button>`;
  const tag=(label,cls='')=>`<span class="tag ${cls}">${esc(label)}</span>`;
  const disabled=(on)=>on?' disabled':'';
  const captext=(v,max)=>`${Math.floor(v)}/${max}`;
  const statsBox=(name,value,unit='')=>`<div class="stat-box"><small>${name}</small><strong>${esc(value)}${unit?`<span class="unit">${unit}</span>`:''}</strong></div>`;
  const actionCard=(name,description,action,attrs='',symbol='spark',off=false)=>`<button class="action-card" data-act="${action}" ${attrs}${disabled(off)}>${icon(symbol)}<div><strong>${name}</strong><small>${description}</small></div><span class="arrow">›</span></button>`;
  let local;try{local=window.localStorage;}catch{local=null;}
  const store=G.createStore(local);store.load();
  let state=null,map=null,dialogType=null,dialogData={},systemTab='shop',logExpanded=false,logCollapsed=window.innerWidth<600,saveOk=!store.unavailable,conflict=false,usePill=false;
  let aiHealth={configured:false,message:'AI 服务未连接'},aiFlight=null,aiSerial=0;
  let lastSavedAt=0,lastLiveAt=0,dirtySinceSave=false;
  const clock=new G.GameClock(advanceWorld,()=>{persist();renderLive();});
  clock.pause('menu');
  const dialog=$('#panel');
  function storageWarning(message=''){
    const el=$('#storage-warning');el.hidden=!message;el.innerHTML=message?`${esc(message)} <button data-ui="export-all">导出全部存档</button>`:'';
  }
  function showError(message){const el=dialog.open?$('#panel-error'):$('#notice');if(!el)return;el.textContent=message;el.hidden=false;}
  function clearError(){for(const el of [$('#panel-error'),$('#notice')])if(el){el.hidden=true;el.textContent='';}}
  function persist(){if(!state||conflict)return;lastSavedAt=Date.now();const r=store.upsert(state);saveOk=r.ok;dirtySinceSave=!r.ok;storageWarning(r.ok?'':r.error);}
  function abortAI(){aiSerial++;if(aiFlight){aiFlight.controller.abort();aiFlight=null;}}
  function renderStart(){
    $('#start-screen').hidden=false;$('#game-screen').hidden=true;
    const saves=store.saves;
    $('#start-screen').innerHTML=`<div class="start-top"><div class="brand"><span class="brand-mark">${icon('box')}</span>外卖修仙录</div><span class="tag">单机 · 连续时间版 ${G.APP_VERSION}</span></div>
      <div class="start-shell"><section class="start-hero"><h1>人间一程<span class="gold-text">仙途万里</span></h1><p>白天，把热饭送到万家灯火。<br>入夜，在城市的另一面修行。<br>这一次，你想把故事送向哪里？</p>
      <div class="hero-features"><span class="hero-feature">${icon('pin')}地图漫游</span><span class="hero-feature">${icon('people')}多线叙事</span><span class="hero-feature">${icon('moon')}昼夜修行</span></div>
      <svg class="hero-art" viewBox="0 0 460 170" fill="none" aria-hidden="true"><path d="M4 123 79 74 114 92 183 24 244 86 279 53 357 111 411 74 456 114" stroke="#708b70" stroke-width="1"/><path d="M5 143Q130 100 206 130T455 137" stroke="#466b55"/><path d="M10 155Q123 131 203 150T450 150" stroke="#466b55" opacity=".45"/><circle cx="310" cy="30" r="17" stroke="#d1b474"/><path d="M200 133v-24h47v24M196 109l28-15 29 15M214 133v-13h11v13" stroke="#d1b474"/><path d="M321 129h42v-21h-42zM317 108h50M324 103h37M337 94h12" stroke="#768e72"/><path d="M52 135v-17h19v17M83 130v-31h21v31M86 105h4m7 0h4M86 113h4m7 0h4" stroke="#6b8870"/><circle cx="232" cy="112" r="1.5" fill="#e1c186"/></svg>
      </section><section class="start-saves"><div class="row"><div><h2 style="margin-top:5px">继续你的故事</h2></div><span class="tag">${saves.length} / ${G.MAX_SAVES}</span></div>
      ${btn(`${icon('spark')} 开始新的旅程`,'data-ui="new-game"','primary wide')}
      <div class="save-list">${saves.length?saves.map(s=>`<article class="save-card"><div class="row"><span class="save-name">${esc(s.name)}</span>${tag(G.realmLabel(s),'gold')}</div><div class="save-meta"><span>第 ${G.day(s)} 日 · ${G.clock(s)}</span><span>${s.stats.delivered} 单</span><span>${s.mode==='ai'?'AI 剧情':'经典剧情'}</span></div><div class="save-actions">${btn('继续旅程',`data-ui="load" data-id="${esc(s.id)}"`,'small soft')}<button class="icon-btn" data-ui="export" data-id="${esc(s.id)}" title="导出此存档" aria-label="导出${esc(s.name)}存档">${icon('download')}</button><button class="icon-btn" data-ui="delete" data-id="${esc(s.id)}" title="删除存档" aria-label="删除${esc(s.name)}存档">${icon('trash')}</button></div></article>`).join(''):`<div class="start-no-save"><div class="empty-symbol">启</div><p>还没有写下的故事，<br>正等你按下第一声门铃。</p></div>`}</div>
      <div class="start-tools"><button class="text-btn" data-ui="import">导入存档</button><button class="text-btn" data-ui="export-all">导出全部</button><button class="text-btn" data-panel="help">帮助</button></div></section></div>
      <footer class="start-foot"><span>此刻启程，不必等到成为仙人。</span><span>本地自动保存 · 建议定期导出备份</span></footer>`;
    if(store.warning)storageWarning(store.warning);
  }
  function resource(name,value,max,cls=''){
    return `<div class="resource ${cls}" aria-label="${name} ${Math.floor(value)} / ${max}"><span class="resource-name">${name}</span><span class="resource-track"><i style="width:${Math.min(100,value/max*100)}%"></i></span><span class="resource-value">${Math.floor(value)}/${max}</span></div>`;
  }
  function renderGame(){
    if(!state)return;const s=state,c=G.limits(s);
    $('#start-screen').hidden=true;$('#game-screen').hidden=false;
    $('#game-header').innerHTML=`<div class="header-main"><button class="identity" data-panel="character" title="查看角色属性"><span class="avatar">${esc([...s.name][0])}</span><span><span class="player-name" style="display:block">${esc(s.name)}</span><small>${G.realmLabel(s)} · ${s.stats.delivered<10?'初行骑手':s.stats.delivered<30?'街巷熟客':'万家掌灯人'}</small></span></button>
      <div class="clock-wrap"><span class="weather">${icon(G.isNight(s)?'moon':'sun')}</span><div><div class="clock-time">${G.clock(s)}</div><div class="clock-desc">第 ${G.day(s)} 日 · ${G.WEATHER.find(w=>w.id===s.weather).name}</div></div><div class="time-controls"><button data-ui="pause" aria-label="暂停游戏">暂停</button><select id="time-speed" aria-label="时间速度"><option value="1">1 倍</option><option value="3">3 倍</option><option value="10">10 倍</option></select></div></div>
      <div class="currency-group"><div class="currency">${icon('cash')}<div><span class="currency-label">现金</span><span class="currency-number">¥${s.player.money}</span></div></div><button class="currency gold-text" data-panel="system" title="打开系统"><span>${icon('coin')}</span><span style="text-align:left"><span class="currency-label">外卖币</span><span class="currency-number">${s.player.coins}</span></span></button></div>
      <div class="header-home"><span class="autosave"><i></i>${saveOk?'已自动保存':'未保存'}</span><button class="icon-btn" data-ui="home" title="返回开始页" aria-label="返回开始页">${icon('home')}</button></div></div>
      <div class="resource-row">${resource('气血',s.player.health,c.health,'hp')}${resource('体力',s.player.stamina,c.stamina)}${resource('灵力',s.player.mana,c.mana,'qi')}${resource('电量',s.vehicle.battery,c.battery,'battery')}</div>`;
    const next=G.QUESTS.find(q=>!s.claimed.includes(q.id));
    $('#map-caption').innerHTML=`<div class="city-name">青岚城</div><button class="location-chip" data-panel="vehicle">${icon(s.transport==='bike'?'bike':'walk')} ${s.transport==='bike'?'骑行':'步行'} · ${esc(G.locationName(s))}</button>${next?`<button class="chapter-chip" data-ui="quests"><span>当前篇章</span><strong>${esc(next.title)}</strong><span>${esc(next.desc)} · ${Math.min(s.stats.delivered,next.delivery)}/${next.delivery}</span></button>`:`<button class="chapter-chip" data-ui="endings"><span>归途已近</span><strong>你想把故事送向哪里？</strong><span>查看可选择的结局</span></button>`}`;
    $('#game-nav').innerHTML=[['cultivation','lotus','修行'],['system','spark','系统'],['inventory','bag','行囊'],['bonds','people','羁绊'],['vehicle','bike','座驾'],['rest','tea','歇息']].map(([p,i,l])=>`<button class="nav-btn ${p==='system'?'featured':''}" data-panel="${p}">${icon(i)}<span>${l}</span></button>`).join('')+`<span class="nav-sep"></span><button class="nav-btn" data-panel="help">${icon('help')}<span>帮助</span></button>`;
    renderLogs();if(!map)map=new G.CityMap($('#city-map'),onPlace);map.render(s);syncPause();renderLive();
  }
  function renderLogs(){
    const s=state;if(!s)return;const el=$('#log-panel');el.className=`log-panel${logExpanded?' expanded':''}`;
    el.innerHTML=`<button class="log-heading" data-ui="logs" aria-expanded="${!logCollapsed}">${icon('log')}<span>行旅日志</span><span class="log-count">${s.logs.length} 条</span>${icon('chevron')}</button>${logCollapsed?'':`<div class="log-body" role="log" aria-live="polite" aria-relevant="additions">${s.logs.slice(logExpanded?-180:-8).reverse().map(l=>`<div class="log-entry"><div class="log-entry-head"><time>${G.timestamp(l.at)}</time><span class="log-tag">${esc(l.tag)}</span></div><div class="log-text">${esc(l.text)}</div></div>`).join('')}</div><div style="padding:0 12px 8px;text-align:right"><button class="text-btn" style="font-size:10px" data-ui="expand-logs">${logExpanded?'收起历史':'查看历史'}</button></div>`}`;
  }
  function onPlace(id){if(!state)return;if(state.gameOver){openPanel('gameover');return;}if(state.pending){openPanel('event');return;}if(state.ending){openPanel('ending');return;}map.select(id);openPanel('place',{id});}
  function openPanel(type,data={}){clock.pause('panel');if(state)persist();dialogType=type;dialogData=data;clearError();renderPanel();dialog.classList.toggle('centered',!state||type==='new'||type==='gameover');if(!dialog.open)dialog.showModal();renderLive();if(type==='new')setTimeout(()=>$('#player-name-input')?.focus(),40);}
  function closePanel(){if(state?.gameOver||state?.pending||state?.ending)return;dialog.close();dialogType=null;dialogData={};map?.select(null);clearError();syncPause();renderLive();}
  function panelTemplate(title,eyebrow,body,foot=''){
    const closable=!(state?.gameOver||state?.pending||state?.ending);
    return `<header class="panel-head"><div><h2 id="panel-title">${esc(title)}</h2></div>${closable?`<button class="icon-btn" data-ui="close" aria-label="关闭面板">${icon('close')}</button>`:''}</header><div class="panel-body">${body}</div><div id="panel-error" class="panel-error" role="alert" hidden></div>${foot?`<footer class="panel-foot">${foot}</footer>`:''}`;
  }
  function travelLine(target){const p=G.travelPlan(state,target);return `<div class="trip-line"><span>沿路 <strong>${p.km.toFixed(2)} km</strong></span><span>行程 <strong>${G.durationText(p.minutes)}</strong></span><span>体力 <strong>−${p.stamina.toFixed(1)}</strong></span>${p.transport==='bike'?`<span>电量 <strong>−${p.battery.toFixed(1)}</strong></span>`:''}</div>`;}
  function routeButton(target,label='前往这里'){
    const p=G.travelPlan(state,target),block=G.travelBlock(state,p);
    return `${travelLine(target)}${block?`<p class="alert" style="margin-bottom:12px">${esc(block)}</p>`:''}${btn(`${icon('pin')} ${label}`,`data-act="travel" data-target="${target}"${disabled(!!block||target===state.position)}`,'wide soft')}`;
  }
  function renderPanel(){
    if(!dialogType)return;const s=state,c=s?G.limits(s):null;let title='',label='',body='',foot='';
    switch(dialogType){
      case 'new':title='从你的名字开始';label='A new journey';body=`<form id="new-game-form"><label class="form-label" for="player-name-input">你的名字</label><input class="text-input" id="player-name-input" name="name" maxlength="16" required autocomplete="off" placeholder="给这段旅程起一个名字"><div class="section-title"><span class="form-label" style="margin:0">选择剧情模式</span><span class="tag">开局确定 · 局内不切换</span></div><div class="mode-options"><label class="mode-option"><input type="radio" name="mode" value="classic" checked><strong>经典剧情</strong><small>原创固定事件，多选择、多走向。无需网络。</small></label><label class="mode-option"><input type="radio" name="mode" value="ai"><strong>AI 生成剧情</strong><small>随机奇遇动态生成，关键主线保持连贯。</small></label></div><div class="alert soft">${esc(aiHealth.configured?'AI 接口已配置。选择 AI 模式后，角色名、部分状态与最近剧情摘要会发往你配置的服务，并可能产生接口费用。':'AI 接口未配置或无法连接。仍可创建 AI 存档，接口不可用时自动使用经典事件；之后配置接口即可继续生成。')}</div><p class="copy" style="margin:13px 0 20px">每次关键行动与运行期间都会自动保存。新旅程不会覆盖已有存档。</p>${btn('进入青岚城 →','type="submit"','primary wide')}</form>`;break;
      case 'place':{
        const p=G.place(dialogData.id);if(!p){closePanel();return;}title=p.name;label='City destination';
        body=`<div class="row">${tag(s.position===p.id?'当前位置':p.permanent?'城市地点':'配送目的地',s.position===p.id?'mint':'')}<span class="muted" style="font-size:11px">${s.transport==='bike'?'电动车出行':'步行推车'}</span></div>${p.desc?`<p class="copy" style="margin-top:12px">${esc(p.desc)}</p>`:''}`;
        const orders=s.orders.filter(o=>o.target===p.id);
        if(s.activeOrder?.target===p.id)body+=`<p class="alert soft">已接订单：${esc(s.activeOrder.title)}，${s.activeOrder.expiresAt<s.minutes?'已超时':`剩余 ${G.durationText(s.activeOrder.expiresAt-s.minutes)}`}。</p>${btn('继续当前配送',`data-act="resumeDelivery"${disabled(!!s.activity)}`,'wide')}`;
        for(const order of orders){const plan=G.travelPlan(s,p.id);let block=s.activeOrder?'已有未完成的配送订单。':G.travelBlock(s,plan);if(!block&&s.minutes+plan.minutes>order.expiresAt)block='按当前速度，预计无法在时限内送达。';if(!block&&order.condition==='mystic'&&s.player.mana<8)block='灵异订单需要至少 8 点灵力。';if(!block&&order.condition==='careful'&&s.player.stamina-plan.stamina<10)block='易损餐品需要抵达时至少保留 10 点体力。';
          body+=`<article class="order-box"><div class="row"><h3>${esc(order.title)}</h3>${tag(`${G.durationText(order.expiresAt-s.minutes)}内`,'gold')}</div><p class="copy" style="margin-top:10px">${esc(order.desc)}</p><div class="order-reward"><span>¥${order.reward}<small> 现金</small></span><span>${order.coins}<small> 外卖币</small></span></div>${travelLine(p.id)}${order.condition==='mystic'?'<p class="copy">交付需要灵力 −8。</p>':''}${block?`<div class="alert" style="margin:12px 0">${esc(block)}</div>`:''}${btn('接单并配送 →',`data-act="deliver" data-id="${esc(order.id)}"${disabled(!!block)}`,'primary wide')}</article>`;
        }
        if(p.permanent){body+='<div class="section-title"><h3>在这里</h3></div>';if(s.position!==p.id)body+=routeButton(p.id);else{
          const localActions={garage:actionCard('查看座驾','维修与升级','panel-vehicle','','bike'),clinic:actionCard('接受治疗','30 分钟 · ¥25 · 气血补满','heal','','shield',s.player.health>=c.health||s.player.money<25),temple:actionCard('在灵地修行','修炼收益额外提高 25%','panel-cultivation','','lotus')+actionCard('探寻古阵','30 分钟 · 体力 −12','explore','','spark',s.player.stamina<12),park:actionCard('沿江探索','30 分钟 · 体力 −12','explore','','spark',s.player.stamina<12),market:actionCard('吃一碗热面','20 分钟 · ¥12 · 体力 +45 / 气血 +10','meal','','tea',s.player.money<12)+actionCard('买一株青灵草','¥15 · 炼药材料','herb','','bag',s.player.money<15)+actionCard('逛炼药摊','购买药鼎、查看丹方','panel-cultivation','','lotus')};
          const currentHome=G.currentResidence(s),listedHome=G.RESIDENCES.find(h=>h.place===p.id);
          if(currentHome.place===p.id)localActions[p.id]=(localActions[p.id]||'')+actionCard(`在${currentHome.name}睡一觉`,`8 小时 · ${G.residenceRecoveryText(currentHome)}`,'sleep','','moon');
          else if(listedHome)localActions[p.id]=(localActions[p.id]||'')+actionCard(`搬入${listedHome.name}`,`周租 ¥${listedHome.rent} · ${G.residenceRecoveryText(listedHome)}`,'moveHome',`data-id="${listedHome.id}"`,'home');
          body+=`<div class="stack">${localActions[p.id]||''}</div>`;
        }
        const npc=G.NPCS.find(n=>n.place===p.id);if(npc&&s.bonds[npc.id]?.met)body+=`<div style="margin-top:12px">${btn(`拜访${esc(npc.name)}`,`data-act="visit" data-id="${npc.id}"${disabled(s.bonds[npc.id].lastTalkDay===G.day(s))}`,'wide')}</div>`;
        }else if(!orders.length)body+='<p class="copy" style="margin-top:16px">这里暂时没有订单，下一次行动后可查看新的配送点。</p>';
        foot='无需前往取餐点。确认接单后，直接从当前位置配送。';break;
      }
      case 'character':{
        title=s.name;label='Your character';const labels={insight:'悟性',constitution:'根骨',agility:'身法',luck:'机缘',karma:'善缘',rep:'口碑'};
        body=`<div class="row">${tag(`${G.realmLabel(s)} · ${G.locationName(s)}`,'gold')}${tag(s.mode==='ai'?'AI 剧情':'经典剧情')}</div><div class="stat-grid" style="margin-top:20px">${statsBox('气血',captext(s.player.health,c.health))}${statsBox('体力',captext(s.player.stamina,c.stamina))}${statsBox('灵力',captext(s.player.mana,c.mana))}</div><div class="section-title"><h3>修行资质</h3></div><div class="detail-list">${Object.entries(labels).map(([k,n])=>`<div><span>${n}</span><strong>${s.player[k]}</strong></div>`).join('')}</div><div class="section-title"><h3>沿途留下的印记</h3></div><div class="stat-grid">${statsBox('送达订单',s.stats.delivered,'单')}${statsBox('累计行程',(s.stats.distance/1000).toFixed(1),'km')}${statsBox('配送收入',s.stats.earned,'元')}</div><p class="copy" style="margin:17px 0">已习得：${s.learned.map(id=>G.ITEMS.find(i=>i.id===id).name).join('、')||'暂无心法'}<br>已装备：${s.equipment.map(id=>G.ITEMS.find(i=>i.id===id).name).join('、')||'暂无法器'}</p>${btn(`${icon('download')} 导出当前存档`,'data-ui="export-current"','wide')}`;break;
      }
      case 'cultivation':{
        title='今夜，向内而行';label='Cultivation';const need=G.realmNeed(s),nextRealm=G.nextRealmLabel(s),atMax=G.realmAtMax(s),chance=G.breakChance(s,usePill),alchemyRank=G.ALCHEMY_RANKS[G.alchemyRank(s)],cauldron=G.cauldron(s),nextCauldron=G.CAULDRONS[(s.alchemy?.cauldron||0)+1],atMarket=s.position==='market';
        const cauldronControl=nextCauldron?(atMarket?btn(((s.alchemy?.cauldron||0)?'升级':'购买')+nextCauldron.name+' · ¥'+nextCauldron.cost,'data-act="cauldron"'+disabled(s.player.realm<nextCauldron.realm||s.player.money<nextCauldron.cost),'small wide'):'<p class="copy">下一口鼎：'+nextCauldron.name+' · ¥'+nextCauldron.cost+(nextCauldron.realm?' · '+G.REALMS[nextCauldron.realm].name+'可用':'')+'</p>'+routeButton('market','前往长乐集买鼎')):tag('药鼎已升至最高阶','gold');
        const recipeCards=G.ALCHEMY_RECIPES.map(recipe=>{const unlocked=G.alchemyUnlocked(s,recipe),hasDing=(s.alchemy?.cauldron||0)>0,ready=hasDing&&unlocked&&(s.inventory.herb||0)>=recipe.herbs&&s.player.mana>=recipe.mana,chanceText=hasDing?Math.floor(G.alchemyChance(s,recipe)*100)+'%':'需药鼎',requirement=!unlocked?'需熟练度 '+recipe.need+(recipe.realm?' · '+G.REALMS[recipe.realm].name:''):recipe.herbs+' 草 · '+recipe.mana+' 灵力 · '+recipe.duration+' 分钟';return '<div class="card"><div class="row"><div><h3>'+recipe.name+'</h3><p class="copy">'+recipe.desc+'</p></div>'+tag(chanceText,unlocked&&hasDing?'gold':'')+'</div><p class="copy">'+requirement+'</p>'+btn(unlocked?(hasDing?'开炉炼制':'先买药鼎'):'尚未掌握','data-act="alchemy" data-recipe="'+recipe.id+'"'+disabled(!ready),'small wide')+'</div>';}).join('');
        body=`<div class="row"><h3>${G.realmLabel(s)}${nextRealm?` <span class="muted">→</span> ${nextRealm}`:''}</h3>${tag(G.isNight(s)?'夜间灵气 +45%':'白昼 · 灵气平缓',G.isNight(s)?'gold':'')}</div><div class="wide-progress"><i style="width:${need?Math.min(100,s.player.qi/need*100):100}%"></i></div><div class="progress-label"><span>修为</span><span>${Math.floor(s.player.qi)}${need?` / ${need}`:' · 化神九重圆满'}</span></div><div class="section-title"><h3>功课</h3>${s.position==='temple'?tag('灵地 +25%','mint'):tag(G.locationName(s))}</div><div class="stack">${actionCard('吐纳','45 分钟 · 体力 −12 · 恢复灵力','cultivate','data-kind="breath"','lotus',s.player.stamina<12)}${actionCard('静坐入定','90 分钟 · 体力 −24 · 更多修为','cultivate','data-kind="meditate"','moon',s.player.stamina<24)}${actionCard('淬体练步','30 分钟 · 体力 −20 · 积累根骨与身法','cultivate','data-kind="body"','sword',s.player.stamina<20)}</div>
          <div class="section-title"><h3>叩问下一重天</h3>${!atMax?tag(`成功率 ${Math.floor(chance)}%`,'gold'):tag('化神九重 · 道心已明')}</div>${!atMax?`<label class="checkbox"><input type="checkbox" id="break-pill"${usePill?' checked':''}${disabled(!(s.inventory.foundation>0))}>使用破境丹（现有 ${s.inventory.foundation||0} 枚，成功率 +15%）</label><p class="copy" style="margin:11px 0">下一境：${nextRealm} · 需要 ${need} 修为。${(s.inventory.charm||0)>0?'背包中的护身符会在失败时自动保护你。':'失败会损失本次需求的 25% 修为与 18 气血。'}突破耗时 60 分钟、消耗 20 体力。</p>${btn('尝试突破',`data-act="breakthrough"${disabled(s.player.qi<need||s.player.stamina<20)}`,'primary wide')}`:btn('看看自己的归途','data-ui="endings"','primary wide')}
          <div class="section-title"><h3>炼药师</h3>${tag(alchemyRank.name+' · 熟练度 '+(s.alchemy?.xp||0),'mint')}</div><div class="card"><div class="row"><div><h3>${cauldron.name}</h3><p class="copy">${cauldron.desc}</p></div>${(s.alchemy?.cauldron||0)>0?tag('鼎阶 '+s.alchemy.cauldron,'gold'):tag('尚未购鼎')}</div><p class="copy">已开炉 ${s.alchemy?.brews||0} 次 · 成丹 ${s.alchemy?.successes||0} 次 · 灵草 ${s.inventory.herb||0}</p>${cauldronControl}</div><div class="section-title"><h3>丹方</h3><span class="muted" style="font-size:11px">悟性与鼎阶影响成丹率</span></div><div class="stack">${recipeCards}</div>`;break;
      }
      case 'system':{
        title='万家灯火系统';label='The lantern system';const story=G.storyStage?G.storyStage(s):null;body=`<div class="row" style="margin-bottom:20px"><span class="gold-text" style="font-size:22px">${s.player.coins} <small style="font-size:11px">外卖币</small></span>${story?tag(story.title,'mint'):''}${btn(s.daily.signedDay===G.day(s)?'今日已签到':'每日签到',`data-act="sign"${disabled(s.daily.signedDay===G.day(s))}`,'small soft')}</div><div class="tabs" role="tablist" aria-label="系统分类">${[['shop','兑换'],['quests','委托'],['endings','归途']].map(([id,n])=>`<button role="tab" aria-selected="${id===systemTab}" class="${id===systemTab?'active':''}" data-ui="system-tab" data-id="${id}">${n}</button>`).join('')}</div>`;
        if(systemTab==='shop'){
          body+=`<div class="shop-grid">${G.ITEMS.map(item=>{const owned=item.unique&&(s.learned.includes(item.id)||s.equipment.includes(item.id)),unlocked=G.itemUnlocked?G.itemUnlocked(s,item):true,unlockName=G.REALMS[item.unlockRealm||0]?.name||'凡人';return `<article class="shop-item"><span class="item-glyph">${item.glyph}</span><h3>${item.name}</h3><p>${item.desc}</p>${!unlocked?`<p class="muted" style="font-size:11px;margin:0 0 10px">${unlockName}后开放</p>`:''}${btn(owned?'已拥有':unlocked?`${item.cost} 币 · 兑换`:`${unlockName}后解锁`,`data-act="buy" data-id="${item.id}"${disabled(owned||!unlocked||s.player.coins<item.cost)}`,'small')}</article>`;}).join('')}</div>`;foot='远程即时兑换 · 随境界开放 · 不消耗游戏时间';
        }else if(systemTab==='quests'){
          body+=`<div class="stack"><article class="quest-card"><div class="row"><h3>每日 · 三餐有着落</h3>${tag(`${Math.min(3,s.daily.delivered)} / 3`,'mint')}</div><small>当天完成 3 单配送</small><div class="quest-reward">外卖币 +5 · 现金 +30 · 修为 +10</div>${btn(s.daily.claimed?'已领取':'领取奖励',`data-act="claim" data-id="daily"${disabled(s.daily.claimed||s.daily.delivered<3)}`,'small wide')}</article>${G.QUESTS.map(q=>{const done=s.claimed.includes(q.id);return `<article class="quest-card ${done?'complete':''}"><div class="row"><h3>${q.title}</h3>${tag(done?'完成':`${Math.min(s.stats.delivered,q.delivery)}/${q.delivery}`)}</div><small>${q.desc}</small><div class="quest-reward">${G.effectText(q.reward)}</div>${btn(done?'已领取':'领取篇章奖励',`data-act="claim" data-id="${q.id}"${disabled(done||!G.questReady(s,q))}`,'small wide')}</article>`;}).join('')}</div>`;
        }else body+=`<p class="copy" style="margin-bottom:16px">结局不会强制结束存档。写完一章，仍可继续游历，解锁其他归途。</p><div class="stack">${G.endingOptions(s).map(e=>`<article class="quest-card"><div class="row"><h3>${G.ENDINGS[e.id].title}</h3>${tag(s.unlockedEndings.includes(e.id)?'已见过':e.ready?'可选择':'未达成',e.ready?'gold':'')}</div><small>${e.requirement}</small>${btn('选择这段归途',`data-ui="confirm-ending" data-id="${e.id}"${disabled(!e.ready)}`,'small wide')}</article>`).join('')}</div>`;
        break;
      }
      case 'inventory':{
        title='随身行囊';label='What you carry';const items=G.ITEMS.filter(i=>!i.unique&&(s.inventory[i.id]||0)>0);
        body=items.length?`<div class="stack">${items.map(item=>`<article class="card"><div class="row"><h3>${item.name} <span class="badge-number">${s.inventory[item.id]}</span></h3>${item.effect?btn('使用',`data-act="use" data-id="${item.id}"`,'small'):tag('材料')}</div><p class="copy">${item.desc}</p></article>`).join('')}</div>`:'<div class="empty">行囊很轻。系统里可以兑换丹药与材料。</div>';
        body+=`<div class="section-title"><h3>心法与装备</h3></div><div class="stack">${[...s.learned,...s.equipment].map(id=>{const i=G.ITEMS.find(i=>i.id===id);return `<div class="card"><h3>${i.name} <span class="tag mint">已生效</span></h3><p class="copy">${i.desc}</p></div>`;}).join('')||'<p class="copy">还没有习得心法或装备法器。</p>'}</div>`;break;
      }
      case 'bonds':{
        title='灯火里的故人';label='People you meet';
        const known=G.NPCS.filter(n=>s.bonds[n.id]?.met);
        if(!known.length)body='<div class="empty">旅途才刚开始。完成配送、经历奇遇，会逐渐认识这座城里的人。</div>';
        else{
          const cards=known.map(n=>{
            const b=s.bonds[n.id],travel=G.travelPlan(s,n.place),blocked=b.lastTalkDay===G.day(s)||!!G.travelBlock(s,travel);
            return `<article class="npc-card" style="--npc-color:${n.color}"><div class="row"><div class="npc-avatar">${n.name[0]}</div><div><h3>${n.name}</h3><small>${n.role} · ${G.place(n.place).name}</small></div><span class="tag" style="margin-left:auto">${b.path==='romance'?'相伴':b.stage>=4?'知己':b.stage>0?'相识':'初见'}</span></div><p>${n.bio}</p><div class="progress-label"><span>好感 ${b.affinity} · 信任 ${b.trust}</span><span>故事 ${b.stage}/4</span></div><div class="wide-progress"><i style="width:${b.affinity}%"></i></div><div class="npc-footer"><small>行程 ${G.durationText(travel.minutes)} · 交谈 20 分钟</small>${btn(b.lastTalkDay===G.day(s)?'明天再见':'去见一面',`data-act="visit" data-id="${n.id}"${disabled(blocked)}`,'small')}</div>${blocked&&b.lastTalkDay!==G.day(s)?`<p class="copy">${esc(G.travelBlock(s,travel))}</p>`:''}</article>`;
          }).join('');
          body=`<div class="stack">${cards}</div>`;
        }
        foot='只有真正遇见过的人才会出现在这里。关系由选择推进，友情与情感路线不会自动替你决定。';break;
      }
      case 'vehicle':{
        title='陪你走过每一程';label='Your electric companion';const atGarage=s.position==='garage',repairCost=Math.ceil((c.durability-s.vehicle.durability)*.6)+12;
        body=`<div class="tabs" role="group" aria-label="出行方式"><button class="${s.transport==='bike'?'active':''}" data-act="transport" data-mode="bike">电动车骑行</button><button class="${s.transport==='walk'?'active':''}" data-act="transport" data-mode="walk">步行推车</button></div><div class="stat-grid">${statsBox('基础车速',22+s.vehicle.levels.speed*4,'km/h')}${statsBox('剩余电量',Math.floor(s.vehicle.battery),`/ ${c.battery}`)}${statsBox('当前车况',Math.floor(s.vehicle.durability),`/ ${c.durability}`)}</div>${s.vehicle.battery<15?'<div class="alert" style="margin-top:15px">电量偏低。无法骑行时可切换步行，也可直接在座驾面板充电。</div>':''}<div class="section-title"><h3>保养</h3>${tag('任意地点可充电','mint')}</div><div class="button-row">${btn(`充电 · ¥${G.CHARGE.cost} / ${G.CHARGE.minutes} 分钟`,`data-act="charge"${disabled(s.vehicle.battery>=c.battery-.01||s.player.money<G.CHARGE.cost)}`,'small')}${btn(`维修 · ¥${repairCost}`,`data-act="repair"${disabled(!atGarage||s.vehicle.durability>=c.durability-.01||s.player.money<repairCost)}`,'small')}</div><div class="section-title"><h3>升级</h3>${tag('每项最高 Lv.5')}</div><div class="stack">${[['speed','速度','每级 +4 km/h'],['battery','电池容量','每级 +35 容量'],['durability','耐用性','每级 +30 上限，并降低磨损']].map(([id,n,desc])=>`<div class="card"><div class="row"><div><h3>${n} <span class="muted">Lv.${s.vehicle.levels[id]}</span></h3><p class="copy">${desc}</p></div>${btn(s.vehicle.levels[id]>=5?'已满级':`¥${G.upgradeCost(s,id)}`,`data-act="upgrade" data-kind="${id}"${disabled(!atGarage||s.vehicle.levels[id]>=5||s.player.money<G.upgradeCost(s,id))}`,'small')}</div></div>`).join('')}</div>${!atGarage?`<div class="section-title"><h3>阿默修车铺</h3></div>${routeButton('garage','前往修车铺')}`:''}`;foot='升级在修车铺进行，每项耗时 45 分钟。步行不会耗电；空电或车况归零时禁止骑行。';break;
      }
      case 'rest':{
        title='先照顾好自己';label='Take a breath';const home=G.currentResidence(s),plan=G.travelPlan(s,home.place),block=G.travelBlock(s,plan);
        const housing=G.RESIDENCES.map(h=>{const trip=G.travelPlan(s,h.place),tripBlock=G.travelBlock(s,trip),current=h.id===s.residenceId;return `<article class="card"><div class="row"><div><h3>${esc(h.name)} ${current?'<span class="tag mint">当前住处</span>':''}</h3><p class="copy">${esc(h.desc)}</p></div>${tag(`周租 ¥${h.rent}`,current?'gold':'')}</div><p class="copy">${esc(G.residenceRecoveryText(h))}</p>${current?'<p class="copy">房租每 7 天自动结算。</p>':`${travelLine(h.place)}${tripBlock?`<p class="alert">${esc(tripBlock)}</p>`:''}${btn(`搬入${esc(h.name)}`,`data-act="moveHome" data-id="${h.id}"${disabled(!!tripBlock)}`,'small wide')}`}</article>`;}).join('');
        body=`<div class="row"><div><h3>${esc(home.name)}</h3><p class="copy">${G.locationName(s)} · ${G.clock(s)}</p></div>${tag(`周租 ¥${home.rent}`,'gold')}</div><div class="stack" style="margin-top:16px">${actionCard('原地休息','60 分钟 · 体力 +38 / 气血 +8 / 灵力 +10','rest','','tea')}${actionCard(`回${home.name}睡觉`,`路程 ${G.durationText(plan.minutes)} + 8 小时 · ${G.residenceRecoveryText(home)}`,'sleep','','moon',!!block)}</div>${block?`<p class="alert" style="margin-top:14px">${esc(block)}</p>`:''}<div class="section-title"><h3>更换住处</h3><span class="tag">到期现金不足会结束本局</span></div><div class="stack">${housing}</div><div class="section-title"><h3>身上的补给</h3></div><div class="button-row">${btn(`清心散 ×${s.inventory.stamina||0}`,`data-act="use" data-id="stamina"${disabled(!(s.inventory.stamina>0)||s.player.stamina>=c.stamina)}`,'small')}${btn(`回春丹 ×${s.inventory.heal||0}`,`data-act="use" data-id="heal"${disabled(!(s.inventory.heal>0)||s.player.health>=c.health)}`,'small')}</div>`;foot='住处决定每周房租与睡眠恢复。搬家按实际道路距离计算时间、体力与电量。';break;
      }
      case 'event':{
        const p=s.pending;if(!p){closePanel();return;}title=p.title;label=p.npcId?`A familiar face · ${G.NPCS.find(n=>n.id===p.npcId).name}`:p.source==='ai'?'An unexpected story · AI':'An unexpected story';
        body=`${p.aiStatus==='unrequested'?`<div class="ai-status">${aiFlight?'正在生成 AI 剧情；也可直接按下方经典选项继续。':'本次奇遇支持 AI 生成；接口不可用时使用经典选项。'}</div>`:''}<div class="event-text">${esc(p.text)}</div><div class="choice-list">${p.choices.map((choice,i)=>{const block=G.choiceBlock(s,choice);const cost=Object.entries(choice.itemCost||{}).map(([id,n])=>`${G.ITEMS.find(it=>it.id===id)?.name||id} −${n}`).join(' · ');return `<button class="choice" data-act="choose" data-index="${i}" data-event="${esc(p.id)}"${disabled(!!block)}><strong><span class="choice-index">0${i+1}</span>${esc(choice.label)}</strong><small>${esc(block||G.effectText(choice.effects))}${cost?` · ${esc(cost)}`:''}${choice.duration?` · ${choice.duration} 分钟`:''}</small></button>`;}).join('')}</div>`;
        foot=`${p.delivery?'完成选择后结算配送奖励。':'选择会影响你的属性与后续关系。'} 事件已自动保存，刷新后仍可继续。`;break;
      }
      case 'gameover':{
        const g=s.gameOver,home=G.residence(g?.residenceId)||G.currentResidence(s);title='房租到期';label='旅程结束';
        body=`<div class="ending-symbol">止</div><div class="ending-text">${esc(home.name)}本周房租需要 ¥${g?.rent??home.rent}，结算时你只有 ¥${g?.money??s.player.money}。现金不足，无法继续维持住处，这一局结束。</div><div class="stat-grid" style="margin-bottom:24px">${statsBox('走过',G.day(s),'日')}${statsBox('送达',s.stats.delivered,'单')}${statsBox('现金',s.player.money,'元')}</div><div class="button-row">${btn('返回开始页','data-ui="home"','primary')}${btn(`${icon('download')} 导出此存档`,'data-ui="export-current"')}</div>`;foot='破产结束不可继续游历；可以保留存档作为本局记录，或返回开始页开启新旅程。';break;
      }
      case 'ending':{
        const e=G.ENDINGS[s.ending];if(!e){closePanel();return;}title=e.title;label='Every ending is a beginning';body=`<div class="ending-symbol">归</div><div class="ending-text">${esc(e.text)}</div><div class="stat-grid" style="margin-bottom:24px">${statsBox('走过',G.day(s),'日')}${statsBox('送达',s.stats.delivered,'单')}${statsBox('行程',(s.stats.distance/1000).toFixed(1),'km')}</div><div class="button-row">${btn('继续游历','data-act="continue"','primary')}${btn('返回开始页','data-ui="home"')}</div>`;break;
      }
      case 'help':{
        title='给初来此城的你';label='Field notes';body=`<div class="help-section"><h3>白天送外卖，入夜修行</h3><p>点地图上的金色订单标记，查看要求、距离、耗时与报酬，再选择「接单并配送」。取餐与送餐已经合并，没有单独的取餐流程。接单后人物沿道路前往目的地，到达并处理事件后才获得报酬；停止移动不会取消已接订单。空缺配送点在行动完成或每 15 个游戏分钟补充，普通收餐地点仅在有订单时显示。</p></div><div class="help-section"><h3>时间与地图</h3><p>正常速度下现实 1 秒等于游戏 1 分钟。时间运行时，即使原地不动，订单和房租也会继续计时。顶部可暂停或切换 1 / 3 / 10 倍速度，地图空白处也可按空格暂停。打开面板和剧情会自动暂停；手动暂停不会被关闭面板解除。切换标签页或应用不会自动暂停，后台仍按当前倍率计时；后台计时器被浏览器延迟时，返回后会分批推进本次会话经过的时间，遇到剧情选择立即停下。要暂时离开而不计时，请先手动暂停。关闭或重载页面后不补算离线时间，读档仍需手动继续。</p><p>人物沿道路逐段移动，路程除以当前速度得到实际耗时，界面分钟数向上取整仅供预估。停止行动只停止当前活动，世界时间仍会流逝。体力和电量按实际路程消耗，休息、充电和修炼逐步生效。中断不退已投入材料；突破中断不退投入修为。系统兑换、签到、领奖、用药不耗时。</p><p>鼠标滚轮缩放，按住拖动平移；手机可单指平移、双指缩放。键盘方向键平移，+ / − 缩放，Home 查看全城。右上角「◎」定位玩家，「全图」查看扩展后的 110 个地点。已发布的 99 个地点及四座桥保留，继续向南扩展南岸新街；普通配送点仍只在有任务时出现。</p></div><div class="help-section"><h3>系统与修仙</h3><p>外卖币从成功配送、签到与委托奖励中获得。直接打开系统兑换，不必跑驿站。丹药在行囊使用，心法与装备兑换后立即生效。18:00–次日 06:00 修炼有夜间加成；听雨观另有灵地加成。六个大境界都分为一重至九重；达到当前小境界门槛后才能突破，九重之后才进入下一大境界。炼药师需要先在长乐集购买药鼎；药鼎、悟性与熟练度影响成丹率，高阶丹方还要求对应境界。</p></div><div class="help-section"><h3>电动车与休息</h3><p>电量不足或车况归零会阻止骑行，但可以切换步行推车。回小屋睡眠会充满电量；可在任意地点花 ¥${G.CHARGE.cost} 充电，${G.CHARGE.minutes} 个游戏分钟逐步补满，无需前往修车铺；提前停止只保留已充入的电量。速度、电池容量、耐用性在修车铺独立升级，各最高 5 级。住处有不同周租与睡眠恢复效果，可在「歇息」中搬家；搬家按地图距离消耗时间、体力与电量。每 7 天按当前住处自动扣租，现金不足以支付完整房租时本局立即结束。搬家到达后新住处才生效；房租和配送同刻发生时先扣房租。</p></div><div class="help-section"><h3>角色与人际关系</h3><p>悟性影响修炼、炼药与突破，根骨降低移动体力消耗，身法影响步行速度；机缘影响随机奇遇触发率，以及探索时额外发现灵草的概率。善缘与口碑影响路线条件和配送收益。六位 NPC 各有四章故事，每日最多深入交谈一次。友情与情感路线需你明确选择，不会自动绑定。五种结局都允许继续游玩。</p></div><div class="help-section"><h3>剧情与日志</h3><p>行为与事件结果只记录在右下角「行旅日志」。事件弹窗用于当前选择，不另建历史记录。经典模式无需网络；AI 模式生成随机奇遇，关键主线与人物章节保持固定。AI 的效果由引擎白名单校验，超限、无免费选项或接口失败都会回退经典事件。</p></div><div class="help-section"><h3>AI 接入</h3><p>当前：${esc(aiHealth.message)}。在项目根目录按 <code>.env.example</code> 配置服务端地址、模型和密钥，用 <code>npm start</code> 启动。密钥不进入浏览器或存档。AI 模式会将角色名、部分状态、地点与最近剧情摘要发送到你配置的服务，可能产生调用费用。模式只能在新建存档时选择，局内不可更改。</p></div><div class="help-section"><h3>自动存档与备份</h3><p>最多保存 ${G.MAX_SAVES} 段旅程，关键行动及暂停时立即自动保存，运行期间每 10 秒自动保存，另外保留上一次写入前的本地备份。导入一律生成新副本，不覆盖已有进度。浏览器清理网站数据会删除本地存档，请定期导出。多个标签页同时操作会暂停旧页，避免覆盖新进度。纯单机数据可被开发者工具修改；本版不提供服务端防作弊。</p><p>此版本按对话中的需求重新实现，不是原仓库逐文件恢复。原始存档结构未知，不保证能够直接导入；仅对重建版已识别结构做升级处理。</p></div><div class="button-row">${btn('导入存档','data-ui="import"','small')}${btn('导出全部','data-ui="export-all"','small')}${btn('恢复上次自动备份','data-ui="restore"','small')}</div>`;break;
      }
      default:return;
    }
    if(s?.activity)body=`<div class="alert soft">正在${G.activityLabel(s.activity)}。面板打开时世界暂停。${G.canStop(s)?btn('停止当前行动','data-act="stop"','small'):''}</div>`+body;
    $('#panel-content').innerHTML=panelTemplate(title,label,body,foot);
    if(s?.activity)for(const button of dialog.querySelectorAll('[data-act]')){
      if(!['buy','sign','claim','stop','panel-cultivation','panel-vehicle'].includes(button.dataset.act))button.disabled=true;
    }
  }
  function loadGame(id,autoStart=false){const found=store.saves.find(s=>s.id===id);if(!found)return showError('没有找到这个存档。');abortAI();clock.pause('manual');clock.speed=1;state=G.clone(found);conflict=false;dirtySinceSave=false;lastSavedAt=Date.now();saveOk=!store.unavailable;dialog.close();dialogType=null;clearError();renderGame();requestAnimationFrame(()=>map.center());if(state.gameOver)openPanel('gameover');else if(state.pending){openPanel('event');maybeGenerateAI();}else if(state.ending)openPanel('ending');if(autoStart)clock.release('manual');syncPause();renderLive();}
  function act(action,payload={}){
    if(!state)return;if(action==='panel-cultivation'){openPanel('cultivation');return;}if(action==='panel-vehicle'){openPanel('vehicle');return;}
    if(conflict){showError('另一标签页已更新本地存档。请返回开始页重新载入，以免覆盖。');return;}
    clearError();const oldPending=state.pending?.id;let r;try{r=G.perform(state,action,payload);}catch(error){console.error(error);showError('行动发生异常，未写入本次变更。请导出存档保留现场。');return;}
    if(!r.ok){showError(r.error);return;}state=r.state;if(oldPending!==state.pending?.id)abortAI();persist();renderGame();
    if(state.gameOver)openPanel('gameover');
    else if(state.pending){openPanel('event');maybeGenerateAI();}
    else if(state.ending)openPanel('ending');
    else if((state.activity&&!['buy','sign','claim'].includes(action))||['deliver','travel','visit','choose','sleep','moveHome','continue','stop','cancelDelivery','resumeDelivery'].includes(action)){closePanel();}
    else if(dialogType){renderPanel();}
    syncPause();renderLive();
  }
  async function maybeGenerateAI(){
    const s=state,p=s?.pending;if(!s||s.mode!=='ai'||!p||p.aiStatus!=='unrequested'||aiFlight?.id===p.id)return;
    if(!aiHealth.configured){state=G.fallbackAI(state,p.id,aiHealth.message);persist();renderGame();if(dialogType==='event')renderPanel();return;}
    const controller=new AbortController(),serial=++aiSerial,saveId=s.id,id=p.id;aiFlight={controller,id};if(dialogType==='event')renderPanel();
    const timer=setTimeout(()=>controller.abort(),18000);
    try{
      const context={name:s.name,realm:G.realmLabel(s),day:G.day(s),time:G.clock(s),weather:s.weather,location:G.locationName(s),kind:p.kind,title:p.title,text:p.text,npc:p.npcId?G.NPCS.find(n=>n.id===p.npcId).name:null,stats:{stamina:s.player.stamina,mana:s.player.mana,money:s.player.money,qi:s.player.qi,karma:s.player.karma,rep:s.player.rep},recent:s.logs.slice(-3).map(l=>l.text)};
      const response=await fetch('/api/story',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context}),signal:controller.signal});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'服务暂时不可用');
      if(serial!==aiSerial||state?.id!==saveId||state?.pending?.id!==id)return;
      state=G.applyAIEvent(state,id,result.event);persist();
    }catch(error){if(serial!==aiSerial||state?.id!==saveId||state?.pending?.id!==id)return;state=G.fallbackAI(state,id,error.name==='AbortError'?'请求超时':error.message);persist();}
    finally{clearTimeout(timer);if(serial===aiSerial){aiFlight=null;renderGame();if(dialogType==='event')renderPanel();}}
  }
  async function checkAI(){
    if(location.protocol==='file:'){aiHealth={configured:false,message:'离线体验文件：AI 需要用 Node 服务启动'};return;}
    try{const r=await fetch('/api/health',{signal:AbortSignal.timeout(2500)});if(!r.ok)throw new Error('服务未启动');const data=await r.json();aiHealth={configured:data.aiConfigured===true,message:data.aiConfigured?'服务端 AI 接口已配置':'服务端未配置 AI，随机事件将采用经典剧情'};}catch{aiHealth={configured:false,message:'未连接 AI 服务，当前可使用完整经典玩法'};}
    if(['help','new'].includes(dialogType)){
      // 不重绘新建表单，避免健康检查迟到时擦掉玩家已输入的名字。
      if(dialogType==='help')renderPanel();
    }
  }
  function download(saves,name='night-courier-saves.json'){const blob=new Blob([G.exportSaves(saves)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function returnHome(){if(!conflict)persist();clock.pause('menu');clock.pause('manual');abortAI();state=null;dialog.close();dialogType=null;dialogData={};conflict=false;clearError();store.load();renderStart();}
  document.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.panel){if(state?.gameOver)openPanel('gameover');else if(state?.pending)openPanel('event');else if(state?.ending)openPanel('ending');else openPanel(button.dataset.panel);return;}
    if(button.dataset.act){const d=button.dataset;const payload={id:d.id,target:d.target,kind:d.kind,mode:d.mode,recipe:d.recipe,index:Number(d.index),eventId:d.event,usePill:usePill&&(state?.inventory.foundation||0)>0};act(d.act,payload);return;}
    const d=button.dataset;
    switch(d.ui){
      case 'new-game':if(store.saves.length>=G.MAX_SAVES)showError('存档已满，请先导出并删除不需要的旅程。');else openPanel('new');break;
      case 'close':closePanel();break;
      case 'pause':if(state){if(clock.reasons.has('manual'))clock.release('manual');else clock.pause('manual');persist();syncPause();renderLive();}break;
      case 'cancel-delivery':if(confirm('取消这张订单？不会获得配送报酬。'))act('cancelDelivery');break;
      case 'load':loadGame(d.id);break;
      case 'home':returnHome();break;
      case 'export':{const s=store.saves.find(x=>x.id===d.id);if(s)download([s],`journey-${s.id}.json`);break;}
      case 'export-current':if(state)download([state],`journey-${state.id}.json`);break;
      case 'export-all':{let saves=store.saves;if(state)saves=[state,...saves.filter(s=>s.id!==state.id)];download(saves);break;}
      case 'import':$('#import-file').value='';$('#import-file').click();break;
      case 'delete':{const s=store.saves.find(x=>x.id===d.id);if(s&&confirm(`删除「${s.name}」？请先导出需要保留的进度。`)){const r=store.remove(s.id);if(!r.ok)storageWarning(r.error);renderStart();}break;}
      case 'restore':if(confirm('恢复上一次自动备份将替换当前本地存档列表。建议先导出全部。确定恢复吗？')){try{abortAI();const r=store.restoreBackup();if(!r.ok)throw new Error(r.error);returnHome();}catch(err){showError(err.message);}}break;
      case 'zoom-in':map?.zoom(1.25);break;case 'zoom-out':map?.zoom(.8);break;case 'locate':map?.center();break;case 'fit-map':map?.fit();break;
      case 'logs':logCollapsed=!logCollapsed;renderLogs();break;case 'expand-logs':logExpanded=!logExpanded;renderLogs();break;
      case 'system-tab':systemTab=d.id;renderPanel();break;
      case 'quests':systemTab='quests';if(state?.pending)openPanel('event');else openPanel('system');break;
      case 'endings':systemTab='endings';if(state?.pending)openPanel('event');else openPanel('system');break;
      case 'confirm-ending':if(confirm('写下这个结局？之后仍然可以继续游历。'))act('finale',{id:d.id});break;
    }
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='new-game-form')return;e.preventDefault();
    try{const data=new FormData(e.target),newState=G.newGame(data.get('name'),data.get('mode'));const result=store.upsert(newState);if(!result.ok&&store.saves.length>=G.MAX_SAVES&&!store.saves.some(s=>s.id===newState.id))throw new Error(result.error);saveOk=result.ok;if(!result.ok)storageWarning(result.error);loadGame(newState.id,true);}catch(err){showError(err.message);}
  });
  document.addEventListener('change',e=>{if(e.target.id==='time-speed'){clock.setSpeed(Number(e.target.value));renderLive();}if(e.target.id==='break-pill'){usePill=e.target.checked;renderPanel();}});
  $('#import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw new Error('文件过大，上限为 2 MB。');const text=await file.text();const r=store.import(text);if(!r.ok)storageWarning(r.error);if(!state){dialog.close();dialogType=null;renderStart();}else if(dialogType==='help')renderPanel();}catch(err){showError(err.message);}});
  dialog.addEventListener('cancel',e=>{if(state?.gameOver||state?.pending||state?.ending)e.preventDefault();else{dialogType=null;map?.select(null);}});
  dialog.addEventListener('close',()=>{syncPause();renderLive();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closePanel();}});
  window.addEventListener('storage',e=>{if(e.key===G.STORAGE_KEY){if(state){conflict=true;clock.pause('conflict');abortAI();storageWarning('另一标签页已更新存档，本页已暂停行动。请返回开始页重新载入。');}else{store.load();renderStart();}}});
  function syncPause(){
    for(const [reason,blocked] of [['menu',!state],['panel',dialog.open],['event',!!(state?.pending||state?.ending||state?.gameOver)],['conflict',conflict]]){
      if(blocked)clock.pause(reason);else clock.release(reason);
    }
  }
  function renderLive(){
    if(!state)return;const s=state,cap=G.limits(s),a=s.activity;
    $('#game-screen').dataset.paused=String(clock.paused);
    const pause=$('[data-ui="pause"]');if(pause){pause.textContent=clock.reasons.has('manual')?'继续':'暂停';pause.setAttribute('aria-label',clock.reasons.has('manual')?'继续游戏':'暂停游戏');pause.setAttribute('aria-pressed',String(clock.paused));}
    if($('#time-speed'))$('#time-speed').value=String(clock.speed);
    if($('.clock-time'))$('.clock-time').textContent=G.clock(s);
    if($('.clock-desc'))$('.clock-desc').textContent=`第 ${G.day(s)} 日 · ${G.WEATHER.find(w=>w.id===s.weather).name}`;
    const values=[s.player.health,s.player.stamina,s.player.mana,s.vehicle.battery],caps=[cap.health,cap.stamina,cap.mana,cap.battery];
    document.querySelectorAll('.resource-row .resource').forEach((el,i)=>{
      el.querySelector('.resource-value').textContent=`${Math.floor(values[i]+1e-8)}/${caps[i]}`;
      el.querySelector('.resource-track i').style.width=`${Math.min(100,values[i]/caps[i]*100)}%`;
      el.setAttribute('aria-label',`${el.querySelector('.resource-name').textContent} ${Math.floor(values[i])} / ${caps[i]}`);
    });
    const chip=$('.location-chip');if(chip)chip.innerHTML=`${icon(s.transport==='bike'?'bike':'walk')} ${s.transport==='bike'?'骑行':'步行'} · ${esc(G.locationName(s))}`;
    const rentAt=(Math.floor(G.day(s)/7)+1)*7,home=G.currentResidence(s),until=(rentAt-1)*1440-s.minutes;
    let title=a?`${a.phase==='travel'?'正在前往 '+G.place(a.target).name:G.activityLabel(a)}`:s.activeOrder?'配送已停下':'原地停留';
    if(clock.paused)title=`已暂停 · ${title}`;
    if(s.gameOver)title='旅程已结束';
    $('#action-title').textContent=title;
    const detail=a?.phase==='travel'?`剩余 ${Math.ceil(a.route.meters-a.travelled)} 米 · 预计 ${G.durationText(G.activityRemaining(s))}`:a?`剩余 ${G.durationText(G.activityRemaining(s))}`:s.activeOrder?`${s.activeOrder.title} · ${s.activeOrder.expiresAt<s.minutes?'已超时':`剩余 ${G.durationText(s.activeOrder.expiresAt-s.minutes)}`}`:`${clock.paused?'点击顶部继续':'时间正在流逝'} · 距房租 ${Math.max(0,Math.ceil(until/60))} 小时 / ¥${home.rent}`;
    $('#action-detail').textContent=detail;
    const progress=$('.activity-progress'),ratio=a?(a.phase==='travel'?a.travelled/a.route.meters:a.elapsed/a.duration):0;
    progress.hidden=!a;progress.setAttribute('aria-valuenow',String(Math.round(ratio*100)));progress.querySelector('i').style.width=`${ratio*100}%`;
    const bar=$('#action-bar');bar.querySelector('[data-act="stop"]').hidden=!G.canStop(s)||!!s.gameOver;
    bar.querySelector('[data-act="resumeDelivery"]').hidden=!s.activeOrder||!!a||!!s.gameOver;
    bar.querySelector('[data-ui="cancel-delivery"]').hidden=!s.activeOrder||!!a||!!s.gameOver;
    const save=$('.autosave');if(save)save.innerHTML=`<i></i>${!saveOk?'保存失败':dirtySinceSave?'自动保存中':'已自动保存'}`;
  }
  function advanceWorld(minutes){
    if(!state||conflict)return;
    const before=state;
    try{state=G.advance(state,minutes);}catch(error){console.error(error);clock.pause('manual');showError('时间推进异常，已暂停。请导出存档保留现场。');return;}
    if(state===before)return;dirtySinceSave=true;
    if(state.revision!==before.revision){
      persist();renderGame();
      if(state.gameOver)openPanel('gameover');
      else if(state.pending){openPanel('event');maybeGenerateAI();}
      else if(state.ending)openPanel('ending');
    }else map?.updatePosition(state);
    if(Date.now()-lastSavedAt>=10000)persist();
  }
  function frame(timestamp){
    clock.frame(performance.now());
    if(timestamp-lastLiveAt>=100){renderLive();lastLiveAt=timestamp;}
    requestAnimationFrame(frame);
  }
  // Hidden tabs may stop receiving animation frames. Both schedulers feed the
  // same clock with performance.now(), so an overlap never advances twice.
  setInterval(()=>{if(document.hidden)clock.frame(performance.now());},1000);
  function savePage(){clock.frame(performance.now());syncPause();persist();renderLive();}
  document.addEventListener('visibilitychange',savePage);
  window.addEventListener('pagehide',savePage);
  window.addEventListener('pageshow',savePage);
  window.addEventListener('beforeunload',savePage);
  document.addEventListener('keydown',e=>{
    if(e.code!=='Space'||e.repeat||!state||dialog.open||e.target.closest('input,textarea,select,button,[role="button"]'))return;
    e.preventDefault();if(clock.reasons.has('manual'))clock.release('manual');else clock.pause('manual');persist();renderLive();
  });

  renderStart();checkAI();
  requestAnimationFrame(frame);

})(globalThis);
