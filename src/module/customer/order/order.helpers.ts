import prisma from '@/config/prisma';
import { redis } from '@/config/redis';
import { convertLimaDateRangeToUTC } from '@/utils/dateFormatter';
import { ConflictAppError, NotFoundAppError } from '@/utils/domain-errors';
import { OrderFilters } from './order.schema';
import { Product } from '@prisma/client';

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const ORDER_CACHE_PREFIX = 'orders:';
export const ORDER_CACHE_TTL_LIST = 300;
export const ORDER_CACHE_TTL_SINGLE = 600;
export const ORDER_DASHBOARD_CACHE_KEYS = [
  'stats',
  'stats-v2',
  'overview',
  'overview:v2',
  'overview:v3',
  'overview:v4',
  'catalog-summary',
] as const;

export const invalidateOrderDashboardCaches = async (societyId: string) => Promise.all(
  ORDER_DASHBOARD_CACHE_KEYS.map(key => redis.deleteKeysByPrefix(`dashboard:${key}:${societyId}`))
);
export const ORDER_TAX_RATE = 0.18;

export interface CalculatedOrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  comment?: string;
  costPrice: number;
}

export const isUuid = (value: string) => UUID_REGEX.test(value);

export const buildOrderWhereClause = async (filters?: OrderFilters) => {
  const whereClause: any = {};
  const societyCode = filters?.societyCode || filters?.societyId;

  let subscriptionId: string | undefined;

  if (societyCode) {
    if (isUuid(societyCode)) {
      whereClause.societyId = societyCode;
      const society = await prisma.society.findUnique({ where: { id: societyCode } });
      if (society) subscriptionId = society.subscriptionId;
    } else {
      const society = await prisma.society.findUnique({ where: { code: societyCode } });
      if (society) {
        whereClause.societyId = society.id;
        subscriptionId = society.subscriptionId;
      } else {
        return { whereClause: { id: EMPTY_UUID }, subscriptionId: undefined };
      }
    }
  }

  if (filters?.partnerId) whereClause.partnerId = filters.partnerId;
  if (filters?.branchId) whereClause.branchId = filters.branchId;
  if (filters?.status) whereClause.status = filters.status;
  if (filters?.createdBy) whereClause.createdBy = filters.createdBy;

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

export const resolveSociety = async (idOrCode: string) => {
  const society = isUuid(idOrCode)
    ? await prisma.society.findUnique({ where: { id: idOrCode } })
    : await prisma.society.findUnique({ where: { code: idOrCode } });

  if (!society) throw new NotFoundAppError(`Sociedad no encontrada (ID/Code: ${idOrCode})`, { idOrCode });
  return society;
};

export const resolveBranch = async (idOrCode: string, societyId: string) => {
  let branch = await prisma.branchOffice.findUnique({ where: { id: idOrCode } });
  if (!branch) {
    branch = await prisma.branchOffice.findUnique({
      where: { societyId_code: { societyId, code: idOrCode } }
    });
  }
  if (!branch) throw new NotFoundAppError(`Sucursal no encontrada (ID/Code: ${idOrCode})`, { idOrCode, societyId });
  return branch;
};

export const resolvePartner = async (idOrDoc: string) => {
  let partner = await prisma.bussinessPartner.findUnique({ where: { id: idOrDoc } });
  if (!partner) {
    partner = await prisma.bussinessPartner.findFirst({ where: { documentNumber: idOrDoc } });
  }
  if (!partner) throw new NotFoundAppError(`Cliente no encontrado (ID/Doc: ${idOrDoc})`, { idOrDoc });
  return partner;
};

export const resolveCurrency = async (idOrCode: string) => {
  let currency = await prisma.currency.findUnique({ where: { id: idOrCode } });
  if (!currency) {
    currency = await prisma.currency.findUnique({ where: { code: idOrCode } });
  }
  if (!currency) throw new NotFoundAppError(`Moneda no encontrada (ID/Code: ${idOrCode})`, { idOrCode });
  return currency;
};

export const buildProductMap = (products: Product[]) => {
  const productMap = new Map<string, Product>();
  products.forEach(product => productMap.set(product.id, product));
  return productMap;
};

export const calculateOrderItems = (
  orderItems: Array<{ productId: string; quantity: number; unitPrice: number; comment?: string }>,
  productMap: Map<string, Product>
): CalculatedOrderItem[] => {
  return orderItems.map(item => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new NotFoundAppError(`Producto no encontrado (ID: ${item.productId})`, {
        productId: item.productId,
      });
    }

    const listPrice = Number(product.price);
    const soldPrice = item.unitPrice;

    const finalUnitPrice = soldPrice < listPrice ? listPrice : soldPrice;
    const finalDiscount = soldPrice < listPrice ? (listPrice - soldPrice) * item.quantity : 0;

    const grossTotal = item.quantity * soldPrice;
    const subtotal = Number((grossTotal / (1 + ORDER_TAX_RATE)).toFixed(2));
    const taxAmount = Number((grossTotal - subtotal).toFixed(2));

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: finalUnitPrice,
      discount: finalDiscount,
      subtotal,
      taxAmount,
      total: grossTotal,
      comment: item.comment,
      costPrice: Number(product.priceCost || 0),
    };
  });
};

export const calculateOrderTotals = (itemsToCreate: CalculatedOrderItem[], globalDiscount: number) => {
  const grossTotal = itemsToCreate.reduce((acc, item) => acc + item.total, 0);
  const subtotal = itemsToCreate.reduce((acc, item) => acc + item.subtotal, 0);
  const taxAmount = Number((grossTotal - subtotal).toFixed(2));

  return {
    orderTotalGross: grossTotal,
    orderSubtotal: subtotal,
    totalTax: taxAmount,
    totalAmount: Math.max(grossTotal - globalDiscount, 0),
  };
};

export const validateBranchStockAvailability = async (
  branchId: string,
  productIds: string[],
  itemsToCreate: CalculatedOrderItem[],
  productMap: Map<string, Product>
) => {
  const allBranchStocks = await prisma.branchOfficeProduct.findMany({
    where: {
      branchOfficeId: branchId,
      productId: { in: productIds }
    },
    select: { productId: true, availableStock: true }
  });

  const stockMap = new Map(allBranchStocks.map(stock => [stock.productId, stock.availableStock]));
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
    throw new ConflictAppError(`No se puede crear la orden:\n${stockErrors.join('\n')}`, { branchId, productIds, stockErrors });
  }
};

export const invalidateOrderCaches = async (societyId: string, orderId?: string) => {
  const cacheOperations = [
    redis.deleteKeysByPrefix(`${ORDER_CACHE_PREFIX}list:`),
    ...ORDER_DASHBOARD_CACHE_KEYS.map(key => redis.deleteKeysByPrefix(`dashboard:${key}:${societyId}`)),
    redis.deleteKeysByPrefix('products:'),
    redis.deleteKeysByPrefix('products:select:'),
    redis.deleteKeysByPrefix('branch_office_products:')
  ];

  if (orderId) {
    cacheOperations.unshift(redis.del(`${ORDER_CACHE_PREFIX}${orderId}`));
  }

  await Promise.all(cacheOperations);
};
