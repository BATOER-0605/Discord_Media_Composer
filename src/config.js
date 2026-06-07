import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// プロジェクトルート（src の一つ上）
export const ROOT_DIR = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
export const OUTPUTS_DIR = path.join(ROOT_DIR, 'outputs');

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const list = (value, fallback) =>
  (value && value.trim() ? value : fallback)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const HOST = process.env.HOST || '0.0.0.0';
export const PORT = num(process.env.PORT, 3000);

// Cookie 署名鍵。未設定なら起動毎にランダム生成（設定ファイル不要で動かすため）。
export const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

// 目標サイズ。Discord の 10MB から安全マージンを取り、1000 進数で更に余裕を持たせる。
export const TARGET_MB = num(process.env.TARGET_MB, 9.5);
export const TARGET_BYTES = Math.floor(TARGET_MB * 1000 * 1000);

export const MAX_UPLOAD_MB = num(process.env.MAX_UPLOAD_MB, 2000);
export const MAX_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_MB * 1000 * 1000);

export const AUDIO_BITRATE_K = num(process.env.AUDIO_BITRATE_K, 128);
export const MIN_VIDEO_BITRATE_K = num(process.env.MIN_VIDEO_BITRATE_K, 145);
export const X264_PRESET = process.env.X264_PRESET || 'medium';

export const GRACE_PERIOD_MINUTES = num(process.env.GRACE_PERIOD_MINUTES, 5);
export const GRACE_PERIOD_MS = GRACE_PERIOD_MINUTES * 60 * 1000;
export const REAPER_INTERVAL_MS = 15 * 1000;

export const MAX_CONCURRENT_JOBS = num(process.env.MAX_CONCURRENT_JOBS, 2);

export const ALLOWED_IMAGE_MIME = list(
  process.env.ALLOWED_IMAGE_MIME,
  'image/jpeg,image/png,image/heic,image/heif,image/webp',
);
export const ALLOWED_VIDEO_MIME = list(
  process.env.ALLOWED_VIDEO_MIME,
  'video/mp4,video/quicktime,video/x-matroska,video/webm,video/3gpp',
);

export const ALLOWED_MIME = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME];

export const isImageMime = (mime) => ALLOWED_IMAGE_MIME.includes((mime || '').toLowerCase());
export const isVideoMime = (mime) => ALLOWED_VIDEO_MIME.includes((mime || '').toLowerCase());
