// src/lib/firebase.ts
// Central Firebase initialization — imports only what's used (tree-shakeable)

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
} from "firebase/functions";
import {
  getStorage,
  connectStorageEmulator,
} from "firebase/storage";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Prevent duplicate app initialization (React StrictMode / HMR)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const fns     = getFunctions(app);
export const storage = getStorage(app);

// Connect to local emulators in development
const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
const emulatorHost = import.meta.env.VITE_EMULATOR_HOST ?? "localhost";

if (useEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8090);
  connectFunctionsEmulator(fns, emulatorHost, 5001);
  connectStorageEmulator(storage, emulatorHost, 9199);
  console.info("[PeerTutor] Using Firebase Emulators");
}

export default app;
