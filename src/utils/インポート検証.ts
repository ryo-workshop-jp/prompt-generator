import type { FolderItem } from '../types';

export type ImportMode = 'all' | 'words' | 'cards' | 'favorites' | 'quality' | 'templates';
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const fail = (path: string, reason: string): never => {
    throw new Error(`${path}: ${reason}`);
};
const record = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'オブジェクトが必要です。');
    return value as Record<string, unknown>;
};
const list = (value: unknown, path: string): unknown[] => {
    if (!Array.isArray(value)) fail(path, '配列が必要です。');
    return value as unknown[];
};
const text = (value: unknown, path: string, nonEmpty = false) => {
    if (typeof value !== 'string' || (nonEmpty && !value.trim())) fail(path, '文字列が必要です。');
};
const optionalText = (item: Record<string, unknown>, keys: string[], path: string) => {
    for (const key of keys) if (item[key] !== undefined) text(item[key], `${path}.${key}`);
};
const optionalBool = (item: Record<string, unknown>, keys: string[], path: string) => {
    for (const key of keys) {
        if (item[key] !== undefined && typeof item[key] !== 'boolean') fail(`${path}.${key}`, 'true / false が必要です。');
    }
};
const stringList = (value: unknown, path: string) => list(value, path).forEach((entry, i) => text(entry, `${path}[${i}]`));
const typed = (value: unknown, path: string) => {
    if (value !== 'positive' && value !== 'negative') fail(path, 'positive / negative が必要です。');
};

// Importは外部入力。保存・状態変更より先に検証し、循環参照や過大な展開で画面が停止するのを防ぐ。
const checkTree = (input: unknown) => {
    const pending = [{ value: input, depth: 0 }];
    let count = 0;
    while (pending.length) {
        const { value, depth } = pending.pop()!;
        if (++count > 300_000 || depth > 32) fail('JSON', 'データの件数または入れ子が多すぎます。');
        if (typeof value === 'number' && !Number.isFinite(value)) fail('JSON', '有限の数値が必要です。');
        if (typeof value === 'string' && value.length > 100_000) fail('JSON', '文字列が長すぎます。');
        if (!value || typeof value !== 'object') continue;
        for (const [key, child] of Object.entries(value)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('JSON', '使用できないキーが含まれています。');
            pending.push({ value: child, depth: depth + 1 });
        }
    }
};

const refs = (value: unknown, path: string, selected = false) => {
    let expandedCount = 0;
    list(value, path).forEach((entry, i) => {
        const p = `${path}[${i}]`;
        const item = record(entry, p);
        if (selected) {
            word(item, p);
            typed(item.type, `${p}.type`);
        } else {
            text(item.wordId, `${p}.wordId`, true);
            optionalText(item, ['label_jp', 'value_en', 'note'], p);
            optionalBool(item, ['nsfw'], p);
        }
        if (item.strength !== undefined && (typeof item.strength !== 'number' || !Number.isFinite(item.strength))) fail(`${p}.strength`, '有限の数値が必要です。');
        if (item.repeat !== undefined && (typeof item.repeat !== 'number' || !Number.isInteger(item.repeat) || item.repeat < 1 || item.repeat > 100)) fail(`${p}.repeat`, '繰り返しは1〜100の整数にしてください。');
        expandedCount += typeof item.repeat === 'number' ? item.repeat : 1;
        if (expandedCount > 20_000) fail(path, '繰り返し展開後の単語が多すぎます。');
    });
};
const word = (value: unknown, path: string) => {
    const item = record(value, path);
    text(item.id, `${path}.id`, true);
    text(item.folderId, `${path}.folderId`, true);
    text(item.label_jp, `${path}.label_jp`);
    text(item.value_en, `${path}.value_en`);
    optionalBool(item, ['nsfw', 'favorite'], path);
    optionalText(item, ['note', 'templateId', 'cardId', 'cardName', 'cardPrompt'], path);
    for (const key of ['tags', 'templateIds', 'cardDisabledWordIds']) {
        if (item[key] !== undefined) stringList(item[key], `${path}.${key}`);
    }
    if (item.cardRefs !== undefined) refs(item.cardRefs, `${path}.cardRefs`);
};

