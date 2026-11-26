import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../../api/axios";
import { useStoredUser } from "../../utils/authStorage";
import AccountNotifications from "../AccountNotifications";
import AdvisorAccountMenu from "./AdvisorAccountMenu";
import "../../styles/advisor-management.css";

export default function AdvisorAccountActions() {
  const user = useStoredUser();
  const { setUnreadMessages } = useOutletContext<{
    setUnreadMessages?: (count: number) => void;
  }>() || {};

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ unread_count: number }>("/messages/conversations", { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) {
        setUnreadMessages?.(data.unread_count);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [user?.user_id, setUnreadMessages]);

  return <div className="am-header-actions">
    <AccountNotifications />
    <AdvisorAccountMenu />
  </div>;
}
