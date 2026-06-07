import express from 'express';
import path from 'node:path';
import multer from 'multer';
import { uploadSingle } from '../middleware/upload.js';
import { createJob, getJob } from '../jobs/jobStore.js';
import { attachJob } from '../jobs/sessionStore.js';
import { enqueueJob } from '../jobs/runner.js';
import { removeJobFiles } from '../util/files.js';
import {
  TARGET_MB,
  MAX_UPLOAD_MB,
  GRACE_PERIOD_MINUTES,
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
} from '../config.js';

const router = express.Router();

/** 設定情報（UI 表示用）。ヘルスチェックにも使う。 */
router.get('/config', (req, res) => {
  res.json({
    targetMB: TARGET_MB,
    maxUploadMB: MAX_UPLOAD_MB,
    gracePeriodMinutes: GRACE_PERIOD_MINUTES,
    allowedImage: ALLOWED_IMAGE_MIME,
    allowedVideo: ALLOWED_VIDEO_MIME,
  });
});

/** アイドル時のハートビート（セッション延命）。session ミドルウェアが lastSeen 更新済み。 */
router.post('/heartbeat', (req, res) => {
  res.status(204).end();
});

/** アップロード受付 → ジョブ作成 → 裏で圧縮開始。 */
router.post('/upload', (req, res) => {
  uploadSingle(req, res, async (err) => {
    if (err) {
      if (req.uploadJobId) await removeJobFiles(req.uploadJobId).catch(() => {});
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ error: `ファイルが大きすぎます（上限 ${MAX_UPLOAD_MB}MB）。` });
      }
      if (err.code === 'UNSUPPORTED_TYPE') {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'アップロードに失敗しました。' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'ファイルが選択されていません。' });
    }

    // multer が割り当てたディレクトリ名（uploadJobId）をそのままジョブ ID にする。
    const job = createJob({
      id: req.uploadJobId,
      sessionId: req.session.id,
      mime: (req.file.mimetype || '').toLowerCase(),
      originalName: req.file.originalname,
      originalSize: req.file.size,
    });
    attachJob(req.session.id, job.id);

    enqueueJob({
      jobId: job.id,
      mime: job.mime,
      inputPath: req.file.path,
      originalName: req.file.originalname,
    });

    res.status(202).json({ jobId: job.id });
  });
});

/** ジョブ状態の取得（ポーリング＝ハートビート）。 */
router.get('/status/:jobId', (req, res) => {
  const job = getOwnedJob(req, res);
  if (!job) return;
  res.json({
    status: job.status,
    progress: job.progress,
    ready: job.status === 'done',
    error: job.error,
    originalSize: job.originalSize,
    compressedSize: job.compressedSize,
    filename: job.filename,
  });
});

/** 圧縮済みファイルのダウンロード。 */
router.get('/download/:jobId', (req, res) => {
  const job = getOwnedJob(req, res);
  if (!job) return;
  if (job.status !== 'done' || !job.outputPath) {
    return res.status(409).json({ error: 'まだ準備ができていません。' });
  }
  res.download(job.outputPath, job.filename || path.basename(job.outputPath));
});

/** ジョブを取得し、リクエスト元セッションの所有物か検証する。 */
function getOwnedJob(req, res) {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'ジョブが見つかりません（期限切れの可能性があります）。' });
    return null;
  }
  if (job.sessionId !== req.session.id) {
    res.status(403).json({ error: '権限がありません。' });
    return null;
  }
  return job;
}

export default router;
