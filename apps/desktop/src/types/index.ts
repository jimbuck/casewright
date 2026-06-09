/* ============================================================
   Casewright — domain model
   ============================================================ */

export type Status = 'active' | 'draft' | 'deprecated';
export type Result = 'pass' | 'fail' | 'blocked' | 'skipped' | 'not_run';

/** A single (optionally nested) step in a case. */
export interface Step {
  text: string;
  depth: number;
}

/** A manual test case — one markdown file on disk. */
export interface Case {
  id: string; // stable hash, the internal key
  displayId: string; // human-facing ID, e.g. PAY-0042
  title: string;
  status: Status;
  tags: string[];
  suite: string; // owning suite id
  objective: string;
  systems: string[];
  steps: Step[];
  expected: string[];
  modified: boolean;
}

/* ---- suite tree (folders) ---- */
export interface SuiteNode {
  type: 'suite';
  id: string;
  name: string;
  path: string;
  children: TreeNode[];
  /** True for a workspace root folder (top-level in the tree; not draggable/renamable). */
  isWorkspace?: boolean;
}
export interface CaseNode {
  type: 'case';
  id: string;
}
export type TreeNode = SuiteNode | CaseNode;

/* ---- workspace + launcher ---- */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string;
  prefix: string;
  runsDir: string;
}

export interface Recent {
  path: string;
  name: string;
  branch: string;
  remote: string;
  /** ISO timestamp of when this repo was last opened. */
  lastOpened: string;
  workspaces: number;
  lastWorkspaceId: string | null;
}

/* ---- runs (CSV-backed) ---- */
export interface RunRow {
  case_id: string;
  display_id: string;
  title: string;
  result: Result;
  tester: string;
  executed_at: string;
  notes: string;
}

export interface Run {
  id: string;
  name: string;
  file: string;
  created: string;
  status: 'open' | 'closed';
  scope: string;
  rows: RunRow[];
}

export type RunScope = 'tag' | 'suite' | 'all';
export interface CreateRunArgs {
  name: string;
  scope: RunScope;
  tag: string;
  suite: string;
}

/* ---- git working state ---- */
export type ChangeStatus = 'A' | 'M' | 'D';
export interface Change {
  kind: 'case' | 'run';
  refId: string;
  path: string;
  status: ChangeStatus;
  label: string;
}

/* ---- ui selection + ephemera ---- */
export interface Selection {
  kind: 'case' | 'run' | 'suite';
  id?: string;
  runId?: string | null;
  suiteId?: string | null;
  guideIndex?: number;
}

export type View = 'editor' | 'runs' | 'run' | 'guide' | 'suite';
export type Screen = 'launcher' | 'main';
export type ModalKind = 'commit' | 'createRun' | 'merge' | null;

export interface Toast {
  id: number;
  msg: string;
}

export interface Renaming {
  id: string;
  value: string;
}

/* ============================================================
   Structured 3-way merge model
   ============================================================ */
export type MergeAuto = 'same' | 'ours' | 'theirs' | 'merge';

interface MergeElementBase {
  key: string;
  label: string;
  conflict?: boolean;
  auto?: MergeAuto;
  reason?: string;
}
export interface FieldElement extends MergeElementBase {
  kind: 'field';
  base: string;
  ours: string;
  theirs: string;
}
export interface ProseElement extends MergeElementBase {
  kind: 'prose';
  base: string;
  ours: string;
  theirs: string;
}
export interface TagsElement extends MergeElementBase {
  kind: 'tags';
  base: string[];
  ours: string[];
  theirs: string[];
  merged?: string[];
}
export interface ListElement extends MergeElementBase {
  kind: 'list';
  base: string[];
  ours: string[];
  theirs: string[];
}
export interface StepsElement extends MergeElementBase {
  kind: 'steps';
  base: Step[];
  ours: Step[];
  theirs: Step[];
}
export type MergeElement =
  | FieldElement
  | ProseElement
  | TagsElement
  | ListElement
  | StepsElement;

export interface CaseMergeFile {
  kind: 'case';
  path: string;
  displayId: string;
  caseId: string;
  title: string;
  elements: MergeElement[];
}

export interface RunRowValue {
  result: Result;
  tester: string;
  notes: string;
}
export interface CsvMergeRow {
  case_id: string;
  display_id: string;
  auto?: MergeAuto;
  reason?: string;
  value?: RunRowValue;
  conflict?: boolean;
  base?: RunRowValue;
  ours?: RunRowValue;
  theirs?: RunRowValue;
}
export interface RunMergeFile {
  kind: 'run';
  path: string;
  title: string;
  rows: CsvMergeRow[];
}
export type MergeFile = CaseMergeFile | RunMergeFile;

export interface Conflict {
  branch: string;
  behind: number;
  ahead: number;
  files: MergeFile[];
}

export type ResolutionChoice = 'ours' | 'theirs' | 'edit';
export interface Resolution {
  choice: ResolutionChoice;
  text?: string;
}
export type Resolutions = Record<string, Resolution>;

/* ---- diff tokens ---- */
export type DiffKind = 'same' | 'add' | 'del';
export interface DiffToken {
  v: string;
  t: DiffKind;
}
