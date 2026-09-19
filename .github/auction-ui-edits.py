# Temporary source transport. Every baseline and result is checked before writing.
import pathlib,hashlib
writes=[]
def patch(name,before,after,edits):
    p=pathlib.Path(name)
    text=p.read_text() if p.exists() else ''
    assert hashlib.sha256(text.encode()).hexdigest()==before, 'Unexpected baseline: '+name
    lines=text.splitlines(keepends=True)
    for start,end,value in reversed(edits):
        assert 0<=start<=end<=len(lines),name
        lines[start:end]=[value]
    text=''.join(lines)
    assert hashlib.sha256(text.encode()).hexdigest()==after, 'Result differs from tested source: '+name
    writes.append((p,text))

# Preserve the unchanged help text rather than retransmitting its long line.
_help=pathlib.Path('public/js/app.js').read_text().splitlines(keepends=True)[206]
assert _help.count('<div class="help-section"><h3>电动车与休息</h3>')==1
_help=_help.replace('<div class="help-section"><h3>电动车与休息</h3>',r'''<div class="help-section"><h3>万宝拍卖场</h3><p>开放炼药并累计送达 10 单后，导航出现「拍卖」。拍卖场位于长乐集，需沿道路到场；每天可提前查看固定的三件拍品，18:00–24:00 举牌。每轮竞价消耗 5 个游戏分钟，同时只竞拍一件。可加一口、加三口，或在被超价后免费放弃。第一口按起拍价，加三口按该基准多加两口。报价先冻结全额现金，被超价后立即全额退还，落槌后转为货款；不会在入场时直接给物品。匿名买家的预算在生成图录时固定，不会因刷新页面或改变倍率重抽。</p><p>拍品为当前境界允许的药材、成品丹药和未拥有药鼎，不包含任何丹方。药鼎席位需要已在长乐集购得第一口鼎；没有候选鼎时改为药材。竞得药鼎收入收藏，不自动替换当前药鼎。图录当天固定，次日到场换新，关闭游戏没有离线拍卖。打开面板和报价选择会暂停，等待开场需关闭面板并继续游戏；提交的一轮不可中断。冻结款无法购物或付房租，午夜房租先于同刻落槌，不足则立即结束本局，不提前退款或发货。</p></div>'''+'<div class="help-section"><h3>电动车与休息</h3>')

