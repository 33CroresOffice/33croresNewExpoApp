import { supabase } from '@/lib/supabase';

/**
 * Resolves a rider record for a logged-in user.
 * First tries matching by profile_id (auth uid), then falls back to mobile number.
 * Also backfills profile_id in the DB when found via mobile fallback.
 */
export async function resolveRider(
  profileId: string,
  profileMobile: string | null | undefined,
  selectFields = 'id'
): Promise<any | null> {
  // Primary: match by profile_id
  const { data: byId } = await supabase
    .from('riders')
    .select(selectFields)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (byId) return byId;

  // Fallback: match by mobile
  if (!profileMobile) return null;

  const { data: byMobile } = await supabase
    .from('riders')
    .select(selectFields)
    .eq('mobile', profileMobile)
    .maybeSingle();

  if (byMobile) {
    // Backfill profile_id so future lookups use the fast path
    await supabase
      .from('riders')
      .update({ profile_id: profileId })
      .eq('id', byMobile.id);
  }

  return byMobile ?? null;
}
