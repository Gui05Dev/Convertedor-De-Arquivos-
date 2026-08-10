'use strict';

/**
 * Porteiro para rotas caras: deixa no máximo `limit` requisições dentro da rota ao
 * mesmo tempo e responde 503 nas demais, em vez de aceitar tudo e derrubar o container.
 *
 * Usado nas conversões de Office, onde cada requisição sobe um processo
 * LibreOffice/pdf2docx pesado de CPU e RAM (ver limites no docker-compose.yml).
 */
function limitConcurrency(limit, message) {
  let active = 0;

  return function gate(req, res, next) {
    if (active >= limit) {
      return res.status(503).json({ error: message });
    }

    active++;
    // 'close' cobre tanto a resposta concluída quanto o cliente desistindo no meio.
    res.once('close', () => { active--; });
    next();
  };
}

module.exports = { limitConcurrency };
