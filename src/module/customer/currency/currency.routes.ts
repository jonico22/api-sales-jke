import { Router } from 'express';
import { CurrencyController } from './currency.controller';

const router = Router();

router.get('/', CurrencyController.getAll);
router.get('/select', CurrencyController.getForSelect);
router.post('/', CurrencyController.create);
router.put('/:id', CurrencyController.update);

export default router;
