import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { OrderStatus } from '@prisma/client';
import {
  PaginatedResult,
  getPrismaPaginationParams,
  buildPaginatedResult,
} from '@/utils/pagination';
import { convertLimaDateRangeToUTC, formatToLimaTime } from '@/utils/dateFormatter';
import { orderFiltersSchema } from './order.validation';

// Constantes de cache
const CACHE_PREFIX = 'orders:';
const CACHE_TTL_LIST = 300; // 5 minutos
const CACHE_TTL_SINGLE = 600; // 10 minutos

export interface OrderFilters {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  societyCode?: string;
  societyId?: string;
  partnerId?: string;
  branchId?: string;
  search?: string;
  status?: OrderStatus;
  dateFrom?: string;
  dateTo?: string;
  createdBy?: string;
}

export const orderService = {
  create: async (data: any) => {
    // 1. Validar Sucursal (Multi-warehouse Logic)
    if (!data.branchId) {
      const branches = await prisma.branchOffice.findMany({
        where: { societyId: data.societyId, isActive: true }
      });

      if (branches.length === 0) {
        throw new Error('No active branches found for this society.');
      }

      if (branches.length === 1) {
        // Caso único: Asignar automáticamente (Generalmente es la Principal)
        data.branchId = branches[0].id;
      } else {
        // Múltiples sucursales: Usuario debe elegir
        throw new Error('Multiple branches available. You must specify a branchId.');
      }
    } else {
      // Validar que la sucursal enviada exista y pertenezca a la sociedad
      const branch = await prisma.branchOffice.findFirst({
        where: { id: data.branchId, societyId: data.societyId, isActive: true }
      });
      if (!branch) {
        throw new Error('Invalid or inactive branchId associated with this society.');
      }
    }

    // 2. Iniciar transacción para asegurar integridad
    const result = await prisma.$transaction(async (tx) => {
      let subtotalHeader = 0;
      let taxAmountHeader = 0;
      let totalAmountHeader = 0; // Suma de los totales de ítems

      // 2. Procesar ítems para cálculos (sin guardarlos aún)
      const processedItems = await Promise.all(
        data.orderItems.map(async (item: any) => {
          const product = await tx.product.findUnique({
            where: { id: item.productId }
          });

          if (!product) {
            throw new Error(`Producto no encontrado: ${item.productId}`);
          }

          // A. Snapshot del costo (Critico para margen)
          const costPrice = Number(product.priceCost);

          // B. Cálculos de Venta (Asumiendo Precio Incluye IGV)
          // Total línea = (Precio x Cantidad) - Descuento
          const quantity = item.quantity;
          const unitPrice = Number(item.unitPrice);
          const lineDiscount = Number(item.discount || 0);

          const totalLine = (unitPrice * quantity) - lineDiscount;

          // C. Desglose Inverso (Base + IGV) -> IGV 18%
          // Base = Total / 1.18
          const subtotalLine = totalLine / 1.18;
          const taxLine = totalLine - subtotalLine;

          // Acumuladores Cabecera
          subtotalHeader += subtotalLine;
          taxAmountHeader += taxLine;
          totalAmountHeader += totalLine;

          return {
            productId: item.productId,
            quantity: quantity,
            unitPrice: unitPrice,
            costPrice: costPrice, // Snapshot
            subtotal: subtotalLine,
            discount: lineDiscount,
            taxAmount: taxLine,
            total: totalLine,
            comment: item.comment
          };
        })
      );

      // 3. Crear cabecera y detalles en BD
      const order = await tx.order.create({
        data: {
          // Metadata
          orderCode: data.orderCode || `ORD-${Date.now()}`, // Fallback si no hay generador
          societyId: data.societyId,
          partnerId: data.partnerId,
          branchId: data.branchId,
          createdBy: data.createdBy,
          notes: data.notes,

          // Logistics
          status: OrderStatus.PENDING,
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : undefined,
          shippingAddress: data.shippingAddress,

          // Currency
          currencyId: data.currencyId,
          exchangeRate: data.exchangeRate,

          // Financials Header
          discount: data.discount, // Descuento global si aplica (no restado en líneas aquí, lógica simple)
          subtotal: subtotalHeader,
          taxAmount: taxAmountHeader,
          totalAmount: totalAmountHeader, // Total de ítems

          // Relación Items
          orderItems: {
            create: processedItems
          }
        },
        include: {
          orderItems: true
        }
      });

      return order;
    });

    // Invalidar cache
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);
    return result;
  },

  findAll: async (filters: OrderFilters): Promise<PaginatedResult<any>> => {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    // Generar Cache Key
    const cacheKeyParts = [
      CACHE_PREFIX,
      'list',
      filters.societyCode || filters.societyId || 'all',
      filters.partnerId || 'all',
      filters.branchId || 'all',
      filters.status || 'all',
      filters.search || 'all',
      filters.dateFrom || 'all',
      filters.dateTo || 'all',
      filters.createdBy || 'all',
      page,
      limit,
      sortBy,
      sortOrder
    ];
    const cacheKey = cacheKeyParts.join(':');

    // 1. Cache Check
    const cached = await redis.get<PaginatedResult<any>>(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    const prismaParams = getPrismaPaginationParams(page, limit, sortBy, sortOrder);
    const whereClause: any = {};

    // Filtros
    if (filters.societyCode) {
      const society = await prisma.society.findUnique({ where: { code: filters.societyCode } });
      if (society) whereClause.societyId = society.id;
      else return buildPaginatedResult([], page, limit, 0);
    } else if (filters.societyId) {
      whereClause.societyId = filters.societyId;
    }

    if (filters.partnerId) whereClause.partnerId = filters.partnerId;
    if (filters.branchId) whereClause.branchId = filters.branchId;
    if (filters.status) whereClause.status = filters.status;
    if (filters.createdBy) whereClause.createdBy = filters.createdBy;

    if (filters.search) {
      whereClause.OR = [
        { orderCode: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
        { partner: { companyName: { contains: filters.search, mode: 'insensitive' } } },
        { partner: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { partner: { lastName: { contains: filters.search, mode: 'insensitive' } } }
      ];
    }

    // Fechas (Convertir Lima -> UTC)
    if (filters.dateFrom || filters.dateTo) {
      whereClause.orderDate = {};
      const dateRange = convertLimaDateRangeToUTC(filters.dateFrom, filters.dateTo);
      if (dateRange.from) whereClause.orderDate.gte = dateRange.from;
      if (dateRange.to) whereClause.orderDate.lte = dateRange.to;
    }

    // 2. Query
    const [data, total] = await prisma.$transaction([
      prisma.order.findMany({
        where: whereClause,
        include: {
          society: { select: { id: true, name: true, code: true } },
          partner: { select: { id: true, companyName: true, firstName: true, lastName: true, email: true } },
          branch: { select: { id: true, name: true } },
          currency: { select: { id: true, code: true, symbol: true } },
          orderItems: true,
        },
        skip: prismaParams.skip,
        take: prismaParams.take,
        orderBy: prismaParams.orderBy,
      }),
      prisma.order.count({ where: whereClause }),
    ]);

    // 3. Format & Cache
    const formattedData = data.map(item => ({
      ...item,
      orderDate: formatToLimaTime(item.orderDate),
      createdAt: formatToLimaTime(item.createdAt),
      updatedAt: formatToLimaTime(item.updatedAt),
      deliveryDate: item.deliveryDate ? formatToLimaTime(item.deliveryDate) : null,
    }));

    const result = buildPaginatedResult(formattedData, page, limit, total);
    await redis.set(cacheKey, result, CACHE_TTL_LIST);

    return result;
  },

  findById: async (id: string) => {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    const cached = await redis.get<any>(cacheKey);
    if (cached) return cached;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        society: true,
        partner: true,
        branch: true,
        currency: true,
        orderItems: {
          include: { product: true }
        },
        OrderPayment: true,
      },
    });

    if (order) await redis.set(cacheKey, order, CACHE_TTL_SINGLE);
    return order;
  },

  update: async (id: string, data: any) => {
    // 1. Obtener la orden actual para evaluar transiciones
    const currentOrder = await prisma.order.findUnique({
      where: { id },
      include: { orderItems: true }
    });

    if (!currentOrder) throw new Error('Pedido no encontrado');

    const result = await prisma.$transaction(async (tx) => {
      // A. RESERVA DE STOCK (Transition: PENDING -> PENDING_PAYMENT)
      // El cliente va a pagar, separamos el producto en el almacén.
      const isReserving = data.status === OrderStatus.PENDING_PAYMENT;
      const wasPending = currentOrder.status === OrderStatus.PENDING;

      if (isReserving && wasPending) {
        for (const item of currentOrder.orderItems) {
          // Verificar si existe registro de stock en la sucursal
          const bop = await tx.branchOfficeProduct.findUnique({
            where: {
              productId_branchOfficeId: {
                productId: item.productId,
                branchOfficeId: currentOrder.branchId
              }
            }
          });

          if (!bop) {
            throw new Error(`Inventory record not found for product ${item.productId} in branch ${currentOrder.branchId}`);
          }

          if (bop.availableStock < item.quantity) {
            throw new Error(`Insufficient available stock for product ${item.productId}. Requested: ${item.quantity}, Available: ${bop.availableStock}`);
          }

          // Actualizar BranchOfficeProduct: +Reservado, -Disponible
          await tx.branchOfficeProduct.update({
            where: { id: bop.id },
            data: {
              reservedStock: { increment: item.quantity },
              availableStock: { decrement: item.quantity }
            }
          });
        }
      }

      // B. FINALIZACIÓN Y DESCUENTO REAL (Transition: PENDING_PAYMENT -> COMPLETED)
      // El pago se confirmó, descontamos el físico y el reservado, y el Global.
      const isCompleting = data.status === OrderStatus.COMPLETED;
      const wasReserved = currentOrder.status === OrderStatus.PENDING_PAYMENT;

      // También manejar caso directo PENDING -> COMPLETED (pago inmediato en caja)
      const wasPendingDirect = currentOrder.status === OrderStatus.PENDING;

      if (isCompleting) {
        for (const item of currentOrder.orderItems) {
          const bop = await tx.branchOfficeProduct.findUnique({
            where: {
              productId_branchOfficeId: {
                productId: item.productId,
                branchOfficeId: currentOrder.branchId
              }
            }
          });

          if (!bop) throw new Error(`Stock record not found for product ${item.productId}`);

          if (wasReserved) {
            // Si ya estaba reservado: -Físico, -Reservado (liberar reserva consumiéndola)
            await tx.branchOfficeProduct.update({
              where: { id: bop.id },
              data: {
                physicalStock: { decrement: item.quantity },
                reservedStock: { decrement: item.quantity }
              }
            });
          } else if (wasPendingDirect) {
            // Si fue directo: -Físico, -Disponible (no pasó por reserva)
            if (bop.availableStock < item.quantity) {
              throw new Error(`Insufficient available stock for product ${item.productId}`);
            }
            await tx.branchOfficeProduct.update({
              where: { id: bop.id },
              data: {
                physicalStock: { decrement: item.quantity },
                availableStock: { decrement: item.quantity }
              }
            });
          }

          // IMPACTO GLOBAL: Descontar del maestro de productos
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } }
          });
        }
      }

      // C. CANCELACIÓN (Devolución de Stock)
      const isCancelling = data.status === OrderStatus.CANCELLED;

      if (isCancelling) {
        const wasReservedState = currentOrder.status === OrderStatus.PENDING_PAYMENT;
        const wasCompletedState = currentOrder.status === OrderStatus.COMPLETED;

        if (wasReservedState) {
          // Estaba reservado: -Reservado, +Disponible
          for (const item of currentOrder.orderItems) {
            await tx.branchOfficeProduct.updateMany({
              where: {
                productId: item.productId,
                branchOfficeId: currentOrder.branchId
              },
              data: {
                reservedStock: { decrement: item.quantity },
                availableStock: { increment: item.quantity }
              }
            });
          }
        } else if (wasCompletedState) {
          // Estaba completado (Devolución/Reembolso): +Físico, +Disponible, +Global
          for (const item of currentOrder.orderItems) {
            await tx.branchOfficeProduct.updateMany({
              where: {
                productId: item.productId,
                branchOfficeId: currentOrder.branchId
              },
              data: {
                physicalStock: { increment: item.quantity },
                availableStock: { increment: item.quantity }
              }
            });

            // Devolver al Global
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } }
            });
          }
        }
      }

      // Actualizar la orden con los nuevos datos
      return await tx.order.update({
        where: { id },
        data
      });
    });

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

    return result;
  },

  delete: async (id: string) => {
    const deleted = await prisma.order.delete({ where: { id } });

    // Invalidar cache
    await redis.del(`${CACHE_PREFIX}${id}`);
    await redis.deleteKeysByPrefix(`${CACHE_PREFIX}list:`);

    return deleted;
  },
}
