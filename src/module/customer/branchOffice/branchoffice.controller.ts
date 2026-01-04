import { Request, Response } from 'express';
import { BranchOfficeService } from './branchoffice.service';
import { branchOfficeIdSchema } from './branchoffice.validation';

export const BranchOfficeController = {
  getAll: async (_req: Request, res: Response) => {
    const data = await BranchOfficeService.getAll();
    res.json(data);
  },

  getById: async (req: Request, res: Response) => {
    const id = branchOfficeIdSchema.parse(req.params.id);
    const result = await BranchOfficeService.getById(id);
    if (!result) return res.status(404).json({ message: 'BranchOffice not found' });
    res.json(result);
  },

  create: async (req: Request, res: Response) => {
    const result = await BranchOfficeService.create(req.body);
    res.status(201).json(result);
  },

  update: async (req: Request, res: Response) => {
    const id = branchOfficeIdSchema.parse(req.params.id);
    const result = await BranchOfficeService.update(id, req.body);
    res.json(result);
  },

  delete: async (req: Request, res: Response) => {
    const id = branchOfficeIdSchema.parse(req.params.id);
    await BranchOfficeService.delete(id);
    res.json({ message: 'BranchOffice deleted successfully' });
  },
};
