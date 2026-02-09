import { Router } from 'express';
import { CashShiftController } from './cashShift.controller';

const router = Router();

router.post('/open', CashShiftController.openShift);
router.post('/close/:id', CashShiftController.closeShift);
router.get('/', CashShiftController.getAll);
router.get('/:id', CashShiftController.getById);
router.post('/movements', CashShiftController.addManualMovement);

export default router;
