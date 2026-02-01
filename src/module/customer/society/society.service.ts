import prisma from '@/config/prisma';

import { createSocietySchema, updateSocietySchema } from './society.validation'
import z from 'zod';

export const createSociety = async (data: z.infer<typeof createSocietySchema>) => {
  return prisma.society.create({ data });
};

export const getAllSocieties = async () => {
  return prisma.society.findMany();
};

export const getSocietyByCode = async (code: string) => {
  return prisma.society.findUnique({ where: { code } });
};

export const updateSociety = async (code: string, data: z.infer<typeof updateSocietySchema>) => {
  return prisma.society.update({ where: { code }, data });
};

export const deleteSociety = async (code: string) => {
  return prisma.society.delete({ where: { code } });
};
