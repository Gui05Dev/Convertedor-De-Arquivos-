'use strict';

/* E2E contra a stack inteira de homologação, sempre pela porta pública do nginx:
     navegador -> nginx -> oauth2-proxy -> Keycloak (login real)
                    \-> backend (com o access token da sessão)

   Faz o login de verdade no formulário do Keycloak com os usuários SINTÉTICOS do
   realm de homologação (alice e bob) e confere autenticação, isolamento entre
   usuários, conversão e cabeçalhos de segurança.

   Uso (com a stack de pé):
     E2E_SITE=http://localhost:8080 E2E_PASSWORD=<senha dos usuários de teste> npm run test:e2e
   Opcional: E2E_BACKEND_DIRECT=http://127.0.0.1:3000 (só se o backend estiver
   exposto nesta máquina, pra provar que ele recusa chamada sem token). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const SITE = (process.env.E2E_SITE || 'http://localhost:8080').replace(/\/$/, '');
const PASSWORD = process.env.E2E_PASSWORD;
const USERS = [process.env.E2E_USER_A || 'alice', process.env.E2E_USER_B || 'bob'];
const FIXTURES = path.join(__dirname, '..', 'test', 'fixtures');

/** Navegador mínimo: guarda cookies por host e segue redirecionamentos manualmente. */
class Browser {
  constructor() { this.jar = new Map(); }

  cookieHeader(url) {
    const host = new URL(url).host;
    const cookies = this.jar.get(host) || new Map();
    return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  store(url, res) {
    const host = new URL(url).host;
    const cookies = this.jar.get(host) || new Map();
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value === '') cookies.delete(name);
      else cookies.set(name, value);
    }
    this.jar.set(host, cookies);
  }

  async fetch(url, { method = 'GET', body, headers = {}, follow = true } = {}) {
    let current = new URL(url, SITE).toString();
    let res;
    for (let hop = 0; hop < 10; hop++) {
      const h = { ...headers };
      const cookie = this.cookieHeader(current);
      if (cookie) h.Cookie = cookie;
      res = await fetch(current, { method, body, headers: h, redirect: 'manual' });
      this.store(current, res);
      if (!follow || ![301, 302, 303, 307].includes(res.status)) break;
      current = new URL(res.headers.get('location'), current).toString();
      if (res.status !== 307) { method = 'GET'; body = undefined; }
    }
    res.finalUrl = current;
    return res;
  }

  /** Abre o site, cai no Keycloak, preenche usuário e senha e volta logado. */
  async login(username, password) {
    const page = await this.fetch(`${SITE}/`);
    const html = await page.text();
    const action = /<form[^>]+id="kc-form-login"[^>]+action="([^"]+)"/.exec(html)?.[1];
    assert.ok(action, `formulário de login do Keycloak não encontrado (${page.finalUrl})`);
    const form = new URLSearchParams({ username, password, credentialId: '' });
    const done = await this.fetch(action.replace(/&amp;/g, '&'), {
      method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(new URL(done.finalUrl).origin, new URL(SITE).origin, 'voltou para o site depois do login');
    assert.equal(done.status, 200);
    return done;
  }

  async json(url, opts) {
    const res = await this.fetch(url, opts);
    return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
  }
}

async function runJob(browser, fields, files) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append('files', new Blob([f.data]), f.name);
  const created = await browser.json(`${SITE}/api/jobs`, { method: 'POST', body: fd });
  assert.equal(created.status, 202, JSON.stringify(created.json));
  let job = created.json;
  for (let i = 0; i < 300 && !['done', 'failed'].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 300));
    job = (await browser.json(`${SITE}/api/jobs/${job.id}`)).json;
  }
  return job;
}

