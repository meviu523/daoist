/* 都市系统修仙成长线：在现有规则引擎之上增加阶段剧情、系统解锁与关键主线。 */
(function (root) {
  'use strict';
  const G = root.NightCourier;
  if (!G) throw new Error('NightCourier core must load before progression.js');

  const c = (label, result, effects = {}, extra = {}) => ({ label, result, effects, ...extra });

  G.STORY_FLAG_KEYS = [
    'storyStreetVein',
    'storySecondCity',
    'storyLanternNetwork',
    'storySystemDoubt',
    'storySystemTruth'
  ];

  G.metNPCCount = s => G.NPCS.filter(n => s.bonds?.[n.id]?.met === true).length;
  G.isNPCMet = (s, id) => s.bonds?.[id]?.met === true;
  G.visibleNPCs = s => G.NPCS.filter(n => G.isNPCMet(s, n.id));

  G.STORY_STAGES = [
    { id:'mortal', title:'凡人奔忙', desc:'先把今天的饭送到。房租、体力和时间，都比仙途更真实。', ready:()=>true },
    { id:'bound', title:'灯火初鸣', desc:'系统已经绑定。你开始发现，认真完成一件小事也会留下灵息。', ready:s=>s.flags?.firstOrder === true },
    { id:'second-city', title:'城有第二面', desc:'异常门牌、旧阵纹与夜行客反复出现。青岚城并不只有地图上这一层。', ready:s=>s.flags?.storySecondCity === true || (s.stats.delivered>=8 && s.player.realm>=1) },
    { id:'circle', title:'夜路同行', desc:'你认识了越来越多夜里仍醒着的人，也开始进入这座城真正的修行圈。', ready:s=>G.metNPCCount(s)>=2 && s.player.realm>=1 },
    { id:'guardian', title:'阵眼苏醒', desc:'配送路线正在重新连接断裂的城脉。修行不再只是你一个人的事。', ready:s=>s.flags?.storyLanternNetwork === true || (s.stats.delivered>=18 && s.player.realm>=2) },
    { id:'system', title:'系统为何而来', desc:'万家灯火系统开始显露自己的目的。它究竟在帮助你，还是借你完成某件事？', ready:s=>s.flags?.storySystemDoubt === true || (s.stats.delivered>=30 && s.player.realm>=3) },
    { id:'truth', title:'人间即阵心', desc:'你终于知道力量来自哪里。接下来要决定的，不是还能变多强，而是这份力量属于谁。', ready:s=>s.flags?.storySystemTruth === true || (s.stats.delivered>=42 && s.player.realm>=4) }
  ];
  G.storyStage = s => {
    let current = G.STORY_STAGES[0];
    for (const stage of G.STORY_STAGES) if (stage.ready(s)) current = stage;
    return current;
  };

  // 系统不是开局一次性开放全部能力。基础补给立即可用，修行资源随境界解锁。
  const unlocks = {
    qi:0, heal:0, stamina:0, mana:0, herb:0,
    fragment:1, charm:1, foundation:1, breathing:1, lightstep:1,
    jade:2, robe:2
  };
  for (const item of G.ITEMS) item.unlockRealm = unlocks[item.id] ?? 0;
  G.itemUnlocked = (s, item) => s.player.realm >= (item.unlockRealm || 0);

  // 都市生活继续是订单主体，但修行越深，越容易收到“只有你看得懂”的特殊配送。
  G.ORDER_TYPES.push(
    { title:'不存在的十三楼', desc:'电梯只有十二层。备注写着：到十二楼后走楼梯，不要看身后的镜子。', tip:20, condition:'mystic' },
    { title:'阵眼旁的一碗白粥', desc:'送到桥下旧石碑。若看见有人等，就把第二双筷子也留下。', tip:18, condition:'mystic' },
    { title:'给守夜人的药茶', desc:'收件人整夜不能离开阵位。茶不能洒，也不能换杯。', tip:16, condition:'careful' },
    { title:'凌晨四点的热豆花', desc:'不是给修士，是给刚下夜班的人。系统却把这一单标成了“重要”。', tip:10, condition:'night' },
    { title:'旧雨书店的无名订单', desc:'备注只有一句：把书里的那个人也算一份。', tip:12, condition:'ordinary' },
    { title:'给另一个骑手的晚饭', desc:'对方正在替人顶班，地址会随着他的位置变化。请尽快送到。', tip:13, condition:'urgent' }
  );

  // 随机相逢：人物不是开局通讯录，而是在配送或奇遇中先成为“见过的人”。
  G.EVENTS.push(
    { id:'encounter-lin-night', kind:'delivery', encounterNpc:'lin', title:'急诊门口的一杯豆浆', text:'你抵达医馆时，门口有人突然晕倒。一个还穿着白大褂的女人从楼里跑出来，一边急救一边让你先把豆浆放到值班台。她叫林晚。', choices:[
      c('留下来帮她维持通道','等救护床推进去，她才想起那杯已经不烫的豆浆。',{stamina:-4,karma:2,rep:1}),
      c('按她说的先把订单送到','你没有添乱，也没有忘记自己正在做的事。',{rep:2,qi:4}),
      c('顺手买一瓶水放在值班台','她忙完回来时，看见水瓶旁写着“别忘了喝”。',{money:-3,karma:2})
    ]},
    { id:'encounter-chen-road', kind:'delivery', encounterNpc:'chen', title:'雨里的一把扳手', text:'前方一个骑手的链条掉了。你正犹豫要不要停，一辆旧三轮从巷口拐来。车上的男人蹲下，两分钟把链条重新挂好。他叫陈默。', choices:[
      c('帮忙打灯','你第一次发现，修车也有一种不慌不忙的节奏。',{stamina:-2,karma:1,qi:5}),
      c('把备用纸巾递过去','陈默擦了擦手，只说了一句：路上慢点。',{karma:2}),
      c('记下修车铺的位置','以后总会有需要一把扳手的时候。',{insight:1,rep:1})
    ]},
    { id:'encounter-shen-book', kind:'delivery', encounterNpc:'shen', title:'没有收件人的旧书', text:'订单地址是旧雨书店，店门却已经落锁。一个抱着纸箱的女人从后巷出来，说自己没点餐，但看到袋子里的书签后忽然沉默。她叫沈青禾。', choices:[
      c('把订单备注完整念给她听','她听到最后一句时，把书签夹进了随身的笔记本。',{karma:1,qi:6}),
      c('先确认平台地址没有出错','谨慎没有破坏这个夜晚，反而让她更放心。',{rep:2,insight:1}),
      c('问她是否认识寄单的人','她摇头，却说这个字迹像一位已经很多年没来过的读者。',{qi:8})
    ]},
    { id:'encounter-lu-rain', kind:'explore', encounterNpc:'lu', title:'山门外没有避雨的人', text:'雨忽然大起来。听雨观山门外站着一个没有打伞的人，雨水却总在离他半寸的地方散开。他看了看你的外卖箱，说：“能把人间的饭送到这里，也算有缘。”', choices:[
      c('问他这里能不能避雨','他侧身让出屋檐，也让出了一条以前看不见的山路。',{stamina:4,qi:8}),
      c('把多带的一份热饭分给他','他接过饭时很认真，像在接一件法器。',{money:-8,karma:2,qi:6}),
      c('先问这是不是障眼法','他笑了一声：“至少你知道要先问。”',{insight:1,qi:5})
    ]}
  );

  const storyEvents = [
    {
      id:'story-street-vein', kind:'story', flag:'storyStreetVein',
      ready:s=>s.flags.firstOrder && s.stats.delivered>=3,
      title:'地图上多出来的一条线',
      text:'第三次送达后，系统地图没有立刻刷新订单。你刚刚走过的三段路线被细金线连在一起，像血管，也像阵纹。系统只显示一句：连接有效。',
      choices:[
        c('把三段路线重新走一遍','你确认金线不是错觉。它们只在有人真正抵达之后亮起。',{stamina:-4,insight:1,qi:8}),
        c('截图留存，暂不声张','第二天再看，截图里什么都没有，但你记得那些线在哪里。',{insight:1,rep:1}),
        c('问系统“连接了什么？”','系统沉默很久，只回了两个字：人间。',{qi:10,karma:1})
      ]
    },
    {
      id:'story-second-city', kind:'story', flag:'storySecondCity',
      ready:s=>s.player.realm>=1 && s.stats.delivered>=8,
      title:'城市的背面',
      text:'炼气之后，你开始看见以前看不见的东西：医院走廊尽头有旧符，桥墩下面刻着阵号，某些深夜订单的门牌会在你眨眼时改变。最奇怪的是，这些异常都沿着你的配送路线分布。',
      choices:[
        c('把异常地点标进自己的地图','零散的怪事第一次有了形状：它们围着青岚城形成一个残缺的环。',{insight:1,qi:12}),
        c('继续像平常一样送单','先把饭送到，再考虑世界为什么变了。这个决定让道心意外地稳定。',{karma:2,qi:8}),
        c('尝试用灵力感应整座城','千万盏灯同时涌进感知，你立刻收回神识，却记住了一瞬间的脉动。',{mana:-8,qi:16})
      ]
    },
    {
      id:'story-lantern-network', kind:'story', flag:'storyLanternNetwork',
      ready:s=>s.player.realm>=2 && s.stats.delivered>=18 && G.metNPCCount(s)>=2,
      title:'每个人都是一个阵点',
      text:'筑基后的某夜，系统第一次把“订单”改成了“阵点”。你看见医馆、修车铺、书店、山门和无数普通住户之间被灯火连在一起。阵法没有高高在上的阵眼——每一个仍愿意回应别人的人，都是阵眼。',
      choices:[
        c('记住这些人的名字','阵纹不再只是几何图形。你知道每一点后面都有人在生活。',{karma:3,qi:16}),
        c('研究灯火与灵气的转换','你确认外卖币只是中间形式，真正被系统收集的是“抵达”产生的愿力。',{insight:2,qi:12}),
        c('先去完成下一单','系统没有评价。地图上却有一处黯淡阵点重新亮了。',{rep:2,qi:10})
      ]
    },
    {
      id:'story-system-doubt', kind:'story', flag:'storySystemDoubt',
      ready:s=>s.player.realm>=3 && s.stats.delivered>=30,
      title:'系统第一次拒绝回答',
      text:'金丹凝成后，你终于有能力查看系统更深的一层。后台没有商城，没有任务表，只有一条持续增长的记录：“有效连接数”。你问它为什么需要这么多连接。系统关闭了界面。',
      choices:[
        c('暂停追问，记录变化','你没有和未知力量硬碰。谨慎让你看见：系统关闭前，数字仍在因为远处的一次送达而增长。',{insight:1,qi:12}),
        c('以神识强行追踪','你触到一片庞大的残缺阵海，也察觉其中有一部分正在把力量引向城外。',{mana:-12,qi:20}),
        c('问自己：如果没有奖励，还会不会送？','答案没有立刻出现。但你想起许多已经不需要系统提醒也会去做的事。',{karma:3,qi:14})
      ]
    },
    {
      id:'story-system-truth', kind:'story', flag:'storySystemTruth',
      ready:s=>s.player.realm>=4 && s.stats.delivered>=42,
      title:'万家灯火，不属于任何人',
      text:'元婴之后，你终于看清系统的核心：它是旧护城阵残存的“器灵”。数十年前阵法破碎，为了自救，它学会用现代人最熟悉的方式发布任务、发放奖励、引导一个又一个人重新建立连接。它选择过别人，也会继续选择别人。你从来不是唯一的救世主。',
      choices:[
        c('把控制权还给整座城','如果力量来自万家灯火，就不该只由一个人决定它往哪里流。',{karma:4,qi:24}),
        c('保留系统，但拒绝绝对服从','你接受它的帮助，也保留说“不”的权利。修行终于从任务列表变回自己的选择。',{insight:2,qi:20}),
        c('告诉系统：以后少发命令，多讲原因','沉默很久后，界面出现一个新的按钮：“说明”。你笑出了声。',{rep:2,karma:2,qi:18})
      ]
    }
  ];
  G.EVENTS.push(...storyEvents);

  const originalNewGame = G.newGame;
  G.newGame = (...args) => {
    const s = originalNewGame(...args);
    for (const key of G.STORY_FLAG_KEYS) s.flags[key] = false;
    return s;
  };

  const originalSanitize = G.sanitizeSave;
  if (originalSanitize) {
    G.sanitizeSave = raw => {
      const s = originalSanitize(raw);
      for (const key of G.STORY_FLAG_KEYS) s.flags[key] = raw?.flags?.[key] === true;
      return s;
    };
  }

  const storyActions = new Set(['deliver','choose','travel','rest','sleep','cultivate','breakthrough','explore','visit','heal','meal','alchemy']);
  function injectStoryEvent(s) {
    if (s.pending || s.ending) return;
    const next = storyEvents.find(e => !s.flags[e.flag] && e.ready(s));
    if (!next) return;
    s.flags[next.flag] = true;
    s.pending = {
      ...G.clone(next),
      id:`story-${s.turn}-${s.seed}`,
      templateId:next.id,
      source:'classic',
      aiStatus:'skip'
    };
    G.log(s, `主线推进：${next.title}。`, '主线');
  }

  const originalPerform = G.perform;
  G.perform = (original, action, payload = {}) => {
    if (action === 'buy') {
      const item = G.ITEMS.find(i => i.id === payload.id);
      if (item && !G.itemUnlocked(original, item)) {
        return { ok:false, state:original, error:`需要进入${G.REALMS[item.unlockRealm].name}后，系统才会开放这项兑换。` };
      }
    }
    const result = originalPerform(original, action, payload);
    if (!result.ok) return result;
    if (storyActions.has(action)) injectStoryEvent(result.state);
    return result;
  };
})(globalThis);
