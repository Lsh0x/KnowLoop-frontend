import { useCallback, useEffect, useMemo, useState } from 'react'
import { chatApi } from '@/services'
import type { ForkInfo } from '@/types'
import { GitFork, ChevronDown, CheckCircle2, Loader2, Search, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ChildRow } from './ChildRow'
import type { ChildRowData, ChildRowStatus } from './ChildRow'

// ---------------------------------------------------------------------------
// Helper: convert ForkInfo -> ChildRowData
// ---------------------------------------------------------------------------

function toChildRowData(fork: ForkInfo): ChildRowData {
  const status: ChildRowStatus = (fork.fork_status === 'completed' || fork.fork_status === 'cancelled')
    ? fork.fork_status as ChildRowStatus
    : 'active'
  return {
    sessionId: fork.session_id,
    title: fork.title?.replace(/^\[Fork\]\s*/, '') || `Fork #${fork.fork_depth || '?'}`,
    intent: fork.fork_intent,
    status,
    startedAt: fork.created_at,
    messageCount: fork.message_count,
    model: fork.model,
    isStreaming: status === 'active',
    closing: false,
  }
}

/** Max forks shown inline in sidebar before "Show all" link */
const SIDEBAR_MAX = 5

// ---------------------------------------------------------------------------
// ForkChildren — Sidebar compact view
// ---------------------------------------------------------------------------

interface ForkChildrenProps {
  sessionId: string
  onSelect: (sessionId: string, turnIndex?: number, title?: string) => void
  /** Callback to report the number of active forks and latest activity timestamp (for parent row badge + sort bubbling) */
  onActiveCount?: (count: number, latestActivity?: string) => void
}

/**
 * Compact fork list for the sidebar.
 * Shows up to SIDEBAR_MAX recent active forks, with a "Show all" link
 * that opens the full Fork Explorer panel.
 */
