import path from 'node:path';
import fsp from 'node:fs/promises';
import sharp from 'sharp';
import { TARGET_BYTES } from '../config.js';

const EDGE_LADDER = [null, 4000, 3000, 2000, 1600, 1200, 900];
const Q_LO = 30;
const Q_HI = 92;

/**
 * 指定した長辺サイズで JPEG 品質を二分探索し、目標サイズ以下に収まる最良の
 * バッファを返す。収まらなければ null。
 */
async function searchQuality(inputPath, maxEdge) {
  let lo = Q_LO;
  let hi = Q_HI;
  let best = null;

  for (let i = 0; i < 7 && lo <= hi; i++) {
    const q = Math.floor((lo + hi) / 2);
    let pipeline = sharp(inputPath, { failOn: 'none' }).rotate(); // EXIF 回転を反映
    if (maxEdge) {
      pipeline = pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const buf = await pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer();

    if (buf.length <= TARGET_BYTES) {
      best = buf;
      lo = q + 1; // もっと高品質を試す
    } else {
      hi = q - 1;
    }
  }
  return best;
}

/**
 * 画像を目標サイズ以下の JPEG に圧縮する。
 * @returns {Promise<{outputPath: string, size: number}>}
 */
export async function compressImage({ inputPath, outputDir, baseName, onProgress = () => {} }) {
  const outputPath = path.join(outputDir, `${baseName}.jpg`);

  for (let i = 0; i < EDGE_LADDER.length; i++) {
    onProgress(40 + Math.round(((i + 1) / EDGE_LADDER.length) * 55));
    const buf = await searchQuality(inputPath, EDGE_LADDER[i]);
    if (buf) {
      await fsp.writeFile(outputPath, buf);
      onProgress(100);
      return { outputPath, size: buf.length };
    }
  }

  throw new Error('画像を目標サイズまで圧縮できませんでした。');
}
