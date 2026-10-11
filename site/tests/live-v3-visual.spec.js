import {test,expect} from "@playwright/test";

test("approved V3 style actually wins against legacy CSS and JS mounts", async ({page}) => {
  const registry={countries:[{id:"gr",name:"Greece",cities:[{id:"attica",name:"Attica",clubs:[{id:"multi-club",name:"Multi Club",courts:[{id:"tennis-1",name:"Tennis 1",sport:"tennis",state:"https://api.test.local/api/state/gr/attica/multi-club/tennis-1",stream:{type:"hls",url:""}}]}]}]}]}]};
  await page.route("**/api/public/clubs",r=>r.fulfill({json:registry}));
  await page.route("**/config/clubs.json",r=>r.fulfill({json:registry}));
  await page.route("https://api.test.local/**",r=>{
    const url=r.request().url();
    if(url.includes("/api/state/"))return r.fulfill({json:{matchStatus:"LIVE",matchId:"m1",nameA:"Test Team A",nameB:"Test Team B",pointA:"0",pointB:"0",gamesA:0,gamesB:0,setsA:0,setsB:0,updatedAt:Date.now()}});
    if(url.includes("/api/matches/latest/"))return r.fulfill({json:{match:{matchId:"m1",status:"LIVE"}}});
    if(url.includes("/api/events/"))return r.fulfill({json:{events:[]}});
    if(url.includes("/api/court/sources"))return r.fulfill({json:{sources:[]}});
    return r.fulfill({json:{}});
  });
  await page.goto("./?p=/gr/attica/multi-club/tennis-1");
  await expect(page.locator("#voxcourt-live-v3-styles")).toHaveCount(1);
  await expect(page.locator(".vc-viewer-page")).toHaveAttribute("data-premium-v3-ready","yes");
  await expect(page.locator(".premium-match-info")).toBeVisible();
  await expect(page.locator("#premiumWeather")).toBeVisible();
  await expect(page.locator(".vc-sponsor-card")).toHaveCount(8);
  const styles=await page.evaluate(()=>{
    const get=s=>getComputedStyle(document.querySelector(s));
    return {
      bodyBg:getComputedStyle(document.body).backgroundImage,
      scoreBg:get(".vc-scoreboard-top").backgroundImage,
      teamDisplay:get(".vc-player-main").display,
      cameraBg:get(".live-mode-controls").backgroundColor,
      posterBg:get(".cam--viewer").backgroundImage,
      photoUrl:get(".vc-player-photo").width,
    };
  });
  expect(styles.bodyBg).toContain("court-poster.webp");
  expect(styles.scoreBg).toContain("linear-gradient");
  expect(styles.teamDisplay).toBe("flex");
  expect(styles.posterBg).toContain("court-poster.webp");
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator(".premium-match-info")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
});
