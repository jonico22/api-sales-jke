import { Router } from 'express';
import { BranchOfficeProductController } from './branchofficeproduct.controller';

const router = Router();

router.get('/', BranchOfficeProductController.getAll);
router.get('/:id', BranchOfficeProductController.getById);
router.post('/', BranchOfficeProductController.create);
router.put('/:id', BranchOfficeProductController.update);
router.delete('/:id', BranchOfficeProductController.delete);

export default router;
