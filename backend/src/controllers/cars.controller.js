const { AppError } = require("../errors/appError");
const { isNonEmptyString } = require("../utils/validators");
const carsRepo = require("../repositories/cars.repo");
const clientsRepo = require("../repositories/clients.repo");

function normalizeOptionalText(v) {
  // undefined -> "не трогаем"
  // "" -> null (очистить поле)
  // " text " -> "text"
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseYear(v) {
  // undefined -> не трогаем
  // null/"" -> null (очистить)
  // number/string -> number
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;

  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  const year = Math.trunc(n);
  return year;
}

async function createCar(req, res, next) {
  try {
    const { client_id, brand, model, plate_number, vin, year } = req.body;

    const cid = Number(client_id);
    if (!Number.isInteger(cid) || cid <= 0) {
      throw new AppError(400, "Validation error", { required: ["client_id"] });
    }
    if (!isNonEmptyString(brand) || !isNonEmptyString(model)) {
      throw new AppError(400, "Validation error", { required: ["brand", "model"] });
    }

    const client = await clientsRepo.getClientById(cid);
    if (!client) throw new AppError(404, "Client not found");

    const created = await carsRepo.createCar({
      client_id: cid,
      brand: brand.trim(),
      model: model.trim(),
      plate_number: normalizeOptionalText(plate_number),
      vin: normalizeOptionalText(vin),
      year: year === undefined ? null : Number(year),
    });

    return res.status(201).json(created);
  } catch (e) {
    return next(e);
  }
}

async function listCars(req, res, next) {
  try {
    const client_id = req.query.client_id ? Number(req.query.client_id) : null;
    const rows = await carsRepo.listCars(client_id && Number.isInteger(client_id) ? client_id : null);
    return res.json(rows);
  } catch (e) {
    return next(e);
  }
}

async function getCar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const row = await carsRepo.getCarById(id);
    if (!row) throw new AppError(404, "Car not found");
    return res.json(row);
  } catch (e) {
    return next(e);
  }
}

// NEW: PATCH /api/cars/:id
async function patchCar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const existing = await carsRepo.getCarById(id);
    if (!existing) throw new AppError(404, "Car not found");

    const { brand, model, plate_number, vin, year } = req.body || {};

    const hasAny =
      brand !== undefined ||
      model !== undefined ||
      plate_number !== undefined ||
      vin !== undefined ||
      year !== undefined;

    if (!hasAny) {
      throw new AppError(400, "Validation error", { message: "No fields provided" });
    }

    // brand/model: если переданы — должны быть непустыми строками
    const nextBrand = brand !== undefined ? String(brand).trim() : existing.brand;
    const nextModel = model !== undefined ? String(model).trim() : existing.model;

    if (!isNonEmptyString(nextBrand) || !isNonEmptyString(nextModel)) {
      throw new AppError(400, "Validation error", { required: ["brand", "model"] });
    }

    const nextPlate = plate_number !== undefined ? normalizeOptionalText(plate_number) : existing.plate_number;
    const nextVin = vin !== undefined ? normalizeOptionalText(vin) : existing.vin;

    const y = parseYear(year);
    if (Number.isNaN(y)) throw new AppError(400, "Validation error", { field: "year" });
    const nextYear = y !== undefined ? y : existing.year;

    const updated = await carsRepo.updateCar(id, {
      brand: nextBrand,
      model: nextModel,
      plate_number: nextPlate,
      vin: nextVin,
      year: nextYear,
    });

    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

async function deleteCar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const r = await carsRepo.archiveCar(id);
    if (!r) throw new AppError(404, "Car not found");

    return res.json({ id, is_archived: true });
  } catch (e) {
    return next(e);
  }
}

module.exports = { createCar, listCars, getCar, patchCar, deleteCar };
