import { useId } from "react";

const artworkViews = {
  student: { x: 50, y: 65, width: 700, height: 510 },
  sponsor: { x: 860, y: 45, width: 670, height: 525 },
  advisor: { x: 515, y: 580, width: 585, height: 444 },
};

export default function RoleIllustration({ kind, className }: {
  kind: keyof typeof artworkViews;
  className?: string;
}) {
  const clipId = useId();
  const artwork = artworkViews[kind];

  return (
    <svg className={className} viewBox={`${artwork.x} ${artwork.y} ${artwork.width} ${artwork.height}`} aria-hidden="true" focusable="false">
      <defs><clipPath id={clipId}><rect {...artwork} /></clipPath></defs>
      <image href="/images/role-selection-characters.png" width="1536" height="1024" clipPath={`url(#${clipId})`} />
    </svg>
  );
}
