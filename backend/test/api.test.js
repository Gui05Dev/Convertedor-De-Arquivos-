'use strict';
/* Testes dos endpoints do backend rodando sozinho: sobe o servidor numa porta de teste,
   gera PDFs na hora e confere cada rota. Não precisa de Docker.
   As rotas de /api/convert só têm a validação testada aqui — a conversão de verdade
   depende de LibreOffice/pdf2docx, que existem na imagem e são cobertos por e2e.test.js.
   Rodar com: npm test */

const { spawn } = require('child_process');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const BACKEND = path.join(__dirname, '..');
const BASE = 'http://127.0.0.1:3999';
let pass = 0, fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

async function makePdf(pageCount) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle('titulo secreto');
  doc.setAuthor('autor secreto');
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`pagina ${i}`, { x: 40, y: 340, size: 24, font });
  }
  return Buffer.from(await doc.save());
}

// PNG 2x2 mínimo válido.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

function form(entries) {
  const fd = new FormData();
  for (const [key, value, filename] of entries) {
    if (filename) fd.append(key, new Blob([value]), filename);
    else fd.append(key, value);
  }
  return fd;
}

async function post(path, fd) {
  const res = await fetch(BASE + path, { method: 'POST', body: fd });
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return { status: res.status, json: await res.json(), headers: res.headers };
  }
  return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

async function pageCountOf(buffer) {
  return (await PDFDocument.load(buffer)).getPageCount();
}

