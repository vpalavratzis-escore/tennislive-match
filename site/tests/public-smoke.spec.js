import { expect, test } from "@playwright/test";

const registry = {
  countries: [
    { id:"gr", name:"Greece", cities:[
      { id:"attica", name:"Attica", clubs:[
        { id:"multi-club", name:"Multi Club", courts:[
          { id:"tennis-1", name:"Tennis 1", sport:"tennis", state:"https://api.test.local/api/state/gr/attica/multi-club/tennis-1", stream:{type:"hls",url:""} },
          { id:"padel-1", name:"Padel 1", sport:"padel", state:"https://api.test.local/api/state/gr/attica/multi-club/padel-1", stream:{type:"hls",url:""} },
        ]},
        { id:"pickle-club", name:"Pickle Club", courts:[
          { id:"pickle-1", name:"Pickle 1", sport:"pickleball", state:"https://api.test.local/api/state/gr/attica/pickle-club/pickle-1", stream:{type:"hls",url:""} },
        ]},
      ]},
    ]},
    { id:"cy", name:"Cyprus", cities:[
      { id:"nicosia", name:"Nicosia", clubs:[
        { id:"cy-club", name:"Cy Club", courts:[
          { id:"tennis-2", name:"Tennis 2", sport:"tennis", state:"https://api.test.local/api/state/cy/nicosia/cy-club/tennis-2", stream:{type:"hls",url:""} },
        ]},
      ]},
    ]},
  ],
};

async function mockRegistry(page, data=registry) {
  await page.route("**/api/public/clubs", route => route.fulfill({json:data}));
  await page.route("**/config/clubs.json", route => route.fulfill({json:{countries:[{id:"legacy",name:"Legacy",cities:[]}]}}));
}

function watchRuntime(page) {
  const errors=[];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => { if(message.type()==="error") errors.push(`console: ${message.text()}`); });
  return errors;
}

async function assertNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function assertGreekTextNotClipped(page) {
  const clipped=await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3,p,a,button,label,span,strong,small")].filter(element => {
    const text=element.textContent || "";
    if(!/[\u0370-\u03ff\u1f00-\u1fff]/.test(text) || !element.getClientRects().length) return false;
    const style=getComputedStyle(element);
    if(style.visibility==="hidden" || style.display==="none") return false;
    return (/(hidden|clip)/.test(style.overflowY) && element.scrollHeight>element.clientHeight+2) ||
      (/(hidden|clip)/.test(style.overflowX) && element.scrollWidth>element.clientWidth+2);
  }).map(element => ({text:(element.textContent||"").trim(),className:element.className})));
  expect(clipped).toEqual([]);
}

async function assertHitTarget(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const hit=await page.locator(selector).evaluate(element => {
    const box=element.getBoundingClientRect();
    const target=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return target===element || element.contains(target);
  });
  expect(hit).toBe(true);
}

