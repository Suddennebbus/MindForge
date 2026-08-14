export interface User {
  id: string
  username: string
  email: string
  role: string
}

export interface PermissionItem {
  action: string
  resource: string
}

export interface RolePermissions {
  role_name: string
  permissions: PermissionItem[]
}

export interface DashboardRecentItem {
  id: string
  type: string
  title: string
  subtitle?: string
  href?: string
  created_at: string
  action?: string
  action_type?: string
  resource_type?: string
  operator?: string
}

export interface DashboardStat {
  label: string
  value: number
  change?: string
  trend?: string
}

export interface Dashboard {
  pending_review: number
  pending_sync: number
  active_plans: number
  health_score: number
  stats: DashboardStat[]
  recent_activity: DashboardRecentItem[]
  recent_wiki: DashboardRecentItem[]
  recent_raw: DashboardRecentItem[]
  recent_plans: DashboardRecentItem[]
}

export interface AuditLog {
  id: string
  user_id: string
  username?: string
  action_type: string
  resource_type: string
  resource_id?: string
  title?: string
  href?: string
  created_at: string
}

export interface WikiPage {
  id: string
  slug: string
  title: string
  type: 'entity' | 'concept' | 'synthesis'
  status: string
  tags: string[]
  summary: string
  content: string
  source_paths: string[]
  raw_files: { id: string; original_name: string }[]
  created_at: string
  updated_at: string
}

export interface WikiUpdateResult {
  missing_slugs: string[]
  reingested_count: number
  errors: number
  details: { file_id?: string; filename?: string; status: string; reason?: string; slug?: string; title?: string; message?: string }[]
  snapshot_updated: boolean
}

export interface RawFile {
  id: string
  filename: string
  original_name: string
  status: string
  file_size: number
  mime_type?: string
  category?: string | null
  entity_page_id?: string | null
  entity_page_slug?: string | null
  wiki_pages: { id: string; slug: string; title: string; type: string }[]
  created_at: string
}

export interface SuggestedReading {
  title?: string
  url?: string
  authors?: string
  source?: string
  reason?: string
  status?: string
  raw_file_id?: string
  error?: string
}

export interface Plan {
  id: string
  slug: string
  title: string
  description: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived' | 'pending_generation'
  topic: string
  direction: string
  goals: string[]
  related_slugs: string[]
  knowledge_gaps: string[]
  suggested_readings: SuggestedReading[]
  methodology: string
  milestones: string[]
  key_challenges: string[]
  expected_contributions: string[]
  research_questions: string[]
  generation_payload_json?: string
  file_path?: string
  created_at: string
  updated_at: string
}

export interface Annotation {
  id: string
  raw_file_id: string
  user_id: string
  username: string
  start_offset: number
  end_offset: number
  selected_text: string
  content: string
  created_at: string
}

export interface Exploration {
  id: string
  user_id: string
  direction?: string
  result_json: string
  created_at: string
}

export interface LintReport {
  id: string
  user_id: string
  result_json: string
  report_path: string
  created_at: string
}

export interface PlanComment {
  id: string
  plan_id: string
  user_id: string
  username: string
  content: string
  parent_id?: string | null
  created_at: string
}

export interface PlanAnnotation {
  id: string
  plan_id: string
  user_id: string
  username: string
  start_offset: number
  end_offset: number
  selected_text: string
  content: string
  created_at: string
}

export interface AgentRunStep {
  id: string
  sequence: number
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused'
  input_json?: string
  output_json?: string
  error_message?: string
  started_at?: string
  completed_at?: string
}

export interface AgentRun {
  id: string
  workflow: string
  status: string
  user_id: string
  config_id?: string
  direction?: string
  payload_json: string
  plan_id?: string
  current_step_id?: string
  error_message?: string
  created_at: string
  updated_at: string
  steps: AgentRunStep[]
}

export interface HumanOutput {
  id: string
  filename: string
  original_name: string
  storage_type: string
  storage_path: string
  file_size?: number
  mime_type?: string
  status: string
  category?: string | null
  uploaded_by: string
  created_at: string
  updated_at: string
}
