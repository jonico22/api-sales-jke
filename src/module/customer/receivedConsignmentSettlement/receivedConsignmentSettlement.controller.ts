import { Request, Response } from 'express';
import * as service from './receivedConsignmentSettlement.service';

export const create = async (req: Request, res: Response) => {
  const data = req.body;
  const settlement = await service.createReceivedConsignmentSettlement(data);
  res.status(201).json(settlement);
};

export const getAll = async (_req: Request, res: Response) => {
  const list = await service.getAllReceivedConsignmentSettlements();
  res.json(list);
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const item = await service.getReceivedConsignmentSettlementById(id);
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
};

export const update = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const updated = await service.updateReceivedConsignmentSettlement(id, data);
  res.json(updated);
};

export const remove = async (req: Request, res: Response) => {
  const { id } = req.params;
  await service.deleteReceivedConsignmentSettlement(id);
  res.status(204).send();
};
