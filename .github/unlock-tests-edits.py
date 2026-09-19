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

patch('tests/browser-smoke.py','cfed58ced7e3b644e580d29d8e949342b87fb4904d0e22141b612c8e8677d021','5b1a4dac8f3a72a6f399c5b8e078edec78519957beb16c8ba2507d0914b948d6',[
(4283,4283,', unlock_gameplay=True'),
(4286,4286,r'''
    # Isolated pre-existing gameplay regressions explicitly open feature gates.
    # The progressive flow below opts out and starts from a genuine new save.
    edits = dict(edits)
    if unlock_gameplay:
        edits['unlockedFeatures'] = page.evaluate('NightCourier.FEATURE_UNLOCKS.map(f=>f.id)')

'''[1:-1]),
(4739,4739,r"""

def forged_button(page, attrs):
    page.evaluate('''attrs=>{const b=document.createElement('button');for(const [k,v] of Object.entries(attrs))b.dataset[k]=v;document.body.append(b);b.click();b.remove();}''', attrs)

def finish_ui_activity(page):
    if not current(page)['activity']:
        return
    if page.evaluate("window.__clock.reasons.has('manual')"):
        toggle(page)
    page.select_option('#time-speed', '10')
    minutes = page.evaluate('NightCourier.activityRemaining(window.__live)')
    pump(page, int(minutes * 100 + 80))

def choose_ui(page):
    index = page.evaluate('window.__live.pending.choices.findIndex(c=>!NightCourier.choiceBlock(window.__live,c))')
    assert index >= 0
    page.click(f'[data-act="choose"][data-index="{index}"]')
    finish_ui_activity(page)

def settle_ui(page):
    for _ in range(12):
        if not current(page)['pending']:
            return
        choose_ui(page)
    raise AssertionError('Event chain did not finish')

def nearest_ui_delivery(page):
    target = page.evaluate('''()=>{const G=NightCourier,s=window.__live;return [...s.orders].filter(o=>!G.travelBlock(s,G.travelPlan(s,o.target))).sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters)[0].target;}''')
    page.locator(f'.order-point[data-place="{target}"]').focus()
    page.keyboard.press('Enter')
    assert page.locator('[data-act="deliver"]').is_enabled()
    page.click('[data-act="deliver"]')
    finish_ui_activity(page)

def progressive_browser_checks(browser):
    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '渐进旅人')
        nav = lambda: page.locator('#game-nav [data-panel]').evaluate_all('(els)=>els.map(b=>b.dataset.panel)')
        initial = ['inventory', 'vehicle', 'rest', 'help']
        assert nav() == initial
        assert page.locator('.currency[data-panel="system"]').is_hidden()
        assert page.locator('.chapter-chip').evaluate('(e)=>e.tagName') == 'DIV'
        page.screenshot(path=str(OUT/f'progressive-start-{width}.png'))
        before = current(page)
        for attrs in [{'panel':'system'}, {'panel':'cultivation'}, {'act':'panel-alchemy'}]:
            forged_button(page, attrs)
            assert not page.locator('#panel').evaluate('(e)=>e.open')
            assert current(page) == before
            assert not page.evaluate("window.__clock.reasons.has('panel')")
        # Location-only fixture: it does not grant progression or inventory.
        fixture(page, {'position':'market','location':None}, unlock_gameplay=False)
        page.locator('[data-place="market"]').focus();page.keyboard.press('Enter')
        assert page.locator('[data-act="panel-alchemy"]').count() == 0
        assert page.locator('[data-act="meal"]').count() == 1
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="vehicle"]').click()
        assert page.locator('[data-act="upgrade"]').count() == 0
        assert page.locator('[data-act="charge"]').count() == 1
        fixture(page, {'position':'home','location':None}, unlock_gameplay=False)
        page.evaluate('window.__stableSpeed=document.querySelector("#time-speed")')
        record(f'{width}px 真实新档仅四个基础按钮；隐藏快捷入口不能绕过，生存操作保留')

        nearest_ui_delivery(page)
        assert current(page)['pending']['templateId'] == 'first-order'
        assert 'system' not in nav()
        assert current(page)['stats']['delivered'] == 0
        choose_ui(page)
        assert current(page)['stats']['delivered'] == 1
        assert 'system' in nav() and 'cultivation' not in nav() and 'alchemy' not in nav()
        assert page.locator('.currency[data-panel="system"]').is_visible()
        assert page.evaluate('window.__stableSpeed===document.querySelector("#time-speed")')
        record(f'{width}px 首单真实到达不提前解锁，选择结算后系统导航与顶部入口一起出现')

        page.locator('#game-nav [data-panel="system"]').click()
        assert page.locator('[data-ui="system-tab"][data-id="endings"]').count() == 0
        assert page.locator('[data-act="buy"][data-id="foundation"]').count() == 0
        page.click('[data-ui="system-tab"][data-id="quests"]')
        assert page.locator('[data-act="claim"][data-id="q2"]').count() == 0
        page.click('[data-act="claim"][data-id="q1"]')
        assert 'cultivation' in nav() and 'alchemy' not in nav()
        assert page.locator('[data-act="claim"][data-id="q2"]').count() == 1
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="cultivation"]').click()
        assert page.locator('[data-act="cultivate"]').count() == 1
        assert page.locator('[data-act="breakthrough"]').count() == 0
        before = current(page)
        forged_button(page, {'act':'cultivate','kind':'meditate'})
        assert current(page) == before
        page.click('[data-act="cultivate"][data-kind="breath"]')
        pump(page, 500)
        assert current(page)['activity']['elapsed'] > 0
        assert not page.evaluate("NightCourier.featureUnlocked(window.__live,'practice')")
        halfway = current(page)
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert current(page)['activity']['elapsed'] == halfway['activity']['elapsed']
        assert not page.evaluate("NightCourier.featureUnlocked(window.__live,'practice')")
        finish_ui_activity(page);settle_ui(page)
        assert current(page)['stats']['trained'] == 1
        page.locator('#game-nav [data-panel="cultivation"]').click()
        assert page.locator('[data-act="cultivate"]').count() == 3
        assert page.locator('[data-act="breakthrough"]').count() == 1
        assert page.locator('[data-act="panel-alchemy"]').count() == 0
        page.click('[data-ui="close"]')
        record(f'{width}px 领奖开放吐纳；首次修炼途中读档不提前开放，完成才出现进阶与探索')

        for _ in range(2):
            nearest_ui_delivery(page)
            for _ in range(10):
                pending = current(page)['pending']
                if not pending or pending['templateId'] == 'story-street-vein':
                    break
                choose_ui(page)
            else:
                raise AssertionError('配送事件未能在十次选择内结算')
        assert current(page)['pending']['templateId'] == 'story-street-vein'
        assert current(page)['stats']['delivered'] == 3
        assert 'alchemy' not in nav()
        choose_ui(page)
        assert 'alchemy' in nav()
        assert current(page)['alchemy']['cauldron'] == 0
        assert len(current(page)['alchemy']['formulas']) == 12
        page.screenshot(path=str(OUT/f'progressive-alchemy-open-{width}.png'))
        page.locator('#game-nav [data-panel="alchemy"]').click()
        text = page.locator('#panel').inner_text()
        hidden_names = page.evaluate('NightCourier.ALCHEMY_RECIPES.filter(r=>!window.__live.alchemy.formulas.includes(r.id)).map(r=>r.name)')
        assert all(name not in text for name in hidden_names)
        assert '丹火与药香' in text
        assert page.locator('[data-act="cultivate"]').count() == 0
        page.click('[data-ui="close"]')
        record(f'{width}px 真实连续三单主线完成后出现独立炼药导航，未获得丹方仍隐藏')

        # Higher-stage UI fixtures: thresholds are tested independently in Node.
        edits = current(page)
        edits['stats']['delivered'] = 4
        edits['position'] = 'garage';edits['location'] = None
        edits['bonds']['chen']['met'] = True
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="vehicle"]').click()
        assert page.locator('[data-act="upgrade"]').count() == 0
        edits = current(page);edits['stats']['delivered'] = 5
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="vehicle"]').click()
        assert page.locator('[data-act="upgrade"]').count() == 3
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert '陈默' in page.locator('#panel').inner_text()
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="system"]').click()
        assert page.locator('[data-ui="system-tab"][data-id="endings"]').count() == 0
        edits = current(page);edits['stats']['delivered'] = 20
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="system"]').click()
        assert page.locator('[data-ui="system-tab"][data-id="endings"]').count() == 1
        page.click('[data-ui="system-tab"][data-id="endings"]')
        assert page.locator('[data-ui="confirm-ending"]').count() == 5
        page.click('[data-ui="close"]')
        assert len(nav()) == 8
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#game-nav .nav-btn').evaluate_all('(buttons)=>buttons.every(b=>b.getBoundingClientRect().width>=44)')
        page.screenshot(path=str(OUT/f'progressive-all-nav-{width}.png'))
        record(f'{width}px 羁绊、5单升级与20单归途按条件出现；全导航可滚动且不撑宽页面')

        page.click('[data-ui="home"]')
        new_game(page, '新的起点')
        assert nav() == initial
        assert page.locator('.currency[data-panel="system"]').is_hidden()
        assert current(page)['unlockedFeatures'] == []
        page.click('[data-ui="home"]')
        page.locator('.save-card').filter(has_text='渐进旅人').locator('[data-ui="load"]').click()
        assert len(nav()) == 8
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert not errors, errors
        record(f'{width}px 从已开放存档切到新档不残留按钮或归途页，旧档重载保留解锁与暂停')
        ctx.close()

"""[1:-1]),
(4994,4994,'    progressive_browser_checks(browser)\n'),
(5291,5291,r'''
    assert page.locator('.game-nav [data-panel="cultivation"]').count() == 0
    assert page.locator('.game-nav [data-panel="system"]').count() == 0
    assert page.locator('.game-nav [data-panel="bonds"]').count() == 0
    fixture(page, {})
    toggle(page)

'''[1:-1]),
(5413,5413,'    page.click(\'[data-ui="close"]\')\n    page.locator(\'.game-nav [data-panel="alchemy"]\').click()\n'),
(5639,5643,'新档隐藏进阶导航；已开放夹具'),
(5647,5650,'修行'),
(5651,5653,'炼药页不泄露'),
(5654,5655,''),
(5658,5666,''),
(13932,13932,';s.unlockedFeatures=NightCourier.FEATURE_UNLOCKS.map(f=>f.id)'),
(14647,14647,'al'),
(14648,14658,'hemy'),
(14975,14975,'[data-id="1"]'),
(16817,16817,'al'),
(16818,16828,'hemy'),
(18111,18111,'al'),
(18112,18122,'hemy'),
(19506,19506,'al'),
(19507,19517,'hemy'),
(19838,19838,'        fixture(mobile, {})\n        toggle(mobile)\n'),
])

