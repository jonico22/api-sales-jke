import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { getQueryString } from '@/utils/controller-helpers';
import { AnalyticsFilters } from './analytics.helpers';
import { AnalyticsService } from './analytics.service';

const getSocietyCodeOrId = (req: Request) => getQueryString(req, 'societyCode', 'societyId');

const getAnalyticsFilters = (req: Request): AnalyticsFilters => {
  const branchId = getQueryString(req, 'branchId');
  const dateFrom = getQueryString(req, 'dateFrom');
  const dateTo = getQueryString(req, 'dateTo');
  const granularity = getQueryString(req, 'granularity') as AnalyticsFilters['granularity'];
  const comparePreviousRaw = getQueryString(req, 'comparePrevious');
  const limitRaw = getQueryString(req, 'limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  return {
    ...(branchId ? { branchId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(granularity ? { granularity } : {}),
    ...(comparePreviousRaw ? { comparePrevious: comparePreviousRaw === 'true' } : {}),
    ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
  };
};

export const AnalyticsController = {
  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getSummary(societyCode, getAnalyticsFilters(req)));
  }),
  getSalesTrend: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getSalesTrend(societyCode, getAnalyticsFilters(req)));
  }),
  getCashFlowTrend: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getCashFlowTrend(societyCode, getAnalyticsFilters(req)));
  }),
  getSalesByCategory: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getSalesByCategory(societyCode, getAnalyticsFilters(req)));
  }),
  getSalesByBranch: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getSalesByBranch(societyCode, getAnalyticsFilters(req)));
  }),
  getPaymentsDistribution: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getPaymentsDistribution(societyCode, getAnalyticsFilters(req)));
  }),
  getProductsTop: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getProductsTop(societyCode, getAnalyticsFilters(req)));
  }),
  getInventoryLowStock: asyncHandler(async (req: Request, res: Response) => {
    const societyCode = getSocietyCodeOrId(req);
    if (!societyCode) return res.status(400).json({ message: 'Society Code/ID is required' });
    res.json(await AnalyticsService.getInventoryLowStock(societyCode, getAnalyticsFilters(req)));
  }),
};
