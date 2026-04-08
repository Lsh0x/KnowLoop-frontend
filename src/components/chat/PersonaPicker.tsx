import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { chatActivePersonaAtom, chatSelectedProjectAtom, activeWorkspaceSlugAtom, chatSessionPersonaMapAtom } from '@/atoms'
import { personasApi, workspacesApi } from '@/services'
import { chatApi } from '@/services/chat'
import type { Persona, Project } from '@/types'
import { ChevronDown, ChevronRight, UserCircle, X, GitFork, Loader2, Search } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'

// ── Types ────────────────────────────────────────────────────────────────

interface PersonaGroup {
  label: string
  projectSlug?: string
  personas: Persona[]
}

// ── Shared persona row ───────────────────────────────────────────────────

interface PersonaRowProps {
  persona: Persona
  isActive: boolean
  onSelect: (persona: Persona) => void
  onForkWithPersona?: (persona: Persona) => void
  showForkOption?: boolean
}

export function PersonaRow({ persona, isActive, onSelect, onForkWithPersona, showForkOption }: PersonaRowProps) {
  return (
    <div className="group/persona">
      <button
        onClick={() => onSelect(persona)}
        className={`w-full text-left px-3 py-2 text-sm flex items-start gap-3 transition-colors rounded-lg ${
          isActive ? 'text-gray-100 bg-amber-500/10' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
        }`}
      >
        <UserCircle className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-amber-400/50'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{persona.name}</span>
            {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 shrink-0">active</span>}
          </div>
          {persona.description && (
            <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{persona.description}</span>
          )}
        </div>
        {showForkOption && onForkWithPersona && (
          <button
            onClick={(e) => { e.stopPropagation(); onForkWithPersona(persona) }}
            className="shrink-0 p-1 rounded opacity-0 group-hover/persona:opacity-100 text-violet-400 hover:bg-violet-500/10 transition-all"
            title="Fork with this persona"
          >
            <GitFork className="w-3.5 h-3.5" />
          </button>
        )}
      </button>
    </div>
  )
}

// ── Collapsible section ──────────────────────────────────────────────────

interface SectionProps {
  label: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
  forceOpen?: boolean
}

export function Section({ label, count, defaultOpen = false, children, forceOpen }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = forceOpen || open

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-400 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>{label}</span>
        <span className="text-gray-600">({count})</span>
      </button>
      {isOpen && <div className="pb-1">{children}</div>}
    </div>
  )
}

// ── Data loading hook ────────────────────────────────────────────────────

