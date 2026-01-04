import { z } from 'zod';

export const createBranchOfficeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
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
  isMain: z.boolean().optional(),
  societyId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  updatedBy: z.string().optional(),
});

export const branchOfficeIdSchema = z.string().uuid('Invalid BranchOffice ID');
