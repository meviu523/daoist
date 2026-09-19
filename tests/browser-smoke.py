"""Offline Chromium integration checks.

Build first: npm run build. Requires Python Playwright and Chromium. Uses the
actual bundled application with in-memory localStorage and explicitly mocked AI.
Most cases drive GameClock with controlled timestamps; a separate case uses real
requestAnimationFrame. HTTP allowlist/CSP/AI proxy have independent Node tests.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

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
    page.locator('.order-point').first.focus()
    page.keyboard.press('Enter')
    assert page.locator('[data-act="deliver"]').is_enabled()

def fixture(page, edits):
    page.click('[data-ui="home"]')
    page.evaluate('''(edits)=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k));const s=x.saves[0];Object.assign(s,edits);localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''', edits)
    page.locator('[data-ui="load"]').first.click()

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
    kwargs = {'headless': True}
    if Path(executable).exists():
        kwargs['executable_path'] = executable
    browser = p.chromium.launch(**kwargs)
    ctx, page, errors = setup(browser)
    page.screenshot(path=str(OUT/'start-desktop.png'))
    new_game(page)
    assert page.locator('.player-name').inner_text() == '云行'
    assert '外卖修仙录' not in page.locator('#game-header').inner_text()
    assert page.locator('.player-marker').count() == 1
    page.locator('.game-nav [data-panel="cultivation"]').click()
    assert '凡人一重' in page.locator('#panel').inner_text()
    assert '无药鼎' in page.locator('#panel').inner_text()
    assert page.locator('[data-act="alchemy"]').first.is_disabled()
    page.click('[data-ui="close"]')
    record('修行面板显示九重小境界，未购鼎时禁止开炉')
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

    ctx, craft, cerrors = setup(browser, 1200, 900)
    new_game(craft, '药童')
    craft.click('[data-ui="home"]')
    craft.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k)),s=x.saves[0];s.player.money=1000;s.inventory.herb=10;s.player.mana=60;localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''')
    craft.locator('[data-ui="load"]').first.click()
    assert current(craft)['player']['money'] == 1000
    craft.locator('[data-place="market"]').focus();craft.keyboard.press('Enter')
    craft.click('[data-act="travel"][data-target="market"]')
    toggle(craft);craft.select_option('#time-speed', '10')
    travel_ms = int((craft.evaluate("NightCourier.travelPlan(window.__live,'market').minutes") / 10 + .25) * 1000)
    pump(craft, travel_ms)
    assert current(craft)['position'] == 'market'
    craft.locator('.game-nav [data-panel="cultivation"]').click()
    assert '尚未购鼎' in craft.locator('#panel').inner_text()
    craft.click('[data-act="cauldron"]')
    assert stored(craft)['alchemy']['cauldron'] == 1
    assert stored(craft)['player']['money'] == 840
    assert craft.locator('[data-act="alchemy"][data-recipe="heal"]').is_enabled()
    assert not craft.locator('[data-act="alchemy"][data-recipe="qi"]').is_enabled()
    craft.click('[data-act="alchemy"][data-recipe="heal"]')
    craft.select_option('#time-speed', '10');pump(craft, 2200)
    brewed = current(craft)
    assert brewed['alchemy']['brews'] == 1 and brewed['alchemy']['xp'] >= 1
    assert brewed['inventory']['herb'] == 9
    record('炼药师可实际前往长乐集购鼎，开炉消耗材料并积累熟练度')
    assert not cerrors, cerrors
    ctx.close()

    for width, height in [(390, 844), (320, 740)]:
        ctx, mobile, merrors = setup(browser, width, height)
        new_game(mobile, '行舟')
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
    'tests':results, 'passed':len(results), 'failed':0,
}, ensure_ascii=False, indent=2))
print(f'{len(results)} browser checks passed.')
