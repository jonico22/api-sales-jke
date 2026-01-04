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
  createdBy: z.string().optional(),
});

export const updateProductBranchMovementSchema = createProductBranchMovementSchema.partial();

export const paramsSchema = z.object({
  id: z.string().uuid(),
});
