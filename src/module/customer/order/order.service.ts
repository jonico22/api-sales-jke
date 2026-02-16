
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
import { toLimaTimezone, convertLimaDateRangeToUTC } from '@/utils/dateFormatter';

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

export const OrderService = {
  /**
   * Crear una nueva orden con cálculo de financieros backend-side
   */
  create: async (data: CreateOrderInput) => {
    // 1. Validar existencias básicas (Partner, Society, Branch, Currency)
    // Validate Society (ID or Code)
    let society = await prisma.society.findUnique({ where: { id: data.societyId } });
    if (!society) {
      society = await prisma.society.findUnique({ where: { code: data.societyId } });
    }
    if (!society) throw new Error(`Sociedad no encontrada (ID/Code: ${data.societyId})`);

    // Validate Branch (ID or Code)
    let branch = await prisma.branchOffice.findUnique({ where: { id: data.branchId } });
    if (!branch) {
      // Branch code is unique per society, so we need the resolved societyId
      branch = await prisma.branchOffice.findUnique({
        where: {
          societyId_code: {
            societyId: society.id,
            code: data.branchId
          }
        }
      });
    }
    if (!branch) throw new Error(`Sucursal no encontrada (ID/Code: ${data.branchId})`);

    // Validate Partner (ID or Document Number?)
    // Partner doesn't have a simple 'code' usually, but documentNumber is unique.
    let partner = await prisma.bussinessPartner.findUnique({ where: { id: data.partnerId } });
    if (!partner) {
      partner = await prisma.bussinessPartner.findFirst({ where: { documentNumber: data.partnerId } });
    }
    if (!partner) throw new Error(`Cliente no encontrado (ID/Doc: ${data.partnerId})`);

    // Validate Currency (ID or Code)
    let currency = await prisma.currency.findUnique({ where: { id: data.currencyId } });
    if (!currency) {
      currency = await prisma.currency.findUnique({ where: { code: data.currencyId } });
    }
    if (!currency) throw new Error(`Moneda no encontrada (ID/Code: ${data.currencyId})`);

    // Re-assign resolved IDs to data object to ensure database consistency
    data.societyId = society.id;
    data.branchId = branch.id;
    data.partnerId = partner.id;
    data.currencyId = currency.id;
    // 2. Obtener precios de productos para validar/calcular
    const productIds = data.orderItems.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    // Map para acceso rápido
    const productMap = new Map<string, Product>();
    products.forEach(p => productMap.set(p.id, p));

    // 3. Calcular Totales
    const TAX_RATE = 0.18; // IGV 18%

    // Preparar items para creación
    const itemsToCreate = data.orderItems.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Producto ${item.productId} no encontrado`);

      // Logic: Price Calculation (Tax Inclusive)
      // List Price = product.price (Database)
      // Sold Price = item.unitPrice (Frontend Input) - This INCLUDES TAX (IGV)

      const listPrice = Number(product.price);
      const soldPrice = item.unitPrice;

      let finalUnitPrice = soldPrice;
      let finalDiscount = 0;

      // If Sold Price is LESS than List Price, record difference as discount
      // Note: Comparing prices inclusive of tax
      if (soldPrice < listPrice) {
        finalUnitPrice = listPrice; // Record List Price
        finalDiscount = (listPrice - soldPrice) * item.quantity;
      } else {
        finalUnitPrice = soldPrice;
        finalDiscount = 0;
      }

      // 1. Calculate Item Total (Gross)
      // This is what customer pays for this item line (before global discount)
      const itemTotalGross = item.quantity * soldPrice;

      // 2. Calculate Subtotal (Base Imponible)
      // Subtotal = Total / 1.18
      const subtotalItem = Number((itemTotalGross / (1 + TAX_RATE)).toFixed(2));

      // 3. Calculate Tax (IGV)
      // Tax = Total - Subtotal
      const taxItem = Number((itemTotalGross - subtotalItem).toFixed(2));

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: finalUnitPrice, // Using List Price if discounted
        discount: finalDiscount,

        subtotal: subtotalItem,
        taxAmount: taxItem,
        total: itemTotalGross, // Store GROSS total for item
        comment: item.comment,
        costPrice: product.priceCost || 0 // Snapshot del costo actual
      };
    });

    // Order Level Totals
    // calculatedSubtotal is sum of item subtotals (Base Imponible)

    // Total Tax is sum of item taxes (derived from difference logic above or re-calculated)
    // To minimize rounding errors, we can sum totals and subtotals.
    const orderTotalGross = itemsToCreate.reduce((acc, item) => acc + item.total, 0);
    const orderSubtotal = itemsToCreate.reduce((acc, item) => acc + item.subtotal, 0);
    const totalTax = Number((orderTotalGross - orderSubtotal).toFixed(2));

    // Final Total Amount = Gross Total - Global Discount
    const totalAmount = orderTotalGross - data.discount;

    // 4. VALIDATE STOCK AVAILABILITY (Before creating order)
    // Only validate if order will reserve stock (PENDING_PAYMENT or COMPLETED)
    if (data.status === OrderStatus.PENDING_PAYMENT || data.status === OrderStatus.COMPLETED) {
      const stockErrors: string[] = [];

      for (const item of itemsToCreate) {
        const product = productMap.get(item.productId);
        if (!product) continue;

        // Check stock in the specific branch
        const branchStock = await prisma.branchOfficeProduct.findUnique({
          where: {
            productId_branchOfficeId: {
              productId: item.productId,
              branchOfficeId: data.branchId
            }
          }
        });

        const availableStock = branchStock?.availableStock ?? 0;

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

    // 5. Generar Código
    const orderCode = data.orderCode || `ORD-${Date.now()}`;

    // 5. Transacción de creación
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

          // Financials Calculated
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

      // 6. [STOCK] Reserve Stock ONLY if PENDING_PAYMENT or COMPLETED
      // If PENDING (Draft), do not reserve.
      if (newOrder.status === OrderStatus.PENDING_PAYMENT || newOrder.status === OrderStatus.COMPLETED) {
        for (const item of itemsToCreate) {
          await InventoryService.reserveStock(
            item.productId,
            data.branchId, // Use resolved data.branchId
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
            unitCost: 0, // Need to fetch cost? OrderItem has costPrice.
            totalCost: 0, // update logic handled cost.
            referenceId: newOrder.id,
            referenceType: 'ORDER',
            documentNumber: newOrder.orderCode
          }, tx);
        }
      }

      return newOrder;
    });

    // 7. [Notification] Send Notification if Created as COMPLETED
    if (order.status === OrderStatus.COMPLETED && society.subscriptionId) {
      try {
        const partnerName = partner.companyName ||
          `${partner.firstName || ''} ${partner.lastName || ''}`.trim();

        console.log('[OrderService] 🟢 Intentando publicar notificación (CREATE) para orden:', order.orderCode);

        // A. Realtime Update
        await publishRealtimeUpdate(
          society.subscriptionId,
          'VENTA', // Entity Type
          {
            id: order.id,
            status: 'COMPLETADO',
            orderCode: order.orderCode,
            totalAmount: order.totalAmount,
            partnerName: partnerName,
            paidAt: new Date()
          }
        );

        // B. Visual Notification (Toast)
        await publishNotification({
          type: NotificationType.SALES,
          title: 'Venta Realizada',
          message: `La orden #${order.orderCode} ha sido procesada exitosamente.`,
          subscriptionId: society.subscriptionId,
          priority: NotificationPriority.HIGH,
          link: `/orders/history?id=${order.id}`,
          metadata: {
            orderId: order.id,
            amount: order.totalAmount
          }
        });
      } catch (error) {
        console.error('[OrderService] ❌ Error enviando notificación en create:', error);
      }
    }

    // Invalidate Cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    // Invalidate Product Cache (Stock Changed)
    await redis.deleteKeysByPrefix('products:');
    await redis.deleteKeysByPrefix('products:select:'); // Explicitly clear select cache
    await redis.deleteKeysByPrefix('branch_office_products:');

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
      CACHE_PREFIX,
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
    const cacheKey = cacheKeyParts.join(':');

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
          OrderPayment: { select: { paymentMethod: true, amount: true } }, // Include methods and amounts
          _count: { select: { orderItems: true } },
          orderItems: { select: { quantity: true } } // Include quantities for total calculation
        }
      }),
      prisma.order.count({ where: whereClause })
    ]);

    // Calculate total quantity of products
    const formattedData = data.map(order => ({
      ...order,
      totalProducts: order.orderItems.reduce((sum, item) => sum + item.quantity, 0)
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

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
        partner: true,
        branch: true,
        currency: true,
        society: { select: { id: true, name: true } },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                imageId: true,
                price: true,     // Current List Price
                stock: true,     // Current Global Stock
                priceCost: true, // Current Cost
                description: true
              }
            }
          }
        },
        OrderPayment: true // Incluir pagos relacionados
      }
    });

    if (order) await redis.set(cacheKey, order, CACHE_TTL_SINGLE);
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

      return updated;
    });

    // 3. Post-Transaction Actions (Notifications, Cache Invalidation)

    // A. Realtime Update for Completed Orders
    if (isCompleting) {
      try {
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

          await publishRealtimeUpdate(
            fullOrder.society.subscriptionId,
            'VENTA', // Entity Type
            {
              id: fullOrder.id,
              status: 'COMPLETADO',
              orderCode: fullOrder.orderCode,
              totalAmount: fullOrder.totalAmount,
              partnerName: partnerName,
              paidAt: new Date() // Current time as payment/completion time
            }
          );

          console.log('[OrderService] 🟢 Intentando publicar notificación para orden:', fullOrder.orderCode);

          // 2. Notificación Visual (Toast)
          await publishNotification({
            type: NotificationType.SALES,
            title: 'Venta Realizada',
            message: `La orden #${fullOrder.orderCode} ha sido procesada exitosamente.`,
            subscriptionId: fullOrder.society.subscriptionId,
            priority: NotificationPriority.HIGH,
            // Opcional: link para ir al detalle
            link: `/orders/history?id=${fullOrder.id}`,
            metadata: {
              orderId: fullOrder.id,
              amount: fullOrder.totalAmount
            }
          });
        }
      } catch (error) {
        console.error('Error publishing realtime update for order:', id, error);
      }
    }

    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    // Invalidate Product Cache (Stock Changed)
    await redis.deleteKeysByPrefix('products:');
    await redis.deleteKeysByPrefix('products:select:'); // Explicitly clear select cache
    await redis.deleteKeysByPrefix('branch_office_products:');

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
    });

    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    // Invalidate Product Cache (Stock Changed)
    await redis.deleteKeysByPrefix('products:');
    await redis.deleteKeysByPrefix('products:select:'); // Explicitly clear select cache
    await redis.deleteKeysByPrefix('branch_office_products:');

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
          'Fecha': order.orderDate.toISOString().split('T')[0],
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
          'Total Item': 0,
          'Usuario': order.createdBy || 'Sistema'
        });
      } else {
        // Generar una fila por cada ítem
        order.orderItems.forEach(item => {
          data.push({
            'Código Orden': order.orderCode,
            'Fecha': order.orderDate.toISOString().split('T')[0],
            'Estado': order.status,
            'Cliente': partnerName,
            'Doc. Cliente': order.partner.documentNumber,
            'Sucursal': order.branch.name,
            'Moneda': order.currency.code,
            'Método Pago': paymentMethods,
            'Total Orden': Number(order.totalAmount), // Repetido por contexto
            // Detalle del Item
            'Producto': item.product.name,
            'Código Producto': item.product.code,
            'Cantidad': item.quantity,
            'Precio Unit.': Number(item.unitPrice),
            'Descuento': Number(item.discount),
            'Subtotal Item': Number(item.subtotal),
            'Total Item': Number(item.total),
            'Usuario': order.createdBy || 'Sistema'
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
