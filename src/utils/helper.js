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

export {
  getLineProfile,
  getLocalDateTimeString,
  getShopByLineUserId,
  getTodayRangeBangkok,
};
