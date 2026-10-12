import { PAGE_CONFIG } from "../../src/site-config";

/**
 * Turns the characters, the creators and the subjects on for a test file about `@featuring:`, `@by:`
 * and `@about:`,
 * whatever `config.yaml` says, so the test does not depend on the archive having any.
 *
 * Imported for its effect, and first: `FILTER_SPECS` reads the flag once, when it loads, so it must
 * be set before anything imports it. Each test file runs in a process of its own, so this reaches no
 * other file.
 */
PAGE_CONFIG.characters = true;
PAGE_CONFIG.creators = true;
PAGE_CONFIG.subjects = true;
