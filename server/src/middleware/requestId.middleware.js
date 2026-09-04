const { randomUUID } = require('crypto');

function requestIdMiddleware(req, _res, next) {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  next();
}

module.exports = {
  requestIdMiddleware,
};
