import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementType, PaymentMethodOrder, ShiftStatus } from '@prisma/client';

const { prismaMock, redisMock, dateFormatterMock } = vi.hoisted(() => ({
  prismaMock: {
    cashShift: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    cashMovement: {
      groupBy: vi.fn(),
    },
    society: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    deleteKeysByPrefix: vi.fn(),
  },
  dateFormatterMock: {
    formatToLimaTime: vi.fn((value: unknown) => value),
    convertLimaDateRangeToUTC: vi.fn(() => ({})),
  },
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

vi.mock('@/config/redis', () => ({
  redis: redisMock,
}));

vi.mock('@/utils/dateFormatter', () => dateFormatterMock);

import { CashShiftService } from '@/module/customer/cashShift/cashShift.service';

describe('cashShift.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue(undefined);
    redisMock.del.mockResolvedValue(undefined);
    redisMock.deleteKeysByPrefix.mockResolvedValue(undefined);
  });

  it('closes a shift using grouped movement aggregates from the database', async () => {
    prismaMock.cashShift.findUnique.mockResolvedValueOnce({
      id: 'shift-1',
      userId: 'user-1',
      initialAmount: 100,
      status: ShiftStatus.OPEN,
    });
    prismaMock.cashMovement.groupBy.mockResolvedValueOnce([
      { type: MovementType.INCOME, paymentMethod: PaymentMethodOrder.CASH, _sum: { amount: 300 } },
      { type: MovementType.INCOME, paymentMethod: PaymentMethodOrder.CARD, _sum: { amount: 200 } },
      { type: MovementType.EXPENSE, paymentMethod: PaymentMethodOrder.CASH, _sum: { amount: 50 } },
    ]);
    prismaMock.cashShift.update.mockResolvedValueOnce({ id: 'shift-1', status: ShiftStatus.CLOSED });

    const result = await CashShiftService.closeShift({
      id: 'shift-1',
      finalReportedAmount: 350,
    } as any);

    expect(prismaMock.cashMovement.groupBy).toHaveBeenCalledWith({
      by: ['type', 'paymentMethod'],
      _sum: { amount: true },
      where: { shiftId: 'shift-1' }
    });
    expect(prismaMock.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shift-1' },
      data: expect.objectContaining({
        finalSystemAmount: 350,
        difference: 0,
        incomeCash: 300,
        incomeCard: 200,
        expenseCash: 50,
      }),
    }));
    expect(result).toEqual({ id: 'shift-1', status: ShiftStatus.CLOSED });
  });

  it('builds a stable cache key for cash shift listing', async () => {
    const findManyQuery = { kind: 'findMany' };
    const countQuery = { kind: 'count' };
    prismaMock.cashShift.findMany.mockReturnValue(findManyQuery);
    prismaMock.cashShift.count.mockReturnValue(countQuery);
    prismaMock.$transaction.mockResolvedValueOnce([[], 0]);

    await CashShiftService.getAll(
      { page: 2, limit: 20, sortBy: 'openedAt', sortOrder: 'asc' },
      { societyId: 'soc-1', branchId: 'branch-1', status: ShiftStatus.OPEN } as any
    );

    expect(redisMock.get).toHaveBeenCalledWith(
      'cashShifts:list:soc-1:branch-1:all:OPEN:all:all:2:20:openedAt:asc'
    );
  });
});
