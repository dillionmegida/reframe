import { useState } from 'react'
import styled from 'styled-components'
import { useAppStore } from '../store/appStore'

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0e0e0e;
`

const Panel = styled.div`
  width: 480px;
  background-color: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.75rem;
  padding: 2rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/noise.svg');
    background-repeat: repeat;
    opacity: 0.4;
    pointer-events: none;
    border-radius: 0.75rem;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: #e5e5e5;
  margin-bottom: 0.5rem;
`

const Description = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
`

const ErrorBox = styled.div`
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
  font-size: 0.75rem;
`

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`

const Label = styled.label`
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 0.5rem;
`

const InputRow = styled.div`
  display: flex;
  gap: 0.5rem;
`

const PathDisplay = styled.div`
  flex: 1;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #2a2a2a;
  font-size: 0.875rem;
  color: #e5e5e5;
  font-family: 'IBM Plex Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const BrowseButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.1);
  color: #e5e5e5;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }
`

const HintText = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.5rem;

  span {
    font-family: 'IBM Plex Mono', monospace;
  }
`

const ConfirmButton = styled.button<{ $enabled: boolean }>`
  width: 100%;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.25rem;
  border: none;
  cursor: ${props => props.$enabled ? 'pointer' : 'not-allowed'};
  transition: background-color 0.2s;
  background: ${props => props.$enabled ? '#f97316' : 'rgba(255, 255, 255, 0.05)'};
  color: ${props => props.$enabled ? '#000' : 'rgba(107, 114, 128, 0.4)'};

  &:hover {
    background: ${props => props.$enabled ? 'rgba(249, 115, 22, 0.9)' : 'rgba(255, 255, 255, 0.05)'};
  }
`

export default function BasePathSetup() {
  const setBasePath = useAppStore((s) => s.setBasePath)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectDirectory = async () => {
    setError(null)
    try {
      const path = await window.electron.selectDirectory()
      if (path) {
        setSelectedPath(path)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select directory')
    }
  }

  const handleConfirm = async () => {
    if (!selectedPath) return
    setError(null)
    try {
      await window.electron.ensureDirectory(selectedPath)
      setBasePath(selectedPath)
    } catch (err: any) {
      setError(err.message || 'Failed to create directory')
    }
  }

  return (
    <Container>
      <Panel>
        <Title>Welcome to Reframe</Title>
        <Description>
          Choose a base folder where all your projects will be stored.
        </Description>

        {error && <ErrorBox>{error}</ErrorBox>}

        <FormGroup>
          <Label>Base Folder</Label>
          <InputRow>
            <PathDisplay data-testid="base-path-display">
              {selectedPath || 'No folder selected'}
            </PathDisplay>
            <BrowseButton onClick={handleSelectDirectory} data-testid="browse-button">
              Browse
            </BrowseButton>
          </InputRow>
          <HintText>
            Projects will be organized as: <span>base-folder/project-name/</span>
          </HintText>
        </FormGroup>

        <ConfirmButton
          onClick={handleConfirm}
          disabled={!selectedPath}
          $enabled={!!selectedPath}
          data-testid="confirm-base-path-button"
        >
          Continue
        </ConfirmButton>
      </Panel>
    </Container>
  )
}
