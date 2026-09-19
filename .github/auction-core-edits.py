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

patch('package.json','bc2f4a9b514960d5253b1475795345a3751c751bdf9ed8fd4d5430b5a35dce77','44c6c21ee49e2eb012337f81790a824482c17c90b1ca61271e3bbeb274a55f46',[
(2,3,r'''
  "version": "1.6.0",
'''[1:]),
])

patch('public/js/data.js','0ec838c30ab147960bd96daf7a6a64c8e07d12e62d7104592108388b209babfc','5235eab0d8c06c23e21c11834499d7a11c9e492f8fd9986948d0699de4bf9331',[
(4,6,r'''
  G.VERSION = 11;
  G.APP_VERSION = '1.6.0';
'''[1:]),
(12,12,r'''
  G.ALCHEMY_REALM_BY_TIER = Object.freeze([0,0,0,1,1,2,3,3,4,5]);
  G.AUCTION = Object.freeze({name:'万宝拍卖场',place:'market',opens:1080,roundMinutes:5,lotCount:3,
    openingRatio:.65,stepRatio:.08,maxRivalSteps:8,
    realmByTier:G.ALCHEMY_REALM_BY_TIER});
  // 匿名席位，不作为自动结识的羁绊人物。
  G.AUCTION_BIDDERS = [{id:'herbalist',name:'青衣药商'},{id:'wanderer',name:'赤袖散修'},{id:'collector',name:'青灯藏家'}];
'''[1:]),
(25,25,r'''
    {id:'auction',name:'拍卖场',hint:'开放炼药后，累计完成并结算 10 单配送',requires:['alchemy'],ready:s=>s.stats.delivered>=10,
      notice:'长乐集的万宝拍卖场递来请柬。导航已开放拍卖，每晚 18:00–24:00 可到场竞价。'},
'''[1:]),
(30,31,r'''
  G.FEATURE_PANELS = {system:'system',cultivation:'cultivation',alchemy:'alchemy',bonds:'bonds',auction:'auction'};
'''[1:]),
(196,197,r'''
  const ALCHEMY_REALM_BY_TIER = G.ALCHEMY_REALM_BY_TIER;
'''[1:]),
])

