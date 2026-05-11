import { describe, expect, it } from 'vitest';

import {
  getCancellationStockDelta,
  getConfirmationStockDelta,
  getManualAdjustmentStockDelta,
  getReservationStockDelta,
} from '@/module/inventory/inventory.stock-rules';

describe('inventory.stock-rules', () => {
  it('builds manual adjustment deltas', () => {
    expect(getManualAdjustmentStockDelta(5)).toEqual({
      productStock: 5,
      branchPhysicalStock: 5,
      branchAvailableStock: 5,
      updatesLastRestockedAt: true,
    });

    expect(getManualAdjustmentStockDelta(-3)).toEqual({
      productStock: -3,
      branchPhysicalStock: -3,
      branchAvailableStock: -3,
      updatesLastRestockedAt: false,
    });
  });

  it('builds reservation deltas as stock transfer to reserved', () => {
    expect(getReservationStockDelta(4)).toEqual({
      quantity: 4,
      branchReservedStock: 4,
    });
  });

  it('builds confirmation deltas as stock exit from physical and reserved', () => {
    expect(getConfirmationStockDelta(2)).toEqual({
      quantity: 2,
    });
  });

  it('builds cancellation deltas restoring available and global stock', () => {
    expect(getCancellationStockDelta(6)).toEqual({
      quantity: 6,
    });
  });
});
