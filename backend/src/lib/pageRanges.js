'use strict';

const { ValidationError } = require('./errors');

/**
 * Interpreta uma expressão de páginas escrita pelo usuário ("1-3", "2,4,6", "1,3,5-7")
 * e devolve os índices 0-based correspondentes, sem repetição e em ordem crescente.
 *
 * Roda no backend porque é validação de entrada: o frontend só repassa o texto cru.
 * Páginas fora do documento são descartadas em silêncio (o usuário pode digitar "1-999"
 * querendo dizer "até o fim"), mas expressões malformadas viram erro explícito — aí é
 * engano de digitação e processar mesmo assim daria um resultado errado sem aviso.
 *
 * @param {string} input  expressão digitada
 * @param {number} total  número de páginas do documento
 * @returns {number[]} índices 0-based
 */
function parsePageRanges(input, total) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new ValidationError('Informe as páginas antes de processar.');

  const pages = new Set();

  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) continue;

    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = parseInt(range[1], 10);
      const end = parseInt(range[2], 10);
      if (start < 1) throw new ValidationError(`Intervalo inválido: "${token}". As páginas começam em 1.`);
      if (start > end) throw new ValidationError(`Intervalo inválido: "${token}". Use o formato menor-maior, ex.: 2-5.`);
      for (let page = start; page <= Math.min(end, total); page++) pages.add(page - 1);
      continue;
    }

    if (/^\d+$/.test(token)) {
      const page = parseInt(token, 10);
      if (page < 1) throw new ValidationError(`Página inválida: "${token}". As páginas começam em 1.`);
      if (page <= total) pages.add(page - 1);
      continue;
    }

    throw new ValidationError(`Não entendi "${token}". Use números e intervalos, ex.: 1,3,5-7.`);
  }

  return Array.from(pages).sort((a, b) => a - b);
}

module.exports = { parsePageRanges };
