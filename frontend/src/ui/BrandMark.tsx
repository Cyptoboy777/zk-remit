/** ZK Remit mark: the public bar, the sealed diagonal cut free from it, and the delivery arrow. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" className="mark-tile" />
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" className="mark-ring" />
      <path className="mark-public" d="M12 11H52V19.0H12Z" />
      <path className="mark-sealed" d="M37 22.0H52L27 38.0H12Z M12 41H40V37L52 45L40 53V49.0H12Z" />
    </svg>
  );
}
