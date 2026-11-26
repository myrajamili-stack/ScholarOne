from eligibility_matching import check_eligibility
from scholarship_availability import malaysia_now


def recommend_scholarships(profile, catalogue, context):
    now = malaysia_now()
    ranked = []
    field = str(profile.get("field_of_study") or "").strip()
    for listing in catalogue:
        result = check_eligibility(profile, listing, context, now=now)
        if result["mismatch_count"]:
            continue
        matched = [check for check in result["checks"] if check["status"] == "matched"]
        academic_matches = sum(check["criterion"] in {"Academic qualification", "CGPA"} for check in matched)
        if result["unknown_count"] == 1 and not result["has_additional_requirements"]:
            status, priority = "eligible", 2
        elif academic_matches:
            status, priority = "potentially_eligible", 1
        else:
            status, priority = "insufficient_information", 0

        metadata = listing.get("import_metadata") or {}
        category = str(listing.get("category") or "").strip()
        field_match = bool(field and field.casefold() == category.casefold()
                           and category.casefold() not in {"general", "other"})
        opportunity = {
            "scholarship_id": listing["scholarship_id"],
            "title": listing["title"],
            "organization_name": metadata.get("source_sponsor") or listing.get("organization_name"),
            "status": status,
            "checks": result["checks"],
            "relevance_reasons": [f"The published scholarship category matches your saved field of study ({field})."]
                                 if field_match else [],
        }
        ranked.append(((-priority, -academic_matches, -len(matched), -int(field_match), listing["scholarship_id"]), opportunity))

    return [opportunity for _, opportunity in sorted(ranked, key=lambda item: item[0])]
