/* 原创重建内容。这里集中维护地图、数值配置和剧情，不依赖外部素材。 */
(function (root) {
  'use strict';
  const G = root.NightCourier = root.NightCourier || {};
  G.VERSION = 13;
  G.APP_VERSION = '1.8.0';
  G.STARTING_PLACES = Object.freeze(['home','garage']);
  G.TITLE = '外卖修仙录';
  // 只向东、向南追加网格；原 7×6 城区的坐标、地点 ID 与桥梁不变。
  G.GRID_X = [130, 370, 610, 850, 1090, 1330, 1570, 1810, 2050, 2290, 2530];
  G.GRID_Y = [120, 300, 480, 660, 840, 1020, 1200, 1380, 1560, 1740];
  G.WORLD = { width: 2660, height: 1860, metersPerUnit: 3.5 };
  G.CHARGE = Object.freeze({ minutes: 10, cost: 8 });
  G.ALCHEMY_REALM_BY_TIER = Object.freeze([0,0,0,1,1,2,3,3,4,5]);
  G.AUCTION = Object.freeze({name:'万宝拍卖场',place:'market',opens:1080,roundMinutes:5,lotCount:3,
    openingRatio:.65,stepRatio:.08,maxRivalSteps:8,
    realmByTier:G.ALCHEMY_REALM_BY_TIER});
  // 匿名席位，不作为自动结识的羁绊人物。
  G.AUCTION_BIDDERS = [{id:'herbalist',name:'青衣药商'},{id:'wanderer',name:'赤袖散修'},{id:'collector',name:'青灯藏家'}];
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
    {id:'auction',name:'拍卖场',hint:'开放炼药后，累计完成并结算 10 单配送',requires:['alchemy'],ready:s=>s.stats.delivered>=10,
      notice:'长乐集的万宝拍卖场递来请柬。导航已开放拍卖，每晚 18:00–24:00 可到场竞价。'},
    {id:'endings',name:'归途',hint:'累计完成并结算 20 单配送',requires:['system'],ready:s=>s.stats.delivered>=20,
      notice:'系统已开放归途页，满足各结局条件后可自行选择。'},
    {id:'bonds',name:'羁绊',hint:'通过配送或奇遇结识第一位人物',optional:true,ready:s=>Object.values(s.bonds).some(b=>b.met===true),
      notice:'导航栏已开放羁绊，只显示真正结识过的人物。'}
  ];
  G.FEATURE_PANELS = {system:'system',cultivation:'cultivation',alchemy:'alchemy',bonds:'bonds',auction:'auction'};
  G.ROAD_LAYOUT = { riverColumn: 3, bridgeRows: [1, 3, 5, 7] };
  G.ROAD_NODES = G.GRID_Y.flatMap((y,r) => G.GRID_X.map((x,c) => ({x,y,c,r})));
  // 绘制、寻路和途中存档校验共用同一组真实道路，不另画可穿江的假路。
  G.ROAD_EDGES = [];
  for (const [i,a] of G.ROAD_NODES.entries()) {
    if (a.c+1 < G.GRID_X.length && (a.c !== G.ROAD_LAYOUT.riverColumn || G.ROAD_LAYOUT.bridgeRows.includes(a.r)))
      G.ROAD_EDGES.push({from:i,to:i+1});
    if (a.r+1 < G.GRID_Y.length) G.ROAD_EDGES.push({from:i,to:i+G.GRID_X.length});
  }
  const services = [
    ['home', '青藤小屋', 2, 3, 'home', '一间租来的小屋，也是你最初的洞府。'],
    ['garage', '阿默修车铺', 0, 4, 'garage', '修理、升级，以及一位总在等你收工的朋友。'],
    ['clinic', '回春医馆', 3, 1, 'clinic', '白灯下有人医人，灯灭后有人医心。'],
    ['bookshop', '旧雨书店', 1, 1, 'book', '一册失去封皮的旧书，记着这座城的秘密。'],
    ['temple', '听雨观', 5, 0, 'temple', '城北的灵气在入夜后苏醒，修炼收益提高。'],
    ['park', '月渡公园', 5, 3, 'leaf', '江风掠过古井。探索可能带来灵草与奇遇。'],
    ['market', '长乐集', 1, 5, 'market', '买些热饭和灵草，继续奔忙的人间生活。']
  ];
  G.PLACES = services.map(([id, name, c, r, kind, desc]) => ({ id, name, x: G.GRID_X[c], y: G.GRID_Y[r], kind, desc, permanent: true }));
  const names = ['杏花里','松风公寓','青石弄','栖云宿舍','银杏医院','春山大厦','望江台','榆树巷','长风客栈','新桥社区','向阳小学','水岸茶室','海棠新村','北辰写字楼','龙井作坊','听潮楼','流萤公寓','南山工作室','西城花房','观星台','锦鲤小区','青禾餐厅','落霞仓库','雨巷照相馆','望舒公馆','拾光面馆','归鹤庭','白鹭驿','雁回小筑','木棉楼','竹影小院','鸣蝉里','青瓷馆','小满街','临江书院'];
  let n = 0;
  // 旧地点编号按原来的 7×6 顺序生成，不能使用扩展后的行列数重排。
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const x = G.GRID_X[c], y = G.GRID_Y[r];
    if (!G.PLACES.some(p => p.x === x && p.y === y)) G.PLACES.push({ id: `stop-${n}`, name: names[n++], x, y, kind: 'delivery', permanent: false });
  }
  G.DISTRICTS = [
    {id:'yunport',name:'云港新区',cols:[7,8,9,10],rows:[0,1,2],label:{x:2180,y:415},desc:'临海的新城区，夜班写字楼与远航归来的灯火相邻。',
      names:['海岚广场','云港公寓','晨星大厦','归帆客栈','滨海医院','远航写字楼','云港夜校','澄光里','风帆小区','星洲酒店','晴海书屋','云港会展中心']},
    {id:'eastlake',name:'东湖新城',cols:[7,8,9,10],rows:[3,4,5],label:{x:2180,y:955},desc:'湖岸社区沿水铺开，晚归的人总在等一份热饭。',
      names:['东湖庭院','荷风里','碧波茶楼','听荷公寓','湖心美术馆','汀兰小区','东湖体育馆','朝露里','镜湖酒店','柳汀花园','水云居','望湖书院']},
    {id:'south',name:'南郊生活区',cols:[0,1,2,3],rows:[6,7,8],label:{x:470,y:1495},desc:'夜市、学校和物流园连着老城南面的生活。',
      names:['南郊夜市','蒲公英里','榕树公寓','青岚汽车站','稻香社区','禾下食堂','晴川小学','南郊物流园','麦田工作室','向晚小院','丰年里','南桥驿居']},
    {id:'lingxi',name:'灵溪山麓',cols:[4,5,6,7,8,9,10],rows:[6,7,8],label:{x:1810,y:1495},desc:'山脚的茶舍与民居逐水而建，灯火一直延伸到竹林边。',
      names:['灵溪入口','云栈民宿','青竹工坊','栖鹤村','茶山书屋','灵溪药圃','听泉山庄','清溪客舍','石桥人家','松间茶舍','半山学堂','竹海小筑','望岫台','雨后花房','归山院','流泉居','踏云亭','山南老街','听松楼','白石小院','问山茶坊']}
  ];

  // 在已发布的 99 个地址后追加南岸，不重排任何既有 ID。
  G.DISTRICTS.push({id:'southbank',name:'南岸新街',cols:[0,1,2,3,4,5,6,7,8,9,10],rows:[9],label:{x:1550,y:1810},desc:'沿江向南，新的归家路与夜市在这里延伸。',
    names:['柳岸人家','南桥集市','橘井巷','春水茶坊','湖心书屋','云麓别院','竹溪社区','青山学院','芳草新村','朝阳厂区','南岸书院']});
  for (const district of G.DISTRICTS) {
    let index=0;
    for (const r of district.rows) for (const c of district.cols) {
      G.PLACES.push({id:`${district.id}-${index}`,name:district.names[index++],x:G.GRID_X[c],y:G.GRID_Y[r],
        district:district.id,desc:district.desc,kind:'delivery',permanent:false});
    }
  }
  G.place = id => G.PLACES.find(p => p.id === id);
  G.RESIDENCES = [
    { id:'qiyun', name:'栖云宿舍', place:'stop-3', rent:70, desc:'合租床位便宜，但只能恢复基础体力与少量气血、灵力。', recovery:{health:20,stamina:70,mana:10,battery:0}, full:[] },
    { id:'qingteng', name:'青藤小屋', place:'home', rent:120, desc:'最初的住处。休息均衡，能补满体力、灵力与电量。', recovery:{health:45,stamina:0,mana:0,battery:0}, full:['stamina','mana','battery'] },
    { id:'songfeng', name:'松风公寓', place:'stop-1', rent:220, desc:'安静宽敞，睡眠后气血、体力、灵力与电量全部恢复。', recovery:{health:0,stamina:0,mana:0,battery:0}, full:['health','stamina','mana','battery'] }
  ];
  G.residence = id => G.RESIDENCES.find(r => r.id === id);
  for (const residence of G.RESIDENCES) {
    const place = G.place(residence.place);
    if (place) {
      place.permanent = true;
      place.kind = 'home';
      place.desc = residence.desc;
    }
  }
  G.REALM_LEVELS = ['一重','二重','三重','四重','五重','六重','七重','八重','九重'];
  G.REALMS = [
    { name: '凡人', need: 80 }, { name: '炼气', need: 180 }, { name: '筑基', need: 380 },
    { name: '金丹', need: 700 }, { name: '元婴', need: 1100 }, { name: '化神', need: 1600, terminal:true }
  ];
  G.WEATHER = [ { id: 'clear', name: '晴', speed: 1 }, { id: 'cloudy', name: '多云', speed: 1 }, { id: 'rain', name: '细雨', speed: .82 }, { id: 'mist', name: '薄雾', speed: .9 } ];
  G.ORDER_TYPES = [
    { title: '一碗热汤', desc: '不要按门铃。放在门边，轻敲两下即可。', tip: 0, condition: 'ordinary' },
    { title: '晚班的便当', desc: '收餐人还在值班，请交到本人手中。', tip: 5, condition: 'ordinary' },
    { title: '少糖桂花糕', desc: '盒子怕挤。慢一点没关系，保持完整。', tip: 8, condition: 'careful' },
    { title: '两人份晚餐', desc: '一份不要葱。备注里写着：今天很重要。', tip: 6, condition: 'ordinary' },
    { title: '急送药膳', desc: '客人正在等药膳，这张订单不会在地图上停留太久。', tip: 14, condition: 'urgent' },
    { title: '不署名的清粥', desc: '收餐人只留了一句：谢谢你还记得。', tip: 4, condition: 'ordinary' },
    { title: '夜行人的宵夜', desc: '灯亮着就有人。若灯灭了，敲三下窗。', tip: 12, condition: 'night' },
    { title: '一份人间烟火', desc: '订单备注是一枚你从未见过的篆字。', tip: 16, condition: 'mystic' },
    { title: '凌晨的豆浆', desc: '送到保安亭。师傅说今晚要替同事多守一班。', tip: 7, condition: 'night' },
    { title: '不能凉的汤药', desc: '刚熬好的药膳，家属正在病房门口等。', tip: 15, condition: 'urgent' },
    { title: '毕业前的最后一餐', desc: '宿舍要搬空了，他们想再吃一次四年前点过的那家店。', tip: 8, condition: 'ordinary' },
    { title: '给陌生人的花饼', desc: '包装很薄，备注写着：别压坏，这是道歉用的。', tip: 10, condition: 'careful' },
    { title: '守夜人的热粥', desc: '城南仓库今晚盘点到天亮，粥里多放一点姜。', tip: 9, condition: 'night' },
    { title: '写给明天的面', desc: '如果我睡着了，就放在门口。明早也会记得有人来过。', tip: 5, condition: 'ordinary' },
    { title: '阵眼旁的清茶', desc: '地址普通，备注却要求茶杯口朝北。系统提示灵息异常。', tip: 18, condition: 'mystic' },
    { title: '散场后的馄饨', desc: '婚礼结束很久了，新郎新娘终于想起自己还没吃晚饭。', tip: 11, condition: 'ordinary' }
  ];
  // 效果全部由规则引擎结算，剧情文本不执行代码。
  const c = (label, result, effects = {}, extra = {}) => ({ label, result, effects, ...extra });
  G.EVENTS = [
    { id: 'first-order', kind: 'delivery', title: '第一声「叮」', text: '你把热汤递过去，陌生老人却看着你身后发笑。「原来这一回，是送饭的人。」手机上浮起一行不属于任何软件的小字：万家灯火系统，已绑定。', choices: [c('先问一句：您吃得惯吗？','老人接过汤，你第一次看见一缕金光落入掌心。',{karma:2,qi:8}),c('追问系统的来历','老人只说：人间每一份郑重，都能成为你的修行。',{insight:1,qi:4}),c('收好手机，继续做完这一单','你决定先把眼前的事做好。系统似乎对此很满意。',{rep:2,money:8})] },
    { id: 'rain', kind: 'delivery', title: '雨落在餐盒之前', text: '拐过路口，雨点忽然变密。一个没带伞的孩子站在屋檐外，而你只有一件备用雨披。', choices: [c('把雨披留给孩子','餐盒护在怀里，你的肩背湿了一片。',{karma:3,stamina:-6,rep:1}),c('请便利店帮忙照看孩子','店员答应了。你道谢后重新上路。',{karma:1,rep:1}),c('买把伞交给孩子','孩子认真记下了你的名字。',{money:-12,karma:4,qi:5})] },
    { id: 'cat', kind: 'delivery', title: '不肯让路的橘猫', text: '一只橘猫坐在楼道口，爪下压着半枚温热的青色玉片。它抬头看你，像是在等一个选择。', choices: [c('买一根猫条，和它交换','橘猫叼走猫条，留下玉片和一声很轻的「喵」。',{money:-6,qi:12}),c('蹲下陪它一会儿','它主动让开。你忽然觉得，这条楼道并不陌生。',{stamina:4,karma:1}),c('绕开它，不打扰','你准时把餐送到，猫也守住了自己的宝贝。',{rep:1})] },
    { id: 'stairs', kind: 'delivery', title: '停电的旧楼', text: '电梯停了。客人发来消息：腿脚不便，能不能送到门口？楼道尽头还有个邻居愿意帮忙。', choices: [c('自己提着餐上楼','你数着台阶调整呼吸，体内灵气也跟着顺了一些。',{stamina:-9,qi:10,rep:3}),c('请邻居帮忙，电话确认收餐','邻里之间的一声招呼，比电梯更快抵达。',{rep:1,karma:1}),c('多带一袋楼下的药','老人连声道谢，还把自制点心塞给了你。',{money:-8,stamina:5,karma:3})] },
    { id: 'seal', kind: 'delivery', title: '餐袋里的封印', text: '封口贴浮出细密金线。系统提示：客人买的不只是晚餐，也是封印里唯一还热着的东西。', choices: [c('保持封印，照常交付','门后的人隔着缝隙向你行礼。',{qi:18,rep:2}),c('以灵力感应，不拆封','你认出一段古老的护城阵纹。',{mana:-10,insight:1,qi:12}),c('提醒客人当面检查','对方郑重签收，你得到了一笔额外酬谢。',{money:20,karma:1})] },
    { id: 'rival', kind: 'delivery', encounterNpc: 'zhou', title: '同路人 · 周野', text: '一个叫周野的骑手连人带车摔在路旁。他看着散落的餐袋，第一句话却是：你的单要紧。', choices: [c('帮他扶车、整理餐盒','他记住了你的工号。下一段路没那么孤单了。',{stamina:-5,karma:3,rep:2}),c('帮他联系维修','你没有耽误交付，也为他找到了帮手。',{money:-5,karma:2}),c('把自己的备用绑带给他','绑带不值多少钱，及时的援手却很珍贵。',{qi:5,karma:2})] },
    { id: 'wrong-door', kind: 'delivery', title: '门牌上的两个世界', text: '订单写着 404，门牌却在你眼前变成了「肆零肆」。门缝里飘出海水和檀香的气味。', choices: [c('先打电话确认','门牌恢复了正常，客人说自己只是点了海鲜粥。',{rep:2,insight:1}),c('轻敲三下，报上姓名','门后递来恰好的餐费和一点温润灵息。',{qi:14,money:10}),c('请客人到门口取餐','你守住了边界。系统记下：谨慎也是一种道心。',{karma:1,stamina:3})] },
    { id: 'birthday', kind: 'delivery', title: '没有蜡烛的生日', text: '屋里只有一张折叠桌。年轻人接过蛋糕时说，自己已经快忘了今天是什么日子。', choices: [c('认真说一句生日快乐','他愣了很久，终于笑起来。',{karma:3,qi:6}),c('送一瓶便利店的汽水','瓶盖碰了一下纸杯。小小的仪式也算数。',{money:-5,rep:2,karma:2}),c('把蛋糕摆稳，留下祝福','门关上之前，你听见他说：明年会好一点。',{rep:1,stamina:3})] },
    { id: 'bad-review', kind: 'delivery', title: '迟来的解释', text: '客人责怪汤洒了一半。你看见封袋内侧的油迹，像是在出餐时就已经留下。', choices: [c('先安抚，再协助退款','对方听完解释，撤回了气话。',{rep:3,stamina:-4}),c('自己补一份热汤','这笔支出并不轻松，但你不愿让人空着肚子。',{money:-18,karma:3,rep:2}),c('拍照留证，按流程处理','有些责任，认真说明就好。',{rep:1,insight:1})] },
    { id: 'letter', kind: 'delivery', title: '一封没有寄出的信', text: '收餐人托你把信交到楼下信箱。他说自己的孩子在很远的地方，但信封上竟没有邮票。', choices: [c('补上邮票，帮他寄出','你没有读信。有些牵挂只需要有人送到。',{money:-4,karma:3,qi:5}),c('提醒他缺少邮票','他笑着拍了拍额头，回屋找出一张旧邮票。',{karma:1,rep:1}),c('询问是否需要帮忙联系家人','一通电话后，那间屋子热闹了许多。',{stamina:-3,karma:4})] },
    { id: 'night-guest', kind: 'delivery', title: '只收人间饭的客人', text: '客人的影子比本人迟了一拍。他不肯解释，只问：这座城如今，还有多少家店亮着灯？', choices: [c('告诉他你今天经过的每一盏灯','他听得很认真，像一个终于找到故乡的人。',{qi:16,karma:2}),c('请他尝尝还热的饭','他低头吃了第一口，影子渐渐和身体重合。',{rep:2,qi:10}),c('询问城里的旧事','你听到了护城阵曾经碎裂的那一夜。',{insight:1,qi:8})] },
    { id: 'coin', kind: 'delivery', title: '找不开的一枚铜钱', text: '老人坚持用一枚铜钱付小费。系统扫描了三次，最后只显示：此物承载一段善意。', choices: [c('收下铜钱，好好道谢','铜钱化作一缕灵息，落在系统边缘。',{coins:2,qi:5}),c('把它留给老人作纪念','老人说，那就把谢意记在心里。',{karma:3}),c('用自己的零钱换下它','旧物易主，善意并没有减少。',{money:-5,qi:12,karma:1})] },
    { id: 'river', kind: 'explore', title: '江底的第二轮月亮', text: '水面映着月亮，水底却还有一轮。你看见三道断裂的阵纹，正随着潮汐缓缓明灭。', choices: [c('坐在岸边参悟','一段残缺心法在脑海中连了起来。',{qi:22,stamina:-6}),c('用灵力探查阵纹','你找到了一块可以承载阵力的碎玉。',{mana:-15,fragments:1}),c('记下位置，暂不惊动','知道何时退后，也是修行的一部分。',{insight:1,karma:1})] },
    { id: 'herb', kind: 'explore', title: '石缝里的青灵草', text: '一簇灵草生在废弃台阶上。旁边蹲着采药人，篮子里只有几片普通野菜。', choices: [c('与采药人平分','他教你辨认灵草的根脉，临别又多分给你一株。',{herb:2,karma:2}),c('用零钱买下','这是一笔双方都满意的买卖。',{money:-15,herb:3}),c('只摘成熟的一株','你把幼芽留给了明年。',{herb:1,qi:6})] },
    { id: 'sword', kind: 'explore', title: '锈剑不会说话', text: '古井旁有把断剑。你握住剑柄的一瞬，听到许多人重复着同一句话：替我们看看。', choices: [c('向断剑描述如今的城市','残留的执念安静下来，一道阵纹融入你的识海。',{qi:25,karma:3}),c('用灵力修复断口','断剑化为青光，留下温热的碎玉。',{mana:-18,fragments:1}),c('把它安放在干燥的石台上','你没有带走它，只让风雨暂时停在身后。',{karma:2,stamina:5})] },
    { id: 'bottleneck', kind: 'cultivation', title: '心魔借了一张账单', text: '闭上眼后，未付的房租、错过的订单与所有后悔轮番出现。心魔没有獠牙，只是很像疲惫的你。', choices: [c('承认自己会累','呼吸渐渐平稳。你不必时时刻刻证明自己。',{stamina:10,qi:12}),c('以道心直面杂念','念头起落，你坐在其中，没有离开。',{mana:-8,qi:24}),c('停下修炼，喝杯热水','今夜没有多走一步，也没有退回原点。',{health:8,stamina:8})] },
    { id: 'rooftop', kind: 'cultivation', title: '屋顶上的灯海', text: '灵气沿着天际缓缓流动。你忽然察觉，它并非来自群山，而是来自每一扇仍有人等候的窗。', choices: [c('把灯火引入丹田','人间烟火在你的经脉里汇成细流。',{qi:20,karma:1}),c('记录这一刻的感悟','你给笔记取名：《人间有灵》。',{insight:1,qi:8}),c('替还在工作的人留一盏灯','暖光没有照到很远，但它一直亮着。',{money:-3,karma:3,qi:10})] },
    { id: 'elevator', kind: 'delivery', title: '停在七楼的电梯', text: '老楼电梯突然卡住，里面有人拍门求助。你的客人住在十二层，你手里的餐还冒着热气。', choices: [c('先联系物业并陪到有人回应','隔着门说了几分钟话，维修人员终于赶到。',{karma:3,rep:1},{duration:8}),c('记下楼层，走楼梯继续配送','你把求助信息发给物业，随后提着餐盒继续向上。',{stamina:-5,rep:2}),c('请楼下住户代为守着','有人接过这段短暂的责任，你也没有耽误太久。',{karma:1,rep:1},{duration:3})] },
    { id: 'raincoat', kind: 'delivery', title: '两件雨衣', text: '雨忽然大起来，路口有位老人拿着两件一次性雨衣，说自己只用一件，另一件问你要不要。', choices: [c('收下并认真道谢','薄薄的塑料挡住了大半风雨，也挡住了一点疲惫。',{stamina:5,karma:1}),c('留给下一位没带伞的人','老人笑着把雨衣挂在公交站牌上。',{karma:3,qi:5}),c('帮老人把伞骨掰正','雨没停，你们却都轻松了些。',{stamina:-3,karma:2,rep:1})] },
    { id: 'night-school', kind: 'delivery', title: '夜校最后一盏灯', text: '送达地点是一间夜校。教室里只剩一个准备成人考试的人，他把错题本摊满整张桌。', choices: [c('祝他考试顺利','他把这句话写在错题本最后一页。',{karma:2,qi:6}),c('分享自己坚持修行的办法','你说，先做完今天能做的一点。',{insight:1,rep:1}),c('不打扰，轻轻放下餐','门关上时，台灯仍然亮着。',{rep:2,stamina:2})] },
    { id: 'old-photo', kind: 'delivery', title: '照片里少了一个人', text: '客人接餐时掉出一张旧合照。照片边缘被反复折过，像有人总想把自己藏起来。', choices: [c('捡起照片，只说掉东西了','你没有多问，对方却主动讲起了照片里的朋友。',{trust:0,karma:2,qi:5}),c('帮他找一个透明保护套','一张旧照片终于不用再被折叠。',{money:-6,karma:3,rep:1}),c('把照片递回去就离开','有些故事不必由陌生人打开。',{rep:1})] },
    { id: 'incense-noodle', kind: 'delivery', title: '香火味的牛肉面', text: '门开时没有人，只有一张小桌和一只写着“加辣”的纸鹤。纸鹤翅膀上沾着很淡的香灰。', choices: [c('照备注放好，再退到门外','片刻后，碗边多了一枚温热铜钱。',{coins:1,qi:8}),c('以灵力感应纸鹤','你看见一道很旧的送别仪式，却没有恶意。',{mana:-6,insight:1,qi:10}),c('打电话确认收餐方式','电话那头沉默几秒，只说：谢谢你按规矩来。',{rep:2,karma:1})] },
    { id: 'last-bus', kind: 'delivery', title: '末班车之前', text: '客人发来消息：他正从医院赶回家，如果你愿意多等五分钟，就能亲手接到这顿饭。', choices: [c('在门口等他','五分钟后，一个疲惫的人跑来，第一句是谢谢。',{karma:2,rep:2},{duration:5}),c('把餐放进保温柜并拍照','你把取餐步骤写得很清楚。',{rep:2}),c('询问是否需要帮忙带瓶水','对方回了一个很久没有发过的笑脸。',{money:-3,karma:2})] },
    { id: 'river-camera', kind: 'explore', encounterNpc: 'su', title: '镜头里的第二轮月亮', text: '河岸边，一个叫苏砚的人正架着旧相机。他说镜头里总比肉眼多出一轮月亮，问你敢不敢一起看看。', choices: [c('凑过去看取景器','第二轮月亮下，有细小阵纹沿江延伸。',{insight:1,qi:12}),c('帮他扶稳三脚架','长曝光结束时，照片上留下了一条像龙脊的光。',{stamina:-3,karma:1,qi:8}),c('先问清楚他拍了多久','苏砚笑说：久到开始怀疑不是相机的问题。',{qi:6,karma:1})] },
    { id: 'paper-crane', kind: 'explore', title: '逆风的纸鹤', text: '一只纸鹤逆着江风飞来，停在你的车把上。展开后，里面只写着一个已经拆迁的地址。', choices: [c('沿旧地图寻找地址','你找到一块还没被拆走的门牌，背面刻着阵纹。',{qi:18,insight:1}),c('把纸鹤重新折好放回风里','它绕了半圈，飞向江对岸。',{karma:2,stamina:3}),c('记下地址，交给旧雨书店查证','有些谜题适合慢一点解。',{qi:8,rep:1})] },
    { id: 'kiosk', kind: 'explore', title: '停业十年的报刊亭', text: '公园角落的旧报刊亭今晚亮着灯。玻璃里摆着今天的报纸，也摆着十年前同一天的报纸。', choices: [c('买一份今天的报纸','摊主不收钱，只让你以后多看看这座城。',{insight:1,qi:8}),c('翻看十年前的头版','你找到护城阵破裂那晚的一条不起眼新闻。',{qi:16,rep:1}),c('不进去，只记住灯的位置','回头再看时，亭子已经黑了。',{karma:1,stamina:4})] },
    { id: 'bridge-bell', kind: 'explore', title: '桥下的无声铃', text: '桥洞里挂着一串没有铃舌的铜铃。风吹过时没有声音，你的灵力却跟着轻轻震了一下。', choices: [c('坐下听那段无声','你第一次意识到，灵气也有自己的节拍。',{qi:20,stamina:-4}),c('用一缕灵力试探','铜铃映出几段陌生人的归家路。',{mana:-8,qi:16}),c('擦掉铃上的灰','你没有得到宝物，只觉得心里安静了一点。',{karma:2,health:4})] },
    { id: 'dream-delivery', kind: 'cultivation', title: '梦里还有一单', text: '入定后，你竟又听见接单提示。梦中的地址写着“过去”，收餐人姓名却是你自己。', choices: [c('把餐送给过去的自己','那个疲惫的你接过热饭，终于没有继续责怪后来的人。',{qi:24,health:5}),c('取消这一单','系统没有扣分。你第一次知道，有些路可以不走。',{stamina:8,karma:2}),c('问过去的自己想说什么','他只说：别把今天也弄丢了。',{insight:1,qi:12})] },
    { id: 'street-meridian', kind: 'cultivation', title: '街道也是经脉', text: '吐纳时，整座城市的道路在识海里亮起。红绿灯像穴位，桥梁像关窍，而你的路线正穿行其中。', choices: [c('顺着道路运转周天','你把熟悉的街巷变成了一套自己的吐纳节奏。',{qi:26,stamina:-4}),c('只观察，不强行引气','城市的脉络逐渐清晰。',{insight:1,qi:10}),c('把一处堵塞的阵纹记下来','下一次路过那里时，你会知道该看哪里。',{qi:12,karma:1})] },
    { id: 'dawn-breath', kind: 'cultivation', title: '天亮前最后一口气', text: '夜色将尽，灵气开始退潮。你忽然觉得，修行不是追赶灵气，而是在每一次呼吸里不把自己弄丢。', choices: [c('继续坐到天亮','你没有获得奇迹，只把这一夜完整地走完。',{qi:18,stamina:-3}),c('收功，去吃一顿早饭','身体被认真照顾，心境反而更稳。',{stamina:10,health:6}),c('记下这一刻','后来你把这句话写进自己的修行笔记。',{insight:1,qi:8})] },
    { id: 'borrowed-moon', kind: 'cultivation', title: '借来的一轮月', text: '窗外被高楼挡住，看不见月亮。你却在水杯里看到一小块月光，像有人从别处借来给你。', choices: [c('借月光运气','那一点光沿经脉走了一圈。',{qi:20,mana:5}),c('把杯子放到窗边','你不占有它，只让它照一会儿屋子。',{karma:2,qi:9}),c('喝掉已经凉的水','修行忽然变得很普通，也很可靠。',{health:5,stamina:5})] }
  ];
  // 1.8.0：39 段原创配送事件；每段三个独立结果，至少一个无资源成本选项。
  G.EVENTS.push(
    {"id":"delivery-lobby-sign","kind":"delivery","title":"被风吹反的指路牌","text":"楼下的临时指路牌被风吹反了。几位送货的人在同一条死胡同里绕圈，门卫正忙着接电话。","choices":[{"label":"把路牌扶正，再向门卫确认","result":"你扶稳底座，门卫核对后朝正确的入口点了点头。身后的送货人终于不用再绕一圈。","effects":{"stamina":-3,"rep":2},"duration":3},{"label":"把正确入口发给正在问路的人","result":"消息很短，却让群里连续响起几声道谢。你按确认过的入口完成了交付。","effects":{"rep":1,"karma":1}},{"label":"先打电话，请收餐人指路","result":"对方一步步说清了路线。你没有猜测地址，餐也安稳交到本人手里。","effects":{"rep":2}}]},
    {"id":"delivery-warm-water","kind":"delivery","title":"保温杯里的最后一口水","text":"客人开门时，看见你已经空了的水杯。他端出一壶温水，认真问你是不是又忘记喝水了。","choices":[{"label":"接半杯，坐一会儿再走","result":"温水落进胃里，紧绷的肩背慢慢松开。你把杯盖拧紧，向门里的人道了谢。","effects":{"stamina":6,"health":3},"duration":3},{"label":"只接一点，给后来的骑手留着","result":"对方把水壶放在门口的凳子上，又添了几只纸杯。这份照顾不只停在你身上。","effects":{"stamina":3,"karma":2}},{"label":"婉谢，提醒他先吃热饭","result":"对方笑着把餐盒打开。你没有多停，但那句“路上小心”陪你走到了楼梯口。","effects":{"rep":1,"qi":4}}]},
    {"id":"delivery-spare-chopsticks","kind":"delivery","title":"少了一双筷子","text":"收餐人刚搬进空屋，拆开餐袋才发现没有筷子。他看着还没送来的家具，不好意思地叹了口气。","choices":[{"label":"拿出干净的备用餐具","result":"你把独立包装递过去。他坐在纸箱上，终于吃上搬家后的第一顿饭。","effects":{"karma":2,"rep":2}},{"label":"替他去楼下买一套餐具","result":"小店还没打烊。你带回一双可以反复使用的筷子，他说这总算像个家的开头。","effects":{"money":-6,"karma":3},"duration":4},{"label":"联系商家，说明遗漏","result":"商家确认后安排补送。你把沟通结果告诉客人，没有让他自己再说一遍。","effects":{"rep":2,"insight":1}}]},
    {"id":"delivery-sleeping-baby","kind":"delivery","title":"门后的轻声细语","text":"备注写着不要敲门。门打开一条缝，抱着婴儿的家长用口型向你说谢谢，桌上的饭显然已经等了很久。","choices":[{"label":"轻轻放稳餐盒，发文字确认","result":"餐盒没有碰响门框，孩子也没有惊醒。对方用空出来的一只手回了个“收到”。","effects":{"rep":3}},{"label":"帮忙把门边的垃圾带到楼下","result":"你提起扎好的袋子，轻轻带上门。楼上传来很小的一声道谢，像怕碰碎片刻安静。","effects":{"stamina":-3,"karma":3}},{"label":"留下独立包装的湿巾","result":"对方点头收下，把湿巾放在伸手就能拿到的地方。这一点方便，恰好落在忙乱之间。","effects":{"karma":2,"qi":5}}]},
    {"id":"delivery-exam-desk","kind":"delivery","title":"准考证旁的一碗面","text":"客人的桌上铺满笔记，准考证被压在透明杯下。他接餐时问你：努力很久却没把握，算不算白忙？","choices":[{"label":"告诉他先吃完这碗面","result":"你没有替考试许愿，只把汤碗摆稳。他合上笔记，终于肯让自己停一会儿。","effects":{"karma":2,"rep":1}},{"label":"讲讲自己第一次独自跑单","result":"你讲起那次找错入口的狼狈，他听完笑了。桌边的紧张散去一点，你也重新理解了熟能生巧。","effects":{"insight":1,"qi":6},"duration":4},{"label":"不作评价，祝他照顾好自己","result":"你把祝福说得很认真。他把笔帽扣好，回答说今晚会早点休息。","effects":{"karma":2,"qi":4}}]},
    {"id":"delivery-night-cleaner","kind":"delivery","title":"扫帚边的饭盒","text":"收餐人穿着保洁制服，把扫帚靠在墙边。她特意选了不带汤的饭，说怕弄脏刚擦过的地面。","choices":[{"label":"帮她铺好一张干净垫纸","result":"饭盒终于可以放稳。她坐下吃饭时，你替她扶住了那把总往下滑的扫帚。","effects":{"karma":3,"rep":1}},{"label":"买瓶水放在饭盒旁","result":"她把水拧开，又仔细收好瓶盖。你们没聊多久，却都记住了这次照面。","effects":{"money":-3,"karma":3,"qi":4}},{"label":"把餐递好，不打断她休息","result":"你确认餐具齐全便轻声离开。她终于有一段不必回应任何人的吃饭时间。","effects":{"rep":2,"stamina":2}}]},
    {"id":"delivery-rehearsal","kind":"delivery","title":"排练室的安可","text":"你敲开排练室，里面的人刚结束一次不太整齐的合奏。主唱说，今天没有观众，只有准点到的这份饭。","choices":[{"label":"听完他们最后半首歌","result":"鼓点偶尔走散，旋律却渐渐接上。你认真鼓掌后，他们把这次排练称作一场小演出。","effects":{"stamina":4,"qi":7},"duration":5},{"label":"把餐按人数摆开","result":"乐器被收进箱里，一群人围着饭盒坐下。你看见他们开始讨论下一次怎样配合。","effects":{"rep":2,"karma":1}},{"label":"告诉他们，门外也能听到副歌","result":"主唱愣了一下，重新看向队友。那段差点被删掉的副歌，至少已经抵达过一个人。","effects":{"karma":2,"insight":1}}]},
    {"id":"delivery-repaired-sign","kind":"delivery","title":"灯牌重新亮起来","text":"小店刚换好灯管，招牌仍有一个字暗着。老板接过自己的晚饭，问你这样会不会很难看。","choices":[{"label":"帮他站远一点看看是否醒目","result":"你换了两个角度，指明被树枝挡住的位置。他照着调整后，店名清楚了许多。","effects":{"stamina":-2,"rep":2},"duration":3},{"label":"说清哪一笔没亮，不替他下判断","result":"老板记下故障位置，打算明天请人检修。你们把一个含糊的烦恼变成了具体的小事。","effects":{"insight":1,"karma":1}},{"label":"提醒他趁热吃饭，修灯明天再说","result":"他放下手里的抹布，第一次坐到顾客常坐的椅子上。热气从暗掉的字下面升起来。","effects":{"karma":2,"qi":5}}]},
    {"id":"delivery-moving-boxes","kind":"delivery","title":"最后一个纸箱","text":"收餐人被堆到门口的纸箱挡住，正一手拿钥匙一手扶箱子。餐到了，新生活却还没腾出落脚的地方。","choices":[{"label":"帮忙把挡门的两箱挪开","result":"你只挪开通道，没有替对方拆任何东西。门终于能完全打开，餐也有了平稳的位置。","effects":{"stamina":-5,"karma":3,"rep":1},"duration":4},{"label":"在门外扶住箱子，让他先开门","result":"钥匙转动后，他顺利腾出手接餐。你们各自用一点力气，化解了这个卡住的瞬间。","effects":{"stamina":-2,"rep":2}},{"label":"按对方指示把餐放到空凳上","result":"你复述了摆放位置，确认没有碰到易碎品。离开时，他终于可以先坐下吃几口。","effects":{"rep":2,"qi":3}}]},
    {"id":"delivery-rooftop-tomatoes","kind":"delivery","title":"窗台上熟透的番茄","text":"客人指着窗台说，自己种的第一颗番茄今天红了。他想切开配饭，又舍不得下刀。","choices":[{"label":"请他讲讲这盆番茄怎么长大","result":"他从第一场雨讲到今天早晨。听完这些细小的照料，你觉得等待也有了清晰的形状。","effects":{"insight":1,"qi":8},"duration":4},{"label":"帮他拍一张成熟的照片","result":"照片拍好后，他终于把番茄摘下。记录留下来，晚饭也没有错过它最好的时候。","effects":{"rep":1,"karma":2}},{"label":"祝他这顿饭吃得开心","result":"他把番茄放在饭盒旁，像添了一道节日菜。你带着一身很淡的叶香离开。","effects":{"stamina":3,"qi":4}}]},
    {"id":"delivery-guide-dog","kind":"delivery","title":"不该摸的工作伙伴","text":"门开时，一只导盲犬安静地等在主人身旁。客人请你说清餐盒和饮料的位置，不要把东西放在走道上。","choices":[{"label":"逐件说明，放到指定位置","result":"你用钟点方向描述杯子，没有逗弄正在工作的犬。对方确认摸到餐袋后，你才告辞。","effects":{"rep":3,"karma":1}},{"label":"先问是否需要协助，再递餐","result":"客人选择自己接过餐盒。你按他的节奏等待，没有把好意变成额外的障碍。","effects":{"karma":3,"insight":1}},{"label":"把取餐信息改成清晰的语音","result":"位置、数量和注意事项被简短说明。对方听完回复收到，这次交付没有留下猜测。","effects":{"rep":2,"qi":4}}]},
    {"id":"delivery-hearing-note","kind":"delivery","title":"一张写着谢谢的纸","text":"收餐人没有回应门铃，却很快回复了消息。门打开后，他举起一张纸，请你把话写下来。","choices":[{"label":"用手机打字逐项核对","result":"你把两份饭的区别写清楚，他圈出自己的那份。最后一行多了两个笔迹很重的“谢谢”。","effects":{"rep":3}},{"label":"请他指认名字，再递上餐","result":"你们用点头完成了确认。交流没有声音，却没有哪一步被省略。","effects":{"rep":2,"karma":1}},{"label":"写下保温袋的开启方法","result":"你把容易漏掉的小扣也画了出来。他看着图示打开餐袋，朝你竖起拇指。","effects":{"insight":1,"karma":2},"duration":3}]},
    {"id":"delivery-empty-shop","kind":"delivery","title":"打烊前的第一单","text":"新店还没有迎来客人，老板给自己点了份晚饭。他把收款牌擦了一遍又一遍，说不知道明天要不要继续开门。","choices":[{"label":"不替他决定，听他说完今天","result":"你听他算完房租、材料和开门的时间。他没有得到答案，却终于把心里的账说清楚了。","effects":{"stamina":-2,"karma":3},"duration":5},{"label":"买一张店里的手绘明信片","result":"你付的是明信片的钱，不是对未来的承诺。他把当天第一笔销售认真记进账本。","effects":{"money":-8,"karma":2,"qi":7}},{"label":"把饭递稳，提醒他先休息","result":"老板把抹布放下，给自己倒了杯水。明天还没到，今晚可以先吃完这顿饭。","effects":{"rep":1,"karma":2}}]},
    {"id":"delivery-burnt-rice","kind":"delivery","title":"电饭锅没有跳闸","text":"客人先展示了锅里结成硬块的米饭，才接过补点的晚餐。他说独居后的第一堂课，大概就是承认自己会做砸。","choices":[{"label":"分享自己也曾把事情弄糟","result":"你讲了一个不怎么体面的笑话。他笑出声后，屋里终于不只剩焦味。","effects":{"karma":2,"stamina":3}},{"label":"帮他把窗边的餐桌收出一角","result":"你避开还烫的锅，只整理了可以吃饭的地方。热餐放下后，这个晚上重新有了秩序。","effects":{"stamina":-3,"rep":2,"qi":5},"duration":3},{"label":"说今天仍然有一顿热饭","result":"他看了看完好的餐盒，承认你说得对。一次失败没有把整天都变成失败。","effects":{"insight":1,"karma":1}}]},
    {"id":"delivery-returned-change","kind":"delivery","title":"多转来的十块钱","text":"客人把小费转成了十倍，发现后迟迟没发消息。你核对收款记录时，看见他正在输入又删掉文字。","choices":[{"label":"主动退回误转的部分","result":"金额核清后，对方明显松了口气。他另留下一点心意，你只收了双方确认过的数目。","effects":{"money":5,"rep":3}},{"label":"先发截图，请对方确认","result":"你没有把沉默当成赠予。两边记录对上后，这笔误会被清楚地解决。","effects":{"rep":2,"insight":1}},{"label":"请平台协助原路处理","result":"款项按流程退回，没有交换多余的私人信息。客人给这次处理留下了好评。","effects":{"rep":3}}]},
    {"id":"delivery-parcel-room","kind":"delivery","title":"快递架上的同名人","text":"收餐点的架子上放着两个同名人的包裹。值守人正想随手放下你的餐，却发现联系电话不同。","choices":[{"label":"核对尾号后放入指定格","result":"你把格号发给真正的收餐人。几分钟后，平台显示了清楚的取餐确认。","effects":{"rep":3}},{"label":"联系本人到架前核验","result":"客人出示了自己的订单，你才交出餐盒。同名没有变成又一次错拿。","effects":{"rep":2,"karma":1},"duration":3},{"label":"请值守人另写一张清楚标签","result":"姓名旁补上尾号和格号后，大家都不再需要猜。你也记住了核对细节的必要。","effects":{"rep":1,"insight":1}}]},
    {"id":"delivery-umbrella-rack","kind":"delivery","title":"伞架上留着空位","text":"客人门口有个写着“借用后归还”的伞架。一位邻居正犹豫着伸手，又因为没有登记笔而缩回去。","choices":[{"label":"借出笔，让他写下归还信息","result":"名字写好，伞从架上取走。客人说这些小小的约定已经替很多人挡过雨。","effects":{"karma":2,"rep":1}},{"label":"把自己的备用挂钩留给伞架","result":"歪斜的长伞终于有了稳妥位置。你没有等到雨停，却把一点秩序留在了门口。","effects":{"money":-4,"karma":3,"qi":4}},{"label":"向客人说明邻居想借伞","result":"门里传来明确的答应。你传完话，邻居安心撑开了伞。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-power-bank","kind":"delivery","title":"还剩百分之一","text":"收餐人的手机只剩一点电，门禁码却还没加载出来。他站在自己住的楼下，尴尬得像个外来客。","choices":[{"label":"让他借用你的应急充电线","result":"手机重新亮起，门禁码终于出现。你收好线后，发现人间的关隘有时只是一个插口。","effects":{"stamina":-2,"karma":3},"duration":5},{"label":"帮他联系物业值班台","result":"核验完成后，物业替他开了门。你们没有翻越围栏，也没有借别人的身份蒙混进去。","effects":{"rep":2,"insight":1}},{"label":"把餐交给本人，陪他确认已收到","result":"订单先完成交接，对方不用再怕断网丢了晚饭。你提醒他保留仅剩的电量联系家人。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-overtime-table","kind":"delivery","title":"工位之间的一张空桌","text":"一群人围在打印机边赶工，饭到了却没有地方放。角落里有张堆满旧纸的空桌，没人顾得上收拾。","choices":[{"label":"请他们确认哪些纸能挪开","result":"得到同意后，你们一起腾出桌面。没人丢失资料，晚饭也终于离开了键盘旁。","effects":{"stamina":-4,"rep":3},"duration":4},{"label":"按名字逐份交到本人手里","result":"你逐个核对，没有把备注不同的饭混在一起。忙乱里，总算有件事准确落定。","effects":{"rep":3}},{"label":"提醒大家先留出安全通道","result":"纸箱被移到不挡路的角落，你才稳稳放下餐袋。着急的工作没有变成新的绊脚石。","effects":{"rep":1,"karma":2}}]},
    {"id":"delivery-paper-medal","kind":"delivery","title":"纸做的奖牌","text":"孩子替加班回来的家长订了饭，还剪出一枚纸奖牌。他问你，能不能把奖牌也一起递过去。","choices":[{"label":"把奖牌和餐一起郑重送上","result":"大人看见歪歪扭扭的字，停了很久才接过。你在门外听见孩子被叫了名字。","effects":{"karma":3,"qi":7}},{"label":"让孩子自己颁奖，你托住餐","result":"你没有占去那个重要的瞬间。小小的手把奖牌挂好，晚饭的热气绕过他们的肩膀。","effects":{"rep":2,"karma":2}},{"label":"帮孩子把松开的纸带接好","result":"奖牌没有掉下来，孩子轻轻松了口气。你把剩下的胶带还回去，完成了这次交付。","effects":{"stamina":-2,"karma":3},"duration":3}]},
    {"id":"delivery-broken-strap","kind":"delivery","title":"保温袋断了一根带","text":"刚到楼下，餐袋的提带突然断开。餐盒还好好落在你的臂弯里，只差一点就要洒在地上。","choices":[{"label":"用备用绑带重新固定","result":"你检查了封口，再把餐盒稳稳绑好。客人收到完好的饭，你也把这次险情记进心里。","effects":{"stamina":-3,"rep":2},"duration":3},{"label":"双手托住餐盒完成交付","result":"最后一段路走得比平常慢。交到客人手里时，汤面依然平整。","effects":{"stamina":-5,"rep":3}},{"label":"请客人带托盘到门口交接","result":"对方端来托盘，你说明了提带损坏但餐盒完好的情况。这次配合省去了一场狼狈。","effects":{"rep":2,"insight":1}}]},
    {"id":"delivery-soup-steam","kind":"delivery","title":"玻璃上的一行雾字","text":"客人正在小玻璃房里值守。你把热汤放到窗口时，雾气在玻璃上留下一行像字又像呼吸的纹路。","choices":[{"label":"顺着雾气的节奏调整呼吸","result":"几次缓慢吐纳后，那行纹路在眼前连成细线。汤还热着，你的心绪已经安静下来。","effects":{"qi":10,"mana":3}},{"label":"擦出一小块玻璃，确认签收","result":"值守人隔着清楚的窗口向你点头。奇怪的雾字散了，交付的信息却留了下来。","effects":{"rep":2,"insight":1}},{"label":"只把汤递好，不去猜它的意思","result":"对方捧起碗，呵了一口气。你没有追逐谜题，仍接住了这一刻普通的暖意。","effects":{"karma":2,"stamina":3}}]},
    {"id":"delivery-clock-shop","kind":"delivery","title":"所有钟都慢了一分钟","text":"送餐的屋里摆着许多旧钟，指针却比你的手机慢同样的一分钟。修钟人说，那一分钟是留给来不及道别的人。","choices":[{"label":"听他讲完那一分钟","result":"他说的不是术法，而是一次没能赶上的晚饭。故事落下后，钟声终于不再像催促。","effects":{"qi":9,"karma":2},"duration":5},{"label":"认真核对订单，不拨动任何钟","result":"你尊重屋里的时间，也按自己的记录完成签收。两个刻度没有因此互相否定。","effects":{"rep":2,"insight":1}},{"label":"提醒他今天的饭还没有凉","result":"老人移开桌上的工具，给餐盒腾出位置。那一分钟暂时有了新的用处。","effects":{"karma":3,"qi":4}}]},
    {"id":"delivery-fountain-pen","kind":"delivery","title":"墨水没干的辞职信","text":"客人桌上的信只写了一半，钢笔却漏了墨。他接过饭时，想让你替他判断该不该把信写完。","choices":[{"label":"不替他决定，建议吃饭后再想","result":"他把纸翻过去，让自己暂时离开那几个字。你没有交出答案，只帮他留住选择的余地。","effects":{"karma":2,"insight":1}},{"label":"递一张干净纸，听他梳理顾虑","result":"租金、通勤和真正想做的事被一条条写下。说完后，他知道下一步该向谁确认信息。","effects":{"stamina":-3,"karma":3},"duration":5},{"label":"把餐摆在不会沾墨的地方","result":"你只处理眼前能确定的小事。他擦净手，向你道谢，信仍由他自己保管。","effects":{"rep":2,"qi":4}}]},
    {"id":"delivery-harvest-basket","kind":"delivery","title":"菜篮里的一小把青菜","text":"收餐人刚从自己的小菜地回来，坚持送你一小把青菜。他说盒饭吃得方便，也要记得有东西会慢慢长。","choices":[{"label":"婉谢青菜，请他讲讲种菜的事","result":"你没有地方妥善存放，便认真说明。老人并不介意，反而教了你辨认嫩叶的小窍门。","effects":{"insight":1,"karma":1}},{"label":"请他把青菜留给今晚一起吃饭的人","result":"篮子被提回厨房，水声很快响起来。你没有收下礼物，却让这份心意回到了餐桌上。","effects":{"karma":3,"qi":4}},{"label":"帮他把菜篮提到门内","result":"篮子有一点沉，你把它放在不挡门的位置。老人终于腾出手接过自己的热饭。","effects":{"stamina":-3,"rep":2,"karma":1}}]},
    {"id":"delivery-train-whistle","kind":"delivery","title":"汽笛响起之前","text":"客人抱着行李等家人来接，手里攥着一张旧车票。远处传来汽笛，他却忽然不急着低头看时间了。","choices":[{"label":"陪他确认新车票的日期","result":"旧票被夹回本子，新票的信息终于看清。离别不必再多添一次赶错日子的慌张。","effects":{"rep":2,"insight":1}},{"label":"把汤和主食分开放稳","result":"行李旁留出一块干净位置，他终于能先吃几口。你听见他在电话里说，饭已经送到了。","effects":{"rep":2,"karma":1}},{"label":"听他说起上一次回家的路","result":"他说得很慢，像重新经过许多熟悉的站名。你告辞时，他的手已经不再紧攥着旧票。","effects":{"qi":8,"karma":2},"duration":4}]},
    {"id":"delivery-bridge-shadow","kind":"delivery","title":"桥影少了一块","text":"餐已经送到桥边值守室，窗外的桥影却缺了一段。值守人没有察觉，只有系统地图上的那一点轻轻闪烁。","choices":[{"label":"用灵力描回缺失的轮廓","result":"一缕灵息触到水面，缺口里浮出细小的阵纹。桥影重新连起，你认清了一种补阵的次序。","effects":{"mana":-8,"qi":15,"insight":1}},{"label":"记录缺口，不惊动水面","result":"你把观察写进自己的路程笔记，没有擅自触碰未知阵势。抬头时，水波已经带走了裂痕。","effects":{"insight":1,"qi":6}},{"label":"先提醒值守人吃饭","result":"值守室的灯亮起，桥影的缺口也淡了些。你发现普通的回应同样能让某些东西完整。","effects":{"karma":2,"qi":8}}]},
    {"id":"delivery-ink-address","kind":"delivery","title":"墨迹还在移动的地址","text":"收餐人递来的签收纸上，地址像墨水中的小鱼一样移动。你自己的订单却清清楚楚，没有改过一笔。","choices":[{"label":"以订单信息为准逐项核验","result":"名字、尾号和餐品全部对上后，纸上的墨迹停住了。你没有让怪异替代必要的确认。","effects":{"rep":2,"insight":1}},{"label":"用一缕灵力稳住纸角","result":"墨迹沿你的灵息排回原位，露出一小段古老门牌的写法。你看过后松手，没有把纸带走。","effects":{"mana":-6,"qi":14}},{"label":"请对方改用口头确认","result":"客人说出正确的信息，纸上的小鱼便游进了墨点。签收完成，门里的人低声道谢。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-silent-doorbell","kind":"delivery","title":"没有声音的门铃","text":"你按下门铃，没有声音，门内的灯却随之亮起。收餐人说，这个铃只会叫醒那些仍在等人的念头。","choices":[{"label":"把热饭递过去，不再多按","result":"灯光安稳下来，对方终于将目光从走廊收回。你没有替任何人闯进那份等待。","effects":{"karma":2,"qi":8}},{"label":"询问门铃为什么还留着","result":"他说铃坏了很久，却一直舍不得换。你听见的不一定是神异，也可能只是记忆不肯散去。","effects":{"insight":1,"qi":6}},{"label":"按正常流程确认本人收餐","result":"确认完成后，手机上的提示与门内的灯同时暗了一点。你守住了自己的职责。","effects":{"rep":3}}]},
    {"id":"delivery-paper-fish","kind":"delivery","title":"汤碗边的纸鱼","text":"客人折了一条纸鱼压在签收单上。鱼鳍轻轻摆动，仿佛餐盒上方的蒸汽就是一条河。","choices":[{"label":"轻轻把蒸汽引向纸鱼","result":"纸鱼绕着碗边游了一圈，散成细小光点。你在水汽的流动里找到一段顺畅的行气节奏。","effects":{"mana":-5,"qi":13}},{"label":"问客人折纸的方法","result":"他一步步折给你看，没有任何口诀。你学到的是耐心，却也从耐心里获得一点灵息。","effects":{"insight":1,"qi":5},"duration":4},{"label":"不要触碰，等对方收好","result":"客人将纸鱼夹进书里，向你点头。小小的奇异没有妨碍这一餐被安稳送达。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-rice-light","kind":"delivery","title":"米粒里的微光","text":"开盖的一瞬，几粒米饭像细小的灯。客人却只是个刚结束工作的人，正为终于能坐下吃饭而松口气。","choices":[{"label":"凝神辨认，但不碰餐食","result":"微光来自手心传来的暖意，而不是稀有灵材。你收回神识，对系统的力量多懂了一点。","effects":{"mana":-6,"qi":12,"insight":1}},{"label":"祝他好好吃完这一餐","result":"第一口饭咽下去，微光便安静落回碗中。你忽然不觉得它需要更大的名字。","effects":{"karma":3,"qi":6}},{"label":"确认没有遗漏餐具后离开","result":"你没有因为看见异常而忘记交付细节。身后传来杯碗碰响的声音，很平常，也很完整。","effects":{"rep":3}}]},
    {"id":"delivery-old-messenger","kind":"delivery","title":"穿旧制服的送信人","text":"你交餐时，一位穿旧制服的人也在门口等。他拿着没有收件地址的信，问你这座城的路是不是全变了。","choices":[{"label":"用自己的路线讲讲如今的街巷","result":"他说出的旧地名逐渐对上你走过的路。制服上的尘土散去一点，他终于找回了方向感。","effects":{"qi":10,"karma":2},"duration":5},{"label":"提醒他先向收件人核实地址","result":"他低头看信封，像第一次意识到可以问。模糊的墨迹随之清楚了一些。","effects":{"insight":1,"rep":1}},{"label":"先把饭交好，再向他道别","result":"老人没有拦你，只轻轻碰了一下帽沿。你们各自守住了手里需要送达的东西。","effects":{"rep":2,"qi":5}}]},
    {"id":"delivery-mirror-dinner","kind":"delivery","title":"镜子里多出来的晚餐","text":"门边的镜子映出两份饭，你手里却只有一份。客人看着镜面说，过去总有人与自己一起吃晚饭。","choices":[{"label":"不戳破倒影，请他先坐下","result":"客人将一张空凳推回桌旁。镜中多出的饭慢慢淡去，桌上的这一份仍然热着。","effects":{"karma":3,"qi":8}},{"label":"以灵力确认没有危险","result":"镜面回应的只有一段旧记忆。你收回灵息，不把无害的怀念当作必须驱除的东西。","effects":{"mana":-8,"insight":1,"qi":12}},{"label":"按订单清点一份饭和餐具","result":"你清楚说明数量，客人点头表示收到了。镜子留在原处，交付也没有含糊。","effects":{"rep":3}}]},
    {"id":"delivery-wind-receipt","kind":"delivery","title":"风不肯吹走的收据","text":"完成核对后，收据突然落到地上。四周有风，薄纸却纹丝不动，背面慢慢显出一条你刚走过的路线。","choices":[{"label":"沿路线末端注入一点灵力","result":"纸面上的终点亮起，随即恢复为普通收据。你感到那段道路似乎也在回望自己。","effects":{"mana":-6,"qi":14}},{"label":"只记住路线，不保留客人信息","result":"你遮住联系方式后看清阵纹，把收据归还。求知并不需要拿走别人的隐私。","effects":{"insight":1,"karma":2}},{"label":"捡起交回，继续完成签收","result":"客人没有发现异常，仍认真说了谢谢。风终于吹动纸角，像给这一单盖了章。","effects":{"rep":2,"qi":5}}]},
    {"id":"delivery-borrowed-fire","kind":"delivery","title":"借一缕不烫人的火","text":"客人端着一盏已经熄灭的小灯，说只想借餐食的一点热气。灯芯没有火，掌心却能感觉到温度。","choices":[{"label":"以少许灵力护住灯芯","result":"灯芯燃起一簇不烫人的小光。你及时停手，没有把自己全部的灵力都投进去。","effects":{"mana":-10,"qi":16}},{"label":"请他靠近热饭，先暖暖手","result":"对方捧住餐盒，灯也跟着明亮了一点。你没有施术，却让冷掉的等待重新有了温度。","effects":{"karma":3,"qi":6}},{"label":"说明餐袋不能拆，交给他自行处理","result":"客人理解地点头，接过完整的餐。你守住了配送的边界，也没有嘲笑那盏灯。","effects":{"rep":2,"insight":1}}]},
    {"id":"delivery-stone-lion","kind":"delivery","title":"石狮嘴里的糖纸","text":"门前石狮咬着一张糖纸，眼角的裂纹泛着暗光。屋里的人说，不知是哪位小孩把它当作了垃圾桶。","choices":[{"label":"取下糖纸，放进垃圾袋","result":"裂纹里的暗光渐渐平息。石狮没有动，你却感到一股很轻的暖意掠过手背。","effects":{"karma":2,"qi":8}},{"label":"用灵力探一探裂纹","result":"裂纹连着一段残缺的门阵，只是沾了杂物。你辨认清楚便收手，没有贸然重塑石像。","effects":{"mana":-7,"insight":1,"qi":12}},{"label":"提醒住户找人清理修护","result":"对方记下石像的情况，向你道谢。你没有擅动不懂的旧物，仍尽到了提醒的责任。","effects":{"rep":2,"karma":1}}]},
    {"id":"delivery-shared-dream","kind":"delivery","title":"梦里见过的骑手","text":"客人一见你就说，昨晚梦里也是你把饭送来。区别只在于梦中的城市没有桥，所有人都隔着水等待。","choices":[{"label":"请他描述梦里最后一盏灯","result":"他记得那盏灯照着一碗热汤。听到这里，你体内的灵息与窗外的灯火轻轻呼应。","effects":{"qi":10,"insight":1},"duration":4},{"label":"告诉他今天的饭已经到了","result":"他低头看见完整的餐袋，笑着承认现实更好一点。梦里的水声也像在此刻退远。","effects":{"karma":3,"rep":1}},{"label":"不下定论，正常核对订单","result":"你确认人、地址和餐品都没有错。梦留给做梦的人，今天的交付则清楚落定。","effects":{"rep":2,"qi":4}}]},
    {"id":"delivery-lantern-stitch","kind":"delivery","title":"缝补灯笼的人","text":"收餐人正用细线补一只旧灯笼。针每穿过一次，破口便闪过一点光，像有许多细小的归途等着缝合。","choices":[{"label":"帮他托住灯笼的骨架","result":"你们按他的步子一针针补好破口。最后的光没有更耀眼，却不再从裂口里漏走。","effects":{"stamina":-4,"karma":2,"qi":9},"duration":6},{"label":"用灵力照清最后一处针脚","result":"微弱的灵光让他看清线头，很快收了针。你发现细致比强大的力量更适合这件事。","effects":{"mana":-6,"insight":1,"qi":10}},{"label":"先请他把针放下吃饭","result":"灯笼被稳稳挂起，餐盒摆到面前。那些需要修补的光，暂时也允许人休息。","effects":{"karma":3,"qi":5}}]},
    {"id":"delivery-city-answer","kind":"delivery","title":"系统没有给出评价","text":"收餐人只说了一声谢谢，系统却迟迟没有弹出惯常的评语。你望着安静的屏幕，第一次不确定该等什么。","choices":[{"label":"收起手机，回应那声谢谢","result":"你向客人道别，不再等屏幕替这件事命名。一缕灵息安静归入丹田，没有附带指令。","effects":{"karma":2,"qi":10}},{"label":"检查订单是否确实完成","result":"签收信息没有遗漏，你确认后收好手机。系统的沉默没有影响你认真完成自己的工作。","effects":{"rep":3,"insight":1}},{"label":"问自己为什么仍愿意送这一单","result":"答案不是一句宏大的宣言，只是眼前的人还没吃饭。这个念头让你在原地站得更稳了一点。","effects":{"qi":8,"stamina":3},"duration":3}]}
  );
  G.NPCS = [
    { id: 'lin', name: '林晚', place: 'clinic', role: '夜班医生', color: '#d29a7c', bio: '她总在缝合别人的伤口，却从不提起自己失去的那个春天。', romantic: true,
      arc: [
        ['值班室的冷饭','林晚正对着已经凉透的便当发呆。「以前总有人提醒我按时吃饭。」',c('陪她把晚饭吃完','你们在安静的走廊里聊起小事。',{affinity:6,trust:2}),c('帮她整理值班记录','她第一次在凌晨之前完成了工作。',{affinity:4,trust:4}),c('留下一句：下次我送热的','她点了点头，把你的号码存了下来。',{affinity:5,trust:2})],
        ['那场没能赶上的春天','她说自己曾没能救回一个重要的人。从那以后，总想用更多的夜班偿还。',c('告诉她：不是每次告别都是你的错','她沉默很久，终于允许自己流泪。',{affinity:8,trust:5}),c('不急着安慰，只听她讲','灯光下的故事终于有人认真听完。',{affinity:6,trust:7}),c('陪她去看看病房里康复的人','她意识到，那些活下去的人也需要她活得好一些。',{affinity:7,trust:4})],
        ['义诊之前','林晚想在旧城办一场义诊，但缺少物资。她很少开口求人，这一次却望向了你。',c('拿出八十元支持义诊','她郑重记下每笔支出，也记下你的信任。',{money:-80,affinity:10,trust:5,karma:4}),c('捐出一枚回春丹','你把修行中得到的东西，交还给了人间。',{affinity:10,trust:5,karma:5},{itemCost:{heal:1}}),c('用自己的时间帮忙联系病人','你们并肩把义诊的名单一户户确认。',{affinity:8,trust:6},{duration:60})],
        ['明天一起吃早饭','收工时，她没有走向值班室，而是在门口等你。天色正一点点亮起来。',c('作为朋友，约好以后互相照顾','有些陪伴不需要换一个名字。',{affinity:8,trust:6},{path:'friend'}),c('认真告诉她：我想和你一起生活','她把手交给你。「那先从明天的早饭开始。」',{affinity:12,trust:6},{path:'romance',minTrust:12}),c('祝她向前走，自己也继续远行','你们把彼此留在了很温柔的位置。',{affinity:5,trust:4},{path:'friend'})]
      ] },
    { id: 'chen', name: '陈默', place: 'garage', role: '修车铺老板', color: '#b8b079', bio: '说话不多，扳手很稳。他把一辆旧车修了很多年，也把一个承诺守了很多年。', romantic: false,
      arc: [
        ['借你一把扳手','陈默看了看你的车。「这车还能跑。人呢？人也得修。」',c('请他讲讲保养的门道','他从最小的螺丝开始讲，眼睛终于有了光。',{affinity:6,trust:3}),c('请他喝一瓶汽水','两只汽水瓶在工具箱边碰了一下。',{money:-5,affinity:7,trust:2}),c('留下帮他收拾铺子','他没说谢谢，第二天却给你留了把椅子。',{stamina:-5,affinity:5,trust:4})],
        ['一辆从未卖出的旧车','角落的旧车属于一位再没回来的朋友。他说，总怕哪天朋友回来，认不出这家店。',c('告诉他：店在，你也在','他说，是啊，人得先在。',{affinity:8,trust:6}),c('帮旧车擦掉灰尘','你们没有说话，一起把车灯擦得很亮。',{stamina:-4,affinity:7,trust:6}),c('给旧车拍一张照片','他把照片贴在收银台后，没有再藏起来。',{affinity:6,trust:5})],
        ['骑手夜修点','陈默想把铺子的一角留给夜班骑手，免费提供工具和一张能坐下歇脚的凳子。',c('资助一套共用工具','第一晚就有人靠这套工具重新上路。',{money:-60,affinity:10,trust:6,karma:4}),c('下班后帮他做招牌','字写得不整齐，但每个路过的人都看得懂。',{stamina:-12,affinity:9,trust:6}),c('把消息告诉沿路的骑手','很快，铺子里有了此起彼伏的笑声。',{affinity:8,trust:5,rep:3})],
        ['灯亮到你收工','陈默把备用钥匙递过来。「太晚了就来坐会儿。别一个人硬扛。」',c('接过钥匙，说好互相照应','后来很多个雨夜，这盏灯都为你亮着。',{affinity:10,trust:8},{path:'friend'}),c('约定把夜修点一直办下去','你们成了这座城市夜路上的两盏灯。',{affinity:9,trust:8,karma:3},{path:'friend'}),c('认真道谢，替他也留一把钥匙','真正的朋友，不只是知道你去哪里，也知道你能回来。',{affinity:10,trust:7},{path:'friend'})]
      ] },
    { id: 'shen', name: '沈青禾', place: 'bookshop', role: '旧书店主', color: '#99bba5', bio: '她在旧书的空白页上写故事，假装每个故事都有一个已经确定的结尾。', romantic: true,
      arc: [
        ['旧书里的空白页','你发现一本书的末页被撕去了。沈青禾说：「结尾丢了，也不一定是坏事。」',c('问她会写下怎样的结尾','她第一次把自己的手稿推到你面前。',{affinity:6,trust:3}),c('选一本书，认真买下','她把一枚银杏叶夹进了书里。',{money:-12,affinity:7,trust:2}),c('讲一件今天配送时遇到的小事','她听着听着，提笔写下了第一句话。',{affinity:5,trust:4})],
        ['不敢寄出的手稿','出版社的地址写了又划。她说，害怕故事离开自己以后，被证明毫无价值。',c('读完，然后告诉她最打动你的地方','你没有空泛地夸赞，她也终于认真相信。',{affinity:8,trust:7}),c('陪她走到邮筒前','信落下去的声音很轻，肩上的重量却少了许多。',{affinity:8,trust:5}),c('告诉她：故事已经照亮过一个读者','那个读者就是你。',{affinity:7,trust:6})],
        ['给城市的一封长信','她想为夜行的人办一场小小的阅读会，书店却连足够的椅子都没有。',c('出钱租几把椅子','读者们坐下时，你看见她紧张地笑了。',{money:-50,affinity:10,trust:5}),c('帮忙搬来邻居的旧凳子','这场阅读会从借一把凳子开始，连接了整条街。',{stamina:-12,affinity:9,trust:6,karma:3}),c('当第一个朗读的人','你读得不算流利，但每句话都很真诚。',{affinity:9,trust:7})],
        ['故事还没有结尾','她把新书的扉页留给你。「接下来，写谁的故事呢？」',c('写两个永远有话可聊的朋友','你们约好，用一生交换还没读过的故事。',{affinity:9,trust:7},{path:'friend'}),c('写我们一起度过的余生','她笑着在页首写下了你们的名字。',{affinity:12,trust:6},{path:'romance',minTrust:12}),c('写这座城里所有平凡的人','她把第一章的标题改成了《人间一程》。',{affinity:8,trust:6,karma:3},{path:'friend'})]
      ] },
    { id: 'lu', name: '陆听雨', place: 'temple', role: '守阵散修', color: '#9baac9', bio: '曾以为修行就是不断告别。直到他看见，一个骑手每天都在返回。', romantic: false,
      arc: [
        ['山门不问出身','陆听雨望着你的外卖箱。「装过万家饭食，也算一件法器。」',c('请教入门心法','他说，先学会把一口气呼吸完整。',{affinity:6,trust:3,qi:10}),c('分给他一份热饭','他吃得很慢，像已经很久没有尝过盐味。',{money:-10,affinity:7,trust:3}),c('问山下的灯为什么能聚灵','他没有回答，但请你明晚再来。',{affinity:5,trust:4,insight:1})],
        ['守了三十年的阵','他以为封闭七情才能守住古阵，但阵纹已经越来越暗。',c('告诉他：也许阵需要的正是牵挂','他第一次低头看向山下。',{affinity:8,trust:7,qi:10}),c('与他一同检查阵眼','你在阵里听见了千百年前的家常话。',{mana:-10,affinity:7,trust:6,qi:18}),c('讲讲每天等你送饭的人','他听到了许多名字，阵纹亮了一瞬。',{affinity:8,trust:6,karma:2})],
        ['重新点亮的阵眼','修补需要灵力，也需要有人愿意让阵重新连接人间。',c('以自身灵力补阵','你没有变成更孤独的仙人，反而离城市更近了。',{mana:-25,affinity:10,trust:7,qi:30}),c('捐出两株青灵草','他把灵草埋在阵眼旁，等待它们慢慢生长。',{affinity:9,trust:6,qi:18},{itemCost:{herb:2}}),c('讲起沿途那些被守护的人','他终于明白自己守住的并非一堆石头。',{affinity:9,trust:6,karma:3})],
        ['道友，明日再见','山门重新打开。陆听雨收起写着断尘的旧匾，换上一张「欢迎回家」。',c('与他约定共同守护此城','你们不再是师与徒，而是走在同一条路上的道友。',{affinity:10,trust:8,qi:30},{path:'friend'}),c('请他把心法教给更多人','修行的门槛，从这一晚开始变矮了。',{affinity:9,trust:7,karma:4},{path:'friend'}),c('告诉他：我还会继续去更远的地方','他说，无论你走多远，山门都在。',{affinity:9,trust:8},{path:'friend'})]
      ] },
    { id: 'zhou', name: '周野', place: 'market', role: '夜班骑手', color: '#d0a15f', bio: '总说自己只是跑得快一点。真正遇到别人摔倒时，他却永远是第一个停下的人。', romantic: false,
      arc: [
        ['同一盏红灯','周野把头盔挂在车把上。「上次路边那事，多谢。夜班这行，大家都得互相看一眼。」',c('请他喝杯豆浆','你们站在路边喝完，谁也没有催谁。',{money:-5,affinity:7,trust:3}),c('交换常跑路线','几条容易堵的巷子，被你们画在同一张地图上。',{affinity:6,trust:4,rep:1}),c('问他伤好些没有','他嘴硬说没事，却把护膝重新系紧。',{affinity:5,trust:4})],
        ['被雨淋坏的旧手机','周野的旧手机屏幕裂得更厉害了。他说里面存着很多骑手互相提醒危险路段的聊天记录，舍不得换。',c('帮他备份重要记录','那些零散提醒被整理成一张更完整的夜路地图。',{affinity:8,trust:7,insight:1}),c('陪他去修手机','店员把资料完整导了出来，他明显松了口气。',{money:-18,affinity:8,trust:5}),c('把自己的路线笔记抄给他','他笑说：那我也欠你一份。',{affinity:7,trust:6})],
        ['夜路互助群','周野想做一个不看平台、不分队伍的骑手互助群：爆胎、迷路、临时缺绑带，谁近谁搭把手。',c('拿出四十元买公用急救包','第一天就有人用上了创可贴和雨披。',{money:-40,affinity:10,trust:6,karma:3}),c('帮忙整理常见求助地点','你们把修车铺、医馆和避雨点标了出来。',{affinity:9,trust:7,rep:2}),c('先拉进今晚遇见的骑手','群名最后定成了“都平安到家”。',{affinity:8,trust:6,karma:2})],
        ['下一单不比输赢','凌晨四点，你们同时接到两个方向相反的单。周野笑着伸拳：「比谁先回来？」',c('碰拳，说平安回来就算赢','后来这句话成了你们每次出发前的暗号。',{affinity:10,trust:8},{path:'friend'}),c('约好忙完一起吃早饭','输赢被一碗热面取消了。',{affinity:9,trust:8,stamina:5},{path:'friend'}),c('把互助群一直做下去','你们没有成为传奇，只让很多夜路少了一点孤单。',{affinity:9,trust:8,karma:3},{path:'friend'})]
      ] },
    { id: 'su', name: '苏砚', place: 'park', role: '河岸摄影师', color: '#8db6c9', bio: '她拍城市里不会被旅游手册收录的东西：凌晨的桥、收摊的人，以及偶尔出现在底片里的第二轮月亮。', romantic: true,
      arc: [
        ['底片上的陌生光','苏砚把那张双月照片洗出来。「你看，这条光是不是刚好沿着你每天跑的路线？」',c('和她一起对照地图','光线连成了一段残缺阵纹。',{affinity:6,trust:4,qi:8}),c('请她把照片送你一张','她在背面写了日期和地点。',{affinity:7,trust:3}),c('讲起你见过的怪事','她没有笑，只认真记下每一个细节。',{affinity:5,trust:5})],
        ['没有人的合影','她展示一卷旧底片：每张都是城市地标，却总在边角多出同一个模糊身影。那个人像是在替谁巡城。',c('陪她重走拍摄地点','最后一张照片里，模糊身影站在听雨观山门外。',{stamina:-8,affinity:8,trust:6,qi:10}),c('请沈青禾帮忙查旧照片','旧报纸上出现了相似的巡城制服。',{affinity:7,trust:6,insight:1}),c('告诉她别一个人追线索','她愣了一下，说下次会先发消息。',{affinity:8,trust:7})],
        ['给失踪的巡夜人拍一张新照片','苏砚猜测那道身影是护城阵留下的“记忆”。如果在阵眼重合处重新拍摄，也许能让那段记忆放下执念。',c('陪她守到凌晨三点','快门响起时，照片里的身影第一次转过身来。',{stamina:-10,affinity:10,trust:7,qi:18}),c('用灵力稳定阵纹','长曝光中，河岸的灯一盏盏连成线。',{mana:-15,affinity:9,trust:6,qi:22}),c('带一盏普通露营灯补光','最普通的光，反而让旧影变得清晰。',{affinity:9,trust:6,karma:3})],
        ['下一张拍什么','天快亮时，苏砚把相机递给你。「总拍城市，我也想留一张自己的照片。」',c('替她拍一张认真看镜头的照片','她第一次没有躲在取景器后面。',{affinity:9,trust:8},{path:'friend'}),c('说想和她一起出现在照片里','定时快门亮起时，她悄悄靠近了一点。',{affinity:12,trust:7},{path:'romance',minTrust:12}),c('拍下河面和刚亮的天','你们约好以后每年都来拍同一个清晨。',{affinity:8,trust:8,karma:2},{path:'friend'})]
      ] }
  ];
  const ALCHEMY_REALM_BY_TIER = G.ALCHEMY_REALM_BY_TIER;
  const materialNames = [
    '青灵草','凝露叶','云纹苔','清心藤','山泉藻','白芷灵根','紫苏芽','玉竹芯',
    '赤阳花','火绒芝','丹霞果','朱砂蕊','焰尾草','赤练藤','暖玉参',
    '炎心兰','月华芝','寒潭莲','霜纹叶','雪骨花','冰髓草','月桂枝',
    '银星苔','夜露果','地脉参','黄精根','山灵薯','厚土芝','石乳菌',
    '龙须根','岩心藤','土灵果','风行草','青羽叶','轻尘花','浮云蕊',
    '鹤影藤','翼灵果','风铃子','空蝉蜕','雷纹木','紫电花','惊雷子',
    '电光苔','霆心果','云雷藤','磁极砂','雷髓枝','星砂花','曜石蕊',
    '星辉草','天河藻','辰光果','星落藤','玉衡叶','玄曜芝','龙涎果',
    '凤血兰','麒麟参','玄龟苔','白泽叶','朱雀羽苔','青龙须','九转灵髓'
  ];
  G.ALCHEMY_MATERIALS = materialNames.map((name,index)=>{
    const tier=index<8?1:2+Math.floor((index-8)/7);
    return {id:index===0?'herb':`herb-${index+1}`,name,tier,realm:ALCHEMY_REALM_BY_TIER[tier],price:10+tier*11+(index%7)*3,cost:Math.min(12,1+tier),desc:`${tier}阶药材。药性会参与不同丹方的配伍与火候判定。`,glyph:name[0]};
  });
  G.PILL_TYPES = [
    {id:'heal',name:'回春丹',glyph:'春',shopCost:4,desc:'补益气血。',effect:t=>({health:30+t*10})},
    {id:'stamina',name:'清心散',glyph:'清',shopCost:4,desc:'调息解乏。',effect:t=>({stamina:25+t*10})},
    {id:'qi',name:'凝气丹',glyph:'凝',shopCost:5,desc:'凝聚修为。',effect:t=>({qi:25+t*10})},
    {id:'foundation',name:'破境丹',glyph:'境',shopCost:16,desc:'突破时服用，提高成功率。',breakBonus:t=>13+t*2},
    {id:'spiritpill',name:'回灵丹',glyph:'灵',desc:'恢复灵力。',effect:t=>({mana:35+t*20})},
    {id:'bodypill',name:'锻体丹',glyph:'体',desc:'同时补益气血与体力。',effect:t=>({health:15+t*10,stamina:15+t*10})},
    {id:'greatqi',name:'聚元丹',glyph:'元',desc:'大幅增长修为。',effect:t=>({qi:45+t*25})},
    {id:'marrowpill',name:'玉髓丹',glyph:'髓',desc:'温养筋骨，恢复气血与体力。',effect:t=>({health:30+t*15,stamina:20+t*12})},
    {id:'bloodpill',name:'血元丹',glyph:'血',desc:'侧重恢复气血。',effect:t=>({health:45+t*18})},
    {id:'vitalpill',name:'养元丹',glyph:'养',desc:'侧重恢复体力。',effect:t=>({stamina:40+t*16})},
    {id:'harmonypill',name:'三元丹',glyph:'三',desc:'同时恢复气血、体力与灵力。',effect:t=>({health:18+t*8,stamina:18+t*8,mana:18+t*8})},
    {id:'spiritqi',name:'灵元丹',glyph:'玄',desc:'兼顾灵力与修为。',effect:t=>({mana:20+t*10,qi:20+t*14})}
  ];
  G.PILL_ITEM_ID = (typeId,tier)=>tier===1?typeId:`${typeId}-${tier}`;
  G.PILL_ITEMS = G.PILL_TYPES.flatMap(type=>Array.from({length:9},(_,i)=>{
    const tier=i+1,effect=type.effect?.(tier);
    return {id:G.PILL_ITEM_ID(type.id,tier),name:`${tier}阶${type.name}`,type:'pill',pillType:type.id,tier,cost:tier===1&&type.shopCost?type.shopCost:0,shop:tier===1&&!!type.shopCost,desc:`${type.desc} 当前为${tier}阶成品。`,effect,glyph:type.glyph};
  }));
  G.ITEMS = [
    ...G.PILL_ITEMS,
    {id:'mana',name:'灵石',type:'pill',cost:3,desc:'灵力恢复 30。',effect:{mana:30},glyph:'石'},
    ...G.ALCHEMY_MATERIALS.map(m=>({id:m.id,name:m.name,type:'material',cost:m.cost,shop:false,unlockRealm:m.realm,desc:m.desc,glyph:m.glyph})),
    {id:'fragment',name:'阵心碎玉',type:'material',cost:8,desc:'收集三枚，才有机会重新点亮护城阵。',glyph:'玉'},
    {id:'charm',name:'护身符',type:'material',cost:8,desc:'突破失败时自动消耗，免除气血损失。',glyph:'符'},
    {id:'breathing',name:'吐纳真诀',type:'technique',cost:18,desc:'永久学会：修炼所得修为提高 30%。',glyph:'诀',unique:true},
    {id:'lightstep',name:'轻身诀',type:'technique',cost:20,desc:'永久学会：步行速度提高 30%。',glyph:'步',unique:true},
    {id:'jade',name:'纳灵玉佩',type:'equipment',cost:25,desc:'自动装备，灵力上限 +30。',glyph:'佩',unique:true},
    {id:'robe',name:'青云法衣',type:'equipment',cost:24,desc:'自动装备，气血上限 +25。',glyph:'衣',unique:true}
  ];
  const cauldronNames = [
    ['青铜药鼎',1],['青石温炉',1],['黑陶药釜',1],
    ['赤铜温灵鼎',2],['白瓷凝露鼎',2],['灵木回风鼎',2],
    ['玄铁聚火鼎',3],['寒玉清心鼎',3],['云纹锁灵鼎',3],
    ['紫砂养神鼎',4],['赤金焰纹鼎',4],['青玉回元鼎',4],
    ['地脉玄炉',5],['风雷药鼎',5],['月桂灵鼎',5],
    ['星砂炼真鼎',6],['雷纹镇火鼎',6],['碧落归元鼎',6],
    ['九霞丹鼎',7],['玄黄地炉',7],
    ['天星乾坤鼎',8],['龙纹离火鼎',8],
    ['太虚九转鼎',9],['万象混元鼎',9]
  ];
  G.CAULDRONS = [
    {level:0,tier:0,name:'无药鼎',cost:0,success:0,extra:0,quality:0,realm:0,desc:'需要先在长乐集购买药鼎，才能开始炼药。'},
    ...cauldronNames.map(([name,tier],index)=>{
      const variant=index%3;
      return {level:index+1,tier,name,cost:100+index*75+tier*60,success:.015*(tier-1)+variant*.012,extra:.025*tier+(2-variant)*.012,quality:.018*tier+variant*.01,realm:ALCHEMY_REALM_BY_TIER[tier],desc:`${tier}阶药鼎。成丹稳定、成色与额外产出各有侧重。`};
    })
  ];
  G.LEGACY_CAULDRON_MAP = Object.freeze({0:0,1:1,2:4,3:7});
  G.ALCHEMY_RANKS = [
    {name:'药童',need:0,tier:1},{name:'识药',need:4,tier:2},{name:'掌火',need:10,tier:3},
    {name:'炼药师',need:20,tier:4},{name:'丹师',need:40,tier:5},{name:'丹匠',need:70,tier:6},
    {name:'丹宗',need:110,tier:7},{name:'丹尊',need:170,tier:8},{name:'丹道宗师',need:250,tier:9}
  ];
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
  const recipeRoutes = ['草木方','清露方','赤阳方','月华方','地脉方','风行方','雷纹方','星辉方','九转方'];
  const recipeRealm = [0,0,1,1,2,2,3,4,5];
  G.ALCHEMY_RECIPES = G.PILL_TYPES.flatMap((pill,pillIndex)=>recipeRoutes.map((route,routeIndex)=>{
    const complexity=routeIndex+1,maxMaterialTier=Math.min(9,complexity+1);
    const pool=G.ALCHEMY_MATERIALS.filter(m=>m.tier<=maxMaterialTier);
    const materialCount=Math.min(5,1+Math.ceil(complexity/2)),materials={};
    for(let j=0;j<materialCount;j++){
      const material=pool[(pillIndex*5+routeIndex*7+j*11)%pool.length];
      materials[material.id]=(materials[material.id]||0)+1+(complexity>=7&&j===0?1:0);
    }
    const channel=routeIndex%3,step=Math.floor(routeIndex/3);
    const acquisition=channel===0?{type:'shop'}:channel===1
      ? {type:'story',...G.FORMULA_STORY_SOURCES[step*2+Math.floor(pillIndex/6)]}
      : {type:'bond',npc:Object.keys(G.FORMULA_NPC_PRODUCTS).find(id=>G.FORMULA_NPC_PRODUCTS[id].includes(pill.id)),...G.FORMULA_BOND_MILESTONES[step]};
    return {
      acquisition,
      id:routeIndex===0?pill.id:`${pill.id}-formula-${routeIndex+1}`,
      name:`${pill.name}·${route}`,product:pill.id,route,complexity,
      materials,mana:6+complexity*3+Math.floor(pillIndex/3)*2,duration:15+complexity*3+(pillIndex%4)*2,
      base:Math.max(.42,.82-complexity*.035-(pillIndex%3)*.015),
      need:(complexity-1)*25+pillIndex*4,
      realm:Math.max(recipeRealm[routeIndex],Math.floor(pillIndex/4)-1,0),
      minCauldronTier:complexity,
      price:28+complexity*24+pillIndex*7,
      desc:`${route}，用于炼制${pill.name}。丹方只规定配伍与火候，最终丹药阶数由药鼎与炼药师水平决定。`
    };
  }));
  G.QUESTS = [
    {id:'q1',title:'第一份人间烟火',desc:'完成 1 单配送',delivery:1,realm:0,reward:{coins:5,qi:15},story:'系统不是凭空赐予力量。它把你送达的每一份善意，折成可以带走的光。'},
    {id:'q2',title:'万家灯火',desc:'完成 5 单配送',delivery:5,realm:0,reward:{coins:10,qi:30},story:'旧城深处的阵纹正在熄灭。你的订单，把原本断开的街巷重新连在一起。'},
    {id:'q3',title:'凡人亦能问道',desc:'完成 12 单，并进入炼气',delivery:12,realm:1,reward:{coins:15,fragments:1,qi:50},story:'系统终于说出自己的来历：它不是天外来客，而是这座城被遗忘的护城阵。'},
    {id:'q4',title:'送达的不只是饭',desc:'完成 25 单，并进入筑基',delivery:25,realm:2,reward:{coins:25,fragments:1,qi:80},story:'阵眼开始苏醒。要继续修复它，需要的不只是灵力，还有你愿意留下的理由。'},
    {id:'q5',title:'把归途还给人间',desc:'完成 40 单，并进入金丹',delivery:40,realm:3,reward:{coins:40,fragments:1,qi:120},story:'三枚碎玉在掌心合拢。山门之外出现一条通往更高处的路，而城里的灯仍为你亮着。'},
    {id:'q6',title:'夜路有人同行',desc:'完成 55 单，并进入金丹',delivery:55,realm:3,reward:{coins:45,qi:150,karma:2},story:'越来越多的人记住你的名字。不是因为你跑得最快，而是因为有人需要时，你经常恰好在那里。'},
    {id:'q7',title:'城脉重新呼吸',desc:'完成 75 单，并进入元婴',delivery:75,realm:4,reward:{coins:55,fragments:1,qi:220},story:'断裂的阵纹不再只靠旧法维持。医院、书店、修车铺、夜校和无数扇窗，正在成为新的阵眼。'},
    {id:'q8',title:'一百次准时抵达',desc:'完成 100 单，并进入元婴',delivery:100,realm:4,reward:{coins:80,qi:320,rep:5},story:'第一百次门铃响起时，系统没有弹出新的指令，只写下一句：你已经知道为什么要继续走了。'}
  ];
  G.ENDINGS = {
    guardian: { title:'万家灯火', text:'你把阵心交还给这座城。从此山川有灵，街巷有光。人们只知道有一个骑手，总能在饭凉之前赶到。你没有离开人间，也没有止步于凡人。' },
    ascend: { title:'携人间而飞升', text:'天门打开时，你没有斩断尘缘。外卖箱里装着旧书、修车铺的钥匙和一封约好回信的信。你向更远的天地走去，也把回家的路记得很清楚。' },
    ordinary: { title:'好好生活，也是一种修行', text:'你没有交出自己的名字去换一个仙号。小屋添了一张桌子，窗前种起青灵草。早饭会有人认真吃，故事会有新的下一页，而你终于懂得：平凡从来不是失败。' },
    bond: { title:'有人与你共黄昏', text:'你把最后一趟路留给一个重要的人。此后仙途漫长，却不再只有一个人的脚步。你们仍有分歧、疲惫和柴米油盐，也仍愿意每天选择彼此。' },
    friendship: { title:'此城皆故人', text:'修车铺、书店、医馆和山门的灯在同一晚亮起。没有人谈论永别。朋友们只是约好：忙完这一阵，聚一顿。你知道，这个约定总会实现。' }
  };
})(globalThis);