patch('tests/engine.test.mjs','72e21fb1fe686f458ed91c5118f3b5a943c624c2893c05676fe6c2c8cc1a524d','4148b28da2d39ca261de2cf65f05633d8de7f5ebeb9a57e60d76b6567e45ea68',[
(240,240,'// 专项回归使用已开启入口的夹具；真实新档解锁由 gameplay-unlocks.test.mjs 覆盖。\n'),
(285,285,'Object.assign('),
(310,310,',{unlockedFeatures:G.FEATURE_UNLOCKS.map(f=>f.id)})'),
(23566,23567,'G.VERSION'),
(23805,23805,'G.VERSION+'),
(23806,23807,''),
(24930,24933,'当前格式'),
(25304,25305,'G.VERSION'),
(25703,25704,'G.VERSION'),
(26066,26067,'G.VERSION'),
])

patch('tests/formula-acquisition.test.mjs','8bd359acd62627ab4e450a6fc1ff8280e6a9fd79cbbdb390e95604d341faea0f','813be9760b6e80eec8b9af110c020094cfc5eaa19f8af8aad549b2b1f3137532',[
(240,240,'// 专项回归使用已开启入口的夹具；真实新档解锁由 gameplay-unlocks.test.mjs 覆盖。\n'),
(270,270,'Object.assign('),
(294,294,',{unlockedFeatures:G.FEATURE_UNLOCKS.map(f=>f.id)})'),
])

