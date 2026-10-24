/**
 * firebaseErrorMap.js
 * {{APP_NAME}} — Firebase Auth Error Sanitizer
 *
 * USAGE:
 *   import { getFriendlyAuthError } from './firebaseErrorMap';
 *   ...
 *   catch (err) {
 *     console.error('[Auth Error - raw]:', err.code, err.message); // keep raw in console only
 *     setError(getFriendlyAuthError(err));
 *   }
 *
 * RULE: Raw Firebase error strings (e.g. "Firebase: Error (auth/invalid-credential)")
 *       MUST NEVER appear in the UI. This map is the only source of user-facing messages.
 */

const AUTH_ERROR_MAP = {
  // ── Credentials ──────────────────────────────────────────────
  'auth/invalid-credential':
    'The email or password entered is incorrect. Please check and try again.',
  'auth/wrong-password':
    'Incorrect password. Please try again.',
  'auth/user-not-found':
    'No account found with that email address. Check the spelling or create a new account.',
  'auth/invalid-email':
    'Please enter a valid email address.',
  'auth/user-disabled':
    'This account has been disabled. Contact support for help.',

  // ── Sign-up ───────────────────────────────────────────────────
  // Displayed as inline red text under the email field, NOT a modal.
  // "Sign in instead" should render as a clickable link that switches
  // to the Sign-In view. See references/auth-ui-guide.md → Sign-Up View.
  'auth/email-already-in-use':
    'This email is already linked to an account. Sign in instead.',
  'auth/weak-password':
    'Password is too weak. Use at least 8 characters, mixing letters and numbers.',
  'auth/operation-not-allowed':
    'This sign-in method is currently not enabled. Contact support.',

  // ── Google / OAuth ────────────────────────────────────────────
  'auth/popup-closed-by-user':
    'The sign-in window was closed before completing. Please try again.',
  'auth/cancelled-popup-request':
    'The sign-in was cancelled. Please try again.',
  'auth/popup-blocked':
    'The sign-in popup was blocked by your browser. Allow popups for this site and try again.',
  'auth/account-exists-with-different-credential':
    'An account already exists with that email but using a different sign-in method. Try signing in with email/password, or use Google.',

  // ── Rate limits / Security ────────────────────────────────────
  'auth/too-many-requests':
    'Too many failed attempts. Please wait a few minutes before trying again.',
  'auth/requires-recent-login':
    'For security reasons, please sign out and sign back in to continue.',

  // ── Network ───────────────────────────────────────────────────
  'auth/network-request-failed':
    'Network error. Check your internet connection and try again.',

  // ── Token / Session ───────────────────────────────────────────
  'auth/user-token-expired':
    'Your session has expired. Please sign in again.',
  'auth/invalid-user-token':
    'Your session is no longer valid. Please sign in again.',
  'auth/id-token-expired':
    'Session expired. Please sign in again.',

  // ── Misc ──────────────────────────────────────────────────────
  'auth/internal-error':
    'An unexpected error occurred. Please try again.',
  'auth/timeout':
    'The request timed out. Check your connection and try again.',
};

/**
 * Returns a clean, user-readable error message from a Firebase Auth error.
 * Falls back to a generic message if the code is not mapped.
 *
 * @param {Error|{code?: string, message?: string}} error — The caught Firebase error object
 * @returns {string} User-facing message (no Firebase jargon)
 */
export function getFriendlyAuthError(error) {
  if (!error) return 'Something went wrong. Please try again.';

  // Extract the error code — Firebase Auth errors always have a .code property
  const code = error.code || '';

  if (AUTH_ERROR_MAP[code]) {
    return AUTH_ERROR_MAP[code];
  }

  // Last-resort fallback — never expose raw Firebase error text
  console.warn('[Auth] Unmapped error code:', code, '|', error.message);
  return 'Something went wrong. Please try again.';
}

/**
 * Quick check: does this error code map to a known message?
 * Useful in tests.
 */
export function isKnownAuthError(code) {
  return Object.prototype.hasOwnProperty.call(AUTH_ERROR_MAP, code);
}
