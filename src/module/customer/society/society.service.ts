import prisma from '@/config/prisma';

import { createSocietySchema,updateSocietySchema } from './society.validation'
import z from 'zod';

export const createSociety = async (data: z.infer<typeof createSocietySchema>) => {
  return prisma.society.create({ data });
};

export const getAllSocieties = async () => {
  return prisma.society.findMany();
};

export const getSocietyById = async (id: string) => {
  return prisma.society.findUnique({ where: { id } });
};

export const updateSociety = async (id: string, data: z.infer<typeof updateSocietySchema>) => {
  return prisma.society.update({ where: { id }, data });
};

export const deleteSociety = async (id: string) => {
  return prisma.society.delete({ where: { id } });
};
