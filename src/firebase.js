import { createRequire } from "module";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const serviceAccount = require("../firebase-config.json");

const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
});

export const db = getFirestore(firebaseApp);
