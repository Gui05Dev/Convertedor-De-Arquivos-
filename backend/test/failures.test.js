'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { startApp, api, form, fixture, runJob, listDir } = require('./helpers');
const { sweep } = require('../src/jobs/janitor');

const BIN = path.join(__dirname, 'bin');
const ENGINES_ON = { libreoffice: true };

function processesMatching(pattern) {
  try {
    return execFileSync('pgrep', ['-f', pattern]).toString().trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function jobDirs(ctx) {
  return (await listDir(path.join(ctx.dataDir, 'jobs'))) || [];
}

test('falha do conversor: erro compreensível e limpeza', async (t) => {
  const ctx = await startApp({ LIBREOFFICE_BIN: path.join(BIN, 'fake-office-fail') }, { engines: ENGINES_ON });
  t.after(() => ctx.close());

  const r = await runJob(ctx, 'alice', { tool: 'word-to-pdf' }, [{ name: 'doc.docx', data: await fixture('relatorio.docx') }]);
  assert.equal(r.job.status, 'failed');
  assert.equal(r.job.error.code, 'libreoffice_failed');
  assert.match(r.job.error.message, /Não foi possível converter/);
  assert.ok(!JSON.stringify(r.job).includes('erro interno do conversor'), 'stderr do motor não vaza');

  const dir = path.join(ctx.dataDir, 'jobs', r.id);
  assert.deepEqual((await listDir(dir)).sort(), ['meta.json'], 'input/, work/ e output/ apagados após a falha');
  const dl = await api(ctx, 'GET', `/api/jobs/${r.id}/download`, { user: 'alice' });
  assert.equal(dl.status, 409);
});

test('conversor que "funciona" sem gerar arquivo é tratado como falha', async (t) => {
  const ctx = await startApp({ LIBREOFFICE_BIN: path.join(BIN, 'fake-office-noop') }, { engines: ENGINES_ON });
  t.after(() => ctx.close());
  const r = await runJob(ctx, 'alice', { tool: 'word-to-pdf' }, [{ name: 'doc.docx', data: await fixture('relatorio.docx') }]);
  assert.equal(r.job.status, 'failed');
  assert.equal(r.job.error.code, 'empty_output');
});

test('timeout do conversor mata o grupo de processos e limpa tudo', async (t) => {
  const ctx = await startApp({ LIBREOFFICE_BIN: path.join(BIN, 'fake-office-hang'), JOB_TIMEOUT_MS: '800' }, { engines: ENGINES_ON });
  t.after(() => ctx.close());

  const started = Date.now();
  const r = await runJob(ctx, 'alice', { tool: 'word-to-pdf' }, [{ name: 'doc.docx', data: await fixture('relatorio.docx') }]);
  assert.equal(r.job.status, 'failed');
  assert.equal(r.job.error.code, 'timeout');
  assert.match(r.job.error.message, /demorou demais/);
  assert.ok(Date.now() - started < 10_000);
  await new Promise((res) => setTimeout(res, 200));
  assert.deepEqual(processesMatching('sleep 987'), [], 'o filho do conversor não ficou órfão');
  assert.deepEqual(await listDir(path.join(ctx.dataDir, 'jobs', r.id)), ['meta.json']);
});

test('timeout também vale para as operações em worker (pdf-lib/sharp)', async (t) => {
  const ctx = await startApp({ JOB_TIMEOUT_MS: '100' });
  t.after(() => ctx.close());
  // 3 imagens de 3000x3000 com ruído garantem trabalho bem acima de 100 ms.
  const sharp = require('sharp');
  const big = await sharp({ create: { width: 3000, height: 3000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer();
  const r = await runJob(ctx, 'alice', { tool: 'images-to-pdf' }, Array.from({ length: 3 }, (_, i) => ({ name: `${i}.png`, data: big })));
  assert.equal(r.created.status, 202, JSON.stringify(r.created.json));
  assert.equal(r.job.status, 'failed');
  assert.equal(r.job.error.code, 'timeout');
});

test('PDF corrompido e PDF protegido por senha', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  const broken = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >>\nlixo sem xref');
  const r1 = await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: 'quebrado.pdf', data: broken }]);
  assert.equal(r1.job.status, 'failed');
  assert.match(r1.job.error.message, /Não foi possível ler/);

  const r2 = await runJob(ctx, 'alice', { tool: 'split', range: '1' }, [{ name: 'p.pdf', data: await fixture('protegido.pdf') }]);
  assert.equal(r2.job.status, 'failed');
  assert.equal(r2.job.error.code, 'pdf_encrypted');
});

test('limites de concorrência: por usuário (429) e fila cheia (503)', async (t) => {
  const ctx = await startApp({
    LIBREOFFICE_BIN: path.join(BIN, 'fake-office-hang'), JOB_TIMEOUT_MS: '1500',
    MAX_ACTIVE_JOBS_PER_USER: '1', MAX_CONCURRENT_JOBS: '1', MAX_QUEUED_JOBS: '0',
  }, { engines: ENGINES_ON });
  t.after(() => ctx.close());
  const docx = await fixture('relatorio.docx');
  const send = (user) => api(ctx, 'POST', '/api/jobs', { user, body: form({ tool: 'word-to-pdf' }, [{ name: 'a.docx', data: docx }]) });

  assert.equal((await send('alice')).status, 202);
  await new Promise((r) => setTimeout(r, 100)); // começa a processar
  const again = await send('alice');
  assert.equal(again.status, 429);
  const other = await send('bob');
  assert.equal(other.status, 503);
  assert.deepEqual(await listDir(path.join(ctx.dataDir, 'incoming')), []);
});

test('retenção: originais apagados ao terminar, resultado expira na limpeza', async (t) => {
  const ctx = await startApp({ ORIGINAL_RETENTION_MINUTES: '0', RESULT_RETENTION_MINUTES: '5' });
  t.after(() => ctx.close());

  const r = await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: 'a.pdf', data: await fixture('texto.pdf') }]);
  assert.equal(r.job.status, 'done');
  const dir = path.join(ctx.dataDir, 'jobs', r.id);
  assert.deepEqual((await listDir(dir)).sort(), ['meta.json', 'output']);
  const expires = Date.parse(r.job.expiresAt) - Date.parse(r.job.finishedAt);
  assert.equal(expires, 5 * 60_000);

  // Antes do prazo nada some; depois, o diretório inteiro vai embora.
  await sweep({ store: ctx.store, queue: ctx.queue, logger: { info() {} }, now: Date.now() });
  assert.ok(await listDir(dir));
  await sweep({ store: ctx.store, queue: ctx.queue, logger: { info() {} }, now: Date.now() + 6 * 60_000 });
  assert.equal(await listDir(dir), null);
  assert.equal((await api(ctx, 'GET', `/api/jobs/${r.id}/download`, { user: 'alice' })).status, 404);
});

