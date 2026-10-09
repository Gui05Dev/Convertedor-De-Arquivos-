'use strict';

/* Infra comum dos testes: sobe a aplicação de verdade (createApp) numa porta efêmera,
   com DATA_DIR temporário e um "Keycloak de mentira" — um par de chaves RSA local
   cujo JWKS é injetado no verificador. Os tokens são assinados aqui com os mesmos
   claims que o Keycloak emite (iss, aud, sub, preferred_username, realm_access). */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } = require('jose');
const config = require('../src/config');
const { createApp } = require('../src/app');
const { createLogger } = require('../src/lib/logger');
const { detectEngines } = require('../src/engines/availability');

const FIXTURES = path.join(__dirname, 'fixtures');
const ISSUER = 'https://sso.exemplo.test/realms/copacol';
const AUDIENCE = 'conversor';

let keysPromise;
function keys() {
  keysPromise ??= (async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'teste-1', alg: 'RS256', use: 'sig' };
    const other = await generateKeyPair('RS256'); // chave "de outro emissor"
    return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }), foreignKey: other.privateKey };
  })();
  return keysPromise;
}

async function token(user, overrides = {}) {
  const k = await keys();
  const {
    issuer = ISSUER, audience = AUDIENCE, expiresIn = '5m', roles = ['default-roles-copacol'],
    key = k.privateKey, typ = 'Bearer',
  } = overrides;
  return new SignJWT({
    preferred_username: user, name: `Usuário ${user}`, typ, azp: AUDIENCE,
    realm_access: { roles },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'teste-1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(`sub-${user}`)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

let enginesCache;
async function realEngines(cfg) {
  enginesCache ??= await detectEngines(cfg);
  return enginesCache;
}

/**
 * @param {object} env  variáveis de ambiente extras (mesmos nomes do .env)
 * @param {object} opts { engines } pra forçar motores (ex.: conversor falso)
 */
async function startApp(env = {}, opts = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conv-test-'));
  const saved = { ...process.env };
  Object.assign(process.env, {
    DATA_DIR: dataDir, AUTH_MODE: 'oidc', OIDC_ISSUER: ISSUER, OIDC_AUDIENCE: AUDIENCE,
    NODE_ENV: 'test', CLEANUP_INTERVAL_SECONDS: '3600',
  }, env);
  const cfg = config.load();
  process.env = saved;

  const logs = [];
  const logger = createLogger({ level: 'debug', sink: (line) => logs.push(line) });
  const engines = { ...(await realEngines(cfg)), ...(opts.engines || {}) };
  const built = await createApp(cfg, { logger, engines, jwks: (await keys()).jwks });

  const server = await new Promise((resolve) => {
    const s = built.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    ...built, cfg, logs, dataDir, base,
    async close() {
      await built.queue.idle();
      await new Promise((r) => server.close(r));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function fixture(name) {
  return fs.readFile(path.join(FIXTURES, name));
}

function form(fields, files = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const { name, data, type = 'application/octet-stream' } of files) {
    fd.append('files', new Blob([data], { type }), name);
  }
  return fd;
}

async function api(ctx, method, url, { user, auth, body, headers = {} } = {}) {
  const h = { ...headers };
  if (auth) h.Authorization = auth;
  else if (user) h.Authorization = `Bearer ${await token(user)}`;
  const res = await fetch(ctx.base + url, { method, body, headers: h });
  const type = res.headers.get('content-type') || '';
  const out = { status: res.status, headers: res.headers };
  if (type.includes('application/json')) out.json = await res.json();
  else out.buffer = Buffer.from(await res.arrayBuffer());
  return out;
}

/** Cria um trabalho e espera terminar. */
async function runJob(ctx, user, fields, files, { timeoutMs = 120_000 } = {}) {
  const created = await api(ctx, 'POST', '/api/jobs', { user, body: form(fields, files) });
  if (created.status !== 202) return { created };
  const id = created.json.id;
  const until = Date.now() + timeoutMs;
  let job;
  while (Date.now() < until) {
    job = (await api(ctx, 'GET', `/api/jobs/${id}`, { user })).json;
    if (job.status === 'done' || job.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  let download = null;
  if (job.status === 'done') download = await api(ctx, 'GET', `/api/jobs/${id}/download`, { user });
  return { created, id, job, download };
}

async function listDir(dir) {
  try { return await fs.readdir(dir); } catch { return null; }
}

module.exports = { startApp, token, fixture, form, api, runJob, listDir, keys, FIXTURES, ISSUER, AUDIENCE };
