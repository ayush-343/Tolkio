import { randomUUID } from 'node:crypto';
export function httpError(status, code, message) { return Object.assign(new Error(message), { status, code }); }
export const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
export function requestIdentity(req, res, next) {
  req.requestId = randomUUID();
  res.set('X-Request-ID', req.requestId);
  next();
}
export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return _next(error);
  const csrf = error.code === 'EBADCSRFTOKEN';
  const status = csrf ? 403 : error.name === 'ZodError' || error.type === 'entity.parse.failed' ? 400 : error.status || 500;
  const message = csrf ? 'Invalid CSRF token' : status >= 500 ? 'The service could not complete this request. Please retry.' : error.name === 'ZodError' ? 'Invalid request fields.' : error.message;
  res.status(status).json({ message, error: { code: csrf ? 'INVALID_CSRF' : error.code || (status === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR'), message, requestId: req.requestId } });
}
