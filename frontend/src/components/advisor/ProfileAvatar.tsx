import { useState } from "react";
import { getInitials } from "../../utils/userDisplay";

export default function ProfileAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={className} style={{ overflow: "hidden", flexShrink: 0 }}>
    {imageUrl && failedUrl !== imageUrl
      ? <img src={imageUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailedUrl(imageUrl)} />
      : getInitials(name)}
  </span>;
}
