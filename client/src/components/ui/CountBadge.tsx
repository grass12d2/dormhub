/** Круглая отметка с числом; при нуле не показывается */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="tabular ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary">
      {count > 99 ? '99+' : count}
    </span>
  );
}