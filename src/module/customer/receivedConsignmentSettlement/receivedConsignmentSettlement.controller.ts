import { Request, Response } from 'express';
import * as service from './receivedConsignmentSettlement.service';
import {
  createReceivedConsignmentSettlementSchema,
  updateReceivedConsignmentSettlementSchema,
  receivedConsignmentSettlementIdSchema,
  filterReceivedConsignmentSettlementSchema,
} from './receivedConsignmentSettlement.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const create = async (req: Request, res: Response) => {
  const data = createReceivedConsignmentSettlementSchema.parse(req.body);
  const created = await service.createReceivedConsignmentSettlement(data);
  res.status(201).json(created);
};

export const getAll = async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
  const filtersParse = filterReceivedConsignmentSettlementSchema.safeParse({ query: req.query });

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json({
      ...(paginationParse.error?.format?.() ?? {}),
      ...(filtersParse.error?.format?.() ?? {}),
    });
  }

  const data = await service.getAllReceivedConsignmentSettlements(
    paginationParse.data.query,
    filtersParse.data.query
  );
  res.json(data);
};

export const getById = async (req: Request, res: Response) => {
  const { id } = receivedConsignmentSettlementIdSchema.parse(req.params);
  const data = await service.getReceivedConsignmentSettlementById(id);
  if (!data) return res.status(404).json({ message: 'Settlement not found' });
  res.json(data);
};

export const update = async (req: Request, res: Response) => {
  const { id } = receivedConsignmentSettlementIdSchema.parse(req.params);
  const data = updateReceivedConsignmentSettlementSchema.parse(req.body);
  const updated = await service.updateReceivedConsignmentSettlement(id, data);
  res.json(updated);
};

export const remove = async (req: Request, res: Response) => {
  const { id } = receivedConsignmentSettlementIdSchema.parse(req.params);
  const deleted = await service.deleteReceivedConsignmentSettlement(id);
  res.json(deleted);
};
