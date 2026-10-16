import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { transform } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { validateImport, MAX_IMPORT_BYTES } from '../src/utils/インポート検証.ts';

const folder = (id, parentId = 'root') => ({ id, name: id, parentId });
const word = { id: 'word', folderId: 'a', label_jp: 'テスト', value_en: 'test', nsfw: false };
const ref = { wordId: 'word', repeat: 2 };
const favorite = { id: 'favorite', name: '保存', type: 'positive', nsfw: false, words: [{ ...word, type: 'positive', strength: 1, repeat: 2 }] };
const template = { id: 'template', name: '装飾', options: [{ id: 'option', label: '選択', value: 'value' }] };
const card = { id: 'deck', name: 'デッキ', folderId: 'a', type: 'positive', nsfw: false, words: [ref] };
const all = { folders: [folder('a')], words: [word], templates: [template], cards: [card], favorites: [favorite], qualityTemplates: [favorite], comfyPresets: { standard: { steps: 20 } } };

test('既存の初期データと6種類のExport形式を受け入れ、入力を変更しない', async () => {
    const initial = JSON.parse(await readFile(new URL('../初期データ.json', import.meta.url), 'utf8'));
    validateImport(initial, 'all');
    const snapshot = structuredClone(all);
    validateImport(all, 'all');
    validateImport({ folders: all.folders, words: all.words }, 'words');
    for (const [mode, key] of [['cards', 'cards'], ['favorites', 'favorites'], ['quality', 'qualityTemplates'], ['templates', 'templates']]) {
        validateImport({ [key]: all[key] }, mode);
        validateImport(all[key], mode);
    }
    assert.deepEqual(all, snapshot);
    assert.equal(MAX_IMPORT_BYTES, 10 * 1024 * 1024);
});

test('欠落・null・型の違う要素を保存前に拒否する', () => {
    for (const bad of [null, [], {}, { folders: [], words: [null] }, { folders: [], words: [{ ...word, label_jp: {} }] }, { ...all, templates: null }, { ...all, favorites: [{ ...favorite, words: [null] }] }]) {
        assert.throws(() => validateImport(bad, 'all'));
    }
    assert.throws(() => validateImport([{ ...template, options: [null] }], 'templates'));
    assert.throws(() => validateImport([{ ...card, type: 'invalid' }], 'cards'));
});

test('自己循環・複数フォルダーの循環・過度な階層・ID重複を拒否する', () => {
    for (const folders of [[folder('a', 'a')], [folder('a', 'b'), folder('b', 'a')], [folder('a'), folder('a')], Array.from({ length: 65 }, (_, i) => folder(`f${i}`, i ? `f${i - 1}` : 'root'))]) {
        assert.throws(() => validateImport({ folders, words: [] }, 'words'));
    }
    validateImport({ folders: [folder('a', 'external')], words: [] }, 'words');
    assert.throws(() => validateImport({ folders: [folder('b', 'a')], words: [] }, 'words', [folder('a', 'b')]));
});

test('巨大・非有限・不正な繰り返し数と展開量を拒否する', () => {
    for (const repeat of [1e9, Infinity, 0, -1, 1.5, '2']) {
        assert.throws(() => validateImport([{ ...card, words: [{ ...ref, repeat }] }], 'cards'));
        assert.throws(() => validateImport([{ ...favorite, words: [{ ...favorite.words[0], repeat }] }], 'favorites'));
    }
    assert.throws(() => validateImport([{ ...card, words: Array.from({ length: 201 }, () => ({ ...ref, repeat: 100 })) }], 'cards'));
    assert.throws(() => validateImport([{ ...card, words: [{ ...ref, strength: Infinity }] }], 'cards'));
});

