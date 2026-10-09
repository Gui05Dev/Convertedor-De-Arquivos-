'use strict';

/* Operações de PDF com pdf-lib (MIT), puro JavaScript — sem processo externo.
   Rodam dentro do worker thread (ver engines/worker.js), nunca na thread principal:
   assim um PDF pesado não trava a API e o timeout consegue matar o processamento.

   Funções recebem e devolvem Buffers; quem lê/grava disco é o worker. */

const { PDFDocument, degrees } = require('pdf-lib');
const { parsePageRanges } = require('../lib/pageRanges');
const { ValidationError, ConversionError } = require('../lib/errors');

/** PDF assinado digitalmente: qualquer regravação invalida a assinatura. */
function hasDigitalSignature(buffer) {
  return buffer.includes('/ByteRange') && buffer.includes('/Sig');
}

/** Carrega um PDF traduzindo falhas em mensagens que fazem sentido pro usuário. */
async function loadPdf(buffer, { label, maxPages } = {}) {
  const which = label || 'o arquivo enviado';
  let doc;
  try {
    doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    // O pdf-lib é tolerante no load e só falha ao acessar a árvore de páginas:
    // forçamos esse acesso aqui pra que um PDF quebrado vire mensagem clara.
    if (!doc.isEncrypted) doc.getPages();
  } catch {
    throw new ConversionError(`Não foi possível ler ${which}. Verifique se é um PDF válido e não está corrompido.`, 'pdf_unreadable');
  }
  if (doc.isEncrypted) {
    throw new ValidationError(`${capitalize(which)} está protegido por senha ou criptografado. Remova a proteção e tente de novo.`, 'pdf_encrypted');
  }
  const total = doc.getPageCount();
  if (total === 0) throw new ValidationError(`${capitalize(which)} não tem páginas.`, 'pdf_empty');
  if (maxPages && total > maxPages) {
    throw new ValidationError(`${capitalize(which)} tem ${total} páginas; o limite é ${maxPages}.`, 'pdf_too_many_pages');
  }
  return doc;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function copyPagesToNewDoc(sourceDoc, indices) {
  const target = await PDFDocument.create();
  const copied = await target.copyPages(sourceDoc, indices);
  copied.forEach((page) => target.addPage(page));
  return target;
}

async function save(doc) {
  return Buffer.from(await doc.save({ useObjectStreams: true }));
}

/** Mescla vários PDFs preservando a ordem recebida. */
async function mergePdfs(inputs, { maxPages } = {}) {
  if (inputs.length < 2) throw new ValidationError('Envie pelo menos 2 arquivos PDF para juntar.');
  const merged = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const doc = await loadPdf(inputs[i], { label: `o arquivo ${i + 1}`, maxPages });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    if (maxPages && merged.getPageCount() > maxPages) {
      throw new ValidationError(`O resultado passaria de ${maxPages} páginas, o limite do servidor.`, 'pdf_too_many_pages');
    }
  }
  return { buffer: await save(merged), pageCount: merged.getPageCount() };
}

/**
 * Divide um PDF.
 *  mode 'range'  — extrai as páginas do intervalo ("1-3", "2,4,6") para UM PDF.
 *  mode 'pages'  — gera um PDF por página (do intervalo, ou de todas se vazio).
 */
async function splitPdf(input, { mode = 'range', range = '', maxPages } = {}) {
  const doc = await loadPdf(input, { maxPages });
  const total = doc.getPageCount();

  if (mode === 'pages') {
    const indices = String(range).trim() ? parsePageRanges(range, total) : doc.getPageIndices();
    if (!indices.length) throw new ValidationError(`Nenhuma página válida no intervalo informado. O PDF tem ${total} página(s).`);
    const parts = [];
    for (const index of indices) {
      parts.push({ page: index + 1, buffer: await save(await copyPagesToNewDoc(doc, [index])) });
    }
    return { parts, total };
  }

  const indices = parsePageRanges(range, total);
  if (!indices.length) throw new ValidationError(`Nenhuma página válida no intervalo informado. O PDF tem ${total} página(s).`);
  return { buffer: await save(await copyPagesToNewDoc(doc, indices)), pageCount: indices.length, total };
}

/** Gira todas as páginas somando `angle` à rotação já existente. */
async function rotatePdf(input, { angle, maxPages } = {}) {
  const value = parseInt(angle, 10);
  if (![90, 180, 270].includes(value)) throw new ValidationError('Ângulo inválido. Use 90, 180 ou 270 graus.');
  const doc = await loadPdf(input, { maxPages });
  for (const page of doc.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + value) % 360));
  }
  return { buffer: await save(doc) };
}

/** Remove as páginas indicadas, mantendo o resto na ordem original. */
async function removePages(input, { pages, maxPages } = {}) {
  const doc = await loadPdf(input, { maxPages });
  const total = doc.getPageCount();
  const toRemove = new Set(parsePageRanges(pages, total));
  if (!toRemove.size) throw new ValidationError(`Nenhuma página válida para remover. O PDF tem ${total} página(s).`);
  if (toRemove.size >= total) throw new ValidationError('Não é possível remover todas as páginas do documento.');
  const keep = doc.getPageIndices().filter((i) => !toRemove.has(i));
  return { buffer: await save(await copyPagesToNewDoc(doc, keep)), removed: toRemove.size };
}

/** Regrava o PDF sem metadados de autoria (usado quando o Ghostscript não reduz). */
async function stripMetadata(input, { maxPages } = {}) {
  const doc = await loadPdf(input, { maxPages });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('Copacol');
  return { buffer: await save(doc) };
}

/** Conta páginas e confere se o PDF abre (validação antes de motores externos). */
async function inspectPdf(input, { maxPages } = {}) {
  const doc = await loadPdf(input, { maxPages });
  return { pageCount: doc.getPageCount(), signed: hasDigitalSignature(input) };
}

/**
 * Junta imagens num PDF — uma por página, no tamanho original (1 px = 1 pt), como a
 * versão anterior fazia. As imagens chegam já normalizadas para JPEG ou PNG pelo
 * imageTools (WebP e orientação EXIF são resolvidos lá).
 */
async function imagesToPdf(images) {
  if (!images.length) throw new ValidationError('Envie pelo menos uma imagem.');
  const doc = await PDFDocument.create();
  for (const { buffer, format } of images) {
    const image = format === 'jpeg' ? await doc.embedJpg(buffer) : await doc.embedPng(buffer);
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  return { buffer: await save(doc), pageCount: images.length };
}

module.exports = {
  loadPdf, mergePdfs, splitPdf, rotatePdf, removePages, stripMetadata, inspectPdf,
  imagesToPdf, hasDigitalSignature,
};
