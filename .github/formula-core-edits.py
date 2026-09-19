# Temporary, hash-verified source transport; removed before the PR is merged.
import hashlib,pathlib
writes=[]
def patch(name,before,after,edits):
    p=pathlib.Path(name)
    text=p.read_text() if p.exists() else ''
    assert hashlib.sha256(text.encode()).hexdigest()==before, 'Unexpected baseline: '+name
    for start,end,value in reversed(edits):
        text=text[:start]+value+text[end:]
    assert hashlib.sha256(text.encode()).hexdigest()==after, 'Result differs from tested source: '+name
    writes.append((p,text))

patch('package.json','cdb1a5e5811b5be3b7c60c773aeaef2f79b8639366df6505ff6f48754432c9f1','08411cfa6c56efce22fe18c66d16367d2d51ccf603682ecf24cfef3ebe77bc4b',[
(54,55,r'''
2
'''[1:-1]),
])

patch('public/js/app.js','74d68709514e92d29e4b43b4c3ed2f7bce379dc770db79324bf614cd8e079a18','c1df24dd974adee35bec9e860d1edf982f4116abb0353c931bc6b21d9bf1742f',[
(21734,21734,r'''
获取途径：'+esc(G.formulaSourceLabel(recipe))+'</p><p class="copy">
'''[1:-1]),
(22633,23098,r'''
商店丹方残卷</h3><p class="copy">仅售商店丹方，不含剧情与羁绊专属传承。购买后才会辨认具体内容并永久收录。</p></div>'+tag('已收录 '+ownedRecipes.length+' 张','mint')+'</div><p class="copy">当前境界还有 '+formulaCandidates.length+' 卷商店丹方未收录。</p>'+btn(formulaCandidates.length?'购入一卷未收录丹方 · ¥'+formulaCost:'当前境界商店丹方已收齐','data-act="formula"'+disabled(!formulaCandidates.length||s.player.money<formulaCost),'small wide')+'</div>'
          : '<div class="card"><h3>丹方收录</h3><p class="copy">丹方分剧情解锁、羁绊传授和商店购买。只有已获得丹方才显示具体内容；商店不会出售专属传承
'''[1:-1]),
(26427,26457,r'''
剧情、羁绊、商店各有专属丹方；获得后才显示具体内容。丹方决定配伍和火候
'''[1:-1]),
(30625,31238,r'''
nsmission=G.formulaBondProgress(s,n.id),travel=G.travelPlan(s,n.place),blocked=b.lastTalkDay===G.day(s)||!!G.travelBlock(s,travel);
            return `<article class="npc-card" style="--npc-color:${n.color}"><div class="row"><div class="npc-avatar">${n.name[0]}</div><div><h3>${n.name}</h3><small>${n.role} · ${G.place(n.place).name}</small></div><span class="tag" style="margin-left:auto">${b.path==='romance'?'相伴':b.stage>=4?'知己':b.stage>0?'相识':'初见'}</span></div><p>${n.bio}</p><div class="progress-label"><span>好感 ${b.affinity} · 信任 ${b.trust}</span><span>故事 ${b.stage}/4</span></div><div class="wide-progress"><i style="width:${b.affinity}%"></i></div><p class="copy">丹方传授 ${transmission.owned}/${transmission.total}${transmission.next?` · 下次：完成第 ${transmission.next.stage} 章，信任 ${transmission.next.trust}`:' · 已全部收录'}</p
'''[1:-1]),
(38786,38825,r'''
剧情、羁绊、商店各有 36 张专属丹方。首个主线委托领奖与五段主线选择结算后获得剧情丹方；六位 NPC 各传授 6 张，分别要求完成第 1 / 2 / 4 章且信任达到 3 / 9 / 20，友情和情感路线均可。长乐集只出售商店类未知残卷，不重复抽到已收录丹方。普通探索不再直接掉落丹方，未获得丹方不显示名称与配伍。旧档已获得丹方不会回收，已完成的剧情和羁绊会补领未取得的奖励。
'''[1:-1]),
])

