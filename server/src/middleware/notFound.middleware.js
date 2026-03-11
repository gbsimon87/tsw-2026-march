const { ApiError } = require('../utils/apiError');

function notFoundMiddleware(_req, _res, next) {
  next(new ApiError(404, 'Route not found'));
}

module.exports = {
  notFoundMiddleware,
};
