import { Request, Response } from 'express';
import * as service from './outgoingConsignmentAgreement.service';

import {
  createOutgoingConsignmentAgreementSchema,
  updateOutgoingConsignmentAgreementSchema,
  outgoingConsignmentAgreementIdSchema,
  filterOutgoingConsignmentAgreementSchema,
} from './outgoingConsignmentAgreement.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const create = async (req: Request, res: Response) => {
  const data = createOutgoingConsignmentAgreementSchema.parse(req.body);
  const created = await service.createAgreement(data);
  res.status(201).json(created);
};

export const update = async (req: Request, res: Response) => {
  const { id } = outgoingConsignmentAgreementIdSchema.parse(req.params);
  const data = updateOutgoingConsignmentAgreementSchema.parse(req.body);
  const updated = await service.updateAgreement(id, data);
  res.json(updated);
};

export const remove = async (req: Request, res: Response) => {
  const { id } = outgoingConsignmentAgreementIdSchema.parse(req.params);
  const deleted = await service.deleteAgreement(id);
  res.json(deleted);
};

export const getById = async (req: Request, res: Response) => {
  const { id } = outgoingConsignmentAgreementIdSchema.parse(req.params);
  const data = await service.getAgreementById(id);
  if (!data) return res.status(404).json({ message: 'Agreement not found' });
  res.json(data);
};

export const getAll = async (req: Request, res: Response) => {
  const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
  const filtersParse = filterOutgoingConsignmentAgreementSchema.safeParse({ query: req.query });

  if (!paginationParse.success || !filtersParse.success) {
    return res.status(400).json({
      ...(paginationParse.error?.format?.() ?? {}),
      ...(filtersParse.error?.format?.() ?? {}),
    });
  }

  const data = await service.getAllAgreements(
    paginationParse.data.query,
    filtersParse.data.query
  );
  res.json(data);
};