test("homepage desktop/mobile EN/EL layout, navigation and persistence", async ({browser}) => {
  const matrix=[
    [1440,900,"en","desktop-en"], [1440,900,"el","desktop-el"],
    [1920,1080,"el","desktop-1920-el"],
    [390,844,"en","mobile-390-en"], [390,844,"el","mobile-390-el"],
    [430,932,"en","mobile-430-en"], [430,932,"el","mobile-430-el"],
    [768,1024,"en","tablet-en"], [768,1024,"el","tablet-el"],
  ];
  for(const [width,height,language,name] of matrix){
    const context=await browser.newContext({viewport:{width,height}});
    const page=await context.newPage();
    const errors=watchRuntime(page);
    await mockRegistry(page);
    await page.addInitScript(lang => localStorage.setItem("voxcourt-language",lang),language);
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("lang",language);
    await expect(page.locator(".vc-home-hero .vc-hero-image")).toHaveAttribute("src",/hero-alltogether\.png$/);
    await expect(page.locator(".vc-feature-strip article")).toHaveCount(5);
    await expect(page.locator(".vc-sport-grid a")).toHaveCount(3);
    await expect(page.locator(".vc-coming-grid article")).toHaveCount(2);
    await expect(page.locator(".vc-story,.vc-control")).toHaveCount(0);
    await expect(page.locator(".vc-how-grid article")).toHaveCount(3);
    const cardGeometry=await page.evaluate(()=>[".vc-sport-grid>a",".vc-coming-grid>article"].map(selector=>[...document.querySelectorAll(selector)].map(node=>{const box=node.getBoundingClientRect();return [box.width,box.height]})));
    for(const group of cardGeometry){expect(Math.max(...group.map(x=>x[0]))-Math.min(...group.map(x=>x[0]))).toBeLessThan(1);expect(Math.max(...group.map(x=>x[1]))-Math.min(...group.map(x=>x[1]))).toBeLessThan(1)}
    await assertNoOverflow(page);
    if(language==="el") await assertGreekTextNotClipped(page);
    await page.screenshot({path:`/tmp/voxcourt-qa-${name}.png`,fullPage:true});
    if(width<=900){
      await expect(page.locator(".vc-menu-toggle")).toBeVisible();
      await expect(page.locator(".vc-menu-toggle span")).toHaveCount(0);
      await assertHitTarget(page,".vc-menu-toggle");
      await page.locator(".vc-menu-toggle").click();
      await expect(page.locator("#vcMobileMenu")).toBeVisible();
      await expect(page.locator("#vcMobileMenu nav a")).toHaveCount(4);
      await expect(page.locator("#vcMobileMenu [data-language]")).toHaveCount(2);
      await page.screenshot({path:`/tmp/voxcourt-qa-${name}-menu.png`,fullPage:false});
    } else {
      await expect(page.locator(".vc-home-links a")).toHaveCount(4);
      await expect(page.locator(".vc-home-links a").nth(1)).toHaveAttribute("href",/\/live$/);
      await expect(page.locator(".vc-home-links a").nth(2)).toHaveAttribute("href","/matches/");
      await expect(page.locator(".vc-home-links a").nth(3)).toHaveAttribute("href","/members/manage.html");
    }
    expect(errors).toEqual([]);
    await context.close();
  }

  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  await mockRegistry(page);
  await page.goto("./");
  await page.locator('[data-language="el"]').first().click();
  await expect(page.locator("html")).toHaveAttribute("lang","el");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang","el");
  await context.close();
});

test("desktop and mobile header clicks stay within their owning applications", async ({browser}) => {
  for(const {viewport,language,nav} of [
    {viewport:{width:1440,height:900},language:"en",nav:".vc-home-links"},
    {viewport:{width:390,height:844},language:"el",nav:"#vcMobileMenu nav"},
  ]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    await mockRegistry(page);
    await page.addInitScript(lang=>localStorage.setItem("voxcourt-language",lang),language);
    for(const [href,pathname] of [["/tennislive-match/","/tennislive-match/"],["/tennislive-match/live","/tennislive-match/live"],["/matches/","/matches/"],["/members/manage.html","/members/manage.html"]]){
      await page.goto("./");
      if(viewport.width<=900) await page.locator(".vc-menu-toggle").click();
      await page.locator(`${nav} a[href="${href}"]`).click();
      await expect.poll(()=>new URL(page.url()).pathname).toBe(pathname);
    }
    await context.close();
  }
});

