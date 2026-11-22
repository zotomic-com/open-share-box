import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  HardDrive,
  Link2,
  ListVideo,
  Loader2,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AnalyzedVideo,
  ExtractedLink,
  VideoChatMessage,
  VideoCollection,
} from '../types/video';
import {
  extractVimeoId,
  extractYouTubeId,
  formatChaptersExport,
  formatMarkdownExport,
  formatRelativeDate,
  getItemType,
  PLATFORM_LABELS,
  SAVE_REASON_PRESETS,
} from '../lib/videoUtils';
import { getLocalMedia, saveLocalMedia } from '../lib/localMediaStore';
import { authorizedFetch } from '../lib/apiClient';
import { sanitizeHttpUrl } from '../lib/pageDefaults';
import { VideoThumbnail } from './VideoThumbnail';

interface VideoInspectorProps {
  video: AnalyzedVideo;
  collections: VideoCollection[];
  initialSeekSeconds?: number | null;
  uploadedPreviewUrl?: string;
  onBack: () => void;
  onToggleFavorite: (video: AnalyzedVideo) => void;
  onChangeCollection: (videoId: string, collectionId: string) => void;
  onUpdateTags: (videoId: string, tags: string[]) => void;
  onUpdateNotes: (videoId: string, notes: string, saveReason?: string) => void;
  onUpdateLinks: (videoId: string, links: ExtractedLink[]) => void;
  onDeleteVideo: (videoId: string) => void;
  onSelectTagFilter: (tag: string) => void;
}

const LINK_KIND_LABELS: Record<NonNullable<ExtractedLink['kind']>, string> = {
  product: 'Product',
  service: 'Service',
  resource: 'Resource',
  social: 'Social',
  other: 'Link',
};

