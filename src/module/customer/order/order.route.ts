import { Router } from 'express';
import { OrderController } from './order.controller';

const router = Router();

// Routes
// Defined before :id to prevent conflict
router.get('/report', OrderController.getReport);

router.get('/', OrderController.getAll);
router.get('/:id', OrderController.getById);
router.post('/', OrderController.create);
router.put('/:id', OrderController.update);
router.delete('/:id', OrderController.delete);

export default router;
