import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { SEARCH_TYPES, searchUrl } from '../../search';
import { Button } from '../ui/Button';
import { IconInput } from '../ui/IconInput';
import { Modal } from '../ui/Modal';

/** Окно поиска: выбор вида поиска и ввод запроса */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = useState(SEARCH_TYPES[0].id);
  const [query, setQuery] = useState('');

  // Фокус в поле только на устройствах с мышью: на телефоне клавиатура сама не открывается
  useEffect(() => {
    if (open && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const type = SEARCH_TYPES.find((item) => item.id === typeId) ?? SEARCH_TYPES[0];
    navigate(searchUrl(type.path, query));
    setQuery('');
    onClose();
  };

  return (
    <Modal open={open} title="Поиск" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Где искать" className="flex flex-wrap gap-2">
          {SEARCH_TYPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={typeId === id}
              onClick={() => setTypeId(id)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                typeId === id
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-surface text-fg hover:bg-surface-2'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <IconInput
          icon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Введите запрос"
          aria-label="Поисковый запрос"
          enterKeyHint="search"
          inputRef={inputRef}
        />
        <p className="text-xs text-muted">Выбранный раздел откроется с вашим запросом.</p>
        <Button type="submit" icon={<Search size={16} aria-hidden="true" />}>
          Найти
        </Button>
      </form>
    </Modal>
  );
}