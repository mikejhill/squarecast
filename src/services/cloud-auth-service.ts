import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type AuthError,
  type User,
} from "firebase/auth";
import type { FirebaseClient } from "./firebase-client";

export type AuthUser = {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  isAnonymous: boolean;
};

const guestAdjectives = [
  "Brisk",
  "Clever",
  "Cosmic",
  "Dapper",
  "Fuzzy",
  "Jolly",
  "Lucky",
  "Merry",
  "Nimble",
  "Plucky",
  "Quirky",
  "Sunny",
] as const;

const guestCreatures = [
  "Badger",
  "Capybara",
  "Gecko",
  "Hedgehog",
  "Mantis",
  "Narwhal",
  "Otter",
  "Panda",
  "Penguin",
  "Raccoon",
  "Wombat",
  "Yak",
] as const;

/** Produces a stable, recognizable collaboration alias without storing profile data. */
export function guestDisplayName(uid: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < uid.length; index += 1) {
    hash ^= uid.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const value = hash >>> 0;
  const adjective = guestAdjectives[value % guestAdjectives.length];
  const creature = guestCreatures[(value >>> 8) % guestCreatures.length];
  const suffix = 100 + ((value >>> 16) % 900);
  return `Guest ${adjective} ${creature} ${suffix}`;
}

/** Provides account and transparent anonymous collaboration identity without UI coupling. */
export class CloudAuthService {
  private authClient: Auth | null = null;

  public constructor(private readonly firebase: FirebaseClient) {}

  public get enabled(): boolean {
    return this.firebase.enabled;
  }

  public get currentUser(): AuthUser | null {
    return this.authClient?.currentUser
      ? this.normalize(this.authClient.currentUser)
      : null;
  }

  public subscribe(listener: (user: AuthUser | null) => void): () => void {
    if (!this.enabled) {
      listener(null);
      return () => undefined;
    }
    const auth = this.auth();
    void setPersistence(auth, browserLocalPersistence);
    return onIdTokenChanged(auth, (user) => listener(user ? this.normalize(user) : null));
  }

  public async signInGoogle(): Promise<AuthUser> {
    const auth = this.auth();
    const provider = new GoogleAuthProvider();
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      try {
        return this.normalize((await linkWithPopup(current, provider)).user);
      } catch (error) {
        const credential = GoogleAuthProvider.credentialFromError(error as AuthError);
        if (!credential || !this.isCredentialInUse(error)) throw error;
        return this.normalize((await signInWithCredential(auth, credential)).user);
      }
    }
    const result = await signInWithPopup(auth, provider);
    return this.normalize(result.user);
  }

  public async signUpEmail(email: string, password: string): Promise<AuthUser> {
    const auth = this.auth();
    const normalizedEmail = email.trim();
    const result = auth.currentUser?.isAnonymous
      ? await linkWithCredential(
          auth.currentUser,
          EmailAuthProvider.credential(normalizedEmail, password),
        )
      : await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    await sendEmailVerification(result.user);
    return this.normalize(result.user);
  }

  public async signInEmail(email: string, password: string): Promise<AuthUser> {
    const result = await signInWithEmailAndPassword(
      this.auth(),
      email.trim(),
      password,
    );
    return this.normalize(result.user);
  }

  public async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth(), email.trim());
  }

  /** Creates a persistent, non-interactive identity for bearer editor links. */
  public async ensureAnonymousUser(): Promise<AuthUser> {
    const auth = this.auth();
    if (auth.currentUser) return this.normalize(auth.currentUser);
    await setPersistence(auth, browserLocalPersistence);
    return this.normalize((await signInAnonymously(auth)).user);
  }

  public async resendVerification(): Promise<void> {
    const user = this.auth().currentUser;
    if (!user) throw new Error("Sign in before requesting verification.");
    await sendEmailVerification(user);
  }

  public async refreshCurrentUser(): Promise<AuthUser | null> {
    const user = this.auth().currentUser;
    if (!user) return null;
    await user.reload();
    await user.getIdToken(true);
    return this.normalize(user);
  }

  public async signOut(): Promise<void> {
    await signOut(this.auth());
  }

  public async deleteCurrentAccount(): Promise<void> {
    const user = this.auth().currentUser;
    if (!user) throw new Error("No account is signed in.");
    await deleteUser(user);
  }

  private auth(): Auth {
    this.authClient ??= this.firebase.auth();
    return this.authClient;
  }

  private normalize(user: User): AuthUser {
    return {
      uid: user.uid,
      email: user.email ?? "",
      displayName:
        user.displayName ??
        user.email?.split("@")[0] ??
        (user.isAnonymous ? guestDisplayName(user.uid) : "Editor"),
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous,
    };
  }

  private isCredentialInUse(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("code" in error)) return false;
    const code = (error as { code?: unknown }).code;
    return code === "auth/credential-already-in-use" || code === "auth/email-already-in-use";
  }
}
