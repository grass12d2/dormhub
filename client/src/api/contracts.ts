import { buildQuery, type PageMeta } from './client';
import { api } from './index';

export type ContractStatus = 'pending' | 'active' | 'terminated' | 'expired' | 'cancelled';

export interface Contract {
  id: string;
  studentId: string;
  bedId: string;
  startDate: string;
  endDate: string;
  monthlyRate: number;
  status: ContractStatus;
  terminatedAt: string | null;
  terminationReason: string | null;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  pending: 'Ожидает',
  active: 'Действует',
  terminated: 'Расторгнут',
  expired: 'Истёк',
  cancelled: 'Отменён',
};

export type ContractAction = 'activate' | 'cancel' | 'terminate' | 'expire';

export interface ContractPage {
  items: Contract[];
  meta: PageMeta;
}

export async function listContracts(params: {
  status: string;
  studentId: string;
  limit: number;
  offset: number;
}): Promise<ContractPage> {
  const response = await api.get<Contract[]>(`/contracts${buildQuery(params)}`);
  return {
    items: response.data,
    meta: response.meta ?? { total: response.data.length, limit: params.limit, offset: params.offset },
  };
}

/** Ставка берётся из общежития, если не указана */
export const createContract = async (input: {
  studentId: string;
  bedId: string;
  startDate: string;
  endDate: string;
  monthlyRate?: number;
}) => (await api.post<Contract>('/contracts', input)).data;

export const runContractAction = async (id: string, action: ContractAction, reason?: string) =>
  (await api.post<Contract>(`/contracts/${id}/${action}`, reason ? { reason } : {})).data;