import { getAuth } from "firebase-admin/auth";
import { createRequire } from "module";
import { initializeApp, cert } from "firebase-admin/app";

const require = createRequire(import.meta.url);
const serviceAccount = require("../firebase-config.json");

initializeApp({ credential: cert(serviceAccount) });
const email = process.argv[2];
if (!email)
  throw new Error("Usage: node admin-claim.example.js admin@example.com");
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log(
  `Granted admin claim to ${email} (${user.uid}). Ask the user to sign out and sign in again.`,
);
