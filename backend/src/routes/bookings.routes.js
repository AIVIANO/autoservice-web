const { Router } = require("express");
const c = require("../controllers/bookings.controller");

const router = Router();

router.post("/bookings", c.createBooking);
router.get("/bookings", c.listBookings);
router.get("/bookings/:id", c.getBooking);
router.patch("/bookings/:id/status", c.patchBookingStatus);

module.exports = router;