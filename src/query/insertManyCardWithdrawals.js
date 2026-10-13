import { db } from "../firebase.js";

// เพิ่มข้อมูลการเบิกบัตรหลายรายการลง Firestore
async function insertManyCardWithdrawals(withdrawalsArray) {
  const batch = db.batch();
  const withdrawalsCollectionRef = db.collection("cardWithdrawals");

  withdrawalsArray.forEach((withdrawalData) => {
    const newDocRef = withdrawalsCollectionRef.doc();

    batch.set(newDocRef, {
      ...withdrawalData,
      createdAt: new Date(),
    });
  });

  try {
    await batch.commit();

    console.log(
      `บันทึกประวัติการเบิกบัตร ${withdrawalsArray.length} รายการเรียบร้อยแล้ว!`,
    );
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการ Bulk Insert:", error);
    throw error;
  }
}

// ==========================================
// ตัวอย่างข้อมูลจำลองสำหรับ cardWithdrawals
// ==========================================

const bulkCardWithdrawalsData = [
  // ตัวอย่างข้อมูลเดือนก่อน
  {
    shopId: "0QHj2VappXYfDH382mJV",
    shopName: "ShopB",
    shopType: "ตัวแทน",

    quantity: 1,
    unitPrice: 10,
    totalValue: 10,

    withdrawalDate: new Date("2026-10-11T09:00:00+07:00"),
    sequenceNo: 2,

    note: "ข้อมูลทดสอบเดือนกันยายน",
  },
];

// เรียกใช้งาน
try {
  await insertManyCardWithdrawals(bulkCardWithdrawalsData);
  console.log("Card withdrawals inserted successfully!");
} catch (error) {
  console.error("Failed to insert card withdrawals:", error);
  process.exitCode = 1;
}
