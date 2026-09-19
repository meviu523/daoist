# Temporary hash-verified source transport; removed before merging.
import hashlib,pathlib
writes=[]
def patch(name,before,after,edits):
    p=pathlib.Path(name)
    old=p.read_text() if p.exists() else ''
    assert hashlib.sha256(old.encode()).hexdigest()==before, 'Unexpected baseline: '+name
    text=old
    for start,end,value in reversed(edits):
        assert 0<=start<=end<=len(old), name
        text=text[:start]+value+text[end:]
    assert hashlib.sha256(text.encode()).hexdigest()==after, 'Result differs from tested source: '+name
    writes.append((p,text))

patch('package.json','08411cfa6c56efce22fe18c66d16367d2d51ccf603682ecf24cfef3ebe77bc4b','bc2f4a9b514960d5253b1475795345a3751c751bdf9ed8fd4d5430b5a35dce77',[
(52,53,'5'),
(54,55,'0'),
])

patch('public/js/app.js','c1df24dd974adee35bec9e860d1edf982f4116abb0353c931bc6b21d9bf1742f','1a7f9ca3ed66e2ae61dcaddf4bfef7e47689d4eda4a0b7c89315117a8cbf9e8a',[
(2505,2505,r'''
{
    if(state&&(action.startsWith('panel-')?!G.panelUnlocked(state,action.slice(6)):!!G.featureBlock(state,action)))return '';
    return 
'''[1:-1]),
(2699,2699,'  };\n'),
(9159,9159,'next'),
(9160,9160,'uest(s),guide=G.nextFeature'),
(9161,9165,'nlock(s),systemOpen=G'),
(9167,9168,'eatureU'),
(9169,9169,'locke'),
(9171,9175,''),
(9176,9181,",'syste"),
(9182,9199,"'"),
(9434,9434,r'''
!systemOpen?'<div class="chapter-chip"><span>初入青岚</span><strong>先把第一单送到</strong><span>完成配送与事件选择，开启系统。</span></div>':
'''[1:-1]),
(9767,9767,'${systemOpen&&guide?`<p class="unlock-hint">下一步：${esc(guide.hint)}</p>`:\'\'}'),
(9826,9826,"'],['alchemy','tea','炼药"),
(9946,9946,'.filter(([p])=>G.panelUnlocked(s,p))'),
(11420,11420,r'''
if(state&&!G.panelUnlocked(state,type)){const f=G.FEATURE_UNLOCKS.find(f=>f.id===G.FEATURE_PANELS[type]);showError(`${f.name}尚未开启：${f.hint}。`);return;}
'''[1:-1]),
(16197,16197,"G.featureUnlocked(s,'upgrades')?"),
(16203,16203,"':'维修与保养"),
(16708,16708,'al'),
(16709,16719,'hemy'),
(19075,19075,"),advanced=G.featureUnlocked(s,'practice'"),
(19169,19619,''),
(19664,19664,r'''
        const chance=G.breakChance(s,usePill?foundationTier:0);
        body=`<div class="row"><h3>${G.realmLabel(s)}${nextRealm?` <span class="muted">→</span> ${nextRealm}`:''}</h3>${tag(G.isNight(s)?'夜间灵气 +45%':'白昼 · 灵气平缓',G.isNight(s)?'gold':'')}</div><div class="wide-progress"><i style="width:${need?Math.min(100,s.player.qi/need*100):100}%"></i></div><div class="progress-label"><span>修为</span><span>${Math.floor(s.player.qi)}${need?` / ${need}`:' · 化神九重圆满'}</span></div><div class="section-title"><h3>功课</h3>${s.position==='temple'?tag('灵地 +25%','mint'):tag(G.locationName(s))}</div><div class="stack">${actionCard('吐纳','45 分钟 · 体力 −12 · 恢复灵力','cultivate','data-kind="breath"','lotus',s.player.stamina<12)}${advanced?actionCard('静坐入定','90 分钟 · 体力 −24 · 更多修为','cultivate','data-kind="meditate"','moon',s.player.stamina<24)+actionCard('淬体练步','30 分钟 · 体力 −20 · 积累根骨与身法','cultivate','data-kind="body"','sword',s.player.stamina<20):''}</div>`;
        if(!advanced)body+='<p class="copy" style="margin-top:16px">先完成一次吐纳，再开启进阶修行与街巷探索。中途停止不算完成。</p>';
        else{
          body+=`<div class="section-title"><h3>叩问下一重天</h3>${!atMax?tag(`成功率 ${Math.floor(chance)}%`,'gold'):tag('化神九重 · 道心已明')}</div>${!atMax?`<label class="checkbox"><input type="checkbox" id="break-pill"${usePill?' checked':''}${disabled(!foundationCount)}>使用最高阶破境丹（共 ${foundationCount} 枚${foundationTier?` · 最高 ${foundationTier} 阶 · 成功率 +${G.breakthroughPillBonus(foundationTier)}%`:''}）</label><p class="copy" style="margin:11px 0">下一境：${nextRealm} · 需要 ${need} 修为。${(s.inventory.charm||0)>0?'背包中的护身符会在失败时自动保护你。':'失败会损失本次需求的 25% 修为与 18 气血。'}突破耗时 60 分钟、消耗 20 体力。</p>${btn('尝试突破',`data-act="breakthrough"${disabled(s.player.qi<need||s.player.stamina<20)}`,'primary wide')}`:G.featureUnlocked(s,'endings')?btn('看看自己的归途','data-ui="endings"','primary wide'):''}`;
          body+=`<div class="section-title"><h3>街巷探索</h3></div>${['park','temple'].includes(s.position)?actionCard('探寻周围灵息','30 分钟 · 体力 −12','explore','','spark',s.player.stamina<12):routeButton('park','前往月渡公园探索')}`;
        }
        if(G.featureUnlocked(s,'alchemy'))body+=`<div class="section-title"><h3>丹火</h3></div>${actionCard('前往炼药面板','查看已获得丹方与药鼎','panel-alchemy','','tea')}`;
        break;
      }
      case 'alchemy':{
        title='丹火与药香';label='Alchemy';
        const alchemyRank=G.ALCHEMY_RANKS[G.alchemyRank(s)],cauldron=G.cauldron(s),atMarket=s.position==='market',pillCap=(s.alchemy?.cauldron||0)?Math.min(cauldron.tier,G.alchemistTier(s)):0,ownedCauldrons=Array.isArray(s.alchemy?.cauldrons)?s.alchemy.cauldrons:[],ownedRecipes=G.ALCHEMY_RECIPES.filter(r=>G.alchemyHasFormula(s,r)),formulaCandidates=G.formulaMarketCandidates(s),formulaCost=G.formulaScrollCost(s);

'''[1:-1]),
(19712,19712,').filter(d=>s.player.realm>=d.realm||ownedCauldrons.includes(d.level)'),
(23268,23268,'.filter(m=>s.player.realm>=m.realm)'),
(23871,25458,''),
(26721,26721,"';if(systemTab==='endings'&&!G.featureUnlocked(s,'endings'))systemTab='quests"),
(27198,27198,"filter(([id])=>id!=='endings'||G.featureUnlocked(s,'endings'))."),
(27487,27487,'&&G.itemUnlocked(s,item)'),
(28567,28567,'visible'),
(28568,28573,'uests(s)'),
(33183,33183,"${G.featureUnlocked(s,'upgrades')?`"),
(33750,33750,"`:''}"),
(33854,33854,"G.featureUnlocked(s,'upgrades')?"),
(33896,33896,":'累计完成 5 单后开放升级。步行、原地充电和到店维修从开局可用。'"),
(38116,38116,r'''
<div class="help-section"><h3>玩法逐步开启</h3><p>开局保留行囊、座驾、歇息和帮助；地图接单、移动、补给、充电、维修、更换住处与存档始终可用。其余导航与操作在条件达成后出现，未开启时不显示占位按钮。解锁通知只记录在右下角日志，已开启功能不会因花钱、使用物品或关系变化而收回。</p><div class="detail-list">${G.FEATURE_UNLOCKS.map(f=>`<div><span>${esc(f.name)}${s?` · ${G.featureUnlocked(s,f.id)?'已开启':'未开启'}`:''}<small style="display:block">${esc(f.hint)}</small></span></div>`).join('')}</div><p>丹方需实际获得后才显示。炼药入口开放不赠送药鼎，也不放宽配伍、境界与熟练度要求。主线委托仅显示已领取篇章和下一篇章，系统兑换与药摊按境界逐步展示。</p></div>
'''[1:-1]),
(41090,41090,"','panel-alchemy"),
(41359,41359,";systemTab='shop';usePill=false"),
(41807,41816,'['),
(41835,41838,",'"),
(41839,41842,''),
(41846,41847,'-alchemy'),
(41848,41882,','),
(41897,41897,'].includes(action)'),
(41909,41913,'action.sl'),
(41915,41916,''),
(41917,41918,'(6)'),
(47666,47666,r'''
if(!state||!G.featureUnlocked(state,'system')||!['shop','quests','endings'].includes(d.id)||(d.id==='endings'&&!G.featureUnlocked(state,'endings')))break;
'''[1:-1]),
(47831,47831,"if(!state||!G.featureUnlocked(state,'endings'))break;"),
(47951,47951,"!state||!G.featureUnlocked(state,'endings'))break;if("),
(50476,50476,r'''
    const systemButton=$('.currency[data-panel="system"]');if(systemButton)systemButton.hidden=!G.featureUnlocked(s,'system');
    const spirit=$('.resource.qi');if(spirit)spirit.hidden=!G.featureUnlocked(s,'cultivation');

'''[1:-1]),
])

