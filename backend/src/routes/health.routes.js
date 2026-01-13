const { Router } = require('express');
const { pool } = require('../db/pool');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/health/db', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT 1 AS ok;');
    if (result?.rows?.[0]?.ok === 1) {
      return res.json({ db: 'ok' });
    }
    return res.status(500).json({ db: 'unexpected_response' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;