import crypto from 'node:crypto';

/**
 * インメモリのセッション管理。
 * session = { id, lastSeen, jobIds: Set<string> }
 */
const sessions = new Map();

export function createSession() {
  const id = crypto.randomUUID();
  const session = { id, lastSeen: Date.now(), jobIds: new Set() };
  sessions.set(id, session);
  return session;
}

export const getSession = (id) => (id ? sessions.get(id) : undefined);

/** セッションの生存を記録する。存在しなければ作成する。 */
export function touchSession(id) {
  const session = id && sessions.get(id);
  if (session) {
    session.lastSeen = Date.now();
    return session;
  }
  return createSession();
}

export function attachJob(sessionId, jobId) {
  const session = sessions.get(sessionId);
  if (session) session.jobIds.add(jobId);
}

export function deleteSession(id) {
  sessions.delete(id);
}

export const allSessions = () => [...sessions.values()];
