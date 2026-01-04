import { Request, Response } from 'express';
import { ProductBranchMovementService } from './productBranchMovement.service';
import {
  createProductBranchMovementSchema,
  updateProductBranchMovementSchema,
  paramsSchema,
} from './productBranchMovement.validation';

export class ProductBranchMovementController {
  static async getAll(req: Request, res: Response) {
    const movements = await ProductBranchMovementService.getAll();
    res.json(movements);
  }

  static async getById(req: Request, res: Response) {
    const { id } = paramsSchema.parse(req.params);
    const movement = await ProductBranchMovementService.getById(id);
    if (!movement) return res.status(404).json({ message: 'Movement not found' });
    res.json(movement);
  }

  static async create(req: Request, res: Response) {
    const data = createProductBranchMovementSchema.parse(req.body);
    const movement = await ProductBranchMovementService.create(data);
    res.status(201).json(movement);
  }

  static async update(req: Request, res: Response) {
    const { id } = paramsSchema.parse(req.params);
    const data = updateProductBranchMovementSchema.parse(req.body);
    const movement = await ProductBranchMovementService.update(id, data);
    res.json(movement);
  }

  static async delete(req: Request, res: Response) {
    const { id } = paramsSchema.parse(req.params);
    await ProductBranchMovementService.delete(id);
    res.status(204).send();
  }
}
