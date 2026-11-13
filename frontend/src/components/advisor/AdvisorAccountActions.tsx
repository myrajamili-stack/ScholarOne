import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api from "../../api/axios";
import { useStoredUser } from "../../utils/authStorage";
import AdvisorIcon from "./AdvisorIcon";
import AdvisorAccountMenu from "./AdvisorAccountMenu";
import "../../styles/advisor-management.css";

export default function AdvisorAccountActions() {
  const user = useStoredUser();
  const [unread, setUnread] = useState(0);
  const { setUnreadMessages } = useOutletContext<{
    setUnreadMessages?: (count: number) => void;
  }>() || {};

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ unread_count: number }>("/messages/conversations", { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) {
        setUnread(data.unread_count);
        setUnreadMessages?.(data.unread_count);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [user?.user_id, setUnreadMessages]);

  return <div className="am-header-actions">
    <Link className="am-bell" to="/advisor/messages" aria-label={unread ? `${unread} unread messages. Open messages` : "Open messages"}>
      <AdvisorIcon name="bell" />{unread > 0 && <i />}
    </Link>
    <AdvisorAccountMenu />
  </div>;
}
