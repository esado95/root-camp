/* Regression checks without network access: node tools/test_runtime.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}
function onlineFixture(cloud, readError = null) {
  const writes = [];
  const ctx = vm.createContext({
    console: { warn() {} }, navigator: { onLine: true },
    window: { addEventListener() {} }, document: { addEventListener() {} },
    setTimeout, clearTimeout, Date, ONLINE_CONFIG: { emailDomain: 'test.invalid' }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/online.js'), 'utf8'), ctx);
  ctx.client = {
    from(table) {
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: cloud ? { state: cloud } : null, error: readError }; },
        async upsert(value) { writes.push({ table, value }); return { error: null }; }
      };
    }
  };
  vm.runInContext('sb = client; onlineUser = {id:"alice", pseudo:"alice"}; syncOk = true;', ctx);
  return { ctx, writes };
}
const state = (xp, gen = 0, owner = 'alice') => ({ xp, gen, owner, badges: [], cnt: { examBest: 0 } });
(async () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const answers = vm.createContext({});
  vm.runInContext(app.slice(app.indexOf('function normalize(t)'), app.indexOf('function renderLibre(q)')), answers);
  vm.runInContext(app.slice(app.indexOf('function completerCommande('), app.indexOf('function brancheTab(')), answers);
  await test('SSH distinguishes -i and -I', () => {
    assert.equal(typeof answers.normalizeCommande, 'function', 'command comparison helper missing');
    assert.notEqual(answers.normalizeCommande('ssh -i lab.pem admin@host', true), answers.normalizeCommande('ssh -I lab.pem admin@host', true));
    assert.notEqual(answers.normalizeCommande('ssh -i lab.pem admin@host', true), answers.normalizeCommande('SSH -i LAB.PEM ADMIN@host', true));
    assert.equal(answers.normalizeCommande('  ssh   -i lab.pem admin@host  ', true), 'ssh -i lab.pem admin@host');
  });
  await test('Cisco command case and free-text normalization preserved', () => {
    assert.equal(answers.normalizeCommande('SHOW IP ROUTE', false), answers.normalizeCommande('show ip route', false));
    assert.equal(answers.normalize('  CTRL + C  '), 'ctrl+c');
    assert.equal(answers.completerCommande('sh', ['show ip route']), 'show ');
  });
  await test('SSH Tab completion respects case', () => {
    assert.equal(answers.completerCommande('ssh -I la', ['ssh -i lab.pem admin@host'], true), null);
    assert.equal(answers.completerCommande('ssh -i la', ['ssh -i lab.pem admin@host'], true), 'ssh -i lab.pem ');
  });
  await test('failed cloud read produces no write', async () => {
    const { ctx, writes } = onlineFixture(null, { message: 'offline' });
    assert.equal((await ctx.onlineFetchState()).ok, false);
    await ctx.onlinePushState(state(10), 1);
    assert.equal(writes.length, 0);
  });
  await test('newer cloud XP rejects older progress', async () => {
    const { ctx, writes } = onlineFixture(state(100));
    assert.equal(await ctx.onlinePushState(state(10), 1), 'stale');
    assert.equal(writes.length, 0);
  });
  await test('equal XP preserves additional wrong answers in cloud', async () => {
    const cloud = state(0); cloud.cnt.total = 10;
    const local = state(0); local.cnt.total = 2;
    const { ctx, writes } = onlineFixture(cloud);
    assert.equal(await ctx.onlinePushState(local, 1), 'stale');
    assert.equal(writes.length, 0);
    assert.equal(ctx.onlineStatus(), 'erreur');
    assert.ok(ctx.compareProgress(cloud, local) > 0);
    assert.ok(ctx.compareProgress(local, cloud) < 0);
  });
  await test('reset generation takes priority over XP', async () => {
    const { ctx, writes } = onlineFixture(state(100));
    await ctx.onlinePushState(state(0, 1), 1);
    assert.equal(writes.length, 2);
    assert.equal(writes.find(w => w.table === 'progress').value.state.gen, 1);
  });
  await test('older generation cannot resurrect reset progress', async () => {
    const { ctx, writes } = onlineFixture(state(0, 1));
    assert.equal(await ctx.onlinePushState(state(100, 0), 1), 'stale');
    assert.equal(writes.length, 0);
  });
  await test('closing page cannot bypass newer-cloud guard', async () => {
    const { ctx, writes } = onlineFixture(state(100));
    await ctx.onlinePushFast(state(10), 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 0);
  });
  await test('closing page cannot write after a failed read', async () => {
    const { ctx, writes } = onlineFixture(null, { message: 'offline' });
    await ctx.onlineFetchState();
    await ctx.onlinePushFast(state(10), 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 0);
  });
  await test('account cannot receive another owner\'s progress', async () => {
    const { ctx, writes } = onlineFixture(null);
    await ctx.onlinePushState(state(10, 0, 'bob'), 1);
    assert.equal(writes.length, 0);
  });
  await test('new account can save its first progress', async () => {
    const { ctx, writes } = onlineFixture(null);
    await ctx.onlinePushState(state(10), 1);
    assert.equal(writes.length, 2);
    assert.ok(writes.every(w => w.value.id === 'alice'));
  });
  await test('cloud read recovery re-enables synchronization', async () => {
    const { ctx, writes } = onlineFixture(null, { message: 'offline' });
    await ctx.onlineFetchState();
    ctx.client.from = table => ({
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: null, error: null }; },
      async upsert(value) { writes.push({ table, value }); return { error: null }; }
    });
    assert.equal((await ctx.onlineFetchState()).ok, true);
    await ctx.onlinePushState(state(10), 1);
    assert.equal(writes.length, 2);
    assert.equal(ctx.onlineStatus(), 'ok');
  });
  await test('account change during a read cannot redirect a save', async () => {
    const { ctx, writes } = onlineFixture(null);
    let release;
    ctx.client.from = table => ({
      select() { return this; }, eq() { return this; },
      maybeSingle() { return new Promise(resolve => { release = resolve; }); },
      async upsert(value) { writes.push({ table, value }); return { error: null }; }
    });
    const pending = ctx.onlinePushState(state(10), 1);
    vm.runInContext('onlineUser = {id:"bob", pseudo:"bob"};',ctx);
    release({ data: null, error: null });
    await pending;
    assert.equal(writes.length, 0);
  });
  await test('account change cannot load another account\'s cloud snapshot', async () => {
    const { ctx } = onlineFixture(state(100));
    let release;
    ctx.client.from = () => ({
      select() { return this; }, eq() { return this; },
      maybeSingle() { return new Promise(resolve => { release = resolve; }); }
    });
    const pending = ctx.onlineFetchState();
    vm.runInContext('onlineUser = {id:"bob", pseudo:"bob"};',ctx);
    release({ data: { state: state(100) }, error: null });
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.state, null);
  });
  await test('write rejection is shown as synchronization failure', async () => {
    const { ctx } = onlineFixture(null);
    ctx.client.from = () => ({
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: null, error: null }; },
      async upsert() { return { error: { message: 'denied' } }; }
    });
    await ctx.onlinePushState(state(10), 1);
    assert.equal(ctx.onlineStatus(), 'erreur');
  });
  console.log(`${passed} passed; ${failed} failed (no production requests)`);
  if (failed) process.exitCode = 1;
})();
