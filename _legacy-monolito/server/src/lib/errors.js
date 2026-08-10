'use strict';

class ConversionError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'ConversionError';
    this.status = status;
  }
}

module.exports = { ConversionError };
