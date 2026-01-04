import { Router } from 'express';
import { DeliveredConsignmentAgreementController } from './deliveredConsignmentAgreement.controller';

const router = Router();

router.get('/', DeliveredConsignmentAgreementController.getAll);
router.get('/:id', DeliveredConsignmentAgreementController.getById);
router.post('/', DeliveredConsignmentAgreementController.create);
router.put('/:id', DeliveredConsignmentAgreementController.update);
router.delete('/:id', DeliveredConsignmentAgreementController.delete);

export default router;
