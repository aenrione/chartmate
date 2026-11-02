// Import an ASCII tab with the app's own importer and write it as a Guitar Pro file: the
// placeholder-rhythm input auto-rhythm.py expects, for a tab that isn't in the library yet.
// usage: node scripts/rhythm/ascii-to-gp.ts <tab.txt> <out.gp>
import {readFileSync, writeFileSync} from 'node:fs';
import {exporter, Settings} from '@coderline/alphatab';
import {importFromAsciiTab} from '../../src/lib/tab-editor/asciiTabImporter.ts';

const [inp, out] = process.argv.slice(2);
const text = readFileSync(inp, 'latin1');
const score = importFromAsciiTab(text.includes('�') ? text : readFileSync(inp, 'utf8'));
const bytes = new exporter.Gp7Exporter().export(score, new Settings());
writeFileSync(out, bytes);
console.log(`${score.masterBars.length} bars -> ${out}`);
