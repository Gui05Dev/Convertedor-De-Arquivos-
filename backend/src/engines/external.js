'use strict';

/* Motores que rodam como processo externo, sempre via lib/process.js (sem shell,
   ambiente mínimo, grupo de processos próprio, limite de tamanho de saída).

   - LibreOffice (MPL-2.0): DOCX/PPTX -> PDF.
   - Ghostscript (AGPL-3.0, executável não modificado): compressão de PDF.
   - pdf2docx (MIT) + PyMuPDF (AGPL-3.0): PDF -> DOCX. Opcional (ENABLE_PDF_TO_DOCX). */

const fs = require('fs/promises');
const path = require('path');
const { runProcess } = require('../lib/process');
const { ConversionError } = require('../lib/errors');

const PDF2DOCX_SCRIPT = path.join(__dirname, 'pdf2docx_convert.py');

async function readOutput(outputPath, failMessage) {
  let stat;
  try { stat = await fs.stat(outputPath); } catch { stat = null; }
  if (!stat || stat.size === 0) throw new ConversionError(failMessage, 'empty_output');
  return stat.size;
}

function fileUrl(dir) {
  return `file://${dir.split(path.sep).map(encodeURIComponent).join('/')}`;
}

/**
 * DOCX/PPTX -> PDF com LibreOffice headless. Perfil de usuário isolado por trabalho
 * (o LibreOffice trava conversões concorrentes que compartilham perfil).
 */
async function officeToPdf({ inputPath, workDir, outputPath, cfg, signal }) {
  const outDir = path.join(workDir, 'lo-out');
  const profileDir = path.join(workDir, 'lo-profile');
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });

  const { code } = await runProcess(cfg.libreofficeBin, [
    `-env:UserInstallation=${fileUrl(profileDir)}`,
    '--headless', '--norestore', '--nologo', '--nodefault', '--nolockcheck',
    '--convert-to', 'pdf:writer_pdf_Export',
    '--outdir', outDir,
    inputPath,
  ], {
    cwd: workDir, timeoutMs: cfg.jobTimeoutMs, signal,
    prlimitBin: cfg.prlimitPath, maxOutputBytes: cfg.maxOutputBytes,
  });

  const produced = path.join(outDir, `${path.parse(inputPath).name}.pdf`);
  const failMessage = 'Não foi possível converter este arquivo. Verifique se ele não está corrompido ou protegido por senha.';
  if (code !== 0) throw new ConversionError(failMessage, 'libreoffice_failed');
  await readOutput(produced, failMessage);
  await fs.rename(produced, outputPath);
}

/* Perfis de compressão expostos na tela -> parâmetros do pdfwrite do Ghostscript. */
const COMPRESSION_LEVELS = {
  leve: { preset: '/printer', dpi: 300, label: 'leve (300 dpi)' },
  recomendada: { preset: '/ebook', dpi: 150, label: 'recomendada (150 dpi)' },
  forte: { preset: '/screen', dpi: 96, label: 'forte (96 dpi)' },
};

/** Recomprime imagens e fontes de um PDF com o Ghostscript (pdfwrite), em modo -dSAFER. */
async function compressPdf({ inputPath, workDir, outputPath, level, cfg, signal }) {
  const profile = COMPRESSION_LEVELS[level] || COMPRESSION_LEVELS.recomendada;
  const { code } = await runProcess(cfg.ghostscriptBin, [
    '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dNOINTERPOLATE',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.7',
    `-dPDFSETTINGS=${profile.preset}`,
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    '-dDownsampleColorImages=true', `-dColorImageResolution=${profile.dpi}`,
    '-dDownsampleGrayImages=true', `-dGrayImageResolution=${profile.dpi}`,
    '-dDownsampleMonoImages=true', `-dMonoImageResolution=${Math.max(profile.dpi, 300)}`,
    `-sOutputFile=${outputPath}`,
    '-f', inputPath,
  ], {
    cwd: workDir, timeoutMs: cfg.jobTimeoutMs, signal,
    prlimitBin: cfg.prlimitPath, maxOutputBytes: cfg.maxOutputBytes,
  });
  const failMessage = 'Não foi possível comprimir este PDF. Verifique se ele não está corrompido.';
  if (code !== 0) throw new ConversionError(failMessage, 'ghostscript_failed');
  return { size: await readOutput(outputPath, failMessage), profile };
}

/** Códigos de saída combinados com pdf2docx_convert.py. */
const PDF2DOCX_EXIT = { SCANNED: 3, ENCRYPTED: 4 };

/** PDF -> DOCX via pdf2docx. PDFs digitalizados (sem texto) são recusados com aviso. */
async function pdfToDocx({ inputPath, workDir, outputPath, cfg, signal }) {
  const { code } = await runProcess(cfg.pythonBin, ['-I', PDF2DOCX_SCRIPT, inputPath, outputPath], {
    cwd: workDir, timeoutMs: cfg.jobTimeoutMs, signal,
    prlimitBin: cfg.prlimitPath, maxOutputBytes: cfg.maxOutputBytes,
  });
  if (code === PDF2DOCX_EXIT.SCANNED) {
    throw new ConversionError(
      'Este PDF parece ser digitalizado (as páginas são imagens, sem texto selecionável). '
      + 'A conversão para Word só funciona com PDF de texto; reconhecimento de texto (OCR) ainda não está disponível.',
      'pdf_scanned'
    );
  }
  if (code === PDF2DOCX_EXIT.ENCRYPTED) {
    throw new ConversionError('O PDF está protegido por senha. Remova a proteção e tente de novo.', 'pdf_encrypted', 400);
  }
  const failMessage = 'Não foi possível converter este PDF em Word. Verifique se ele não está corrompido.';
  if (code !== 0) throw new ConversionError(failMessage, 'pdf2docx_failed');
  await readOutput(outputPath, failMessage);
}

module.exports = { officeToPdf, compressPdf, pdfToDocx, COMPRESSION_LEVELS };
