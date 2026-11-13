import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearStoredUser, useStoredUser } from "../../utils/authStorage";
import AdvisorIcon from "./AdvisorIcon";
import ProfileAvatar from "./ProfileAvatar";
import "../../styles/advisor-management.css";

type AccountMenuProps = {
  name?: string;
  imageUrl?: string | null;
  onOpen?: () => void;
};

export default function AdvisorAccountMenu({ name, imageUrl, onOpen }: AccountMenuProps) {
  const user = useStoredUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const displayName = name || user?.full_name || "Academic Advisor";

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div className="am-account-wrap" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape") setOpen(false);
  }}>
    <button className="am-account" type="button" aria-label="Open account menu" aria-expanded={open} onClick={() => {
      if (!open) onOpen?.();
      setOpen(!open);
    }}>
      <ProfileAvatar name={displayName} imageUrl={imageUrl === undefined ? user?.profile_picture : imageUrl} className="am-avatar" />
      <span><strong>{displayName}</strong><small>Academic Advisor</small></span>
      <AdvisorIcon name="down" />
    </button>
    {open && <nav aria-label="Account" className="am-account-menu">
      <Link to="/advisor/profile" onClick={() => setOpen(false)}>My Profile</Link>
      <Link to="/advisor/settings" onClick={() => setOpen(false)}>Settings</Link>
      <button type="button" onClick={() => {
        clearStoredUser();
        navigate("/staff-login", { replace: true });
      }}>Logout</button>
    </nav>}
  </div>;
}
