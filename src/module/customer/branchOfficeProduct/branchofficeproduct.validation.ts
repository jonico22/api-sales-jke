import { z } from 'zod';

export const createBranchOfficeProductSchema = z.object({
  productId: z.string().uuid(),
  branchOfficeId: z.string().uuid(),
  availableStock: z.number().int().nonnegative().default(0),
  physicalStock: z.number().int().nonnegative().default(0),
  reservedStock: z.number().int().nonnegative().default(0),
  defectiveStock: z.number().int().nonnegative().default(0),
  location: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  minStock: z.number().int().nonnegative().optional(),
  maxStock: z.number().int().nonnegative().optional(),
  lastRestockedAt: z.coerce.date().optional(),
  createdBy: z.string().optional(),
});

export const updateBranchOfficeProductSchema = z.object({
  availableStock: z.number().int().nonnegative().optional(),
  physicalStock: z.number().int().nonnegative().optional(),
  reservedStock: z.number().int().nonnegative().optional(),
  defectiveStock: z.number().int().nonnegative().optional(),
  location: z.string().optional(),
  isActive: z.boolean().optional(),
  minStock: z.number().int().nonnegative().optional(),
  maxStock: z.number().int().nonnegative().optional(),
  lastRestockedAt: z.coerce.date().optional(),
  updatedBy: z.string().optional(),
});

export const branchOfficeProductIdSchema = z.string().uuid('Invalid BranchOfficeProduct ID');

export const branchOfficeProductFiltersSchema = z.object({
  query: z.object({
    branchOfficeId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    productName: z.string().optional(),
    location: z.string().optional(),
    lowStock: z.string().transform(val => val === 'true').optional(),
    isActive: z.string().transform(val => val === 'true').optional(),
    stockFrom: z.string().transform(val => parseInt(val)).optional(),
    stockTo: z.string().transform(val => parseInt(val)).optional(),
  }),
});
