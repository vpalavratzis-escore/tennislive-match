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
  await expect(page.locator("#homeSportChoice button").first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);

  await page.goto("./live");
  const sport=page.locator("#selSport");
  await expect(sport).toBeEnabled();
  const available=await sport.locator("option").evaluateAll(options=>options.slice(1).map(x=>x.value));
  expect(available.length).toBeGreaterThan(0);
  await page.locator(`[data-sport="${available[0]}"]`).click();
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
