from pathlib import Path

def edit(file, old, new):
    path=Path(file); text=path.read_text()
    assert old in text, (file, old)
    path.write_text(text.replace(old,new))

edit('public/js/data.js', "G.APP_VERSION = '1.7.0';", "G.APP_VERSION = '1.7.1';\n  G.STARTING_PLACES = Object.freeze(['home','garage']);")
edit('public/js/engine.js', "unlockedPlaces: ['home']", "unlockedPlaces: [...G.STARTING_PLACES]")
edit('public/js/storage.js', "if(!s.unlockedPlaces.includes('home')||!G.placeUnlocked(s,G.currentResidence(s).place))throw new Error('当前住处缺少地点解锁记录。');", "if(!s.unlockedPlaces.includes('home')||!G.placeUnlocked(s,G.currentResidence(s).place))throw new Error('当前住处缺少地点解锁记录。');\n      // 1.7.1 将修车点改为初始地点；旧 v12 补齐例外，不发发现奖励或开放其他地点。\n      for(const id of G.STARTING_PLACES)if(!s.unlockedPlaces.includes(id))s.unlockedPlaces.push(id);")
edit('package.json', '"version": "1.7.0"', '"version": "1.7.1"')
edit('public/js/app.js', '新旅程仅解锁青藤小屋。', '新旅程默认解锁青藤小屋和阿默修车铺。')
edit('public/js/app.js', '修车铺、医馆、书店、集市、修行地点与其他住处发现后', '医馆、书店、集市、修行地点与其他住处发现后')
edit('public/js/app.js', '修车铺需通过外卖送达解锁。', '修车铺从开局开放，可直接前往维修。')
for file in ['README.md','PROJECT_MEMORY.md']:
    edit(file, '新旅程只开放起始住处「青藤小屋」。', '新旅程默认开放起始出租屋「青藤小屋」和「阿默修车铺」。')
    edit(file, '修车铺、医馆、书店、长乐集、听雨观、沿江公园及另外两处住处，发现后', '医馆、书店、长乐集、听雨观、沿江公园及另外两处住处，发现后')
edit('README.md', '版本 **1.7.0**', '版本 **1.7.1**')
edit('README.md', '## 1.7.0：通过外卖认识地点（最新）', '## 1.7.1：出租屋与修车点默认开放（最新）\n\n按最新要求，这两处地点不需要外卖解锁。1.7.0 的 v12 旧档载入时会补齐修车铺，不改时间、余额、人物关系、订单或其他地点记录；升级仍需完成五单。')
p=Path('PROJECT_MEMORY.md');t=p.read_text();p.write_text(t.replace('## 这份记录的性质','## 2026-09-19 补充：出租屋和修车点例外（1.7.1）\n\n用户明确这两处不需要通过外卖解锁。新档开放 home/garage，其他地点延续成功交付解锁；已有 v12 读档补 garage，原资产、订单、地点和独立玩法门槛均保留。\n\n## 这份记录的性质',1))
edit('docs/ARCHITECTURE.md', '新档仅含 `home`。', '新档由 `G.STARTING_PLACES` 独立复制 `home`、`garage`。这是用户指定的初始例外，其他地点仍通过成功交付解锁。')
edit('docs/ARCHITECTURE.md', 'v12要求有效白名单数组、起始小屋和当前住宅，去重但不静默清空损坏记录；', 'v12要求有效白名单数组、起始小屋和当前住宅，去重但不静默清空损坏记录；1.7.1 在校验后补齐修车铺初始权限，不改变资产、时间、订单或其他地点，也不发送发现奖励；')
file='tests/location-unlocks.test.mjs'
edit(file, "['home']", "['home','garage']")
edit(file, '真实新档只拥有起始住处', '真实新档只拥有出租屋和修车点')
edit(file, 's.bonds.chen', 's.bonds.shen')
edit(file, "id:'chen'", "id:'shen'")
edit(file, "G.placeUnlocked(s,'garage'),false", "G.placeUnlocked(s,'bookshop'),false")
edit(file, "['garage','visit'", "['bookshop','visit'")
edit(file, "['garage','repair',{}],['garage','upgrade',{kind:'speed'}],", '')
edit(file, "p.permanent&&p.id!=='home'", 'p.permanent&&!G.STARTING_PLACES.includes(p.id)')
edit(file, "assert.deepEqual(read(s).unlockedPlaces,['home','market']);", "assert.deepEqual(read(s).unlockedPlaces,['home','market','garage']);")
p=Path(file)
p.write_text(p.read_text()+'''\nfor(const mode of ['classic','ai'])test(`${mode}初始地点独立保存，不自动结识修车铺人物`,()=>{
  const a=fresh(mode),b=fresh(mode);assert.deepEqual(a.unlockedPlaces,['home','garage']);
  assert.equal(a.bonds.chen.met,false);assert.equal(G.panelUnlocked(a,'bonds'),false);
  a.unlockedPlaces.push('market');assert.deepEqual(b.unlockedPlaces,['home','garage']);
});

test('零单即可沿真实道路前往修车点维修，升级仍需五单',()=>{
  let s=fresh();s.vehicle.durability=20;s=act(s,'travel',{target:'garage'});
  assert.ok(s.activity);assert.equal(s.position,'home');s=finish(s);assert.equal(s.position,'garage');
  s=finish(act(s,'repair'));assert.equal(s.vehicle.durability,G.limits(s).durability);
  assert.equal(s.stats.delivered,0);assert.equal(discoveryLogs(s).length,0);
  assert.match(reject(s,'upgrade',{kind:'speed'}),/尚未开启/);
});

test('旧v12补齐修车点但不改资产、时间、其他地点或日志，反复读档不重复',()=>{
  const s=fresh();s.unlockedPlaces=['home'];const a=read(s);
  assert.deepEqual(a.unlockedPlaces,['home','garage']);assert.deepEqual(a.player,s.player);
  assert.equal(a.minutes,s.minutes);assert.deepEqual(a.orders,s.orders);assert.deepEqual(a.logs.map(({id,...l})=>l),s.logs.map(({id,...l})=>l));
  assert.deepEqual(read(a).unlockedPlaces,a.unlockedPlaces);
});

test('旧v12在修车点待交付读档不提前结算、不送发现奖励',()=>{
  let s=arrive(fresh(),'garage');assert.ok(s.pending?.delivery);s.unlockedPlaces=['home'];
  const cash=s.player.money;s=read(s);assert.deepEqual(s.unlockedPlaces,['home','garage']);
  assert.equal(s.stats.delivered,0);assert.equal(s.player.money,cash);assert.ok(s.pending?.delivery);
  s=choose(s);assert.equal(s.stats.delivered,1);assert.equal(discoveryLogs(s).length,0);
});
''')
edit('tests/browser-smoke.py', "== ['home']", "== ['home', 'garage']")
edit('tests/browser-smoke.py', '新档只开放小屋，', '新档默认开放小屋和修车点，')

edit('tests/gameplay-unlocks.test.mjs', '开局低资源可基础自救；维修搬家还需地点解锁', '开局低资源可基础自救；维修默认开放，搬家还需地点解锁')
edit('tests/gameplay-unlocks.test.mjs', "assert.equal(G.perform(s,'repair').ok,false);s.unlockedPlaces.push('garage');assert.ok(G.perform(s,'repair').ok);", "assert.ok(G.perform(s,'repair').ok);")
