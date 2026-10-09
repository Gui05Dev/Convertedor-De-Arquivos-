'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, api, fixture, runJob } = require('./helpers');

test('cada usuário só enxerga os próprios trabalhos', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());

  const pdf = await fixture('texto.pdf');
  const alice = await runJob(ctx, 'alice', { tool: 'rotate', angle: '180' }, [{ name: 'contrato.pdf', data: pdf }]);
  assert.equal(alice.job.status, 'done');
  assert.ok(alice.download.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')));

  await t.test('bob não lê, não baixa e não apaga o trabalho da alice (404, como inexistente)', async () => {
    const status = await api(ctx, 'GET', `/api/jobs/${alice.id}`, { user: 'bob' });
    const download = await api(ctx, 'GET', `/api/jobs/${alice.id}/download`, { user: 'bob' });
    const del = await api(ctx, 'DELETE', `/api/jobs/${alice.id}`, { user: 'bob' });
    const missing = await api(ctx, 'GET', '/api/jobs/11111111-1111-4111-8111-111111111111', { user: 'bob' });
    for (const r of [status, download, del]) {
      assert.equal(r.status, 404);
      assert.deepEqual(r.json, missing.json, 'mesma resposta que um id inexistente');
    }
    assert.ok(ctx.store.get(alice.id), 'o trabalho da alice continua lá');
    assert.ok(ctx.logs.some((l) => l.includes('job.access_denied')), 'tentativa registrada no log');
  });

  await t.test('listagem não mistura usuários', async () => {
    const bobList = await api(ctx, 'GET', '/api/jobs', { user: 'bob' });
    assert.deepEqual(bobList.json.jobs, []);
    const aliceList = await api(ctx, 'GET', '/api/jobs', { user: 'alice' });
    assert.deepEqual(aliceList.json.jobs.map((j) => j.id), [alice.id]);
  });

  await t.test('ids manipulados não escapam do diretório de dados', async () => {
    for (const id of ['..', '..%2F..%2Fetc%2Fpasswd', '%2e%2e', 'abc', `${alice.id}%00`, `${alice.id.toUpperCase()}`]) {
      const r = await api(ctx, 'GET', `/api/jobs/${id}/download`, { user: 'alice' });
      assert.ok([400, 404].includes(r.status), `${id} -> ${r.status}`);
      assert.ok(!r.buffer || !r.buffer.includes('root:'), 'não vaza arquivo do sistema');
    }
  });

  await t.test('resposta não expõe dono nem caminhos internos', async () => {
    const r = await api(ctx, 'GET', `/api/jobs/${alice.id}`, { user: 'alice' });
    const text = JSON.stringify(r.json);
    assert.ok(!text.includes('sub-alice'));
    assert.ok(!text.includes(ctx.dataDir));
    assert.ok(!text.includes('input-1'));
  });

  await t.test('dono consegue apagar; depois some para todos', async () => {
    const del = await api(ctx, 'DELETE', `/api/jobs/${alice.id}`, { user: 'alice' });
    assert.equal(del.status, 204);
    assert.equal((await api(ctx, 'GET', `/api/jobs/${alice.id}`, { user: 'alice' })).status, 404);
  });
});
