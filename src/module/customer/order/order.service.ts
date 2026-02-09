
import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
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
    let calculatedSubtotal = 0;

    // Preparar items para creación
    const itemsToCreate = data.orderItems.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Producto ${item.productId} no encontrado`);

      // Logic: Automatic Discount Calculation
      // List Price = product.price (Database)
      // Sold Price = item.unitPrice (Frontend Input)

      const listPrice = Number(product.price);
      const soldPrice = item.unitPrice;

      let finalUnitPrice = soldPrice;
      let finalDiscount = 0;

      // If Sold Price is LESS than List Price, record difference as discount
      if (soldPrice < listPrice) {
        finalUnitPrice = listPrice; // Record List Price
        finalDiscount = (listPrice - soldPrice) * item.quantity;
      } else {
        // If sold at or above list price, record sold price (could be surcharge or normal)
        finalUnitPrice = soldPrice;
        finalDiscount = 0;
      }

      // Subtotal for this line item should reflect what customer pays: (Sold Price * Quantity)
      // Math check: (List Price * Qty) - Discount = (List Price * Qty) - ((List - Sold) * Qty) 
      //           = Qty * (List - List + Sold) = Qty * Sold. Correct.
      const subtotalItem = (item.quantity * soldPrice);
      const taxItem = subtotalItem * TAX_RATE;

      calculatedSubtotal += subtotalItem;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: finalUnitPrice, // Using List Price if discounted
        discount: finalDiscount,

        subtotal: subtotalItem,
        taxAmount: taxItem,
        total: subtotalItem + taxItem, // Subtotal + Tax
        comment: item.comment,
        costPrice: product.priceCost || 0 // Snapshot del costo actual
      };
    });

    const taxBase = calculatedSubtotal - data.discount;
    const totalTax = taxBase > 0 ? taxBase * TAX_RATE : 0;
    const totalAmount = taxBase + totalTax;

    // 4. Generar Código
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
          subtotal: calculatedSubtotal,
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
  ): Promise<PaginatedResult<Order>> => {
    const page = paginationQuery?.page ?? 1;
    const limit = paginationQuery?.limit ?? 10;
    const sortBy = paginationQuery?.sortBy ?? 'createdAt';
    const sortOrder = paginationQuery?.sortOrder ?? 'desc';

    const cacheKey = [
      CACHE_PREFIX, 'list',
      filters?.societyId || 'all',
      filters?.status || 'all',
      filters?.partnerId || 'all',
      filters?.branchId || 'all',
      filters?.search || 'all',
      filters?.totalAmountFrom || 'all',
      filters?.totalAmountTo || 'all',
      page, limit, sortBy, sortOrder
    ].join(':');

    const cached = await redis.get<PaginatedResult<Order>>(cacheKey);
    if (cached) return cached;

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = {};

    if (filters?.societyId) whereClause.societyId = filters.societyId;
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
          _count: { select: { orderItems: true } }
        }
      }),
      prisma.order.count({ where: whereClause })
    ]);

    const result = buildPaginatedResult(data, page, limit, total);
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
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
  }
};