const folderGraph = (folders: FolderItem[]) => {
    const parents = new Map(folders.map(folder => [folder.id, folder.parentId]));
    for (const id of parents.keys()) {
        const visited = new Set<string>();
        let cursor: string | null | undefined = id;
        while (cursor && parents.has(cursor)) {
            if (visited.has(cursor)) fail('folders', '親フォルダーが循環しています。');
            if (visited.size >= 64) fail('folders', 'フォルダーは64階層以内にしてください。');
            visited.add(cursor);
            cursor = parents.get(cursor);
        }
    }
};

export const validateImport = (input: unknown, mode: ImportMode, existingFolders: FolderItem[] = []): void => {
    checkTree(input);
    const data = Array.isArray(input) ? {} : record(input, 'JSON');
    const entries = (key: string, required: boolean) => {
        const value = Array.isArray(input) ? input : data[key];
        if (value === undefined && !required) return [];
        return list(value, key);
    };
    if (mode === 'all' || mode === 'words') {
        // 全データとカード用データのImportには、トップレベルのオブジェクトが必要。
        record(input, 'JSON');
        const folders = entries('folders', true);
        const ids = new Set<string>();
        folders.forEach((entry, i) => {
            const p = `folders[${i}]`;
            const item = record(entry, p);
            text(item.id, `${p}.id`, true);
            text(item.name, `${p}.name`);
            if (item.parentId !== null) text(item.parentId, `${p}.parentId`, true);
            optionalBool(item, ['nsfw'], p);
            const id = item.id as string;
            if (ids.has(id)) fail(p, 'フォルダーIDが重複しています。');
            ids.add(id);
        });
        folderGraph(folders as FolderItem[]);
        if (mode === 'words') {
            // 「追加」は既存の同一IDを優先するため、結合後にだけ現れる循環も確認する。
            const merged = new Map(existingFolders.map(folder => [folder.id, folder]));
            for (const folder of folders as FolderItem[]) if (!merged.has(folder.id)) merged.set(folder.id, folder);
            folderGraph([...merged.values()]);
        }
        entries('words', true).forEach((entry, i) => word(entry, `words[${i}]`));
    }
    if (mode === 'all' || mode === 'templates') {
        entries('templates', mode === 'templates').forEach((entry, i) => {
            const p = `templates[${i}]`;
            const item = record(entry, p);
            text(item.id, `${p}.id`, true);
            text(item.name, `${p}.name`);
            optionalText(item, ['folderId', 'defaultOptionId'], p);
            optionalBool(item, ['allowFree', 'spaceEnabled'], p);
            if (item.position !== undefined && item.position !== 'before' && item.position !== 'after') fail(p, '装飾の位置が不正です。');
            list(item.options, `${p}.options`).forEach((option, j) => {
                const opt = record(option, `${p}.options[${j}]`);
                for (const key of ['id', 'label', 'value']) text(opt[key], `${p}.options[${j}].${key}`);
            });
        });
    }
    for (const [targetMode, key] of [['cards', 'cards'], ['favorites', 'favorites'], ['quality', 'qualityTemplates']] as const) {
        if (mode !== 'all' && mode !== targetMode) continue;
        entries(key, mode !== 'all').forEach((entry, i) => {
            const p = `${key}[${i}]`;
            const item = record(entry, p);
            text(item.id, `${p}.id`, true);
            text(item.name, `${p}.name`, true);
            typed(item.type, `${p}.type`);
            optionalBool(item, ['nsfw'], p);
            if (targetMode === 'cards') {
                text(item.folderId, `${p}.folderId`, true);
                if (item.templateIds !== undefined) stringList(item.templateIds, `${p}.templateIds`);
            }
            refs(item.words, `${p}.words`, targetMode !== 'cards');
        });
    }
    if (mode === 'all' && data.comfyPresets !== undefined) {
        const presets = record(data.comfyPresets, 'comfyPresets');
        for (const [key, value] of Object.entries(presets)) record(value, `comfyPresets.${key}`);
    }
    if (mode === 'cards' && data.folders !== undefined) {
        validateImport({ folders: data.folders, words: [] }, 'words', existingFolders);
    }
};
