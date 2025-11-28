import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';


// TODO: Replace the following config with your actual Firebase project configuration
// You can find this in Firebase Console -> Project Settings -> General -> Your apps
const firebaseConfig = {
  apiKey: "AIzaSyCrDd9FpyrIO-mVzMwD3fWdYLoBgqs_5Dk",
  authDomain: "classroom-booking-e06e6.firebaseapp.com",
  projectId: "classroom-booking-e06e6",
  storageBucket: "classroom-booking-e06e6.firebasestorage.app",
  messagingSenderId: "1385817150",
  appId: "1:1385817150:web:b2b890c8e721c3468add6f",
  measurementId: "G-ZX85KHS05J"
};

// Initialize Firebase safely
// We check if any apps are already initialized to prevent "App named '[DEFAULT]' already exists" errors
const app = firebase.apps.length > 0 ? firebase.app() : firebase.initializeApp(firebaseConfig);

// Initialize Services
// Using the static methods ensures we get the service attached to the default app instance
// which is safer when bridging modules and global scripts.
export const db = firebase.firestore();
export const auth = firebase.auth();
export const googleProvider = new firebase.auth.GoogleAuthProvider();