patch('public/js/data.js','c8d2402da7415c7da56b663189e486306f4cdfd401e11b578acac24d6cfde937','0ec838c30ab147960bd96daf7a6a64c8e07d12e62d7104592108388b209babfc',[
(145,146,'10'),
(169,170,'5'),
(171,172,'0'),
(501,501,r'''
  // 功能开放只看已结算的经历；门槛、说明和入口共享同一份配置。
  G.FEATURE_UNLOCKS = [
    {id:'system',name:'系统',hint:'完成并结算第 1 单配送',ready:s=>s.stats.delivered>=1,
      notice:'导航栏已开放系统，可签到、兑换补给和领取委托奖励。'},
    {id:'cultivation',name:'修行',hint:'在系统委托中领取「第一份人间烟火」奖励',requires:['system'],ready:s=>s.claimed.includes('q1'),
      notice:'导航栏已开放修行，先从一次完整的吐纳开始。'},
    {id:'practice',name:'进阶修行与探索',hint:'完成一次吐纳修炼',requires:['cultivation'],ready:s=>s.stats.trained>=1,
      notice:'修行中开放入定、淬体和突破；月渡公园、听雨观开放探索。'},
    {id:'alchemy',name:'炼药',hint:'累计完成 3 单，并完成「地图上多出来的一条线」主线选择',requires:['cultivation'],
      ready:s=>s.stats.delivered>=3&&G.formulaStoryComplete(s,{flag:'storyStreetVein',event:'story-street-vein'}),
      notice:'导航栏已开放炼药，可前往长乐集购买药鼎、药材与商店丹方。'},
    {id:'upgrades',name:'座驾升级',hint:'累计完成并结算 5 单配送',ready:s=>s.stats.delivered>=5,
      notice:'座驾面板已开放升级，需要到修车铺付费改装。'},
    {id:'endings',name:'归途',hint:'累计完成并结算 20 单配送',requires:['system'],ready:s=>s.stats.delivered>=20,
      notice:'系统已开放归途页，满足各结局条件后可自行选择。'},
    {id:'bonds',name:'羁绊',hint:'通过配送或奇遇结识第一位人物',optional:true,ready:s=>Object.values(s.bonds).some(b=>b.met===true),
      notice:'导航栏已开放羁绊，只显示真正结识过的人物。'}
  ];
  G.FEATURE_PANELS = {system:'system',cultivation:'cultivation',alchemy:'alchemy',bonds:'bonds'};

'''[1:-1]),
])

