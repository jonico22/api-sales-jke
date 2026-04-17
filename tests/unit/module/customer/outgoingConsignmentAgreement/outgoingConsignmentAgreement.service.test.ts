import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
    outgoingConsignmentAgreement: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  redisMock: {
    deleteKeysByPrefix: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

import {
  createAgreement,
  deleteAgreement,
  getAllAgreements,
  updateAgreement,
} from '@/module/customer/outgoingConsignmentAgreement/outgoingConsignmentAgreement.service';

describe('outgoingConsignmentAgreement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
    redisMock.del.mockResolvedValue(undefined);
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
  });

  it('invalidates the agreement list cache after creating an agreement', async () => {
    prismaMock.outgoingConsignmentAgreement.create.mockResolvedValue({ id: 'agreement-1' });

    await createAgreement({
      societyId: '550e8400-e29b-41d4-a716-446655440000',
      branchId: '650e8400-e29b-41d4-a716-446655440000',
      partnerId: '750e8400-e29b-41d4-a716-446655440000',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      commissionRate: 10,
      currencyId: 'PEN',
      totalValue: 0,
    });

    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('outgoingConsignments:list:');
  });

  it('resolves society codes sent in societyId when filtering agreement lists', async () => {
    const findManyQuery = { kind: 'findMany' };
    const countQuery = { kind: 'count' };
    prismaMock.society.findUnique.mockResolvedValue({ id: 'soc-1' });
    prismaMock.outgoingConsignmentAgreement.findMany.mockReturnValue(findManyQuery);
    prismaMock.outgoingConsignmentAgreement.count.mockReturnValue(countQuery);
    prismaMock.$transaction.mockResolvedValue([[{ id: 'agreement-1' }], 1]);

    const result = await getAllAgreements(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      { societyId: 'SOC-001' } as any
    );

    expect(prismaMock.society.findUnique).toHaveBeenCalledWith({ where: { code: 'SOC-001' } });
    expect(prismaMock.outgoingConsignmentAgreement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ societyId: 'soc-1' }),
      })
    );
    expect(result.data).toEqual([{ id: 'agreement-1' }]);
  });

  it('stores and reads list cache keys under the same outgoing consignment prefix', async () => {
    prismaMock.society.findUnique.mockResolvedValue({ id: 'soc-1' });
    prismaMock.outgoingConsignmentAgreement.findMany.mockReturnValue({ kind: 'findMany' });
    prismaMock.outgoingConsignmentAgreement.count.mockReturnValue({ kind: 'count' });
    prismaMock.$transaction.mockResolvedValue([[{ id: 'agreement-1' }], 1]);

    await getAllAgreements(
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      { societyId: 'SOC-001' } as any
    );

    expect(redisMock.set).toHaveBeenCalledWith(
      'outgoingConsignments:list:soc-1:all:all:all:all:1:10:createdAt:desc',
      expect.any(Object),
      300
    );
  });

  it('invalidates the agreement list cache after updating an agreement', async () => {
    prismaMock.outgoingConsignmentAgreement.update.mockResolvedValue({ id: 'agreement-1' });

    await updateAgreement('agreement-1', { notes: 'updated' });

    expect(redisMock.del).toHaveBeenCalledWith('outgoingConsignments:agreement-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('outgoingConsignments:list:');
  });

  it('invalidates the agreement list cache after deleting an agreement', async () => {
    prismaMock.outgoingConsignmentAgreement.delete.mockResolvedValue({ id: 'agreement-1' });

    await deleteAgreement('agreement-1');

    expect(redisMock.del).toHaveBeenCalledWith('outgoingConsignments:agreement-1');
    expect(redisMock.deleteKeysByPrefix).toHaveBeenCalledWith('outgoingConsignments:list:');
  });
});
