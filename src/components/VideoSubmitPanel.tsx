import React, { useEffect, useMemo, useState } from 'react';
import {
  BookmarkCheck,
  Bot,
  CheckSquare,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Link2,
  Loader2,
  Monitor,
  Square,
  Upload,
  X,
} from 'lucide-react';
import type {
  FeatureModuleConfig,
  ParsedBookmarkEntry,
  VideoCollection,
} from '../types/video';
import type { ClientUsageQuota } from '../lib/apiClient';
import {
  DEFAULT_FEATURE_MODULES,
  getFeatureModule,
  isFeatureModuleEnabled,
  parseNetscapeBookmarksHtml,
} from '../lib/featureStore';
import { generateSafeId, SAVE_REASON_PRESETS } from '../lib/videoUtils';

export type SubmitPanelMode =
  | 'link'
  | 'screenshot'
  | 'file'
  | 'text-pdf'
  | 'llm-chat'
  | 'bookmarks';

interface VideoSubmitPanelProps {
  isOpen: boolean;
  onClose: () => void;
  collections: VideoCollection[];
  featureModules?: FeatureModuleConfig[];
  initialUrl?: string;
  initialTitle?: string;
  initialMode?: SubmitPanelMode;
  initialFile?: File | null;
  isIncomingShare?: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  usageQuota?: ClientUsageQuota | null;
  onSubmitUrl: (params: {
    rawInput: string;
    title?: string;
    customFocus?: string;
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
    modeHint?: 'auto' | 'video' | 'link' | 'ai-chat' | 'document';
  }) => Promise<void>;
  onSubmitFile: (params: {
    file: File;
    title?: string;
    customFocus?: string;
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
  }) => Promise<void>;
  onSubmitText: (params: {
    content: string;
    fileName?: string;
    sourceKind: 'text' | 'llm-chat';
    llmProvider?: string;
    title?: string;
    customFocus?: string;
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
  }) => Promise<void>;
  onSubmitBookmarks: (params: {
    entries: ParsedBookmarkEntry[];
    saveReason?: string;
    notes?: string;
    customTags?: string[];
    collectionId?: string;
  }) => Promise<void>;
}

const FILE_INPUT_CLASSES =
  'w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-200 dark:file:border-slate-700 file:text-xs file:font-medium file:bg-slate-50 dark:file:bg-slate-800 file:text-slate-800 dark:file:text-slate-100 hover:file:bg-slate-100 hover:file:text-slate-900 dark:hover:file:bg-white dark:hover:file:text-slate-900 file:cursor-pointer file:transition-colors';

