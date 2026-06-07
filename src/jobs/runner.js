import fs from 'node:fs';
import pLimit from 'p-limit';
import { MAX_CONCURRENT_JOBS } from '../config.js';
import { compress } from '../compress/index.js';
import { updateJob, getJob } from './jobStore.js';
import { jobOutputDir, removeUpload, safeBaseName } from '../util/files.js';
import { InfeasibleError } from '../compress/video.js';

const limit = pLimit(MAX_CONCURRENT_JOBS);

/**
 * ジョブを非同期に処理する。呼び出し側は await しない（裏で実行）。
 */
export function enqueueJob({ jobId, mime, inputPath, originalName }) {
  return limit(async () => {
    const job = getJob(jobId);
    if (!job) return; // 既に破棄済み（セッション終了）

    const outputDir = jobOutputDir(jobId);
    fs.mkdirSync(outputDir, { recursive: true });
    const baseName = `compressed-${stripExt(safeBaseName(originalName))}`;

    updateJob(jobId, { status: 'processing', progress: 0 });

    try {
      const { outputPath, size } = await compress({
        mime,
        inputPath,
        outputDir,
        baseName,
        onProgress: (p) => updateJob(jobId, { progress: p }),
        registerCommand: (cmd) => updateJob(jobId, { ffmpegCmd: cmd }),
      });

      // ジョブが処理中に破棄されていないか確認
      if (!getJob(jobId)) return;

      updateJob(jobId, {
        status: 'done',
        progress: 100,
        outputPath,
        compressedSize: size,
        filename: `${baseName}${outputPath.slice(outputPath.lastIndexOf('.'))}`,
        ffmpegCmd: null,
      });
    } catch (err) {
      if (!getJob(jobId)) return; // 破棄に伴う kill エラーは無視
      const userMessage =
        err instanceof InfeasibleError
          ? err.userMessage
          : err?.message || '圧縮中にエラーが発生しました。';
      updateJob(jobId, { status: 'error', error: userMessage, ffmpegCmd: null });
    } finally {
      // 生ファイルは不要になり次第削除（出力はセッション終了まで保持）
      await removeUpload(jobId).catch(() => {});
    }
  });
}

function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}
