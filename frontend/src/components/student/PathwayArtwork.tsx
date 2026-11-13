const regions = {
  hero: "460 20 1285 555",
  career: "48 515 165 170",
  academic: "229 580 164 165",
  interest: "405 645 162 165",
  target: "572 690 165 165",
  strengths: "735 690 155 165",
  pathways: "892 690 165 165",
  guidance: "1052 690 162 165",
  books: "1238 595 510 280",
  mountain: "20 710 205 165",
};

export default function PathwayArtwork({ name, className = "" }: { name: keyof typeof regions; className?: string }) {
  return <svg className={className} viewBox={regions[name]} overflow="hidden" aria-hidden="true" focusable="false">
    <image href="/images/student-pathway-artwork.png" width="1774" height="887" preserveAspectRatio="none" />
  </svg>;
}
