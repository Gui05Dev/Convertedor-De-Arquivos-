'use strict';

/* Descobre o formato REAL de um arquivo pelo conteúdo (assinatura), não pela extensão
   nem pelo Content-Type que o navegador mandou — os dois são controlados pelo usuário.

   Tipos reconhecidos: pdf, jpeg, png, webp, docx, pptx.
   DOCX/PPTX são ZIP: além da assinatura, conferimos as entradas obrigatórias do
   OOXML e recusamos variantes com macro (docm/pptm), que o LibreOffice abriria. */

const fs = require('fs/promises');
const { listEntriesFromFile } = require('./zip');

const HEAD_BYTES = 1024;

function detectFromHead(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (head.length >= 4 && head.readUInt32LE(0) === 0x04034b50) return 'zip';
  // PDF por último: "%PDF-" pode vir depois de lixo inicial (leitores toleram até 1024
  // bytes), então só vale se nenhuma assinatura de offset 0 casou antes.
  if (head.indexOf('%PDF-') !== -1) return 'pdf';
  return null;
}

function classifyOoxml(entries) {
  if (!entries || !entries.includes('[Content_Types].xml')) return null;
  const hasMacros = entries.some((name) => /vbaProject\.bin$/i.test(name));
  if (entries.includes('word/document.xml')) return hasMacros ? 'docm' : 'docx';
  if (entries.includes('ppt/presentation.xml')) return hasMacros ? 'pptm' : 'pptx';
  if (entries.includes('xl/workbook.xml')) return hasMacros ? 'xlsm' : 'xlsx';
  return null;
}

/**
 * @param {string} filePath
 * @returns {Promise<{ type: string|null, size: number }>}
 */
async function sniffFile(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    if (size === 0) return { type: null, size };
    const head = Buffer.alloc(Math.min(HEAD_BYTES, size));
    await handle.read(head, 0, head.length, 0);
    let type = detectFromHead(head);
    if (type === 'zip') type = classifyOoxml(await listEntriesFromFile(handle, size));
    return { type, size };
  } finally {
    await handle.close();
  }
}

/* Nome amigável de cada tipo, pras mensagens de erro. */
const TYPE_LABELS = {
  pdf: 'PDF', jpeg: 'JPG', png: 'PNG', webp: 'WebP', docx: 'Word (DOCX)', pptx: 'PowerPoint (PPTX)',
  docm: 'Word com macros (DOCM)', pptm: 'PowerPoint com macros (PPTM)', xlsx: 'Excel (XLSX)', xlsm: 'Excel com macros (XLSM)',
};

module.exports = { sniffFile, detectFromHead, classifyOoxml, TYPE_LABELS };