patch('public/js/engine.js','ea281d2085259091db117a0445f7860d208e17531b977492fab8790844168719','3472710f47f33b1f34265e43031fbaa82e548aa0ae530e4bf4459d1842e8bbf3',[
(12,14,r'''
  // 仅展示时容忍积分浮点尾差，避免完成五分钟竞价却显示为前一分钟。
  const displayMinute = m => Math.floor(m+1e-8);
  G.clock = s => {const m=displayMinute(s.minutes);return `${String(Math.floor(m%1440/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
  G.timestamp = m => `第${Math.floor(displayMinute(m)/1440)+1}日 ${G.clock({minutes:m})}`;
'''[1:]),
(43,43,r'''
      auction:G.emptyAuction(),
'''[1:]),
(166,167,r'''
      upgrade:'upgrades',visit:'bonds',finale:'endings',auctionCatalog:'auction',auctionBid:'auction',auction:'auction'};
'''[1:]),
(200,200,r'''
  };
  // 拍品与对手预算只在首次查看当日图录时生成；渲染和每帧推进均不抽奖。
  G.emptyAuction = () => ({day:0,realm:0,lots:[],activeId:null,wins:0,spent:0});
  G.auctionLot = (s,id) => s.auction?.lots.find(l=>l.id===id);
  G.auctionHours = () => `${String(G.AUCTION.opens/60).padStart(2,'0')}:00–24:00`;
  G.auctionCloseAt = s => s.auction.day*1440;
  G.auctionHeld = s => s.auction?.lots.reduce((n,l)=>n+l.held,0)||0;
  G.auctionLotInfo = lot => {
    const material=lot?.kind==='material'?G.alchemyMaterial(lot.item):null;
    const pill=lot?.kind==='pill'?G.PILL_ITEMS.find(p=>p.id===lot.item):null;
    const cauldron=lot?.kind==='cauldron'?G.CAULDRONS.find(c=>c.level>0&&String(c.level)===lot.item):null;
    const item=material||pill||cauldron;if(!item)return null;
    const value=material?material.price*lot.count:cauldron?cauldron.cost:(60+pill.tier*25+(pill.pillType==='foundation'?60:0))*lot.count;
    return {name:item.name,tier:item.tier,desc:item.desc,value,
      realm:material?.realm??cauldron?.realm??G.AUCTION.realmByTier[pill.tier],
      opening:Math.ceil(value*G.AUCTION.openingRatio/5)*5,
      step:Math.max(5,Math.ceil(value*G.AUCTION.stepRatio/5)*5)};
  };
  G.auctionNextBid = (lot,raise=1) => {
    const info=G.auctionLotInfo(lot);
    return info?(lot.status==='ready'?info.opening-info.step:lot.price)+info.step*raise:0;
  };
  G.auctionBidBlock = (s,lot,raise=1) => {
    const feature=G.featureBlock(s,'auctionBid');if(feature)return feature;
    if(s.position!==G.AUCTION.place)return '请先到长乐集的万宝拍卖场。';
    if(![1,3].includes(raise))return '只能选择加一口或加三口。';
    if(!lot||!['ready','decision'].includes(lot.status)||s.auction.day!==G.day(s))return '这件拍品已结束或不属于今日场次。';
    if(s.auction.activeId&&s.auction.activeId!==lot.id)return '请先完成当前拍品的竞价。';
    const today=s.minutes%1440;
    if(today<G.AUCTION.opens)return `尚未开拍，每日 ${G.auctionHours()} 举行。`;
    if(s.minutes+G.AUCTION.roundMinutes>G.auctionCloseAt(s)+EPS)return '距散场不足一轮，不能再出价。';
    const info=G.auctionLotInfo(lot);
    if(!info||info.realm>s.player.realm)return '境界不足，无法竞拍这件拍品。';
    if(lot.kind==='cauldron'){
      if(!s.alchemy.cauldrons.length)return '需要先在长乐集购得自己的第一口药鼎。';
      if(s.alchemy.cauldrons.includes(Number(lot.item)))return '已经拥有这口药鼎，不重复竞拍。';
    }else if((s.inventory[lot.item]||0)+lot.count>9999)return '行囊中该物品数量已接近上限。';
    if(s.player.money<G.auctionNextBid(lot,raise))return '现金不足以冻结本次出价。';
    return '';
  };
  function prepareAuction(s){
    if(s.auction.day===G.day(s))return;
    must(!s.auction.activeId,'上一件拍品尚未完成。');
    const pick=pool=>pool[int(s,0,pool.length-1)];
    const materials=G.ALCHEMY_MATERIALS.filter(m=>m.realm<=s.player.realm);
    const pills=G.PILL_ITEMS.filter(p=>G.AUCTION.realmByTier[p.tier]<=s.player.realm);
    const cauldrons=s.alchemy.cauldrons.length?G.CAULDRONS.filter(c=>c.level>0&&c.realm<=s.player.realm&&!s.alchemy.cauldrons.includes(c.level)):[];
    const first=pick(materials),third=cauldrons.length?{kind:'cauldron',item:String(pick(cauldrons).level),count:1}
      : {kind:'material',item:pick(materials.filter(m=>m.id!==first.id)).id,count:int(s,3,5)};
    const lots=[{kind:'material',item:first.id,count:int(s,3,5)},
      {kind:'pill',item:pick(pills).id,count:int(s,1,2)},third].map((spec,index)=>{
        const info=G.auctionLotInfo(spec);
        return {...spec,id:`auction-${G.day(s)}-${index}`,status:'ready',price:0,leader:null,held:0,round:0,
          rivals:G.AUCTION_BIDDERS.map(b=>({id:b.id,ceiling:info.opening+info.step*int(s,0,G.AUCTION.maxRivalSteps)}))};
      });
    s.auction={...s.auction,day:G.day(s),realm:s.player.realm,lots,activeId:null};
    G.log(s,`翻开万宝拍卖场第 ${s.auction.day} 日图录：三件拍品已经封存，${G.auctionHours()} 可到场竞价。今日不因重开面板或读档换货。`,'拍卖');
  }
  G.auctionDecision = (s,lot) => {
    const info=G.auctionLotInfo(lot),name=G.AUCTION_BIDDERS.find(b=>b.id===lot.leader)?.name||'另一位买家';
    return {id:`${lot.id}-round-${lot.round}`,templateId:'auction-bid',kind:'auction',source:'classic',aiStatus:'skip',
      auction:{day:s.auction.day,lotId:lot.id,round:lot.round},title:'万宝拍卖场 · 继续竞价',
      text:`${name}为「${info.name} ×${lot.count}」出价 ¥${lot.price}。你的上一笔冻结款已全额返还。参考价 ¥${info.value}，每口 ¥${info.step}。继续出价将冻结新的全额报价；放弃不收取费用。`,
      choices:[1,3].map(raise=>({label:`${raise===1?'加一口':'加三口'} · 出价 ¥${G.auctionNextBid(lot,raise)}`,
        effects:{money:-G.auctionNextBid(lot,raise)},duration:G.AUCTION.roundMinutes,auctionRaise:raise}))
        .concat({label:'放弃这件拍品，保留现金',effects:{},auctionRaise:0})};
  };
  function startAuctionBid(s,lot,raise){
    const block=G.auctionBidBlock(s,lot,raise);must(!block,block);
    const price=G.auctionNextBid(lot,raise);s.player.money-=price;
    lot.price=price;lot.held=price;lot.leader='player';lot.status='bidding';lot.round++;s.auction.activeId=lot.id;
    begin(s,'auction',{day:s.auction.day,lotId:lot.id,round:lot.round});
    G.log(s,`为「${G.auctionLotInfo(lot).name} ×${lot.count}」举牌 ¥${price}，全额暂时冻结。竞价 ${G.AUCTION.roundMinutes} 分钟后回应；冻结款不能用于购物或支付房租。`,'拍卖');
  }
  function finishAuctionBid(s,a){
    const lot=G.auctionLot(s,a.params.lotId),info=G.auctionLotInfo(lot);
    must(lot?.status==='bidding'&&lot.round===a.params.round&&s.auction.day===a.params.day,'拍卖轮次与行动不一致。');
    const rivals=lot.rivals.filter(r=>r.ceiling>=lot.price+info.step);
    const rival=rivals.length?rivals[(lot.round-1)%rivals.length]:null;
    if(rival){
      const refunded=lot.held;s.player.money+=refunded;lot.held=0;lot.price+=info.step;lot.leader=rival.id;
      const name=G.AUCTION_BIDDERS.find(b=>b.id===rival.id).name;
      G.log(s,`${name}加价至 ¥${lot.price}，你的 ¥${refunded} 冻结款已全额返还。`,'拍卖');
      if(s.minutes+G.AUCTION.roundMinutes>G.auctionCloseAt(s)+EPS){
        lot.status='lost';s.auction.activeId=null;G.log(s,`场次即将结束，已无完整竞价轮次。「${info.name}」由${name}竞得。`,'拍卖');
      }else{lot.status='decision';s.pending=G.auctionDecision(s,lot);}
    }else{
      const price=lot.held;lot.held=0;lot.status='won';s.auction.activeId=null;
      if(lot.kind==='cauldron')s.alchemy.cauldrons=[...new Set([...s.alchemy.cauldrons,Number(lot.item)])].sort((a,b)=>a-b);
      else s.inventory[lot.item]=(s.inventory[lot.item]||0)+lot.count;
      s.auction.wins++;s.auction.spent+=price;
      G.log(s,`落槌成交：「${info.name} ×${lot.count}」，成交价 ¥${price}。冻结款转为货款，${lot.kind==='cauldron'?'药鼎已收入收藏，可在长乐集切换使用':'拍品已放入行囊'}，不再重复扣款。`,'拍卖');
    }
  }
  // 拍卖涉及已扣除的冻结款：遇到损坏的轮次必须拒绝读档，不能重置并吞钱/重发物品。
  G.cleanAuction = (raw,s) => {
    const validInt=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
    must(raw&&typeof raw==='object'&&!Array.isArray(raw),'拍卖存档缺失或损坏。');
    must(validInt(raw.day,0,G.day(s))&&validInt(raw.realm,0,s.player.realm)&&Array.isArray(raw.lots),'拍卖场次无效。');
    must(validInt(raw.wins,0,1e8)&&validInt(raw.spent,0,1e12),'拍卖累计记录无效。');
    must(raw.lots.length===(raw.day?G.AUCTION.lotCount:0),'拍品数量无效。');
    const lots=raw.lots.map((l,index)=>{
      must(l&&l.id===`auction-${raw.day}-${index}`&&['material','pill','cauldron'].includes(l.kind),'拍品标识无效。');
      must(validInt(l.count,l.kind==='material'?3:1,l.kind==='material'?5:l.kind==='pill'?2:1),'拍品数量超出范围。');
      const info=G.auctionLotInfo(l);must(info&&info.realm<=raw.realm,'拍品不在该场次允许范围内。');
      must(['ready','bidding','decision','won','lost'].includes(l.status)&&validInt(l.round,0,G.AUCTION.maxRivalSteps+2),'拍品状态无效。');
      must(Array.isArray(l.rivals)&&l.rivals.length===G.AUCTION_BIDDERS.length,'竞价者记录无效。');
      const rivals=l.rivals.map((r,i)=>{
        must(r?.id===G.AUCTION_BIDDERS[i].id&&validInt((r.ceiling-info.opening)/info.step,0,G.AUCTION.maxRivalSteps),'竞价预算无效。');
        return {id:r.id,ceiling:r.ceiling};
      });
      if(l.status==='ready')must(l.price===0&&l.held===0&&l.round===0&&l.leader===null,'待拍拍品包含非法出价。');
      else{
        must(l.round>=1&&validInt((l.price-info.opening)/info.step,0,G.AUCTION.maxRivalSteps+3),'拍卖报价无效。');
        must(l.held===(l.status==='bidding'?l.price:0),'拍卖冻结款与报价不一致。');
        if(['bidding','won'].includes(l.status))must(l.leader==='player','当前竞得者无效。');
        else must(rivals.some(r=>r.id===l.leader&&r.ceiling>=l.price),'对手报价无效。');
        if(l.status==='won')must(rivals.every(r=>r.ceiling<l.price+info.step),'落槌结果与竞价记录不一致。');
      }
      return {id:l.id,kind:l.kind,item:l.item,count:l.count,status:l.status,price:l.price,leader:l.leader,held:l.held,round:l.round,rivals};
    });
    const active=lots.filter(l=>['bidding','decision'].includes(l.status));
    must(active.length<=1&&raw.activeId===(active[0]?.id||null),'拍卖当前轮次无效。');
    must(raw.wins>=lots.filter(l=>l.status==='won').length&&raw.spent>=lots.filter(l=>l.status==='won').reduce((n,l)=>n+l.price,0),'拍卖结算记录缺失。');
    return {day:raw.day,realm:raw.realm,lots,activeId:raw.activeId,wins:raw.wins,spent:raw.spent};
  };
  G.validateAuctionLinks = s => {
    const lot=G.auctionLot(s,s.auction.activeId),a=s.activity,p=s.pending;
    if(!lot){must(a?.kind!=='auction'&&p?.kind!=='auction','进行中的拍卖缺少对应拍品。');return;}
    must(s.position===G.AUCTION.place,'进行中的拍卖不在拍卖场。');
    const info=G.auctionLotInfo(lot);
    if(lot.kind==='cauldron')must(s.alchemy.cauldrons.length>0&&!s.alchemy.cauldrons.includes(Number(lot.item)),'待结算药鼎所有权不一致。');
    else must((s.inventory[lot.item]||0)+lot.count<=9999,'待结算拍品超出行囊容量。');
    must(info.realm<=s.player.realm,'进行中的拍卖境界不符。');
    if(lot.status==='bidding'){
      must(a?.kind==='auction'&&a.params.day===s.auction.day&&a.params.lotId===lot.id&&a.params.round===lot.round,'冻结款缺少对应竞价行动。');
      must(a.phase==='work'&&a.startedAt>=(s.auction.day-1)*1440+G.AUCTION.opens&&a.startedAt+G.AUCTION.roundMinutes<=G.auctionCloseAt(s)+EPS,'拍卖行动时间无效。');
      must(Math.abs(a.startedAt+a.elapsed-s.minutes)<1e-6,'拍卖进度与游戏时间不一致。');
    }else{
      must(p?.kind==='auction'&&p.auction.day===s.auction.day&&p.auction.lotId===lot.id&&p.auction.round===lot.round,'拍卖缺少待选轮次。');
      must(s.minutes+G.AUCTION.roundMinutes<=G.auctionCloseAt(s)+EPS,'拍卖选择已经过期。');
    }
'''[1:]),
(274,275,r'''
    s.player.money = clamp(Math.round(s.player.money),0,9999999-G.auctionHeld(s)); s.player.coins = clamp(Math.round(s.player.coins),0,999999);
'''[1:]),
(324,324,r'''
    if(s.pending?.kind==='auction')return c.auctionRaise===0?'':G.auctionBidBlock(s,G.auctionLot(s,s.pending.auction.lotId),c.auctionRaise);
'''[1:]),
(335,336,r'''
  G.canStop = s => !!s.activity && !['choice','rescue','auction'].includes(s.activity.kind);
'''[1:]),
(350,351,r'''
    auction:G.AUCTION.roundMinutes,cultivate:p.kind==='meditate'?90:p.kind==='body'?30:45,alchemy:G.alchemyRecipe(p.recipe)?.duration||0,choice:p.duration||0})[kind]||0;
'''[1:]),
(460,460,r'''
      case 'auction':finishAuctionBid(s,a);break;
'''[1:]),
(476,477,r'''
  G.activityLabel = a => ({travel:'赶路',deliver:'配送',moveHome:'搬家',sleep:'睡眠',visit:'交谈',rest:'休息',cultivate:'修炼',breakthrough:'突破',alchemy:'炼药',explore:'探索',charge:'充电',repair:'维修',upgrade:'升级座驾',heal:'治疗',meal:'用餐',choice:'处理事件',rescue:'救助',auction:'拍卖竞价'})[a?.kind]||'原地停留';
'''[1:]),
(600,600,r'''
          if(s.pending.kind==='auction'){
            must(Number.isInteger(payload.index)&&payload.index>=0&&payload.index<=2,'竞拍选项不存在。');
            const p=s.pending,lot=G.auctionLot(s,p.auction.lotId);
            must(lot?.status==='decision'&&p.auction.day===s.auction.day&&p.auction.round===lot.round,'这轮竞价已经处理。');
            s.pending=null;
            if(payload.index===2){lot.status='lost';s.auction.activeId=null;G.log(s,`你放弃「${G.auctionLotInfo(lot).name}」，不收取费用，保留已返还的现金。`,'拍卖');markComplete(s,'auction');}
            else startAuctionBid(s,lot,payload.index===0?1:3);
            break;
          }
'''[1:]),
(640,641,r'''
          const item=G.ITEMS.find(i=>i.id===payload.id);must(item&&item.shop!==false,'这件物品不能通过系统直接兑换。');must(!item.unique||(!s.learned.includes(item.id)&&!s.equipment.includes(item.id)),'已经拥有，不能重复兑换。');must(s.player.coins>=item.cost,'外卖币不足，请先完成配送。');
          const reserved=s.auction.lots.filter(l=>l.status==='bidding'&&l.item===item.id&&l.kind!=='cauldron').reduce((n,l)=>n+l.count,0);
          must(!reserved||(s.inventory[item.id]||0)+reserved+1<=9999,'行囊容量已为竞拍中的物品预留。');s.player.coins-=item.cost;
'''[1:]),
(655,655,r'''
        case 'auctionCatalog':
          must(s.position===G.AUCTION.place,'请先到长乐集的万宝拍卖场。');prepareAuction(s);break;
        case 'auctionBid':
          startAuctionBid(s,G.auctionLot(s,payload.id),payload.raise??1);break;
'''[1:]),
])

