import { z } from 'zod';
import { Frequency } from '@prisma/client';

export const createSocietySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  subscriptionId: z.string().min(1, 'Subscription is required'),
  createdBy: z.string().uuid().optional(),

  // Regional Config
  mainCurrencyId: z.string().uuid().optional(),
  taxIds: z.array(z.string().uuid()).optional(),

  // Customization
  logoId: z.string().uuid().optional(),
  stockNotificationFrequency: z.nativeEnum(Frequency).optional(),
  salesNotificationFrequency: z.nativeEnum(Frequency).optional(),
  backupFrequency: z.nativeEnum(Frequency).optional(),
  dataRetentionDays: z.number().int().min(1).optional(),
  uiConfig: z.record(z.string(), z.any()).optional(),

  // Limits Configuration
  maxUsers: z.number().int().min(1).optional(),
  maxProducts: z.number().int().min(1).optional(),
  storageLimit: z.number().int().min(0).optional(),

  // Current Usage Metrics (Updatable by external services)
  totalUsers: z.number().int().min(0).optional(),

  // Legal Entity Info (Optional)
  ruc: z.string().optional(),
  businessName: z.string().optional(),
  tradeName: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const updateSocietySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  updatedBy: z.string().uuid().optional(),

  // Regional Config
  mainCurrencyId: z.string().uuid().optional(),
  taxIds: z.array(z.string().uuid()).optional(),

  // Customization
  logoId: z.string().uuid().optional(),
  stockNotificationFrequency: z.nativeEnum(Frequency).optional(),
  salesNotificationFrequency: z.nativeEnum(Frequency).optional(),
  backupFrequency: z.nativeEnum(Frequency).optional(),
  dataRetentionDays: z.number().int().min(1).optional(),
  uiConfig: z.record(z.string(), z.any()).optional(),

  // Limits Configuration
  maxUsers: z.number().int().min(1).optional(),
  maxProducts: z.number().int().min(1).optional(),
  storageLimit: z.number().int().min(0).optional(),

  // Current Usage Metrics (Updatable by external services)
  totalUsers: z.number().int().min(0).optional(),
});

export const societyIdSchema = z.object({
  code: z.string().min(1),
});

export const societyFiltersSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    isActive: z.boolean().optional(),
    createdBy: z.string().optional(),
    createdAtFrom: z.string().optional(),
    createdAtTo: z.string().optional(),
    updatedAtFrom: z.string().optional(),
    updatedAtTo: z.string().optional(),
  })
});
