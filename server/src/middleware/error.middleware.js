const { logger } = require('../config/logger');

function errorMiddleware(error, req, res, next) {
  void next;
  const isZodError = error?.name === 'ZodError';
  const isMulterLimitError = error?.code === 'LIMIT_FILE_SIZE';
  const statusCode = error.statusCode || (isZodError || isMulterLimitError ? 400 : 500);
  const message = isMulterLimitError
    ? 'Image exceeds upload size limit'
    : error.message || 'Internal server error';

  if (statusCode >= 500) {
    logger.error({ err: error, requestId: req.requestId }, 'Unhandled server error');
  } else {
    logger.warn({ err: error, requestId: req.requestId }, 'Handled request error');
  }

  res.status(statusCode).json({
    error: {
      message,
      details: error.details || (isZodError ? error.flatten?.() || null : null),
      requestId: req.requestId,
    },
  });
}

module.exports = {
  errorMiddleware,
};
