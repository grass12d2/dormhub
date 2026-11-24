import type { Announcement } from '../../api/announcements';

export const RICH_CLASS =
    'text-base leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 ' +
    '[&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold ' +
    '[&_a]:text-primary [&_a]:underline [&_sub]:text-xs [&_sup]:text-xs ' +
    // Таблица: собственная горизонтальная прокрутка, место под полосой прокрутки
    '[&_table]:my-2 [&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:pb-3 ' +
    '[&_th]:min-w-24 [&_th]:border [&_th]:border-border [&_th]:bg-surface-2 [&_th]:p-2 [&_th]:text-left ' +
    '[&_td]:min-w-24 [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td_p]:my-0 [&_th_p]:my-0';

/** Текст объявления: очищенный HTML с сервера или, для прежних объявлений, простой текст */
export function AnnouncementBody({ item }: { item: Pick<Announcement, 'body' | 'bodyHtml'> }) {
    if (item.bodyHtml) {
        // HTML очищен на сервере по белому списку тегов, атрибутов нет
        return <div className={`rich ${RICH_CLASS}`} dangerouslySetInnerHTML={{ __html: item.bodyHtml }} />;
    }
    return <p className="text-base leading-relaxed whitespace-pre-wrap">{item.body}</p>;
}