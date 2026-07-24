import { supabase } from '@/db/supabase';

/**
 * Supabase can return no error when RLS filters every row from a delete.
 * Returning the deleted id lets the UI distinguish a real delete from a
 * permission-blocked no-op.
 */
export async function deleteRow(table: string, id: string) {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw error;
  if (!data?.length) {
    throw new Error('لم يتم الحذف. شغّل تحديث قاعدة البيانات الخاص بالصلاحيات أولاً.');
  }
}
