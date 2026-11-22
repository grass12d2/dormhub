import { Warning } from '../components/feedback/Warning';
import { PageHeader } from '../components/layout/PageHeader';

/** Безопасность: смена пароля будет добавлена вместе с соответствующим API */
export default function SecurityPage() {
  return (
    <>
      <PageHeader title="Безопасность" />
      <Warning title="Смена пароля пока недоступна">
        Эта возможность появится после добавления соответствующего метода на сервере.
      </Warning>
    </>
  );
}