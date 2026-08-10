// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8nGEaOG7yRVZv_lBbWny3Zty03bbLwxE",
  authDomain: "shhahd-3ada6.firebaseapp.com",
  databaseURL: "https://shhahd-3ada6-default-rtdb.firebaseio.com",
  projectId: "shhahd-3ada6",
  storageBucket: "shhahd-3ada6.firebasestorage.app",
  messagingSenderId: "26278228643",
  appId: "1:26278228643:web:62ea9854b1f250d7b84516"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

export { db, ref, push, set, onValue, remove, storage, storageRef, uploadBytes, getDownloadURL };
