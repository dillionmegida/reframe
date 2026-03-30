import { useState } from 'react'
import styled from 'styled-components'
import { useAppStore } from '../store/appStore'

const Wrapper = styled.div`
  width: 200px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #161616;
  border-right: 1px solid #2a2a2a;
  position: relative;
  user-select: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/noise.svg');
    background-repeat: repeat;
    opacity: 0.4;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`

const Header = styled.div`
  height: 3rem;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  gap: 0.5rem;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
`

const Title = styled.span`
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  color: #6b7280;
  text-transform: uppercase;
`

const Spacer = styled.div`
  flex: 1;
`

const IconButton = styled.button`
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e5e5e5;
  }
`

const NewInputContainer = styled.div`
  padding: 0.5rem;
  border-bottom: 1px solid rgba(42, 42, 42, 0.5);
`

const NewInput = styled.input`
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #2a2a2a;
  border-radius: 0.375rem;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: #e5e5e5;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #f97316;
  }
`

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
`

const EmptyState = styled.div`
  padding: 1.5rem 0.75rem;
  text-align: center;
`

const EmptyText = styled.p`
  font-size: 0.6875rem;
  color: #6b7280;
`

const LinkButton = styled.button`
  margin-top: 0.5rem;
  font-size: 0.6875rem;
  color: #f97316;
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: underline;
`

const ProjectButton = styled.button<{ $active: boolean }>`
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  border: none;
  background: ${(p) => (p.$active ? 'rgba(255, 255, 255, 0.08)' : 'transparent')};
  color: ${(p) => (p.$active ? '#e5e5e5' : '#6b7280')};
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #e5e5e5;
  }
`

const FolderIcon = styled.svg`
  opacity: 0.5;
  flex-shrink: 0;
`

const ProjectName = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ContextBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
`

const ContextMenu = styled.div`
  position: fixed;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  padding: 0.25rem 0;
  z-index: 50;
  min-width: 120px;
`

const ContextItem = styled.button`
  width: 100%;
  text-align: left;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  color: #f87171;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

export default function Sidebar() {
  const projects = useAppStore((s) => s.projects)
  const route = useAppStore((s) => s.route)
  const navigate = useAppStore((s) => s.navigate)
  const createProject = useAppStore((s) => s.createProject)
  const deleteProject = useAppStore((s) => s.deleteProject)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const activeProjectId = route.view !== 'projects' ? route.projectId : null

  const handleCreate = () => {
    const name = newName.trim() || 'Untitled'
    createProject(name)
    setNewName('')
    setShowNew(false)
  }

  const sorted = [...projects].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <Wrapper>
      <Header style={{ WebkitAppRegion: 'drag' } as any}>
        <div style={{ width: 52 }} />
        <Title>Projects</Title>
        <Spacer />
        <IconButton onClick={() => setShowNew(true)} style={{ WebkitAppRegion: 'no-drag' } as any} title="New project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </IconButton>
      </Header>

      {showNew && (
        <NewInputContainer>
          <NewInput
            autoFocus
            placeholder="Project name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setShowNew(false)
                setNewName('')
              }
            }}
            onBlur={() => {
              if (!newName.trim()) {
                setShowNew(false)
              }
            }}
          />
        </NewInputContainer>
      )}

      <List>
        {sorted.length === 0 && !showNew && (
          <EmptyState>
            <EmptyText>No projects yet</EmptyText>
            <LinkButton onClick={() => setShowNew(true)}>Create one</LinkButton>
          </EmptyState>
        )}

        {sorted.map((p) => (
          <ProjectButton
            key={p.id}
            $active={activeProjectId === p.id}
            onClick={() => navigate({ view: 'project', projectId: p.id })}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, id: p.id })
            }}
          >
            <FolderIcon width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </FolderIcon>
            <ProjectName>{p.name}</ProjectName>
          </ProjectButton>
        ))}
      </List>

      {contextMenu && (
        <>
          <ContextBackdrop onClick={() => setContextMenu(null)} />
          <ContextMenu style={{ left: contextMenu.x, top: contextMenu.y }}>
            <ContextItem
              onClick={() => {
                deleteProject(contextMenu.id)
                setContextMenu(null)
              }}
            >
              Delete project
            </ContextItem>
          </ContextMenu>
        </>
      )}
    </Wrapper>
  )
}
