import { Request, Response } from 'express';
import * as ProductService from './product.service';
import { createProductSchema, updateProductSchema } from './product.schema';

export const create = async (req: Request, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const product = await ProductService.createProduct(parsed.data as any);
  res.status(201).json(product);
};

export const getAll = async (req: Request, res: Response) => {
  const { page, limit, isActive, societyId, categoryId } = req.query;

  const filters = {
    page: Number(page) || 1,
    limit: Number(limit) || 10,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    societyId: societyId?.toString(),
    categoryId: categoryId?.toString()
  };

  const result = await ProductService.getProducts(filters);
  res.json(result);
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = await ProductService.getProductById(id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
};

export const update = async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const updated = await ProductService.updateProduct(id, parsed.data);
  res.json(updated);
};

export const remove = async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = await ProductService.deleteProduct(id);
  res.json(deleted);
};