patch('public/js/storage.js','88190a96d88f5d51335a7f03daf2556d5eff8ea5ef5bf9c26a306cc64cba9509','c994bc87c086bc86c0175533e2caa2292543024255f5cbf14e6ab8de33d66644',[
(4,7,r'''
  G.STORAGE_KEY = 'night-courier:saves:v11';
  G.LEGACY_STORAGE_KEY = 'night-courier:saves:v10';
  G.LEGACY_STORAGE_KEYS = [G.LEGACY_STORAGE_KEY,'night-courier:saves:v9','night-courier:saves:v8','night-courier:saves:v7','night-courier:saves:v6','night-courier:saves:v5','night-courier:saves:v4','night-courier:saves:v3'];
'''[1:]),
(23,23,r'''
    if(p.kind==='auction'||p.templateId==='auction-bid'){
      const lot=G.auctionLot(s,p.auction?.lotId);
      if(!lot||lot.status!=='decision'||p.auction.day!==s.auction.day||p.auction.round!==lot.round)throw new Error('拍卖待选轮次无效。');
      const clean=G.auctionDecision(s,lot);
      if(p.id!==clean.id)throw new Error('拍卖事件标识与轮次不一致。');
      return clean; // 丢弃任何外来 effects / AI 文本；从当前拍品重建三个固定操作。
    }
'''[1:]),
(37,38,r'''
    const kinds=['travel','deliver','moveHome','sleep','visit','rest','cultivate','breakthrough','alchemy','explore','charge','repair','upgrade','heal','meal','choice','rescue','auction'];
'''[1:]),
(65,65,r'''
    if(kind==='auction'){
      const lot=G.auctionLot(s,p.lotId);
      if(!lot||lot.status!=='bidding'||p.day!==s.auction.day||p.round!==lot.round||raw.phase!=='work'||raw.target||raw.route)throw new Error('拍卖行动与冻结款不一致。');
      if(raw.duration!==G.AUCTION.roundMinutes||!Number.isFinite(raw.elapsed)||raw.elapsed<0||raw.elapsed>raw.duration||!Number.isFinite(raw.startedAt))throw new Error('拍卖行动进度无效。');
      if(Object.keys(raw.recovery||{}).length||raw.gainedQi)throw new Error('竞拍行动不能携带额外恢复或修为。');
      params.day=p.day;params.lotId=p.lotId;params.round=p.round;duration=G.AUCTION.roundMinutes;
    }
'''[1:]),
(66,66,r'''
      if(p.event?.kind==='auction')throw new Error('拍卖必须使用独立竞价行动。');
'''[1:]),
(108,109,r'''
    if(![1,2,3,4,5,6,7,8,9,10,11].includes(version))throw new Error('存档版本未知或高于本程序。原仓库未知格式不能保证兼容。');
'''[1:]),
(167,167,r'''
    s.auction=version>=11?G.cleanAuction(raw.auction,s):G.emptyAuction();
'''[1:]),
(175,175,r'''
    G.validateAuctionLinks(s);
'''[1:]),
(177,178,r'''
    if(version<G.VERSION)G.log(s,`存档已从重建版 v${version} 结构升级至 v${G.VERSION}：既有地图、连续时间、九重境界与丹方所有权继续保留；玩法入口按已完成经历、已有物品与在途行动恢复，不重复扣费或结算；拍卖记录独立初始化，冻结款与轮次成对恢复。`,'存档');
'''[1:]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
