export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="size-7 rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--color-accent-light),var(--color-accent)_45%,var(--color-violet))] shadow-sm"
      />
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Synthio <span className="font-normal text-ink-muted">Presenter</span>
      </span>
    </div>
  );
}
