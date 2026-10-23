// The local maintenance code must cross the same WebSocket and content-host routes as the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';
import { fixture } from './helpers/contentFixtures.js';
import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { makeMatch } from './match/harness.js';

for (const transport of ['vanilla', 'process', 'worker']) {
  test(`oalecd7e over WebSocket (${transport}): pending once, live grant, reconnect and a fresh match`, { timeout: 60000 }, async t => {
    const f = fixture(t);
    f.put('funds-probe', { rules: { unequip: 'allow' } });
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, assetIndex: false, studio: false,
      pluginsDir: path.join(f.dir, 'plugins'), packsDir: path.join(f.dir, 'packs'),
      matchHost: { transport: transport === 'vanilla' ? 'process' : transport, matchOptions: { botRehearsal: 0 } } });
    const clients = [];
    t.after(async () => { await Promise.all(clients.map(c => c.terminate())); await srv.close(); });
    const connect = async token => {
      const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws'); clients.push(c);
      const w = await c.hello('Funds probe', token); return { c, w };
    };
    const request = async (c, msg) => { const r = await c.request(msg, 10000); assert.equal(r.t, 'ok', JSON.stringify(r)); };
    let { c, w } = await connect();
    const session = srv.registry.byId(w.playerId);
    await request(c, { t: 'g.cheat', code: 'oalecd7e' });
    assert.equal((await c.request({ t: 'g.cheat', code: 'wrong-code' })).code, 'BAD_MSG');
    assert.equal(session.pendingCheatFunds, 999999, 'a wrong code cannot change the pending grant');
    await request(c, { t: 'g.cheat', text: 'oalecd7e' });
    assert.equal(session.pendingCheatFunds, 999999, 'repeated pre-registration is one pending grant');
    await c.terminate();
    ({ c, w } = await connect(w.token));
    assert.equal(session.pendingCheatFunds, 999999, 'pending grant survives reconnect');
    await request(c, { t: 'room.create', mode: transport === 'process' ? 'coop' : 'solo', difficulty: 'NORMAL' });
    const state = await c.waitFor('room.state', s => s.hostId === w.playerId);
    const room = srv.lobby.rooms.get(state.code);
    if (transport !== 'vanilla') {
      await request(c, { t: 'room.setPlugins', plugins: [{ id: 'funds-probe' }] });
      await request(c, { t: 'room.contentReady', cs: room.content.cs });
    }
    await request(c, { t: 'room.start' });
    assert.equal(session.pendingCheatFunds, undefined, 'start consumes pending registration');
    assert.equal((await c.waitFor('m.private', s => s.funds === 999999, 10000)).funds, 999999);
    assert.equal(!!room.match.hosted, transport !== 'vanilla');
    await request(c, { t: 'g.infoReady' });
    await c.waitFor('m.public', s => s.phase === 'BAND_DRAFT', 10000);
    await request(c, { t: 'g.band', bandId: 'band_amiya' });
    const opening = await c.waitFor('m.public', s => s.phase === 'PREP' || s.phase === 'SP_DRAFT', 10000);
    if (opening.phase === 'SP_DRAFT') {
      await request(c, { t: 'g.choice', idx: 0 });
      await c.waitFor('m.public', s => s.phase === 'PREP', 10000);
    }
    const prep = await c.waitFor('m.private', s => s.bandId === 'band_amiya' && s.funds > 999999);
    await request(c, { t: 'g.refresh' });
    const spent = await c.waitFor('m.private', s => s.funds === prep.funds - 1);
    const funded = spent.funds + 999999;
    await request(c, { t: 'g.cheat', code: 'oalecd7e' });
    assert.equal((await c.waitFor('m.private', s => s.funds === funded)).funds, funded);
    assert.equal((await c.request({ t: 'g.cheat', code: 'wrong-code' })).code, 'BAD_MSG');
    assert.equal(session.pendingCheatFunds, undefined);
    assert.equal((await c.request({ t: 'g.grantCheatFunds', playerId: w.playerId })).code, 'BAD_MSG', 'the internal hook is not a wire intent');
    if (transport === 'process') {
      const watcher = await connect();
      await request(watcher.c, { t: 'room.spectate', code: room.code });
      assert.equal((await watcher.c.request({ t: 'g.cheat', code: 'oalecd7e' })).code, 'SPECTATOR');
      assert.equal(srv.registry.byId(watcher.w.playerId).pendingCheatFunds, undefined);
    }
    await c.terminate();
    ({ c, w } = await connect(w.token));
    assert.equal((await c.waitFor('m.private', s => s.funds === funded)).funds, funded, 'resume preserves the grant without adding another');
    if (room.match.hosted) await room.match._request('finish', [{ victory: false, reason: 'test' }]);
    else room.match.finish({ victory: false, reason: 'test' });
    await c.waitFor('room.state', s => s.code === state.code && !s.inMatch);
    if (transport !== 'vanilla') await request(c, { t: 'room.contentReady', cs: room.content.cs });
    c.clearInbox();
    await request(c, { t: 'room.start' });
    assert.equal((await c.waitFor('m.private', () => true, 10000)).funds, 0, 'the next match starts with ordinary funds');
  });
}

