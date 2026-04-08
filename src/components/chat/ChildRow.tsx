import { memo } from 'react'
import {
  Archive,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  MessageSquare,
  Square,
  X,
  XCircle,
} from 'lucide-react'
import { PulseIndicator } from '@/components/ui'
import { getModelShortLabel } from '@/constants/models'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChildRowStatus = 'active' | 'completed' | 'cancelled'
export type ChildRowIntent = 'job' | 'role' | 'scope' | 'unknown'

export interface ChildRowData {
  /** Unique identifier used for click handlers */
  sessionId: string
  /** Display title */
  title: string
  /** Fork/run intent classification */
  intent?: ChildRowIntent | string | null
  /** Lifecycle status */
  status: ChildRowStatus
  /** ISO timestamp when the child was started/created */
  startedAt: string
  /** Number of messages (fork metadata) */
  messageCount?: number
  /** Model used for the run */
  model?: string
  /** Total cost in USD */
  costUsd?: number
  /** Whether the child is currently streaming */
  isStreaming?: boolean
  /** Whether a close/stop action is in-flight */
  closing?: boolean
}

export interface ChildRowProps {
  /** Compact = single-line (in-chat panel), Full = two-line (sidebar/explorer) */
  variant: 'compact' | 'full'
  /** Data for the row */
  data: ChildRowData
  /** Click the row itself (navigate / select) */
  onClick: (sessionId: string) => void
  /** Stop or close this child */
  onStop?: (e: React.MouseEvent, sessionId: string) => void
  /** Archive this child */
  onArchive?: (e: React.MouseEvent, sessionId: string) => void
  /** Whether an archive operation is in-flight */
  archiving?: boolean
  /** Extra element rendered after the row (e.g. chevron for expand) */
  trailing?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  active: {
    dotColor: 'bg-green-400',
    badgeText: 'Active',
    badgeCls: 'bg-violet-500/15 text-violet-300',
    icon: Loader2,
    iconColor: 'text-violet-400',
    borderColor: 'border-l-violet-400',
    bgHover: 'hover:bg-violet-500/8',
    animate: true,
  },
  completed: {
    dotColor: 'bg-emerald-400',
    badgeText: 'Done',
    badgeCls: 'bg-emerald-500/15 text-emerald-400',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    borderColor: 'border-l-emerald-500/40',
    bgHover: 'hover:bg-emerald-500/5',
    animate: false,
  },
  cancelled: {
    dotColor: 'bg-gray-500',
    badgeText: 'Cancelled',
    badgeCls: 'bg-gray-500/15 text-gray-500',
    icon: XCircle,
    iconColor: 'text-gray-500',
    borderColor: 'border-l-gray-600/30',
    bgHover: 'hover:bg-white/[0.02]',
    animate: false,
  },
} as const

const INTENT_BADGE: Record<string, { emoji: string; label: string; cls: string }> = {
  job:   { emoji: '\u26A1', label: 'Job',   cls: 'bg-blue-500/15 text-blue-300' },
  role:  { emoji: '\uD83C\uDFAD', label: 'Role',  cls: 'bg-amber-500/15 text-amber-300' },
  scope: { emoji: '\uD83D\uDCCB', label: 'Scope', cls: 'bg-emerald-500/15 text-emerald-300' },
}

