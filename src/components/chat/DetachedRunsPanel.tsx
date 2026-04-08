import { memo, useState, useEffect } from 'react'
import { PulseIndicator } from '@/components/ui'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { AgentExecutionDetail } from '@/components/runner/AgentExecutionDetail'
import { ChildRow } from './ChildRow'
import type { ChildRowData, ChildRowStatus } from './ChildRow'
import { chatApi } from '@/services/chat'
import type { AgentExecution } from '@/types'
import type { DetachedRun } from '@/hooks'

interface DetachedRunsPanelProps {
  /** List of detached child runs */
  runs: DetachedRun[]
  /** Whether any run is currently active */
  hasActiveRuns: boolean
  /** Navigate to a child session */
  onViewRun: (sessionId: string) => void
  /** Interrupt a running session */
  onStopRun: (sessionId: string) => void
}

// ---------------------------------------------------------------------------
// Inline hook: fetch agent executions for a run
// ---------------------------------------------------------------------------

function useAgentExecutions(runId: string | undefined) {
  const [executions, setExecutions] = useState<AgentExecution[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) { setExecutions([]); return }
    let cancelled = false
    setLoading(true)
    chatApi.getAgentExecutions(runId)
      .then((data) => { if (!cancelled) setExecutions(data) })
      .catch(() => { if (!cancelled) setExecutions([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [runId])

  return { executions, loading }
}

// ---------------------------------------------------------------------------
// Helper: convert DetachedRun -> ChildRowData
// ---------------------------------------------------------------------------

function toChildRowData(run: DetachedRun): ChildRowData {
  const status: ChildRowStatus = run.isStreaming
    ? 'active'
    : (run.forkStatus === 'cancelled' ? 'cancelled' : 'completed')
  return {
    sessionId: run.sessionId,
    title: run.title,
    intent: run.forkIntent,
    status,
    startedAt: run.startedAt,
    model: run.model,
    costUsd: run.costUsd,
    isStreaming: run.isStreaming,
  }
}

/**
 * Collapsible panel showing detached child runs at the top of ChatPanel.
 * Displayed when the current session has spawned sub-sessions (via PlanRunner or sub-agents).
 *
 * Features:
 * - Compact header with run count and pulse indicator
 * - Expandable list with title, status, duration, cost
 * - "View" button to switch to the child session
 * - "Stop" button to interrupt a running child
 */
// ---------------------------------------------------------------------------
// RunRow — single run with expandable agent execution detail
// ---------------------------------------------------------------------------

function RunRow({
  run,
  isExpanded,
  onToggleExpand,
  onViewRun,
  onStopRun,
}: {
  run: DetachedRun
  isExpanded: boolean
  onToggleExpand: () => void
  onViewRun: (sessionId: string) => void
  onStopRun: (sessionId: string) => void
}) {
  const { executions, loading } = useAgentExecutions(isExpanded ? run.runId : undefined)

  return (
    <div>
      <ChildRow
        variant="compact"
        data={toChildRowData(run)}
        onClick={onViewRun}
        onStop={(_e, sid) => onStopRun(sid)}
        trailing={
          run.runId ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
              className="p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors shrink-0"
              title="Execution details"
            >
              {isExpanded
                ? <ChevronUp className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
              }
            </button>
          ) : undefined
        }
      />

      {/* Expanded: agent execution details */}
      {isExpanded && (
        <div className="pl-5 pr-1 pt-1 pb-2 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-3 h-3 rounded-full border-2 border-gray-600 border-t-gray-400 animate-spin" />
              <span className="text-[10px] text-gray-500">Loading executions...</span>
            </div>
          )}
          {!loading && executions.length === 0 && (
            <span className="text-[10px] text-gray-600 block py-1">No execution details available.</span>
          )}
          {executions.map((exec) => (
            <AgentExecutionDetail
              key={exec.id}
              execution={exec}
              onViewConversation={exec.session_id ? (sid) => onViewRun(sid) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const DetachedRunsPanel = memo(function DetachedRunsPanel({
  runs,
  hasActiveRuns,
  onViewRun,
  onStopRun,
}: DetachedRunsPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [showActive, setShowActive] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  if (runs.length === 0) return null

  // Sort: streaming first, then by startedAt desc
  const sortedRuns = [...runs].sort((a, b) => {
    if (a.isStreaming !== b.isStreaming) return a.isStreaming ? -1 : 1
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  })

  // Separate active vs done
  const activeItems = sortedRuns.filter(r => r.isStreaming)
  const doneItems = sortedRuns.filter(r => !r.isStreaming)

  // Simple counts by type
  const totalRuns = sortedRuns.filter(r => !r.isFork).length
  const totalSubchats = sortedRuns.filter(r => r.isFork).length

  // Build a simple header: "N subchats · M runs"
  const summaryParts: string[] = []
  if (totalSubchats > 0) summaryParts.push(`${totalSubchats} subchat${totalSubchats > 1 ? 's' : ''}`)
  if (totalRuns > 0) summaryParts.push(`${totalRuns} run${totalRuns > 1 ? 's' : ''}`)

  const renderGroup = (items: typeof sortedRuns) =>
    items.map(run => (
      <RunRow
        key={run.sessionId}
        run={run}
        isExpanded={expandedRunId === run.sessionId}
        onToggleExpand={() => setExpandedRunId(prev => prev === run.sessionId ? null : run.sessionId)}
        onViewRun={onViewRun}
        onStopRun={onStopRun}
      />
    ))

  return (
    <div className="border-b border-white/[0.06] bg-amber-500/[0.03]">
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-amber-500/[0.04] transition-colors"
      >
        {hasActiveRuns && <PulseIndicator variant="pending" size={6} />}
        <span className="text-xs text-amber-400 font-medium">
          {summaryParts.join(' · ')}
        </span>
        <div className="flex-1" />
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>

      {/* Expanded: grouped by active / done with toggles */}
      {expanded && (
        <div className="px-2 pb-2 max-h-80 overflow-y-auto">
          {/* Active group */}
          {activeItems.length > 0 && (
            <div className="mb-1">
              <button
                onClick={() => setShowActive(!showActive)}
                className="flex items-center gap-1.5 w-full text-[10px] text-amber-400/80 hover:text-amber-300 transition-colors py-1 px-1"
              >
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showActive ? '' : '-rotate-90'}`} />
                <PulseIndicator variant="active" size={5} />
                <span className="font-medium">Active ({activeItems.length})</span>
              </button>
              {showActive && (
                <div className="space-y-1 mt-0.5">
                  {renderGroup(activeItems)}
                </div>
              )}
            </div>
          )}

          {/* Done group */}
          {doneItems.length > 0 && (
            <div>
              <button
                onClick={() => setShowDone(!showDone)}
                className="flex items-center gap-1.5 w-full text-[10px] text-gray-500 hover:text-gray-400 transition-colors py-1 px-1"
              >
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showDone ? '' : '-rotate-90'}`} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
                <span className="font-medium">Done ({doneItems.length})</span>
              </button>
              {showDone && (
                <div className="space-y-1 mt-0.5">
                  {renderGroup(doneItems)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
