interface ModifierTagProps {
  label: string;
  variant?: 'removed' | 'note';
}

/** "No Rice" (a held/removed recipe ingredient) or "Extra Sauce" (a
 * free-text note) — same small pill treatment wherever a line item's
 * modifiers show up (POS ticket, Order Queue, Kitchen Display). */
export function ModifierTag({ label, variant = 'note' }: ModifierTagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-corp-body ${
        variant === 'removed' ? 'bg-error-bg text-destructive' : 'bg-accent-soft text-accent-foreground'
      }`}
    >
      {variant === 'removed' ? 'No ' : ''}
      {label}
    </span>
  );
}
