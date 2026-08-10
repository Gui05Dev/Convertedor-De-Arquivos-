'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

/* Cria um diretório temporário único, executa fn(dir) e sempre limpa depois — mesmo em erro/timeout. */
async function withTempDir(prefix, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { withTempDir };
