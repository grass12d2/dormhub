import {
  BedDouble,
  Building2,
  CreditCard,
  DoorOpen,
  FileText,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface SearchType {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

/** Виды поиска администратора: каждый ведёт в свой раздел с параметром q */
export const SEARCH_TYPES: SearchType[] = [
  { id: 'students', label: 'Студенты', path: '/students', icon: Users },
  { id: 'buildings', label: 'Общежития', path: '/buildings', icon: Building2 },
  { id: 'rooms', label: 'Комнаты', path: '/rooms', icon: DoorOpen },
  { id: 'beds', label: 'Кровати', path: '/beds', icon: BedDouble },
  { id: 'contracts', label: 'Договоры', path: '/contracts', icon: FileText },
  { id: 'invoices', label: 'Счета', path: '/invoices', icon: Receipt },
  { id: 'payments', label: 'Платежи', path: '/payments', icon: CreditCard },
];

/** Адрес раздела с поисковым запросом; пустой запрос даёт адрес без параметров */
export function searchUrl(path: string, query: string): string {
  const text = query.trim();
  return text ? `${path}?q=${encodeURIComponent(text)}` : path;
}