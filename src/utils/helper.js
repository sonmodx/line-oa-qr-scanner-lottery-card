import { db } from "../firebase.js";

async function getLineProfile(client, userId) {
  try {
    return await client.getProfile(userId);
  } catch (error) {
    console.error("Failed to fetch LINE profile:", {
      userId,
      message: error.message,
    });

    return null;
  }
}

async function getShopByLineUserId(lineUserId) {
  if (!lineUserId) {
    return null;
  }

  const snapshot = await db
    .collection("shops")
    .where("lineUserId", "==", lineUserId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];

  return {
    id: doc.id,
    ...doc.data(),
  };
}

function getLocalDateTimeString() {
  const localDateTime = new Date().toLocaleString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return localDateTime;
}

function getTodayRangeBangkok() {
  const now = new Date();
  //Firestore stores timestamps in UTC, so we need to calculate the start and end of the day in Bangkok time (UTC+7) to query correctly.
  const bangkokDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, month, day] = bangkokDate.split("-").map(Number);

  // Thailand is UTC+7.
  const from = new Date(Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000);

  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  return { from, to };
}

export {
  getLineProfile,
  getLocalDateTimeString,
  getShopByLineUserId,
  getTodayRangeBangkok,
};
