const { pool } = require("../db/pool");

async function createBooking({ client_id, car_id, service_id, scheduled_at, service_note }) {
  const res = await pool.query(
    `INSERT INTO bookings (client_id, car_id, service_id, scheduled_at, service_note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, client_id, car_id, service_id, scheduled_at, service_note, status, created_at`,
    [client_id, car_id, service_id || null, scheduled_at, service_note || null]
  );
  return res.rows[0];
}

async function getBookingById(id) {
  const res = await pool.query(
    `SELECT id, client_id, car_id, service_id, scheduled_at, service_note, status, created_at
     FROM bookings
     WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function listBookings() {
  const res = await pool.query(
    `SELECT id, client_id, car_id, service_id, scheduled_at, service_note, status, created_at
     FROM bookings
     ORDER BY id DESC`
  );
  return res.rows;
}

async function updateBookingStatus(id, status) {
  const res = await pool.query(
    `UPDATE bookings
     SET status = $2
     WHERE id = $1
     RETURNING id, status`,
    [id, status]
  );
  return res.rows[0] || null;
}

module.exports = { createBooking, getBookingById, listBookings, updateBookingStatus };