type WorkspaceIdentity = { id: string; slug: string; name: string };
export function isPrimaryWorkspace(workspace: WorkspaceIdentity) {
  return ['michias-tegegne', 'hive-dev-michias'].includes(workspace.slug);
}
export function orderWorkspaces<T extends WorkspaceIdentity>(workspaces: T[]): T[] {
  return [...workspaces].sort((a, b) => Number(isPrimaryWorkspace(b)) - Number(isPrimaryWorkspace(a)));
}
export function preferredWorkspace(workspaces: WorkspaceIdentity[], current = '', stored = '') {
  return [current, stored].find(id => workspaces.some(workspace => workspace.id === id))
    || orderWorkspaces(workspaces)[0]?.id || '';
}
export function workspaceLabel(workspace: WorkspaceIdentity) {
  return isPrimaryWorkspace(workspace) ? 'michias tegegne' : workspace.name.replace(/^Hive Dev · /, '');
}
