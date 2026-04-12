import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
    outgoingConsignmentAgreement: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  redisMock: {
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

import { getAllAgreements } from '@/module/customer/outgoingConsignmentAgreement/outgoingConsignmentAgreement.service';

describe('outgoingConsignmentAgreement.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
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
});
