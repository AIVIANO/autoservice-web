const express = require("express");
const router = express.Router();

const { pool } = require("../db/pool");

// GET /api/clients  (листинг, без архивных)
router.get("/clients", async (req, res, next) => {
  try {
    const q = `
      SELECT id, full_name, email, phone, created_at, updated_at
      FROM clients
      WHERE COALESCE(is_archived, false) = false
      ORDER BY id DESC
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /api/clients/:id (карточка клиента)
router.get("/clients/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const q = `
      SELECT id, full_name, email, phone, created_at, updated_at, is_archived
      FROM clients
      WHERE id = $1
      LIMIT 1
    `;
    const r = await pool.query(q, [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Client not found" });

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /api/clients (создание)
router.post("/clients", async (req, res, next) => {
  try {
    const { full_name, email, phone } = req.body || {};
    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ error: "full_name is required" });
    }

    const ins = await pool.query(
      `
      INSERT INTO clients (full_name, email, phone)
      VALUES ($1, $2, $3)
      RETURNING id, full_name, email, phone, created_at, updated_at
      `,
      [String(full_name).trim(), (email ?? "").trim() || null, (phone ?? "").trim() || null]
    );

    res.status(201).json(ins.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PATCH /api/clients/:id (редактирование)
router.patch("/clients/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone } = req.body || {};

    const up = await pool.query(
      `
      UPDATE clients
      SET
        full_name  = COALESCE($1, full_name),
        email      = COALESCE($2, email),
        phone      = COALESCE($3, phone),
        updated_at = now()
      WHERE id = $4
      RETURNING id, full_name, email, phone, created_at, updated_at
      `,
      [
        full_name !== undefined ? String(full_name).trim() : null,
        email !== undefined ? String(email).trim() : null,
        phone !== undefined ? String(phone).trim() : null,
        id,
      ]
    );

    if (up.rows.length === 0) return res.status(404).json({ error: "Client not found" });
    res.json(up.rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/clients/:id  (НЕ физическое удаление, а архивирование)
router.delete("/clients/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Мягкое удаление: прячем из списка, но сохраняем связи (машины/записи/заказ-наряды не ломаются)
    const r = await pool.query(
      `
      UPDATE clients
      SET is_archived = true,
          updated_at  = now()
      WHERE id = $1 AND COALESCE(is_archived, false) = false
      RETURNING id, full_name, email, phone, created_at, updated_at, is_archived
      `,
      [id]
    );

    // Если уже архивный — тоже ок (считаем как "уже удалён")
    if (r.rows.length === 0) {
      const chk = await pool.query(`SELECT id FROM clients WHERE id=$1`, [id]);
      if (chk.rows.length === 0) return res.status(404).json({ error: "Client not found" });
      return res.json({ ok: true, alreadyArchived: true });
    }

    res.json({ ok: true, archived: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
