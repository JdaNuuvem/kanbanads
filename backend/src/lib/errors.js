export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static notFound(message = 'Recurso não encontrado') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static unauthorized(message = 'Não autorizado') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Acesso negado') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static validation(message = 'Dados inválidos', details = null) {
    return new AppError(message, 422, 'VALIDATION_ERROR', details);
  }

  static conflict(message = 'Conflito') {
    return new AppError(message, 409, 'CONFLICT');
  }
}
