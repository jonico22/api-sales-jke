
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { CreateOrderInput, UpdateOrderInput, OrderFilters } from './order.schema';
import {
  buildOrderWhereClause,
  resolveSociety,
  resolveBranch,
  resolvePartner,
  resolveCurrency,
  buildProductMap,
  calculateOrderItems,
  calculateOrderTotals,
  validateBranchStockAvailability,
  ORDER_CACHE_TTL_LIST,
  ORDER_CACHE_TTL_SINGLE,
} from './order.helpers';
import { getUpdateOrderStockActions, shouldValidateStockForOrderStatus } from './order.stock-rules';
import {
  applyOrderCreateInventoryEffects,
  applyOrderUpdateStatusEffects,
  buildOrderDetailCacheKey,
  buildOrderListCacheKey,
  buildOrderReportRows,
  scheduleOrderCreateSideEffects,
  scheduleOrderDeleteSideEffects,
  scheduleOrderUpdateSideEffects,
} from './order.service.support';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Order, OrderStatus } from '@prisma/client';
import { InventoryService } from '@/module/inventory/inventory.service';
import { toLimaTimezone, formatToLimaTime } from '@/utils/dateFormatter';
import { ConflictAppError, NotFoundAppError } from '@/utils/domain-errors';

export const OrderService = {
  getReportRowCount: async (filters?: OrderFilters): Promise<{ rowCount: number; subscriptionId?: string }> => {
    const { whereClause, subscriptionId } = await buildOrderWhereClause(filters);

    const [itemCount, emptyOrderCount] = await prisma.$transaction([
      prisma.orderItem.count({
        where: {
          order: whereClause,
        },
      }),
      prisma.order.count({
        where: {
          ...whereClause,
          orderItems: { none: {} },
        },
      }),
    ]);

    return {
      rowCount: itemCount + emptyOrderCount,
      subscriptionId,
    };
  },

  /**
   * Crear una nueva orden con cálculo de financieros backend-side
   * OPTIMIZADO: Validaciones paralelas, stock batch, notificaciones en background
   */
  create: async (data: CreateOrderInput) => {
    // ─── 1. PARALLEL: Validar entidades + obtener productos ────────────
    // Society must resolve first because Branch needs societyId for composite key
    const society = await resolveSociety(data.societyId);
    data.societyId = society.id;

    // Now resolve Branch, Partner, Currency AND Products in parallel
    const productIds = data.orderItems.map(i => i.productId);
    const [branch, partner, currency, products] = await Promise.all([
      resolveBranch(data.branchId, society.id),
      resolvePartner(data.partnerId),
      resolveCurrency(data.currencyId),
      prisma.product.findMany({ where: { id: { in: productIds } } })
    ]);

    // Re-assign resolved IDs
    data.branchId = branch.id;
    data.partnerId = partner.id;
    data.currencyId = currency.id;

    const productMap = buildProductMap(products);
    const itemsToCreate = calculateOrderItems(data.orderItems, productMap);
    const { orderSubtotal, totalTax, totalAmount } = calculateOrderTotals(itemsToCreate, data.discount);

    // ─── 3. BATCH: Validar Stock (1 sola query en vez de N) ───────────
    if (shouldValidateStockForOrderStatus(data.status)) {
      await validateBranchStockAvailability(data.branchId, productIds, itemsToCreate, productMap);
    }

    // ─── 4. Generar Código ─────────────────────────────────────────────
    const orderCode = data.orderCode || `ORD-${Date.now()}`;

    // ─── 5. Transacción de creación ───────────────────────────────────
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderCode,
          orderDate: toLimaTimezone(data.orderDate || new Date()),
          currencyId: data.currencyId,
          exchangeRate: data.exchangeRate,
          societyId: data.societyId,
          partnerId: data.partnerId,
          branchId: data.branchId,

          deliveryDate: data.deliveryDate ? toLimaTimezone(data.deliveryDate) : null,
          shippingAddress: data.shippingAddress,

          notes: data.notes,
          comment: data.comment,
          paymentDate: data.paymentDate ? toLimaTimezone(data.paymentDate) : null,

          subtotal: orderSubtotal,
          discount: data.discount,
          taxAmount: totalTax,
          totalAmount: totalAmount > 0 ? totalAmount : 0,
          status: data.status || OrderStatus.PENDING,

          createdBy: data.createdBy,

          orderItems: {
            create: itemsToCreate
          }
        },
        include: {
          orderItems: true
        }
      });

      await applyOrderCreateInventoryEffects(newOrder, itemsToCreate, data.branchId, tx);

      return newOrder;
    }, {
      timeout: 30000
    });

    scheduleOrderCreateSideEffects(order, society, partner);

    return order;
  },

  /**
   * Listar Ordenes con filtros y paginación
   */
  getAll: async (
    paginationQuery?: PaginationQuery,
    filters?: OrderFilters
  ): Promise<PaginatedResult<Order & { totalProducts: number }>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy || 'createdAt';
    const sortOrder = paginationQuery?.sortOrder || 'desc';

    const cacheKey = buildOrderListCacheKey(page, limit, sortBy, sortOrder, filters);

    // 1. Cache Check
    const cached = await redis.get<PaginatedResult<Order & { totalProducts: number }>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const { whereClause } = await buildOrderWhereClause(filters);

    const [data, total] = await prisma.$transaction([
      prisma.order.findMany({
        where: whereClause,
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy,
        include: {
          partner: { select: { id: true, companyName: true, firstName: true, lastName: true, documentNumber: true, email: true } },
          currency: { select: { code: true, symbol: true } },
          society: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          OrderPayment: { select: { paymentMethod: true, amount: true } },
          _count: { select: { orderItems: true } }
        }
      }),
      prisma.order.count({ where: whereClause })
    ]);

    // Use _count instead of loading all items just to sum quantity
    const formattedData = data.map(order => ({
      ...order,
      totalProducts: order._count.orderItems
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);

    // Background cache set
    setImmediate(async () => {
      try { await redis.set(cacheKey, result, ORDER_CACHE_TTL_LIST); } catch (_) { }
    });

    return result as PaginatedResult<Order & { totalProducts: number }>;
  },

  /**
   * Obtener por ID con detalle
   */
  getById: async (id: string) => {
    const cacheKey = buildOrderDetailCacheKey(id);
    const cached = await redis.get<Order>(cacheKey);
    if (cached) return cached;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true, companyName: true, firstName: true, lastName: true,
            documentNumber: true, documentType: true, email: true, phone: true,
            address: true
          }
        },
        branch: { select: { id: true, name: true, code: true, address: true } },
        currency: { select: { id: true, code: true, symbol: true, name: true } },
        society: { select: { id: true, name: true, code: true } },
        orderItems: {
          include: {
            product: {
              select: {
                id: true, name: true, code: true, imageId: true,
                price: true, priceCost: true
              }
            }
          }
        },
        OrderPayment: {
          select: {
            id: true, paymentMethod: true, amount: true, paymentDate: true,
            referenceCode: true, imageId: true, status: true
          }
        }
      }
    });

    if (order) {
      setImmediate(async () => {
        try { await redis.set(cacheKey, order, ORDER_CACHE_TTL_SINGLE); } catch (_) { }
      });
    }
    return order;
  },

  /**
   * Actualizar Orden
   */
  update: async (id: string, data: UpdateOrderInput) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { orderItems, societyId, ...updateData } = data;

    // Check for Status Change to COMPLETED
    const currentOrder = await prisma.order.findUnique({
      where: { id },
      include: { orderItems: true }
    });

    if (!currentOrder) throw new NotFoundAppError('Orden no encontrada', { id });

    const isCompleting = updateData.status === OrderStatus.COMPLETED && currentOrder.status !== OrderStatus.COMPLETED;
    const stockActions = getUpdateOrderStockActions(currentOrder.status, updateData.status);

    if (stockActions.reserveStock && !stockActions.requiresExistingReservation) {
      const productIds = currentOrder.orderItems.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } }
      });
      const productMap = buildProductMap(products);
      const itemsToValidate = currentOrder.orderItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        subtotal: Number(item.subtotal),
        taxAmount: Number(item.taxAmount),
        total: Number(item.total),
        comment: item.comment ?? undefined,
        costPrice: Number(item.costPrice),
      }));

      await validateBranchStockAvailability(currentOrder.branchId, productIds, itemsToValidate, productMap);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: { orderItems: true }
      });

      await applyOrderUpdateStatusEffects(currentOrder.status, updated, updateData.status, tx);

      return updated;
    }, {
      timeout: 30000
    });

    scheduleOrderUpdateSideEffects(result, id, isCompleting);

    return result;
  },

  /**
   * Delete / Cancel
   */
  delete: async (id: string) => {
    // Soft delete or Cancel logic
    const order = await prisma.order.findUnique({
      where: { id },
      include: { orderItems: true }
    });

    if (!order) throw new NotFoundAppError('Orden no encontrada', { id });
    if (order.status === OrderStatus.COMPLETED) throw new ConflictAppError('No se puede cancelar una orden completada', { id });
    if (order.status === OrderStatus.CANCELLED) return order;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Return Stock if Pending Payment (Reserved)
      if (order.status === OrderStatus.PENDING_PAYMENT) {
        for (const item of order.orderItems) {
          await InventoryService.cancelReservation(
            item.productId,
            order.branchId,
            item.quantity,
            tx
          );
        }
      }

      // 2. Update Status
      return tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: 'Deleted/Cancelled via API',
          updatedAt: new Date()
        }
      });
    }, {
      timeout: 30000
    });

    scheduleOrderDeleteSideEffects(result.societyId, id);

    return result;
  },

  /**
   * Generar reporte Excel (Buffer) con detalle de items y métodos de pago
   */
  getReport: async (filters?: OrderFilters): Promise<{ buffer: Buffer; subscriptionId?: string }> => {
    const REPORT_BATCH_SIZE = 500;

    // 1. Construir WHERE (reutilizando lógica)
    const { whereClause, subscriptionId } = await buildOrderWhereClause(filters);

    // 2. Consultar en lotes y generar filas del Excel incrementalmente
    const reportBatches = async function* () {
      let skip = 0;

      while (true) {
        const orders = await prisma.order.findMany({
          where: whereClause,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: REPORT_BATCH_SIZE,
          select: {
            orderCode: true,
            orderDate: true,
            paymentDate: true,
            status: true,
            subtotal: true,
            taxAmount: true,
            discount: true,
            totalAmount: true,
            partner: { select: { companyName: true, firstName: true, lastName: true, documentNumber: true } },
            currency: { select: { code: true } },
            branch: { select: { name: true } },
            OrderPayment: { select: { paymentMethod: true, paymentDate: true } },
            orderItems: {
              select: {
                quantity: true,
                unitPrice: true,
                discount: true,
                subtotal: true,
                total: true,
                product: {
                  select: {
                    name: true,
                    code: true,
                    category: { select: { name: true } }
                  }
                }
              }
            }
          }
        });

        if (orders.length === 0) break;

        yield buildOrderReportRows(orders, formatToLimaTime);

        if (orders.length < REPORT_BATCH_SIZE) break;
        skip += orders.length;
      }
    };

    // 4. Generar Buffer usando ExcelService
    const { ExcelService } = await import('@/services/excel.service');
    const buffer = await ExcelService.generateExcelBufferFromBatches(
      reportBatches(),
      'Reporte Detallado'
    );

    return { buffer, subscriptionId };
  }
};
