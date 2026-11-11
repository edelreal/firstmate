// Drives the built bearings board in headless Chromium and records what the captain sees.
import { chromium } from "~/.local/share/fnm/node-versions/v26.4.0/installation/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs";
const [board, evDir, tag] = process.argv.slice(2);
const url = "file://" + board;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
await ctx.addInitScript(() => { window.__prompts = []; window.lavish = { queuePrompt: (...a) => window.__prompts.push(a) }; });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(300);
const R = { tag, errors };
const shot = async (name, opts = {}) => page.screenshot({ path: `${evDir}/${tag}-${name}.png`, ...opts });
const prompts = () => page.evaluate(() => window.__prompts.length);
async function firstCard() {
  for (let k = 0; k < 6; k++) {
    const b = await page.$("#bb-stack-prev");
    if (b && await b.isEnabled()) await b.click(); else break;
  }
  await page.waitForTimeout(600);
}

// ---- S1 summary tiles scroll to the section they count ----
async function tilePass(label) {
const res = [];
const tiles = await page.$$("#bb-stats > *");
for (let i = 0; i < tiles.length; i++) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const before = await prompts();
  const hashBefore = await page.evaluate(() => location.hash);
  const info = await tiles[i].evaluate(t => ({ tag: t.tagName.toLowerCase(), type: t.getAttribute("type"),
    label: t.querySelector(".bb-stat__label")?.textContent, n: t.querySelector(".bb-stat__num")?.textContent }));
  await tiles[i].click();
  await page.waitForTimeout(400);
  const landed = await page.evaluate(() => {
    const navH = document.querySelector(".bb-nav").getBoundingClientRect().bottom;
    const secs = [...document.querySelectorAll("section.bb-section[id]")].map(s => ({
      heading: s.querySelector(".fm-sign--eyebrow").textContent.trim(),
      top: Math.round(s.getBoundingClientRect().top) }));
    const atBottom = Math.ceil(window.scrollY + innerHeight) >= document.documentElement.scrollHeight - 1;
    return { scrollY: Math.round(window.scrollY), navBottom: Math.round(navH), atBottom, secs };
  });
  const under = landed.secs.filter(s => Math.abs(s.top - landed.navBottom) <= 2).map(s => s.heading);
  res.push({ ...info, scrollY: landed.scrollY, navBottom: landed.navBottom, atBottom: landed.atBottom,
    sectionUnderNav: under, sectionTops: landed.secs, prompts: (await prompts()) - before,
    hashChanged: (await page.evaluate(() => location.hash)) !== hashBefore });
  await shot(`${label}-tile-${i}-${(info.label || "").replace(/\s+/g, "-")}`);
}
await page.evaluate(() => window.scrollTo(0, 0));
return res;
}
if (tag !== "base") {
R.tiles = await tilePass("wide");
await page.setViewportSize({ width: 560, height: 700 }); await page.waitForTimeout(300);
R.tilesNarrow = await tilePass("narrow");
await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(300);
}

// ---- S2 every card keeps the tallest card's height; content below never moves ----
async function pageThrough(label) {
  const out = [];
  await page.evaluate(() => window.scrollTo(0, 0));
  await firstCard();
  const n = await page.$$eval("#bb-call .bb-decision", c => c.length);
  for (let k = 0; k < n; k++) {
    const m = await page.evaluate(() => {
      const c = [...document.querySelectorAll("#bb-call .bb-decision")].find(x => !x.hidden);
      const r = c.getBoundingClientRect();
      const s = c.style.minHeight; c.style.minHeight = ""; c.style.alignSelf = "start";
      const natural = Math.round(c.getBoundingClientRect().height);
      c.style.minHeight = s; c.style.alignSelf = "";
      return { title: c.querySelector(".bb-decision__title")?.textContent?.trim(),
        height: Math.round(r.height), natural,
        stackNavTop: Math.round(document.querySelector(".bb-stacknav").getBoundingClientRect().top + window.scrollY),
        underwayTop: Math.round(document.getElementById("bb-underway").closest("section").getBoundingClientRect().top + window.scrollY),
        chartedTop: Math.round(document.getElementById("bb-charted").closest("section").getBoundingClientRect().top + window.scrollY),
        count: document.getElementById("bb-stack-count").textContent };
    });
    out.push(m);
    await shot(`${label}-card-${k + 1}`);
    if (k < n - 1) { await page.click("#bb-stack-next"); await page.waitForTimeout(600); }
  }
  return out;
}
R.cardsWide = await pageThrough("wide");
if (tag === "base") { await browser.close(); console.log(JSON.stringify(R, null, 1)); process.exit(0); }
await page.setViewportSize({ width: 560, height: 900 });
await page.waitForTimeout(400);
R.cardsNarrow = await pageThrough("narrow");
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(400);

