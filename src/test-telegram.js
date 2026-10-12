import "dotenv/config";
import { sendTelegramNotification } from "./telegram.js";

try {
  await sendTelegramNotification(
    "✅ Test Notification\nTelegram Bot เชื่อมต่อสำเร็จ",
  );

  console.log("Telegram notification sent");
} catch (error) {
  console.error("Failed to send Telegram notification:", error);
  process.exitCode = 1;
}
