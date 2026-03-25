import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { Folder, File, ChevronRight, ChevronDown, Save, Loader2, Home, ArrowLeft } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { filesApi } from '../services/api'
import { formatBytes } from '../lib/utils'
import type { FileNode } from '../types'

interface FileNodeWithImportance extends FileNode {
  importance?: { color: string; label: string };
  hasMoreChildren?: boolean;
}

export function FilesPage() {
  const [selectedFile, setSelectedFile] = useState<FileNodeWithImportance | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']))
  const [currentPath, setCurrentPath] = useState('/')
  const [isSaving, setIsSaving] = useState(false)
  const queryClient = useQueryClient()

  const { data: tree, isLoading } = useQuery<FileNodeWithImportance[]>(
    ['files-tree', currentPath],
    async () => {
      const response = await filesApi.getTree(currentPath)
      return response.data.data
    },
    { keepPreviousData: true }
  )

  const toggleDir = useCallback(async (node: FileNodeWithImportance) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path)
    } else {
      newExpanded.add(node.path)
      // If directory has more children, fetch them
      if (node.hasMoreChildren && !node.children?.length) {
        await queryClient.invalidateQueries(['files-tree', node.path])
      }
    }
    setExpandedDirs(newExpanded)
  }, [expandedDirs, queryClient])

  const navigateTo = (path: string) => {
    setCurrentPath(path)
    setExpandedDirs(prev => new Set([...prev, path]))
  }

  const navigateUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    setCurrentPath(parent)
  }

  const handleFileClick = async (node: FileNodeWithImportance) => {
    if (node.type === 'directory') {
      if (node.children?.length || node.hasMoreChildren) {
        toggleDir(node)
      } else {
        navigateTo(node.path)
      }
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

  const getFolderColor = (node: FileNodeWithImportance) => {
    if (node.importance) {
      return node.importance.color
    }
    return '#eab308' // Default yellow
  }

  const renderBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean)
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground overflow-hidden">
        <button 
          onClick={() => navigateTo('/')}
          className="hover:text-foreground flex items-center gap-1"
        >
          <Home className="w-3 h-3" />
          root
        </button>
        {parts.map((part, i) => (
          <span key={i} className="flex items-center">
            <ChevronRight className="w-3 h-3" />
            <button 
              onClick={() => navigateTo('/' + parts.slice(0, i + 1).join('/'))}
              className="hover:text-foreground truncate max-w-[100px]"
            >
              {part}
            </button>
          </span>
        ))}
      </div>
    )
  }

  const renderTree = (nodes: FileNodeWithImportance[], level = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedDirs.has(node.path)
      const paddingLeft = level * 16 + 8
      const folderColor = getFolderColor(node)

      return (
        <div key={node.path}>
          <button
            onClick={() => handleFileClick(node)}
            className="w-full flex items-center gap-1 px-2 py-1 hover:bg-muted text-left text-sm group"
            style={{ paddingLeft }}
            title={node.importance?.label}
          >
            {node.type === 'directory' && (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            )}
            {node.type === 'directory' ? (
              <Folder 
                className="w-4 h-4 transition-colors" 
                style={{ color: folderColor }}
              />
            ) : (
              <File className="w-4 h-4 text-blue-500" />
            )}
            <span className="truncate">{node.name}</span>
            {node.importance && (
              <span 
                className="text-[10px] px-1 rounded ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: node.importance.color + '40', color: node.importance.color }}
              >
                {node.importance.label}
              </span>
            )}
            {node.size && (
              <span className="text-xs text-muted-foreground ml-auto">
                {formatBytes(node.size)}
              </span>
            )}
          </button>
          {node.type === 'directory' && isExpanded && (
            <div>
              {node.children && renderTree(node.children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  const renderLegend = () => {
    const importantPaths = [
      { path: '/root/.openclaw', color: '#e8ff5a', label: 'OpenClaw' },
      { path: '/root/.openclaw/agents', color: '#60a5fa', label: 'Agents' },
      { path: '/root/.openclaw/skills', color: '#f472b6', label: 'Skills' },
      { path: '/root/.ssh', color: '#f87171', label: 'SSH Keys' },
      { path: '/root/clawpanel', color: '#34d399', label: 'ClawPanel' },
      { path: '/etc', color: '#fb923c', label: 'System' },
    ]

    return (
      <div className="p-2 border-t border-border">
        <div className="text-xs font-medium text-muted-foreground mb-2">Important Directories</div>
        <div className="space-y-1">
          {importantPaths.map((item) => (
            <button
              key={item.path}
              onClick={() => navigateTo(item.path)}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded text-left"
            >
              <Folder className="w-3 h-3" style={{ color: item.color }} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
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
      case 'sh': return 'shell'
      case 'py': return 'python'
      case 'css': return 'css'
      case 'html': return 'html'
      default: return 'plaintext'
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* File tree */}
      <div className="w-72 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="font-medium mb-2">Files</div>
          {renderBreadcrumbs()}
        </div>
        
        <div className="flex-1 overflow-auto">
          {currentPath !== '/' && (
            <button
              onClick={navigateUp}
              className="w-full flex items-center gap-1 px-2 py-1 hover:bg-muted text-left text-sm text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>..</span>
            </button>
          )}
          
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            tree && renderTree(tree)
          )}
        </div>
        
        {renderLegend()}
      </div>

      {/* Editor */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">{selectedFile.path}</span>
              </div>
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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Folder className="w-12 h-12 mb-2 opacity-20" />
            <p>Select a file to edit</p>
            <p className="text-sm mt-1">Navigate through VPS filesystem</p>
          </div>
        )}
      </div>
    </div>
  )
}
