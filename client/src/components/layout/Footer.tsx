/** Подвал страницы по центру; год вычисляется автоматически */
export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted md:px-6 lg:px-8">
      © {new Date().getFullYear()} DormHub · система управления общежитием СПбГУПТД
    </footer>
  );
}