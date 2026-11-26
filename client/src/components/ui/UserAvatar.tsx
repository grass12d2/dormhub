import { useEffect, useState } from 'react';
import { AVATAR_EVENT } from '../../api/account';
import { fetchUserAvatarUrl } from '../../api/chat';

/** Кэш на время жизни страницы: один запрос на пользователя */
const cache = new Map<string, Promise<string | null>>();

function avatarFor(userId: string): Promise<string | null> {
  let found = cache.get(userId);
  if (!found) {
    found = fetchUserAvatarUrl(userId);
    cache.set(userId, found);
  }
  return found;
}

/** Аватар любого пользователя; без изображения — первая буква имени */
export function UserAvatar({
  userId,
  name,
  className = 'size-9',
}: {
  userId: string | null;
  name: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Свой аватар мог измениться: кэш сбрасывается
  useEffect(() => {
    const reset = () => {
      cache.clear();
      setVersion((v) => v + 1);
    };
    window.addEventListener(AVATAR_EVENT, reset);
    return () => window.removeEventListener(AVATAR_EVENT, reset);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (userId) {
      void avatarFor(userId).then((next) => {
        if (!cancelled) setUrl(next);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  return url ? (
    <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-medium text-primary uppercase ring-1 ring-primary/35 ring-inset`}
    >
      {name.charAt(0)}
    </span>
  );
}