export function usePersonaData(shouldLoad: boolean) {
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const activeWsSlug = useAtomValue(activeWorkspaceSlugAtom)
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [personasByProject, setPersonasByProject] = useState<Map<string, Persona[]>>(new Map())
  const [globalPersonas, setGlobalPersonas] = useState<Persona[]>([])

  useEffect(() => {
    if (!shouldLoad) return
    let cancelled = false
    setLoading(true)

    const load = async () => {
      try {
        // 1. Get workspace projects
        let wsProjects: Project[] = []
        if (activeWsSlug) {
          try {
            const data = await workspacesApi.listProjects(activeWsSlug)
            wsProjects = Array.isArray(data) ? data : []
          } catch { /* ignore */ }
        }

        // 2. Load personas for all projects + globals in parallel
        const results = await Promise.all([
          ...wsProjects.map(p =>
            personasApi.list({ project_id: p.id, limit: 50 })
              .then(res => ({ projectId: p.id, personas: res.items ?? [] }))
              .catch(() => ({ projectId: p.id, personas: [] as Persona[] }))
          ),
          personasApi.listGlobal({ limit: 50 })
            .then(res => ({ projectId: '__global__', personas: Array.isArray(res) ? res : (res as { items: Persona[] }).items ?? [] }))
            .catch(() => ({ projectId: '__global__', personas: [] as Persona[] })),
        ])

        if (!cancelled) {
          const byProject = new Map<string, Persona[]>()
          let globals: Persona[] = []
          for (const { projectId, personas } of results) {
            if (projectId === '__global__') {
              globals = personas
            } else if (personas.length > 0) {
              byProject.set(projectId, personas)
            }
          }
          setProjects(wsProjects)
          setPersonasByProject(byProject)
          setGlobalPersonas(globals)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [shouldLoad, activeWsSlug])

  return { loading, projects, personasByProject, globalPersonas, selectedProject }
}

// ── Build grouped structure ──────────────────────────────────────────────

export function useGroupedPersonas(
  projects: Project[],
  personasByProject: Map<string, Persona[]>,
  globalPersonas: Persona[],
  selectedProjectId: string | null | undefined,
  search: string,
) {
  return useMemo(() => {
    const q = search.toLowerCase().trim()
    const matchesSearch = (p: Persona) =>
      !q || p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false)

    const groups: PersonaGroup[] = []

    // Sort projects: selected project first, then by persona count (desc)
    const sortedProjects = [...projects].sort((a, b) => {
      if (a.id === selectedProjectId) return -1
      if (b.id === selectedProjectId) return 1
      return (personasByProject.get(b.id)?.length ?? 0) - (personasByProject.get(a.id)?.length ?? 0)
    })

    // 1. Projects with personas (selected first, then by count desc)
    for (const project of sortedProjects) {
      const personas = (personasByProject.get(project.id) ?? []).filter(matchesSearch)
      if (personas.length > 0 || (!q && project.id === selectedProjectId)) {
        const isActive = project.id === selectedProjectId
        groups.push({
          label: isActive ? `${project.name} (active)` : project.name,
          projectSlug: project.slug,
          personas,
        })
      }
    }

    // 2. Globals
    const filteredGlobals = globalPersonas.filter(matchesSearch)
    if (filteredGlobals.length > 0 || (!q && globalPersonas.length > 0)) {
      groups.push({ label: 'Global', personas: filteredGlobals })
    }

    const totalMatches = groups.reduce((sum, g) => sum + g.personas.length, 0)
    return { groups, totalMatches }
  }, [projects, personasByProject, globalPersonas, selectedProjectId, search])
}

// ── Header PersonaPicker (modal button in the chat header) ───────────────

interface PersonaPickerProps {
  sessionId?: string | null
  /** Project slug from the session — used to determine the real active project (especially in forks) */
  sessionProjectSlug?: string | null
  showForkOption?: boolean
  onForkWithPersona?: (persona: Persona) => void
}

export const PersonaPicker = memo(function PersonaPicker({ sessionId, sessionProjectSlug, showForkOption, onForkWithPersona }: PersonaPickerProps) {
  const [activePersona, setActivePersona] = useAtom(chatActivePersonaAtom)
  const [personaMap, setPersonaMap] = useAtom(chatSessionPersonaMapAtom)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [restoredForSession, setRestoredForSession] = useState<string | null>(null)

  // Whether this session already has a locked persona (persisted)
  const isLocked = !!(sessionId && personaMap[sessionId] && activePersona)

  // Load persona data when modal opens OR when restoring persona for session
  const shouldLoad = showModal || !!(sessionId && personaMap[sessionId] && !activePersona && restoredForSession !== sessionId)
  const { loading, projects, personasByProject, globalPersonas, selectedProject } =
    usePersonaData(shouldLoad)

  // Resolve active project
  const activeProjectId = useMemo(() => {
    if (sessionProjectSlug) {
      const match = projects.find(p => p.slug === sessionProjectSlug)
      if (match) return match.id
    }
    return selectedProject?.id ?? null
  }, [sessionProjectSlug, projects, selectedProject?.id])

  const { groups, totalMatches } = useGroupedPersonas(
    projects, personasByProject, globalPersonas, activeProjectId, search,
  )

  // Restore persona from localStorage when session loads
  useEffect(() => {
    if (!sessionId || restoredForSession === sessionId) return
    const savedPersonaId = personaMap[sessionId]
    if (!savedPersonaId) {
      setRestoredForSession(sessionId)
      return
    }
    // Find the persona in loaded data
    for (const personas of personasByProject.values()) {
      const found = personas.find(p => p.id === savedPersonaId)
      if (found) {
        setActivePersona(found)
        setRestoredForSession(sessionId)
        return
      }
    }
    const foundGlobal = globalPersonas.find(p => p.id === savedPersonaId)
    if (foundGlobal) {
      setActivePersona(foundGlobal)
      setRestoredForSession(sessionId)
    }
  }, [sessionId, personaMap, personasByProject, globalPersonas, restoredForSession, setActivePersona])

  // Auto-focus search when modal opens
  useEffect(() => {
    if (showModal) {
      setSearch('')
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [showModal])

  const handleSelect = useCallback((persona: Persona) => {
    setActivePersona(persona)
    setShowModal(false)
    // Persist to localStorage
    if (sessionId) {
      setPersonaMap(prev => ({ ...prev, [sessionId]: persona.id }))
      chatApi.activateSessionPersona(sessionId, persona.id).catch(() => {})
    }
  }, [sessionId, setActivePersona, setPersonaMap])

  const handleForkWithPersona = useCallback((persona: Persona) => {
    setShowModal(false)
    onForkWithPersona?.(persona)
  }, [onForkWithPersona])

  return (
    <>
      {/* Persona badge — always visible in header */}
      {activePersona ? (
        <div
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border bg-amber-500/10 border-amber-500/30 text-amber-300"
          title={`Persona: ${activePersona.name} (locked for this session)`}
        >
          <UserCircle className="w-3 h-3 text-amber-400" />
          <span className="max-w-[100px] truncate font-medium">{activePersona.name}</span>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-all duration-300 bg-white/[0.04] border-white/[0.08] text-gray-300 hover:bg-white/[0.06]"
          title="Select persona"
        >
          <UserCircle className="w-3 h-3 text-gray-500" />
          <span>Persona</span>
          <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
        </button>
      )}

      <Dialog open={showModal} onClose={() => setShowModal(false)} title="Select Persona" size="md">
        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search personas..."
            className="w-full pl-10 pr-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 transition-colors"
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : totalMatches === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {search ? `No personas matching "${search}"` : 'No personas found'}
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map((group, gi) => (
              <Section
                key={group.label}
                label={group.label}
                count={group.personas.length}
                defaultOpen={gi === 0}
                forceOpen={!!search}
              >
                {group.personas.map(persona => (
                  <PersonaRow
                    key={persona.id}
                    persona={persona}
                    isActive={activePersona?.id === persona.id}
                    onSelect={handleSelect}
                    onForkWithPersona={showForkOption ? handleForkWithPersona : undefined}
                    showForkOption={showForkOption}
                  />
                ))}
              </Section>
            ))}
          </div>
        )}
      </Dialog>
    </>
  )
})

// ── New Conversation Persona Select (inline for new chat screen) ─────────

export const NewChatPersonaSelect = memo(function NewChatPersonaSelect() {
  const [activePersona, setActivePersona] = useAtom(chatActivePersonaAtom)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const { loading, projects, personasByProject, globalPersonas, selectedProject } =
    usePersonaData(showModal)

  const { groups, totalMatches } = useGroupedPersonas(
    projects, personasByProject, globalPersonas, selectedProject?.id ?? null, search,
  )

  useEffect(() => {
    if (showModal) {
      setSearch('')
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [showModal])

  const handleSelect = useCallback((persona: Persona) => {
    setActivePersona(persona)
    setShowModal(false)
  }, [setActivePersona])

  const handleClear = useCallback(() => {
    setActivePersona(null)
  }, [setActivePersona])

  return (
    <div className="px-4 py-2 border-b border-white/[0.06]">
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
        Persona
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowModal(true)}
          className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            activePersona
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-white/[0.04] border-white/[0.08] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
          }`}
        >
          <UserCircle className={`w-4 h-4 shrink-0 ${activePersona ? 'text-amber-400' : 'text-gray-600'}`} />
          <span className="truncate">{activePersona ? activePersona.name : 'No persona (default)'}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-auto text-gray-500 shrink-0" />
        </button>
        {activePersona && (
          <button
            onClick={handleClear}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear persona"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <Dialog open={showModal} onClose={() => setShowModal(false)} title="Select Persona" size="md">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search personas..."
            className="w-full pl-10 pr-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 transition-colors"
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : totalMatches === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {search ? `No personas matching "${search}"` : 'No personas found'}
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map((group, gi) => (
              <Section
                key={group.label}
                label={group.label}
                count={group.personas.length}
                defaultOpen={gi === 0}
                forceOpen={!!search}
              >
                {group.personas.map(persona => (
                  <PersonaRow
                    key={persona.id}
                    persona={persona}
                    isActive={activePersona?.id === persona.id}
                    onSelect={handleSelect}
                  />
                ))}
              </Section>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  )
})

// ── Inline PersonaPicker (for fork creation bar — stays as dropdown) ─────

interface InlinePersonaPickerProps {
  value: Persona | null
  onChange: (persona: Persona | null) => void
}

export const InlinePersonaPicker = memo(function InlinePersonaPicker({ value, onChange }: InlinePersonaPickerProps) {
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const activeWsSlug = useAtomValue(activeWorkspaceSlugAtom)
  const [showDropdown, setShowDropdown] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showDropdown) return
    let cancelled = false
    setLoading(true)

    const loadPersonas = async () => {
      try {
        const pids: string[] = []
        if (selectedProject?.id) pids.push(selectedProject.id)
        if (activeWsSlug) {
          try {
            const data = await workspacesApi.listProjects(activeWsSlug)
            const items = Array.isArray(data) ? data : []
            for (const p of items) {
              if (!pids.includes(p.id)) pids.push(p.id)
            }
          } catch { /* ignore */ }
        }

        const results = await Promise.all([
          ...pids.map(pid =>
            personasApi.list({ project_id: pid, limit: 50 }).catch(() => ({ items: [] as Persona[] }))
          ),
          personasApi.listGlobal({ limit: 50 }).catch(() => ({ items: [] as Persona[] })),
        ])

        if (!cancelled) {
          const seen = new Set<string>()
          const all: Persona[] = []
          for (const res of results) {
            const items = Array.isArray(res) ? res : (res.items ?? [])
            for (const p of items) {
              if (!seen.has(p.id)) { seen.add(p.id); all.push(p) }
            }
          }
          setPersonas(all)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPersonas()
    return () => { cancelled = true }
  }, [showDropdown, selectedProject?.id, activeWsSlug])

  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  const handleSelect = useCallback((persona: Persona) => {
    onChange(persona)
    setShowDropdown(false)
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange(null)
    setShowDropdown(false)
  }, [onChange])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
          value
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
            : 'bg-white/[0.04] border-white/[0.08] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
        }`}
        title={value ? `Persona: ${value.name}` : 'Attach persona to fork'}
      >
        <UserCircle className={`w-3 h-3 ${value ? 'text-amber-400' : 'text-gray-500'}`} />
        <span className="max-w-[60px] truncate">{value ? value.name : 'Persona'}</span>
        {value ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleClear() }}
            className="p-0 text-gray-500 hover:text-gray-300"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        ) : (
          <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
        )}
      </button>
      {showDropdown && (
        <div className="absolute bottom-full left-0 mb-1 z-20 w-56 bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
            </div>
          ) : personas.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500 text-center">No personas found</div>
          ) : (
            <div className="py-1">
              {personas.map(persona => (
                <PersonaRow
                  key={persona.id}
                  persona={persona}
                  isActive={value?.id === persona.id}
                  onSelect={handleSelect}
                />
              ))}
              {value && (
                <>
                  <div className="border-t border-white/[0.06] my-1" />
                  <button
                    onClick={handleClear}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] flex items-center gap-2 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear persona</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
