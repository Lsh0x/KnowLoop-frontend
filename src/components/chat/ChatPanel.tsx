import { useAtom } from 'jotai'
import { chatPanelModeAtom, chatPanelWidthAtom, chatScrollToTurnAtom, chatPermissionConfigAtom, chatSelectedProjectAtom, chatAllProjectsModeAtom, chatWorkspaceHasProjectsAtom, activeWorkspaceSlugAtom, chatActivePersonaAtom, chatSessionPersonaMapAtom } from '@/atoms'
import { useChat, useDetachedRuns, useWindowFullscreen } from '@/hooks'
import { chatApi } from '@/services/chat'
import { Plus, X, Menu, Settings, Minimize2, Maximize2, Loader2, FolderPlus, TreePine, GitFork, CheckCircle2, Pencil } from 'lucide-react'
import { ChatMessages } from './ChatMessages'
import { ChatInput, type PrefillPayload } from './ChatInput'
import { CompactionBanner } from './CompactionBanner'
import { DetachedRunsPanel } from './DetachedRunsPanel'
import { SessionList } from './SessionList'
import { ProjectSelect } from './ProjectSelect'
import { PermissionSettingsPanel } from './PermissionSettingsPanel'
import { SessionBreadcrumb } from './SessionBreadcrumb'
import { PersonaPicker, NewChatPersonaSelect } from './PersonaPicker'
import { ForkDialog } from './ForkDialog'
import { DiscussionTreeView } from '@/components/discussions/DiscussionTreeView'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { isTauri } from '@/services/env'
import { workspacePath } from '@/utils/paths'

const MIN_WIDTH = 320
const MAX_WIDTH = 800
const MOBILE_BREAKPOINT = 768
const NOOP = () => {}

/** Small dot indicator for WebSocket status */
function WsStatusDot({ status }: { status: string }) {
  if (status === 'connected') {
    return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Connected" />
  }
  if (status === 'reconnecting' || status === 'connecting') {
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" title="Reconnecting..." />
  }
  // disconnected or unknown — only show when there's a session
  return <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" title="Disconnected" />
}

