export interface Attachment {
  file_path: string;
  file_name: string;
  type: string;
}

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  command: string;
  response: string;
  attachments?: Attachment[];
}
