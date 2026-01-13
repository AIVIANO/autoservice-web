const state = {
  clientId: localStorage.getItem("clientId"),
  carId: localStorage.getItem("carId"),
  bookingId: localStorage.getItem("bookingId"),
  workOrderId: localStorage.getItem("workOrderId"),
};

function setState(key, value) {
  state[key] = value;
  if (value === null || value === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, String(value));
  renderState();
}

function renderState() {
  const el = document.getElementById("stateInfo");
  el.innerHTML = `
    <b>Текущие ID:</b>
    clientId=<code>${state.clientId ?? "-"}</code>,
    carId=<code>${state.carId ?? "-"}</code>,
    bookingId=<code>${state.bookingId ?? "-"}</code>,
    workOrderId=<code>${state.workOrderId ?? "-"}</code>
  `;
}

function out(obj) {
  const el = document.getElementById("output");
  el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const err = { status: res.status, statusText: res.statusText, data };
    throw err;
  }
  return data;
}

document.getElementById("btnHealth").onclick = async () => {
  try { out(await api("/health")); } catch (e) { out(e); }
};
document.getElementById("btnHealthDb").onclick = async () => {
  try { out(await api("/health/db")); } catch (e) { out(e); }
};

document.getElementById("btnClearState").onclick = () => {
  setState("clientId", null);
  setState("carId", null);
  setState("bookingId", null);
  setState("workOrderId", null);
  out("Состояние очищено.");
};

document.getElementById("btnCreateClient").onclick = async () => {
  try {
    const body = {
      full_name: document.getElementById("clientFullName").value.trim(),
      email: document.getElementById("clientEmail").value.trim(),
      phone: document.getElementById("clientPhone").value.trim(),
    };
    const data = await api("/api/clients", { method: "POST", body: JSON.stringify(body) });
    setState("clientId", data.id);
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnCreateCar").onclick = async () => {
  try {
    if (!state.clientId) throw { msg: "Сначала создай клиента (нет clientId)" };

    const body = {
      client_id: Number(state.clientId),
      make: document.getElementById("carMake").value.trim(),
      model: document.getElementById("carModel").value.trim(),
      vin: document.getElementById("carVin").value.trim(),
      plate_number: document.getElementById("carPlate").value.trim(),
    };
    const data = await api("/api/cars", { method: "POST", body: JSON.stringify(body) });
    setState("carId", data.id);
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnCreateBooking").onclick = async () => {
  try {
    if (!state.clientId || !state.carId) throw { msg: "Нужны clientId и carId" };

    const body = {
      client_id: Number(state.clientId),
      car_id: Number(state.carId),
      appointment_at: document.getElementById("bookingDate").value.trim(),
      comment: document.getElementById("bookingComment").value.trim(),
    };
    const data = await api("/api/bookings", { method: "POST", body: JSON.stringify(body) });
    setState("bookingId", data.id);
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnConfirmBooking").onclick = async () => {
  try {
    if (!state.bookingId) throw { msg: "Нужен bookingId" };
    const data = await api(`/api/bookings/${state.bookingId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "confirmed" }),
    });
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnCreateWorkOrder").onclick = async () => {
  try {
    if (!state.bookingId) throw { msg: "Нужен bookingId" };

    const body = {
      booking_id: Number(state.bookingId),
      description: document.getElementById("woDesc").value.trim(),
    };
    const data = await api("/api/work-orders", { method: "POST", body: JSON.stringify(body) });
    setState("workOrderId", data.id);
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnSetWorkOrderStatus").onclick = async () => {
  try {
    if (!state.workOrderId) throw { msg: "Нужен workOrderId" };
    const status = document.getElementById("woStatus").value;
    const data = await api(`/api/work-orders/${state.workOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnAddWorkItem").onclick = async () => {
  try {
    if (!state.workOrderId) throw { msg: "Нужен workOrderId" };

    const body = {
      name: document.getElementById("workItemName").value.trim(),
      qty: Number(document.getElementById("workItemQty").value),
      unit_price: Number(document.getElementById("workItemPrice").value),
    };
    const data = await api(`/api/work-orders/${state.workOrderId}/work-items`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnAddMaterialItem").onclick = async () => {
  try {
    if (!state.workOrderId) throw { msg: "Нужен workOrderId" };

    const body = {
      name: document.getElementById("matItemName").value.trim(),
      qty: Number(document.getElementById("matItemQty").value),
      unit_price: Number(document.getElementById("matItemPrice").value),
    };
    const data = await api(`/api/work-orders/${state.workOrderId}/material-items`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnPayFull").onclick = async () => {
  try {
    if (!state.workOrderId) throw { msg: "Нужен workOrderId" };

    const body = { amount: Number(document.getElementById("payAmount").value) };
    const data = await api(`/api/work-orders/${state.workOrderId}/payments`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    out(data);
  } catch (e) { out(e); }
};

document.getElementById("btnGetWorkOrderFull").onclick = async () => {
  try {
    if (!state.workOrderId) throw { msg: "Нужен workOrderId" };
    const data = await api(`/api/work-orders/${state.workOrderId}/full`);
    out(data);
  } catch (e) { out(e); }
};

renderState();
out("Готово. Начни с проверки /health, затем создай клиента.");
