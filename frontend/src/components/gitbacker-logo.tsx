type Props = React.SVGProps<SVGSVGElement>;

export function GitbackerLogo(props: Props) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden {...props}>
      <path
        d="M42 52 L158 52 Q158 52 158 66 L158 114 Q158 158 100 178 Q42 158 42 114 L42 66 Q42 52 56 52 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <line
        x1="100"
        y1="82"
        x2="100"
        y2="138"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line
        x1="100"
        y1="108"
        x2="128"
        y2="92"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="100" cy="82" r="10" fill="currentColor" />
      <circle cx="100" cy="138" r="10" fill="currentColor" />
      <circle cx="128" cy="92" r="8" fill="currentColor" />
    </svg>
  );
}
