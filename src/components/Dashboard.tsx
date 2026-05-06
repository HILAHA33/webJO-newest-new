import React, { useState } from 'react';
import { User, signOut } from 'firebase/auth';
import { Project } from '../types';
import { auth } from '../lib/firebase';
import { Plus, Code2, Trash2, Home, LayoutTemplate, FileCode2, User as UserIcon, X, Github, FileArchive, FileCode, Zap } from 'lucide-react';

export function Dashboard({ user, projects, createProject, openProject, deleteProject }: {
  user: User;
  projects: Project[];
  createProject: (opts?: { title: string; template: 'empty' | 'static' | 'github' | 'zip'; dependencies: string[]; githubUrl?: string; zipFile?: File }) => void;
  openProject: (p: Project) => void;
  deleteProject: (id: string, e: React.MouseEvent) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'empty' | 'static' | 'github' | 'zip'>('static');
  const [selectedDeps, setSelectedDeps] = useState<string[]>(['node', 'npm']);
  const [githubUrl, setGithubUrl] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);

  const handleCreate = () => {
    createProject({
      title: newTitle || 'Untitled Project',
      template: selectedTemplate,
      dependencies: selectedDeps,
      githubUrl,
      zipFile: zipFile || undefined,
    });
    setIsCreating(false);
    setNewTitle('');
    setSelectedTemplate('static');
    setSelectedDeps(['node', 'npm']);
    setGithubUrl('');
    setZipFile(null);
  };

  const toggleDep = (dep: string) => {
    setSelectedDeps(prev => prev.includes(dep) ? prev.filter(d => d !== dep) : [...prev, dep]);
  };

  return (
    <div className="flex bg-[#0e1525] min-h-screen text-[#f5f9fc] font-sans">
      {/* Sidebar */}
      <div className="w-60 bg-[#1c2333] border-r border-[#2b3245] flex flex-col p-4 shrink-0">
        <div className="flex items-center space-x-2 text-xl font-bold mb-8">
          <Code2 className="text-[#007acc]" />
          <span>webJO</span>
        </div>
        <nav className="flex flex-col space-y-2 flex-1">
          <button className="flex items-center space-x-3 bg-[#2b3245] px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Home size={18} />
            <span>Home</span>
          </button>
          <button className="flex items-center space-x-3 hover:bg-[#2b3245] px-4 py-2 rounded-lg text-sm font-medium transition-colors text-[#a1a1aa]">
            <LayoutTemplate size={18} />
            <span>Templates</span>
          </button>
          <button className="flex items-center space-x-3 hover:bg-[#2b3245] px-4 py-2 rounded-lg text-sm font-medium transition-colors text-[#a1a1aa]">
            <FileCode2 size={18} />
            <span>My Projects</span>
          </button>
        </nav>
        <div className="mt-auto border-t border-[#2b3245] pt-4 flex flex-col gap-2">
          <div className="flex items-center space-x-3 px-4 py-2 text-sm text-[#a1a1aa]">
            <UserIcon size={18} />
            <span className="truncate">{user.isAnonymous ? 'Guest' : user.email}</span>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="text-left hover:bg-[#2b3245] px-4 py-2 rounded-lg text-sm text-[#f48771] transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold">My Projects</h1>
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center space-x-2 bg-[#007acc] hover:bg-[#005f9e] text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus size={18} />
              <span>Create Repl</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((proj) => (
              <div 
                key={proj.id} 
                onClick={() => openProject(proj)}
                className="bg-[#1c2333] border border-[#2b3245] rounded-xl p-5 cursor-pointer hover:border-[#007acc] transition-colors group flex flex-col"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-[#2b3245] p-2 rounded-lg">
                    {proj.template === 'github' ? <Github className="text-[#007acc]" size={20} /> :
                     proj.template === 'zip' ? <FileArchive className="text-[#007acc]" size={20} /> :
                     <Code2 className="text-[#007acc]" size={20} />}
                  </div>
                  <button 
                    onClick={(e) => deleteProject(proj.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-[#a1a1aa] hover:text-[#f48771] transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <h3 className="font-semibold text-lg mb-1 truncate">{proj.title}</h3>
                <p className="text-[#a1a1aa] text-xs">
                  Updated {new Date(proj.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
            
            {projects.length === 0 && (
              <div 
                onClick={() => setIsCreating(true)}
                className="bg-transparent border-2 border-dashed border-[#2b3245] rounded-xl p-5 cursor-pointer hover:border-[#007acc] hover:bg-[#1c2333]/50 transition-colors flex flex-col items-center justify-center text-[#a1a1aa] min-h-[160px]"
              >
                <Plus size={24} className="mb-2 text-[#007acc]" />
                <span className="font-medium">Create your first Project</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1c2333] border border-[#2b3245] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-full">
            <div className="flex justify-between items-center p-4 border-b border-[#2b3245]">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Plus size={20} className="text-[#007acc]" />
                Create New Project
              </h2>
              <button onClick={() => setIsCreating(false)} className="text-[#a1a1aa] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Project Name</label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. My Awesome App"
                  className="w-full bg-[#0e1525] border border-[#2b3245] text-white px-4 py-2 rounded-lg outline-none focus:border-[#007acc] transition-colors"
                  autoFocus
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-[#a1a1aa] mb-3">Select Template</label>
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    onClick={() => setSelectedTemplate('static')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors ${selectedTemplate === 'static' ? 'border-[#007acc] bg-[#007acc]/10' : 'border-[#2b3245] hover:border-[#007acc]/50 bg-[#0e1525]'}`}
                  >
                    <Code2 size={24} className={selectedTemplate === 'static' ? 'text-[#007acc]' : 'text-[#a1a1aa]'} />
                    <div className="font-medium">HTML/CSS/JS</div>
                    <div className="text-xs text-[#a1a1aa] text-center">Standard static project</div>
                  </div>
                  <div 
                    onClick={() => setSelectedTemplate('empty')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors ${selectedTemplate === 'empty' ? 'border-[#007acc] bg-[#007acc]/10' : 'border-[#2b3245] hover:border-[#007acc]/50 bg-[#0e1525]'}`}
                  >
                    <FileCode size={24} className={selectedTemplate === 'empty' ? 'text-[#007acc]' : 'text-[#a1a1aa]'} />
                    <div className="font-medium">Empty Project</div>
                    <div className="text-xs text-[#a1a1aa] text-center">Start from scratch</div>
                  </div>
                  <div 
                    onClick={() => setSelectedTemplate('github')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors ${selectedTemplate === 'github' ? 'border-[#007acc] bg-[#007acc]/10' : 'border-[#2b3245] hover:border-[#007acc]/50 bg-[#0e1525]'}`}
                  >
                    <Github size={24} className={selectedTemplate === 'github' ? 'text-[#007acc]' : 'text-[#a1a1aa]'} />
                    <div className="font-medium">Import from GitHub</div>
                    <div className="text-xs text-[#a1a1aa] text-center">Clone repository</div>
                  </div>
                  <div 
                    onClick={() => setSelectedTemplate('zip')}
                    className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors ${selectedTemplate === 'zip' ? 'border-[#007acc] bg-[#007acc]/10' : 'border-[#2b3245] hover:border-[#007acc]/50 bg-[#0e1525]'}`}
                  >
                    <FileArchive size={24} className={selectedTemplate === 'zip' ? 'text-[#007acc]' : 'text-[#a1a1aa]'} />
                    <div className="font-medium">Import ZIP</div>
                    <div className="text-xs text-[#a1a1aa] text-center">Upload archived code</div>
                  </div>
                </div>
                {selectedTemplate === 'github' && (
                   <input type="text" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/user/repo" className="w-full mt-4 bg-[#0e1525] border border-[#2b3245] text-white px-4 py-2 rounded-lg outline-none focus:border-[#007acc] transition-colors" />
                )}
                {selectedTemplate === 'zip' && (
                   <label className="w-full mt-4 bg-[#0e1525] border-2 border-dashed border-[#2b3245] flex flex-col items-center justify-center p-6 rounded-lg text-sm text-[#a1a1aa] cursor-pointer hover:border-[#007acc]">
                     <span className="font-medium">{zipFile ? zipFile.name : 'Click to browse or drag and drop a .zip file'}</span>
                     <input type="file" accept=".zip" onChange={e => e.target.files && setZipFile(e.target.files[0])} className="hidden" />
                   </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-3">Pre-install Dependencies (Terminal environment)</label>
                <div className="flex flex-wrap gap-2">
                  {['node', 'npm', 'yarn', 'pnpm', 'git', 'docker', 'python', 'go', 'rust', 'make', 'wget', 'curl', 'gcc', 'bash', 'zsh'].map(dep => (
                    <button 
                      key={dep}
                      onClick={() => toggleDep(dep)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${selectedDeps.includes(dep) ? 'bg-[#007acc]/20 border-[#007acc] text-[#67e8f9]' : 'bg-[#0e1525] border-[#2b3245] text-[#a1a1aa] hover:border-[#a1a1aa]'}`}
                    >
                      <Zap size={10} className={selectedDeps.includes(dep) ? 'text-[#67e8f9]' : 'text-transparent'} />
                      {dep}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#2b3245] flex justify-end gap-3 bg-[#161d2e] shrink-0">
              <button 
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 rounded-lg font-medium text-[#a1a1aa] hover:bg-[#2b3245] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreate}
                className="px-4 py-2 rounded-lg font-medium bg-[#007acc] hover:bg-[#005f9e] text-white transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
