import express from 'express';
import cookieParser from 'cookie-parser';
import { HOST, PORT, SESSION_SECRET, PUBLIC_DIR } from './config.js';
import { sessionMiddleware } from './middleware/session.js';
import mediaRouter from './routes/media.js';
import { ensureDirs, wipeWorkDirs } from './util/files.js';
import { startReaper, stopReaper, purgeAll } from './util/reaper.js';

// 起動時：作業ディレクトリを用意し、前回の残骸を一掃する。
ensureDirs();
wipeWorkDirs();

const app = express();
app.disable('x-powered-by');
app.use(cookieParser(SESSION_SECRET));
app.use(express.json());
app.use(sessionMiddleware);

app.use('/api', mediaRouter);
app.use(express.static(PUBLIC_DIR));

// JSON エラーハンドラ
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'サーバー内部エラーが発生しました。' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Discord Media Composer listening on http://${HOST}:${PORT}`);
  startReaper();
});

// 終了時：reaper 停止、全 ffmpeg を kill、一時ファイルを掃除。
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);
  stopReaper();
  await purgeAll().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
