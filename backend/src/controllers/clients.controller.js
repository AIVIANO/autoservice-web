const { AppError } = require("../errors/appError");
const { isNonEmptyString } = require("../utils/validators");
const repo = require("../repositories/clients.repo");

async function createClient(req, res, next) {
  try {
    const { full_name, phone, email } = req.body;

    if (!isNonEmptyString(full_name) || !isNonEmptyString(phone)) {
      throw new AppError(400, "Validation error", { required: ["full_name", "phone"] });
    }

    const created = await repo.createClient({
      full_name: full_name.trim(),
      phone: phone.trim(),
      email,
    });

    return res.status(201).json(created);
  } catch (e) {
    return next(e);
  }
}

async function listClients(req, res, next) {
  try {
    const rows = await repo.listClients();
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
}

async function getClient(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const row = await repo.getClientById(id);
    if (!row) throw new AppError(404, "Client not found");
    return res.json(row);
  } catch (e) {
    return next(e);
  }
}

async function patchClient(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const { full_name, phone, email } = req.body;

    // Минимальная валидация как при создании
    if (!isNonEmptyString(full_name) || !isNonEmptyString(phone)) {
      throw new AppError(400, "Validation error", { required: ["full_name", "phone"] });
    }

    const updated = await repo.updateClientById(id, {
      full_name: full_name.trim(),
      phone: phone.trim(),
      email
    });

    if (!updated) throw new AppError(404, "Client not found");

    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

module.exports = { createClient, listClients, getClient, patchClient };
