import express from "express";
import { getTodayRangeBangkok } from "../utils/helper.js";

export function createTelegramRouter({ db }) {
  const router = express.Router();

  router.post("/telegram/webhook", express.json(), async (req, res) => {
    // Verify Telegram's webhook secret.
    console.log("Telegram webhook request:", req.body);
    // if (
    //   req.get("X-Telegram-Bot-Api-Secret-Token") !==
    //   process.env.TELEGRAM_WEBHOOK_SECRET
    // ) {
    //   return res.sendStatus(401);
    // }

    // Acknowledge the update so Telegram doesn't wait for
    // the database query and reply to finish.
    res.sendStatus(200);
    console.log("Acknowledging Telegram update.");
    try {
      const message = req.body?.message;
      const chatId = message?.chat?.id;
      const text = message?.text?.trim();

      if (!chatId || text !== "1") return;

      const { from, to } = getTodayRangeBangkok();

      const [withdrawalSnapshot, redeemSnapshot] = await Promise.all([
        db
          .collection("cardWithdrawals")
          .where("withdrawalDate", ">=", from)
          .where("withdrawalDate", "<", to)
          .get(),

        db
          .collection("prizeHistories")
          .where("status", "==", "matched")
          .where("scannedAt", ">=", from)
          .where("scannedAt", "<", to)
          .get(),
      ]);

      // Total cards withdrawn.
      const totalWithdrawl = withdrawalSnapshot.docs.reduce(
        (sum, doc) => sum + Number(doc.data().quantity || 0),
        0,
      );

      // Count successful redemption records.
      // Assumes one matched record represents one redeemed card.
      const totalRedeem = redeemSnapshot.size;

      const percent =
        totalWithdrawl > 0 ? (totalRedeem / totalWithdrawl) * 100 : 0;

      const formatNumber = (n) => n.toLocaleString("en-US");

      const reply = [
        `📊 สรุปยอดของวันนี้ (ตั้งแต่: ${from.toLocaleString("th-TH")}, ถึง: ${to.toLocaleString("th-TH")})`,
        "",
        `📦 ยอดที่ร้านเบิกบัตรทั้งหมด: ${formatNumber(totalWithdrawl)}`,
        `🎁 ยอดลูกค้านำบัตรมาเบิกรางวัล: ${formatNumber(totalRedeem)}`,
        `📈 อัตราการเบิก: ${percent.toFixed(2)}%`,
        `บัตรคงเหลือ: ${formatNumber(
          Math.max(0, totalWithdrawl - totalRedeem),
        )}`,
      ].join("\n");

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: reply,
          }),
        },
      );

      const result = await telegramResponse.json();
      console.log("Telegram summary response:", result);

      if (!telegramResponse.ok || !result.ok) {
        throw new Error(`Telegram API error: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.error("Telegram summary error:", error.message);
    }
  });

  return router;
}
