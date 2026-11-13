import { useId } from "react";

const regions = {
  hero: "45 15 1155 495",
  calendar: "1255 40 480 455",
  appointments: "442 555 160 153",
  upcoming: "615 555 160 153",
  completed: "790 555 157 153",
  advisors: "790 724 157 150",
};

export default function AppointmentArtwork({ name, className = "" }: { name: keyof typeof regions; className?: string }) {
  const clipId = useId();
  const [x, y, width, height] = regions[name].split(" ").map(Number);

  return (
    <svg className={className} viewBox={regions[name]} overflow="hidden" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
      </defs>
      <image href="/images/student-appointment-artwork.png" width="1774" height="887" preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
    </svg>
  );
}
