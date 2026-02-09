import { Router } from 'express';
import { TaxController } from './tax.controller';

const router = Router();

router.get('/', TaxController.getAll);
router.post('/', TaxController.create);
router.put('/:id', TaxController.update);

export default router;
