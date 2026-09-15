import { RECEIPT_SECONDS, receiptRecordingType } from './highlightReceipt';

export const RECEIPT_SIZE = Object.freeze({ width: 1080, height: 1920 });
const DRAW_SIZE = Object.freeze({ width: 540, height: 960 });

function fitText(
  ctx,
  text,
  { x, y, maxWidth, size = 34, minSize = 20, color = '#fff', weight = 800 }
) {
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px Arial, sans-serif`;
  while (maxWidth && ctx.measureText(text).width > maxWidth && fontSize > minSize) {
    fontSize -= 2;
    ctx.font = `${weight} ${fontSize}px Arial, sans-serif`;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth);
}

function base(ctx) {
  ctx.fillStyle = '#0d1715';
  ctx.fillRect(0, 0, DRAW_SIZE.width, DRAW_SIZE.height);
  ctx.fillStyle = '#f4a300';
  ctx.fillRect(38, 51, 74, 7);
  fitText(ctx, 'THE SPORTY WAY', { x: 38, y: 91, size: 25, color: '#f4a300' });
}

function drawContainedVideo(ctx, video) {
  if (!video?.videoWidth || !video?.videoHeight) return;
  const box = { x: 0, y: 210, width: DRAW_SIZE.width, height: 450 };
  const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  ctx.drawImage(
    video,
    box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2,
    width,
    height
  );
}

export function drawReceiptFrame(ctx, video, plan, elapsedSeconds) {
  base(ctx);
  if (elapsedSeconds < RECEIPT_SECONDS.hook) {
    fitText(ctx, 'THE PLAY', { x: 38, y: 327, size: 52, color: '#f4a300' });
    fitText(ctx, plan.playerName, { x: 38, y: 400, maxWidth: 464, size: 40 });
    fitText(ctx, plan.playLabel.toUpperCase(), { x: 38, y: 456, maxWidth: 464, size: 31 });
    fitText(ctx, 'The clip and the stat line behind it.', {
      x: 38,
      y: 760,
      maxWidth: 464,
      size: 24,
      weight: 500,
    });
  } else if (elapsedSeconds < RECEIPT_SECONDS.hook + RECEIPT_SECONDS.play) {
    drawContainedVideo(ctx, video);
    ctx.fillStyle = '#0d1715';
    ctx.fillRect(0, 107, DRAW_SIZE.width, 115);
    fitText(ctx, plan.playerName, { x: 38, y: 157, maxWidth: 464, size: 34 });
    fitText(ctx, plan.playLabel, { x: 38, y: 197, maxWidth: 464, size: 26, color: '#f4a300' });
    fitText(ctx, plan.statLine, { x: 38, y: 710, maxWidth: 464, size: 29 });
    fitText(ctx, plan.result, { x: 38, y: 755, maxWidth: 464, size: 23, weight: 600 });
  } else {
    fitText(ctx, 'THE RECEIPT', { x: 38, y: 320, maxWidth: 464, size: 47, color: '#f4a300' });
    fitText(ctx, plan.playerName, { x: 38, y: 382, maxWidth: 464, size: 36 });
    fitText(ctx, plan.statLine, { x: 38, y: 446, maxWidth: 464, size: 32 });
    fitText(ctx, plan.result, { x: 38, y: 520, maxWidth: 464, size: 26 });
    fitText(ctx, 'Full box score on The Sporty Way', {
      x: 38,
      y: 680,
      maxWidth: 464,
      size: 25,
      color: '#f4a300',
    });
    fitText(ctx, `thesportyway.com${plan.gameUrl}`, {
      x: 38,
      y: 722,
      maxWidth: 464,
      size: 22,
      weight: 500,
    });
  }
  fitText(ctx, `Video: ${plan.sourceCredit}`, {
    x: 38,
    y: 804,
    maxWidth: 464,
    size: 20,
    minSize: 16,
    weight: 500,
  });
}

function seekVideo(video, seconds) {
  if (Math.abs(video.currentTime - seconds) < 0.05) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('Could not seek the source video to the selected moment.'));
    }, 10000);
    function onSeeked() {
      window.clearTimeout(timer);
      resolve();
    }
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = seconds;
  });
}

export async function renderHighlightReceipt({ video, plan, onProgress = () => {} }) {
  const recordingType = receiptRecordingType();
  if (!recordingType || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('This browser cannot record a canvas video. Try a current desktop browser.');
  }
  if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) {
    throw new Error('Wait for the source video to load.');
  }

  video.pause();
  video.muted = true;
  await seekVideo(video, plan.startSeconds);

  const canvas = document.createElement('canvas');
  canvas.width = RECEIPT_SIZE.width;
  canvas.height = RECEIPT_SIZE.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not initialise the video canvas.');
  ctx.scale(RECEIPT_SIZE.width / DRAW_SIZE.width, RECEIPT_SIZE.height / DRAW_SIZE.height);
  drawReceiptFrame(ctx, video, plan, 0);

  const stream = canvas.captureStream(30);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: recordingType.mimeType,
      videoBitsPerSecond: 5_000_000,
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const chunks = [];
  let timer;
  let playRequested = false;
  let stopped = false;

  try {
    const blob = await new Promise((resolve, reject) => {
      let failed = null;
      const fail = (error) => {
        failed = error instanceof Error ? error : new Error('Could not record the video.');
        stopped = true;
        window.clearInterval(timer);
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => fail(event.error);
      recorder.onstop = () => {
        if (failed) reject(failed);
        else if (!chunks.length) reject(new Error('The browser produced an empty video.'));
        else resolve(new Blob(chunks, { type: recordingType.mimeType }));
      };

      const startedAt = performance.now();
      recorder.start(250);
      timer = window.setInterval(() => {
        try {
          const elapsed = (performance.now() - startedAt) / 1000;
          if (!playRequested && elapsed >= RECEIPT_SECONDS.hook) {
            playRequested = true;
            video.play().catch(fail);
          }
          if (elapsed >= RECEIPT_SECONDS.hook + RECEIPT_SECONDS.play) video.pause();
          drawReceiptFrame(ctx, video, plan, elapsed);
          onProgress(Math.min(1, elapsed / RECEIPT_SECONDS.total));
          if (elapsed >= RECEIPT_SECONDS.total && !stopped) {
            stopped = true;
            window.clearInterval(timer);
            recorder.stop();
          }
        } catch (error) {
          window.clearInterval(timer);
          fail(error);
        }
      }, 1000 / 30);
    });
    return { blob, extension: recordingType.extension };
  } finally {
    window.clearInterval(timer);
    video.pause();
    stream.getTracks().forEach((track) => track.stop());
  }
}