patch('public/js/engine.js','108f291f80828baa91d479e1bdbb66231c87191e2964112103ef2d5f6519ac99','ea281d2085259091db117a0445f7860d208e17531b977492fab8790844168719',[
(3722,3722,'unlockedFeatures: [], '),
(9979,9979,r'''
  // 查询是纯函数，渲染不能授予功能；所有权由事务/行动完成/显式迁移保存。
  G.featureUnlocked = (s,id) => {
    const feature=G.FEATURE_UNLOCKS.find(f=>f.id===id);
    if(!s||!feature)return false;
    if(s.unlockedFeatures?.includes(id))return true;
    return (feature.requires||[]).every(parent=>G.featureUnlocked(s,parent))&&feature.ready(s);
  };
  G.panelUnlocked = (s,type) => !Object.hasOwn(G.FEATURE_PANELS,type)||G.featureUnlocked(s,G.FEATURE_PANELS[type]);
  G.nextFeatureUnlock = s => G.FEATURE_UNLOCKS.find(f=>!f.optional&&!G.featureUnlocked(s,f.id))||null;
  G.featureForAction = (action,payload={}) => {
    if(action==='cultivate')return (payload.kind||'breath')==='breath'?'cultivation':'practice';
    const gates={buy:'system',sign:'system',claim:'system',breakthrough:'practice',explore:'practice',
      alchemy:'alchemy',cauldron:'alchemy',formula:'alchemy',herb:'alchemy',material:'alchemy',
      upgrade:'upgrades',visit:'bonds',finale:'endings'};
    return Object.hasOwn(gates,action)?gates[action]:null;
  };
  G.featureBlock = (s,action,payload={}) => {
    const id=G.featureForAction(action,payload),f=G.FEATURE_UNLOCKS.find(f=>f.id===id);
    return f&&!G.featureUnlocked(s,id)?`${f.name}尚未开启：${f.hint}。`:'';
  };
  G.syncFeatureUnlocks = (s,silent=false) => {
    if(s.gameOver)return;
    const before=new Set(s.unlockedFeatures||[]),known=new Set([...before].filter(id=>G.FEATURE_UNLOCKS.some(f=>f.id===id)));
    // 补全旧档/显式所有权的前置入口，避免有炼药资格却打不开修行入口。
    const add=id=>{if(known.has(id))return;known.add(id);for(const parent of G.FEATURE_UNLOCKS.find(f=>f.id===id)?.requires||[])add(parent);};
    for(const id of [...known])for(const parent of G.FEATURE_UNLOCKS.find(f=>f.id===id).requires||[])add(parent);
    s.unlockedFeatures=[...known];
    for(const f of G.FEATURE_UNLOCKS)if(G.featureUnlocked(s,f.id)){
      add(f.id);s.unlockedFeatures=[...known];
    }
    if(!silent)for(const f of G.FEATURE_UNLOCKS)if(known.has(f.id)&&!before.has(f.id))G.log(s,`玩法开启：${f.name}。${f.notice}`,'解锁');
  };
  G.restoreFeatureUnlocks = (s,raw,version) => {
    s.unlockedFeatures=version>=10&&Array.isArray(raw.unlockedFeatures)
      ? [...new Set(raw.unlockedFeatures.filter(id=>G.FEATURE_UNLOCKS.some(f=>f.id===id)))]:[];
    const grant=id=>{if(!s.unlockedFeatures.includes(id))s.unlockedFeatures.push(id);};
    if(version<10){
      if(s.player.coins>0||s.daily.signedDay>0||s.claimed.length||s.learned.length||s.equipment.length)grant('system');
      if(s.player.qi>0||G.realmRank(s)>0||s.stats.trained>0)grant('cultivation');
      if(s.stats.trained>0||G.realmRank(s)>0||s.stats.explored>0)grant('practice');
      if(s.alchemy.cauldrons.length||s.alchemy.formulas.length||s.alchemy.xp>0||s.alchemy.brews>0||G.ALCHEMY_MATERIALS.some(m=>s.inventory[m.id]>0))grant('alchemy');
      if(Object.values(s.vehicle.levels).some(n=>n>0))grant('upgrades');
      if(s.ending||s.unlockedEndings.length)grant('endings');
    }
    // 已经合法保存的在途付费行动继续恢复，不重复扣款、不回收能力。
    if(s.activity){const id=G.featureForAction(s.activity.kind,s.activity.params);if(id)grant(id);}
    G.syncFeatureUnlocks(s,true);
  };
  G.nextQuest = s => G.QUESTS.find(q=>!s.claimed.includes(q.id));
  G.questVisible = (s,q) => !!q&&(s.claimed.includes(q.id)||G.nextQuest(s)?.id===q.id);
  G.visibleQuests = s => G.QUESTS.filter(q=>G.questVisible(s,q));

'''[1:-1]),
(22098,22098,'    G.syncFeatureUnlocks(s);\n'),
(34505,34505,'      const featureError=G.featureBlock(s,action,payload);must(!featureError,featureError);\n'),
(42422,42422,"。');must(G.questVisible(s,q),'请先领取前一篇章奖励"),
(45237,45237,'s(s);G.syncFeatureUnlock'),
])

