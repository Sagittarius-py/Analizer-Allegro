const assert = require('assert');
import { calculateMinimumSalePrice } from '../renderer/src/utils/pricing';

describe('calculateMinimumSalePrice', () => {
  it('uses the stricter cash or margin threshold and applies sales VAT', () => {
    assert.deepStrictEqual(calculateMinimumSalePrice(100, 10, 10, 23), { net: 111.12, gross: 136.68 });
    assert.deepStrictEqual(calculateMinimumSalePrice(100, 20, 10, 23), { net: 120, gross: 147.6 });
  });

  it('rejects impossible or invalid margin rules', () => {
    assert.strictEqual(calculateMinimumSalePrice(100, 10, 100, 23), null);
    assert.strictEqual(calculateMinimumSalePrice(-1, 10, 10, 23), null);
  });
});
