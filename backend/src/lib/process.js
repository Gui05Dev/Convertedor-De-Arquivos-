'use strict';

/* Execução de conversores externos (LibreOffice, Ghostscript, Python).

   Regras de segurança aplicadas a TODA chamada:
   - spawn com array de argumentos, nunca shell: nada do usuário vira comando.
     Os caminhos passados são internos (gerados pela aplicação), nunca o nome original.
   - Ambiente mínimo: o filho NÃO herda process.env, então não vê segredos do backend.
   - Diretório de trabalho e HOME = pasta do próprio trabalho.
   - Grupo de processos próprio (detached) e SIGKILL no grupo inteiro em timeout ou
     cancelamento: o `soffice` é um wrapper que dispara o `soffice.bin`; matar só o pai
     deixaria o filho órfão consumindo CPU.
   - prlimit limita o tamanho de arquivo que o processo consegue gravar (RLIMIT_FSIZE),
     cortando documentos "bomba" que gerariam saídas gigantes. */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ConversionError, TimeoutError } = require('./errors');

const STDERR_LIMIT = 8 * 1024;

function findExecutable(bin) {
  if (!bin) return null;
  if (bin.includes('/')) {
    try { fs.accessSync(bin, fs.constants.X_OK); return bin; } catch { return null; }
  }
  for (const dir of (process.env.PATH || '/usr/local/bin:/usr/bin:/bin').split(path.delimiter)) {
    const candidate = path.join(dir, bin);
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* próximo */ }
  }
  return null;
}

/**
 * @param {string} bin
 * @param {string[]} args
 * @param {object} opts
 * @param {string} opts.cwd             diretório de trabalho do job
 * @param {number} opts.timeoutMs
 * @param {AbortSignal} [opts.signal]
 * @param {string|null} [opts.prlimitBin]  caminho do prlimit (null = sem limite de arquivo)
 * @param {number} [opts.maxOutputBytes]
 * @param {object} [opts.env]           variáveis extras (ex.: LANG)
 * @returns {Promise<{ code: number, stderr: string }>}
 */
function runProcess(bin, args, { cwd, timeoutMs, signal, prlimitBin, maxOutputBytes, env = {} }) {
  return new Promise((resolve, reject) => {
    let command = bin;
    let argv = args;
    if (prlimitBin && maxOutputBytes) {
      command = prlimitBin;
      argv = [`--fsize=${maxOutputBytes}`, '--core=0', '--', bin, ...args];
    }

    const child = spawn(command, argv, {
      cwd,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: cwd,
        TMPDIR: cwd,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        ...env,
      },
    });

    let stderr = '';
    let finished = false;
    let timedOut = false;

    child.stderr.on('data', (chunk) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk.toString('utf8').slice(0, STDERR_LIMIT - stderr.length);
    });

    const killGroup = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* já morreu */ }
    };

    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    const onAbort = () => killGroup();
    signal?.addEventListener('abort', onAbort, { once: true });

    const done = (fn) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      // Garante que nenhum neto sobreviva, mesmo com o pai saindo normalmente.
      killGroup();
      fn();
    };

    child.on('error', (err) => done(() => reject(
      err.code === 'ENOENT'
        ? new ConversionError('Conversor indisponível no servidor.', 'engine_missing', 503)
        : err
    )));

    child.on('close', (code, sig) => done(() => {
      if (timedOut) return reject(new TimeoutError());
      if (signal?.aborted) return reject(new ConversionError('Processamento cancelado.', 'cancelled'));
      resolve({ code: code ?? (sig ? 128 : 1), signal: sig, stderr });
    }));
  });
}

module.exports = { runProcess, findExecutable };
