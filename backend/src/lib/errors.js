'use strict';

/* Erros com status HTTP embutido. O errorHandler traduz qualquer um destes na
   resposta JSON; qualquer outro erro vira 500 genérico (sem vazar stack pro cliente). */
class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.expose = true; // mensagem segura pra mostrar ao usuário
  }
}

/** Entrada inválida do usuário (intervalo de páginas errado, ângulo inválido, etc.). */
class ValidationError extends HttpError {
  constructor(message) {
    super(message, 400);
  }
}

/** Falha ao converter/processar o arquivo. 422 por padrão, 504 em timeout. */
class ConversionError extends HttpError {
  constructor(message, status = 422) {
    super(message, status);
  }
}

module.exports = { HttpError, ValidationError, ConversionError };
