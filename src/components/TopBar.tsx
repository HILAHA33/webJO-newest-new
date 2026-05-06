import { User, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Project } from '../types';
import { LogOut, Plus, Code2, Globe, Search, Download } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';
import toast from 'react-hot-toast';
import JSZip from 'jszip';

export function TopBar({ user, projects, activeProject, onBack, updateProject }: {
  user: User;
  projects: Project[];
  activeProject: Project | null;
  onBack: () => void;
  updateProject: (updates: Partial<Project>) => void;
}) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(activeProject?.title || 'Untitled');

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleInput.trim() && titleInput !== activeProject?.title) {
      updateProject({ title: titleInput.trim() });
    } else {
      setTitleInput(activeProject?.title || 'Untitled');
    }
  };

  const downloadZip = async () => {
    if (!activeProject || !activeProject.files) {
      toast.error("No project files to download.");
      return;
    }
    const zip = new JSZip();
    Object.entries(activeProject.files).forEach(([path, file]) => {
      zip.file(path, file.content);
    });
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeProject.title ? activeProject.title.replace(/\s+/g, '-').toLowerCase() : 'webjo-project'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded project ZIP.");
    } catch (e: any) {
      toast.error(`Error downloading ZIP: ${e.message}`);
    }
  };

  return (
    <div className="flex items-center h-12 px-4 bg-[#1e1e1e] border-b border-[#2b2b2b] justify-between">
      <div className="flex items-center space-x-4 flex-1">
        <button onClick={onBack} className="flex items-center space-x-2 text-[#cccccc] hover:text-white transition-colors group">
          <Code2 className="text-[#007acc] w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-sm hidden sm:block">webJO</span>
        </button>
        <div className="w-px h-4 bg-[#505050] hidden sm:block" />
        <div className="flex items-center space-x-2 px-1 py-1 rounded text-sm text-[#cccccc]">
           {isEditingTitle ? (
             <input 
               autoFocus
               type="text"
               value={titleInput}
               onChange={(e) => setTitleInput(e.target.value)}
               onBlur={handleTitleSubmit}
               onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
               className="bg-[#3c3c3c] text-white px-2 py-0.5 rounded outline-none w-48 border border-[#007acc]"
             />
           ) : (
             <span 
               onClick={() => {
                 setTitleInput(activeProject?.title || 'Untitled');
                 setIsEditingTitle(true);
               }} 
               className="cursor-pointer hover:bg-[#2d2d2d] px-2 py-0.5 rounded"
             >
               {activeProject?.title || 'Untitled'}
             </span>
           )}
        </div>
      </div>
      
      <div className="flex-1 max-w-xl hidden md:flex items-center justify-center -ml-24">
        <div className="w-full max-w-lg flex items-center bg-[#252526] border border-[#333] rounded-md px-3 py-1">
          <Search size={14} className="text-[#969696] mr-2" />
          <input 
            type="text" 
            placeholder={`Search webJO`} 
            className="bg-transparent border-none outline-none text-[#cccccc] text-xs w-full"
          />
        </div>
      </div>
      
      <div className="flex items-center space-x-4 pl-4 flex-shrink-0 flex-1 justify-end">
        <button 
          onClick={downloadZip}
          className="flex items-center space-x-1 bg-[#252526] border border-[#3c3c3c] text-white text-xs px-2 py-1 rounded hover:bg-[#333] transition-colors"
          title="Download ZIP"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Download</span>
        </button>

        <button 
          onClick={() => setShowPublishDialog(true)}
          className="flex items-center space-x-1 bg-[#007acc] text-white text-xs px-2 py-1 rounded hover:bg-[#005f9e] transition-colors"
          title="Publish app"
        >
          <Globe size={14} />
          <span className="hidden sm:inline">Publish</span>
        </button>

        <div className="text-sm border border-[#505050] px-2 py-0.5 rounded cursor-pointer hidden sm:block">
          {user.isAnonymous ? 'Guest' : user.email}
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="text-[#969696] hover:text-white mt-1"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>

      {showPublishDialog && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
          <div className="bg-[#252526] border border-[#333] rounded shadow-xl w-96 p-6 text-white">
            <h2 className="text-lg font-semibold mb-2">Publish Project</h2>
            <p className="text-sm text-[#969696] mb-4">
              Your project "{activeProject?.title}" is ready to be shared with the world!
            </p>
            <div className="flex items-center bg-[#1e1e1e] border border-[#333] p-2 rounded mb-6 text-sm">
              <span className="text-[#007acc] truncate">https://webjo.firebaseapp.com/{activeProject?.id}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setShowPublishDialog(false)}
                className="px-4 py-2 hover:bg-[#333] rounded text-sm transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`https://webjo.firebaseapp.com/${activeProject?.id}`);
                  toast.success("Link copied to clipboard!");
                  setShowPublishDialog(false);
                }}
                className="px-4 py-2 bg-[#007acc] hover:bg-[#005f9e] rounded text-sm transition-colors"
                >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
