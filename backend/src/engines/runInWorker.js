'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const { HttpError, ConversionError, ValidationError, TimeoutError } = require('../lib/errors');

const WORKER_FILE = path.join(__dirname, 'worker.js');

/* Reconstrói no lado da API o erro serializado pelo worker. Só mensagens marcadas
   como seguras (expose) chegam ao usuário; o resto vira mensagem genérica. */
function rebuildError(e) {
  if (e?.expose) {
    if (e.status === 400) return new ValidationError(e.message, e.code);
    return new HttpError(e.message, e.status || 422, e.code || 'conversion_failed');
  }
  const err = new ConversionError('Não foi possível processar o arquivo. Verifique se ele não está corrompido.', 'engine_error');
  err.cause = { name: e?.name };
  return err;
}

/**
 * Roda uma operação de engines/worker.js num worker thread descartável.
 * @param {string} op
 * @param {object} data       { inputs, outputDir, options, limits }
 * @param {object} opts       { timeoutMs, maxHeapMb, signal }
 */
function runInWorker(op, data, { timeoutMs, maxHeapMb, signal }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_FILE, {
      workerData: { op, ...data },
      resourceLimits: { maxOldGenerationSizeMb: maxHeapMb, maxYoungGenerationSizeMb: 64 },
      env: {}, // o worker não precisa (nem vê) variáveis de ambiente da API
      stdout: true,
      stderr: true,
    });

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate().catch(() => {});
      fn(value);
    };

    const timer = setTimeout(() => finish(reject, new TimeoutError()), timeoutMs);
    const onAbort = () => finish(reject, new ConversionError('Processamento cancelado.', 'cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.on('message', (msg) => {
      if (msg?.ok) finish(resolve, msg.result);
      else finish(reject, rebuildError(msg?.error));
    });
    worker.on('error', (err) => {
      // ERR_WORKER_OUT_OF_MEMORY: estourou resourceLimits.
      if (err?.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        finish(reject, new ConversionError('O arquivo exige mais memória do que o servidor permite processar.', 'out_of_memory'));
      } else {
        finish(reject, rebuildError({ name: err?.name }));
      }
    });
    worker.on('exit', (code) => {
      if (!settled) finish(reject, rebuildError({ name: `exit_${code}` }));
    });
  });
}

module.exports = { runInWorker };
