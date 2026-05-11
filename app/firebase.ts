import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCt8YU58aCrIxGwLG8DFw6KIkZkO_W86EA",
  authDomain: "system-maker-e5295.firebaseapp.com",
  projectId: "system-maker-e5295",
  storageBucket: "system-maker-e5295.firebasestorage.app",
  messagingSenderId: "1033724339791",
  appId: "1:1033724339791:web:8f11ab122a530c76dd6c3a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/calendar");
googleProvider.addScope("https://www.googleapis.com/auth/tasks");
googleProvider.setCustomParameters({ include_granted_scopes: "true" });

export const calendarProvider = new GoogleAuthProvider();
calendarProvider.addScope("https://www.googleapis.com/auth/calendar");
calendarProvider.addScope("https://www.googleapis.com/auth/tasks");
calendarProvider.setCustomParameters({ include_granted_scopes: "true" });
