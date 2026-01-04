import { Request, Response } from 'express';
import { BranchOfficeProductService } from './branchofficeproduct.service';
import { branchOfficeProductIdSchema } from './branchofficeproduct.validation';

export const BranchOfficeProductController = {
  getAll: async (_req: Request, res: Response) => {
    const data = await BranchOfficeProductService.getAll();
    res.json(data);
  },

  getById: async (req: Request, res: Response) => {
    const id = branchOfficeProductIdSchema.parse(req.params.id);
    const result = await BranchOfficeProductService.getById(id);
    if (!result) return res.status(404).json({ message: 'BranchOfficeProduct not found' });
    res.json(result);
  },

  create: async (req: Request, res: Response) => {
    const result = await BranchOfficeProductService.create(req.body);
    res.status(201).json(result);
  },

  update: async (req: Request, res: Response) => {
    const id = branchOfficeProductIdSchema.parse(req.params.id);
    const result = await BranchOfficeProductService.update(id, req.body);
    res.json(result);
  },

  delete: async (req: Request, res: Response) => {
    const id = branchOfficeProductIdSchema.parse(req.params.id);
    await BranchOfficeProductService.delete(id);
    res.json({ message: 'BranchOfficeProduct deleted successfully' });
  },
};
