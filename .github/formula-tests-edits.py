# Temporary, hash-verified source transport; removed before the PR is merged.
import hashlib,pathlib
writes=[]
def patch(name,before,after,edits):
    p=pathlib.Path(name)
    text=p.read_text() if p.exists() else ''
    assert hashlib.sha256(text.encode()).hexdigest()==before, 'Unexpected baseline: '+name
    for start,end,value in reversed(edits):
        text=text[:start]+value+text[end:]
    assert hashlib.sha256(text.encode()).hexdigest()==after, 'Result differs from tested source: '+name
    writes.append((p,text))

patch('tests/browser-smoke.py','129d00fca823826a6068ed26b7eb4ba4b38e437abed671f2a6b003f2de3d59c7','cfed58ced7e3b644e580d29d8e949342b87fb4904d0e22141b612c8e8677d021',[
(3625,3625,r'''
    page.set_default_timeout(7000)

'''[1:-1]),
(4251,4251,r'''
    if page.locator('#panel[open] [data-ui="close"]').count():
        page.click('#panel [data-ui="close"]')

'''[1:-1]),
(15070,15070,r'''
    assert craft.evaluate('(id)=>NightCourier.alchemyRecipe(id).acquisition.type', acquired[0]) == 'shop'

'''[1:-1]),
(15457,15457,r'''
    assert '获取途径：商店购买' in panel_text

'''[1:-1]),
(15851,15851,r'''
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
        formula.locator('.game-nav [data-panel="cultivation"]').click()
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
        formula.locator('.game-nav [data-panel="cultivation"]').click()
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
    story.locator('.game-nav [data-panel="cultivation"]').click()
    assert '获取途径：剧情 · 地图上多出来的一条线' in story.locator('#panel').inner_text()
    assert not serrs, serrs
    record('剧情待选读档不提前领丹方，真实点击结算获得六张，重载不重复奖励')

'''[1:-1]),
])

patch('tests/engine.test.mjs','f2bf813bbc575bdc532fc08474e4f2dcf71133caafe17c8bf77765be804f21a3','72e21fb1fe686f458ed91c5118f3b5a943c624c2893c05676fe6c2c8cc1a524d',[
(30638,31025,r'''
普通探索不直接掉落丹方，不能绕过剧情羁绊和购买',()=>{for(let seed=1;seed<80;seed++){const s=fresh('classic',seed);s.position='park';s.player.luck=99;const a=run(s,'explore');assert.deepEqual(a.alchemy.formulas,[]);assert.ok(a.pending);}
'''[1:-1]),
])

