import type { Node } from '@xyflow/react';

export type Category = 'data' | 'actor' | 'trigger' | 'logic' | 'action' | 'integration';

export interface ConfigField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'fields' | 'tags';
  required: boolean;
  options?: string[];
}
export interface BlockDef {
  type: string;
  category: Category;
  label: string;
  description: string;
  outputs: string[];
  inputs: boolean;
  config_fields: ConfigField[];
  defaults: Record<string, unknown>;
}
export interface Library {
  categories: Record<string, { label: string; color: string }>;
  blocks: BlockDef[];
  allowed_connections: [string, string][];
  field_types: string[];
  relation_types: string[];
  delete_behaviors: string[];
  operators: string[];
}

export interface DiagramNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}
export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  source_handle: string | null;
}
export interface Diagram {
  schema_version?: string;
  name: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface Issue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  node_id: string | null;
  edge_id: string | null;
}
export interface TraceStep {
  node_id: string;
  kind: string;
  summary: string;
  branch?: string;
}
export interface SimResult {
  ok: boolean;
  trace: TraceStep[];
  context: Record<string, unknown>;
  error: string | null;
}
export interface ProjectSummary {
  id: number;
  name: string;
  template: string;
  updated_at: string;
  latest_version: number | null;
}
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
}
export interface PublishedSchemaSummary {
  id: number;
  title: string;
  slug: string;
  description: string;
  author: string;
  use_count: number;
  created_at: string;
}
export interface PublishedSchema extends PublishedSchemaSummary {
  documentation: string;
  diagram: Diagram;
  updated_at: string;
}
export interface AiResult {
  mode: 'explain' | 'suggest';
  text?: string;
  summary?: string;
  proposed_diagram?: Diagram;
  issues_after?: Issue[];
}

export type BlockData = { blockType: string; label: string; config: Record<string, unknown> };
export type BlockNodeT = Node<BlockData, 'block'>;
