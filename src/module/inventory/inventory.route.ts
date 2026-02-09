
import { Router } from 'express';
import { InventoryController } from './inventory.controller';

const router = Router();

// Listado (Kardex)
router.get('/kardex', InventoryController.getAll);

// Ajuste Manual (Stock Adjustment)
router.post('/adjustment', InventoryController.createAdjustment);

export default router;
