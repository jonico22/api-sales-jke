import prisma from '@/config/prisma';
import { DomainRuleAppError, NotFoundAppError } from '@/utils/domain-errors';
import { PartnerType, PurchaseStatus } from '@prisma/client';

export const PURCHASE_CACHE_PREFIX = 'purchases:';
export const PURCHASE_CACHE_TTL_LIST = 300;
export const PURCHASE_CACHE_TTL_SINGLE = 600;
export const PURCHASE_TOTAL_TOLERANCE = 0.01;

export const isUuid = (value: string) =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

export const resolvePurchaseSocietyId = async (societyRef?: string) => {
  if (!societyRef) {
    return undefined;
  }

  if (isUuid(societyRef)) {
    return societyRef;
  }

  const society = await prisma.society.findUnique({
    where: { code: societyRef },
    select: { id: true },
  });

  if (!society) {
    return null;
  }

  return society.id;
};

export const assertPurchaseCanBeCompleted = (purchase: {
  id: string;
  subTotal: unknown;
  taxAmount: unknown;
  totalAmount: unknown;
  purchaseDetails: Array<{
    quantity: number;
    subtotal: unknown;
    taxAmount: unknown;
    total: unknown;
  }>;
}) => {
  if (purchase.purchaseDetails.length === 0) {
    throw new DomainRuleAppError('No se puede completar una compra sin detalles', {
      purchaseId: purchase.id,
    });
  }

  const detailSubtotal = purchase.purchaseDetails.reduce((sum, detail) => sum + Number(detail.subtotal || 0), 0);
  const detailTaxAmount = purchase.purchaseDetails.reduce((sum, detail) => sum + Number(detail.taxAmount || 0), 0);
  const detailTotal = purchase.purchaseDetails.reduce((sum, detail) => sum + Number(detail.total || 0), 0);

  const purchaseSubtotal = Number(purchase.subTotal || 0);
  const purchaseTaxAmount = Number(purchase.taxAmount || 0);
  const purchaseTotal = Number(purchase.totalAmount || 0);

  const hasMismatch =
    Math.abs(detailSubtotal - purchaseSubtotal) > PURCHASE_TOTAL_TOLERANCE ||
    Math.abs(detailTaxAmount - purchaseTaxAmount) > PURCHASE_TOTAL_TOLERANCE ||
    Math.abs(detailTotal - purchaseTotal) > PURCHASE_TOTAL_TOLERANCE;

  if (hasMismatch) {
    throw new DomainRuleAppError('No se puede completar la compra porque los totales no coinciden con sus detalles', {
      purchaseId: purchase.id,
      purchaseTotals: {
        subTotal: purchaseSubtotal,
        taxAmount: purchaseTaxAmount,
        totalAmount: purchaseTotal,
      },
      detailTotals: {
        subTotal: detailSubtotal,
        taxAmount: detailTaxAmount,
        totalAmount: detailTotal,
      },
    });
  }
};

export const assertSupplierPartner = async (providerId: string) => {
  const provider = await prisma.bussinessPartner.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    throw new NotFoundAppError('Proveedor no encontrado', { providerId });
  }

  if (provider.type !== PartnerType.SUPPLIER && provider.type !== PartnerType.BOTH) {
    throw new DomainRuleAppError(
      `El socio de negocio '${provider.companyName || provider.firstName}' no está registrado como PROVEEDOR.`,
      { providerId, providerType: provider.type }
    );
  }

  return provider;
};

export const shouldCompletePurchase = (currentStatus: PurchaseStatus, nextStatus?: PurchaseStatus) =>
  nextStatus === PurchaseStatus.COMPLETED && currentStatus !== PurchaseStatus.COMPLETED;

export const buildPurchaseListCacheKey = (
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filters?: {
    providerId?: string;
    status?: PurchaseStatus;
    purchaseDateFrom?: Date;
    purchaseDateTo?: Date;
    documentNumber?: string;
  },
  societyId?: string
) =>
  [
    PURCHASE_CACHE_PREFIX,
    'list',
    societyId || 'all',
    filters?.providerId || 'all',
    filters?.status || 'all',
    filters?.purchaseDateFrom?.toISOString() || 'all',
    filters?.purchaseDateTo?.toISOString() || 'all',
    filters?.documentNumber || 'all',
    page,
    limit,
    sortBy,
    sortOrder,
  ].join(':');

export const buildPurchaseWhereClause = (filters?: {
  providerId?: string;
  status?: PurchaseStatus;
  purchaseDateFrom?: Date;
  purchaseDateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  documentNumber?: string;
}, societyId?: string) => {
  const whereClause: any = {
    ...(societyId && { societyId }),
    ...(filters?.providerId && { providerId: filters.providerId }),
    ...(filters?.status && { status: filters.status }),
  };

  if (filters?.documentNumber) {
    whereClause.documentNumber = { contains: filters.documentNumber, mode: 'insensitive' };
  }

  if (filters?.minAmount !== undefined || filters?.maxAmount !== undefined) {
    whereClause.totalAmount = {};
    if (filters.minAmount !== undefined) whereClause.totalAmount.gte = filters.minAmount;
    if (filters.maxAmount !== undefined) whereClause.totalAmount.lte = filters.maxAmount;
  }

  if (filters?.purchaseDateFrom || filters?.purchaseDateTo) {
    whereClause.purchaseDate = {};
    if (filters.purchaseDateFrom) whereClause.purchaseDate.gte = filters.purchaseDateFrom;
    if (filters.purchaseDateTo) whereClause.purchaseDate.lte = filters.purchaseDateTo;
  }

  return whereClause;
};
