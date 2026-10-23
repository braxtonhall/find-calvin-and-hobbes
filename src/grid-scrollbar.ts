/**
 * The grid's scrollbar on desktop, drawn in place of the browser's, which covers the labels. It is a
 * pill as wide as the labels' column, right of the cells, behind the labels, so it seems to hold them.
 * The scroller still scrolls itself — by wheel, keys, the year rail, `scrollIntoView` — and this only
 * shows where it is, and can be dragged. It fades in while the grid scrolls and while the pointer is
 * over the labels, and out when neither is so.
 *
 * On mobile the scroller does not scroll (the container inside it does, beside the year rail), so
 * the pill has nothing to show and stays hidden.
 */

/** How long the pill stays out after the grid stops scrolling. */
const LINGER_MS = 800;

/** The shortest the pill gets, however long the grid, to stay something to grab. */
const MIN_THUMB_PX = 24;

/** Between the pill and the cells on one side, and the sidebar's edge on the other. */
const GAP_PX = 1;

export function attachGridScrollbar(grid: HTMLElement): void {
	const scroller = document.getElementById("grid-scroller")!;
	const column = document.getElementById("grid-column")!;

	const track = document.createElement("div");
	track.className = "grid-scrollbar";
	track.setAttribute("aria-hidden", "true");
	const thumb = document.createElement("div");
	thumb.className = "grid-scrollbar-thumb";
	track.appendChild(thumb);
	scroller.after(track);

	let thumbHeight = 0;
	let travel = 0;
	let hovering = false;
	let dragging = false;
	let lingering: ReturnType<typeof setTimeout> | undefined;

	const maxScroll = () => scroller.scrollHeight - scroller.clientHeight;

	const place = () => {
		thumb.style.transform = `translateY(${(scroller.scrollTop / maxScroll()) * travel}px)`;
	};

	// Measured each time the pill comes out and as it scrolls, since what is in the scroller, and so
	// how far it scrolls, changes without the scroller changing size. Top to bottom of the scroller, as
	// the browser's would be.
	const measure = () => {
		track.hidden = maxScroll() <= 0;
		if (track.hidden) return;
		const height = scroller.clientHeight;
		const left = grid.getBoundingClientRect().right - column.getBoundingClientRect().left + GAP_PX;
		track.style.left = `${left}px`;
		track.style.width = `${column.clientWidth - left - GAP_PX}px`;
		track.style.top = `${scroller.offsetTop}px`;
		track.style.height = `${height}px`;
		thumbHeight = Math.max(MIN_THUMB_PX, (scroller.clientHeight / scroller.scrollHeight) * height);
		travel = height - thumbHeight;
		thumb.style.height = `${thumbHeight}px`;
		place();
	};

	const showOrHide = () => {
		const shown = hovering || dragging || lingering !== undefined;
		if (shown && !track.classList.contains("grid-scrollbar--shown")) measure();
		track.classList.toggle("grid-scrollbar--shown", shown);
	};

	scroller.addEventListener("scroll", () => {
		measure();
		clearTimeout(lingering);
		lingering = setTimeout(() => {
			lingering = undefined;
			showOrHide();
		}, LINGER_MS);
		showOrHide();
	});

	// Right of the cells is the labels, and on a level with none, the room they would have.
	const onLabels = (event: PointerEvent) => event.clientX > grid.getBoundingClientRect().right;

	column.addEventListener("pointermove", (event) => {
		if (event.pointerType !== "mouse") return;
		const over = onLabels(event);
		if (over === hovering) return;
		hovering = over;
		showOrHide();
	});
	column.addEventListener("pointerleave", () => {
		hovering = false;
		showOrHide();
	});

	const scrollToThumbAt = (thumbTop: number) => {
		if (travel <= 0) return;
		scroller.scrollTop = (Math.min(Math.max(thumbTop, 0), travel) / travel) * maxScroll();
	};

	// The pill lies behind the labels, which take the pointer, so it is grabbed through them: pressed on
	// it drags from there, and off it, brings its middle to the pointer and drags from that. A finger
	// there is scrolling, as anywhere else.
	column.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || event.pointerType === "touch" || !onLabels(event)) return;
		measure();
		if (track.hidden) return;
		const top = track.getBoundingClientRect().top;
		// The buttons under the grid are not over the pill's track.
		if (event.clientY < top || event.clientY > top + track.clientHeight) return;
		event.preventDefault();
		const pill = thumb.getBoundingClientRect();
		// Where along the pill it is held.
		let grab = thumbHeight / 2;
		if (event.clientY >= pill.top && event.clientY <= pill.bottom) grab = event.clientY - pill.top;
		else scrollToThumbAt(event.clientY - top - grab);

		dragging = true;
		column.setPointerCapture(event.pointerId);
		column.classList.add("grid-scrollbar-dragging");
		showOrHide();

		const move = (moveEvent: PointerEvent) => scrollToThumbAt(moveEvent.clientY - top - grab);
		const end = () => {
			dragging = false;
			column.classList.remove("grid-scrollbar-dragging");
			column.removeEventListener("pointermove", move);
			column.removeEventListener("pointerup", end);
			column.removeEventListener("pointercancel", end);
			showOrHide();
		};
		column.addEventListener("pointermove", move);
		column.addEventListener("pointerup", end);
		column.addEventListener("pointercancel", end);
	});
}
