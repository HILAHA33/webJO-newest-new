import React, { useState, useRef, useEffect } from 'react';
import { Project, ProjectFile } from '../types';
import { GoogleGenAI, Type, FunctionDeclaration, Content } from '@google/genai';
import { toast } from 'react-hot-toast';

interface AIAssistantProps {
  project: Project;
  updateProject: (updates: Partial<Project>) => void;
  deleteFile: (name: string) => void;
  renameFile: (oldName: string, newName: string) => void;
  addFile: (name: string, content: string) => void;
}

export function AIAssistant({ project, updateProject, deleteFile, renameFile, addFile }: AIAssistantProps) {
  const [messages, setMessages] = useState<(Content & { isTool?: boolean })[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const tools: FunctionDeclaration[] = [
    {
      name: "editFile",
      description: "Replaces the entire content of a file, or creates it if it doesn't exist.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING },
          newContent: { type: Type.STRING }
        },
        required: ["path", "newContent"]
      }
    },
    {
      name: "deleteFile",
      description: "Deletes a file. Pass the exact path.",
      parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ["path"] }
    },
    {
      name: "renameFile",
      description: "Renames a file.",
      parameters: {
        type: Type.OBJECT,
        properties: { oldPath: { type: Type.STRING }, newPath: { type: Type.STRING } },
        required: ["oldPath", "newPath"]
      }
    },
    {
      name: "readFile",
      description: "Reads the content of a file.",
      parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING } }, required: ["path"] }
    },
    {
      name: "listFiles",
      description: "Lists all files in the project.",
      parameters: { type: Type.OBJECT, properties: {} }
    },
    {
      name: "executeCommand",
      description: "Executes a shell command in the workspace and returns its output (stdout/stderr). Useful for installing packages, checking git status, running tests.",
      parameters: {
        type: Type.OBJECT,
        properties: { command: { type: Type.STRING } },
        required: ["command"]
      }
    }
  ];

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    // Check if API key is provided
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      toast.error('VITE_GEMINI_API_KEY is not set in environment variables', { id: 'ai-error' });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const userMessage: Content = { role: 'user', parts: [{ text: input }] };
    let currentHistory = [...messages, userMessage];
    setMessages(currentHistory);
    setInput('');
    setIsLoading(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview",
        config: {
          systemInstruction: `You are an expert AI coding assistant integrated into a web-based IDE.
You can read, edit, create, delete, and rename files. You can also run terminal commands.
Always use tools to accomplish the user's request. 
The workspace files are synced to a backend where you execute commands.
Note: You share a workspace with the user. Do not execute long-lived blocking commands (like 'npm start' or 'dev servers') using executeCommand tool because it will buffer indefinitely and time out. Let the user run dev servers in their terminal tab. Use executeCommand for short-lived tasks like 'npm install', 'git commands', etc.
Current project ID: ${project.id}
You should act thoughtfully and communicate what actions you are taking.`,
          tools: [{ functionDeclarations: tools }],
        }
      });

      // Send the entire history
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: currentHistory,
        config: chat.config
      });

      let currentResponseContent = response.candidates?.[0]?.content;
      
      // Loop while the model requests function calls
      while (currentResponseContent && currentResponseContent.parts?.some(p => p.functionCall)) {
        currentHistory.push(currentResponseContent);
        setMessages([...currentHistory]);
        
        const functionResponses = [];

        for (const part of currentResponseContent.parts) {
          if (part.functionCall) {
             const name = part.functionCall.name;
             const args = part.functionCall.args as any;
             let result: any;

             console.log(`Executing tool ${name}`, args);

             try {
                if (name === "listFiles") {
                  result = { files: Object.keys(project.files) };
                } else if (name === "readFile") {
                  const content = project.files[args.path]?.content;
                  if (content !== undefined) result = { content };
                  else result = { error: "File not found" };
                } else if (name === "editFile") {
                  addFile(args.path, args.newContent);
                  result = { success: true };
                } else if (name === "deleteFile") {
                  if (project.files[args.path]) {
                     deleteFile(args.path);
                     result = { success: true };
                  } else {
                     result = { error: "File not found" };
                  }
                } else if (name === "renameFile") {
                  if (project.files[args.oldPath]) {
                     renameFile(args.oldPath, args.newPath);
                     result = { success: true };
                  } else {
                     result = { error: "File not found" };
                  }
                } else if (name === "executeCommand") {
                  // Sync files to backend first so command runs on updated files
                  await fetch("/api/sync", {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ projectId: project.id, files: project.files }),
                  });
                  const res = await fetch("/api/exec", {
                     method: "POST",
                     headers: { "Content-Type": "application/json" },
                     body: JSON.stringify({ projectId: project.id, command: args.command })
                  });
                  const json = await res.json();
                  result = { stdout: json.stdout || "", stderr: json.stderr || "", error: json.error || "" };
                } else {
                  result = { error: "Unknown function" };
                }
             } catch (err: any) {
               result = { error: err.message };
             }

             functionResponses.push({
                functionResponse: {
                  name,
                  response: result
                }
             });
          }
        }

        const toolResponseMessage: Content = { role: 'user', parts: functionResponses };
        currentHistory.push(toolResponseMessage);
        setMessages([...currentHistory]);

        const followup = await ai.models.generateContent({
           model: "gemini-3.1-pro-preview",
           contents: currentHistory,
           config: chat.config
        });
        currentResponseContent = followup.candidates?.[0]?.content;
      }

      if (currentResponseContent) {
         currentHistory.push(currentResponseContent);
         setMessages([...currentHistory]);
      }
    } catch (error: any) {
      toast.error('AI request failed: ' + error.message, { id: 'ai-error' });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#252526] border-r border-[#2b2b2b]">
      <div className="p-3 text-[11px] font-bold uppercase text-[#cccccc] border-b border-[#2b2b2b] shrink-0">
        AI Assistant
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.filter(m => m.parts?.some(p => p.text)).map((msg, i) => (
          <div key={i} className={`text-[13px] ${msg.role === 'user' ? 'text-[#007acc] text-right' : 'text-[#cccccc]'}`}>
            {msg.parts?.map((p, j) => p.text ? <div key={j} className="whitespace-pre-wrap">{p.text}</div> : null)}
          </div>
        ))}
        {isLoading && (
          <div className="text-[13px] text-[#969696] animate-pulse">Thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-[#2b2b2b] bg-[#1e1e1e]">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask AI to modify code or run commands..."
          className="w-full bg-[#3c3c3c] border border-[#3c3c3c] rounded p-2 text-[#cccccc] outline-none focus:border-[#007acc] resize-none text-[13px]"
          rows={3}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex justify-end mt-2">
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-[#007acc] hover:bg-[#005f9e] text-white px-3 py-1 rounded text-[12px] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
