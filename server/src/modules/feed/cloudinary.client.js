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

async function uploadImageBuffer(file) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: env.CLOUDINARY_FOLDER,
        resource_type: 'image',
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
        eager: [{ format: 'mp4', quality: 'auto' }],
        eager_async: false,
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
