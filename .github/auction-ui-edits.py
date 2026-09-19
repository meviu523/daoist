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
(206,207,r'''
        title='给初来此城的你';label='Field notes';body=`<div class="help-section"><h3>玩法逐步开启</h3><p>开局保留行囊、座驾、歇息和帮助；地图接单、移动、补给、充电、维修、更换住处与存档始终可用。其余导航与操作在条件达成后出现，未开启时不显示占位按钮。解锁通知只记录在右下角日志，已开启功能不会因花钱、使用物品或关系变化而收回。</p><div class="detail-list">${G.FEATURE_UNLOCKS.map(f=>`<div><span>${esc(f.name)}${s?` · ${G.featureUnlocked(s,f.id)?'已开启':'未开启'}`:''}<small style="display:block">${esc(f.hint)}</small></span></div>`).join('')}</div><p>丹方需实际获得后才显示。炼药入口开放不赠送药鼎，也不放宽配伍、境界与熟练度要求。主线委托仅显示已领取篇章和下一篇章，系统兑换与药摊按境界逐步展示。</p></div><div class="help-section"><h3>白天送外卖，入夜修行</h3><p>点地图上的金色订单标记，查看要求、距离、耗时与报酬，再选择「接单并配送」。取餐与送餐已经合并，没有单独的取餐流程。接单后人物沿道路前往目的地，到达并处理事件后才获得报酬；停止移动不会取消已接订单。空缺配送点在行动完成或每 15 个游戏分钟补充，普通收餐地点仅在有订单时显示。</p></div><div class="help-section"><h3>时间与地图</h3><p>正常速度下现实 1 秒等于游戏 1 分钟。时间运行时，即使原地不动，订单和房租也会继续计时。顶部可暂停或切换 1 / 3 / 10 倍速度，地图空白处也可按空格暂停。打开面板和剧情会自动暂停；手动暂停不会被关闭面板解除。切换标签页或应用不会自动暂停，后台仍按当前倍率计时；后台计时器被浏览器延迟时，返回后会分批推进本次会话经过的时间，遇到剧情选择立即停下。要暂时离开而不计时，请先手动暂停。关闭或重载页面后不补算离线时间，读档仍需手动继续。</p><p>人物沿道路逐段移动，路程除以当前速度得到实际耗时，界面分钟数向上取整仅供预估。停止行动只停止当前活动，世界时间仍会流逝。体力和电量按实际路程消耗，休息、充电和修炼逐步生效。中断不退已投入材料；突破中断不退投入修为。系统兑换、签到、领奖、用药不耗时。</p><p>鼠标滚轮缩放，按住拖动平移；手机可单指平移、双指缩放。键盘方向键平移，+ / − 缩放，Home 查看全城。右上角「◎」定位玩家，「全图」查看扩展后的 110 个地点。已发布的 99 个地点及四座桥保留，继续向南扩展南岸新街；普通配送点仍只在有订单时出现。</p></div><div class="help-section"><h3>系统与修仙</h3><p>外卖币从成功配送、签到与委托奖励中获得。直接打开系统兑换，不必跑驿站。丹药在行囊使用，心法与装备兑换后立即生效。18:00–次日 06:00 修炼有夜间加成；听雨观另有灵地加成。六个大境界都分为一重至九重；达到当前小境界门槛后才能突破，九重之后才进入下一大境界。炼药师需要先在长乐集购买药鼎；现有 24 种药鼎分九阶、64 种药材和 108 张丹方。丹方必须先获得：剧情、羁绊、商店各有 36 张专属丹方。首个主线委托领奖与五段主线选择结算后获得剧情丹方；六位 NPC 各传授 6 张，分别要求完成第 1 / 2 / 4 章且信任达到 3 / 9 / 20，友情和情感路线均可。长乐集只出售商店类未知残卷，不重复抽到已收录丹方。普通探索不再直接掉落丹方，未获得丹方不显示名称与配伍。旧档已获得丹方不会回收，已完成的剧情和羁绊会补领未取得的奖励。获得后仍需满足熟练度、境界、药鼎、药材与灵力条件才能开炉。丹方只决定配伍、火候与难度，丹药阶数由当前药鼎与炼药师共同决定。</p></div><div class="help-section"><h3>万宝拍卖场</h3><p>开放炼药并累计送达 10 单后，导航出现「拍卖」。拍卖场位于长乐集，需沿道路到场；每天可提前查看固定的三件拍品，18:00–24:00 举牌。每轮竞价消耗 5 个游戏分钟，同时只竞拍一件。可加一口、加三口，或在被超价后免费放弃。第一口按起拍价，加三口按该基准多加两口。报价先冻结全额现金，被超价后立即全额退还，落槌后转为货款；不会在入场时直接给物品。匿名买家的预算在生成图录时固定，不会因刷新页面或改变倍率重抽。</p><p>拍品为当前境界允许的药材、成品丹药和未拥有药鼎，不包含任何丹方。药鼎席位需要已在长乐集购得第一口鼎；没有候选鼎时改为药材。竞得药鼎收入收藏，不自动替换当前药鼎。图录当天固定，次日到场换新，关闭游戏没有离线拍卖。打开面板和报价选择会暂停，等待开场需关闭面板并继续游戏；提交的一轮不可中断。冻结款无法购物或付房租，午夜房租先于同刻落槌，不足则立即结束本局，不提前退款或发货。</p></div><div class="help-section"><h3>电动车与休息</h3><p>电量不足或车况归零会阻止骑行，但可以切换步行推车。回小屋睡眠会充满电量；可在任意地点花 ¥${G.CHARGE.cost} 充电，${G.CHARGE.minutes} 个游戏分钟逐步补满，无需前往修车铺；提前停止只保留已充入的电量。速度、电池容量、耐用性在修车铺独立升级，各最高 5 级。住处有不同周租与睡眠恢复效果，可在「歇息」中搬家；搬家按地图距离消耗时间、体力与电量。每 7 天按当前住处自动扣租，现金不足以支付完整房租时本局立即结束。搬家到达后新住处才生效；房租和配送同刻发生时先扣房租。</p></div><div class="help-section"><h3>角色与人际关系</h3><p>悟性影响修炼、炼药与突破，根骨降低移动体力消耗，身法影响步行速度；机缘影响随机奇遇触发率，以及探索时额外发现灵草的概率。善缘与口碑影响路线条件和配送收益。六位 NPC 各有四章故事，每日最多深入交谈一次。友情与情感路线需你明确选择，不会自动绑定。五种结局都允许继续游玩。</p></div><div class="help-section"><h3>剧情与日志</h3><p>行为与事件结果只记录在右下角「行旅日志」。事件弹窗用于当前选择，不另建历史记录。经典模式无需网络；AI 模式生成随机奇遇，关键主线与人物章节保持固定。AI 的效果由引擎白名单校验，超限、无免费选项或接口失败都会回退经典事件。</p></div><div class="help-section"><h3>AI 接入</h3><p>当前：${esc(aiHealth.message)}。在项目根目录按 <code>.env.example</code> 配置服务端地址、模型和密钥，用 <code>npm start</code> 启动。密钥不进入浏览器或存档。AI 模式会将角色名、部分状态、地点与最近剧情摘要发送到你配置的服务，可能产生调用费用。模式只能在新建存档时选择，局内不可更改。</p></div><div class="help-section"><h3>自动存档与备份</h3><p>最多保存 ${G.MAX_SAVES} 段旅程，关键行动及暂停时立即自动保存，运行期间每 10 秒自动保存，另外保留上一次写入前的本地备份。导入一律生成新副本，不覆盖已有进度。浏览器清理网站数据会删除本地存档，请定期导出。多个标签页同时操作会暂停旧页，避免覆盖新进度。纯单机数据可被开发者工具修改；本版不提供服务端防作弊。</p><p>此版本按对话中的需求重新实现，不是原仓库逐文件恢复。原始存档结构未知，不保证能够直接导入；仅对重建版已识别结构做升级处理。</p></div><div class="button-row">${btn('导入存档','data-ui="import"','small')}${btn('导出全部','data-ui="export-all"','small')}${btn('恢复上次自动备份','data-ui="restore"','small')}</div>`;break;
'''[1:]),
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
