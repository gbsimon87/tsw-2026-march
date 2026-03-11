const { verifyAccessToken } = require('../services/token.service');
const { ApiError } = require('../utils/apiError');

function authMiddleware(req, _res, next) {
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.replace('Bearer ', '') : null;
  const token = bearer || req.cookies.accessToken;

  if (!token) {
    next(new ApiError(401, 'Unauthorized'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
    };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired access token'));
  }
}

module.exports = {
  authMiddleware,
};
