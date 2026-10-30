// Offline CSS regression check using only synthetic shared-report data. Compares
// production CSS with v3 utilities generated from the actual rendered DOM, like
// the previous runtime compiler, without executing or contacting that CDN.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const builtIndex = await fs.readFile('dist/index.html', 'utf8');
assert.doesNotMatch(builtIndex, /cdn\.tailwindcss\.com|@tailwindcss\/browser/);
const cssPath = builtIndex.match(/href="(\/assets\/[^"/]+\.css)"/)?.[1];
assert.ok(cssPath, 'Production entry must link a compiled, local stylesheet');
const builtCss = await fs.readFile(path.join('dist', cssPath), 'utf8');
assert.doesNotMatch(builtCss, /@tailwind\s+(base|components|utilities)/);
const output = path.resolve(process.env.STYLES_EVIDENCE_DIR || '../rtms-deployment-evidence/security-20261030/local-css');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'msedge', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [], blocked = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) { blocked.push(url.origin); return route.abort(); }
      if (url.pathname === '/src/styles.css') return route.fulfill({ contentType: 'text/css', body: builtCss });
      if (url.pathname.startsWith('/api/')) throw new Error('Synthetic fixture unexpectedly requested a real API');
      return route.continue();
    });
    await page.goto(base + '/tests/shared-report-language.html');
    await page.getByText('Original planning summary.', { exact: true }).waitFor();
    const selector = page.getByRole('button', { name: /^Page language:/ });
    await selector.click();
    await page.getByRole('menu').waitFor();
    const html = await page.locator('body').innerHTML();
    const reference = await postcss([tailwindcss({ content: [{ raw: html, extension: 'html' }], theme: { extend: {} }, plugins: [] })])
      .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
    const snapshot = () => page.evaluate(() => {
      const properties = ['display', 'position', 'color', 'backgroundColor', 'fontSize', 'fontWeight', 'lineHeight',
        'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'padding', 'margin', 'gap',
        'borderWidth', 'borderStyle', 'borderColor', 'borderRadius', 'boxShadow', 'textAlign',
        'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'alignItems', 'justifyContent',
        'gridTemplateColumns', 'overflow', 'opacity', 'visibility', 'zIndex', 'inset', 'transform'];
      return [...document.body.querySelectorAll('*')].filter(el => !['SCRIPT', 'STYLE'].includes(el.tagName)).map(el => {
        const computed = getComputedStyle(el);
        return { tag: el.tagName, classes: typeof el.className === 'string' ? el.className : el.className.baseVal,
          ...Object.fromEntries(properties.map(name => [name, computed[name]])) };
      });
    });
    const productionStyles = await snapshot();
    await page.screenshot({ path: path.join(output, `report-${viewport.width}.png`), fullPage: true });
    await page.evaluate(css => {
      const old = document.querySelector('link[href="/src/styles.css"]');
      const style = document.createElement('style'); style.id = 'runtime-reference'; style.textContent = css;
      old.before(style); old.disabled = true;
    }, reference.css);
    const referenceStyles = await snapshot();
    assert.equal(productionStyles.length, referenceStyles.length, 'DOM changed during style comparison');
    const differences = productionStyles.flatMap((element, index) => Object.keys(element)
      .filter(key => element[key] !== referenceStyles[index][key])
      .map(key => ({ index, tag: element.tag, classes: element.classes, property: key, production: element[key], reference: referenceStyles[index][key] })));
    if (differences.length) await fs.writeFile(path.join(output, `differences-${viewport.width}.json`), JSON.stringify(differences, null, 2));
    assert.deepEqual(differences.slice(0, 12), [], `Rendered CSS differs (${differences.length} properties) at ${viewport.width}px`);
    await page.evaluate(() => { document.querySelector('link[href="/src/styles.css"]').disabled = false; document.querySelector('#runtime-reference').remove(); });
    await page.getByRole('menuitemradio', { name: /Español/ }).first().click();
    await page.getByText('Resumen de planificación traducido.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(blocked.some(origin => origin.includes('tailwind')), false);
    results.push({ viewport, elementsCompared: productionStyles.length, cssPropertiesCompared: 35, externalRequestsAllowed: 0, passed: true });
    await page.close();
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ cssAsset: cssPath, cssBytes: Buffer.byteLength(builtCss), results }, null, 2));
console.log(JSON.stringify({ passed: true, cssAsset: cssPath, results }, null, 2));
