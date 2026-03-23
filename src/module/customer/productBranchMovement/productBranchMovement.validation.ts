import { z } from 'zod';

export const createProductBranchMovementSchema = z.object({
  originBranchId: z.string().uuid(),
  destinationBranchId: z.string().uuid(),
  productId: z.string().uuid(),
  quantityMoved: z.number().int().positive(),
  movementDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  referenceCode: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  createdBy: z.string().uuid().optional(),
});

export const bulkCreateProductBranchMovementSchema = z.object({
  originBranchId: z.string().uuid(),
  destinationBranchId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantityMoved: z.number().int().positive(),
    notes: z.string().optional(),
  })).min(1, 'At least one item is required'),
  referenceCode: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});

export const transferAllSchema = z.object({
  originBranchId: z.string().uuid(),
  destinationBranchId: z.string().uuid(),
  notes: z.string().optional(),
  referenceCode: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});

export const updateProductBranchMovementSchema = createProductBranchMovementSchema.partial();

export const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const productBranchMovementFiltersSchema = z.object({
  originBranchId: z.string().optional(),
  destinationBranchId: z.string().optional(),
  productId: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  batchId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
