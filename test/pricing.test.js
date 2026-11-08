const assert = require('assert');
import { calculateMinimumSalePrice, calculateSuggestedSalePriceFromNetPurchase } from '../renderer/src/utils/pricing';

describe('calculateMinimumSalePrice', () => {
  it('uses the stricter cash or margin threshold and applies sales VAT', () => {
    assert.deepStrictEqual(calculateMinimumSalePrice(100, 10, 10, 23), { net: 111.12, gross: 136.68 });
    assert.deepStrictEqual(calculateMinimumSalePrice(100, 20, 10, 23), { net: 120, gross: 147.6 });
  });

});

describe('calculateSuggestedSalePriceFromNetPurchase', () => {
  it('uses purchase VAT defaults, deductible VAT, margin thresholds, and sales VAT', () => {
    assert.deepStrictEqual(
      calculateSuggestedSalePriceFromNetPurchase(100, 23, 50, 10, 10, 8),
      { net: 123.89, gross: 133.8 }
    );
  });

  it('rejects invalid purchase costs and VAT defaults', () => {
    assert.strictEqual(calculateSuggestedSalePriceFromNetPurchase(100, 23, 101, 10, 10, 8), null);
    assert.strictEqual(calculateSuggestedSalePriceFromNetPurchase(-1, 23, 100, 10, 10, 8), null);
  });
});

describe('invalid margin rules', () => {
  it('rejects impossible or invalid margin rules', () => {
    assert.strictEqual(calculateMinimumSalePrice(100, 10, 100, 23), null);
    assert.strictEqual(calculateMinimumSalePrice(-1, 10, 10, 23), null);
  });
});
