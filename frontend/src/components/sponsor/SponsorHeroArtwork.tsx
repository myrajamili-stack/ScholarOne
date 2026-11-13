import Icon, { type AdvisorIconName } from "../advisor/AdvisorIcon";

export default function SponsorHeroArtwork({ page }: { page: string }) {
  const images: Record<string, string> = {
    subscriptions: "/images/sponsor-dashboard-hero.png",
    messages: "/images/student-messages-hero.png",
  };
  const icons: Record<string, AdvisorIconName> = { statistics: "chart", appeals: "shield", settings: "settings" };
  return images[page] ? <img className="spw-hero-art" src={images[page]} alt="" /> : (
    <div className="spw-hero-art spw-icon-art" aria-hidden="true">
      <span className="spw-art-orbit" />
      <span className="spw-art-card"><Icon name={icons[page] || "graduation"} /></span>
      <span className="spw-art-badge"><Icon name={page === "appeals" ? "quiz" : "graduation"} /></span>
      <span className="spw-art-spark">✦</span>
    </div>
  );
}
