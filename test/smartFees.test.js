const { smartFeeForOrderValue, expectedSmartFee } = require('../electron/smartFees');

describe('Allegro Smart! fee tiers (standard account)', () => {
  it.each([
    [29.99, null], [30, 1.59], [44.99, 1.59], [45, 3.19], [64.99, 3.19],
    [65, 5.19], [99.99, 5.19], [100, 7.89], [149.99, 7.89], [150, 9.99], [660, 9.99]
  ])('maps order value %s to fee %s', (value, fee) => {
    expect(smartFeeForOrderValue(value)).toBe(fee);
  });

  it('returns null for missing or invalid order values', () => {
    expect(smartFeeForOrderValue(null)).toBeNull();
    expect(smartFeeForOrderValue(undefined)).toBeNull();
    expect(smartFeeForOrderValue('abc')).toBeNull();
  });

  it('charges every parcel the tier fee below 150 PLN', () => {
    expect(expectedSmartFee(100, 2)).toBe(15.78);
    expect(expectedSmartFee(49.99, 3)).toBe(9.57);
  });

  it('charges following parcels 7.89 PLN from 150 PLN', () => {
    expect(expectedSmartFee(150, 1)).toBe(9.99);
    expect(expectedSmartFee(150, 3)).toBe(25.77);
  });

  it('treats a missing shipment count as one parcel and ignores orders below 30 PLN', () => {
    expect(expectedSmartFee(65, 0)).toBe(5.19);
    expect(expectedSmartFee(20, 2)).toBeNull();
  });
});
