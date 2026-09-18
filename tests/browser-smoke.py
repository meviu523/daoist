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
 G.CityMap.prototype[name]=function(s){if(s)window.__live=G.clone(s);return old.call(this,s);};
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
    assert page.evaluate('NightCourier.PLACES.length') == 72
    assert page.evaluate('NightCourier.GRID_X.length===9 && NightCourier.GRID_Y.length===8')
    record('扩大地图为 9×8 路网并保留完整交互渲染')
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

    # Visibility is deliberately simulated, not a physical mobile OS suspend.
    page.select_option('#time-speed', '1')
    page.evaluate('''()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}''')
    old = stored(page)['minutes']
    page.evaluate('window.__now+=100000;window.__wall+=100000')
    assert current(page)['minutes'] == old
    page.evaluate('''()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}''')
    assert page.locator('[data-ui="pause"]').inner_text() == '暂停'
    pump(page, 2000)
    assert abs(current(page)['minutes']-old-2) < 1e-5
    record('页面隐藏不新增暂停，返回后自动按原状态继续且不补算离开时间')

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
    craft.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k)),s=x.saves[0];s.position='market';s.location=null;s.player.money=1000;s.inventory.herb=10;s.player.mana=60;localStorage.setItem(k,JSON.stringify(x));}''')
    craft.locator('[data-ui="load"]').first.click()
    craft.locator('.game-nav [data-panel="cultivation"]').click()
    assert '尚未购鼎' in craft.locator('#panel').inner_text()
    assert craft.locator('[data-act="cauldron"]').is_enabled()
    craft.click('[data-act="cauldron"]')
    assert stored(craft)['alchemy']['cauldron'] == 1
    assert stored(craft)['player']['money'] == 840
    assert craft.locator('[data-act="alchemy"][data-recipe="heal"]').is_enabled()
    assert not craft.locator('[data-act="alchemy"][data-recipe="qi"]').is_enabled()
    craft.click('[data-act="alchemy"][data-recipe="heal"]')
    pump(craft, 21000)
    brewed = current(craft)
    assert brewed['alchemy']['brews'] == 1 and brewed['alchemy']['xp'] >= 1
    assert brewed['inventory']['herb'] == 9
    record('炼药师界面可在长乐集购鼎，开炉消耗材料并积累熟练度')
    assert not cerrors, cerrors
    ctx.close()

    for width, height in [(390, 844), (320, 740)]:
        ctx, mobile, merrors = setup(browser, width, height)
        new_game(mobile, '行舟')
        pump(mobile, 100)
        mobile.screenshot(path=str(OUT/f'game-{width}.png'))
        assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
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

    ctx, alchemy, alchemy_errors = setup(browser, 1100, 850)
    new_game(alchemy, '丹客')
    alchemy.click('[data-ui="home"]')
    alchemy.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k)),s=x.saves[0];s.position='market';s.location=null;s.player.money=1000;s.inventory.herb=10;s.player.mana=60;localStorage.setItem(k,JSON.stringify(x));}''')
    alchemy.locator('[data-ui="load"]').first.click()
    alchemy.locator('.game-nav [data-panel="cultivation"]').click()
    assert '长乐集' in alchemy.locator('#panel').inner_text()
    alchemy.click('[data-act="cauldron"]')
    assert stored(alchemy)['alchemy']['cauldron'] == 1
    assert '青铜药鼎' in alchemy.locator('#panel').inner_text()
    alchemy.click('[data-act="alchemy"][data-recipe="heal"]')
    toggle(alchemy)
    alchemy.select_option('#time-speed', '10')
    pump(alchemy, 2500)
    brewed = stored(alchemy)
    assert brewed['alchemy']['brews'] == 1
    assert brewed['alchemy']['xp'] >= 1
    record('长乐集购买药鼎后可炼药，完成一炉会积累炼药熟练度')
    assert not alchemy_errors, alchemy_errors
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
    browser.close()

(OUT/'browser-tests.json').write_text(json.dumps({
    'mode':'offline Chromium bundle; controlled GameClock timestamps plus real-rAF probe; mocked storage and AI',
    'tests':results, 'passed':len(results), 'failed':0,
}, ensure_ascii=False, indent=2))
print(f'{len(results)} browser checks passed.')
