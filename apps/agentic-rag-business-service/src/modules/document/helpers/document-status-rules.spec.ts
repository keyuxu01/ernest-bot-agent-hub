import { describe, expect, it } from 'vitest';
import { DocumentStatus } from '../entities/document.entity';
import {
  canArchiveFrom,
  canPublishFrom,
  canSaveAsDraftFrom,
  canSubmitReviewFrom,
} from './document-status-rules';

const { Draft, Published, Archived, PendingReview } = DocumentStatus;

describe('document-status-rules', () => {
  it.each([
    [Draft, true],
    [Published, true],
    [Archived, true],
    [PendingReview, false],
  ])('canPublishFrom / canSubmitReviewFrom(%s) = %s', (status, expected) => {
    expect(canPublishFrom(status)).toBe(expected);
    expect(canSubmitReviewFrom(status)).toBe(expected);
  });

  it.each([
    [Draft, false],
    [Published, true],
    [Archived, false],
    [PendingReview, false],
  ])('canArchiveFrom / canSaveAsDraftFrom(%s) = %s', (status, expected) => {
    expect(canArchiveFrom(status)).toBe(expected);
    expect(canSaveAsDraftFrom(status)).toBe(expected);
  });
});
