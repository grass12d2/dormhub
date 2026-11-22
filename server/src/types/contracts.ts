/**
 * Типы данных договоров проживания.
 * Row — строка базы данных (snake_case); остальные типы — формат API (camelCase).
 */

export type ContractStatus = 'pending' | 'active' | 'terminated' | 'expired' | 'cancelled';

export interface ContractRow {
  id: string;
  student_id: string;
  bed_id: string;
  /** Строка ГГГГ-ММ-ДД: в SQL дата приведена к тексту, чтобы избежать сдвига часового пояса */
  start_date: string;
  end_date: string;
  /** numeric приходит из драйвера строкой, например «700.00» */
  monthly_rate: string;
  status: ContractStatus;
  created_by: string;
  terminated_at: Date | null;
  termination_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Условия договора, которые можно менять, пока договор ожидает */
export interface ContractTerms {
  startDate: string;
  endDate: string;
  monthlyRate: number;
}

export interface Contract extends ContractTerms {
  id: string;
  studentId: string;
  bedId: string;
  status: ContractStatus;
  createdBy: string;
  terminatedAt: Date | null;
  terminationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toContractTerms(row: ContractRow): ContractTerms {
  return {
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyRate: Number(row.monthly_rate),
  };
}

export function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    studentId: row.student_id,
    bedId: row.bed_id,
    ...toContractTerms(row),
    status: row.status,
    createdBy: row.created_by,
    terminatedAt: row.terminated_at,
    terminationReason: row.termination_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}