test('過度な入れ子・危険なオブジェクトキー・文字列を拒否する', () => {
    const deep = { ...all };
    let cursor = deep;
    for (let i = 0; i < 40; i++) cursor = cursor.extra = {};
    assert.throws(() => validateImport(deep, 'all'));
    for (const key of ['__proto__', 'constructor', 'prototype']) {
        const bad = JSON.parse(`{"folders":[],"words":[],"${key}":{}}`);
        assert.throws(() => validateImport(bad, 'all'));
    }
    assert.throws(() => validateImport({ ...all, words: [{ ...word, value_en: 'a'.repeat(100_001) }] }, 'all'));
    assert.equal(Object.prototype.polluted, undefined);
});

test('HTMLのような文字列はテキストとして保持できる', () => {
    validateImport({ folders: [folder('a')], words: [{ ...word, label_jp: '<img src=x onerror=alert(1)>' }] }, 'words');
});

test('開発サーバーの旧APIへPOSTしてもファイルが変更されない', async () => {
    const dataFile = new URL('../src/data/categories.json', import.meta.url);
    const before = await readFile(dataFile);
    const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false, watch: null }, logLevel: 'silent' });
    try {
        await server.listen();
        const { port } = server.httpServer.address();
        for (const path of ['/api/save', '/prompt-generator/api/save', '/api/save/extra']) {
            const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://example.invalid' }, body: '{"securityTest":true}' });
            assert.ok(response.status >= 400, `${path}: ${response.status}`);
            assert.deepEqual(await readFile(dataFile), before);
        }
    } finally {
        await server.close();
    }
});

const loadAnalytics = async () => {
    const calls = [];
    const source = await readFile(new URL('../src/analytics.ts', import.meta.url), 'utf8');
    const { code } = await transform(source, {
        loader: 'ts', format: 'cjs',
        define: { 'import.meta.env': JSON.stringify({ PROD: true, DEV: false, VITE_GA_ID: 'G-TEST' }) }
    });
    const module = { exports: {} };
    runInNewContext(code, {
        module, exports: module.exports, URL,
        window: { location: { origin: 'https://example.com', pathname: '/prompt-generator/', search: '?secret=value', href: 'https://example.com/prompt-generator/?secret=value#private' }, gtag: (...args) => calls.push(JSON.parse(JSON.stringify(args))) },
        document: { title: 'Prompt Generator', referrer: 'https://referrer.example/private?email=secret', createElement: () => ({ dataset: {} }), head: { appendChild: () => {} } }
    });
    return { analytics: module.exports, calls };
};

test('計測へ利用者のID・文章・任意の文字列を送信しない', async () => {
    const { analytics, calls } = await loadAnalytics();
    analytics.trackEvent('test', { folder_id: 'private-name', card_id: 'private-card', quality_preset: 'private-preset', prompt: 'private prompt', nsfw: true, text_length: 42, has_note: true, copy_scope: 'both', save_mode: 'favorite', prompt_type: 'positive', unknown: 123, word_count: Infinity });
    assert.deepEqual(calls.find(call => call[1] === 'test')[2], {
        text_length: 42, has_note: true, copy_scope: 'both', save_mode: 'favorite', prompt_type: 'positive'
    });
    analytics.trackEvent('invalid', { copy_scope: 'private', save_mode: 'private', has_note: 'private' });
    assert.deepEqual(calls.find(call => call[1] === 'invalid')[2], {});
});

test('計測用URLからクエリ・ハッシュ・参照元を除外する', async () => {
    const { analytics, calls } = await loadAnalytics();
    analytics.initAnalytics();
    const config = calls.find(call => call[0] === 'config')[2];
    assert.equal(config.page_location, 'https://example.com/prompt-generator/');
    assert.equal(config.page_referrer, '');
    const pageView = calls.find(call => call[1] === 'page_view')[2];
    assert.equal(pageView.page_location, 'https://example.com/prompt-generator/');
    assert.equal(pageView.page_path, '/prompt-generator/');
    assert.equal(pageView.page_referrer, '');
    assert.doesNotMatch(JSON.stringify(calls), /secret|private|email/);
});
