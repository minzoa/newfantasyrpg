import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Start `npm run dev` first. The development fixture can reposition the player;
// it cannot change HP, grant rewards, kill enemies, or skip campaign gates.
const base=process.env.ASTRALIA_URL||'http://127.0.0.1:5173';
await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:process.env.ASTRALIA_BROWSER||'chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const results=[];
const screenshot=async name=>{await page.waitForTimeout(name==='title'?2100:400);await page.screenshot({path:`test-results/${name}.png`});};
const snap=()=>page.evaluate(()=>window.__ASTRALIA_TEST__.snapshot());
const call=(method,...args)=>page.evaluate(({method,args})=>window.__ASTRALIA_TEST__[method](...args),{method,args});
const step=async(name,fn)=>{const begin=Date.now();await fn();results.push({name,passed:true,durationMs:Date.now()-begin});console.log(`PASS ${name}`);};
const waitPlay=()=>page.waitForFunction(()=>window.__ASTRALIA_TEST__?.snapshot().screen==='play',{},{timeout:15000});
const interactAt=async(x,z)=>{await call('position',x,z);await page.keyboard.press('KeyE');await page.waitForTimeout(250);};

async function fight(ids,boss=false) {
  const deadline=Date.now()+(boss?180000:120000);
  let observedDamage=false,observedPhase2=false;
  while(Date.now()<deadline) {
    const s=await snap();
    if(s.screen==='death')throw new Error('Player died during campaign combat');
    const targets=s.enemies.filter(e=>ids.includes(e.id));
    if(!targets.length)return {observedDamage,observedPhase2};
    const target=targets[0];
    if(s.state.player.hp<s.stats.maxHp)observedDamage=true;
    if(s.boss?.phase===2)observedPhase2=true;
    if(s.state.player.hp<s.stats.maxHp*.55&&s.state.player.potions>0)await call('action','potion');
    // Skip navigation in combat fixtures, then use the real animation-timed hit system.
    const distance=s.stats.style==='staff'?6:2.5;
    await call('position',target.x,target.z+distance,0);
    if(s.state.player.level>=3&&s.cooldowns.r<=0&&s.state.player.mana>=30)await call('attack','r');
    else if(s.cooldowns.q<=0&&s.state.player.mana>=18&&distance<5.7)await call('attack','q');
    else await call('attack','basic');
    await page.waitForTimeout(280);
  }
  throw new Error(`Combat timeout: ${JSON.stringify((await snap()).enemies)}`);
}

