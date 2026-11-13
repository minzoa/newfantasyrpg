import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.ASTRALIA_BROWSER||'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  const response=await page.goto(process.env.ASTRALIA_PRODUCTION_URL||'http://127.0.0.1:5180/?test=1',{waitUntil:'networkidle'});
  assert.equal(response.status(),200);assert.equal(await page.evaluate(()=>typeof window.__ASTRALIA_TEST__),'undefined');
  await page.locator('[data-action="new"]').click();
  await page.keyboard.press('KeyI');await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.mouse.click(720,450);await page.keyboard.press('KeyV');
  await page.waitForFunction(()=>document.pointerLockElement?.id==='game',{},{timeout:10000});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.pointerLockElement,{},{timeout:10000});
  await page.locator('.modal-layer [data-action="resume"]').waitFor();
  await page.locator('.modal-layer [data-action="resume"]').click();
  const contextLossSupported=await page.evaluate(()=>{
    const gl=document.querySelector('#game').getContext('webgl2');const ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)return false;
    ext.loseContext();setTimeout(()=>ext.restoreContext(),500);return true;
  });
  if(contextLossSupported){await page.waitForTimeout(1800);await page.locator('.modal-layer [data-action="resume"]').click();await page.keyboard.press('KeyI');await page.getByRole('dialog').waitFor();}
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/production-results.json',JSON.stringify({passed:true,httpStatus:response.status(),debugToolsExposed:false,pointerLock:true,contextLossRestored:contextLossSupported,errors},null,2));
  console.log('PASS production build: HTTP 200, menus, pointer lock/Escape, WebGL restore, no debug fixture');
}catch(error){await page.screenshot({path:'test-results/production-failure.png'}).catch(()=>{});console.error(error);process.exitCode=1;}
finally{await browser.close();}
