import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD6C5Ov-kUAKATCEhw0kfLkxIsJaVkHIKk",
  authDomain: "therapy-app-c6b6a.firebaseapp.com",
  projectId: "therapy-app-c6b6a",
  storageBucket: "therapy-app-c6b6a.firebasestorage.app",
  messagingSenderId: "944804180331",
  appId: "1:944804180331:web:7881b95a60d2abd5b3dc2e",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const initializeAuth = FirebaseAuth.initializeAuth;
const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence as
  | ((storage: typeof AsyncStorage) => any)
  | undefined;

export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
export const auth = getReactNativePersistence
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : FirebaseAuth.getAuth(app);
export const storage = getStorage(app);

export default app;
