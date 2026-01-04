import { Request, Response } from 'express';
import * as service from './outgoingConsignmentAgreement.service';

export const create = async (req: Request, res: Response) => {
  const data = await service.createAgreement(req.body);
  res.status(201).json(data);
};

export const update = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await service.updateAgreement(id, req.body);
  res.json(data);
};

export const remove = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await service.deleteAgreement(id);
  res.json(data);
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await service.getAgreementById(id);
  res.json(data);
};

export const getAll = async (req: Request, res: Response) => {
  const data = await service.getAllAgreements(req.query);
  res.json(data);
};
