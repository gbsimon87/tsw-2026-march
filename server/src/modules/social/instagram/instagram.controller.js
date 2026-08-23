const { env } = require('../../../config/env');
const { logger } = require('../../../config/logger');
const oauthService = require('./instagram.oauth.service');

function clientRedirectUrl(result) {
  const [clientOrigin] = env.CLIENT_ORIGIN.split(',');
  const url = new URL('/admin/social/instagram', clientOrigin.trim());
  url.searchParams.set('oauth', result);
  return url.toString();
}

async function startOAuth(req, res) {
  const result = await oauthService.createAuthorization({
    userId: req.auth.userId,
    sessionId: req.auth.sessionId,
  });
  res.status(200).json(result);
}

async function oauthCallback(req, res) {
  if (req.query.error) {
    try {
      await oauthService.cancelAuthorization({
        state: req.query.state,
        userId: req.auth.userId,
        sessionId: req.auth.sessionId,
      });
      res.redirect(clientRedirectUrl('cancelled'));
    } catch (error) {
      logger.warn({ err: error }, 'Instagram OAuth cancellation state failed');
      res.redirect(clientRedirectUrl('failed'));
    }
    return;
  }

  try {
    await oauthService.completeAuthorization({
      code: req.query.code,
      state: req.query.state,
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
    });
    res.redirect(clientRedirectUrl('connected'));
  } catch (error) {
    logger.warn({ err: error }, 'Instagram OAuth callback failed');
    res.redirect(clientRedirectUrl('failed'));
  }
}

async function status(_req, res) {
  res.status(200).json(await oauthService.getStatus());
}

async function verify(_req, res) {
  res.status(200).json({ connection: await oauthService.verifyStoredConnection() });
}

async function disconnect(req, res) {
  res.status(200).json(await oauthService.disconnect(req.auth.userId));
}

module.exports = {
  disconnect,
  oauthCallback,
  startOAuth,
  status,
  verify,
};
