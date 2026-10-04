const admin = require('firebase-admin');
const path = require('path');

// Load Firebase credentials
const serviceAccountPath = process.env.FIREBASE_CREDENTIALS_PATH || './serviceAccountKey.json';
const serviceAccount = require(path.resolve(serviceAccountPath));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };
