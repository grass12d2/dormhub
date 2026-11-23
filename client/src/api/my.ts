import type { Contract } from './contracts';
import type { Invoice } from './invoices';
import { api } from './index';

/** Данные текущего студента: сервер сам определяет владельца по токену */
export const listMyContracts = async () => (await api.get<Contract[]>('/contracts/my')).data;
export const listMyInvoices = async () => (await api.get<Invoice[]>('/invoices/my')).data;

export interface Roommate {
  displayName: string;
  groupName: string | null;
}

export interface Residence {
  contractId: string;
  startDate: string;
  endDate: string;
  monthlyRate: number;
  buildingNumber: number;
  address: string;
  metroStation: string | null;
  floor: number;
  roomNumber: string;
  bedNumber: number;
  roommates: Roommate[];
}

/** Действующее проживание; null, если студент сейчас нигде не проживает */
export const getMyResidence = async () => (await api.get<Residence | null>('/me/residence')).data;