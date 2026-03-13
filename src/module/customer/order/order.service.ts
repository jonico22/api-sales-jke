
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { publishRealtimeUpdate, publishNotification, NotificationType, NotificationPriority } from '@/config/event-publisher';
import { CreateOrderInput, UpdateOrderInput, OrderFilters } from './order.schema';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
  PaginationQuery,
} from '@/utils/pagination';
import { Order, OrderStatus, Product, TransactionType } from '@prisma/client';
import { InventoryService } from '@/module/inventory/inventory.service';
import { toLimaTimezone, convertLimaDateRangeToUTC, formatToLimaTime } from '@/utils/dateFormatter';

const CACHE_PREFIX = 'orders:';
const CACHE_TTL_LIST = 300;
const CACHE_TTL_SINGLE = 600;

// Helper function to build WHERE clause (Refactored)
const buildOrderWhereClause = async (filters?: OrderFilters) => {
  const whereClause: any = {};
  const societyCode = filters?.societyCode || filters?.societyId;

  let subscriptionId: string | undefined;

  // Resolve Society Code/ID (Pattern from CategoryService)
  if (societyCode) {
    const society = await prisma.society.findUnique({ where: { code: societyCode } });
    if (society) {
      whereClause.societyId = society.id;
      subscriptionId = society.subscriptionId;
    } else {
      // If code looks like UUID, try as ID as fallback (legacy behavior support)
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(societyCode);
      if (isUuid) {
        whereClause.societyId = societyCode;
        const soc = await prisma.society.findUnique({ where: { id: societyCode } });
        if (soc) subscriptionId = soc.subscriptionId;
      } else {
        // Return guaranteed empty result if code invalid
        return { whereClause: { id: '00000000-0000-0000-0000-000000000000' }, subscriptionId: undefined };
      }
    }
  }

  if (filters?.partnerId) whereClause.partnerId = filters.partnerId;
  if (filters?.branchId) whereClause.branchId = filters.branchId;
  if (filters?.status) whereClause.status = filters.status;
  if (filters?.createdBy) whereClause.createdBy = filters.createdBy;

  // Numeric Filters
  if (filters?.totalAmountFrom || filters?.totalAmountTo) {
    whereClause.totalAmount = {};
    if (filters.totalAmountFrom) whereClause.totalAmount.gte = filters.totalAmountFrom;
    if (filters.totalAmountTo) whereClause.totalAmount.lte = filters.totalAmountTo;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
    whereClause.orderDate = {};
    if (dateRange.from) whereClause.orderDate.gte = dateRange.from;
    if (dateRange.to) whereClause.orderDate.lte = dateRange.to;
  }

  if (filters?.search) {
    whereClause.OR = [
      { orderCode: { contains: filters.search, mode: 'insensitive' } },
      { notes: { contains: filters.search, mode: 'insensitive' } },
      {
        partner: {
          OR: [
            { companyName: { contains: filters.search, mode: 'insensitive' } },
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { documentNumber: { contains: filters.search, mode: 'insensitive' } }
          ]
        }
      }
    ];
  }

  return { whereClause, subscriptionId };
};

// ─── Helper: Resolve Entities in Parallel ─────────────────────────────
const resolveSociety = async (idOrCode: string) => {
  let society = await prisma.society.findUnique({ where: { id: idOrCode } });
  if (!society) society = await prisma.society.findUnique({ where: { code: idOrCode } });
  if (!society) throw new Error(`Sociedad no encontrada (ID/Code: ${idOrCode})`);
  return society;
};

const resolveBranch = async (idOrCode: string, societyId: string) => {
  let branch = await prisma.branchOffice.findUnique({ where: { id: idOrCode } });
  if (!branch) {
    branch = await prisma.branchOffice.findUnique({
      where: { societyId_code: { societyId, code: idOrCode } }
    });
  }
  if (!branch) throw new Error(`Sucursal no encontrada (ID/Code: ${idOrCode})`);
  return branch;
};