patch('public/js/data.js','c6895b8091d0cc4655035007e50d830b1d439a8acc46de4309abf2926724d14a','c8d2402da7415c7da56b663189e486306f4cdfd401e11b578acac24d6cfde937',[
(171,172,r'''
2
'''[1:-1]),
(26933,26933,r'''
  G.FORMULA_STORY_SOURCES = [
    {quest:'q1',label:'第一份人间烟火'},
    {event:'story-street-vein',flag:'storyStreetVein',label:'地图上多出来的一条线'},
    {event:'story-second-city',flag:'storySecondCity',label:'城市的背面'},
    {event:'story-lantern-network',flag:'storyLanternNetwork',label:'每个人都是一个阵点'},
    {event:'story-system-doubt',flag:'storySystemDoubt',label:'系统第一次拒绝回答'},
    {event:'story-system-truth',flag:'storySystemTruth',label:'万家灯火，不属于任何人'}
  ];
  // 每位故人各有两类药的三种配伍；友情与情感路线共用传方条件。
  G.FORMULA_NPC_PRODUCTS = {
    lin:['heal','bloodpill'],chen:['bodypill','marrowpill'],
    shen:['qi','spiritqi'],lu:['foundation','greatqi'],
    zhou:['stamina','vitalpill'],su:['spiritpill','harmonypill']
  };
  G.FORMULA_BOND_MILESTONES = [
    {stage:1,trust:3},{stage:2,trust:9},{stage:4,trust:20}
  ];

'''[1:-1]),
(27582,27582,r'''
    const channel=routeIndex%3,step=Math.floor(routeIndex/3);
    const acquisition=channel===0?{type:'shop'}:channel===1
      ? {type:'story',...G.FORMULA_STORY_SOURCES[step*2+Math.floor(pillIndex/6)]}
      : {type:'bond',npc:Object.keys(G.FORMULA_NPC_PRODUCTS).find(id=>G.FORMULA_NPC_PRODUCTS[id].includes(pill.id)),...G.FORMULA_BOND_MILESTONES[step]};

'''[1:-1]),
(27595,27595,r'''
      acquisition,

'''[1:-1]),
])

patch('public/js/engine.js','a46ec86eccfd02b4e7aa1a491ad988280a2562ea447a0fbe8e54235323486e90','108f291f80828baa91d479e1bdbb66231c87191e2964112103ef2d5f6519ac99',[
(9588,9588,r'''
acquisition.type==='shop'&&r.
'''[1:-1]),
(9690,9690,r'''
  G.formulaStoryComplete = (s,source) => source.quest
    ? s.claimed.includes(source.quest)
    : s.flags[source.flag]===true && s.pending?.templateId!==source.event
      && !(s.activity?.kind==='choice'&&s.activity.params.event?.templateId===source.event);
  G.formulaRewardReady = (s,recipe) => {
    const source=recipe.acquisition;
    if(source.type==='story')return G.formulaStoryComplete(s,source);
    if(source.type==='bond'){
      const bond=s.bonds[source.npc];
      return bond?.met===true&&bond.stage>=source.stage&&bond.trust>=source.trust;
    }
    return false;
  };
  // 只在已经复制的事务/完成结算/读档迁移状态上调用，不在 UI 或每帧抽取奖励。
  G.syncFormulaRewards = s => {
    if(s.gameOver)return;
    const rewards=G.ALCHEMY_RECIPES.filter(r=>!G.alchemyHasFormula(s,r)&&G.formulaRewardReady(s,r));
    for(const recipe of rewards){
      s.alchemy.formulas.push(recipe.id);
      const source=recipe.acquisition;
      G.log(s,source.type==='bond'
        ? `${G.NPCS.find(n=>n.id===source.npc).name}将丹方《${recipe.name}》传给了你。羁绊传方，已永久收录。`
        : `完成「${source.label}」，获得剧情丹方《${recipe.name}》。已永久收录。`,'炼药');
    }
  };
  // 这是配置的获取途径，不据此改写旧存档中已经取得的丹方。
  G.formulaSourceLabel = recipe => {
    const source=recipe.acquisition;
    return source.type==='shop'?'商店购买':source.type==='bond'
      ? `羁绊 · ${G.NPCS.find(n=>n.id===source.npc).name}`:`剧情 · ${source.label}`;
  };
  G.formulaBondProgress = (s,npcId) => {
    if(!s.bonds[npcId]?.met)return null;
    const recipes=G.ALCHEMY_RECIPES.filter(r=>r.acquisition.type==='bond'&&r.acquisition.npc===npcId);
    return {owned:recipes.filter(r=>G.alchemyHasFormula(s,r)).length,total:recipes.length,
      next:recipes.filter(r=>!G.alchemyHasFormula(s,r)).sort((a,b)=>a.acquisition.stage-b.acquisition.stage)[0]?.acquisition||null};
  };

'''[1:-1]),
(20204,20204,r'''
    G.syncFormulaRewards(s);

'''[1:-1]),
(24921,24973,r'''

'''[1:-1]),
(25257,25601,r'''

'''[1:-1]),
(37171,37212,r'''
'尚未获得丹方。丹方需通过剧情、羁绊传授或商店购买获得。'
'''[1:-1]),
(42141,42141,r'''
          must(!payload.id&&!payload.recipe,'残卷只能购入商店可售的未知丹方，不能指定未获得丹方。');

'''[1:-1]),
(43715,43715,r'''
G.syncFormulaRewards(s);
'''[1:-1]),
])

patch('public/js/progression.js','185d35b1fd1a220f7663ecf0464682fe2e1018c90a9e9ecf95bf7628089cff62','f230ab495abe326391fad1435aa9b52759f41efc481f364d11a28b3b1ff272c0',[
(7381,7381,r'''
      // 已完成的旧剧情和羁绊补领一次；仍在待选/执行中的主线不算完成。
      G.syncFormulaRewards(s);

'''[1:-1]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
