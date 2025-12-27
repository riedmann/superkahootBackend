// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBzsTw14bIm0rhQ4sMMKnn2Cki970q-AWM",
  authDomain: "demoteachers.firebaseapp.com",
  projectId: "demoteachers",
  storageBucket: "demoteachers.firebasestorage.app",
  messagingSenderId: "900017013166",
  appId: "1:900017013166:web:5a5836b8f85e79c6c3483f",
  measurementId: "G-BHWC9QZ4L6",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
