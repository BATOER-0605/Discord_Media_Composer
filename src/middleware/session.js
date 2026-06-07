import { getSession, touchSession, createSession } from '../jobs/sessionStore.js';

const COOKIE_NAME = 'sid';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  signed: true,
  maxAge: 1000 * 60 * 60 * 24, // 24h（実際の寿命は猶予期間ベースの reaper が管理）
};

/**
 * 署名付き Cookie でセッションを確立/更新する。
 * 全リクエストで lastSeen を更新し、これがハートビートを兼ねる。
 * req.session に解決済みセッションを載せる。
 */
export function sessionMiddleware(req, res, next) {
  const sid = req.signedCookies?.[COOKIE_NAME];
  let session = getSession(sid);

  if (session) {
    session.lastSeen = Date.now();
  } else {
    // Cookie が無い / 失効済み（reaper が破棄した等）→ 新規発行
    session = sid ? touchSession(sid) : createSession();
    res.cookie(COOKIE_NAME, session.id, COOKIE_OPTS);
  }

  req.session = session;
  next();
}