export const VideoInspector: React.FC<VideoInspectorProps> = ({
  video,
  collections,
  initialSeekSeconds,
  uploadedPreviewUrl,
  onBack,
  onToggleFavorite,
  onChangeCollection,
  onUpdateTags,
  onUpdateNotes,
  onUpdateLinks,
  onDeleteVideo,
  onSelectTagFilter,
}) => {
  const resolvedType = getItemType(video);
  const [activeTab, setActiveTab] = useState<'segments' | 'summary' | 'transcript' | 'links' | 'ask'>(
    resolvedType === 'screenshot' && (video.links?.length || 0) > 0 ? 'links' : 'segments'
  );
  const [activeSeconds, setActiveSeconds] = useState<number>(initialSeekSeconds ?? 0);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [saveReasonDraft, setSaveReasonDraft] = useState(video.saveReason || '');
  const [notesDraft, setNotesDraft] = useState(video.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [copiedType, setCopiedType] = useState<'md' | 'chapters' | string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkKind, setNewLinkKind] = useState<NonNullable<ExtractedLink['kind']>>('product');
  const [linkError, setLinkError] = useState<string | null>(null);

  const [localDeviceUrl, setLocalDeviceUrl] = useState<string>(uploadedPreviewUrl || '');
  const [localMediaMissing, setLocalMediaMissing] = useState(false);

  const [chatHistory, setChatHistory] = useState<VideoChatMessage[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);

  const youtubeId = video.platform === 'youtube' ? extractYouTubeId(video.url) : null;
  const vimeoId = video.platform === 'vimeo' ? extractVimeoId(video.url) : null;
  const isLocalMediaItem = Boolean(
    video.localMediaId ||
      video.platform === 'upload' ||
      video.platform === 'screenshot' ||
      video.platform === 'pdf' ||
      video.url.startsWith('local://') ||
      video.url.startsWith('upload://')
  );

  useEffect(() => {
    setNotesDraft(video.notes || '');
    setSaveReasonDraft(video.saveReason || '');
    setConfirmDelete(false);
    setChatHistory([]);
    setAskError(null);
    setLinkError(null);
  }, [video.id, video.notes, video.saveReason]);

  // Load media blob from user's local device IndexedDB when inspecting local video/screenshot
  useEffect(() => {
    let createdObjUrl = '';
    let active = true;

    if (uploadedPreviewUrl) {
      setLocalDeviceUrl(uploadedPreviewUrl);
      setLocalMediaMissing(false);
      return;
    }

    const mediaKey = video.localMediaId || video.id;
    if (!isLocalMediaItem || !mediaKey) {
      setLocalDeviceUrl('');
      setLocalMediaMissing(false);
      return;
    }

    void getLocalMedia(mediaKey).then((record) => {
      if (!active) return;
      if (record?.blob) {
        createdObjUrl = URL.createObjectURL(record.blob);
        setLocalDeviceUrl(createdObjUrl);
        setLocalMediaMissing(false);
      } else {
        setLocalDeviceUrl('');
        setLocalMediaMissing(true);
      }
    });

    return () => {
      active = false;
      if (createdObjUrl) {
        URL.revokeObjectURL(createdObjUrl);
      }
    };
  }, [video.id, video.localMediaId, uploadedPreviewUrl, isLocalMediaItem]);

  useEffect(() => {
    if (typeof initialSeekSeconds === 'number' && initialSeekSeconds >= 0) {
      setActiveSeconds(initialSeekSeconds);
      seekPlayer(initialSeekSeconds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeekSeconds, video.id]);

  const seekPlayer = (seconds: number) => {
    setActiveSeconds(seconds);
    if (youtubeId && ytIframeRef.current?.contentWindow) {
      ytIframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
        '*'
      );
      ytIframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      );
    }
    if (htmlVideoRef.current) {
      htmlVideoRef.current.currentTime = seconds;
      void htmlVideoRef.current.play().catch(() => {});
    }
  };

  const handleCopy = async (type: string, textOverride?: string) => {
    const content =
      textOverride ??
      (type === 'md' ? formatMarkdownExport(video) : formatChaptersExport(video));
    try {
      await navigator.clipboard.writeText(content);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTagInput.trim().toLowerCase().replace(/^#/, '');
    if (!cleaned) return;
    if (!video.tags.includes(cleaned) && video.tags.length < 15) {
      onUpdateTags(video.id, [...video.tags, cleaned]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateTags(
      video.id,
      video.tags.filter((t) => t !== tagToRemove)
    );
  };

  const handleSaveNotesAndReason = () => {
    onUpdateNotes(video.id, notesDraft, saveReasonDraft);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1800);
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    let trimmed = newLinkUrl.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setLinkError('Enter a valid http:// or https:// URL.');
        return;
      }
      const currentLinks = video.links || [];
      if (currentLinks.some((l) => l.url.toLowerCase() === parsed.toString().toLowerCase())) {
        setLinkError('That link is already saved on this item.');
        return;
      }
      const nextLinks: ExtractedLink[] = [
        ...currentLinks,
        {
          url: parsed.toString(),
          label: newLinkLabel.trim() || parsed.hostname.replace(/^www\./, ''),
          kind: newLinkKind,
        },
      ].slice(0, 30);
      onUpdateLinks(video.id, nextLinks);
      setNewLinkUrl('');
      setNewLinkLabel('');
    } catch {
      setLinkError('Please enter a valid web URL.');
    }
  };

  const handleRemoveLink = (urlToRemove: string) => {
    onUpdateLinks(
      video.id,
      (video.links || []).filter((l) => l.url !== urlToRemove)
    );
  };

  const handleRelinkLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mediaKey = video.localMediaId || video.id;
    await saveLocalMedia(mediaKey, file, {
      fileName: file.name,
      mimeType: file.type,
      itemType: resolvedType,
    });
    const objUrl = URL.createObjectURL(file);
    setLocalDeviceUrl(objUrl);
    setLocalMediaMissing(false);
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionInput.trim();
    if (!q || isAsking) return;

    setAskError(null);
    const nextHistory: VideoChatMessage[] = [...chatHistory, { role: 'user', text: q }];
    setChatHistory(nextHistory);
    setQuestionInput('');
    setIsAsking(true);

    try {
      const res = await authorizedFetch('/api/ask-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video: {
            itemType: resolvedType,
            title: video.title,
            creator: video.creator,
            platform: video.platform,
            summary: video.summary,
            segments: video.segments,
            transcript: video.transcript,
            links: video.links || [],
            saveReason: video.saveReason,
            notes: video.notes,
          },
          question: q,
          history: chatHistory,
        }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get an answer.');
      }
      setChatHistory([...nextHistory, { role: 'model', text: data.answer || '' }]);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Unable to reach AI assistant.');
    } finally {
      setIsAsking(false);
    }
  };

  const renderTextWithClickableTimestamps = (text: string) => {
    const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/);
      if (match) {
        const segParts = match[1].split(':').map(Number);
        const seconds =
          segParts.length === 3
            ? segParts[0] * 3600 + segParts[1] * 60 + segParts[2]
            : segParts[0] * 60 + segParts[1];
        return (
          <button
            key={idx}
            type="button"
            onClick={() => seekPlayer(seconds)}
            className="inline-flex items-center mx-0.5 px-1.5 py-0.5 text-xs font-mono tabular-nums font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded transition-colors"
          >
            {match[1]}
          </button>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  const filteredTranscript = transcriptQuery.trim()
    ? video.transcript.filter(
        (t) =>
          t.text.toLowerCase().includes(transcriptQuery.trim().toLowerCase()) ||
          (t.speaker && t.speaker.toLowerCase().includes(transcriptQuery.trim().toLowerCase()))
      )
    : video.transcript;

  const links = video.links || [];

  const segmentTabLabel =
    resolvedType === 'screenshot'
      ? `Sections (${video.segments.length})`
      : resolvedType === 'document'
        ? `Sections (${video.segments.length})`
        : resolvedType === 'ai-chat'
          ? `Turns (${video.segments.length})`
          : resolvedType === 'link'
            ? `Highlights (${video.segments.length})`
            : `Segments (${video.segments.length})`;

  const transcriptTabLabel =
    resolvedType === 'screenshot'
      ? `OCR Text (${video.transcript.length})`
      : resolvedType === 'document'
        ? `Extracted Text (${video.transcript.length})`
        : resolvedType === 'ai-chat'
          ? `Chat Log (${video.transcript.length})`
          : resolvedType === 'link'
            ? `Page Facts (${video.transcript.length})`
            : `Transcript (${video.transcript.length})`;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Assign item to collection"
            value={video.collectionId || ''}
            onChange={(e) => onChangeCollection(video.id, e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
          >
            <option value="">No Collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onToggleFavorite(video)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              video.isFavorite
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${video.isFavorite ? 'fill-current' : ''}`} />
            {video.isFavorite ? 'Favorited' : 'Favorite'}
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
              aria-label="Delete item"
              title={isLocalMediaItem ? 'Delete item & local file' : 'Delete item'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDeleteVideo(video.id)}
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
            </div>
          )}

          {resolvedType === 'video' && (
            <button
              type="button"
              onClick={() => void handleCopy('chapters')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {copiedType === 'chapters' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <ListVideo className="w-3.5 h-3.5" />
              )}
              {copiedType === 'chapters' ? 'Copied Chapters' : 'Copy Chapters'}
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopy('md')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {copiedType === 'md' ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedType === 'md' ? 'Copied Markdown' : 'Export Markdown'}
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Media Preview & Header Metadata */}
        <div className="xl:col-span-5 space-y-4">
          {youtubeId ? (
            <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
              <iframe
                ref={ytIframeRef}
                src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&rel=0${
                  initialSeekSeconds ? `&start=${initialSeekSeconds}` : ''
                }`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          ) : vimeoId ? (
            <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
              <iframe
                src={`https://player.vimeo.com/video/${vimeoId}#t=${activeSeconds}s`}
                title={video.title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          ) : resolvedType === 'screenshot' && localDeviceUrl ? (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
              <img
                src={localDeviceUrl}
                alt={video.title}
                className="w-full max-h-[420px] object-contain mx-auto"
              />
            </div>
          ) : resolvedType === 'document' && video.platform === 'pdf' && localDeviceUrl ? (
            <div className="space-y-2">
              <div className="w-full h-[380px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
                <iframe
                  src={localDeviceUrl}
                  title={video.title}
                  className="w-full h-full border-0"
                />
              </div>
              <a
                href={localDeviceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open PDF in new tab
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : localDeviceUrl ? (
            <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
              <video
                ref={htmlVideoRef}
                src={localDeviceUrl}
                controls
                className="w-full h-full"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <VideoThumbnail
                src={video.thumbnailUrl}
                title={video.title}
                platform={video.platform}
                itemType={resolvedType}
                durationLabel={video.durationLabel}
                isLocalMedia={isLocalMediaItem}
                className="w-full aspect-video rounded-xl"
              />
              {sanitizeHttpUrl(video.url) && (
                <a
                  href={sanitizeHttpUrl(video.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open original on {PLATFORM_LABELS[video.platform]}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {isLocalMediaItem && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                {localMediaMissing
                  ? 'File stored on original device (not cached in this browser).'
                  : 'Stored locally on this device (link-only in database).'}
              </span>
              {localMediaMissing && (
                <label className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline">
                  <Upload className="w-3 h-3" />
                  Relink File
                  <input
                    type="file"
                    accept={
                      resolvedType === 'screenshot'
                        ? 'image/*'
                        : video.platform === 'pdf'
                          ? '.pdf,application/pdf'
                          : 'video/*,audio/*'
                    }
                    onChange={(e) => void handleRelinkLocalFile(e)}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-snug">
              {video.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {PLATFORM_LABELS[video.platform]}
              </span>
              {video.saveReason && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    Why: {video.saveReason}
                  </span>
                </>
              )}
              {video.creator && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{video.creator}</span>
                </>
              )}
              {video.category && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{video.category}</span>
                </>
              )}
              {video.durationLabel && video.durationLabel !== '—' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{video.durationLabel}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>Saved {formatRelativeDate(video.createdAtMs)}</span>
            </div>
          </div>

          {/* Searchable Tags Strip */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {video.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => onSelectTagFilter(tag)}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    #{tag}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            {video.tags.length < 15 && (
              <form onSubmit={handleAddTag} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="Add searchable tag..."
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Segments, Summary & Why Saved, Transcript/OCR, Links & AI Q&A */}
        <div className="xl:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 pt-3 pb-0 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'segments', label: segmentTabLabel },
                { id: 'summary', label: 'Summary & Notes' },
                { id: 'transcript', label: transcriptTabLabel },
                { id: 'links', label: `Links (${links.length})` },
                { id: 'ask', label: 'Ask AI' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === 'segments' && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {video.segments.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                    No segments or sections were extracted for this item.
                  </p>
                ) : (
                  video.segments.map((seg, idx) => {
                    const isCurrent =
                      resolvedType === 'video' &&
                      activeSeconds >= seg.seconds &&
                      (idx === video.segments.length - 1 ||
                        activeSeconds < video.segments[idx + 1].seconds);
                    return (
                      <div
                        key={`${seg.timestamp}_${idx}`}
                        className={`py-4 first:pt-0 last:pb-0 transition-colors ${
                          isCurrent ? 'bg-blue-50/40 dark:bg-blue-950/20 -mx-5 px-5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <button
                            type="button"
                            onClick={() => seekPlayer(seg.seconds)}
                            className={`mt-0.5 px-2.5 py-1 text-xs font-mono tabular-nums font-medium rounded-md transition-colors shrink-0 ${
                              isCurrent
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                            }`}
                          >
                            {seg.timestamp}
                          </button>
                          <div className="space-y-1.5 min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {seg.title}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                              {seg.summary}
                            </p>
                            {seg.keyQuote && (
                              <p className="text-xs italic text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-lg">
                                &ldquo;{seg.keyQuote}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'summary' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Executive Summary
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {video.summary}
                  </p>
                </div>

                {video.tldrBullets.length > 0 && (
                  <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Key Takeaways
                    </h3>
                    <ul className="space-y-2 list-disc list-inside text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {video.tldrBullets.map((bullet, idx) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Why I Saved This &amp; Personal Notes
                    </h3>
                    <button
                      type="button"
                      onClick={handleSaveNotesAndReason}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      {notesSaved ? <Check className="w-3.5 h-3.5" /> : null}
                      {notesSaved ? 'Saved' : 'Save Changes'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {SAVE_REASON_PRESETS.map((preset) => {
                      const active = saveReasonDraft === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSaveReasonDraft(active ? '' : preset)}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-600 text-white font-medium'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    rows={4}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Why you saved this, product reminders, timestamps, or follow-up notes..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>
              </div>
            )}

            {activeTab === 'transcript' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={transcriptQuery}
                    onChange={(e) => setTranscriptQuery(e.target.value)}
                    placeholder="Filter extracted lines..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>

                {filteredTranscript.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                    No lines match your filter.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[520px] overflow-y-auto pr-1">
                    {filteredTranscript.map((entry, idx) => (
                      <div key={idx} className="py-2.5 flex items-baseline gap-3">
                        <button
                          type="button"
                          onClick={() => seekPlayer(entry.seconds)}
                          className="font-mono text-xs tabular-nums font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                        >
                          {entry.timestamp}
                        </button>
                        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed min-w-0">
                          {entry.speaker && (
                            <span className="font-medium text-slate-900 dark:text-slate-100 mr-1.5">
                              {entry.speaker}:
                            </span>
                          )}
                          <span>{entry.text}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'links' && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Retrieved Links &amp; Resources
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Links extracted from descriptions, spoken/on-screen mentions, screenshot OCR, or manually attached below.
                  </p>
                </div>

                {links.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                    No outbound links were detected in this item yet. Add a product, service, or resource link below.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                    {links.map((lnk, idx) => {
                      const safeHref = sanitizeHttpUrl(lnk.url);
                      return (
                        <div
                          key={`${lnk.url}_${idx}`}
                          className="p-3.5 flex items-start justify-between gap-3 bg-white dark:bg-slate-950/40"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {LINK_KIND_LABELS[lnk.kind || 'other']}
                              </span>
                              {safeHref ? (
                                <a
                                  href={safeHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate"
                                >
                                  {lnk.label}
                                </a>
                              ) : (
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
                                  {lnk.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                              {lnk.url}
                            </p>
                            {lnk.context && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {lnk.context}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleCopy(`link_${idx}`, lnk.url)}
                              title="Copy link"
                              aria-label="Copy link"
                              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {copiedType === `link_${idx}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {safeHref && (
                              <a
                                href={safeHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open link"
                                aria-label="Open link"
                                className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveLink(lnk.url)}
                              title="Remove link"
                              aria-label="Remove link"
                              className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <form
                  onSubmit={handleAddLink}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2.5"
                >
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Attach a Link (Product, Service, or Reference URL)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="sm:col-span-5 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      placeholder="Label (e.g. Sony Mic on Amazon)"
                      className="sm:col-span-4 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                    <select
                      aria-label="Link kind"
                      value={newLinkKind}
                      onChange={(e) =>
                        setNewLinkKind(e.target.value as NonNullable<ExtractedLink['kind']>)
                      }
                      className="sm:col-span-3 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="product">Product</option>
                      <option value="service">Service</option>
                      <option value="resource">Resource</option>
                      <option value="social">Social</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {linkError && <p className="text-xs text-red-600 dark:text-red-400">{linkError}</p>}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!newLinkUrl.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Add Link
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'ask' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ask specific questions about this saved item, its links, or why you saved it.
                </p>

                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {chatHistory.length === 0 && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Summarize the main action items in 3 bullets',
                        'What products, services, or links are mentioned?',
                        'Why should I revisit this later?',
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setQuestionInput(prompt)}
                          className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}

                  {chatHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-lg text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ml-8'
                          : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 mr-4 whitespace-pre-wrap'
                      }`}
                    >
                      {msg.role === 'model'
                        ? renderTextWithClickableTimestamps(msg.text)
                        : msg.text}
                    </div>
                  ))}
                </div>

                {askError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{askError}</p>
                )}

                <form
                  onSubmit={(e) => void handleAskQuestion(e)}
                  className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
                >
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder="Ask anything about this saved item..."
                    disabled={isAsking}
                    className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                  <button
                    type="submit"
                    disabled={isAsking || !questionInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {isAsking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Ask
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
