'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, api, form, fixture, listDir } = require('./helpers');
const path = require('path');

async function post(ctx, fields, files, user = 'alice') {
  return api(ctx, 'POST', '/api/jobs', { user, body: form(fields, files) });
}

test('validação de entrada', async (t) => {
  const ctx = await startApp({ MAX_FILE_SIZE_MB: '1', MAX_FILES: '3', MAX_TOTAL_UPLOAD_MB: '2' });
  t.after(() => ctx.close());

  const pdf = await fixture('texto.pdf');
  const png = await fixture('transparente.png');

  await t.test('arquivo vazio', async () => {
    const r = await post(ctx, { tool: 'rotate' }, [{ name: 'vazio.pdf', data: Buffer.alloc(0) }]);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /vazio/);
  });

  await t.test('sem arquivo', async () => {
    const r = await post(ctx, { tool: 'rotate' }, []);
    assert.equal(r.status, 400);
  });

  await t.test('extensão mente: PNG renomeado para .pdf', async () => {
    const r = await post(ctx, { tool: 'rotate' }, [{ name: 'falso.pdf', data: png, type: 'application/pdf' }]);
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'unsupported_type');
    assert.match(r.json.error, /PNG/);
  });

  await t.test('conteúdo aleatório com extensão .docx', async () => {
    const r = await post(ctx, { tool: 'word-to-pdf' }, [{ name: 'x.docx', data: Buffer.from('não sou um docx') }]);
    assert.equal(r.status, 400);
  });

  await t.test('DOCX com macro (vbaProject.bin) é recusado', async () => {
    const r = await post(ctx, { tool: 'word-to-pdf' }, [{ name: 'macro.docx', data: await fixture('com-macro.docx') }]);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /macros/);
  });

  await t.test('arquivo acima do limite: 413', async () => {
    const big = Buffer.concat([pdf, Buffer.alloc(1024 * 1024 + 10, 0x20)]);
    const r = await post(ctx, { tool: 'rotate' }, [{ name: 'grande.pdf', data: big }]);
    assert.equal(r.status, 413);
    assert.match(r.json.error, /1 MB/);
  });

  await t.test('soma dos arquivos acima do limite por envio: 413', async () => {
    const almost = Buffer.concat([pdf, Buffer.alloc(900 * 1024, 0x20)]);
    const r = await post(ctx, { tool: 'merge' }, [1, 2, 3].map((i) => ({ name: `${i}.pdf`, data: almost })));
    assert.equal(r.status, 413);
    assert.equal(r.json.code, 'total_too_large');
  });

  await t.test('arquivos demais', async () => {
    const r = await post(ctx, { tool: 'merge' }, [1, 2, 3, 4].map((i) => ({ name: `${i}.pdf`, data: pdf })));
    assert.equal(r.status, 400);
  });

  await t.test('ferramenta desconhecida ou nome de propriedade do objeto', async () => {
    for (const tool of ['nao-existe', '__proto__', 'constructor', '']) {
      const r = await post(ctx, { tool }, [{ name: 'a.pdf', data: pdf }]);
      assert.equal(r.status, 400, tool);
    }
  });

  await t.test('opções inválidas', async () => {
    assert.equal((await post(ctx, { tool: 'rotate', angle: '45' }, [{ name: 'a.pdf', data: pdf }])).status, 400);
    assert.equal((await post(ctx, { tool: 'split', range: '' }, [{ name: 'a.pdf', data: pdf }])).status, 400);
    assert.equal((await post(ctx, { tool: 'convert-image', target: 'gif' }, [{ name: 'a.png', data: png }])).status, 400);
    const same = await post(ctx, { tool: 'convert-image', target: 'png' }, [{ name: 'a.png', data: png }]);
    assert.equal(same.status, 400);
    assert.match(same.json.error, /já está em PNG/);
  });

  await t.test('juntar exige 2 PDFs', async () => {
    const r = await post(ctx, { tool: 'merge' }, [{ name: 'a.pdf', data: pdf }]);
    assert.equal(r.status, 400);
  });

  await t.test('uploads recusados não deixam nada em disco', async () => {
    assert.deepEqual(await listDir(path.join(ctx.dataDir, 'incoming')), []);
    assert.deepEqual(await listDir(path.join(ctx.dataDir, 'jobs')), []);
    assert.equal(ctx.store.jobs.size, 0);
  });
});
