
import { Request, Response } from 'express';
import { FavoriteService } from './favorite.service';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { getQueryString } from '@/utils/controller-helpers';

const toggleFavoriteSchema = z.object({
    productId: z.string().uuid(),
    societyId: z.string().min(1).optional()
});

export const FavoriteController = {
    toggle: asyncHandler(async (req: Request, res: Response) => {
        const parse = toggleFavoriteSchema.safeParse(req.body || {});
        if (!parse.success) return res.status(400).json(parse.error.format());

        const userId = req.body?.user?.id || req.headers['x-user-id'] as string; // Adapt to your auth system
        if (!userId) return res.status(401).json({ message: 'User ID required' });

        const result = await FavoriteService.toggle(userId, parse.data.productId, parse.data.societyId);
        res.json(result);
    }),

    getMyFavorites: asyncHandler(async (req: Request, res: Response) => {
        const userId = req.body?.user?.id || req.headers['x-user-id'] as string; // Adapt to your auth system
        if (!userId) return res.status(401).json({ message: 'User ID required' });

        const societyId = getQueryString(req, 'societyCode', 'societyId');

        const result = await FavoriteService.getByUser(userId, societyId);
        res.json(result);
    })
};
