'use strict';

/* Conversões de ponta a ponta pela API, abrindo o arquivo resultante para conferir
   que é válido e tem o conteúdo esperado — não basta "ter gerado um arquivo".
   Testes de motores externos (LibreOffice, Ghostscript, pdf2docx) são pulados se o
   motor não existir nesta máquina; na imagem Docker todos existem. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { startApp, fixture, runJob, api } = require('./helpers');
const { listEntries } = require('../src/lib/zip');

function hasBin(bin) {
  try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Texto do PDF via pdftotext (poppler), quando disponível — confere acentuação. */
function pdfText(buffer) {
  if (!hasBin('pdftotext')) return null;
  return execFileSync('pdftotext', ['-layout', '-', '-'], { input: buffer }).toString('utf8');
}

async function pdfPages(buffer) {
  return (await PDFDocument.load(buffer)).getPageCount();
}

test('conversões', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());
  const texto = await fixture('texto.pdf'); // 2 páginas

  await t.test('juntar PDFs preserva a ordem e soma as páginas', async () => {
    const r = await runJob(ctx, 'alice', { tool: 'merge' }, [
      { name: 'a.pdf', data: texto }, { name: 'b.pdf', data: await fixture('digitalizado.pdf') },
    ]);
    assert.equal(r.job.status, 'done', JSON.stringify(r.job.error));
    assert.equal(await pdfPages(r.download.buffer), 3);
    assert.equal(r.job.result.name, 'a-unido.pdf');
  });

  await t.test('dividir por intervalo', async () => {
    const r = await runJob(ctx, 'alice', { tool: 'split', range: '2' }, [{ name: 'a.pdf', data: texto }]);
    assert.equal(await pdfPages(r.download.buffer), 1);
    const text = pdfText(r.download.buffer);
    if (text !== null) assert.match(text, /Segunda página/);
  });

  await t.test('dividir em um PDF por página (ZIP)', async () => {
    const r = await runJob(ctx, 'alice', { tool: 'split', mode: 'pages' }, [{ name: 'a.pdf', data: texto }]);
    assert.equal(r.download.headers.get('content-type'), 'application/zip');
    assert.deepEqual(listEntries(r.download.buffer), ['pagina-1.pdf', 'pagina-2.pdf']);
  });

  await t.test('girar e remover páginas (funções que já existiam)', async () => {
    const rot = await runJob(ctx, 'alice', { tool: 'rotate', angle: '90' }, [{ name: 'a.pdf', data: texto }]);
    const doc = await PDFDocument.load(rot.download.buffer);
    assert.equal(doc.getPage(0).getRotation().angle, 90);
    const rem = await runJob(ctx, 'alice', { tool: 'remove-pages', pages: '1' }, [{ name: 'a.pdf', data: texto }]);
    assert.equal(await pdfPages(rem.download.buffer), 1);
  });

  await t.test('imagens para PDF (JPG com EXIF, PNG transparente, WebP)', async () => {
    const r = await runJob(ctx, 'alice', { tool: 'images-to-pdf' }, [
      { name: 'foto.jpg', data: await fixture('foto-rotacionada.jpg') },
      { name: 't.png', data: await fixture('transparente.png') },
      { name: 'i.webp', data: await fixture('imagem.webp') },
    ]);
    assert.equal(r.job.status, 'done', JSON.stringify(r.job.error));
    const doc = await PDFDocument.load(r.download.buffer);
    assert.equal(doc.getPageCount(), 3);
    const { width, height } = doc.getPage(0).getSize();
    assert.deepEqual([width, height], [200, 300], 'orientação EXIF aplicada (300x200 deitada -> 200x300)');
  });

  await t.test('conversão entre JPG, PNG e WebP', async () => {
    const cases = [
      ['transparente.png', 'jpg', 'jpeg'], ['transparente.png', 'webp', 'webp'],
      ['foto-rotacionada.jpg', 'png', 'png'], ['imagem.webp', 'jpg', 'jpeg'], ['imagem.webp', 'png', 'png'],
      ['foto-rotacionada.jpg', 'webp', 'webp'],
    ];
    for (const [file, target, format] of cases) {
      const r = await runJob(ctx, 'alice', { tool: 'convert-image', target }, [{ name: file, data: await fixture(file) }]);
      assert.equal(r.job.status, 'done', `${file}->${target}: ${JSON.stringify(r.job.error)}`);
      const meta = await sharp(r.download.buffer).metadata();
      assert.equal(meta.format, format, `${file}->${target}`);
      assert.equal(meta.exif, undefined, 'metadados EXIF removidos');
    }
    const jpg = await runJob(ctx, 'alice', { tool: 'convert-image', target: 'jpg' }, [{ name: 't.png', data: await fixture('transparente.png') }]);
    const { data } = await sharp(jpg.download.buffer).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0] > 240 && data[1] > 240 && data[2] > 240, 'transparência vira fundo branco no JPG');
  });

  await t.test('várias imagens -> ZIP com nomes originais únicos', async () => {
    const png = await fixture('transparente.png');
    const r = await runJob(ctx, 'alice', { tool: 'convert-image', target: 'webp' }, [
      { name: 'logo.png', data: png }, { name: 'logo.png', data: png }, { name: '../../etc/passwd.png', data: png },
    ]);
    assert.deepEqual(listEntries(r.download.buffer), ['logo.webp', 'logo (2).webp', 'passwd.webp']);
  });

  await t.test('nome de download com acentos (RFC 5987)', async () => {
    const r = await runJob(ctx, 'alice', { tool: 'rotate' }, [{ name: 'Relatório Produção.pdf', data: texto }]);
    assert.equal(r.job.result.name, 'Relatório Produção-girado.pdf');
    assert.match(r.download.headers.get('content-disposition'), /filename\*=UTF-8''Relat%C3%B3rio%20Produ%C3%A7%C3%A3o-girado\.pdf/);
  });

  await t.test('bomba de pixels é recusada', async () => {
    const huge = await sharp({ create: { width: 10000, height: 9000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
    const r = await runJob(ctx, 'alice', { tool: 'convert-image', target: 'jpg' }, [{ name: 'h.png', data: huge }]);
    assert.equal(r.job.status, 'failed');
    assert.equal(r.job.error.code, 'image_too_large');
  });

  await t.test('/api/tools lista só o que este servidor consegue fazer', async () => {
    const r = await api(ctx, 'GET', '/api/tools', { user: 'alice' });
    const ids = r.json.tools.map((tool) => tool.id);
    for (const id of ['merge', 'split', 'rotate', 'remove-pages', 'images-to-pdf', 'convert-image']) assert.ok(ids.includes(id), id);
    assert.equal(ids.includes('word-to-pdf'), ctx.engines.libreoffice);
    assert.equal(ids.includes('compress'), ctx.engines.ghostscript);
    assert.equal(ids.includes('pdf-to-docx'), ctx.engines.pdf2docx);
    assert.deepEqual(r.json.tools.find((x) => x.id === 'convert-image').targets, ['jpg', 'png', 'webp']);
  });
});

test('motores externos', async (t) => {
  const ctx = await startApp();
  t.after(() => ctx.close());

  await t.test('Word -> PDF: páginas, acentuação, tabela, cabeçalho e imagens', { skip: !ctx.engines.libreoffice && 'LibreOffice ausente' }, async () => {
    const r = await runJob(ctx, 'alice', { tool: 'word-to-pdf' }, [{ name: 'Relatório.docx', data: await fixture('relatorio.docx') }]);
    assert.equal(r.job.status, 'done', JSON.stringify(r.job.error));
    assert.equal(r.job.result.name, 'Relatório.pdf');
    assert.equal(await pdfPages(r.download.buffer), 2);
    const text = pdfText(r.download.buffer);
    if (text !== null) {
      for (const expected of ['Relatório de Produção — Unidade São João', 'ação, coração, pinhão, açúcar, órgão, você',
        'Documento sintético para homologação', 'Aprovação pendente', '1.402,7', 'Rodapé — uso interno', 'Segunda página']) {
        assert.ok(text.includes(expected), `texto esperado no PDF: ${expected}`);
      }
    }
    if (hasBin('pdfimages')) {
      const tmp = require('path').join(require('os').tmpdir(), `word-${process.pid}.pdf`);
      require('fs').writeFileSync(tmp, r.download.buffer);
      const list = execFileSync('pdfimages', ['-list', tmp]).toString();
      require('fs').rmSync(tmp);
      const images = list.split('\n').slice(2).filter((l) => /\bimage\b/.test(l));
      assert.ok(images.length >= 3, `logo do cabeçalho (2 páginas) + gráfico; achou ${images.length}`);
    }
  });

  await t.test('PowerPoint -> PDF', { skip: !ctx.engines.libreoffice && 'LibreOffice ausente' }, async () => {
    const r = await runJob(ctx, 'alice', { tool: 'pptx-to-pdf' }, [{ name: 'a.pptx', data: await fixture('apresentacao.pptx') }]);
    assert.equal(r.job.status, 'done', JSON.stringify(r.job.error));
    assert.equal(await pdfPages(r.download.buffer), 2);
    const text = pdfText(r.download.buffer);
    if (text !== null) assert.ok(text.includes('Apresentação de Resultados') && text.includes('Indicadores por região'));
  });

  await t.test('comprimir PDF com imagem de alta resolução reduz de verdade', { skip: !ctx.engines.ghostscript && 'Ghostscript ausente' }, async () => {
    const photo = await sharp({ create: { width: 2480, height: 3508, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } } })
      .jpeg({ quality: 95 }).toBuffer();
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(photo);
    doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
    const original = Buffer.from(await doc.save());

    const r = await runJob(ctx, 'alice', { tool: 'compress', level: 'recomendada' }, [{ name: 'foto.pdf', data: original }]);
    assert.equal(r.job.status, 'done', JSON.stringify(r.job.error));
    assert.ok(r.download.buffer.length < original.length * 0.5, `${original.length} -> ${r.download.buffer.length}`);
    assert.equal(await pdfPages(r.download.buffer), 1);
    assert.match(r.job.result.info, /% menor/);
  });

  await t.test('comprimir PDF já otimizado não devolve arquivo maior', { skip: !ctx.engines.ghostscript && 'Ghostscript ausente' }, async () => {
    const small = await fixture('texto.pdf');
    const r = await runJob(ctx, 'alice', { tool: 'compress' }, [{ name: 'a.pdf', data: small }]);
    assert.equal(r.job.status, 'done');
    assert.ok(r.download.buffer.length <= small.length);
  });

  await t.test('PDF -> Word com PDF de texto', { skip: !ctx.engines.pdf2docx && 'pdf2docx ausente' }, async () => {
    const r = await runJob(ctx, 'alice', { tool: 'pdf-to-docx' }, [{ name: 'a.pdf', data: await fixture('texto.pdf') }]);
    assert.equal(r.job.status, 'done', JSON.stringify(r.job.error));
    const entries = listEntries(r.download.buffer);
    assert.ok(entries.includes('word/document.xml'));
  });

  await t.test('PDF digitalizado é identificado e recusado na conversão para Word', { skip: !ctx.engines.pdf2docx && 'pdf2docx ausente' }, async () => {
    const r = await runJob(ctx, 'alice', { tool: 'pdf-to-docx' }, [{ name: 'scan.pdf', data: await fixture('digitalizado.pdf') }]);
    assert.equal(r.job.status, 'failed');
    assert.equal(r.job.error.code, 'pdf_scanned');
    assert.match(r.job.error.message, /digitalizado/);
  });
});
