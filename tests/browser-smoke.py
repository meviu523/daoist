"""Offline Chromium integration checks.

Build first: npm run build. Requires Python Playwright and Chromium. Uses the
actual bundled application with in-memory localStorage and explicitly mocked AI.
Most cases drive GameClock with controlled timestamps; a separate case uses real
requestAnimationFrame. HTTP allowlist/CSP/AI proxy have independent Node tests.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, Error as BrowserError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
HTML = (ROOT / 'dist/index.html').read_text()
BOOT = r'''
window.__memory = new Map();
window.__aiConfigured = false; window.__aiDelay = 0; window.__aiFail = false;
window.__aiEvent = {title:'雨后的小灯',text:'巷口的店主在等一份热饭。',choices:[{label:'认真道谢',result:'店主也笑了。',effects:{qi:5}},{label:'请他喝一杯茶',result:'热茶驱散了寒意。',effects:{money:-5,karma:2}},{label:'留下祝福',result:'灯光亮了一点。',effects:{rep:1}}]};
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__memory.get(k)??null,setItem:(k,v)=>window.__memory.set(k,String(v)),removeItem:k=>window.__memory.delete(k),clear:()=>window.__memory.clear()}});
window.fetch = async (url,options={}) => {
 if(String(url).endsWith('/api/health')) return new Response(JSON.stringify({aiConfigured:window.__aiConfigured}));
 if(String(url).endsWith('/api/story')){
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,window.__aiDelay);options.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));});});
  if(window.__aiFail) return new Response(JSON.stringify({error:'模拟接口失败'}),{status:503});
  return new Response(JSON.stringify({event:window.__aiEvent}));
 }
 throw new Error('Unexpected request in offline UI test');
};
'''
CONTROL = r'''
const G=NightCourier, original=G.GameClock.prototype.frame;
window.__now=10000;window.__wall=0;const wall=Date.now;
Date.now=()=>wall()+window.__wall;
G.GameClock.prototype.frame=function(){window.__clock=this;};
window.__pump=ms=>{
 const c=window.__clock;if(!c)throw new Error('Clock not initialized');
 original.call(c,window.__now);
 while(ms>0){const delta=Math.min(20,ms);window.__now+=delta;window.__wall+=delta;original.call(c,window.__now);ms-=delta;}
};
'''
CAPTURE = r'''
const G=NightCourier;
for(const name of ['render','updatePosition']){
 const old=G.CityMap.prototype[name];
 G.CityMap.prototype[name]=function(s){if(s)window.__live=G.clone(s);window.__map=this;return old.call(this,s);};
}
'''
results = []
reload_modes = []

def record(name):
    results.append({'name': name, 'passed': True})
    print('PASS', name, flush=True)

def current(page):
    return page.evaluate('window.__live')

def stored(page, name=None):
    return page.evaluate('(name)=>{const s=JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves;return name?s.find(x=>x.name===name):s[0];}', name)

def pump(page, ms):
    page.evaluate('(ms)=>window.__pump(ms)', ms)
    page.wait_for_timeout(120)  # Let the real render loop update the lightweight HUD.

def toggle(page):
    page.click('[data-ui="pause"]')

def new_game(page, name='云行', mode='classic'):
    page.click('[data-ui="new-game"]')
    page.fill('#player-name-input', name)
    page.check(f'input[name="mode"][value="{mode}"]')
    page.click('#new-game-form button[type="submit"]')
    page.wait_for_selector('#game-screen:not([hidden])')

def setup(browser, width=1440, height=1000, ai=False, controlled=True):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width<600, device_scale_factor=1)
    page = ctx.new_page()
    page.set_default_timeout(7000)
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.evaluate('() => {' + BOOT + '}')
    page.evaluate('(ai)=>window.__aiConfigured=ai', ai)
    page.set_content(HTML, wait_until='domcontentloaded')
    if controlled:
        page.evaluate('() => {' + CONTROL + '}')
        page.wait_for_function('window.__clock != null')
    page.evaluate('() => {' + CAPTURE + '}')
    return ctx, page, errors

def select_order(page):
    page.locator('.order-point[data-place]').first.focus()
    page.keyboard.press('Enter')
    assert page.locator('[data-act="deliver"]').is_enabled()

def fixture(page, edits, unlock_gameplay=True):
    # Isolated pre-existing gameplay regressions explicitly open feature gates.
    # The progressive flow below opts out and starts from a genuine new save.
    edits = dict(edits)
    ack_result_ui(page)
    if unlock_gameplay:
        edits['unlockedFeatures'] = page.evaluate('NightCourier.FEATURE_UNLOCKS.map(f=>f.id)')
        edits['unlockedPlaces'] = page.evaluate('NightCourier.PLACES.map(p=>p.id)')
    if page.locator('#panel[open] [data-ui="close"]').count():
        page.click('#panel [data-ui="close"]')
    page.click('[data-ui="home"]')
    page.evaluate('''(edits)=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k));const s=x.saves[0];Object.assign(s,edits);localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''', edits)
    page.locator('[data-ui="load"]').first.click()

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

def ack_result_ui(page):
    if current(page) and current(page).get('eventResult'):
        page.click('[data-act="ackResult"]')

def choose_ui(page):
    index = page.evaluate('window.__live.pending.choices.findIndex(c=>!NightCourier.choiceBlock(window.__live,c))')
    assert index >= 0
    page.click(f'[data-act="choose"][data-index="{index}"]')
    finish_ui_activity(page)
    ack_result_ui(page)

def settle_ui(page):
    for _ in range(12):
        ack_result_ui(page)
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

def location_browser_checks(browser):
    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '送餐识路')
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        assert page.locator('.service-point').evaluate_all('(els)=>els.map(e=>e.dataset.place)') == ['home', 'garage']
        target = page.evaluate('''()=>{const G=NightCourier,s=window.__live;return s.orders.find(o=>G.place(o.target).permanent&&!G.placeUnlocked(s,o.target)).target;}''')
        page.locator('#game-nav [data-panel="rest"]').click()
        assert page.locator('[data-act="moveHome"]').count() == 0
        page.click('[data-ui="close"]')
        marker = page.locator(f'.order-point[data-place="{target}"]')
        assert '首次送达后解锁地点' in marker.get_attribute('aria-label')
        marker.focus();page.keyboard.press('Enter')
        assert '首次送达' in page.locator('#panel').inner_text()
        assert page.locator('[data-act="travel"]').count() == 0
        assert page.locator('[data-act="meal"], [data-act="heal"], [data-act="visit"], [data-act="panel-vehicle"]').count() == 0
        before = current(page)
        forged_button(page, {'act':'travel','target':target})
        assert current(page) == before
        page.screenshot(path=str(OUT/f'location-locked-{width}.png'))
        record(f'{width}px 新档默认开放小屋和修车点，未知订单提示送达解锁且不展示当地服务或搬家入口')

        page.click('[data-act="deliver"]')
        pump(page, 200)
        assert current(page)['activity'] is not None
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        page.click('#action-bar [data-act="stop"]')
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        page.click('#action-bar [data-act="resumeDelivery"]')
        finish_ui_activity(page)
        assert current(page)['position'] == target
        assert current(page)['pending']['delivery']['target'] == target
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        memory = page.evaluate('Array.from(window.__memory.entries())')
        assert not errors, errors
        ctx.close()
        ctx, page, errors = setup(browser, width, height)
        page.evaluate('''entries=>{window.__memory=new Map(entries);window.dispatchEvent(new StorageEvent('storage',{key:NightCourier.STORAGE_KEY}));}''', memory)
        page.locator('[data-ui="load"]').first.click()
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        choose_ui(page)
        assert target in current(page)['unlockedPlaces']
        assert len([l for l in current(page)['logs'] if l['tag']=='地点']) == 1
        page.wait_for_timeout(380)
        service = page.locator(f'.service-point[data-place="{target}"]')
        assert service.count() == 1 and service.get_attribute('data-discovered') == 'true'
        assert service.locator('.order-expiry-ring').count() == 0
        assert not page.locator('.trail-layer path').count()
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert target in current(page)['unlockedPlaces']
        assert current(page)['stats']['delivered'] == 1
        assert len([l for l in current(page)['logs'] if l['tag']=='地点']) == 1
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'location-discovered-{width}.png'))
        record(f'{width}px 实际配送中断续送与待选读档不提前解锁，结算后常驻且重载不重复奖励')

        page.click('[data-ui="home"]');new_game(page, '未抵达')
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        select_order(page)
        page.click('[data-act="deliver"]');pump(page, 100)
        page.click('#action-bar [data-act="stop"]')
        page.once('dialog', lambda dialog: dialog.accept())
        page.click('[data-ui="cancel-delivery"]')
        assert current(page)['activeOrder'] is None
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        assert current(page)['stats']['delivered'] == 0
        assert not errors, errors
        record(f'{width}px 新旧存档地点隔离，真实取消配送不开放目的地，页面无运行异常')
        ctx.close()

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
        # Previously discovered location fixture: no feature or inventory grants.
        fixture(page, {'position':'market','location':None,'unlockedPlaces':['home','market']}, unlock_gameplay=False)
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
        assert len(nav()) == 9
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
        assert len(nav()) == 9
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert not errors, errors
        record(f'{width}px 从已开放存档切到新档不残留按钮或归途页，旧档重载保留解锁与暂停')
        ctx.close()

def auction_browser_checks(browser):
    def reload_snapshot(ctx, page, errors, width, height):
        # A fresh document/process gets only the persisted localStorage snapshot.
        # This models a reload while a non-closable decision dialog is open.
        assert not errors, errors
        memory = page.evaluate('Array.from(window.__memory.entries())')
        ctx.close()
        ctx, page, errors = setup(browser, width, height, ai=True)
        page.evaluate('''entries=>{window.__memory=new Map(entries);window.dispatchEvent(new StorageEvent('storage',{key:NightCourier.STORAGE_KEY}));}''', memory)
        page.locator('.save-card').filter(has_text='万宝来客').locator('[data-ui="load"]').click()
        return ctx, page, errors

    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height, ai=True)
        new_game(page, '万宝来客', 'ai')
        assert page.locator('#game-nav [data-panel="auction"]').count() == 0
        before = current(page)
        for attrs in [{'panel':'auction'}, {'act':'panel-auction'}, {'act':'auctionCatalog'}]:
            forged_button(page, attrs)
            assert current(page) == before
            assert not page.locator('#panel').evaluate('(e)=>e.open')
        # Isolate the unlock threshold and route without replaying nine unrelated deliveries.
        edits = current(page)
        edits['unlockedFeatures'] = ['system', 'cultivation', 'alchemy']
        edits['unlockedPlaces'] = ['home', 'market']
        edits['stats']['delivered'] = 9
        edits['player']['money'] = 10000
        edits['flags'].update({'firstOrder':True, 'storyStreetVein':True})
        edits['minutes'] = 1000
        fixture(page, edits, unlock_gameplay=False)
        assert page.locator('#game-nav [data-panel="auction"]').count() == 0
        edits = current(page);edits['stats']['delivered'] = 10
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="auction"]').click()
        assert page.locator('[data-act="auctionCatalog"]').count() == 0
        assert page.locator('[data-act="travel"][data-target="market"]').count() == 1
        page.click('[data-act="travel"][data-target="market"]')
        assert current(page)['activity']['phase'] == 'travel'
        assert current(page)['position'] == 'home'
        finish_ui_activity(page)
        assert current(page)['position'] == 'market'
        assert current(page)['minutes'] < 1080
        page.locator('#game-nav [data-panel="auction"]').click()
        page.click('[data-act="auctionCatalog"]')
        assert page.locator('[data-auction-lot]').count() == 3
        assert page.locator('[data-act="auctionBid"]').count() == 6
        assert page.locator('[data-act="auctionBid"]').evaluate_all('(els)=>els.every(e=>e.disabled)')
        assert '尚未开拍' in page.locator('#panel').inner_text()
        record(f'{width}px 拍卖入口9/10单边界、隐藏指令拒绝、真实到场与日间图录不可举牌')

        edits = current(page);edits['minutes'] = 1080
        info = page.evaluate('NightCourier.auctionLotInfo(window.__live.auction.lots[0])')
        for rival in edits['auction']['lots'][0]['rivals']:
            rival['ceiling'] = info['opening'] + info['step'] * 8
        fixture(page, edits, unlock_gameplay=False)
        page.evaluate('window.__auctionSpeed=document.querySelector("#time-speed")')
        page.locator('#game-nav [data-panel="auction"]').click()
        old = current(page)
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="auction"]').click()
        assert current(page)['auction'] == old['auction']
        assert current(page)['seed'] == old['seed']
        page.locator('[data-auction-lot]').nth(0).locator('[data-act="auctionBid"][data-raise="1"]').click()
        started = current(page)
        assert started['minutes'] == old['minutes']
        assert started['player']['money'] == old['player']['money'] - info['opening']
        assert started['inventory'] == old['inventory']
        assert started['activity']['kind'] == 'auction'
        assert page.locator('#action-bar [data-act="stop"]').is_hidden()
        if page.evaluate("window.__clock.reasons.has('manual')"):
            toggle(page)
        page.select_option('#time-speed', '1')
        pump(page, 2000)
        halfway = current(page)
        assert 1.9 < halfway['activity']['elapsed'] < 2.1
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        loaded = current(page)
        assert loaded['activity']['elapsed'] == halfway['activity']['elapsed']
        assert loaded['player']['money'] == halfway['player']['money']
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        finish_ui_activity(page)
        decision = current(page)
        assert decision['pending']['kind'] == 'auction'
        assert decision['pending']['aiStatus'] == 'skip'
        assert decision['player']['money'] == old['player']['money']
        assert page.locator('[data-act="choose"]').count() == 3
        assert page.locator('.ai-status').count() == 0
        assert page.evaluate('window.__auctionSpeed===document.querySelector("#time-speed")')
        page.screenshot(path=str(OUT/f'auction-decision-{width}.png'))
        ctx, page, errors = reload_snapshot(ctx, page, errors, width, height)
        assert current(page)['pending']['id'] == decision['pending']['id']
        assert current(page)['auction'] == decision['auction']
        page.click('[data-act="choose"][data-index="2"]')
        assert current(page)['auction']['lots'][0]['status'] == 'lost'
        assert current(page)['player']['money'] == old['player']['money']
        assert '万宝拍卖场' in page.locator('#panel-title').inner_text()
        record(f'{width}px 实际冻结现金和5分钟竞价、途中重载、超价全额退款与免费退出，AI不改拍卖')

        edits = current(page)
        info = page.evaluate('NightCourier.auctionLotInfo(window.__live.auction.lots[1])')
        for rival in edits['auction']['lots'][1]['rivals']:
            rival['ceiling'] = info['opening']
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="auction"]').click()
        old = current(page);lot = old['auction']['lots'][1]
        page.locator('[data-auction-lot]').nth(1).locator('[data-act="auctionBid"][data-raise="3"]').click()
        finish_ui_activity(page)
        won = current(page)
        assert won['auction']['lots'][1]['status'] == 'won'
        assert won['auction']['wins'] == 1
        assert won['inventory'][lot['item']] == old['inventory'].get(lot['item'], 0) + lot['count']
        assert won['player']['money'] == old['player']['money'] - info['opening'] - 2*info['step']
        assert page.locator('#panel').evaluate('(e)=>e.open')
        assert '已竞得' in page.locator('[data-auction-lot]').nth(1).inner_text()
        forged_button(page, {'act':'auctionBid','id':lot['id'],'raise':'1'})
        assert current(page)['auction'] == won['auction']
        assert current(page)['inventory'] == won['inventory']
        ctx, page, errors = reload_snapshot(ctx, page, errors, width, height)
        page.locator('#game-nav [data-panel="auction"]').click()
        assert current(page)['inventory'] == won['inventory']
        assert current(page)['player']['money'] == won['player']['money']
        text = page.locator('#panel').inner_text()
        hidden = page.evaluate('NightCourier.ALCHEMY_RECIPES.filter(r=>!window.__live.alchemy.formulas.includes(r.id)).map(r=>r.name)')
        assert all(name not in text for name in hidden)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('[data-act="auctionBid"]').evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().width>=44)')
        page.locator('[data-auction-lot]').nth(1).scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/f'auction-won-{width}.png'))
        record(f'{width}px 实际加价成交、拍品入库不重扣、重复提交拒绝、读档不重发与窄屏排版')

        page.click('[data-ui="close"]')
        page.click('[data-ui="home"]')
        new_game(page, '另一段旅程')
        assert page.locator('#game-nav [data-panel="auction"]').count() == 0
        assert current(page)['auction']['day'] == 0
        assert current(page)['auction']['wins'] == 0
        page.click('[data-ui="home"]')
        page.locator('.save-card').filter(has_text='万宝来客').locator('[data-ui="load"]').click()
        assert current(page)['auction']['wins'] == 1
        assert page.locator('#game-nav [data-panel="auction"]').count() == 1
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert not errors, errors
        record(f'{width}px 新档不继承拍卖图录或导航，旧档保留拍品和默认暂停')
        ctx.close()

def result_browser_checks(browser):
    # Load the shipped offline file with real browser localStorage. Unlike the
    # isolated UI fixtures, page.reload re-reads the bundle and saved receipt.
    for width, height in [(1440, 1000), (390, 844), (320, 740)]:
        ctx = browser.new_context(viewport={'width':width,'height':height}, has_touch=width<600)
        page = ctx.new_page();page.set_default_timeout(7000)
        errors=[];page.on('pageerror', lambda err: errors.append(str(err)))
        native_reload=True
        def boot(reload=False):
            nonlocal page,native_reload
            if native_reload:
                try:
                    if reload: page.reload(wait_until='domcontentloaded')
                    else: page.goto((ROOT/'dist/index.html').as_uri(), wait_until='domcontentloaded')
                except BrowserError as error:
                    if reload or 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error): raise
                    # Some sandboxes disable *all* navigations, including file://.
                    # Keep restoration covered without pretending this is a native reload.
                    native_reload=False;page.close();page=ctx.new_page()
            if not native_reload:
                memory=[]
                if reload:
                    page.evaluate("window.dispatchEvent(new Event('pagehide'))")
                    memory=page.evaluate('Array.from(window.__memory.entries())')
                    page.close();page=ctx.new_page()
                page.set_default_timeout(7000)
                page.on('pageerror',lambda err:errors.append(str(err)))
                page.evaluate('() => {'+BOOT+'}')
                page.evaluate('(entries)=>window.__memory=new Map(entries)',memory)
                page.set_content(HTML,wait_until='domcontentloaded')
            page.evaluate('() => {'+CONTROL+'}')
            page.wait_for_function('window.__clock != null')
            page.evaluate('() => {'+CAPTURE+'}')
        boot();reload_modes.append({'width':width,'mode':'native-file-reload' if native_reload else 'fresh-page-storage-fixture'})
        print('Reload mode:',reload_modes[-1],flush=True)
        new_game(page, '结果阅读')
        nearest_ui_delivery(page)
        before=current(page);event=before['pending']
        page.click('[data-act="choose"][data-index="0"]')
        receipt=current(page)['eventResult'];settled=stored(page)
        assert receipt['text']==event['choices'][0]['result']
        assert page.locator('.result-text').inner_text()==receipt['text']
        assert event['choices'][0]['label'] in page.locator('.result-selection').inner_text()
        assert page.locator('.result-delivery').count()==1
        assert page.locator('[data-act="choose"]').count()==0
        assert page.locator('[data-ui="close"]').count()==0
        assert page.locator('[data-act="ackResult"]').evaluate('(e)=>e===document.activeElement')
        pump(page, 30000);page.keyboard.press('Escape')
        assert current(page)['minutes']==settled['minutes']
        assert page.locator('#panel[open]').count()==1
        assert page.locator('.event-result').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('[data-act="ackResult"]').bounding_box()['height']>=44
        page.screenshot(path=str(OUT/f'event-result-{width}.png'))
        record(f'{width}px 选择后展示剧情及独立配送结算；自动聚焦、Esc 不跳过、阅读暂停、布局无横向溢出')
        boot(True);page.locator('[data-ui="load"]').first.click()
        reloaded=current(page)
        assert reloaded['eventResult']==receipt
        assert reloaded['player']==settled['player']
        assert reloaded['stats']==settled['stats']
        assert reloaded['minutes']==settled['minutes']
        assert page.locator('.result-text').inner_text()==receipt['text']
        assert page.evaluate("window.__clock.reasons.has('manual')")
        pump(page, 10000)
        page.keyboard.press('Enter')
        assert current(page)['eventResult'] is None
        assert current(page)['player']==settled['player']
        assert current(page)['stats']==settled['stats']
        assert current(page)['minutes']==settled['minutes']
        assert page.locator('#panel[open]').count()==0
        again=current(page)
        forged_button(page, {'act':'ackResult','id':receipt['id']})
        forged_button(page, {'act':'choose','event':event['id'],'index':'0'})
        assert current(page)==again
        pump(page, 10000);assert current(page)['minutes']==settled['minutes']
        boot(True);page.locator('[data-ui="load"]').first.click()
        assert current(page)['eventResult'] is None
        record(f'{width}px 重载保留未读结果且不重奖；Enter 确认、重复提交拒绝、已读状态保存、手动暂停保留')

        # Seed a previously arrived order with an actual catalog event. Commit,
        # elapsed work, reload and completion all go through the real UI/engine.
        edits=page.evaluate('''()=>{const G=NightCourier,s=window.__live,e=G.EVENTS.find(e=>e.id==='delivery-spare-chopsticks');return {
            flags:{...s.flags,firstOrder:true},position:'clinic',location:null,orders:[],activity:null,eventResult:null,
            player:{...s.player,money:200,stamina:80},stats:{...s.stats,delivered:2},
            pending:{...G.clone(e),id:'browser-timed',templateId:e.id,source:'classic',aiStatus:'skip',
            delivery:{id:'browser-order',title:'送给邻居的热饭',target:'clinic',desc:'当面交付',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc:'lin'}}};}''')
        fixture(page,edits,unlock_gameplay=False)
        before=current(page);page.click('[data-act="choose"][data-index="1"]')
        assert current(page)['eventResult'] is None
        assert current(page)['player']['money']==194
        assert current(page)['stats']['delivered']==2
        toggle(page);page.select_option('#time-speed','1');pump(page,1000)
        assert 0<current(page)['activity']['elapsed']<3
        # A browser reload triggers pagehide saving of a partially completed choice.
        boot(True);page.locator('[data-ui="load"]').first.click()
        assert current(page)['activity']['kind']=='choice'
        assert current(page)['eventResult'] is None
        assert current(page)['player']['money']==194
        finish_ui_activity(page)
        timed=current(page);receipt=timed['eventResult']
        assert receipt['duration']==4
        assert receipt['changes'][0]=={'key':'player.money','delta':-6}
        assert timed['stats']['delivered']==3
        assert timed['player']['money']==224
        assert timed['pending']['templateId']=='story-street-vein'
        assert page.locator('.result-text').inner_text()==receipt['text']
        assert '4 个游戏分钟' in page.locator('.event-result').inner_text()
        assert page.locator('[data-act="ackResult"]').inner_text()=='继续剧情'
        boot(True);page.locator('[data-ui="load"]').first.click()
        assert current(page)['eventResult']==receipt
        assert current(page)['pending']['templateId']=='story-street-vein'
        page.click('[data-act="ackResult"]')
        assert page.locator('.choice').count()==3
        assert current(page)['pending']['templateId']=='story-street-vein'
        assert current(page)['stats']['delivered']==3
        assert current(page)['player']['money']==224
        page.click('[data-act="choose"][data-index="1"]')
        assert current(page)['eventResult']['title']=='地图上多出来的一条线'
        assert page.locator('.result-delivery').count()==0
        page.click('[data-act="ackResult"]')
        record(f'{width}px 耗时选择重载后继续、不重复扣费；三单结果先于主线，主线选择也有结果')

        if width==320:
            edits=page.evaluate('''()=>{const G=NightCourier,s=G.clone(window.__live),e=G.EVENTS.find(e=>e.id==='rain');
              s.mode='ai';s.pending={...G.clone(e),id:'browser-ai-text',templateId:e.id,source:'classic',aiStatus:'unrequested'};
              const text='<img src=x onerror="window.__injected=1">'+ '一段很长的结果'.repeat(24);
              const ai=G.applyAIEvent(s,s.pending.id,{title:'结果里的文字',text:'认真读完再继续。',choices:[
                {label:'阅读',result:text,effects:{qi:5}},{label:'停留',result:'你记下了这句话。',effects:{}},{label:'道别',result:'你重新上路。',effects:{}}]});
              return {pending:ai.pending,mode:'ai'};}''')
            fixture(page,edits,unlock_gameplay=False)
            page.click('[data-act="choose"][data-index="0"]')
            assert '<img' in page.locator('.result-text').inner_text()
            assert page.locator('.result-text img').count()==0
            assert page.evaluate('window.__injected===undefined')
            assert page.locator('.event-result').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
            assert page.locator('[data-act="ackResult"]').is_enabled()
            record('320px AI 长结果安全转义、自动换行，无脚本执行或按钮遮挡')
            page.click('[data-act="ackResult"]')
            edits=page.evaluate('''()=>{const G=NightCourier,s=G.clone(window.__live),e=G.EVENTS.find(e=>e.id==='rain');
              s.player.health=1;s.pending={...G.clone(e),id:'browser-rescue',templateId:e.id,source:'classic',aiStatus:'unrequested'};
              const ai=G.applyAIEvent(s,s.pending.id,{title:'紊乱的灵息',text:'灵息忽然紊乱。',choices:[
                {label:'尝试',result:'你失去了力气，路人开始呼救。',effects:{health:-10}},
                {label:'停下',result:'灵息平静了。',effects:{}},{label:'退后',result:'你避开了紊流。',effects:{}}]});
              return {pending:ai.pending,player:ai.player,mode:'ai'};}''')
            fixture(page,edits,unlock_gameplay=False)
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['activity']['kind']=='rescue'
            assert current(page)['eventResult'] is not None
            assert page.locator('[data-act="ackResult"]').is_enabled()
            t=current(page)['minutes'];pump(page,5000);assert current(page)['minutes']==t
            page.click('[data-act="ackResult"]')
            assert current(page)['eventResult'] is None
            record('受伤救助与未读结果可共存，确认按钮可用，阅读后才继续救助')
        assert not errors,errors
        ctx.close()

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
    kwargs = {'headless': True}
    if Path(executable).exists():
        kwargs['executable_path'] = executable
    browser = p.chromium.launch(**kwargs)
    result_browser_checks(browser)
    location_browser_checks(browser)
    auction_browser_checks(browser)
    progressive_browser_checks(browser)
    ctx, page, errors = setup(browser)
    page.screenshot(path=str(OUT/'start-desktop.png'))
    new_game(page)
    assert page.locator('.player-name').inner_text() == '云行'
    assert '外卖修仙录' not in page.locator('#game-header').inner_text()
    assert page.locator('.player-marker').count() == 1
    assert page.locator('.game-nav [data-panel="cultivation"]').count() == 0
    assert page.locator('.game-nav [data-panel="system"]').count() == 0
    assert page.locator('.game-nav [data-panel="bonds"]').count() == 0
    fixture(page, {})
    toggle(page)
    page.locator('.game-nav [data-panel="cultivation"]').click()
    assert '凡人一重' in page.locator('#panel').inner_text()
    page.click('[data-ui="close"]')
    page.locator('.game-nav [data-panel="alchemy"]').click()
    assert '无药鼎' in page.locator('#panel').inner_text()
    assert '尚未获得任何丹方' in page.locator('#panel').inner_text()
    assert page.locator('[data-act="alchemy"]').count() == 0
    page.click('[data-ui="close"]')
    record('新档隐藏进阶导航；已开放夹具显示九重修行，炼药页不泄露未得丹方')
    page.screenshot(path=str(OUT/'game-desktop.png'))
    assert page.evaluate('NightCourier.PLACES.length') == 110
    assert page.locator('.map-point').count() <= 15
    assert page.evaluate("document.querySelector('.base-layer').textContent.includes('南岸新街')")
    page.evaluate('window.__map.fit()')
    page.screenshot(path=str(OUT/'expanded-map-desktop.png'))
    page.evaluate('window.__map.center()')
    record('110 地点扩展地图已绘制，新配送点保持动态显示')
    pump(page, 1200)
    assert abs(current(page)['minutes']-481.2) < 1e-5
    assert current(page)['position'] == 'home'
    toggle(page)
    before = stored(page)
    pump(page, 5000)
    assert current(page)['minutes'] == before['minutes']
    record('桌面开局姓名、空闲连续计时与全局暂停')

    select_order(page)
    page.screenshot(path=str(OUT/'order-desktop.png'))
    page.click('[data-act="deliver"]')
    accepted = stored(page)
    assert accepted['activity']['kind'] == 'deliver'
    assert accepted['position'] == before['position'] and accepted['minutes'] == before['minutes']
    assert accepted['stats']['delivered'] == 0 and not accepted['pending']
    pump(page, 500)
    assert current(page)['activity']['travelled'] == 0
    toggle(page)
    page.evaluate('window.__marker=document.querySelector(".player-marker")')
    pump(page, 300)
    halfway = current(page)
    assert halfway['position'] is None and halfway['activity']['travelled'] > 0
    assert page.evaluate('window.__marker===document.querySelector(".player-marker")')
    assert halfway['vehicle']['battery'] < before['vehicle']['battery']
    toggle(page)
    point = page.locator('.player-marker').get_attribute('transform')
    frozen = stored(page)
    pump(page, 2000)
    assert page.locator('.player-marker').get_attribute('transform') == point
    assert current(page)['minutes'] == frozen['minutes']
    page.screenshot(path=str(OUT/'moving-desktop.png'))
    record('接单不瞬移不提前结算，路程、位置、消耗与暂停同步')
    record('移动普通帧保留同一人物节点，不重建整张地图')

    page.click('[data-ui="home"]')
    page.click('[data-ui="load"]')
    assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
    assert abs(current(page)['activity']['travelled']-frozen['activity']['travelled']) < 1e-6
    assert current(page)['location'] == frozen['location']
    pump(page, 2000)
    assert current(page)['minutes'] == frozen['minutes']
    record('途中自动存档恢复路线和小数进度，读档默认暂停')

    page.locator('.game-nav [data-panel="system"]').click()
    pump(page, 500)
    page.click('[data-act="sign"]')
    signed = stored(page)
    page.click('[data-act="buy"][data-id="qi"]')
    bought = stored(page)
    assert bought['minutes'] == frozen['minutes']
    assert bought['inventory']['qi'] == signed['inventory']['qi']+1
    assert bought['activity']['travelled'] == frozen['activity']['travelled']
    page.click('[data-ui="close"]')
    pump(page, 2000)
    assert current(page)['minutes'] == frozen['minutes']
    record('系统即时兑换不推进活动，关闭面板不会解除手动暂停')
    toggle(page)
    page.click('#action-bar [data-act="stop"]')
    stopped = stored(page)
    pump(page, 1000)
    assert current(page)['location'] == stopped['location']
    assert current(page)['minutes'] > stopped['minutes']
    assert current(page)['activeOrder']['id'] == accepted['activeOrder']['id']
    page.click('#action-bar [data-act="resumeDelivery"]')
    page.select_option('#time-speed', '10')
    pump(page, 20000)
    assert current(page)['pending'] and current(page)['stats']['delivered'] == 0
    assert page.locator('.trail-layer path').count() == 0
    record('到达目的地后已完成路线立即从地图消失')
    paused_at = current(page)['minutes']
    pump(page, 2000)
    assert current(page)['minutes'] == paused_at
    page.screenshot(path=str(OUT/'event-desktop.png'))
    page.click('[data-act="choose"][data-index="0"]')
    assert stored(page)['stats']['delivered'] == 1
    record('停车仍计订单期限，继续配送后事件暂停，交付只结算一次')
    ack_result_ui(page)

    # Running before opening a panel resumes after closing; rate controls affect time.
    page.select_option('#time-speed', '1')
    old = current(page)['minutes']
    page.locator('.game-nav [data-panel="inventory"]').click()
    pump(page, 1000)
    assert current(page)['minutes'] == old
    page.click('[data-ui="close"]')
    pump(page, 1000)
    assert abs(current(page)['minutes']-old-1) < 1e-5
    for speed in [3, 10]:
        page.select_option('#time-speed', str(speed))
        old = current(page)['minutes']
        pump(page, 1000)
        assert abs(current(page)['minutes']-old-speed) < 1e-5
    record('面板自动暂停并恢复先前状态，1/3/10 倍率推进完整模拟')

    # Visibility/pagehide are simulated; this is not a physical OS freeze.
    page.select_option('#time-speed', '1')
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
    old = stored(page)['minutes']
    pump(page, 3000)
    assert abs(current(page)['minutes']-old-3) < 1e-5
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}")
    pump(page, 2000)
    assert abs(current(page)['minutes']-old-5) < 1e-5
    assert page.locator('[data-ui="pause"]').inner_text() == '暂停'
    page.evaluate("window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))")
    pump(page, 1000)
    assert abs(current(page)['minutes']-old-6) < 1e-5
    record('隐藏/返回与 pagehide/pageshow 不自动暂停，同一会话持续计时')
    toggle(page)
    old = current(page)['minutes']
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
    pump(page, 3000)
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}")
    pump(page, 1000)
    assert current(page)['minutes'] == old
    assert page.locator('[data-ui="pause"]').inner_text() == '继续'
    record('主动暂停后切后台再返回仍保持暂停')

    page.click('[data-ui="home"]')
    new_game(page, '青禾', 'ai')
    page.click('[data-ui="home"]')
    assert page.locator('.save-card').count() == 2
    page.locator('.save-card').filter(has_text='云行').locator('[data-ui="load"]').click()
    assert page.locator('.player-name').inner_text() == '云行'
    assert stored(page, '青禾')['mode'] == 'ai'
    assert stored(page, '云行')['mode'] == 'classic'
    record('多存档隔离，读取后保留各自剧情模式')
    page.evaluate('window.dispatchEvent(new StorageEvent("storage",{key:NightCourier.STORAGE_KEY}))')
    old = current(page)['minutes']
    toggle(page)
    pump(page, 2000)
    assert current(page)['minutes'] == old
    assert '另一标签页' in page.locator('#storage-warning').inner_text()
    record('另一标签页写入后冻结旧页面，暂停按钮不能绕过冲突')
    assert not errors, errors
    record('桌面流程无 JavaScript 运行时异常')
    ctx.close()

    # A world revision (such as the 15-minute order refresh) must not replace
    # the native speed select while the player is interacting with it.
    ctx, refresh, refresh_errors = setup(browser, 1200, 900)
    new_game(refresh, '时控')
    refresh.select_option('#time-speed', '10')
    refresh.locator('#time-speed').focus()
    refresh.evaluate("()=>{window.__speedSelect=document.querySelector('#time-speed');window.__timeControls=document.querySelector('.time-controls');}")
    timing = refresh.evaluate("()=>({now:window.__live.minutes,next:window.__live.orderRefreshAt})")
    assert timing['next'] > timing['now']
    pump(refresh, int(((timing['next']-timing['now'])/10+.2)*1000))
    assert current(refresh)['minutes'] >= timing['next']
    assert refresh.evaluate("()=>window.__speedSelect===document.querySelector('#time-speed')")
    assert refresh.evaluate("()=>window.__timeControls===document.querySelector('.time-controls')")
    assert refresh.evaluate("()=>document.activeElement===window.__speedSelect")
    assert refresh.locator('#time-speed').input_value() == '10'
    assert not refresh_errors, refresh_errors
    record('世界时间刷新不重建倍率选择框，焦点与当前倍率保持')
    ctx.close()

    ctx, craft, cerrors = setup(browser, 1200, 900)
    new_game(craft, '药童')
    craft.click('[data-ui="home"]')
    craft.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k)),s=x.saves[0];s.player.money=10000;s.alchemy.xp=999;s.unlockedFeatures=NightCourier.FEATURE_UNLOCKS.map(f=>f.id);s.unlockedPlaces=NightCourier.PLACES.map(p=>p.id);for(const m of NightCourier.ALCHEMY_MATERIALS)s.inventory[m.id]=10;localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''')
    craft.locator('[data-ui="load"]').first.click()
    assert current(craft)['player']['money'] == 10000
    craft.locator('[data-place="market"]').focus();craft.keyboard.press('Enter')
    craft.click('[data-act="travel"][data-target="market"]')
    toggle(craft);craft.select_option('#time-speed', '10')
    travel_ms = int((craft.evaluate("NightCourier.travelPlan(window.__live,'market').minutes") / 10 + .25) * 1000)
    pump(craft, travel_ms)
    assert current(craft)['position'] == 'market'
    craft.locator('.game-nav [data-panel="alchemy"]').click()
    panel_text = craft.locator('#panel').inner_text()
    assert '尚未获得任何丹方' in panel_text
    assert craft.locator('[data-act="alchemy"]').count() == 0
    hidden_name = craft.evaluate("NightCourier.ALCHEMY_RECIPES[0].name")
    assert hidden_name not in panel_text
    craft.click('[data-act="cauldron"][data-id="1"]')
    assert stored(craft)['alchemy']['cauldron'] == 1
    before_formula_money = current(craft)['player']['money']
    craft.click('[data-act="formula"]')
    acquired = current(craft)['alchemy']['formulas']
    assert len(acquired) == 1
    assert craft.evaluate('(id)=>NightCourier.alchemyRecipe(id).acquisition.type', acquired[0]) == 'shop'
    assert current(craft)['player']['money'] < before_formula_money
    acquired_name = craft.evaluate("(id)=>NightCourier.alchemyRecipe(id).name", acquired[0])
    remaining_name = craft.evaluate("()=>NightCourier.ALCHEMY_RECIPES.find(r=>!window.__live.alchemy.formulas.includes(r.id)).name")
    panel_text = craft.locator('#panel').inner_text()
    assert acquired_name in panel_text
    assert '获取途径：商店购买' in panel_text
    assert remaining_name not in panel_text
    assert craft.locator('[data-act="alchemy"]').count() == 1
    assert craft.evaluate("NightCourier.ALCHEMY_MATERIALS.length") == 64
    assert craft.evaluate("NightCourier.ALCHEMY_RECIPES.length") == 108
    assert craft.evaluate("NightCourier.CAULDRONS.length - 1") == 24
    record('未获得丹方完全隐藏；长乐集购入未知残卷后才显示具体丹方')
    assert not cerrors, cerrors
    ctx.close()

    # Dedicated acquisition checks use the same real bundle and save reload path.
    for width, height in [(1200, 900), (320, 740)]:
        ctx, formula, ferrors = setup(browser, width, height)
        new_game(formula, '传方')
        edits = formula.evaluate("""()=>{const G=NightCourier,s=G.clone(window.__live);
          s.position='market';s.coordinates={x:G.place('market').x,y:G.place('market').y};
          s.player.realm=5;s.player.money=10000;
          s.alchemy.formulas=G.ALCHEMY_RECIPES.filter(r=>r.acquisition.type==='shop').map(r=>r.id);
          return s;}""")
        fixture(formula, edits)
        formula.locator('.game-nav [data-panel="alchemy"]').click()
        text = formula.locator('#panel').inner_text()
        assert '当前境界商店丹方已收齐' in text
        assert formula.locator('[data-act="formula"]').is_disabled()
        assert len(current(formula)['alchemy']['formulas']) == 36
        exclusive_names = formula.evaluate("NightCourier.ALCHEMY_RECIPES.filter(r=>r.acquisition.type!=='shop').map(r=>r.name)")
        assert all(name not in text for name in exclusive_names)
        assert formula.evaluate('document.documentElement.scrollWidth<=innerWidth')
        record(f'{width}px 商店收齐只得 36 张，剧情/羁绊内容仍隐藏，售罄按钮禁用')
        edits = current(formula)
        edits['alchemy']['formulas'] = []
        edits['bonds']['chen'].update({'met': True, 'stage': 1, 'trust': 3})
        fixture(formula, edits)
        formula.locator('.game-nav [data-panel="bonds"]').click()
        text = formula.locator('#panel').inner_text()
        assert '陈默' in text and '丹方传授 2/6' in text
        assert '完成第 2 章' in text and '信任 9' in text
        assert '林晚' not in text and '沈青禾' not in text
        assert formula.evaluate('document.documentElement.scrollWidth<=innerWidth')
        formula.screenshot(path=str(OUT/f'formula-bonds-{width}.png'))
        formula.click('[data-ui="close"]')
        formula.locator('.game-nav [data-panel="alchemy"]').click()
        text = formula.locator('#panel').inner_text()
        assert '获取途径：羁绊 · 陈默' in text
        hidden_names = formula.evaluate("NightCourier.ALCHEMY_RECIPES.filter(r=>!window.__live.alchemy.formulas.includes(r.id)).map(r=>r.name)")
        assert all(name not in text for name in hidden_names)
        record(f'{width}px 羁绊传授进度、下次条件及来源显示，未结识人物与未得丹方不泄露')
        assert not ferrors, ferrors
        ctx.close()

    ctx, story, serrs = setup(browser, 1200, 900)
    new_game(story, '传承')
    edits = story.evaluate("""()=>{const G=NightCourier,s=G.clone(window.__live),
      e=G.EVENTS.find(e=>e.id==='story-street-vein');
      s.flags.storyStreetVein=true;
      s.pending={...G.clone(e),id:'formula-story-browser',templateId:e.id,source:'classic',aiStatus:'skip'};
      return s;}""")
    fixture(story, edits)
    assert current(story)['alchemy']['formulas'] == []
    assert story.locator('[data-act="choose"]').count() == 3
    story.click('[data-act="choose"][data-index="0"]')
    assert len(current(story)['alchemy']['formulas']) == 6
    assert story.evaluate("window.__live.alchemy.formulas.every(id=>NightCourier.alchemyRecipe(id).acquisition.event==='story-street-vein')")
    before = current(story)
    fixture(story, before)
    assert current(story)['alchemy']['formulas'] == before['alchemy']['formulas']
    ack_result_ui(story)
    story.locator('.game-nav [data-panel="alchemy"]').click()
    assert '获取途径：剧情 · 地图上多出来的一条线' in story.locator('#panel').inner_text()
    assert not serrs, serrs
    record('剧情待选读档不提前领丹方，真实点击结算获得六张，重载不重复奖励')
    ctx.close()

    for width, height in [(390, 844), (320, 740)]:
        ctx, mobile, merrors = setup(browser, width, height)
        new_game(mobile, '行舟')
        fixture(mobile, {})
        toggle(mobile)
        pump(mobile, 100)
        mobile.screenshot(path=str(OUT/f'game-{width}.png'))
        mobile.click('[data-ui="fit-map"]')
        bounds = mobile.locator('.road-network').bounding_box()
        viewport = mobile.locator('#city-map').bounding_box()
        assert bounds['x'] >= viewport['x'] and bounds['x']+bounds['width'] <= viewport['x']+viewport['width']+.5
        assert bounds['y'] >= viewport['y'] and bounds['y']+bounds['height'] <= viewport['y']+viewport['height']+.5
        assert mobile.locator('.bridge-rails').count() == 4
        assert mobile.locator('.district-label').all_text_contents() == ['云港新区','东湖新城','南郊生活区','灵溪山麓','南岸新街']
        mobile.screenshot(path=str(OUT/f'map-overview-{width}.png'))
        before_position = current(mobile)['position']
        mobile.click('[data-ui="locate"]')
        assert current(mobile)['position'] == before_position
        record(f'{width}px 全城视图完整容纳新路网，定位及缩放不改变人物位置')
        assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
        mobile.evaluate('window.__map.fit()')
        assert mobile.evaluate('''()=>{const m=window.__map;return m.tx>=0&&m.ty>=0&&m.tx+NightCourier.WORLD.width*m.scale<=m.el.clientWidth+.5&&m.ty+NightCourier.WORLD.height*m.scale<=m.el.clientHeight+.5;}''')
        mobile.screenshot(path=str(OUT/f'expanded-map-{width}.png'))
        mobile.evaluate('window.__map.center()')
        for selector in ['#game-nav', '#action-bar', '.time-controls']:
            box = mobile.locator(selector).bounding_box()
            assert box['x'] >= 0 and box['x']+box['width'] <= width+.5
            assert box['y'] >= 0 and box['y']+box['height'] <= height+.5
        mobile.locator('.game-nav [data-panel="system"]').click()
        mobile.screenshot(path=str(OUT/f'system-{width}.png'))
        panel = mobile.locator('#panel').bounding_box()
        assert panel['x'] >= 0 and panel['y'] >= 0 and panel['y']+panel['height'] <= height
        assert mobile.locator('[data-act="sign"]').is_visible()
        mobile.click('[data-ui="close"]')
        if width == 390:
            z = float(mobile.locator('#city-map').get_attribute('data-zoom'))
            cdp = ctx.new_cdp_session(mobile)
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':145,'y':420},{'x':245,'y':420}]})
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':110,'y':420},{'x':280,'y':420}]})
            cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            assert float(mobile.locator('#city-map').get_attribute('data-zoom')) > z
            assert not mobile.locator('#panel').evaluate('(d)=>d.open')
            record('双指缩放不误接单，缩放只改变视角')
        assert not merrors, merrors
        record(f'{width}px 手机视口：时间控制、行动栏、导航、面板无溢出或运行异常')
        ctx.close()

    ctx, expanded, xerrors = setup(browser)
    new_game(expanded, '新城骑手')
    assert expanded.evaluate('NightCourier.PLACES.length') == 110
    assert expanded.evaluate('document.querySelector(".road-network").getAttribute("d")===NightCourier.ROAD_EDGES.map(({from,to})=>{const a=NightCourier.ROAD_NODES[from],b=NightCourier.ROAD_NODES[to];return `M${a.x} ${a.y}L${b.x} ${b.y}`;}).join("")')
    expanded.screenshot(path=str(OUT/'map-overview-1440.png'))
    vehicle = current(expanded)['vehicle']; vehicle['battery'] = 0
    fixture(expanded, {'vehicle': vehicle})
    expanded.locator('.game-nav [data-panel="vehicle"]').click()
    assert expanded.locator('[data-act="charge"]').inner_text() == '充电 · ¥8 / 10 分钟'
    expanded.screenshot(path=str(OUT/'charge-panel.png'))
    expanded.click('[data-act="charge"]')
    accepted = stored(expanded)
    assert accepted['player']['money'] == 112 and accepted['activity']['duration'] == 10
    pump(expanded, 2000)
    assert current(expanded)['vehicle']['battery'] == 0  # Read/save manual pause remains independent.
    toggle(expanded); pump(expanded, 2500); toggle(expanded)
    assert abs(stored(expanded)['vehicle']['battery']-20) < 1e-5
    expanded.screenshot(path=str(OUT/'charging-paused.png'))
    expanded.click('[data-ui="home"]');expanded.locator('[data-ui="load"]').first.click()
    pump(expanded, 2000)
    assert abs(current(expanded)['vehicle']['battery']-20) < 1e-5
    toggle(expanded);pump(expanded, 7500);toggle(expanded)
    assert current(expanded)['activity'] is None and abs(current(expanded)['vehicle']['battery']-80) < 1e-5
    assert stored(expanded)['player']['money'] == 112
    record('充电界面 10 分钟/¥8，与实际进度、暂停和多次读档一致')

    # Offer points show a shrinking ring and animate both entry and removal.
    now = current(expanded)['minutes']
    fleeting = {'id':'fleeting-offer','target':'lingxi-20','title':'短驻热饭','desc':'这张单很快会从地图消失。','condition':'urgent','expiresAt':now+.25,'reward':30,'coins':2,'npc':None}
    fixture(expanded, {'orders':[fleeting], 'activeOrder':None, 'activity':None, 'pending':None})
    offer = expanded.locator('.order-point[data-order-id="fleeting-offer"]')
    assert offer.count() == 1
    assert offer.locator('.order-expiry-ring').count() == 1
    assert expanded.evaluate("""()=>getComputedStyle(document.querySelector('.order-point[data-order-id="fleeting-offer"] .point-visual')).animationName""") == 'orderPointIn'
    expanded.wait_for_timeout(380)
    centers = expanded.evaluate("""()=>{const p=document.querySelector('.order-point[data-order-id="fleeting-offer"]');const core=p.querySelector('.point-core').getBoundingClientRect(),ring=p.querySelector('.order-expiry-ring').getBoundingClientRect();return {core:[core.x+core.width/2,core.y+core.height/2],ring:[ring.x+ring.width/2,ring.y+ring.height/2]};}""")
    assert abs(centers['core'][0]-centers['ring'][0]) < .5
    assert abs(centers['core'][1]-centers['ring'][1]) < .5
    assert offer.locator('.order-expiry-ring').get_attribute('transform') == 'rotate(-90 0 0)'
    ring_before = float(offer.locator('.order-expiry-ring').get_attribute('stroke-dashoffset'))
    toggle(expanded);pump(expanded, 120);toggle(expanded)
    ring_after = float(offer.locator('.order-expiry-ring').get_attribute('stroke-dashoffset'))
    assert ring_after > ring_before
    toggle(expanded);pump(expanded, 180);toggle(expanded)
    assert expanded.locator('.order-leaving').count() == 1
    assert expanded.evaluate("""()=>getComputedStyle(document.querySelector('.order-leaving .point-visual')).animationName""") == 'orderPointOut'
    expanded.wait_for_timeout(350)
    assert expanded.locator('.order-leaving').count() == 0
    assert expanded.locator('[data-place="lingxi-20"]').count() == 0
    record('配送点用圆形进度显示消失时间，并在出现与消失时播放动画')

    # Exercise an actual new district order, not a permanent destination marker.
    now = current(expanded)['minutes']
    ticket = {'id':'new-zone-test','target':'lingxi-20','title':'山麓热饭','desc':'请送到门口。','condition':'ordinary','expiresAt':now+80,'reward':50,'coins':4,'npc':None}
    fixture(expanded, {'orders':[ticket], 'activeOrder':None, 'activity':None, 'pending':None})
    expected = expanded.evaluate('NightCourier.PLACES.filter(p=>p.permanent).length+1')
    assert expanded.locator('.map-point').count() == expected
    expanded.click('[data-ui="fit-map"]')
    expanded.locator('[data-place="lingxi-20"]').focus();expanded.keyboard.press('Enter')
    assert expanded.locator('#panel-title').inner_text() == '问山茶坊'
    assert '山脚' in expanded.locator('.panel-body').inner_text()
    expanded.screenshot(path=str(OUT/'new-district-order.png'))
    expanded.click('[data-act="deliver"]')
    money = stored(expanded)['player']['money']
    toggle(expanded);pump(expanded, 500);toggle(expanded)
    assert stored(expanded)['position'] is None and stored(expanded)['activity']['travelled'] > 0
    assert stored(expanded)['player']['money'] == money
    expanded.click('[data-ui="home"]');expanded.locator('[data-ui="load"]').first.click()
    expanded.select_option('#time-speed', '10');toggle(expanded)
    pump(expanded, 8000)
    assert stored(expanded)['position'] == 'lingxi-20'
    assert stored(expanded)['pending']['delivery']['id'] == 'new-zone-test'
    expanded.click('[data-act="choose"][data-index="0"]')
    assert stored(expanded)['stats']['delivered'] == 1
    assert stored(expanded)['player']['money'] == money+50
    assert expanded.locator('[data-place="lingxi-20"]').count() == 0
    record('新区地址按订单显示，真实配送、途中读档和奖励结算后移除任务点')
    assert not xerrors, xerrors
    ctx.close()

    ctx, ai, aerrors = setup(browser, 1200, 900, ai=True)
    new_game(ai, '听雨', 'ai')
    flags = current(ai)['flags'];flags['firstOrder'] = True
    fixture(ai, {'position':'park','location':None,'flags':flags})
    toggle(ai)
    ai.select_option('#time-speed', '10')
    ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
    ai.click('[data-act="explore"]')
    pump(ai, 3200)
    ai.wait_for_function("document.querySelector('#panel-title').textContent==='雨后的小灯'")
    assert stored(ai)['pending']['source'] == 'ai'
    at = stored(ai)['minutes'];pump(ai, 2000)
    assert current(ai)['minutes'] == at
    ai.click('[data-act="choose"][data-index="0"]')
    assert stored(ai)['pending'] is None
    record('AI 模拟成功返回受限事件，等待和阅读期间时间冻结')
    ack_result_ui(ai)
    ai.evaluate('window.__aiDelay=1200')
    ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
    ai.click('[data-act="explore"]');pump(ai, 3200)
    ai.click('[data-act="choose"][data-index="0"]')
    pump(ai, 5000)
    settled = current(ai)
    ai.wait_for_timeout(1400)
    assert current(ai)['pending'] is None
    assert current(ai)['player'] == settled['player']
    record('提前选择经典选项后，迟到 AI 响应不覆盖状态或重复奖励')
    ack_result_ui(ai)
    ai.evaluate('window.__aiDelay=0;window.__aiFail=true')
    ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
    ai.click('[data-act="explore"]');pump(ai, 3200)
    ai.wait_for_function("JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves[0].pending?.aiStatus==='fallback'")
    assert stored(ai)['pending']['source'] == 'classic'
    assert stored(ai)['mode'] == 'ai'
    record('AI 模拟失败回退经典事件，存档模式不改变')
    assert not aerrors, aerrors
    ctx.close()

    ctx, real, rerrors = setup(browser, 1024, 800, controlled=False)
    new_game(real, '实时时钟')
    real.wait_for_timeout(1250)
    assert current(real)['minutes'] > 481
    toggle(real)
    at = stored(real)['minutes']
    real.wait_for_timeout(300)
    assert current(real)['minutes'] == at
    select_order(real);real.click('[data-act="deliver"]')
    toggle(real);real.wait_for_timeout(200);toggle(real)
    assert stored(real)['activity']['travelled'] > 0
    assert not rerrors, rerrors
    record('真实 requestAnimationFrame：空闲流逝、移动与暂停实测')
    ctx.close()
    # Disable foreground rendering after startup: only the real background
    # interval can advance. Hidden status is simulated, timers are not mocked.
    ctx, bg, bgerrors = setup(browser, 1024, 800, controlled=False)
    new_game(bg, '后台时钟')
    bg.evaluate("()=>{window.requestAnimationFrame=()=>0;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
    bg.wait_for_timeout(200)
    at = current(bg)['minutes']
    bg.wait_for_timeout(2400)
    assert current(bg)['minutes'] >= at+1.5
    assert bg.locator('#game-screen').get_attribute('data-paused') == 'false'
    bg.locator('[data-ui="pause"]').evaluate('(button)=>button.click()')
    at = stored(bg)['minutes']
    bg.wait_for_timeout(1200)
    assert current(bg)['minutes'] == at
    assert not bgerrors, bgerrors
    record('真实后台定时器：无动画回调仍推进，手动暂停仍生效')
    ctx.close()
    browser.close()

(OUT/'browser-tests.json').write_text(json.dumps({
    'mode':'offline Chromium bundle; controlled GameClock timestamps plus real-rAF and background-heartbeat probes; mocked storage and AI',
    'tests':results, 'passed':len(results), 'failed':0, 'receipt_reload_modes':reload_modes,
}, ensure_ascii=False, indent=2))
print(f'{len(results)} browser checks passed.')
