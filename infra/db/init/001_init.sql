-- 001_init.sql
-- DB schema for autoservice web-system (Booking + WorkOrder as core)

CREATE TABLE IF NOT EXISTS clients (
  id           BIGSERIAL PRIMARY KEY,
  full_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cars (
  id           BIGSERIAL PRIMARY KEY,
  client_id    BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  brand        TEXT NOT NULL,
  model        TEXT NOT NULL,
  plate_number TEXT,
  vin          TEXT,
  year         INT,
  is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- справочник услуг (минимально, чтобы поддержать запись/смету)
CREATE TABLE IF NOT EXISTS services (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  base_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 60,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- справочник материалов/запчастей (минимально)
CREATE TABLE IF NOT EXISTS materials (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL DEFAULT 'pcs',
  price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- запись на обслуживание (booking)
CREATE TABLE IF NOT EXISTS bookings (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  car_id        BIGINT NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  service_id    BIGINT REFERENCES services(id) ON DELETE SET NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  service_note  TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bookings
  ADD CONSTRAINT chk_booking_status
  CHECK (status IN ('new','confirmed','cancelled','completed'));

CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- заказ-наряд (центральная сущность)
CREATE TABLE IF NOT EXISTS work_orders (
  id            BIGSERIAL PRIMARY KEY,
  booking_id    BIGINT UNIQUE REFERENCES bookings(id) ON DELETE SET NULL,
  client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  car_id        BIGINT NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'created',
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE work_orders
  ADD CONSTRAINT chk_work_order_status
  CHECK (status IN ('created','in_progress','waiting_approval','ready','closed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);

-- позиции работ
CREATE TABLE IF NOT EXISTS work_items (
  id            BIGSERIAL PRIMARY KEY,
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  qty           NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_work_items_work_order_id ON work_items(work_order_id);

-- позиции материалов
CREATE TABLE IF NOT EXISTS material_items (
  id            BIGSERIAL PRIMARY KEY,
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  material_id   BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  qty           NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_material_items_work_order_id ON material_items(work_order_id);

-- платежи
CREATE TABLE IF NOT EXISTS payments (
  id            BIGSERIAL PRIMARY KEY,
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  amount        NUMERIC(12,2) NOT NULL,
  method        TEXT NOT NULL DEFAULT 'cash',
  status        TEXT NOT NULL DEFAULT 'created',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ
);

ALTER TABLE payments
  ADD CONSTRAINT chk_payment_status
  CHECK (status IN ('created','paid','cancelled'));

CREATE INDEX IF NOT EXISTS idx_payments_work_order_id ON payments(work_order_id);

-- журнал событий (аудит) для трассируемости
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   BIGINT NOT NULL,
  action      TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);