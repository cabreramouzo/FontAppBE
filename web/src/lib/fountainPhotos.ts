import type { CommentResponse } from '../api/types.ts'

export interface FountainPhoto {
  key: string
  image: string
  review: CommentResponse | null
}

export function fountainPhotos(cover: string | null | undefined, reviews: CommentResponse[]): FountainPhoto[] {
  const photos: FountainPhoto[] = cover ? [{ key: 'cover', image: cover, review: null }] : []
  const sorted = [...reviews].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
  for (const review of sorted) {
    if (review.image) photos.push({ key: review.id, image: review.image, review })
  }
  return photos
}

/** A newer review without a photo must not make an older photo look current. */
export function latestReviewPhoto(reviews: CommentResponse[], now = Date.now()): string | null {
  const latest = [...reviews].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))[0]
  if (!latest?.image) return null
  const age = now - Date.parse(latest.createdAt)
  // Confirmations refresh the report, never the photograph's age.
  return age >= 0 && age <= 30 * 86_400_000 ? latest.id : null
}
