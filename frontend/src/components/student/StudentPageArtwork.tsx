import { useId } from "react";

// Each crop isolates an illustration and excludes the sheet's labels.
const regions = {
  pathway: [1110, 10, 480, 290],
  calendar: [35, 370, 500, 270],
  profile: [1105, 370, 495, 270],
  settings: [1620, 370, 520, 270],
} as const;

export default function StudentPageArtwork({ name, className = "" }: { name: keyof typeof regions; className?: string }) {
  const clipId = useId();
  const [x, y, width, height] = regions[name];
  return <svg className={className} viewBox={`${x} ${y} ${width} ${height}`} preserveAspectRatio="xMidYMax meet" overflow="hidden" aria-hidden="true" focusable="false">
    <defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
    <image href="/images/student-page-illustrations.png" width="2172" height="724" clipPath={`url(#${clipId})`} />
  </svg>;
}
