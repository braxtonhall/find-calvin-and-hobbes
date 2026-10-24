import "./characters";
import { ARCHIVE_FEATURES } from "../../src/filter-vocabulary";

/**
 * Turns on what strips say of how they have their characters — `@as:seen`, `@as:heard` and
 * `@as:mentioned` — for a test file about them, whatever the archive's strips say, as
 * `./characters` turns the characters on. Imported for its effect, and first, for the same reason.
 */
ARCHIVE_FEATURES.characterRoles = true;
