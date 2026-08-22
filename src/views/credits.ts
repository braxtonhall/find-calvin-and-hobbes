import "./credits.css";

import { attachBackButtonHandler, buildBackButton, buildHomeButton } from "./nav-buttons";

export function renderCredits(): void {
	const element = document.getElementById("view-credits")!;
	element.innerHTML = `<div class="credits-container">
		${buildBackButton("credits-back")}
		${buildHomeButton("credits-home")}
		<h2 class="credits-heading">Credits</h2>

		<p class="credits-section">
			<strong>Calvin and Hobbes</strong> is copyright Bill Watterson / Universal
			Press Syndicate. All characters and comic strips are the property of their
			respective owners. This is an unofficial fan archive and is not affiliated
			with or endorsed by the copyright holders.
		</p>

		<p class="credits-section">
			<strong>Transcripts</strong> from the
			<a href="https://web.archive.org/web/20210706165719/http://www.s-anand.net/comic.calvin.jsz" target="_blank" rel="noopener">Calvin and Hobbes transcript search</a>, the
			<a href="https://calvinandhobbes.miraheze.org/wiki/Main_Page" target="_blank" rel="noopener">Calvin and Hobbes Miraheze Wiki</a>, and
			<a href="https://seligman.github.io/comics/calvin_and_hobbes.html" target="_blank" rel="noopener">Calvin and Hobbes Search</a>.
		</p>

		<p class="credits-section">
			<strong>Descriptions and page index</strong> from
			<a href="https://web.archive.org/web/20160526232457/http://www.reemst.com/calvin_and_hobbes/" target="_blank" rel="noopener">Calvin and Hobbes at Martijn's</a> and
			<a href="https://openlibrary.org/books/OL3311404M/The_Complete_Calvin_and_Hobbes" target="_blank" rel="noopener">OpenLibrary</a>.
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

		<div class="credits-section">
			<strong>Prior Art</strong>
			<ul>
				<li><a href="https://web.archive.org/web/20081102153520/http://www.s-anand.net/calvinandhobbes.html#19851117" target="_blank" rel="noopener">s-anand.net</a></li>
				<li><a href="https://web.archive.org/web/20060508010745/http://www.reemst.com/calvin_and_hobbes/stripsearch/1989/10/29/calvin_and_hobbes.html" target="_blank" rel="noopener">C.H.E.S.S.</a></li>
				<li><a href="https://web.archive.org/web/20260709131130/http://michaelyingling.com/random/calvin_and_hobbes/" target="_blank" rel="noopener">Mike Yingling's Calvin and Hobbes: The Search Engine</a></li>
				<li><a href="https://web.archive.org/web/20260701171131/https://calvinandhobbes.miraheze.org/wiki/Main_Page" target="_blank" rel="noopener">Calvin and Hobbes Miraheze Wiki</a></li>
				<li><a href="https://web.archive.org/web/20260803211810/https://seligman.github.io/comics/calvin_and_hobbes.html" target="_blank" rel="noopener">Calvin and Hobbes Search</a></li>
			</ul>
		</div>

		<p class="credits-footer">Please send corrections, fixes, and ideas to Braxton Hall through <a href="https://github.com/braxtonhall/find-calvin-and-hobbes" target="_blank" rel="noopener">GitHub</a>.</p>
	</div>`;

	attachBackButtonHandler(element, "credits-back");
}
