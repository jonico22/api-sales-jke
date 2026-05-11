import { randomUUID } from 'node:crypto';
import { prisma } from '@/config/prisma';
import { PartnerType } from '@prisma/client';

export const integrationTestsEnabled = process.env.RUN_INTEGRATION_TESTS === 'true';

export type OrderInventoryFixture = {
  ids: {
    societyId: string;
    branchId: string;
    partnerId: string;
    currencyId: string;
    categoryId: string;
    productId: string;
  };
  refs: {
    societyCode: string;
    branchCode: string;
    currencyCode: string;
  };
  cleanup: () => Promise<void>;
};

type FixtureOptions = {
  partnerType?: PartnerType;
  initialStock?: number;
};

export const ensureIntegrationDbConnection = async () => {
  await prisma.$connect();
};

export const closeIntegrationDbConnection = async () => {
  await prisma.$disconnect();
};

export const createOrderInventoryFixture = async (
  options: FixtureOptions = {}
): Promise<OrderInventoryFixture> => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const partnerType = options.partnerType ?? PartnerType.CUSTOMER;
  const initialStock = options.initialStock ?? 10;

  const currency = await prisma.currency.create({
    data: {
      name: `Test Currency ${suffix}`,
      code: `TC${suffix}`,
      symbol: '$',
    },
  });

  const society = await prisma.society.create({
    data: {
      name: `Test Society ${suffix}`,
      code: `SOC-${suffix}`,
      subscriptionId: `sub-${suffix}`,
    },
  });

  const branch = await prisma.branchOffice.create({
    data: {
      societyId: society.id,
      name: `Branch ${suffix}`,
      code: `BR-${suffix}`,
    },
  });

  const partner = await prisma.bussinessPartner.create({
    data: {
      societyId: society.id,
      type: partnerType,
      typeBP: 'PERSON',
      documentNumber: `DOC-${suffix}`,
      firstName: 'Integration',
      lastName: 'Customer',
    },
  });

  const category = await prisma.category.create({
    data: {
      societyId: society.id,
      name: `Category ${suffix}`,
      code: `CAT-${suffix}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      societyId: society.id,
      categoryId: category.id,
      name: `Product ${suffix}`,
      code: `PROD-${suffix}`,
      price: 100,
      priceCost: 40,
      stock: initialStock,
    },
  });

  await prisma.branchOfficeProduct.create({
    data: {
      productId: product.id,
      branchOfficeId: branch.id,
      physicalStock: initialStock,
      availableStock: initialStock,
      reservedStock: 0,
    },
  });

  return {
    ids: {
      societyId: society.id,
      branchId: branch.id,
      partnerId: partner.id,
      currencyId: currency.id,
      categoryId: category.id,
      productId: product.id,
    },
    refs: {
      societyCode: society.code,
      branchCode: branch.code || branch.id,
      currencyCode: currency.code,
    },
    cleanup: async () => {
      await prisma.inventoryTransaction.deleteMany({
        where: {
          OR: [
            { productId: product.id },
            { branchOfficeId: branch.id },
          ],
        },
      });
      await prisma.orderPayment.deleteMany({ where: { societyId: society.id } });
      await prisma.orderItem.deleteMany({ where: { productId: product.id } });
      await prisma.order.deleteMany({ where: { societyId: society.id } });
      await prisma.branchOfficeProduct.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.bussinessPartner.deleteMany({ where: { id: partner.id } });
      await prisma.branchOffice.deleteMany({ where: { id: branch.id } });
      await prisma.society.deleteMany({ where: { id: society.id } });
      await prisma.currency.deleteMany({ where: { id: currency.id } });
    },
  };
};
