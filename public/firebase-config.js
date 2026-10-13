// Config Firebase untuk fitur "patungan bareng".
// Ambil dari Firebase Console → ⚙ Project settings → General → Your apps → Web app → SDK setup and configuration → Config.
// Nilai ini memang boleh ada di kode website (bukan rahasia). Keamanannya diatur lewat Firestore Rules.
window.FIREBASE_CONFIG = {
  apiKey: "ISI_API_KEY",
  authDomain: "ISI_PROJECT_ID.firebaseapp.com",
  projectId: "ISI_PROJECT_ID",
  storageBucket: "ISI_PROJECT_ID.appspot.com",
  messagingSenderId: "ISI_SENDER_ID",
  appId: "ISI_APP_ID"
};
