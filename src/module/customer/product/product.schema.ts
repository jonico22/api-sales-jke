import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.coerce.number().gt(0),
  stock: z.number().int().nonnegative(),
  minStock: z.number().int().nonnegative().default(0),
  societyId: z.string().uuid(),
  categoryId: z.string().uuid(),
  imageId: z.string().uuid().optional(),
  createdBy: z.string().optional()
});

export const updateProductSchema = createProductSchema.partial().extend({
  updatedBy: z.string().optional()
});
