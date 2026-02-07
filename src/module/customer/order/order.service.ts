
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
    const partner = await prisma.bussinessPartner.findUnique({ where: { id: data.partnerId } });
    if (!partner) throw new Error('Cliente no encontrado');

    const branch = await prisma.branchOffice.findUnique({ where: { id: data.branchId } });
    if (!branch) throw new Error('Sucursal no encontrada');

    // 2. Obtener precios de productos para validar/calcular
    const productIds = data.orderItems.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    // Map para acceso rápido
    const productMap = new Map<string, Product>();
    products.forEach(p => productMap.set(p.id, p));

    // 3. Calcular Totales
    let calculatedSubtotal = 0;

    // Preparar items para creación
    const itemsToCreate = data.orderItems.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Producto ${item.productId} no encontrado`);

      // NOTA: Aquí podrías validar que item.unitPrice coincida con product.price 
      // o permitir override si la lógica de negocio lo dicta (ej. descuentos manuales)
      // Asumiremos que el precio enviado es el acordado, pero recalculamos totales.

      const subtotalItem = (item.quantity * item.unitPrice) - item.discount;
      calculatedSubtotal += subtotalItem;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        subtotal: subtotalItem,
        taxAmount: 0, // Por ahora 0, implementar lógica de impuestos si es necesario
        total: subtotalItem, // + Impuestos
        comment: item.comment,
        costPrice: product.priceCost || 0 // Snapshot del costo actual
      };
    });

    const totalAmount = calculatedSubtotal - data.discount; // Aplicar descuento global si existe

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
      return newOrder;
    });

    // Invalidate Cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

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
            product: { select: { id: true, name: true, code: true, imageId: true } }
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

      // 2. If completing, Process Stock Exit
      if (isCompleting) {
        for (const item of updated.orderItems) {
          // A. Decrease Stock
          await tx.branchOfficeProduct.upsert({
            where: {
              productId_branchOfficeId: {
                productId: item.productId,
                branchOfficeId: updated.branchId
              }
            },
            update: {
              physicalStock: { decrement: item.quantity },
              availableStock: { decrement: item.quantity },
            },
            create: {
              productId: item.productId,
              branchOfficeId: updated.branchId,
              physicalStock: -item.quantity,
              availableStock: -item.quantity,
            }
          });

          // B. Log Kardex
          await InventoryService.logTransaction({
            date: new Date(),
            productId: item.productId,
            branchOfficeId: updated.branchId,
            type: TransactionType.SALE_EXIT,
            quantity: -item.quantity, // Negative for EXIT
            unitCost: Number(item.costPrice),
            totalCost: Number(item.unitPrice) * item.quantity,
            referenceId: updated.id,
            referenceType: 'ORDER',
            documentNumber: updated.orderCode
          }, tx);
        }
      }

      return updated;
    });

    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

    return result;
  },

  /**
   * Delete / Cancel
   */
  delete: async (id: string) => {
    // Soft delete or Cancel logic
    const deleted = await prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancellationReason: 'Deleted via API',
        updatedAt: new Date()
      }
    });

    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    return deleted;
  }
};
