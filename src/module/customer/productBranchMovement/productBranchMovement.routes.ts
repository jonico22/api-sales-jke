import { Router } from 'express';
import { ProductBranchMovementController } from './productBranchMovement.controller';

const router = Router();

router.get('/', ProductBranchMovementController.getAll);
router.get('/:id', ProductBranchMovementController.getById);
router.post('/', ProductBranchMovementController.create);
router.put('/:id', ProductBranchMovementController.update);
router.delete('/:id', ProductBranchMovementController.delete);

export default router;
