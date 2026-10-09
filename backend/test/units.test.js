'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { parsePageRanges } = require('../src/lib/pageRanges');
const { detectFromHead, sniffFile } = require('../src/lib/sniff');
const { createZip, listEntries } = require('../src/lib/zip');
const { baseName, uniqueNames } = require('../src/tools/catalog');
const { contentDisposition } = require('../src/http/routes');
const { sanitize } = require('../src/lib/logger');
const { FIXTURES } = require('./helpers');

test('parsePageRanges', () => {
  assert.deepEqual(parsePageRanges('1-3', 10), [0, 1, 2]);
  assert.deepEqual(parsePageRanges('2,4,6', 5), [1, 3]);
  assert.deepEqual(parsePageRanges(' 3 , 1-2 ,3', 5), [0, 1, 2]);
  assert.throws(() => parsePageRanges('0', 5));
  assert.throws(() => parsePageRanges('5-2', 5));
  assert.throws(() => parsePageRanges('a', 5));
  assert.throws(() => parsePageRanges('', 5));
});

test('detecção de formato pelo conteúdo', async () => {
  assert.equal(detectFromHead(Buffer.from('%PDF-1.7')), 'pdf');
  assert.equal(detectFromHead(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(detectFromHead(Buffer.from('GIF89a')), null);
  const expected = {
    'texto.pdf': 'pdf', 'relatorio.docx': 'docx', 'apresentacao.pptx': 'pptx', 'com-macro.docx': 'docm',
    'foto-rotacionada.jpg': 'jpeg', 'transparente.png': 'png', 'imagem.webp': 'webp',
  };
  for (const [file, type] of Object.entries(expected)) {
    assert.equal((await sniffFile(path.join(FIXTURES, file))).type, type, file);
  }
  const tmp = path.join(os.tmpdir(), `zip-qualquer-${process.pid}.zip`);
  await fs.writeFile(tmp, createZip([{ name: 'a.txt', data: Buffer.from('oi') }]));
  assert.equal((await sniffFile(tmp)).type, null, 'ZIP genérico não é DOCX');
  await fs.rm(tmp);
});

test('ZIP gerado é lido de volta e por ferramentas externas', async () => {
  const zip = createZip([{ name: 'ação.pdf', data: Buffer.from('%PDF-x') }, { name: 'b.pdf', data: Buffer.alloc(0) }]);
  assert.deepEqual(listEntries(zip), ['ação.pdf', 'b.pdf']);
  const { execFileSync } = require('child_process');
  try {
    const tmp = path.join(os.tmpdir(), `t-${process.pid}.zip`);
    await fs.writeFile(tmp, zip);
    execFileSync('unzip', ['-tq', tmp]); // CRC confere
    await fs.rm(tmp);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err; // unzip ausente: pula
  }
});

test('nomes de arquivo sanitizados', () => {
  assert.equal(baseName('../../etc/passwd.pdf'), '_.._etc_passwd'); // sem ponto inicial, sem barras
  assert.equal(baseName('relatório final.docx'), 'relatório final');
  assert.equal(baseName('a\u0000b<>:"|?*.pdf'), 'ab_______');
  assert.equal(baseName('...'), 'arquivo');
  assert.equal(baseName(''), 'arquivo');
  assert.ok(baseName('x'.repeat(500)).length <= 80);
  assert.deepEqual(uniqueNames(['a', 'a', 'b', 'a']), ['a', 'a (2)', 'b', 'a (3)']);
  assert.equal(contentDisposition('Ação "x".pdf'), `attachment; filename="Acao _x_.pdf"; filename*=UTF-8''A%C3%A7%C3%A3o%20%22x%22.pdf`);
});

test('logger descarta campos sensíveis', () => {
  const out = sanitize({ jobId: '1', token: 'eyJ...', authorization: 'Bearer x', originalname: 'a.pdf', filename: 'b', user: 'u' });
  assert.deepEqual(out, { jobId: '1', user: 'u' });
});
