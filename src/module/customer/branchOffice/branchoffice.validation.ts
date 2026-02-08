import { z } from 'zod';

export const createBranchOfficeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  code: z.string().optional(),
  email: z.string().email().optional(),
  ubigeoId: z.string().length(6).optional(),
  isMain: z.boolean().optional().default(false),
  societyId: z.string().uuid('Invalid society ID'),
  isActive: z.boolean().optional().default(true),
  isDeleted: z.boolean().optional().default(false),
  createdBy: z.string().optional(),
});

export const updateBranchOfficeSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  code: z.string().optional(),
  email: z.string().email().optional(),
  ubigeoId: z.string().length(6).optional(),
  isMain: z.boolean().optional(),
  societyId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  updatedBy: z.string().optional(),
});

export const branchOfficeIdSchema = z.string().uuid('Invalid BranchOffice ID');

export const branchOfficeFiltersSchema = z.object({
  query: z.object({
    societyId: z.string().uuid().optional(),
    search: z.string().optional(),
    isMain: z.string().transform(val => val === 'true').optional(),
    isActive: z.string().transform(val => val === 'true').optional(),
    code: z.string().optional(),
    societyCode: z.string().optional(),
  }),
});
