import { Request, Response } from 'express';
import * as service from './deliveredConsignmentAgreement.service';
import {
  createDeliveredConsignmentAgreementSchema,
  updateDeliveredConsignmentAgreementSchema,
  deliveredConsignmentAgreementIdSchema,
  filterDeliveredConsignmentAgreementSchema,
} from './deliveredConsignmentAgreement.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';
import { asyncHandler } from '@/utils/asyncHandler';
import { formatSafeParseErrors } from '@/utils/controller-helpers';

export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
  const filtersParse = filterDeliveredConsignmentAgreementSchema.safeParse({ query: req.query });

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json(formatSafeParseErrors(paginationParse, filtersParse));
  }

  const data = await service.getAll(
    paginationParse.data.query,
    filtersParse.data.query
  );
  res.json(data);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = deliveredConsignmentAgreementIdSchema.parse(req.params);
  const data = await service.getById(id);
  if (!data) return res.status(404).json({ message: 'Item not found' });
  res.json(data);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = createDeliveredConsignmentAgreementSchema.parse(req.body);
  const created = await service.create(data);
  res.status(201).json(created);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = deliveredConsignmentAgreementIdSchema.parse(req.params);
  const data = updateDeliveredConsignmentAgreementSchema.parse(req.body);
  const updated = await service.update(id, data);
  res.json(updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = deliveredConsignmentAgreementIdSchema.parse(req.params);
  const deleted = await service.remove(id);
  res.json(deleted);
});
