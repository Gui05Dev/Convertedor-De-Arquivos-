'use strict';

const { PDFDocument, degrees } = require('pdf-lib');
const { parsePageRanges } = require('./pageRanges');
const { ValidationError, ConversionError } = require('./errors');

/* Operações de PDF que antes rodavam no navegador com pdf-lib. Migradas pro backend:
   o frontend agora só faz upload e baixa o resultado, sem lógica de processamento
   nem dependência de terceiros carregada no browser. */

/** Carrega um PDF já traduzindo falha de parse numa mensagem que faz sentido pro usuário. */
async function loadPdf(buffer, label) {
  try {
    return await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    const which = label ? `"${label}"` : 'o arquivo enviado';
    throw new ConversionError(`Não foi possível ler ${which}. Verifique se é um PDF válido e não está protegido por senha.`);
  }
}

/** Copia as páginas indicadas para um documento novo (base de dividir e remover-páginas). */
async function copyPagesToNewDoc(sourceDoc, indices) {
  const target = await PDFDocument.create();
  const copied = await target.copyPages(sourceDoc, indices);
  copied.forEach((page) => target.addPage(page));
  return target;
}

async function save(doc, options) {
  return Buffer.from(await doc.save(options));
}

/** Mescla vários PDFs preservando a ordem em que foram enviados. */
async function mergePdfs(files) {
  if (files.length < 2) throw new ValidationError('Envie pelo menos 2 arquivos PDF para juntar.');

  const merged = await PDFDocument.create();
  for (const file of files) {
    const doc = await loadPdf(file.buffer, file.originalname);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return { buffer: await save(merged) };
}

/** Extrai um subconjunto de páginas ("1-3", "2,4,6") para um PDF novo. */
async function splitPdf(file, rangeInput) {
  const doc = await loadPdf(file.buffer, file.originalname);
  const total = doc.getPageCount();

  const indices = parsePageRanges(rangeInput, total);
  if (!indices.length) {
    throw new ValidationError(`Nenhuma página válida no intervalo informado. O PDF tem ${total} página(s).`);
  }

  const result = await copyPagesToNewDoc(doc, indices);
  return { buffer: await save(result), pageCount: indices.length };
}

/** Gira todas as páginas somando `angle` à rotação já existente de cada uma. */
async function rotatePdf(file, angleInput) {
  const angle = parseInt(angleInput, 10);
  if (![90, 180, 270].includes(angle)) {
    throw new ValidationError('Ângulo inválido. Use 90, 180 ou 270 graus.');
  }

  const doc = await loadPdf(file.buffer, file.originalname);
  for (const page of doc.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return { buffer: await save(doc) };
}

/** Remove as páginas indicadas, mantendo o resto na ordem original. */
async function removePages(file, pagesInput) {
  const doc = await loadPdf(file.buffer, file.originalname);
  const total = doc.getPageCount();

  const toRemove = new Set(parsePageRanges(pagesInput, total));
  if (!toRemove.size) {
    throw new ValidationError(`Nenhuma página válida para remover. O PDF tem ${total} página(s).`);
  }
  if (toRemove.size >= total) {
    throw new ValidationError('Não é possível remover todas as páginas do documento.');
  }

  const keep = Array.from({ length: total }, (_, i) => i).filter((i) => !toRemove.has(i));
  const result = await copyPagesToNewDoc(doc, keep);
  return { buffer: await save(result), removed: toRemove.size };
}

/**
 * Reduz o tamanho limpando metadados e regravando com object streams.
 * Não recomprime imagens — em PDF majoritariamente gráfico o ganho é pequeno,
 * por isso devolvemos também quanto foi economizado, pra tela ser honesta.
 */
async function compressPdf(file) {
  const originalSize = file.buffer.length;

  const doc = await loadPdf(file.buffer, file.originalname);
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('Copacol');
  // Producer não é setado de propósito: o pdf-lib 1.17 reescreve esse campo dentro do
  // save() e ignora qualquer valor nosso. O objetivo (apagar o produtor original) é
  // atingido de qualquer forma — só não dá pra assinar com o nome da Copacol.

  const buffer = await save(doc, { useObjectStreams: true });
  const saved = originalSize - buffer.length;
  const percent = originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;

  return { buffer, originalSize, finalSize: buffer.length, saved, percent };
}

/** Junta imagens JPG/PNG num PDF — uma imagem por página, no tamanho original. */
async function imagesToPdf(files) {
  if (!files.length) throw new ValidationError('Envie pelo menos uma imagem.');

  const doc = await PDFDocument.create();
  for (const file of files) {
    const name = file.originalname || 'imagem';
    const isJpeg = file.mimetype === 'image/jpeg' || /\.jpe?g$/i.test(name);
    const isPng = file.mimetype === 'image/png' || /\.png$/i.test(name);

    let image;
    try {
      if (isJpeg) image = await doc.embedJpg(file.buffer);
      else if (isPng) image = await doc.embedPng(file.buffer);
      else throw new ValidationError(`Formato não suportado: ${name}. Use JPG ou PNG.`);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ConversionError(`Não foi possível processar a imagem "${name}". Verifique se o arquivo não está corrompido.`);
    }

    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  return { buffer: await save(doc) };
}

module.exports = { mergePdfs, splitPdf, rotatePdf, removePages, compressPdf, imagesToPdf };
