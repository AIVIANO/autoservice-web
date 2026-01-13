import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").trim();

async function api(path, { method = "GET", body } = {}) {
  const url = API_BASE ? `${API_BASE}${path}` : path;

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function nowPlusHoursToLocalInput(hours) {
  return isoToLocalInput(new Date(Date.now() + hours * 3600 * 1000).toISOString());
}

function fmtMoney(x) {
  const n = Number(x ?? 0);
  if (Number.isNaN(n)) return String(x ?? "");
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU");
}

function woStatusLabel(value) {
  const map = {
    created: "Создан",
    in_progress: "В работе",
    waiting_approval: "Ожидает согласования",
    ready: "Готов",
    closed: "Закрыт",
    cancelled: "Отменён",
  };
  return map[value] ?? value;
}

function payMethodLabel(value) {
  const map = {
    card: "Карта",
    cash: "Наличные",
    transfer: "Перевод",
  };
  return map[value] ?? value;
}

function carLabel(c) {
  if (!c) return "";
  const plate = c.plate_number ? `, ${c.plate_number}` : "";
  const year = c.year ? `, ${c.year}` : "";
  return `#${c.id} — ${c.brand} ${c.model}${plate}${year}`;
}

export default function App() {
  const [tab, setTab] = useState("clients");
  const [log, setLog] = useState([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [health, setHealth] = useState(null);

  // ===== data =====
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsQuery, setClientsQuery] = useState("");

  const [selectedClientId, setSelectedClientId] = useState(null);
  const selectedClient = useMemo(
    () => clients.find((c) => String(c.id) === String(selectedClientId)) ?? null,
    [clients, selectedClientId]
  );

  const [cars, setCars] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null);
  const [workOrderFull, setWorkOrderFull] = useState(null);

  // для печати/шапки ЗН — подгружаем связанные сущности
  const [woClient, setWoClient] = useState(null);
  const [woCar, setWoCar] = useState(null);

  // ===== forms =====
  const [clientForm, setClientForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });

  const [carForm, setCarForm] = useState({
    brand: "",
    model: "",
    plate_number: "",
    vin: "",
    year: "",
  });

  // IMPORTANT: поле в бэке называется service_note
  const [bookingForm, setBookingForm] = useState({
    scheduled_at: nowPlusHoursToLocalInput(24),
    service_note: "",
    car_id: "",
  });

  const [workItemForm, setWorkItemForm] = useState({
    name: "",
    price: 2500,
  });

  const [materialForm, setMaterialForm] = useState({
    name: "",
    price: 3200,
    qty: 1,
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: 5700,
    method: "card",
  });

  const [woStatus, setWoStatus] = useState("created");

  // ===== edit client =====
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [clientEditForm, setClientEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
  });

  // ===== edit car =====
  const [editingCarId, setEditingCarId] = useState(null);
  const [carEditForm, setCarEditForm] = useState({
    brand: "",
    model: "",
    plate_number: "",
    vin: "",
    year: "",
  });

  // ===== logging =====
  function pushLog(title, status, payload) {
    setLog((prev) => [{ at: new Date().toISOString(), title, status, payload }, ...prev]);
  }

  // ===== loaders =====
  async function loadHealth() {
    try {
      const a = await api("/health");
      const b = await api("/health/db");
      setHealth({ health: a, db: b });
      pushLog("Проверка /health", "ok", { health: a, db: b });
    } catch (e) {
      pushLog("Проверка /health", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function loadClients() {
    setClientsLoading(true);
    try {
      const list = await api("/api/clients");
      setClients(Array.isArray(list) ? list : list?.clients ?? []);
      pushLog("Загрузка клиентов", "ok", { count: Array.isArray(list) ? list.length : undefined });
    } catch (e) {
      pushLog("Загрузка клиентов", "error", { message: e.message, status: e.status, data: e.data });
    } finally {
      setClientsLoading(false);
    }
  }

  async function loadCarsForClient(clientId) {
    if (!clientId) return;
    try {
      const list = await api(`/api/cars?client_id=${clientId}`);
      setCars(Array.isArray(list) ? list : list?.cars ?? []);
      pushLog("Загрузка авто", "ok", { clientId });
    } catch {
      try {
        const all = await api("/api/cars");
        const arr = Array.isArray(all) ? all : all?.cars ?? [];
        setCars(arr.filter((x) => String(x.client_id) === String(clientId)));
        pushLog("Загрузка авто (фолбэк-фильтр)", "ok", { clientId });
      } catch (e2) {
        pushLog("Загрузка авто", "error", { message: e2.message, status: e2.status, data: e2.data });
      }
    }
  }

  async function loadBookingsForClient(clientId) {
    if (!clientId) return;
    try {
      const list = await api(`/api/bookings?client_id=${clientId}`);
      setBookings(Array.isArray(list) ? list : list?.bookings ?? []);
      pushLog("Загрузка записей", "ok", { clientId });
    } catch {
      try {
        const all = await api("/api/bookings");
        const arr = Array.isArray(all) ? all : all?.bookings ?? [];
        setBookings(arr.filter((x) => String(x.client_id) === String(clientId)));
        pushLog("Загрузка записей (фолбэк-фильтр)", "ok", { clientId });
      } catch (e2) {
        pushLog("Загрузка записей", "error", { message: e2.message, status: e2.status, data: e2.data });
      }
    }
  }

  async function loadWorkOrders() {
    setWorkOrdersLoading(true);
    try {
      const list = await api("/api/work-orders");
      setWorkOrders(Array.isArray(list) ? list : list?.work_orders ?? []);
      pushLog("Загрузка заказ-нарядов", "ok", { count: Array.isArray(list) ? list.length : undefined });
    } catch (e) {
      pushLog("Загрузка заказ-нарядов", "error", { message: e.message, status: e.status, data: e.data });
    } finally {
      setWorkOrdersLoading(false);
    }
  }

  async function loadWorkOrderFull(id) {
    if (!id) return;
    try {
      const full = await api(`/api/work-orders/${id}/full`);
      setWorkOrderFull(full);

      const status = full?.work_order?.status;
      if (status) setWoStatus(status);

      pushLog("Загрузка карточки заказ-наряда", "ok", { id });
    } catch (e) {
      setWorkOrderFull(null);
      setWoClient(null);
      setWoCar(null);

      const serverMsg = e?.data?.error || e?.data?.message;
      pushLog("Загрузка карточки заказ-наряда", "error", {
        message: serverMsg ? `${e.message}: ${serverMsg}` : e.message,
        status: e.status,
        data: e.data,
      });
    }
  }

  // ===== init =====
  useEffect(() => {
    loadHealth();
    loadClients();
    loadWorkOrders();
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      loadCarsForClient(selectedClientId);
      loadBookingsForClient(selectedClientId);
    } else {
      setCars([]);
      setBookings([]);
      setBookingForm((p) => ({ ...p, car_id: "" }));
    }
  }, [selectedClientId]);

  useEffect(() => {
    if (selectedWorkOrderId) loadWorkOrderFull(selectedWorkOrderId);
    else {
      setWorkOrderFull(null);
      setWoClient(null);
      setWoCar(null);
    }
  }, [selectedWorkOrderId]);

  // ===== when client selected -> prepare edit form =====
  useEffect(() => {
    if (!selectedClient) {
      setIsEditingClient(false);
      setClientEditForm({ full_name: "", email: "", phone: "" });
      return;
    }
    setIsEditingClient(false);
    setClientEditForm({
      full_name: selectedClient.full_name ?? "",
      email: selectedClient.email ?? "",
      phone: selectedClient.phone ?? "",
    });
  }, [selectedClientId]);

  // ===== when cars loaded -> set default car in booking form =====
  useEffect(() => {
    if (!selectedClientId) return;

    if (cars.length === 0) {
      setBookingForm((p) => ({ ...p, car_id: "" }));
      return;
    }

    setBookingForm((p) => {
      const exists = cars.some((c) => String(c.id) === String(p.car_id));
      return exists ? p : { ...p, car_id: String(cars[0].id) };
    });
  }, [cars, selectedClientId]);

  // ===== load client/car refs for work order print header =====
  useEffect(() => {
    async function loadRefs() {
      const wo = workOrderFull?.work_order;
      if (!wo?.id) {
        setWoClient(null);
        setWoCar(null);
        return;
      }

      try {
        if (wo.client_id) setWoClient(await api(`/api/clients/${wo.client_id}`));
        else setWoClient(null);
      } catch {
        setWoClient(null);
      }

      try {
        if (wo.car_id) setWoCar(await api(`/api/cars/${wo.car_id}`));
        else setWoCar(null);
      } catch {
        setWoCar(null);
      }
    }

    loadRefs();
  }, [workOrderFull?.work_order?.id]);

  // ===== actions =====
  async function createClient() {
    try {
      const c = await api("/api/clients", { method: "POST", body: clientForm });
      pushLog("Создание клиента", "ok", c);
      await loadClients();
      setSelectedClientId(c.id);
    } catch (e) {
      pushLog("Создание клиента", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function saveClientEdits() {
    try {
      if (!selectedClientId) throw new Error("Не выбран клиент");
      const body = {
        full_name: clientEditForm.full_name.trim(),
        email: clientEditForm.email.trim(),
        phone: clientEditForm.phone.trim(),
      };
      const r = await api(`/api/clients/${selectedClientId}`, { method: "PATCH", body });
      pushLog("Редактирование клиента", "ok", r);
      setIsEditingClient(false);
      await loadClients();
      setSelectedClientId(selectedClientId);
    } catch (e) {
      pushLog("Редактирование клиента", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function deleteClient() {
    try {
      if (!selectedClientId) throw new Error("Не выбран клиент");
      const ok = window.confirm("Удалить клиента? Это действие нельзя отменить.");
      if (!ok) return;

      const r = await api(`/api/clients/${selectedClientId}`, { method: "DELETE" });
      pushLog("Удаление клиента", "ok", r);

      setSelectedClientId(null);
      setCars([]);
      setBookings([]);
      await loadClients();
    } catch (e) {
      const serverMsg = e?.data?.error || e?.data?.message;
      pushLog("Удаление клиента", "error", {
        message: serverMsg ? `${e.message}: ${serverMsg}` : e.message,
        status: e.status,
        data: e.data,
      });
      alert(serverMsg || "Не удалось удалить клиента (скорее всего есть связанные данные).");
    }
  }

  async function createCar() {
    try {
      if (!selectedClientId) throw new Error("Сначала выбери клиента");
      const body = {
        client_id: selectedClientId,
        brand: carForm.brand,
        model: carForm.model,
        plate_number: carForm.plate_number,
        vin: carForm.vin,
        year: carForm.year === "" ? null : Number(carForm.year),
      };

      const car = await api("/api/cars", { method: "POST", body });
      pushLog("Создание авто", "ok", car);

      await loadCarsForClient(selectedClientId);
      setBookingForm((p) => ({ ...p, car_id: String(car.id) }));
    } catch (e) {
      pushLog("Создание авто", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  function startEditCar(car) {
    setEditingCarId(car.id);
    setCarEditForm({
      brand: car.brand ?? "",
      model: car.model ?? "",
      plate_number: car.plate_number ?? "",
      vin: car.vin ?? "",
      year: car.year ?? "",
    });
  }

  async function saveCarEdits() {
    try {
      if (!editingCarId) throw new Error("Не выбрано авто для редактирования");
      const body = {
        brand: String(carEditForm.brand ?? "").trim(),
        model: String(carEditForm.model ?? "").trim(),
        plate_number: carEditForm.plate_number ?? "",
        vin: carEditForm.vin ?? "",
        year: carEditForm.year === "" || carEditForm.year === null ? null : Number(carEditForm.year),
      };

      const r = await api(`/api/cars/${editingCarId}`, { method: "PATCH", body });
      pushLog("Редактирование авто", "ok", r);

      setEditingCarId(null);
      await loadCarsForClient(selectedClientId);
    } catch (e) {
      pushLog("Редактирование авто", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function deleteCar(carId) {
    try {
      const ok = window.confirm("Удалить автомобиль? Он будет скрыт из списка (архивирован).");
      if (!ok) return;

      const r = await api(`/api/cars/${carId}`, { method: "DELETE" });
      pushLog("Удаление авто", "ok", r);

      if (String(editingCarId) === String(carId)) setEditingCarId(null);
      await loadCarsForClient(selectedClientId);
    } catch (e) {
      pushLog("Удаление авто", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function createBooking() {
    try {
      if (!selectedClientId) throw new Error("Сначала выбери клиента");
      if (cars.length === 0) throw new Error("Сначала добавь автомобиль клиенту");

      const carId = Number(bookingForm.car_id);
      if (!Number.isInteger(carId) || carId <= 0) throw new Error("Выбери автомобиль");

      const scheduledIso = new Date(bookingForm.scheduled_at).toISOString();

      const booking = await api("/api/bookings", {
        method: "POST",
        body: {
          client_id: selectedClientId,
          car_id: carId,
          scheduled_at: scheduledIso,
          service_note: bookingForm.service_note,
        },
      });

      pushLog("Создание записи", "ok", booking);
      await loadBookingsForClient(selectedClientId);
    } catch (e) {
      pushLog("Создание записи", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function confirmBooking(bookingId) {
    try {
      const r = await api(`/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        body: { status: "confirmed" },
      });
      pushLog("Подтверждение записи", "ok", r);
      await loadBookingsForClient(selectedClientId);
    } catch (e) {
      pushLog("Подтверждение записи", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function createWorkOrderFromBooking(bookingId) {
    try {
      const wo = await api("/api/work-orders", {
        method: "POST",
        body: { booking_id: bookingId },
      });
      pushLog("Создание заказ-наряда", "ok", wo);
      await loadWorkOrders();
      setTab("workOrders");
      setSelectedWorkOrderId(wo.id);
    } catch (e) {
      pushLog("Создание заказ-наряда", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function updateWorkOrderStatus() {
    try {
      if (!selectedWorkOrderId) throw new Error("Выбери заказ-наряд");
      const r = await api(`/api/work-orders/${selectedWorkOrderId}/status`, {
        method: "PATCH",
        body: { status: woStatus },
      });
      pushLog("Изменение статуса заказ-наряда", "ok", r);
      await loadWorkOrderFull(selectedWorkOrderId);
      await loadWorkOrders();
    } catch (e) {
      pushLog("Изменение статуса заказ-наряда", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function addWorkItem() {
    try {
      if (!selectedWorkOrderId) throw new Error("Выбери заказ-наряд");
      const r = await api(`/api/work-orders/${selectedWorkOrderId}/work-items`, {
        method: "POST",
        body: { name: workItemForm.name, price: Number(workItemForm.price) },
      });
      pushLog("Добавление работы", "ok", r);
      await loadWorkOrderFull(selectedWorkOrderId);
      await loadWorkOrders();
    } catch (e) {
      pushLog("Добавление работы", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function addMaterialItem() {
    try {
      if (!selectedWorkOrderId) throw new Error("Выбери заказ-наряд");
      const r = await api(`/api/work-orders/${selectedWorkOrderId}/material-items`, {
        method: "POST",
        body: {
          name: materialForm.name,
          price: Number(materialForm.price),
          qty: Number(materialForm.qty),
        },
      });
      pushLog("Добавление материала", "ok", r);
      await loadWorkOrderFull(selectedWorkOrderId);
      await loadWorkOrders();
    } catch (e) {
      pushLog("Добавление материала", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  async function addPayment() {
    try {
      if (!selectedWorkOrderId) throw new Error("Выбери заказ-наряд");
      const r = await api(`/api/work-orders/${selectedWorkOrderId}/payments`, {
        method: "POST",
        body: { amount: Number(paymentForm.amount), method: paymentForm.method },
      });
      pushLog("Добавление оплаты", "ok", r);
      await loadWorkOrderFull(selectedWorkOrderId);
      await loadWorkOrders();
    } catch (e) {
      pushLog("Добавление оплаты", "error", { message: e.message, status: e.status, data: e.data });
    }
  }

  // ===== PRINT =====
  function printWorkOrder() {
    if (!workOrderFull?.work_order?.id) {
      pushLog("Печать заказ-наряда", "error", { message: "Нет данных заказ-наряда. Нажми «Перезагрузить»." });
      return;
    }

    const prev = document.title;
    const id = workOrderFull.work_order.id;
    document.title = `ООО "ИНТАХО" — Заказ-наряд №${id}`;

    pushLog("Печать заказ-наряда", "ok", { id });
    window.print();

    setTimeout(() => {
      document.title = prev;
    }, 1000);
  }

  // ===== UI helpers =====
  const card = {
    border: "1px solid #333",
    borderRadius: 12,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };

  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #444",
    background: "transparent",
    color: "inherit",
    boxSizing: "border-box",
  };

  const btn = (primary = false) => ({
    padding: "10px 12px",
    borderRadius: 10,
    border: primary ? "1px solid #666" : "1px solid #444",
    fontWeight: primary ? 700 : 600,
    cursor: "pointer",
    textAlign: "left",
    background: "transparent",
    color: "inherit",
  });

  const filteredClients = useMemo(() => {
    const q = clientsQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const s = `${c.id} ${c.full_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [clients, clientsQuery]);

  // ===== print data calculations =====
  const printWorkItems = workOrderFull?.work_items ?? [];
  const printMatItems = workOrderFull?.material_items ?? [];
  const printPayments = workOrderFull?.payments ?? [];

  const calcItemsSum = (arr) =>
    arr.reduce((sum, x) => sum + Number(x.price ?? (Number(x.qty ?? 0) * Number(x.unit_price ?? 0)) ?? 0), 0);

  const computedTotal = calcItemsSum(printWorkItems) + calcItemsSum(printMatItems);
  const computedPaid = printPayments.reduce((sum, p) => {
    const ok = p.status ? String(p.status) === "paid" : true;
    return sum + (ok ? Number(p.amount ?? 0) : 0);
  }, 0);

  const dbTotal = Number(workOrderFull?.work_order?.total_amount ?? 0);
  const dbPaid = Number(workOrderFull?.work_order?.paid_amount ?? 0);

  const finalTotal = dbTotal > 0 ? dbTotal : computedTotal;
  const finalPaid = dbPaid > 0 ? dbPaid : computedPaid;
  const finalDebt = Math.max(0, finalTotal - finalPaid);

  // ===== UI helpers for rows =====
  function RowKV({ label, value }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ opacity: 0.8 }}>{label}</div>
        <div style={{ fontWeight: 700 }}>{value}</div>
      </div>
    );
  }

  function EmptyHint({ children }) {
    return <div style={{ opacity: 0.7, fontSize: 13 }}>{children}</div>;
  }

  // ===== TECH VIEW: hide heavy debug info behind details =====
  const techAudit = workOrderFull?.audit_log ?? [];
  const techJson = workOrderFull ? JSON.stringify(workOrderFull, null, 2) : "";

  return (
    <>
      {/* === SCREEN UI (hidden on print) === */}
      <div className="no-print">
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0 }}>ООО «ИНТАХО» — Автосервис (MVP)</h1>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => setTab("clients")} style={btn(tab === "clients")}>
                Клиенты
              </button>
              <button onClick={() => setTab("workOrders")} style={btn(tab === "workOrders")}>
                Заказ-наряды
              </button>
              <button onClick={() => setIsLogOpen((v) => !v)} style={btn(isLogOpen)}>
                {isLogOpen ? "Скрыть журнал" : "Показать журнал"}
              </button>

              <button
                onClick={() => {
                  loadClients();
                  loadWorkOrders();
                  loadHealth();
                }}
                style={btn(true)}
              >
                Обновить
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* MAIN */}
            <div style={{ flex: "1 1 760px", display: "grid", gap: 12 }}>
              {tab === "clients" && (
                <>
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0 }}>Реестр клиентов</h2>
                      <button onClick={loadClients} style={btn()} disabled={clientsLoading}>
                        {clientsLoading ? "Загрузка..." : "Перезагрузить"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Создать клиента</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          <input
                            style={input}
                            value={clientForm.full_name}
                            onChange={(e) => setClientForm((p) => ({ ...p, full_name: e.target.value }))}
                            placeholder="ФИО"
                          />
                          <input
                            style={input}
                            value={clientForm.email}
                            onChange={(e) => setClientForm((p) => ({ ...p, email: e.target.value }))}
                            placeholder="Email"
                          />
                          <input
                            style={input}
                            value={clientForm.phone}
                            onChange={(e) => setClientForm((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="Телефон"
                          />
                          <button onClick={createClient} style={btn(true)}>
                            Создать
                          </button>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Поиск</div>
                        <input
                          style={input}
                          value={clientsQuery}
                          onChange={(e) => setClientsQuery(e.target.value)}
                          placeholder="ФИО / email / телефон / id"
                        />
                        <div style={{ opacity: 0.75, marginTop: 8 }}>
                          Всего: <strong>{clients.length}</strong>, Показано: <strong>{filteredClients.length}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, borderTop: "1px solid #333", paddingTop: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Список</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {filteredClients.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedClientId(c.id)}
                            style={{
                              ...btn(),
                              textAlign: "left",
                              borderColor: String(c.id) === String(selectedClientId) ? "#888" : "#444",
                            }}
                          >
                            <strong>#{c.id}</strong> {c.full_name}
                            <div style={{ opacity: 0.75, fontSize: 12 }}>
                              {c.email} · {c.phone}
                            </div>
                          </button>
                        ))}
                        {filteredClients.length === 0 && <EmptyHint>Нет клиентов по фильтру.</EmptyHint>}
                      </div>
                    </div>
                  </div>

                  <div style={card}>
                    <h2 style={{ marginTop: 0 }}>Карточка клиента</h2>

                    {!selectedClient && <EmptyHint>Выбери клиента в реестре.</EmptyHint>}

                    {selectedClient && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 18 }}>
                              #{selectedClient.id} — {selectedClient.full_name}
                            </div>
                            <div style={{ opacity: 0.8 }}>
                              {selectedClient.email} · {selectedClient.phone}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button onClick={() => loadCarsForClient(selectedClient.id)} style={btn()}>
                              Перезагрузить авто
                            </button>
                            <button onClick={() => loadBookingsForClient(selectedClient.id)} style={btn()}>
                              Перезагрузить записи
                            </button>

                            {!isEditingClient && (
                              <button onClick={() => setIsEditingClient(true)} style={btn(true)}>
                                Редактировать клиента
                              </button>
                            )}

                            <button onClick={deleteClient} style={btn()}>
                              Удалить клиента
                            </button>
                          </div>
                        </div>

                        {isEditingClient && (
                          <div style={{ ...card, marginTop: 12 }}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Редактирование клиента</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <input
                                style={input}
                                value={clientEditForm.full_name}
                                onChange={(e) => setClientEditForm((p) => ({ ...p, full_name: e.target.value }))}
                                placeholder="ФИО"
                              />
                              <input
                                style={input}
                                value={clientEditForm.email}
                                onChange={(e) => setClientEditForm((p) => ({ ...p, email: e.target.value }))}
                                placeholder="Email"
                              />
                              <input
                                style={input}
                                value={clientEditForm.phone}
                                onChange={(e) => setClientEditForm((p) => ({ ...p, phone: e.target.value }))}
                                placeholder="Телефон"
                              />
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <button onClick={saveClientEdits} style={btn(true)}>
                                  Сохранить
                                </button>
                                <button onClick={() => setIsEditingClient(false)} style={btn()}>
                                  Отмена
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Добавить авто</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <input
                                style={input}
                                value={carForm.brand}
                                onChange={(e) => setCarForm((p) => ({ ...p, brand: e.target.value }))}
                                placeholder="Марка"
                              />
                              <input
                                style={input}
                                value={carForm.model}
                                onChange={(e) => setCarForm((p) => ({ ...p, model: e.target.value }))}
                                placeholder="Модель"
                              />
                              <input
                                style={input}
                                value={carForm.plate_number}
                                onChange={(e) => setCarForm((p) => ({ ...p, plate_number: e.target.value }))}
                                placeholder="Госномер"
                              />
                              <input
                                style={input}
                                value={carForm.vin}
                                onChange={(e) => setCarForm((p) => ({ ...p, vin: e.target.value }))}
                                placeholder="VIN"
                              />
                              <input
                                style={input}
                                type="number"
                                value={carForm.year}
                                onChange={(e) => setCarForm((p) => ({ ...p, year: e.target.value }))}
                                placeholder="Год (необязательно)"
                              />
                              <button onClick={createCar} style={btn(true)}>
                                Добавить авто
                              </button>
                            </div>

                            <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
                              Авто: <strong>{cars.length}</strong>
                            </div>
                          </div>

                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Создать запись</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <select
                                style={input}
                                value={bookingForm.car_id}
                                onChange={(e) => setBookingForm((p) => ({ ...p, car_id: e.target.value }))}
                                disabled={cars.length === 0}
                              >
                                {cars.length === 0 ? (
                                  <option value="">Нет авто — сначала добавь автомобиль</option>
                                ) : (
                                  cars.map((c) => (
                                    <option key={c.id} value={String(c.id)}>
                                      {carLabel(c)}
                                    </option>
                                  ))
                                )}
                              </select>

                              <input
                                style={input}
                                type="datetime-local"
                                value={bookingForm.scheduled_at}
                                onChange={(e) => setBookingForm((p) => ({ ...p, scheduled_at: e.target.value }))}
                              />
                              <input
                                style={input}
                                value={bookingForm.service_note}
                                onChange={(e) => setBookingForm((p) => ({ ...p, service_note: e.target.value }))}
                                placeholder="Комментарий (что делаем)"
                              />
                              <button onClick={createBooking} style={btn(true)} disabled={cars.length === 0}>
                                Добавить запись
                              </button>
                            </div>

                            <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
                              Записи: <strong>{bookings.length}</strong>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Авто</div>

                            {cars.length === 0 && <EmptyHint>Нет автомобилей.</EmptyHint>}

                            {cars.map((x) => (
                              <div
                                key={x.id}
                                style={{ border: "1px solid #444", borderRadius: 10, padding: 10, marginBottom: 8 }}
                              >
                                {String(editingCarId) === String(x.id) ? (
                                  <>
                                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Редактирование авто #{x.id}</div>
                                    <div style={{ display: "grid", gap: 8 }}>
                                      <input
                                        style={input}
                                        value={carEditForm.brand}
                                        onChange={(e) => setCarEditForm((p) => ({ ...p, brand: e.target.value }))}
                                        placeholder="Марка"
                                      />
                                      <input
                                        style={input}
                                        value={carEditForm.model}
                                        onChange={(e) => setCarEditForm((p) => ({ ...p, model: e.target.value }))}
                                        placeholder="Модель"
                                      />
                                      <input
                                        style={input}
                                        value={carEditForm.plate_number}
                                        onChange={(e) => setCarEditForm((p) => ({ ...p, plate_number: e.target.value }))}
                                        placeholder="Госномер (можно очистить)"
                                      />
                                      <input
                                        style={input}
                                        value={carEditForm.vin}
                                        onChange={(e) => setCarEditForm((p) => ({ ...p, vin: e.target.value }))}
                                        placeholder="VIN (можно очистить)"
                                      />
                                      <input
                                        style={input}
                                        type="number"
                                        value={carEditForm.year ?? ""}
                                        onChange={(e) => setCarEditForm((p) => ({ ...p, year: e.target.value }))}
                                        placeholder="Год (можно очистить)"
                                      />
                                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                        <button onClick={saveCarEdits} style={btn(true)}>
                                          Сохранить
                                        </button>
                                        <button onClick={() => setEditingCarId(null)} style={btn()}>
                                          Отмена
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <strong>{carLabel(x)}</strong>
                                    </div>
                                    <div style={{ opacity: 0.75, fontSize: 12 }}>VIN: {x.vin ?? "-"}</div>
                                    <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                                      <button onClick={() => startEditCar(x)} style={btn()}>
                                        Редактировать
                                      </button>
                                      <button onClick={() => deleteCar(x.id)} style={btn(true)}>
                                        Удалить
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>

                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Записи</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              {bookings.map((b) => (
                                <div key={b.id} style={{ border: "1px solid #444", borderRadius: 10, padding: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div>
                                      <strong>#{b.id}</strong> · статус: <code>{b.status ?? "?"}</code>
                                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                                        Запланировано: <code>{fmtDt(b.scheduled_at)}</code>
                                      </div>
                                      <div style={{ opacity: 0.8 }}>{b.service_note ?? b.comment ?? ""}</div>
                                    </div>
                                    <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                                      <button onClick={() => confirmBooking(b.id)} style={btn()}>
                                        Подтвердить
                                      </button>
                                      <button onClick={() => createWorkOrderFromBooking(b.id)} style={btn(true)}>
                                        Создать заказ-наряд
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {bookings.length === 0 && <EmptyHint>Нет записей.</EmptyHint>}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {tab === "workOrders" && (
                <>
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0 }}>Реестр заказ-нарядов</h2>
                      <button onClick={loadWorkOrders} style={btn()} disabled={workOrdersLoading}>
                        {workOrdersLoading ? "Загрузка..." : "Перезагрузить"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {workOrders.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => setSelectedWorkOrderId(w.id)}
                          style={{
                            ...btn(),
                            borderColor: String(w.id) === String(selectedWorkOrderId) ? "#888" : "#444",
                          }}
                        >
                          <strong>ЗН #{w.id}</strong> · запись: <code>{w.booking_id}</code> · статус:{" "}
                          <code>{woStatusLabel(w.status)}</code>
                          <div style={{ opacity: 0.75, fontSize: 12 }}>
                            итого: {fmtMoney(w.total_amount)} · оплачено: {fmtMoney(w.paid_amount)}
                          </div>
                        </button>
                      ))}
                      {workOrders.length === 0 && <EmptyHint>Пока нет заказ-нарядов.</EmptyHint>}
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0 }}>Карточка заказ-наряда</h2>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={() => selectedWorkOrderId && loadWorkOrderFull(selectedWorkOrderId)} style={btn()}>
                          Перезагрузить
                        </button>
                        <button onClick={printWorkOrder} style={btn(true)}>
                          Печать заказ-наряда
                        </button>
                      </div>
                    </div>

                    {!selectedWorkOrderId && <EmptyHint>Выбери заказ-наряд в реестре.</EmptyHint>}

                    {selectedWorkOrderId && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Статус</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <select style={input} value={woStatus} onChange={(e) => setWoStatus(e.target.value)}>
                                <option value="created">Создан</option>
                                <option value="in_progress">В работе</option>
                                <option value="waiting_approval">Ожидает согласования</option>
                                <option value="ready">Готов</option>
                                <option value="closed">Закрыт</option>
                                <option value="cancelled">Отменён</option>
                              </select>
                              <button onClick={updateWorkOrderStatus} style={btn(true)}>
                                Сохранить статус
                              </button>
                            </div>
                          </div>

                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Оплата</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <input
                                style={input}
                                type="number"
                                value={paymentForm.amount}
                                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                              />
                              <select
                                style={input}
                                value={paymentForm.method}
                                onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                              >
                                <option value="card">Карта</option>
                                <option value="cash">Наличные</option>
                                <option value="transfer">Перевод</option>
                              </select>
                              <button onClick={addPayment} style={btn(true)}>
                                Добавить оплату
                              </button>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Работа</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <input
                                style={input}
                                value={workItemForm.name}
                                onChange={(e) => setWorkItemForm((p) => ({ ...p, name: e.target.value }))}
                                placeholder="Название работы"
                              />
                              <input
                                style={input}
                                type="number"
                                value={workItemForm.price}
                                onChange={(e) => setWorkItemForm((p) => ({ ...p, price: e.target.value }))}
                                placeholder="Цена"
                              />
                              <button onClick={addWorkItem} style={btn(true)}>
                                Добавить работу
                              </button>
                            </div>
                          </div>

                          <div style={card}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Материал</div>
                            <div style={{ display: "grid", gap: 8 }}>
                              <input
                                style={input}
                                value={materialForm.name}
                                onChange={(e) => setMaterialForm((p) => ({ ...p, name: e.target.value }))}
                                placeholder="Название материала"
                              />
                              <input
                                style={input}
                                type="number"
                                value={materialForm.price}
                                onChange={(e) => setMaterialForm((p) => ({ ...p, price: e.target.value }))}
                                placeholder="Цена"
                              />
                              <input
                                style={input}
                                type="number"
                                value={materialForm.qty}
                                onChange={(e) => setMaterialForm((p) => ({ ...p, qty: e.target.value }))}
                                placeholder="Количество"
                              />
                              <button onClick={addMaterialItem} style={btn(true)}>
                                Добавить материал
                              </button>
                            </div>
                          </div>
                        </div>

                        <div style={{ ...card, marginTop: 12 }}>
                          <div style={{ fontWeight: 900, marginBottom: 8 }}>Детали заказ-наряда</div>

                          {!workOrderFull && <EmptyHint>Нет данных. Нажми «Перезагрузить».</EmptyHint>}

                          {workOrderFull && (
                            <>
                              <div style={{ border: "1px solid #444", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                <div style={{ fontWeight: 900, fontSize: 16 }}>
                                  ЗН #{workOrderFull.work_order?.id} · статус:{" "}
                                  <code>{woStatusLabel(workOrderFull.work_order?.status)}</code>
                                </div>

                                <div style={{ opacity: 0.85, marginTop: 6, fontSize: 13 }}>
                                  Клиент:{" "}
                                  <strong>{woClient?.full_name ?? `#${workOrderFull.work_order?.client_id ?? "-"}`}</strong>
                                  {woClient?.phone ? ` · ${woClient.phone}` : ""}
                                </div>

                                <div style={{ opacity: 0.85, marginTop: 6, fontSize: 13 }}>
                                  Авто:{" "}
                                  <strong>
                                    {woCar ? `${woCar.brand} ${woCar.model}` : `#${workOrderFull.work_order?.car_id ?? "-"}`}
                                  </strong>
                                  {woCar?.plate_number ? ` · ${woCar.plate_number}` : ""}
                                </div>

                                <div style={{ opacity: 0.85, marginTop: 10, display: "grid", gap: 6 }}>
                                  <RowKV label="Итого" value={fmtMoney(finalTotal)} />
                                  <RowKV label="Оплачено" value={fmtMoney(finalPaid)} />
                                  <RowKV label="Долг" value={fmtMoney(finalDebt)} />
                                </div>

                                <div style={{ opacity: 0.7, marginTop: 10, fontSize: 12 }}>
                                  Создан: <code>{fmtDt(workOrderFull.work_order?.created_at)}</code> · Обновлён:{" "}
                                  <code>{fmtDt(workOrderFull.work_order?.updated_at)}</code>
                                </div>
                              </div>

                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div style={{ border: "1px solid #444", borderRadius: 10, padding: 12 }}>
                                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                                    Работы ({workOrderFull.work_items?.length ?? 0})
                                  </div>

                                  {(!workOrderFull.work_items || workOrderFull.work_items.length === 0) && (
                                    <EmptyHint>Пока нет работ.</EmptyHint>
                                  )}

                                  {workOrderFull.work_items?.map((x) => (
                                    <div
                                      key={x.id}
                                      style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8 }}
                                    >
                                      <div style={{ fontWeight: 700 }}>
                                        {x.name} <span style={{ opacity: 0.7, fontWeight: 400 }}>#{x.id}</span>
                                      </div>
                                      <div style={{ opacity: 0.85, fontSize: 12 }}>
                                        Кол-во: <code>{x.qty}</code> · Цена: <code>{fmtMoney(x.unit_price)}</code> · Сумма:{" "}
                                        <code>{fmtMoney(x.price)}</code>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div style={{ border: "1px solid #444", borderRadius: 10, padding: 12 }}>
                                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                                    Материалы ({workOrderFull.material_items?.length ?? 0})
                                  </div>

                                  {(!workOrderFull.material_items || workOrderFull.material_items.length === 0) && (
                                    <EmptyHint>Пока нет материалов.</EmptyHint>
                                  )}

                                  {workOrderFull.material_items?.map((x) => (
                                    <div
                                      key={x.id}
                                      style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8 }}
                                    >
                                      <div style={{ fontWeight: 700 }}>
                                        {x.name} <span style={{ opacity: 0.7, fontWeight: 400 }}>#{x.id}</span>
                                      </div>
                                      <div style={{ opacity: 0.85, fontSize: 12 }}>
                                        Кол-во: <code>{x.qty}</code> · Цена: <code>{fmtMoney(x.unit_price)}</code> · Сумма:{" "}
                                        <code>{fmtMoney(x.price)}</code>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div style={{ marginTop: 12, border: "1px solid #444", borderRadius: 10, padding: 12 }}>
                                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                                  Оплаты ({workOrderFull.payments?.length ?? 0})
                                </div>

                                {(!workOrderFull.payments || workOrderFull.payments.length === 0) && (
                                  <EmptyHint>Пока нет оплат.</EmptyHint>
                                )}

                                {workOrderFull.payments?.map((p) => (
                                  <div key={p.id} style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                      <div style={{ fontWeight: 700 }}>
                                        {payMethodLabel(p.method)}{" "}
                                        <span style={{ opacity: 0.7, fontWeight: 400 }}>#{p.id}</span>
                                      </div>
                                      <div style={{ fontWeight: 800 }}>{fmtMoney(p.amount)}</div>
                                    </div>
                                    <div style={{ opacity: 0.75, fontSize: 12 }}>{fmtDt(p.created_at)}</div>
                                  </div>
                                ))}
                              </div>

                              {/* ===== TECH INFO: audit log + raw JSON hidden by default ===== */}
                              <details style={{ marginTop: 12 }}>
                                <summary style={{ cursor: "pointer", opacity: 0.85 }}>
                                  Техническая информация (для разработки)
                                </summary>

                                <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                                  <div style={{ border: "1px solid #444", borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontWeight: 800, marginBottom: 8 }}>
                                      Журнал событий ({techAudit.length})
                                    </div>

                                    {techAudit.length === 0 ? (
                                      <EmptyHint>Пока нет событий.</EmptyHint>
                                    ) : (
                                      techAudit.map((x) => (
                                        <div
                                          key={x.id}
                                          style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8 }}
                                        >
                                          <div style={{ fontSize: 13 }}>
                                            #{x.id} · {x.entity}:{x.entity_id} · <code>{x.action}</code>
                                          </div>
                                          <div style={{ opacity: 0.8, fontSize: 12 }}>{fmtDt(x.created_at)}</div>
                                        </div>
                                      ))
                                    )}
                                  </div>

                                  <div style={{ border: "1px solid #444", borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontWeight: 800, marginBottom: 8 }}>Сырой JSON</div>
                                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{techJson}</pre>
                                  </div>
                                </div>
                              </details>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* LOG */}
            {isLogOpen && (
              <div style={{ flex: "1 1 380px", ...card, position: "sticky", top: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>Журнал</h2>
                  <button onClick={() => setLog([])} style={btn()}>
                    Очистить
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 12, maxHeight: "72vh", overflow: "auto" }}>
                  {log.length === 0 && <EmptyHint>Пока пусто.</EmptyHint>}
                  {log.map((l, idx) => (
                    <div key={idx} style={{ border: "1px solid #444", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <strong>{l.title}</strong>
                        <span style={{ opacity: 0.8 }}>{l.status === "ok" ? "OK" : "Ошибка"}</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{fmtDt(l.at)}</div>
                      {l.payload !== undefined && (
                        <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 12 }}>
                          {JSON.stringify(l.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ opacity: 0.7, fontSize: 13, marginTop: 14 }}>
            MVP интерфейса сотрудника: реестры и карточки сущностей, сквозной бизнес-процесс и работа с API/БД.
          </div>
        </div>
      </div>

      {/* === PRINT AREA (visible only on print) === */}
      <div className="print-area">
        {workOrderFull?.work_order?.id ? (
          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Заказ-наряд № {workOrderFull.work_order.id}</div>
                <div>Организация: ООО «ИНТАХО»</div>
                <div>Статус: {woStatusLabel(workOrderFull.work_order.status)}</div>
                <div>Дата создания: {fmtDt(workOrderFull.work_order.created_at)}</div>
                <div>Дата изменения: {fmtDt(workOrderFull.work_order.updated_at)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>ООО «ИНТАХО»</div>
                <div style={{ fontSize: 11 }}>Печать из системы</div>
              </div>
            </div>

            <hr style={{ margin: "12px 0" }} />

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 280 }}>
                <div style={{ fontWeight: 700 }}>Клиент</div>
                <div>{woClient?.full_name ?? `#${workOrderFull.work_order.client_id ?? "-"}`}</div>
                <div>Телефон: {woClient?.phone ?? "-"}</div>
                <div>Email: {woClient?.email ?? "-"}</div>
              </div>

              <div style={{ minWidth: 280 }}>
                <div style={{ fontWeight: 700 }}>Автомобиль</div>
                <div>{woCar ? `${woCar.brand} ${woCar.model}` : `#${workOrderFull.work_order.car_id ?? "-"}`}</div>
                <div>Госномер: {woCar?.plate_number ?? "-"}</div>
                <div>VIN: {woCar?.vin ?? "-"}</div>
                <div>Год: {woCar?.year ?? "-"}</div>
              </div>

              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 700 }}>Итоги</div>
                <div>Итого: {fmtMoney(finalTotal)}</div>
                <div>Оплачено: {fmtMoney(finalPaid)}</div>
                <div>Долг: {fmtMoney(finalDebt)}</div>
              </div>
            </div>

            <hr style={{ margin: "12px 0" }} />

            <div style={{ fontWeight: 700, marginBottom: 6 }}>Работы</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "left", padding: 6 }}>Наименование</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Кол-во</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Цена</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {printWorkItems.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 6, opacity: 0.8 }}>
                      Нет работ
                    </td>
                  </tr>
                )}
                {printWorkItems.map((x) => (
                  <tr key={x.id}>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{x.name}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>{x.qty}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>
                      {fmtMoney(x.unit_price)}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>
                      {fmtMoney(x.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ height: 12 }} />

            <div style={{ fontWeight: 700, marginBottom: 6 }}>Материалы</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "left", padding: 6 }}>Наименование</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Кол-во</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Цена</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {printMatItems.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 6, opacity: 0.8 }}>
                      Нет материалов
                    </td>
                  </tr>
                )}
                {printMatItems.map((x) => (
                  <tr key={x.id}>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{x.name}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>{x.qty}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>
                      {fmtMoney(x.unit_price)}
                    </td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>
                      {fmtMoney(x.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ height: 12 }} />

            <div style={{ fontWeight: 700, marginBottom: 6 }}>Оплаты</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "left", padding: 6 }}>Дата</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "left", padding: 6 }}>Способ</th>
                  <th style={{ borderBottom: "1px solid #999", textAlign: "right", padding: 6 }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {printPayments.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 6, opacity: 0.8 }}>
                      Нет оплат
                    </td>
                  </tr>
                )}
                {printPayments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{fmtDt(p.created_at)}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{payMethodLabel(p.method)}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: 6, textAlign: "right" }}>
                      {fmtMoney(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>Исполнитель: ____________________</div>
              <div>Клиент: ____________________</div>
            </div>
          </div>
        ) : (
          <div>Нет данных для печати.</div>
        )}
      </div>
    </>
  );
}
