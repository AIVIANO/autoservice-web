const { AppError } = require("../errors/appError");
const repo = require("../repositories/workOrders.repo");

const WORK_ORDER_STATUSES = ["created","in_progress","waiting_approval","ready","closed","cancelled"];

async function createWorkOrder(req, res, next) {
  try {
    const { booking_id, description } = req.body;
    const bid = Number(booking_id);
    if (!Number.isInteger(bid) || bid <= 0) {
      throw new AppError(400, "Validation error", { required: ["booking_id"] });
    }

    const created = await repo.createWorkOrderFromBooking({ booking_id: bid, description });
    if (!created) throw new AppError(404, "Booking not found");

    await repo.createAudit({
      entity: "work_order",
      entity_id: created.id,
      action: "create",
      details: { booking_id: bid }
    });

    return res.status(201).json(created);
  } catch (e) {
    if (e && e.code === "23505") {
      return next(new AppError(409, "WorkOrder for this booking already exists"));
    }
    return next(e);
  }
}

async function getWorkOrder(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const row = await repo.getWorkOrderById(id);
    if (!row) throw new AppError(404, "WorkOrder not found");

    return res.json(row);
  } catch (e) {
    return next(e);
  }
}

async function getWorkOrderFull(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const data = await repo.getWorkOrderFull(id);
    if (!data) throw new AppError(404, "WorkOrder not found");

    return res.json(data);
  } catch (e) {
    return next(e);
  }
}

async function patchWorkOrderStatus(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const { status } = req.body;
    if (typeof status !== "string" || !WORK_ORDER_STATUSES.includes(status)) {
      throw new AppError(400, "Validation error", { allowed: WORK_ORDER_STATUSES });
    }

    const updated = await repo.updateWorkOrderStatus(id, status);
    if (!updated) throw new AppError(404, "WorkOrder not found");

    await repo.createAudit({
      entity: "work_order",
      entity_id: id,
      action: "status_change",
      details: { status }
    });

    return res.json(updated);
  } catch (e) {
    return next(e);
  }
}

async function addWorkItem(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const { name, qty, unit_price } = req.body;
    if (typeof name !== "string" || !name.trim()) throw new AppError(400, "Validation error", { required: ["name"] });

    const q = qty === undefined ? 1 : Number(qty);
    const p = unit_price === undefined ? 0 : Number(unit_price);
    if (!(q > 0) || !(p >= 0)) throw new AppError(400, "Validation error", { fields: ["qty>0", "unit_price>=0"] });

    const wo = await repo.getWorkOrderById(id);
    if (!wo) throw new AppError(404, "WorkOrder not found");

    const item = await repo.addWorkItem({ work_order_id: id, name: name.trim(), qty: q, unit_price: p });
    const totals = await repo.recalcTotals(id);

    await repo.createAudit({
      entity: "work_order",
      entity_id: id,
      action: "add_work_item",
      details: { work_item_id: item.id, name: item.name, qty: item.qty, unit_price: item.unit_price }
    });

    return res.status(201).json({ item, totals });
  } catch (e) {
    return next(e);
  }
}

async function addMaterialItem(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const { material_id, name, qty, unit_price } = req.body;
    if (typeof name !== "string" || !name.trim()) throw new AppError(400, "Validation error", { required: ["name"] });

    const q = qty === undefined ? 1 : Number(qty);
    const p = unit_price === undefined ? 0 : Number(unit_price);
    if (!(q > 0) || !(p >= 0)) throw new AppError(400, "Validation error", { fields: ["qty>0", "unit_price>=0"] });

    const mid = material_id === undefined || material_id === null ? null : Number(material_id);
    if (mid !== null && (!Number.isInteger(mid) || mid <= 0)) {
      throw new AppError(400, "Validation error", { field: "material_id" });
    }

    const wo = await repo.getWorkOrderById(id);
    if (!wo) throw new AppError(404, "WorkOrder not found");

    const item = await repo.addMaterialItem({ work_order_id: id, material_id: mid, name: name.trim(), qty: q, unit_price: p });
    const totals = await repo.recalcTotals(id);

    await repo.createAudit({
      entity: "work_order",
      entity_id: id,
      action: "add_material_item",
      details: { material_item_id: item.id, name: item.name, qty: item.qty, unit_price: item.unit_price }
    });

    return res.status(201).json({ item, totals });
  } catch (e) {
    return next(e);
  }
}

async function addPayment(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "Invalid id");

    const { amount, method } = req.body;
    const a = Number(amount);
    if (!(a > 0)) throw new AppError(400, "Validation error", { required: ["amount>0"] });

    const wo = await repo.getWorkOrderById(id);
    if (!wo) throw new AppError(404, "WorkOrder not found");

    const payment = await repo.addPayment({ work_order_id: id, amount: a, method: method || "cash" });
    const updated = await repo.getWorkOrderById(id);

    await repo.createAudit({
      entity: "work_order",
      entity_id: id,
      action: "payment",
      details: { payment_id: payment.id, amount: payment.amount, method: payment.method }
    });

    return res.status(201).json({ payment, work_order: updated });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  createWorkOrder,
  getWorkOrder,
  getWorkOrderFull,
  patchWorkOrderStatus,
  addWorkItem,
  addMaterialItem,
  addPayment
};