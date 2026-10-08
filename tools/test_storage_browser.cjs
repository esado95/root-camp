const fs=require('node:fs'), http=require('node:http'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname, '..');
const defaults=(xp,total,owner='alice',gen=0)=>({v:1,xp,gen,owner,accueilVu:true,q:{'lin-001':{a:total,c:0,s:0}},lv:{},review:['lin-001'],cnt:{total,ok:0},badges:[]});
const cases=[
  {name:'cloud retains more wrong answers at equal XP',local:defaults(0,2),cloud:defaults(0,10),xp:0,total:10},
  {name:'local retains more wrong answers at equal XP',local:defaults(0,10),cloud:defaults(0,2),xp:0,total:10},
  {name:'cloud reset takes priority over local XP',local:defaults(100,20),cloud:defaults(0,0,'alice',1),xp:0,total:0},
  {name:'foreign local state is replaced by account cloud',local:defaults(100,20,'bob'),cloud:defaults(3,4),xp:3,total:4},
  {name:'failed read preserves local progress',local:defaults(12,8),cloud:null,ok:false,xp:12,total:8},
  {name:'empty account cannot inherit another account progress',local:defaults(100,20,'bob'),cloud:null,xp:0,total:0},
  {name:'guest can adopt own local progress in empty account',local:defaults(12,8,null),cloud:null,xp:12,total:8},
  {name:'legacy browser key migrates with results',local:defaults(12,8),cloud:null,legacy:true,xp:12,total:8},
  {name:'invalid local JSON recovers without crashing',corrupt:true,cloud:null,xp:0,total:0}
];
const server=http.createServer((req,res)=>{
  const rel=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  const target=path.resolve(root,rel);
  if(!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
  if(rel==='js/config.js'){res.setHeader('Content-Type','application/javascript');res.end('const ONLINE_CONFIG={url:"",key:"",emailDomain:"test.invalid"};');return;}
  fs.readFile(target,(err,bytes)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'application/javascript','.json':'application/json','.css':'text/css','.html':'text/html'})[path.extname(target)]||'application/octet-stream');res.end(bytes);});
});
let browser, passed=0;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const c of cases){
    const context=await browser.newContext(); const errors=[];
    await context.route('**/*',async route=>{
      const u=route.request().url(); if(!u.startsWith(url))return route.abort();
      if(new URL(u).pathname==='/js/online.js'){
        const mock=`\nonlineInit=()=>true; onlineRestore=async()=>{onlineUser={id:"alice",pseudo:"alice"};}; onlineFetchState=async()=>({ok:${c.ok!==false},state:${JSON.stringify(c.cloud)}}); onlinePushSoon=()=>{};`;
        return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'js/online.js'),'utf8')+mock});
      }
      return route.continue();
    });
    await context.addInitScript(c=>{
      localStorage.setItem(c.legacy?'quiz-tssr2601-v1':'root-camp-v1',c.corrupt?'{invalid json':JSON.stringify(c.local));
    },c);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>bootDone);
    const actual=await page.evaluate(()=>({xp:state.xp,total:state.cnt.total,owner:state.owner}));
    assert.deepEqual(actual,{xp:c.xp,total:c.total,owner:'alice'},c.name);
    if(c.legacy)assert.equal(await page.evaluate(()=>localStorage.getItem('quiz-tssr2601-v1')),null);
    assert.equal(errors.length,0,errors.join('; '));passed++;console.log('PASS '+c.name);await context.close();
  }
  console.log(`PASS ${passed} browser save/restore scenarios (mocked cloud, no production writes)`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});
