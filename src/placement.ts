/**
 * Where a floating box goes: below the thing it belongs to by preference, above it when there is
 * no room, capped to the room there is, and never off an edge.
 *
 * One rule, four callers — the completion menu, the tooltip on a broken filter, and the filter
 * bar's dropdowns — where there used to be three copies of the arithmetic and a fourth that
 * preferred the other side. Pure, and with no DOM in it, because the interesting part is the
 * measuring: a software keyboard does not shrink `window.innerHeight`, so a rule written against
 * the layout viewport believes there are 800px below an input when there are 350 and puts the menu
 * under the keyboard. `viewport()` is what asks the right question; this is what does the sums with
 * the answer.
 */

/** A box in the coordinates `getBoundingClientRect` reports. */
export interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Spot {
	top: number;
	left: number;
	/**
	 * The room on the chosen side, so a list longer than that scrolls inside it rather than
	 * running off the screen. Never smaller than `MIN_HEIGHT`, and never larger than the box
	 * already wanted to be, so applying it is a no-op wherever there is room.
	 */
	maxHeight: number;
	/** Above rather than below, which is a thing the caller may want to say in a class. */
	flipped: boolean;
}

/** How close to an edge of the viewport a floating box is allowed to sit. */
const EDGE = 8;

/**
 * Less menu than this is not worth showing, so a box in a pinch overflows a little rather than
 * shrinking to a sliver. Two rows and a bit, at the sizes these menus use.
 */
const MIN_HEIGHT = 120;

function clamp(value: number, low: number, high: number): number {
	// Low wins, because on a screen narrower than the box there is no interval to clamp into and
	// the near edge is the better of the two to be flush with.
	return Math.max(low, Math.min(value, high));
}

/**
 * Where to put a box of this size against this anchor.
 *
 * `gap` is the space left between the two. `align` is which of the anchor's vertical edges the box
 * lines up with: the filter bar's dropdowns sit at the right end of their row, and a left-aligned
 * menu under them would hang off the page.
 */
export function place(anchor: Box, size: Size, viewport: Box, gap: number, align: "start" | "end" = "start"): Spot {
	const ceiling = viewport.top + EDGE;
	const floor = viewport.top + viewport.height - EDGE;
	const below = anchor.top + anchor.height + gap;
	const roomBelow = floor - below;
	const roomAbove = anchor.top - gap - ceiling;

	// Below unless it does not fit there — and then above only if it fits, or if it is simply the
	// roomier of the two. Which side that is is a property of the surface rather than a taste: an
	// input floated in the middle of the page has room above it once the keyboard is up, and one
	// pinned to the top of a results view has all of its room below.
	const flipped = size.height > roomBelow && (size.height <= roomAbove || roomAbove > roomBelow);
	const maxHeight = Math.max(MIN_HEIGHT, Math.min(size.height, flipped ? roomAbove : roomBelow));
	const height = Math.min(size.height, maxHeight);

	const left = align === "end" ? anchor.left + anchor.width - size.width : anchor.left;
	return {
		// The clamps only bite where even the capped box overflows, which is a viewport too short
		// for `MIN_HEIGHT`. Everywhere else the box sits exactly `gap` from its anchor.
		top: flipped ? Math.max(ceiling, anchor.top - gap - height) : Math.min(below, Math.max(ceiling, floor - height)),
		left: clamp(left, viewport.left + EDGE, viewport.left + viewport.width - size.width - EDGE),
		maxHeight,
		flipped,
	};
}

/**
 * How tall the box would be with nothing capping it.
 *
 * Measured from what is overflowing rather than by clearing the cap and reading `offsetHeight`
 * back, which is the obvious way and a trap: an element that is briefly not scrollable loses its
 * scroll position, and every reposition would jerk a menu the reader was arrowing through back to
 * its first row — including the repositions that a scroll of the menu itself sets off.
 *
 * `scroller` is whichever element inside the box actually overflows, where that is not the box.
 */
export function naturalHeight(box: HTMLElement, scroller: HTMLElement = box): number {
	return box.offsetHeight + scroller.scrollHeight - scroller.clientHeight;
}

/**
 * The part of the page the reader can actually see.
 *
 * The visual viewport rather than the layout one, because that is the only one a software keyboard
 * moves: iOS Safari has never shrunk `window.innerHeight`, and under `interactive-widget` Chrome's
 * default no longer does either. `offsetTop` matters as much as the height — a keyboard raised
 * under a scrolled page leaves the visible band partway down the document.
 */
export function viewport(): Box {
	const view = window.visualViewport;
	if (view === null) return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
	return { top: view.offsetTop, left: view.offsetLeft, width: view.width, height: view.height };
}

/**
 * The two ways the visible band moves that `window` never hears about: a keyboard coming up
 * resizes the visual viewport without resizing the window, and scrolling the page under a raised
 * keyboard slides the band without scrolling any element a `scroll` listener is watching.
 *
 * Anything already listening for `resize` and `scroll` on `window` wants this as well.
 */
export function onViewportShift(listener: () => void): void {
	window.visualViewport?.addEventListener("resize", listener);
	window.visualViewport?.addEventListener("scroll", listener);
}
