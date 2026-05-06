import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import 'xterm/css/xterm.css';
import clsx from 'clsx';
import { Project } from '../types';

export function Terminal({ project }: { project?: Project | null }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [activeTab, setActiveTab] = useState<'terminal' | 'output' | 'debug' | 'problems'>('terminal');

  useEffect(() => {
    if (activeTab === 'terminal' && terminalRef.current && !xtermRef.current) {
      if (project?.id) {
        // Sync project files to backend
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, files: project.files }),
        }).catch(err => console.error("Failed to sync project", err));
      }

      const term = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#012456', // PowerShell Blue
          foreground: '#f3f4f6',
          cursor: '#ffffff',
          selectionBackground: '#ffffff33',
          black: '#0c0c0c',
          red: '#c50f1f',
          green: '#13a10e',
          yellow: '#c19c00',
          blue: '#0037da',
          magenta: '#881798',
          cyan: '#3a96dd',
          white: '#cccccc',
          brightBlack: '#767676',
          brightRed: '#e74856',
          brightGreen: '#16c60c',
          brightYellow: '#f9f1a5',
          brightBlue: '#3b78ff',
          brightMagenta: '#b4009e',
          brightCyan: '#61d6d6',
          brightWhite: '#f2f2f2',
        },
        allowTransparency: true,
        cursorStyle: 'underline',
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      
      term.open(terminalRef.current);
      fitAddon.fit();

      // Try to load WebGL addon for hardware acceleration
      try {
        const webglAddon = new WebglAddon();
        term.loadAddon(webglAddon);
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
      } catch (e) {
        console.warn('WebGL addon failed to load, falling back to Canvas/DOM', e);
        try {
          const canvasAddon = new CanvasAddon();
          term.loadAddon(canvasAddon);
        } catch (e2) {
          console.warn('Canvas addon failed to load, falling back to DOM', e2);
        }
      }

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect to real backend
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = project?.id ? `${protocol}//${window.location.host}/terminal?projectId=${project.id}` : `${protocol}//${window.location.host}/terminal`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      socketRef.current = ws;

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        } else {
          term.write(event.data);
        }
      };

      ws.onopen = () => {
        console.log('Connected to terminal backend');
      };

      ws.onclose = () => {
        term.write('\r\n\x1b[31mTerminal connection closed\x1b[0m\r\n');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const handleResize = () => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      };

      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });

      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
        ws.close();
        term.dispose();
        xtermRef.current = null;
      };
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'terminal' && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 100);
    }
  }, [activeTab]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-t border-[#2b2b2b]">
      <div className="px-4 py-1 flex items-center gap-6 text-[11px] font-bold uppercase text-[#969696] border-b border-[#2b2b2b] select-none h-8 shrink-0">
        <span 
          onClick={() => setActiveTab('terminal')}
          className={clsx("h-full flex items-center cursor-pointer", activeTab === 'terminal' ? "text-[#cccccc] border-b border-[#007acc]" : "hover:text-[#cccccc]")}
        >
          Terminal
        </span>
        <span 
          onClick={() => setActiveTab('output')}
          className={clsx("h-full flex items-center cursor-pointer", activeTab === 'output' ? "text-[#cccccc] border-b border-[#007acc]" : "hover:text-[#cccccc]")}
        >
          Output
        </span>
        <span 
          onClick={() => setActiveTab('debug')}
          className={clsx("h-full flex items-center cursor-pointer", activeTab === 'debug' ? "text-[#cccccc] border-b border-[#007acc]" : "hover:text-[#cccccc]")}
        >
          Debug Console
        </span>
        <span 
          onClick={() => setActiveTab('problems')}
          className={clsx("h-full flex items-center cursor-pointer", activeTab === 'problems' ? "text-[#cccccc] border-b border-[#007acc]" : "hover:text-[#cccccc]")}
        >
          Problems
        </span>
      </div>
      
      <div className={clsx("flex-1 p-2 overflow-hidden text-left", activeTab !== 'terminal' && "hidden")}>
        <div ref={terminalRef} className="w-full h-full text-left" />
      </div>

      {activeTab === 'output' && (
         <div className="flex-1 overflow-y-auto p-3 font-mono text-[13px] text-[#cccccc]">
           [webJO] Output channel starting...
         </div>
      )}
      {activeTab === 'debug' && (
         <div className="flex-1 overflow-y-auto p-3 font-mono text-[13px] text-[#cccccc]">
           Please start a debug session to evaluate expressions.
         </div>
      )}
      {activeTab === 'problems' && (
         <div className="flex-1 overflow-y-auto p-3 font-mono text-[13px] text-[#cccccc]">
           No problems have been detected in the workspace.
         </div>
      )}
    </div>
  );
}
