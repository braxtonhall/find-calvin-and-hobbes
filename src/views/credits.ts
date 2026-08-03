import "./credits.css";

export function renderCredits(): void {
	const element = document.getElementById("view-credits")!;
	element.innerHTML = `<div class="credits-container">
		<button class="credits-back">&larr; Back</button>
		<h2 class="credits-heading">Credits</h2>

		<p class="credits-section">
			<strong>Calvin and Hobbes</strong> is copyright Bill Watterson / Universal
			Press Syndicate. All characters and comic strips are the property of their
			respective owners. This is an unofficial fan archive and is not affiliated
			with or endorsed by the copyright holders.
		</p>

		<p class="credits-section">
			<strong>Comic transcripts</strong> sourced from the
			<a href="https://web.archive.org/web/20210706165719/http://www.s-anand.net/comic.calvin.jsz" target="_blank" rel="noopener">Calvin and Hobbes transcript search</a> (s-anand.net).
		</p>

		<p class="credits-section">
			<strong>Comic dates</strong> from
			<a href="https://en.wikipedia.org/wiki/List_of_Calvin_and_Hobbes_books" target="_blank" rel="noopener">Wikipedia</a> and the
			<a href="https://calvinandhobbes.fandom.com/" target="_blank" rel="noopener">Calvin and Hobbes Fandom Wiki</a>.
		</p>

		<p class="credits-section">
			<strong>Favicon</strong> from the
			<a href="https://calvinandhobbes.miraheze.org/wiki/Main_Page" target="_blank" rel="noopener">Calvin and Hobbes Miraheze Wiki</a>.
		</p>

		<p class="credits-section">
			<strong>Alterations data</strong> from the
			<a href="https://calvinandhobbes.fandom.com/" target="_blank" rel="noopener">Calvin and Hobbes Fandom Wiki</a>.
		</p>

		<p class="credits-section">
			<strong>Logo</strong> from
			<a href="https://commons.wikimedia.org/wiki/File:Calvin_and_Hobbes_title.png" target="_blank" rel="noopener">Wikimedia Commons</a>.
		</p>

		<p class="credits-footer">Built by Braxton Hall</p>
	</div>`;

	element.querySelector(".credits-back")!.addEventListener("click", () => history.back());
}
