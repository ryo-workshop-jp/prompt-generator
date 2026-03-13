import React, { useMemo } from 'react';
import type { TemplateItem } from '../types';

type TemplateGroup = {
    id: string;
    name: string;
    templates: TemplateItem[];
};

const UNCATEGORIZED_ID = '__none__';

const sortByName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

const buildTemplateGroups = (templates: TemplateItem[]): TemplateGroup[] => {
    const groups = new Map<string, TemplateGroup>();
    for (const template of templates) {
        const folderName = template.folderId?.trim() || UNCATEGORIZED_ID;
        const groupName = folderName === UNCATEGORIZED_ID ? '未分類' : folderName;
        const current = groups.get(folderName);
        if (!current) {
            groups.set(folderName, { id: folderName, name: groupName, templates: [template] });
            continue;
        }
        current.templates.push(template);
    }
    return Array.from(groups.values())
        .map(group => ({ ...group, templates: [...group.templates].sort(sortByName) }))
        .sort((a, b) => {
            if (a.id === UNCATEGORIZED_ID) return 1;
            if (b.id === UNCATEGORIZED_ID) return -1;
            return a.name.localeCompare(b.name);
        });
};

const toOrderedIds = (allTemplates: TemplateItem[], selected: Set<string>) => {
    return allTemplates.map(template => template.id).filter(id => selected.has(id));
};

const TemplateFolderSelector: React.FC<{
    templates: TemplateItem[];
    selectedTemplateIds: string[];
    onChange: (next: string[]) => void;
    maxHeightClass?: string;
}> = ({ templates, selectedTemplateIds, onChange, maxHeightClass = 'max-h-40' }) => {
    const groups = useMemo(() => buildTemplateGroups(templates), [templates]);
    const selectedSet = useMemo(() => new Set(selectedTemplateIds), [selectedTemplateIds]);

    const toggleTemplate = (id: string) => {
        const next = new Set(selectedSet);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange(toOrderedIds(templates, next));
    };

    const toggleFolder = (group: TemplateGroup) => {
        const next = new Set(selectedSet);
        const allSelected = group.templates.every(template => next.has(template.id));
        for (const template of group.templates) {
            if (allSelected) next.delete(template.id);
            else next.add(template.id);
        }
        onChange(toOrderedIds(templates, next));
    };

    const selectAll = () => onChange(templates.map(template => template.id));
    const clearAll = () => onChange([]);

    return (
        <div className={`bg-slate-950 border border-slate-700 rounded-lg p-2 ${maxHeightClass} overflow-y-auto custom-scrollbar`}>
            {templates.length === 0 && (
                <div className="text-xs text-slate-500">装飾がありません。</div>
            )}
            {templates.length > 0 && (
                <>
                    <div className="flex items-center justify-end gap-2 mb-2">
                        <button
                            type="button"
                            onClick={selectAll}
                            className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                            すべて選択
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
                        >
                            クリア
                        </button>
                    </div>
                    <div className="flex flex-col gap-2">
                        {groups.map(group => {
                            const selectedCount = group.templates.filter(template => selectedSet.has(template.id)).length;
                            const allSelected = selectedCount === group.templates.length;
                            return (
                                <div key={group.id} className="rounded-md border border-slate-800 p-2">
                                    <label className="flex items-center justify-between gap-2 text-xs text-slate-200">
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={() => toggleFolder(group)}
                                                className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                            />
                                            <span className="font-semibold text-slate-300">{group.name}</span>
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                            {selectedCount}/{group.templates.length}
                                        </span>
                                    </label>
                                    <div className="mt-1.5 pl-6 flex flex-col gap-1">
                                        {group.templates.map(template => (
                                            <label key={template.id} className="flex items-center gap-2 text-sm text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSet.has(template.id)}
                                                    onChange={() => toggleTemplate(template.id)}
                                                    className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                                />
                                                <span>{template.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default TemplateFolderSelector;