patch('tests/formula-acquisition.test.mjs','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','8bd359acd62627ab4e450a6fc1ff8280e6a9fd79cbbdb390e95604d341faea0f',[
(0,0,r'''
import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
import '../public/js/storage.js';
import '../public/js/progression.js';
const G=globalThis.NightCourier;
const fresh=(mode='classic')=>G.newGame('传方',mode,789);
const act=(s,action,payload={})=>{const r=G.perform(s,action,payload);assert.ok(r.ok,r.error);return r.state;};
const finish=s=>{for(let i=0;s.activity&&i<200;i++)s=G.advance(s,1);assert.equal(s.activity,null);return s;};
const copy=s=>G.sanitizeSave(G.clone(s));
const ofType=type=>G.ALCHEMY_RECIPES.filter(r=>r.acquisition.type===type);
const ofStory=source=>ofType('story').filter(r=>source.quest?r.acquisition.quest===source.quest:r.acquisition.event===source.event);
function storyPending(s,source){
  const e=G.EVENTS.find(e=>e.id===source.event);
  s.flags[source.flag]=true;
  s.pending={...G.clone(e),id:'story-formula-test',templateId:e.id,source:'classic',aiStatus:'skip'};
  return s;
}
const learned=s=>new Set(s.alchemy.formulas);
const bondRecipes=id=>ofType('bond').filter(r=>r.acquisition.npc===id);

test('108 张丹方唯一归属剧情/羁绊/商店，各 36 张；每类丹药各三张',()=>{
  assert.equal(G.ALCHEMY_RECIPES.length,108);
  assert.equal(new Set(G.ALCHEMY_RECIPES.map(r=>r.id)).size,108);
  for(const type of ['story','bond','shop']){
    assert.equal(ofType(type).length,36);
    for(const p of G.PILL_TYPES)assert.equal(ofType(type).filter(r=>r.product===p.id).length,3);
  }
  for(const source of G.FORMULA_STORY_SOURCES){
    assert.equal(ofStory(source).length,6);
    assert.ok(source.quest?G.QUESTS.some(q=>q.id===source.quest):G.EVENTS.some(e=>e.id===source.event&&e.flag===source.flag));
  }
});
test('新档没有丹方，不因等级、药鼎、熟练度自动学会',()=>{
  let s=fresh();s.player.realm=5;s.alchemy.xp=999;s.alchemy.cauldron=24;
  s=act(s,'sign');assert.deepEqual(s.alchemy.formulas,[]);
});
test('商店买齐 36 张也不会取得专属丹方，再买不扣钱、不推进时间或 RNG',()=>{
  let s=fresh();s.position='market';s.player.realm=5;s.player.money=100000;
  const at=s.minutes,initial=s.player.money,cost=G.formulaScrollCost(s);
  while(G.formulaMarketCandidates(s).length)s=act(s,'formula');
  assert.equal(s.alchemy.formulas.length,36);assert.ok(s.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.type==='shop'));
  assert.equal(s.player.money,initial-36*cost);assert.equal(s.minutes,at);
  const before=JSON.stringify(s),r=G.perform(s,'formula');assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),before);
});
test('商店保留境界门槛；现金不足、未到场、指定专属 ID 均原子失败',()=>{
  let s=fresh();s.position='market';s.player.money=10000;
  assert.ok(G.formulaMarketCandidates(s).every(r=>r.realm===0&&r.acquisition.type==='shop'));
  for(const payload of [{id:ofType('story')[0].id},{recipe:ofType('bond')[0].id}]){
    const before=JSON.stringify(s),r=G.perform(s,'formula',payload);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),before);
  }
  s.player.money=0;assert.equal(G.perform(s,'formula').ok,false);
  s.player.money=10000;s.position='home';assert.equal(G.perform(s,'formula').ok,false);
});
test('首单委托必须领取，领取时送六张剧情方；重复领取不重复发',()=>{
  let s=fresh();s.stats.delivered=1;
  assert.equal(act(s,'sign').alchemy.formulas.length,0);
  const before=JSON.stringify(s);const a=act(s,'claim',{id:'q1'});assert.equal(JSON.stringify(s),before);
  assert.equal(a.alchemy.formulas.length,6);assert.equal(a.minutes,s.minutes);
  assert.ok(a.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.quest==='q1'));
  assert.equal(G.perform(a,'claim',{id:'q1'}).ok,false);assert.deepEqual(copy(a).alchemy.formulas,a.alchemy.formulas);
});
for(const source of G.FORMULA_STORY_SOURCES.filter(x=>x.event))test(`剧情完成后发方，待选/读档不提前发：${source.label}`,()=>{
  const s=storyPending(fresh('ai'),source),ids=ofStory(source).map(r=>r.id);
  assert.ok(ids.every(id=>!learned(copy(s)).has(id)));
  const blocked=G.perform(s,'choose',{eventId:s.pending.id,index:9});assert.equal(blocked.ok,false);assert.equal(blocked.state,s);
  const done=act(copy(s),'choose',{eventId:s.pending.id,index:0});
  assert.ok(ids.every(id=>learned(done).has(id)));assert.equal(done.alchemy.formulas.length,6);
  assert.equal(done.minutes,s.minutes);assert.equal(done.alchemy.xp,s.alchemy.xp);
  assert.equal(G.perform(done,'choose',{eventId:s.pending.id,index:0}).ok,false);
  const reread=copy(done);assert.deepEqual(reread.alchemy.formulas,done.alchemy.formulas);
  assert.equal(reread.logs.filter(l=>l.tag==='炼药').length,done.logs.filter(l=>l.tag==='炼药').length);
});
test('自然触发主线时只弹剧情，实际选择后才发丹方',()=>{
  let s=fresh();s.flags.firstOrder=true;s.stats.delivered=3;
  s=finish(act(s,'rest'));assert.equal(s.pending.templateId,'story-street-vein');assert.deepEqual(s.alchemy.formulas,[]);
  s=act(s,'choose',{eventId:s.pending.id,index:0});assert.equal(s.alchemy.formulas.length,6);
});
test('耗时剧情选择只在结束时发方，中途读档不提前领取',()=>{
  const source=G.FORMULA_STORY_SOURCES[1],event=G.EVENTS.find(e=>e.id===source.event);
  const old=event.choices[0].duration;event.choices[0].duration=10;
  try{
    let s=storyPending(fresh(),source);s=act(s,'choose',{eventId:s.pending.id,index:0});
    assert.equal(s.activity.kind,'choice');assert.deepEqual(s.alchemy.formulas,[]);
    s=copy(G.advance(s,5));assert.deepEqual(s.alchemy.formulas,[]);
    s=finish(s);assert.equal(s.alchemy.formulas.length,6);
  }finally{if(old===undefined)delete event.choices[0].duration;else event.choices[0].duration=old;}
});
test('房租破产先于同刻剧情完成，不能拿到该段丹方',()=>{
  const source=G.FORMULA_STORY_SOURCES[1],event=G.EVENTS.find(e=>e.id===source.event);
  const old=event.choices[0].duration;event.choices[0].duration=10;
  try{
    let s=storyPending(fresh(),source);s.minutes=6*1440-10;s.player.money=0;
    s=act(s,'choose',{eventId:s.pending.id,index:0});s=G.advance(s,10);
    assert.ok(s.gameOver);assert.deepEqual(s.alchemy.formulas,[]);assert.deepEqual(copy(s).alchemy.formulas,[]);
  }finally{if(old===undefined)delete event.choices[0].duration;else event.choices[0].duration=old;}
});
for(const npc of G.NPCS)test(`${npc.name}分三次传方，每次两张；不绑定情感路线`,()=>{
  let s=fresh();const bond=s.bonds[npc.id];bond.met=true;
  for(const [i,m] of G.FORMULA_BOND_MILESTONES.entries()){
    bond.stage=m.stage;bond.trust=m.trust-1;
    assert.equal(copy(s).alchemy.formulas.length,i*2);
    bond.trust=m.trust;s=copy(s);
    assert.equal(s.alchemy.formulas.length,(i+1)*2);
    assert.ok(s.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.npc===npc.id));
    // sanitizeSave creates a new state; update the current bond for the next milestone.
    Object.assign(bond,s.bonds[npc.id]);s.bonds[npc.id]=bond;
  }
  assert.equal(s.bonds[npc.id].path,'none');assert.equal(G.formulaBondProgress(s,npc.id).next,null);
  assert.deepEqual(copy(s).alchemy.formulas,s.alchemy.formulas);
});
test('高好感不能替代信任和人物章节；未结识人物没有传方进度',()=>{
  const s=fresh();assert.equal(G.formulaBondProgress(s,'lin'),null);
  s.bonds.lin.affinity=100;s.bonds.lin.trust=100;
  assert.equal(act(s,'sign').alchemy.formulas.length,0);
  s.bonds.lin.met=true;assert.equal(act(s,'sign').alchemy.formulas.length,0);
  s.bonds.lin.stage=4;s.bonds.lin.trust=0;assert.equal(act(s,'sign').alchemy.formulas.length,0);
});
test('实际拜访只弹人物章节，选择结算后才得到传方',()=>{
  let s=fresh();s.position='clinic';s.bonds.lin.met=true;
  s=finish(act(s,'visit',{id:'lin'}));assert.ok(s.pending.npcAdvance);assert.deepEqual(s.alchemy.formulas,[]);
  s=act(s,'choose',{eventId:s.pending.id,index:s.pending.choices.findIndex(c=>c.effects.trust>=3)});assert.equal(s.bonds.lin.stage,1);
  assert.equal(s.alchemy.formulas.length,2);assert.ok(s.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.npc==='lin'));
});
test('信任下降不会收回已学丹方，再达标不会重复发',()=>{
  let s=fresh();Object.assign(s.bonds.lin,{met:true,stage:4,trust:100});s=copy(s);
  assert.equal(s.alchemy.formulas.length,6);s.bonds.lin.trust=0;const low=copy(s);assert.deepEqual(low.alchemy.formulas,s.alchemy.formulas);
  low.bonds.lin.trust=100;assert.deepEqual(copy(low).alchemy.formulas,s.alchemy.formulas);
});
test('已获得不等于可炼制，羁绊传方仍校验炼药能力',()=>{
  let s=fresh();Object.assign(s.bonds.lin,{met:true,stage:4,trust:100});s=copy(s);
  const recipe=bondRecipes('lin').at(-1);assert.ok(G.alchemyHasFormula(s,recipe));assert.equal(G.alchemyQualified(s,recipe),false);
  const before=JSON.stringify(s);assert.equal(G.perform(s,'alchemy',{recipe:recipe.id}).ok,false);assert.equal(JSON.stringify(s),before);
});
test('隐藏丹方的错误提示不泄露名称',()=>{
  const s=fresh();for(const recipe of G.ALCHEMY_RECIPES){const r=G.perform(s,'alchemy',{recipe:recipe.id});assert.equal(r.ok,false);assert.ok(!r.error.includes(recipe.name));}
});
test('旧档已购的专属方保留，过去已完成剧情/羁绊的奖励只补一次',()=>{
  let s=fresh();const id=ofType('bond')[0].id;s.alchemy.formulas=[id];s.flags.storyStreetVein=true;
  Object.assign(s.bonds.chen,{met:true,stage:2,trust:9});const raw=JSON.stringify(s);const a=copy(s);
  assert.equal(JSON.stringify(s),raw);assert.ok(a.alchemy.formulas.includes(id));assert.equal(a.alchemy.formulas.length,11);
  assert.deepEqual(copy(a).alchemy.formulas,a.alchemy.formulas);assert.equal(copy(a).logs.length,a.logs.length);
});
test('所有专属奖励均可确定取得；多存档之间不共享所有权',()=>{
  const a=fresh(),b=fresh();a.claimed=['q1'];for(const source of G.FORMULA_STORY_SOURCES)if(source.flag)a.flags[source.flag]=true;
  for(const bond of Object.values(a.bonds))Object.assign(bond,{met:true,stage:4,trust:100});
  const got=copy(a);assert.equal(got.alchemy.formulas.length,72);assert.ok(got.alchemy.formulas.every(id=>G.alchemyRecipe(id).acquisition.type!=='shop'));
  assert.deepEqual(b.alchemy.formulas,[]);
});

'''[1:-1]),
])

for p,text in writes:
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(text)
