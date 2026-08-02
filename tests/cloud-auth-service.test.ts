import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  setPersistence: vi.fn(),
  signInAnonymously: vi.fn(),
  linkWithPopup: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithCredential: vi.fn(),
  credentialFromError: vi.fn(),
  emailCredential: vi.fn(),
  linkWithCredential: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: { kind: "local" },
  EmailAuthProvider: { credential: authMocks.emailCredential },
  GoogleAuthProvider: class {
    public static credentialFromError = authMocks.credentialFromError;
  },
  createUserWithEmailAndPassword: authMocks.createUserWithEmailAndPassword,
  deleteUser: vi.fn(),
  linkWithCredential: authMocks.linkWithCredential,
  linkWithPopup: authMocks.linkWithPopup,
  onIdTokenChanged: vi.fn(),
  sendEmailVerification: authMocks.sendEmailVerification,
  sendPasswordResetEmail: vi.fn(),
  setPersistence: authMocks.setPersistence,
  signInAnonymously: authMocks.signInAnonymously,
  signInWithCredential: authMocks.signInWithCredential,
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: authMocks.signInWithPopup,
  signOut: vi.fn(),
}));

import {
  CloudAuthService,
  guestDisplayName,
} from "../src/services/cloud-auth-service";
import type { FirebaseClient } from "../src/services/firebase-client";

function firebaseUser(isAnonymous: boolean, email: string | null = null) {
  return {
    uid: "guest-uid",
    email,
    displayName: null,
    emailVerified: !isAnonymous,
    isAnonymous,
  };
}

function harness(currentUser: ReturnType<typeof firebaseUser> | null = null) {
  const auth = { currentUser };
  const firebase = {
    enabled: true,
    auth: () => auth,
  } as unknown as FirebaseClient;
  return { auth, service: new CloudAuthService(firebase) };
}

beforeEach(() => vi.clearAllMocks());

describe("cloud authentication", () => {
  it("creates a persistent anonymous identity without exposing an account", async () => {
    const { service } = harness();
    authMocks.signInAnonymously.mockResolvedValue({ user: firebaseUser(true) });

    await expect(service.ensureAnonymousUser()).resolves.toEqual(
      expect.objectContaining({
        uid: "guest-uid",
        displayName: guestDisplayName("guest-uid"),
        isAnonymous: true,
      }),
    );
    expect(authMocks.setPersistence).toHaveBeenCalledOnce();
    expect(authMocks.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("derives a stable and explicitly guest-labeled collaboration name", () => {
    const name = guestDisplayName("persistent-anonymous-uid");
    expect(name).toMatch(/^Guest [A-Z][a-z]+ [A-Z][a-z]+ \d{3}$/);
    expect(guestDisplayName("persistent-anonymous-uid")).toBe(name);
    expect(guestDisplayName("different-anonymous-uid")).not.toBe(name);
  });

  it("links a new Google account to the anonymous collaboration identity", async () => {
    const { service } = harness(firebaseUser(true));
    authMocks.linkWithPopup.mockResolvedValue({
      user: firebaseUser(false, "editor@example.test"),
    });

    await expect(service.signInGoogle()).resolves.toEqual(
      expect.objectContaining({
        uid: "guest-uid",
        email: "editor@example.test",
        isAnonymous: false,
      }),
    );
    expect(authMocks.linkWithPopup).toHaveBeenCalledOnce();
    expect(authMocks.signInWithPopup).not.toHaveBeenCalled();
  });

  it("switches to an existing Google account when credentials are already linked", async () => {
    const { service } = harness(firebaseUser(true));
    const error = { code: "auth/credential-already-in-use" };
    const credential = { providerId: "google.com" };
    authMocks.linkWithPopup.mockRejectedValue(error);
    authMocks.credentialFromError.mockReturnValue(credential);
    authMocks.signInWithCredential.mockResolvedValue({
      user: { ...firebaseUser(false, "existing@example.test"), uid: "existing-uid" },
    });

    await expect(service.signInGoogle()).resolves.toEqual(
      expect.objectContaining({ uid: "existing-uid", isAnonymous: false }),
    );
    expect(authMocks.signInWithCredential).toHaveBeenCalledWith(
      expect.any(Object),
      credential,
    );
  });

  it("links a new email account and sends its verification message", async () => {
    const { service } = harness(firebaseUser(true));
    const credential = { providerId: "password" };
    authMocks.emailCredential.mockReturnValue(credential);
    authMocks.linkWithCredential.mockResolvedValue({
      user: firebaseUser(false, "new@example.test"),
    });

    await service.signUpEmail(" new@example.test ", "password");
    expect(authMocks.emailCredential).toHaveBeenCalledWith(
      "new@example.test",
      "password",
    );
    expect(authMocks.linkWithCredential).toHaveBeenCalledWith(
      expect.any(Object),
      credential,
    );
    expect(authMocks.sendEmailVerification).toHaveBeenCalledOnce();
  });
});
