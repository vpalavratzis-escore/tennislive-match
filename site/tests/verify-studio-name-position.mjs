import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
await page.goto('https://voxcourt.com/?p=/gr/chalkida/chalkis-padel-club/court-1',{waitUntil:'domcontentloaded',timeout:30000});
await page.locator('#nameB').waitFor({timeout:24000});
await page.waitForTimeout(1200);
const raw=await page.request.get('https://raw.githubusercontent.com/vpalavratzis-escore/tennislive-match/fix/studio-team-name-position-20261011/site/src/viewer-premium-v3.css',{timeout:20000});
assert(raw.ok(),'V3 branch CSS downloadable');
const css=await raw.text();
const result=await page.evaluate((css)=>{
 const a=document.querySelector('#nameA'),b=document.querySelector('#nameB');
 const before={a:getComputedStyle(a).translate,b:getComputedStyle(b).translate,bInline:b.style.getPropertyValue('translate'),bPriority:b.style.getPropertyPriority('translate')};
 // Emulate V3.2 CSS and cleanup of former inline !important styles
 const stylesheet=document.querySelector('#voxcourt-live-v3-vps-styles');
 stylesheet.textContent=css;
 b.style.removeProperty('translate');
 b.style.removeProperty('margin');
 b.parentElement?.parentElement?.style.removeProperty('translate');
 const studio=document.querySelector('style[data-vcstudio="main"]')?.textContent||'';
 const parts=studio.split(/@media/).filter(x=>x.includes('name')||x.includes('strong'));
 return {before,after:{a:getComputedStyle(a).translate,b:getComputedStyle(b).translate,bInline:b.style.getPropertyValue('translate'),bPriority:b.style.getPropertyPriority('translate')},studioRules:studio.split('\n').filter(x=>x.includes('.vc-player-info')&&x.includes('strong')).slice(0,8),studioCssLength:studio.length,rootSport:document.querySelector('#app')?.dataset.viewerSport,bVisible:!!b.getBoundingClientRect().width};
},css);
console.log('STUDIO POSITION EMULATION',JSON.stringify(result,null,2));
assert.equal(result.after.bInline,'','forced B translate removed');
assert.notEqual(result.after.b,'none','Studio publishes and drives B position');
assert(result.studioCssLength>0,'Studio stylesheet loaded');
await browser.close();
