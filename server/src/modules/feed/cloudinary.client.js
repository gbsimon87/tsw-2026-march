const stream = require('stream');
const cloudinary = require('cloudinary').v2;
const { env } = require('../../config/env');

function isCloudinaryConfigured() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

// `folder` overrides the environment's default asset root. Social exports pass
// their own so they are addressable as a set: retention, audit and a deletion
// request all need to reach published social assets without touching ordinary
// user feed images sitting in the same bucket.
//
// `publicId` names the asset instead of taking Cloudinary's random id, and
// `tags` make a set deletable in one call. Both are opt-in: every other caller
// keeps the generated id and no tags.
//
// overwrite:false is deliberate. A named id could in principle collide, and
// replacing an asset an approved or published record already points at is the
// worse failure — callers supply enough entropy that the branch is unreachable.
async function uploadImageBuffer(file, { folder = env.CLOUDINARY_FOLDER, publicId, tags } = {}) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        ...(publicId ? { public_id: publicId, overwrite: false } : {}),
        ...(tags?.length ? { tags } : {}),
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    const readable = new stream.PassThrough();
    readable.end(file.buffer);
    readable.pipe(uploadStream);
  });
}

async function destroyImage(publicId) {
  if (!publicId || !isCloudinaryConfigured()) {
    return null;
  }

  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

async function uploadVideoBuffer(file) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: env.CLOUDINARY_FOLDER,
        resource_type: 'video',
        // OPT-009: transcode the MP4 asynchronously so the upload request
        // returns as soon as the original is stored (was eager_async:false,
        // which blocked the response for the full transcode — seconds on large
        // clips). Delivery below falls back to the original + f_auto,q_auto,vc_auto
        // until the eager MP4 is ready.
        eager: [{ format: 'mp4', quality: 'auto' }],
        eager_async: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    const readable = new stream.PassThrough();
    readable.end(file.buffer);
    readable.pipe(uploadStream);
  });
}

async function destroyVideo(publicId) {
  if (!publicId || !isCloudinaryConfigured()) {
    return null;
  }

  return cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
}

module.exports = {
  isCloudinaryConfigured,
  uploadImageBuffer,
  destroyImage,
  uploadVideoBuffer,
  destroyVideo,
};
