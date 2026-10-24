/**
 * authService.js
 * {{APP_NAME}} — Authentication Service
 *
 * Covers:
 *   - Email/Password sign-up  → sends verification link via GAS
 *   - Email/Password sign-in  → blocks unverified users with clear message
 *   - Google sign-in          → no extra verification needed
 *   - Password reset          → branded UX message, no raw Firebase strings
 *   - Sign-out
 *
 * REQUIREMENTS:
 *   - Firebase Auth SDK (modular v9+)
 *   - firebaseErrorMap.js in the same directory
 *   - GAS_WEB_APP_URL set in your environment config
 *
 * SETUP:
 *   Replace {{GAS_WEB_APP_URL}} with your deployed GAS Web App URL, OR
 *   import it from your environment/config file.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

import { auth } from './firebaseConfig'; // adjust path to your Firebase init file
import { getFriendlyAuthError } from './firebaseErrorMap';

// ── Config ────────────────────────────────────────────────────────────────────

const GAS_WEB_APP_URL = '{{GAS_WEB_APP_URL}}'; // TODO: replace or import from env
const APP_NAME        = '{{APP_NAME}}';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * POST to the GAS backend.
 * Non-blocking: never throws — errors are logged and the auth flow continues.
 */
async function postToGAS(action, payload) {
  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!data.success) {
      console.warn(`[GAS ${action}] Non-success response:`, data.error);
    }
    return data;
  } catch (err) {
    console.error(`[GAS ${action}] Network or parse error:`, err);
    return { success: false, error: err.message };
  }
}

// ── Sign-Up (Email / Password) ────────────────────────────────────────────────

/**
 * Creates a new Email/Password account.
 *
 * Returns:
 *   { success: true, message: string }        — account created, verification sent
 *   { success: false, error: string }         — user-facing error message
 *
 * UX expectation:
 *   On success → show: "A verification link has been sent to [email].
 *                        Check your inbox (and spam folder)."
 *   On failure → show the returned error string
 */
export async function signUpWithEmail(email, password, displayName) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const user       = credential.user;

    // Notify GAS — triggers verification email + admin notification
    await postToGAS('user_signup', {
      details: {
        email:       user.email,
        displayName: displayName || '',
        method:      'email',
        uid:         user.uid,
      },
    });

    // VARIANT A (link): sign the user out immediately — they must click the
    // link before doing anything else.
    // VARIANT B (6-digit modal): do NOT sign out here — instead return
    // { pendingVerification: true, uid: user.uid } and let the caller open
    // the blocking modal (see references/auth-ui-guide.md → Verification Modal).
    await signOut(auth);

    return {
      success: true,
      message: `A verification link has been sent to ${email}. Please check your inbox and spam folder.`,
    };
  } catch (err) {
    console.error('[SignUp] Firebase error:', err.code, err.message);
    return { success: false, error: getFriendlyAuthError(err) };
  }
}

// ── Sign-In (Email / Password) ────────────────────────────────────────────────

/**
 * Signs in an existing Email/Password user.
 * Blocks sign-in if the Firestore user document shows emailVerified = false.
 *
 * UX expectation:
 *   On success → redirect to app / update auth state
 *   On unverified → show: "Please verify your email first. Check the link
 *                          sent to [email]. Also check your spam folder."
 *   On failure → show the returned error string
 *
 * NOTE: This checks your Firestore `users/{uid}.emailVerified` field,
 *       NOT Firebase Auth's built-in `user.emailVerified`.
 *       Adjust the Firestore read to match your data model if needed.
 */
export async function signInWithEmail(email, password, checkFirestoreVerification) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user       = credential.user;

    // Optional: check custom Firestore emailVerified flag
    if (typeof checkFirestoreVerification === 'function') {
      const isVerified = await checkFirestoreVerification(user.uid);
      if (!isVerified) {
        await signOut(auth);
        return {
          success:    false,
          unverified: true,
          error:      `Please verify your email first. Check the link sent to ${email}. Also check your spam folder.`,
        };
      }
    }

    return { success: true, user };
  } catch (err) {
    console.error('[SignIn] Firebase error:', err.code, err.message);
    return { success: false, error: getFriendlyAuthError(err) };
  }
}

// ── Google Sign-In ────────────────────────────────────────────────────────────

/**
 * Signs in (or creates an account) using Google OAuth.
 * Google has already verified the email — no extra verification step needed.
 *
 * UX expectation:
 *   On success → check if this is a new user (`result._tokenResponse.isNewUser`)
 *                If new → GAS is notified, welcome email sent
 *                If returning → just proceed
 *   On failure → show the returned error string
 */
export async function signInWithGoogle(isNewUserCallback) {
  const provider = new GoogleAuthProvider();
  try {
    const result  = await signInWithPopup(auth, provider);
    const user    = result.user;

    // Detect first-time sign-in — Firebase sets this on the token response
    const isNew = result._tokenResponse?.isNewUser || false;
    if (isNew) {
      await postToGAS('user_signup', {
        details: {
          email:       user.email,
          displayName: user.displayName || '',
          method:      'google',
          uid:         user.uid,
        },
      });
    }

    if (typeof isNewUserCallback === 'function') {
      isNewUserCallback(isNew);
    }

    return { success: true, user, isNew };
  } catch (err) {
    console.error('[Google SignIn] Firebase error:', err.code, err.message);
    return { success: false, error: getFriendlyAuthError(err) };
  }
}