test('the keyboard/console callback confirms only successful requests and labels pending funds for the next match', async () => {
  const source = fs.readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('  const triggerCheat = async () => {');
  const end = source.indexOf('  window.oalecd7e = triggerCheat;', start);
  assert.ok(start >= 0 && end > start);
  const callback = new vm.Script(`${source.slice(start, end)}; triggerCheat;`);
  for (const inMatch of [false, true]) for (const outcome of [true, false, 'throw']) {
    const messages = [], errors = [];
    const trigger = callback.runInNewContext({
      actions: { cheat: async code => { assert.equal(code, 'oalecd7e'); if (outcome === 'throw') throw new Error('offline'); return outcome; } },
      store: { get: () => ({ room: inMatch ? { inMatch: true } : null }) },
      t: id => id, toast: text => messages.push(text), toastError: err => errors.push(err),
    });
    assert.equal(await trigger(), outcome === true);
    assert.deepEqual(messages, outcome === true ? [`资金 +999999${inMatch ? '' : ' · 下一局生效'}`] : []);
    assert.equal(errors.length, outcome === 'throw' ? 1 : 0);
  }
});

test('a refused pending grant is logged without turning an already started match into a failed start', async t => {
  class RefusingMatch {
    start() { this.started = true; }
    grantCheatFunds() { return Promise.resolve({ error: 'ELIMINATED' }); }
    dispose() {}
  }
  const registry = new SessionRegistry(), errors = [];
  const lobby = new Lobby({ registry, MatchClass: RefusingMatch,
    log: { info() {}, warn() {}, error: text => errors.push(text) } });
  t.after(() => lobby.shutdown());
  const session = registry.create('Refusal probe');
  assert.deepEqual(lobby.onMessage(session, { t: 'g.cheat', code: 'oalecd7e' }), { ok: true });
  assert.deepEqual(lobby.create(session, { mode: 'solo', difficulty: 'NORMAL' }), { ok: true });
  assert.deepEqual(await lobby.start(session), { ok: true });
  assert.equal(lobby.roomOf(session).match.started, true);
  assert.equal(session.pendingCheatFunds, undefined);
  assert.ok(errors.some(text => text.includes('ELIMINATED')));
  assert.deepEqual(await lobby.onMessage(session, { t: 'g.cheat', code: 'oalecd7e' }), { error: 'ELIMINATED' }, 'a live refusal still reaches the requester');
});

test('the fixed grant hook rejects absent, bot, left, eliminated and ended seats; ordinary match intents cannot invoke it', t => {
  const h = makeMatch({ humans: 2, bots: 1 }).start(); t.after(() => h.m.dispose());
  const m = h.m, ps = h.ps('p_0');
  assert.equal(m.handle(ps.playerId, { t: 'g.cheat', code: 'oalecd7e' }).error, 'BAD_MSG');
  assert.equal(ps.funds, 0);
  for (const id of ['missing', 'ai_0']) assert.equal(m.grantCheatFunds(id).error, 'NOT_IN_ROOM');
  ps.left = true; assert.equal(m.grantCheatFunds(ps.playerId).error, 'NOT_IN_ROOM'); ps.left = false;
  ps.alive = false; assert.equal(m.grantCheatFunds(ps.playerId).error, 'ELIMINATED'); ps.alive = true;
  m.ended = true; assert.equal(m.grantCheatFunds(ps.playerId).error, 'WRONG_PHASE'); m.ended = false;
  assert.equal(ps.funds, 0);
});
