import { Request, Response } from 'express';
import * as service from './externalConsignmentSale.service';
import {
  createExternalConsignmentSaleSchema,
  updateExternalConsignmentSaleSchema,
  externalConsignmentSaleIdSchema,
  filterExternalConsignmentSaleSchema,
} from './externalConsignmentSale.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors } from '@/utils/controller-helpers';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createExternalConsignmentSaleSchema.parse(req.body);
  const created = await service.createExternalConsignmentSale(data);
  res.status(201).json(created);
});

export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
  const filtersParse = filterExternalConsignmentSaleSchema.safeParse({ query: req.query });

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
  }

  const data = await service.getAllExternalConsignmentSales(
    paginationParse.data.query,
    filtersParse.data.query
  );
  res.json(data);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = externalConsignmentSaleIdSchema.parse(req.params);
  const data = await service.getExternalConsignmentSaleById(id);
  if (!data) return res.status(404).json({ message: 'Sale not found' });
  res.json(data);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = externalConsignmentSaleIdSchema.parse(req.params);
  const data = updateExternalConsignmentSaleSchema.parse(req.body);
  const updated = await service.updateExternalConsignmentSale(id, data);
  res.json(updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = externalConsignmentSaleIdSchema.parse(req.params);
  const deleted = await service.deleteExternalConsignmentSale(id);
  res.json(deleted);
});
