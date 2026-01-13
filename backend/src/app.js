const express = require("express");

const healthRoutes = require("./routes/health.routes");
const clientsRoutes = require("./routes/clients.routes");
const carsRoutes = require("./routes/cars.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const workOrdersRoutes = require("./routes/workOrders.routes");

const { errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.use(express.json());

// health (без /api)
app.use(healthRoutes);

// API (всё под /api/...)
app.use("/api", clientsRoutes);
app.use("/api", carsRoutes);
app.use("/api", bookingsRoutes);
app.use("/api", workOrdersRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// errors
app.use(errorHandler);

module.exports = { app };