// ── Email Verification — TWO VARIANTS, pick ONE per project ───────────────────
//
// VARIANT A: tokenized link (user clicks a link in the email, lands on /verify)
// VARIANT B: 6-digit code modal (user stays on the sign-up screen, account
//            already exists in Firestore, a blocking modal asks for the code)
//
// See references/auth-ui-guide.md → "Choosing a verification pattern" for how
// to decide which one a given project uses. Delete the variant you don't need.

// ── VARIANT A: link handler ──
/**
 * Called on the /verify page when the user lands from the verification email.
 * Reads `token` and `email` from URL params, calls GAS verify_email action.
 *
 * UX expectation:
 *   On success → show "Email verified! You can now sign in." + Login button
 *   On failure → show the returned error string
 */
export async function handleVerificationLink(token, email, uid) {
  if (!token || !email || !uid) {
    return { success: false, error: 'This verification link is incomplete or malformed.' };
  }
  const result = await postToGAS('verify_email', { token, email, uid });
  if (result.success) {
    return { success: true, message: 'Email verified! You can now sign in.' };
  }
  return { success: false, error: result.error || 'Verification failed. The link may have expired.' };
}

// ── VARIANT B: 6-digit code modal handlers ──
/**
 * Submits the 6-digit code entered in the verification modal.
 * Call this from the modal's "Verify" button.
 *
 * UX expectation:
 *   On success → close modal, show green notice, redirect to app
 *   On wrong code → inline red text: "Incorrect code. Check your email and try again."
 *   On expired → inline amber text: "This code has expired. Use Resend code to get a new one."
 */
export async function verifyEmailCode(email, uid, code) {
  if (!email || !uid || !code) {
    return { success: false, error: 'Enter the 6-digit code sent to your email.' };
  }
  const result = await postToGAS('verify_email_code', { email, uid, code });
  if (result.success) {
    return { success: true, message: 'Email verified! You\u2019re all set.' };
  }
  return { success: false, error: result.error || 'Incorrect code. Check your email and try again.' };
}

/**
 * Resends the 6-digit code. Call this from the modal's "Resend code" link.
 * Apply a 60s cooldown in the UI before allowing another call.
 */
export async function resendVerificationCode(email, uid) {
  const result = await postToGAS('resend_verification_code', { email, uid });
  if (result.success) {
    return { success: true, message: 'A new code has been sent.' };
  }
  return { success: false, error: result.error || 'Could not resend the code. Try again shortly.' };
}

// ── Forgot Password ───────────────────────────────────────────────────────────

/**
 * Sends a Firebase password reset email.
 *
 * UX expectation:
 *   On success → show inline (NOT a popup/alert):
 *     "A password reset link has been sent to [email].
 *      Also check your spam folder.  [← Back to Login]"
 *   On failure → show the returned error string
 *   Button label: "Send Reset Link"
 *   The form stays on screen — do not navigate away.
 */
export async function requestPasswordReset(email) {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }
  try {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      message: `A password reset link has been sent to ${email}. Also check your spam folder.`,
    };
  } catch (err) {
    console.error('[PasswordReset] Firebase error:', err.code, err.message);

    // Special case: if user doesn't exist, still show the generic "sent" message
    // for security (prevents email enumeration)
    if (err.code === 'auth/user-not-found') {
      return {
        success: true,
        message: `A password reset link has been sent to ${email}. Also check your spam folder.`,
      };
    }
    return { success: false, error: getFriendlyAuthError(err) };
  }
}

// ── Submit Report / Contact Form ──────────────────────────────────────────────

/**
 * Submits a user report or contact form message to GAS.
 * GAS sends an admin notification + auto-reply to the user.
 *
 * @param {object} details — { name, email, message, subject, type }
 *
 * UX expectation:
 *   On success → show: "Your message has been sent. Check your email for confirmation."
 */
export async function submitReport(details) {
  const result = await postToGAS('submit_report', { details });
  if (result.success) {
    return {
      success: true,
      message: 'Your message has been sent. Check your email for a confirmation.',
    };
  }
  return {
    success: false,
    error: 'Failed to send your message. Please try WhatsApp for immediate support.',
  };
}

// ── Sign-Out ──────────────────────────────────────────────────────────────────

/**
 * Signs the current user out.
 * UX expectation: redirect to login/home page after calling this.
 */
export async function logOut() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (err) {
    console.error('[SignOut] Error:', err);
    return { success: false, error: 'Failed to sign out. Please try again.' };
  }
}

// ── Auth State Listener ───────────────────────────────────────────────────────

/**
 * Subscribe to auth state changes.
 * Returns the unsubscribe function.
 *
 * Usage:
 *   const unsub = listenToAuthState((user) => {
 *     if (user) { ...logged in } else { ...logged out }
 *   });
 *   // Call unsub() to stop listening (e.g. on component unmount)
 */
export function listenToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
