import React, { useMemo, useState } from 'react';
import { usePrompt } from '../context/usePrompt';
import type { FolderItem } from '../types';
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon, PlusIcon } from '@heroicons/react/24/outline';

interface CategoryNavProps {
    onSelectFolder: (id: string) => void;
    activeFolderId: string | null;
}

const AddFolderModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (name: string, id: string, nsfw: boolean, parentId: string) => void;
    parentId: string;
    title: string;
}> = ({ isOpen, onClose, onAdd, parentId, title }) => {
    const [name, setName] = useState('');
    const [id, setId] = useState('');
    const [nsfw, setNsfw] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        const slug = name.toLowerCase().replace(/\s+/g, '_');
        const finalId = id || (parentId === 'root' ? slug : `${parentId}_${slug}`);
        onAdd(name, finalId, nsfw, parentId);
        setName('');
        setId('');
        setNsfw(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold mb-4 text-white">{title}</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto pr-1">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Name (Display)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="e.g. My Favorites"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">ID (Optional)</label>
                        <input
                            type="text"
                            value={id}
                            onChange={e => setId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="auto-generated-if-empty"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={nsfw}
                            onChange={e => setNsfw(e.target.checked)}
                            className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                        />
                        <span className="text-sm text-slate-300">NSFW content</span>
                    </label>
                    <div className="flex gap-2 mt-2 sticky bottom-0 bg-slate-900 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700">Cancel</button>
                        <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold">Add</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const CategoryNav: React.FC<CategoryNavProps> = ({ onSelectFolder, activeFolderId }) => {
    const { folders, addFolder, nsfwEnabled } = usePrompt();
    const [expandedFolders, setExpandedFolders] = useState<string[]>(['root']);

    // Modal states
    const [showAddFolder, setShowAddFolder] = useState(false);
    const [showAddSubFolder, setShowAddSubFolder] = useState<string | null>(null);

    const filteredFolders = useMemo(
        () => folders.filter(folder => nsfwEnabled || !folder.nsfw),
        [folders, nsfwEnabled]
    );

    const normalizeName = (value: string) => value.trim().toLowerCase();
    const hasDuplicateFolderName = (name: string, parentId: string) => {
        const target = normalizeName(name);
        return folders.some(folder =>
            folder.parentId === parentId &&
            normalizeName(folder.name) === target
        );
    };

    const childrenByParent = useMemo(() => {
        const map = new Map<string | null, NodeItem[]>();
        for (const folder of filteredFolders) {
            const key = folder.parentId;
            if (!map.has(key)) map.set(key, []);
            map.get(key)?.push(folder);
        }
        return map;
    }, [filteredFolders]);

    const toggleExpand = (folderId: string) => {
        setExpandedFolders(prev =>
            prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
        );
    };

    const renderFolder = (folder: FolderItem, depth: number) => {
        const children = childrenByParent.get(folder.id) ?? [];
        const isExpanded = expandedFolders.includes(folder.id);
        const isActive = activeFolderId === folder.id;

        return (
            <div key={folder.id} className="select-none">
                <div
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors group ${isActive
                        ? 'bg-cyan-950/30 text-cyan-400'
                        : 'text-slate-300 hover:text-cyan-400 hover:bg-slate-900'
                        }`}
                    style={{ paddingLeft: `${depth * 12 + 12}px` }}
                >
                    <button
                        onClick={() => {
                            onSelectFolder(folder.id);
                            if (children.length > 0) toggleExpand(folder.id);
                        }}
                        className="flex items-center gap-2 flex-1 text-left"
                    >
                        <span className="text-slate-500 group-hover:text-cyan-500 transition-colors">
                            {isExpanded ? <FolderOpenIcon className="w-5 h-5" /> : <FolderIcon className="w-5 h-5" />}
                        </span>
                        <span>{folder.name}</span>
                    </button>
                    <div className="flex items-center gap-1">
                        {children.length > 0 && (
                            <button
                                onClick={() => toggleExpand(folder.id)}
                                className="text-slate-600 hover:text-slate-400 p-1"
                            >
                                {isExpanded ? (
                                    <ChevronDownIcon className="w-3 h-3" />
                                ) : (
                                    <ChevronRightIcon className="w-3 h-3" />
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => setShowAddSubFolder(folder.id)}
                            className="text-slate-500 hover:text-cyan-400 p-1 rounded hover:bg-slate-800 transition-colors"
                            title="Add Subfolder"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                {isExpanded && children.length > 0 && (
                    <div className="flex flex-col gap-1 mt-1">
                        {children.map(child => renderFolder(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto py-4 px-2 custom-scrollbar">
            <div className="mb-4 px-4 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Folders</span>
                <button
                    onClick={() => setShowAddFolder(true)}
                    className="text-slate-500 hover:text-cyan-400 p-1 rounded hover:bg-slate-900 transition-colors"
                >
                    <PlusIcon className="w-4 h-4" />
                </button>
            </div>

            <div className="flex flex-col gap-2">
                {(childrenByParent.get('root') ?? []).map(folder => renderFolder(folder, 0))}
            </div>

            <AddFolderModal
                isOpen={showAddFolder}
                onClose={() => setShowAddFolder(false)}
                onAdd={(name, id, nsfw, parentId) => {
                    if (hasDuplicateFolderName(name, parentId)) {
                        alert('同じ階層に同じ名前のフォルダは作成できません。');
                        return;
                    }
                    addFolder(name, id, parentId, nsfw);
                }}
                parentId="root"
                title="Add Folder"
            />

            <AddFolderModal
                isOpen={!!showAddSubFolder}
                onClose={() => setShowAddSubFolder(null)}
                onAdd={(name, id, nsfw, parentId) => {
                    if (hasDuplicateFolderName(name, parentId)) {
                        alert('同じ階層に同じ名前のフォルダは作成できません。');
                        return;
                    }
                    addFolder(name, id, parentId, nsfw);
                }}
                parentId={showAddSubFolder ?? 'root'}
                title="Add Subfolder"
            />
        </div>
    );
};

export default CategoryNav;

