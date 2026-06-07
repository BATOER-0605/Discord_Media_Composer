import { GRACE_PERIOD_MS, REAPER_INTERVAL_MS } from '../config.js';
import { allSessions, deleteSession } from '../jobs/sessionStore.js';
import { killJob, deleteJob, getJob } from '../jobs/jobStore.js';
import { removeJobFiles } from './files.js';

/**
 * セッションのジョブを「完了を待たず」破棄する。
 * 進行中なら ffmpeg を即 kill し、生・出力ファイルを削除、エントリを消す。
 */
async function purgeSession(session) {
  for (const jobId of session.jobIds) {
    killJob(jobId);
    await removeJobFiles(jobId);
    deleteJob(jobId);
  }
  deleteSession(session.id);
}

/** 猶予期間を過ぎたセッションを 1 周走査して破棄する。 */
export async function sweep(now = Date.now()) {
  const expired = allSessions().filter((s) => now - s.lastSeen > GRACE_PERIOD_MS);
  for (const session of expired) {
    await purgeSession(session);
  }
  return expired.length;
}

let timer = null;

export function startReaper() {
  if (timer) return;
  timer = setInterval(() => {
    sweep().catch((err) => console.error('[reaper] sweep failed:', err));
  }, REAPER_INTERVAL_MS);
  timer.unref?.();
}

export function stopReaper() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** プロセス終了時：全ジョブの ffmpeg を kill しファイルを掃除する。 */
export async function purgeAll() {
  for (const session of allSessions()) {
    for (const jobId of session.jobIds) {
      killJob(jobId);
    }
  }
  // ファイル削除は best-effort
  for (const session of allSessions()) {
    for (const jobId of session.jobIds) {
      if (getJob(jobId)) await removeJobFiles(jobId);
    }
  }
}
