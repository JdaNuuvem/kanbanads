import { AppError } from '../lib/errors.js';

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(AppError.validation('Dados inválidos', details));
    }
    req.validated = result.data;
    return next();
  };
}
