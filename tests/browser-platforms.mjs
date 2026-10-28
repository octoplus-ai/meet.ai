import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5179';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Local fixture only');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[], sent=[]; let reply={status:409,body:{error:'platform_disabled'}};
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('octomeet:lang',JSON.stringify('es'));
    window.fixtureToasts=[];
    window.addEventListener('octo-toast',event=>window.fixtureToasts.push(event.detail));
  });
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base) return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let body={ok:true};
    if(url.pathname==='/api/me')body={user:{id:'fixture',email:'fixture@example.invalid',name:'Fixture',plan:'enterprise',gmailReady:true}};
    if(url.pathname==='/api/meetings')body={meetings:[]};
    if(url.pathname==='/api/recall/start-bot'){
      sent.push(route.request().postDataJSON());
      return route.fulfill({status:reply.status,contentType:'application/json',body:JSON.stringify(reply.body)});
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base);
  const add=page.getByRole('button',{name:/Add to live meeting|Agregar a reuni[oó]n en vivo|Agregar a reuni[oó]n/i});
  // The icon remains accessible when the sidebar is collapsed.
  await add.click();
  const input=page.getByPlaceholder(/Meet, Zoom.*Teams/);
  await input.fill('https://zoom.us.evil.test/j/12345678901'); await input.press('Enter');
  await page.waitForFunction(()=>window.fixtureToasts.some(text=>/no est[aá] admitida|not supported/.test(text)));
  assert.equal(sent.length,0,'Spoofed URLs must never call the API');
  for(const url of ['https://zoom.us/j/12345678901?pwd=opaque','https://teams.cloud.microsoft/meet/123456789012?p=opaque']){
    await page.evaluate(()=>window.fixtureToasts=[]);
    await input.fill(url); await input.press('Enter');
    await page.waitForFunction(()=>window.fixtureToasts.some(text=>/no est[aá] habilitada|not enabled/.test(text)));
    assert.equal(await input.inputValue(),url,'Failed requests keep the input for correction');
    await page.waitForFunction(()=>!document.querySelector('input[aria-busy="false"]')?.disabled);
  }
  reply={status:503,body:{error:'bot_backend_unavailable'}};
  await page.evaluate(()=>window.fixtureToasts=[]);
  await input.fill('https://meet.google.com/abc-defg-hij'); await input.press('Enter');
  await page.waitForFunction(()=>window.fixtureToasts.some(text=>/no est[aá] disponible|is unavailable/.test(text)));
  reply={status:200,body:{ok:true,mode:'inhouse'}};
  await page.evaluate(()=>window.fixtureToasts=[]);
  await input.press('Enter');
  await page.waitForFunction(()=>window.fixtureToasts.some(text=>/se est[aá] uniendo|is joining/.test(text)));
  assert.equal(await input.count(),0,'Accepted request closes the form');
  assert.equal(sent.length,4); assert.deepEqual(errors,[]);
  console.log('PASS actual React form: spoof rejected, Zoom/Teams disabled, unavailable error, Meet accepted; mocked APIs only');
} finally { await browser.close(); }
