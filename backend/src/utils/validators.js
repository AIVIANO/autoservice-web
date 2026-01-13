function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

function parseIsoDate(v) {
  if (!isNonEmptyString(v)) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

module.exports = { isNonEmptyString, isPositiveInt, parseIsoDate };