/* 原创重建内容。这里集中维护地图、数值配置和剧情，不依赖外部素材。 */
(function (root) {
  'use strict';
  const G = root.NightCourier = root.NightCourier || {};
  G.VERSION = 3;
  G.TITLE = '外卖修仙录';
  G.GRID_X = [130, 370, 610, 850, 1090, 1330, 1570];
  G.GRID_Y = [120, 300, 480, 660, 840, 1020];
  G.WORLD = { width: 1700, height: 1140, metersPerUnit: 3.5 };
  const services = [
    ['home', '青藤小屋', 2, 3, 'home', '一间租来的小屋，也是你最初的洞府。'],
    ['garage', '阿默修车铺', 0, 4, 'garage', '充电、修理，以及一位总在等你收工的朋友。'],
    ['clinic', '回春医馆', 3, 1, 'clinic', '白灯下有人医人，灯灭后有人医心。'],
    ['bookshop', '旧雨书店', 1, 1, 'book', '一册失去封皮的旧书，记着这座城的秘密。'],
    ['temple', '听雨观', 5, 0, 'temple', '城北的灵气在入夜后苏醒，修炼收益提高。'],
    ['park', '月渡公园', 5, 3, 'leaf', '江风掠过古井。探索可能带来灵草与奇遇。'],
    ['market', '长乐集', 1, 5, 'market', '买些热饭和灵草，继续奔忙的人间生活。']
  ];
  G.PLACES = services.map(([id, name, c, r, kind, desc]) => ({ id, name, x: G.GRID_X[c], y: G.GRID_Y[r], kind, desc, permanent: true }));
  const names = ['杏花里','松风公寓','青石弄','栖云宿舍','银杏医院','春山大厦','望江台','榆树巷','长风客栈','新桥社区','向阳小学','水岸茶室','海棠新村','北辰写字楼','龙井作坊','听潮楼','流萤公寓','南山工作室','西城花房','观星台','锦鲤小区','青禾餐厅','落霞仓库','雨巷照相馆','望舒公馆','拾光面馆','归鹤庭','白鹭驿','雁回小筑','木棉楼','竹影小院','鸣蝉里','青瓷馆','小满街','临江书院'];
  let n = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const x = G.GRID_X[c], y = G.GRID_Y[r];
    if (!G.PLACES.some(p => p.x === x && p.y === y)) G.PLACES.push({ id: `stop-${n}`, name: names[n++], x, y, kind: 'delivery', permanent: false });
  }
  G.place = id => G.PLACES.find(p => p.id === id);
  G.REALMS = [
    { name: '凡人', need: 80 }, { name: '炼气', need: 180 }, { name: '筑基', need: 380 },
    { name: '金丹', need: 700 }, { name: '元婴', need: 1100 }, { name: '化神', need: 0 }
  ];
  G.WEATHER = [ { id: 'clear', name: '晴', speed: 1 }, { id: 'cloudy', name: '多云', speed: 1 }, { id: 'rain', name: '细雨', speed: .82 }, { id: 'mist', name: '薄雾', speed: .9 } ];
  G.ORDER_TYPES = [
    { title: '一碗热汤', desc: '不要按门铃。放在门边，轻敲两下即可。', tip: 0, condition: 'ordinary' },
    { title: '晚班的便当', desc: '收餐人还在值班，请交到本人手中。', tip: 5, condition: 'ordinary' },
    { title: '少糖桂花糕', desc: '盒子怕挤。慢一点没关系，保持完整。', tip: 8, condition: 'careful' },
    { title: '两人份晚餐', desc: '一份不要葱。备注里写着：今天很重要。', tip: 6, condition: 'ordinary' },
    { title: '急送药膳', desc: '客人正在等药膳，请在时限内送达。', tip: 14, condition: 'urgent' },
    { title: '不署名的清粥', desc: '收餐人只留了一句：谢谢你还记得。', tip: 4, condition: 'ordinary' },
    { title: '夜行人的宵夜', desc: '灯亮着就有人。若灯灭了，敲三下窗。', tip: 12, condition: 'night' },
    { title: '一份人间烟火', desc: '订单备注是一枚你从未见过的篆字。', tip: 16, condition: 'mystic' }
  ];
  // 效果全部由规则引擎结算，剧情文本不执行代码。
  const c = (label, result, effects = {}, extra = {}) => ({ label, result, effects, ...extra });
  G.EVENTS = [
    { id: 'first-order', kind: 'delivery', title: '第一声「叮」', text: '你把热汤递过去，陌生老人却看着你身后发笑。「原来这一回，是送饭的人。」手机上浮起一行不属于任何软件的小字：万家灯火系统，已绑定。', choices: [c('先问一句：您吃得惯吗？','老人接过汤，你第一次看见一缕金光落入掌心。',{karma:2,qi:8}),c('追问系统的来历','老人只说：人间每一份郑重，都能成为你的修行。',{insight:1,qi:4}),c('收好手机，继续做完这一单','你决定先把眼前的事做好。系统似乎对此很满意。',{rep:2,money:8})] },
    { id: 'rain', kind: 'delivery', title: '雨落在餐盒之前', text: '拐过路口，雨点忽然变密。一个没带伞的孩子站在屋檐外，而你只有一件备用雨披。', choices: [c('把雨披留给孩子','餐盒护在怀里，你的肩背湿了一片。',{karma:3,stamina:-6,rep:1}),c('请便利店帮忙照看孩子','店员答应了。你道谢后重新上路。',{karma:1,rep:1}),c('买把伞交给孩子','孩子认真记下了你的名字。',{money:-12,karma:4,qi:5})] },
    { id: 'cat', kind: 'delivery', title: '不肯让路的橘猫', text: '一只橘猫坐在楼道口，爪下压着半枚温热的青色玉片。它抬头看你，像是在等一个选择。', choices: [c('买一根猫条，和它交换','橘猫叼走猫条，留下玉片和一声很轻的「喵」。',{money:-6,qi:12}),c('蹲下陪它一会儿','它主动让开。你忽然觉得，这条楼道并不陌生。',{stamina:4,karma:1}),c('绕开它，不打扰','你准时把餐送到，猫也守住了自己的宝贝。',{rep:1})] },
    { id: 'stairs', kind: 'delivery', title: '停电的旧楼', text: '电梯停了。客人发来消息：腿脚不便，能不能送到门口？楼道尽头还有个邻居愿意帮忙。', choices: [c('自己提着餐上楼','你数着台阶调整呼吸，体内灵气也跟着顺了一些。',{stamina:-9,qi:10,rep:3}),c('请邻居帮忙，电话确认收餐','邻里之间的一声招呼，比电梯更快抵达。',{rep:1,karma:1}),c('多带一袋楼下的药','老人连声道谢，还把自制点心塞给了你。',{money:-8,stamina:5,karma:3})] },
    { id: 'seal', kind: 'delivery', title: '餐袋里的封印', text: '封口贴浮出细密金线。系统提示：客人买的不只是晚餐，也是封印里唯一还热着的东西。', choices: [c('保持封印，照常交付','门后的人隔着缝隙向你行礼。',{qi:18,rep:2}),c('以灵力感应，不拆封','你认出一段古老的护城阵纹。',{mana:-10,insight:1,qi:12}),c('提醒客人当面检查','对方郑重签收，你得到了一笔额外酬谢。',{money:20,karma:1})] },
    { id: 'rival', kind: 'delivery', title: '同路人', text: '另一位骑手的车倒在路旁。他看着散落的餐袋，第一句话却是：你的单要紧。', choices: [c('帮他扶车、整理餐盒','他记住了你的工号。下一段路没那么孤单了。',{stamina:-5,karma:3,rep:2}),c('帮他联系维修','你没有耽误交付，也为他找到了帮手。',{money:-5,karma:2}),c('把自己的备用绑带给他','绑带不值多少钱，及时的援手却很珍贵。',{qi:5,karma:2})] },
    { id: 'wrong-door', kind: 'delivery', title: '门牌上的两个世界', text: '订单写着 404，门牌却在你眼前变成了「肆零肆」。门缝里飘出海水和檀香的气味。', choices: [c('先打电话确认','门牌恢复了正常，客人说自己只是点了海鲜粥。',{rep:2,insight:1}),c('轻敲三下，报上姓名','门后递来恰好的餐费和一点温润灵息。',{qi:14,money:10}),c('请客人到门口取餐','你守住了边界。系统记下：谨慎也是一种道心。',{karma:1,stamina:3})] },
    { id: 'birthday', kind: 'delivery', title: '没有蜡烛的生日', text: '屋里只有一张折叠桌。年轻人接过蛋糕时说，自己已经快忘了今天是什么日子。', choices: [c('认真说一句生日快乐','他愣了很久，终于笑起来。',{karma:3,qi:6}),c('送一瓶便利店的汽水','瓶盖碰了一下纸杯。小小的仪式也算数。',{money:-5,rep:2,karma:2}),c('把蛋糕摆稳，留下祝福','门关上之前，你听见他说：明年会好一点。',{rep:1,stamina:3})] },
    { id: 'bad-review', kind: 'delivery', title: '迟来的解释', text: '客人责怪汤洒了一半。你看见封袋内侧的油迹，像是在出餐时就已经留下。', choices: [c('先安抚，再协助退款','对方听完解释，撤回了气话。',{rep:3,stamina:-4}),c('自己补一份热汤','这笔支出并不轻松，但你不愿让人空着肚子。',{money:-18,karma:3,rep:2}),c('拍照留证，按流程处理','有些责任，认真说明就好。',{rep:1,insight:1})] },
    { id: 'letter', kind: 'delivery', title: '一封没有寄出的信', text: '收餐人托你把信交到楼下信箱。他说自己的孩子在很远的地方，但信封上竟没有邮票。', choices: [c('补上邮票，帮他寄出','你没有读信。有些牵挂只需要有人送到。',{money:-4,karma:3,qi:5}),c('提醒他缺少邮票','他笑着拍了拍额头，回屋找出一张旧邮票。',{karma:1,rep:1}),c('询问是否需要帮忙联系家人','一通电话后，那间屋子热闹了许多。',{stamina:-3,karma:4})] },
    { id: 'night-guest', kind: 'delivery', title: '只收人间饭的客人', text: '客人的影子比本人迟了一拍。他不肯解释，只问：这座城如今，还有多少家店亮着灯？', choices: [c('告诉他你今天经过的每一盏灯','他听得很认真，像一个终于找到故乡的人。',{qi:16,karma:2}),c('请他尝尝还热的饭','他低头吃了第一口，影子渐渐和身体重合。',{rep:2,qi:10}),c('询问城里的旧事','你听到了护城阵曾经碎裂的那一夜。',{insight:1,qi:8})] },
    { id: 'coin', kind: 'delivery', title: '找不开的一枚铜钱', text: '老人坚持用一枚铜钱付小费。系统扫描了三次，最后只显示：此物承载一段善意。', choices: [c('收下铜钱，好好道谢','铜钱化作一缕灵息，落在系统边缘。',{coins:2,qi:5}),c('把它留给老人作纪念','老人说，那就把谢意记在心里。',{karma:3}),c('用自己的零钱换下它','旧物易主，善意并没有减少。',{money:-5,qi:12,karma:1})] },
    { id: 'river', kind: 'explore', title: '江底的第二轮月亮', text: '水面映着月亮，水底却还有一轮。你看见三道断裂的阵纹，正随着潮汐缓缓明灭。', choices: [c('坐在岸边参悟','一段残缺心法在脑海中连了起来。',{qi:22,stamina:-6}),c('用灵力探查阵纹','你找到了一块可以承载阵力的碎玉。',{mana:-15,fragments:1}),c('记下位置，暂不惊动','知道何时退后，也是修行的一部分。',{insight:1,karma:1})] },
    { id: 'herb', kind: 'explore', title: '石缝里的青灵草', text: '一簇灵草生在废弃台阶上。旁边蹲着采药人，篮子里只有几片普通野菜。', choices: [c('与采药人平分','他教你辨认灵草的根脉，临别又多分给你一株。',{herb:2,karma:2}),c('用零钱买下','这是一笔双方都满意的买卖。',{money:-15,herb:3}),c('只摘成熟的一株','你把幼芽留给了明年。',{herb:1,qi:6})] },
    { id: 'sword', kind: 'explore', title: '锈剑不会说话', text: '古井旁有把断剑。你握住剑柄的一瞬，听到许多人重复着同一句话：替我们看看。', choices: [c('向断剑描述如今的城市','残留的执念安静下来，一道阵纹融入你的识海。',{qi:25,karma:3}),c('用灵力修复断口','断剑化为青光，留下温热的碎玉。',{mana:-18,fragments:1}),c('把它安放在干燥的石台上','你没有带走它，只让风雨暂时停在身后。',{karma:2,stamina:5})] },
    { id: 'bottleneck', kind: 'cultivation', title: '心魔借了一张账单', text: '闭上眼后，未付的房租、超时的订单与所有后悔轮番出现。心魔没有獠牙，只是很像疲惫的你。', choices: [c('承认自己会累','呼吸渐渐平稳。你不必时时刻刻证明自己。',{stamina:10,qi:12}),c('以道心直面杂念','念头起落，你坐在其中，没有离开。',{mana:-8,qi:24}),c('停下修炼，喝杯热水','今夜没有多走一步，也没有退回原点。',{health:8,stamina:8})] },
    { id: 'rooftop', kind: 'cultivation', title: '屋顶上的灯海', text: '灵气沿着天际缓缓流动。你忽然察觉，它并非来自群山，而是来自每一扇仍有人等候的窗。', choices: [c('把灯火引入丹田','人间烟火在你的经脉里汇成细流。',{qi:20,karma:1}),c('记录这一刻的感悟','你给笔记取名：《人间有灵》。',{insight:1,qi:8}),c('替还在工作的人留一盏灯','暖光没有照到很远，但它一直亮着。',{money:-3,karma:3,qi:10})] }
  ];
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
      ] }
  ];
  G.ITEMS = [
    {id:'qi',name:'凝气丹',type:'pill',cost:5,desc:'服用后修为 +35。',effect:{qi:35},glyph:'丹'},
    {id:'heal',name:'回春丹',type:'pill',cost:4,desc:'气血恢复 40。',effect:{health:40},glyph:'药'},
    {id:'stamina',name:'清心散',type:'pill',cost:4,desc:'体力恢复 35。',effect:{stamina:35},glyph:'散'},
    {id:'mana',name:'灵石',type:'pill',cost:3,desc:'灵力恢复 30。',effect:{mana:30},glyph:'石'},
    {id:'herb',name:'青灵草',type:'material',cost:2,desc:'炼丹材料，也可用来帮助朋友。',glyph:'草'},
    {id:'fragment',name:'阵心碎玉',type:'material',cost:8,desc:'收集三枚，才有机会重新点亮护城阵。',glyph:'玉'},
    {id:'charm',name:'护身符',type:'material',cost:8,desc:'突破失败时自动消耗，免除气血损失。',glyph:'符'},
    {id:'foundation',name:'破境丹',type:'material',cost:16,desc:'突破时可选择消耗，成功率 +15%。',glyph:'境'},
    {id:'breathing',name:'吐纳真诀',type:'technique',cost:18,desc:'永久学会：修炼所得修为提高 30%。',glyph:'诀',unique:true},
    {id:'lightstep',name:'轻身诀',type:'technique',cost:20,desc:'永久学会：步行速度提高 30%。',glyph:'步',unique:true},
    {id:'jade',name:'纳灵玉佩',type:'equipment',cost:25,desc:'自动装备，灵力上限 +30。',glyph:'佩',unique:true},
    {id:'robe',name:'青云法衣',type:'equipment',cost:24,desc:'自动装备，气血上限 +25。',glyph:'衣',unique:true}
  ];
  G.QUESTS = [
    {id:'q1',title:'第一份人间烟火',desc:'完成 1 单配送',delivery:1,realm:0,reward:{coins:5,qi:15},story:'系统不是凭空赐予力量。它把你送达的每一份善意，折成可以带走的光。'},
    {id:'q2',title:'万家灯火',desc:'完成 5 单配送',delivery:5,realm:0,reward:{coins:10,qi:30},story:'旧城深处的阵纹正在熄灭。你的订单，把原本断开的街巷重新连在一起。'},
    {id:'q3',title:'凡人亦能问道',desc:'完成 12 单，并进入炼气',delivery:12,realm:1,reward:{coins:15,fragments:1,qi:50},story:'系统终于说出自己的来历：它不是天外来客，而是这座城被遗忘的护城阵。'},
    {id:'q4',title:'送达的不只是饭',desc:'完成 25 单，并进入筑基',delivery:25,realm:2,reward:{coins:25,fragments:1,qi:80},story:'阵眼开始苏醒。要继续修复它，需要的不只是灵力，还有你愿意留下的理由。'},
    {id:'q5',title:'把归途还给人间',desc:'完成 40 单，并进入金丹',delivery:40,realm:3,reward:{coins:40,fragments:1,qi:120},story:'三枚碎玉在掌心合拢。山门之外出现一条通往更高处的路，而城里的灯仍为你亮着。'}
  ];
  G.ENDINGS = {
    guardian: { title:'万家灯火', text:'你把阵心交还给这座城。从此山川有灵，街巷有光。人们只知道有一个骑手，总能在饭凉之前赶到。你没有离开人间，也没有止步于凡人。' },
    ascend: { title:'携人间而飞升', text:'天门打开时，你没有斩断尘缘。外卖箱里装着旧书、修车铺的钥匙和一封约好回信的信。你向更远的天地走去，也把回家的路记得很清楚。' },
    ordinary: { title:'好好生活，也是一种修行', text:'你没有交出自己的名字去换一个仙号。小屋添了一张桌子，窗前种起青灵草。早饭会有人认真吃，故事会有新的下一页，而你终于懂得：平凡从来不是失败。' },
    bond: { title:'有人与你共黄昏', text:'你把最后一趟路留给一个重要的人。此后仙途漫长，却不再只有一个人的脚步。你们仍有分歧、疲惫和柴米油盐，也仍愿意每天选择彼此。' },
    friendship: { title:'此城皆故人', text:'修车铺、书店、医馆和山门的灯在同一晚亮起。没有人谈论永别。朋友们只是约好：忙完这一阵，聚一顿。你知道，这个约定总会实现。' }
  };
})(globalThis);
