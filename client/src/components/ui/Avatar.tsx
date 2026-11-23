import { useEffect, useState } from 'react';
import { AVATAR_EVENT, fetchAvatarUrl } from '../../api/account';

/** Аватар текущего пользователя; без изображения — первая буква имени */
export function Avatar({ name, className = 'size-8' }: { name: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let current: string | null = null;
    const load = () => {
      void fetchAvatarUrl().then((next) => {
        if (cancelled) {
          if (next) URL.revokeObjectURL(next);
          return;
        }
        if (current) URL.revokeObjectURL(current);
        current = next;
        setUrl(next);
      });
    };
    load();
    window.addEventListener(AVATAR_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(AVATAR_EVENT, load);
      if (current) URL.revokeObjectURL(current);
    };
  }, []);

  return url ? (
    <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-medium text-primary uppercase`}
    >
      {name.charAt(0)}
    </span>
  );
}