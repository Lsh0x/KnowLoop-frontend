import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { chatSelectedProjectAtom } from '@/atoms'
import type { Persona } from '@/types'
import { GitFork, Search, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { usePersonaData, useGroupedPersonas, PersonaRow, Section } from './PersonaPicker'

interface ForkDialogProps {
  open: boolean
  onClose: () => void
  /** Project slug from the session — resolves correct project in forks */
  sessionProjectSlug?: string | null
  onSubmit: (title?: string, persona?: Persona | null) => void
}

export const ForkDialog = memo(function ForkDialog({ open, onClose, sessionProjectSlug, onSubmit }: ForkDialogProps) {
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const { loading, projects, personasByProject, globalPersonas } = usePersonaData(open)

  // Resolve active project from session slug
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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setTitle('')
      setSearch('')
      setSelectedPersona(null)
      setTimeout(() => titleRef.current?.focus(), 100)
    }
  }, [open])

  const handleSubmit = useCallback(() => {
    onSubmit(title.trim() || undefined, selectedPersona)
    onClose()
  }, [title, selectedPersona, onSubmit, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleSelectPersona = useCallback((persona: Persona) => {
    setSelectedPersona(prev => prev?.id === persona.id ? null : persona)
  }, [])

  return (
    <Dialog open={open} onClose={onClose} title="Fork Conversation" size="md">
      {/* Title input */}
      <div className="mb-4">
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
          Fork title
        </label>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Optional — describe the fork's purpose"
          className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-violet-500/40 transition-colors"
        />
      </div>

      {/* Persona selection */}
      <div className="mb-4">
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
          Persona {selectedPersona && <span className="text-amber-400 normal-case">— {selectedPersona.name}</span>}
        </label>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter personas..."
            className="w-full pl-9 pr-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 transition-colors"
          />
        </div>

        {/* Persona list */}
        <div className="max-h-52 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02]">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          ) : totalMatches === 0 ? (
            <div className="py-6 text-center text-xs text-gray-500">
              {search ? `No personas matching "${search}"` : 'No personas found'}
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
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
                      isActive={selectedPersona?.id === persona.id}
                      onSelect={handleSelectPersona}
                    />
                  ))}
                </Section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 hover:text-violet-200 border border-violet-500/20 transition-colors"
      >
        <GitFork className="w-4 h-4" />
        <span>Create Fork{selectedPersona ? ` with ${selectedPersona.name}` : ''}</span>
      </button>
    </Dialog>
  )
})
