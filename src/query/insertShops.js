import { db } from "../firebase.js"; // นำเข้า db จากไฟล์ firebase.js
// หมายเหตุ: อย่าลืมเปลี่ยนพาธไปยังไฟล์ คีย์บริกาซ (Service Account) ของคุณให้ถูกต้อง

async function insertManyShops(shopsArray) {
  // 1. สร้าง Instance ของ Batch
  const batch = db.batch();
  const shopsCollectionRef = db.collection("shops");

  shopsArray.forEach((shopData) => {
    // สร้าง Document Reference เปล่าๆ เพื่อขอ Auto-generated ID จาก Firestore
    const newDocRef = shopsCollectionRef.doc();
    // 3. ใส่คำสั่ง set ลงใน batch
    batch.set(newDocRef, shopData);
  });

  try {
    // 4. สั่ง Commit เพื่อบันทึกข้อมูลทั้งหมดลง Firestore พร้อมกัน
    await batch.commit();
    console.log(
      `บันทึกข้อมูลร้านค้าทั้งหมด ${shopsArray.length} ร้านเรียบร้อยแล้ว!`,
    );
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการ Bulk Insert:", error);
  }
}

// ==========================================
// ตัวอย่าง Data รูปแบบ Array สำหรับการ Insert หลายๆ ร้าน
// ==========================================
const bulkShopsData = [
  {
    shopName: "ร้านชาบูอินดี้",
    shopType: "ร้านค้า",

    phoneNumber: "0811111111",
    lineId: "@shabuindy",
    workingZone: "Bangkok-KhlongSan",
  },
  {
    shopName: "ชาบูอินดี้ สาขา 2",
    shopType: "ตัวแทน",

    phoneNumber: "0822222222",
    lineId: "@shabuindy2",
    workingZone: "Bangkok-Sathon",
  },
  {
    shopName: "เบเกอรี่โฮมเมด",
    shopType: "ร้านค้า",

    phoneNumber: "0833333333",
    lineId: "@bakeryhome",
    workingZone: "Bangkok-Sathon",
  },
];

// เรียกใช้งาน
try {
  await insertManyShops(bulkShopsData);

  console.log(" Shops inserted successfully!");
} catch (error) {
  console.error("Failed to insert shops:", error);
  process.exitCode = 1;
}
