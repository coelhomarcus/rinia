import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Elements and components that put `title` on a DOM node, where it becomes the native tooltip. */
const HTML_TAGS = new Set(
    "a button span p time label div img input textarea li td th h1 h2 h3 h4 h5 h6 section article nav header footer abbr svg path circle rect ul ol em strong small code pre figure figcaption summary details caption select option form fieldset legend output progress meter iframe video audio source track canvas table tr thead tbody tfoot dl dt dd blockquote cite q mark del ins sub sup b i u s kbd samp var hr main aside address dialog".split(" "),
);
const FORWARDING = new Set(["Button", "Menu.Trigger", "Popover.Trigger", "Dialog.Trigger", "Dialog.Close"]);
const ATTRIBUTE = /(?<![\w-])title=(?:\{|["'])/g;

function files(directory, found = []) {
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) files(path, found);
        else if (name.endsWith(".tsx")) found.push(path);
    }
    return found;
}

/** `title` attributes in `root` that render the operating system's tooltip. Component props named title are ignored. */
export function findNativeTitles(root) {
    const hits = [];
    for (const file of files(root)) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(ATTRIBUTE)) {
            const index = match.index ?? 0;
            let start = index;
            while (start > 0 && source[start] !== "<") start -= 1;
            const tag = source.slice(start + 1, start + 80).match(/^([A-Za-z][\w.]*)/)?.[1];
            if (!tag || (!HTML_TAGS.has(tag) && !FORWARDING.has(tag))) continue;
            const line = source.slice(0, index).split("\n").length;
            hits.push(`${file.slice(root.length + 1)}:${line}`);
        }
    }
    return hits;
}
