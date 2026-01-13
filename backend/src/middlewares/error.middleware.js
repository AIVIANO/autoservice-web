const { AppError } = require("../errors/appError");

function errorHandler(err, req, res, next) {
  console.error("[backend:error]", err);

  // Некорректный JSON в теле запроса
  if (err && (err.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400))) {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (err instanceof AppError) {
    const payload = { error: err.message };
    if (err.details) payload.details = err.details;
    return res.status(err.status).json(payload);
  }

  return res.status(500).json({ error: "Internal Server Error" });
}

module.exports = { errorHandler };