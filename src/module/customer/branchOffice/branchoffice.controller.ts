import { Request, Response } from 'express';
import { BranchOfficeService } from './branchoffice.service';
import { branchOfficeFiltersSchema, branchOfficeIdSchema } from './branchoffice.validation';
import { paginationQuerySchema } from '@/schemas/pagination.schema';

export const BranchOfficeController = {
  getAll: async (req: Request, res: Response) => {
    const paginationParse = paginationQuerySchema.safeParse({ query: req.query });
    const filtersParse = branchOfficeFiltersSchema.safeParse({ query: req.query });

    if (!paginationParse.success || !filtersParse.success) {
      return res.status(400).json({
        ...(paginationParse.error?.format?.() ?? {}),
        ...(filtersParse.error?.format?.() ?? {}),
      });
    }

    const data = await BranchOfficeService.getAll(
      paginationParse.data.query,
      filtersParse.data.query
    );
    res.json(data);
  },

  getById: async (req: Request, res: Response) => {
    const id = branchOfficeIdSchema.parse(req.params.id);
    const result = await BranchOfficeService.getById(id);
    if (!result) return res.status(404).json({ message: 'BranchOffice not found' });
    res.json(result);
  },

  getForSelect: async (req: Request, res: Response) => {
    try {
      const result = await BranchOfficeService.getForSelect();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: 'Error retrieving branch offices list', error: error.message });
    }
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
