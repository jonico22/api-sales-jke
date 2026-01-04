import { Router } from 'express';
import * as ProductController from './product.controller';

const router = Router();

router.post('/', ProductController.create);
router.get('/', ProductController.getAll);
router.get('/:id', ProductController.getById);
router.put('/:id', ProductController.update);
router.delete('/:id', ProductController.remove);

export default router;
