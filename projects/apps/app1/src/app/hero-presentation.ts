/**
 * Two-letter monogram for avatar badges: "Dr. Nice" -> "DN".
 */
export function heroInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/**
 * Stable hue per hero id so avatars keep their color across renders.
 */
export function heroHue(id: number): number {
  return (id * 47) % 360;
}
