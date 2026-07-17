/** Circled + "add" button — the standard affordance for appending a new row/item.
 * SVG-drawn (stroke = currentColor) so the glyph stays optically centered and
 * crisp at any size, immune to font glyph asymmetry (same rule as .preset-arrow). */
export function AddCircleButton({
  label,
  tip,
  onClick,
  className,
  size = 26,
}: {
  label: string;
  tip?: string;
  onClick: () => void;
  className?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      className={"add-circle" + (className ? " " + className : "")}
      aria-label={label}
      data-tip={tip}
      onClick={onClick}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size - 10}
        height={size - 10}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
