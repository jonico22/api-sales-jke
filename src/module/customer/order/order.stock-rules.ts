import { OrderStatus } from '@prisma/client';

export const shouldValidateStockForOrderStatus = (status: OrderStatus) => {
  return status === OrderStatus.PENDING_PAYMENT || status === OrderStatus.COMPLETED;
};

export const getCreateOrderStockActions = (status: OrderStatus) => ({
  reserveStock: shouldValidateStockForOrderStatus(status),
  confirmStockOutput: status === OrderStatus.COMPLETED,
  incrementSalesCount: status === OrderStatus.COMPLETED,
});

export const getUpdateOrderStockActions = (
  currentStatus: OrderStatus,
  nextStatus: OrderStatus | undefined
) => {
  const isCompleting = nextStatus === OrderStatus.COMPLETED && currentStatus !== OrderStatus.COMPLETED;
  const isConfirmingPayment =
    nextStatus === OrderStatus.PENDING_PAYMENT && currentStatus === OrderStatus.PENDING;
  const isCancelling =
    nextStatus === OrderStatus.CANCELLED && currentStatus === OrderStatus.PENDING_PAYMENT;

  return {
    isCompleting,
    isConfirmingPayment,
    isCancelling,
    reserveStock: isConfirmingPayment || isCompleting,
    confirmStockOutput: isCompleting,
    cancelReservation: isCancelling,
    incrementSalesCount: isCompleting,
    requiresExistingReservation: currentStatus === OrderStatus.PENDING_PAYMENT,
  };
};
