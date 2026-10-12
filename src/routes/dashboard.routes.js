import express from "express";

/**
 * Dashboard API routes for an existing Express app and Firebase Admin Firestore db.
 * Expected collections: shops, prizes, prizeHistories, cardWithdrawals.
 * Keep the existing db instance; do not initialize Firebase Admin a second time.
 */
export function createDashboardRouter({ db, adminAuth }) {
  if (!db || !adminAuth)
    throw new Error("createDashboardRouter requires { db, adminAuth }");
  const router = express.Router();

  async function requireAdmin(req, res, next) {
    try {
      const header = req.headers.authorization || "";
      const match = header.match(/^Bearer (.+)$/i);
      if (!match) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
      const decoded = await adminAuth.verifyIdToken(match[1]);
      if (decoded.admin !== true)
        return res.status(403).json({ error: "บัญชีนี้ไม่มีสิทธิ์ Admin" });
      req.admin = decoded;
      next();
    } catch (error) {
      console.error("Dashboard auth failed:", error.message);
      return res
        .status(401)
        .json({ error: "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" });
    }
  }

  router.use(requireAdmin);

  const toDate = (value, endOfDay = false) => {
    if (!value) return null;
    const d = new Date(
      `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dateOf = (value) => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const inRange = (value, from, to) => {
    const d = dateOf(value);
    return !!d && (!from || d >= from) && (!to || d <= to);
  };
  const firstDate = (obj, keys) => {
    for (const key of keys) if (obj?.[key]) return obj[key];
    return null;
  };
  const amount = (obj, keys) => {
    for (const key of keys) {
      const n = Number(obj?.[key]);
      if (obj?.[key] !== undefined && obj?.[key] !== null && Number.isFinite(n))
        return n;
    }
    return 0;
  };
  const text = (v) => String(v ?? "").trim();
  const ymdBangkok = (date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  const displayDate = (key) => {
    const [, y, m, d] = key.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    return d && m ? `${d}/${m}` : key;
  };

  router.get("/dashboard", async (req, res) => {
    try {
      const from = toDate(req.query.from);
      const to = toDate(req.query.to, true);
      if (req.query.from && !from)
        return res.status(400).json({ error: "วันที่เริ่มต้นไม่ถูกต้อง" });
      if (req.query.to && !to)
        return res.status(400).json({ error: "วันที่สิ้นสุดไม่ถูกต้อง" });
      if (from && to && from > to)
        return res
          .status(400)
          .json({ error: "วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด" });

      const [shopsSnap, prizesSnap, historiesSnap, withdrawalsSnap] =
        await Promise.all([
          db.collection("shops").get(),
          db.collection("prizes").get(),
          db.collection("prizeHistories").get(),
          db.collection("cardWithdrawals").get(),
        ]);
      const shops = shopsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const prizes = prizesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const histories = historiesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const withdrawals = withdrawalsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Shop match priority: explicit shopId/storeId in history, then prize, then shops.lineUserId === LINE user ID.
      const shopById = new Map(shops.map((s) => [s.id, s]));
      const shopByLineId = new Map(
        shops.filter((s) => s.lineUserId).map((s) => [String(s.lineUserId), s]),
      );
      const prizeById = new Map(prizes.map((p) => [p.id, p]));
      const resolveShop = (record, prize = null) => {
        const explicit = text(
          record?.shopId ||
            record?.lineUserId ||
            record?.storeId ||
            record?.storeID ||
            prize?.shopId ||
            prize?.shopID ||
            prize?.storeId,
        );
        if (explicit && shopById.has(explicit)) return shopById.get(explicit);
        const lineId = text(
          record?.lineUserId ||
            record?.lineID ||
            record?.userId ||
            record?.lineUserID,
        );
        if (lineId && shopByLineId.has(lineId)) return shopByLineId.get(lineId);
        return null;
      };
      const historyDate = (h) =>
        firstDate(h, [
          "scannedAt",
          "createdAt",
          "redeemedAt",
          "updatedAt",
          "timestamp",
        ]);
      const withdrawalDate = (w) =>
        firstDate(w, [
          "withdrawalDate",
          "withdrawnAt",
          "createdAt",
          "date",
          "transactionDate",
        ]);
      const withdrawalQty = (w) =>
        amount(w, [
          "quantity",
          "cardQuantity",
          "cardCount",
          "count",
          "totalCards",
        ]);
      const withdrawalValue = (w) =>
        amount(w, [
          "value",
          "totalValue",
          "withdrawalValue",
          "amount",
          "totalAmount",
        ]);
      const historyPrice = (h) =>
        amount(
          h.prizeSnapshot || h.prize || prizeById.get(text(h.prizeId)) || {},
          ["price", "prizeValue", "value", "amount"],
        );
      const successful = (h) =>
        ["matched", "redeemed", "success", "claimed", "paid"].includes(
          text(h.status).toLowerCase(),
        );
      const matchedHistories = histories.map((h) => ({
        ...h,
        _prize: prizeById.get(text(h.prizeId)) || null,
      }));
      const periodWithdrawals = withdrawals.filter((w) =>
        inRange(withdrawalDate(w), from, to),
      );
      const periodClaims = matchedHistories.filter(
        (h) => successful(h) && inRange(historyDate(h), from, to),
      );

      const withdrawalTotals = new Map();
      for (const w of withdrawals) {
        const shop = resolveShop(w);
        if (!shop) continue;
        const row = withdrawalTotals.get(shop.id) || {
          count: 0,
          value: 0,
          times: 0,
          records: [],
        };
        row.count += withdrawalQty(w);
        row.value += withdrawalValue(w);
        row.times += 1;
        row.records.push(w);
        withdrawalTotals.set(shop.id, row);
      }
      const claimTotals = new Map();
      for (const h of matchedHistories.filter(successful)) {
        const shop = resolveShop(h, h._prize);
        if (!shop) continue;
        const row = claimTotals.get(shop.id) || {
          count: 0,
          value: 0,
          records: [],
        };
        row.count += 1;
        row.value += historyPrice(h);
        row.records.push(h);
        claimTotals.set(shop.id, row);
      }
      const shopRows = shops.map((shop) => {
        const wAll = withdrawalTotals.get(shop.id) || {
          count: 0,
          value: 0,
          times: 0,
          records: [],
        };
        const cAll = claimTotals.get(shop.id) || {
          count: 0,
          value: 0,
          records: [],
        };
        const wPeriod = periodWithdrawals.filter(
          (w) => resolveShop(w)?.id === shop.id,
        );
        const cPeriod = periodClaims.filter(
          (h) => resolveShop(h, h._prize)?.id === shop.id,
        );
        const withdrawnCount = wAll.count;
        const redeemedCount = cAll.count;
        return {
          id: shop.id,
          shopName: shop.shopName || "ไม่ระบุชื่อร้าน",
          shopType: shop.shopType || "",
          workingZone: shop.workingZone || "",
          // Table metrics follow the selected date range; remainingCount is an all-time estimate.
          withdrawnCount: wPeriod.reduce((sum, w) => sum + withdrawalQty(w), 0),
          withdrawnValue: wPeriod.reduce(
            (sum, w) => sum + withdrawalValue(w),
            0,
          ),
          redeemedCount: cPeriod.length,
          redeemedValue: cPeriod.reduce((sum, h) => sum + historyPrice(h), 0),
          remainingCount: Math.max(0, withdrawnCount - redeemedCount),
          withdrawalTimes: wPeriod.length,
          periodWithdrawnCount: wPeriod.reduce(
            (sum, w) => sum + withdrawalQty(w),
            0,
          ),
          periodWithdrawnValue: wPeriod.reduce(
            (sum, w) => sum + withdrawalValue(w),
            0,
          ),
          periodRedeemedCount: cPeriod.length,
          periodRedeemedValue: cPeriod.reduce(
            (sum, h) => sum + historyPrice(h),
            0,
          ),
          // If a withdrawal has a sequence field, it remains available in raw Firestore; times is record count.
        };
      });
      const sum = (arr, key) =>
        arr.reduce((n, item) => n + Number(item[key] || 0), 0);
      const allWithdrawalQty = sum(
        withdrawals.map((w) => ({ value: withdrawalQty(w) })),
        "value",
      );
      const allWithdrawalValue = sum(
        withdrawals.map((w) => ({ value: withdrawalValue(w) })),
        "value",
      );
      const allClaims = matchedHistories.filter(successful);
      const totalRedeemed = allClaims.length;
      const totalCards = prizes.length;
      const periodWithdrawnCount = periodWithdrawals.reduce(
        (n, w) => n + withdrawalQty(w),
        0,
      );
      const periodWithdrawnValue = periodWithdrawals.reduce(
        (n, w) => n + withdrawalValue(w),
        0,
      );
      const periodRedeemedValue = periodClaims.reduce(
        (n, h) => n + historyPrice(h),
        0,
      );
      const periodRedeemedCount = periodClaims.length;

      // Trend by Bangkok calendar date; only dates that have activity are included.
      const trendMap = new Map();
      const touchTrend = (dateValue, field, value) => {
        const d = dateOf(dateValue);
        if (!d || !inRange(d, from, to)) return;
        const key = ymdBangkok(d);
        const row = trendMap.get(key) || {
          date: displayDate(key),
          _key: key,
          withdrawnValue: 0,
          redeemedValue: 0,
        };
        row[field] += Number(value || 0);
        trendMap.set(key, row);
      };
      periodWithdrawals.forEach((w) =>
        touchTrend(withdrawalDate(w), "withdrawnValue", withdrawalValue(w)),
      );
      periodClaims.forEach((h) =>
        touchTrend(historyDate(h), "redeemedValue", historyPrice(h)),
      );
      const trend = [...trendMap.values()]
        .sort((a, b) => a._key.localeCompare(b._key))
        .map(({ _key, ...row }) => row);

      res.json({
        summary: {
          totalCards,
          withdrawnCount: periodWithdrawnCount,
          withdrawnValue: periodWithdrawnValue,
          redeemedCount: periodRedeemedCount,
          redeemedValue: periodRedeemedValue,
          remainingCount: Math.max(0, allWithdrawalQty - totalRedeemed),
          periodWithdrawnCount,
          periodWithdrawnValue,
          periodRedeemedCount,
          periodRedeemedValue,
          withdrawalTimes: periodWithdrawals.length,
          shopCount: shops.length,
        },
        shops: shopRows,
        trend,
        period: { from: req.query.from || null, to: req.query.to || null },
        warnings: [
          "ยอดคงเหลือเป็นค่าประมาณจากยอดเบิกสะสมลบจำนวนครั้งที่ขึ้นเงิน และจะถูกต้องเมื่อข้อมูลการเบิก/การขึ้นเงินผูกกับร้านได้ครบถ้วน",
          "บัตรทั้งหมดในระบบนับจากจำนวน documents ใน prizes; หาก prizes เก็บเฉพาะรางวัล ไม่ใช่บัตรทุกใบ ให้ปรับสูตรตาม schema จริง",
        ],
      });
    } catch (error) {
      console.error("Dashboard query failed:", error);
      res.status(500).json({ error: "ไม่สามารถโหลดข้อมูล Dashboard ได้" });
    }
  });

  return router;
}
