import { useEffect, useState } from 'react';
import { getProfile, PROFILE_EVENT } from '../api/account';

/** Имя из профиля; null, пока оно не загружено или не задано */
export function useProfileName(email: string | undefined): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      return;
    }
    let cancelled = false;
    const load = () => {
      getProfile()
        .then((profile) => {
          if (!cancelled) {
            setName(profile.displayName?.trim() || null);
          }
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(PROFILE_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_EVENT, load);
    };
  }, [email]);

  return name;
}