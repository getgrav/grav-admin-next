/**
 * Markdown link destination for a media path. CommonMark forbids raw spaces in a
 * destination, so `![](My image.jpg)` renders as literal text on the site. Wrapping
 * it in angle brackets (`<My image.jpg>`) is the standard escape and Grav 2.0.9+
 * resolves it as page media for both images and plain links (getgrav/grav#4197,
 * getgrav/grav#4251). Space-free or already-wrapped paths pass through unchanged.
 */
export function mdDestination(path: string): string {
	if (!path || path.startsWith('<')) return path;
	return /\s/.test(path) ? `<${path}>` : path;
}

/**
 * Destination for a path built from file names (`My file.pdf`,
 * `media://docs/Invoice #12.pdf`). Angle brackets only make a space legal: a URL
 * still reads `%` as the start of an escape, `?` as the query and `#` as the
 * fragment, and `<`/`>` cannot sit inside the brackets. Those are percent-encoded,
 * which Grav decodes back to the name on disk (getgrav/grav#4388). Not for a URL
 * someone typed, whose `?` and `#` are meant.
 */
export function mediaDestination(path: string): string {
	return mdDestination(
		path.replace(/[%#?<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
	);
}
