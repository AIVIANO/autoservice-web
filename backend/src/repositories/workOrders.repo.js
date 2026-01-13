const { pool } = require("../db/pool");

async function createAudit({ entity, entity_id, action, details }) {
  await pool.query(
    `INSERT INTO audit_log(entity, entity_id, action, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [entity, entity_id, action, JSON.stringify(details || {})]
  );
}

async function recalcTotals(work_order_id) {
  const res = await pool.query(
    `
    WITH w AS (
      SELECT COALESCE(SUM(qty * unit_price), 0) AS work_sum
      FROM work_items
      WHERE work_order_id = $1
    ),
    m AS (
      SELECT COALESCE(SUM(qty * unit_price), 0) AS mat_sum
      FROM material_items
      WHERE work_order_id = $1
    )
    UPDATE work_orders
    SET total_amount = (SELECT work_sum FROM w) + (SELECT mat_sum FROM m),
        updated_at = now()
    WHERE id = $1
    RETURNING id, total_amount, paid_amount, status, updated_at
    `,
    [work_order_id]
  );
  return res.rows[0] || null;
}

async function createWorkOrderFromBooking({ booking_id, description }) {
  const res = await pool.query(
    `
    INSERT INTO work_orders (booking_id, client_id, car_id, description)
    SELECT b.id, b.client_id, b.car_id, $2
    FROM bookings b
    WHERE b.id = $1
    RETURNING id, booking_id, client_id, car_id, description, status, total_amount, paid_amount, created_at, updated_at
    `,
    [booking_id, description || null]
  );
  return res.rows[0] || null;
}

async function getWorkOrderById(id) {
  const res = await pool.query(
    `SELECT id, booking_id, client_id, car_id, description, status, total_amount, paid_amount, created_at, updated_at
     FROM work_orders
     WHERE id = $1 AND is_archived = FALSE`,
    [id]
  );
  return res.rows[0] || null;
}

async function updateWorkOrderStatus(id, status) {
  const res = await pool.query(
    `UPDATE work_orders
     SET status = $2, updated_at = now()
     WHERE id = $1 AND is_archived = FALSE
     RETURNING id, status, updated_at`,
    [id, status]
  );
  return res.rows[0] || null;
}

async function addWorkItem({ work_order_id, name, qty, unit_price }) {
  const res = await pool.query(
    `INSERT INTO work_items (work_order_id, name, qty, unit_price)
     VALUES ($1, $2, $3, $4)
     RETURNING id, work_order_id, name, qty, unit_price`,
    [work_order_id, name, qty, unit_price]
  );
  return res.rows[0];
}

async function addMaterialItem({ work_order_id, material_id, name, qty, unit_price }) {
  const res = await pool.query(
    `INSERT INTO material_items (work_order_id, material_id, name, qty, unit_price)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, work_order_id, material_id, name, qty, unit_price`,
    [work_order_id, material_id || null, name, qty, unit_price]
  );
  return res.rows[0];
}

async function addPayment({ work_order_id, amount, method }) {
  const res = await pool.query(
    `INSERT INTO payments (work_order_id, amount, method, status, paid_at)
     VALUES ($1, $2, $3, 'paid', now())
     RETURNING id, work_order_id, amount, method, status, paid_at`,
    [work_order_id, amount, method || "cash"]
  );

  await pool.query(
    `UPDATE work_orders
     SET paid_amount = paid_amount + $2,
         updated_at = now()
     WHERE id = $1`,
    [work_order_id, amount]
  );

  return res.rows[0];
}

async function getWorkOrderFull(id) {
  const wo = await getWorkOrderById(id);
  if (!wo) return null;

  const [workItems, materialItems, payments, audit] = await Promise.all([
    pool.query(
      `SELECT id, work_order_id, name, qty, unit_price
       FROM work_items
       WHERE work_order_id = $1
       ORDER BY id`,
      [id]
    ),
    pool.query(
      `SELECT id, work_order_id, material_id, name, qty, unit_price
       FROM material_items
       WHERE work_order_id = $1
       ORDER BY id`,
      [id]
    ),
    pool.query(
      `SELECT id
            ,work_order_id
            ,amount
            ,method
            ,status
            ,paid_at
            ,created_at
       FROM payments
       WHERE work_order_id = $1
       ORDER BY id`,
      [id]
    ),
    pool.query(
      `SELECT id, entity, entity_id, action, details, created_at
       FROM audit_log
       WHERE entity = 'work_order' AND entity_id = $1
       ORDER BY id`,
      [id]
    )
  ]);

  return {
    work_order: wo,
    work_items: workItems.rows,
    material_items: materialItems.rows,
    payments: payments.rows,
    audit_log: audit.rows
  };
}

module.exports = {
  createAudit,
  recalcTotals,
  createWorkOrderFromBooking,
  getWorkOrderById,
  updateWorkOrderStatus,
  addWorkItem,
  addMaterialItem,
  addPayment,
  getWorkOrderFull
};