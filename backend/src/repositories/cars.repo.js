const { pool } = require("../db/pool");

async function createCar({ client_id, brand, model, plate_number, vin, year }) {
  const res = await pool.query(
    `INSERT INTO cars (client_id, brand, model, plate_number, vin, year)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, client_id, brand, model, plate_number, vin, year, created_at`,
    [client_id, brand, model, plate_number || null, vin || null, year || null]
  );
  return res.rows[0];
}

async function getCarById(id) {
  const res = await pool.query(
    `SELECT id, client_id, brand, model, plate_number, vin, year, created_at
     FROM cars
     WHERE id = $1 AND is_archived = FALSE`,
    [id]
  );
  return res.rows[0] || null;
}

async function listCars(client_id = null) {
  if (client_id) {
    const res = await pool.query(
      `SELECT id, client_id, brand, model, plate_number, vin, year, created_at
       FROM cars
       WHERE is_archived = FALSE AND client_id = $1
       ORDER BY id DESC`,
      [client_id]
    );
    return res.rows;
  }
  const res = await pool.query(
    `SELECT id, client_id, brand, model, plate_number, vin, year, created_at
     FROM cars
     WHERE is_archived = FALSE
     ORDER BY id DESC`
  );
  return res.rows;
}


async function updateCar(id, { brand, model, plate_number, vin, year }) {
  const res = await pool.query(
    `UPDATE cars
     SET brand = $2,
         model = $3,
         plate_number = $4,
         vin = $5,
         year = $6
     WHERE id = $1 AND is_archived = FALSE
     RETURNING id, client_id, brand, model, plate_number, vin, year, created_at`,
    [id, brand, model, plate_number || null, vin || null, year || null]
  );

  return res.rows[0] || null;
}


async function archiveCar(id) {
  const res = await pool.query(
    `UPDATE cars
     SET is_archived = TRUE
     WHERE id = $1 AND is_archived = FALSE
     RETURNING id`,
    [id]
  );
  return res.rows[0] || null;
}

module.exports = { createCar, getCarById, listCars, updateCar, archiveCar };
