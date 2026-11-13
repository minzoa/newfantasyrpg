import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:process.env.ASTRALIA_BROWSER||'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
const snap=()=>page.evaluate(()=>window.__ASTRALIA_TEST__.snapshot());
const call=(method,...args)=>page.evaluate(({method,args})=>window.__ASTRALIA_TEST__[method](...args),{method,args});
const step=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`);};
const ready=()=>page.waitForFunction(()=>!!window.__ASTRALIA_TEST__,{},{timeout:30000});
const capture=async name=>{await page.waitForTimeout(700);await page.screenshot({path:`test-results/${name}.png`});};
try {
  await page.goto(`${process.env.ASTRALIA_URL||'http://127.0.0.1:5173'}/?test=1`,{waitUntil:'networkidle'});await ready();
  await page.waitForTimeout(2200);await capture('title');
  await call('action','new');
  await step('jump maintains airborne height and returns to ground',async()=>{
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>window.__ASTRALIA_TEST__.metrics().playerY>.6,{},{timeout:10000});
    await page.waitForFunction(()=>window.__ASTRALIA_TEST__.metrics().playerY===0,{},{timeout:10000});
    await capture('haven');
  });
  await step('inventory buttons, sort, unequip, discard and overwrite cancellation',async()=>{
    await page.keyboard.press('KeyI');
    await page.locator('.inventory-item[data-select="apprentice-staff"]').click();
    await page.locator('[data-action="equip"]').click();assert.equal((await snap()).stats.style,'staff');
    await page.locator('[data-action="unequip"]').click();assert.equal((await snap()).state.player.equipment.weapon,null);
    await page.locator('.inventory-item[data-select="wanderer-blade"]').click();await page.locator('[data-action="equip"]').click();
    await page.locator('[data-action="sort"]').click();
    await page.locator('.inventory-item[data-select="apprentice-staff"]').click();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-action="discard"]').click();assert.ok((await snap()).state.player.inventory.includes('apprentice-staff'));
    await capture('inventory');await page.keyboard.press('KeyI');
    await call('action','title');page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-action="new"]').click();assert.equal((await snap()).screen,'title');await call('action','continue');
  });
  await step('all volume settings, graphics and sensitivity persist through reload',async()=>{
    await page.keyboard.press('Escape');await page.locator('.modal-layer [data-action="settings"]').click();
    for(const [key,value] of [['music','0'],['effects','0.25'],['ambience','0.65'],['sensitivity','1.3']]) {
      await page.locator(`[data-setting="${key}"]`).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
    }
    await page.locator('[data-setting="quality"]').selectOption('low');
    await page.getByLabel('화면 흔들림',{exact:true}).uncheck();
    await capture('settings');await page.reload({waitUntil:'networkidle'});await ready();await call('action','continue');
    const settings=(await snap()).state.settings;
    assert.equal(settings.music,0);assert.equal(settings.effects,.25);assert.equal(settings.ambience,.65);assert.equal(settings.quality,'low');assert.equal(settings.shake,false);assert.equal(settings.sensitivity,1.3);
    await call('action','setting','quality:high');
  });
  await step('death from real enemy attack, retry and saved progress',async()=>{
    await call('position',-4,1);await page.keyboard.press('KeyE');await page.waitForTimeout(200);await call('action','accept');
    await call('position',0,-15);await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__ASTRALIA_TEST__.snapshot().zone==='forest');
    await call('action','title');
    // Isolated death fixture: valid saved progress, one remaining HP. Damage still comes from enemy AI.
    await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('astralia-save-v1'));state.player.hp=1;localStorage.setItem('astralia-save-v1',JSON.stringify(state));});
    await call('action','continue');await call('position',-3,8.6,0);
    await page.waitForFunction(()=>window.__ASTRALIA_TEST__.snapshot().screen==='death',{},{timeout:30000});
    assert.equal((await snap()).state.stats.deaths,1);await capture('death');
    await page.locator('[data-action="retry"]').click();
    const s=await snap();assert.equal(s.screen,'play');assert.equal(s.state.player.hp,s.stats.maxHp);assert.equal(s.state.quest.accepted,true);
    await call('action','pause');
  });
  await step('desktop resize and compact landscape inventory stay in bounds',async()=>{
    await call('action','resume');await page.setViewportSize({width:1024,height:640});await page.keyboard.press('KeyI');await capture('compact-inventory');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=1025&&dialog.y>=0&&dialog.y+dialog.height<=641);
    await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:900});
  });
  await step('corrupt save recovers to title without runtime exception',async()=>{
    await call('action','title');await page.evaluate(()=>localStorage.setItem('astralia-save-v1','{broken'));
    await page.reload({waitUntil:'networkidle'});await ready();assert.equal((await snap()).saveAvailable,false);assert.equal((await snap()).screen,'title');
  });
  assert.deepEqual(errors,[]);await fs.writeFile('test-results/resilience-results.json',JSON.stringify({passed:true,results,errors},null,2));
  console.log(JSON.stringify({passed:true,steps:results.length}));
}catch(error){await capture('resilience-failure').catch(()=>{});await fs.writeFile('test-results/resilience-results.json',JSON.stringify({passed:false,results,errors,error:String(error)},null,2));console.error(error);process.exitCode=1;}
finally{await browser.close();}
