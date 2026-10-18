export interface DocumentPerson {
  id: string;
  name: string;
  employee_code: string;
}
export interface DocumentCategory {
  id: string;
  name: string;
  archived_at: string | null;
}
export interface DocumentRow {
  id: string;
  title: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  category_name: string;
  expiry_date: string | null;
  visibility: string;
  archived_at: string | null;
}
export interface DocumentVersion {
  id: string;
  version: number;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  checksum: string;
  created_at: string;
  archived_at: string | null;
}
export interface DocumentDetail extends DocumentRow {
  category_id: string;
  issue_date: string | null;
  revision: string;
  versions: DocumentVersion[];
}
