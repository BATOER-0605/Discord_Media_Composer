import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR, OUTPUTS_DIR } from '../config.js';

/** 必要なディレクトリを作成する。 */
export function ensureDirs() {
  for (const dir of [UPLOADS_DIR, OUTPUTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 起動時に旧データを一掃する（前回クラッシュ等の残骸対策）。
 * ディレクトリ自体は削除せず中身だけ消す。
 * （Docker では uploads/outputs は tmpfs のマウントポイントで、
 *  マウント点を rmdir すると EBUSY になるため。）
 */
export function wipeWorkDirs() {
  for (const dir of [UPLOADS_DIR, OUTPUTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
  }
}

export const jobUploadDir = (jobId) => path.join(UPLOADS_DIR, jobId);
export const jobOutputDir = (jobId) => path.join(OUTPUTS_DIR, jobId);

/** ジョブに紐づく全一時ファイル（生・出力）を削除する。 */
export async function removeJobFiles(jobId) {
  await Promise.allSettled([
    fsp.rm(jobUploadDir(jobId), { recursive: true, force: true }),
    fsp.rm(jobOutputDir(jobId), { recursive: true, force: true }),
  ]);
}

/** アップロードされた生ファイルだけを削除する（出力は残す）。 */
export async function removeUpload(jobId) {
  await fsp.rm(jobUploadDir(jobId), { recursive: true, force: true });
}

export async function fileSize(filePath) {
  const stat = await fsp.stat(filePath);
  return stat.size;
}

/** ファイル名をパス区切り等から守る。 */
export function safeBaseName(name) {
  return path
    .basename(name || 'media')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(0, 120) || 'media';
}
