import { useEffect, useState } from 'react';
import { Project } from '../types';
import { RotateCw, ExternalLink, Shield } from 'lucide-react';

export function Preview({ project }: { project: Project }) {
  const [srcDoc, setSrcDoc] = useState('');
  
  useEffect(() => {
    // Generate the srcDoc
    const htmlFile = project.files['index.html']?.content || '';
    
    // Simple naive bundle: inject CSS and JS into HTML
    const cssBlocks: string[] = [];
    const jsBlocks: string[] = [];
    
    Object.values(project.files).forEach(f => {
      if (f.name.endsWith('.css')) cssBlocks.push(f.content);
      if (f.name.endsWith('.js') && f.name !== 'script.js') jsBlocks.push(f.content); // We'll handle script.js slightly differently if included by reference, but let's inline all non-html
    });

    // We'll also inject our console override to pipe logs to the terminal
    const injectedLogScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;
          
          const formatArg = (arg) => {
            if (typeof arg === 'object' && arg !== null) {
              try { return JSON.stringify(arg); } catch(e) { return String(arg); }
            }
            return String(arg);
          };
          
          console.log = function(...args) {
            window.parent.postMessage({ type: 'terminal-log', level: 'log', message: args.map(formatArg).join(' ') }, '*');
            originalLog.apply(console, args);
          };
          console.error = function(...args) {
            window.parent.postMessage({ type: 'terminal-log', level: 'error', message: args.map(formatArg).join(' ') }, '*');
            originalError.apply(console, args);
          };
          console.warn = function(...args) {
            window.parent.postMessage({ type: 'terminal-log', level: 'warn', message: args.map(formatArg).join(' ') }, '*');
            originalWarn.apply(console, args);
          };
          window.onerror = function(message, source, lineno, colno, error) {
            window.parent.postMessage({ type: 'terminal-log', level: 'error', message: message }, '*');
          };
        })();
      </script>
    `;

    const injectedStyle = `<style>${cssBlocks.join('\n')}</style>`;
    const injectedScript = `<script>${jsBlocks.join('\n')}\n${project.files['script.js']?.content || ''}</script>`;

    // Insert before </head> or at end
    let bundledHtml = htmlFile;
    if (bundledHtml.includes('</head>')) {
      bundledHtml = bundledHtml.replace('</head>', `${injectedStyle}</head>`);
    } else {
      bundledHtml += injectedStyle;
    }
    
    if (bundledHtml.includes('</body>')) {
      // Remove '<script src="script.js"></script>' if existing, to avoid 404
      bundledHtml = bundledHtml.replace(/<script\s*src=["']script\.js["']\s*><\/script>/g, '');
      bundledHtml = bundledHtml.replace('</body>', `${injectedLogScript}${injectedScript}</body>`);
    } else {
      bundledHtml += injectedLogScript + injectedScript;
    }

    const timeout = setTimeout(() => {
      setSrcDoc(bundledHtml);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeout);
  }, [project.files, project.id]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] w-full">
      <div className="h-9 flex items-center bg-[#252526] px-2 border-b border-[#2b2b2b] shrink-0 gap-2 font-sans select-none justify-between">
        <button onClick={() => setSrcDoc(srcDoc + ' ')} className="p-1 hover:bg-[#3c3c3c] rounded text-[#cccccc] cursor-pointer" title="Reload Preview">
          <RotateCw size={14} />
        </button>
        <div className="flex bg-[#3c3c3c] text-[#cccccc] text-[12px] h-[22px] px-3 flex-1 max-w-[300px] items-center gap-2 rounded justify-center border border-[#454545] mx-2">
           <Shield size={12} className="text-[#a1a1aa]" />
           <span className="truncate select-text">localhost:3000/{project.id.slice(0, 8)}</span>
        </div>
        <button onClick={() => {
          const blob = new Blob([srcDoc], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        }} className="p-1 hover:bg-[#3c3c3c] rounded text-[#cccccc] cursor-pointer" title="Open In New Tab">
          <ExternalLink size={14} />
        </button>
      </div>
      <div className="flex-1 relative bg-white">
        <iframe
          srcDoc={srcDoc}
          title="preview"
          sandbox="allow-scripts allow-modals"
          frameBorder="0"
          className="w-full h-full absolute inset-0 bg-white"
        />
      </div>
    </div>
  );
}
