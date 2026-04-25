import { useEffect, useRef } from 'react';

/**
 * Client-side session timeout enforcement.
 *
 * Supabase's dashboard "inactivity timeout" / "max session length" settings
 * only revoke refresh tokens server-side — they do not actively kick a logged-in
 * tab. This hook fills that gap by:
 *
 *   1. Tracking user activity (mouse / keyboard / touch / focus) and storing
 *      `vettale_last_activity` in localStorage (throttled to once per minute).
 *   2. Recording `vettale_session_start` on the first activity tick after sign-in.
 *   3. On a 60s interval, checking both limits and calling onTimeout() if
 *      either is exceeded.
 *
 * Limits are role-driven:
 *   - admin:  24h inactivity   /  7d max session
 *   - other:  30d inactivity   / 90d max session
 *
 * Both timestamps live in localStorage so they survive page reloads and are
 * shared across tabs (each tab sees the most-recent activity from any tab).
 */

const LAST_ACTIVITY_KEY = 'vettale_last_activity';
const SESSION_START_KEY = 'vettale_session_start';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000; // 1 min — avoid hammering localStorage
const CHECK_INTERVAL_MS = 60 * 1000;          // check limits every 1 min

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'focus'] as const;

interface Limits {
  inactivityMs: number;
  maxSessionMs: number;
}

const limitsForRole = (isAdmin: boolean): Limits =>
  isAdmin
    ? { inactivityMs: 24 * MS_HOUR, maxSessionMs: 7 * MS_DAY }
    : { inactivityMs: 30 * MS_DAY, maxSessionMs: 90 * MS_DAY };

interface Options {
  enabled: boolean;
  isAdmin: boolean;
  onTimeout: (reason: 'inactivity' | 'max_session') => void;
}

export const useSessionTimeout = ({ enabled, isAdmin, onTimeout }: Options) => {
  const lastWriteRef = useRef(0);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) return;

    const limits = limitsForRole(isAdmin);

    // Initialize session start if missing (first tick after a fresh sign-in).
    try {
      if (!localStorage.getItem(SESSION_START_KEY)) {
        localStorage.setItem(SESSION_START_KEY, String(Date.now()));
      }
      // Touch activity once on mount so we never start "stale".
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      lastWriteRef.current = Date.now();
    } catch {}

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(now)); } catch {}
    };

    const checkLimits = () => {
      try {
        const now = Date.now();
        const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
        const sessionStartRaw = localStorage.getItem(SESSION_START_KEY);
        const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : now;
        const sessionStart = sessionStartRaw ? Number(sessionStartRaw) : now;

        if (now - lastActivity > limits.inactivityMs) {
          console.warn('⏱️ [SESSION_TIMEOUT] Inactivity limit exceeded — signing out');
          onTimeoutRef.current('inactivity');
          return;
        }
        if (now - sessionStart > limits.maxSessionMs) {
          console.warn('⏱️ [SESSION_TIMEOUT] Max session length exceeded — signing out');
          onTimeoutRef.current('max_session');
          return;
        }
      } catch {}
    };

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });
    const intervalId = window.setInterval(checkLimits, CHECK_INTERVAL_MS);
    // Run once immediately so a returning user past the limit logs out fast.
    checkLimits();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, recordActivity);
      });
      window.clearInterval(intervalId);
    };
  }, [enabled, isAdmin]);
};

export const clearSessionTimers = () => {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(SESSION_START_KEY);
  } catch {}
};
