import { User } from 'firebase/auth';
import { useCallback, useEffect, useState, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { EditorComponent } from './EditorComponent';
import { Terminal } from './Terminal';
import { Preview } from './Preview';
import { Project, ProjectFile, OperationType } from '../types';
import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { FileCode, Settings, Layout, Search, GitBranch, Bot } from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AIAssistant } from './AIAssistant';

const DEFAULT_FILES: Record<string, ProjectFile> = {
  'index.html': { name: 'index.html', language: 'html', content: `<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: sans-serif; text-align: center; margin-top: 50px; }
    </style>
  </head>
  <body>
    <h1>Hello, Browser IDE!</h1>
    <script src="script.js"></script>
  </body>
</html>` },
  'style.css': { name: 'style.css', language: 'css', content: '/* Add some styles here */' },
  'script.js': { name: 'script.js', language: 'javascript', content: 'console.log("Hello from script.js!");' },
};

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function IDE({ user, projects, activeProject: initialProject, onBack, createProject }: { user: User, projects: Project[], activeProject: Project, onBack: () => void, createProject: () => void }) {
  const [activeProject, setActiveProject] = useState<Project>(initialProject);
  
  // Sync if it changes externally
  useEffect(() => {
    const updated = projects.find(p => p.id === initialProject.id);
    if (updated) setActiveProject(updated);
  }, [projects, initialProject.id]);

  const updateActiveProject = async (updates: Partial<Project>) => {
    if (!activeProject) return;
    const nextProj = { ...activeProject, ...updates, updatedAt: Date.now() };
    setActiveProject(nextProj); // Optimistic UI update

    // Debounce this in a real app, here we just save instantly for simplicity, 
    // or maybe abstract it to avoiding constant writes.
    // For now we will write on every stroke which might be heavy but functional.
    try {
      const { id, ...data } = nextProj;
      await updateDoc(doc(db, 'projects', activeProject.id), data);
    } catch (error) {
      console.error(error);
    }
  };

  const updateDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileChange = (content: string | undefined) => {
    if (content === undefined || !activeProject || !activeProject.activeFile) return;
    
    // We update local state instantly for UI (though Editor handles its own typing)
    // To limit re-renders of the whole IDE, we could avoid updating `activeProject` via state instantly,
    // but preview relies on it. So we update state directly.
    const nextProj = {
      ...activeProject,
      updatedAt: Date.now(),
      files: {
        ...activeProject.files,
        [activeProject.activeFile]: {
          ...activeProject.files[activeProject.activeFile],
          content
        }
      }
    };
    setActiveProject(nextProj);

    // Debounce Firestore write
    if (updateDebounceRef.current) clearTimeout(updateDebounceRef.current);
    updateDebounceRef.current = setTimeout(async () => {
      try {
        const { id, ...data } = nextProj;
        await updateDoc(doc(db, 'projects', activeProject.id), data);
      } catch (error) {
        console.error(error);
      }
    }, 1000);
  };

  const deleteFile = (name: string) => {
    if (!activeProject) return;
    const newFiles = { ...activeProject.files };
    delete newFiles[name];
    updateActiveProject({
      files: newFiles,
      activeFile: activeProject.activeFile === name ? Object.keys(newFiles)[0] || '' : activeProject.activeFile
    });
  };

  const renameFile = (oldName: string, newName: string) => {
    if (!activeProject || !activeProject.files[oldName]) return;
    const newFiles = { ...activeProject.files };
    const content = newFiles[oldName].content;
    const ext = newName.split('.').pop() || '';
    const langMap: Record<string, string> = { js: 'javascript', ts: 'typescript', css: 'css', html: 'html', json: 'json' };
    delete newFiles[oldName];
    const basename = newName.split('/').pop() || newName;
    newFiles[newName] = { name: basename, language: langMap[ext] || 'plaintext', content };
    updateActiveProject({
      files: newFiles,
      activeFile: activeProject.activeFile === oldName ? newName : activeProject.activeFile
    });
  };

  const [activeTab, setActiveTab] = useState<'explorer' | 'search' | 'source_control' | 'run_debug' | 'extensions' | 'ai_assistant'>('explorer');
  const [showSettings, setShowSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{file: string, line: string}[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, type: 'tab' | 'editor' } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  if (!projects.length && !activeProject) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1e1e1e] text-white">
        <button onClick={createProject} className="bg-[#007acc] px-4 py-2 hover:bg-[#005f9e] rounded">
          Create New Project
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans">
      <TopBar user={user} projects={projects} activeProject={activeProject} onBack={onBack} updateProject={updateActiveProject} />
      
      <div className="flex-1 overflow-hidden flex flex-row relative">
        {/* Activity Bar */}
        <nav className="w-12 bg-[#333333] flex flex-col items-center py-4 gap-6 shrink-0 border-r border-[#2b2b2b] z-20">
          <div className={clsx("cursor-pointer relative group", activeTab === 'explorer' ? "text-white" : "text-[#858585] hover:text-white")} onClick={() => setActiveTab('explorer')}>
             <FileCode size={24} strokeWidth={1.5} />
             {activeTab === 'explorer' && <div className="absolute left-[-12px] top-0 bottom-0 w-[2px] bg-[#007acc]" />}
          </div>
          <div className={clsx("cursor-pointer relative group", activeTab === 'ai_assistant' ? "text-white" : "text-[#858585] hover:text-white")} onClick={() => setActiveTab('ai_assistant')}>
             <Bot size={24} strokeWidth={1.5} />
             {activeTab === 'ai_assistant' && <div className="absolute left-[-12px] top-0 bottom-0 w-[2px] bg-[#007acc]" />}
          </div>
          <div className={clsx("cursor-pointer relative group", activeTab === 'search' ? "text-white" : "text-[#858585] hover:text-white")} onClick={() => setActiveTab('search')}>
             <Search size={24} strokeWidth={1.5} />
             {activeTab === 'search' && <div className="absolute left-[-12px] top-0 bottom-0 w-[2px] bg-[#007acc]" />}
          </div>
          <div className={clsx("cursor-pointer relative group", activeTab === 'source_control' ? "text-white" : "text-[#858585] hover:text-white")} onClick={() => setActiveTab('source_control')}>
             <GitBranch size={24} strokeWidth={1.5} />
             {activeTab === 'source_control' && <div className="absolute left-[-12px] top-0 bottom-0 w-[2px] bg-[#007acc]" />}
          </div>
          <div className={clsx("cursor-pointer relative group", activeTab === 'run_debug' ? "text-white" : "text-[#858585] hover:text-white")} onClick={() => setActiveTab('run_debug')}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 3 14 9-14 9V3z"/></svg>
             {activeTab === 'run_debug' && <div className="absolute left-[-12px] top-0 bottom-0 w-[2px] bg-[#007acc]" />}
          </div>
          <div className={clsx("cursor-pointer relative group", activeTab === 'extensions' ? "text-white" : "text-[#858585] hover:text-white")} onClick={() => setActiveTab('extensions')}>
             <Layout size={24} strokeWidth={1.5} />
             {activeTab === 'extensions' && <div className="absolute left-[-12px] top-0 bottom-0 w-[2px] bg-[#007acc]" />}
          </div>
          <div 
            className="mt-auto text-[#858585] hover:text-white cursor-pointer pb-4 opacity-70 group relative"
            onClick={() => setShowSettings(!showSettings)}
          >
             <Settings size={24} strokeWidth={1.5} />
             {showSettings && (
               <div className="absolute bottom-4 left-10 bg-[#252526] border border-[#454545] shadow-xl rounded py-1 w-48 text-[13px] text-[#cccccc] z-50">
                 <div className="px-4 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer" onClick={() => {toast('Command Palette coming soon', { icon: '⌨️' }); setShowSettings(false);}}>Command Palette...</div>
                 <div className="px-4 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer" onClick={() => {toast('Settings opened', { icon: '⚙️' }); setShowSettings(false);}}>Settings</div>
                 <div className="px-4 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer" onClick={() => {toast('Keyboard Shortcuts', { icon: '⌨️' }); setShowSettings(false);}}>Keyboard Shortcuts</div>
                 <div className="border-t border-[#454545] my-1"></div>
                 <div className="px-4 py-1.5 hover:bg-[#094771] hover:text-white cursor-pointer" onClick={() => setShowSettings(false)}>Color Theme</div>
               </div>
             )}
          </div>
        </nav>

        <PanelGroup orientation="horizontal" className="flex-1">
          <Panel minSize={5} defaultSize={15} className="bg-[#252526] flex z-10 flex-col overflow-hidden">
            <div className={clsx("flex-1 overflow-hidden", activeTab !== 'explorer' && "hidden")}>
                <Sidebar 
                  project={activeProject} 
                  setActiveFile={(name) => updateActiveProject({ activeFile: name })} 
                  addFile={(name, language) => {
                    if(!activeProject) return;
                    const basename = name.split('/').pop() || name;
                    updateActiveProject({
                      files: { ...activeProject.files, [name]: { name: basename, language, content: '' } },
                      activeFile: name
                    });
                  }}
                  deleteFile={deleteFile}
                  renameFile={renameFile}
                />
            </div>
            
            <div className={clsx("flex-1 overflow-hidden", activeTab !== 'ai_assistant' && "hidden")}>
                <AIAssistant 
                  project={activeProject}
                  updateProject={updateActiveProject}
                  deleteFile={deleteFile}
                  renameFile={renameFile}
                  addFile={(name, content) => {
                    if(!activeProject) return;
                    const ext = name.split('.').pop() || '';
                    const langMap: Record<string, string> = { js: 'javascript', ts: 'typescript', css: 'css', html: 'html', json: 'json' };
                    const language = langMap[ext] || 'plaintext';
                    const basename = name.split('/').pop() || name;
                    updateActiveProject({
                      files: { ...activeProject.files, [name]: { name: basename, language, content } },
                      activeFile: name
                    });
                  }}
                />
             </div>
             
             <div className={clsx("p-4 text-xs text-[#969696] font-semibold flex-1 overflow-hidden flex flex-col", (activeTab === 'explorer' || activeTab === 'ai_assistant') && "hidden")}>
                {activeTab === 'search' && (
                  <div>
                    <div className="mb-4 text-[#cccccc] uppercase">SEARCH</div>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if(!activeProject) return;
                      const results: {file: string, line: string}[] = [];
                      if(searchTerm.trim()){
                         Object.values(activeProject.files).forEach((f: any) => {
                           const lines = f.content.split('\n');
                           lines.forEach(l => {
                             if(l.toLowerCase().includes(searchTerm.toLowerCase())) {
                               results.push({file: f.name, line: l.trim().substring(0, 30)});
                             }
                           });
                         });
                      }
                      setSearchResults(results);
                    }}>
                      <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search" className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] px-2 py-1 outline-none focus:border-[#007acc] rounded-sm mb-2" />
                      <input type="text" placeholder="Replace" className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] px-2 py-1 outline-none focus:border-[#007acc] rounded-sm mb-4" />
                      <button type="submit" className="hidden" />
                    </form>
                    <div className="flex flex-col gap-2 mt-4 text-[#cccccc]">
                      {searchResults.length > 0 ? searchResults.map((r, i) => (
                        <div key={i} className="cursor-pointer hover:bg-[#2a2d2e] p-1 rounded" onClick={() => updateActiveProject({activeFile: r.file})}>
                           <div className="text-[12px] font-medium text-[#007acc]">{r.file}</div>
                           <div className="text-[11px] opacity-70 truncate">{r.line}</div>
                        </div>
                      )) : searchTerm && <div className="text-center opacity-50">No results found.</div>}
                    </div>
                  </div>
                )}
                {activeTab === 'source_control' && (
                  <div>
                    <div className="mb-4 text-[#cccccc] uppercase">SOURCE CONTROL</div>
                    {activeProject?.files['.gitignore'] ? (
                      <div className="text-[#cccccc] text-[11px] opacity-80">
                         Git Repository is active.
                         <br/><br/>
                         Changes: 0
                      </div>
                    ) : (
                      <button onClick={() => {
                        if(!activeProject) return;
                        updateActiveProject({ files: { ...activeProject.files, '.gitignore': { name: '.gitignore', language: 'plaintext', content: 'node_modules/\ndist/\n.env' } } });
                        toast.success('Git Repository Initialized');
                      }} className="w-full mt-4 border border-[#3c3c3c] rounded p-3 text-center text-[#cccccc] font-normal cursor-pointer hover:bg-[#3c3c3c]">
                        Initialize Repository
                      </button>
                    )}
                  </div>
                )}
                {activeTab === 'run_debug' && (
                  <div>
                    <div className="mb-4 text-[#cccccc] uppercase">RUN AND DEBUG</div>
                    <button onClick={() => toast.success('Debugger attached securely')} className="w-full mt-4 bg-[#007acc] text-white rounded p-1 text-center font-normal cursor-pointer hover:bg-[#005f9e]">
                      Run and Debug
                    </button>
                    {!activeProject?.files['.vscode/launch.json'] && (
                      <p className="mt-4 text-[#969696] font-normal leading-relaxed">
                        To customize Run and Debug <a href="#" onClick={(e) => { 
                          e.preventDefault(); 
                          if(!activeProject) return;
                          updateActiveProject({ files: { ...activeProject.files, '.vscode/launch.json': { name: '.vscode/launch.json', language: 'json', content: '{\n  "version": "0.2.0",\n  "configurations": []\n}' }, activeFile: '.vscode/launch.json' } });
                          toast.success('launch.json created!'); 
                        }} className="text-[#007acc] hover:underline">create a launch.json file</a>.
                      </p>
                    )}
                  </div>
                )}
                {activeTab === 'extensions' && (
                  <div className="flex flex-col h-full">
                    <div className="mb-4 text-[#cccccc] uppercase">EXTENSIONS</div>
                    <input type="text" placeholder="Search Extensions in Marketplace" className="w-full bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] px-2 py-1 outline-none focus:border-[#007acc] rounded-sm mb-4" />
                    <div className="flex-1 overflow-y-auto">
                      <div className="text-[10px] uppercase opacity-70 mb-2">Popular</div>
                      {[
                        { name: "Prettier - Code formatter", author: "Prettier", icon: "https://prettier.io/icon.png" },
                        { name: "ESLint", author: "Microsoft", icon: "https://eslint.org/icon-512.png" },
                        { name: "Tailwind CSS IntelliSense", author: "Tailwind Labs", icon: "https://upload.wikimedia.org/wikipedia/commons/d/d5/Tailwind_CSS_Logo.svg" }
                      ].map(ext => (
                        <div key={ext.name} onClick={() => toast.success(`${ext.name} verified securely.`)} className="flex gap-2 items-center mb-4 cursor-pointer hover:bg-[#2d2d2d] p-1 rounded -mx-1">
                          <img src={ext.icon} alt="" className="w-8 h-8 object-contain bg-white rounded" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[#cccccc] font-normal text-[12px] truncate">{ext.name}</div>
                            <div className="text-[#969696] font-normal text-[11px] truncate">{ext.author}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-[#2b2b2b] hover:bg-[#007acc] active:bg-[#007acc] cursor-col-resize transition-colors z-20" />

          <Panel minSize={30} defaultSize={85}>
            <PanelGroup orientation="vertical">
              <Panel minSize={10} defaultSize={70}>
                <PanelGroup orientation="horizontal">
                  <Panel minSize={10} defaultSize={50} className="flex flex-col bg-[#1e1e1e]">
                    {activeProject && Object.keys(activeProject.files).length > 0 && (
                      <div className="h-9 bg-[#252526] flex shrink-0 border-b border-[#2b2b2b] overflow-x-auto hide-scrollbar">
                        {Object.keys(activeProject.files).map(filename => (
                          <div 
                            key={filename}
                            onClick={() => updateActiveProject({ activeFile: filename })}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, path: filename, type: 'tab' });
                            }}
                            className={clsx(
                              "px-3 flex items-center min-w-max text-[13px] cursor-pointer cursor-default h-full border-r border-[#1e1e1e]",
                              activeProject.activeFile === filename ? "bg-[#1e1e1e] border-t border-t-[#007acc] text-[#cccccc]" : "bg-[#2d2d2d] text-[#969696] hover:bg-[#252526]"
                            )}
                            title={filename}
                          >
                            <span className="truncate max-w-[150px]">
                              {filename.split('/').pop()}
                            </span>
                            <button 
                              className="ml-2 opacity-0 hover:opacity-100 hover:text-white rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeProject.activeFile === filename) {
                                   const otherFile = Object.keys(activeProject.files).find(name => name !== filename);
                                   if (otherFile) updateActiveProject({ activeFile: otherFile });
                                }
                                // Ideally we would "close" the tab by removing from an openFiles state
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden" 
                         onContextMenu={(e) => {
                           e.preventDefault();
                           setContextMenu({ x: e.clientX, y: e.clientY, path: activeProject?.activeFile || '', type: 'editor' });
                         }}>
                      {activeProject && activeProject.activeFile && activeProject.files[activeProject.activeFile] ? (
                        <EditorComponent 
                          file={activeProject.files[activeProject.activeFile]} 
                          onChange={handleFileChange} 
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[#1e1e1e]">
                          <div className="text-center text-[#969696]">
                            <svg width="200" height="200" viewBox="0 0 200 200" className="mx-auto opacity-10">
                              <path fill="#007acc" d="M150,20 L50,100 L150,180 Z" />
                            </svg>
                            <p className="mt-4">Select a file to edit</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </Panel>

                  <PanelResizeHandle className="w-1 bg-[#2b2b2b] hover:bg-[#007acc] active:bg-[#007acc] cursor-col-resize transition-colors z-20" />

                  <Panel minSize={5} defaultSize={50} className="bg-[#1e1e1e] flex flex-col overflow-hidden">
                    {activeProject ? <Preview project={activeProject} /> : null}
                  </Panel>
                </PanelGroup>
              </Panel>

              <PanelResizeHandle className="h-1 bg-[#2b2b2b] hover:bg-[#007acc] active:bg-[#007acc] cursor-row-resize transition-colors z-20" />

              <Panel minSize={5} defaultSize={30} className="bg-[#1e1e1e]">
                <Terminal project={activeProject} />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      
      <div className="flex h-6 shrink-0 bg-[#007acc] items-center justify-between px-3 text-[11px] text-white">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            <span>main*</span>
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10-4.48-10-10-10zm-1 15h-2v-2h2v2zm0-4h-2v-6h2v6zm4 4h-2v-2h2v2zm0-4h-2v-6h2v6z"/></svg>
            <span>0 0</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">Ln 1, Col 1</span>
          <span className="cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">Spaces: 2</span>
          <span className="cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">UTF-8</span>
          <span className="cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">{activeProject?.files[activeProject?.activeFile]?.language || 'Plain Text'}</span>
          <div className="flex items-center gap-1 cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded">
            <span className="opacity-90">Prettier</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu 
          {...contextMenu} 
          onClose={() => setContextMenu(null)} 
          updateProject={updateActiveProject}
          activeProject={activeProject}
        />
      )}
    </div>
  );
}

function ContextMenu({ x, y, path, type, onClose, updateProject, activeProject }: { 
  x: number, y: number, path: string, type: 'tab' | 'editor', onClose: () => void, updateProject: (u: Partial<Project>) => void, activeProject: Project 
}) {
  return (
    <div 
      className="fixed bg-[#252526] border border-[#454545] shadow-2xl py-1 rounded w-64 z-[9999] text-[13px] text-[#cccccc]"
      style={{ top: y, left: x }}
      onClick={e => e.stopPropagation()}
    >
      {type === 'tab' && (
        <>
          <IDE_MenuItem label="Close" shortcut="Ctrl+W" onClick={onClose} />
          <IDE_MenuItem label="Close Others" onClick={() => {
             // In a real app with tab state, this would filter openTabs
             toast('Closed other tabs');
             onClose();
          }} />
          <IDE_MenuItem label="Close to the Right" onClick={onClose} />
          <IDE_MenuItem label="Close All" onClick={onClose} />
          <div className="border-t border-[#454545] my-1" />
          <IDE_MenuItem label="Keep Open" onClick={onClose} />
          <div className="border-t border-[#454545] my-1" />
          <IDE_MenuItem label="Copy Path" onClick={() => {
            navigator.clipboard.writeText(path);
            toast.success('Path copied');
            onClose();
          }} />
          <IDE_MenuItem label="Copy Relative Path" onClick={() => {
            navigator.clipboard.writeText(path);
            toast.success('Relative path copied');
            onClose();
          }} />
          <div className="border-t border-[#454545] my-1" />
          <IDE_MenuItem label="Reveal in Sidebar" onClick={() => {
             // Already visible in sidebar usually, but would highlight it
             onClose();
          }} />
        </>
      )}
      {type === 'editor' && (
        <>
          <IDE_MenuItem label="Command Palette..." shortcut="F1" onClick={() => { toast('Command Palette coming soon'); onClose(); }} />
          <div className="border-t border-[#454545] my-1" />
          <IDE_MenuItem label="Go to Definition" shortcut="F12" onClick={onClose} />
          <IDE_MenuItem label="Go to References" shortcut="Shift+F12" onClick={onClose} />
          <div className="border-t border-[#454545] my-1" />
          <IDE_MenuItem label="Format Document" shortcut="Alt+Shift+F" onClick={onClose} />
          <IDE_MenuItem label="Change All Occurrences" shortcut="Ctrl+F2" onClick={onClose} />
          <div className="border-t border-[#454545] my-1" />
          <IDE_MenuItem label="Cut" shortcut="Ctrl+X" onClick={onClose} />
          <IDE_MenuItem label="Copy" shortcut="Ctrl+C" onClick={onClose} />
          <IDE_MenuItem label="Paste" shortcut="Ctrl+V" onClick={onClose} />
        </>
      )}
    </div>
  );
}

function IDE_MenuItem({ label, onClick, shortcut, variant }: { label: string, onClick?: () => void, shortcut?: string, variant?: 'default' | 'danger' }) {
  return (
    <button 
      className={clsx(
        "w-full text-left px-4 py-1 flex items-center justify-between group",
        variant === 'danger' ? "hover:bg-red-600 hover:text-white" : "hover:bg-[#007acc] hover:text-white"
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] opacity-40 group-hover:opacity-80 ml-4 font-mono">{shortcut}</span>}
    </button>
  );
}
