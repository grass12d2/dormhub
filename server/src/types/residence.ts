/** Данные о проживании текущего студента (формат API, camelCase) */

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
  /** Соседи по комнате с действующими договорами (без самого студента) */
  roommates: Roommate[];
}