patch('public/js/progression.js','f230ab495abe326391fad1435aa9b52759f41efc481f364d11a28b3b1ff272c0','11a6d116f36cd75dd6cf38d7214701a5f3947ba08bccaf1b5ae4d3cf934d169a',[
(1866,1870,'在首单结算后开放'),
(1875,1875,'仍'),
(2159,2159," G.featureUnlocked(s,'system') &&"),
(7453,7453,'      G.syncFeatureUnlocks(s,true);\n'),
(8353,8353,"G.featureUnlocked(original,'system') && "),
])

patch('public/js/storage.js','274733e1951a0a2c09fd9875e8f1b2a60d0b4d2dc7f0800269a2883c86d60504','88190a96d88f5d51335a7f03daf2556d5eff8ea5ef5bf9c26a306cc64cba9509',[
(103,103,"STORAGE_KEY = 'night-courier:saves:v10';\n  G.LEGACY_"),
(165,216,''),
(241,241,",'night-courier:saves:v8'"),
(7610,7610,',10'),
(13963,13963,'    G.restoreFeatureUnlocks(s,raw,version);\n'),
(14083,14087,'丹方所有权'),
(14092,14094,'玩法入口'),
(14095,14101,''),
(14102,14109,'完成经历、已有物品与在途行'),
(14110,14115,'恢复'),
(14116,14129,'不重复扣费或结算'),
])

patch('public/styles.css','d937483ce465b8745a3009e72000691f2eb07a59272646e7a91d2a6c536cf3f5','cc123333c0b6d194416ab2861dc779919b1245146274935e4f275fb2c23543cb',[
(27195,27195,r'''

/* 解锁不预留空按钮；手机端保持可点尺寸，导航自身滚动而非撑宽页面。 */
.unlock-hint{max-width:210px;margin:8px 0 0;font-size:10px;line-height:1.6;color:var(--muted);background:rgba(17,39,33,.8);padding:6px 10px;border-radius:8px}
@media(max-width:800px){.unlock-hint{max-width:155px;font-size:9px}.game-nav{overflow-x:auto;justify-content:flex-start;scrollbar-width:thin}.nav-btn{flex:1 0 44px;min-width:44px}.nav-sep{flex-shrink:0}}

'''[1:-1]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