export function ChatPanel() {
  const [mode, setMode] = useAtom(chatPanelModeAtom)
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [showSessions, setShowSessions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const allProjectsMode = useAtomValue(chatAllProjectsModeAtom)
  const workspaceHasProjects = useAtomValue(chatWorkspaceHasProjectsAtom)
  const activeWsSlug = useAtomValue(activeWorkspaceSlugAtom)
  const [isDragging, setIsDragging] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null)
  const [showAgentTree, setShowAgentTree] = useState(false)
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitleValue, setEditingTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [isClosingFork, setIsClosingFork] = useState(false)
  const [parentName, setParentName] = useState<string | null>(null)
  const setActivePersona = useSetAtom(chatActivePersonaAtom)
  const setPersonaMap = useSetAtom(chatSessionPersonaMapAtom)
  const chat = useChat()
  const detachedRuns = useDetachedRuns(chat.sessionId)
  const panelRef = useRef<HTMLDivElement>(null)
  const setScrollToTurn = useSetAtom(chatScrollToTurnAtom)
  const permissionConfig = useAtomValue(chatPermissionConfigAtom)
  // Note: permission config is fetched by ChatInput (which owns the write)

  // Mode-based color for gear icon badge
  const modeColor = permissionConfig
    ? { bypassPermissions: 'bg-emerald-400', acceptEdits: 'bg-blue-400', default: 'bg-amber-400', plan: 'bg-gray-400' }[permissionConfig.mode] || 'bg-gray-400'
    : null

  const isOpen = mode !== 'closed'
  const isFullscreen = mode === 'fullscreen'
  const isNewConversation = !chat.sessionId && !chat.isSending
  const isWindowFullscreen = useWindowFullscreen()
  const forkIntent = chat.sessionMeta?.forkIntent
  const isRoleFork = forkIntent === 'role'
  // Role forks never show the completed banner — they're always reactivable
  const isSessionCompleted = !isRoleFork && (chat.sessionMeta?.forkStatus === 'completed' || chat.sessionMeta?.forkStatus === 'cancelled')

  // Show extra top padding on Tauri desktop (non-fullscreen) to clear native traffic lights
  const trafficLightPad = isTauri && !isWindowFullscreen

  // Detect mobile viewport
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      // Close mobile sidebar when switching to desktop
      if (!e.matches) setShowMobileSidebar(false)
    }
    // Sync initial value via the same callback path
    handler({ matches: mql.matches } as MediaQueryListEvent)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Reset session title when sessionId is cleared
  useEffect(() => {
    if (!chat.sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync title reset on session clear
      setSessionTitle(null)
    }
  }, [chat.sessionId])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, setPanelWidth])

  // Whether the user has selected a valid context for new conversations
  // Requires at least one project in the workspace — allProjectsMode alone isn't enough
  const hasContext = workspaceHasProjects && (!!selectedProject || (allProjectsMode && !!activeWsSlug))

  const handleSend = useCallback((text: string) => {
    if (isNewConversation && !hasContext) return
    if (!isNewConversation) {
      chat.sendMessage(text)
      return
    }
    if (selectedProject) {
      // When allProjectsMode → send workspaceSlug (adds all project dirs)
      // When single project → send only projectSlug (no extra dirs)
      chat.sendMessage(text, {
        cwd: selectedProject.root_path,
        workspaceSlug: allProjectsMode ? (activeWsSlug || undefined) : undefined,
        projectSlug: allProjectsMode ? undefined : selectedProject.slug,
      })
    }
  }, [isNewConversation, hasContext, selectedProject, allProjectsMode, activeWsSlug, chat.sendMessage])

  const handleContinue = useCallback(() => {
    chat.sendContinue()
  }, [chat.sendContinue])

  /** Quick action from welcome screen → prefill the textarea */
  const handleQuickAction = useCallback((prompt: string, cursorOffset?: number) => {
    // Create a new object reference each time to re-trigger the useEffect in ChatInput
    setPrefill({ text: prompt, cursorOffset })
  }, [])

  const handleViewRun = useCallback((childSessionId: string) => {
    chat.loadSession(childSessionId)
    setSessionTitle(null)
  }, [chat.loadSession])

  const handleStopRun = useCallback((childSessionId: string) => {
    chatApi.interruptSession(childSessionId).catch(() => { /* ignore */ })
  }, [])

  const handleNewSession = useCallback(() => {
    chat.newSession()
    // Keep selectedProject — user expects the project to persist across new chats
    setSessionTitle(null)
    setShowSessions(false)
  }, [chat.newSession])

  const handleSelectSession = useCallback((sessionId: string, targetTurnIndex?: number, title?: string, searchHit?: { snippet: string; createdAt: number; role: 'user' | 'assistant' }) => {
    setScrollToTurn(targetTurnIndex != null ? { turnIndex: targetTurnIndex, snippet: searchHit?.snippet, createdAt: searchHit?.createdAt, role: searchHit?.role } : null)
    // Pass the created_at timestamp (not turn_index) to loadSession for binary search offset resolution
    chat.loadSession(sessionId, searchHit?.createdAt)
    setSessionTitle(title ?? null)
    if (!isFullscreen) {
      setShowSessions(false)
    }
    // Close mobile sidebar overlay on selection
    if (isMobile) {
      setShowMobileSidebar(false)
    }
  }, [chat.loadSession, setScrollToTurn, isFullscreen, isMobile])

  // Determine header title
  const headerTitle = isNewConversation
    ? 'New Chat'
    : sessionTitle || 'Chat'

  // Spawned-by navigation: derive parent session ID from session metadata
  const spawnedBy = chat.sessionMeta?.spawnedBy
  const parentSessionId = useMemo(() => {
    if (!spawnedBy) return null
    if (spawnedBy.type === 'conversation') return spawnedBy.parent_session_id
    // runner-spawned sessions don't have a direct parent to navigate back to
    return null
  }, [spawnedBy])

  // The root session ID for tree view — use parent if we're a child, otherwise current
  const rootSessionId = parentSessionId || chat.sessionId

  // Whether session has children (show Agent Tree button)
  const hasChildren = detachedRuns.runs.length > 0

  const handleBackToParent = useCallback(() => {
    if (!parentSessionId) return
    chat.loadSession(parentSessionId)
    setSessionTitle(null)
    setShowAgentTree(false)
  }, [parentSessionId, chat.loadSession])

  // Fetch parent session name for the "Sub · ParentName" subtitle
  useEffect(() => {
    if (!parentSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync reset when no parent
      setParentName(null)
      return
    }
    let cancelled = false
    chatApi.getSession(parentSessionId).then((session) => {
      if (!cancelled) setParentName(session.title || `Session ${parentSessionId.slice(0, 8)}`)
    }).catch(() => {
      if (!cancelled) setParentName(null)
    })
    return () => { cancelled = true }
  }, [parentSessionId])

  const handleTreeNavigate = useCallback((targetSessionId: string) => {
    chat.loadSession(targetSessionId)
    setSessionTitle(null)
    setShowAgentTree(false)
  }, [chat.loadSession])

  /** Open the fork dialog */
  const handleForkClick = useCallback(() => {
    if (!chat.sessionId) return
    setShowForkDialog(true)
  }, [chat.sessionId])

  /** Actually create the fork with the given title and optional persona */
  const handleForkSubmit = useCallback(async (title?: string, persona?: import('@/types').Persona | null) => {
    if (!chat.sessionId) return
    setShowForkDialog(false)
    const forkTitle = title?.trim() || undefined
    try {
      const result = await chatApi.forkSession(chat.sessionId, {
        fork_type: 'user',
        persona: persona?.name ?? undefined,
        initial_message: forkTitle
          ? `[Fork] ${forkTitle}`
          : 'Continue the conversation in this fork.',
      })
      if (forkTitle) {
        await chatApi.renameSession(result.session_id, forkTitle).catch(() => {})
      }
      if (persona) {
        // Persist persona for the new fork session
        setPersonaMap(prev => ({ ...prev, [result.session_id]: persona.id }))
        chatApi.activateSessionPersona(result.session_id, persona.id).catch(() => {})
      }
      chat.loadSession(result.session_id)
      setSessionTitle(null)
    } catch (err) {
      console.error('Failed to fork session:', err)
    }
  }, [chat.sessionId, chat.loadSession, setPersonaMap])

  /** Fork with a specific persona (from header PersonaPicker dropdown) */
  const handleForkWithPersona = useCallback(async (persona: import('@/types').Persona) => {
    if (!chat.sessionId) return
    try {
      const result = await chatApi.forkSession(chat.sessionId, {
        fork_type: 'user',
        persona: persona.name,
        initial_message: `[Fork] Role: ${persona.name}`,
      })
      await chatApi.renameSession(result.session_id, persona.name).catch(() => {})
      // Persist persona for the new fork session
      setPersonaMap(prev => ({ ...prev, [result.session_id]: persona.id }))
      chatApi.activateSessionPersona(result.session_id, persona.id).catch(() => {})
      chat.loadSession(result.session_id)
      setSessionTitle(null)
    } catch (err) {
      console.error('Failed to fork with persona:', err)
    }
  }, [chat.sessionId, chat.loadSession, setPersonaMap])


  /** Close the current fork session (complete it) and navigate back to parent */
  const handleCloseFork = useCallback(async () => {
    if (!chat.sessionId || !parentSessionId || isClosingFork) return
    setIsClosingFork(true)
    try {
      await chatApi.closeFork(parentSessionId, chat.sessionId, false)
      // Navigate back to parent
      chat.loadSession(parentSessionId)
      setSessionTitle(null)
    } catch (err) {
      console.error('Failed to close fork:', err)
    } finally {
      setIsClosingFork(false)
    }
  }, [chat.sessionId, parentSessionId, chat.loadSession, isClosingFork])

  /** Start editing the header title */
  const handleTitleClick = useCallback(() => {
    if (isNewConversation || !chat.sessionId) return
    setEditingTitleValue(sessionTitle || '')
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }, [isNewConversation, chat.sessionId, sessionTitle])

  /** Submit the title rename */
  const handleTitleSubmit = useCallback(async () => {
    setIsEditingTitle(false)
    const newTitle = editingTitleValue.trim()
    if (!chat.sessionId || !newTitle || newTitle === sessionTitle) return
    try {
      await chatApi.renameSession(chat.sessionId, newTitle)
      setSessionTitle(newTitle)
    } catch (err) {
      console.error('Failed to rename session:', err)
    }
  }, [chat.sessionId, editingTitleValue, sessionTitle])

  /** Handle keydown in title input */
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSubmit()
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false)
    }
  }, [handleTitleSubmit])

  // Reset UI state on session change + persist pre-selected persona for new sessions
  const activePersona = useAtomValue(chatActivePersonaAtom)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync reset on session change
    setShowAgentTree(false)
    setShowForkDialog(false)
    setIsEditingTitle(false)

    // If we had a persona pre-selected (from NewChatPersonaSelect) and a new session just started,
    // persist it and activate on backend — don't clear it
    if (chat.sessionId && activePersona) {
      setPersonaMap(prev => ({ ...prev, [chat.sessionId!]: activePersona.id }))
      chatApi.activateSessionPersona(chat.sessionId, activePersona.id).catch(() => {})
      // Don't clear — the PersonaPicker will show it as locked
    } else if (!chat.sessionId) {
      // Going to new conversation screen — clear persona
      setActivePersona(null)
    }
    // Note: when navigating to an existing session, the PersonaPicker restores from personaMap
  }, [chat.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- FULLSCREEN LAYOUT: sidebar + conversation side by side ---
  // On mobile (<768px): sidebar is a full-screen overlay toggled via hamburger
  // On desktop: sidebar is a permanent 288px column
  if (isFullscreen) {
    return (
      <div
        ref={panelRef}
        className={`fixed inset-0 z-30 bg-surface-raised flex ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Left sidebar — hidden on mobile, permanent on desktop */}
        {/* Desktop: static sidebar */}
        <div className="hidden md:flex w-72 shrink-0 border-r border-white/[0.06] flex-col">
          {/* Sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
          <div className={`flex items-center justify-between px-4 shrink-0 transition-all duration-300 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
            <span className="text-sm font-medium text-gray-300">Conversations</span>
            <button
              onClick={handleNewSession}
              disabled={isNewConversation}
              className={`p-1.5 rounded-md transition-colors ${isNewConversation ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
              title="New conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <SessionList
            activeSessionId={chat.sessionId}
            onSelect={handleSelectSession}
            onClose={NOOP} // no-op in fullscreen desktop
            embedded
          />
        </div>

        {/* Mobile: full-screen overlay sidebar */}
        {isMobile && showMobileSidebar && (
          <div className="fixed inset-0 z-40 flex flex-col bg-surface-raised">
            {/* Mobile sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
            <div className={`flex items-center justify-between px-4 shrink-0 transition-all duration-300 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
              <span className="text-sm font-medium text-gray-300">Conversations</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                  title="Back to chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* New conversation button */}
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <button
                onClick={() => { handleNewSession(); setShowMobileSidebar(false) }}
                disabled={isNewConversation}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isNewConversation ? 'bg-indigo-500/5 text-indigo-400/40 cursor-not-allowed' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400'}`}
              >
                <Plus className="w-4 h-4" />
                New conversation
              </button>
            </div>

            <SessionList
              activeSessionId={chat.sessionId}
              onSelect={handleSelectSession}
              onClose={() => setShowMobileSidebar(false)}
              embedded
            />
          </div>
        )}

        {/* Right side — conversation (full width on mobile) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Conversation header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
            <div className="min-w-0 flex items-center gap-2">
              {/* Mobile: hamburger to toggle sidebar */}
              <button
                onClick={() => { if (isMobile) setShowMobileSidebar(true) }}
                className={`shrink-0 p-1.5 rounded-md transition-colors md:hidden ${showMobileSidebar ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="Sessions"
              >
                <Menu className="w-4 h-4" />
              </button>
              {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
              <div className="min-w-0">
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleTitleSubmit}
                    className="text-sm font-medium text-gray-200 bg-white/[0.06] border border-indigo-500/40 rounded px-1.5 py-0.5 outline-none w-full min-w-[120px]"
                    autoFocus
                  />
                ) : (
                  <span
                    className={`text-sm font-medium text-gray-300 truncate block group/title ${!isNewConversation ? 'cursor-pointer hover:text-gray-100' : ''}`}
                    onClick={handleTitleClick}
                    title={!isNewConversation ? 'Click to rename' : undefined}
                  >
                    {headerTitle}
                    {!isNewConversation && (
                      <Pencil className="w-2.5 h-2.5 inline-block ml-1.5 opacity-0 group-hover/title:opacity-60 text-gray-500 transition-opacity" />
                    )}
                  </span>
                )}
                {!isNewConversation && chat.sessionMeta?.workspaceSlug && (
                  <Link
                    to={`/workspace/${chat.sessionMeta.workspaceSlug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-purple-400 hover:text-purple-300 truncate block transition-colors"
                  >
                    ⬡ {chat.sessionMeta.workspaceSlug}
                  </Link>
                )}
                {!isNewConversation && !chat.sessionMeta?.workspaceSlug && chat.sessionMeta?.projectSlug && (
                  <Link
                    to={activeWsSlug ? `/workspace/${activeWsSlug}/projects/${chat.sessionMeta.projectSlug}` : `/projects/${chat.sessionMeta.projectSlug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 truncate block transition-colors"
                  >
                    {chat.sessionMeta.projectSlug}
                  </Link>
                )}
                {!isNewConversation && parentSessionId && parentName && (
                  <button
                    onClick={handleBackToParent}
                    className="text-[10px] text-violet-400/70 hover:text-violet-300 truncate block transition-colors text-left"
                  >
                    Sub &middot; {parentName}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewSession}
                disabled={isNewConversation}
                className={`p-1.5 rounded-md transition-colors md:hidden ${isNewConversation ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              {/* Agent Tree toggle — visible when session has children */}
              {hasChildren && chat.sessionId && (
                <button
                  onClick={() => { setShowAgentTree(!showAgentTree); setShowSettings(false) }}
                  className={`p-1.5 rounded-md transition-colors ${showAgentTree ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                  title="Agent Tree"
                >
                  <TreePine className="w-4 h-4" />
                </button>
              )}
              {/* Fork button — create a sub-conversation */}
              {chat.sessionId && !isNewConversation && (
                <button
                  onClick={handleForkClick}
                  className="p-1.5 rounded-md text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                  title="Fork conversation"
                >
                  <GitFork className="w-4 h-4" />
                </button>
              )}
              {/* Persona picker — switchable mid-conversation */}
              {!isNewConversation && (
                <PersonaPicker
                  sessionId={chat.sessionId}
                  sessionProjectSlug={chat.sessionMeta?.projectSlug}
                  showForkOption={!!chat.sessionId}
                  onForkWithPersona={handleForkWithPersona}
                />
              )}
              {/* Permission settings gear icon */}
              <button
                onClick={() => { setShowSettings(!showSettings); setShowAgentTree(false) }}
                className={`relative p-1.5 rounded-md transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="Permission settings"
              >
                <Settings className="w-4 h-4" />
                {modeColor && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a0d27]`} />
                )}
              </button>
              <button
                onClick={() => setMode('open')}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                title="Exit fullscreen"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMode('closed')}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fork bar — intent badge + close fork (breadcrumb handles navigation) */}
          {parentSessionId && (forkIntent || !isSessionCompleted) && (
            <div className="flex items-center gap-1 px-4 py-1.5 bg-violet-500/5 border-b border-violet-500/15">
              {forkIntent && forkIntent !== 'unknown' && (
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  forkIntent === 'job' ? 'bg-blue-500/15 text-blue-300' :
                  forkIntent === 'role' ? 'bg-amber-500/15 text-amber-300' :
                  forkIntent === 'scope' ? 'bg-emerald-500/15 text-emerald-300' :
                  'bg-gray-500/15 text-gray-400'
                }`}>
                  {forkIntent === 'job' ? '⚡ Job' : forkIntent === 'role' ? '🎭 Role' : '📋 Scope'}
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={handleCloseFork}
                disabled={isClosingFork}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors ${isClosingFork ? 'text-gray-600 cursor-wait' : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                title="Complete and close this fork"
              >
                {isClosingFork ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                {isClosingFork ? 'Closing...' : 'Close fork'}
              </button>
            </div>
          )}

          {/* Session breadcrumb — shown for any sub-conversation (spawned or forked) */}
          {parentSessionId && chat.sessionId && (
            <SessionBreadcrumb
              sessionId={chat.sessionId}
              rootSessionId={rootSessionId || undefined}
              onNavigate={handleTreeNavigate}
            />
          )}

          {/* Fork dialog (portal — rendered once, shared between layouts) */}
          <ForkDialog
            open={showForkDialog}
            onClose={() => setShowForkDialog(false)}
            sessionProjectSlug={chat.sessionMeta?.projectSlug}
            onSubmit={handleForkSubmit}
          />

          {/* Reconnecting / Disconnected banner */}
          {!isNewConversation && chat.wsStatus === 'reconnecting' && (
            <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span>Reconnecting...</span>
            </div>
          )}
          {!isNewConversation && chat.wsStatus === 'disconnected' && chat.sessionId && (
            <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-1.5">
              <span>Connection lost</span>
            </div>
          )}

          {/* ProjectSelect always mounted — manages chatWorkspaceHasProjectsAtom + chatSelectedProjectAtom via effects */}
          {/* Hidden when not in new conversation mode, but effects still populate the atoms */}
          <div className={isNewConversation ? '' : 'hidden'}>
            <ProjectSelect />
            <NewChatPersonaSelect />
          </div>

          {/* Settings panel overlay */}
          {showSettings ? (
            <PermissionSettingsPanel onClose={() => setShowSettings(false)} />
          ) : isNewConversation && !hasContext ? (
            <NoProjectsPlaceholder wsSlug={activeWsSlug} />
          ) : (
            <div className="flex flex-1 min-h-0">
              {/* Main conversation column */}
              <div className="flex flex-col flex-1 min-w-0">
                {/* Detached runs panel — fullscreen layout (runs only, forks are in sidebar ForkChildren) */}
                {detachedRuns.runs.filter(r => !r.isFork).length > 0 && (
                  <DetachedRunsPanel
                    runs={detachedRuns.runs.filter(r => !r.isFork)}
                    hasActiveRuns={detachedRuns.runs.filter(r => !r.isFork).some(r => r.isStreaming)}
                    onViewRun={handleViewRun}
                    onStopRun={handleStopRun}
                  />
                )}
                <ChatMessages
                  messages={chat.messages}
                  isStreaming={chat.isStreaming}
                  isLoadingHistory={chat.isLoadingHistory}
                  isReplaying={chat.isReplaying}
                  hasOlderMessages={chat.hasOlderMessages}
                  isLoadingOlder={chat.isLoadingOlder}
                  onLoadOlder={chat.loadOlderMessages}
                  hasNewerMessages={chat.hasNewerMessages}
                  isLoadingNewer={chat.isLoadingNewer}
                  onLoadNewer={chat.loadNewerMessages}
                  hasLiveActivity={chat.hasLiveActivity}
                  onJumpToTail={chat.jumpToTail}
                  onRespondPermission={chat.respondPermission}
                  onRespondInput={chat.respondInput}
                  onContinue={handleContinue}
                  onQuickAction={handleQuickAction}
                  onSelectSession={handleSelectSession}
                  selectedProject={selectedProject}
                />
                <CompactionBanner visible={chat.isCompacting} />
                {isSessionCompleted && (
                  <div className="flex items-center justify-center gap-2 px-2 py-1.5 border-t border-white/[0.06] bg-gray-500/[0.03]">
                    <CheckCircle2 className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className="text-[10px] text-gray-500">Ended — send a message to reactivate</span>
                    <button
                      onClick={handleForkClick}
                      className="text-[10px] text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2 py-0.5 rounded transition-colors ml-1"
                    >
                      Fork instead
                    </button>
                  </div>
                )}
                <ChatInput
                  onSend={handleSend}
                  onInterrupt={chat.interrupt}
                  isStreaming={chat.isStreaming}
                  disabled={isNewConversation && !hasContext}
                  sessionId={chat.sessionId}
                  onChangePermissionMode={chat.changePermissionMode}
                  onChangeModel={chat.changeModel}
                  onChangeAutoContinue={chat.changeAutoContinue}
                  prefill={prefill}
                />
              </div>

              {/* Agent Tree right panel — fullscreen layout */}
              {showAgentTree && rootSessionId && (
                <div className="w-80 shrink-0 border-l border-white/[0.06] flex flex-col overflow-y-auto p-3">
                  <DiscussionTreeView sessionId={rootSessionId} onNavigate={handleTreeNavigate} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- PANEL LAYOUT (non-fullscreen): toggle-based session list ---
  return (
    <div
      ref={panelRef}
      className={`fixed z-30 bg-surface-raised border-l border-border-subtle flex flex-col ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'} top-0 right-0 bottom-0 w-full`}
      style={{ maxWidth: isMobile ? undefined : panelWidth }}
    >
      {/* Resize handle — hidden on mobile (panel takes full width) */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-indigo-500/40 transition-colors hidden md:block ${isDragging ? 'bg-indigo-500/50' : ''}`}
      />

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => { setShowSessions(!showSessions); setShowSettings(false) }}
            className={`shrink-0 p-1.5 rounded-md transition-colors ${showSessions ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="Sessions"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex items-center gap-1.5">
            {/* WS status dot — only show when connected to a session */}
            {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
            <div className="min-w-0">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editingTitleValue}
                  onChange={(e) => setEditingTitleValue(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleTitleSubmit}
                  className="text-sm font-medium text-gray-200 bg-white/[0.06] border border-indigo-500/40 rounded px-1.5 py-0.5 outline-none w-full min-w-[120px]"
                  autoFocus
                />
              ) : (
                <span
                  className={`text-sm font-medium text-gray-300 truncate block group/title ${!isNewConversation ? 'cursor-pointer hover:text-gray-100' : ''}`}
                  onClick={handleTitleClick}
                  title={!isNewConversation ? 'Click to rename' : undefined}
                >
                  {headerTitle}
                  {!isNewConversation && (
                    <Pencil className="w-2.5 h-2.5 inline-block ml-1.5 opacity-0 group-hover/title:opacity-60 text-gray-500 transition-opacity" />
                  )}
                </span>
              )}
              {!isNewConversation && chat.sessionMeta?.workspaceSlug && (
                <Link
                  to={workspacePath(chat.sessionMeta.workspaceSlug, '/overview')}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-purple-400 hover:text-purple-300 truncate block transition-colors"
                >
                  ⬡ {chat.sessionMeta.workspaceSlug}
                </Link>
              )}
              {!isNewConversation && !chat.sessionMeta?.workspaceSlug && chat.sessionMeta?.projectSlug && activeWsSlug && (
                <Link
                  to={workspacePath(activeWsSlug, `/projects/${chat.sessionMeta.projectSlug}`)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 truncate block transition-colors"
                >
                  {chat.sessionMeta.projectSlug}
                </Link>
              )}
              {!isNewConversation && parentSessionId && parentName && (
                <button
                  onClick={handleBackToParent}
                  className="text-[10px] text-violet-400/70 hover:text-violet-300 truncate block transition-colors text-left"
                >
                  Sub &middot; {parentName}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewSession}
            disabled={isNewConversation}
            className={`p-1.5 rounded-md transition-colors ${isNewConversation ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Agent Tree toggle — visible when session has children */}
          {hasChildren && chat.sessionId && (
            <button
              onClick={() => { setShowAgentTree(!showAgentTree); setShowSettings(false); setShowSessions(false) }}
              className={`p-1.5 rounded-md transition-colors ${showAgentTree ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
              title="Agent Tree"
            >
              <TreePine className="w-4 h-4" />
            </button>
          )}
          {/* Fork button — create a sub-conversation */}
          {chat.sessionId && !isNewConversation && (
            <button
              onClick={handleForkClick}
              className="p-1.5 rounded-md text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="Fork conversation"
            >
              <GitFork className="w-4 h-4" />
            </button>
          )}
          {/* Persona picker — switchable mid-conversation */}
          {!isNewConversation && (
            <PersonaPicker
              sessionId={chat.sessionId}
              sessionProjectSlug={chat.sessionMeta?.projectSlug}
              showForkOption={!!chat.sessionId}
              onForkWithPersona={handleForkWithPersona}
            />
          )}
          {/* Permission settings gear icon */}
          <button
            onClick={() => { setShowSettings(!showSettings); setShowSessions(false); setShowAgentTree(false) }}
            className={`relative p-1.5 rounded-md transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="Permission settings"
          >
            <Settings className="w-4 h-4" />
            {modeColor && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} />
            )}
          </button>
          <button
            onClick={() => setMode('fullscreen')}
            className="p-1.5 rounded-md transition-colors hidden md:flex text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode('closed')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fork bar — intent badge + close fork (breadcrumb handles navigation) */}
      {parentSessionId && (forkIntent || !isSessionCompleted) && (
        <div className="flex items-center gap-1 px-4 py-1.5 bg-violet-500/5 border-b border-violet-500/15">
          {forkIntent && forkIntent !== 'unknown' && (
            <span className={`text-[8px] px-1.5 py-0.5 rounded-full shrink-0 ${
              forkIntent === 'job' ? 'bg-blue-500/15 text-blue-300' :
              forkIntent === 'role' ? 'bg-amber-500/15 text-amber-300' :
              forkIntent === 'scope' ? 'bg-emerald-500/15 text-emerald-300' :
              'bg-gray-500/15 text-gray-400'
            }`}>
              {forkIntent === 'job' ? '⚡ Job' : forkIntent === 'role' ? '🎭 Role' : '📋 Scope'}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={handleCloseFork}
            disabled={isClosingFork}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors ${isClosingFork ? 'text-gray-600 cursor-wait' : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
            title="Complete and close this fork"
          >
            {isClosingFork ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            {isClosingFork ? 'Closing...' : 'Close fork'}
          </button>
        </div>
      )}

      {/* Session breadcrumb — shown for any sub-conversation (spawned or forked) */}
      {parentSessionId && chat.sessionId && (
        <SessionBreadcrumb
          sessionId={chat.sessionId}
          rootSessionId={rootSessionId || undefined}
          onNavigate={handleTreeNavigate}
        />
      )}

      {/* Fork dialog is rendered in fullscreen layout above — it's a portal so only one instance needed */}

      {/* Reconnecting / Disconnected banner */}
      {!isNewConversation && chat.wsStatus === 'reconnecting' && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span>Reconnecting...</span>
        </div>
      )}
      {!isNewConversation && chat.wsStatus === 'disconnected' && chat.sessionId && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-1.5">
          <span>Connection lost</span>
        </div>
      )}

      {/* ProjectSelect always mounted — manages chatWorkspaceHasProjectsAtom + chatSelectedProjectAtom via effects */}
      <div className={isNewConversation && !showSettings && !showSessions ? '' : 'hidden'}>
        <ProjectSelect />
        <NewChatPersonaSelect />
      </div>

      {/* Content */}
      {showSettings ? (
        <PermissionSettingsPanel onClose={() => setShowSettings(false)} />
      ) : showSessions ? (
        <SessionList
          activeSessionId={chat.sessionId}
          onSelect={handleSelectSession}
          onClose={() => setShowSessions(false)}
        />
      ) : showAgentTree && rootSessionId ? (
        <div className="flex-1 overflow-y-auto p-3">
          <DiscussionTreeView sessionId={rootSessionId} onNavigate={handleTreeNavigate} />
        </div>
      ) : isNewConversation && !hasContext ? (
        <NoProjectsPlaceholder wsSlug={activeWsSlug} />
      ) : (
        <>
          {/* Detached runs panel — panel/sidebar layout (runs only, forks are in sidebar ForkChildren) */}
          {detachedRuns.runs.filter(r => !r.isFork).length > 0 && (
            <DetachedRunsPanel
              runs={detachedRuns.runs.filter(r => !r.isFork)}
              hasActiveRuns={detachedRuns.runs.filter(r => !r.isFork).some(r => r.isStreaming)}
              onViewRun={handleViewRun}
              onStopRun={handleStopRun}
            />
          )}
          <ChatMessages
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            isLoadingHistory={chat.isLoadingHistory}
            isReplaying={chat.isReplaying}
            hasOlderMessages={chat.hasOlderMessages}
            isLoadingOlder={chat.isLoadingOlder}
            onLoadOlder={chat.loadOlderMessages}
            hasNewerMessages={chat.hasNewerMessages}
            isLoadingNewer={chat.isLoadingNewer}
            onLoadNewer={chat.loadNewerMessages}
            hasLiveActivity={chat.hasLiveActivity}
            onJumpToTail={chat.jumpToTail}
            onRespondPermission={chat.respondPermission}
            onRespondInput={chat.respondInput}
            onContinue={handleContinue}
            onQuickAction={handleQuickAction}
            onSelectSession={handleSelectSession}
            selectedProject={selectedProject}
          />
          <CompactionBanner visible={chat.isCompacting} />
          {isSessionCompleted ? (
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/[0.06] bg-gray-500/[0.03]">
              <CheckCircle2 className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="text-xs text-gray-500">
                {forkIntent === 'job' ? 'Task completed' :
                 forkIntent === 'scope' ? 'Scope completed' :
                 'This conversation has ended'}
              </span>
              {forkIntent === 'job' && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">⚡ Job</span>
              )}
              {forkIntent === 'scope' && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">��� Scope</span>
              )}
              <button
                onClick={handleForkClick}
                className="text-[10px] text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2 py-0.5 rounded transition-colors ml-2"
              >
                Fork to continue
              </button>
            </div>
          ) : (
            <ChatInput
              onSend={handleSend}
              onInterrupt={chat.interrupt}
              isStreaming={chat.isStreaming}
              disabled={isNewConversation && !hasContext}
              sessionId={chat.sessionId}
              onChangePermissionMode={chat.changePermissionMode}
              onChangeModel={chat.changeModel}
              onChangeAutoContinue={chat.changeAutoContinue}
              prefill={prefill}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Full-area placeholder shown when the workspace has no projects */
function NoProjectsPlaceholder({ wsSlug }: { wsSlug: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      {/* Folder illustration — matches EmptyState style */}
      <svg width={72} height={72} viewBox="0 0 80 80" fill="none" aria-hidden="true" className="mb-5">
        <path d="M16 24h16l4-6h28a3 3 0 013 3v38a3 3 0 01-3 3H16a3 3 0 01-3-3V27a3 3 0 013-3z" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" />
        <line x1="13" y1="32" x2="67" y2="32" stroke="currentColor" className="text-gray-700" strokeWidth="1" />
        <rect x="24" y="40" width="16" height="2" rx="1" className="fill-gray-700" />
        <rect x="24" y="46" width="12" height="2" rx="1" className="fill-gray-700/50" />
        <circle cx="58" cy="52" r="10" className="fill-indigo-500/10" />
        <path d="M55 52h6M58 49v6" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <h3 className="text-base font-medium text-gray-200 mb-1.5">No projects yet</h3>
      <p className="text-sm text-gray-500 max-w-[240px] mb-5">
        Add a project to this workspace to start a conversation with Claude.
      </p>

      {wsSlug && (
        <Link
          to={workspacePath(wsSlug, '/projects')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          Add a project
        </Link>
      )}
    </div>
  )
}
