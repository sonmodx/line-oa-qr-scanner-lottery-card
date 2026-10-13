import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import { db } from "./firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createDashboardRouter } from "./routes/dashboard.routes.js";
import { createTelegramRouter } from "./routes/telegram.routes.js";
import {
  getLineProfile,
  getLocalDateTimeString,
  getShopByLineUserId,
} from "./utils/helper.js";
import sharp from "sharp";
import jsQR from "jsqr";
import cors from "cors";

import { sendTelegramNotification } from "./telegram.js";

dotenv.config();

const allowedOrigins = [
  "http://localhost:5173", // Vite local development
  "https://lottery-shop-dashboard.vercel.app", // Production
];

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables.
const requiredEnv = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// LINE Messaging API client.
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = line.LineBotClient.fromChannelAccessToken({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      // อนุญาต request ที่ไม่มี Origin เช่น server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  "/api",
  createDashboardRouter({
    db,
    adminAuth: getAuth(),
  }),
);

app.use(createTelegramRouter({ db }));

// Health check.
app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "line-oa-backend",
  });
});

// LINE webhook endpoint.
// The LINE SDK middleware verifies the signature and parses the body.
// Do not put express.json() before this route.
app.post("/webhook", line.middleware(config), (req, res) => {
  const events = req.body.events ?? [];

  // Acknowledge LINE immediately, then process events asynchronously.
  res.sendStatus(200);

  void Promise.all(events.map(handleEvent)).catch((error) => {
    console.error("Webhook processing failed:", error);
  });
});

// Handle each incoming webhook event.

async function handleEvent(event) {
  const userId = event.source?.userId;

  // 1. User follows your LINE OA.
  if (event.type === "follow") {
    if (!userId) {
      console.log("Follow event has no user ID.");
      return;
    }

    try {
      const profile = await getLineProfile(client, userId);

      const userData = {
        lineUserId: userId,
        isFollowing: true,
        followedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(profile
          ? {
              displayName: profile.displayName ?? null,
              pictureUrl: profile.pictureUrl ?? null,
              statusMessage: profile.statusMessage ?? null,
              language: profile.language ?? null,
            }
          : {}),
      };

      await db
        .collection("lineUsers")
        .doc(userId)
        .set(userData, { merge: true });

      console.log("LINE user profile saved:", userId);
    } catch (error) {
      console.error("Failed to save followed user:", error);
    }

    return;
  }

  // 2. User unfollows your LINE OA.
  if (event.type === "unfollow") {
    if (!userId) {
      console.log("Unfollow event has no user ID.");
      return;
    }

    try {
      await db.collection("lineUsers").doc(userId).delete();

      console.log("LINE user profile deleted:", userId);
    } catch (error) {
      console.error("Failed to delete unfollowed user:", error);
    }

    return;
  }

  if (event.type !== "message") return;

  if (!event.replyToken) {
    console.log("No reply token available.");
    return;
  }

  // Keep the existing text-message behavior.
  if (event.message.type === "text") {
    console.log("Incoming text:", event.message.text);

    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: `You sent: ${event.message.text}`,
        },
      ],
    });

    return;
  }

  // Process QR codes from image messages.
  if (event.message.type === "image") {
    try {
      console.log("Received image:", event.message.id);

      const imageBuffer = await downloadLineImage(event.message.id);

      const qrData = await decodeQrFromImage(imageBuffer);

      if (!qrData) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: "ไม่พบ QR code ในรูปภาพนี้ กรุณาลองใหม่อีกครั้งด้วยภาพอื่น",
            },
          ],
        });

        return;
      }

      try {
        // Assumption: the QR payload itself is the serial number.
        const serialNumber = qrData.trim();

        const result = await lookupPrizeAndSaveHistory(event, serialNumber);

        let replyText;

        const receiveTime = getLocalDateTimeString();
        const receiveText = [
          `🔔  | รับข้อมูลสำเร็จ\n`,
          `✅ ระบบได้รับข้อมูลบัตรของท่านแล้ว\n`,
          `🧾 หมายเลขบัตร: ${serialNumber}`,
          `🕒 วันที่และเวลา: ${receiveTime}\n`,
          `⏳ สถานะ: รอตรวจสอบข้อมูล\n`,
          `กรุณารอการแจ้งผลจากระบบผ่าน LINE นี้`,
        ].join("\n");

        if (!result.found) {
          replyText = `ไม่พบรางวัล.\nหมายเลขบัตร: ${serialNumber}`;
        } else if (!result.available) {
          replyText = `รางวัลนี้ถูกขึ้นเงินแล้ว หรือไม่สามารถใช้งานได้.\nหมายเลขบัตร: ${serialNumber}`;
        } else {
          const prize = result.prize;

          replyText = [
            "🎉  | ตรวจสอบสำเร็จ\n",
            `✅ หมายเลขบัตร: ${serialNumber}\n`,
            `รางวัลมูลค่า: ${prize.price ?? "N/A"} บาท\n`,
            `📌 สถานะ: บันทึกเรียบร้อยแล้ว\n`,
            `คะแนนใช้สำหรับสะสมภายในเกมเท่านั้น ไม่สามารถแลกเป็นเงินสด สินค้า หรือสิทธิประโยชน์อื่นได้\n`,
            `ขอบคุณที่ร่วมสนุกกับเทพทันใจ`,
          ].join("\n");
        }

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: receiveText.slice(0, 4900),
            },
            {
              type: "text",
              text: replyText.slice(0, 4900),
            },
          ],
        });

        // Send a Telegram notification for successful QR processing.
        if (result.found && result.available) {
          const profile = await getLineProfile(client, userId);

          const lineUserId = event.source?.userId ?? null;
          let shop = null;
          try {
            shop = await getShopByLineUserId(lineUserId);
          } catch (error) {
            console.error("Failed to get shop:", error.message);
          }

          const localDateTime = getLocalDateTimeString();
          const message = [
            "🎉 ผู้ใช้งานได้รับรางวัลแล้ว\n",
            `Shop Name: ${shop?.shopName ?? "ไม่พบข้อมูลร้านค้า"}`,
            `Serial Number: ${serialNumber}`,
            `Prize: ${result.prize.price ?? "N/A"} บาท`,
            `LINE Shop ID: ${shop?.lineId ?? "Unknown"}`,
            `Display Name: ${profile?.displayName ?? "Unknown"}`,
            `Transaction ID: ${event.webhookEventId ?? "N/A"}`,
            `วันที่และเวลา: ${localDateTime}`,
          ].join("\n");

          // แจ้งเตือนล้มเหลวต้องไม่ทำให้การแลกรางวัลย้อนกลับ
          try {
            await sendTelegramNotification(message);
            console.log(
              "Telegram notification sent user win a prize successfully.",
            );
          } catch (error) {
            console.error("Telegram notification failed:", error.message);
          }
        }
      } catch (error) {
        console.error("Prize lookup or history save failed:", error);

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: "ขออภัยด้วยครับ ระบบเกิดข้อผิดพลาดขณะตรวจสอบรางวัล โปรดลองอีกครั้งในภายหลัง",
            },
          ],
        });
      }

      console.log("QR result sent to LINE.");
    } catch (error) {
      console.error("QR processing failed:", error.message);

      try {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: "ขออภัยด้วยครับ ระบบไม่สามารถอ่านรูปภาพนี้ได้ รบกวนลองอีกครั้งด้วยรูปภาพคิวอาร์โค้ด (QR code) ที่ชัดเจนกว่าเดิมนะครับ",
            },
          ],
        });
      } catch (replyError) {
        console.error("Failed to send error reply:", replyError.message);
      }
    }
  }
}

