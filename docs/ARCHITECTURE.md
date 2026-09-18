# 架构与扩展说明

## 模块关系

程序使用原生 JavaScript IIFE，各模块向 `globalThis.NightCourier` 注册数据和函数。浏览器加载顺序：`data → engine → storage → progression → map → app`。服务端只导入 data/engine 做共享内容校验，不访问 DOM 或浏览器存储。

```text
玩家点击 / 地图交互
      ↓
app.js 组装行动参数
      ↓
engine.perform(旧状态, 行动, 参数)
      ├─ 拒绝：旧状态不变 + 中文原因
      └─ 成功：新状态
               ↓
          storage.upsert
               ↓
          顶栏 / 地图 / 面板 / 右下日志

可生成的待选事件 → 本机 /api/story → 自配模型服务
                    ↓
             JSON 白名单与限幅
                    ↓
           检查事件/存档/请求序号
                    ↓
           替换事件内容，不直接结算
```

## 规则引擎与事务边界

`engine.js` 的基础 `G.perform(original, action, payload)` 先复制状态；`must()` 不通过时返回原状态，避免时间已扣而电量不足等部分写入。`progression.js` 在不改动基础结算公式的前提下包裹 `G.perform`，只负责系统解锁校验与“行动成功后是否触发关键主线”的判定。界面不负责改余额、位置或境界，只提交行动。

支持的行动包括旅行、配送、选择事件、修炼、突破、炼丹、探索、拜访、歇息、睡眠、搬家、交通方式切换、充电、修车、升级、兑换、服用物品、签到、领取委托和选择/继续结局。`gameOver` 一旦存在，规则层拒绝后续行动。精确名称与参数以 `engine.js` 的 switch 为准。

凡是移动均使用 `move()`，其先调用 `travelPlan()` 和 `travelBlock()`，校验后才扣除体力/电池、增加行程、推进时间和改变位置。一般世界行动结束后刷新订单；兑换等系统事务不制造新的免费刷单回合。

## 地图与时间

42 个节点对应 7×6 正交路网；三座桥连接江两岸。Dijkstra 求沿路最短路径。每地图单位对应 3.5 米，距离换算为公里后计算 `ceil(km / speed × 60)`，相同地点出行为 0 分钟。

基础骑行速度 22km/h，每个速度升级 +4km/h；车况低于20时乘0.7。步行速度由身法与轻身术影响。天气的速度倍率应用于两者。

出行消耗和活动本身消耗分开：睡觉是返回当前住处的行程加480分钟，NPC拜访是行程加20分钟；原地修炼有其固定时长；充电可在任意地点直接进行，固定30分钟且不附加行程；维修与升级仍要求位于修车铺；系统兑换是0分钟。搬家也通过统一 `move()` 计算道路距离、体力和电量。每跨入第 7、14、21… 日，按当前住处扣除完整周租；现金不足时写入 `gameOver` 并立即结束本局。日志时间由游戏分钟数生成，不用浏览器墙钟推进游戏。

`seed` 是存档的一部分。游戏事件和奖励使用状态内 xorshift 随机数；同种子、同动作得到相同分支演化，便于回归测试。ID与创建时间不属于随机事件种子。

## 配送与事件

订单在地图上展示预计行程和资源需求。确认后校验ID/时限/特殊要求，再移动；遇到事件时创建 `pending`，其中包含 `delivery` 票据，立即交给应用保存。

`choose` 要求传入正确事件ID和合法选项索引。选择不足以支付的成本会失败、状态不变；正确选择应用效果、推进事件额外耗时，再结算票据并清除 `pending`。事件延误可以使订单超时，导致现金降为70%、外卖币约减半（至少1币）与口碑变化，具体公式见代码。

处理事件期间禁止其他世界行动。重复旧事件ID、旧订单ID或多次点击不能重发奖励。每个关键人物章节都至少有一个零金钱/灵力/道具成本的选项，避免把玩家困在强制对话里。

人物采用发现制。`bonds[npc].met` 默认是 `false`：配送票据带有该地点 NPC 时，订单结算会将其设为已结识；经典随机事件可用 `encounterNpc` 在事件触发时解锁角色。应用层只渲染已结识人物，`visit` 在规则层也会拒绝未结识角色，不能靠直接构造按钮绕过。旧存档迁移时，已有好感、信任、章节进度或关系路线会推断为已结识。

