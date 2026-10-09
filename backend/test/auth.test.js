'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, token, api, form, fixture, keys, runJob } = require('./helpers');

test('autenticação OIDC no backend', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  const pdf = await fixture('texto.pdf');

  await t.test('health responde sem autenticação e sem dados', async () => {
    const r = await api(ctx, 'GET', '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { status: 'ok' });
  });

  await t.test('rotas de dados exigem token (401)', async () => {
    for (const [method, url] of [
      ['GET', '/api/tools'], ['GET', '/api/config'], ['GET', '/api/me'], ['GET', '/api/jobs'],
      ['GET', '/api/jobs/00000000-0000-4000-8000-000000000000'],
      ['GET', '/api/jobs/00000000-0000-4000-8000-000000000000/download'],
      ['DELETE', '/api/jobs/00000000-0000-4000-8000-000000000000'],
    ]) {
      const r = await api(ctx, method, url);
      assert.equal(r.status, 401, `${method} ${url}`);
      assert.equal(r.headers.get('www-authenticate'), 'Bearer');
    }
  });

  await t.test('upload sem autenticação é recusado e nada fica em disco', async () => {
    const r = await api(ctx, 'POST', '/api/jobs', { body: form({ tool: 'rotate' }, [{ name: 'a.pdf', data: pdf }]) });
    assert.equal(r.status, 401);
    assert.equal(ctx.store.jobs.size, 0);
  });

  await t.test('download sem autenticação de um trabalho existente: 401', async () => {
    const done = await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: 'a.pdf', data: pdf }]);
    assert.equal(done.job.status, 'done');
    const r = await api(ctx, 'GET', `/api/jobs/${done.id}/download`);
    assert.equal(r.status, 401);
    assert.equal(r.buffer?.length ? r.buffer.includes('%PDF') : false, false);
  });

  await t.test('tokens inválidos são recusados', async () => {
    const k = await keys();
    const cases = {
      'assinado por outra chave': await token('alice', { key: k.foreignKey }),
      'issuer errado': await token('alice', { issuer: 'https://evil.test/realms/copacol' }),
      'audience errada': await token('alice', { audience: 'outro-sistema' }),
      expirado: await token('alice', { expiresIn: '-10m' }),
      'tipo de token errado (ID token)': await token('alice', { typ: 'ID' }),
      lixo: 'abc.def.ghi',
    };
    for (const [name, value] of Object.entries(cases)) {
      const r = await api(ctx, 'GET', '/api/jobs', { auth: `Bearer ${value}` });
      assert.equal(r.status, 401, name);
    }
  });

  await t.test('headers de identidade forjados são ignorados', async () => {
    const r = await api(ctx, 'GET', '/api/me', {
      headers: { 'X-Forwarded-User': 'admin', 'X-Auth-Request-User': 'admin', 'X-User': 'admin' },
    });
    assert.equal(r.status, 401);
  });

  await t.test('token válido identifica o usuário', async () => {
    const r = await api(ctx, 'GET', '/api/me', { user: 'alice' });
    assert.equal(r.status, 200);
    assert.equal(r.json.username, 'alice');
  });
});

test('papel obrigatório (OIDC_REQUIRED_ROLE)', async (t) => {
  const ctx = await startApp({ OIDC_REQUIRED_ROLE: 'conversor-usuario' });
  t.after(() => ctx.close());

  const without = await api(ctx, 'GET', '/api/tools', { auth: `Bearer ${await token('carol')}` });
  assert.equal(without.status, 403);
  const withRole = await api(ctx, 'GET', '/api/tools', { auth: `Bearer ${await token('carol', { roles: ['conversor-usuario'] })}` });
  assert.equal(withRole.status, 200);
});

test('modo dev é proibido em produção', () => {
  const config = require('../src/config');
  const problems = config.validate({ ...config.load(), authMode: 'dev', authDevUser: 'x', nodeEnv: 'production' });
  assert.ok(problems.some((p) => p.includes('não é permitido')));
  const missing = config.validate({ ...config.load(), authMode: 'oidc', oidcIssuer: '', oidcAudience: '' });
  assert.equal(missing.length, 2);
});
