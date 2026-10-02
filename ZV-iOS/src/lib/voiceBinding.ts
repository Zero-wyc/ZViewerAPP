export class VoiceBinding {
  private generation = 0;
  begin(mainId: string | undefined, mediaId: string | undefined) { return { generation: ++this.generation, mainId, mediaId }; }
  invalidate() { this.generation++; }
  accepts(ticket: { generation: number; mainId?: string; mediaId?: string }, mainId?: string, mediaId?: string) { return ticket.generation === this.generation && !!mainId && !!mediaId && mainId === ticket.mainId && mediaId === ticket.mediaId; }
}
