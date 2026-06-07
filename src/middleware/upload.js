import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { MAX_UPLOAD_BYTES, ALLOWED_MIME } from '../config.js';
import { jobUploadDir } from '../util/files.js';

// アップロードは jobId 単位のディレクトリへストリーム保存する。
// ここで jobId を先取りし、後段の handler が req.uploadJobId で参照する。
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const jobId = crypto.randomUUID();
    req.uploadJobId = jobId;
    const dir = jobUploadDir(jobId);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(req, file, cb) {
    cb(null, `source${getExt(file.originalname)}`);
  },
});

function getExt(name) {
  const m = /(\.[A-Za-z0-9]{1,8})$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.includes((file.mimetype || '').toLowerCase())) {
    cb(null, true);
  } else {
    const err = new Error(`未対応の形式です: ${file.mimetype}`);
    err.code = 'UNSUPPORTED_TYPE';
    cb(err, false);
  }
}

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
}).single('media');
