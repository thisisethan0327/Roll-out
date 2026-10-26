#!/usr/bin/env node
/**
 * Fails when app code calls the browser's alert(), confirm() or prompt().
 *
 * Production browsers can auto-dismiss them: a dismissed confirm() silently
 * skips the action, a dismissed alert() hides a failed refund. Use the Glide
 * kit instead (Documents/CLAUDE.md §12, README "UI rules: overlays"):
 * confirmDialog() for "are you sure", toast.error() for a failure, an inline
 * error at the field for validation, useArmed for a row-level remove.
 *
 * Stands in for an ESLint no-restricted-globals rule: this app has no ESLint
 * setup yet. Parses with the TypeScript compiler (already a devDependency), so
 * comments, strings and JSX text never count. Run with `npm run check:dialogs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const NAMES = new Set(['alert', 'confirm', 'prompt']);
const GLOBALS = new Set(['window', 'globalThis', 'self']);

function nativeName(callee) {
    if (ts.isIdentifier(callee) && NAMES.has(callee.text)) return callee.text;
    if (
        ts.isPropertyAccessExpression(callee) &&
        NAMES.has(callee.name.text) &&
        ts.isIdentifier(callee.expression) &&
        GLOBALS.has(callee.expression.text)
    )
        return `${callee.expression.text}.${callee.name.text}`;
    return null;
}

const hits = [];
function scan(file) {
    const text = fs.readFileSync(file, 'utf8');
    const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    // A local declaration named alert/confirm/prompt shadows the global.
    const local = new Set();
    const visit = (node) => {
        if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.name && ts.isIdentifier(node.name) && NAMES.has(node.name.text))
            local.add(node.name.text);
        if (ts.isImportSpecifier(node) && NAMES.has(node.name.text)) local.add(node.name.text);
        ts.forEachChild(node, visit);
    };
    visit(sf);
    const find = (node) => {
        if (ts.isCallExpression(node)) {
            const name = nativeName(node.expression);
            if (name && !local.has(name)) {
                const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                hits.push(`${path.relative(process.cwd(), file)}:${line + 1}  ${name}()`);
            }
        }
        ts.forEachChild(node, find);
    };
    find(sf);
}
function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name.endsWith('-harness')) continue;
            walk(p);
        } else if (/\.(tsx?|jsx?|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) scan(p);
    }
}
walk(root);

if (hits.length) {
    console.error(`Native dialogs found (use confirmDialog / toast / an inline error instead):\n  ${hits.join('\n  ')}`);
    process.exit(1);
}
console.log('No alert(), confirm() or prompt() calls in src/.');
