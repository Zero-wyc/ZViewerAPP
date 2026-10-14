export function watchDiagnostic(event: string, values: Record<string, number | boolean | string | null | undefined>) {
  if (__DEV__) console.info('[ZViewerWatch]', JSON.stringify({ event, ...values }));
}
