import { Router } from 'express';
import { BranchOfficeController } from './branchoffice.controller';

const router = Router();

router.get('/', BranchOfficeController.getAll);
router.get('/:id', BranchOfficeController.getById);
router.post('/', BranchOfficeController.create);
router.put('/:id', BranchOfficeController.update);
router.delete('/:id', BranchOfficeController.delete);

export default router;
