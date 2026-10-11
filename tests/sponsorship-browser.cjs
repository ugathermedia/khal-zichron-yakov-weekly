// Run in CI: real browser engines, local static server, no production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, firefox, webkit } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const calendar = require('./fixtures/sponsorship-calendar.json').weeks;
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.ttf':'font/ttf' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://local').pathname === '/' ? '/index.html' : new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => { res.writeHead(error ? 404 : 200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' }); res.end(error ? '' : bytes); });
});
const normalize = s => s.replace(/Parshas |Shabbos |Chodesh /g,'').replace(/ · /g,' ').replace(/\s+/g,' ').trim();
async function main() {
  await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
  const results = [];
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport:{width:1250,height:1400}, acceptDownloads:true });
      let mode = 'fixture';
      const calls = [];
      await page.route('https://zichronyakov.ugathermedia.com/api/sponsorship?*', async route => {
        const week = new URL(route.request().url()).searchParams.get('week'); calls.push(week);
        if (mode === 'failed') return route.fulfill({status:503,contentType:'application/json',body:'{}'});
        let sponsorship = null;
        if (week === calendar[1].week) sponsorship = {week,sponsorName:'Anonymous',dedication:'לע״נ ר׳ משה בן ר׳ יעקב',email:'PRIVATE@example.invalid',contactName:'PRIVATE CONTACT'};
        if (week === calendar[2].week) sponsorship = {week,sponsorName:'The Cohen Family',dedication:'In loving memory of our beloved parents and grandparents'};
        if (mode === 'overflow' && week === calendar[2].week) sponsorship.dedication = 'Long dedication '.repeat(150);
        if (mode === 'malformed') sponsorship = {week:'1900-01-01',sponsorName:'Wrong week',dedication:''};
        return route.fulfill({contentType:'application/json',body:JSON.stringify({sponsorship})});
      });
      await page.goto('http://127.0.0.1:8765');
      await page.locator('[data-view-tab="sponsorships"]').click();
      await page.waitForFunction(()=>document.getElementById('sponsorSeasonStatus').textContent.startsWith('Live sponsorship data loaded'));
      assert.equal(new Set(calls).size,28);
      const rows = page.locator('.season-row');
      assert.equal(await rows.count(),28);
      for(let i=0;i<28;i++) {
        const text = normalize(await rows.nth(i).locator('.season-parsha').innerText());
        assert.ok(text.includes(normalize(calendar[i].parsha)),calendar[i].week+': '+text);
        for(const special of calendar[i].special) assert.ok(text.includes(normalize(special)),calendar[i].week+': missing '+special);
      }
      const content = await page.locator('#sponsorSeasonSheet').innerText();
      assert.ok(content.includes('Oct 10, 2026') && content.includes('Apr 17, 2027'));
      assert.equal(await page.locator('.season-available').count(),26);
      assert.ok(content.includes('Anonymous') && !content.includes('PRIVATE'));
      assert.equal(await page.locator('.season-cell.overflow').count(),0);
      await page.locator('#sponsorSeasonSheet').screenshot({path:path.join(output,name+'-sheet.png')});
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#sponsorSeasonJpeg').click();
      const download = await downloadPromise;
      const jpeg = path.join(output,name+'-sheet.jpg');
      await download.saveAs(jpeg);
      assert.ok(fs.statSync(jpeg).size < 1000000);
      const bytes=fs.readFileSync(jpeg); assert.equal(bytes.readUInt16BE(0),0xffd8);
      await page.waitForFunction(()=>document.getElementById('sponsorSeasonStatus').textContent.startsWith('Exported'));
      if(name==='chromium') {
        const pdfBytes = await page.pdf({path:path.join(output,'season.pdf'),preferCSSPageSize:true,printBackground:true});
        const pdf=await PDFDocument.load(pdfBytes); assert.equal(pdf.getPageCount(),1); assert.deepEqual(pdf.getPage(0).getSize(),{width:612,height:792});
      }
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('#printSheetMount').isVisible(),false);
      assert.equal(await page.locator('#sponsorSeasonSheet').isVisible(),true);
      await page.emulateMedia({media:'screen'});
      // Narrow viewport and saved tab restoration retain all rows and fit.
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.locator('.season-row').count(),28);
      assert.equal(await page.locator('.season-cell.overflow').count(),0);
      await page.reload();
      await page.waitForFunction(()=>document.getElementById('sponsorSeasonStatus').textContent.startsWith('Live sponsorship data loaded'));
      await page.setViewportSize({width:1250,height:1400});
      // Oversized dedication is flagged and cannot silently clip in export.
      mode='overflow'; await page.locator('#sponsorSeasonRefresh').click();
      await page.waitForFunction(()=>document.querySelector('.season-cell.overflow'));
      await page.locator('#sponsorSeasonJpeg').click();
      await page.waitForFunction(()=>document.getElementById('sponsorSeasonStatus').textContent.startsWith('Could not export'));
      for(const failure of ['failed','malformed']) {
        mode=failure; await page.locator('#sponsorSeasonRefresh').click();
        await page.waitForFunction(()=>document.getElementById('sponsorSeasonStatus').textContent.startsWith('Could not load'));
        assert.equal(await rows.count(),0,'Failed refresh must not show stale availability');
        await page.locator('#sponsorSeasonJpeg').click();
        assert.match(await page.locator('#sponsorSeasonStatus').innerText(),/Refresh live/);
      }
      // Existing views and their print mount remain isolated.
      await page.locator('[data-view-tab="weekly"]').click();
      assert.equal(await page.locator('#sponsorshipSeasonView').isVisible(),false);
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('#sponsorSeasonSheet').isVisible(),false);
      assert.equal(await page.locator('#printSheetMount').evaluate(el=>getComputedStyle(el).display),'block');
      await page.emulateMedia({media:'screen'});
      await page.locator('[data-view-tab="holiday"]').click();
      assert.equal(await page.locator('[data-app-view="holiday"]').isVisible(),true);
      assert.equal(await page.locator('#sponsorshipSeasonView').isVisible(),false);
      results.push({engine:name,jpegBytes:fs.statSync(jpeg).size,passed:true});
    } finally { await browser.close(); }
  }
  // Exercise all live public reads with the actual deployed origin.
  const headers={Origin:'https://ugathermedia.github.io'};
  for(const row of calendar) {
    const response=await fetch('https://zichronyakov.ugathermedia.com/api/sponsorship?week='+row.week,{headers,signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('access-control-allow-origin'),headers.Origin);
    const payload=await response.json(); assert.ok('sponsorship' in payload);
    if(payload.sponsorship) {
      assert.equal(payload.sponsorship.week,row.week);
      assert.deepEqual(Object.keys(payload.sponsorship).sort(),['dedication','sponsorName','week']);
    }
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,liveWeeks:28},null,2));
  console.log(JSON.stringify(results));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
