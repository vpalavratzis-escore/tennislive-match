import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const branch='fix/studio-offline-poster-replace-20261011';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
await page.goto('https://voxcourt.com/?p=/gr/chalkida/chalkis-padel-club/court-1',{waitUntil:'domcontentloaded',timeout:35000});
await page.locator('#vc3OfflinePosterImage').waitFor({timeout:25000});
await page.waitForFunction(()=>document.querySelector('#vc3OfflinePosterImage')?.naturalWidth>0);
const cssResponse=await page.request.get('https://raw.githubusercontent.com/vpalavratzis-escore/tennislive-match/'+branch+'/site/src/viewer-premium-v3.css',{timeout:25000});
assert(cssResponse.ok(),'candidate CSS fetched');
const css=(await cssResponse.text()).replaceAll('/tennislive-match/voxcourt-live-v3/','/voxcourt-assets/vc3-');
const outcome=await page.evaluate(css=>{
 const liveStyle=document.querySelector('style#voxcourt-live-v3-vps-styles');
 if(!liveStyle)throw new Error('Real V3 CSS not mounted');
 liveStyle.textContent=css;
 const img=document.querySelector('#vc3OfflinePosterImage');
 const overlay=document.querySelector('#videoOverlay');
 overlay.classList.add('videoOverlay--show');
 const props=()=>{
   const r=img.getBoundingClientRect(),x=r.left+30,y=r.top+30;
   return {src:img.src,naturalWidth:img.naturalWidth,pointer:getComputedStyle(img).pointerEvents,opacity:getComputedStyle(img).opacity,
     overlayBg:getComputedStyle(overlay).backgroundImage,hit:document.elementFromPoint(x,y)?.id||'',rect:[r.width,r.height]};
 };
 const normal=props();
 document.documentElement.classList.add('vc3-studio-preview');
 const editor=props();
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=108;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#f20b15';ctx.fillRect(0,0,192,108);
 return {normal,editor,replacement:canvas.toDataURL('image/png'),sport:document.querySelector('#app')?.dataset.viewerSport};
},css);
assert(outcome.normal.naturalWidth>100,'default poster is loaded');
assert.equal(outcome.normal.pointer,'none','live viewer must not block video controls');
assert.equal(outcome.editor.pointer,'auto','in Studio must be clickable');
assert.equal(outcome.editor.hit,'vc3OfflinePosterImage','Studio click must hit actual IMG, not DIV overlay');
assert.equal(outcome.editor.overlayBg,'none','poster IMG owns image; hardcoded CSS overlay removed');
const before=await page.locator('#videoOverlay').screenshot({timeout:10000});
const update=await page.evaluate(replacement=>{
 const studio=window.__VoxCourtStudioVisuals;
 if(!studio)throw new Error('Studio runtime unavailable');
 studio.setPreview({version:1,rules:[{
   id:'test-offline-poster',selector:'#vc3OfflinePosterImage',shadow:'',route:'@live:BEACH_VOLLEYBALL',media:replacement,variants:{}
 }],extras:[]});
},outcome.replacement);
await page.waitForFunction(()=>document.querySelector('#vc3OfflinePosterImage')?.naturalWidth===192,{timeout:20000});
const after=await page.locator('#videoOverlay').screenshot({timeout:10000});
const ratio=(after.length/before.length);
assert(ratio<.85,`poster replacement should visibly alter image before=${before.length} after=${after.length}`);
console.log('OFFLINE POSTER PASS',JSON.stringify({
  posterLoaded:outcome.normal.naturalWidth,studioHit:outcome.editor.hit,
  editorPointer:outcome.editor.pointer,overlayBackground:outcome.editor.overlayBg,
  replacedWidth:192,beforeBytes:before.length,afterBytes:after.length,ratio:ratio.toFixed(3)
}));
await browser.close();
