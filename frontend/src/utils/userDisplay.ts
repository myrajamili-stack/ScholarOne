export function getInitials(fullName?: string | null) {
  if (!fullName) {
    return "ST";
  }

  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length === 0) {
    return "ST";
  }

  if (nameParts.length === 1) {
    return nameParts[0].slice(0, 2).toUpperCase();
  }

  return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
}

export function formatEducationLevel(level?: string | null) {
  if (!level) {
    return "Education level not set";
  }

  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}
