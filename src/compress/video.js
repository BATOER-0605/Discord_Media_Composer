import path from 'node:path';
import ffmpeg, { probe } from './ffmpeg.js';
import {
  TARGET_BYTES,
  AUDIO_BITRATE_K,
  MIN_VIDEO_BITRATE_K,
  X264_PRESET,
} from '../config.js';
import { fileSize } from '../util/files.js';

const HEIGHT_LADDER = [1080, 720, 480, 360];
// 360p でも実用に耐える最低ビットレート。これを割るなら圧縮不能と判断する。
const ABSOLUTE_MIN_VIDEO_K = 100;
// 2-pass VBR / mux 分の余裕を見込む安全係数。
const SAFETY_FACTOR = 0.94;

/** ジョブで利用できないほど長尺なケースを表すエラー。 */
export class InfeasibleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InfeasibleError';
    this.userMessage = message;
  }
}

function analyze(metadata) {
  const format = metadata.format || {};
  const streams = metadata.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const duration = Number(format.duration) || Number(videoStream?.duration) || 0;
  const height = Number(videoStream?.height) || 0;
  const width = Number(videoStream?.width) || 0;
  return { duration, hasAudio, height, width };
}

/**
 * 目標サイズに収まる動画ビットレート(kbps)と出力高さを決める。
 * 計算が低ビットレートになりすぎる場合は解像度を段階的に下げる。
 */
function planEncoding({ duration, hasAudio, height }, targetBytes) {
  const audioK = hasAudio ? AUDIO_BITRATE_K : 0;
  const targetTotalBps = (targetBytes * 8) / duration;
  const videoBps = (targetTotalBps - audioK * 1000) * SAFETY_FACTOR;
  const videoK = Math.floor(videoBps / 1000);

  if (videoK < ABSOLUTE_MIN_VIDEO_K) {
    const maxSeconds = Math.floor(
      (targetBytes * 8) /
        (((ABSOLUTE_MIN_VIDEO_K + audioK) * 1000) / SAFETY_FACTOR),
    );
    throw new InfeasibleError(
      `この動画は長すぎて目標サイズまで圧縮できません。約 ${Math.max(1, Math.floor(maxSeconds / 1))} 秒以内にトリミングしてからお試しください。`,
    );
  }

  // 元解像度以下で、ビットレートが最低基準を満たす最大の高さを選ぶ。
  const sourceHeight = height || HEIGHT_LADDER[0];
  let chosenHeight = null;
  for (const h of HEIGHT_LADDER) {
    if (h > sourceHeight) continue;
    if (videoK >= MIN_VIDEO_BITRATE_K) {
      chosenHeight = h;
      break;
    }
  }
  // どの段でも基準未満なら最低解像度まで落として受け入れる。
  if (chosenHeight === null) {
    const candidates = HEIGHT_LADDER.filter((h) => h <= sourceHeight);
    chosenHeight = candidates.length ? candidates[candidates.length - 1] : 360;
  }

  return { videoK, audioK, height: chosenHeight, hasAudio };
}

/**
 * 2-pass で 1 回エンコードする。生成した ffmpeg コマンドを registerCommand で
 * 呼び出し側に渡し、外部から kill できるようにする。
 */
function runTwoPass({
  inputPath,
  outputPath,
  passLogFile,
  plan,
  onProgress,
  registerCommand,
}) {
  const { videoK, audioK, height, hasAudio } = plan;
  const scaleFilter = `scale=-2:${height}`;

  const runPass = (pass) =>
    new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath)
        .videoCodec('libx264')
        .videoBitrate(videoK)
        .addOption('-preset', X264_PRESET)
        .addOption('-pass', String(pass))
        .addOption('-passlogfile', passLogFile)
        .videoFilters(scaleFilter);

      if (pass === 1) {
        cmd.noAudio().format('mp4').output('/dev/null');
      } else {
        if (hasAudio) {
          cmd.audioCodec('aac').audioBitrate(audioK);
        } else {
          cmd.noAudio();
        }
        cmd.addOption('-movflags', '+faststart').format('mp4').output(outputPath);
      }

      registerCommand(cmd);

      cmd
        .on('progress', (p) => {
          // pass1: 0-40%, pass2: 40-100%
          const ratio = Math.min(1, (p.percent || 0) / 100);
          const overall = pass === 1 ? ratio * 40 : 40 + ratio * 60;
          onProgress(Math.round(overall));
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

  return runPass(1).then(() => runPass(2));
}

/**
 * 動画を目標サイズ以下に圧縮する。
 * @returns {Promise<{outputPath: string, size: number}>}
 */
export async function compressVideo({
  inputPath,
  outputDir,
  baseName,
  onProgress = () => {},
  registerCommand = () => {},
}) {
  const metadata = await probe(inputPath);
  const info = analyze(metadata);

  if (!info.duration || info.duration <= 0) {
    throw new Error('動画の長さを取得できませんでした。ファイルが壊れている可能性があります。');
  }

  const outputPath = path.join(outputDir, `${baseName}.mp4`);
  const passLogFile = path.join(outputDir, 'ffmpeg2pass');

  let plan = planEncoding(info, TARGET_BYTES);
  await runTwoPass({ inputPath, outputPath, passLogFile, plan, onProgress, registerCommand });

  let size = await fileSize(outputPath);

  // 目標を超えた場合、実測の超過比からビットレートを再計算して 1 度だけ補正。
  if (size > TARGET_BYTES) {
    const corrected = Math.max(
      ABSOLUTE_MIN_VIDEO_K,
      Math.floor((plan.videoK * TARGET_BYTES) / size * 0.97),
    );
    plan = { ...plan, videoK: corrected };
    onProgress(40);
    await runTwoPass({ inputPath, outputPath, passLogFile, plan, onProgress, registerCommand });
    size = await fileSize(outputPath);
  }

  return { outputPath, size };
}
