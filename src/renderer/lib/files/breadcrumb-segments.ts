/** Collapse long breadcrumb paths: keep first segment, ellipsis, then tail. */
export function collapseBreadcrumbSegments(
  segments: string[],
  maxTail = 2,
): Array<{ label: string; index: number; isEllipsis?: boolean }> {
  if (segments.length <= maxTail + 1) {
    return segments.map((label, index) => ({ label, index }));
  }

  const items: Array<{ label: string; index: number; isEllipsis?: boolean }> = [
    { label: segments[0], index: 0 },
    { label: "…", index: -1, isEllipsis: true },
  ];

  const tailStart = segments.length - maxTail;
  for (let i = tailStart; i < segments.length; i++) {
    items.push({ label: segments[i], index: i });
  }

  return items;
}
