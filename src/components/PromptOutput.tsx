import React, { useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePrompt } from '../context/usePrompt';
import type { SelectedWord, PromptStrength, PromptFavorite } from '../types';
import { DocumentDuplicateIcon, XMarkIcon, BookmarkIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline';

const formatPrompt = (words: SelectedWord[]) => {
    return words.map(w => {
        const val = w.value_en;
        if (w.strength === 1.0) return val;
        return `(${val}:${w.strength})`;
    }).join(', ');
};

const StrengthSelector: React.FC<{
    strength: PromptStrength,
    onChange: (s: PromptStrength) => void
}> = ({ strength, onChange }) => {
    const levels: PromptStrength[] = [1.0, 1.2, 1.4];
    return (
        <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
            {levels.map(lvl => (
                <button
                    key={lvl}
                    onClick={(e) => { e.stopPropagation(); onChange(lvl); }}
                    className={`text-[10px] px-2 py-0.5 rounded-md transition-all ${strength === lvl
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                        }`}
                >
                    {lvl}
                </button>
            ))}
        </div>
    );
};

const Chip: React.FC<{ word: SelectedWord, type: 'positive' | 'negative' }> = ({ word, type }) => {
    const { removeWord, updateWordStrength } = usePrompt();

    return (
        <div className={`inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full text-xs font-medium border group transition-all animate-fadeIn ${type === 'positive'
            ? 'bg-cyan-950/40 border-cyan-800 text-cyan-300'
            : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}>
            <span>{word.label_jp}</span>
            <span className="opacity-50 text-[10px]">{word.value_en}</span>

            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                <StrengthSelector
                    strength={word.strength}
                    onChange={(s) => updateWordStrength(word.id, type, s)}
                />
            </div>

            <button
                onClick={() => removeWord(word.id, type)}
                className="p-1 hover:bg-black/20 rounded-full ml-1"
            >
                <XMarkIcon className="w-3 h-3" />
            </button>
        </div>
    );
};

const SortableChip: React.FC<{ word: SelectedWord; type: 'positive' | 'negative' }> = ({ word, type }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: `${type}:${word.id}`,
        data: { type }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            <Chip word={word} type={type} />
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="absolute -left-2 -top-2 p-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-slate-200 cursor-grab"
                title="Drag to reorder"
            >
                <Bars3Icon className="w-3 h-3" />
            </button>
        </div>
    );
};

const PromptOutput: React.FC = () => {
    const { selectedPositive, selectedNegative, favorites, qualityTemplates, nsfwEnabled, addPromptFavorite, addQualityTemplate, applyPromptFavorite, removePromptFavorite, removeQualityTemplate, clearPositive, clearNegative, reorderSelected, selectQualityTemplate, selectedQualityTemplateIds } = usePrompt();
    const [copyFeedback, setCopyFeedback] = useState<'pos' | 'neg' | null>(null);
    const [saveType, setSaveType] = useState<'positive' | 'negative' | null>(null);
    const [qualityType, setQualityType] = useState<'positive' | 'negative' | null>(null);
    const [loadType, setLoadType] = useState<'positive' | 'negative' | null>(null);
    const [favoriteName, setFavoriteName] = useState('');
    const [favoriteNsfw, setFavoriteNsfw] = useState(false);
    const [saveAsQuality, setSaveAsQuality] = useState(false);

    const posString = formatPrompt(selectedPositive);
    const negString = formatPrompt(selectedNegative);

    const filteredFavorites = useMemo(() => {
        return favorites.filter(fav => (nsfwEnabled ? true : !fav.nsfw));
    }, [favorites, nsfwEnabled]);

    const filteredQualityTemplates = useMemo(() => {
        return qualityTemplates.filter(template => (nsfwEnabled ? true : !template.nsfw));
    }, [qualityTemplates, nsfwEnabled]);

    const getQualityPrompt = (type: 'positive' | 'negative') => {
        const selectedId = selectedQualityTemplateIds[type];
        if (!selectedId) return '';
        const selected = qualityTemplates.find(template => template.id === selectedId);
        if (!selected) return '';
        if (!nsfwEnabled && selected.nsfw) return '';
        return formatPrompt(selected.words);
    };

    const getQualityName = (type: 'positive' | 'negative') => {
        const selectedId = selectedQualityTemplateIds[type];
        if (!selectedId) return '';
        const selected = qualityTemplates.find(template => template.id === selectedId);
        if (!selected) return '';
        if (!nsfwEnabled && selected.nsfw) return '';
        return selected.name;
    };

    const buildCopyText = (type: 'positive' | 'negative', base: string) => {
        const quality = getQualityPrompt(type);
        if (!quality) return base;
        if (!base) return quality;
        return `${quality}, ${base}`;
    };

    const inferFavoriteNsfw = (source: SelectedWord[]) => {
        return source.some(word => {
            const jp = word.label_jp?.toLowerCase();
            const en = word.value_en?.toLowerCase();
            return word.nsfw || jp === 'nsfw' || en === 'nsfw';
        });
    };

    const openSaveModal = (type: 'positive' | 'negative') => {
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        setFavoriteNsfw(inferFavoriteNsfw(source));
        setSaveType(type);
        setSaveAsQuality(false);
    };

    const handleCopy = (text: string, type: 'pos' | 'neg') => {
        navigator.clipboard.writeText(text);
        setCopyFeedback(type);
        setTimeout(() => setCopyFeedback(null), 2000);
    };

    const handleSaveFavorite = (type: 'positive' | 'negative') => {
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        const combinedLabels = source.map(word => word.label_jp).filter(Boolean);
        const name = favoriteName.trim() || combinedLabels.join(' / ') || 'Favorite';
        if (saveAsQuality) {
            addQualityTemplate(name, type, source, favoriteNsfw);
        } else {
            addPromptFavorite(name, type, source, favoriteNsfw);
        }
        setFavoriteName('');
        setFavoriteNsfw(false);
        setSaveAsQuality(false);
        setSaveType(null);
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent, type: 'positive' | 'negative') => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        const activeId = String(active.id).replace(`${type}:`, '');
        const overId = String(over.id).replace(`${type}:`, '');
        const oldIndex = source.findIndex(word => word.id === activeId);
        const newIndex = source.findIndex(word => word.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;
        reorderSelected(type, arrayMove(source, oldIndex, newIndex));
    };

    return (
        <div className="h-full flex flex-col p-4 gap-3">
            <div className="flex flex-1 gap-4">
            {/* Positive Section */}
            <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Positive Prompt</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openSaveModal('positive')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> Add
                        </button>
                        <button
                            onClick={() => setQualityType('positive')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <Bars3Icon className="w-4 h-4" /> Quality
                            {getQualityName('positive') && (
                                <span className="text-[10px] text-cyan-200">{getQualityName('positive')}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setLoadType('positive')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> Load
                        </button>
                        <button
                            onClick={clearPositive}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <XMarkIcon className="w-4 h-4" /> Clear
                        </button>
                        <button
                            onClick={() => handleCopy(buildCopyText('positive', posString), 'pos')}
                            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                        >
                            {copyFeedback === 'pos' ? <span className="text-green-300">Copied!</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> Copy
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Visual Chips Area */}
                <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-3 overflow-y-auto mb-2 custom-scrollbar">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, 'positive')}
                    >
                        <SortableContext
                            items={selectedPositive.map(word => `positive:${word.id}`)}
                            strategy={rectSortingStrategy}
                        >
                            <div className="flex flex-wrap gap-2">
                                {selectedPositive.length === 0 && <span className="text-slate-600 text-sm italic">Select words...</span>}
                                {selectedPositive.map(word => (
                                    <SortableChip key={word.id} word={word} type="positive" />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Raw Text Output (Read Only) */}
                <div className="h-16 relative">
                    <textarea
                        readOnly
                        value={posString}
                        className="w-full h-full bg-black/40 border border-slate-800 rounded-lg p-2 text-xs font-mono text-cyan-100/70 focus:outline-none resize-none"
                    />
                </div>
            </div>

            {/* Negative Section */}
            <div className="flex-1 flex flex-col gap-2 border-l border-slate-800 pl-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider">Negative Prompt</h3>
                        <span className="text-[10px] text-slate-500">(右クリック / Shift+クリックで登録)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openSaveModal('negative')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> Add
                        </button>
                        <button
                            onClick={() => setQualityType('negative')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <Bars3Icon className="w-4 h-4" /> Quality
                            {getQualityName('negative') && (
                                <span className="text-[10px] text-rose-200">{getQualityName('negative')}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setLoadType('negative')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> Load
                        </button>
                        <button
                            onClick={clearNegative}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <XMarkIcon className="w-4 h-4" /> Clear
                        </button>
                        <button
                            onClick={() => handleCopy(buildCopyText('negative', negString), 'neg')}
                            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors"
                        >
                            {copyFeedback === 'neg' ? <span className="text-green-300">Copied!</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> Copy
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Visual Chips Area */}
                <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-3 overflow-y-auto mb-2 custom-scrollbar">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, 'negative')}
                    >
                        <SortableContext
                            items={selectedNegative.map(word => `negative:${word.id}`)}
                            strategy={rectSortingStrategy}
                        >
                            <div className="flex flex-wrap gap-2">
                                {selectedNegative.length === 0 && <span className="text-slate-600 text-sm italic">Select words...</span>}
                                {selectedNegative.map(word => (
                                    <SortableChip key={word.id} word={word} type="negative" />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Raw Text Output */}
                <div className="h-16 relative">
                    <textarea
                        readOnly
                        value={negString}
                        className="w-full h-full bg-black/40 border border-slate-800 rounded-lg p-2 text-xs font-mono text-rose-100/70 focus:outline-none resize-none"
                    />
                </div>
            </div>
            </div>

            {saveType && (
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">Save Favorite</h3>
                        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Favorite Name</label>
                                <input
                                    type="text"
                                    value={favoriteName}
                                    onChange={(e) => setFavoriteName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="(未入力の場合は自動生成)"
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={favoriteNsfw}
                                    onChange={(e) => setFavoriteNsfw(e.target.checked)}
                                    className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                                />
                                <span className="text-sm text-slate-300">NSFWを含む</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={saveAsQuality}
                                    onChange={(e) => setSaveAsQuality(e.target.checked)}
                                    className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                />
                                <span className="text-sm text-slate-300">品質テンプレートとして保存</span>
                            </label>
                            <div className="text-xs text-slate-500">
                                {(saveType === 'positive' ? selectedPositive.length : selectedNegative.length) === 0
                                    ? '現在のプロンプトは空です。'
                                    : `選択語数: ${saveType === 'positive' ? selectedPositive.length : selectedNegative.length}`}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFavoriteName('');
                                        setFavoriteNsfw(false);
                                        setSaveAsQuality(false);
                                        setSaveType(null);
                                    }}
                                    className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaveFavorite(saveType)}
                                    className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {loadType && (
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">Load Favorite</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredFavorites.filter(fav => fav.type === loadType).length === 0 && (
                                <div className="text-sm text-slate-500">No favorites available.</div>
                            )}
                            {filteredFavorites.filter(fav => fav.type === loadType).map((fav: PromptFavorite) => {
                                const jpLabels = fav.words.map(word => word.label_jp).filter(Boolean).join(', ');
                                const prompt = formatPrompt(fav.words);
                                return (
                                    <div
                                        key={fav.id}
                                        className="border border-slate-800 rounded-xl p-3 hover:border-cyan-500/40 hover:bg-slate-900 transition-all flex items-start justify-between gap-3"
                                    >
                                        <button
                                            onClick={() => {
                                                applyPromptFavorite(fav);
                                                setLoadType(null);
                                            }}
                                            className="text-left flex-1"
                                        >
                                            <div className="text-sm font-bold text-slate-200">{fav.name}</div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {jpLabels || 'No labels'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {loadType === 'positive' ? <span className="text-cyan-400">P:</span> : <span className="text-rose-400">N:</span>} {prompt || '-'}
                                            </div>
                                            {fav.nsfw && (
                                                <div className="text-[10px] text-red-400 mt-1">NSFW</div>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removePromptFavorite(fav.id)}
                                            className="text-slate-500 hover:text-rose-400"
                                            title="Delete"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                type="button"
                                onClick={() => setLoadType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {qualityType && (
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">Quality Template</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredQualityTemplates.filter(template => template.type === qualityType).length === 0 && (
                                <div className="text-sm text-slate-500">No quality templates available.</div>
                            )}
                            {filteredQualityTemplates.filter(template => template.type === qualityType).map((template: PromptFavorite) => {
                                const jpLabels = template.words.map(word => word.label_jp).filter(Boolean).join(', ');
                                const prompt = formatPrompt(template.words);
                                const isSelected = selectedQualityTemplateIds[qualityType] === template.id;
                                return (
                                    <div
                                        key={template.id}
                                        className={`border rounded-xl p-3 transition-all flex items-start justify-between gap-3 ${isSelected
                                            ? 'border-cyan-500/60 bg-cyan-950/20'
                                            : 'border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900'
                                            }`}
                                    >
                                        <button
                                            onClick={() => {
                                                selectQualityTemplate(qualityType, template.id);
                                                setQualityType(null);
                                            }}
                                            className="text-left flex-1"
                                        >
                                            <div className="text-sm font-bold text-slate-200">{template.name}</div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {jpLabels || 'No labels'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {qualityType === 'positive' ? <span className="text-cyan-400">P:</span> : <span className="text-rose-400">N:</span>} {prompt || '-'}
                                            </div>
                                            {template.nsfw && (
                                                <div className="text-[10px] text-red-400 mt-1">NSFW</div>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeQualityTemplate(template.id)}
                                            className="text-slate-500 hover:text-rose-400"
                                            title="Delete"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!qualityType) return;
                                    selectQualityTemplate(qualityType, null);
                                    setQualityType(null);
                                }}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Clear Selection
                            </button>
                            <button
                                type="button"
                                onClick={() => setQualityType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptOutput;




