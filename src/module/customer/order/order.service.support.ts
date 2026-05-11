import prisma from '@/config/prisma';
import {
  publishNotification,
  publishRealtimeUpdate,
  NotificationPriority,
  NotificationType,
} from '@/config/event-publisher';
import { InventoryService } from '@/module/inventory/inventory.service';
import { invalidateOrderCaches, ORDER_CACHE_PREFIX } from './order.helpers';
import { getCreateOrderStockActions, getUpdateOrderStockActions } from './order.stock-rules';
import { runInBackground } from '@/utils/background-task';
import { OrderStatus, TransactionType } from '@prisma/client';

const publishDashboardRefresh = async (subscriptionId: string) => {
  await Promise.all([
    publishRealtimeUpdate(subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' }),
    publishRealtimeUpdate(subscriptionId, 'DASHBOARD', { action: 'REFRESH_DASHBOARD' }),
  ]);
};

export const buildOrderListCacheKey = (
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filters?: {
    societyCode?: string;
    societyId?: string;
    branchId?: string;
    partnerId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    totalAmountFrom?: number;
    totalAmountTo?: number;
    createdBy?: string;
  }
) => {
  const societyCode = filters?.societyCode || filters?.societyId;
  const cacheKeyParts = [
    'list',
    societyCode || 'all',
    filters?.branchId || 'all',
    filters?.partnerId || 'all',
    filters?.status || 'all',
    filters?.search || 'all',
    filters?.dateFrom || 'all',
    filters?.dateTo || 'all',
    filters?.totalAmountFrom || 'all',
    filters?.totalAmountTo || 'all',
    filters?.createdBy || 'all',
    page,
    limit,
    sortBy,
    sortOrder,
  ];

  return `${ORDER_CACHE_PREFIX}${cacheKeyParts.join(':')}`;
};

export const buildOrderDetailCacheKey = (id: string) => `${ORDER_CACHE_PREFIX}${id}`;

export const applyOrderCreateInventoryEffects = async (
  newOrder: { id: string; orderCode: string; status: OrderStatus },
  itemsToCreate: Array<{ productId: string; quantity: number }>,
  branchId: string,
  tx: any
) => {
  const stockActions = getCreateOrderStockActions(newOrder.status);

  if (stockActions.reserveStock) {
    for (const item of itemsToCreate) {
      await InventoryService.reserveStock(item.productId, branchId, item.quantity, tx);
    }
  }

  if (stockActions.confirmStockOutput) {
    for (const item of itemsToCreate) {
      await InventoryService.confirmStockOutput({
        productId: item.productId,
        branchOfficeId: branchId,
        quantity: item.quantity,
        type: TransactionType.SALE_EXIT,
        unitCost: 0,
        totalCost: 0,
        referenceId: newOrder.id,
        referenceType: 'ORDER',
        documentNumber: newOrder.orderCode,
      }, tx);
    }
  }

  if (stockActions.incrementSalesCount) {
    for (const item of itemsToCreate) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          salesCount: { increment: item.quantity },
        },
      });
    }
  }
};

export const applyOrderUpdateStatusEffects = async (
  currentStatus: OrderStatus,
  updated: {
    id: string;
    orderCode: string;
    branchId: string;
    orderItems: Array<{ productId: string; quantity: number; costPrice: unknown; unitPrice: unknown }>;
  },
  nextStatus: OrderStatus | undefined,
  tx: any
) => {
  const stockActions = getUpdateOrderStockActions(currentStatus, nextStatus);
  const { isCompleting, isConfirmingPayment, isCancelling } = stockActions;

  if (isConfirmingPayment) {
    for (const item of updated.orderItems) {
      await InventoryService.reserveStock(item.productId, updated.branchId, item.quantity, tx);
    }
  }

  if (isCompleting) {
    for (const item of updated.orderItems) {
      const wasReserved = stockActions.requiresExistingReservation;

      if (!wasReserved) {
        await InventoryService.reserveStock(item.productId, updated.branchId, item.quantity, tx);
      }

      await InventoryService.confirmStockOutput({
        productId: item.productId,
        branchOfficeId: updated.branchId,
        quantity: item.quantity,
        type: TransactionType.SALE_EXIT,
        unitCost: Number(item.costPrice),
        totalCost: Number(item.unitPrice) * item.quantity,
        referenceId: updated.id,
        referenceType: 'ORDER',
        documentNumber: updated.orderCode,
      }, tx);
    }

    if (stockActions.incrementSalesCount) {
      for (const item of updated.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            salesCount: { increment: item.quantity },
          },
        });
      }
    }
  }

  if (isCancelling) {
    for (const item of updated.orderItems) {
      await InventoryService.cancelReservation(item.productId, updated.branchId, item.quantity, tx);
    }
  }

  return { isCompleting, isConfirmingPayment, isCancelling };
};

export const publishCompletedOrderNotifications = async (input: {
  subscriptionId: string;
  order: { id: string; orderCode: string; totalAmount: unknown };
  partnerName: string;
}) => {
  const { subscriptionId, order, partnerName } = input;

  await Promise.all([
    publishRealtimeUpdate(subscriptionId, 'VENTA', {
      id: order.id,
      status: 'COMPLETADO',
      orderCode: order.orderCode,
      totalAmount: order.totalAmount,
      partnerName,
      paidAt: new Date(),
    }),
    publishDashboardRefresh(subscriptionId),
    publishNotification({
      type: NotificationType.SALES,
      title: 'Venta Realizada',
      message: `La orden #${order.orderCode} ha sido procesada exitosamente.`,
      subscriptionId,
      priority: NotificationPriority.HIGH,
      link: `/orders/history?id=${order.id}`,
      metadata: {
        orderId: order.id,
        amount: order.totalAmount,
      },
    }),
  ]);
};

