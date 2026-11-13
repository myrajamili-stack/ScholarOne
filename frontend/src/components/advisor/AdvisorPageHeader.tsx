import AdvisorIcon, { type AdvisorIconName } from "./AdvisorIcon";
import AdvisorAccountActions from "./AdvisorAccountActions";
import "../../styles/advisor-home.css";
import "../../styles/advisor-management.css";
export default function AdvisorPageHeader({ title, description }: {
    title: string;
    description: string;
}) {
    return <header className="am-header am-header-compact"><div className="am-title"><h1>{title}<span aria-hidden="true">✦</span></h1><p>{description}</p></div><AdvisorAccountActions /></header>;
}
export function ManagementStats({ items }: {
    items: Array<{
        label: string;
        value: string | number;
        icon: AdvisorIconName;
        tone: "purple" | "amber" | "blue" | "green" | "pink";
    }>;
}) {
    return <section className="am-stats" aria-label="Page summary">{items.map(item => <article className={`am-stat ${item.tone}`} key={item.label}><span><AdvisorIcon name={item.icon}/></span><div><strong>{item.value}</strong><p>{item.label}</p></div></article>)}</section>;
}
