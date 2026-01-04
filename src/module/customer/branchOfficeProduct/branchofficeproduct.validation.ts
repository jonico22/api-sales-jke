import { z } from 'zod';

export const createBranchOfficeProductSchema = z.object({
  productId: z.string().uuid(),
  branchOfficeId: z.string().uuid(),
  availableStock: z.number().int().nonnegative().default(0),
  minStock: z.number().int().nonnegative().optional(),
  maxStock: z.number().int().nonnegative().optional(),
  lastRestockedAt: z.coerce.date().optional(),
  createdBy: z.string().optional(),
});

export const updateBranchOfficeProductSchema = z.object({
  availableStock: z.number().int().nonnegative().optional(),
  minStock: z.number().int().nonnegative().optional(),
  maxStock: z.number().int().nonnegative().optional(),
  lastRestockedAt: z.coerce.date().optional(),
  updatedBy: z.string().optional(),
});

export const branchOfficeProductIdSchema = z.string().uuid('Invalid BranchOfficeProduct ID');