test("home finder and active sport cards always carry the three supported sports", async ({page}) => {
  await mockRegistry(page);
  await page.goto("./");
  await expect(page.locator("#homeSportChoice button")).toHaveCount(3);
  await expect(page.locator("#homeSportChoice button")).toHaveText(["Tennis","Padel","Pickleball"]);
  await expect(page.locator('#homeSportChoice [data-sport="padel"]')).toBeVisible();
  await expect(page.locator('#homeSportChoice [data-sport="legacy"]')).toHaveCount(0);
  await assertHitTarget(page,'#homeSportChoice [data-sport="padel"]');
  await page.locator('#homeSportChoice [data-sport="padel"]').click();
  await expect(page.locator('#homeSportChoice [data-sport="padel"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#homeFinderLink")).toHaveAttribute("href",/live\?sport=padel$/);
  for(const sport of ["tennis","padel","pickleball"]){
    await page.goto("./");
    await page.locator(`.vc-sport-grid a[href$="sport=${sport}"]`).click();
    await expect.poll(()=>new URL(page.url()).pathname).toBe("/tennislive-match/live");
    await expect.poll(()=>new URL(page.url()).searchParams.get("sport")).toBe(sport);
    await expect(page.locator("#selSport")).toHaveValue(sport);
  }
  await expect(page.locator('.future-sports')).toContainText("Basketball");
});

test("full finder follows sport-first cascade and resets every dependent field", async ({page}) => {
  const errors=watchRuntime(page);
  await mockRegistry(page);
  await page.goto("./live");
  const sport=page.locator("#selSport"), country=page.locator("#selCountry"), city=page.locator("#selCity"), club=page.locator("#selClub"), court=page.locator("#selCourt"), open=page.locator("#btnOpen");
  await expect(sport).toBeEnabled();
  await expect(sport.locator("option")).toHaveText(["Choose sport","Tennis","Padel","Pickleball"]);
  await expect(country).toBeDisabled();
  await expect(city).toBeDisabled();
  await expect(club).toBeDisabled();
  await expect(court).toBeDisabled();
  await expect(open).toBeDisabled();

  await assertHitTarget(page,'[data-sport="padel"]');
  await page.locator('[data-sport="padel"]').click();
  await expect(sport).toHaveValue("padel");
  await expect(country).toBeEnabled();
  await expect(country.locator("option")).toHaveCount(2);
  await country.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(country).toHaveValue("gr");
  await expect(city).toBeEnabled();
  await city.selectOption("attica");
  await expect(club).toBeEnabled();
  await expect(club.locator("option")).toHaveCount(2);
  await club.selectOption("multi-club");
  await expect(court).toBeEnabled();
  await expect(court.locator("option")).toHaveCount(2);
  await expect(court.locator('option[value="tennis-1"]')).toHaveCount(0);
  await court.selectOption("padel-1");
  await expect(open).toBeEnabled();
  await assertHitTarget(page,"#btnOpen");

  await page.locator('[data-sport="tennis"]').click();
  await expect(sport).toHaveValue("tennis");
  await expect(country).toHaveValue("");
  await expect(city).toBeDisabled();
  await expect(club).toBeDisabled();
  await expect(court).toBeDisabled();
  await expect(open).toBeDisabled();
  await expect(country.locator("option")).toHaveCount(3);

  await sport.selectOption("");
  await expect(country).toBeDisabled();
  await expect(page.locator("[data-sport].active")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("finder honors empty authoritative registry", async ({page}) => {
  await mockRegistry(page,{countries:[]});
  await page.goto("./live");
  await expect(page.locator("#selSport")).toBeEnabled();
  await expect(page.locator("#sportChoice button")).toHaveText(["Tennis","Padel","Pickleball"]);
  for(const [sport,name] of [["tennis","Tennis"],["padel","Padel"],["pickleball","Pickleball"]]){
    await page.locator(`[data-sport="${sport}"]`).click();
    await expect(page.locator("#courtMessage")).toHaveText(`No ${name} courts are currently available.`);
    expect(await page.locator("#selCountry,#selCity,#selClub,#selCourt").evaluateAll(elements=>elements.every(element=>element.disabled))).toBe(true);
  }
  await expect(page.locator("#btnOpen")).toBeDisabled();
});

test("finder Greek typography remains unclipped at desktop and mobile", async ({browser}) => {
  for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844},{width:430,height:932},{width:768,height:1024}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    await mockRegistry(page);
    await page.addInitScript(()=>localStorage.setItem("voxcourt-language","el"));
    await page.goto("./live");
    await expect(page.locator("#selSport")).toBeEnabled();
    await assertGreekTextNotClipped(page);
    await expect.poll(()=>page.locator(".court-title").evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
    await assertNoOverflow(page);
    if(viewport.width>800){const separated=await page.evaluate(()=>{const left=document.querySelector(".court-hero-copy").getBoundingClientRect(),right=document.querySelector(".court-selector-card").getBoundingClientRect();return left.right<right.left});expect(separated).toBe(true)}
    await page.screenshot({path:`/tmp/voxcourt-qa-finder-el-${viewport.width}x${viewport.height}.png`,fullPage:true});
    await context.close();
  }
});

test("approved Greek homepage copy and sport-specific finder empty states", async ({page}) => {
  await mockRegistry(page,{countries:[]});
  await page.addInitScript(()=>localStorage.setItem("voxcourt-language","el"));
  await page.goto("./");
  await expect(page.locator(".vc-home-hero__copy>p")).toHaveText("Ζωντανό σκορ, live μετάδοση και replay — όλα σε μία εμπειρία.");
  await expect(page.locator(".vc-sports h2")).toHaveText("Τένις, Padel και Pickleball σήμερα. Περισσότερα αθλήματα έρχονται.");
  await expect(page.locator(".vc-how h2")).toHaveText("Παίξε live. Ξαναδές τις στιγμές που αξίζουν.");
  await expect(page.locator(".vc-how-grid h3")).toHaveText(["Βρες γήπεδο","Παίξε live","Replay & Highlights"]);
  await expect(page.locator(".vc-home-finder h2")).toHaveText("Βρες το γήπεδό σου.");
  await page.locator('#homeSportChoice [data-sport="padel"]').click();
  await expect(page.locator(".vc-finder-next>span")).toHaveText("Δεν υπάρχουν ακόμη διαθέσιμα γήπεδα Padel.");
  await page.goto("./live?sport=padel");
  await expect(page.locator("#selSport")).toHaveValue("padel");
  await expect(page.locator("#courtMessage")).toHaveText("Δεν υπάρχουν ακόμη διαθέσιμα γήπεδα Padel.");
});

test("viewer renders safe mocked live, unavailable video, and completed states", async ({page}) => {
  const errors=watchRuntime(page);
  await mockRegistry(page);
  let completed=false;
  await page.route("https://api.test.local/**", route => {
    const url=route.request().url();
    if(url.includes("/api/state/")) return route.fulfill({json:completed
      ? {matchStatus:"COMPLETED",matchId:"m-1",nameA:"Αλέξανδρος",nameB:"Ελένη",pointA:"0",pointB:"0",gamesA:6,gamesB:4,setsA:2,setsB:0,server:"A",updatedAt:Date.now()}
      : {matchStatus:"LIVE",matchId:"m-1",nameA:"Αλέξανδρος",nameB:"Ελένη",pointA:"15",pointB:"0",gamesA:1,gamesB:0,setsA:0,setsB:0,server:"A",updatedAt:Date.now()}});
    if(url.includes("/api/matches/latest/")) return route.fulfill({json:{match:{matchId:"m-1",status:completed?"COMPLETED":"LIVE",nameA:"Αλέξανδρος",nameB:"Ελένη"}}});
    if(url.includes("/api/events/")) return route.fulfill({json:{events:[]}});
    if(url.includes("/api/court/sources")) return route.fulfill({json:{sources:[]}});
    if(url.includes("/api/club-registry/public/hardware/court/")) return route.fulfill({json:{hardware:null}});
    if(url.includes("/api/photos")) return route.fulfill({json:{photos:[]}});
    return route.fulfill({json:{}});
  });
  await page.goto("./?p=/gr/attica/multi-club/tennis-1");
  await expect(page.locator("#nameA")).toHaveText("Αλέξανδρος");
  await expect(page.locator("#matchStatusText")).toContainText("LIVE");
  await expect(page.locator(".vc-home-links a")).toHaveCount(4);
  await expect(page.getByText("No camera assigned",{exact:true}).first()).toBeVisible();
  await expect(page.locator("button,a").filter({hasText:/Share/i}).first()).toBeVisible();
  await assertNoOverflow(page);
  completed=true;
  await page.waitForTimeout(3400);
  await expect(page.locator("#matchStatusText")).toContainText("COMPLETED");
  await page.setViewportSize({width:390,height:844});
  await page.locator(".vc-menu-toggle").click();
  await expect(page.locator("#vcMobileMenu nav a")).toHaveCount(4);
  await assertNoOverflow(page);
  expect(errors).toEqual([]);
});

test("controller forms authenticated actions without touching production state", async ({page}) => {
  const actions=[];
  page.on("dialog", dialog => dialog.accept("test-key"));
  await page.route("https://api.voxcourt.com/api/controller/session/**", route => route.fulfill({json:{token:"test-token"}}));
  await page.route("https://api.voxcourt.com/api/state/**", route => route.fulfill({json:{matchStatus:"LIVE",nameA:"A",nameB:"B",pointA:"0",pointB:"0",gamesA:0,gamesB:0,setsA:0,setsB:0,server:"A"}}));
  await page.route("https://api.voxcourt.com/api/score-actions/**", async route => {
    const body=route.request().postDataJSON(); actions.push(body);
    await route.fulfill({json:{state:{matchStatus:"LIVE",nameA:"A",nameB:"B",pointA:"15",pointB:"0",gamesA:0,gamesB:0,setsA:0,setsB:0,server:"A"},duplicate:false}});
  });
  await page.goto("./control/gr/test/club/court-1");
  await expect(page.locator("#connection")).toHaveText("Connected");
  for(const action of ["POINT_A","UNDO","MARK_HIGHLIGHT"]){await page.locator(`[data-action="${action}"]`).click();}
  expect(actions.map(x=>x.action)).toEqual(["POINT_A","UNDO","MARK_HIGHLIGHT"]);
  expect(actions.every(x=>x.source==="web" && x.eventId && x.deviceId)).toBe(true);
});
