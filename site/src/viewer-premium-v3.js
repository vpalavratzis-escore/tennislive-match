/**
 * VoxCourt Live V3 enhancement: presentation only.
 * Does not replace, reconnect, reset, or intercept camera, score, replay, HLS or WebRTC.
 */
import { loadClubRegistry } from './clubRegistry.js';
const BASE=import.meta.env.BASE_URL || '/';
let activeRoot=null;

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const safeHttpUrl=(raw)=>{
  if(!raw)return '';
  try{const u=new URL(String(raw),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}
};
const parts=()=>{const s=new URLSearchParams(location.search).get('p')||'';const a=s.split('/').filter(Boolean);return a[0]==='v'?a.slice(1,5):a.slice(0,4)};
const getCurrentCourt=async()=>{
  const [countryId,cityId,clubId,courtId]=parts();if(!courtId)return null;
  const registry=await loadClubRegistry();
  const country=registry?.countries?.find(x=>x.id===countryId);
  const city=country?.cities?.find(x=>x.id===cityId);
  const club=city?.clubs?.find(x=>x.id===clubId);
  const court=club?.courts?.find(x=>x.id===courtId);
  return {country,city,club,court,cityId,countryId};
};
const weatherLabel=(code)=>code===0?['☀️','Clear sky']:code<=3?['🌤️','Partly cloudy']:code<=48?['☁️','Cloudy']:code<=67?['🌧️','Rain']:code<=77?['❄️','Snow']:code<=82?['🌦️','Showers']:['⛈️','Thunderstorm'];

function matchInfo(root){
  const score=root.querySelector('.vc-scoreboard'),footer=root.querySelector('#status');
  if(!score||root.querySelector('.premium-match-info'))return;
  const box=el('section','premium-match-info');
  box.setAttribute('aria-label','Match details');
  box.append(el('div','premium-match-info__title','MATCH INFO'));
  const grid=el('div','premium-match-info__grid');box.append(grid);
  const add=(ico,label,id)=>{
    const row=el('div','premium-match-info__item');
    row.append(el('span','premium-match-info__glyph',ico));
    const span=el('span','',label);span.id=id;row.append(span);grid.append(row);
  };
  add('🏐','Sport','premiumSport');
  add('▦','Court','premiumCourt');
  add('⌖','Club','premiumClub');
  add('◷','Local time: —','premiumClock');
  add('🌤','Weather unavailable','premiumWeatherInfo');
  add('♧','Viewers: —','premiumViewers');
  score.insertBefore(box,footer);
  const tick=()=>{
    if(!root.isConnected)return;
    const node=root.querySelector('#premiumClock');
    if(node)node.textContent='Local time: '+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit'}).format(new Date());
  };
  tick();const interval=setInterval(()=>{if(root.isConnected)tick();else clearInterval(interval)},60000);
}

function syncNames(root){
  const title=root.querySelector('#miTitle');
  const update=()=>{
    if(!root.isConnected||!title)return;
    const full=(title.textContent||'').trim();
    if(!full||full==='Loading…')return;
    const split=full.split(/\s+[–—-]\s+/);
    const club=root.querySelector('#premiumClub'),court=root.querySelector('#premiumCourt');
    if(club)club.textContent=split[0]||full;
    if(court)court.textContent=split.slice(1).join(' – ')||'Court';
    if(/beach[\s-]*(volley|volleyball)/i.test(full)) {
      root.dataset.premiumSport='beach-volleyball';
      const sport=root.querySelector('#premiumSport');if(sport)sport.textContent='Beach Volleyball';
    }
  };
  update();
  if(title)new MutationObserver(update).observe(title,{childList:true,characterData:true,subtree:true});
}

function weather(root){
  const actions=root.querySelector('.compact-match-header__actions');
  if(!actions||root.querySelector('#premiumWeather'))return;
  const badge=el('div','premium-weather');
  badge.id='premiumWeather';
  badge.setAttribute('aria-label','Current weather in the club area');
  const ico=el('span','premium-weather__symbol','☁️');
  const value=el('span');
  const degree=el('strong','', '—°C'),condition=el('small','','Loading weather…');
  value.append(degree,condition);badge.append(ico,value);actions.prepend(badge);
  let refreshing=false;
  async function refresh(){
    if(!root.isConnected||refreshing)return;
    refreshing=true;
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),7000);
    try{
      const item=await getCurrentCourt();
      const city=item?.city?.name||'';
      const candidates=[item?.court?.location,item?.club?.location,item?.city?.location,item?.court,item?.club,item?.city];
      let lat,lon;
      for(const entry of candidates){
        const a=Number(entry?.latitude??entry?.lat),b=Number(entry?.longitude??entry?.lng??entry?.lon);
        if(Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180&&!(a===0&&b===0)){lat=a;lon=b;break}
      }
      if(lat===undefined&&item?.countryId==='gr'&&item?.cityId==='chalkida'){lat=38.463;lon=23.593}
      if(lat===undefined&&city){
        const q=new URLSearchParams({name:city,count:'5',language:'en',format:'json'});
        const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+q,{signal:ctrl.signal});
        if(response.ok){
          const matches=(await response.json())?.results||[];
          const locationCandidate=matches.find(x=>item?.countryId!=='gr'||x.country_code==='GR')||matches[0];
          if(locationCandidate){lat=locationCandidate.latitude;lon=locationCandidate.longitude}
        }
      }
      if(lat===undefined||lon===undefined)throw new Error('Location not found');
      const q=new URLSearchParams({latitude:String(lat),longitude:String(lon),current:'temperature_2m,weather_code',timezone:'auto'});
      const response=await fetch('https://api.open-meteo.com/v1/forecast?'+q,{signal:ctrl.signal});
      if(!response.ok)throw new Error('Weather unavailable');
      const current=(await response.json())?.current;
      if(!Number.isFinite(current?.temperature_2m))throw new Error('Invalid weather');
      if(!root.isConnected)return;
      const [symbol,desc]=weatherLabel(current.weather_code);
      ico.textContent=symbol;degree.textContent=Math.round(current.temperature_2m)+'°C';condition.textContent=desc;
      badge.title=(city||'Court')+' weather · Open-Meteo';
      const info=root.querySelector('#premiumWeatherInfo');if(info)info.textContent=degree.textContent+' '+desc;
    }catch(_){
      if(root.isConnected){ico.textContent='☁️';degree.textContent='—°C';condition.textContent='Weather unavailable'}
    }finally{clearTimeout(timeout);refreshing=false}
  }
  refresh();
  const interval=setInterval(()=>{if(root.isConnected)refresh();else clearInterval(interval)},600000);
}

