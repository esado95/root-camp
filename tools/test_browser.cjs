const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const git = process.env.GIT_EXECUTABLE || 'git';
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const manifest = read('questions/manifest.json');
const base = 'd2abacc5038c51cd08455c765f198d5f05f2e381';
const oldManifest = JSON.parse(execFileSync(git, ['show', base + ':questions/manifest.json'], {cwd: root, encoding: 'utf8'}));
const current = manifest.themes.flatMap(t => t.modules.flatMap(m => read('questions/' + m.file).questions));
const oldQuestions = oldManifest.themes.flatMap(t => t.modules.flatMap(m => JSON.parse(execFileSync(git, ['show', base + ':questions/' + m.file], {cwd: root, encoding: 'utf8'})).questions));
const originalIds = new Set(oldQuestions.map(q => q.id));
const added = current.filter(q => !originalIds.has(q.id));
assert.equal(added.length, 64);
assert.equal(current.length, 957);
for (const q of oldQuestions) {
  const found = current.find(x => x.id === q.id);
  assert.ok(found, 'Missing original question ' + q.id);
  for (const field of ['niveau', 'type', 'answer', 'accept', 'steps', 'pairs']) assert.deepEqual(found[field], q[field], q.id + ': ' + field);
}
assert.equal(new Set(added.map(q => q.q)).size, 64);
const sourceReferences = read('docs/course-sources.json');
assert.ok(added.every(q => !Object.hasOwn(q, 'source') && typeof sourceReferences[q.id] === 'string'));
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
  if (relative === 'js/config.js') { res.writeHead(200, {'Content-Type':mime['.js']}).end('const ONLINE_CONFIG={url:"",key:"",emailDomain:""};'); return; }
  fs.readFile(target, (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream'}).end(bytes);
  });
});
const artifacts = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'root-camp-qa-'));
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({channel:'msedge', headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => bootDone && BANK.length === 957);
  await page.getByRole('button', {name:"C'est parti", exact:true}).click();
  assert.equal(await page.locator('.card[data-theme]').count(), 10);
  for (const id of ['materiel','reseau','virtualisation','securite']) {
    await page.locator('.card[data-theme="' + id + '"]').click();
    const newNames = manifest.themes.find(t => t.id === id).modules.filter(m => !oldManifest.themes.find(t => t.id === id).modules.some(o => o.id === m.id)).map(m => m.name);
    for (const name of newNames) assert.ok((await page.locator('#screen').innerText()).includes(name), name + ' missing from theme');
    await page.evaluate(() => nav('home'));
  }
  let answered = 0, examDraws = 0;
  function choiceButton(text) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return page.locator('#answers button').filter({hasText:new RegExp('^[A-Z]\\s*'+escaped+'$')});
  }
  async function answer(q, good) {
    if (q.type === 'qcm' || q.type === 'scenario') {
      const index = good ? q.answer : (q.answer + 1) % q.choices.length;
      await choiceButton(q.choices[index]).click();
    } else if (q.type === 'multi') {
      const indices = good ? q.answer : q.answer.length > 1 ? q.answer.slice(0,1) : [(q.answer[0]+1)%q.choices.length];
      for (const index of indices) await choiceButton(q.choices[index]).click();
      await page.locator('#validate').click();
    } else if (q.type === 'libre') {
      await page.locator('#libre').fill(good ? q.accept[0] : 'reponse volontairement fausse');
      await page.locator('#validate').click();
    } else if (q.type === 'terminal') {
      await page.locator('.term-input').fill(good ? q.accept[0] : 'commande-volontairement-fausse');
      await page.locator('.term-input').press('Enter');
    } else if (q.type === 'assoc') {
      if (!good) {
        await page.locator('#colL').getByRole('button',{name:q.pairs[0][0],exact:true}).click();
        await page.locator('#colR').getByRole('button',{name:q.pairs[1][1],exact:true}).click();
      }
      for (const [left,right] of q.pairs) {
        await page.locator('#colL button').getByText(left,{exact:true}).click();
        await page.locator('#colR button').getByText(right,{exact:true}).click();
      }
    } else if (q.type === 'ordre') {
      if (!good) await page.locator('#answers').getByRole('button',{name:q.steps[q.steps.length-1],exact:true}).click();
      for (const step of q.steps) await page.locator('#answers button').getByText(step,{exact:true}).click();
    }
  }
  const runs = [
    {seed:7,width:1280,height:900}, {seed:19,width:390,height:844},
    {seed:101,width:768,height:1024}, {seed:773,width:1440,height:900},
    {seed:20261008,width:360,height:800}
  ];
  for (const run of runs) {
    await page.setViewportSize({width:run.width,height:run.height});
    await page.evaluate(seed => { let s=seed; Math.random=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296); },run.seed);
    for (const q of added) for (const good of [true,false]) {
      await page.evaluate(id => { state=defaultState(); const q=BANK.find(x=>x.id===id); startSession([q], {title:q.module, themeId:q.theme}); },q.id);
      await answer(q,good);
      const result = await page.evaluate(id=>({ok:session.ok,total:state.cnt.total,xp:state.xp,a:state.q[id].a,review:state.review.includes(id)}),q.id);
      assert.deepEqual(result,{ok:Number(good),total:1,xp:good?({1:1,2:2,3:3,4:5})[q.niveau]:0,a:1,review:!good},q.id+' score '+good);
      assert.ok((await page.locator('#fb').innerText()).includes(q.explication),q.id+' missing explanation');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),q.id+' horizontal overflow at '+run.width);
      answered++;
      if (answered%32===0) console.log(`UI ${answered}/640: seed ${run.seed}, width ${run.width}`);
    }
    const exams = await page.evaluate(() => {
      session=null; state=defaultState(); let draws=0;
      const expected={1:[20,0,0,0],2:[8,12,0,0],3:[4,8,8,0],4:[4,6,6,4]};
      for (let p=1;p<=4;p++) for(let i=0;i<1000;i++) {
        const qs=drawExam(p); const levels=[1,2,3,4].map(n=>qs.filter(q=>q.niveau===n).length);
        if(qs.length!==20 || new Set(qs.map(q=>q.id)).size!==20 || qs.some(q=>!EXAM_TYPES.includes(q.type)) || JSON.stringify(levels)!==JSON.stringify(expected[p])) throw new Error('Invalid exam '+p+' draw '+i);
        draws++;
      }
      return draws;
    });
    examDraws+=exams;
    console.log(`PASS seed ${run.seed}: 128 answers, ${exams} exam draws`);
  }
  // Exercise both accepted SSH arrangements and reject changed option, path and user case.
  const ssh=added.find(q=>q.id==='aws-010');
  for (const command of [...ssh.accept,'ssh -I lab.pem admin@198.51.100.10','SSH -i lab.pem admin@198.51.100.10','ssh -i LAB.PEM admin@198.51.100.10','ssh -i lab.pem ADMIN@198.51.100.10']) {
    await page.evaluate(()=>{state=defaultState(); const q=BANK.find(q=>q.id==='aws-010'); startSession([q],{title:'SSH'});});
    await page.locator('.term-input').fill(command); await page.locator('.term-input').press('Enter');
    assert.equal(await page.evaluate(()=>session.ok),Number(ssh.accept.includes(command)),command);
  }
  const reviewQ=added.find(q=>q.type==='qcm');
  await page.evaluate(()=>{state=defaultState();});
  for(const good of [false,true,true]) {
    await page.evaluate(id=>{const q=BANK.find(q=>q.id===id);startSession([q],{title:'Révision',review:true});},reviewQ.id);
    await answer(reviewQ,good);
    assert.equal(await page.evaluate(id=>state.review.includes(id),reviewQ.id), !(good && (await page.evaluate(()=>state.cnt.total))===3));
  }
  // A checkpoint created by real answers must resume at the next unanswered question.
  const checkpointQs=added.filter(q=>q.type==='qcm').slice(0,10);
  await page.evaluate(ids=>{state=defaultState();state.accueilVu=true;startSession(ids.map(id=>BANK.find(q=>q.id===id)),{title:'Checkpoint',themeId:'reseau'});},checkpointQs.map(q=>q.id));
  await answer(checkpointQs[0],true); await page.locator('#next').click();
  await answer(checkpointQs[1],false);
  const beforeReload=await page.evaluate(()=>({xp:state.xp,total:state.cnt.total,checkpoint:state.checkpoint,review:state.review}));
  await page.reload(); await page.waitForFunction(()=>bootDone);
  assert.deepEqual(await page.evaluate(()=>({xp:state.xp,total:state.cnt.total,checkpoint:state.checkpoint,review:state.review})),beforeReload);
  await page.evaluate(()=>reprendreCheckpoint());
  assert.deepEqual(await page.evaluate(()=>({idx:session.idx,ok:session.ok,wrong:session.wrong.map(q=>q.id)})),{idx:2,ok:1,wrong:[checkpointQs[1].id]});
  await answer(checkpointQs[2],true);
  assert.equal(await page.evaluate(()=>state.cnt.total),3,'checkpoint double-counted an answer');
  // Exam feedback remains hidden; timeout counts unanswered questions as wrong.
  await page.evaluate(id=>{state=defaultState(); const q=BANK.find(q=>q.id===id);startSession([q,...BANK.filter(x=>x.id!==id&&x.type==='qcm').slice(0,19)],{title:'Examen',exam:true,palier:4});},reviewQ.id);
  await answer(reviewQ,true);
  assert.equal(await page.locator('.feedback').count(),0);
  assert.equal(await page.locator('#answers .good').count(),0);
  await page.evaluate(()=>showResult(true));
  assert.equal(await page.evaluate(()=>state.cnt.exams),1);
  assert.equal(await page.evaluate(()=>state.cnt.examBest),5);
  await page.evaluate(()=>{ state=defaultState(); state.accueilVu=true; state.xp=23; state.q['lin-001']={a:2,c:1,s:0}; state.cnt.total=2; state.cnt.ok=1; state.review=['lin-001']; persist(); session=null; nav('home'); });
  await page.reload();
  await page.waitForFunction(()=>bootDone);
  assert.deepEqual(await page.evaluate(()=>({xp:state.xp,q:state.q['lin-001'],review:state.review})),{xp:23,q:{a:2,c:1,s:0},review:['lin-001']});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>nav('home'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile horizontal overflow');
  await page.screenshot({path:path.join(artifacts,'mobile-home.png'),fullPage:true});
  await page.evaluate(()=>{const q=BANK.find(x=>x.id==='aws-013');startSession([q],{title:q.module,themeId:q.theme});});
  await page.screenshot({path:path.join(artifacts,'mobile-cloud-question.png'),fullPage:true});
  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
  console.log(`PASS: ${answered} UI answer cases across five seeds/viewports; ${examDraws} exam draws; SSH variants, review, checkpoint, exam timeout, saved progress, mobile layout; no browser errors.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
