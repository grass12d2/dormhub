import { Bell, Palette, UserRound, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';

const SECTIONS: Array<{ to: string; title: string; text: string; icon: LucideIcon }> = [
    { to: '/settings/appearance', title: 'Внешний вид', text: 'Режим, цвет и размер текста', icon: Palette },
    { to: '/profile', title: 'Профиль', text: 'Аккаунт › Мой профиль', icon: UserRound },
    { to: '/settings/notifications', title: 'Уведомления', text: 'Новые сообщения, объявления, push', icon: Bell },
];

/** Настройки: три одинаковые карточки; на узком экране в столбец, начиная с sm в три равные колонки */
export default function SettingsPage() {
    return (
        <>
            <PageHeader title="Настройки" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {SECTIONS.map(({ to, title, text, icon: Icon }) => (
                    <Link key={to} to={to} className="block h-full min-w-0">
                        <Card className="flex h-full min-h-24 items-center gap-4 p-5 transition-colors hover:border-primary">
                            {/* Фиксированный размер значка: не сжимается и не растягивается */}
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                                <Icon size={20} aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{title}</span>
                                <span className="block text-sm text-muted">{text}</span>
                            </span>
                        </Card>
                    </Link>
                ))}
            </div>
        </>
    );
}