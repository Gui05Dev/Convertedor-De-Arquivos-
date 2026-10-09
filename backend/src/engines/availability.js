'use strict';

/* Descobre, no boot, quais motores existem neste servidor. Ferramenta cujo motor não
   está instalado simplesmente não aparece em /api/tools (e é recusada se chamada). */

const os = require('os');
const { runProcess, findExecutable } = require('../lib/process');

async function probePython(pythonPath) {
  try {
    const { code } = await runProcess(pythonPath, ['-I', '-c', 'import pdf2docx, pymupdf'], {
      cwd: os.tmpdir(), timeoutMs: 20_000,
    });
    return code === 0;
  } catch {
    return false;
  }
}

async function detectEngines(cfg) {
  const soffice = findExecutable(cfg.libreofficeBin);
  const gs = findExecutable(cfg.ghostscriptBin);
  const python = findExecutable(cfg.pythonBin);
  const prlimit = findExecutable(cfg.prlimitBin);

  return {
    worker: true,
    libreoffice: Boolean(soffice),
    ghostscript: Boolean(gs),
    pdf2docx: Boolean(cfg.enablePdfToDocx && python && await probePython(python)),
    prlimitPath: prlimit,
  };
}

module.exports = { detectEngines };
