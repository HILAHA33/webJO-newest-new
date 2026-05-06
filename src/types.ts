export interface Project {
  id: string;
  ownerId: string;
  title: string;
  files: Record<string, ProjectFile>;
  activeFile: string;
  template?: string;
  dependencies?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  name: string;
  language: string;
  content: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
