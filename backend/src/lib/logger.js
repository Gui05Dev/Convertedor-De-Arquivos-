'use strict';

/* Log estruturado (uma linha JSON por evento), pronto pra ir pro syslog/Loki/ELK.

   Regra do projeto: log NUNCA leva conteúdo de documento, nome original de arquivo
   (pode ser sensível: "rescisao_fulano.pdf"), tokens, cookies ou headers de
   autorização. Só identificadores internos, usuário, ferramenta, tamanhos, tempos e
   códigos de erro. `sanitize` derruba qualquer campo com nome suspeito por garantia. */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const FORBIDDEN_KEYS = /token|authorization|cookie|password|secret|senha|filename|originalname|content/i;

function sanitize(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (value instanceof Error) {
      out[key] = { name: value.name, code: value.code, message: value.expose ? value.message : undefined };
      continue;
    }
    out[key] = value;
  }
  return out;
}

function createLogger({ level = 'info', sink = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, event, fields) => {
    if (LEVELS[lvl] < threshold) return;
    sink(JSON.stringify({ ts: new Date().toISOString(), level: lvl, event, ...sanitize(fields) }));
  };
  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}

module.exports = { createLogger, sanitize };
