'use strict';

const { Router } = require('express');
const { singleFile, multipleFiles } = require('../middleware/upload');
const pdfTools = require('../lib/pdfTools');
const { asyncHandler, sendFile, requireFile, requireFiles, formatBytes } = require('../lib/http');

/* Manipulação de PDF (juntar, dividir, girar, remover páginas, comprimir, imagens->PDF).
   Tudo roda aqui: o frontend manda os arquivos e recebe o resultado pronto. */

const PDF_MIME = 'application/pdf';
const PDF_ONLY = ['pdf'];
const IMAGE_TYPES = ['jpg', 'jpeg', 'png'];

const router = Router();

function respondPdf(res, buffer, filename, info) {
  sendFile(res, { buffer, filename, contentType: PDF_MIME, info });
}

router.post('/merge', multipleFiles, asyncHandler(async (req, res) => {
  const files = requireFiles(req, PDF_ONLY, 2);
  const { buffer } = await pdfTools.mergePdfs(files);
  respondPdf(res, buffer, 'copacol-unido.pdf');
}));

router.post('/split', singleFile, asyncHandler(async (req, res) => {
  const file = requireFile(req, PDF_ONLY);
  const range = String(req.body.range || '');
  const { buffer, pageCount } = await pdfTools.splitPdf(file, range);

  const slug = range.replace(/[^0-9,-]/g, '') || 'selecao';
  respondPdf(res, buffer, `copacol-pags-${slug}.pdf`, `${pageCount} página(s) extraída(s).`);
}));

router.post('/rotate', singleFile, asyncHandler(async (req, res) => {
  const file = requireFile(req, PDF_ONLY);
  const { buffer } = await pdfTools.rotatePdf(file, req.body.angle ?? 90);
  respondPdf(res, buffer, 'copacol-girado.pdf');
}));

router.post('/remove-pages', singleFile, asyncHandler(async (req, res) => {
  const file = requireFile(req, PDF_ONLY);
  const { buffer, removed } = await pdfTools.removePages(file, String(req.body.pages || ''));
  respondPdf(res, buffer, 'copacol-paginas-removidas.pdf', `${removed} página(s) removida(s).`);
}));

router.post('/compress', singleFile, asyncHandler(async (req, res) => {
  const file = requireFile(req, PDF_ONLY);
  const { buffer, saved, percent } = await pdfTools.compressPdf(file);

  const info = saved > 0
    ? `Comprimido! Redução de ${formatBytes(saved)} (${percent}% menor).`
    : 'O arquivo já estava otimizado — não foi possível reduzir mais o tamanho.';
  respondPdf(res, buffer, 'copacol-comprimido.pdf', info);
}));

router.post('/images-to-pdf', multipleFiles, asyncHandler(async (req, res) => {
  const files = requireFiles(req, IMAGE_TYPES, 1);
  const { buffer } = await pdfTools.imagesToPdf(files);
  respondPdf(res, buffer, 'copacol-imagens.pdf');
}));

module.exports = router;
