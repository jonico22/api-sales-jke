import { Request, Response } from 'express';
import { DeliveredConsignmentAgreementService } from './deliveredConsignmentAgreement.service';
import { DeliveredConsignmentAgreementSchema, DeliveredConsignmentAgreementUpdateSchema } from './deliveredConsignmentAgreement.validation';

export class DeliveredConsignmentAgreementController {
  static async getAll(req: Request, res: Response) {
    const data = await DeliveredConsignmentAgreementService.getAll();
    res.json(data);
  }

  static async getById(req: Request, res: Response) {
    const { id } = req.params;
    const data = await DeliveredConsignmentAgreementService.getById(id);
    if (!data) return res.status(404).json({ message: 'Not found' });
    res.json(data);
  }

  static async create(req: Request, res: Response) {
    const parsed = DeliveredConsignmentAgreementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const created = await DeliveredConsignmentAgreementService.create(parsed.data as any);
    res.status(201).json(created);
  }

  static async update(req: Request, res: Response) {
    const { id } = req.params;
    const parsed = DeliveredConsignmentAgreementUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);
    const updated = await DeliveredConsignmentAgreementService.update(id, parsed.data);
    res.json(updated);
  }

  static async delete(req: Request, res: Response) {
    const { id } = req.params;
    await DeliveredConsignmentAgreementService.delete(id);
    res.status(204).send();
  }
}
