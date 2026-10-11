import {chromium} from '@playwright/test';
const origin='https://voxcourt.com/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1600,height:940},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+String(e.message).slice(0,220)));
page.on('console',e=>{if(e.type()==='error')errors.push('console: '+e.text().slice(0,220))});
const api=await page.request.get('https://api.voxcourt.com/api/public/clubs',{timeout:25000}).catch(e=>null);
let route='/gr/chalkida/chalkis-padel-club/beach-volley-court-1';
if(api?.ok()){
  const data=await api.json();
  for(const country of data?.countries||[])for(const city of country.cities||[])for(const club of city.clubs||[])for(const court of club.courts||[]){
    if(/chalkis/i.test(club.name||'')&&/beach.*volley/i.test(court.name||'')){
      route='/'+[country.id,city.id,club.id,court.id].join('/');
      console.log('FOUND REAL COURT',JSON.stringify({route,country:country.name,city:city.name,club:club.name,court:court.name,sponsors:court.sponsors,clubSponsors:club.sponsors}));
    }
  }
}
await page.goto(origin+'?p='+encodeURIComponent(route),{waitUntil:'domcontentloaded',timeout:35000});
try{await page.locator('.vc-viewer-page').waitFor({timeout:24000})}catch(e){console.log('VIEWER NOT PRESENT',page.url(),(await page.locator('body').innerText()).slice(0,500))}
await page.waitForTimeout(5500);
const info=await page.evaluate(()=>{
  const $=s=>document.querySelector(s);
  const st=s=>{const e=$(s);if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();return {display:c.display,visibility:c.visibility,opacity:c.opacity,background:c.backgroundColor,bgImage:c.backgroundImage.slice(0,180),filter:c.backdropFilter,color:c.color,width:Math.round(r.width),height:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y),text:(e.textContent||'').trim().slice(0,100)}};
  const grid=$('.vc-sponsor-grid');
  const cards=[...(grid?.children||[])].map(e=>{const r=e.getBoundingClientRect();return{text:(e.textContent||'').trim().slice(0,60),alt:e.querySelector('img')?.alt||'',src:e.querySelector('img')?.src?.slice(0,150),generated:e.dataset.vc3Generated,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}});
  const overlaps=[];
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
    const a=cards[i].rect,b=cards[j].rect;
    const x=Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]);
    const y=Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]);
    if(x>3&&y>3)overlaps.push([i,j,x,y]);
  }
  return {url:location.href,bodyBackground:st('body'),bodyBgImage:$('#vc3PageBackgroundImage')?{src:$('#vc3PageBackgroundImage').src,complete:$('#vc3PageBackgroundImage').complete,naturalWidth:$('#vc3PageBackgroundImage').naturalWidth}:null,styleMounted:!!$('#voxcourt-live-v3-vps-styles'),root:st('.vc-viewer-page'),dataset:$('.vc-viewer-page')?.dataset.premiumV3Ready,header:st('#matchHero'),nameB:st('#nameB'),nameA:st('#nameA'),nameBParent:st('.vc-player-score--b .vc-player-info'),poster:st('#vc3OfflinePosterImage'),sponsorContainer:st('.vc-sponsors'),sponsorGrid:st('.vc-sponsor-grid'),cards,overlaps,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
});
console.log('PRODUCTION UI ANALYSIS',JSON.stringify(info,null,2));
console.log('ERRORS',JSON.stringify(errors.slice(0,20)));
await browser.close();