// Brands shown only as clearly labeled *design examples* on this isolated test branch.
// No company should be published as an actual venue sponsor without club confirmation.
const DESIGN_EXAMPLES=[
  {name:'VoxCourt',logo:`${BASE}voxcourt-live-v3/brand-voxcourt.png`,url:'https://escoreboards.eu/'},
  {name:'Admiral',logo:`${BASE}voxcourt-live-v3/brand-admiral.png`,url:'https://admiralsports.shop/'},
  {name:'Wilson',logo:`${BASE}voxcourt-live-v3/brand-wilson.png`,url:'https://www.wilson.com/'},
  {name:'COSMOTE',logo:`${BASE}voxcourt-live-v3/brand-cosmote.png`,url:'https://www.cosmote.gr/'},
  {name:'ΔΕΗ',logo:`${BASE}voxcourt-live-v3/brand-dei.png`,url:'https://www.dei.gr/'},
  {name:'Avance',logo:`${BASE}voxcourt-live-v3/brand-avance.png`,url:'https://avance.gr/'},
  {name:'Isostar',logo:`${BASE}voxcourt-live-v3/brand-isostar.png`,url:'https://www.isostar.com/'},
  {name:'Chalkis Padel Club',logo:`${BASE}voxcourt-live-v3/brand-chalkis.png`,url:'https://www.google.com/maps/search/?api=1&query=Chalkis+Padel+Club'}
];
const SHOW_UNVERIFIED_BRANDS_ON_TEST_BRANCH=true;

async function sponsors(root){
  const area=root.querySelector('.vc-sponsors'),grid=area?.querySelector('.vc-sponsor-grid');
  if(!grid)return;
  grid.replaceChildren(); // Old fake static SVG placeholders are not reused.
  let entries=[];
  try{
    const config=await getCurrentCourt();
    entries=Array.isArray(config?.court?.sponsors)&&config.court.sponsors.length?config.court.sponsors:Array.isArray(config?.club?.sponsors)?config.club.sponsors:[];
    const sport=String(config?.court?.sport||config?.court?.sportId||'');
    if(sport){
      root.dataset.premiumSport=sport.toLowerCase();
      const s=root.querySelector('#premiumSport');if(s)s.textContent=sport.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    }
  }catch(_){/* The existing viewer handles registry errors. */}
  if(!root.isConnected)return;
  const label=area.querySelector('.vc-sponsors-heading span');
  if(!entries.length&&SHOW_UNVERIFIED_BRANDS_ON_TEST_BRANCH){
    entries=DESIGN_EXAMPLES;
    if(label)label.textContent='DESIGN REFERENCES';
  }else if(label){label.textContent='CLUB PARTNERS'}
  if(!entries.length){area.hidden=true;return}
  area.hidden=false;
  for(const sponsor of entries.slice(0,24)){
    const name=String(sponsor?.name||'Partner');
    const href=safeHttpUrl(sponsor?.url);
    const logo=String(sponsor?.logo||'').trim();
    const outer=el('div','vc-sponsor-card');
    const inner=el(href?'a':'div');
    if(href){inner.href=href;inner.target='_blank';inner.rel='noopener noreferrer'}
    inner.title=name;
    if(logo){
      let src='';
      try {src=new URL(logo,document.baseURI).href}catch(_){}
      if(safeHttpUrl(src)){
        const img=el('img');img.src=src;img.alt=name;img.loading='lazy';
        img.onerror=()=>{img.remove();inner.append(el('span','premium-brand-text',name))};
        inner.append(img);
      }else inner.append(el('span','premium-brand-text',name));
    }else inner.append(el('span','premium-brand-text',name));
    outer.append(inner);grid.append(outer);
  }
}

function enhance(root){
  if(root.dataset.premiumV3Ready==='yes')return;
  root.dataset.premiumV3Ready='yes';
  matchInfo(root);
  const status=root.querySelector('#matchStatusBadge'),headerText=root.querySelector('.compact-match-header__text');
  if(status&&headerText&&status.parentElement!==headerText)headerText.prepend(status);
  syncNames(root);
  weather(root);
  sponsors(root);
}
const mount=()=>{
  const root=document.querySelector('.vc-viewer-page');
  if(root&&root!==activeRoot){activeRoot=root;enhance(root)}
};
const rootApp=document.getElementById('app');
if(rootApp){new MutationObserver(mount).observe(rootApp,{childList:true});mount()}
