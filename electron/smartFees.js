// Allegro Smart! rules for sellers with a standard (non-business) account.
// Source: https://help.allegro.com/pl/sell/a/allegro-smart-na-allegro-pl-informacje-dla-sprzedajacych-z-kontem-zwyklym-Wvknkg7VZHD
// All amounts are handled in grosze (integers) so the arithmetic is exact.
const SMART_FEE_TIERS_GROSZE = [
  { minOrderValue: 15000, fee: 999 },
  { minOrderValue: 10000, fee: 789 },
  { minOrderValue: 6500, fee: 519 },
  { minOrderValue: 4500, fee: 319 },
  { minOrderValue: 3000, fee: 159 }
];
const SMART_MAX_SHIPPING_PRICE = 10.95;
const SMART_CASH_ON_DELIVERY_FEE = 4.99;

const toGrosze = (value) => Math.round(Number(value) * 100);
const fromGrosze = (value) => value / 100;

function smartFeeForOrderValue(orderValue) {
  if (orderValue == null || !Number.isFinite(Number(orderValue))) return null;
  const value = toGrosze(orderValue);
  const tier = SMART_FEE_TIERS_GROSZE.find((candidate) => value >= candidate.minOrderValue);
  return tier ? fromGrosze(tier.fee) : null;
}

// Orders below 150 PLN pay the tier fee for every parcel. From 150 PLN the first parcel pays
// the tier fee and every following parcel pays the 100-149.99 PLN rate.
function expectedSmartFee(orderValue, shipments = 1) {
  const firstFee = smartFeeForOrderValue(orderValue);
  if (firstFee == null) return null;
  const parcels = Math.max(1, Math.floor(Number(shipments) || 1));
  const followingFee = toGrosze(orderValue) >= 15000 ? smartFeeForOrderValue(100) : firstFee;
  return fromGrosze(toGrosze(firstFee) + toGrosze(followingFee) * (parcels - 1));
}

module.exports = {
  SMART_FEE_TIERS_GROSZE,
  SMART_MAX_SHIPPING_PRICE,
  SMART_CASH_ON_DELIVERY_FEE,
  smartFeeForOrderValue,
  expectedSmartFee
};