async function run() {
  const pdf5 = await makePdf(5);
  const pdf3 = await makePdf(3);

  console.log('\n-- health/config --');
  const health = await (await fetch(BASE + '/api/health')).json();
  check('GET /api/health', health.status === 'ok');
  const cfg = await (await fetch(BASE + '/api/config')).json();
  check('GET /api/config expõe limites', cfg.maxFileSizeMb === 100 && cfg.maxFiles === 20, JSON.stringify(cfg));
  const notFound = await fetch(BASE + '/api/nada');
  check('rota inexistente -> 404', notFound.status === 404);
  const noStatic = await fetch(BASE + '/index.html');
  check('backend não serve mais estáticos', noStatic.status === 404);

  console.log('\n-- merge --');
  let r = await post('/api/pdf/merge', form([['files', pdf5, 'a.pdf'], ['files', pdf3, 'b.pdf']]));
  check('merge 5+3 -> 200', r.status === 200, JSON.stringify(r.json));
  check('merge tem 8 páginas', r.buffer && await pageCountOf(r.buffer) === 8);
  check('merge nomeia o arquivo', /copacol-unido\.pdf/.test(r.headers.get('content-disposition') || ''));

  r = await post('/api/pdf/merge', form([['files', pdf5, 'a.pdf']]));
  check('merge com 1 arquivo -> 400', r.status === 400, JSON.stringify(r.json));

  console.log('\n-- split --');
  r = await post('/api/pdf/split', form([['file', pdf5, 'a.pdf'], ['range', '2-4']]));
  check('split 2-4 -> 200', r.status === 200, JSON.stringify(r.json));
  check('split devolve 3 páginas', r.buffer && await pageCountOf(r.buffer) === 3);
  check('split manda info no header', decodeURIComponent(r.headers.get('x-result-info') || '').includes('3'));

  r = await post('/api/pdf/split', form([['file', pdf5, 'a.pdf'], ['range', '5-2']]));
  check('split invertido -> 400', r.status === 400 && /menor-maior/.test(r.json.error), JSON.stringify(r.json));

  r = await post('/api/pdf/split', form([['file', pdf5, 'a.pdf'], ['range', 'abc']]));
  check('split lixo -> 400', r.status === 400, JSON.stringify(r.json));

  r = await post('/api/pdf/split', form([['file', pdf5, 'a.pdf'], ['range', '99']]));
  check('split fora do range -> 400', r.status === 400, JSON.stringify(r.json));

  r = await post('/api/pdf/split', form([['file', pdf5, 'a.pdf']]));
  check('split sem range -> 400', r.status === 400, JSON.stringify(r.json));

  console.log('\n-- rotate --');
  r = await post('/api/pdf/rotate', form([['file', pdf3, 'a.pdf'], ['angle', '90']]));
  check('rotate 90 -> 200', r.status === 200, JSON.stringify(r.json));
  if (r.buffer) {
    const doc = await PDFDocument.load(r.buffer);
    check('rotate aplicou 90 em todas', doc.getPages().every(p => p.getRotation().angle === 90));
  }
  r = await post('/api/pdf/rotate', form([['file', pdf3, 'a.pdf'], ['angle', '45']]));
  check('rotate 45 -> 400', r.status === 400, JSON.stringify(r.json));

  console.log('\n-- remove-pages --');
  r = await post('/api/pdf/remove-pages', form([['file', pdf5, 'a.pdf'], ['pages', '1,3']]));
  check('remove 1,3 -> 200', r.status === 200, JSON.stringify(r.json));
  check('sobraram 3 páginas', r.buffer && await pageCountOf(r.buffer) === 3);

  r = await post('/api/pdf/remove-pages', form([['file', pdf5, 'a.pdf'], ['pages', '1-5']]));
  check('remover todas -> 400', r.status === 400, JSON.stringify(r.json));

  console.log('\n-- compress --');
  r = await post('/api/pdf/compress', form([['file', pdf5, 'a.pdf']]));
  check('compress -> 200', r.status === 200, JSON.stringify(r.json));
  check('compress manda info', !!r.headers.get('x-result-info'));
  if (r.buffer) {
    const doc = await PDFDocument.load(r.buffer);
    check('metadados limpos', doc.getTitle() === '' || doc.getTitle() === undefined, `title=${doc.getTitle()}`);
    check('creator trocado', doc.getCreator() === 'Copacol', `creator=${doc.getCreator()}`);
    check('autor original apagado', !doc.getAuthor(), `author=${doc.getAuthor()}`);
  }

  console.log('\n-- images-to-pdf --');
  r = await post('/api/pdf/images-to-pdf', form([['files', PNG, 'x.png'], ['files', PNG, 'y.png']]));
  check('2 PNGs -> 200', r.status === 200, JSON.stringify(r.json));
  check('gerou 2 páginas', r.buffer && await pageCountOf(r.buffer) === 2);

  r = await post('/api/pdf/images-to-pdf', form([['files', pdf5, 'a.pdf']]));
  check('PDF no images-to-pdf -> 400', r.status === 400, JSON.stringify(r.json));

  console.log('\n-- validação de tipo/entrada --');
  r = await post('/api/pdf/rotate', form([['file', PNG, 'x.png'], ['angle', '90']]));
  check('PNG numa rota de PDF -> 400', r.status === 400, JSON.stringify(r.json));

  r = await post('/api/pdf/compress', form([['file', Buffer.from('nao sou pdf'), 'a.pdf']]));
  check('PDF corrompido -> 422', r.status === 422, JSON.stringify(r.json));

  r = await post('/api/pdf/compress', form([['target', 'pdf']]));
  check('sem arquivo -> 400', r.status === 400, JSON.stringify(r.json));

  console.log('\n-- convert (validação; sem LibreOffice nesta máquina) --');
  r = await post('/api/convert', form([['file', pdf5, 'a.pdf'], ['target', 'xlsx']]));
  check('conversão não permitida -> 400', r.status === 400, JSON.stringify(r.json));
  r = await post('/api/convert', form([['file', pdf5, 'a.pdf']]));
  check('convert sem target -> 400', r.status === 400, JSON.stringify(r.json));

  console.log(`\n=== ${pass} passaram, ${fail} falharam ===`);
  return fail;
}

const server = spawn(process.execPath, [path.join(BACKEND, 'src', 'index.js')], {
  env: { ...process.env, PORT: '3999', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', d => process.stdout.write('[srv] ' + d));
server.stderr.on('data', d => process.stderr.write('[srv:err] ' + d));

setTimeout(async () => {
  let failures = 1;
  try { failures = await run(); }
  catch (err) { console.error('ERRO NO TESTE:', err); }
  finally { server.kill(); process.exit(failures ? 1 : 0); }
}, 1200);
