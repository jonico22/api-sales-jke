import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundAppError, ValidationAppError } from '@/utils/domain-errors';

const { fileServiceMock, storageServiceMock, prismaMock } = vi.hoisted(() => ({
  fileServiceMock: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  storageServiceMock: {
    uploadFile: vi.fn(),
  },
  prismaMock: {
    society: {
      findUnique: vi.fn(),
    },
    file: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('@/module/customer/file/file.service', () => ({
  FileService: fileServiceMock,
}));

vi.mock('@/module/customer/file/storage.service', () => ({
  StorageService: storageServiceMock,
}));

vi.mock('@/config/prisma', () => ({
  default: prismaMock,
}));

import { FileController } from '@/module/customer/file/file.controller';

const flushAsyncHandler = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('FileController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when upload receives no file', async () => {
    const req: any = { query: { societyId: 'SOC1' } };
    const res = createResponse();
    const next = vi.fn();

    await FileController.upload(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('delegates not found when upload cannot resolve society', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce(null);
    const req: any = {
      file: { size: 10, buffer: Buffer.from('a'), originalname: 'a.txt', mimetype: 'text/plain' },
      query: { societyId: 'SOC1' },
    };
    const res = createResponse();
    const next = vi.fn();

    await FileController.upload(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundAppError);
  });

  it('delegates validation error when storage limit is exceeded', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({ id: 'soc-1', storageLimit: 100 });
    prismaMock.file.aggregate.mockResolvedValueOnce({ _sum: { size: 95 } });
    const req: any = {
      file: { size: 10, buffer: Buffer.from('a'), originalname: 'a.txt', mimetype: 'text/plain' },
      query: { societyId: 'SOC1', category: 'GENERAL' },
    };
    const res = createResponse();
    const next = vi.fn();

    await FileController.upload(req, res as any, next);
    await flushAsyncHandler();

    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeInstanceOf(ValidationAppError);
  });

  it('uploads a report successfully', async () => {
    prismaMock.society.findUnique.mockResolvedValueOnce({ id: 'soc-1', storageLimit: 0 });
    storageServiceMock.uploadFile.mockResolvedValueOnce({
      originalName: 'report.xlsx',
      url: 'https://cdn/report.xlsx',
      key: 'societies/soc-1/reports/report.xlsx',
    });
    fileServiceMock.create.mockResolvedValueOnce({ id: 'file-1' });
    const req: any = {
      file: { size: 10, buffer: Buffer.from('a'), originalname: 'report.xlsx', mimetype: 'application/vnd.ms-excel' },
      query: { societyId: 'SOC1', category: 'REPORT' },
    };
    const res = createResponse();
    const next = vi.fn();

    await FileController.upload(req, res as any, next);
    await flushAsyncHandler();

    expect(storageServiceMock.uploadFile).toHaveBeenCalled();
    expect(fileServiceMock.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'file-1' });
  });
});
