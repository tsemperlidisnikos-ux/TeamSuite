interface AthletesIconProps {
  size?: number;
  color?: string;
  className?: string;
}

/** Icon από Academio — προφίλ/μενού αθλητή */
export function AthletesIcon({
  size = 20,
  color = 'currentColor',
  className,
}: AthletesIconProps) {
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
      <circle cx="12" cy="5" r="3" />
      <path d="M12 8v4l3 3" />
      <path d="M12 12l-3 3" />
      <path d="M5 21l4-7" />
      <path d="M19 21l-4-7" />
    </svg>
  );
}
