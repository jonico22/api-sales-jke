import { Router } from 'express';
import * as controller from './society.controller';

const router = Router();

router.post('/', controller.create);
router.get('/', controller.findAll);
router.get('/current', controller.current); // New endpoint
router.get('/:code', controller.findOne);
router.put('/:code', controller.update);
router.delete('/:code', controller.remove);

export default router;
