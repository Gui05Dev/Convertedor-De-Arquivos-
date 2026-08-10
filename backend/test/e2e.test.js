'use strict';
/* E2E contra a stack no docker compose, sempre pela porta do FRONTEND (8080).
   Se algo aqui passa, o caminho navegador -> nginx -> backend está funcionando. */

const { PDFDocument, StandardFonts } = require('pdf-lib');

const SITE = 'http://localhost:8080';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

async function makePdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Relatorio Copacol - pagina ${i}`, { x: 60, y: 760, size: 18, font });
    p.drawText('Linha de teste para conversao.', { x: 60, y: 720, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function post(path, entries) {
  const fd = new FormData();
  for (const [k, v, name] of entries) {
    if (name) fd.append(k, new Blob([v]), name);
    else fd.append(k, v);
  }
  const res = await fetch(SITE + path, { method: 'POST', body: fd });
  const ct = res.headers.get('content-type') || '';
  const out = { status: res.status, headers: res.headers, ct };
  if (ct.includes('json')) out.json = await res.json();
  else out.buffer = Buffer.from(await res.arrayBuffer());
  return out;
}

(async () => {
  console.log('\n-- SPA servida pelo frontend --');
  const home = await fetch(SITE + '/');
  const html = await home.text();
  check('GET / entrega a casca da SPA', home.ok && html.includes('<div id="root">'), `status=${home.status}`);
  check('index.html traz o <title>', html.includes('<title>Copacol'));

  // Os nomes dos assets levam hash de conteúdo, então são descobertos a partir do HTML
  // em vez de fixados no teste — assim o teste não quebra a cada build.
  const jsAsset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  const cssAsset = /href="(\/assets\/[^"]+\.css)"/.exec(html)?.[1];
  check('index.html referencia o bundle JS', !!jsAsset, jsAsset || '(não encontrado)');
  check('index.html referencia o bundle CSS', !!cssAsset, cssAsset || '(não encontrado)');

  const js = jsAsset ? await (await fetch(SITE + jsAsset)).text() : '';
  const css = cssAsset ? await (await fetch(SITE + cssAsset)).text() : '';
  check('bundle JS servido', js.length > 1000);
  check('bundle CSS traz os estilos do site', css.includes('--font-body'));
  check('bundle CSS traz as @font-face locais', css.includes('@font-face') && css.includes('/fonts/'));

  for (const path of ['/fonts/XRXV3I6Li01BKofINeaB.woff2', '/img/favicon.svg', '/img/Copacol_BRANCO_PANTONE.png']) {
    const r = await fetch(SITE + path);
    check(`GET ${path}`, r.ok, `status=${r.status}`);
  }

  const spaFallback = await fetch(SITE + '/uma/rota/qualquer');
  check('fallback de SPA devolve o index.html', spaFallback.ok && (await spaFallback.text()).includes('<div id="root">'));

  const assetHeaders = jsAsset ? (await fetch(SITE + jsAsset)).headers.get('cache-control') : '';
  check('assets com hash cacheados longo', /max-age=31536000/.test(assetHeaders || ''), assetHeaders || '');

  console.log('\n-- isolamento e cabeçalhos --');
  const csp = home.headers.get('content-security-policy') || '';
  check('CSP presente', csp.includes("default-src 'self'"), csp);
  check('CSP proíbe rede externa', csp.includes("connect-src 'self'"), csp);
  check('HTML sem CDN/terceiros', !/https?:\/\//.test(html));
  // O bundle do React traz links de documentação em mensagens de erro, então o que se
  // verifica é a ausência de CDN/serviço externo, não de qualquer string com "http".
  check('bundle sem CDN de terceiros', !/unpkg|jsdelivr|cdnjs|googleapis|gstatic/.test(js));
  check('nenhuma lib de PDF no cliente', !/PDFLib|pdf-lib/.test(js));
  check('nenhuma URL de API embutida no bundle', !/https?:\/\/[^"'\s]*\/api\//.test(js));

  // Checado no Docker, e não tentando conectar em localhost:3000: qualquer outro processo
  // do host nessa porta daria um falso negativo. PortBindings vazio é a prova real.
  const bindings = require('child_process')
    .execSync('docker inspect convertedor-de-arquivos--main-backend-1 --format "{{json .HostConfig.PortBindings}}"')
    .toString().trim();
  check('backend NÃO publicado no host', bindings === '{}', `PortBindings=${bindings}`);

  console.log('\n-- API pelo proxy --');
  const cfg = await (await fetch(SITE + '/api/config')).json();
  check('/api/config pelo nginx', cfg.maxFileSizeMb === 100, JSON.stringify(cfg));
  const hc = await fetch(SITE + '/api/health');
  check('/api/health pelo nginx', hc.ok);
  check('/api/config não vaza segredo', !JSON.stringify(cfg).match(/soffice|python|CORS|TIMEOUT/i), JSON.stringify(cfg));

  const pdf = await makePdf(3);

  console.log('\n-- operações de PDF pelo proxy --');
  let r = await post('/api/pdf/merge', [['files', pdf, 'a.pdf'], ['files', pdf, 'b.pdf']]);
  check('merge -> 200', r.status === 200, JSON.stringify(r.json));
  check('merge = 6 páginas', r.buffer && (await PDFDocument.load(r.buffer)).getPageCount() === 6);

  r = await post('/api/pdf/split', [['file', pdf, 'a.pdf'], ['range', '1-2']]);
  check('split -> 200 com 2 páginas', r.status === 200 && (await PDFDocument.load(r.buffer)).getPageCount() === 2);

  r = await post('/api/pdf/compress', [['file', pdf, 'a.pdf']]);
  check('compress -> 200', r.status === 200);
  check('X-Result-Info chega pelo proxy', !!r.headers.get('x-result-info'), r.headers.get('x-result-info') || '(vazio)');

  console.log('\n-- conversões reais (LibreOffice / pdf2docx) --');
  console.log('  (pdf->docx pode levar ~10-30s)');
  r = await post('/api/convert', [['file', pdf, 'relatorio.pdf'], ['target', 'docx']]);
  check('pdf -> docx = 200', r.status === 200, JSON.stringify(r.json));
  const docx = r.buffer;
  check('docx é um zip válido (PK)', docx && docx.subarray(0, 2).toString() === 'PK', docx ? docx.subarray(0, 4).toString('hex') : '');
  check('docx nomeado no Content-Disposition', /copacol-convertido\.docx/.test(r.headers.get('content-disposition') || ''));

  if (docx && docx.subarray(0, 2).toString() === 'PK') {
    r = await post('/api/convert', [['file', docx, 'volta.docx'], ['target', 'pdf']]);
    check('docx -> pdf = 200', r.status === 200, JSON.stringify(r.json));
    check('resultado é PDF válido', r.buffer && r.buffer.subarray(0, 5).toString() === '%PDF-');
    if (r.buffer && r.buffer.subarray(0, 5).toString() === '%PDF-') {
      const back = await PDFDocument.load(r.buffer);
      check('round-trip preservou as 3 páginas', back.getPageCount() === 3, `paginas=${back.getPageCount()}`);
    }
  }

  console.log('\n-- erros pelo proxy --');
  r = await post('/api/convert', [['file', pdf, 'a.pdf'], ['target', 'xlsx']]);
  check('conversão não suportada -> 400 JSON', r.status === 400 && !!r.json?.error, JSON.stringify(r.json));
  const nf = await fetch(SITE + '/api/inexistente');
  check('endpoint inexistente -> 404', nf.status === 404);

  console.log(`\n=== ${pass} passaram, ${fail} falharam ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO:', e); process.exit(1); });
