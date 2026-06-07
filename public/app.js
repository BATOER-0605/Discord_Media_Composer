const $ = (id) => document.getElementById(id);

const form = $('form');
const fileInput = $('file');
const picker = $('picker');
const pickerText = picker.querySelector('.picker-text');
const fileMeta = $('filemeta');
const submitBtn = $('submit');
const progressWrap = $('progressWrap');
const statusEl = $('status');
const bar = $('bar');
const pctEl = $('pct');
const resultEl = $('result');
const resultMsg = $('resultMsg');
const downloadLink = $('download');
const againBtn = $('again');
const errorEl = $('error');
const leadEl = $('lead');

let pollTimer = null;
let heartbeatTimer = null;
let targetMB = 9.5;

const fmtMB = (bytes) => (bytes / (1000 * 1000)).toFixed(2) + ' MB';

// 設定取得（目標サイズなどの表示用）
fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    targetMB = cfg.targetMB;
    leadEl.textContent = `動画・写真を ${cfg.targetMB}MB 以下に圧縮します（最大 ${cfg.maxUploadMB}MB）。`;
  })
  .catch(() => {});

// アイドル時もセッションを延命する
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
  }, 15000);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}
startHeartbeat();

fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (!f) {
    submitBtn.disabled = true;
    fileMeta.hidden = true;
    picker.classList.remove('has-file');
    return;
  }
  picker.classList.add('has-file');
  pickerText.textContent = 'ファイルを変更';
  fileMeta.hidden = false;
  fileMeta.textContent = `${f.name}（${fmtMB(f.size)}）`;
  submitBtn.disabled = false;
  hide(errorEl);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = fileInput.files[0];
  if (!f) return;
  upload(f);
});

againBtn.addEventListener('click', () => {
  resetUI();
});

function upload(file) {
  hide(errorEl);
  hide(resultEl);
  form.hidden = true;
  progressWrap.hidden = false;
  setProgress(0, 'アップロード中…');

  const fd = new FormData();
  fd.append('media', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');

  // アップロード進捗を 0–50% に割り当てる
  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) {
      const ratio = ev.loaded / ev.total;
      setProgress(Math.round(ratio * 50), 'アップロード中…');
    }
  };

  xhr.onload = () => {
    let data = {};
    try {
      data = JSON.parse(xhr.responseText);
    } catch {
      /* noop */
    }
    if (xhr.status === 202 && data.jobId) {
      setProgress(50, '圧縮を開始しています…');
      poll(data.jobId);
    } else {
      fail(data.error || `アップロードに失敗しました（${xhr.status}）。`);
    }
  };

  xhr.onerror = () => fail('ネットワークエラーが発生しました。');
  xhr.send(fd);
}

function poll(jobId) {
  stopPoll();
  pollTimer = setInterval(async () => {
    try {
      const r = await fetch(`/api/status/${jobId}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        return fail(d.error || `状態の取得に失敗しました（${r.status}）。`);
      }
      const s = await r.json();
      if (s.status === 'error') {
        return fail(s.error || '圧縮に失敗しました。');
      }
      // サーバー進捗(0–100) を 50–100% に対応させる
      const overall = 50 + Math.round((s.progress || 0) * 0.5);
      setProgress(
        Math.min(overall, s.status === 'done' ? 100 : 99),
        s.status === 'processing' ? '圧縮中…' : '待機中…',
      );
      if (s.status === 'done') {
        stopPoll();
        succeed(jobId, s);
      }
    } catch {
      // 一時的な失敗はポーリング継続
    }
  }, 3000);
}

function succeed(jobId, s) {
  setProgress(100, '完了');
  progressWrap.hidden = true;
  resultEl.hidden = false;
  const saved =
    s.originalSize && s.compressedSize
      ? Math.max(0, Math.round((1 - s.compressedSize / s.originalSize) * 100))
      : null;
  resultMsg.innerHTML =
    `<strong>${fmtMB(s.compressedSize)}</strong> に圧縮しました` +
    (s.originalSize ? `（元: ${fmtMB(s.originalSize)}` : '') +
    (saved !== null ? ` / -${saved}%）` : s.originalSize ? '）' : '') +
    '<br>ダウンロードして Discord に共有してください。';
  downloadLink.href = `/api/download/${jobId}`;
  if (s.filename) downloadLink.setAttribute('download', s.filename);
}

function fail(message) {
  stopPoll();
  progressWrap.hidden = true;
  form.hidden = false;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function resetUI() {
  stopPoll();
  fileInput.value = '';
  submitBtn.disabled = true;
  picker.classList.remove('has-file');
  pickerText.textContent = 'タップして写真・動画を選択';
  fileMeta.hidden = true;
  hide(resultEl);
  hide(errorEl);
  progressWrap.hidden = true;
  form.hidden = false;
}

function setProgress(value, label) {
  bar.value = value;
  pctEl.textContent = `${value}%`;
  if (label) statusEl.textContent = label;
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function hide(el) {
  el.hidden = true;
}
