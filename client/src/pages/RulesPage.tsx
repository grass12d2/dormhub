import {
  AlertTriangle,
  BookOpen,
  Brush,
  CookingPot,
  DoorOpen,
  Flame,
  Info,
  Moon,
  Search,
  ShieldAlert,
  UserCheck,
  WashingMachine,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { DORM_GUIDE, type GuideBlock, type GuideSection } from '../lib/dormGuide';
import { splitHighlight } from '../lib/highlight';
import { matchesQuery } from '../lib/table';

const ICONS: Record<GuideSection['icon'], LucideIcon> = {
  rules: BookOpen,
  quiet: Moon,
  guests: UserCheck,
  laundry: WashingMachine,
  kitchen: CookingPot,
  cleaning: Brush,
  fire: Flame,
  move: DoorOpen,
  repair: Wrench,
};

const NOTE_STYLES = {
  info: { box: 'bg-primary-soft text-primary', icon: Info },
  warning: { box: 'bg-warning-soft text-warning', icon: AlertTriangle },
  danger: { box: 'bg-danger-soft text-danger', icon: ShieldAlert },
} as const;

/** Текущий запрос поиска — для подсветки совпадений */
const QueryContext = createContext('');

/** Текст с подсветкой совпадений мягким цветом акцента */
function Hl({ text }: { text: string }) {
  const query = useContext(QueryContext);
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-primary/20 text-inherit">
            {part.text}
          </mark>
        ) : (
          part.text
        )
      )}
    </>
  );
}

/** Весь текст раздела — для поиска */
function sectionText(section: GuideSection): string[] {
  const parts = [section.title, section.summary];
  for (const block of section.blocks) {
    if (block.kind === 'text' || block.kind === 'note') parts.push(block.text);
    else if (block.kind === 'table') parts.push(...block.head, ...block.rows.flat());
    else parts.push(...block.items);
  }
  return parts;
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <p>
          <Hl text={block.text} />
        </p>
      );
    case 'list':
      return (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted">
          {block.items.map((item) => (
            <li key={item}>
              <Hl text={item} />
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="flex flex-col gap-2">
          {block.items.map((item, index) => (
            <li key={item} className="flex gap-3">
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span className="pt-0.5">
                <Hl text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'note': {
      const style = NOTE_STYLES[block.tone];
      const Icon = style.icon;
      return (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 ${style.box}`}>
          <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <Hl text={block.text} />
          </span>
        </p>
      );
    }
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col" className="px-3 py-2 font-medium">
                    <Hl text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map(([a, b]) => (
                <tr key={a}>
                  <td className="tabular px-3 py-2 font-medium whitespace-nowrap">
                    <Hl text={a} />
                  </td>
                  <td className="px-3 py-2">
                    <Hl text={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** «Правила и памятки»: правила проживания, прачечная, кухня, уборка, безопасность. Текст общий, без базы */
export default function RulesPage() {
  const [query, setQuery] = useState('');
  const sections = useMemo(
    () => (query.trim() ? DORM_GUIDE.filter((section) => matchesQuery(sectionText(section), query)) : DORM_GUIDE),
    [query]
  );

  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Ссылка вида /rules#repair открывает сразу нужный раздел
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(`guide-${hash.slice(1)}`)?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <QueryContext.Provider value={query}>
      <PageHeader title="Правила и памятки" description="Как жить в общежитии: правила, прачечная, кухня, уборка и безопасность." />

      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm focus-within:border-primary">
            <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти в памятке"
              aria-label="Найти в памятке"
              className="min-w-0 flex-1 bg-transparent focus:outline-none"
            />
          </label>
          <nav aria-label="Разделы памятки" className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
            {sections.map((section) => {
              const Icon = ICONS[section.icon];
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => jump(section.id)}
                  className="flex max-w-full items-start gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-left text-sm leading-snug hover:bg-surface-2 lg:border-0 lg:bg-transparent lg:py-2"
                >
                  <Icon size={16} className="mt-px shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 break-words">
                    <Hl text={section.title} />
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {sections.length === 0 ? (
            <Card>
              <EmptyState icon={Search} title="Ничего не найдено" description="Попробуйте другое слово." />
            </Card>
          ) : (
            sections.map((section) => {
              const Icon = ICONS[section.icon];
              return (
                <Card key={section.id} id={`guide-${section.id}`} className="scroll-mt-20">
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold">
                        <Hl text={section.title} />
                      </h2>
                      <p className="text-sm text-muted">
                        <Hl text={section.summary} />
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 p-5 text-sm leading-relaxed">
                    {section.blocks.map((block, index) => (
                      <Block key={index} block={block} />
                    ))}
                  </div>
                </Card>
              );
            })
          )}
          <p className="text-xs text-muted">
            Памятка носит справочный характер. При расхождении действует положение об общежитии; вопросы — в чате с администрацией.
          </p>
        </div>
      </div>
    </QueryContext.Provider>
  );
}
