export const getManualAdjustmentStockDelta = (signedQuantity: number) => ({
  productStock: signedQuantity,
  branchPhysicalStock: signedQuantity,
  branchAvailableStock: signedQuantity,
  updatesLastRestockedAt: signedQuantity > 0,
});

export const getReservationStockDelta = (quantity: number) => ({
  quantity: Math.abs(quantity),
  branchReservedStock: Math.abs(quantity),
});

export const getConfirmationStockDelta = (quantity: number) => ({
  quantity: Math.abs(quantity),
});

export const getCancellationStockDelta = (quantity: number) => ({
  quantity: Math.abs(quantity),
});
