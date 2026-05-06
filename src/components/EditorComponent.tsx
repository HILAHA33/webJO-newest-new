import Editor from '@monaco-editor/react';
import { ProjectFile } from '../types';

export function EditorComponent({ file, onChange }: { file: ProjectFile, onChange: (val: string | undefined) => void }) {
  return (
    <div className="w-full h-full bg-[#1e1e1e]">
      <Editor
        height="100%"
        theme="vs-dark"
        path={file.name}
        language={file.language}
        value={file.content}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
        }}
      />
    </div>
  );
}
