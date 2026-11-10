export function workspaceDraftKey(kind, organizationId, taskId) {
  return [kind, organizationId, taskId].filter(Boolean).join(':');
}

export function openWorkspaceDraft(navigation, fields, address) {
  if (fields?._kind === 'complete') {
    navigation.navigate('WorkspaceTask', {
      identityAddress: address,
      organizationId: fields._organizationId,
      taskId: fields._taskId,
      task: fields._task,
    });
  } else if (fields?._kind) {
    navigation.navigate('WorkspaceCompose', {
      kind: fields._kind,
      organizationId: fields._organizationId,
    });
  }
}

export function savedChangeLabel(command) {
  return command.operation.label || command.operation.data?.title || command.operation.data?.name || 'Saved workspace change';
}
