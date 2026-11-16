/** Background work for documents. Implemented with pg-boss (see jobs/); faked in tests. */
export abstract class DocumentJobs {
  /** Queues text extraction for an uploaded document. */
  abstract enqueueExtract(documentId: string): Promise<void>;
}