关键成长主线由 `progression.js` 管理。它定义凡人奔忙、灯火初鸣、城市第二面、夜路同行、阵眼苏醒、系统质疑、系统真相等阶段，并在满足配送数、境界、已结识人物数后注入固定 `pending` 事件。关键事件使用 `kind: story`、`source: classic`、`aiStatus: skip`，不会进入普通随机事件池，也不会被 AI 替换。对应 `flags.story*` 会随存档恢复，避免重复触发。

商城开放同样由 `progression.js` 约束：基础补给为凡人阶段，高阶材料与心法要求炼气，高阶法器要求筑基。规则层会拒绝未解锁兑换，UI 只负责显示锁定状态。

## 存档结构

主要字段：

```js
{
  schemaVersion: 3,
  id, name, mode, createdAt, updatedAt, seed,
  turn, minutes, position, residenceId, gameOver, transport, weather,
  player: { money, coins, health, stamina, mana, qi, realm,
            insight, constitution, agility, luck, karma, rep },
  vehicle: { battery, durability, levels: { speed, battery, durability } },
  inventory, learned, equipment, stats,
  bonds: { /* 每人 met, affinity, trust, stage, path, lastTalkDay */ },
  daily, claimed, unlockedEndings, ending,
  flags, recentEvents, pending, orders, logs, lastRoute
}
```

存储键：`night-courier:saves:v4`；旧键 `night-courier:saves:v3` 在首次读取时迁移；上一写入备份键：`night-courier:saves:backup`。列表最多12份；每份日志最多180条，防止无界增长。

`sanitizeSave()` 不把任意原始对象合并进状态，按字段白名单重建，规范数值范围，并校验人物进度、住处、破产结束状态、事件模板及待结算票据。v1/v2/v3 只有识别到的重建字段迁移，不对未知原游戏做猜测。

导入解析最大2MB，整个批次先验证再写入；重新生成ID避免覆盖。主记录损坏时尝试读取上一写入备份，保留原损坏文本并提示，而非静默用空数组覆盖。写失败则设置dirty，后续返回菜单仍保留内存进度，直到导出或成功写入。

localStorage 的单项写入不等同数据库事务。多标签页用 `storage` 事件提示冲突并暂停陈旧页面的行动，不能视作多人并发锁或服务端安全保障。

## AI 代理与信任边界

服务端 `createApp(options)` 使用 Node 内置 HTTP；静态文件只服务明确列出的 public 文件，不能读取 .env 或源码。默认127.0.0.1，检查 Host 与来源，限制 JSON 请求大小16KB、上游响应128KB、每分钟12次、并发2次、上游超时15秒。

前端等待最长18秒，绑定存档ID、事件ID和请求序号；切存档、返回首页、做出选择会取消在途请求，迟到结果直接丢弃。没有配置/返回异常时保留经典事件并记录回退，不把存档模式改为 classic。

请求送出角色名、境界名称、时间、天气、地点、部分属性、事件素材和最近三条日志。姓名及日志视作不可信创作素材，不是系统指令。

返回值只接受三选项JSON，字段与取值白名单如下：

| 字段 | 允许整数范围 |
| --- | --- |
| money | -15 … 20 |
| coins | 0 … 2 |
| health/stamina/mana | -10 … 8 |
| qi | 0 … 20 |
| karma/rep | -2 … 3 / -2 … 2 |
| affinity/trust | 0 … 6 / 0 … 3，仅人物日常交谈 |

每选项最多4个效果，至少一个完全非负选项；文本长度有上限。可见文本会转义，不能注入HTML执行。不存在 eval / Function 执行 AI 文本，也不接受位置、境界、模式、道具所有权等任意写入。

这些限制约束模型输出与误操作，不阻止玩家改自己的本地存档。当前服务器没有用户认证，不能直接当公共商业AI代理使用。

## 扩展方式

新增事件：在 `data.js` 定义唯一ID、kind、title、text、三项 choices；至少一个无支付障碍选项。新增特殊资源效果要同时改 `effectBlock`、`effects`、存档白名单和测试，不能只改界面。

新增地点：地图与寻路共用网格，当前每地点必须位于合法节点。若扩大网格，`route()` 中边界与桥梁约束也要一起改，不能只画新建筑。

新增物品：修改 `ITEMS` 与引擎处理，同时核对去重购买、装备上限、存档清洗及导入迁移。新增境界会影响资源上限与突破要求，应加端到端可达性测试。

修改格式：提升 schemaVersion，保持显式迁移。先用典型待选配送事件、已升级车、AI模式和人物分支存档做往返测试。

修改源码后执行 `npm run check && npm test && npm run build`。不要只手改 dist；否则下次构建会覆盖修改。
