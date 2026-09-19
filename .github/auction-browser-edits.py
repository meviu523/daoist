# Temporary source transport. Every baseline and result is checked before writing.
import pathlib,hashlib
writes=[]
def patch(name,before,after,edits):
    p=pathlib.Path(name)
    text=p.read_text() if p.exists() else ''
    assert hashlib.sha256(text.encode()).hexdigest()==before, 'Unexpected baseline: '+name
    lines=text.splitlines(keepends=True)
    for start,end,value in reversed(edits):
        assert 0<=start<=end<=len(lines),name
        lines[start:end]=[value]
    text=''.join(lines)
    assert hashlib.sha256(text.encode()).hexdigest()==after, 'Result differs from tested source: '+name
    writes.append((p,text))

patch('tests/browser-smoke.py','5b1a4dac8f3a72a6f399c5b8e078edec78519957beb16c8ba2507d0914b948d6','ab8325af0a77397303bd33229f670a60bc1c59cc0f77476ec9b2d7540d091edc',[
(263,264,r'''
        assert len(nav()) == 9
'''[1:]),
(276,277,r'''
        assert len(nav()) == 9
'''[1:]),
(280,280,r"""
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
"""[1:]),
(288,288,r'''
    auction_browser_checks(browser)
'''[1:]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
