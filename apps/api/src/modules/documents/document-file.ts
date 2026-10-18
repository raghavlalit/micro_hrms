import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export interface DocumentUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Inspect bytes as well as extension/MIME. This is format validation, not malware scanning. */
export function validateDocumentFile(file?: DocumentUploadFile) {
  if (!file?.buffer.length || file.buffer.length > DOCUMENT_MAX_BYTES)
    throw new BadRequestException(
      'Choose one nonempty PDF, PNG or JPEG file up to 10 MiB',
    );
  const bytes = file.buffer;
  const filename = file.originalname
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .normalize('NFC')
    // Strip control characters from untrusted multipart filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 180);
  let mime = '',
    extension = '';
  if (
    bytes.subarray(0, 5).toString() === '%PDF-' &&
    bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
  ) {
    mime = 'application/pdf';
    extension = 'pdf';
  } else if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(-8, -4).toString() === 'IEND'
  ) {
    mime = 'image/png';
    extension = 'png';
  } else if (
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  ) {
    mime = 'image/jpeg';
    extension = 'jpg';
  }
  const allowedExtension =
    extension === 'jpg'
      ? /\.(jpg|jpeg)$/i
      : new RegExp('\\.' + extension + '$', 'i');
  if (
    !mime ||
    !allowedExtension.test(filename) ||
    ![mime, 'application/octet-stream'].includes(file.mimetype)
  )
    throw new BadRequestException(
      'File contents, extension and type must agree: PDF, PNG or JPEG only',
    );
  return {
    bytes,
    filename,
    mime,
    extension,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
}
