import { expect, test } from "@playwright/test";

const match={
  matchId:"qa-match-1", courtId:"gr/attica/multi-club/tennis-1", sport:"tennis",
  nameA:"Αλέξανδρος", nameB:"Ελένη", setsA:2, setsB:0, gamesA:6, gamesB:4,
  winner:"A", winnerName:"Αλέξανδρος", finalScore:"2-0", status:"COMPLETED",
  startedAt:Date.now()-3600000, endedAt:Date.now(), durationSeconds:3600,
  formatLabel:"Best of 3", events:[], metadata:{},
};

function watchRuntime(page){
  const errors=[];
  page.on("pageerror",error=>errors.push(`pageerror: ${error.message}`));
  page.on("console",message=>{if(message.type()==="error")errors.push(`console: ${message.text()}`)});
  return errors;
}

test("match archive loads, filters, resets, opens cards, handles empty and mobile menu", async ({page}) => {
  const errors=watchRuntime(page);
  let items=[match];
  await page.route("https://api.voxcourt.com/api/matches/history?**",route=>route.fulfill({json:{ok:true,count:items.length,items}}));
  await page.goto("/matches/");
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.locator("#sportFilter option")).toContainText(["All sports","Tennis"]);
  await page.locator("#sportFilter").selectOption("tennis");
  await expect(page.locator(".match-card")).toHaveCount(1);
  await page.locator("#playerFilter").fill("missing");
  await expect(page.locator(".archive-message")).toContainText("No matches");
  await page.locator("#clearFilters").click();
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.locator(".match-card-link")).toHaveAttribute("href","/matches/match.html?id=qa-match-1");
  await expect(page.locator(".archive-language")).toBeVisible();
  await page.setViewportSize({width:768,height:1024});
  await page.locator("#mobileNavToggle").click();
  await expect(page.locator(".nav")).toBeVisible();
  await expect(page.locator(".nav a")).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  items=[];
  await page.locator("#refreshMatches").click();
  await expect(page.locator(".archive-message")).toContainText("No completed matches");
  expect(errors).toEqual([]);
});

test("match archive EL state and completed match detail render safely", async ({page}) => {
  const errors=watchRuntime(page);
  await page.addInitScript(()=>localStorage.setItem("voxcourt-language","el"));
  await page.route("https://api.voxcourt.com/api/matches/history?**",route=>route.fulfill({json:{ok:true,count:1,items:[match]}}));
  await page.goto("/matches/");
  await expect(page.locator("html")).toHaveAttribute("lang","el");
  await expect(page.locator("#archiveStatus")).toContainText("Ολοκληρωμένοι αγώνες");
  await expect(page.locator(".match-card-link")).toContainText("Προβολή αγώνα");

  await page.route("https://api.voxcourt.com/api/matches/history/qa-match-1",route=>route.fulfill({json:{ok:true,match}}));
  await page.goto("/matches/match.html?id=qa-match-1");
  await expect(page.locator(".detail-player-name")).toContainText(["Αλέξανδρος","Ελένη"]);
  await expect(page.locator(".final-pill")).toHaveText("Τελικό");
  await expect(page.locator("#shareMatch")).toHaveText("Κοινοποίηση");
  await page.locator("#shareMatch").click();
  await expect(page.locator('[data-tab="replay"]')).toBeVisible();
  await page.locator('[data-tab="replay"]').click();
  await expect(page.locator('[data-panel="replay"]')).toContainText("Η πλήρης επανάληψη δεν είναι διαθέσιμη");
  await page.setViewportSize({width:430,height:932});
  await page.locator("#mobileNavToggle").click();
  await expect(page.locator(".nav")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(errors).toEqual([]);
});
