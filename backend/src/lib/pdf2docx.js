'use strict';

const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { withTempDir } = require('./tempdir');
const { runConverterAndReadOutput } = require('./runConverter');

const SCRIPT_PATH = path.join(__dirname, 'pdf2docx_convert.py');

/** Converte um PDF (buffer) em DOCX reconstruindo texto/layout via pdf2docx (Python). */
async function convertPdfToDocx(inputBuffer) {
  return withTempDir('pdf2docx-', async (workDir) => {
    const inputPath = path.join(workDir, 'source.pdf');
    const outputPath = path.join(workDir, 'output.docx');
    await fs.writeFile(inputPath, inputBuffer);

    return runConverterAndReadOutput(config.pythonBin, [SCRIPT_PATH, inputPath, outputPath], outputPath, {
      failMessage: 'Não foi possível converter este PDF em Word. Verifique se ele não está corrompido.',
    });
  });
}

module.exports = { convertPdfToDocx };
