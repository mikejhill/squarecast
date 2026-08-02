import { useState, type FormEvent } from "react";
import { LogOut, Mail, ShieldCheck, Trash2 } from "lucide-react";
import type { CloudAuthService, AuthUser } from "../services/cloud-auth-service";
import { Modal } from "./Modal";

type AuthDialogProps = {
  service: CloudAuthService;
  user: AuthUser | null;
  onClose: () => void;
  onSignedOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
};

/** Provides Google/email identity and explicit account lifecycle controls. */
export function AuthDialog({
  service,
  user,
  onClose,
  onSignedOut,
  onDeleteAccount,
}: AuthDialogProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (action: () => Promise<unknown>, success = "") => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account action failed.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      () =>
        mode === "signin"
          ? service.signInEmail(email, password)
          : service.signUpEmail(email, password),
      mode === "signup" ? "Verification email sent." : "Signed in.",
    );
  };

  return (
    <Modal title={user ? "Account" : "Sign In"} onClose={onClose}>
      {user ? (
        <div className="account-panel">
          <div className="account-identity">
            <ShieldCheck size={24} />
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.email}</span>
              <small>{user.emailVerified ? "Verified" : "Verification required"}</small>
            </div>
          </div>
          {!user.emailVerified && (
            <div className="account-verification-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void run(() => service.refreshCurrentUser(), "Verification status refreshed.")}
              >
                <ShieldCheck size={16} /> I Verified My Email
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void run(() => service.resendVerification(), "Verification email sent.")}
              >
                <Mail size={16} /> Resend Verification
              </button>
            </div>
          )}
          <div className="account-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void run(onSignedOut)}
            >
              <LogOut size={16} /> Sign Out
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                className="danger-button"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} /> Delete Account
              </button>
            ) : (
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={() => void run(onDeleteAccount)}
              >
                Delete Boards And Account
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {!service.enabled && (
            <p className="form-error" role="alert">
              Cloud storage is not configured for this deployment.
            </p>
          )}
          <button
            type="button"
            className="google-signin-button"
            disabled={busy || !service.enabled}
            onClick={() => void run(() => service.signInGoogle(), "Signed in.")}
          >
            Sign In With Google
          </button>
          <div className="auth-divider"><span>or</span></div>
          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button type="submit" className="primary-button" disabled={busy || !service.enabled}>
              {mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
          <div className="auth-secondary-actions">
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create Account" : "Use Existing Account"}
            </button>
            <button
              type="button"
              disabled={!email || busy}
              onClick={() => void run(() => service.resetPassword(email), "Password reset email sent.")}
            >
              Reset Password
            </button>
          </div>
        </>
      )}
      {message && <p className="account-message" role="status">{message}</p>}
    </Modal>
  );
}