// ---- S3 Details opens a full-screen, scrolling explanation; queues nothing ----
R.details = [];
const n = await page.$$eval("#bb-call .bb-decision", c => c.length);
await firstCard();
for (let k = 0; k < n; k++) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await prompts();
  const btn = await page.$("#bb-call .bb-decision:not([hidden]) .bb-detailsbtn");
  const btnInfo = await btn.evaluate(b => ({ text: b.textContent, type: b.type, haspopup: b.getAttribute("aria-haspopup"), controls: b.getAttribute("aria-controls") }));
  await btn.click();
  await page.waitForTimeout(200);
  const view = await page.evaluate(() => {
    const m = document.getElementById("bb-modal"), r = m.getBoundingClientRect(), sc = document.getElementById("bb-modal-scroll");
    const body = document.getElementById("bb-modal-body");
    return {
      visible: !m.hidden && getComputedStyle(m).display !== "none",
      rect: { x: r.x, y: r.y, w: r.width, h: r.height }, viewport: { w: innerWidth, h: innerHeight },
      title: document.getElementById("bb-modal-title").textContent,
      meta: document.getElementById("bb-modal-meta").textContent,
      sections: [...body.querySelectorAll(".bb-modal__section > .fm-sign--eyebrow")].map(e => e.textContent),
      ctxRows: [...body.querySelectorAll(".bb-ctx > *")].map(e => e.textContent.replace(/\s+/g, " ").trim()),
      context: [...body.querySelectorAll(".bb-modal__ctxp")].map(p => p.textContent),
      none: [...body.querySelectorAll(".bb-modal__none")].map(p => p.textContent),
      options: [...body.querySelectorAll(".bb-modal__opt")].map(o => ({ label: o.querySelector(".bb-modal__optname").textContent,
        rec: o.classList.contains("bb-modal__opt--rec"), hint: o.querySelector(".bb-modal__opthint")?.textContent ?? null,
        details: [...o.querySelectorAll(".bb-modal__optp")].map(p => p.textContent) })),
      links: [...body.querySelectorAll("a")].map(a => a.getAttribute("href")),
      focus: document.activeElement?.id, bodyLocked: getComputedStyle(document.body).overflow,
      pageInert: document.querySelector(".bb-main").inert && document.querySelector(".bb-nav").inert,
      scrollable: sc.scrollHeight > sc.clientHeight, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight };
  });
  await shot(`details-${k + 1}-open`);
  let scrolled = null;
  if (view.scrollable) {
    await page.mouse.move(640, 400); await page.mouse.wheel(0, 2000); await page.waitForTimeout(400);
    scrolled = await page.evaluate(() => ({ scrollTop: Math.round(document.getElementById("bb-modal-scroll").scrollTop), pageScrollY: window.scrollY }));
    await shot(`details-${k + 1}-scrolled`);
  }
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const tabInside = await page.evaluate(() => document.getElementById("bb-modal").contains(document.activeElement));
  if (k === 0) await page.keyboard.press("Escape"); else await page.click("#bb-modal-close");
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ hidden: document.getElementById("bb-modal").hidden,
    focusIsDetails: !!document.activeElement?.classList.contains("bb-detailsbtn"),
    inert: document.querySelector(".bb-main").inert, bodyOverflow: getComputedStyle(document.body).overflow }));
  R.details.push({ btn: btnInfo, view, scrolled, tabInside, closedBy: k === 0 ? "Escape" : "Close", after, prompts: (await prompts()) - before });
  if (k < n - 1) { await page.click("#bb-stack-next"); await page.waitForTimeout(600); }
}

// ---- S5 answering on the card still queues exactly one answer ----
await firstCard();
await page.click("#bb-stack-next"); await page.waitForTimeout(600);
const before = await prompts();
const card = await page.$("#bb-call .bb-decision:not([hidden])");
await (await card.$(".bb-opt")).click();
await shot("answer-selected");
await (await card.$("button[type=submit]")).click();
await page.waitForTimeout(200);
R.answer = { queued: (await prompts()) - before, prompt: await page.evaluate(() => window.__prompts.at(-1)?.[0]) };
R.errors = errors;
await browser.close();
console.log(JSON.stringify(R, null, 1));
