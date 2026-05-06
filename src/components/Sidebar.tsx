import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Project } from '../types';
import { 
  FileCode2, 
  FileJson, 
  FileText, 
  File as FileIcon, 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  Plus,
  FolderPlus,
  Trash2,
  Edit3,
  Copy,
  Scissors,
  Clipboard,
  Download
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

export function Sidebar({ project, setActiveFile, addFile, deleteFile, renameFile }: {
  project: Project | null;
  setActiveFile: (name: string) => void;
  addFile: (name: string, language: string) => void;
  deleteFile: (name: string) => void;
  renameFile: (oldName: string, newName: string) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, type: 'file' | 'folder' } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [editingPath, setEditingPath] = useState<{ path: string, isNew: boolean, type: 'file' | 'folder' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (editingPath && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPath]);

  const tree = useMemo(() => {
    if (!project) return [];
    const root: FileTreeNode[] = [];
    const files = Object.keys(project.files);

    files.forEach(path => {
      const parts = path.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;
        
        let node = currentLevel.find(n => n.name === part);
        if (!node) {
          node = {
            name: part,
            path: currentPath,
            type: isLast ? 'file' : 'folder',
            children: isLast ? undefined : []
          };
          currentLevel.push(node);
          currentLevel.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        }
        if (!isLast) {
          currentLevel = node.children!;
        }
      });
    });

    return root;
  }, [project?.files]);

  if (!project) return <div className="h-full bg-[#252526]" />;

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
  };

  const getIcon = (name: string, type: 'file' | 'folder', isOpen?: boolean) => {
    if (type === 'folder') {
      return isOpen ? <FolderOpen size={16} className="text-[#dcb67a] mr-1.5 shrink-0" /> : <Folder size={16} className="text-[#dcb67a] mr-1.5 shrink-0" />;
    }
    if (name.endsWith('.html')) return <FileCode2 size={16} className="text-orange-500 mr-1.5 shrink-0" />;
    if (name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.ts') || name.endsWith('.tsx')) return <FileJson size={16} className="text-yellow-400 mr-1.5 shrink-0" />;
    if (name.endsWith('.css')) return <FileCode2 size={16} className="text-blue-400 mr-1.5 shrink-0" />;
    if (name.endsWith('.json')) return <FileJson size={16} className="text-[#cbcb41] mr-1.5 shrink-0" />;
    return <FileText size={16} className="text-gray-400 mr-1.5 shrink-0" />;
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'folder') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, type });
  };

  const startRename = (path: string, type: 'file' | 'folder') => {
    const name = path.split('/').pop() || '';
    setEditingPath({ path, isNew: false, type });
    setEditValue(name);
  };

  const startNewFile = (parentPath: string = '') => {
    const dummyPath = parentPath ? `${parentPath}/untitled` : 'untitled';
    if (parentPath) setExpandedFolders(prev => new Set(prev).add(parentPath));
    setEditingPath({ path: dummyPath, isNew: true, type: 'file' });
    setEditValue('');
  };

  const startNewFolder = (parentPath: string = '') => {
    const dummyPath = parentPath ? `${parentPath}/untitled` : 'untitled';
    if (parentPath) setExpandedFolders(prev => new Set(prev).add(parentPath));
    setEditingPath({ path: dummyPath, isNew: true, type: 'folder' });
    setEditValue('');
  };

  const submitEdit = () => {
    if (!editingPath || !editValue.trim()) {
      setEditingPath(null);
      return;
    }

    const { path, isNew, type } = editingPath;
    const parent = path.includes('/') ? path.split('/').slice(0, -1).join('/') : '';
    const newPath = parent ? `${parent}/${editValue.trim()}` : editValue.trim();

    if (isNew) {
      if (type === 'file') {
        const ext = editValue.split('.').pop() || '';
        const langMap: Record<string, string> = { js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', css: 'css', html: 'html', json: 'json' };
        addFile(newPath, langMap[ext] || 'plaintext');
      } else {
        addFile(`${newPath}/.gitkeep`, 'plaintext');
      }
    } else {
      if (path !== newPath) {
        renameFile(path, newPath);
      }
    }
    setEditingPath(null);
  };

  const renderTree = (nodes: FileTreeNode[], depth = 0) => {
    return nodes.map(node => {
      if (node.name === '.gitkeep') return null; // Hide placeholder
      const isOpen = expandedFolders.has(node.path);
      const isActive = project.activeFile === node.path;
      const isEditing = editingPath?.path === node.path && !editingPath.isNew;

      return (
        <div key={node.path}>
          <div 
            onClick={() => node.type === 'folder' ? toggleFolder(node.path) : setActiveFile(node.path)}
            onContextMenu={(e) => handleContextMenu(e, node.path, node.type)}
            className={clsx(
              'flex items-center px-2 py-[2px] text-[13px] cursor-pointer group min-w-full',
              isActive ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2d2e] text-[#cccccc]'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <div className="flex items-center w-full min-w-0">
              {node.type === 'folder' ? (
                isOpen ? <ChevronDown size={16} className="mr-0.5 shrink-0 opacity-60" /> : <ChevronRight size={16} className="mr-0.5 shrink-0 opacity-60" />
              ) : (
                <div className="w-4 mr-0.5 shrink-0" />
              )}
              {getIcon(node.name, node.type, isOpen)}
              
              {isEditing ? (
                <input 
                  ref={editInputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={submitEdit}
                  onKeyDown={e => e.key === 'Enter' && submitEdit()}
                  className="bg-[#3c3c3c] border border-[#007acc] text-white px-1 outline-none w-full h-5"
                />
              ) : (
                <span className="truncate">{node.name}</span>
              )}
            </div>
          </div>
          
          {node.type === 'folder' && isOpen && (
             <>
               {editingPath?.path.startsWith(node.path) && editingPath.isNew && editingPath.path.split('/').length === node.path.split('/').length + 1 && (
                 <div className="flex items-center px-2 py-[2px] bg-[#2a2d2e]" style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}>
                   {getIcon(editValue, editingPath.type)}
                   <input 
                     ref={editInputRef}
                     value={editValue}
                     onChange={e => setEditValue(e.target.value)}
                     onBlur={submitEdit}
                     onKeyDown={e => e.key === 'Enter' && submitEdit()}
                     className="bg-[#3c3c3c] border border-[#007acc] text-white px-1 outline-none w-full h-5"
                   />
                 </div>
               )}
               {node.children && renderTree(node.children, depth + 1)}
             </>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-full w-full bg-[#252526] flex flex-col items-stretch overflow-hidden select-none relative"
         onContextMenu={(e) => handleContextMenu(e, '', 'folder')}>
      <div className="px-4 py-2 uppercase text-[#969696] text-[11px] tracking-wider font-bold flex justify-between items-center bg-[#252526]">
        <span>Explorer</span>
        <div className="flex gap-1">
          <button onClick={() => startNewFile()} className="hover:bg-[#3c3c3c] p-0.5 rounded text-[#cccccc] hover:text-white" title="New File">
            <Plus size={16} />
          </button>
          <button onClick={() => startNewFolder()} className="hover:bg-[#3c3c3c] p-0.5 rounded text-[#cccccc] hover:text-white" title="New Folder">
            <FolderPlus size={16} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto py-1">
        {editingPath?.isNew && !editingPath.path.includes('/') && (
          <div className="flex items-center px-2 py-[2px] bg-[#2a2d2e] ml-6">
            {getIcon(editValue, editingPath.type)}
            <input 
              ref={editInputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={submitEdit}
              onKeyDown={e => e.key === 'Enter' && submitEdit()}
              className="bg-[#3c3c3c] border border-[#007acc] text-white px-1 outline-none w-full h-5"
            />
          </div>
        )}
        {renderTree(tree)}
      </div>

      {contextMenu && (
        <div 
          className="fixed bg-[#252526] border border-[#454545] shadow-2xl py-1 rounded w-64 z-[9999] text-[13px] text-[#cccccc]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem 
            icon={<Plus size={14} />} 
            label="New File" 
            shortcut="Ctrl+N"
            onClick={() => startNewFile(contextMenu.type === 'folder' ? contextMenu.path : '')} 
          />
          <MenuItem 
            icon={<FolderPlus size={14} />} 
            label="New Folder" 
            onClick={() => startNewFolder(contextMenu.type === 'folder' ? contextMenu.path : '')} 
          />
          <div className="border-t border-[#454545] my-1" />
          
          <MenuItem icon={<Scissors size={14} />} label="Cut" shortcut="Ctrl+X" />
          <MenuItem icon={<Copy size={14} />} label="Copy" shortcut="Ctrl+C" />
          <MenuItem icon={<Clipboard size={14} />} label="Paste" shortcut="Ctrl+V" />
          
          <div className="border-t border-[#454545] my-1" />
          
          <MenuItem label="Copy Path" onClick={() => {
            navigator.clipboard.writeText(contextMenu.path);
            toast.success('Path copied');
          }} />
          <MenuItem label="Copy Relative Path" onClick={() => {
            navigator.clipboard.writeText(contextMenu.path);
            toast.success('Relative path copied');
          }} />
          
          <div className="border-t border-[#454545] my-1" />
          
          <MenuItem 
            icon={<Edit3 size={14} />} 
            label="Rename..." 
            shortcut="F2"
            onClick={() => startRename(contextMenu.path, contextMenu.type)} 
          />
          <MenuItem 
            icon={<Trash2 size={14} />} 
            label="Delete" 
            shortcut="Del"
            onClick={() => {
              if (confirm(`Are you sure you want to delete '${contextMenu.path}'?`)) {
                deleteFile(contextMenu.path);
                toast.success('Deleted');
              }
            }} 
            variant="danger"
          />
          
          <div className="border-t border-[#454545] my-1" />
          
          <MenuItem icon={<Download size={14} />} label="Download" />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, shortcut, variant }: { icon?: React.ReactNode, label: string, onClick?: () => void, shortcut?: string, variant?: 'default' | 'danger' }) {
  return (
    <button 
      className={clsx(
        "w-full text-left px-3 py-1 flex items-center justify-between group",
        variant === 'danger' ? "hover:bg-red-600 hover:text-white" : "hover:bg-[#007acc] hover:text-white"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 flex items-center justify-center">
          {icon}
        </div>
        <span>{label}</span>
      </div>
      {shortcut && <span className="text-[11px] opacity-40 group-hover:opacity-80 ml-4 font-mono">{shortcut}</span>}
    </button>
  );
}
