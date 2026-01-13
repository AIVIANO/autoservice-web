const { pool } = require("../db/pool");

async function createClient({ full_name, phone, email }) {
  const res = await pool.query(
    `INSERT INTO clients (full_name, phone, email)
     VALUES ($1, $2, $3)
     RETURNING id, full_name, phone, email, created_at`,
    [full_name, phone, email || null]
  );
  return res.rows[0];
}

async function getClientById(id) {
  const res = await pool.query(
    `SELECT id, full_name, phone, email, created_at
     FROM clients
     WHERE id = $1 AND is_archived = FALSE`,
    [id]
  );
  return res.rows[0] || null;
}

async function listClients() {
  const res = await pool.query(
    `SELECT id, full_name, phone, email, created_at
     FROM clients
     WHERE is_archived = FALSE
     ORDER BY id DESC`
  );
  return res.rows;
}


async function updateClientById(id, { full_name, phone, email }) {

  const emailValue = email === "" ? null : (email ?? null);

  const res = await pool.query(
    `UPDATE clients
     SET full_name = $2,
         phone = $3,
         email = $4
     WHERE id = $1 AND is_archived = FALSE
     RETURNING id, full_name, phone, email, created_at`,
    [id, full_name, phone, emailValue]
  );
  return res.rows[0] || null;
}

module.exports = { createClient, getClientById, listClients, updateClientById };
