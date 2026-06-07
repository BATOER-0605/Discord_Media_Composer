import crypto from 'node:crypto';

/**
 * インメモリのジョブ管理。単一プロセス前提。
 * job = {
 *   id, sessionId, status, progress, mime, originalName, originalSize,
 *   outputPath, compressedSize, filename, error, ffmpegCmd, createdAt
 * }
 */
const jobs = new Map();

export function createJob({ id = crypto.randomUUID(), sessionId, mime, originalName, originalSize }) {
  const job = {
    id,
    sessionId,
    status: 'queued',
    progress: 0,
    mime,
    originalName,
    originalSize,
    outputPath: null,
    compressedSize: null,
    filename: null,
    error: null,
    ffmpegCmd: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export const getJob = (id) => jobs.get(id);

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch);
  return job;
}

export function deleteJob(id) {
  jobs.delete(id);
}

export const allJobs = () => [...jobs.values()];

/** 進行中ジョブの ffmpeg コマンドを停止する（完了を待たない）。 */
export function killJob(id) {
  const job = jobs.get(id);
  if (job?.ffmpegCmd) {
    try {
      job.ffmpegCmd.kill('SIGKILL');
    } catch {
      // 既に終了している場合は無視
    }
    job.ffmpegCmd = null;
  }
}
