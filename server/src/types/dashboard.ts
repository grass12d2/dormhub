/** Типы сводки для главной страницы администратора (формат API, camelCase) */

export interface BuildingLoad {
  buildingId: string;
  buildingNumber: number;
  /** Все койки общежития */
  beds: number;
  /** Койки с ожидающим или действующим договором */
  occupied: number;
}

export interface DashboardSummary {
  students: number;
  /** Действующие договоры */
  residents: number;
  /** Свободные койки: доступные и без живого договора */
  freeBeds: number;
  /** Сумма остатков по неотменённым счетам */
  debt: number;
  buildings: BuildingLoad[];
  finance: {
    /** Сумма всех платежей */
    paid: number;
    /** Сумма остатков по неотменённым счетам (равна debt) */
    outstanding: number;
    overdueInvoices: number;
    totalInvoices: number;
  };
}