test('stack de homologação (nginx + oauth2-proxy + Keycloak + backend)', { skip: !PASSWORD && 'defina E2E_PASSWORD' }, async (t) => {
  const anon = new Browser();
  const alice = new Browser();
  const bob = new Browser();

  await t.test('sem sessão: página redireciona pro login e API responde 401', async () => {
    const page = await anon.fetch(`${SITE}/`, { follow: false });
    assert.equal(page.status, 302);
    assert.match(page.headers.get('location'), /\/oauth2\/start/);
    for (const [method, url] of [['GET', '/api/tools'], ['GET', '/api/jobs'], ['POST', '/api/jobs'],
      ['GET', '/api/jobs/00000000-0000-4000-8000-000000000000/download']]) {
      const r = await anon.fetch(`${SITE}${url}`, { method, follow: false });
      assert.equal(r.status, 401, `${method} ${url}`);
    }
  });

  await t.test('token forjado no header não substitui a sessão', async () => {
    const r = await anon.fetch(`${SITE}/api/me`, { headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.' }, follow: false });
    assert.equal(r.status, 401);
  });

  await t.test('login real no Keycloak', async () => {
    await alice.login(USERS[0], PASSWORD);
    await bob.login(USERS[1], PASSWORD);
    const me = await alice.json(`${SITE}/api/me`);
    assert.equal(me.status, 200);
    assert.equal(me.json.username, USERS[0]);
  });

  let aliceJob;
  await t.test('conversão Word -> PDF pela stack, com download protegido', async () => {
    aliceJob = await runJob(alice, { tool: 'word-to-pdf' }, [{ name: 'Relatório.docx', data: fs.readFileSync(path.join(FIXTURES, 'relatorio.docx')) }]);
    assert.equal(aliceJob.status, 'done', JSON.stringify(aliceJob.error));
    const dl = await alice.fetch(`${SITE}/api/jobs/${aliceJob.id}/download`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-disposition'), /Relat%C3%B3rio\.pdf/);
    const doc = await PDFDocument.load(Buffer.from(await dl.arrayBuffer()));
    assert.equal(doc.getPageCount(), 2);
  });

  await t.test('bob não acessa o trabalho da alice', async () => {
    for (const url of [`/api/jobs/${aliceJob.id}`, `/api/jobs/${aliceJob.id}/download`]) {
      const r = await bob.fetch(`${SITE}${url}`);
      assert.equal(r.status, 404, url);
    }
    const del = await bob.fetch(`${SITE}/api/jobs/${aliceJob.id}`, { method: 'DELETE' });
    assert.equal(del.status, 404);
    const list = await bob.json(`${SITE}/api/jobs`);
    assert.ok(!list.json.jobs.some((j) => j.id === aliceJob.id));
    const still = await alice.fetch(`${SITE}/api/jobs/${aliceJob.id}`);
    assert.equal(still.status, 200);
  });

  await t.test('cabeçalhos de segurança e nenhum domínio externo no bundle', async () => {
    const page = await alice.fetch(`${SITE}/`);
    const html = await page.text();
    assert.match(page.headers.get('content-security-policy') || '', /connect-src 'self'/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('server'), 'nginx', 'versão do nginx não exposta');
    const api = await alice.fetch(`${SITE}/api/tools`);
    assert.match(api.headers.get('content-security-policy') || '', /default-src 'self'/, 'headers também na API');
    const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    assert.ok(scripts.length);
    for (const src of scripts) {
      const js = await (await alice.fetch(`${SITE}${src}`)).text();
      const external = (js.match(/https?:\/\/[a-z0-9.-]+/gi) || [])
        .filter((u) => !/(www\.w3\.org|reactjs\.org|react\.dev|localhost)/.test(u));
      assert.deepEqual([...new Set(external)], [], `URLs externas em ${src}`);
    }
  });

  await t.test('backend direto, sem token, recusa', { skip: !process.env.E2E_BACKEND_DIRECT && 'backend não exposto (esperado no Docker)' }, async () => {
    const r = await fetch(`${process.env.E2E_BACKEND_DIRECT}/api/jobs`, { headers: { 'X-Forwarded-User': USERS[0] } });
    assert.equal(r.status, 401);
  });

  await t.test('sair encerra a sessão', async () => {
    await alice.fetch(`${SITE}/oauth2/sign_out?rd=%2F`, { follow: false });
    const r = await alice.fetch(`${SITE}/api/me`, { follow: false });
    assert.equal(r.status, 401);
  });
});
