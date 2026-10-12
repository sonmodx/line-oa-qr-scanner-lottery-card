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
  // ร้านชาบูอินดี้ เบิกครั้งที่ 1
  {
    shopId: "4a1u8Xm3C9jFCv5MK6L4",
    shopName: "ชาบูอินดี้ สาขา 2",
    shopType: "ตัวแทน",

    quantity: 1000,
    unitPrice: 10,
    totalValue: 10000,

    withdrawalDate: new Date("2026-10-01T09:00:00+07:00"),
    sequenceNo: 1,

    note: "เบิกบัตรรอบแรกของเดือน",
  },

  // ร้านชาบูอินดี้ เบิกครั้งที่ 2
  {
    shopId: "4a1u8Xm3C9jFCv5MK6L4",
    shopName: "ชาบูอินดี้ สาขา 2",
    shopType: "ตัวแทน",

    quantity: 500,
    unitPrice: 10,
    totalValue: 5000,

    withdrawalDate: new Date("2026-10-08T10:30:00+07:00"),
    sequenceNo: 2,

    note: "เบิกบัตรเพิ่มเติม",
  },

  // ร้านชาบูอินดี้ เบิกครั้งที่ 3
  {
    shopId: "0QHj2VappXYfDH382mJV",
    shopName: "ShopB",
    shopType: "ตัวแทน",

    quantity: 800,
    unitPrice: 10,
    totalValue: 8000,

    withdrawalDate: new Date("2026-10-12T14:00:00+07:00"),
    sequenceNo: 3,

    note: "เบิกบัตรเพิ่มเติม",
  },

  // ตัวแทนชาบูอินดี้ สาขา 2
  {
    shopId: "0QHj2VappXYfDH382mJV",
    shopName: "ShopB",
    shopType: "ตัวแทน",

    quantity: 2000,
    unitPrice: 10,
    totalValue: 20000,

    withdrawalDate: new Date("2026-10-03T11:00:00+07:00"),
    sequenceNo: 1,

    note: "เบิกบัตรสำหรับตัวแทน",
  },

  // ตัวแทนชาบูอินดี้ สาขา 2 เบิกซ้ำ
  {
    shopId: "4a1u8Xm3C9jFCv5MK6L4",
    shopName: "ชาบูอินดี้ สาขา 2",
    shopType: "ตัวแทน",

    quantity: 1500,
    unitPrice: 10,
    totalValue: 15000,

    withdrawalDate: new Date("2026-10-10T13:30:00+07:00"),
    sequenceNo: 2,

    note: "เบิกบัตรเพิ่มเติม",
  },

  // ร้านเบเกอรี่โฮมเมด
  {
    shopId: "3wLdzbyXkSUEqSXWj26p",
    shopName: "ร้านชาบูอินดี้",
    shopType: "ร้านค้า",

    quantity: 300,
    unitPrice: 10,
    totalValue: 3000,

    withdrawalDate: new Date("2026-10-05T15:00:00+07:00"),
    sequenceNo: 1,

    note: "เบิกบัตรครั้งแรก",
  },

  // ตัวอย่างข้อมูลเดือนก่อน
  {
    shopId: "0QHj2VappXYfDH382mJV",
    shopName: "ShopB",
    shopType: "ตัวแทน",

    quantity: 1200,
    unitPrice: 10,
    totalValue: 12000,

    withdrawalDate: new Date("2026-09-15T09:00:00+07:00"),
    sequenceNo: 1,

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
