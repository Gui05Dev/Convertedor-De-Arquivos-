'use strict';

/* Erros com status HTTP e mensagem segura pra mostrar ao usuário. O errorHandler
   traduz qualquer um destes na resposta JSON; qualquer outro erro vira 500 genérico,
   sem vazar caminho de arquivo ou stack. `code` é estável e vai pros logs. */
class HttpError extends Error {
  constructor(message, status, code = 'http_error') {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

/** Entrada inválida do usuário (tipo de arquivo, intervalo de páginas, opção). */
class ValidationError extends HttpError {
  constructor(message, code = 'invalid_input') {
    super(message, 400, code);
  }
}

/** Falha ao converter/processar o arquivo. */
class ConversionError extends HttpError {
  constructor(message, code = 'conversion_failed', status = 422) {
    super(message, status, code);
  }
}

class TimeoutError extends ConversionError {
  constructor() {
    super('O processamento demorou demais e foi cancelado. Tente um arquivo menor.', 'timeout', 504);
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Trabalho não encontrado.') {
    super(message, 404, 'not_found');
  }
}

module.exports = { HttpError, ValidationError, ConversionError, TimeoutError, NotFoundError };