test('retenção de originais configurável (> 0)', async (t) => {
  const ctx = await startApp({ ORIGINAL_RETENTION_MINUTES: '2', RESULT_RETENTION_MINUTES: '10' });
  t.after(() => ctx.close());
  const r = await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: 'a.pdf', data: await fixture('texto.pdf') }]);
  const input = path.join(ctx.dataDir, 'jobs', r.id, 'input');
  assert.deepEqual(await listDir(input), ['input-1.pdf']);
  await sweep({ store: ctx.store, queue: ctx.queue, logger: { info() {} }, now: Date.now() + 3 * 60_000 });
  assert.equal(await listDir(input), null, 'original apagado no prazo dele');
  assert.ok(await listDir(path.join(ctx.dataDir, 'jobs', r.id, 'output')), 'resultado continua até o prazo dele');
});

test('reinício no meio do processamento: trabalho vira falha e temporários somem', async () => {
  const fs = require('fs/promises');
  const { JobStore } = require('../src/jobs/store');
  const os = require('os');
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conv-restart-'));
  const store = new JobStore({ dataDir });
  await store.init();
  const job = await store.create({
    owner: 'sub-alice', tool: 'rotate', options: {}, inputs: [{ file: 'input-1.pdf', type: 'pdf', size: 1 }],
    originalNames: ['a.pdf'], retention: { resultMs: 60_000, maxRunMs: 1000 },
  });
  await fs.writeFile(path.join(store.paths(job.id).input, 'input-1.pdf'), 'x');
  await store.update(job.id, { status: 'processing' });

  const again = new JobStore({ dataDir });
  await again.init();
  const reloaded = again.get(job.id);
  assert.equal(reloaded.status, 'failed');
  assert.equal(reloaded.error.code, 'interrupted');
  assert.deepEqual(await listDir(again.paths(job.id).dir), ['meta.json']);
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('logs não levam nome de arquivo, conteúdo nem token', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  const secretName = 'rescisao-joao-da-silva.pdf';
  const r = await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: secretName, data: await fixture('texto.pdf') }]);
  assert.equal(r.job.status, 'done');
  await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: secretName, data: Buffer.from('%PDF-quebrado') }]);
  const all = ctx.logs.join('\n');
  assert.ok(ctx.logs.length > 3);
  assert.ok(!all.includes('rescisao'), 'nome original não aparece');
  assert.ok(!all.includes('eyJ'), 'nenhum JWT nos logs');
  assert.ok(!all.includes('Relatório'), 'nenhum conteúdo de documento');
  for (const line of ctx.logs) JSON.parse(line); // todas as linhas são JSON válido
});
