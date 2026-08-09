'use strict';

const fs = require('fs/promises');
const path = require('path');
const { withTempDir } = require('./tempdir');
const { runConverterAndReadOutput } = require('./runConverter');

const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN || 'soffice';

function toFileUrl(dir) {
  const posixDir = dir.replace(/\\/g, '/');
  return posixDir.startsWith('/') ? `file://${posixDir}` : `file:///${posixDir}`;
}

/**
 * Converte um buffer de `sourceExt` para `targetExt` via LibreOffice headless.
 * Cada chamada usa um diretório de trabalho e um perfil de usuário isolados —
 * o LibreOffice trava conversões concorrentes que compartilham o mesmo perfil.
 *
 * Só funciona quando o soffice abre `sourceExt` no mesmo "app" (Writer/Impress/Calc)
 * que exporta `targetExt` — ex.: docx->pdf e pptx->pdf funcionam, mas pdf->docx NÃO
 * (o soffice abre PDF como um documento Draw, que não tem filtro de exportação p/ DOCX).
 */
async function convertBuffer(inputBuffer, sourceExt, targetExt) {
  return withTempDir('lo-convert-', async (workDir) => {
    const outDir = path.join(workDir, 'out');
    const profileDir = path.join(workDir, 'profile');
    await fs.mkdir(outDir, { recursive: true });
    await fs.mkdir(profileDir, { recursive: true });

    const inputPath = path.join(workDir, `source.${sourceExt}`);
    await fs.writeFile(inputPath, inputBuffer);

    const args = [
      '--headless',
      '--norestore',
      '--convert-to', targetExt,
      '--outdir', outDir,
      `-env:UserInstallation=${toFileUrl(profileDir)}`,
      inputPath,
    ];
    const outputPath = path.join(outDir, `source.${targetExt}`);
    return runConverterAndReadOutput(LIBREOFFICE_BIN, args, outputPath, {
      failMessage: 'Não foi possível converter este arquivo. Verifique se ele não está corrompido.',
    });
  });
}

module.exports = { convertBuffer };