export const scheduleOrderCreateSideEffects = (
  order: { id: string; orderCode: string; totalAmount: unknown; status: OrderStatus },
  society: { id: string; subscriptionId?: string | null },
  partner: { companyName?: string | null; firstName?: string | null; lastName?: string | null }
) => {
  runInBackground(
    {
      taskName: 'order.create.side-effects',
      context: { orderId: order.id, societyId: society.id, status: order.status },
    },
    async () => {
      if (order.status === OrderStatus.COMPLETED && society.subscriptionId) {
        const partnerName = partner.companyName ||
          `${partner.firstName || ''} ${partner.lastName || ''}`.trim();

        await publishCompletedOrderNotifications({
          subscriptionId: society.subscriptionId,
          order,
          partnerName,
        });
      }

      await invalidateOrderCaches(society.id);
    }
  );
};

export const scheduleOrderUpdateSideEffects = (
  result: { id: string; societyId: string },
  orderId: string,
  isCompleting: boolean
) => {
  runInBackground(
    {
      taskName: 'order.update.side-effects',
      context: { orderId, resultOrderId: result.id, societyId: result.societyId, isCompleting },
    },
    async () => {
      if (isCompleting) {
        const fullOrder = await prisma.order.findUnique({
          where: { id: result.id },
          include: {
            society: { select: { subscriptionId: true } },
            partner: { select: { companyName: true, firstName: true, lastName: true } },
          },
        });

        if (fullOrder?.society?.subscriptionId) {
          const partnerName = fullOrder.partner.companyName ||
            `${fullOrder.partner.firstName || ''} ${fullOrder.partner.lastName || ''}`.trim();

          await publishCompletedOrderNotifications({
            subscriptionId: fullOrder.society.subscriptionId,
            order: fullOrder,
            partnerName,
          });
        }
      }

      await invalidateOrderCaches(result.societyId, orderId);
    }
  );
};

export const scheduleOrderDeleteSideEffects = (societyId: string, orderId: string) => {
  runInBackground(
    {
      taskName: 'order.delete.side-effects',
      context: { societyId, orderId },
    },
    async () => {
      await invalidateOrderCaches(societyId, orderId);
    }
  );
};

export const buildOrderReportRows = (
  orders: Array<any>,
  formatToLimaTime: (value: Date, format: string) => string
) => {
  const translateStatus = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 'Pendiente',
      PENDING_PAYMENT: 'Pendiente de Pago',
      COMPLETED: 'Completado',
      CANCELLED: 'Cancelado',
    };
    return map[status] || status;
  };

  const translatePaymentMethod = (method: string) => {
    const map: Record<string, string> = {
      CASH: 'Efectivo',
      CARD: 'Tarjeta',
      YAPE: 'Yape',
      PLIN: 'Plin',
      TRANSFER: 'Transferencia',
      OTHER: 'Otro',
    };
    return map[method] || method;
  };

  const data: any[] = [];

  orders.forEach(order => {
    const partnerName = order.partner.companyName || `${order.partner.firstName || ''} ${order.partner.lastName || ''}`.trim();
    const paymentMethods = order.OrderPayment.map((payment: any) => translatePaymentMethod(payment.paymentMethod)).join(', ') || 'Sin Pago';
    const statusEsp = translateStatus(order.status);

    let resolvedPaymentDate = order.paymentDate;
    if (!resolvedPaymentDate && order.OrderPayment.length > 0) {
      resolvedPaymentDate = order.OrderPayment.reduce((max: Date, payment: any) =>
        payment.paymentDate > max ? payment.paymentDate : max,
      order.OrderPayment[0].paymentDate);
    }

    const baseInfo = {
      'Código Orden': order.orderCode,
      'Fecha Orden': formatToLimaTime(order.orderDate, 'dd/MM/yyyy'),
      'Hora Orden': formatToLimaTime(order.orderDate, 'HH:mm:ss'),
      'Fecha Pago': resolvedPaymentDate ? formatToLimaTime(resolvedPaymentDate, 'dd/MM/yyyy') : 'Pendiente',
      'Hora Pago': resolvedPaymentDate ? formatToLimaTime(resolvedPaymentDate, 'HH:mm:ss') : 'N/A',
      'Estado': statusEsp,
      'Cliente': partnerName,
      'Doc. Cliente': order.partner.documentNumber,
      'Sucursal': order.branch.name,
      'Moneda': order.currency.code,
      'Método Pago': paymentMethods,
      'Subtotal Orden': Number(order.subtotal),
      'Impuesto Orden': Number(order.taxAmount),
      'Descuento Global': Number(order.discount),
      'Total Orden': Number(order.totalAmount),
    };

    if (order.orderItems.length === 0) {
      data.push({
        ...baseInfo,
        'Categoría': 'N/A',
        'Producto': 'N/A',
        'Código Producto': 'N/A',
        'Cantidad': 0,
        'Precio Unit.': 0,
        'Descuento Item': 0,
        'Subtotal Item': 0,
        'Total Item': 0,
      });
      return;
    }

    order.orderItems.forEach((item: any) => {
      data.push({
        ...baseInfo,
        'Categoría': item.product.category?.name ?? 'N/A',
        'Producto': item.product.name,
        'Código Producto': item.product.code,
        'Cantidad': item.quantity,
        'Precio Unit.': Number(item.unitPrice),
        'Descuento Item': Number(item.discount),
        'Subtotal Item': Number(item.subtotal),
        'Total Item': Number(item.total),
      });
    });
  });

  return data;
};
