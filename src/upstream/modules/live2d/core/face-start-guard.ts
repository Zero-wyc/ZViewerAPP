export function canCommitFaceTrackerStart(
  startGeneration: number,
  currentGeneration: number,
  allowFace: boolean,
  disposed: boolean
): boolean {
  return startGeneration === currentGeneration && allowFace && !disposed
}
