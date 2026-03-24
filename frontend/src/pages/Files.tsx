import { useState } from 'react'
import { useQuery } from 'react-query'
import { Folder, File, ChevronRight, ChevronDown, Save, Loader2 } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { filesApi } from '../services/api'
import { formatBytes } from '../lib/utils'
import type { FileNode } from '../types'

export function FilesPage() {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)

  const { data: tree, isLoading } = useQuery<FileNode[]>(
    'files-tree',
    async () => {
      const response = await filesApi.getTree()
      return response.data.data
    }
  )

  const toggleDir = (path: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedDirs(newExpanded)
  }

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'directory') {
      toggleDir(node.path)
      return
    }

    const response = await filesApi.getContent(node.path)
    setSelectedFile(node)
    setFileContent(response.data.data.content)
  }

  const handleSave = async () => {
    if (!selectedFile) return
    
    setIsSaving(true)
    try {
      await filesApi.updateContent(selectedFile.path, fileContent)
    } finally {
      setIsSaving(false)
    }
  }

  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedDirs.has(node.path)
      const paddingLeft = level * 16 + 8

      return (
        <div key={node.path}>
          <button
            onClick={() => handleFileClick(node)}
            className="w-full flex items-center gap-1 px-2 py-1 hover:bg-muted text-left text-sm"
            style={{ paddingLeft }}
          >
            {node.type === 'directory' && (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            )}
            {node.type === 'directory' ? (
              <Folder className="w-4 h-4 text-yellow-500" />
            ) : (
              <File className="w-4 h-4 text-blue-500" />
            )}
            <span className="truncate">{node.name}</span>
            {node.size && (
              <span className="text-xs text-muted-foreground ml-auto">
                {formatBytes(node.size)}
              </span>
            )}
          </button>
          {node.type === 'directory' && isExpanded && node.children && (
            <div>{renderTree(node.children, level + 1)}</div>
          )}
        </div>
      )
    })
  }

  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'md': return 'markdown'
      case 'json': return 'json'
      case 'js': return 'javascript'
      case 'ts': return 'typescript'
      case 'yaml':
      case 'yml': return 'yaml'
      default: return 'plaintext'
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* File tree */}
      <div className="w-64 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-3 border-b border-border font-medium">Files</div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            tree && renderTree(tree)
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="font-medium">{selectedFile.name}</span>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                <Save className="w-3 h-3" />
                Save
              </button>
            </div>
            <div className="flex-1">
              <Editor
                height="100%"
                language={getLanguage(selectedFile.name)}
                value={fileContent}
                onChange={(value) => setFileContent(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  )
}
