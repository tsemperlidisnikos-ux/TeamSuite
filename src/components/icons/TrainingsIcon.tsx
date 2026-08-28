interface TrainingsIconProps {
  size?: number;
  color?: string;
  className?: string;
}

export function TrainingsIcon({
  size = 20,
  color = 'currentColor',
  className,
}: TrainingsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="2"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 17v4" />
      <path d="M17 17v4" />
    </svg>
  );
}
