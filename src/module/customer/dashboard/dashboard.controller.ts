
import { Request, Response } from 'express';
import { DashboardService } from './dashboard.service';

export const DashboardController = {
    getStats: async (req: Request, res: Response) => {
        try {
            // Prioritize query param, fallback to header or body user info
            const societyCode = req.query.societyCode as string || req.query.societyId as string;

            // If no society code in query, restrict to authenticated user's society if available
            // For now, mirroring other controllers that accept societyCode from query
            if (!societyCode) {
                return res.status(400).json({ message: 'Society Code/ID is required' });
            }

            const stats = await DashboardService.getStats(societyCode);
            res.json(stats);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving dashboard stats', error: error.message });
        }
    }
};
