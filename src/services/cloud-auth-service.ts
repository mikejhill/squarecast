import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import type { FirebaseClient } from "./firebase-client";

export type AuthUser = {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

/** Provides verified Google and email/password identity without UI coupling. */
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
    const result = await signInWithPopup(this.auth(), new GoogleAuthProvider());
    return this.normalize(result.user);
  }

  public async signUpEmail(email: string, password: string): Promise<AuthUser> {
    const result = await createUserWithEmailAndPassword(
      this.auth(),
      email.trim(),
      password,
    );
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
      displayName: user.displayName ?? user.email?.split("@")[0] ?? "Editor",
      emailVerified: user.emailVerified,
    };
  }
}