const resolvePartner = async (idOrDoc: string) => {
  let partner = await prisma.bussinessPartner.findUnique({ where: { id: idOrDoc } });
  if (!partner) partner = await prisma.bussinessPartner.findFirst({ where: { documentNumber: idOrDoc } });
  if (!partner) throw new Error(`Cliente no encontrado (ID/Doc: ${idOrDoc})`);
  return partner;
};

const resolveCurrency = async (idOrCode: string) => {
  let currency = await prisma.currency.findUnique({ where: { id: idOrCode } });
  if (!currency) currency = await prisma.currency.findUnique({ where: { code: idOrCode } });
  if (!currency) throw new Error(`Moneda no encontrada (ID/Code: ${idOrCode})`);
  return currency;
};

export const OrderService = {
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

    // Map para acceso rápido
    const productMap = new Map<string, Product>();
    products.forEach(p => productMap.set(p.id, p));

    // ─── 2. Calcular Totales ──────────────────────────────────────────
    const TAX_RATE = 0.18; // IGV 18%

    const itemsToCreate = data.orderItems.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Producto ${item.productId} no encontrado`);

      const listPrice = Number(product.price);
      const soldPrice = item.unitPrice;

      let finalUnitPrice = soldPrice;
      let finalDiscount = 0;

      if (soldPrice < listPrice) {
        finalUnitPrice = listPrice;
        finalDiscount = (listPrice - soldPrice) * item.quantity;
      } else {
        finalUnitPrice = soldPrice;
        finalDiscount = 0;
      }

      const itemTotalGross = item.quantity * soldPrice;
      const subtotalItem = Number((itemTotalGross / (1 + TAX_RATE)).toFixed(2));
      const taxItem = Number((itemTotalGross - subtotalItem).toFixed(2));

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: finalUnitPrice,
        discount: finalDiscount,
        subtotal: subtotalItem,
        taxAmount: taxItem,
        total: itemTotalGross,
        comment: item.comment,
        costPrice: product.priceCost || 0
      };
    });

    const orderTotalGross = itemsToCreate.reduce((acc, item) => acc + item.total, 0);
    const orderSubtotal = itemsToCreate.reduce((acc, item) => acc + item.subtotal, 0);
    const totalTax = Number((orderTotalGross - orderSubtotal).toFixed(2));
    const totalAmount = orderTotalGross - data.discount;

    // ─── 3. BATCH: Validar Stock (1 sola query en vez de N) ───────────
    if (data.status === OrderStatus.PENDING_PAYMENT || data.status === OrderStatus.COMPLETED) {
      const allBranchStocks = await prisma.branchOfficeProduct.findMany({
        where: {
          branchOfficeId: data.branchId,
          productId: { in: productIds }
        },
        select: { productId: true, availableStock: true }
      });

      const stockMap = new Map(allBranchStocks.map(s => [s.productId, s.availableStock]));
      const stockErrors: string[] = [];

      for (const item of itemsToCreate) {
        const product = productMap.get(item.productId);
        if (!product) continue;

        const availableStock = stockMap.get(item.productId) ?? 0;

        if (availableStock < item.quantity) {
          stockErrors.push(
            `Producto "${product.name}" (${product.code}): Stock insuficiente. ` +
            `Disponible: ${availableStock}, Solicitado: ${item.quantity}`
          );
        }
      }

      if (stockErrors.length > 0) {
        throw new Error(`No se puede crear la orden:\n${stockErrors.join('\n')}`);
      }
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

      // [STOCK] Reserve Stock ONLY if PENDING_PAYMENT or COMPLETED
      if (newOrder.status === OrderStatus.PENDING_PAYMENT || newOrder.status === OrderStatus.COMPLETED) {
        for (const item of itemsToCreate) {
          await InventoryService.reserveStock(
            item.productId,
            data.branchId,
            item.quantity,
            tx
          );
        }
      }

      // If created directly as COMPLETED, also Confirm Output
      if (newOrder.status === OrderStatus.COMPLETED) {
        for (const item of itemsToCreate) {
          await InventoryService.confirmStockOutput({
            productId: item.productId,
            branchOfficeId: data.branchId,
            quantity: item.quantity,
            type: TransactionType.SALE_EXIT,
            unitCost: 0,
            totalCost: 0,
            referenceId: newOrder.id,
            referenceType: 'ORDER',
            documentNumber: newOrder.orderCode
          }, tx);

          // Increment Sales Count
          await tx.product.update({
            where: { id: item.productId },
            data: {
              salesCount: { increment: item.quantity }
            }
          });
        }
      }

      return newOrder;
    }, {
      timeout: 30000
    });

    // ─── 6. BACKGROUND: Notificaciones y Cache (fire-and-forget) ──────
    // El usuario recibe su respuesta INMEDIATAMENTE.
    // Las notificaciones y la limpieza de caché se procesan en segundo plano.
    const societyId = society.id;
    const subscriptionId = society.subscriptionId;

    setImmediate(async () => {
      try {
        // A. Notificaciones (solo si COMPLETED)
        if (order.status === OrderStatus.COMPLETED && subscriptionId) {
          const partnerName = partner.companyName ||
            `${partner.firstName || ''} ${partner.lastName || ''}`.trim();

          console.log('[OrderService] 🟢 Publicando notificación (CREATE) para orden:', order.orderCode);

          await Promise.all([
            publishRealtimeUpdate(subscriptionId, 'VENTA', {
              id: order.id,
              status: 'COMPLETADO',
              orderCode: order.orderCode,
              totalAmount: order.totalAmount,
              partnerName: partnerName,
              paidAt: new Date()
            }),
            publishRealtimeUpdate(subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' }),
            publishNotification({
              type: NotificationType.SALES,
              title: 'Venta Realizada',
              message: `La orden #${order.orderCode} ha sido procesada exitosamente.`,
              subscriptionId: subscriptionId,
              priority: NotificationPriority.HIGH,
              link: `/orders/history?id=${order.id}`,
              metadata: {
                orderId: order.id,
                amount: order.totalAmount
              }
            })
          ]);
        }

        // B. Invalidar Caches
        await Promise.all([
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
          ...['stats', 'sales-performance', 'revenue-category', 'top-products', 'payment-methods', 'branch-performance', 'cash-flow'].map(k => redis.del(`dashboard:${k}:${societyId}`)),
          redis.deleteKeysByPrefix('products:'),
          redis.deleteKeysByPrefix('products:select:'),
          redis.deleteKeysByPrefix('branch_office_products:')
        ]);
      } catch (error) {
        console.error('[OrderService] ❌ Error en procesamiento background (create):', error);
      }
    });

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
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    // Construir clave de cache única
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
      sortOrder
    ];
    const cacheKey = `${CACHE_PREFIX}${cacheKeyParts.join(':')}`;

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
      try { await redis.set(cacheKey, result, CACHE_TTL_LIST); } catch (_) { }
    });

    return result as PaginatedResult<Order & { totalProducts: number }>;
  },

  /**
   * Obtener por ID con detalle
   */
  getById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;
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
        try { await redis.set(cacheKey, order, CACHE_TTL_SINGLE); } catch (_) { }
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

    if (!currentOrder) throw new Error('Orden no encontrada');

    const isCompleting = updateData.status === OrderStatus.COMPLETED && currentOrder.status !== OrderStatus.COMPLETED;
    const isConfirmingPayment = updateData.status === OrderStatus.PENDING_PAYMENT && currentOrder.status === OrderStatus.PENDING;
    const isCancelling = updateData.status === OrderStatus.CANCELLED && currentOrder.status === OrderStatus.PENDING_PAYMENT;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Order Header
      const updated = await tx.order.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        include: { orderItems: true }
      });

      // 2. Logic based on Status Transition

      // A. PENDING -> PENDING_PAYMENT: Reserve Stock
      if (isConfirmingPayment) {
        for (const item of updated.orderItems) {
          await InventoryService.reserveStock(
            item.productId,
            updated.branchId,
            item.quantity,
            tx
          );
        }
      }

      // B. ANY -> COMPLETED: Confirm Output
      if (isCompleting) {
        for (const item of updated.orderItems) {
          // Check if we need to Reserve first (if coming from PENDING or other non-reserved status)
          // Assumption: PENDING_PAYMENT is the only status where it's already reserved.
          const wasReserved = currentOrder.status === OrderStatus.PENDING_PAYMENT;

          if (!wasReserved) {
            await InventoryService.reserveStock(
              item.productId,
              updated.branchId,
              item.quantity,
              tx
            );
          }

          // Confirm Stock Output (Decrements Physical & Reserved)
          await InventoryService.confirmStockOutput({
            productId: item.productId,
            branchOfficeId: updated.branchId,
            quantity: item.quantity,
            type: TransactionType.SALE_EXIT,
            unitCost: Number(item.costPrice),
            totalCost: Number(item.unitPrice) * item.quantity,
            referenceId: updated.id,
            referenceType: 'ORDER',
            documentNumber: updated.orderCode
          }, tx);
        }
      }

      // C. PENDING_PAYMENT -> CANCELLED: Release Reservation
      if (isCancelling) {
        for (const item of updated.orderItems) {
          await InventoryService.cancelReservation(
            item.productId,
            updated.branchId,
            item.quantity,
            tx
          );
        }
      }

      // [NEW] D. ANY -> COMPLETED: Increment Sales Count
      if (isCompleting) {
        for (const item of updated.orderItems) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              salesCount: { increment: item.quantity }
            }
          });
        }
      }

      return updated;
    }, {
      timeout: 30000
    });

    // ─── BACKGROUND: Notificaciones y Cache (fire-and-forget) ──────
    const resultSocietyId = result.societyId;

    setImmediate(async () => {
      try {
        // A. Realtime Update for Completed Orders
        if (isCompleting) {
          const fullOrder = await prisma.order.findUnique({
            where: { id: result.id },
            include: {
              society: { select: { subscriptionId: true } },
              partner: { select: { companyName: true, firstName: true, lastName: true } }
            }
          });

          if (fullOrder?.society?.subscriptionId) {
            const partnerName = fullOrder.partner.companyName ||
              `${fullOrder.partner.firstName || ''} ${fullOrder.partner.lastName || ''}`.trim();

            console.log('[OrderService] 🟢 Publicando notificación (UPDATE) para orden:', fullOrder.society.subscriptionId);

            await Promise.all([
              publishRealtimeUpdate(fullOrder.society.subscriptionId, 'VENTA', {
                id: fullOrder.id,
                status: 'COMPLETADO',
                orderCode: fullOrder.orderCode,
                totalAmount: fullOrder.totalAmount,
                partnerName: partnerName,
                paidAt: new Date()
              }),
              publishRealtimeUpdate(fullOrder.society.subscriptionId, 'DASHBOARD', { action: 'REFRESH_STATS' }),
              publishNotification({
                type: NotificationType.SALES,
                title: 'Venta Realizada',
                message: `La orden #${fullOrder.orderCode} ha sido procesada exitosamente.`,
                subscriptionId: fullOrder.society.subscriptionId,
                priority: NotificationPriority.HIGH,
                link: `/orders/history?id=${fullOrder.id}`,
                metadata: {
                  orderId: fullOrder.id,
                  amount: fullOrder.totalAmount
                }
              })
            ]);
          }
        }

        // B. Invalidar Caches
        await Promise.all([
          redis.del(`${CACHE_PREFIX}${id}`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
          ...['stats', 'sales-performance', 'revenue-category', 'top-products', 'payment-methods', 'branch-performance', 'cash-flow'].map(k => redis.del(`dashboard:${k}:${resultSocietyId}`)),
          redis.deleteKeysByPrefix('products:'),
          redis.deleteKeysByPrefix('products:select:'),
          redis.deleteKeysByPrefix('branch_office_products:')
        ]);
      } catch (error) {
        console.error('[OrderService] ❌ Error en procesamiento background (update):', error);
      }
    });

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

    if (!order) throw new Error('Orden no encontrada');
    if (order.status === OrderStatus.COMPLETED) throw new Error('No se puede cancelar una orden completada');
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

    // ─── BACKGROUND: Cache Invalidation ──────────────────────────────
    const deletedSocietyId = result.societyId;

    setImmediate(async () => {
      try {
        await Promise.all([
          redis.del(`${CACHE_PREFIX}${id}`),
          redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`),
          ...['stats', 'sales-performance', 'revenue-category', 'top-products', 'payment-methods', 'branch-performance', 'cash-flow']
            .map(k => redis.del(`dashboard:${k}:${deletedSocietyId}`)),
          redis.deleteKeysByPrefix('products:'),
          redis.deleteKeysByPrefix('products:select:'),
          redis.deleteKeysByPrefix('branch_office_products:')
        ]);
      } catch (e) {
        console.error('[OrderService] ❌ Error background (delete):', e);
      }
    });

    return result;
  },

  /**
   * Generar reporte Excel (Buffer) con detalle de items y métodos de pago
   */
  getReport: async (filters?: OrderFilters): Promise<{ buffer: Buffer; subscriptionId?: string }> => {
    // 1. Construir WHERE (reutilizando lógica)
    const { whereClause, subscriptionId } = await buildOrderWhereClause(filters);

    // 2. Consultar sin paginación y con las relaciones necesarias para el reporte
    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        partner: { select: { companyName: true, firstName: true, lastName: true, documentNumber: true, email: true } },
        currency: { select: { code: true } },
        society: { select: { name: true } },
        branch: { select: { name: true } },
        OrderPayment: { select: { paymentMethod: true, amount: true } },
        orderItems: {
          include: {
            product: { select: { name: true, code: true } }
          }
        }
      }
    });

    // 3. Mapear datos a estructura plana (Denormalización: 1 fila por ítem)
    const data: any[] = [];

    orders.forEach(order => {
      const partnerName = order.partner.companyName || `${order.partner.firstName || ''} ${order.partner.lastName || ''}`.trim();
      const paymentMethods = order.OrderPayment.map(p => p.paymentMethod).join(', ') || 'Sin Pago';

      // Si la orden no tiene items (caso raro pero posible), agregamos una fila solo con cabecera
      if (order.orderItems.length === 0) {
        data.push({
          'Código Orden': order.orderCode,
          'Fecha': formatToLimaTime(order.orderDate),
          'Estado': order.status,
          'Cliente': partnerName,
          'Doc. Cliente': order.partner.documentNumber,
          'Sucursal': order.branch.name,
          'Moneda': order.currency.code,
          'Método Pago': paymentMethods,
          'Total Orden': Number(order.totalAmount),
          'Producto': 'N/A',
          'Código Producto': 'N/A',
          'Cantidad': 0,
          'Precio Unit.': 0,
          'Descuento': 0,
          'Subtotal Item': 0,
          'Total Item': 0
        });
      } else {
        // Generar una fila por cada ítem
        order.orderItems.forEach(item => {
          data.push({
            'Código Orden': order.orderCode,
            'Fecha': formatToLimaTime(order.orderDate),
            'Estado': order.status,
            'Cliente': partnerName,
            'Doc. Cliente': order.partner.documentNumber,
            'Sucursal': order.branch.name,
            'Moneda': order.currency.code,
            'Método Pago': paymentMethods,
            'Total Orden': Number(order.totalAmount),
            // Detalle del Item
            'Producto': item.product.name,
            'Código Producto': item.product.code,
            'Cantidad': item.quantity,
            'Precio Unit.': Number(item.unitPrice),
            'Descuento': Number(item.discount),
            'Subtotal Item': Number(item.subtotal),
            'Total Item': Number(item.total)
          });
        });
      }
    });

    // 4. Generar Buffer usando ExcelService
    // Dynamic import to avoid circular dependency issues if any, or just importing at top
    const { ExcelService } = await import('@/services/excel.service');
    const buffer = await ExcelService.generateExcelBuffer(data, 'Reporte Detallado');

    return { buffer, subscriptionId };
  }
};
