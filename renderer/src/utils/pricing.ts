export function calculateMinimumSalePrice(
  effectivePurchaseCost: number,
  minimumProfitAmount: number,
  minimumProfitMarginPercent: number,
  salesVatRate: number
) {
  if (
    !Number.isFinite(effectivePurchaseCost) || effectivePurchaseCost < 0 ||
    !Number.isFinite(minimumProfitAmount) || minimumProfitAmount < 0 ||
    !Number.isFinite(minimumProfitMarginPercent) || minimumProfitMarginPercent < 0 || minimumProfitMarginPercent >= 100 ||
    !Number.isFinite(salesVatRate) || salesVatRate < 0
  ) return null

  const minimumNet = Math.max(
    effectivePurchaseCost + minimumProfitAmount,
    effectivePurchaseCost / (1 - minimumProfitMarginPercent / 100)
  )
  const net = Math.ceil((minimumNet - Number.EPSILON) * 100) / 100
  const gross = Math.round(net * (1 + salesVatRate / 100) * 100) / 100
  return { net, gross }
}

export function calculateSuggestedSalePriceFromNetPurchase(
  netPurchaseCost: number,
  purchaseVatRate: number,
  vatDeductiblePercent: number,
  minimumProfitAmount: number,
  minimumProfitMarginPercent: number,
  salesVatRate: number
) {
  if (
    !Number.isFinite(netPurchaseCost) || netPurchaseCost < 0 ||
    !Number.isFinite(purchaseVatRate) || purchaseVatRate < 0 || purchaseVatRate > 100 ||
    !Number.isFinite(vatDeductiblePercent) || vatDeductiblePercent < 0 || vatDeductiblePercent > 100
  ) return null

  const effectivePurchaseCost = netPurchaseCost * (
    1 + purchaseVatRate / 100 * (1 - vatDeductiblePercent / 100)
  )
  return calculateMinimumSalePrice(
    effectivePurchaseCost,
    minimumProfitAmount,
    minimumProfitMarginPercent,
    salesVatRate
  )
}
