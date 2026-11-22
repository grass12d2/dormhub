import { PageHeader } from '../components/layout/PageHeader';
import { AccentBlock, FontSizeBlock, ModeBlock } from '../components/ThemeSwitcher';

/** Внешний вид: три блока, раскладка зависит от ширины экрана */
export default function AppearancePage() {
  return (
    <>
      <PageHeader title="Внешний вид" description="Настройки сохраняются в этом браузере." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2 lg:col-span-1">
          <ModeBlock />
        </div>
        <AccentBlock />
        <FontSizeBlock />
      </div>
    </>
  );
}