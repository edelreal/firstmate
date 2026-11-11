const { chromium } = require('~/.local/share/fnm/node-versions/v26.4.0/installation/lib/node_modules/@playwright/cli/node_modules/playwright');
const BOARD = 'file://' + process.argv[2];
const EV = process.argv[3];
const results = [];
function rec(scn, ok, info) { results.push({ scn, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + scn + ' :: ' + JSON.stringify(info)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { window.__queued = []; window.lavish = { queuePrompt: function () { window.__queued.push(Array.from(arguments)[0]); } }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BOARD);
  await page.waitForSelector('.bb-decision');
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  return { ctx, page, errors };
}
(async () => {
  const browser = await chromium.launch();
  // ---- S2 tiles
  {
    const { ctx, page, errors } = await newPage(browser, 1280, 720);
    await page.screenshot({ path: EV + '/01-board-top-1280.png' });
    const tiles = await page.$$eval('#bb-stats > *', ns => ns.map(n => ({ tag: n.tagName, label: n.querySelector('.bb-stat__label').textContent, num: n.querySelector('.bb-stat__num').textContent })));
    const expect = { 'need you': "Captain's Call", 'underway': 'Underway', 'landed recently': 'Recently Landed', 'charted next': 'Charted Next' };
    for (let i = 0; i < tiles.length; i++) {
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
      const hash0 = await page.evaluate(() => location.href);
      await page.locator('#bb-stats > *').nth(i).click();
      await sleep(1200);
      const r = await page.evaluate((label) => {
        // the section whose top is nearest the nav bottom, read from its visible eyebrow heading
        const navH = document.querySelector('.bb-nav').getBoundingClientRect().bottom;
        const secs = Array.from(document.querySelectorAll('section.bb-section')).map(s => ({ head: s.querySelector('.fm-sign--eyebrow').textContent.trim(), top: Math.round(s.getBoundingClientRect().top) }));
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        return { navBottom: Math.round(navH), scrollY: Math.round(scrollY), atMaxScroll: Math.abs(scrollY - maxScroll) < 2, secs, href: location.href, queued: window.__queued.length };
      });
      const want = expect[tiles[i].label];
      const target = r.secs.find(s => s.head.startsWith(want));
      const aligned = target && (Math.abs(target.top - r.navBottom) <= 1 || (r.atMaxScroll && target.top >= r.navBottom - 1 && target.top < 720));
      const ok = tiles[i].tag === 'BUTTON' && aligned && r.queued === 0 && r.href === hash0;
      rec('S2 tile "' + tiles[i].label + '" -> ' + want, ok, { tag: tiles[i].tag, num: tiles[i].num, navBottom: r.navBottom, sectionTop: target && target.top, scrollY: r.scrollY, atMaxScroll: r.atMaxScroll, queued: r.queued, hashChanged: r.href !== hash0 });
      await page.screenshot({ path: EV + '/02-tile-' + (i + 1) + '-' + tiles[i].label.replace(/ /g, '-') + '.png' });
    }
    rec('S2 no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  // ---- S3 fixed stack height
  {
    const { ctx, page, errors } = await newPage(browser, 1280, 900);
    const n = await page.$$eval('.bb-decision', c => c.length);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const m = await page.evaluate(() => {
        const vis = Array.from(document.querySelectorAll('.bb-decision')).find(c => !c.hidden);
        const below = document.getElementById('bb-sec-underway');
        const nav = document.getElementById('bb-stack-count');
        return { title: vis.querySelector('.bb-decision__title, h3, .bb-decision__q') ? (vis.querySelector('.bb-decision__title, h3, .bb-decision__q').textContent.slice(0, 40)) : '', cardH: Math.round(vis.getBoundingClientRect().height), underwayTop: Math.round(below.getBoundingClientRect().top + scrollY), count: nav.textContent, docH: document.documentElement.scrollHeight };
      });
      rows.push(m);
      await page.screenshot({ path: EV + '/03-stack-card-' + (i + 1) + '.png', fullPage: true });
      if (i < n - 1) { await page.click('#bb-stack-next'); await sleep(200); }
    }
    const sameH = rows.every(r => r.cardH === rows[0].cardH);
    const sameBelow = rows.every(r => r.underwayTop === rows[0].underwayTop && r.docH === rows[0].docH);
    rec('S3 every card same height; content below never moves while paging', sameH && sameBelow, rows);
    // resize keeps the invariant
    await page.setViewportSize({ width: 900, height: 900 }); await sleep(400);
    const rows2 = [];
    for (let i = n - 1; i >= 0; i--) {
      rows2.push(await page.evaluate(() => { const vis = Array.from(document.querySelectorAll('.bb-decision')).find(c => !c.hidden); return { cardH: Math.round(vis.getBoundingClientRect().height), underwayTop: Math.round(document.getElementById('bb-sec-underway').getBoundingClientRect().top + scrollY) }; }));
      if (i > 0) { await page.click('#bb-stack-prev'); await sleep(200); }
    }
    rec('S3b after resize to 900px wide, paging back still keeps one height', rows2.every(r => r.cardH === rows2[0].cardH && r.underwayTop === rows2[0].underwayTop), rows2);
    rec('S3 no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  // ---- S4 Details view (tall card)
  {
    const { ctx, page, errors } = await newPage(browser, 1280, 800);
    await page.click('#bb-stack-next'); await sleep(200);
    const btn = page.locator('.bb-decision:not([hidden]) .bb-detailsbtn');
    await btn.click(); await sleep(200);
    const d = await page.evaluate(() => {
      const m = document.getElementById('bb-modal'); const r = m.getBoundingClientRect();
      const body = document.getElementById('bb-modal-body');
      return {
        hidden: m.hidden, rect: [r.x, r.y, r.width, r.height], vw: innerWidth, vh: innerHeight,
        title: document.getElementById('bb-modal-title').textContent,
        meta: document.getElementById('bb-modal-meta').textContent,
        sections: Array.from(body.querySelectorAll('.bb-modal__section > .fm-sign--eyebrow')).map(n => n.textContent),
        ctxParas: Array.from(body.querySelectorAll('.bb-modal__ctxp')).map(p => p.textContent),
        options: Array.from(body.querySelectorAll('.bb-modal__opt')).map(o => ({ label: o.querySelector('.bb-modal__optname').textContent, rec: o.classList.contains('bb-modal__opt--rec'), hint: (o.querySelector('.bb-modal__opthint') || {}).textContent, details: Array.from(o.querySelectorAll('.bb-modal__optp')).map(p => p.textContent) })),
        links: Array.from(body.querySelectorAll('a[href]')).map(a => ({ text: a.textContent, href: a.getAttribute('href') })),
        active: document.activeElement.id, mainInert: document.querySelector('.bb-main').inert, bodyLocked: document.body.classList.contains('bb-modal-open'),
        scrollable: document.getElementById('bb-modal-scroll').scrollHeight > document.getElementById('bb-modal-scroll').clientHeight,
        queued: window.__queued.length
      };
    });
    await page.screenshot({ path: EV + '/04-details-tall-card-top.png' });
    const fullScreen = !d.hidden && d.rect[0] === 0 && d.rect[1] === 0 && d.rect[2] === d.vw && d.rect[3] === d.vh;
    rec('S4 Details opens a full-screen view focused on Close, page behind inert', fullScreen && d.active === 'bb-modal-close' && d.mainInert && d.bodyLocked, { rect: d.rect, active: d.active, mainInert: d.mainInert, title: d.title, meta: d.meta });
    const labels = d.options.map(o => o.label);
    rec('S4 view shows context paragraphs and every option with hint and details', d.ctxParas.length === 3 && d.sections.join('|') === 'Context|Options' && labels.join('|') === 'Redis|Memcached|Local disk snapshot|Defer to next quarter|Reconcile' && d.options[0].rec && d.options[0].details.length === 2 && d.options[0].hint === 'Shared cache, survives restarts', { sections: d.sections, ctxParas: d.ctxParas.length, options: d.options });
    const hrefs = d.links.map(l => l.href);
    const wantHrefs = ['https://example.com/bench/cache-2026', 'https://github.com/acme/widgets/pull/42', 'https://example.com/x', 'https://en.wikipedia.org/wiki/Cache_(computing)'];
    rec('S8 https links in context/detail resolve without trailing punctuation, backticks or ** markers; parens kept', JSON.stringify(hrefs) === JSON.stringify(wantHrefs), d.links);
    // scroll the body to the end with the mouse wheel
    const winY0 = await page.evaluate(() => scrollY);
    await page.mouse.move(640, 500); await page.mouse.wheel(0, 3000); await sleep(400);
    const sc = await page.evaluate(() => { const s = document.getElementById('bb-modal-scroll'); return { scrollTop: s.scrollTop, max: s.scrollHeight - s.clientHeight, winY: scrollY }; });
    sc.winY0 = winY0;
    await page.screenshot({ path: EV + '/05-details-tall-card-scrolled.png' });
    rec('S4 body scrolls inside the view (page behind does not)', (d.scrollable ? sc.scrollTop > 0 && Math.abs(sc.scrollTop - sc.max) < 2 : true) && sc.winY === winY0, { scrollable: d.scrollable, ...sc });
    await page.keyboard.press('Escape'); await sleep(150);
    const after = await page.evaluate(() => ({ hidden: document.getElementById('bb-modal').hidden, active: document.activeElement.textContent, activeInVisibleCard: !!document.activeElement.closest('.bb-decision:not([hidden])'), mainInert: document.querySelector('.bb-main').inert, queued: window.__queued.length }));
    rec('S4 Escape closes, focus back on the card Details button, nothing queued', after.hidden && after.active === 'Details' && after.activeInVisibleCard && !after.mainInert && after.queued === 0 && d.queued === 0, after);
    // Close button path on the merge card
    await page.click('#bb-stack-next'); await sleep(150);
    await page.locator('.bb-decision:not([hidden]) .bb-detailsbtn').click(); await sleep(150);
    const mergeView = await page.evaluate(() => ({ meta: document.getElementById('bb-modal-meta').textContent, links: Array.from(document.querySelectorAll('#bb-modal-body a[href]')).map(a => a.href), body: document.getElementById('bb-modal-body').innerText.slice(0, 400) }));
    await page.screenshot({ path: EV + '/06-details-merge-card.png' });
    await page.click('#bb-modal-close'); await sleep(150);
    const afterClose = await page.evaluate(() => ({ hidden: document.getElementById('bb-modal').hidden, active: document.activeElement.textContent, queued: window.__queued.length }));
    rec('S4 merge card view shows risk and PR link; Close button closes it', /risk/i.test(mergeView.body) && mergeView.links.includes('https://github.com/acme/widgets/pull/42') && afterClose.hidden && afterClose.active === 'Details' && afterClose.queued === 0, { mergeView, afterClose });
    rec('S4 no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  // ---- S5 keyboard + long title (credential card, no links)
  {
    const { ctx, page, errors } = await newPage(browser, 1280, 640);
    for (let i = 0; i < 3; i++) { await page.click('#bb-stack-next'); await sleep(120); }
    await page.locator('.bb-decision:not([hidden]) .bb-detailsbtn').focus();
    await page.keyboard.press('Enter'); await sleep(200);
    const head = await page.evaluate(() => {
      const h = document.querySelector('.bb-modal__heading').getBoundingClientRect();
      const c = document.getElementById('bb-modal-close').getBoundingClientRect();
      const b = document.getElementById('bb-modal-scroll').getBoundingClientRect();
      return { vh: innerHeight, headingH: Math.round(h.height), closeTop: Math.round(c.top), closeBottom: Math.round(c.bottom), bodyTop: Math.round(b.top), bodyH: Math.round(b.height), links: document.querySelectorAll('#bb-modal a[href]').length, active: document.activeElement.id };
    });
    await page.screenshot({ path: EV + '/07-details-long-title-640h.png' });
    rec('S5 long title capped at 40vh; Close in view; body keeps room', head.headingH <= Math.ceil(0.4 * head.vh) && head.closeTop >= 0 && head.closeBottom <= head.vh && head.bodyH > 0.4 * head.vh && head.links === 0, head);
    const seq = [];
    const who = () => page.evaluate(() => { const a = document.activeElement; return a.id || a.className; });
    seq.push(await who());
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); await sleep(60); seq.push(await who()); }
    await page.keyboard.press('Shift+Tab'); await sleep(60); seq.push('S-Tab:' + await who());
    const leftModal = await page.evaluate(() => !document.getElementById('bb-modal').contains(document.activeElement));
    rec('S5 Tab cycles Close -> body -> heading -> Close, never leaves the view (no links)', seq.slice(0, 5).join(',') === 'bb-modal-close,bb-modal-scroll,bb-modal__heading,bb-modal-close,bb-modal-scroll' && !leftModal, seq);
    // focus is on body; scroll it with the keyboard
    await page.evaluate(() => document.getElementById('bb-modal-scroll').focus());
    const before = await page.evaluate(() => document.getElementById('bb-modal-scroll').scrollTop);
    await page.keyboard.press('PageDown'); await sleep(400);
    const afterPD = await page.evaluate(() => document.getElementById('bb-modal-scroll').scrollTop);
    await page.keyboard.press('End'); await sleep(600);
    const endState = await page.evaluate(() => { const s = document.getElementById('bb-modal-scroll'); const paras = Array.from(document.querySelectorAll('.bb-modal__ctxp')); const last = paras.find(p => /LAST PARAGRAPH MARKER/.test(p.textContent)); const r = last.getBoundingClientRect(); return { scrollTop: Math.round(s.scrollTop), max: s.scrollHeight - s.clientHeight, lastParaVisible: r.top >= s.getBoundingClientRect().top && r.bottom <= innerHeight }; });
    await page.screenshot({ path: EV + '/08-details-keyboard-scrolled-end.png' });
    rec('S5 keyboard scrolls the body (PageDown, End) to the last paragraph', afterPD > before && endState.lastParaVisible, { before, afterPD, ...endState });
    rec('S5 no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  // ---- S6 320px: Details stays inside card after queueing
  {
    const { ctx, page, errors } = await newPage(browser, 320, 740);
    const n = await page.$$eval('.bb-decision', c => c.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(await page.evaluate(() => { const card = Array.from(document.querySelectorAll('.bb-decision')).find(c => !c.hidden); const cr = card.getBoundingClientRect(); const br = card.querySelector('.bb-detailsbtn').getBoundingClientRect(); const qr = card.querySelector('button[type=submit]').getBoundingClientRect(); return { inside: br.left >= cr.left && br.right <= cr.right && br.bottom <= cr.bottom && qr.right <= cr.right, card: [Math.round(cr.left), Math.round(cr.right)], details: [Math.round(br.left), Math.round(br.right)] }; }));
      if (i < n - 1) { await page.click('#bb-stack-next'); await sleep(120); }
    }
    for (let i = 0; i < n; i++) { await page.click('#bb-stack-prev').catch(() => {}); await sleep(60); }
    // queue an answer on card 1
    await page.locator('.bb-decision:not([hidden]) .bb-opt').first().click();
    await page.locator('.bb-decision:not([hidden]) button[type=submit]').click();
    await sleep(700);
    await page.click('#bb-stack-prev'); await sleep(200);
    const q = await page.evaluate(() => { const card = Array.from(document.querySelectorAll('.bb-decision')).find(c => !c.hidden); const cr = card.getBoundingClientRect(); const br = card.querySelector('.bb-detailsbtn').getBoundingClientRect(); const badge = card.querySelector('.bb-queued'); return { queuedClass: card.classList.contains('is-queued'), badgeShown: getComputedStyle(badge).display !== 'none', inside: br.left >= cr.left && br.right <= cr.right && br.bottom <= cr.bottom && br.width > 0, card: [Math.round(cr.left), Math.round(cr.right), Math.round(cr.bottom)], details: [Math.round(br.left), Math.round(br.right), Math.round(br.bottom)], queued: window.__queued }; });
    await page.locator('.bb-decision:not([hidden])').screenshot({ path: EV + '/09-card-queued-320px.png' });
    rec('S6 at 320px every card keeps Details inside the card, before and after queueing', out.every(o => o.inside) && q.queuedClass && q.badgeShown && q.inside, { perCard: out, queuedCard: q });
    rec('S6 no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  // ---- S7 queue, open Details before the advance, close -> focus on the visible card's Details
  {
    const { ctx, page, errors } = await newPage(browser, 1280, 800);
    await page.locator('.bb-decision:not([hidden]) .bb-opt').first().click();
    await page.locator('.bb-decision:not([hidden]) button[type=submit]').click();
    await page.locator('.bb-decision:not([hidden]) .bb-detailsbtn').click();
    const openedOn = await page.evaluate(() => document.getElementById('bb-modal-title').textContent);
    await sleep(800);
    await page.keyboard.press('Escape'); await sleep(150);
    const f = await page.evaluate(() => { const a = document.activeElement; const card = a.closest('.bb-decision'); return { activeText: a.textContent, inVisibleCard: !!card && !card.hidden, visible: a.checkVisibility ? a.checkVisibility() : null, cardCount: document.getElementById('bb-stack-count').textContent, queued: window.__queued.length }; });
    await page.screenshot({ path: EV + '/10-focus-after-advance-close.png' });
    rec('S7 queue then Details before advance: Close puts focus on the now-shown card Details button; one answer queued', f.activeText === 'Details' && f.inVisibleCard && f.visible === true && /card 2 of 4/.test(f.cardCount) && f.queued === 1, { openedOn, ...f });
    rec('S7 no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  const fails = results.filter(r => !r.ok).length;
  require('fs').writeFileSync(EV + '/browser-drive-results.json', JSON.stringify(results, null, 2));
  console.log('TOTAL ' + results.length + ' FAILS ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR', e); process.exit(2); });
