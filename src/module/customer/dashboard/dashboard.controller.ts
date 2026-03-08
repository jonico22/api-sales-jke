
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
    },

    getSalesPerformance: async (req: Request, res: Response) => {
        try {
            const societyCode = req.query.societyCode as string || req.query.societyId as string;
            if (!societyCode) {
                return res.status(400).json({ message: 'Society Code/ID is required' });
            }

            const chartData = await DashboardService.getSalesPerformance(societyCode);
            res.json(chartData);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving sales performance', error: error.message });
        }
    },

    getRevenueByCategory: async (req: Request, res: Response) => {
        try {
            const societyCode = req.query.societyCode as string || req.query.societyId as string;
            if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
            res.json(await DashboardService.getRevenueByCategory(societyCode));
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving revenue by category', error: error.message });
        }
    },

    getTopProducts: async (req: Request, res: Response) => {
        try {
            const societyCode = req.query.societyCode as string || req.query.societyId as string;
            if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
            res.json(await DashboardService.getTopProducts(societyCode));
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving top products', error: error.message });
        }
    },

    getPaymentMethods: async (req: Request, res: Response) => {
        try {
            const societyCode = req.query.societyCode as string || req.query.societyId as string;
            if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
            res.json(await DashboardService.getPaymentMethods(societyCode));
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving payment methods', error: error.message });
        }
    },

    getCashFlow: async (req: Request, res: Response) => {
        try {
            const societyCode = req.query.societyCode as string || req.query.societyId as string;
            if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
            res.json(await DashboardService.getCashFlow(societyCode));
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving cash flow', error: error.message });
        }
    },

    getBranchPerformance: async (req: Request, res: Response) => {
        try {
            const societyCode = req.query.societyCode as string || req.query.societyId as string;
            if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
            res.json(await DashboardService.getBranchPerformance(societyCode));
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: 'Error retrieving branch performance', error: error.message });
        }
    }
};