export function ForkChildren({ sessionId, onSelect, onActiveCount }: ForkChildrenProps) {
  const [forks, setForks] = useState<ForkInfo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [showActive, setShowActive] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [showExplorer, setShowExplorer] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  const fetchForks = useCallback(async () => {
    try {
      // Fetch first page (active first, sorted by created_at desc)
      const result = await chatApi.listForks(sessionId, { limit: SIDEBAR_MAX })
      setForks(result.items)
      setTotal(result.total)
    } catch {
      // Silently ignore
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchForks()
    // Poll every 10s for live status updates (fork may auto-close or reactivate)
    const interval = setInterval(fetchForks, 10_000)
    return () => clearInterval(interval)
  }, [fetchForks])

  const handleClose = useCallback(async (e: React.MouseEvent, forkId: string) => {
    e.stopPropagation()
    setClosingId(forkId)
    try {
      await chatApi.closeFork(sessionId, forkId, false)
      await fetchForks()
    } catch (err) {
      console.error('Failed to close fork:', err)
    } finally {
      setClosingId(null)
    }
  }, [sessionId, fetchForks])

  const handleArchive = useCallback(async (e: React.MouseEvent, forkId: string) => {
    e.stopPropagation()
    setArchivingId(forkId)
    try {
      await chatApi.archiveSession(forkId)
      await fetchForks()
    } catch (err) {
      console.error('Failed to archive fork:', err)
    } finally {
      setArchivingId(null)
    }
  }, [fetchForks])

  // Count active forks for pulse indicator
  const activeSidebarCount = forks.filter(f => f.fork_status === 'active').length

  // Compute latest fork activity timestamp (best we have is created_at until backend provides last_message_at)
  // TODO: backend should add `last_message_at` or `updated_at` to ForkInfo for accurate sub-chat activity tracking
  const latestForkActivity = useMemo(() => {
    if (forks.length === 0) return undefined
    return forks.reduce<string | undefined>((latest, f) => {
      if (!latest) return f.created_at
      return new Date(f.created_at).getTime() > new Date(latest).getTime() ? f.created_at : latest
    }, undefined)
  }, [forks])

  // Report active count and latest activity to parent
  useEffect(() => {
    onActiveCount?.(activeSidebarCount, latestForkActivity)
  }, [activeSidebarCount, latestForkActivity, onActiveCount])

  if (loading || total === 0) return null

  // Simple summary: "N subchats"
  const summaryLabel = `${total} subchat${total > 1 ? 's' : ''}`

  return (
    <>
      <div className="mt-1">
        {/* Toggle header — always visible with activity indicator */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className="flex items-center gap-1.5 w-full text-[10px] text-emerald-400/80 hover:text-emerald-300 transition-colors py-0.5"
        >
          <ChevronDown
            className={`w-2.5 h-2.5 transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
          <GitFork className="w-2.5 h-2.5" />
          {activeSidebarCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          )}
          <span className="truncate">{summaryLabel}</span>
        </button>

        {expanded && (() => {
          const activeForks = forks.filter(f => f.fork_status === 'active' || !f.fork_status)
          const doneForks = forks.filter(f => f.fork_status === 'completed' || f.fork_status === 'cancelled')

          const renderFork = (fork: ForkInfo) => {
            const data = { ...toChildRowData(fork), closing: closingId === fork.session_id }
            return (
              <ChildRow
                key={fork.session_id}
                variant="full"
                data={data}
                onClick={(sid) => onSelect(sid, undefined, fork.title ?? undefined)}
                onStop={(e, sid) => handleClose(e, sid)}
                onArchive={(e, sid) => handleArchive(e, sid)}
                archiving={archivingId === fork.session_id}
              />
            )
          }

          return (
            <div className="ml-2 mt-1">
              {/* Active group */}
              {activeForks.length > 0 && (
                <div className="mb-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowActive(!showActive) }}
                    className="flex items-center gap-1 w-full text-[9px] text-emerald-400/70 hover:text-emerald-300 transition-colors py-0.5 px-1"
                  >
                    <ChevronDown className={`w-2 h-2 transition-transform ${showActive ? '' : '-rotate-90'}`} />
                    <Loader2 className="w-2 h-2 animate-spin" />
                    <span className="font-medium">Active ({activeForks.length})</span>
                  </button>
                  {showActive && (
                    <div className="space-y-px">{activeForks.map(renderFork)}</div>
                  )}
                </div>
              )}

              {/* Done group */}
              {doneForks.length > 0 && (
                <div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowDone(!showDone) }}
                    className="flex items-center gap-1 w-full text-[9px] text-gray-500 hover:text-gray-400 transition-colors py-0.5 px-1"
                  >
                    <ChevronDown className={`w-2 h-2 transition-transform ${showDone ? '' : '-rotate-90'}`} />
                    <CheckCircle2 className="w-2 h-2" />
                    <span className="font-medium">Done ({doneForks.length})</span>
                  </button>
                  {showDone && (
                    <div className="space-y-px">{doneForks.map(renderFork)}</div>
                  )}
                </div>
              )}

              {/* "Show all" link when there are more forks */}
              {total > SIDEBAR_MAX && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowExplorer(true)
                  }}
                  className="w-full text-left text-[10px] text-emerald-400/60 hover:text-emerald-300 py-1 px-2 transition-colors"
                >
                  Show all {total} forks...
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Fork Explorer overlay */}
      {showExplorer && (
        <ForkExplorer
          sessionId={sessionId}
          onSelect={(sid, _, title) => {
            setShowExplorer(false)
            onSelect(sid, undefined, title)
          }}
          onClose={() => setShowExplorer(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ForkExplorer — full panel with search, tabs, pagination
// ---------------------------------------------------------------------------

type TabStatus = 'all' | 'active' | 'completed' | 'cancelled'

interface ForkExplorerProps {
  sessionId: string
  onSelect: (sessionId: string, turnIndex?: number, title?: string) => void
  onClose: () => void
}

const PAGE_SIZE = 20

function ForkExplorer({ sessionId, onSelect, onClose }: ForkExplorerProps) {
  const [forks, setForks] = useState<ForkInfo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabStatus>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  const fetchPage = useCallback(async () => {
    setLoading(true)
    try {
      const result = await chatApi.listForks(sessionId, {
        status: tab === 'all' ? undefined : tab,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setForks(result.items)
      setTotal(result.total)
    } catch {
      setForks([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [sessionId, tab, search, page])

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  // Reset page when tab or search changes
  useEffect(() => {
    setPage(0)
  }, [tab, search])

  const handleClose = useCallback(async (e: React.MouseEvent, forkId: string) => {
    e.stopPropagation()
    setClosingId(forkId)
    try {
      await chatApi.closeFork(sessionId, forkId, false)
      await fetchPage()
    } catch (err) {
      console.error('Failed to close fork:', err)
    } finally {
      setClosingId(null)
    }
  }, [sessionId, fetchPage])

  const handleArchive = useCallback(async (e: React.MouseEvent, forkId: string) => {
    e.stopPropagation()
    setArchivingId(forkId)
    try {
      await chatApi.archiveSession(forkId)
      await fetchPage()
    } catch (err) {
      console.error('Failed to archive fork:', err)
    } finally {
      setArchivingId(null)
    }
  }, [fetchPage])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const tabs: { key: TabStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Done' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <GitFork className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-gray-200 flex-1">
            Fork Explorer
            <span className="text-gray-500 font-normal ml-2">({total})</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-md px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search forks by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-white/[0.06]">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                tab === key
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Fork list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-px min-h-0">
          {loading && forks.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : forks.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-600">
              {search ? 'No forks match your search.' : 'No forks in this category.'}
            </div>
          ) : (
            forks.map((fork) => {
              const data = { ...toChildRowData(fork), closing: closingId === fork.session_id }
              return (
                <ChildRow
                  key={fork.session_id}
                  variant="full"
                  data={data}
                  onClick={(sid) => onSelect(sid, undefined, fork.title ?? undefined)}
                  onStop={(e, sid) => handleClose(e, sid)}
                  onArchive={(e, sid) => handleArchive(e, sid)}
                  archiving={archivingId === fork.session_id}
                />
              )
            })
          )}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] text-[10px] text-gray-500">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-white/[0.04] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-white/[0.04] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
