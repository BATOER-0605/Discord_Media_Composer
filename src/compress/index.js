import { isImageMime, isVideoMime } from '../config.js';
import { compressImage } from './image.js';
import { compressVideo } from './video.js';

/**
 * MIME タイプに応じて画像/動画の圧縮処理へ振り分ける。
 * @returns {Promise<{outputPath: string, size: number}>}
 */
export function compress({ mime, ...args }) {
  if (isImageMime(mime)) {
    return compressImage(args);
  }
  if (isVideoMime(mime)) {
    return compressVideo(args);
  }
  throw new Error(`未対応の形式です: ${mime}`);
}
