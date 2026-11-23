import type { Contract } from './contracts';
import type { Invoice } from './invoices';
import { api } from './index';

/** Данные текущего студента: сервер сам определяет владельца по токену */
export const listMyContracts = async () => (await api.get<Contract[]>('/contracts/my')).data;
export const listMyInvoices = async () => (await api.get<Invoice[]>('/invoices/my')).data;