/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AuthView } from './components/AuthView';
import { IDE } from './components/IDE';
import { Dashboard } from './components/Dashboard';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, setDoc, doc, deleteDoc, query, where } from 'firebase/firestore';
import { Project, ProjectFile, OperationType } from './types';
import JSZip from 'jszip';
import toast, { Toaster } from 'react-hot-toast';

const DEFAULT_FILES: Record<string, ProjectFile> = {
  'index.html': { name: 'index.html', language: 'html', content: `<!DOCTYPE html>\n<html>\n  <head>\n    <style>\n      body { font-family: sans-serif; text-align: center; margin-top: 50px; }\n    </style>\n  </head>\n  <body>\n    <h1>Hello, Browser IDE!</h1>\n    <script src="script.js"></script>\n  </body>\n</html>` },
  'style.css': { name: 'style.css', language: 'css', content: '/* Add some styles here */' },
  'script.js': { name: 'script.js', language: 'javascript', content: 'console.log("Hello from script.js!");' },
};

const getLanguageFromFilename = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'css': return 'css';
    case 'html': return 'html';
    case 'json': return 'json';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
};

function MainApp({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'projects'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        setProjects(projs);
      },
      (error) => { console.error(error); toast.error("Error fetching projects"); }
    );
    return () => unsubscribe();
  }, [user]);

  const createProject = async (opts?: {
    title: string;
    template: 'empty' | 'static' | 'github' | 'zip';
    dependencies: string[];
    githubUrl?: string;
    zipFile?: File;
  }) => {
    const id = Date.now().toString();
    const dependencies = opts?.dependencies || [];
    let files = { ...DEFAULT_FILES };
    let activeFile = 'index.html';
    
    if (opts?.template === 'empty') {
      files = {
        'index.html': { name: 'index.html', language: 'html', content: '' }
      };
    } else if (opts?.template === 'zip' && opts.zipFile) {
      toast.loading('Extracting ZIP...', { id: 'import' });
      try {
        const zip = await JSZip.loadAsync(opts.zipFile);
        const importedFiles: Record<string, ProjectFile> = {};
        for (const [filename, fileInput] of Object.entries(zip.files)) {
          if (!fileInput.dir && !filename.startsWith('__MACOSX/') && !filename.includes('.DS_Store')) {
            const content = await fileInput.async('string');
            importedFiles[filename] = { name: filename, language: getLanguageFromFilename(filename), content };
          }
        }
        if (Object.keys(importedFiles).length > 0) {
          files = importedFiles;
          activeFile = Object.keys(importedFiles)[0];
        }
        toast.success('ZIP imported successfully!', { id: 'import' });
      } catch (err) {
        toast.error('Failed to import ZIP file.', { id: 'import' });
        return;
      }
    } else if (opts?.template === 'github' && opts.githubUrl) {
      toast.loading('Cloning from GitHub...', { id: 'import' });
      try {
        const match = opts.githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) throw new Error("Invalid GitHub URL");
        const [, owner, repo] = match;
        
        // Use GitHub API tree
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
        if (!res.ok) {
           const masterRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`);
           if (!masterRes.ok) throw new Error("Could not find main or master branch.");
           const data = await masterRes.json();
           await processGithubTree(data.tree, owner, repo);
        } else {
           const data = await res.json();
           await processGithubTree(data.tree, owner, repo);
        }
        
        async function processGithubTree(tree: any[], repoOwner: string, repoName: string) {
          const importedFiles: Record<string, ProjectFile> = {};
          // Remove artificial limit to allow importing all files
          for (const item of tree) {
            if (item.type === 'blob' && !item.path.includes('.png') && !item.path.includes('.jpg') && !item.path.includes('.ico')) {
              const rawRes = await fetch(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/HEAD/${item.path}`);
              if (rawRes.ok) {
                const content = await rawRes.text();
                const basename = item.path.split('/').pop() || item.path;
                importedFiles[item.path] = { name: basename, language: getLanguageFromFilename(item.path), content };
              }
            }
          }
          if (Object.keys(importedFiles).length > 0) {
            files = importedFiles;
            activeFile = Object.keys(importedFiles)[0];
          }
        }
        toast.success('GitHub clone complete!');
      } catch(err: any) {
        toast.error('Failed to clone GitHub repo: ' + err.message, { id: 'import' });
        return;
      }
    }

    // Add package.json if node or npm is selected
    if (dependencies.includes('node') || dependencies.includes('npm') || dependencies.includes('pnpm') || dependencies.includes('yarn')) {
      const packageJsonContent = {
        name: opts?.title?.toLowerCase().replace(/\s+/g, '-') || "webjo-project",
        version: "1.0.0",
        description: "",
        main: "index.js",
        scripts: {
          start: "node index.js",
          test: "echo \"Error: no test specified\" && exit 1"
        },
        keywords: [],
        author: "",
        license: "ISC",
        dependencies: dependencies.reduce((acc: any, dep) => {
          if (!['node', 'npm', 'yarn', 'pnpm', 'git', 'docker', 'bash', 'zsh', 'rust', 'go', 'python', 'gcc', 'make', 'wget', 'curl'].includes(dep)) {
            acc[dep] = "latest";
          }
          return acc;
        }, {})
      };
      
      files['package.json'] = { 
        name: 'package.json', 
        language: 'json', 
        content: JSON.stringify(packageJsonContent, null, 2) 
      };
      
      if (!files['index.js']) {
        files['index.js'] = { 
          name: 'index.js', 
          language: 'javascript', 
          content: 'console.log("Welcome to your Node.js project!");\n' 
        };
      }
    }

    if (dependencies.includes('git')) {
       files['.gitignore'] = {
         name: '.gitignore',
         language: 'plaintext',
         content: 'node_modules/\ndist/\n.env'
       };
    }

    const newProj = {
      ownerId: user.uid,
      title: opts?.title || 'Untitled Project',
      files,
      activeFile,
      template: opts?.template || 'static',
      dependencies: opts?.dependencies || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'projects', id), newProj);
      setActiveProjectId(id);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create project");
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <span>Are you sure you want to delete this project?</span>
          <div className="flex gap-2">
            <button className="bg-red-500 text-white px-2 py-1 rounded" onClick={async () => {
              toast.dismiss(t.id);
              try {
                await deleteDoc(doc(db, 'projects', id));
                if (activeProjectId === id) setActiveProjectId(null);
                toast.success('Project deleted');
              } catch (error) {
                toast.error('Failed to delete project');
              }
            }}>Delete</button>
            <button className="bg-gray-500 text-white px-2 py-1 rounded" onClick={() => toast.dismiss(t.id)}>Cancel</button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  };

  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  if (activeProjectId && activeProject) {
    return <IDE 
      user={user} 
      projects={projects} 
      activeProject={activeProject} 
      onBack={() => setActiveProjectId(null)} 
      createProject={createProject}
    />;
  }

  return (
    <Dashboard 
      user={user} 
      projects={projects} 
      createProject={createProject} 
      openProject={(p) => setActiveProjectId(p.id)} 
      deleteProject={deleteProject} 
    />
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1e1e1e] text-white">
        Loading...
      </div>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#252526', color: '#fff', border: '1px solid #3c3c3c' } }} />
      {user ? <MainApp user={user} /> : <AuthView />}
    </>
  );
}
