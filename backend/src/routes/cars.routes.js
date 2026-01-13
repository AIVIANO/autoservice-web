const { Router } = require("express");
const c = require("../controllers/cars.controller");

const router = Router();

router.post("/cars", c.createCar);
router.get("/cars", c.listCars);
router.get("/cars/:id", c.getCar);

router.patch("/cars/:id", c.patchCar);
router.delete("/cars/:id", c.deleteCar);

module.exports = router;
