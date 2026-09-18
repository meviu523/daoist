"""Browser UI checks with in-memory Web Storage and AI mocks.
The sandbox Chromium blocks URL navigation; render the built offline page via
set_content. Real HTTP routes are independently covered by server.test.mjs.
Install Python Playwright and its browser before running outside this sandbox.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'
OUT.mkdir(exist_ok=True)
HTML=(ROOT/'dist/index.html').read_text()
BOOT=r'''
window.__memory = new Map();
window.__aiConfigured = false;
window.__aiDelay = 0;
window.__aiEvent = {title:'雨后的小灯',text:'巷口的店主在等一份热饭。',choices:[{label:'认真道谢',result:'店主也笑了。',effects:{qi:5}},{label:'请他喝一杯茶',result:'热茶驱散了寒意。',effects:{money:-5,karma:2}},{label:'留下祝福',result:'灯光亮了一点。',effects:{rep:1}}]};
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__memory.get(k)??null,setItem:(k,v)=>window.__memory.set(k,String(v)),removeItem:k=>window.__memory.delete(k),clear:()=>window.__memory.clear()}});
window.fetch = async (url,options={}) => {
 if(String(url).endsWith('/api/health')) return new Response(JSON.stringify({aiConfigured:window.__aiConfigured}));
 if(String(url).endsWith('/api/story')){
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,window.__aiDelay);options.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));});});
  return new Response(JSON.stringify({event:window.__aiEvent}));
 }
 throw new Error('Unexpected request in offline UI test');
};
'''
results=[]
def record(name):
 results.append({'name':name,'passed':True})
 print('PASS',name,flush=True)
def save(page):
 return page.evaluate("JSON.parse(localStorage.getItem('night-courier:saves:v3')).saves[0]")
def new_game(page,name='云行',mode='classic'):
 page.click('[data-ui="new-game"]')
 page.fill('#player-name-input',name)
 page.check(f'input[name="mode"][value="{mode}"]')
 page.click('#new-game-form button[type="submit"]')
 page.wait_for_selector('#game-screen:not([hidden])')
def setup(browser,viewport,ai=False):
 ctx=browser.new_context(viewport=viewport,has_touch=viewport['width']<600,device_scale_factor=1)
 page=ctx.new_page()
 errors=[]
 page.on('pageerror',lambda err:errors.append(str(err)))
 page.evaluate("() => {"+BOOT+"}")
 page.evaluate('(ai)=>window.__aiConfigured=ai',ai)
 page.set_content(HTML,wait_until='domcontentloaded')
 return ctx,page,errors
with sync_playwright() as p:
 executable=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')
 kwargs={'headless':True}
 if Path(executable).exists():kwargs['executable_path']=executable
 browser=p.chromium.launch(**kwargs)
 ctx,page,errors=setup(browser,{'width':1440,'height':1000})
 page.screenshot(path=str(OUT/'start-desktop.png'))
 new_game(page)
 page.wait_for_timeout(150)
 assert page.locator('.player-name').inner_text()=='云行'
 assert '外卖修仙录' not in page.locator('#game-header').inner_text()
 assert page.locator('.player-marker').count()==1
 assert page.locator('.map-point').count()<=13
 record('桌面开局、顶部玩家姓名、动态地图标记')
 page.screenshot(path=str(OUT/'game-desktop.png'))
 before=save(page)
 # Select via keyboard, the same accessible route used by actual SVG buttons.
 page.locator('.order-point').first.focus()
 page.keyboard.press('Enter')
 assert page.locator('[data-act="deliver"]').count()==1
 page.screenshot(path=str(OUT/'order-desktop.png'))
 page.click('[data-act="deliver"]')
 accepted=save(page)
 assert accepted['pending'] and accepted['stats']['delivered']==0
 assert accepted['position']!=before['position']
 page.screenshot(path=str(OUT/'event-desktop.png'))
 page.click('[data-act="choose"][data-index="0"]')
 assert save(page)['stats']['delivered']==1
 assert page.locator('#panel').evaluate('(d)=>d.open') is False
 record('地图接单、移动、三选项事件和延后结算')
 page.locator('.game-nav [data-panel="system"]').click()
 old=save(page)
 page.click('[data-act="sign"]')
 signed=save(page)
 assert signed['minutes']==old['minutes'] and signed['player']['coins']>old['player']['coins']
 page.click('[data-act="buy"][data-id="qi"]')
 bought=save(page)
 assert bought['minutes']==signed['minutes']
 assert bought['position']==signed['position']
 assert bought['inventory']['qi']==signed['inventory']['qi']+1
 page.screenshot(path=str(OUT/'system-desktop.png'))
 page.click('[data-ui="close"]')
 record('远程系统签到、即时兑换且不耗时')
 page.click('[data-ui="home"]')
 assert page.locator('.save-card').count()==1
 new_game(page,'青禾','ai')
 assert save(page)['mode']=='ai'
 page.click('[data-ui="home"]')
 assert page.locator('.save-card').count()==2
 page.locator('.save-card').filter(has_text='云行').locator('[data-ui="load"]').click()
 assert save(page)['mode']=='ai'  # recently-written save remains first in library
 assert page.locator('.player-name').inner_text()=='云行'
 record('两份独立存档与开始页重新载入')
 # Preview night/cultivation with a deliberately injected QA fixture.
 page.click('[data-ui="home"]')
 page.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k));const s=x.saves.find(s=>s.name==='云行');s.minutes=1200;s.player.qi=90;s.player.coins=40;localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''')
 page.locator('.save-card').filter(has_text='云行').locator('[data-ui="load"]').click()
 page.locator('.game-nav [data-panel="cultivation"]').click()
 page.screenshot(path=str(OUT/'cultivation-desktop.png'))
 assert '夜间灵气 +45%' in page.locator('#panel').inner_text()
 page.click('[data-ui="close"]')
 before_zoom=float(page.locator('#city-map').get_attribute('data-zoom'))
 page.click('[data-ui="zoom-in"]')
 assert float(page.locator('#city-map').get_attribute('data-zoom'))>before_zoom
 old_transform=page.locator('.world-layer').get_attribute('transform')
 page.mouse.move(700,550);page.mouse.down();page.mouse.move(790,600,steps=6);page.mouse.up()
 assert page.locator('.world-layer').get_attribute('transform')!=old_transform
 record('夜间修炼界面、按钮缩放与鼠标平移')
 assert not errors,errors
 record('桌面流程无 JavaScript 运行时异常')
 ctx.close()
 # Mobile geometry and gestures.
 ctx,mobile,merrors=setup(browser,{'width':390,'height':844})
 mobile.screenshot(path=str(OUT/'start-mobile.png'),full_page=True)
 new_game(mobile,'行舟')
 mobile.wait_for_timeout(100)
 assert float(mobile.locator('#city-map').get_attribute('data-zoom')) >= .9
 mobile.screenshot(path=str(OUT/'game-mobile.png'))
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 nav=mobile.locator('#game-nav').bounding_box()
 assert nav['x']>=0 and nav['x']+nav['width']<=390.5 and nav['y']+nav['height']<=844
 mobile.locator('.game-nav [data-panel="system"]').click()
 mobile.screenshot(path=str(OUT/'system-mobile.png'))
 panel=mobile.locator('#panel').bounding_box()
 assert panel['x']>=0 and panel['y']>=0 and panel['y']+panel['height']<=844
 assert mobile.locator('[data-act="sign"]').is_visible()
 mobile.click('[data-ui="close"]')
 record('390px 手机布局、导航与可滚动系统面板')
 before_zoom=float(mobile.locator('#city-map').get_attribute('data-zoom'))
 cdp=ctx.new_cdp_session(mobile)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':145,'y':420},{'x':245,'y':420}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':110,'y':420},{'x':280,'y':420}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 after_zoom=float(mobile.locator('#city-map').get_attribute('data-zoom'))
 assert after_zoom>before_zoom,(before_zoom,after_zoom)
 assert mobile.locator('#panel').evaluate('(d)=>d.open') is False
 record('双指缩放不误触任务标记')
 assert not merrors,merrors
 record('手机流程无 JavaScript 运行时异常')
 ctx.close()
 # AI mode: successful mock generation and stale-response cancellation.
 ctx,ai,aerrors=setup(browser,{'width':1200,'height':900},ai=True)
 new_game(ai,'听雨','ai')
 ai.click('[data-ui="home"]')
 ai.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k));const s=x.saves[0];s.position='park';s.flags.firstOrder=true;localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''')
 ai.click('[data-ui="load"]')
 ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
 ai.click('[data-act="explore"]')
 ai.wait_for_function("document.querySelector('#panel-title').textContent==='雨后的小灯'")
 assert save(ai)['pending']['source']=='ai'
 ai.click('[data-act="choose"][data-index="0"]')
 assert save(ai)['pending'] is None
 record('AI 模式成功接收有界事件（模拟接口）')
 ai.evaluate('window.__aiDelay=1500')
 ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter');ai.click('[data-act="explore"]')
 ai.click('[data-act="choose"][data-index="0"]')
 settled=save(ai)
 ai.wait_for_timeout(1700)
 assert save(ai)['pending'] is None
 assert save(ai)['player']==settled['player']
 record('提前选择经典事件后，迟到 AI 回包不会覆盖状态')
 assert not aerrors,aerrors
 ctx.close();browser.close()
(OUT/'browser-tests.json').write_text(json.dumps({'mode':'offline-render-with-storage-and-ai-mocks','tests':results,'passed':len(results),'failed':0},ensure_ascii=False,indent=2))
print(f'{len(results)} browser checks passed.')
