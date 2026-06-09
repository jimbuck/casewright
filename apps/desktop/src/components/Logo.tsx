import logoMark from '@casewright/brand/logo-mark.svg';

/**
 * The Casewright brand mark — the accent rounded-square with the bracket-and-check
 * glyph (from `@casewright/brand`). Self-contained, so it sits on any background.
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img src={logoMark} width={size} height={size} alt="Casewright" draggable={false} className={className} />
  );
}
