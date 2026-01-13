const express = require("express");
const router = express.Router();

const { pool } = require("../db/pool");

/**
 * Helpers
 */
function toInt(x) {
  const n = Number(x);
  return Number.isInteger(n) ? n : null;
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function recalcTotal(workOrderId) {
  // total_amount = сумма работ + сумма материалов
  await pool.query(
    `
    UPDATE work_orders
    SET total_amount =
      COALESCE((SELECT SUM(qty * unit_price) FROM work_items WHERE work_order_id = $1), 0)
      +
      COALESCE((SELECT SUM(qty * unit_price) FROM material_items WHERE work_order_id = $1), 0),
    updated_at = now()
    WHERE id = $1
    `,
    [workOrderId]
  );
}

async function recalcPaid(workOrderId) {
  // paid_amount = сумма оплат со статусом paid
  await pool.query(
    `
    UPDATE work_orders
    SET paid_amount =
      COALESCE((SELECT SUM(amount) FROM payments WHERE work_order_id = $1 AND status = 'paid'), 0),
    updated_at = now()
    WHERE id = $1
    `,
    [workOrderId]
  );
}

/**
 * GET /api/work-orders (листинг)
 */
router.get("/work-orders", async (req, res, next) => {
  try {
    const q = `
      SELECT
        id,
        booking_id,
        client_id,
        car_id,
        description,
        status,
        total_amount,
        paid_amount,
        created_at,
        updated_at
      FROM work_orders
      ORDER BY id DESC
    `;
    const { rows } = await pool.query(q);
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/work-orders (создание из booking_id)
 */
router.post("/work-orders", async (req, res, next) => {
  try {
    const booking_id = toInt(req.body?.booking_id);
    if (!booking_id || booking_id <= 0) {
      return res.status(400).json({ error: "booking_id is required" });
    }

    // проверяем, что не существует уже ЗН на эту запись
    const existing = await pool.query("SELECT id FROM work_orders WHERE booking_id=$1", [booking_id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "WorkOrder for this booking already exists" });
    }

    // получаем client_id и car_id из booking
    const bk = await pool.query("SELECT client_id, car_id FROM bookings WHERE id=$1", [booking_id]);
    if (bk.rows.length === 0) return res.status(404).json({ error: "Booking not found" });

    const { client_id, car_id } = bk.rows[0];

    const ins = await pool.query(
      `
      INSERT INTO work_orders (booking_id, client_id, car_id, status, total_amount, paid_amount)
      VALUES ($1, $2, $3, 'created', 0, 0)
      RETURNING *
      `,
      [booking_id, client_id, car_id]
    );

    await pool.query(
      `INSERT INTO audit_log(entity, entity_id, action, details)
       VALUES ('work_order', $1, 'create', $2)`,
      [ins.rows[0].id, JSON.stringify({ booking_id })]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    return next(e);
  }
});

/**
 * PATCH /api/work-orders/:id/status
 */
router.patch("/work-orders/:id/status", async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const status = req.body?.status;

    if (!id || id <= 0) return res.status(400).json({ error: "Invalid id" });
    if (!status) return res.status(400).json({ error: "status is required" });

    const up = await pool.query(
      `
      UPDATE work_orders
      SET status=$1, updated_at=now()
      WHERE id=$2
      RETURNING *
      `,
      [status, id]
    );
    if (up.rows.length === 0) return res.status(404).json({ error: "WorkOrder not found" });

    await pool.query(
      `INSERT INTO audit_log(entity, entity_id, action, details)
       VALUES ('work_order', $1, 'status_change', $2)`,
      [id, JSON.stringify({ status })]
    );

    return res.json(up.rows[0]);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/work-orders/:id/work-items
 * Принимает:
 * - name (обязательно)
 * - qty (опционально, по умолчанию 1)
 * - unit_price (опционально)
 * - price (опционально)  <-- fallback
 */
router.post("/work-orders/:id/work-items", async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ error: "Invalid id" });

    const name = (req.body?.name ?? "").toString().trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const qtyRaw = req.body?.qty;
    const qty = qtyRaw === undefined || qtyRaw === null ? 1 : toNum(qtyRaw);

    const unitPriceRaw = req.body?.unit_price ?? req.body?.price; // <-- принимаем оба варианта
    const unit_price = unitPriceRaw === undefined || unitPriceRaw === null ? 0 : toNum(unitPriceRaw);

    if (!qty || qty <= 0) return res.status(400).json({ error: "qty must be > 0" });
    if (unit_price === null || unit_price < 0) return res.status(400).json({ error: "unit_price/price must be >= 0" });

    // вставка
    const ins = await pool.query(
      `
      INSERT INTO work_items (work_order_id, name, qty, unit_price)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [id, name, qty, unit_price]
    );

    // пересчет total_amount
    await recalcTotal(id);

    await pool.query(
      `INSERT INTO audit_log(entity, entity_id, action, details)
       VALUES ('work_order', $1, 'add_work_item', $2)`,
      [id, JSON.stringify({ work_item_id: ins.rows[0].id, name, qty, unit_price })]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/work-orders/:id/material-items
 * Принимает:
 * - name (обязательно)
 * - qty (опционально, по умолчанию 1)
 * - unit_price (опционально)
 * - price (опционально)  <-- fallback
 */
router.post("/work-orders/:id/material-items", async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ error: "Invalid id" });

    const name = (req.body?.name ?? "").toString().trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const qtyRaw = req.body?.qty;
    const qty = qtyRaw === undefined || qtyRaw === null ? 1 : toNum(qtyRaw);

    const unitPriceRaw = req.body?.unit_price ?? req.body?.price; // <-- принимаем оба варианта
    const unit_price = unitPriceRaw === undefined || unitPriceRaw === null ? 0 : toNum(unitPriceRaw);

    if (!qty || qty <= 0) return res.status(400).json({ error: "qty must be > 0" });
    if (unit_price === null || unit_price < 0) return res.status(400).json({ error: "unit_price/price must be >= 0" });

    const ins = await pool.query(
      `
      INSERT INTO material_items (work_order_id, material_id, name, qty, unit_price)
      VALUES ($1, NULL, $2, $3, $4)
      RETURNING *
      `,
      [id, name, qty, unit_price]
    );

    // пересчет total_amount
    await recalcTotal(id);

    await pool.query(
      `INSERT INTO audit_log(entity, entity_id, action, details)
       VALUES ('work_order', $1, 'add_material_item', $2)`,
      [id, JSON.stringify({ material_item_id: ins.rows[0].id, name, qty, unit_price })]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/work-orders/:id/payments
 * Принимает:
 * - amount (обязательно)
 * - method (опционально: cash/card/transfer)
 */
router.post("/work-orders/:id/payments", async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ error: "Invalid id" });

    const amount = toNum(req.body?.amount);
    const method = (req.body?.method ?? "cash").toString();

    if (amount === null || amount <= 0) return res.status(400).json({ error: "amount is required" });

    const ins = await pool.query(
      `
      INSERT INTO payments (work_order_id, amount, method, status)
      VALUES ($1, $2, $3, 'paid')
      RETURNING *
      `,
      [id, amount, method]
    );

    // пересчет paid_amount
    await recalcPaid(id);

    await pool.query(
      `INSERT INTO audit_log(entity, entity_id, action, details)
       VALUES ('work_order', $1, 'payment', $2)`,
      [id, JSON.stringify({ payment_id: ins.rows[0].id, amount, method })]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/work-orders/:id/full
 */
router.get("/work-orders/:id/full", async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ error: "Invalid id" });

    const wo = await pool.query("SELECT * FROM work_orders WHERE id=$1", [id]);
    if (wo.rows.length === 0) return res.status(404).json({ error: "WorkOrder not found" });

    const workItems = await pool.query(
      `SELECT id, work_order_id, name, qty, unit_price, (qty*unit_price) AS price
       FROM work_items
       WHERE work_order_id=$1
       ORDER BY id`,
      [id]
    );

    const materialItems = await pool.query(
      `SELECT id, work_order_id, material_id, name, qty, unit_price, (qty*unit_price) AS price
       FROM material_items
       WHERE work_order_id=$1
       ORDER BY id`,
      [id]
    );

    const payments = await pool.query(
      `SELECT *
       FROM payments
       WHERE work_order_id=$1
       ORDER BY id`,
      [id]
    );

    const audit = await pool.query(
      `SELECT *
       FROM audit_log
       WHERE entity='work_order' AND entity_id=$1
       ORDER BY id`,
      [id]
    );

    return res.json({
      work_order: wo.rows[0],
      work_items: workItems.rows,
      material_items: materialItems.rows,
      payments: payments.rows,
      audit_log: audit.rows,
    });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