export const VideoSubmitPanel: React.FC<VideoSubmitPanelProps> = ({
  isOpen,
  onClose,
  collections,
  featureModules = DEFAULT_FEATURE_MODULES,
  initialUrl = '',
  initialTitle = '',
  initialMode = 'link',
  initialFile = null,
  isIncomingShare = false,
  isSubmitting,
  errorMessage,
  usageQuota = null,
  onSubmitUrl,
  onSubmitFile,
  onSubmitText,
  onSubmitBookmarks,
}) => {
  const textPdfEnabled = isFeatureModuleEnabled(featureModules, 'text-pdf');
  const llmChatEnabled = isFeatureModuleEnabled(featureModules, 'llm-chat');
  const bookmarksEnabled = isFeatureModuleEnabled(featureModules, 'bookmark-share');
  const textPdfModule = getFeatureModule(featureModules, 'text-pdf');
  const maxPdfMb = textPdfModule?.maxSizeMb || 15;

  const [mode, setMode] = useState<SubmitPanelMode>(initialMode);
  const [rawInput, setRawInput] = useState(initialUrl);
  const [urlTypeHint, setUrlTypeHint] = useState<'auto' | 'video' | 'link'>('auto');
  const [customTitle, setCustomTitle] = useState(initialTitle);
  const [saveReason, setSaveReason] = useState('');
  const [userNote, setUserNote] = useState('');
  const [customTagsInput, setCustomTagsInput] = useState('');
  const [customFocus, setCustomFocus] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);

  // Text & PDF state
  const [textContent, setTextContent] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  // LLM Chat Share state
  const [llmShareMethod, setLlmShareMethod] = useState<'url' | 'paste'>('url');
  const [llmProvider, setLlmProvider] = useState('auto');
  const [llmChatUrl, setLlmChatUrl] = useState('');
  const [llmChatContent, setLlmChatContent] = useState('');
  const [llmFileName, setLlmFileName] = useState('');

  // Bookmarks state
  const [parsedBookmarks, setParsedBookmarks] = useState<ParsedBookmarkEntry[]>([]);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(() => new Set());
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [bookmarkPasteText, setBookmarkPasteText] = useState('');

  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      let resolvedMode = initialMode;
      if (resolvedMode === 'text-pdf' && !textPdfEnabled) resolvedMode = 'link';
      if (resolvedMode === 'llm-chat' && !llmChatEnabled) resolvedMode = 'link';
      if (resolvedMode === 'bookmarks' && !bookmarksEnabled) resolvedMode = 'link';
      setMode(resolvedMode);
      if (initialUrl) setRawInput(initialUrl);
      if (initialTitle) setCustomTitle(initialTitle);
      if (initialFile) {
        setSelectedFile(initialFile);
        if (initialFile.type.startsWith('image/')) {
          setMode('screenshot');
        }
      }
      setLocalError(null);
    } else {
      setSaveReason('');
      setUserNote('');
      setCustomTagsInput('');
      setCustomFocus('');
      setSelectedFile(null);
      setDocFile(null);
      setTextContent('');
      setLlmChatUrl('');
      setLlmChatContent('');
      setLlmFileName('');
      setParsedBookmarks([]);
      setSelectedBookmarkIds(new Set());
      setBookmarkPasteText('');
      setBookmarkSearch('');
    }
  }, [
    isOpen,
    initialUrl,
    initialTitle,
    initialMode,
    initialFile,
    textPdfEnabled,
    llmChatEnabled,
    bookmarksEnabled,
  ]);

  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      const objUrl = URL.createObjectURL(selectedFile);
      setImagePreviewUrl(objUrl);
      return () => URL.revokeObjectURL(objUrl);
    }
    setImagePreviewUrl('');
    return undefined;
  }, [selectedFile]);

  // Support Ctrl+V / Cmd+V screenshot paste while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = item.type.split('/')[1] || 'png';
            const pastedFile = new File([blob], `screenshot_${Date.now()}.${ext}`, {
              type: item.type,
            });
            setSelectedFile(pastedFile);
            setMode('screenshot');
            setLocalError(null);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarkSearch.trim().toLowerCase();
    if (!q) return parsedBookmarks;
    return parsedBookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.folder.toLowerCase().includes(q)
    );
  }, [parsedBookmarks, bookmarkSearch]);

  if (!isOpen) return null;

  const parseCustomTags = (): string[] => {
    const raw = customTagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(raw)).slice(0, 10);
  };

  const handleCaptureScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setLocalError('Screen capture is not supported in this browser. You can paste a screenshot with Ctrl+V.');
      return;
    }
    setLocalError(null);
    setIsCapturingScreen(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false,
      });
      const videoEl = document.createElement('video');
      videoEl.srcObject = stream;
      videoEl.muted = true;
      await videoEl.play();
      await new Promise((r) => setTimeout(r, 150));

      const width = videoEl.videoWidth || 1280;
      const height = videoEl.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to capture screenshot frame.');
      ctx.drawImage(videoEl, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) throw new Error('Unable to encode captured screenshot.');

      const capturedFile = new File([blob], `screen_capture_${Date.now()}.png`, {
        type: 'image/png',
      });
      setSelectedFile(capturedFile);
      setMode('screenshot');
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setLocalError('Screen capture was cancelled. You can also paste any screenshot with Ctrl+V.');
      } else {
        setLocalError(err instanceof Error ? err.message : 'Unable to capture screen.');
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setIsCapturingScreen(false);
    }
  };

  const handleDocFileChange = async (file: File | null) => {
    setLocalError(null);
    setDocFile(file);
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      if (file.size > maxPdfMb * 1024 * 1024) {
        setLocalError(`PDF exceeds ${maxPdfMb} MB limit.`);
      }
      return;
    }
    try {
      const txt = await file.text();
      setTextContent(txt.slice(0, 120000));
    } catch {
      setLocalError('Unable to read selected text file.');
    }
  };

  const handleLlmFileChange = async (file: File | null) => {
    setLocalError(null);
    if (!file) return;
    try {
      const txt = await file.text();
      setLlmChatContent(txt.slice(0, 120000));
      setLlmFileName(file.name);
      setLlmShareMethod('paste');
    } catch {
      setLocalError('Unable to read selected chat export file.');
    }
  };

  const handleBookmarkHtmlUpload = async (file: File | null) => {
    setLocalError(null);
    if (!file) return;
    try {
      const html = await file.text();
      const entries = parseNetscapeBookmarksHtml(html);
      if (entries.length === 0) {
        setLocalError('No valid http/https bookmarks were found in that HTML file.');
        return;
      }
      setParsedBookmarks(entries);
      setSelectedBookmarkIds(new Set(entries.slice(0, 25).map((e) => e.id)));
    } catch {
      setLocalError('Unable to parse browser bookmark file.');
    }
  };

  const handleParsePastedBookmarks = () => {
    setLocalError(null);
    const lines = bookmarkPasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const entries: ParsedBookmarkEntry[] = [];
    for (const line of lines) {
      const match = line.match(/https?:\/\/[^\s<>"'`]+/i);
      if (!match) continue;
      const url = match[0].replace(/[),.;!?]+$/, '');
      const titleCandidate = line.replace(match[0], '').replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, '');
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        // ignore
      }
      entries.push({
        id: generateSafeId('bmk'),
        title: titleCandidate || host,
        url,
        folder: 'Pasted Bookmarks',
      });
    }
    if (entries.length === 0) {
      setLocalError('Paste one or more lines containing valid http:// or https:// bookmark URLs.');
      return;
    }
    setParsedBookmarks(entries);
    setSelectedBookmarkIds(new Set(entries.map((e) => e.id)));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const parsedTags = parseCustomTags();

    if (mode === 'link') {
      if (!rawInput.trim()) {
        setLocalError(
          'Paste a video link (YouTube, TikTok, Instagram, Facebook) or a web/product/service URL.'
        );
        return;
      }
      await onSubmitUrl({
        rawInput: rawInput.trim(),
        title: customTitle.trim() || undefined,
        customFocus: customFocus.trim() || undefined,
        saveReason: saveReason.trim() || undefined,
        notes: userNote.trim() || undefined,
        customTags: parsedTags.length > 0 ? parsedTags : undefined,
        collectionId: collectionId || undefined,
        modeHint: urlTypeHint,
      });
      return;
    }

    if (mode === 'screenshot') {
      if (!selectedFile || !selectedFile.type.startsWith('image/')) {
        setLocalError('Select, capture, or paste (Ctrl+V) a screenshot image (PNG, JPG, WebP).');
        return;
      }
      if (selectedFile.size > 15 * 1024 * 1024) {
        setLocalError('Screenshot exceeds 15 MB limit.');
        return;
      }
      await onSubmitFile({
        file: selectedFile,
        title: customTitle.trim() || undefined,
        customFocus: customFocus.trim() || undefined,
        saveReason: saveReason.trim() || undefined,
        notes: userNote.trim() || undefined,
        customTags: parsedTags.length > 0 ? parsedTags : undefined,
        collectionId: collectionId || undefined,
      });
      return;
    }

    if (mode === 'file') {
      if (!selectedFile) {
        setLocalError('Choose a video or audio clip (max 25 MB).');
        return;
      }
      if (selectedFile.size > 25 * 1024 * 1024) {
        setLocalError('Clip size exceeds 25 MB limit. Please select a shorter clip.');
        return;
      }
      await onSubmitFile({
        file: selectedFile,
        title: customTitle.trim() || undefined,
        customFocus: customFocus.trim() || undefined,
        saveReason: saveReason.trim() || undefined,
        notes: userNote.trim() || undefined,
        customTags: parsedTags.length > 0 ? parsedTags : undefined,
        collectionId: collectionId || undefined,
      });
      return;
    }

    if (mode === 'text-pdf') {
      const isPdfFile =
        docFile &&
        (docFile.type === 'application/pdf' || docFile.name.toLowerCase().endsWith('.pdf'));
      if (isPdfFile && docFile) {
        if (docFile.size > maxPdfMb * 1024 * 1024) {
          setLocalError(`PDF exceeds ${maxPdfMb} MB limit.`);
          return;
        }
        await onSubmitFile({
          file: docFile,
          title: customTitle.trim() || undefined,
          customFocus: customFocus.trim() || undefined,
          saveReason: saveReason.trim() || undefined,
          notes: userNote.trim() || undefined,
          customTags: parsedTags.length > 0 ? parsedTags : undefined,
          collectionId: collectionId || undefined,
        });
        return;
      }
      if (!textContent.trim()) {
        setLocalError('Paste text or choose a .pdf, .txt, .md, .csv, or .json file.');
        return;
      }
      await onSubmitText({
        content: textContent.trim(),
        fileName: docFile?.name || customTitle.trim() || 'Text Note',
        sourceKind: 'text',
        title: customTitle.trim() || undefined,
        customFocus: customFocus.trim() || undefined,
        saveReason: saveReason.trim() || undefined,
        notes: userNote.trim() || undefined,
        customTags: parsedTags.length > 0 ? parsedTags : undefined,
        collectionId: collectionId || undefined,
      });
      return;
    }

    if (mode === 'llm-chat') {
      if (llmShareMethod === 'url') {
        if (!llmChatUrl.trim()) {
          setLocalError('Paste a Gemini, ChatGPT, Claude, Perplexity, or Grok share URL.');
          return;
        }
        await onSubmitUrl({
          rawInput: llmChatUrl.trim(),
          title: customTitle.trim() || undefined,
          customFocus: customFocus.trim() || undefined,
          saveReason: saveReason.trim() || undefined,
          notes: userNote.trim() || undefined,
          customTags: parsedTags.length > 0 ? parsedTags : undefined,
          collectionId: collectionId || undefined,
          modeHint: 'ai-chat',
        });
        return;
      }
      if (!llmChatContent.trim()) {
        setLocalError('Paste copied AI chat messages or upload a chat JSON/Markdown export.');
        return;
      }
      await onSubmitText({
        content: llmChatContent.trim(),
        fileName: llmFileName || customTitle.trim() || 'AI Chat Transcript',
        sourceKind: 'llm-chat',
        llmProvider: llmProvider === 'auto' ? undefined : llmProvider,
        title: customTitle.trim() || undefined,
        customFocus: customFocus.trim() || undefined,
        saveReason: saveReason.trim() || undefined,
        notes: userNote.trim() || undefined,
        customTags: parsedTags.length > 0 ? parsedTags : undefined,
        collectionId: collectionId || undefined,
      });
      return;
    }

    if (mode === 'bookmarks') {
      const chosen = parsedBookmarks.filter((b) => selectedBookmarkIds.has(b.id));
      if (chosen.length === 0) {
        setLocalError('Upload a browser bookmarks HTML file (or parse URLs) and select at least 1 bookmark.');
        return;
      }
      await onSubmitBookmarks({
        entries: chosen.slice(0, 50),
        saveReason: saveReason.trim() || undefined,
        notes: userNote.trim() || undefined,
        customTags: parsedTags.length > 0 ? parsedTags : undefined,
        collectionId: collectionId || undefined,
      });
    }
  };

  const displayError = localError || errorMessage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {isIncomingShare && mode === 'screenshot'
                ? 'Screenshot Detected — Save, Tag & Group'
                : isIncomingShare
                  ? 'Save Shared Item & Why You Saved It'
                  : 'Add to Universal Share Inbox'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Videos, screenshots, web links{textPdfEnabled ? ', text & PDFs' : ''}
              {llmChatEnabled ? ', AI chats' : ''}
              {bookmarksEnabled ? ', and browser bookmarks' : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleFormSubmit(e)} className="p-6 space-y-4 overflow-y-auto">
          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => setMode('link')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'link'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Video / Web Link
            </button>
            <button
              type="button"
              onClick={() => setMode('screenshot')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'screenshot'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Screenshot
            </button>
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'file'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Local Video
            </button>
            {textPdfEnabled && (
              <button
                type="button"
                onClick={() => setMode('text-pdf')}
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'text-pdf'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Text / PDF
              </button>
            )}
            {llmChatEnabled && (
              <button
                type="button"
                onClick={() => setMode('llm-chat')}
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'llm-chat'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                AI Chat Share
              </button>
            )}
            {bookmarksEnabled && (
              <button
                type="button"
                onClick={() => setMode('bookmarks')}
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'bookmarks'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                Bookmarks
              </button>
            )}
          </div>

          {mode === 'link' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="video-url-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Shared URL (Video, Product, Service, or Article)
                </label>
                <select
                  aria-label="Link type hint"
                  value={urlTypeHint}
                  onChange={(e) => setUrlTypeHint(e.target.value as 'auto' | 'video' | 'link')}
                  disabled={isSubmitting}
                  className="px-2 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                >
                  <option value="auto">Auto-detect type</option>
                  <option value="video">Video link</option>
                  <option value="link">Web / Product link</option>
                </select>
              </div>
              <textarea
                id="video-url-input"
                rows={2}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="Paste a YouTube, TikTok, Instagram, Facebook video link, or any website/product URL..."
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              />
            </div>
          )}

          {mode === 'screenshot' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="screenshot-file-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Upload, Capture, or Paste Screenshot (<kbd className="px-1 py-0.5 text-[10px] border border-slate-300 dark:border-slate-700 rounded">Ctrl+V</kbd>)
                </label>
                <button
                  type="button"
                  onClick={() => void handleCaptureScreen()}
                  disabled={isSubmitting || isCapturingScreen}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
                >
                  {isCapturingScreen ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Monitor className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  Capture Screen / Window
                </button>
              </div>
              <input
                id="screenshot-file-input"
                type="file"
                accept="image/*"
                disabled={isSubmitting}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className={FILE_INPUT_CLASSES}
              />
              {imagePreviewUrl && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
                  <img
                    src={imagePreviewUrl}
                    alt="Screenshot preview"
                    className="max-h-44 mx-auto rounded object-contain"
                  />
                </div>
              )}
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                Image stays on this device&apos;s local storage; only extracted text, links, and tags sync to cloud.
              </p>
            </div>
          )}

          {mode === 'file' && (
            <div className="space-y-2">
              <label
                htmlFor="video-file-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Video or Audio File (MP4, WebM, MOV, MP3 — up to 25 MB)
              </label>
              <input
                id="video-file-input"
                type="file"
                accept="video/mp4,video/webm,video/quicktime,audio/*"
                disabled={isSubmitting}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className={FILE_INPUT_CLASSES}
              />
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                Video file is saved locally on your device — never uploaded into the database (only reference link &amp; AI index are stored).
              </p>
            </div>
          )}

          {mode === 'text-pdf' && textPdfEnabled && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="doc-file-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Choose PDF or Text File (.pdf, .txt, .md, .csv, .json — PDF up to {maxPdfMb} MB)
                </label>
                <input
                  id="doc-file-input"
                  type="file"
                  accept=".pdf,application/pdf,.txt,.md,.markdown,.csv,.json,text/plain,text/markdown,application/json"
                  disabled={isSubmitting}
                  onChange={(e) => void handleDocFileChange(e.target.files?.[0] || null)}
                  className={FILE_INPUT_CLASSES}
                />
                {docFile && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Selected file: <strong>{docFile.name}</strong> ({(docFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {(!docFile || !(docFile.type === 'application/pdf' || docFile.name.toLowerCase().endsWith('.pdf'))) && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="text-paste-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Or Paste Text / Notes / Markdown Directly
                  </label>
                  <textarea
                    id="text-paste-input"
                    rows={5}
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Paste article text, meeting notes, code snippets, SOPs, or exported text..."
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>
              )}
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                {textPdfModule?.helperNote ||
                  'Uploaded PDFs stay cached locally on your device while structured summaries, sections, and links sync.'}
              </p>
            </div>
          )}

          {mode === 'llm-chat' && llmChatEnabled && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setLlmShareMethod('url')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      llmShareMethod === 'url'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Shared Chat URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setLlmShareMethod('paste')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      llmShareMethod === 'paste'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Paste / Upload Export
                  </button>
                </div>

                <select
                  aria-label="AI assistant platform"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
                >
                  <option value="auto">Auto-detect AI (Gemini / ChatGPT / Claude)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="chatgpt">ChatGPT (OpenAI)</option>
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="llm">Perplexity / Grok / Other</option>
                </select>
              </div>

              {llmShareMethod === 'url' ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="llm-chat-url"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Public AI Conversation Share Link
                  </label>
                  <input
                    id="llm-chat-url"
                    type="url"
                    value={llmChatUrl}
                    onChange={(e) => setLlmChatUrl(e.target.value)}
                    placeholder="https://chatgpt.com/share/... or https://gemini.google.com/share/... or https://claude.ai/share/..."
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Supports Gemini, ChatGPT, Claude, Perplexity, Grok, and Poe shared links. If a private link blocks scraping, switch to &ldquo;Paste / Upload Export&rdquo;.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="llm-file-input"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Upload ChatGPT conversations.json / Markdown / TXT (optional)
                    </label>
                    <input
                      id="llm-file-input"
                      type="file"
                      accept=".json,.md,.txt,application/json,text/plain,text/markdown"
                      disabled={isSubmitting}
                      onChange={(e) => void handleLlmFileChange(e.target.files?.[0] || null)}
                      className={FILE_INPUT_CLASSES}
                    />
                  </div>
                  <textarea
                    rows={5}
                    value={llmChatContent}
                    onChange={(e) => setLlmChatContent(e.target.value)}
                    placeholder="Paste your Gemini, ChatGPT, or Claude conversation history here..."
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>
              )}
            </div>
          )}

          {mode === 'bookmarks' && bookmarksEnabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="bookmarks-file-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Upload Browser Bookmarks HTML (Chrome / Edge / Firefox / Safari)
                  </label>
                  <input
                    id="bookmarks-file-input"
                    type="file"
                    accept=".html,.htm,text/html"
                    disabled={isSubmitting}
                    onChange={(e) => void handleBookmarkHtmlUpload(e.target.files?.[0] || null)}
                    className={FILE_INPUT_CLASSES}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Or Paste Bookmark URLs (one per line)
                  </label>
                  <div className="flex gap-1.5">
                    <textarea
                      rows={2}
                      value={bookmarkPasteText}
                      onChange={(e) => setBookmarkPasteText(e.target.value)}
                      placeholder="https://example.com Product Name"
                      disabled={isSubmitting}
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleParsePastedBookmarks}
                      disabled={isSubmitting || !bookmarkPasteText.trim()}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0"
                    >
                      Parse
                    </button>
                  </div>
                </div>
              </div>

              {parsedBookmarks.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                      {selectedBookmarkIds.size} of {parsedBookmarks.length} selected (max 50 per import)
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="search"
                        value={bookmarkSearch}
                        onChange={(e) => setBookmarkSearch(e.target.value)}
                        placeholder="Filter folder or title..."
                        className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedBookmarkIds(new Set(filteredBookmarks.slice(0, 50).map((b) => b.id)))
                        }
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                      >
                        Select visible
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBookmarkIds(new Set())}
                        className="text-xs text-slate-500 hover:underline whitespace-nowrap"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredBookmarks.map((b) => {
                      const checked = selectedBookmarkIds.has(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setSelectedBookmarkIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(b.id)) {
                                next.delete(b.id);
                              } else if (next.size < 50) {
                                next.add(b.id);
                              }
                              return next;
                            });
                          }}
                          className="w-full px-3.5 py-2 flex items-start gap-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {b.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {b.folder} · {b.url}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick "Why I saved this" Tag + Note */}
          <div className="p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Why I saved this (Quick Tag)
                </label>
                {saveReason && (
                  <button
                    type="button"
                    onClick={() => setSaveReason('')}
                    className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SAVE_REASON_PRESETS.map((preset) => {
                  const active = saveReason === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setSaveReason(active ? '' : preset)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-600 text-white font-medium'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="why-saved-note"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Why I&apos;m sharing / saving this note (optional)
              </label>
              <input
                id="why-saved-note"
                type="text"
                maxLength={500}
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="e.g. Research reference, invoice PDF, or prompt to reuse later..."
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {mode !== 'bookmarks' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="video-title-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Title Override (optional)
                </label>
                <input
                  id="video-title-input"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Auto-detected from content"
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>
            )}

            <div className={`space-y-1.5 ${mode === 'bookmarks' ? 'sm:col-span-2' : ''}`}>
              <label
                htmlFor="video-collection-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Save to Group / Collection
              </label>
              <select
                id="video-collection-select"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              >
                <option value="">All Items (Unassigned)</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="custom-tags-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Custom Tags (comma-separated, optional)
              </label>
              <input
                id="custom-tags-input"
                type="text"
                value={customTagsInput}
                onChange={(e) => setCustomTagsInput(e.target.value)}
                placeholder="e.g. receipt, pdf, prompt, bookmark"
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              />
            </div>

            {mode !== 'bookmarks' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="video-focus-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  AI Extraction Focus (optional)
                </label>
                <input
                  id="video-focus-input"
                  type="text"
                  value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                  placeholder="e.g. Extract action items, key clauses, links"
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>
            )}
          </div>

          {displayError && (
            <div className="px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {displayError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {usageQuota ? (
                usageQuota.authenticated ? (
                  <span>
                    Daily allowance:{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {usageQuota.analyze.remainingToday}/{usageQuota.analyze.limitToday}
                    </strong>{' '}
                    left today ({usageQuota.analyze.rpmLimit}/min max)
                  </span>
                ) : (
                  <span>
                    Guest limit:{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {usageQuota.analyze.remainingToday}/{usageQuota.analyze.limitToday}
                    </strong>{' '}
                    today · Sign in for higher daily allowance
                  </span>
                )
              ) : (
                <span>Protected by free-tier rate limits</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {mode === 'bookmarks' ? 'Importing...' : 'Analyzing & Indexing...'}
                  </>
                ) : mode === 'bookmarks' ? (
                  `Import Selected (${selectedBookmarkIds.size})`
                ) : (
                  'Analyze & Save'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