try {
  await page.goto(`${base}/?test=1`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.__ASTRALIA_TEST__,{},{timeout:30000});
  await step('title renders original 3D world and functional menu',async()=>{
    assert.equal((await snap()).screen,'title');
    await screenshot('title');
  });
  await step('new game, keyboard movement, mouse camera and pause',async()=>{
    await page.getByRole('button',{name:/여정 시작|새로운 여정|새 여정|게임 시작/}).first().click();
    await waitPlay();
    const before=await snap();
    await page.keyboard.down('KeyW');await page.waitForTimeout(600);await page.keyboard.up('KeyW');
    assert.ok((await snap()).player.z<before.player.z-.3,'W moves player');
    await page.mouse.move(720,400);await page.mouse.down({button:'middle'});await page.mouse.move(820,420,{steps:8});await page.mouse.up({button:'middle'});
    await page.keyboard.press('Escape');assert.equal((await snap()).screen,'pause');
    const paused=await snap();await page.waitForTimeout(400);assert.equal((await snap()).state.stats.playTime,paused.state.stats.playTime);
    await page.keyboard.press('Escape');await waitPlay();
    await screenshot('haven');
  });
  await step('NPC acceptance, chest, inventory and equipment change',async()=>{
    await interactAt(-4,2);assert.equal((await snap()).screen,'dialogue');
    await call('action','accept');assert.equal((await snap()).state.quest.accepted,true);
    await interactAt(-12,7);assert.ok((await snap()).state.world.openedChests.includes('haven-cache'));
    await page.keyboard.press('KeyI');assert.equal((await snap()).screen,'inventory');
    await call('action','equip','apprentice-staff');assert.equal((await snap()).stats.style,'staff');
    await call('action','equip','wanderer-blade');assert.equal((await snap()).stats.style,'sword');
    await screenshot('inventory');
    await page.keyboard.press('KeyI');await waitPlay();
  });
  await step('forest gate, enemy AI damage, timed melee, dodge, loot and leveling',async()=>{
    await interactAt(0,-15);assert.equal((await snap()).zone,'forest');
    await call('position',-3,8.8,0);
    const hp=(await snap()).state.player.hp;
    await page.waitForFunction(hp=>window.__ASTRALIA_TEST__.snapshot().state.player.hp<hp,hp,{timeout:20000});
    await page.keyboard.press('ShiftLeft');await page.waitForTimeout(100);assert.ok((await snap()).cooldowns.dash>0);
    await fight(['f1','f2','f3','f4','f5']);
    const s=await snap();assert.equal(s.state.quest.forestKills,5);assert.ok(s.state.player.level>=2);assert.ok(s.state.player.gold>100);
    await call('position',0,3);await screenshot('forest');
    await interactAt(-17,-6);await call('action','equip','verdant-charm');await call('action','talent','power');
    await call('action','claim','forest-clear');const gold=(await snap()).state.player.gold;await call('action','claim','forest-clear');assert.equal((await snap()).state.player.gold,gold);
    await interactAt(0,-14);assert.equal((await snap()).state.quest.forestShard,true);
  });
  await step('temple enemies, ranged staff, rune reset and correct puzzle',async()=>{
    await interactAt(0,-21);assert.equal((await snap()).zone,'temple');
    await interactAt(18,6);await call('action','equip','constellation-staff');assert.equal((await snap()).stats.style,'staff');
    await fight(['t1','t2','t3','t4']);
    await interactAt(12,-4);assert.equal((await snap()).state.quest.runes.length,0);
    await interactAt(-12,-4);await interactAt(0,-10);await interactAt(12,-4);assert.deepEqual((await snap()).state.quest.runes,[0,1,2]);
    await interactAt(0,-15);assert.equal((await snap()).state.quest.templeShard,true);
    await call('position',0,12);await screenshot('temple');
  });
  await step('shop transaction, talents, rest and saving survives reload',async()=>{
    await interactAt(0,22);assert.equal((await snap()).zone,'forest');
    await interactAt(0,21);assert.equal((await snap()).zone,'haven');
    await interactAt(7,3);assert.equal((await snap()).screen,'shop');
    const before=(await snap()).state.player.gold;await call('action','buy','sentinel-mail');assert.equal((await snap()).state.player.gold,before-95);
    await call('action','equip','sentinel-mail');await call('action','talent','power');await call('action','talent','spirit');
    await call('action','close');await interactAt(0,-2);await call('action','save');
    const state=(await snap()).state;
    await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__ASTRALIA_TEST__);
    assert.equal((await snap()).saveAvailable,true);
    // Title settings must never overwrite an existing campaign with initial state.
    await call('action','settings');await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__ASTRALIA_TEST__);
    await call('action','continue');await waitPlay();
    const restored=(await snap()).state;assert.deepEqual(restored.player.equipment,state.player.equipment);assert.equal(restored.quest.templeShard,true);assert.equal(restored.player.gold,state.player.gold);
  });
  await step('boss phase change, original patterns, defeat reward and ending',async()=>{
    await interactAt(0,-15);await interactAt(0,-21);await interactAt(0,-21);assert.equal((await snap()).zone,'rift');
    await call('action','claim','explorer');await call('action','claim','treasure');await interactAt(-10,16);
    await call('position',0,12);await screenshot('rift');
    const fightResult=await fight(['b1'],true);assert.equal(fightResult.observedPhase2,true);
    await page.waitForFunction(()=>window.__ASTRALIA_TEST__.snapshot().screen==='ending',{},{timeout:30000});
    const s=await snap();assert.equal(s.state.quest.bossDefeated,true);assert.ok(s.state.player.inventory.includes('astral-crown'));assert.ok(s.state.world.defeated.includes('b1'));
    await screenshot('ending');
    await call('action','save');await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__ASTRALIA_TEST__);await call('action','continue');assert.equal((await snap()).state.quest.bossDefeated,true);
  });
  await step('rematch keeps permanent clear and no duplicate rewards',async()=>{
    const original=(await snap()).state;await call('action','restart-boss');
    const s=await snap();assert.equal(s.enemies.length,1);assert.equal(s.state.quest.bossDefeated,true);assert.ok(s.state.world.defeated.includes('b1'));assert.equal(s.state.player.gold,original.player.gold);
    await fight(['b1'],true);assert.equal((await snap()).state.player.gold,original.player.gold);
  });
  assert.deepEqual(errors,[],'No console or runtime errors');
  const metrics=await call('metrics');
  await fs.writeFile('test-results/browser-results.json',JSON.stringify({passed:true,results,errors,metrics},null,2));
  console.log(JSON.stringify({passed:true,steps:results.length,metrics}));
} catch(error) {
  await page.screenshot({path:'test-results/failure.png'}).catch(()=>{});
  await fs.writeFile('test-results/browser-results.json',JSON.stringify({passed:false,results,errors,error:String(error),snapshot:await snap().catch(()=>null)},null,2));
  console.error(error);process.exitCode=1;
} finally {await browser.close();}
