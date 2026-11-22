/** Русские названия действий журнала; неизвестное действие показывается как есть */

const LABELS: Record<string, string> = {
  create_building: 'Создано здание',
  update_building: 'Изменено здание',
  delete_building: 'Удалено здание',
  create_building_staff: 'Добавлен сотрудник',
  update_building_staff: 'Изменён сотрудник',
  delete_building_staff: 'Удалён сотрудник',
  create_room: 'Создана комната',
  update_room: 'Изменена комната',
  delete_room: 'Удалена комната',
  create_bed: 'Создана койка',
  update_bed: 'Изменена койка',
  delete_bed: 'Удалена койка',
  create_student: 'Создан студент',
  update_student: 'Изменён студент',
  delete_student: 'Удалён студент',
  create_user: 'Создана учётная запись',
  create_contract: 'Оформлен договор',
  update_contract: 'Изменён договор',
  activate_contract: 'Договор активирован',
  cancel_contract: 'Договор отменён',
  terminate_contract: 'Договор расторгнут',
  expire_contract: 'Договор истёк',
  create_invoice: 'Выставлен счёт',
  update_invoice: 'Изменён счёт',
  cancel_invoice: 'Счёт отменён',
  create_payment: 'Принят платёж',
  seed_data: 'Загружены демонстрационные данные',
};

export function auditLabel(action: string): string {
  return LABELS[action] ?? action;
}