function formatDuration(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours}h ${diffMins % 60}m`
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatCost(cost?: number): string | null {
  if (!cost) return null
  return `$${cost.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Intent badge (shared between variants)
// ---------------------------------------------------------------------------

function IntentBadge({ intent }: { intent?: string | null }) {
  if (!intent || intent === 'unknown') return null
  const cfg = INTENT_BADGE[intent]
  if (!cfg) {
    return (
      <span className="text-[8px] px-1 rounded-full shrink-0 bg-gray-500/15 text-gray-400">
        {intent}
      </span>
    )
  }
  return (
    <span className={`text-[8px] px-1 rounded-full shrink-0 ${cfg.cls}`}>
      {cfg.emoji} {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ChildRow — compact variant (DetachedRunsPanel in-chat)
// ---------------------------------------------------------------------------

function CompactRow({ data, onClick, onStop, trailing }: Omit<ChildRowProps, 'variant'>) {
  const { sessionId, title, intent, status, startedAt, model, costUsd, isStreaming } = data

  return (
    <div
      onClick={() => onClick(sessionId)}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] transition-colors group cursor-pointer"
    >
      {/* Status indicator */}
      {isStreaming ? (
        <PulseIndicator variant="active" size={6} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_CONFIG[status].dotColor}`} />
      )}

      {/* Title + intent badge */}
      <span className="text-xs text-gray-300 truncate flex-1 min-w-0">
        {title}
      </span>
      <IntentBadge intent={intent} />

      {/* Meta: duration, cost, model */}
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 shrink-0">
        <Clock className="w-2.5 h-2.5" />
        {formatDuration(startedAt)}
      </span>
      {formatCost(costUsd) && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 shrink-0">
          <DollarSign className="w-2.5 h-2.5" />
          {formatCost(costUsd)}
        </span>
      )}
      {model && (
        <span className="text-[10px] text-gray-600 truncate max-w-[60px] shrink-0">
          {model}
        </span>
      )}

      {/* Trailing element (e.g. expand chevron) */}
      {trailing}

      {/* Stop button — only for streaming */}
      {isStreaming && onStop && (
        <button
          onClick={(e) => { e.stopPropagation(); onStop(e, sessionId) }}
          className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
          title="Stop run"
        >
          <Square className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChildRow — full variant (ForkChildren sidebar / ForkExplorer)
// ---------------------------------------------------------------------------

function FullRow({ data, onClick, onStop, onArchive, archiving }: Omit<ChildRowProps, 'variant'>) {
  const { sessionId, title, intent, status, startedAt, messageCount, model, isStreaming, closing } = data
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const isCancelled = status === 'cancelled'

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(sessionId) }}
      className={`
        w-full text-left flex items-start gap-2 py-1.5 px-2 rounded-md
        border-l-2 ${config.borderColor} ${config.bgHover}
        transition-colors group/fork cursor-pointer
        ${isCancelled ? 'opacity-50' : ''}
      `}
    >
      <Icon
        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${config.iconColor} ${
          config.animate ? 'animate-spin' : ''
        }`}
      />
      <div className="flex-1 min-w-0">
        {/* Line 1: title + close button */}
        <div className="flex items-center gap-1">
          <span className={`text-[11px] font-medium truncate flex-1 ${
            isCancelled ? 'text-gray-500' : 'text-gray-300'
          }`}>
            {title}
          </span>
          {isStreaming && !closing && onStop && (
            <button
              onClick={(e) => onStop(e, sessionId)}
              className="hidden group-hover/fork:flex items-center justify-center w-4 h-4 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              title="Close fork"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {closing && (
            <Loader2 className="w-3 h-3 animate-spin text-gray-500 shrink-0" />
          )}
          {/* Archive button — visible on hover for non-streaming rows */}
          {!isStreaming && !closing && onArchive && !archiving && (
            <button
              onClick={(e) => onArchive(e, sessionId)}
              className="hidden group-hover/fork:flex items-center justify-center w-4 h-4 rounded text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors shrink-0"
              title="Archive"
            >
              <Archive className="w-3 h-3" />
            </button>
          )}
          {archiving && (
            <Loader2 className="w-3 h-3 animate-spin text-amber-400 shrink-0" />
          )}
        </div>

        {/* Line 2: duration, messages, time, status badge, intent */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-0.5 text-[9px] text-gray-500">
            <Clock className="w-2.5 h-2.5" />
            {formatDuration(startedAt)}
          </span>
          {messageCount != null && (
            <span className="flex items-center gap-0.5 text-[9px] text-gray-500">
              <MessageSquare className="w-2.5 h-2.5" />
              {messageCount}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[9px] text-gray-500">
            {relativeTime(startedAt)}
          </span>
          <span className={`text-[8px] px-1 rounded-full ${config.badgeCls} shrink-0`}>
            {config.badgeText}
          </span>
          <IntentBadge intent={intent} />
          {model && (
            <span className="text-[9px] text-gray-600 truncate max-w-[70px] shrink-0">
              {getModelShortLabel(model)}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Exported composite component
// ---------------------------------------------------------------------------

export const ChildRow = memo(function ChildRow(props: ChildRowProps) {
  const { variant, ...rest } = props
  // CompactRow doesn't use onArchive/archiving — pass them but they're harmless
  return variant === 'compact' ? <CompactRow {...rest} /> : <FullRow {...rest} />
})
