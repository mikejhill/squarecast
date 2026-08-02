import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { z } from "zod";

const firebaseConfigSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().optional(),
  messagingSenderId: z.string().optional(),
  appId: z.string().min(1),
});

/** Public Firebase browser configuration read from Vite build variables. */
export type SquarecastFirebaseConfig = z.infer<typeof firebaseConfigSchema>;

/**
 * Lazily constructs the managed Firebase clients. Missing configuration keeps
 * URL and device storage fully operational without making remote requests.
 */
export class FirebaseClient {
  private app: FirebaseApp | null = null;
  private authClient: Auth | null = null;
  private firestoreClient: Firestore | null = null;
  private appCheckClient: AppCheck | null = null;

  public readonly config: SquarecastFirebaseConfig | null;

  public constructor() {
    const candidate = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    const parsed = firebaseConfigSchema.safeParse(candidate);
    this.config = parsed.success ? parsed.data : null;
  }

  public get enabled(): boolean {
    return this.config !== null;
  }

  public auth(): Auth {
    if (!this.authClient) this.authClient = getAuth(this.application());
    return this.authClient;
  }

  public firestore(): Firestore {
    if (!this.firestoreClient) {
      this.firestoreClient = getFirestore(this.application());
    }
    return this.firestoreClient;
  }

  /** Enables invisible browser attestation only when a production key exists. */
  public initializeAppCheck(): AppCheck | null {
    if (this.appCheckClient) return this.appCheckClient;
    const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
    if (!siteKey || typeof window === "undefined") return null;
    this.appCheckClient = initializeAppCheck(this.application(), {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return this.appCheckClient;
  }

  private application(): FirebaseApp {
    if (!this.config) {
      throw new Error("Cloud storage is not configured for this deployment.");
    }
    if (!this.app) this.app = initializeApp(this.config);
    return this.app;
  }
}
