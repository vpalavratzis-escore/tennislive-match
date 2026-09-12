import { expect, test } from "@playwright/test";

function watchRuntime(page){
  const errors=[];
  page.on("pageerror",error=>errors.push(`pageerror: ${error.message}`));
  page.on("console",message=>{if(message.type()==="error")errors.push(`console: ${message.text()}`)});
  return errors;
}

test("production home and registered finder journey", async ({page}) => {
  const errors=watchRuntime(page);
  await page.goto("./");
  await expect(page.locator(".vc-home-hero .vc-hero-image")).toHaveAttribute("src",/hero-alltogether\.png$/);
  await expect(page.locator(".vc-story,.vc-control")).toHaveCount(0);
  await expect(page.locator("#homeSportChoice button")).toHaveText(["Tennis","Padel","Pickleball"]);
  expect(await page.locator(".vc-sport-grid a").evaluateAll(links=>links.map(link=>link.getAttribute("href")))).toEqual([
    "/tennislive-match/live?sport=tennis",
    "/tennislive-match/live?sport=padel",
    "/tennislive-match/live?sport=pickleball",
  ]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);

  await page.goto("./live");
  const sport=page.locator("#selSport");
  await expect(sport).toBeEnabled();
  await expect(sport.locator("option")).toHaveText(["Choose sport","Tennis","Padel","Pickleball"]);
  await page.locator('[data-sport="padel"]').click();
  await expect(page.locator("#courtMessage")).toHaveText("No Padel courts are currently available.");
  await page.locator('[data-sport="pickleball"]').click();
  await expect(page.locator("#courtMessage")).toHaveText("No Pickleball courts are currently available.");
  await page.locator('[data-sport="tennis"]').click();
  const country=page.locator("#selCountry"),city=page.locator("#selCity"),club=page.locator("#selClub"),court=page.locator("#selCourt");
  await country.selectOption({index:1}); await city.selectOption({index:1}); await club.selectOption({index:1}); await court.selectOption({index:1});
  await expect(page.locator("#btnOpen")).toBeEnabled();
  const key=await page.evaluate(()=>["selCountry","selCity","selClub","selCourt"].map(id=>document.getElementById(id).value).join("/"));
  expect(key.split("/")).toHaveLength(4);

  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.locator(".vc-menu-toggle").click();
  await expect(page.locator("#vcMobileMenu nav a")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("production desktop/mobile navigation clicks open the owning applications", async ({browser}) => {
  for(const {viewport,language,nav} of [
    {viewport:{width:1440,height:900},language:"en",nav:".vc-home-links"},
    {viewport:{width:390,height:844},language:"el",nav:"#vcMobileMenu nav"},
  ]){
    const context=await browser.newContext({viewport});
    await context.addInitScript(lang=>localStorage.setItem("voxcourt-language",lang),language);
    const page=await context.newPage();
    for(const [href,pathname] of [["/tennislive-match/","/tennislive-match/"],["/tennislive-match/live","/tennislive-match/live"],["/matches/","/matches/"],["/members/manage.html","/members/manage.html"]]){
      await page.goto("https://voxcourt.com/tennislive-match/");
      if(viewport.width<=900) await page.locator(".vc-menu-toggle").click();
      await page.locator(`${nav} a[href="${href}"]`).click();
      await expect.poll(()=>new URL(page.url()).pathname).toBe(pathname);
    }
    for(const [href,pathname] of [["/matches/","/matches/"],["/members/manage.html","/members/manage.html"]]){
      await page.goto("https://voxcourt.com/tennislive-match/live");
      if(viewport.width<=900) await page.locator(".vc-menu-toggle").click();
      await page.locator(`${nav} a[href="${href}"]`).click();
      await expect.poll(()=>new URL(page.url()).pathname).toBe(pathname);
    }
    await context.close();
  }
});

test("production active sport cards preserve the requested finder sport", async ({page}) => {
  for(const sport of ["tennis","padel","pickleball"]){
    await page.goto("./");
    await page.locator(`.vc-sport-grid a[href$="sport=${sport}"]`).click();
    await expect.poll(()=>new URL(page.url()).pathname).toBe("/tennislive-match/live");
    await expect.poll(()=>new URL(page.url()).searchParams.get("sport")).toBe(sport);
    await expect(page.locator("#selSport")).toHaveValue(sport);
  }
});

test("production EN/EL and valid registered viewer", async ({page}) => {
  const errors=watchRuntime(page);
  await page.goto("./live");
  await page.locator("#selSport").selectOption({index:1});
  await page.locator("#selCountry").selectOption({index:1});
  await page.locator("#selCity").selectOption({index:1});
  await page.locator("#selClub").selectOption({index:1});
  await page.locator("#selCourt").selectOption({index:1});
  const key=await page.evaluate(()=>["selCountry","selCity","selClub","selCourt"].map(id=>document.getElementById(id).value).join("/"));
  await page.goto(`./?p=/${key}`);
  await expect(page.locator(".vc-viewer-page")).toBeVisible();
  await expect(page.locator("#matchStatusText")).toBeVisible();
  await expect(page.getByRole("button",{name:/Share match/i})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);

  const viewerUrl=page.url();
  await page.locator('.vc-home-links a[href="/matches/"]').click();
  await expect.poll(()=>new URL(page.url()).pathname).toBe("/matches/");
  await page.goto(viewerUrl);
  await page.locator('.vc-home-links a[href="/members/manage.html"]').click();
  await expect.poll(()=>new URL(page.url()).pathname).toBe("/members/manage.html");

  await page.goto("./");
  await page.locator('[data-language="el"]').first().click();
  await expect(page.locator("html")).toHaveAttribute("lang","el");
  await expect(page.getByRole("link",{name:/Βρες γήπεδο/}).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang","el");
  expect(errors).toEqual([]);
});

test("production match archive loads real history without mutation", async ({page}) => {
  const errors=watchRuntime(page);
  await page.goto("https://voxcourt.com/matches/");
  await expect(page.locator("#archiveStatus")).not.toContainText("Loading");
  await expect(page.locator("#sportFilter,#countryFilter,#clubFilter,#courtFilter,#playerFilter,#dateFilter")).toHaveCount(6);
  await page.locator("#clearFilters").click();
  await page.setViewportSize({width:430,height:932});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(errors).toEqual([]);
});
