import { z } from 'zod';

export const createSocietySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  subscriptionId: z.string().min(1, 'Subscription is required'),
  createdBy: z.string().uuid().optional(),
});

export const updateSocietySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  updatedBy: z.string().uuid().optional(),
});

export const societyIdSchema = z.object({
  id: z.string().uuid(),
});


