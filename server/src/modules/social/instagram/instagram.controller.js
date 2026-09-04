const { env } = require('../../../config/env');
const { logger } = require('../../../config/logger');
const oauthService = require('./instagram.oauth.service');
const socialPostService = require('./instagram.social-post.service');
const { socialPostIdSchema } = require('./instagram.social-post.validation');

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

async function refreshToken(req, res) {
  res.status(200).json({
    connection: await oauthService.refreshStoredToken({ userId: req.auth.userId }),
  });
}

async function disconnect(req, res) {
  res.status(200).json(await oauthService.disconnect(req.auth.userId));
}

async function listSocialPosts(_req, res) {
  res.status(200).json({ posts: await socialPostService.listSocialPosts() });
}

async function createSocialPost(req, res) {
  const post = await socialPostService.createDraft({
    userId: req.auth.userId,
    input: req.body,
    file: req.file,
  });
  res.status(201).json({ post });
}

async function markSocialPostReady(req, res) {
  const { postId } = socialPostIdSchema.parse(req.params);
  const post = await socialPostService.markReadyForReview({
    postId,
    userId: req.auth.userId,
  });
  res.status(200).json({ post });
}

async function approveSocialPost(req, res) {
  const { postId } = socialPostIdSchema.parse(req.params);
  const post = await socialPostService.approveSocialPost({
    postId,
    userId: req.auth.userId,
  });
  res.status(200).json({ post });
}

async function cancelSocialPost(req, res) {
  const { postId } = socialPostIdSchema.parse(req.params);
  const post = await socialPostService.cancelSocialPost({
    postId,
    userId: req.auth.userId,
  });
  res.status(200).json({ post });
}

async function queueSocialPost(req, res) {
  const { postId } = socialPostIdSchema.parse(req.params);
  const post = await socialPostService.queueSocialPost({
    postId,
    userId: req.auth.userId,
  });
  res.status(200).json({ post });
}

module.exports = {
  disconnect,
  approveSocialPost,
  cancelSocialPost,
  createSocialPost,
  listSocialPosts,
  markSocialPostReady,
  queueSocialPost,
  oauthCallback,
  refreshToken,
  startOAuth,
  status,
  verify,
};
