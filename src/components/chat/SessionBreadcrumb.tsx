/**
 * SessionBreadcrumb — shows the parent chain for sub-conversations (spawned or forked).
 *
 * Displays: Root Session > Agent Task X > Sub-agent Y
 * Each segment is clickable to navigate to that session.
 * Visible whenever the current session has a parent (spawned or user fork).
 *
 * If `rootSessionId` is not provided, the component walks up the parent chain
 * via `chatApi.getSession()` to discover the root, then fetches the full tree.
 */

import { ChevronRight } from 'lucide-react'
import { useSessionTree } from '@/hooks'
import { chatApi } from '@/services/chat'
import type { SessionTreeNode, SpawnedBy } from '@/types'
import { useState, useEffect } from 'react'

interface SessionBreadcrumbProps {
  /** Current session ID */
  sessionId: string
  /** Root session ID to fetch the tree from (optional — will be computed if omitted) */
  rootSessionId?: string
  /** Called when a breadcrumb segment is clicked */
  onNavigate: (sessionId: string) => void
}

/**
 * Walk up the parent chain via API calls to find the root session.
 * Returns the root session ID (the one with no parent).
 */
async function resolveRootSessionId(sessionId: string): Promise<string> {
  let currentId = sessionId
  const visited = new Set<string>()

  // Walk up at most 10 levels to avoid infinite loops
  for (let i = 0; i < 10; i++) {
    if (visited.has(currentId)) break
    visited.add(currentId)

    try {
      const session = await chatApi.getSession(currentId)
      const spawnedBy = session.spawned_by as SpawnedBy | null | undefined
      if (spawnedBy && spawnedBy.type === 'conversation' && spawnedBy.parent_session_id) {
        currentId = spawnedBy.parent_session_id
      } else {
        // No parent — this is the root
        break
      }
    } catch {
      // API failure — treat current as root
      break
    }
  }

  return currentId
}

/**
 * Build the path from root to `targetId` using the flat tree array.
 * Returns an array of nodes from root down to the target.
 */
function buildPath(tree: SessionTreeNode[], targetId: string): SessionTreeNode[] {
  // Build a map of sessionId -> node for quick lookup
  const nodeMap = new Map<string, SessionTreeNode>()
  for (const node of tree) {
    nodeMap.set(node.session_id, node)
  }

  // Walk up from target to root via parent_session_id
  const path: SessionTreeNode[] = []
  let current = nodeMap.get(targetId)
  while (current) {
    path.unshift(current)
    if (current.parent_session_id) {
      current = nodeMap.get(current.parent_session_id)
    } else {
      break
    }
  }

  return path
}

export function SessionBreadcrumb({ sessionId, rootSessionId: rootProp, onNavigate }: SessionBreadcrumbProps) {
  const [resolvedRoot, setResolvedRoot] = useState<string | undefined>(rootProp)

  // If rootSessionId is not provided, resolve it by walking up the parent chain
  useEffect(() => {
    if (rootProp) {
      setResolvedRoot(rootProp)
      return
    }

    let cancelled = false
    resolveRootSessionId(sessionId).then((rootId) => {
      if (!cancelled) setResolvedRoot(rootId)
    })
    return () => { cancelled = true }
  }, [sessionId, rootProp])

  const { tree } = useSessionTree(resolvedRoot)

  if (tree.length === 0) return null

  const path = buildPath(tree, sessionId)

  // Don't show breadcrumb if we're at the root (path length <= 1)
  if (path.length <= 1) return null

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs overflow-x-auto">
      {path.map((node, i) => {
        const isLast = i === path.length - 1
        const label = node.title || `Session ${node.session_id.slice(0, 8)}`

        return (
          <span key={node.session_id} className="flex items-center gap-1 shrink-0">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
            {isLast ? (
              <span className="text-gray-300 font-medium truncate max-w-[140px]">{label}</span>
            ) : (
              <button
                onClick={() => onNavigate(node.session_id)}
                className="text-indigo-400 hover:text-indigo-300 truncate max-w-[140px] transition-colors"
              >
                {label}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
