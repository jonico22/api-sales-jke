import { Request, Response } from 'express';
import { ProductBranchMovementService } from './productBranchMovement.service';
import {
  createProductBranchMovementSchema,
  updateProductBranchMovementSchema,
  productBranchMovementFiltersSchema,
  paramsSchema,
} from './productBranchMovement.validation';

export class ProductBranchMovementController {
  static async getAll(req: Request, res: Response) {
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc'
    };
    const filters = productBranchMovementFiltersSchema.parse(req.query);

    const movements = await ProductBranchMovementService.getAll(pagination, filters);
    res.json(movements);
  }

  static async getById(req: Request, res: Response) {
    const { id } = paramsSchema.parse(req.params);
    const movement = await ProductBranchMovementService.getById(id);
    if (!movement) return res.status(404).json({ message: 'Movement not found' });
    res.json(movement);
  }

  static async create(req: Request, res: Response) {
    // Service handles validation + logic
    const movement = await ProductBranchMovementService.create(req.body);
    res.status(201).json(movement);
  }

  static async createBulk(req: Request, res: Response) {
    try {
      const result = await ProductBranchMovementService.createBulk(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    const { id } = paramsSchema.parse(req.params);
    // Use partial schema or custom input? Service expects Partial<Input>
    const data = updateProductBranchMovementSchema.parse(req.body);

    // Pass extra fields like cancellationReason if they are in body but not in standard update schema?
    // We should update the validation schema for update to include cancellationReason.
    const movement = await ProductBranchMovementService.update(id, req.body);
    res.json(movement);
  }

  static async delete(req: Request, res: Response) {
    const { id } = paramsSchema.parse(req.params);
    await ProductBranchMovementService.delete(id);
    res.status(204).send();
  }
}
