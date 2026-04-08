import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@prisma/client';

import {
  getCreateOrderStockActions,
  getUpdateOrderStockActions,
  shouldValidateStockForOrderStatus,
} from '@/module/customer/order/order.stock-rules';

describe('order.stock-rules', () => {
  it('requires stock validation for pending payment and completed orders', () => {
    expect(shouldValidateStockForOrderStatus(OrderStatus.PENDING)).toBe(false);
    expect(shouldValidateStockForOrderStatus(OrderStatus.PENDING_PAYMENT)).toBe(true);
    expect(shouldValidateStockForOrderStatus(OrderStatus.COMPLETED)).toBe(true);
    expect(shouldValidateStockForOrderStatus(OrderStatus.CANCELLED)).toBe(false);
  });

  it('builds create actions for pending orders', () => {
    expect(getCreateOrderStockActions(OrderStatus.PENDING)).toEqual({
      reserveStock: false,
      confirmStockOutput: false,
      incrementSalesCount: false,
    });
  });

  it('builds create actions for completed orders', () => {
    expect(getCreateOrderStockActions(OrderStatus.COMPLETED)).toEqual({
      reserveStock: true,
      confirmStockOutput: true,
      incrementSalesCount: true,
    });
  });

  it('builds update actions for pending to pending payment', () => {
    expect(getUpdateOrderStockActions(OrderStatus.PENDING, OrderStatus.PENDING_PAYMENT)).toEqual({
      isCompleting: false,
      isConfirmingPayment: true,
      isCancelling: false,
      reserveStock: true,
      confirmStockOutput: false,
      cancelReservation: false,
      incrementSalesCount: false,
      requiresExistingReservation: false,
    });
  });

  it('builds update actions for pending payment to completed', () => {
    expect(getUpdateOrderStockActions(OrderStatus.PENDING_PAYMENT, OrderStatus.COMPLETED)).toEqual({
      isCompleting: true,
      isConfirmingPayment: false,
      isCancelling: false,
      reserveStock: true,
      confirmStockOutput: true,
      cancelReservation: false,
      incrementSalesCount: true,
      requiresExistingReservation: true,
    });
  });

  it('builds update actions for pending payment cancellation', () => {
    expect(getUpdateOrderStockActions(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)).toEqual({
      isCompleting: false,
      isConfirmingPayment: false,
      isCancelling: true,
      reserveStock: false,
      confirmStockOutput: false,
      cancelReservation: true,
      incrementSalesCount: false,
      requiresExistingReservation: true,
    });
  });
});