patch('public/js/app.js','1a7f9ca3ed66e2ae61dcaddf4bfef7e47689d4eda4a0b7c89315117a8cbf9e8a','dca99b023c8ef5db4f3f3cbb6ac16818feb06d60bcb91d297e9cb8978bce9960',[
(18,18,r'''
    auction:'M3 21h12M5 18h8v3M10 3l5 5-4 4-5-5ZM13 10l8 8-2 2-8-8',
'''[1:]),
(75,76,r'''
    $('#game-nav').innerHTML=[['cultivation','lotus','修行'],['alchemy','tea','炼药'],['auction','auction','拍卖'],['system','spark','系统'],['inventory','bag','行囊'],['bonds','people','羁绊'],['vehicle','bike','座驾'],['rest','tea','歇息']].filter(([p])=>G.panelUnlocked(s,p)).map(([p,i,l])=>`<button class="nav-btn ${p==='system'?'featured':''}" data-panel="${p}">${icon(i)}<span>${l}</span></button>`).join('')+`<span class="nav-sep"></span><button class="nav-btn" data-panel="help">${icon('help')}<span>帮助</span></button>`;
'''[1:]),
(107,108,r'''
          const localActions={garage:actionCard('查看座驾',G.featureUnlocked(s,'upgrades')?'维修与升级':'维修与保养','panel-vehicle','','bike'),clinic:actionCard('接受治疗','30 分钟 · ¥25 · 气血补满','heal','','shield',s.player.health>=c.health||s.player.money<25),temple:actionCard('在灵地修行','修炼收益额外提高 25%','panel-cultivation','','lotus')+actionCard('探寻古阵','30 分钟 · 体力 −12','explore','','spark',s.player.stamina<12),park:actionCard('沿江探索','30 分钟 · 体力 −12','explore','','spark',s.player.stamina<12),market:actionCard('吃一碗热面','20 分钟 · ¥12 · 体力 +45 / 气血 +10','meal','','tea',s.player.money<12)+actionCard('逛炼药摊','购买药鼎、药材并寻购丹方','panel-alchemy','','lotus')+actionCard('万宝拍卖场','查看今日拍品 · 每晚 18:00–24:00','panel-auction','','auction')};
'''[1:]),
(171,171,r'''
      case 'auction':{
        title=G.AUCTION.name;label='';
        const at=s.position===G.AUCTION.place,today=s.auction.day===G.day(s),hours=G.auctionHours();
        body=`<div class="auction-banner"><span class="auction-mark" aria-hidden="true">拍</span><div><h3>长乐集 · 万宝夜拍</h3><p class="copy">每日 ${hours} · 每轮 ${G.AUCTION.roundMinutes} 分钟</p></div></div><div class="stat-grid">${statsBox('可用现金',s.player.money,'元')}${statsBox('冻结款',G.auctionHeld(s),'元')}${statsBox('累计竞得',s.auction.wins,'件')}</div>`;
        if(!at)body+=`<div class="section-title"><h3>到场竞拍</h3></div>${routeButton(G.AUCTION.place,'前往长乐集拍卖场')}`;
        if(!today){
          body+=`<div class="card" style="margin-top:16px"><h3>第 ${G.day(s)} 日拍品图录</h3><p class="copy">每日三件拍品，药材、成品丹药与可驾驭的药鼎。不拍卖丹方；已有药鼎不重复竞得。</p>${at?btn('查看今日拍品','data-act="auctionCatalog"','primary wide'):'<p class="copy">到场后可提前查看当日图录，18:00 开始举牌。</p>'}</div>`;
        }else{
          body+=`<div class="section-title"><h3>第 ${s.auction.day} 日 · 三件拍品</h3>${tag(s.minutes%1440<G.AUCTION.opens?'尚未开拍':'夜拍进行中','gold')}</div><div class="stack">${s.auction.lots.map(lot=>{
            const info=G.auctionLotInfo(lot),one=G.auctionNextBid(lot,1),three=G.auctionNextBid(lot,3),block=G.auctionBidBlock(s,lot,1),jumpBlock=G.auctionBidBlock(s,lot,3);
            const status={ready:'待拍',bidding:'竞价中',decision:'等待回应',won:'已竞得',lost:'已退出'}[lot.status];
            return `<article class="card auction-lot" data-auction-lot="${lot.id}"><div class="row"><div><small>${{material:'药材',pill:'成品丹药',cauldron:'药鼎'}[lot.kind]} · ${info.tier} 阶</small><h3>${esc(info.name)} ×${lot.count}</h3></div>${tag(status,lot.status==='won'?'mint':'')}</div><p class="copy">${esc(info.desc)}</p><div class="detail-list"><div><span>参考价</span><strong>¥${info.value}</strong></div><div><span>${lot.status==='ready'?'起拍价':lot.status==='won'?'成交价':'当前报价'}</span><strong>¥${lot.price||info.opening}</strong></div><div><span>每口加价</span><strong>¥${info.step}</strong></div></div>${lot.status==='ready'?`<div class="auction-bid-controls">${btn(`起拍 · ¥${one}`,`data-act="auctionBid" data-id="${lot.id}" data-raise="1"${disabled(!!block)}`,'small')}${btn(`加三口 · ¥${three}`,`data-act="auctionBid" data-id="${lot.id}" data-raise="3"${disabled(!!jumpBlock)}`,'small')}</div>${block?`<p class="copy">${esc(block)}</p>`:''}`:lot.status==='bidding'?`<p class="copy">已冻结 ¥${lot.held}。关闭面板后按游戏时间继续竞价。</p>`:lot.status==='won'?'<p class="copy">拍品已入库，不会重复扣款或发放。</p>':'<p class="copy">未收取货款，上一笔冻结款已返还。</p>'}</article>`;
          }).join('')}</div>`;
        }
        foot='图录当天固定，次日到场再换新。出价冻结全额现金，被超价则全额退还；落槌才转为货款。冻结款不能付房租。打开面板会暂停时间，等待开场需关闭面板并继续游戏。';break;
      }
'''[1:]),
(195,197,r'''
        body=`${p.aiStatus==='unrequested'?`<div class="ai-status">${aiFlight?'正在生成 AI 剧情；也可直接按下方经典选项继续。':'本次奇遇支持 AI 生成；接口不可用时使用经典选项。'}</div>`:''}<div class="event-text">${esc(p.text)}</div><div class="choice-list">${p.choices.map((choice,i)=>{const block=G.choiceBlock(s,choice);const cost=Object.entries(choice.itemCost||{}).map(([id,n])=>`${G.ITEMS.find(it=>it.id===id)?.name||id} −${n}`).join(' · ');return `<button class="choice" data-act="choose" data-index="${i}" data-event="${esc(p.id)}"${disabled(!!block)}><strong><span class="choice-index">0${i+1}</span>${esc(choice.label)}</strong><small>${esc(block||(p.kind==='auction'?(choice.auctionRaise?`冻结 ¥${-choice.effects.money}`:'不收取费用'):G.effectText(choice.effects)))}${cost?` · ${esc(cost)}`:''}${choice.duration?` · ${choice.duration} 分钟`:''}</small></button>`;}).join('')}</div>`;
        foot=`${p.kind==='auction'?'出价先冻结全额现金，每轮 5 分钟；放弃不收取费用。':p.delivery?'完成选择后结算配送奖励。':'选择会影响你的属性与后续关系。'} 事件已自动保存，刷新后仍可继续。`;break;
'''[1:]),
(206,207,_help),
(213,214,r'''
      if(!['buy','sign','claim','stop','panel-cultivation','panel-alchemy','panel-vehicle','panel-auction'].includes(button.dataset.act))button.disabled=true;
'''[1:]),
(218,219,r'''
    if(!state)return;if(['panel-cultivation','panel-alchemy','panel-vehicle','panel-auction'].includes(action)){openPanel(action.slice(6));return;}
'''[1:]),
(220,221,r'''
    clearError();const oldPending=state.pending?.id,oldPendingKind=state.pending?.kind;let r;try{r=G.perform(state,action,payload);}catch(error){console.error(error);showError('行动发生异常，未写入本次变更。请导出存档保留现场。');return;}
'''[1:]),
(225,225,r'''
    else if(oldPendingKind==='auction'&&!state.activity)openPanel('auction');
'''[1:]),
(256,257,r'''
    if(button.dataset.act){const d=button.dataset;const payload={id:d.id,target:d.target,kind:d.kind,mode:d.mode,recipe:d.recipe,raise:d.raise===undefined?undefined:Number(d.raise),index:Number(d.index),eventId:d.event,usePill:usePill&&(state?.inventory.foundation||0)>0};act(d.act,payload);return;}
'''[1:]),
(321,322,r'''
    $('#action-detail').textContent=detail+(a?.kind==='auction'?` · 冻结 ¥${G.auctionHeld(s)}`:'');
'''[1:]),
(339,339,r'''
      else if(before.activity?.kind==='auction'&&!state.activity)openPanel('auction');
'''[1:]),
])

patch('public/styles.css','cc123333c0b6d194416ab2861dc779919b1245146274935e4f275fb2c23543cb','f4e54a16ed352ac793be96ae854f8f3f3fb8166f2e71d40b43e602ea01be36ef',[
(24,24,r'''

/* 拍卖只展示当前场次与报价；结果历史仍集中在行旅日志。 */
.auction-banner{display:flex;align-items:center;gap:16px;margin-bottom:18px}
.auction-mark{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;border:1px solid var(--gold);border-radius:14px;color:var(--gold);font-size:24px}
.auction-lot>.row{flex-wrap:wrap;gap:10px}.auction-lot h3{overflow-wrap:anywhere}
.auction-lot .detail-list{margin:12px 0}.auction-bid-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:420px){.auction-bid-controls{grid-template-columns:1fr}.auction-bid-controls .btn{min-height:44px}}
'''[1:]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