patch('tests/realtime.test.mjs','eb73dd1638e726ca6bc40d457fb77485496d392d699b76d660a532560c4f0e94','77172d22743fa6347117883eb8fed856a109761d337ea081cedd86c0615689db',[
(272,272,'// 专项回归使用已开启入口的夹具；真实新档解锁由 gameplay-unlocks.test.mjs 覆盖。\n'),
(288,288,'Object.assign('),
(322,322,',{unlockedFeatures:G.FEATURE_UNLOCKS.map(f=>f.id)})'),
(10176,10179,'当前格式'),
(10419,10420,'G.VERSION'),
(10967,10968,'G.VERSION'),
])

patch('tests/gameplay-unlocks.test.mjs','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','9728f107047df747a5241da3ed027fd0ec59185993d932e0b18f27f041f82a20',[
(0,0,r'''
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
// 不使用全开启夹具：以下每条新档流程都从实际出厂状态开始。
const fresh=(mode='classic')=>G.newGame('渐行',mode,67891);
const act=(s,name,p={})=>{const r=G.perform(s,name,p);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&!s.gameOver&&i<2000;i++)s=G.advance(s,1);assert.ok(!s.activity||s.gameOver);return s;};
const choose=s=>act(s,'choose',{eventId:s.pending.id,index:s.pending.choices.findIndex(c=>!G.choiceBlock(s,c))});
const settle=s=>{for(let i=0;s.pending&&i<10;i++)s=finish(choose(s));assert.equal(s.pending,null);return s;};
const deliver=s=>{
  const orders=[...s.orders].sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters);
  const order=orders.find(o=>!G.travelBlock(s,G.travelPlan(s,o.target)));
  assert.ok(order,'应存在可达订单');return settle(finish(act(s,'deliver',{id:order.id})));
};
const reread=s=>G.sanitizeSave(G.clone(s));
const unlockLogs=s=>s.logs.filter(l=>l.tag==='解锁');
const afterClaim=()=>act(deliver(fresh()),'claim',{id:'q1'});
function street(s,duration=0){
  const e=G.EVENTS.find(e=>e.id==='story-street-vein');
  s.flags.firstOrder=true;s.flags.storyStreetVein=true;s.stats.delivered=3;s.claimed=['q1'];
  s.pending={...G.clone(e),id:'progressive-story',templateId:e.id,source:'classic',aiStatus:'skip'};
  if(duration)s.pending.choices[0].duration=duration;
  return s;
}

test('真实新档仅基础导航可用，无功能所有权或免费解锁奖励',()=>{
  const s=fresh();assert.equal(s.schemaVersion,10);assert.deepEqual(s.unlockedFeatures,[]);
  for(const p of ['inventory','vehicle','rest','help','character','place'])assert.ok(G.panelUnlocked(s,p));
  for(const p of ['system','cultivation','alchemy','bonds'])assert.equal(G.panelUnlocked(s,p),false);
  assert.equal(G.nextFeatureUnlock(s).id,'system');assert.equal(unlockLogs(s).length,0);
  assert.equal(s.player.money,120);assert.equal(s.alchemy.cauldrons.length,0);
});
test('门槛配置无重名、无缺失前置或循环，入口与规则使用相同标识',()=>{
  const ids=G.FEATURE_UNLOCKS.map(f=>f.id);assert.equal(new Set(ids).size,ids.length);
  const visit=(id,path=[])=>{assert.ok(ids.includes(id));assert.ok(!path.includes(id));for(const p of G.FEATURE_UNLOCKS.find(f=>f.id===id).requires||[])visit(p,[...path,id]);};
  ids.forEach(id=>visit(id));Object.values(G.FEATURE_PANELS).forEach(id=>assert.ok(ids.includes(id)));
  assert.equal(G.featureUnlocked(fresh(),'__proto__'),false);
});
test('未开启时直接调用所有受限指令均失败且原对象、资金、时间和 RNG 不变',()=>{
  for(const [name,p] of [['buy',{id:'qi'}],['sign',{}],['claim',{id:'q1'}],['cultivate',{kind:'breath'}],['cultivate',{kind:'meditate'}],['cultivate',{kind:'body'}],['breakthrough',{}],['explore',{}],['alchemy',{recipe:'heal'}],['cauldron',{}],['formula',{}],['material',{id:'herb'}],['herb',{}],['upgrade',{kind:'speed'}],['visit',{id:'lin'}],['finale',{id:'ordinary'}]]){
    const s=fresh();s.position='market';s.player.money=10000;s.player.coins=10000;s.player.qi=10000;
    const before=JSON.stringify(s),r=G.perform(s,name,p);assert.equal(r.ok,false,name);assert.equal(r.state,s);assert.match(r.error,/尚未开启/);assert.equal(JSON.stringify(s),before);
  }
});
test('首单开始、到达待选、待选读档都不开放系统；实际交付结算后才开放',()=>{
  let s=fresh();const before=JSON.stringify(s);s=act(s,'deliver',{id:s.orders[0].id});
  assert.equal(G.featureUnlocked(s,'system'),false);assert.ok(!JSON.parse(before).activity);
  s=finish(s);assert.equal(s.pending.templateId,'first-order');assert.equal(s.flags.firstOrder,true);
  assert.equal(G.featureUnlocked(reread(s),'system'),false);assert.equal(s.stats.delivered,0);
  s=settle(s);assert.equal(s.stats.delivered,1);assert.ok(s.unlockedFeatures.includes('system'));
  assert.equal(G.featureUnlocked(s,'cultivation'),false);assert.ok(G.panelUnlocked(s,'system'));
});
test('领取首单奖励才开放吐纳，领取本身不开放进阶修行或炼药',()=>{
  const first=deliver(fresh());const at=first.minutes;const s=act(first,'claim',{id:'q1'});
  assert.equal(s.minutes,at);assert.ok(G.featureUnlocked(s,'cultivation'));
  assert.equal(G.nextFeatureUnlock(s).id,'practice');assert.equal(G.featureUnlocked(s,'practice'),false);
  assert.equal(G.featureUnlocked(s,'alchemy'),false);assert.equal(s.alchemy.formulas.length,6);
  assert.equal(G.perform(s,'claim',{id:'q1'}).ok,false);
});
test('首次吐纳途中、中断和途中读档不开放进阶；完成才开放',()=>{
  let s=afterClaim();s=act(s,'cultivate',{kind:'breath'});s=G.advance(s,5);
  assert.equal(G.featureUnlocked(reread(s),'practice'),false);assert.equal(s.stats.trained,0);
  s=act(s,'stop');assert.equal(G.featureUnlocked(s,'practice'),false);
  s=settle(finish(act(s,'cultivate',{kind:'breath'})));
  assert.equal(s.stats.trained,1);assert.ok(s.unlockedFeatures.includes('practice'));
  assert.ok(G.perform(s,'cultivate',{kind:'meditate'}).ok);assert.ok(G.perform(s,'breakthrough').ok);
  s.position='park';assert.ok(G.perform(s,'explore').ok);
});
test('三单主线待选时不开放炼药，真实新档可连续解锁到炼药',()=>{
  let s=afterClaim();s=deliver(s);
  const order=[...s.orders].sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters)[0];
  s=finish(act(s,'deliver',{id:order.id}));
  for(let i=0;s.pending?.templateId!=='story-street-vein'&&i<4;i++)s=finish(choose(s));
  assert.equal(s.pending.templateId,'story-street-vein');assert.equal(s.stats.delivered,3);
  assert.equal(G.featureUnlocked(s,'alchemy'),false);assert.equal(G.featureUnlocked(reread(s),'alchemy'),false);
  s=settle(s);assert.ok(s.unlockedFeatures.includes('alchemy'));assert.ok(G.panelUnlocked(s,'alchemy'));
  assert.equal(s.alchemy.cauldron,0);assert.equal(s.alchemy.formulas.length,12);
});
test('尚未领取首单奖励时，即使完成三单主线也不能跳过修行前置',()=>{
  let s=street(fresh());s.claimed=[];s=settle(s);
  assert.equal(G.featureUnlocked(s,'alchemy'),false);s=act(s,'claim',{id:'q1'});
  assert.ok(G.featureUnlocked(s,'alchemy'));
});
test('耗时主线到结算才开放炼药，途中存档不提前开放',()=>{
  const e=G.EVENTS.find(e=>e.id==='story-street-vein'),duration=e.choices[0].duration;e.choices[0].duration=10;
  try{
    let s=street(fresh());s=act(s,'choose',{eventId:s.pending.id,index:0});s=G.advance(s,5);
    assert.equal(s.activity.kind,'choice');assert.equal(G.featureUnlocked(s,'alchemy'),false);
    s=reread(s);assert.equal(G.featureUnlocked(s,'alchemy'),false);s=finish(s);assert.ok(G.featureUnlocked(s,'alchemy'));
  }finally{if(duration===undefined)delete e.choices[0].duration;else e.choices[0].duration=duration;}
});
test('同刻房租破产先于剧情完成，不发炼药解锁或完成奖励',()=>{
  const e=G.EVENTS.find(e=>e.id==='story-street-vein'),duration=e.choices[0].duration;e.choices[0].duration=10;
  try{
    let s=street(fresh());s.minutes=6*1440-10;s.player.money=0;
    s=act(s,'choose',{eventId:s.pending.id,index:0});s=G.advance(s,10);
    assert.ok(s.gameOver);assert.ok(!s.unlockedFeatures.includes('alchemy'));
    assert.ok(!reread(s).unlockedFeatures.includes('alchemy'));
  }finally{if(duration===undefined)delete e.choices[0].duration;else e.choices[0].duration=duration;}
});
for(const mode of ['classic','ai'])test(`${mode}模式采用同一玩法进度，不需要 AI 回包才能开启`,()=>{
  const s=act(deliver(fresh(mode)),'claim',{id:'q1'});assert.ok(G.featureUnlocked(s,'cultivation'));assert.equal(s.mode,mode);
});
test('首次遇见任何 NPC 才开放羁绊，不提前暴露其余角色',()=>{
  const s=fresh();assert.equal(G.panelUnlocked(s,'bonds'),false);
  s.bonds.chen.met=true;const before=JSON.stringify(s);assert.ok(G.panelUnlocked(s,'bonds'));assert.equal(JSON.stringify(s),before);
  const a=act(s,'transport',{mode:'walk'});assert.ok(a.unlockedFeatures.includes('bonds'));
  assert.deepEqual(G.visibleNPCs(a).map(n=>n.id),['chen']);assert.equal(G.perform(a,'visit',{id:'lin'}).ok,false);
});
for(const [id,n,action,p] of [['upgrades',5,'upgrade',{kind:'speed'}],['endings',20,'finale',{id:'ordinary'}]])test(`${id}在第 ${n} 单结算边界开放，既有费用/结局条件继续校验`,()=>{
  let s=fresh();s.stats.delivered=n-1;s.position='garage';s.player.money=1000;
  assert.equal(G.featureUnlocked(s,id),false);assert.equal(G.perform(s,action,p).ok,false);
  s.stats.delivered=n;assert.ok(G.featureUnlocked(s,id));assert.ok(G.perform(s,action,p).ok);
  if(id==='upgrades'){s.position='home';assert.equal(G.perform(s,action,p).ok,false);}
  else{s.player.money=0;assert.equal(G.perform(s,action,p).ok,false);}
});
test('完整配送 5 单可解锁升级，不依赖随机结识修车 NPC',()=>{
  let s=afterClaim();for(let i=1;i<5;i++)s=deliver(s);
  assert.equal(s.stats.delivered,5);assert.ok(s.unlockedFeatures.includes('upgrades'));
});
test('主线仅显示已领取与下一篇，直接构造后续领取不能绕过',()=>{
  let s=fresh();s.stats.delivered=100;s.player.realm=5;
  assert.deepEqual(G.visibleQuests(s).map(q=>q.id),['q1']);const before=JSON.stringify(s);
  assert.equal(G.perform(s,'claim',{id:'q2'}).ok,false);assert.equal(JSON.stringify(s),before);
  s=act(s,'claim',{id:'q1'});assert.deepEqual(G.visibleQuests(s).map(q=>q.id),['q1','q2']);
  s=act(s,'claim',{id:'q2'});assert.deepEqual(G.visibleQuests(s).map(q=>q.id),['q1','q2','q3']);
});
test('开局低资源仍可休息、切换步行、充电、维修、用药、搬家与睡眠',()=>{
  let s=fresh();s.player.stamina=10;s.player.health=30;s.vehicle.battery=0;
  assert.ok(G.perform(s,'rest').ok);assert.ok(G.perform(s,'use',{id:'heal'}).ok);
  assert.ok(G.perform(s,'transport',{mode:'walk'}).ok);assert.ok(G.perform(s,'charge').ok);
  s.position='garage';s.vehicle.durability=50;assert.ok(G.perform(s,'repair').ok);
  s.position='home';s.player.stamina=100;s.transport='walk';assert.ok(G.perform(s,'sleep').ok);
  assert.ok(G.perform(s,'moveHome',{id:'qiyun'}).ok);
  s.player.money=0;assert.ok(G.perform(s,'rest').ok);assert.ok(G.perform(s,'transport',{mode:'walk'}).ok);
});
test('属性、物品与大境界本身不能替代新档里程碑',()=>{
  const s=fresh();s.player.realm=5;s.player.qi=999;s.player.coins=999;s.alchemy.cauldron=24;s.alchemy.xp=999;
  G.syncFeatureUnlocks(s);assert.deepEqual(s.unlockedFeatures,[]);
});
test('读取解锁提示/渲染查询不改变原状态、随机数或日志',()=>{
  const s=afterClaim(),before=JSON.stringify(s);
  for(let i=0;i<25;i++){for(const f of G.FEATURE_UNLOCKS)G.featureUnlocked(s,f.id);G.nextFeatureUnlock(s);G.visibleQuests(s);G.panelUnlocked(s,'alchemy');}
  assert.equal(JSON.stringify(s),before);
});
test('解锁只写一次日志，不改变金钱、分钟、随机数或物品，不自动买鼎',()=>{
  const s=fresh();s.stats.delivered=1;const before=G.clone(s);G.syncFeatureUnlocks(s);
  assert.equal(unlockLogs(s).length,1);for(const key of ['player','inventory','alchemy'])assert.deepEqual(s[key],before[key]);
  assert.equal(s.minutes,before.minutes);assert.equal(s.seed,before.seed);
  G.syncFeatureUnlocks(s);assert.equal(unlockLogs(s).length,1);
  const restored=reread(s);assert.equal(unlockLogs(restored).length,1);
});
test('已开启功能永久保存；花光钱、用完物品和信任下降不重新锁定',()=>{
  let s=afterClaim();s.bonds.lin.met=true;s=act(s,'transport',{mode:'walk'});const known=[...s.unlockedFeatures];
  s.player.coins=0;s.player.money=0;s.inventory={};s.bonds.lin.trust=0;
  s=reread(s);for(const id of known)assert.ok(G.featureUnlocked(s,id));
});
test('v9无经历新档不全开；旧修行、药鼎丹方与改装按证据恢复',()=>{
  let s=fresh();s.schemaVersion=9;delete s.unlockedFeatures;assert.deepEqual(reread(s).unlockedFeatures,[]);
  s.alchemy.formulas=['heal'];s.alchemy.cauldron=1;s.alchemy.cauldrons=[1];s.vehicle.levels.speed=2;s.stats.trained=1;
  const before=JSON.stringify(s),a=reread(s);assert.equal(JSON.stringify(s),before);
  for(const id of ['system','cultivation','practice','alchemy','upgrades'])assert.ok(a.unlockedFeatures.includes(id),id);
  assert.equal(a.minutes,s.minutes);assert.deepEqual(a.alchemy.formulas,['heal']);assert.equal(a.vehicle.levels.speed,2);
  assert.ok(!a.unlockedFeatures.includes('endings'));assert.ok(!a.unlockedFeatures.includes('bonds'));
});
test('v9炼药途中迁移保持已付材料与进度，恢复相关入口不重复结算',()=>{
  let s=fresh();s.unlockedFeatures=['alchemy'];G.syncFeatureUnlocks(s,true);s.position='market';s.player.money=1000;
  s=act(s,'cauldron',{id:1});s.alchemy.formulas=['heal'];const recipe=G.alchemyRecipe('heal');
  for(const [id,n] of Object.entries(recipe.materials))s.inventory[id]=n;
  s=G.advance(act(s,'alchemy',{recipe:'heal'}),5);s.schemaVersion=9;delete s.unlockedFeatures;
  const a=reread(s);assert.ok(a.unlockedFeatures.includes('alchemy'));assert.equal(a.activity.elapsed,s.activity.elapsed);
  assert.deepEqual(a.inventory,s.inventory);assert.equal(a.player.money,s.player.money);assert.equal(a.alchemy.brews,s.alchemy.brews);
});
test('新格式所有权严格白名单去重，前置入口补齐，不因未知键崩溃',()=>{
  const s=fresh();s.unlockedFeatures=['alchemy','alchemy','__proto__',123,null];const a=reread(s);
  assert.deepEqual(new Set(a.unlockedFeatures),new Set(['alchemy','cultivation','system']));
  for(const raw of [null,{},'system']){s.unlockedFeatures=raw;assert.deepEqual(reread(s).unlockedFeatures,[]);}
});
test('v9存储键显式迁移；新键空列表不会复活旧档；多存档所有权隔离',()=>{
  const mem={data:new Map(),getItem(k){return this.data.get(k)??null;},setItem(k,v){this.data.set(k,v);}};
  const a=afterClaim(),b=fresh();a.schemaVersion=9;delete a.unlockedFeatures;
  mem.setItem('night-courier:saves:v9',JSON.stringify({schemaVersion:9,saves:[a,b]}));const store=G.createStore(mem);store.load();
  assert.equal(store.saves.length,2);assert.ok(store.saves[0].unlockedFeatures.includes('cultivation'));
  assert.deepEqual(store.saves[1].unlockedFeatures,[]);assert.ok(mem.getItem(G.STORAGE_KEY));
  mem.setItem(G.STORAGE_KEY,JSON.stringify({schemaVersion:10,saves:[]}));assert.deepEqual(G.createStore(mem).load(),[]);
});
test('三种丹方渠道和获得条件不受入口解锁影响，隐藏方仍不能直接开炉',()=>{
  const s=afterClaim();s.unlockedFeatures.push('alchemy');s.position='market';
  const candidates=G.formulaMarketCandidates(s);assert.ok(candidates.every(r=>r.acquisition.type==='shop'));
  const recipe=G.ALCHEMY_RECIPES.find(r=>!s.alchemy.formulas.includes(r.id));const r=G.perform(s,'alchemy',{recipe:recipe.id});
  assert.equal(r.ok,false);assert.match(r.error,/尚未获得丹方/);assert.ok(!r.error.includes(recipe.name));
});

'''[1:-1]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
