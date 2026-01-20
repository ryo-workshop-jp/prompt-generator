import React, { useMemo, useState } from 'react';
import type { WordItem, TemplateItem } from '../types';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlusIcon, MinusIcon, PlusSmallIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { StarIcon, Cog6ToothIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { usePrompt } from '../context/usePrompt';

type WordCardProps = {
    word: WordItem;
    folderPath?: string;
    editMode?: boolean;
    onEdit?: (word: WordItem) => void;
    onDelete?: (word: WordItem) => void;
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
};

const TemplateSelectModal: React.FC<{
    word: WordItem;
    templates: TemplateItem[];
    isOpen: boolean;
    onClose: () => void;
    onApply: (label: string, value: string) => void;
}> = ({ word, templates, isOpen, onClose, onApply }) => {
    const [freeValue, setFreeValue] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState(() => templates[0]?.id ?? '');

    const activeTemplate = useMemo(() => {
        if (templates.length === 0) return null;
        return templates.find(item => item.id === selectedTemplateId) ?? templates[0];
    }, [templates, selectedTemplateId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-white">Template</h3>
                        <div className="text-xs text-slate-500">{word.label_jp}{activeTemplate ? ` / ${activeTemplate.name}` : ''}</div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {!activeTemplate && (
                        <div className="text-sm text-slate-400">No templates found.</div>
                    )}
                    {activeTemplate && (
                        <div className="flex flex-col gap-3">
                            {templates.length > 1 && (
                                <div className="flex flex-wrap gap-2">
                                    {templates.map(template => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => setSelectedTemplateId(template.id)}
                                            className={`px-3 py-1 rounded-full border text-xs ${template.id === activeTemplate.id ? 'border-cyan-500 text-cyan-300 bg-cyan-500/10' : 'border-slate-700 text-slate-300 bg-slate-950'}`}
                                        >
                                            {template.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                {activeTemplate.options.map(option => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => onApply(option.label || option.value, option.value)}
                                        className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:border-cyan-500/50 hover:bg-slate-900 text-sm"
                                    >
                                        <div className="font-semibold">{option.label}</div>
                                        <div className="text-[10px] text-slate-500">{option.value}</div>
                                    </button>
                                ))}
                            </div>
                            {activeTemplate.allowFree && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={freeValue}
                                        onChange={(event) => setFreeValue(event.target.value)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                        placeholder="Custom"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const trimmed = freeValue.trim();
                                            if (!trimmed) return;
                                            onApply(trimmed, trimmed);
                                        }}
                                        className="px-3 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm"
                                    >
                                        Add
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const WordCard: React.FC<WordCardProps> = ({ word, folderPath, editMode = false, onEdit, onDelete, dragHandleProps }) => {
    const { addWord, removeWord, updateWordStrength, toggleFavorite, selectedPositive, selectedNegative, templates } = usePrompt();
    const [isTemplateOpen, setIsTemplateOpen] = useState(false);

    const templateIds = useMemo(() => {
        if (word.templateIds && word.templateIds.length > 0) return word.templateIds;
        return word.templateId ? [word.templateId] : [];
    }, [word.templateId, word.templateIds]);

    const templatesForWord = useMemo(() => {
        if (templateIds.length === 0) return [];
        const lookup = new Map(templates.map(item => [item.id, item]));
        return templateIds.map(id => lookup.get(id)).filter((item): item is TemplateItem => !!item);
    }, [templateIds, templates]);

    const makeTemplateId = (value: string) => {
        const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
        const token = normalized || Date.now().toString();
        return `${word.id}__tpl__${token}`;
    };

    const applyTemplate = (label: string, value: string) => {
        const finalValue = `${value}${word.value_en}`;
        const finalLabel = `${label}${word.label_jp}`;
        const templatedWord: WordItem = {
            ...word,
            id: makeTemplateId(value),
            value_en: finalValue,
            label_jp: finalLabel,
            templateId: undefined,
            templateIds: undefined
        };
        addWord(templatedWord, 'positive', 1.0);
        setIsTemplateOpen(false);
    };

    // Find if the word is selected and get its object to check strength
    const posWord = useMemo(() => selectedPositive.find(w => w.id === word.id), [selectedPositive, word.id]);
    const negWord = useMemo(() => selectedNegative.find(w => w.id === word.id), [selectedNegative, word.id]);

    const isPositive = !!posWord;
    const isNegative = !!negWord;
    const currentStrength = posWord?.strength || negWord?.strength || 0;
    const isFavorite = !!word.favorite;

    const handleLeftClick = (event?: React.MouseEvent) => {
        if (editMode) return;
        const isShift = !!event?.shiftKey;
        // Left Click Logic (Positive Only):
        // Neutral -> Pos 1.0 (Add)
        // Pos 1.0 -> Pos 1.2 (Update)
        // Pos 1.2 -> Pos 1.4 (Update)
        // Pos 1.4 -> Neutral (Remove - Cycle, or Max?)
        // User requested: "Click once reduces strength" <- Wait, the request said:
        // "Currently if Pos is high, Right Click -> Neutral. Change to: Click once reduces strength by one."
        // "Left Click increases Pos strength by one. Right Click increases Neg strength by one."

        // Re-interpreting User Request:
        // Left Click: Neutral -> Pos 1.0 -> Pos 1.2 -> Pos 1.4
        // (What happens at 1.4? Maybe stay or cycle? "Raise strength by one") -> Let's cap at 1.4

        // But what about: "Currently Pos High -> Right Click -> Neutral"?
        // User wants: "Right click reduces strength".
        // Ah, so if I am Pos 1.4:
        // Right Click -> Pos 1.2 -> Pos 1.0 -> Neutral -> Neg 1.0 -> Neg 1.2 ...

        // Let's implement this "Scalar" Axis model:
        // Neg 1.4 <- Neg 1.2 <- Neg 1.0 <- Neutral -> Pos 1.0 -> Pos 1.2 -> Pos 1.4

        // Left Click: Move Right on Axis
        // Right Click: Move Left on Axis

        if (isShift) {
            if (isPositive) {
                removeWord(word.id, 'positive');
            }
            if (negWord) {
                if (negWord.strength === 1.0) updateWordStrength(word.id, 'negative', 1.2);
                else if (negWord.strength === 1.2) updateWordStrength(word.id, 'negative', 1.4);
            } else {
                addWord(word, 'negative', 1.0);
            }
            return;
        }

        if (isNegative) {
            // Negative -> Reduce Negative Strength (Move towards Neutral/Positive)
            if (negWord) {
                if (negWord.strength === 1.4) updateWordStrength(word.id, 'negative', 1.2);
                else if (negWord.strength === 1.2) updateWordStrength(word.id, 'negative', 1.0);
                else if (negWord.strength === 1.0) removeWord(word.id, 'negative'); // Becomes Neutral
            }
        } else if (isPositive) {
            // Positive -> Increase Positive Strength
            if (posWord) {
                if (posWord.strength === 1.0) updateWordStrength(word.id, 'positive', 1.2);
                else if (posWord.strength === 1.2) updateWordStrength(word.id, 'positive', 1.4);
                // 1.4 Stay
            }
        } else {
            // Neutral -> Become Positive 1.0
            addWord(word, 'positive', 1.0);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        if (editMode) return;
        e.preventDefault();
        // Right Click: Move Left on Axis

        if (isPositive) {
            // Positive -> Reduce Positive Strength (Move towards Neutral/Negative)
            if (posWord) {
                if (posWord.strength === 1.4) updateWordStrength(word.id, 'positive', 1.2);
                else if (posWord.strength === 1.2) updateWordStrength(word.id, 'positive', 1.0);
                else if (posWord.strength === 1.0) removeWord(word.id, 'positive'); // Becomes Neutral
            }
        } else if (isNegative) {
            // Negative -> Increase Negative Strength (Deeper Negative)
            if (negWord) {
                if (negWord.strength === 1.0) updateWordStrength(word.id, 'negative', 1.2);
                else if (negWord.strength === 1.2) updateWordStrength(word.id, 'negative', 1.4);
                // 1.4 Stay
            }
        } else {
            // Neutral -> Become Negative 1.0
            addWord(word, 'negative', 1.0);
        }
    };

    let stateClass = "border-slate-800 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800";
    if (isPositive) {
        stateClass = "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)] text-cyan-200";
    } else if (isNegative) {
        stateClass = "border-rose-500/50 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.15)] text-rose-200";
    }

    return (
        <>
        <button
            onClick={(event) => handleLeftClick(event)}
            onContextMenu={handleContextMenu}
            className={`relative group flex flex-col items-start p-3 rounded-xl border transition-all duration-200 text-left w-full h-full min-h-[80px] ${stateClass}`}
        >
            <div className="flex justify-between w-full">
                <span className="text-xs text-slate-500 font-mono mb-1 truncate w-full">{word.value_en}</span>
            </div>
            <div className="flex gap-1 absolute top-2 right-2 items-center z-30">
                {editMode && (
                    <button
                        type="button"
                        {...dragHandleProps}
                        className="p-1 rounded-md text-slate-500 hover:text-slate-300 cursor-grab"
                        title="Drag to reorder"
                        onClick={(event) => {
                            event.stopPropagation();
                            dragHandleProps?.onClick?.(event);
                        }}
                    >
                        <Bars3Icon className="w-4 h-4" />
                    </button>
                )}
                {isPositive && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold bg-cyan-950 px-1 rounded text-cyan-400">{currentStrength}</span>
                        <PlusIcon className="w-4 h-4 text-cyan-500" />
                    </div>
                )}
                {isNegative && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold bg-rose-950 px-1 rounded text-rose-400">{currentStrength}</span>
                        <MinusIcon className="w-4 h-4 text-rose-500" />
                    </div>
                    )}
                {editMode && onEdit && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit(word);
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-cyan-400"
                        title="Edit"
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                    </button>
                )}
                {editMode && onDelete && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete(word);
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-rose-400"
                        title="Delete"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
                {!editMode && (
                    <>
                    {templatesForWord.length > 0 && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                setIsTemplateOpen(true);
                            }}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-slate-900 text-slate-300 border border-slate-700 hover:border-cyan-500/50 hover:text-cyan-300"
                            title="前置語を選択"
                        >
                            前置
                        </button>
                    )}
                    <span
                        role="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(word.id);
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        className={`p-1 rounded-md transition-colors ${isFavorite ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-amber-400'}`}
                        title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                    >
                        {isFavorite ? <StarSolidIcon className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
                    </span>
                    </>
                )}
            </div>
            <span className="font-bold text-sm line-clamp-2">{word.label_jp}</span>
            {folderPath && (
                <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">{folderPath}</span>
            )}
            {word.note && (
                <span className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic opacity-70 border-t border-white/5 pt-1 w-full">{word.note}</span>
            )}

            {!editMode && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity flex items-center justify-center bg-slate-950/80 backdrop-blur-[1px] rounded-xl z-20">
                    <div className="text-[10px] text-slate-300 flex flex-col gap-1 items-center font-mono">
                        <span className="text-cyan-400">L-Click: + Pos</span>
                        <span className="text-rose-400">R-Click: + Neg</span>
                    </div>
                </div>
            )}
        </button>
        <TemplateSelectModal
            key={`${word.id}-${isTemplateOpen ? 'open' : 'closed'}`}
            word={word}
            templates={templatesForWord}
            isOpen={isTemplateOpen}
            onClose={() => setIsTemplateOpen(false)}
            onApply={applyTemplate}
        />
        </>
    );
};

const AddWordModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (label: string, value: string, nsfw: boolean, note?: string, templateIds?: string[]) => void;
    templates: TemplateItem[];
}> = ({ isOpen, onClose, onAdd, templates }) => {
    const [label, setLabel] = useState('');
    const [value, setValue] = useState('');
    const [note, setNote] = useState('');
    const [nsfw, setNsfw] = useState(false);
    const [templateIds, setTemplateIds] = useState<string[]>([]);

    if (!isOpen) return null;

    const toggleTemplateId = (id: string) => {
        setTemplateIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!label || !value) return;
        const hasTemplates = templateIds.length > 0;
        onAdd(label, value, nsfw, note, hasTemplates ? templateIds : undefined);
        setLabel('');
        setValue('');
        setNote('');
        setNsfw(false);
        setTemplateIds([]);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold mb-4 text-white">Add New Word</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Japanese Label</label>
                        <input
                            type="text"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="e.g. ????"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">English Prompt</label>
                        <input
                            type="text"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="e.g. magical girl"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Note (Optional)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="e.g. Short explanation or usage tip"
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
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Templates (Optional)</label>
                        <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar">
                            {templates.length === 0 && (
                                <div className="text-xs text-slate-500">No templates available.</div>
                            )}
                            {templates.map(template => (
                                <label key={template.id} className="flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={templateIds.includes(template.id)}
                                        onChange={() => toggleTemplateId(template.id)}
                                        className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                    />
                                    <span>{template.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                        >
                            Add Word
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditWordModal: React.FC<{
    word: WordItem | null;
    onClose: () => void;
    onSave: (updates: { label_jp: string; value_en: string; nsfw: boolean; note?: string; favorite?: boolean; templateId?: string; templateIds?: string[] }) => void;
    templates: TemplateItem[];
}> = ({ word, onClose, onSave, templates }) => {
    const extractTemplateIds = (target: WordItem | null) => {
        if (!target) return [] as string[];
        if (target.templateIds && target.templateIds.length > 0) return target.templateIds;
        return target.templateId ? [target.templateId] : [];
    };

    const [label, setLabel] = useState(word?.label_jp ?? '');
    const [value, setValue] = useState(word?.value_en ?? '');
    const [note, setNote] = useState(word?.note ?? '');
    const [nsfw, setNsfw] = useState(word?.nsfw ?? false);
    const [favorite, setFavorite] = useState(word?.favorite ?? false);
    const [templateIds, setTemplateIds] = useState<string[]>(extractTemplateIds(word ?? null));

    if (!word) return null;

    const toggleTemplateId = (id: string) => {
        setTemplateIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!label || !value) return;
        const hasTemplates = templateIds.length > 0;
        onSave({
            label_jp: label,
            value_en: value,
            nsfw,
            note,
            favorite,
            templateId: undefined,
            templateIds: hasTemplates ? templateIds : undefined
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold mb-4 text-white">Edit Word</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Japanese Label</label>
                        <input
                            type="text"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">English Prompt</label>
                        <input
                            type="text"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Note (Optional)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
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
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={favorite}
                            onChange={e => setFavorite(e.target.checked)}
                            className="rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-amber-500/50"
                        />
                        <span className="text-sm text-slate-300">Favorite</span>
                    </label>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Templates (Optional)</label>
                        <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar">
                            {templates.length === 0 && (
                                <div className="text-xs text-slate-500">No templates available.</div>
                            )}
                            {templates.map(template => (
                                <label key={template.id} className="flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={templateIds.includes(template.id)}
                                        onChange={() => toggleTemplateId(template.id)}
                                        className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                    />
                                    <span>{template.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SortableWordCard: React.FC<WordCardProps & { id: string }> = ({ id, ...props }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style} className="h-full">
            <WordCard
                {...props}
                dragHandleProps={{ ...attributes, ...listeners }}
            />
        </div>
    );
};

const WordGrid: React.FC<{
    words: WordItem[];
    onAddWord: (label: string, value: string, nsfw: boolean, note?: string, templateIds?: string[]) => void;
    folderPathForWord?: (word: WordItem) => string;
    editMode?: boolean;
    onEditWord?: (word: WordItem) => void;
    onDeleteWord?: (word: WordItem) => void;
    onReorderWords?: (ordered: WordItem[]) => void;
}> = ({ words, onAddWord, folderPathForWord, editMode = false, onEditWord, onDeleteWord, onReorderWords }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingWord, setEditingWord] = useState<WordItem | null>(null);
    const { templates } = usePrompt();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const currentWords = useMemo(() => {
        return words;
    }, [words]);

    const handleAddWord = (label: string, value: string, nsfw: boolean, note?: string, templateIds?: string[]) => {
        onAddWord(label, value, nsfw, note, templateIds);
    };

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (!editMode || !onReorderWords) return;
                    if (active.id !== over?.id) {
                        const oldIndex = currentWords.findIndex(item => item.id === active.id);
                        const newIndex = currentWords.findIndex(item => item.id === over?.id);
                        if (oldIndex === -1 || newIndex === -1) return;
                        const reordered = arrayMove(currentWords, oldIndex, newIndex);
                        onReorderWords(reordered);
                    }
                }}
            >
                <SortableContext
                    items={editMode ? currentWords.map(word => word.id) : []}
                    strategy={rectSortingStrategy}
                >
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-20">
                        {/* Add New Word Button */}
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500/50 hover:bg-cyan-950/20 text-slate-500 hover:text-cyan-400 transition-all min-h-[80px]"
                        >
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mb-2">
                                <PlusSmallIcon className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold">Add Word</span>
                        </button>

                        {currentWords.map(word => {
                            const card = {
                                key: word.id,
                                word,
                                folderPath: folderPathForWord ? folderPathForWord(word) : undefined,
                                editMode,
                                onEdit: editMode ? (w: WordItem) => {
                                    setEditingWord(w);
                                } : undefined,
                                onDelete: editMode ? (w: WordItem) => onDeleteWord?.(w) : undefined
                            };

                            if (editMode) {
                                return <SortableWordCard key={word.id} id={word.id} {...card} />;
                            }

                            return <WordCard key={word.id} {...card} />;
                        })}
                    </div>
                </SortableContext>
            </DndContext>

            <AddWordModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onAdd={handleAddWord}
                templates={templates}
            />
            <EditWordModal
                key={editingWord?.id ?? 'none'}
                word={editingWord}
                onClose={() => setEditingWord(null)}
                onSave={(updates) => {
                    if (!editingWord) return;
                    onEditWord?.({ ...editingWord, ...updates });
                }}
                templates={templates}
            />
        </>
    );
};

export default WordGrid;



