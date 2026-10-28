export interface SignatureImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  threshold?: number;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image could not be read.'));
    image.src = source;
  });
}

export async function trimSignatureImage(
  dataUrl: string,
  options: SignatureImageOptions = {},
): Promise<string> {
  const image = await loadImage(dataUrl);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Signature image processing is unavailable.');
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const threshold = options.threshold ?? 244;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha === 0) continue;
      const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      if (luminance >= threshold) {
        data[offset + 3] = 0;
        continue;
      }
      const darkness = 1 - luminance / 255;
      if (darkness < 0.055) {
        data[offset + 3] = 0;
        continue;
      }
      data[offset + 3] = Math.min(alpha, Math.round(alpha * Math.min(1, darkness * 3.4)));
      if (data[offset + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) throw new Error('The signature appears to be blank.');
  context.putImageData(imageData, 0, 0);

  const padding = 10;
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + padding);
  const bottom = Math.min(height, maxY + padding);
  const croppedWidth = right - left;
  const croppedHeight = bottom - top;
  const maxOutputWidth = options.maxWidth ?? 1400;
  const maxOutputHeight = options.maxHeight ?? 520;
  const outputScale = Math.min(1, maxOutputWidth / croppedWidth, maxOutputHeight / croppedHeight);
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(croppedWidth * outputScale));
  output.height = Math.max(1, Math.round(croppedHeight * outputScale));
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('Signature image processing is unavailable.');
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(canvas, left, top, croppedWidth, croppedHeight, 0, 0, output.width, output.height);
  return output.toDataURL('image/png');
}

export async function typedSignature(
  text: string,
  color = '#171614',
  fontFamily = '"Caveat Variable", "Segoe Script", cursive',
): Promise<string> {
  const clean = text.trim().slice(0, 80);
  if (!clean) throw new Error('Type a signature first.');
  try {
    await document.fonts.load(`600 180px "Caveat Variable"`);
  } catch {
    // The fallback cursive face is still usable.
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 520;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Signature rendering is unavailable.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  let fontSize = 210;
  context.font = `600 ${fontSize}px ${fontFamily}`;
  while (context.measureText(clean).width > 1440 && fontSize > 80) {
    fontSize -= 8;
    context.font = `600 ${fontSize}px ${fontFamily}`;
  }
  context.fillStyle = color;
  context.textBaseline = 'middle';
  context.fillText(clean, 80, canvas.height / 2);
  return trimSignatureImage(canvas.toDataURL('image/png'));
}

export function drawVideoFrame(video: HTMLVideoElement): string {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width === 0 || height === 0) throw new Error('The camera has not started yet.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Camera capture is unavailable.');
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