async function downloadLineImage(messageId) {
  const response = await fetch(
    `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    throw new Error(`LINE image download failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  // Prevent unexpectedly large downloads from consuming too much memory.
  if (imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error("Image is too large to process.");
  }

  return imageBuffer;
}

async function decodeQrFromImage(imageBuffer) {
  // Auto-rotate using image metadata and normalize to RGBA pixels.
  const { data, info } = await sharp(imageBuffer, {
    limitInputPixels: 20_000_000,
  })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "attemptBoth",
  });

  return qr?.data ?? null;
}

async function lookupPrizeAndSaveHistory(event, serialNumber) {
  const userId = event.source?.userId ?? null;

  // Generate a history document reference.
  const historyRef = db.collection("prizeHistories").doc();

  return await db.runTransaction(async (transaction) => {
    // Find an exact serial number match.
    const snapshot = await transaction.get(
      db
        .collection("prizes")
        .where("serialNumber", "==", serialNumber)
        .limit(1),
    );

    // No matching prize.
    if (snapshot.empty) {
      transaction.create(historyRef, {
        serialNumber,
        lineUserId: userId,
        webhookEventId: event.webhookEventId ?? null,
        status: "not_found",
        scannedAt: FieldValue.serverTimestamp(),
      });

      return {
        found: false,
        available: false,
        serialNumber,
      };
    }

    const prizeDoc = snapshot.docs[0];
    const prize = prizeDoc.data();

    // Prize exists, but is not available.
    if (prize.isAvailable !== true) {
      transaction.create(historyRef, {
        serialNumber,
        lineUserId: userId,
        webhookEventId: event.webhookEventId ?? null,
        status: "already_claimed",
        scannedAt: FieldValue.serverTimestamp(),
      });
      return {
        found: true,
        available: false,
        serialNumber,
        prizeId: prizeDoc.id,
        prize,
      };
    }

    // Mark the prize as unavailable.
    transaction.update(prizeDoc.ref, {
      isAvailable: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Record the successful claim in the same transaction.
    transaction.create(historyRef, {
      serialNumber,
      prizeId: prizeDoc.id,
      prizeSnapshot: {
        ...prize,
        isAvailable: false,
      },
      lineUserId: userId,
      webhookEventId: event.webhookEventId ?? null,
      status: "matched",
      scannedAt: FieldValue.serverTimestamp(),
    });

    return {
      found: true,
      available: true,
      prizeId: prizeDoc.id,
      prize: {
        ...prize,
        isAvailable: false,
      },
    };
  });
}

// Start the server.
app.listen(PORT, () => {
  console.log(`LINE OA backend listening on port ${PORT}`);
});
